import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  BackendMethodSchema,
  BackendRequestSchema,
  BackendResponseSchema,
  CatalogListResultSchema,
  MandateGetResultSchema,
  OperationGetResultSchema,
  OperationSchema,
  ProposalSubmitResultSchema,
  type BackendErrorCode,
  type BackendMethod,
  type BackendRequest,
  type BackendResponse,
  type Operation,
} from '../../../packages/contracts/src/backend.ts';
import type { Check, EligibilityResult } from '../../../packages/contracts/src/index.ts';
import {
  BudgetSnapshotSchema,
  CartSubmissionSchema,
  CatalogSchema,
  PolicySchema,
  QuoteSchema,
  type BudgetSnapshot,
  type Catalog,
  type CartSubmission,
  type Mandate,
  type Policy,
  type Quote,
} from '../../../packages/contracts/src/index.ts';
import type { SupplierAdapter } from '../../../services/suppliers/src/adapter.ts';
import {
  AuthorityFailure,
  loadMandateAuthority,
  reconstructMandate,
} from './authority.ts';
import {
  LedgerIdentityConflict,
  bindIdempotencyAlias,
  canonicalCartJson,
  canonicalize,
  findOperationIdentities,
  insertReservationOperation,
  isSqliteBusy,
  loadEffectRows,
  loadMandateTotals,
  loadOperationStorageRow,
  loadReservationRow,
  openLedgerStore,
  runTransaction,
  sha256Hex,

  type ConfirmationRow,
  type EffectStorageRow,
  type OperationStorageRow,
  type RevisionRow,
} from './ledger/store.ts';
import { evaluatePurchase } from './rules/evaluate.ts';

interface ValidatedMandateRead {
  activeVersion: number | null;
  revision: RevisionRow;
  confirmation: ConfirmationRow;
}

export interface ConfiguredSupplier {
  supplierId: string;
  catalog: Catalog;
  adapter: SupplierAdapter;
}

export interface ApplicationBackendConfig {
  databasePath: string;
  suppliers: ReadonlyArray<ConfiguredSupplier>;
  /** Backend-owned trusted clock. Never derived from any request field. */
  clock?: () => string;
}

export interface ApplicationBackend {
  handle(request: unknown): Promise<BackendResponse>;
  close(): void;
}

const SIMULATION_LABEL = true as const;
const GENERIC_FAILURE_MESSAGE = 'The backend could not complete this request';
// Evaluator failure priority from the backend design: BUDGET, QUANTITY, QUOTE_TIMING.
const FAILURE_PRIORITY: readonly BackendErrorCode[] = ['BUDGET_EXCEEDED', 'QUANTITY_EXCEEDED', 'QUOTE_EXPIRED'];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorResponse(
  requestId: string | null,
  method: BackendMethod | null,
  code: BackendErrorCode,
  message: string,
  checkCodes: string[] = [],
): BackendResponse {
  return BackendResponseSchema.parse({
    apiVersion: '1',
    requestId,
    method,
    simulation: SIMULATION_LABEL,
    ok: false,
    error: {
      code,
      message: message.slice(0, 500),
      details: { checkCodes: checkCodes.slice(0, 1000).map((entry) => entry.slice(0, 250)) },
    },
  });
}

function successResponse(request: BackendRequest, result: unknown): BackendResponse {
  return BackendResponseSchema.parse({
    apiVersion: '1',
    requestId: request.requestId,
    method: request.method,
    simulation: SIMULATION_LABEL,
    ok: true,
    result,
  });
}

function correlationFields(input: unknown): { requestId: string | null; method: BackendMethod | null } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { requestId: null, method: null };
  }
  const parsedFields = z.record(z.string(), z.unknown()).safeParse(input);
  if (!parsedFields.success) return { requestId: null, method: null };
  const fields = parsedFields.data;
  const parsedId = z.string().trim().min(1).max(200).safeParse(fields.requestId);
  const parsedMethod = BackendMethodSchema.safeParse(fields.method);
  return {
    requestId: parsedId.success ? parsedId.data : null,
    method: parsedMethod.success ? parsedMethod.data : null,
  };
}

/** Strict envelope routing before any trusted state is touched. */
function requestError(input: unknown): BackendResponse | null {
  if (BackendRequestSchema.safeParse(input).success) return null;
  const { requestId, method } = correlationFields(input);
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    const fields = z.record(z.string(), z.unknown()).safeParse(input);
    const apiVersion = fields.success ? fields.data.apiVersion : undefined;
    if (typeof apiVersion === 'string' && apiVersion !== '1') {
      return errorResponse(requestId, method, 'UNSUPPORTED_VERSION', 'The request API version is not supported');
    }
  }
  return errorResponse(requestId, method, 'INVALID_REQUEST', 'The request did not match the v1 shopper contract');
}

function authorityFailureResponse(error: AuthorityFailure, requestId: string | null, method: BackendMethod | null): BackendResponse {
  const code: BackendErrorCode = error.code;
  return errorResponse(requestId, method, code, error.message, error.checkCodes);
}

type IdentityResolution =
  | { kind: 'replay'; operationRow: OperationStorageRow }
  | { kind: 'new' }
  | { kind: 'conflict' };

/**
 * Cart identity (mandateId, cart.id) and alias (mandateId, idempotencyKey) each
 * resolve to one immutable operation. Resolution happens before any supplier
 * call and again inside the write transaction; a matching payload binds any
 * unused supplied key as an alias.
 */
function resolveIdentities(
  database: DatabaseSync,
  mandateId: string,
  cartId: string,
  idempotencyKey: string,
  requestDigest: string,
  options: { aliasBinding: boolean },
): IdentityResolution {
  const identities = findOperationIdentities(database, mandateId, cartId, idempotencyKey);
  if (identities.cartOperationId !== null && identities.aliasOperationId !== null
    && identities.cartOperationId !== identities.aliasOperationId) {
    return { kind: 'conflict' };
  }
  const existingId = identities.cartOperationId ?? identities.aliasOperationId;
  if (existingId !== null) {
    const row = loadOperationStorageRow(database, existingId);
    if (row === null || row.requestDigest !== requestDigest) {
      return { kind: 'conflict' };
    }
    if (options.aliasBinding) {
      bindIdempotencyAlias(database, mandateId, idempotencyKey, row.operationId);
    }
    return { kind: 'replay', operationRow: row };
  }
  return { kind: 'new' };
}

function buildSnapshot(database: DatabaseSync, mandate: Mandate): BudgetSnapshot {
  const totals = loadMandateTotals(database, mandate.id);
  const snapshot: BudgetSnapshot = {
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    currency: 'SGD',
    committedMinor: totals.committedMinor,
    reservedMinor: totals.reservedMinor,
    quantities: mandate.requirements.map((requirement) => ({
      requirementId: requirement.id,
      committed: totals.perRequirement.get(requirement.id)?.committed ?? 0,
      reserved: totals.perRequirement.get(requirement.id)?.reserved ?? 0,
    })),
  };
  return BudgetSnapshotSchema.parse(snapshot);
}

function parseStoredPolicy(rawJson: string): Policy {
  let raw: unknown;
  try {
    raw = JSON.parse(rawJson);
  } catch {
    throw new AuthorityFailure('INTERNAL_ERROR', 'Stored policy snapshot is unreadable');
  }
  const parsed = PolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AuthorityFailure('INTERNAL_ERROR', 'Stored policy snapshot is invalid');
  }
  return parsed.data;
}

interface LoadedAuthority {
  mandate: Mandate;
  policy: Policy;
}

/** Active confirmed revision only; the cart must reference it by identity. */
function loadActiveAuthority(
  database: DatabaseSync,
  cart: CartSubmission,
): LoadedAuthority {
  const authority = loadMandateAuthority(database, cart.mandateId);
  if (authority === null) {
    throw new AuthorityFailure('NOT_FOUND', 'Mandate was not found');
  }
  if (authority.revision === null || authority.confirmation === null || authority.policyRow === null) {
    throw new AuthorityFailure('MANDATE_NOT_CONFIRMED', 'Mandate has no confirmed active revision');
  }
  if (authority.activeVersion !== cart.mandateVersion) {
    throw new AuthorityFailure(
      'MANDATE_REVISION_CONFLICT',
      'Mandate version is not the confirmed active revision',
    );
  }
  const mandate = reconstructMandate(authority.revision, authority.confirmation);
  if (!mandate.allowedSuppliers.includes(cart.supplierId)) {
    throw new AuthorityFailure('SUPPLIER_UNAVAILABLE', 'Supplier is not approved by the confirmed mandate');
  }
  return { mandate, policy: parseStoredPolicy(authority.policyRow.contentJson) };
}

/** Shared with the execution worker and backend CLI for uniform wire operation views. */
export function buildWireOperation(
  database: DatabaseSync,
  row: OperationStorageRow,
  effects: EffectStorageRow[],
): Operation {
  const reservation = loadReservationRow(database, row.operationId);
  if (reservation === null) {
    throw new AuthorityFailure('INTERNAL_ERROR', 'Operation reservation is missing');
  }
  const statusForKind = (kind: string) => {
    const effect = effects.find((item) => item.kind === kind);
    return effect?.state ?? 'not_started';
  };
  const wire = {
    id: row.operationId,
    mandateId: row.mandateId,
    mandateVersion: row.mandateVersion,
    cartId: row.cartId,
    supplierId: extractSupplierId(row.cartJson),
    status: row.status,
    currency: 'SGD' as const,
    totalMinor: reservation.amountMinor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reservationStatus: reservation.state,
    paymentStatus: statusForKind('capture'),
    orderStatus: statusForKind('order'),
    refundStatus: statusForKind('refund'),
    readinessStatus: 'not_assessed' as const,
  };
  return OperationSchema.parse(wire);
}

function extractSupplierId(cartJson: string): string {
  const value = JSON.parse(cartJson) as { supplierId?: unknown };
  if (typeof value.supplierId !== 'string') throw new AuthorityFailure('INTERNAL_ERROR', 'Stored operation cart is unreadable');
  return value.supplierId;
}

function evaluatorFailure(result: EligibilityResult): { code: BackendErrorCode; message: string; checkCodes: string[] } | null {
  if (result.decision === 'eligible') return null;
  const codeFor = (check: Check): BackendErrorCode | null => {
    if (check.code.startsWith('BUDGET')) return 'BUDGET_EXCEEDED';
    if (check.code.startsWith('QUANTITY')) return 'QUANTITY_EXCEEDED';
    if (check.code === 'QUOTE_TIMING') return 'QUOTE_EXPIRED';
    return null;
  };
  const failing = result.checks.filter((check) => check.status === 'fail');
  const nonPassCodes = result.checks.filter((check) => check.status !== 'pass').map((check) => check.code);
  // Evaluator array order is not priority: pick the mapped failure by the
  // documented ranking BUDGET, QUANTITY, QUOTE_TIMING, then INELIGIBLE.
  const mappedCodes = new Set(
    failing.map((check) => codeFor(check)).filter((code): code is BackendErrorCode => code !== null),
  );
  const primary = FAILURE_PRIORITY.find((code) => mappedCodes.has(code));
  if (result.decision === 'blocked' && primary !== undefined) {
    return {
      code: primary,
      message: 'The cart failed mandatory policy checks for this confirmed mandate',
      checkCodes: nonPassCodes,
    };
  }
  if (result.decision === 'blocked') {
    return {
      code: 'INELIGIBLE',
      message: 'The cart is not eligible for this confirmed mandate',
      checkCodes: nonPassCodes,
    };
  }
  const unknown = result.checks.filter((check) => check.status === 'unknown');
  if (unknown.length === 0) {
    return {
      code: 'INELIGIBLE',
      message: 'The cart is not eligible for this confirmed mandate',
      checkCodes: nonPassCodes,
    };
  }
  return {
    code: 'MANDATORY_EVIDENCE_UNKNOWN',
    message: 'Mandatory evidence is unknown, stale or no longer supported',
    checkCodes: unknown.map((check) => check.code),
  };
}

export function createApplicationBackend(config: ApplicationBackendConfig): ApplicationBackend {
  const suppliers = new Map<string, ConfiguredSupplier>();
  for (const entry of config.suppliers) {
    const catalog = CatalogSchema.parse(entry.catalog);
    if (entry.supplierId !== catalog.supplierId) throw new Error('Configured supplier catalog identity mismatch');
    if (suppliers.has(entry.supplierId)) throw new Error('Configured supplier identities must be unique');
    suppliers.set(entry.supplierId, { ...entry, catalog });
  }
  const clock = config.clock ?? ((): string => new Date().toISOString());
  const database = openLedgerStore(config.databasePath);

  async function handleProposalSubmit(
    request: Extract<BackendRequest, { method: 'proposal.submit' }>,
  ): Promise<BackendResponse> {
    const { idempotencyKey, cart } = request.params;
    const typedCart = CartSubmissionSchema.parse(cart);
    const canonical = canonicalCartJson(typedCart);
    const requestDigest = sha256Hex(canonical);

    // Replay resolution precedes any supplier call or authority reevaluation.
    const preflight = resolveIdentities(database, typedCart.mandateId, typedCart.id, idempotencyKey, requestDigest, { aliasBinding: false });
    if (preflight.kind === 'conflict') {
      return errorResponse(request.requestId, request.method, 'IDEMPOTENCY_CONFLICT',
        'Cart identity or idempotency key already resolved to a different operation');
    }
    if (preflight.kind === 'replay') {
      // Atomic alias binding for redundant replays, still without touching quotes.
      const replay = runTransaction(database, () => resolveIdentities(
        database, typedCart.mandateId, typedCart.id, idempotencyKey, requestDigest, { aliasBinding: true },
      ));
      if (replay.kind !== 'replay') {
        throw new AuthorityFailure('INTERNAL_ERROR', 'Replay resolution was inconsistent');
      }
      const operation = buildWireOperation(database, replay.operationRow, loadEffectRows(database, replay.operationRow.operationId));
      return successResponse(request, ProposalSubmitResultSchema.parse({ operation }));
    }

    loadActiveAuthority(database, typedCart);
    const configured = suppliers.get(typedCart.supplierId);
    if (configured === undefined) {
      return errorResponse(request.requestId, request.method, 'SUPPLIER_UNAVAILABLE', 'Approved supplier is not configured');
    }

    let rawQuote: unknown;
    try {
      rawQuote = await configured.adapter.quoteCart(typedCart, clock());
    } catch {
      return errorResponse(request.requestId, request.method, 'SUPPLIER_UNAVAILABLE', 'The supplier could not provide a quotation');
    }
    const quote = QuoteSchema.safeParse(rawQuote);
    if (!quote.success) {
      return errorResponse(request.requestId, request.method, 'SUPPLIER_UNAVAILABLE', 'The supplier quotation did not match the contract');
    }
    const quoteJson = canonicalize(quote.data);
    const termsDigest = sha256Hex(quoteJson);

    const outcome = runTransaction(database, (): { kind: 'created' | 'replay' | 'rejected' | 'conflict'; response: unknown } => {
      // Transactional recheck: both identities, atomically, before any insert.
      const resolution = resolveIdentities(
        database, typedCart.mandateId, typedCart.id, idempotencyKey, requestDigest, { aliasBinding: true },
      );
      if (resolution.kind === 'conflict') {
        return { kind: 'conflict', response: null };
      }
      if (resolution.kind === 'replay') {
        const operation = buildWireOperation(database, resolution.operationRow, loadEffectRows(database, resolution.operationRow.operationId));
        return { kind: 'replay', response: ProposalSubmitResultSchema.parse({ operation }) };
      }

      const { mandate, policy } = loadActiveAuthority(database, typedCart);
      const snapshot = buildSnapshot(database, mandate);
      const evaluation = evaluatePurchase({
        policy,
        mandate,
        submission: typedCart,
        quote: quote.data,
        snapshot,
        now: clock(),
      });
      const failure = evaluatorFailure(evaluation);
      if (failure !== null) {
        return { kind: 'rejected', response: { code: failure.code, message: failure.message, checkCodes: failure.checkCodes } };
      }

      const operationId = `op-${randomUUID()}`;
      insertReservationOperation(database, {
        operationId,
        mandateId: typedCart.mandateId,
        mandateVersion: typedCart.mandateVersion,
        cartId: typedCart.id,
        supplierId: typedCart.supplierId,
        cartJson: canonical,
        quoteJson,
        requestDigest,
        termsDigest,
        amountMinor: quote.data.totalMinor,
        currency: 'SGD',
        createdAt: clock(),
        lines: typedCart.lines,
        idempotencyKey,
        auditKind: 'operation_reserved',
        auditDetails: { totalMinor: quote.data.totalMinor },
      });
      const row = loadOperationStorageRow(database, operationId);
      if (row === null) throw new AuthorityFailure('INTERNAL_ERROR', 'Reservation was not stored');
      const operation = buildWireOperation(database, row, loadEffectRows(database, operationId));
      return { kind: 'created', response: ProposalSubmitResultSchema.parse({ operation }) };
    });

    switch (outcome.kind) {
      case 'created':
      case 'replay':
        return successResponse(request, outcome.response);
      case 'conflict':
        return errorResponse(request.requestId, request.method, 'IDEMPOTENCY_CONFLICT',
          'Cart identity or idempotency key already resolved to a different operation');
      case 'rejected': {
        const rejection = outcome.response as { code: BackendErrorCode; message: string; checkCodes: string[] };
        return errorResponse(request.requestId, request.method, rejection.code, rejection.message, rejection.checkCodes);
      }
      default:
        throw new AuthorityFailure('INTERNAL_ERROR', 'Unreachable proposal outcome');
    }
  }

  async function handleValidRequest(request: BackendRequest): Promise<BackendResponse> {
    switch (request.method) {
      case 'mandate.get': {
        const authority = mandateAuthorityForRead(request);
        if ('response' in authority) return authority.response;
        const mandate = reconstructMandate(authority.value.revision, authority.value.confirmation);
        const snapshot = buildSnapshot(database, mandate);
        return successResponse(request, MandateGetResultSchema.parse({ mandate, snapshot }));
      }
      case 'catalog.list':
        return catalogList(request);
      case 'proposal.submit':
        return await handleProposalSubmit(request);
      case 'operation.get':
        return operationGet(request);
    }
  }

  /**
   * One validated read for mandate.get and catalog.list: the returned revision
   * and confirmation are confirmed non-null, so callers never re-load or
   * assert them.
   */
  function mandateAuthorityForRead(
    request: Extract<BackendRequest, { method: 'mandate.get' | 'catalog.list' }>,
  ): { value: ValidatedMandateRead } | { response: BackendResponse } {
    const authority = loadMandateAuthority(database, request.params.mandateId);
    if (authority === null) {
      return { response: errorResponse(request.requestId, request.method, 'NOT_FOUND', 'Mandate was not found') };
    }
    const { revision, confirmation } = authority;
    if (revision === null || confirmation === null) {
      return { response: errorResponse(request.requestId, request.method, 'MANDATE_NOT_CONFIRMED', 'Mandate has no confirmed active revision') };
    }
    return { value: { activeVersion: authority.activeVersion, revision, confirmation } };
  }

  function catalogList(request: Extract<BackendRequest, { method: 'catalog.list' }>): BackendResponse {
    const params = request.params;
    const authority = mandateAuthorityForRead(request);
    if ('response' in authority) return authority.response;
    const mandate = reconstructMandate(authority.value.revision, authority.value.confirmation);
    if (authority.value.activeVersion !== params.mandateVersion) {
      return errorResponse(request.requestId, request.method, 'MANDATE_REVISION_CONFLICT', 'Mandate version is not current');
    }
    const catalog = suppliers.get(params.supplierId);
    if (catalog === undefined || !mandate.allowedSuppliers.includes(params.supplierId)) {
      return errorResponse(request.requestId, request.method, 'SUPPLIER_UNAVAILABLE', 'Approved supplier catalog was not found');
    }
    return successResponse(request, CatalogListResultSchema.parse({
      mandateId: mandate.id,
      mandateVersion: mandate.version,
      catalog: catalog.catalog,
    }));
  }

  function operationGet(request: Extract<BackendRequest, { method: 'operation.get' }>): BackendResponse {
    const params = request.params;
    const row = loadOperationStorageRow(database, params.operationId);
    if (row === null || row.mandateId !== params.mandateId || row.mandateVersion !== params.mandateVersion) {
      return errorResponse(request.requestId, request.method, 'NOT_FOUND', 'Operation was not found');
    }
    const operation = buildWireOperation(database, row, loadEffectRows(database, row.operationId));
    return successResponse(request, OperationGetResultSchema.parse({ operation }));
  }

  return {
    async handle(input: unknown): Promise<BackendResponse> {
      const invalid = requestError(input);
      if (invalid !== null) return invalid;
      const request = BackendRequestSchema.parse(input);
      try {
        return await handleValidRequest(request);
      } catch (error) {
        const { requestId, method } = request;
        if (error instanceof AuthorityFailure) {
          return authorityFailureResponse(error, requestId, method);
        }
        if (error instanceof LedgerIdentityConflict) {
          return errorResponse(requestId, method, 'IDEMPOTENCY_CONFLICT',
            'Identity was already bound to a different operation');
        }
        if (isSqliteBusy(error)) {
          return errorResponse(requestId, method, 'BUSY', 'The ledger is busy, the request could not be committed');
        }
        return errorResponse(requestId, method, 'INTERNAL_ERROR', GENERIC_FAILURE_MESSAGE);
      }
    },
    close(): void {
      database.close();
    },
  };
}
