import type { EffectKind } from '../ledger/store.ts';
import type { PaymentProvider } from '../../../../packages/contracts/src/backend.ts';

/**
 * Provider seam for durable simulated execution. The payment/supplier calls the
 * worker makes always go through this interface: unit 3 implements it with the
 * offline fake provider store (fake.ts); the PayPal-backed gateway in the next
 * unit will implement the same seam without touching the worker.
 */

/** Stable effect identity: one immutable request per operation and kind. */
export function effectKey(operationId: string, kind: EffectKind): string {
  return `${operationId}:${kind}`;
}

export type ProviderAnswer = {
  outcome: 'succeeded' | 'rejected';
  providerId: string;
  responseJson: string;
};

export type ApplyOutcome = ProviderAnswer | { outcome: 'unknown' };

export type LookupOutcome =
  | ProviderAnswer
  | /** No provider record at all; ambiguous for an in-flight/unknown effect. */ { outcome: 'not_applied' }
  | /** The provider could not answer (transport/provider error). */ { outcome: 'unknown' };

export interface ExecutionProvider {
  /** Trusted adapter identity. Legacy test adapters default to fake. */
  readonly paymentProvider?: PaymentProvider;
  applyEffect(effectKey: string, kind: EffectKind, request: unknown): Promise<ApplyOutcome>;
  lookupEffect(effectKey: string): Promise<LookupOutcome>;
}

/** Simulated provider call budget. Fake calls resolve immediately; the real
 * provider gateway in the next unit enforces this against network I/O. */
export const PROVIDER_CALL_TIMEOUT_MS = 10_000;
