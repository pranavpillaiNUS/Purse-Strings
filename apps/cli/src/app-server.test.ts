import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAppServer, STARTUP_NOTE, type AppState } from './app-server.ts';
import { createTakeManager, type FlowChild, type Outcome, type RunInput, type TakeManager, type WaitStep } from './app-takes.ts';
import { SECURITY_HEADERS } from './dashboard.ts';

const TOKEN = 'test-token-123';
const policy = { id: 'hardware-policy', version: 1 };
const assets = { html: '<meta name="splittap-token" content="{{TOKEN}}"><p>app</p>', script: 'void 0;', style: 'body{}' };

function stubTakes(outcome: Outcome = { ok: true }) {
  const calls: Array<{ action: string; input: unknown }> = [];
  const takes = {
    start: (input: RunInput) => { calls.push({ action: 'start', input }); return outcome; },
    continue: (input: { takeDirectory: string; waitId: number; step: WaitStep }) => { calls.push({ action: 'continue', input }); return outcome; },
    stop: (input: { takeDirectory: string; waitId: number }) => { calls.push({ action: 'stop', input }); return outcome; },
    current: () => null,
    terminal: () => [],
    readSession: () => null,
  } as unknown as TakeManager;
  return { takes, calls };
}

const emptyState: AppState = { take: null, dashboard: null, conversation: [], terminal: [], approvalUrl: null, demoRequest: 'Equip five.' };

async function serve(t: { after: (fn: () => void) => void }, outcome?: Outcome, actualTakes?: TakeManager) {
  const stub = stubTakes(outcome);
  const takes = actualTakes ?? stub.takes;
  const calls = stub.calls;
  const server: Server = createAppServer({ takes, readState: async () => ({ ...emptyState, take: takes.current() }), policyText: JSON.stringify(policy), assets, token: TOKEN, log: () => {} });
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
const binding = { takeDirectory: '/test/take', waitId: 3 };

interface HttpChild extends FlowChild { writes: string[]; kills: number; exit(): void }

async function simulatedServer(t: { after: (fn: () => void) => void }) {
  const runtime = mkdtempSync(join(tmpdir(), 'splittap-app-http-binding-'));
  t.after(() => rmSync(runtime, { recursive: true, force: true }));
  const children: HttpChild[] = [];
  const takes = createTakeManager({
    root: runtime, runtimeDirectory: runtime, now: () => new Date('2026-11-11T01:00:00Z'),
    spawn: () => {
      const exits: Array<(code: number | null) => void> = [];
      const child: HttpChild = {
        writes: [], kills: 0,
        stdin: { write: (text) => { child.writes.push(text); return true; }, end: () => {} },
        onOutput: () => {}, onExit: (listener) => { exits.push(listener); },
        kill: () => { child.kills += 1; }, exit: () => { for (const listener of exits) listener(0); },
      };
      children.push(child);
      return child;
    },
  });
  const http = await serve(t, undefined, takes);
  const wait = (waiting: WaitStep, waitId: number) => {
    const directory = takes.current()!.directory;
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'session.json'), JSON.stringify({
      kind: 'splittap-demo-session', version: 1, mode: 'scripted', paymentProvider: 'fake',
      startedAt: '2026-11-11T01:00:00.000Z', updatedAt: '2026-11-11T01:00:05.000Z', scenes: ['The control panel'], scene: 1,
      mandate: null, operationIds: [], results: [], waiting, waitId, finished: false, failure: null, unusable: [],
    }));
  };
  const post = (path: string, body: unknown) => http.send('POST', path, { body: JSON.stringify(body), headers: http.good });
  const snapshot = async () => {
    const response = await http.send('GET', '/api/state');
    assert.equal(response.status, 200);
    const { take } = JSON.parse(response.body) as AppState;
    assert.ok(take);
    assert.equal(typeof take.waitId, 'number', 'the displayed wait has a correlation number');
    assert.notEqual(take.awaiting, null);
    return { takeDirectory: take.directory, waitId: take.waitId!, step: take.awaiting! };
  };
  const start = async () => {
    const response = await post('/api/run', { request: 'Equip five engineering hires.', shopper: 'scripted', payment: 'fake' });
    assert.equal(response.status, 200, response.body);
  };
  return { ...http, takes, children, wait, post, snapshot, start };
}

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
  const continuation = { ...binding, step: 'operator-confirm' };
  assert.equal((await ok.send('POST', '/api/run', { body: runBody, headers: ok.good })).status, 200);
  assert.equal((await ok.send('POST', '/api/continue', { body: JSON.stringify(continuation), headers: ok.good })).status, 200);
  assert.equal((await ok.send('POST', '/api/stop', { body: JSON.stringify(binding), headers: ok.good })).status, 200);
  assert.deepEqual(ok.calls, [
    { action: 'start', input: JSON.parse(runBody) },
    { action: 'continue', input: continuation },
    { action: 'stop', input: binding },
  ]);
  const refused = await serve(t, { ok: false, status: 409, message: 'A run is already going.' });
  const response = await refused.send('POST', '/api/run', { body: runBody, headers: refused.good });
  assert.equal(response.status, 409);
  assert.deepEqual(JSON.parse(response.body), { error: 'A run is already going.' });
  assert.equal((await refused.send('POST', '/api/stop', { body: '{"now":true}', headers: refused.good })).status, 400);
});

test('continue and stop require strict take and wait bindings before the manager is called', async (t) => {
  const { send, good, calls } = await serve(t);
  const invalid = [
    {}, { takeDirectory: binding.takeDirectory }, { waitId: binding.waitId },
    { ...binding, takeDirectory: '' }, { ...binding, takeDirectory: 42 },
    { ...binding, waitId: null }, { ...binding, waitId: '3' }, { ...binding, waitId: -1 },
    { ...binding, waitId: 1.5 }, { ...binding, waitId: 1_000_001 }, { ...binding, extra: true },
  ];
  for (const body of invalid) {
    assert.equal((await send('POST', '/api/stop', { body: JSON.stringify(body), headers: good })).status, 400, JSON.stringify(body));
    assert.equal((await send('POST', '/api/continue', { body: JSON.stringify({ ...body, step: 'next-scene' }), headers: good })).status, 400, JSON.stringify(body));
  }
  for (const body of [{ ...binding }, { ...binding, step: 'run' }, { ...binding, step: 'next-scene', path: '/other/take' }]) {
    assert.equal((await send('POST', '/api/continue', { body: JSON.stringify(body), headers: good })).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(calls, []);
});

test('two clients cannot continue or stop a later same-name wait with an earlier snapshot', async (t) => {
  const app = await simulatedServer(t);
  await app.start();
  app.wait('next-scene', 1);
  const clientA = await app.snapshot();
  const clientB = await app.snapshot();
  assert.deepEqual(clientA, clientB);
  assert.equal((await app.post('/api/continue', clientB)).status, 200);
  assert.equal((await app.post('/api/continue', clientA)).status, 409);
  app.wait('next-scene', 2);
  assert.equal((await app.post('/api/continue', clientA)).status, 409);
  assert.equal((await app.post('/api/stop', { takeDirectory: clientA.takeDirectory, waitId: clientA.waitId })).status, 409);
  assert.deepEqual(app.children[0]!.writes, ['\n']);
  assert.equal(app.children[0]!.kills, 0);
  const latest = await app.snapshot();
  assert.equal(latest.waitId, 2);
  assert.equal((await app.post('/api/continue', latest)).status, 200);
  assert.deepEqual(app.children[0]!.writes, ['\n', '\n']);
});

test('an old take cannot confirm or stop a new take even when its step and wait number match', async (t) => {
  const app = await simulatedServer(t);
  await app.start();
  app.wait('operator-confirm', 3);
  const clientA = await app.snapshot();
  app.children[0]!.exit();
  await app.start();
  app.wait('operator-confirm', 3);
  const clientB = await app.snapshot();
  assert.notEqual(clientA.takeDirectory, clientB.takeDirectory);
  assert.equal((await app.post('/api/continue', clientA)).status, 409);
  assert.equal((await app.post('/api/stop', { takeDirectory: clientA.takeDirectory, waitId: clientA.waitId })).status, 409);
  assert.deepEqual(app.children[1]!.writes, []);
  assert.equal(app.children[1]!.kills, 0);
  assert.equal((await app.post('/api/continue', clientB)).status, 200);
  assert.deepEqual(app.children[1]!.writes, ['\n']);
  app.wait('next-scene', 4);
  const latest = await app.snapshot();
  assert.equal((await app.post('/api/stop', { takeDirectory: latest.takeDirectory, waitId: latest.waitId })).status, 200);
  assert.equal(app.children[1]!.kills, 1);
  const stopped = JSON.parse((await app.send('GET', '/api/state')).body) as AppState;
  assert.equal(stopped.take?.status, 'running', 'the fake child has not emitted its asynchronous exit yet');
  assert.equal(stopped.take?.awaiting, null, 'a successful Stop immediately consumes its prompt');
  assert.equal(stopped.take?.waitId, null);
  assert.equal((await app.post('/api/continue', latest)).status, 409);
  assert.equal((await app.post('/api/stop', { takeDirectory: latest.takeDirectory, waitId: latest.waitId })).status, 409);
  assert.deepEqual(app.children[1]!.writes, ['\n'], 'Stop cannot leave the same prompt open to a late Continue');
  assert.equal(app.children[1]!.kills, 1, 'a repeated Stop cannot signal the same child again');
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
