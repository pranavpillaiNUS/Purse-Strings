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

/**
 * Unit 5 additions. These methods power the buyer-approval flow (create an
 * AUTHORIZATION order, authorize it after PayPal's hosted buyer consent, and
 * read the authorization's status for reconciliation). They are narrow
 * neighbors of the unit-4 four-method contract, which is unchanged.
 */

export type CreateAuthorizationOrderInput = {
  requestId: string;
  invoiceId: string;
  expected: ExpectedMoney;
};

export type AuthorizeOrderInput = {
  orderId: string;
  requestId: string;
  expected: ExpectedMoney;
};

export type GetAuthorizationInput = {
  authorizationId: string;
  expected: ExpectedMoney;
};

/** Only statuses PayPal documents for an authorization resource. */
export const AUTHORIZATION_STATUSES = [
  'CREATED', 'CAPTURED', 'DENIED', 'EXPIRED', 'PARTIALLY_CAPTURED', 'PENDING', 'VOIDED',
] as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export type CreateOrderEvidence = { orderId: string; approvalUrl: string };
export type AuthorizeEvidence = { authorizationId: string };
export type AuthorizationStatusEvidence = {
  authorizationId: string;
  status: AuthorizationStatus;
  currency: 'SGD';
  amountMinor: number;
  /** Validated capture-link hint from the sandbox `rel: 'capture'` link only. */
  captureIdHint?: string;
};

export type CreateOrderOutcome =
  | { state: 'succeeded'; resource: CreateOrderEvidence }
  | { state: 'unknown'; reason: UnknownReason; resourceId?: string };

/**
 * `buyer_not_approved` is PayPal's documented ORDER_NOT_APPROVED failure for the
 * authorize call: surfaced distinctly because the receiver's action (wait for
 * the buyer) differs from every unknown reason. Never treated as evidence.
 */
export type AuthorizeOutcome =
  | { state: 'succeeded'; resource: AuthorizeEvidence }
  | { state: 'buyer_not_approved' }
  | { state: 'unknown'; reason: UnknownReason; resourceId?: string };

/**
 * Success here means "the read itself is verified": the resource parsed, its ID
 * matched, and its amount matches `expected`. It is verified resource FACT, not
 * a capture result — non-terminal authorization statuses (CREATED, PENDING) are
 * successful reads used for reconciliation classification.
 */
export type GetAuthorizationOutcome =
  | { state: 'succeeded'; resource: AuthorizationStatusEvidence }
  | { state: 'unknown'; reason: UnknownReason; resourceId?: string };

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

/** Canonical unknown outcome shape shared by every gateway method. */
export type GatewayUnknown = { state: 'unknown'; reason: UnknownReason; resourceId?: string };

/**
 * Canonical unknown either from a failing gate or from a caught client error.
 * Client PayPalApiError means PayPal answered (provider_error); everything else,
 * including timeouts and lost responses, is transport. Resource IDs are never invented;
 * a hint is only forwarded when it passes ID validation.
 */
function unknownOutcome(reason: 'provider_error' | 'transport'): GatewayUnknown;
function unknownOutcome(failure: Failure): GatewayUnknown;
function unknownOutcome(input: Failure | 'provider_error' | 'transport'): GatewayUnknown {
  if (input === 'provider_error' || input === 'transport') {
    return { state: 'unknown', reason: input } as GatewayUnknown;
  }
  const { kind, hint } = input as Failure;
  return { state: 'unknown', reason: kind, ...(hint !== undefined ? { resourceId: hint } : {}) } as GatewayUnknown;
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
function unknownFromError(error: unknown): GatewayUnknown {
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

  /**
   * Unit 5: the capture link HINT on an authorization read. Links are hints,
   * never evidence: the only requirement is that the `rel: 'capture'` link is
   * parseable, served from the exact sandbox API origin and shaped
   * /v2/payments/captures/{validated id}. The caller still verifies any capture
   * through the full unit-4 getCapture binding check before trusting it.
   */
  function captureLinkHint(resource: RawResource): string | undefined {
    for (const link of resource.links ?? []) {
      if (link?.rel !== 'capture' || typeof link.href !== 'string') continue;
      try {
        const url = new URL(link.href);
        if (url.origin !== SANDBOX_API_ORIGIN) continue;
        const match = /^\/v2\/payments\/captures\/([^/]+)$/.exec(url.pathname);
        if (!match) continue;
        const id = decodeURIComponent(match[1]!);
        if (RESOURCE_ID_PATTERN.test(id)) return id;
      } catch {
        // Unparseable hrefs are hints and never followed.
      }
    }
    return undefined;
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
  function relayFailure(failure: Failure, fallbackHint?: string): GatewayUnknown {
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

    /**
     * Unit 5: creates an AUTHORIZATION-intent order for the buyer-approval step.
     * The gateway never stores anything; the caller decides what to persist. The
     * approval URL is extracted only from a parseable `rel: 'approve'` https link
     * on a sandbox buyer-consent host (`www.sandbox.paypal.com` or
     * `*.sandbox.paypal.com` exactly); links are never fetched. POST
     * `/v2/checkout/orders` is the trusted authenticated endpoint; status must
     * be CREATED for an order that is ready for buyer approval, and the echoed
     * purchase_units amount and invoice_id must match the caller's input.
     */
    async createAuthorizationOrder(input: CreateAuthorizationOrderInput): Promise<CreateOrderOutcome> {
      validateInputObject(input, 'createAuthorizationOrder');
      const invoiceId = validateHeaderIdField(input.invoiceId, 'invoiceId');
      const requestId = validateHeaderIdField(input.requestId, 'requestId');
      const expected = validateExpected(input.expected, 'createAuthorizationOrder');
      const amount = paypalMoney('SGD', expected.amountMinor); // minor-unit to decimal at the edge

      try {
        const order = (await client.createOrder(
          {
            intent: 'AUTHORIZE',
            purchase_units: [{ amount, invoice_id: invoiceId }],
          },
          requestId,
        )) as RawResource;
        const hint = validIdHint(order.id);
        if (!hint) return unknownOutcome({ kind: 'invalid_response' });
        if (typeof order.status !== 'string') return unknownOutcome({ kind: 'invalid_response' });
        if (order.status !== 'CREATED') {
          return unknownOutcome({ kind: 'unconfirmed_status', hint });
        }
        // The echoed purchase unit must match the submitted money and invoice,
        // or the response does not describe the order that was asked for.
        const units = (order as { purchase_units?: unknown }).purchase_units;
        if (!Array.isArray(units) || units.length !== 1) {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        const unit = units[0] as { amount?: unknown; invoice_id?: unknown } | null;
        if (unit === null || typeof unit !== 'object') {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        const echoed = unit.amount as { currency_code?: unknown; value?: unknown } | null | undefined;
        if (echoed === null || typeof echoed !== 'object'
          || typeof echoed.currency_code !== 'string'
          || typeof echoed.value !== 'string') {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        let echoedMinor: number;
        try {
          echoedMinor = toMinor(echoed.value);
        } catch {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        if (echoed.currency_code !== expected.currency || echoedMinor !== expected.amountMinor
          || unit.invoice_id !== invoiceId) {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        const approvalUrls: string[] = [];
        for (const link of order.links ?? []) {
          if (link?.rel !== 'approve' || typeof link.href !== 'string') continue;
          try {
            const url = new URL(link.href);
            if (url.protocol !== 'https:') continue;
            const host = url.hostname;
            // Sandbox buyer consent only; a production checkout host is never accepted.
            if (host !== 'www.sandbox.paypal.com' && !host.endsWith('.sandbox.paypal.com')) continue;
            approvalUrls.push(link.href);
          } catch {
            // Unparseable links are never returned as the approval URL.
          }
        }
        // PayPal documents one approve link per order: multiple validated ones
        // (or none) are a malformed consent surface, not a wider choice.
        if (approvalUrls.length !== 1) return unknownOutcome({ kind: 'invalid_response' });
        return { state: 'succeeded', resource: { orderId: hint, approvalUrl: approvalUrls[0]! } };
      } catch (error) {
        return unknownFromError(error);
      }
    },

    /**
     * Unit 5: authorizes a buyer-approved order, minting the hold. The read-back
     * must carry exactly one validated authorization whose amount matches the
     * expected money, with the authorization's own status verified against the
     * documented vocabulary (a fresh CREATED mint succeeds; DENIED/VOIDED/
     * EXPIRED/PENDING and unmapped statuses never mint a hold record). An
     * order that PayPal says was not approved maps to the distinct
     * `buyer_not_approved` state, and every other failure to a plain unknown.
     * The POST `/authorize` endpoint is the trusted parent binding.
     */
    async authorizeOrder(input: AuthorizeOrderInput): Promise<AuthorizeOutcome> {
      validateInputObject(input, 'authorizeOrder');
      const orderId = validateIdField(input.orderId, 'orderId');
      const requestId = validateHeaderIdField(input.requestId, 'requestId');
      const expected = validateExpected(input.expected, 'authorizeOrder');

      try {
        const order = (await client.authorizeOrder(orderId, requestId)) as RawResource & {
          purchase_units?: unknown;
        };
        const hint = validIdHint(order.id);
        if (hint !== orderId) {
          return hint === undefined
            ? unknownOutcome({ kind: 'invalid_response' })
            : unknownOutcome({ kind: 'binding_unverified', hint });
        }
        if (typeof order.status !== 'string') return unknownOutcome({ kind: 'invalid_response' });
        if (order.status !== 'COMPLETED') {
          return unknownOutcome({ kind: 'unconfirmed_status', hint });
        }
        const units = order.purchase_units;
        if (!Array.isArray(units) || units.length !== 1) {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        const payments = (units[0] as { payments?: unknown } | null)?.payments;
        if (payments === null || typeof payments !== 'object') {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        const authorizations = (payments as { authorizations?: unknown }).authorizations;
        if (!Array.isArray(authorizations) || authorizations.length !== 1) {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        const authorization = authorizations[0] as RawResource;
        const authorizationId = validIdHint(authorization.id);
        if (authorizationId === undefined) return unknownOutcome({ kind: 'invalid_response' });
        // The minted hold must match the expected money, or the binding stays unverified.
        const mismatch = assessAmount(authorization, expected);
        if (mismatch) {
          return mismatch.kind === 'invalid_response'
            ? unknownOutcome({ kind: 'invalid_response' })
            : unknownOutcome({ kind: mismatch.kind, hint: authorizationId });
        }
        // The embedded authorization carries its own status: an unmapped or
        // missing one is a malformed body, and DENIED/VOIDED/EXPIRED/PENDING
        // (or any state other than a fresh mint) can never mint a hold record.
        if (typeof authorization.status !== 'string') {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        if (!(AUTHORIZATION_STATUSES as readonly string[]).includes(authorization.status)) {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        if (authorization.status !== 'CREATED') {
          return unknownOutcome({ kind: 'unconfirmed_status', hint: authorizationId });
        }
        return { state: 'succeeded', resource: { authorizationId } };
      } catch (error) {
        if (error instanceof PayPalApiError && error.issue === 'ORDER_NOT_APPROVED') {
          return { state: 'buyer_not_approved' };
        }
        return unknownFromError(error);
      }
    },

    /**
     * Unit 5: reads an authorization's durable status. `succeeded` is the
     * read-must-verify guarantee (ID + amount binding), not a capture verdict;
     * the caller classifies statuses (CAPTURED requires follow-up through the
     * full unit-4 getCapture binding check, using `captureIdHint` only as a
     * validated narrowing hint).
     */
    async getAuthorization(input: GetAuthorizationInput): Promise<GetAuthorizationOutcome> {
      validateInputObject(input, 'getAuthorization');
      const authorizationId = validateIdField(input.authorizationId, 'authorizationId');
      const expected = validateExpected(input.expected, 'getAuthorization');

      try {
        const authorization = (await client.getAuthorization(authorizationId)) as RawResource;
        const hint = validIdHint(authorization.id);
        if (!hint) return unknownOutcome({ kind: 'invalid_response' });
        if (hint !== authorizationId) {
          return unknownOutcome({ kind: 'binding_unverified', hint });
        }
        const mismatch = assessAmount(authorization, expected);
        if (mismatch) return relayFailure(mismatch, hint);
        if (typeof authorization.status !== 'string') {
          return unknownOutcome({ kind: 'invalid_response' });
        }
        if (!(AUTHORIZATION_STATUSES as readonly string[]).includes(authorization.status)) {
          return unknownOutcome({ kind: 'unconfirmed_status', hint });
        }
        const captureIdHint = captureLinkHint(authorization);
        return {
          state: 'succeeded',
          resource: {
            authorizationId: hint,
            status: authorization.status as AuthorizationStatus,
            currency: 'SGD',
            amountMinor: expected.amountMinor,
            ...(captureIdHint !== undefined ? { captureIdHint } : {}),
          },
        };
      } catch (error) {
        return unknownFromError(error);
      }
    },
  };
}

export type PayPalGateway = ReturnType<typeof createPayPalGateway>;
