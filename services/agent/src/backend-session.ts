import { z } from 'zod';
import type { BackendClient } from '../../../packages/contracts/src/client.ts';
import type { BackendErrorCode, BackendRequest, BackendResponse } from '../../../packages/contracts/src/backend.ts';
import type { CartSubmission } from '../../../packages/contracts/src/index.ts';
import type { CatalogSource } from '../../suppliers/src/catalog.ts';
import {
  createShoppingSession,
  type ProposalOutcome, type ProposalPort, type ShoppingSession, type SubmissionJournal,
} from './shopper.ts';

// This module is the agent's only route to the backend. It speaks the shared client
// contract, whose four methods have no way to confirm, execute, pay or edit policy.

/** A different cart could succeed: nothing was reserved. */
const REJECTION_CODES: ReadonlySet<BackendErrorCode> = new Set<BackendErrorCode>([
  'BUDGET_EXCEEDED', 'QUANTITY_EXCEEDED', 'QUOTE_EXPIRED',
  'MANDATORY_EVIDENCE_UNKNOWN', 'INELIGIBLE', 'SUPPLIER_UNAVAILABLE',
]);
/** The backend could not say what happened, so the same cart must be retried. */
const INDETERMINATE_CODES: ReadonlySet<BackendErrorCode> = new Set<BackendErrorCode>(['BUSY', 'INTERNAL_ERROR']);

const SessionOptionsSchema = z.object({
  mandateId: z.string().trim().min(1).max(200),
  runId: z.string().trim().min(1).max(100),
  maxToolCalls: z.number().int().min(1).max(100).optional(),
  maxCarts: z.number().int().min(1).max(10).optional(),
  // A real RPC is a fresh process, so its reads need more than the offline default.
  catalogTimeoutMs: z.number().int().min(1).max(10_000).default(10_000),
  submitTimeoutMs: z.number().int().min(1).max(120_000).default(30_000),
}).strict();

export class BackendSessionError extends Error {
  readonly code: BackendErrorCode;

  constructor(code: BackendErrorCode, message: string) {
    super(message);
    this.name = 'BackendSessionError';
    this.code = code;
  }
}

/** Same mapping for retries: one cart always carries one idempotency key. */
export function proposalIdempotencyKey(cartId: string): string {
  return `shop:${cartId}`;
}

function proposalOutcome(response: BackendResponse): ProposalOutcome {
  if (response.ok) {
    if (response.method !== 'proposal.submit') return { kind: 'unknown' };
    return { kind: 'accepted', operation: response.result.operation };
  }
  const { code, message, details } = response.error;
  if (REJECTION_CODES.has(code)) return { kind: 'rejected', code, message, checkCodes: details.checkCodes };
  if (INDETERMINATE_CODES.has(code)) return { kind: 'unknown' };
  return { kind: 'refused', code, message };
}

/**
 * Starts a session from the backend's confirmed mandate and ledger totals. An
 * unconfirmed mandate fails here, so a draft cannot reach the shopper at all.
 */
export async function createBackendShoppingSession(rawOptions: unknown, client: BackendClient, journal?: SubmissionJournal): Promise<ShoppingSession> {
  const { mandateId, runId, maxToolCalls, maxCarts, catalogTimeoutMs, submitTimeoutMs } = SessionOptionsSchema.parse(rawOptions);
  let sequence = 0;
  const requestEnvelope = (): Pick<BackendRequest, 'apiVersion' | 'requestId'> => {
    sequence += 1;
    return { apiVersion: '1', requestId: `${runId}-request-${sequence}` };
  };

  const loaded = await client.request({ ...requestEnvelope(), method: 'mandate.get', params: { mandateId } });
  if (!loaded.ok) throw new BackendSessionError(loaded.error.code, loaded.error.message);
  if (loaded.method !== 'mandate.get') throw new BackendSessionError('INTERNAL_ERROR', 'Backend response did not match mandate.get');
  const { mandate, snapshot } = loaded.result;

  const catalogs: CatalogSource = {
    async getCatalog(supplierId) {
      const response = await client.request({
        ...requestEnvelope(), method: 'catalog.list',
        params: { mandateId: mandate.id, mandateVersion: mandate.version, supplierId },
      });
      if (!response.ok || response.method !== 'catalog.list') throw new Error('Catalog read was refused');
      return response.result.catalog;
    },
  };

  const proposals: ProposalPort = {
    async submit(cart): Promise<ProposalOutcome> {
      return proposalOutcome(await client.request({
        ...requestEnvelope(), method: 'proposal.submit',
        params: { idempotencyKey: proposalIdempotencyKey(cart.id), cart },
      }));
    },
  };

  return createShoppingSession({
    mandate, snapshot, runId, catalogTimeoutMs, submitTimeoutMs,
    ...(maxToolCalls === undefined ? {} : { maxToolCalls }),
    ...(maxCarts === undefined ? {} : { maxCarts }),
  }, { catalogs, proposals, journal });
}

export type ResentCart = (
  | Extract<ProposalOutcome, { kind: 'accepted' | 'rejected' | 'refused' }>
  | { kind: 'unknown' }
) & { cart: CartSubmission };

/**
 * Sends every cart left unknown by an earlier run again, exactly as it was and with the same
 * key, before anything else can happen on this mandate. No model is involved. The backend
 * returns the original operation if one exists, including when the first request is still
 * on its way, so this also recovers an operation ID nothing else could find.
 */
export async function resendUnresolvedCarts(
  options: { runId: string; submitTimeoutMs?: number },
  client: BackendClient,
  journal: SubmissionJournal,
): Promise<ResentCart[]> {
  const resent: ResentCart[] = [];
  for (const [index, cart] of journal.pending().entries()) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let outcome: ProposalOutcome;
    try {
      outcome = await Promise.race([
        client.request({
          apiVersion: '1', requestId: `${options.runId}-resend-${index + 1}`, method: 'proposal.submit',
          params: { idempotencyKey: proposalIdempotencyKey(cart.id), cart },
        }).then(proposalOutcome),
        new Promise<ProposalOutcome>((settle) => {
          timer = setTimeout(() => settle({ kind: 'unknown' }), options.submitTimeoutMs ?? 30_000);
        }),
      ]);
    } catch {
      outcome = { kind: 'unknown' };
    } finally {
      clearTimeout(timer);
    }
    if (outcome.kind !== 'unknown') journal.clear(cart.id);
    resent.push({ ...outcome, cart });
  }
  return resent;
}
