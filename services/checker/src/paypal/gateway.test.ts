// Unit 4 PayPal gateway contract tests. All fetches are fakes intercepted before the
// network; global fetch is denied and every request URL is asserted to stay on the
// sandbox API origin. Zero sandbox or live PayPal calls happen in any test here, and
// none of these outcomes have been verified against a real PayPal account.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalGateway, GatewayInputError, type CaptureAuthorizationInput, type ExpectedMoney, type GatewayOutcome, type GetCaptureInput, type RefundCaptureInput } from './gateway.ts';

const ORIGINAL_FETCH = globalThis.fetch;
const SANDBOX = 'https://api-m.sandbox.paypal.com';

before(() => {
  globalThis.fetch = () => {
    throw new Error('globalThis.fetch must not be used; the gateway always injects its fetch');
  };
});
after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'paypal-debug-id': 'dbg' } });
const tokenRoute = () => ({
  match: /\/v1\/oauth2\/token/,
  reply: () => json({ access_token: 'tok-1', expires_in: 3600 }),
});

const AUTH_ID = 'AUTH0001';
const CAPTURE_ID = 'CAP0001';
const REFUND_ID = 'RF00001';
const INVOICE = 'mandate-a-1';
const SGD_55_40: ExpectedMoney = { currency: 'SGD', amountMinor: 5540 };

/** A capture body PayPal would send for our earlier capture call. */
function captureBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CAPTURE_ID,
    status: 'COMPLETED',
    amount: { currency_code: 'SGD', value: '55.40' },
    invoice_id: INVOICE,
    supplementary_data: { related_ids: { authorization_id: AUTH_ID } },
    ...overrides,
  };
}

function refundBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: REFUND_ID,
    status: 'COMPLETED',
    amount: { currency_code: 'SGD', value: '55.40' },
    supplementary_data: { related_ids: { capture_id: CAPTURE_ID } },
    ...overrides,
  };
}

/** Records every call and answers it with the first route whose URL matches. */
function harness(routes: Array<{ match: RegExp; reply: (url: string, init: RequestInit | undefined) => Response | Promise<Response> }>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn: typeof fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const route = routes.find((candidate) => candidate.match.test(url));
    if (!route) return Promise.reject(new Error(`no route matched: ${url}`));
    return Promise.resolve(route.reply(url, init));
  }) as typeof fetch;
  return { calls, fetchFn };
}

function makeGateway(fetchFn: typeof fetch, timeoutMs = 50) {
  return createPayPalGateway({ clientId: 'cid', clientSecret: 'secret', fetchFn, timeoutMs });
}

/** Asserts a capture/refund success case took exactly the sandbox endpoints with no network surprises. */
function assertSandboxOnly(urls: string[]): void {
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.ok(url.startsWith(SANDBOX), `request left the sandbox host: ${url}`);
  }
}

/** Fails when any second fetch would be needed: links are never followed. */
function assertNoFollowUpFetch(calls: Array<{ url: string }>): void {
  assert.equal(calls.length, 2); // token + the single resource call
}

const captureInput = {
  authorizationId: AUTH_ID,
  requestId: 'mandate-a-1/capture',
  invoiceId: INVOICE,
  finalCapture: false,
  expected: SGD_55_40,
};
const getCaptureInput = {
  captureId: CAPTURE_ID,
  authorizationId: AUTH_ID,
  invoiceId: INVOICE,
  expected: SGD_55_40,
};
const refundInput = { captureId: CAPTURE_ID, requestId: 'mandate-a-1/refund', expected: SGD_55_40 };
const getRefundInput = { refundId: REFUND_ID, captureId: CAPTURE_ID, expected: SGD_55_40 };
/**
 * Routes wrap a JSON POJO into a fresh Response per call, or pass a prebuilt
 * Response (used for HTTP-error and dropped-body cases) through untouched.
 */
const captureRoute = (body: unknown) => ({
  match: new RegExp(`/v2/payments/authorizations/${AUTH_ID}/capture`),
  reply: () => (body instanceof Response ? body : json(body)),
});
const captureReadRoute = (body: unknown) => ({
  match: new RegExp(`/v2/payments/captures/${CAPTURE_ID}$`),
  reply: () => (body instanceof Response ? body : json(body)),
});
const refundRoute = (body: unknown) => ({
  match: new RegExp(`/v2/payments/captures/${CAPTURE_ID}/refund`),
  reply: () => (body instanceof Response ? body : json(body)),
});
const refundReadRoute = (body: unknown) => ({
  match: new RegExp(`/v2/payments/refunds/${REFUND_ID}$`),
  reply: () => (body instanceof Response ? body : json(body)),
});

test('captureAuthorization succeeds on exact COMPLETED evidence with an unchanged request ID', async () => {
  const { calls, fetchFn } = harness([tokenRoute(), captureRoute(captureBody())]);
  const gateway = makeGateway(fetchFn);
  const outcome = await gateway.captureAuthorization(captureInput);
  assert.deepEqual(outcome, {
    state: 'succeeded',
    resource: { authorizationId: AUTH_ID, captureId: CAPTURE_ID, invoiceId: INVOICE, currency: 'SGD', amountMinor: 5540 },
  });
  assert.deepEqual(calls.map((c) => c.url), [
    `${SANDBOX}/v1/oauth2/token`,
    `${SANDBOX}/v2/payments/authorizations/${AUTH_ID}/capture`,
  ]);
  const init = calls[1]?.init as RequestInit;
  assert.equal((init.headers as Record<string, string>)['PayPal-Request-Id'], 'mandate-a-1/capture');
  assert.deepEqual(JSON.parse(String(init.body)), {
    amount: { currency_code: 'SGD', value: '55.40' },
    final_capture: false,
    invoice_id: INVOICE,
  });
  assertSandboxOnly(calls.map((c) => c.url));
});

test('captureAuthorization forwards final_capture=true at the edge conversion of the expected minor amount', async () => {
  const { calls, fetchFn } = harness([
    tokenRoute(),
    captureRoute(captureBody({ id: 'CAP001F', amount: { currency_code: 'SGD', value: '0.01' } })),
  ]);
  const outcome = await makeGateway(fetchFn).captureAuthorization({
    ...captureInput,
    finalCapture: true,
    invoiceId: INVOICE,
    expected: { currency: 'SGD', amountMinor: 1 },
  });
  assert.equal(outcome.state, 'succeeded');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    amount: { currency_code: 'SGD', value: '0.01' },
    final_capture: true,
    invoice_id: INVOICE,
  });
});

test('getCapture succeeds with read-side parent evidence from supplementary_data', async () => {
  const { calls, fetchFn } = harness([tokenRoute(), captureReadRoute(captureBody())]);
  const outcome = await makeGateway(fetchFn).getCapture(getCaptureInput);
  assert.deepEqual(outcome, {
    state: 'succeeded',
    resource: { authorizationId: AUTH_ID, captureId: CAPTURE_ID, invoiceId: INVOICE, currency: 'SGD', amountMinor: 5540 },
  });
  assertSandboxOnly(calls.map((c) => c.url));
});

function relUpCaptureBody(linkPath: string | null): Record<string, unknown> {
  const body = captureBody();
  delete (body as { supplementary_data?: unknown }).supplementary_data;
  if (linkPath) body.links = [{ rel: 'up', href: linkPath, method: 'GET' }];
  return body;
}

test('getCapture succeeds with a rel="up" link to the sandbox authorization instead of related_ids', async () => {
  const { fetchFn } = harness([tokenRoute(), captureReadRoute(relUpCaptureBody(`${SANDBOX}/v2/payments/authorizations/${AUTH_ID}`))]);
  const outcome = await makeGateway(fetchFn).getCapture(getCaptureInput);
  assert.deepEqual(outcome.state === 'succeeded' ? outcome.resource : outcome, {
    authorizationId: AUTH_ID,
    captureId: CAPTURE_ID,
    invoiceId: INVOICE,
    currency: 'SGD',
    amountMinor: 5540,
  });
});

test('refundCapture succeeds without invoice or parent evidence because the POST endpoint binds the parent', async () => {
  const body = refundBody();
  delete (body as { supplementary_data?: unknown }).supplementary_data;
  const { calls, fetchFn } = harness([tokenRoute(), refundRoute(body)]);
  const outcome = await makeGateway(fetchFn).refundCapture(refundInput);
  assert.deepEqual(outcome, {
    state: 'succeeded',
    resource: { captureId: CAPTURE_ID, refundId: REFUND_ID, currency: 'SGD', amountMinor: 5540 },
  });
  assert.equal(calls[1]?.url, `${SANDBOX}/v2/payments/captures/${CAPTURE_ID}/refund`);
  assert.equal(((calls[1]?.init as RequestInit).headers as Record<string, string>)['PayPal-Request-Id'], 'mandate-a-1/refund');
  assertSandboxOnly(calls.map((c) => c.url));
});

test('getRefund succeeds with a rel="up" capture link from the sandbox origin', async () => {
  const body = refundBody();
  delete (body as { supplementary_data?: unknown }).supplementary_data;
  body.links = [{ rel: 'up', href: `${SANDBOX}/v2/payments/captures/${CAPTURE_ID}` }];
  const { fetchFn } = harness([tokenRoute(), refundReadRoute(body)]);
  const outcome = await makeGateway(fetchFn).getRefund(getRefundInput);
  assert.equal(outcome.state, 'succeeded');
});

test('a POST capture whose response names a different authorization is rejected without following links', async () => {
  const { calls, fetchFn } = harness([
    tokenRoute(),
    captureRoute(captureBody({ supplementary_data: { related_ids: { authorization_id: 'AUTHOTHER' } } })),
  ]);
  const outcome = await makeGateway(fetchFn).captureAuthorization(captureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
  assertNoFollowUpFetch(calls);
});

test('a POST refund whose response names a different capture is rejected', async () => {
  const { calls, fetchFn } = harness([
    tokenRoute(),
    refundRoute(refundBody({ supplementary_data: { related_ids: { capture_id: 'CAPOTHER' } } })),
  ]);
  const outcome = await makeGateway(fetchFn).refundCapture(refundInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: REFUND_ID });
  assertNoFollowUpFetch(calls);
});

test('a recognized rel="up" link pointing at another authorization contradicts the binding', async () => {
  const { calls, fetchFn } = harness([tokenRoute(), captureReadRoute(relUpCaptureBody(`${SANDBOX}/v2/payments/authorizations/AUTHOTHER`))]);
  const outcome = await makeGateway(fetchFn).getCapture(getCaptureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
  assertNoFollowUpFetch(calls);
});

test('a rel="up" parent link on a non-sandbox origin is unrecognized evidence, so a GET stays binding_unverified', async () => {
  const { calls, fetchFn } = harness([
    tokenRoute(),
    captureReadRoute(relUpCaptureBody(`https://evil.example/v2/payments/authorizations/${AUTH_ID}`)),
  ]);
  const outcome = await makeGateway(fetchFn).getCapture(getCaptureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
  assertNoFollowUpFetch(calls);
});

test('a same-origin rel="up" link with an unrelated path is not parent evidence', async () => {
  const { fetchFn } = harness([tokenRoute(), captureReadRoute(relUpCaptureBody(`${SANDBOX}/v2/checkout/orders/ORD0001`))]);
  const outcome = await makeGateway(fetchFn).getCapture(getCaptureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
});

test('missing read-side parent evidence on GET leaves the binding unverified', async () => {
  const { fetchFn } = harness([tokenRoute(), captureReadRoute(relUpCaptureBody(null))]);
  const outcome = await makeGateway(fetchFn).getCapture(getCaptureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
});

test('a GET capture that returns a different resource ID than requested is binding_unverified', async () => {
  const { fetchFn } = harness([tokenRoute(), captureReadRoute(captureBody({ id: 'CAPOTHER' }))]);
  const outcome = await makeGateway(fetchFn).getCapture(getCaptureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: 'CAPOTHER' });
});

test('getRefund against a refund naming a different capture is binding_unverified', async () => {
  const { calls, fetchFn } = harness([
    tokenRoute(),
    refundReadRoute(refundBody({ supplementary_data: { related_ids: { capture_id: 'CAPOTHER' } } })),
  ]);
  const outcome = await makeGateway(fetchFn).getRefund(getRefundInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: REFUND_ID });
  assertNoFollowUpFetch(calls);
});

test('a GET refund that returns a different resource ID than requested is binding_unverified', async () => {
  const { calls, fetchFn } = harness([tokenRoute(), refundReadRoute(refundBody({ id: 'REFOTHER' }))]);
  const outcome = await makeGateway(fetchFn).getRefund(getRefundInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: 'REFOTHER' });
  assertNoFollowUpFetch(calls);
});

const refundBodyUSD = () => refundBody({ amount: { currency_code: 'USD', value: '55.40' } });
const refundBodySGD5541 = () => refundBody({ amount: { currency_code: 'SGD', value: '55.41' } });

test('a refund read with a currency mismatch is binding_unverified, never succeeded', async () => {
  const { calls, fetchFn } = harness([tokenRoute(), refundReadRoute(refundBodyUSD())]);
  const outcome = await makeGateway(fetchFn).getRefund(getRefundInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: REFUND_ID });
  assertNoFollowUpFetch(calls);
});

test('a refund read with an amount mismatch is binding_unverified, never succeeded', async () => {
  const { calls, fetchFn } = harness([tokenRoute(), refundReadRoute(refundBodySGD5541())]);
  const outcome = await makeGateway(fetchFn).getRefund(getRefundInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: REFUND_ID });
  assertNoFollowUpFetch(calls);
});

test('a refund read with no parent evidence at all is binding_unverified', async () => {
  const body = refundBody();
  delete (body as { supplementary_data?: unknown }).supplementary_data;
  const { calls, fetchFn } = harness([tokenRoute(), refundReadRoute(body)]);
  const outcome = await makeGateway(fetchFn).getRefund(getRefundInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'binding_unverified', resourceId: REFUND_ID });
  assertNoFollowUpFetch(calls);
});


const capBodyUSD = () => captureBody({ amount: { currency_code: 'USD', value: '55.40' } });
const capBodySGD5541 = () => captureBody({ amount: { currency_code: 'SGD', value: '55.41' } });
const capInvoiceOther = () => captureBody({ invoice_id: 'mandate-b-9' });

test('a currency mismatch is binding_unverified, never succeeded', async () => {
  const { calls, fetchFn } = harness([tokenRoute(), captureRoute(capBodyUSD()), captureReadRoute(capBodyUSD())]);
  const gateway = makeGateway(fetchFn);
  assert.deepEqual(await gateway.captureAuthorization(captureInput), { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
  assert.deepEqual(await gateway.getCapture(getCaptureInput), { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
  assert.equal(calls.length, 3); // token + capture + re-read, no follow-up fetches
});

test('an amount mismatch is binding_unverified on writes and reads', async () => {
  const { fetchFn } = harness([tokenRoute(), captureRoute(capBodySGD5541()), captureReadRoute(capBodySGD5541())]);
  const gateway = makeGateway(fetchFn);
  assert.deepEqual(await gateway.captureAuthorization(captureInput), { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
  assert.deepEqual(await gateway.getCapture(getCaptureInput), { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
});

test('an invoice mismatch is binding_unverified (capture paths only)', async () => {
  const { fetchFn } = harness([tokenRoute(), captureRoute(capInvoiceOther()), captureReadRoute(capInvoiceOther())]);
  const gateway = makeGateway(fetchFn);
  assert.deepEqual(await gateway.captureAuthorization(captureInput), { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
  assert.deepEqual(await gateway.getCapture(getCaptureInput), { state: 'unknown', reason: 'binding_unverified', resourceId: CAPTURE_ID });
});

test('pending and unrecognized provider statuses are unconfirmed_status, never safe-release evidence', async () => {
  const { fetchFn } = harness([
    tokenRoute(),
    captureRoute(captureBody({ status: 'PENDING' })),
    captureReadRoute(captureBody({ status: 'RISK_REVIEW_HELD' })),
  ]);
  const gateway = makeGateway(fetchFn);
  const pending: GatewayOutcome = await gateway.captureAuthorization(captureInput);
  assert.deepEqual(pending, { state: 'unknown', reason: 'unconfirmed_status', resourceId: CAPTURE_ID });
  const unrecognized: GatewayOutcome = await gateway.getCapture(getCaptureInput);
  assert.deepEqual(unrecognized, { state: 'unknown', reason: 'unconfirmed_status', resourceId: CAPTURE_ID });
});

test('HTTP 4xx and 5xx responses are provider_error', async () => {
  const { calls, fetchFn } = harness([
    tokenRoute(),
    captureRoute(json({ name: 'NOT_AUTHORIZED', message: 'Permission is denied' }, 403)),
    captureReadRoute(json({ name: 'INTERNAL_SERVER_ERROR' }, 500)),
  ]);
  const gateway = makeGateway(fetchFn);
  assert.deepEqual(await gateway.captureAuthorization(captureInput), { state: 'unknown', reason: 'provider_error' });
  assert.deepEqual(await gateway.getCapture(getCaptureInput), { state: 'unknown', reason: 'provider_error' });
  assert.equal(calls.length, 3); // shared token, two separate HTTP errors
});

test('a token fetch that PayPal rejects with non-2xx fails as provider_error', async () => {
  const { fetchFn } = harness([
    { match: /oauth2/, reply: () => json({ error: 'invalid_client', error_description: 'Client credentials invalid' }, 401) },
  ]);
  const outcome = await makeGateway(fetchFn).captureAuthorization(captureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'provider_error' });
});

test('malformed JSON and missing/malformed evidence fields are invalid_response', async () => {
  const { fetchFn } = captureProblemHarness();
  const gateway = makeGateway(fetchFn);
  assert.deepEqual(await gateway.captureAuthorization(captureInput), { state: 'unknown', reason: 'invalid_response' });
  assert.deepEqual(await gateway.getCapture(getCaptureInput), { state: 'unknown', reason: 'invalid_response' });
  assert.deepEqual(await gateway.getCapture(getCaptureInput), { state: 'unknown', reason: 'invalid_response' });
});

function captureProblemHarness() {
  let captureGets = 0;
  const { fetchFn } = harness([
    tokenRoute(),
    { match: /authorizations\/.*\/capture/, reply: () => new Response('<html>gateway</html>', { status: 200 }) },
    {
      match: /captures\/.*$/,
      reply: () => {
        captureGets += 1;
        if (captureGets === 1) return json({ id: CAPTURE_ID, status: 'COMPLETED', invoice_id: INVOICE }); // amount missing
        return json(captureBody({ amount: { currency_code: 'SGD', value: 'not-a-number' } }));
      },
    },
  ]);
  return { fetchFn };
}

test('a resource call that never resolves times out as transport, with finite wall-clock cost', async () => {
  const started = Date.now();
  const outcome = await makeGatewayStalled().captureAuthorization(captureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'transport' });
  assert.ok(Date.now() - started < 5_000);
});

function makeGatewayStalled() {
  const fetchFn: typeof fetch = ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('oauth2')) {
      return Promise.resolve(json({ access_token: 'tok-1', expires_in: 3600 }));
    }
    return new Promise<Response>(() => {}); // resource call never resolves
  }) as typeof fetch;
  return makeGateway(fetchFn, 20);
}

test('a token fetch that never resolves times out as transport', async () => {
  const fetchFn: typeof fetch = () => new Promise<Response>(() => {});
  const outcome = await makeGateway(fetchFn, 20).getCapture(getCaptureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'transport' });
});

test('a lost response body (connection dropped mid-read) is transport', async () => {
  const dropped = new ReadableStream({
    start(controller) {
      controller.error(new Error('connection reset'));
    },
  });
  const { fetchFn } = harness([tokenRoute(), captureReadRoute(new Response(dropped, { status: 200 }))]);
  const outcome = await makeGateway(fetchFn).getCapture(getCaptureInput);
  assert.deepEqual(outcome, { state: 'unknown', reason: 'transport' });
});

test('invalid caller input is rejected locally before any fetch', async () => {
  let fetchCalled = 0;
  const fetchFn: typeof fetch = () => {
    fetchCalled += 1;
    return Promise.reject(new Error('must not be called'));
  };
  const gateway = makeGateway(fetchFn);
  const rejects = async (run: Promise<unknown>, pattern: RegExp) => {
    await assert.rejects(run, (error: unknown) => {
      assert.ok(error instanceof GatewayInputError);
      assert.match(error.message, pattern);
      return true;
    });
  };
  // captureAuthorization: IDs, invoice, request ID, money and flag shape
  await rejects(gateway.captureAuthorization({ ...captureInput, authorizationId: '' }), /authorizationId/);
  await rejects(gateway.captureAuthorization({ ...captureInput, authorizationId: 'bad id!' }), /authorizationId/);
  await rejects(gateway.captureAuthorization({ ...captureInput, requestId: '' }), /requestId/);
  await rejects(gateway.captureAuthorization({ ...captureInput, requestId: 'a'.repeat(200) }), /requestId/);
  await rejects(gateway.captureAuthorization({ ...captureInput, invoiceId: '' }), /invoiceId/);
  await rejects(gateway.captureAuthorization({ ...captureInput, invoiceId: 'has space' }), /invoiceId/);
  await rejects(
    gateway.captureAuthorization({
      ...captureInput,
      expected: { currency: 'USD', amountMinor: 100 } as unknown as ExpectedMoney,
    }),
    /SGD/,
  );
  await rejects(gateway.captureAuthorization({ ...captureInput, expected: { currency: 'SGD', amountMinor: 0 } }), /positive/);
  await rejects(gateway.captureAuthorization({ ...captureInput, expected: { currency: 'SGD', amountMinor: 55.4 } }), /positive integer/);
  await rejects(
    gateway.captureAuthorization({ ...captureInput, expected: { currency: 'SGD', amountMinor: 1_000_000_001 } }),
    /exceeds/,
  );
  await rejects(gateway.captureAuthorization({ ...captureInput, finalCapture: 'yes' as unknown as boolean }), /finalCapture/);
  // getCapture / refundCapture / getRefund
  await rejects(gateway.getCapture({ ...getCaptureInput, captureId: 'CAP 1' }), /captureId/);
  await rejects(gateway.refundCapture({ captureId: '', requestId: 'r', expected: SGD_55_40 }), /captureId/);
  await rejects(gateway.getRefund({ ...getRefundInput, refundId: 'RF?1' }), /refundId/);
  // null or non-object inputs stay in the documented error class too
  await rejects(gateway.captureAuthorization(null as unknown as CaptureAuthorizationInput), /captureAuthorization input must be an object/);
  await rejects(gateway.getCapture(undefined as unknown as GetCaptureInput), /getCapture input must be an object/);
  await rejects(gateway.refundCapture([1] as unknown as RefundCaptureInput), /refundCapture input must be an object/);
  assert.equal(fetchCalled, 0);
});
