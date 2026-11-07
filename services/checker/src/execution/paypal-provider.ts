import { DatabaseSync } from 'node:sqlite';
import type { EffectKind } from '../ledger/store.ts';
import {
  LedgerIdentityConflict,
  canonicalize,
  insertPayPalBindingRow,
  loadEffectRowByKey,
  loadOperationStorageRow,
  loadPayPalBindingRow,
  loadReservationRow,
  recordAuditEvent,
  runTransaction,
  upgradePayPalBindingRow,
} from '../ledger/store.ts';
import {
  type AuthorizeOutcome,
  type ExpectedMoney,
  type GetAuthorizationOutcome,
  type GatewayOutcome,
  type PayPalGateway,
} from '../paypal/gateway.ts';
import type { ApplyOutcome, ExecutionProvider, LookupOutcome } from './gateway.ts';

/**
 * Unit 5: the PayPal-backed ExecutionProvider adapter and the operator binding
 * commands behind it.
 *
 * Boundaries that must not drift:
 * - The ExecutionProvider seam (`execution/gateway.ts`) is UNCHANGED. This file
 *   implements it on top of the unit-4 PayPal gateway without touching the
 *   durable worker; the worker never learns PayPal details beyond provider
 *   name strings and sanitized outcomes.
 * - The supplier ORDER kind ALWAYS goes to the fake provider store, in every
 *   configuration: "the supplier order also stays fake". Only capture and
 *   refund effects consult PayPal, and only when the operator's backend config
 *   selects `paypal-sandbox`.
 * - Every PayPal call carries a stable requestId derived from the immutable
 *   effect identity, so a retried capture can never become a second capture.
 * - Local validation failures that happen BEFORE any fetch release nothing:
 *   they surface as `unknown`, preserving authority, never as a rejection.
 */

export type PaymentProviderSelection = 'fake' | 'paypal-sandbox';

/** Test-only crash hook for the network provider (see unit-3 CRASHPOINT infra). */
export interface PayPalProviderScenario {
  /**
   * After a successful capture response, emit "CRASHPOINT:capture:<effectKey>"
   * to stdout and never return: the parent SIGKILLs the worker exactly between
   * the provider commit and the local acknowledgement. Never reachable through
   * config, CLI or shopper input.
   */
  crashAfterCommit?: boolean;
}

export interface CompositeProviderConfig {
  /**
   * Operator-configured selection. 'fake' runs the unit-3 behavior unchanged;
   * 'paypal-sandbox' routes capture/refund through the sandbox gateway while
   * order effects still go to the fake store.
   */
  selection: PaymentProviderSelection;
  /** The always-present fake provider gateway (order kind, and fake selection). */
  fake: ExecutionProvider & { close?: () => void };
  /** Required when selection is 'paypal-sandbox'; ignored otherwise. */
  paypal?: PayPalGateway;
  /** Application ledger path; required when selection is 'paypal-sandbox' so the
   * adapter can read binding/effect facts. Opened lazily as its own connection. */
  ledgerPath?: string;
  scenario?: PayPalProviderScenario;
}

/**
 * Stable request identity shared with binding commands:
 * `<operationId>:<effect kind>` for effects, `<operationId>:<stage>` for the
 * buyer-approval lifecycle. Bounded and printable, exactly like the gateway's
 * header IDs.
 */
function requestIdentity(operationId: string, stage: string): string {
  return `${operationId}:${stage}`;
}

/** Bounded printable identity check mirroring the gateway's HEADER_ID_PATTERN. */
function isUsableIdentity(identity: string): boolean {
  return /^[\x21-\x7E]{1,127}$/.test(identity);
}

interface RawRow {
  [column: string]: unknown;
}

function parseCaptureRequest(request: unknown):
  | { ok: true; operationId: string; amountMinor: number }
  | { ok: false; why: string } {
  if (request === null || typeof request !== 'object') {
    return { ok: false, why: 'capture request is unreadable' };
  }
  const record = request as { operationId?: unknown; currency?: unknown; amountMinor?: unknown };
  if (typeof record.operationId !== 'string' || record.operationId.length === 0) {
    return { ok: false, why: 'capture request operationId is unreadable' };
  }
  if (record.currency !== 'SGD') {
    return { ok: false, why: 'capture request currency is not the supported currency' };
  }
  if (typeof record.amountMinor !== 'number' || !Number.isSafeInteger(record.amountMinor)
    || record.amountMinor < 1) {
    return { ok: false, why: 'capture request amount is unreadable' };
  }
  return { ok: true, operationId: record.operationId, amountMinor: record.amountMinor };
}

export type PayPalProviderAdapter = ExecutionProvider;

/**
 * Builds the composite provider. With `selection: 'fake'` the behavior is
 * byte-identical to unit 3 (the fake gateway handles every kind). With
 * `paypal-sandbox`, capture/refund go through `paypal` and the binding rows in
 * the application ledger; order still goes to the fake store.
 */
export function createExecutionProvider(config: CompositeProviderConfig): ExecutionProvider & { close(): void } {
  const { selection } = config;
  if (selection === 'paypal-sandbox' && config.paypal === undefined) {
    throw new Error('The paypal-sandbox provider requires a configured sandbox gateway');
  }
  if (selection === 'paypal-sandbox' && config.ledgerPath === undefined) {
    throw new Error('The paypal-sandbox provider requires the application ledger path');
  }
  const ledger: DatabaseSync | null = selection === 'paypal-sandbox'
    // Lazily open read access to binding/effect facts; caller closes via close().
    ? openLedgerReadConnection(config.ledgerPath!)
    : null;
  if (ledger !== null) {
    ledger.exec('PRAGMA busy_timeout = 5000');
  }

  /** The effect key is `<operationId>:<kind>`; the operation id cannot own that suffix. */
  function parseEffectKey(key: string): { operationId: string; kind: EffectKind } | null {
    for (const kind of ['capture', 'order', 'refund'] as const) {
      const suffix = `:${kind}`;
      if (key.endsWith(suffix)) {
        const operationId = key.slice(0, key.length - suffix.length);
        if (operationId.length > 0) return { operationId, kind };
      }
    }
    return null;
  }

  async function payPalApply(kind: EffectKind, key: string, request: unknown): Promise<ApplyOutcome> {
    const gateway = config.paypal!;
    if (key.length === 0 || !isUsableIdentity(key)) {
      // Pre-fetch validation failure: releases nothing, establishes nothing.
      return { outcome: 'unknown' };
    }
    if (kind === 'capture') {
      const parsed = parseCaptureRequest(request);
      if (!parsed.ok) return { outcome: 'unknown' };
      const binding = loadPayPalBindingRow(ledger!, parsed.operationId);
      if (binding === null
        || binding.providerState !== 'authorization_held'
        || binding.authorizationId === null
        || binding.amountMinor !== parsed.amountMinor) {
        return { outcome: 'unknown' };
      }
      const outcome: GatewayOutcome = await gateway.captureAuthorization({
        authorizationId: binding.authorizationId,
        requestId: key,
        invoiceId: binding.invoiceId,
        finalCapture: true,
        expected: { currency: 'SGD', amountMinor: parsed.amountMinor },
      });
      if (outcome.state !== 'succeeded') return { outcome: 'unknown' };
      const resource = outcome.resource;
      if (!('captureId' in resource)) return { outcome: 'unknown' };
      if (config.scenario?.crashAfterCommit === true) {
        // Test-only: the provider "committed" (PayPal owns a capture) but the
        // worker never recorded it. Signal the parent and hang.
        process.stdout.write(`CRASHPOINT:capture:${key}\n`);
        await new Promise<never>(() => {});
      }
      return {
        outcome: 'succeeded',
        providerId: resource.captureId,
        responseJson: canonicalize(resource),
      };
    }
    // kind === 'refund'
    if (request === null || typeof request !== 'object') return { outcome: 'unknown' };
    const record = request as { captureId?: unknown; currency?: unknown; amountMinor?: unknown };
    if (typeof record.captureId !== 'string' || record.captureId.length === 0) {
      return { outcome: 'unknown' };
    }
    if (record.currency !== 'SGD'
      || typeof record.amountMinor !== 'number'
      || !Number.isSafeInteger(record.amountMinor)
      || record.amountMinor < 1) {
      return { outcome: 'unknown' };
    }
    const outcome: GatewayOutcome = await gateway.refundCapture({
      captureId: record.captureId,
      requestId: key,
      expected: { currency: 'SGD', amountMinor: record.amountMinor },
    });
    if (outcome.state !== 'succeeded' || !('refundId' in outcome.resource)) {
      return { outcome: 'unknown' };
    }
    return {
      outcome: 'succeeded',
      providerId: outcome.resource.refundId,
      responseJson: canonicalize(outcome.resource),
    };
  }

  async function payPalLookupCapture(key: string, operationId: string): Promise<LookupOutcome> {
    const gateway = config.paypal!;
    const binding = loadPayPalBindingRow(ledger!, operationId);
    if (binding === null || binding.providerState !== 'authorization_held') {
      // No binding (hold never secured or established): the authorizations flow
      // must run first, so there is no capture of ours to find yet. Mere
      // absence is not rejection evidence for anything.
      return { outcome: 'not_applied' };
    }
    const expected: ExpectedMoney = { currency: 'SGD', amountMinor: binding.amountMinor };
    const read: GetAuthorizationOutcome = await gateway.getAuthorization({
      authorizationId: binding.authorizationId!, // provider_state check guarantees this
      expected,
    });
    if (read.state !== 'succeeded') return { outcome: 'unknown' };
    const status = read.resource.status;
    if (status === 'CREATED' || status === 'PENDING') {
      // The hold exists but our capture never completed; safe to instruct the
      // worker to retry per its existing same-key/not-applied discipline (the
      // revalidation gate still runs on every retry).
      return { outcome: 'not_applied' };
    }
    if (status === 'DENIED' || status === 'VOIDED' || status === 'EXPIRED') {
      // Durable provider status: definitive non-application evidence. The hold
      // can never capture, so releasing the reservation is safe and no refund
      // exists to discover.
      return {
        outcome: 'rejected',
        providerId: binding.authorizationId!,
        responseJson: canonicalize(read.resource),
      };
    }
    if (status !== 'CAPTURED') {
      // PARTIALLY_CAPTURED or any future recognized status is treated as
      // unverified rather than definitive.
      return { outcome: 'unknown' };
    }
    if (read.resource.captureIdHint === undefined) {
      return { outcome: 'unknown' };
    }
      const captureRead: GatewayOutcome = await gateway.getCapture({
        captureId: read.resource.captureIdHint,
        authorizationId: binding.authorizationId!,
        invoiceId: binding.invoiceId,
        expected,
      });
      if (captureRead.state !== 'succeeded' || !('captureId' in captureRead.resource)) {
        return { outcome: 'unknown' };
      }
      return {
        outcome: 'succeeded',
        providerId: captureRead.resource.captureId,
        responseJson: canonicalize(captureRead.resource),
      };
  }

  async function payPalLookupRefund(key: string, operationId: string): Promise<LookupOutcome> {
    const gateway = config.paypal!;
    // No refund discovery by design: without a persisted refund id there is no
    // verified capture binding to search under, so the compensation state is
    // retained (documented limitation of reconciliation, never guessed).
    const effect = loadEffectRowByKey(ledger!, key);
    if (effect === null || effect.providerId === null) return { outcome: 'unknown' };
    let request: unknown;
    try {
      request = JSON.parse(effect.requestJson);
    } catch {
      return { outcome: 'unknown' };
    }
    const record = (request ?? {}) as { captureId?: unknown; amountMinor?: unknown };
    if (typeof record.captureId !== 'string' || typeof record.amountMinor !== 'number'
      || !Number.isSafeInteger(record.amountMinor)) {
      return { outcome: 'unknown' };
    }
    const read: GatewayOutcome = await gateway.getRefund({
      refundId: effect.providerId,
      captureId: record.captureId,
      expected: { currency: 'SGD', amountMinor: record.amountMinor },
    });
    if (read.state !== 'succeeded' || !('refundId' in read.resource)) return { outcome: 'unknown' };
    return {
      outcome: 'succeeded',
      providerId: read.resource.refundId,
      responseJson: canonicalize(read.resource),
    };
  }

  return {
    async applyEffect(effectKey: string, kind: EffectKind, request: unknown): Promise<ApplyOutcome> {
      if (kind === 'order') {
        // The supplier order also stays fake, in every configuration.
        return await config.fake.applyEffect(effectKey, kind, request);
      }
      if (selection === 'fake' || config.paypal === undefined || ledger === null) {
        return await config.fake.applyEffect(effectKey, kind, request);
      }
      return await payPalApply(kind, effectKey, request);
    },
    async lookupEffect(effectKey: string): Promise<LookupOutcome> {
      const parsed = parseEffectKey(effectKey);
      if (parsed === null) return { outcome: 'unknown' };
      if (selection === 'fake' || config.paypal === undefined || ledger === null
        || (parsed.kind !== 'capture' && parsed.kind !== 'refund')) {
        return await config.fake.lookupEffect(effectKey);
      }
      if (parsed.kind === 'capture') return await payPalLookupCapture(effectKey, parsed.operationId);
      return await payPalLookupRefund(effectKey, parsed.operationId);
    },
    close(): void {
      try { ledger?.close(); } catch { /* best-effort close */ }
      config.fake.close?.();
    },
  };
}

/**
 * Opens a read-capable connection to the application ledger WITHOUT re-running
 * migrations: the process that owns the store runs the schema, so the provider
 * adapter only needs to read binding/effect facts (busy timeout is set;
 * STRICT/CHECK constraints hold regardless of the FK pragma, which this read
 * connection deliberately leaves off — it never writes).
 */
function openLedgerReadConnection(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  database.exec('PRAGMA busy_timeout = 5000');
  return database;
}

// --- Operator binding commands (unit 5) ---
// Only the backend's `operation-authorize` / `operation-complete-authorization`
// commands write binding rows. Each write is one short synchronous transaction
// (never spanning a provider call) that also appends its binding audit event,
// matching the ledger's audit discipline.

export type HoldRefusalCode =
  | 'operation-not-found'
  | 'operation-not-reserved'
  | 'binding-missing'
  | 'binding-conflict'
  | 'invalid-identity'
  | 'provider-unknown'
  | 'buyer-not-approved';

function refusal(code: HoldRefusalCode, message: string): { kind: 'refused'; code: HoldRefusalCode; message: string } {
  return { kind: 'refused', code, message };
}

export interface HoldCommandConfig {
  database: DatabaseSync;
  gateway: PayPalGateway;
  operationId: string;
  /** Trusted executor clock sample supplied by the CLI, never a request. */
  now: string;
}

export type AuthorizeHoldResult =
  | { kind: 'created'; orderId: string; approvalUrl: string; amountMinor: number; currency: 'SGD'; providerState: 'order_created' }
  | { kind: 'replayed'; orderId: string; approvalUrl: string; amountMinor: number; currency: 'SGD'; providerState: 'order_created' }
  | { kind: 'held'; orderId: string; authorizationId: string; amountMinor: number; currency: 'SGD'; providerState: 'authorization_held' }
  | { kind: 'refused'; code: HoldRefusalCode; message: string };

const HOLD_IDENTITY_MAX = 127 - ':authorize'.length; // 117: `<id>:<stage>` must fit the
// gateway's 127-char printable header bound; ':authorize' is the longest stage stem
// ('hold', ':capture' and ':refund' are shorter), so 118 would push the request id
// past what the gateway accepts and surface only as a provider-side unknown.

function validateBindingIdentity(operationId: string):
  | { ok: true }
  | { ok: false; code: HoldRefusalCode; message: string } {
  if (typeof operationId !== 'string' || operationId.length === 0
    || operationId.length > HOLD_IDENTITY_MAX || !/^[\x21-\x7E]+$/.test(operationId)) {
    return {
      ok: false,
      code: 'invalid-identity',
      message: 'The operation id is not usable as a PayPal reference (binding identity refused)',
    };
  }
  return { ok: true };
}

function sanitizedUnknown(reason: string): string {
  // Closed, reason-only surface: no raw provider payload, ID or URL.
  const phrases: Record<string, string> = {
    transport: 'The sandbox provider response could not be established; nothing was recorded',
    provider_error: 'The sandbox provider refused the request; nothing was recorded',
    invalid_response: 'The sandbox provider response was not verifiable; nothing was recorded',
    unconfirmed_status: 'The sandbox provider response did not confirm the expected state; nothing was recorded',
    binding_unverified: 'The sandbox provider response contradicted the stored binding; nothing was recorded',
  };
  return phrases[reason] ?? 'The sandbox provider outcome could not be verified; nothing was recorded';
}

function describeUnknown(outcome: { reason: string }): string {
  return sanitizedUnknown(outcome.reason);
}

/**
 * `operation-authorize` core: requires a reserved operation with its fake-provider
 * quote facts bound to an active reservation, then creates the PayPal
 * AUTHORIZATION order for the reserved all-in amount. Binding row and audit
 * event commit together AFTER the provider answer; a provider failure writes
 * nothing. Idempotent: a matching existing binding replays the approval URL
 * through the same stable request identity; a conflicting binding or a changed
 * amount is refused, never overwritten.
 */
export async function authorizeOperationHold(config: HoldCommandConfig): Promise<AuthorizeHoldResult> {
  const identity = validateBindingIdentity(config.operationId);
  if (!identity.ok) return refusal(identity.code, identity.message);
  const { database, operationId } = config;
  const row = loadOperationStorageRow(database, operationId);
  if (row === null) return refusal('operation-not-found', 'Operation was not found');
  const reservation = loadReservationRow(database, operationId);
  if (reservation === null || reservation.state !== 'active') {
    return refusal('operation-not-reserved', 'Operation is not awaiting authorization; its reservation is no longer active');
  }
  const existing = loadPayPalBindingRow(database, operationId);
  if (existing !== null) {
    if (existing.invoiceId !== operationId || existing.amountMinor !== reservation.amountMinor) {
      return refusal('binding-conflict',
        'A hold binding already exists for this operation with different terms; never overwritten');
    }
    if (existing.providerState === 'authorization_held') {
      return {
        kind: 'held',
        orderId: existing.orderId ?? '',
        authorizationId: existing.authorizationId ?? '',
        amountMinor: existing.amountMinor,
        currency: 'SGD',
        providerState: 'authorization_held',
      };
    }
    // order_created replay: the same request identity makes PayPal answer with
    // the same created order; a different order id back is an upstream conflict.
    const replay = await config.gateway.createAuthorizationOrder({
      requestId: requestIdentity(operationId, 'hold'),
      invoiceId: operationId,
      expected: { currency: 'SGD', amountMinor: existing.amountMinor },
    });
    if (replay.state !== 'succeeded') {
      return refusal('provider-unknown', describeUnknown(replay));
    }
    if (replay.resource.orderId !== existing.orderId) {
      return refusal('binding-conflict',
        'The provider replayed a different order for this binding; never overwritten');
    }
    return {
      kind: 'replayed',
      orderId: replay.resource.orderId,
      approvalUrl: replay.resource.approvalUrl,
      amountMinor: existing.amountMinor,
      currency: 'SGD',
      providerState: 'order_created',
    };
  }

  const created = await config.gateway.createAuthorizationOrder({
    requestId: requestIdentity(operationId, 'hold'),
    invoiceId: operationId,
    expected: { currency: 'SGD', amountMinor: reservation.amountMinor },
  });
  if (created.state !== 'succeeded') {
    return refusal('provider-unknown', describeUnknown(created));
  }
  runTransaction(database, () => {
    // Re-check inside the transaction: a concurrent command may have bound first.
    const outcome = insertPayPalBindingRow(database, {
      operationId,
      orderId: created.resource.orderId,
      invoiceId: operationId,
      amountMinor: reservation.amountMinor,
      createdAt: config.now,
    });
    // Only a genuine first creation mints the audit event; a replay of an
    // already-bound row (racer won) must not append a second binding_created.
    if (outcome === 'created') {
      recordAuditEvent(database, row.mandateId, operationId, 'binding_created', {
        operationId,
        mandateId: row.mandateId,
        paymentProvider: 'paypal-sandbox',
        providerState: 'order_created',
        orderId: created.resource.orderId,
        invoiceId: operationId,
        currency: 'SGD',
        amountMinor: reservation.amountMinor,
      }, config.now);
    }
  });
  return {
    kind: 'created',
    orderId: created.resource.orderId,
    approvalUrl: created.resource.approvalUrl,
    amountMinor: reservation.amountMinor,
    currency: 'SGD',
    providerState: 'order_created',
  };
}

export type CompleteAuthorizationResult =
  | { kind: 'completed'; orderId: string; authorizationId: string; amountMinor: number; currency: 'SGD'; providerState: 'authorization_held' }
  | { kind: 'already_held'; orderId: string; authorizationId: string; amountMinor: number; currency: 'SGD'; providerState: 'authorization_held' }
  | { kind: 'refused'; code: HoldRefusalCode; message: string };

/**
 * `operation-complete-authorization` core: finalizes the buyer-approved order
 * (gateway.authorizeOrder) and upgrades the binding to `authorization_held`.
 * PayPal's documented ORDER_NOT_APPROVED failure maps to the closed
 * `buyer-not-approved` refusal; every provider uncertainty stays `unknown` with
 * nothing recorded. Idempotent: an already-held binding replays its facts with
 * no provider call.
 */
export async function completeAuthorizationHold(config: HoldCommandConfig): Promise<CompleteAuthorizationResult> {
  const identity = validateBindingIdentity(config.operationId);
  if (!identity.ok) return refusal(identity.code, identity.message);
  const { database, operationId } = config;
  const row = loadOperationStorageRow(database, operationId);
  if (row === null) return refusal('operation-not-found', 'Operation was not found');
  const binding = loadPayPalBindingRow(database, operationId);
  if (binding === null) {
    return refusal('binding-missing',
      'No authorization hold exists for this operation; operation-authorize must run first');
  }
  if (binding.providerState === 'authorization_held') {
    return {
      kind: 'already_held',
      orderId: binding.orderId ?? '',
      authorizationId: binding.authorizationId ?? '',
      amountMinor: binding.amountMinor,
      currency: 'SGD',
      providerState: 'authorization_held',
    };
  }
  if (binding.orderId === null) {
    return refusal('binding-conflict', 'The stored hold binding has no order id; binding is unusable');
  }

  const authorized: AuthorizeOutcome = await config.gateway.authorizeOrder({
    orderId: binding.orderId,
    requestId: requestIdentity(operationId, 'authorize'),
    expected: { currency: 'SGD', amountMinor: binding.amountMinor },
  });
  if (authorized.state === 'buyer_not_approved') {
    return refusal('buyer-not-approved', 'The sandbox buyer has not approved this hold yet');
  }
  if (authorized.state !== 'succeeded') {
    return refusal('provider-unknown', describeUnknown(authorized));
  }

  let conflict: string | null = null;
  runTransaction(database, () => {
    try {
      const upgraded = upgradePayPalBindingRow(database, operationId, authorized.resource.authorizationId, config.now);
      if (upgraded === 'upgraded') {
        recordAuditEvent(database, row.mandateId, operationId, 'binding_upgraded', {
          operationId,
          mandateId: row.mandateId,
          paymentProvider: 'paypal-sandbox',
          providerState: 'authorization_held',
          authorizationId: authorized.resource.authorizationId,
          currency: 'SGD',
          amountMinor: binding.amountMinor,
        }, config.now);
      }
    } catch (error) {
      if (error instanceof LedgerIdentityConflict) {
        conflict = error.message;
        return;
      }
      throw error;
    }
  });
  if (conflict !== null) {
    return refusal('binding-conflict', conflict);
  }
  return {
    kind: 'completed',
    orderId: binding.orderId,
    authorizationId: authorized.resource.authorizationId,
    amountMinor: binding.amountMinor,
    currency: 'SGD',
    providerState: 'authorization_held',
  };
}
