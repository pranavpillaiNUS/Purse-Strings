import { randomUUID } from 'node:crypto';
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
} from '../../../../packages/contracts/src/index.ts';
import type { Operation } from '../../../../packages/contracts/src/backend.ts';
import type { SupplierAdapter } from '../../../suppliers/src/adapter.ts';
import { loadMandateAuthority, reconstructMandate } from '../authority.ts';
import { buildWireOperation } from '../application.ts';
import { evaluatePurchase } from '../rules/evaluate.ts';
import {
  LeaseLost,
  assertLeaseHeld,
  canonicalize,
  claimLeaseRow,
  consumeReservationRow,
  insertEffectIntentRow,
  isSqliteBusy,
  loadEffectRowByKind,
  loadEffectRows,
  loadMandateTotals,
  loadOperationStorageRow,
  loadReservationRow,
  openLedgerStore,
  recordAuditEvent,
  releaseLeaseOwnerRow,
  releaseReservationRow,
  renewLeaseRow,
  runTransaction,
  setEffectStateRow,
  sha256Hex,
  updateOperationStatusRow,
  type DatabaseSync,
  type EffectKind,
  type OperationStorageRow,
  type ReservationStorageRow,
} from '../ledger/store.ts';
import {
  effectKey,
  PROVIDER_CALL_TIMEOUT_MS,
  type ApplyOutcome,
  type ExecutionProvider,
  type LookupOutcome,
} from './gateway.ts';

/**
 * Durable simulated execution worker.
 *
 * Unit 3 contract: real process-crash restart recovery against durable fake
 * providers. All persisted execution facts (intents, in-flight markers,
 * resolved outcomes, statuses, reservations) live in the application ledger,
 * and every write the worker performs atomically matches a valid lease
 * (owner + generation + unexpired) inside one BEGIN IMMEDIATE transaction.
 * Nothing here touches real money: all provider facts come from the labelled
 * fake provider store.
 */

const LEASE_TTL_MS = 30_000;

const TERMINAL_STATUSES = new Set(['ordered', 'failed', 'compensated']);

export interface ExecutionSupplier {
  supplierId: string;
  catalog: Catalog;
  adapter: SupplierAdapter;
}

export interface ExecutionWorkerConfig {
  databasePath: string;
  suppliers: ReadonlyArray<{ supplierId: string; catalog: unknown; adapter: SupplierAdapter }>;
  provider: ExecutionProvider;
  /** Trusted executor clock. Never derived from a request or CLI argument. */
  clock: () => string;
  /**
   * Test-only injection point: crash scenarios hold a never-resolving provider
   * call open so the parent can SIGKILL the worker, and disable the timeout
   * race for it. The backend CLI never sets this (10 s default).
   */
  providerTimeoutMs?: number | null;
  /**
   * Test-only: once an intent row is persisted for this kind, emit
   * "CRASHPOINT-intent:<kind>" to stdout and never proceed to in-flight, so
   * the parent can SIGKILL the worker between intent persistence and dispatch.
   * Never part of the CLI, config or shopper-visible shapes.
   */
  testPauseAfterIntent?: EffectKind | null;
  /**
   * Test-only: after an intent row is persisted for capture, emit
   * "BARRIER-intent:capture" and await this injected barrier before the next
   * lease write. Lets a parent hold the ledger write lock across that step so
   * tests can prove post-lock lease sampling. Never part of the CLI.
   */
  testWaitAfterIntent?: (kind: EffectKind) => Promise<void>;
}

export type ExecutionResult =
  | { kind: 'executed'; operation: Operation }
  | { kind: 'already_terminal'; operation: Operation }
  | { kind: 'busy'; message: string }
  | { kind: 'not_found'; message: string };

export interface ExecutionWorker {
  run(operationId: string): Promise<ExecutionResult>;
  reconcile(operationId: string): Promise<ExecutionResult>;
  close(): void;
}

/** Simulated call budget enforcement on any external seam. */
async function callBounded<T>(call: Promise<T>, timeoutMs: number | null): Promise<T> {
  if (timeoutMs === null) return await call;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      call,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // The race has settled: observe the losing promise so a rejection
          // arriving after the winner cannot crash the worker.
          call.then(() => undefined, () => undefined);
          reject(new Error('external call timeout'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface RunContext {
  operationId: string;
  ownerId: string;
  generation: number;
}

interface ClockSample {
  nowIso: string;
  nowMs: number;
}

type GateResult = { passed: true } | { passed: false; reason: string; checkCodes: string[] };

function reloadOperation(database: DatabaseSync, operationId: string): OperationStorageRow {
  const row = loadOperationStorageRow(database, operationId);
  if (row === null) throw new Error('Operation row vanished during execution');
  return row;
}

/** Commercial terms identity: record identifiers may drift, terms may not. */
function commercialTerms(quote: Quote): string {
  return canonicalize({
    supplierId: quote.supplierId,
    currency: quote.currency,
    deliveryLocationId: quote.deliveryLocationId,
    shippingMinor: quote.shippingMinor,
    taxMinor: quote.taxMinor,
    totalMinor: quote.totalMinor,
    deliveryBy: quote.delivery.by,
    lines: [...quote.lines]
      .map((line) => ({
        sku: line.sku,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        warrantyMonths: line.warrantyMonths,
      }))
      .sort((left, right) => (left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0)),
  });
}

function supplierOfCart(row: OperationStorageRow): string {
  const parsed = JSON.parse(row.cartJson) as { supplierId?: unknown };
  if (typeof parsed.supplierId !== 'string') throw new Error('Stored operation cart is unreadable');
  return parsed.supplierId;
}

/**
 * Capture gate. Runs OUTSIDE any transaction, before every dispatch that could
 * establish a first successful payment (fresh capture, an intent left by an
 * earlier claim, or a retry after absence). A persisted intent or an earlier
 * attempt never satisfies this gate by itself; totals exclude this operation's
 * own reservation so the gate reflects authority as if the reservation were
 * released rather than double-counting it.
 */
async function validateCaptureGate(
  database: DatabaseSync,
  suppliers: ReadonlyMap<string, ExecutionSupplier>,
  row: OperationStorageRow,
  reservation: ReservationStorageRow,
  gateClock: () => { nowIso: string; nowMs: number },
  callTimeoutMs: number | null,
): Promise<GateResult> {
  // Gate-time clock, never the claim-time sample: expiry and staleness must be
  // judged now, not at claim. Claim-time values persist only as record
  // timestamps; every lease write samples the trusted clock fresh.
  const { nowIso: gateNowIso } = gateClock();
  const authority = loadMandateAuthority(database, row.mandateId);
  if (authority === null) {
    return { passed: false, reason: 'Mandate was not found', checkCodes: [] };
  }
  if (authority.revision === null || authority.confirmation === null || authority.policyRow === null) {
    return { passed: false, reason: 'Mandate authority is missing or no longer confirmed', checkCodes: [] };
  }
  if (authority.activeVersion !== row.mandateVersion) {
    return { passed: false, reason: 'Operation authority no longer matches its stored revision', checkCodes: [] };
  }
  let mandate: Mandate;
  let policy: Policy;
  let cart: CartSubmission;
  let storedQuote: Quote;
  try {
    mandate = reconstructMandate(authority.revision, authority.confirmation);
    policy = PolicySchema.parse(JSON.parse(authority.policyRow.contentJson));
    cart = CartSubmissionSchema.parse(JSON.parse(row.cartJson));
    storedQuote = QuoteSchema.parse(JSON.parse(row.quoteJson));
  } catch {
    return { passed: false, reason: 'Stored execution state is unreadable', checkCodes: [] };
  }
  if (!mandate.allowedSuppliers.includes(cart.supplierId)) {
    return { passed: false, reason: 'Supplier is no longer approved by the mandate', checkCodes: [] };
  }
  if (reservation.currency !== 'SGD') {
    return { passed: false, reason: 'The reservation currency is not the supported currency', checkCodes: [] };
  }

  // Fresh quote from the configured supplier, strictly outside any transaction.
  const supplier = suppliers.get(cart.supplierId);
  if (supplier === undefined) {
    return { passed: false, reason: 'The approved supplier is not configured', checkCodes: [] };
  }
  let freshQuote: Quote;
  try {
    freshQuote = QuoteSchema.parse(await callBounded(supplier.adapter.quoteCart(cart, gateNowIso), callTimeoutMs));
  } catch {
    return { passed: false, reason: 'The supplier could not refresh the quotation', checkCodes: [] };
  }
  if (sha256Hex(commercialTerms(freshQuote)) !== sha256Hex(commercialTerms(storedQuote))) {
    return {
      passed: false,
      reason: 'The refreshed quotation no longer matches the accepted commercial terms',
      checkCodes: ['QUOTE_TERMS_CHANGED'],
    };
  }

  // Totals excluding this operation's own reservation.
  const totals = loadMandateTotals(database, row.mandateId, row.operationId);
  const snapshot: BudgetSnapshot = BudgetSnapshotSchema.parse({
    mandateId: row.mandateId,
    mandateVersion: row.mandateVersion,
    currency: 'SGD',
    committedMinor: totals.committedMinor,
    reservedMinor: totals.reservedMinor,
    quantities: mandate.requirements.map((requirement) => ({
      requirementId: requirement.id,
      committed: totals.perRequirement.get(requirement.id)?.committed ?? 0,
      reserved: totals.perRequirement.get(requirement.id)?.reserved ?? 0,
    })),
  });
  // The supplier call above can outlive the mandate deadline, quote window or
  // evidence age, so eligibility is judged against a NEW trusted clock taken
  // after that awaited response, never the gate-time sample.
  const { nowIso: postResponseIso } = gateClock();
  const evaluation = evaluatePurchase({
    policy,
    mandate,
    submission: cart,
    quote: freshQuote,
    snapshot,
    now: postResponseIso,
  });
  if (evaluation.decision !== 'eligible') {
    const failCodes: string[] = [];
    for (const check of evaluation.checks) {
      if (check.status !== 'pass' && failCodes.length < 1000) failCodes.push(check.code);
    }
    return {
      passed: false,
      reason: 'Revalidation of current authority and quotation failed mandatory checks',
      checkCodes: failCodes,
    };
  }
  return { passed: true };
}

export function createExecutionWorker(config: ExecutionWorkerConfig): ExecutionWorker {
  const leaseTtlMs = LEASE_TTL_MS;
  const providerTimeoutMs = config.providerTimeoutMs === undefined
    ? PROVIDER_CALL_TIMEOUT_MS
    : config.providerTimeoutMs;
  const database = openLedgerStore(config.databasePath);

  const suppliers = new Map<string, ExecutionSupplier>();
  for (const entry of config.suppliers) {
    const catalog: Catalog = CatalogSchema.parse(entry.catalog);
    if (entry.supplierId !== catalog.supplierId) throw new Error('Configured supplier catalog identity mismatch');
    if (suppliers.has(entry.supplierId)) throw new Error('Configured supplier identities must be unique');
    suppliers.set(entry.supplierId, { supplierId: entry.supplierId, catalog, adapter: entry.adapter });
  }

  function trustedClock(): { nowIso: string; nowMs: number } {
    const nowIso = config.clock();
    const nowMs = Date.parse(nowIso);
    if (!Number.isFinite(nowMs)) throw new Error('The trusted clock returned an unreadable time');
    return { nowIso, nowMs };
  }

  /** Lookup is bounded like dispatch: a timeout or transport failure maps to
   * unknown, never to a definitive provider outcome. */
  async function lookupProvider(operationId: string, kind: EffectKind): Promise<LookupOutcome> {
    try {
      return await callBounded(
        config.provider.lookupEffect(effectKey(operationId, kind)),
        providerTimeoutMs,
      );
    } catch {
      return { outcome: 'unknown' };
    }
  }

  /**
   * Every persisted worker write happens under this wrapper: lease ownership,
   * generation and expiry are asserted inside the same BEGIN IMMEDIATE
   * transaction, so a fenced worker can neither renew nor commit. The clock is
   * sampled AFTER the write lock is acquired: BEGIN IMMEDIATE waits for other
   * writers up to busy_timeout, and a lease that expires during that wait must
   * be judged with the post-lock time, not a sample taken before it. Every
   * lease-bound write stamps record timestamps from that post-lock sample too.
   */
  function underLease<T>(context: RunContext, work: (now: ClockSample) => T): T {
    return runTransaction(database, () => {
      const now = trustedClock();
      assertLeaseHeld(database, context.operationId, context.ownerId, context.generation, now.nowMs);
      return work(now);
    });
  }

  /** Renew before provider work so provider calls stay inside a live lease. */
  function renewLease(context: RunContext): void {
    underLease(context, (now) => {
      renewLeaseRow(database, context.operationId, context.ownerId, context.generation, now.nowMs, leaseTtlMs);
    });
  }

  type ClaimOutcome =
    | { kind: 'claimed'; ownerId: string; generation: number }
    | { kind: 'already_terminal' }
    | { kind: 'busy' }
    | { kind: 'not_found' };

  function claim(operationId: string): ClaimOutcome {
    const { nowIso, nowMs } = trustedClock();
    const ownerId = randomUUID();
    const outcome = runTransaction(database, () => {
      const row = loadOperationStorageRow(database, operationId);
      if (row === null) return { kind: 'not_found' as const };
      if (TERMINAL_STATUSES.has(row.status)) return { kind: 'already_terminal' as const };
      const claimRow = claimLeaseRow(database, operationId, ownerId, nowMs, leaseTtlMs);
      if (claimRow.kind === 'conflict') return { kind: 'busy' as const };
      if (row.status === 'reserved') {
        updateOperationStatusRow(database, operationId, 'running', nowIso);
      }
      return { kind: 'claimed' as const, generation: claimRow.generation };
    });
    if (outcome.kind === 'claimed') {
      return { kind: 'claimed', ownerId, generation: outcome.generation };
    }
    return { kind: outcome.kind };
  }

  /** Releases ownership after a bounded run; the generation is retained. */
  function releaseOwnership(context: RunContext): void {
    try {
      underLease(context, () => {
        releaseLeaseOwnerRow(database, context.operationId);
      });
    } catch (error) {
      if (error instanceof LeaseLost) return; // expired/superseded: nothing to release
      throw error;
    }
  }

  function wireOperation(operationId: string): Operation {
    return buildWireOperation(database, reloadOperation(database, operationId), loadEffectRows(database, operationId));
  }

  function captureRequestPayload(
    row: OperationStorageRow,
    reservation: ReservationStorageRow,
  ): { operationId: string; currency: 'SGD'; amountMinor: number } {
    if (reservation.currency !== 'SGD') throw new Error('Reservation currency is not the supported currency');
    return { operationId: row.operationId, currency: 'SGD', amountMinor: reservation.amountMinor };
  }

  function createIntent(
    context: RunContext,
    row: OperationStorageRow,
    kind: EffectKind,
    request: unknown,
  ): void {
    underLease(context, (now) => {
      insertEffectIntentRow(database, {
        effectId: `eff-${randomUUID()}`,
        operationId: row.operationId,
        kind,
        effectKey: effectKey(row.operationId, kind),
        requestDigest: sha256Hex(canonicalize(request)),
        requestJson: canonicalize(request),
        createdAt: now.nowIso,
      });
    });
  }

  /** Persists the in-flight marker immediately before the provider call. */
  function markInFlight(context: RunContext, row: OperationStorageRow, kind: EffectKind): void {
    renewLease(context);
    underLease(context, (now) => {
      setEffectStateRow(database, row.operationId, kind, 'in_flight', null, null, now.nowIso);
    });
  }

  async function callProvider(
    context: RunContext,
    row: OperationStorageRow,
    kind: EffectKind,
    request: unknown,
  ): Promise<ApplyOutcome> {
    try {
      return await callBounded(
        config.provider.applyEffect(effectKey(row.operationId, kind), kind, request),
        providerTimeoutMs,
      );
    } catch {
      return { outcome: 'unknown' };
    }
  }

  function sendToReconciliation(
    context: RunContext,
    row: OperationStorageRow,
    kind: EffectKind,
    detail: string,
  ): void {
    underLease(context, (now) => {
      setEffectStateRow(database, row.operationId, kind, 'unknown', null, null, now.nowIso);
      if (kind !== 'refund') {
        updateOperationStatusRow(database, row.operationId, 'reconciliation_required', now.nowIso);
      }
      recordAuditEvent(database, row.mandateId, row.operationId, 'reconciliation_required', {
        effectKind: kind,
        reason: detail,
      }, now.nowIso);
    });
  }

  async function phaseCapture(context: RunContext, mode: 'full' | 'reconcile'): Promise<boolean> {
    const row = reloadOperation(database, context.operationId);
    const reservation = loadReservationRow(database, row.operationId);
    if (reservation === null) throw new Error('Operation reservation is missing');
    const effect = loadEffectRowByKind(database, row.operationId, 'capture');

    if (effect?.state === 'succeeded') {
      underLease(context, (now) => {
        // Only the first capture-to-consumed transition appends the event: a
        // compensation_pending replay would otherwise re-record
        // capture_succeeded with no transition behind it.
        if (reservation.state === 'active') {
          consumeReservationRow(database, row.operationId);
          if (row.status === 'reserved') {
            updateOperationStatusRow(database, row.operationId, 'running', now.nowIso);
          }
          recordAuditEvent(database, row.mandateId, row.operationId, 'capture_succeeded', {
            providerId: effect.providerId,
          }, now.nowIso);
        }
      });
      return true;
    }
    if (effect?.state === 'rejected') {
      underLease(context, (now) => {
        releaseReservationRow(database, row.operationId);
        updateOperationStatusRow(database, row.operationId, 'failed', now.nowIso);
        recordAuditEvent(database, row.mandateId, row.operationId, 'capture_rejected', {
          providerId: effect.providerId,
        }, now.nowIso);
      });
      return false;
    }
    if (effect !== null && (effect.state === 'unknown' || effect.state === 'in_flight')) {
      // Reconcile an earlier ambiguous attempt first; only a definitive
      // provider row justifies consumption or release. Mere absence never does.
      const lookup = await lookupProvider(row.operationId, 'capture');
      if (lookup.outcome === 'succeeded' || lookup.outcome === 'rejected') {
        underLease(context, (now) => {
          setEffectStateRow(database, row.operationId, 'capture', lookup.outcome,
            lookup.providerId, lookup.responseJson, now.nowIso);
          if (lookup.outcome === 'succeeded') {
            consumeReservationRow(database, row.operationId);
          } else {
            releaseReservationRow(database, row.operationId);
          }
          // A definitive outcome ends the forced reconciliation pause.
          updateOperationStatusRow(database, row.operationId,
            lookup.outcome === 'succeeded' ? 'running' : 'failed', now.nowIso);
          recordAuditEvent(database, row.mandateId, row.operationId,
            lookup.outcome === 'succeeded' ? 'capture_succeeded' : 'capture_rejected', {
              providerId: lookup.providerId,
              recovered: true,
            }, now.nowIso);
        });
        return lookup.outcome === 'succeeded';
      }
      // Absence (not_applied) with a live full run: reconciliation may retry
      // the original idempotent capture once eligibility is renewed fresh. The
      // effect key and request payload stay identical, so provider idempotency
      // forks an earlier still-running dispatch to a replay.
      if (lookup.outcome === 'not_applied' && mode === 'full') {
        const gate = await validateCaptureGate(database, suppliers, row, reservation, trustedClock, providerTimeoutMs);
        if (gate.passed) {
          const request = captureRequestPayload(row, reservation);
          markInFlight(context, row, 'capture');
          const answer = await callProvider(context, row, 'capture', request);
          if (answer.outcome === 'unknown') {
            sendToReconciliation(context, row, 'capture', 'the provider outcome could not be established');
            return false;
          }
          underLease(context, (now) => {
            setEffectStateRow(database, row.operationId, 'capture', answer.outcome,
              answer.providerId, answer.responseJson, now.nowIso);
            if (answer.outcome === 'succeeded') {
              consumeReservationRow(database, row.operationId);
            } else {
              releaseReservationRow(database, row.operationId);
            }
            updateOperationStatusRow(database, row.operationId,
              answer.outcome === 'succeeded' ? 'running' : 'failed', now.nowIso);
            recordAuditEvent(database, row.mandateId, row.operationId,
              answer.outcome === 'succeeded' ? 'capture_succeeded' : 'capture_rejected', {
                providerId: answer.providerId,
                sameKeyRetry: true,
              }, now.nowIso);
          });
          return answer.outcome === 'succeeded';
        }
      }
      // Ambiguous: absence without renewed eligibility, or provider unknown.
      // Authority is retained, order and refund stay forbidden, and no new
      // effect key is ever attempted.
      sendToReconciliation(context, row, 'capture', 'the earlier capture attempt is unresolved');
      return false;
    }
    if (mode === 'reconcile') {
      // Reconciliation never dispatches: an intent that was never flagged
      // in-flight stays untouched for a later full run.
      return false;
    }

    // Dispatch attempt: the gate validates everything before any mutation.
    const gate = await validateCaptureGate(database, suppliers, row, reservation, trustedClock, providerTimeoutMs);
    const request = captureRequestPayload(row, reservation);
    if (!gate.passed) {
      // The effect row is absent or still an intent (never dispatched), so
      // safe failure releases the reservation and terminates the operation.
      underLease(context, (now) => {
        releaseReservationRow(database, row.operationId);
        updateOperationStatusRow(database, row.operationId, 'failed', now.nowIso);
        recordAuditEvent(database, row.mandateId, row.operationId, 'capture_gate_failed', {
          reason: gate.reason.slice(0, 250),
          checkCodes: gate.checkCodes.slice(0, 250),
        }, now.nowIso);
      });
      return false;
    }
    if (effect === null) {
      createIntent(context, row, 'capture', request);
      if (config.testWaitAfterIntent) {
        // Test-only: the parent holds the ledger write lock around this resume
        // so the next lease write samples its clock post-lock.
        process.stdout.write(`BARRIER-intent:capture:${row.operationId}\n`);
        await config.testWaitAfterIntent('capture');
      }
    }
    if (config.testPauseAfterIntent === 'capture') {
      // Test-only: hold the process between intent persistence and the
      // in-flight marker so the parent can SIGKILL here.
      process.stdout.write(`CRASHPOINT-intent:capture:${row.operationId}\n`);
      await new Promise<never>(() => {});
      return false; // unreachable
    }
    markInFlight(context, row, 'capture');
    const answer = await callProvider(context, row, 'capture', request);
    if (answer.outcome === 'unknown') {
      sendToReconciliation(context, row, 'capture', 'the provider outcome could not be established');
      return false;
    }
    underLease(context, (now) => {
      setEffectStateRow(database, row.operationId, 'capture', answer.outcome,
        answer.providerId, answer.responseJson, now.nowIso);
      if (answer.outcome === 'succeeded') {
        consumeReservationRow(database, row.operationId);
      } else {
        releaseReservationRow(database, row.operationId);
        updateOperationStatusRow(database, row.operationId, 'failed', now.nowIso);
      }
      recordAuditEvent(database, row.mandateId, row.operationId,
        answer.outcome === 'succeeded' ? 'capture_succeeded' : 'capture_rejected', {
          providerId: answer.providerId,
        }, now.nowIso);
    });
    return answer.outcome === 'succeeded';
  }

  type OrderPhase = 'terminal' | 'compensate' | 'block';

  async function phaseOrder(context: RunContext, mode: 'full' | 'reconcile'): Promise<OrderPhase> {
    const row = reloadOperation(database, context.operationId);
    const effect = loadEffectRowByKind(database, row.operationId, 'order');

    if (effect?.state === 'succeeded') {
      underLease(context, (now) => {
        updateOperationStatusRow(database, row.operationId, 'ordered', now.nowIso);
      });
      return 'terminal';
    }
    if (effect?.state === 'rejected') {
      underLease(context, (now) => {
        updateOperationStatusRow(database, row.operationId, 'compensation_pending', now.nowIso);
      });
      return 'compensate';
    }
    if (effect !== null && (effect.state === 'unknown' || effect.state === 'in_flight')) {
      const request = {
        operationId: row.operationId,
        cart: CartSubmissionSchema.parse(JSON.parse(row.cartJson)) as CartSubmission,
        quote: QuoteSchema.parse(JSON.parse(row.quoteJson)) as Quote,
      };
      const lookup = await lookupProvider(row.operationId, 'order');
      if (lookup.outcome === 'succeeded' || lookup.outcome === 'rejected') {
        underLease(context, (now) => {
          setEffectStateRow(database, row.operationId, 'order', lookup.outcome,
            lookup.providerId, lookup.responseJson, now.nowIso);
          updateOperationStatusRow(database, row.operationId,
            lookup.outcome === 'succeeded' ? 'ordered' : 'compensation_pending', now.nowIso);
          recordAuditEvent(database, row.mandateId, row.operationId,
            lookup.outcome === 'succeeded' ? 'order_succeeded' : 'order_rejected', {
              providerId: lookup.providerId,
              recovered: true,
            }, now.nowIso);
        });
        return lookup.outcome === 'succeeded' ? 'terminal' : 'compensate';
      }
      if (lookup.outcome === 'not_applied') {
        // Definitive absence: the earlier process never committed the order.
        // Resume the original idempotent request under the same effect key and
        // the originally accepted snapshots; the capture already succeeded, so
        // the order may proceed even if the mandate has since expired.
        markInFlight(context, row, 'order');
        const answer = await callProvider(context, row, 'order', request);
        if (answer.outcome === 'unknown') {
          sendToReconciliation(context, row, 'order', 'the provider outcome could not be established');
          return 'block';
        }
        underLease(context, (now) => {
          setEffectStateRow(database, row.operationId, 'order', answer.outcome,
            answer.providerId, answer.responseJson, now.nowIso);
          updateOperationStatusRow(database, row.operationId,
            answer.outcome === 'succeeded' ? 'ordered' : 'compensation_pending', now.nowIso);
          recordAuditEvent(database, row.mandateId, row.operationId,
            answer.outcome === 'succeeded' ? 'order_succeeded' : 'order_rejected', {
              providerId: answer.providerId,
            }, now.nowIso);
        });
        return answer.outcome === 'succeeded' ? 'terminal' : 'compensate';
      }
      // Ambiguous order (lookup unknown): refund is forbidden until rejection
      // is established.
      sendToReconciliation(context, row, 'order', 'the earlier order attempt is unresolved');
      return 'block';
    }
    if (mode === 'reconcile') return 'block';

    const request = {
      operationId: row.operationId,
      cart: CartSubmissionSchema.parse(JSON.parse(row.cartJson)) as CartSubmission,
      quote: QuoteSchema.parse(JSON.parse(row.quoteJson)) as Quote,
    };
    if (effect === null) {
      createIntent(context, row, 'order', request);
    }
    markInFlight(context, row, 'order');
    const answer = await callProvider(context, row, 'order', request);
    if (answer.outcome === 'unknown') {
      sendToReconciliation(context, row, 'order', 'the provider outcome could not be established');
      return 'block';
    }
    underLease(context, (now) => {
      setEffectStateRow(database, row.operationId, 'order', answer.outcome,
        answer.providerId, answer.responseJson, now.nowIso);
      updateOperationStatusRow(database, row.operationId,
        answer.outcome === 'succeeded' ? 'ordered' : 'compensation_pending', now.nowIso);
      recordAuditEvent(database, row.mandateId, row.operationId,
        answer.outcome === 'succeeded' ? 'order_succeeded' : 'order_rejected', {
          providerId: answer.providerId,
        }, now.nowIso);
    });
    return answer.outcome === 'succeeded' ? 'terminal' : 'compensate';
  }

  async function phaseRefund(context: RunContext, mode: 'full' | 'reconcile'): Promise<void> {
    const row = reloadOperation(database, context.operationId);
    if (row.status !== 'compensation_pending') return;
    const orderEffect = loadEffectRowByKind(database, row.operationId, 'order');
    if (orderEffect?.state !== 'rejected') return;
    const captureEffect = loadEffectRowByKind(database, row.operationId, 'capture');
    if (captureEffect?.state !== 'succeeded' || captureEffect.providerId === null) return;
    const reservation = loadReservationRow(database, row.operationId);
    if (reservation === null) throw new Error('Operation reservation is missing');
    const effect = loadEffectRowByKind(database, row.operationId, 'refund');

    if (effect?.state === 'succeeded') {
      underLease(context, (now) => {
        updateOperationStatusRow(database, row.operationId, 'compensated', now.nowIso);
      });
      return;
    }
    if (effect?.state === 'rejected') {
      return; // stays compensation_pending; nothing is restored anywhere
    }
    if (effect !== null && (effect.state === 'unknown' || effect.state === 'in_flight')) {
      const request = {
        operationId: row.operationId,
        captureId: captureEffect.providerId,
        currency: 'SGD',
        amountMinor: reservation.amountMinor,
      };
      const lookup = await lookupProvider(row.operationId, 'refund');
      if (lookup.outcome === 'succeeded') {
        underLease(context, (now) => {
          setEffectStateRow(database, row.operationId, 'refund', 'succeeded',
            lookup.providerId, lookup.responseJson, now.nowIso);
          updateOperationStatusRow(database, row.operationId, 'compensated', now.nowIso);
          recordAuditEvent(database, row.mandateId, row.operationId, 'refund_succeeded', {
            providerId: lookup.providerId,
            recovered: true,
          }, now.nowIso);
        });
        return;
      }
      if (lookup.outcome === 'rejected') {
        underLease(context, (now) => {
          setEffectStateRow(database, row.operationId, 'refund', 'rejected',
            lookup.providerId, lookup.responseJson, now.nowIso);
          recordAuditEvent(database, row.mandateId, row.operationId, 'refund_rejected', {
            providerId: lookup.providerId,
            recovered: true,
          }, now.nowIso);
        });
        return;
      }
      if (lookup.outcome === 'not_applied') {
        // Definitive absence: the earlier process never committed the refund.
        // Resume the stored refund request (captureId, currency, amount) under
        // the same effect key; rejection and successful capture are already
        // established, so compensation resumes even if the mandate expired.
        markInFlight(context, row, 'refund');
        const answer = await callProvider(context, row, 'refund', request);
        if (answer.outcome === 'unknown') {
          sendToReconciliation(context, row, 'refund', 'the provider outcome could not be established');
          return;
        }
        underLease(context, (now) => {
          setEffectStateRow(database, row.operationId, 'refund', answer.outcome,
            answer.providerId, answer.responseJson, now.nowIso);
          if (answer.outcome === 'succeeded') {
            updateOperationStatusRow(database, row.operationId, 'compensated', now.nowIso);
            // Deliberately no reservation release or quantity restitution here:
            // refunds never restore authority.
          }
          recordAuditEvent(database, row.mandateId, row.operationId,
            answer.outcome === 'succeeded' ? 'refund_succeeded' : 'refund_rejected', {
              providerId: answer.providerId,
            }, now.nowIso);
        });
        return;
      }
      // Ambiguous refund (lookup unknown): stays compensation_pending for a
      // later run. Authority is untouched either way; refunds never restore it.
      sendToReconciliation(context, row, 'refund', 'the earlier refund attempt is unresolved');
      return;
    }
    if (mode === 'reconcile') return;

    const request = {
      operationId: row.operationId,
      captureId: captureEffect.providerId,
      currency: 'SGD',
      amountMinor: reservation.amountMinor,
    };
    if (effect === null) {
      createIntent(context, row, 'refund', request);
    }
    markInFlight(context, row, 'refund');
    const answer = await callProvider(context, row, 'refund', request);
    if (answer.outcome === 'unknown') {
      sendToReconciliation(context, row, 'refund', 'the provider outcome could not be established');
      return;
    }
    underLease(context, (now) => {
      setEffectStateRow(database, row.operationId, 'refund', answer.outcome,
        answer.providerId, answer.responseJson, now.nowIso);
      if (answer.outcome === 'succeeded') {
        updateOperationStatusRow(database, row.operationId, 'compensated', now.nowIso);
        // Deliberately no reservation release or quantity restitution here:
        // refunds never restore authority.
      }
      recordAuditEvent(database, row.mandateId, row.operationId,
        answer.outcome === 'succeeded' ? 'refund_succeeded' : 'refund_rejected', {
          providerId: answer.providerId,
        }, now.nowIso);
    });
  }

  async function machine(context: RunContext, mode: 'full' | 'reconcile'): Promise<ExecutionResult> {
    try {
      const captured = await phaseCapture(context, mode);
      if (captured) {
        const orderPhase = await phaseOrder(context, mode);
        if (orderPhase === 'compensate') {
          await phaseRefund(context, mode);
        }
      }
      return { kind: 'executed', operation: wireOperation(context.operationId) };
    } finally {
      releaseOwnership(context);
    }
  }

  async function execute(operationId: string, mode: 'full' | 'reconcile'): Promise<ExecutionResult> {
    let context: RunContext | null = null;
    try {
      const claimResult = claim(operationId);
      if (claimResult.kind === 'not_found') {
        return { kind: 'not_found', message: 'Operation was not found' };
      }
      if (claimResult.kind === 'busy') {
        return { kind: 'busy', message: 'The operation is claimed by another worker' };
      }
      if (claimResult.kind === 'already_terminal') {
        return { kind: 'already_terminal', operation: wireOperation(operationId) };
      }
      context = {
        operationId,
        ownerId: claimResult.ownerId,
        generation: claimResult.generation,
      };
      return await machine(context, mode);
    } catch (error) {
      if (error instanceof LeaseLost) {
        return {
          kind: 'busy',
          message: 'The operation lease was lost while executing; another worker holds the operation',
        };
      }
      if (isSqliteBusy(error)) {
        return { kind: 'busy', message: 'The ledger is busy, the execution step could not be committed' };
      }
      if (context !== null) {
        try { releaseOwnership(context); } catch { /* best-effort after failure */ }
      }
      throw error;
    }
  }

  return {
    run: (operationId: string) => execute(operationId, 'full'),
    reconcile: (operationId: string) => execute(operationId, 'reconcile'),
    close(): void {
      database.close();
    },
  };
}
