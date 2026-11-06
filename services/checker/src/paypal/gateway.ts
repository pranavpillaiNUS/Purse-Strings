// Unit 4: the procurement-facing PayPal gateway over the sandbox REST client.
//
// Boundaries that must not drift:
// - This file is deliberately separate from services/checker/src/execution/gateway.ts
//   (the simulated provider seam). The execution worker and the CLI never import this
//   file, and this file never imports execution code.
// - It cannot resolve an authorization ID from an operation ID and has no
//   lookup-by-request-id path: the caller supplies the trusted, persisted resource
//   binding (authorization ID, capture ID, refund ID) on every call.
// - Sandbox only. Every request URL is built by the client from the sandbox base URL;
//   response `rel: 'up'` links are never followed and are only counted as parent
//   evidence when their origin is exactly the sandbox API origin.
// - Nothing in this unit has been verified against a real PayPal sandbox account:
//   every behavior claim comes from fetch-mocked contract tests.

import { paypalMoney, toMinor } from '../money.ts';
import { createPayPalClient, PayPalApiError, type PayPalExchange } from './client.ts';

/** Exact sandbox REST origin; any other scheme/host/origin in evidence is not parent evidence. */
const SANDBOX_API_ORIGIN = 'https://api-m.sandbox.paypal.com';

/** Bounded, nonempty identifier shape shared by resource IDs in responses. */
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Bounded, printable, space-free shape for caller-supplied invoice and request IDs. */
const HEADER_ID_PATTERN = /^[\x21-\x7E]{1,127}$/;
/** Same bounded money range the ledger storage enforces. */
export const MAX_AMOUNT_MINOR = 1_000_000_000;

export interface ExpectedMoney {
  currency: 'SGD';
  amountMinor: number;
}

/** Invalid caller input is rejected locally, before any fetch. */
export class GatewayInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayInputError';
  }
}

export type CaptureAuthorizationInput = {
  authorizationId: string;
  requestId: string;
  invoiceId: string;
  finalCapture: boolean;
  expected: ExpectedMoney;
};

export type GetCaptureInput = {
  captureId: string;
  authorizationId: string;
  invoiceId: string;
  expected: ExpectedMoney;
};

export type RefundCaptureInput = {
  captureId: string;
  requestId: string;
  expected: ExpectedMoney;
};

export type GetRefundInput = {
  refundId: string;
  captureId: string;
  expected: ExpectedMoney;
};

export type CaptureEvidence = {
  authorizationId: string;
  captureId: string;
  invoiceId: string;
  currency: 'SGD';
  amountMinor: number;
};

export type RefundEvidence = {
  captureId: string;
  refundId: string;
  currency: 'SGD';
  amountMinor: number;
};

export type UnknownReason =
  /** The request never got a complete response (network failure, timeout, lost response). */
  | 'transport'
  /** PayPal answered with a non-2xx HTTP status. */
  | 'provider_error'
  /** The body could not be parsed or lacked the fields evidence requires. */
  | 'invalid_response'
  /** The resource parsed but was not COMPLETED; it is never safe-release evidence. */
  | 'unconfirmed_status'
  /**
   * The resource completed but its binding to the caller's persisted expectation could
   * not be verified: missing parent evidence on a GET, recognized evidence that
   * contradicts the expected parent/identity, or a mismatched amount/currency/invoice/ID.
   * Evidence from this state is never treated as succeeded and never safe-releases.
   */
  | 'binding_unverified';

export type GatewayOutcome =
  | { state: 'succeeded'; resource: CaptureEvidence | RefundEvidence }
  | { state: 'unknown'; reason: UnknownReason; resourceId?: string };

export interface PayPalGatewayConfig {
  clientId: string;
  clientSecret: string;
  /** Injected fetch for tests; defaults to the platform fetch. */
  fetchFn?: typeof fetch;
  /** Finite per-call timeout forwarded to the client (OAuth and resources alike). */
  timeoutMs?: number;
  /** Passed through from the client to feed the spike/audit exchange log. */
  onExchange?: (exchange: PayPalExchange) => void;
}

// Minimal raw reads over a parsed response. The client's TypeScript interfaces describe
// well-formed PayPal bodies; the gateway must not trust them. Every field is re-checked
// at runtime and any shortfall becomes invalid_response or an unknown outcome.
type RawResource = {
  id?: unknown;
  status?: unknown;
  amount?: { currency_code?: unknown; value?: unknown };
  invoice_id?: unknown;
  supplementary_data?: { related_ids?: Record<string, unknown> };
  links?: Array<{ rel?: unknown; href?: unknown }>;
};

type Failure =
  | { kind: 'invalid_response'; hint?: undefined }
  | { kind: 'unconfirmed_status'; hint?: string }
  | { kind: 'binding_unverified'; hint?: string };

function validateIdField(value: unknown, label: string): string {
  if (typeof value !== 'string' || !RESOURCE_ID_PATTERN.test(value)) {
    throw new GatewayInputError(`${label} is not a bounded nonempty identifier`);
  }
  return value;
}

function validateHeaderIdField(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HEADER_ID_PATTERN.test(value)) {
    throw new GatewayInputError(`${label} is not a bounded, stable, nonempty identifier`);
  }
  return value;
}

/** Throws GatewayInputError instead of a raw TypeError when a caller passes
 * null or a non-object, so bad input stays inside the documented error class. */
function validateInputObject(input: unknown, label: string): void {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new GatewayInputError(`${label} input must be an object`);
  }
}

function validateExpected(value: unknown, label: string): ExpectedMoney {
  if (!value || typeof value !== 'object') {
    throw new GatewayInputError(`${label} expected money is missing`);
  }
  const money = value as ExpectedMoney;
  if (money.currency !== 'SGD') {
    throw new GatewayInputError(`Only SGD is accepted in procurement; got ${JSON.stringify(money.currency)}`);
  }
  if (!Number.isSafeInteger(money.amountMinor) || money.amountMinor < 1) {
    throw new GatewayInputError(`${label} amountMinor must be a positive integer`);
  }
  if (money.amountMinor > MAX_AMOUNT_MINOR) {
    throw new GatewayInputError(`${label} amountMinor exceeds ${MAX_AMOUNT_MINOR}`);
  }
  return money;
}

/**
 * Canonical unknown either from a failing gate or from a caught client error.
 * Client PayPalApiError means PayPal answered (provider_error); everything else,
 * including timeouts and lost responses, is transport. Resource IDs are never invented;
 * a hint is only forwarded when it passes ID validation.
 */
function unknownOutcome(reason: 'provider_error' | 'transport'): GatewayOutcome;
function unknownOutcome(failure: Failure): GatewayOutcome;
function unknownOutcome(input: Failure | 'provider_error' | 'transport'): GatewayOutcome {
  if (input === 'provider_error' || input === 'transport') {
    return { state: 'unknown', reason: input } as GatewayOutcome;
  }
  const { kind, hint } = input as Failure;
  return { state: 'unknown', reason: kind, ...(hint !== undefined ? { resourceId: hint } : {}) } as GatewayOutcome;
}

/**
 * Parent evidence from response fields only. Recognized channels are
 * supplementary_data.related_ids.<authorization_id|capture_id> and a `rel: 'up'` link
 * whose href parses to the exact sandbox API origin and a single-segment
 * /v2/payments/{authorizations|captures}/{encoded parent id} path. Links are never
 * fetched. Recognized mismatched evidence contradicts the binding even if another
 * channel agrees.
 */
function assessParentEvidence(
  resource: RawResource,
  pathKind: 'authorizations' | 'captures',
  expectedParentId: string,
): { matched: boolean; contradicted: boolean } {
  const relatedIds = resource.supplementary_data?.related_ids;
  const field = pathKind === 'authorizations' ? 'authorization_id' : 'capture_id';
  const expectedPath = `/v2/payments/${pathKind}/${encodeURIComponent(expectedParentId)}`;
  const parentPath = new RegExp(`^/v2/payments/${pathKind}/[^/]+$`);
  let matched = false;
  let contradicted = false;

  if (relatedIds && typeof relatedIds === 'object' && field in relatedIds) {
    const value = relatedIds[field];
    if (typeof value === 'string' && RESOURCE_ID_PATTERN.test(value)) {
      matched = matched || value === expectedParentId;
      contradicted = contradicted || value !== expectedParentId;
    }
  }
  for (const link of resource.links ?? []) {
    if (link?.rel !== 'up' || typeof link.href !== 'string') continue;
    try {
      const url = new URL(link.href);
      if (url.origin !== SANDBOX_API_ORIGIN) continue; // only sandbox-origin links count
      if (!parentPath.test(url.pathname)) continue; // unshaped paths are not parent evidence
      matched = matched || url.pathname === expectedPath;
      contradicted = contradicted || url.pathname !== expectedPath;
    } catch {
      // Unparseable hrefs are not recognized evidence and are never followed.
    }
  }
  return { matched, contradicted };
}

/** Maps client failures to unknown outcomes without ever inventing resource IDs. */
function unknownFromError(error: unknown): GatewayOutcome {
  if (error instanceof GatewayInputError) throw error; // local validation must surface
  return unknownOutcome(error instanceof PayPalApiError ? 'provider_error' : 'transport');
}

export function createPayPalGateway(config: PayPalGatewayConfig) {
  // Sandbox enforcement: the client is only given the sandbox environment, so no other
  // host can ever be addressed by these methods.
  const client = createPayPalClient({
    environment: 'sandbox',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    fetchFn: config.fetchFn,
    timeoutMs: config.timeoutMs,
    onExchange: config.onExchange,
  });

  function validIdHint(id: unknown): string | undefined {
    return typeof id === 'string' && RESOURCE_ID_PATTERN.test(id) ? id : undefined;
  }

  /** Exact SGD/minor amount check; missing or malformed amounts are invalid_response. */
  function assessAmount(resource: RawResource, expected: ExpectedMoney): Failure | undefined {
    const amount = resource.amount;
    if (!amount || typeof amount !== 'object') return { kind: 'invalid_response' };
    const { currency_code: currency, value } = amount;
    if (typeof currency !== 'string' || typeof value !== 'string') {
      return { kind: 'invalid_response' };
    }
    let minor: number;
    try {
      minor = toMinor(value);
    } catch {
      return { kind: 'invalid_response' };
    }
    if (currency !== 'SGD' || minor !== expected.amountMinor) {
      return { kind: 'binding_unverified', hint: validIdHint(resource.id) };
    }
    return undefined;
  }

  /** COMPLETED-only gate; every other provider status is unknown, never safe-release evidence. */
  function assessCompletion(resource: RawResource): Failure | undefined {
    if (typeof resource.status !== 'string') return { kind: 'invalid_response' };
    if (resource.status === 'COMPLETED') return undefined;
    return { kind: 'unconfirmed_status' };
  }

  /** First failure wins; resources with a parsed status carry an unknown-outcome hint. */
  function relayFailure(failure: Failure, fallbackHint?: string): GatewayOutcome {
    switch (failure.kind) {
      case 'binding_unverified':
        return unknownOutcome({ kind: failure.kind, hint: failure.hint ?? fallbackHint });
      case 'unconfirmed_status':
        return unknownOutcome({ kind: failure.kind, hint: failure.hint ?? fallbackHint });
      case 'invalid_response':
        return unknownOutcome({ kind: failure.kind, hint: undefined });
    }
  }

  return {
    /**
     * Captures against an authorization the ledger already bound. The POST endpoint is
     * the trusted parent binding; response parent evidence is only checked for
     * contradiction, never required on a write.
     */
    async captureAuthorization(input: CaptureAuthorizationInput): Promise<GatewayOutcome> {
      validateInputObject(input, 'captureAuthorization');
      if (typeof input.finalCapture !== 'boolean') {
        throw new GatewayInputError('finalCapture must be a boolean');
      }
      const authorizationId = validateIdField(input.authorizationId, 'authorizationId');
      const invoiceId = validateHeaderIdField(input.invoiceId, 'invoiceId');
      const requestId = validateHeaderIdField(input.requestId, 'requestId');
      const expected = validateExpected(input.expected, 'captureAuthorization');
      const amount = paypalMoney('SGD', expected.amountMinor); // minor-unit to decimal at the edge

      try {
        const capture = (await client.captureAuthorization(
          authorizationId,
          { amount, finalCapture: input.finalCapture, invoiceId },
          requestId,
        )) as RawResource;
        const hint = validIdHint(capture.id);
        if (!hint) return unknownOutcome({ kind: 'invalid_response' });
        for (const failure of [assessCompletion(capture), assessAmount(capture, expected)]) {
          if (failure) return relayFailure(failure, hint);
        }
        if (typeof capture.invoice_id !== 'string') {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        if (capture.invoice_id !== invoiceId) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        const parent = assessParentEvidence(capture, 'authorizations', authorizationId);
        if (parent.contradicted) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        return {
          state: 'succeeded',
          resource: { authorizationId, captureId: hint, invoiceId, currency: 'SGD', amountMinor: expected.amountMinor },
        };
      } catch (error) {
        return unknownFromError(error);
      }
    },

    /**
     * Re-reads a capture. Success additionally requires the read-back ID to equal the
     * requested capture ID and read-side parent evidence to verify the authorization:
     * a GET's binding can only come from response evidence.
     */
    async getCapture(input: GetCaptureInput): Promise<GatewayOutcome> {
      validateInputObject(input, 'getCapture');
      const captureId = validateIdField(input.captureId, 'captureId');
      const authorizationId = validateIdField(input.authorizationId, 'authorizationId');
      validateHeaderIdField(input.invoiceId, 'invoiceId');
      const expected = validateExpected(input.expected, 'getCapture');

      try {
        const capture = (await client.getCapture(captureId)) as RawResource;
        const hint = validIdHint(capture.id);
        if (!hint) return unknownOutcome({ kind: 'invalid_response' });
        if (hint !== captureId) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        for (const failure of [assessCompletion(capture), assessAmount(capture, expected)]) {
          if (failure) return relayFailure(failure, hint);
        }
        if (typeof capture.invoice_id !== 'string') {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        if (capture.invoice_id !== input.invoiceId) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        const parent = assessParentEvidence(capture, 'authorizations', authorizationId);
        if (parent.contradicted || !parent.matched) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        return {
          state: 'succeeded',
          resource: { authorizationId, captureId: hint, invoiceId: input.invoiceId, currency: 'SGD', amountMinor: expected.amountMinor },
        };
      } catch (error) {
        return unknownFromError(error);
      }
    },

    /** Refunds a capture the ledger already bound; request ID is required and forwarded unchanged. */
    async refundCapture(input: RefundCaptureInput): Promise<GatewayOutcome> {
      validateInputObject(input, 'refundCapture');
      const captureId = validateIdField(input.captureId, 'captureId');
      const requestId = validateHeaderIdField(input.requestId, 'requestId');
      const expected = validateExpected(input.expected, 'refundCapture');
      const amount = paypalMoney('SGD', expected.amountMinor);

      try {
        const refund = (await client.refundCapture(captureId, amount, requestId)) as RawResource;
        const hint = validIdHint(refund.id);
        if (!hint) return unknownOutcome({ kind: 'invalid_response' });
        for (const failure of [assessCompletion(refund), assessAmount(refund, expected)]) {
          if (failure) return relayFailure(failure, hint);
        }
        const parent = assessParentEvidence(refund, 'captures', captureId);
        if (parent.contradicted) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        return {
          state: 'succeeded',
          resource: { captureId, refundId: hint, currency: 'SGD', amountMinor: expected.amountMinor },
        };
      } catch (error) {
        return unknownFromError(error);
      }
    },

    /** Re-reads a refund. Success requires response-side parent evidence naming the capture. */
    async getRefund(input: GetRefundInput): Promise<GatewayOutcome> {
      validateInputObject(input, 'getRefund');
      const refundId = validateIdField(input.refundId, 'refundId');
      const captureId = validateIdField(input.captureId, 'captureId');
      const expected = validateExpected(input.expected, 'getRefund');

      try {
        const refund = (await client.getRefund(refundId)) as RawResource;
        const hint = validIdHint(refund.id);
        if (!hint) return unknownOutcome({ kind: 'invalid_response' });
        if (hint !== refundId) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        for (const failure of [assessCompletion(refund), assessAmount(refund, expected)]) {
          if (failure) return relayFailure(failure, hint);
        }
        const parent = assessParentEvidence(refund, 'captures', captureId);
        if (parent.contradicted || !parent.matched) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        return {
          state: 'succeeded',
          resource: { captureId, refundId: hint, currency: 'SGD', amountMinor: expected.amountMinor },
        };
      } catch (error) {
        return unknownFromError(error);
      }
    },
  };
}

export type PayPalGateway = ReturnType<typeof createPayPalGateway>;
