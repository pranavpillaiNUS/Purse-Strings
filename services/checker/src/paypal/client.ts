// Minimal PayPal REST client for the checker: Orders v2 (create, authorize) and
// Payments v2 (capture, void, reauthorize, refund). Sandbox only until we decide otherwise.
//
// Every POST takes a caller-supplied PayPal-Request-Id. Callers derive it from something
// stable (e.g. the cart ID) so a retried capture can never become a second capture.

import type { PayPalMoney } from '../money.ts';

const BASE_URLS = {
  sandbox: 'https://api-m.sandbox.paypal.com',
} as const;

export type PayPalEnvironment = keyof typeof BASE_URLS;

export interface PayPalExchange {
  at: string;
  method: string;
  path: string;
  requestId?: string;
  requestBody?: unknown;
  status: number;
  debugId?: string;
  responseBody?: unknown;
  durationMs: number;
}

export interface PayPalConfig {
  environment: PayPalEnvironment;
  clientId: string;
  clientSecret: string;
  /** Called after every API call (not token fetches); feeds spike logs now, the audit log later. */
  onExchange?: (exchange: PayPalExchange) => void;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface Authorization {
  id: string;
  status: string;
  amount: PayPalMoney;
  create_time?: string;
  expiration_time?: string;
  status_details?: { reason: string };
  links?: PayPalLink[];
}

export interface Capture {
  id: string;
  status: string;
  amount: PayPalMoney;
  final_capture?: boolean;
  invoice_id?: string;
  create_time?: string;
  status_details?: { reason: string };
  seller_receivable_breakdown?: {
    gross_amount: PayPalMoney;
    paypal_fee?: PayPalMoney;
    net_amount?: PayPalMoney;
  };
}

export interface Refund {
  id: string;
  status: string;
  amount: PayPalMoney;
  status_details?: { reason: string };
}

export interface Order {
  id: string;
  status: string;
  intent?: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    reference_id?: string;
    amount?: PayPalMoney;
    payments?: { authorizations?: Authorization[]; captures?: Capture[] };
  }>;
}

export interface CaptureParams {
  amount: PayPalMoney;
  finalCapture: boolean;
  invoiceId: string;
  noteToPayer?: string;
}

interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: Array<{ issue?: string; description?: string }>;
  error?: string;
  error_description?: string;
}

export class PayPalApiError extends Error {
  readonly status: number;
  /** The specific issue code, e.g. MAX_CAPTURE_AMOUNT_EXCEEDED; falls back to the error name. */
  readonly issue: string | undefined;
  readonly debugId: string | undefined;
  readonly body: unknown;

  constructor(status: number, body: unknown, debugId: string | undefined) {
    const err = (body ?? {}) as PayPalErrorBody;
    const issue = err.details?.[0]?.issue ?? err.name ?? err.error;
    const description = err.details?.[0]?.description ?? err.message ?? err.error_description;
    super(`PayPal ${status}${issue ? ` ${issue}` : ''}${description ? `: ${description}` : ''}`);
    this.name = 'PayPalApiError';
    this.status = status;
    this.issue = issue;
    this.debugId = debugId ?? err.debug_id;
    this.body = body;
  }
}

export function createPayPalClient(config: PayPalConfig) {
  const baseUrl = BASE_URLS[config.environment];
  let token: { value: string; expiresAt: number } | undefined;

  async function accessToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt) return token.value;
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const body = (await res.json().catch(() => undefined)) as
      | { access_token: string; expires_in: number }
      | undefined;
    if (!res.ok || !body?.access_token) {
      throw new PayPalApiError(res.status, body, res.headers.get('paypal-debug-id') ?? undefined);
    }
    // Refresh a minute early so a long-running process never sends an expired token.
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return token.value;
  }

  async function call<T>(method: 'GET' | 'POST', path: string, requestId?: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await accessToken()}`,
      Prefer: 'return=representation',
    };
    if (method === 'POST') headers['Content-Type'] = 'application/json';
    if (requestId) headers['PayPal-Request-Id'] = requestId;

    const started = Date.now();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
    const text = await res.text();
    let responseBody: unknown;
    try {
      responseBody = text ? JSON.parse(text) : undefined;
    } catch {
      responseBody = text;
    }
    const debugId = res.headers.get('paypal-debug-id') ?? undefined;

    config.onExchange?.({
      at: new Date(started).toISOString(),
      method,
      path,
      requestId,
      requestBody: body,
      status: res.status,
      debugId,
      responseBody,
      durationMs: Date.now() - started,
    });

    if (!res.ok) throw new PayPalApiError(res.status, responseBody, debugId);
    return responseBody as T;
  }

  return {
    createOrder: (order: unknown, requestId: string) =>
      call<Order>('POST', '/v2/checkout/orders', requestId, order),

    getOrder: (orderId: string) =>
      call<Order>('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`),

    authorizeOrder: (orderId: string, requestId: string) =>
      call<Order>('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, requestId, {}),

    getAuthorization: (authorizationId: string) =>
      call<Authorization>('GET', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`),

    captureAuthorization: (authorizationId: string, params: CaptureParams, requestId: string) =>
      call<Capture>('POST', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, requestId, {
        amount: params.amount,
        final_capture: params.finalCapture,
        invoice_id: params.invoiceId,
        ...(params.noteToPayer ? { note_to_payer: params.noteToPayer } : {}),
      }),

    /** Only allowed from day 4 to day 29 of the original authorization; returns a NEW authorization. */
    reauthorizeAuthorization: (authorizationId: string, amount: PayPalMoney, requestId: string) =>
      call<Authorization>(
        'POST',
        `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/reauthorize`,
        requestId,
        { amount },
      ),

    voidAuthorization: (authorizationId: string, requestId: string) =>
      call<Authorization | undefined>(
        'POST',
        `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
        requestId,
      ),

    getCapture: (captureId: string) =>
      call<Capture>('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`),

    refundCapture: (captureId: string, amount: PayPalMoney, requestId: string, noteToPayer?: string) =>
      call<Refund>('POST', `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, requestId, {
        amount,
        ...(noteToPayer ? { note_to_payer: noteToPayer } : {}),
      }),
  };
}

export type PayPalClient = ReturnType<typeof createPayPalClient>;
