import assert from 'node:assert/strict';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createAppServer, STARTUP_NOTE, type AppState } from './app-server.ts';
import type { Outcome, RunInput, TakeManager, WaitStep } from './app-takes.ts';
import { SECURITY_HEADERS } from './dashboard.ts';

const TOKEN = 'test-token-123';
const policy = { id: 'hardware-policy', version: 1 };
const assets = { html: '<meta name="splittap-token" content="{{TOKEN}}"><p>app</p>', script: 'void 0;', style: 'body{}' };

function stubTakes(outcome: Outcome = { ok: true }) {
  const calls: string[] = [];
  const takes = {
    start: (input: RunInput) => { calls.push(`start:${input.shopper}:${input.payment}`); return outcome; },
    continue: (step: WaitStep) => { calls.push(`continue:${step}`); return outcome; },
    stop: () => { calls.push('stop'); return outcome; },
    current: () => null,
    terminal: () => [],
    readSession: () => null,
  } as unknown as TakeManager;
  return { takes, calls };
}

const emptyState: AppState = { take: null, dashboard: null, conversation: [], terminal: [], approvalUrl: null, demoRequest: 'Equip five.' };

async function serve(t: { after: (fn: () => void) => void }, outcome?: Outcome) {
  const { takes, calls } = stubTakes(outcome);
  const server: Server = createAppServer({ takes, readState: async () => emptyState, policyText: JSON.stringify(policy), assets, token: TOKEN, log: () => {} });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;
  const send = (method: string, path: string, options: { body?: string; headers?: Record<string, string> } = {}) =>
    new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...options.headers } }, (response) => {
        let body = '';
        response.setEncoding('utf8').on('data', (chunk) => { body += chunk; }).on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }));
      });
      request.on('error', reject);
      if (options.body !== undefined) request.write(options.body);
      request.end();
    });
  const good = { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, 'x-splittap-token': TOKEN };
  return { port, send, good, calls };
}

const runBody = JSON.stringify({ request: 'Equip two analysts.', shopper: 'claude', payment: 'fake' });

test('posts without the token, with a foreign origin or a foreign host change nothing', async (t) => {
  const { port, send, good, calls } = await serve(t);
  const attempts = [
    { ...good, 'x-splittap-token': '' },
    { ...good, 'x-splittap-token': 'wrong' },
    { ...good, origin: 'http://evil.example' },
    { ...good, origin: undefined as unknown as string },
    { ...good, host: `evil.example:${port}` },
  ];
  for (const headers of attempts) {
    const clean = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
    const response = await send('POST', '/api/run', { body: runBody, headers: clean });
    assert.equal(response.status, 403, JSON.stringify(clean));
  }
  assert.deepEqual(calls, []);
});

test('an oversized, non-JSON or unknown-field body is refused before anything starts', async (t) => {
  const { send, good, calls } = await serve(t);
  assert.equal((await send('POST', '/api/run', { body: 'x'.repeat(8193), headers: good })).status, 413);
  assert.equal((await send('POST', '/api/run', { body: runBody, headers: { ...good, 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await send('POST', '/api/run', { body: '{not json', headers: good })).status, 400);
  const extra = await send('POST', '/api/run', { body: JSON.stringify({ ...JSON.parse(runBody), extra: 1 }), headers: good });
  assert.equal(extra.status, 400);
  assert.match(JSON.parse(extra.body).error, /could not be read/);
  assert.deepEqual(calls, []);
});

test('the page carries the launch token and every response carries the security headers', async (t) => {
  const { send } = await serve(t);
  const page = await send('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.body, /content="test-token-123"/);
  assert.doesNotMatch(page.body, /\{\{TOKEN\}\}/);
  for (const path of ['/', '/app.js', '/app.css', '/api/state', '/missing']) {
    const response = await send('GET', path);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(response.headers[name.toLowerCase()], value, `${path} ${name}`);
  }
  assert.deepEqual(JSON.parse((await send('GET', '/api/state')).body), emptyState);
});

test('start, continue and stop pass through the take rules', async (t) => {
  const ok = await serve(t);
  assert.equal((await ok.send('POST', '/api/run', { body: runBody, headers: ok.good })).status, 200);
  assert.equal((await ok.send('POST', '/api/continue', { body: JSON.stringify({ step: 'operator-confirm' }), headers: ok.good })).status, 200);
  assert.equal((await ok.send('POST', '/api/stop', { body: '{}', headers: ok.good })).status, 200);
  assert.deepEqual(ok.calls, ['start:claude:fake', 'continue:operator-confirm', 'stop']);
  const refused = await serve(t, { ok: false, status: 409, message: 'A run is already going.' });
  const response = await refused.send('POST', '/api/run', { body: runBody, headers: refused.good });
  assert.equal(response.status, 409);
  assert.deepEqual(JSON.parse(response.body), { error: 'A run is already going.' });
  assert.equal((await refused.send('POST', '/api/stop', { body: '{"now":true}', headers: refused.good })).status, 400);
});

test('the policy file is served read-only', async (t) => {
  const { send, good } = await serve(t);
  assert.deepEqual(JSON.parse((await send('GET', '/api/files')).body), { policy });
  assert.equal((await send('POST', '/api/files', { body: '{}', headers: good })).status, 405);
  assert.equal((await send('PUT', '/api/run', { body: runBody, headers: good })).status, 405);
});

test('the startup note says Ctrl+C also stops a running take, as in the terminal', () => {
  assert.doesNotMatch(STARTUP_NOTE, /next prompt/);
  assert.match(STARTUP_NOTE, /Ctrl\+C also stops a take that is running, as it does in the terminal/);
  assert.match(STARTUP_NOTE, /operation-reconcile/);
});
