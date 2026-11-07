// Unit 4 narrow client tests: fetch injection, finite timeouts, refund read and
// unchanged request/response behavior for the spike. All fetches are fakes; the
// real network is unreachable because every request goes to the sandbox host that
// these fakes intercept, and global fetch is denied below.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalClient, PayPalApiError, PayPalTimeoutError } from './client.ts';

const ORIGINAL_FETCH = globalThis.fetch;
const DENIED = () => {
  throw new Error('globalThis.fetch must not be used; tests inject fetch explicitly');
};

before(() => {
  globalThis.fetch = DENIED as typeof fetch;
});
after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'paypal-debug-id': 'debug-42' },
  });
}
const tokenBody = () => ({ access_token: 'tok-1', expires_in: 3600 });

/** Records each call and answers with the first matching handler value. */
function harness(handlers: Array<(url: string, init: RequestInit | undefined) => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const next = handlers[calls.length - 1];
    if (!next) return Promise.reject(new Error(`unexpected call ${calls.length}: ${url}`));
    return Promise.resolve(next(url, init));
  };
  return { calls, fetchFn };
}

const clientConfig = (fetchFn: typeof fetch) => ({
  environment: 'sandbox' as const,
  clientId: 'cid',
  clientSecret: 'secret',
  fetchFn,
  timeoutMs: 50,
});

test('resource calls use the injected fetch: token POST, bearer header, forwarded request ID and encoded paths', async () => {
  const { calls, fetchFn } = harness([
    () => json(tokenBody()),
    () => json({ id: 'ORD123', status: 'CREATED' }),
    () => json({ id: 'ORD123', status: 'APPROVED' }),
    () => json({ id: 'CAP1', status: 'COMPLETED' }),
  ]);
  const paypal = createPayPalClient(clientConfig(fetchFn));
  await paypal.createOrder({}, 'run-1-order');
  await paypal.authorizeOrder('ORD123', 'run-1-authorize');
  await paypal.getOrder('a b/c');

  assert.deepEqual(
    calls.map((c) => c.url),
    [
      'https://api-m.sandbox.paypal.com/v1/oauth2/token',
      'https://api-m.sandbox.paypal.com/v2/checkout/orders',
      'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORD123/authorize',
      'https://api-m.sandbox.paypal.com/v2/checkout/orders/a%20b%2Fc',
    ],
  );
  const init1 = calls[1]?.init as RequestInit;
  const init2 = calls[2]?.init as RequestInit;
  const init3 = calls[3]?.init as RequestInit;
  assert.equal((init1.headers as Record<string, string>)['Authorization'], 'Bearer tok-1');
  assert.equal((init1.headers as Record<string, string>)['PayPal-Request-Id'], 'run-1-order');
  assert.equal((init2.headers as Record<string, string>)['PayPal-Request-Id'], 'run-1-authorize');
  assert.equal('PayPal-Request-Id' in (init3.headers as Record<string, string>), false);
});

test('the access token is fetched once and reused, and a retried capture preserves its request ID', async () => {
  const { calls, fetchFn } = harness([
    () => json(tokenBody()),
    () => json({ id: 'CAP1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '5.00' } }),
    () => json({ id: 'CAP1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '5.00' } }),
  ]);
  const paypal = createPayPalClient(clientConfig(fetchFn));
  await paypal.captureAuthorization('AUTH1', { amount: { currency_code: 'USD', value: '5.00' }, finalCapture: false, invoiceId: 'inv-1' }, 'stable-key');
  await paypal.captureAuthorization('AUTH1', { amount: { currency_code: 'USD', value: '5.00' }, finalCapture: false, invoiceId: 'inv-1' }, 'stable-key');

  assert.equal(calls.filter((c) => c.url.includes('/v1/oauth2/token')).length, 1);
  const [first, retry] = [calls[1]?.init as RequestInit, calls[2]?.init as RequestInit];
  assert.deepEqual(JSON.parse(String(first.body)), {
    amount: { currency_code: 'USD', value: '5.00' },
    final_capture: false,
    invoice_id: 'inv-1',
  });
  assert.equal((retry.headers as Record<string, string>)['PayPal-Request-Id'], 'stable-key');
  assert.equal((first.headers as Record<string, string>)['PayPal-Request-Id'], 'stable-key');
});

test('HTTP errors become PayPalApiError with status, issue and debug id', async () => {
  const { fetchFn } = harness([
    () => json(tokenBody()),
    () => json({ name: 'INVALID_RESOURCE_ID', message: 'The requested resource was not found' }, 404),
  ]);
  const paypal = createPayPalClient(clientConfig(fetchFn));
  await assert.rejects(paypal.getCapture('CAPX'), (error: unknown) => {
    assert.ok(error instanceof PayPalApiError);
    assert.equal(error.status, 404);
    assert.equal(error.issue, 'INVALID_RESOURCE_ID');
    assert.equal(error.debugId, 'debug-42');
    assert.match(error.message, /404 INVALID_RESOURCE_ID/);
    return true;
  });
});

test('getRefund reads a refund from the refunds path with the ID encoded', async () => {
  const { calls, fetchFn } = harness([
    () => json(tokenBody()),
    () => json({ id: 'RF1/2', status: 'COMPLETED', amount: { currency_code: 'SGD', value: '1.00' } }),
  ]);
  const paypal = createPayPalClient(clientConfig(fetchFn));
  const refund = await paypal.getRefund('RF1/2');
  assert.deepEqual(refund, { id: 'RF1/2', status: 'COMPLETED', amount: { currency_code: 'SGD', value: '1.00' } });
  assert.equal(calls[1]?.url, 'https://api-m.sandbox.paypal.com/v2/payments/refunds/RF1%2F2');
});

test('a token fetch that never resolves is rejected by the finite timeout, not hung', async () => {
  const untouchedFetch: typeof fetch = () => new Promise<Response>(() => {});
  const paypal = createPayPalClient({ ...clientConfig(untouchedFetch), timeoutMs: 20 });
  const started = Date.now();
  await assert.rejects(paypal.getOrder('X'), PayPalTimeoutError);
  assert.ok(Date.now() - started < 5_000);
});

test('a resource call that never resolves is rejected by the finite timeout after the token succeeds', async () => {
  const { fetchFn } = harness([
    () => json(tokenBody()),
    () => new Promise<Response>(() => {}),
  ]);
  const paypal = createPayPalClient({ ...clientConfig(fetchFn), timeoutMs: 20 });
  const started = Date.now();
  await assert.rejects(paypal.getCapture('CAP1'), PayPalTimeoutError);
  assert.ok(Date.now() - started < 5_000);
});

test('a 2xx response with a non-JSON body keeps the existing pass-through behavior', async () => {
  const { fetchFn } = harness([() => json(tokenBody()), () => new Response('<html>gateway</html>')]);
  const paypal = createPayPalClient(clientConfig(fetchFn));
  assert.equal(await paypal.getCapture('CAP1'), '<html>gateway</html>');
});
