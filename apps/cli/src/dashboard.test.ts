import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createDashboardServer, loadDashboardAssets, SECURITY_HEADERS } from './dashboard.ts';
import {
  assertReadOnlyCommand,
  buildDashboardState,
  commandAction,
  createDashboardReader,
  createProcessRunner,
  DASHBOARD_READ_COMMANDS,
  dashboardChildEnvironment,
  type CommandResult,
  type CommandRunner,
  type DashboardSource,
  type DashboardState,
  type ReadEntry,
} from './dashboard-state.ts';
import { DEMO_SCENES, type DemoSession } from './demo-flow.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));

test('the dashboard starts only read commands, and refuses every other command before a process starts', () => {
  // Adding a command here is a decision both people make: it must only read.
  assert.deepEqual(DASHBOARD_READ_COMMANDS, {
    backend: ['mandate-review', 'status', 'audit'],
    shop: ['status'],
    main: ['store show'],
  });
  assert.ok(Object.isFrozen(DASHBOARD_READ_COMMANDS) && Object.isFrozen(DASHBOARD_READ_COMMANDS.backend));
  const db = ['--db', 'app.db', '--config', 'config.json'];
  for (const action of ['mandate-review', 'status', 'audit']) {
    assert.doesNotThrow(() => assertReadOnlyCommand('backend', [...db, action, '--id', 'x']));
  }
  assert.doesNotThrow(() => assertReadOnlyCommand('shop', ['status', '--mandate-id=m', '--json']));
  assert.doesNotThrow(() => assertReadOnlyCommand('main', ['store', 'show', '--catalog', 'a.json', '--json']));
  const refused: Array<[ReadEntry, string[]]> = [
    ...['operation-run', 'operation-reconcile', 'operation-authorize', 'operation-complete-authorization',
      'mandate-confirm', 'mandate-draft', 'rpc'].map((action): [ReadEntry, string[]] => ['backend', [...db, action, '--id', 'x']]),
    ['backend', ['--db', 'status', 'operation-run', '--id', 'x']],
    ['backend', [...db]],
    ['shop', ['run', '--mandate-id', 'm']],
    ['shop', ['draft', '--text-file', 'r.txt']],
    ['shop', []],
    ['main', ['store', 'set', '--catalog', 'a.json']],
    ['main', ['store', 'reset', '--catalog', 'a.json']],
    ['main', ['check', '--request', 'cart.json']],
    ['main', ['store']],
  ];
  for (const [entry, args] of refused) {
    assert.throws(() => assertReadOnlyCommand(entry, args), /only runs read commands/, `${entry} ${args.join(' ')}`);
  }
  assert.equal(commandAction('backend', ['--db', 'a', '--config', 'b', 'audit', '--id', 'x']), 'audit');
});

test('the process runner refuses a write command without starting anything', () => {
  const run = createProcessRunner(root);
  assert.throws(() => run('backend', ['--db', 'a.db', '--config', 'c.json', 'operation-run', '--id', 'x']), /only runs read commands/);
});

test('no model key and no PayPal detail reaches a command the dashboard starts', () => {
  const env = dashboardChildEnvironment({
    PATH: '/bin', ANTHROPIC_API_KEY: 'k', PAYPAL_CLIENT_ID: 'i', paypal_client_secret: 's', PAYPAL_ENV: 'sandbox', HOME: '/home/x',
  });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/home/x' });
});

test('the dashboard loads no checker, payment or shopper code', () => {
  for (const file of ['dashboard.ts', 'dashboard-state.ts']) {
    const source = readFileSync(join(here, file), 'utf8');
    const imports = [...source.matchAll(/^import .*? from '([^']+)'/gm)].map(([, name]) => name!);
    assert.ok(imports.length > 0);
    assert.deepEqual(imports.filter((name) => !name.startsWith('node:') && name !== 'zod' && name !== './dashboard-state.ts'), [], file);
    assert.doesNotMatch(source, /import\(/);
  }
});

test('the page writes every value as text, runs no inline code and loads nothing from elsewhere', () => {
  const { html, script, style } = loadDashboardAssets();
  for (const forbidden of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\(/, /new Function/, /setAttribute\(\s*['"]on/i, /\.on[a-z]+\s*=/]) {
    assert.doesNotMatch(script, forbidden);
  }
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc="\/app\.js")/);
  assert.doesNotMatch(html, /<style|style="/);
  for (const asset of [html, script, style]) assert.doesNotMatch(asset, /https?:\/\//);
  // The only requests the page makes are for its own state.
  assert.deepEqual([...script.matchAll(/fetch\('([^']+)'/g)].map(([, url]) => url), ['/api/state']);
  assert.doesNotMatch(script, /method:\s*['"](POST|PUT|PATCH|DELETE)/i);
});

// --- The server ---------------------------------------------------------------

function emptyState(): DashboardState {
  return {
    version: 1, generatedAt: '2026-11-08T09:00:00.000Z', source: { kind: 'demo', label: '.runtime/demo' }, demo: null, mandate: null,
    mandateStatus: 'not-stored', ledgerStatus: 'no-mandate', ledger: null, stores: [], requestedOperationIds: [], operations: [], notices: ['Waiting'], problems: [],
  };
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

function send(port: number, options: { method?: string; path?: string; host?: string } = {}): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    // An empty host means no Host header at all.
    const host = options.host ?? `127.0.0.1:${port}`;
    const outgoing = httpRequest({
      host: '127.0.0.1', port, method: options.method ?? 'GET', path: options.path ?? '/',
      setHost: false, headers: host === '' ? {} : { host },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test('the server answers on loopback only, to this machine\'s own names, with GET and HEAD only', async (t) => {
  let reads = 0;
  const server = createDashboardServer({
    read: async () => { reads += 1; return emptyState(); },
    assets: loadDashboardAssets(),
    log: () => {},
  });
  const port = await listen(server);
  t.after(() => { server.close(); server.closeAllConnections(); });
  assert.equal((server.address() as AddressInfo).address, '127.0.0.1');

  const page = await send(port);
  assert.equal(page.status, 200);
  assert.match(String(page.headers['content-type']), /^text\/html/);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(page.headers[name.toLowerCase()], value, name);
  assert.match(String(page.headers['content-security-policy']), /script-src 'self';/);
  assert.match((await send(port, { path: '/app.js' })).headers['content-type'] as string, /^text\/javascript/);
  assert.match((await send(port, { path: '/app.css' })).headers['content-type'] as string, /^text\/css/);
  assert.equal((await send(port, { host: `localhost:${port}` })).status, 200);

  const state = await send(port, { path: '/api/state' });
  assert.equal(state.status, 200);
  assert.deepEqual(JSON.parse(state.body), emptyState());
  assert.equal(reads, 1);

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const refused = await send(port, { method, path: '/api/state' });
    assert.equal(refused.status, 405, method);
    assert.equal(refused.headers.allow, 'GET, HEAD');
  }
  // Another site reaching this port through a rebound DNS name is refused.
  for (const host of ['evil.example', `evil.example:${port}`, `127.0.0.1:${port + 1}`]) {
    assert.equal((await send(port, { host, path: '/api/state' })).status, 403, host);
  }
  // Node refuses an HTTP/1.1 request with no Host header before the handler sees it.
  assert.equal((await send(port, { host: '', path: '/api/state' })).status, 400);
  assert.equal(reads, 1, 'refused requests never read state');
  assert.equal((await send(port, { path: '/../config.json' })).status, 404);
  assert.equal((await send(port, { path: '/api/run' })).status, 404);
});

test('a failed state read is a fixed message, never the error text', async (t) => {
  const logged: string[] = [];
  const server = createDashboardServer({
    read: async () => { throw new Error('secret detail C:\\Users\\someone'); },
    assets: loadDashboardAssets(),
    log: (line) => logged.push(line),
  });
  const port = await listen(server);
  t.after(() => { server.close(); server.closeAllConnections(); });
  const response = await send(port, { path: '/api/state' });
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(response.body), { error: 'The dashboard could not read the current state' });
  assert.match(logged.join('\n'), /state read failed/);
});

// --- Building state from the read commands ------------------------------------

const NOW = '2026-11-08T09:00:00.000Z';

function session(overrides: Partial<DemoSession> = {}): DemoSession {
  return {
    kind: 'splittap-demo-session', version: 1, mode: 'scripted', paymentProvider: 'paypal-sandbox',
    startedAt: NOW, updatedAt: NOW, scenes: [...DEMO_SCENES], scene: 6,
    mandate: { id: 'engineering-hires-demo', revision: 1, stored: true, confirmedAt: NOW },
    operationIds: ['op-1'], results: ['Confirmation: refused until confirmed'], waiting: null, finished: false, failure: null,
    ...overrides,
  };
}

const operation = {
  id: 'op-1', mandateId: 'engineering-hires-demo', mandateVersion: 1, cartId: 'recovery-cart-2', supplierId: 'store-a',
  status: 'ordered', currency: 'SGD', totalMinor: 751010, createdAt: NOW, updatedAt: NOW, reservationStatus: 'consumed',
  paymentStatus: 'succeeded', paymentProvider: 'paypal-sandbox', orderStatus: 'succeeded', refundStatus: 'not_started',
  readinessStatus: 'not_assessed',
};

const evidence = { status: 'verified', observedAt: NOW, source: 'fixture' };

const outputs: Record<string, unknown> = {
  'backend status': {
    simulation: true, paymentProvider: 'paypal-sandbox', operation,
    providerIds: { orderId: '5O190127TN364715T', authorizationId: '0VF52814937998046', captureId: '3C679366HH908993F' },
  },
  'backend audit': {
    simulation: true, paymentProvider: 'paypal-sandbox', operationId: 'op-1',
    events: [
      { eventId: 1, kind: 'operation_reserved', createdAt: NOW, details: { totalMinor: 751010 } },
      { eventId: 2, kind: 'capture_succeeded', createdAt: NOW, details: {} },
    ],
  },
  'backend mandate-review': {
    simulation: true, mandateId: 'engineering-hires-demo', mandateVersion: 1, digest: 'a'.repeat(64),
    draft: {
      id: 'engineering-hires-demo', version: 1, policyId: 'hardware', policyVersion: 1, currency: 'SGD', budgetMinor: 800000,
      purchaseBy: NOW, readyBy: NOW, deliveryLocationId: 'singapore-office', allowedSuppliers: ['store-a', 'store-b'],
      requirements: [{ id: 'laptop', role: 'engineering laptop', quantity: 5, allowedSkus: ['LAP-14-AIR'], maxUnitPriceMinor: 120000, minWarrantyMonths: 12 }],
    },
    policy: { evidenceMaxAgeHours: 72 },
  },
  'shop status': {
    kind: 'shop-status', simulation: true, backend: 'simulation-backend', warning: null, mandateId: 'engineering-hires-demo', mandateVersion: 1,
    confirmedAt: NOW,
    budget: { totalMinor: 800000, committedMinor: 751010, reservedMinor: 0, remainingMinor: 48990, allocatedMinor: 751010 },
    requirements: [{ requirementId: 'laptop', required: 5, committedUnits: 5, reservedUnits: 0, allocatedUnits: 5, remainingUnits: 0 }],
    operations: [operation], operationsHint: null,
  },
  'main store show': {
    catalog: {
      supplierId: 'store-a', shippingMinor: 2500, delivery: { by: NOW, evidence },
      products: [{ sku: 'LAP-14-AIR', unitPriceMinor: 119900, availableUnits: 9, productEvidence: evidence, stockEvidence: evidence }],
    },
  },
};

function fakeRunner(overrides: Record<string, CommandResult> = {}): { run: CommandRunner; calls: string[] } {
  const calls: string[] = [];
  const run: CommandRunner = async (entry, args) => {
    assertReadOnlyCommand(entry, args);
    const key = `${entry} ${commandAction(entry, args)}`;
    calls.push(key);
    if (overrides[key]) return overrides[key]!;
    const output = outputs[key];
    if (output === undefined) return { status: 1, stdout: '', stderr: `no canned output for ${key}` };
    return { status: 0, stdout: JSON.stringify(output), stderr: '' };
  };
  return { run, calls };
}

function demoDirectory(t: { after: (fn: () => void) => void }, value: DemoSession | string | null): DashboardSource {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-dashboard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'config.json'), JSON.stringify({ version: 1, catalogFiles: ['store-a.json'] }));
  if (value !== null) writeFileSync(join(directory, 'session.json'), typeof value === 'string' ? value : JSON.stringify(value));
  return { kind: 'demo', root, directory };
}

test('with no session yet, the page says it is waiting and nothing is run', async (t) => {
  const { run, calls } = fakeRunner();
  const state = await buildDashboardState(demoDirectory(t, null), run, () => new Date(NOW));
  assert.deepEqual(calls, []);
  assert.equal(state.demo, null);
  assert.match(state.notices.join(' '), /Waiting for npm run demo:flow/);
  assert.equal(state.source.label, '<work dir>', 'a folder outside the repository never shows its path');
});

test('a session file that is not exactly the recorded shape is reported, and none of its IDs reach a command', async (t) => {
  for (const bad of ['not json', JSON.stringify({ ...session(), operationIds: ['--db'] }), JSON.stringify({ ...session(), extra: true })]) {
    const { run, calls } = fakeRunner();
    const state = await buildDashboardState(demoDirectory(t, bad), run);
    assert.deepEqual(calls, []);
    assert.match(state.problems.join(' '), /session file .* could not be read/);
    assert.equal(state.ledgerStatus, 'unavailable', 'invalid session metadata cannot establish an empty or unconfirmed ledger');
  }
});

test('a session path that cannot be read as a file is unavailable rather than a missing demo', async (t) => {
  const source = demoDirectory(t, null);
  assert.equal(source.kind, 'demo');
  if (source.kind !== 'demo') return;
  mkdirSync(join(source.directory, 'session.json'));
  const { run, calls } = fakeRunner();
  const state = await buildDashboardState(source, run);
  assert.deepEqual(calls, []);
  assert.equal(state.ledgerStatus, 'unavailable');
  assert.match(state.problems.join(' '), /session file .* could not be read/);
  assert.deepEqual(state.notices, []);
});

test('a backend refusal establishes that there is no confirmed active revision', async (t) => {
  const { run, calls } = fakeRunner({
    'shop status': { status: 1, stdout: '', stderr: 'shop: Mandate has no confirmed active revision\n' },
  });
  const unconfirmed = session({ scene: 3, operationIds: [], mandate: { id: 'engineering-hires-demo', revision: 1, stored: true, confirmedAt: null } });
  const state = await buildDashboardState(demoDirectory(t, unconfirmed), run);
  assert.deepEqual(calls.sort(), ['backend mandate-review', 'main store show', 'shop status']);
  assert.equal(state.ledger, null);
  assert.equal(state.ledgerStatus, 'unconfirmed');
  assert.equal(state.mandate?.confirmationStatus, 'unconfirmed');
  assert.equal(state.mandate?.confirmedAt, null);
  assert.match(state.notices.join(' '), /backend has no confirmed active revision/);
  assert.deepEqual(state.problems, []);
});

test('session confirmation claims cannot replace a backend read or suppress one', async (t) => {
  for (const stored of [true, false]) {
    const stale = session({ mandate: { id: 'engineering-hires-demo', revision: 1, stored, confirmedAt: null } });
    const { run, calls } = fakeRunner();
    const confirmed = await buildDashboardState(demoDirectory(t, stale), run);
    assert.ok(calls.includes('shop status'), 'the orchestration file cannot suppress confirmation reads');
    assert.equal(confirmed.mandate?.confirmationStatus, 'confirmed');
    assert.equal(confirmed.mandate?.confirmedAt, NOW);
  }

  const { run } = fakeRunner({
    'shop status': { status: 1, stdout: '', stderr: 'shop: Mandate has no confirmed active revision\n' },
  });
  const forged = await buildDashboardState(demoDirectory(t, session()), run);
  assert.equal(forged.mandate?.confirmationStatus, 'unconfirmed');
  assert.equal(forged.mandate?.confirmedAt, null, 'a session timestamp grants no authority');
});

const MANDATE_NOT_FOUND: CommandResult = { status: 1, stdout: '', stderr: 'shop: Mandate was not found\n' };
const REVISION_NOT_FOUND: CommandResult = { status: 2, stdout: '', stderr: 'backend: Mandate revision was not found\n' };

test('while the demo has not stored its draft, the backend refusal shows nothing stored rather than a failed read', async (t) => {
  // The --pause wait between scenes 2 and 3 sits here, with the dashboard beside the terminal.
  const { run, calls } = fakeRunner({ 'shop status': MANDATE_NOT_FOUND, 'backend mandate-review': REVISION_NOT_FOUND });
  const drafted = session({
    scene: 2, waiting: 'next-scene', operationIds: [], results: [],
    mandate: { id: 'engineering-hires-demo', revision: 1, stored: false, confirmedAt: null },
  });
  const state = await buildDashboardState(demoDirectory(t, drafted), run);
  assert.deepEqual(calls.sort(), ['main store show', 'shop status'], 'nothing is stored, so no review is attempted');
  assert.deepEqual(state.problems, []);
  assert.equal(state.ledgerStatus, 'no-mandate');
  assert.equal(state.mandateStatus, 'not-stored');
  assert.equal(state.mandate, null);
  assert.match(state.notices.join(' '), /preparing the mandate/);
});

test('a not-found refusal is a failed read unless the session also awaits storage, and other failures stay failures', async (t) => {
  const cases: Array<{ stored: boolean; result: CommandResult }> = [
    { stored: true, result: MANDATE_NOT_FOUND },
    { stored: false, result: { status: 1, stdout: '', stderr: 'shop: The application database could not be validated\n' } },
    { stored: false, result: { ...MANDATE_NOT_FOUND, stdout: '{}' } },
    { stored: false, result: { ...MANDATE_NOT_FOUND, status: 2 } },
  ];
  for (const { stored, result } of cases) {
    const { run } = fakeRunner({ 'shop status': result, 'backend mandate-review': REVISION_NOT_FOUND });
    const value = session({ operationIds: [], mandate: { id: 'engineering-hires-demo', revision: 1, stored, confirmedAt: null } });
    const state = await buildDashboardState(demoDirectory(t, value), run);
    const label = `${stored} ${JSON.stringify(result)}`;
    assert.equal(state.ledgerStatus, 'unavailable', label);
    assert.equal(state.mandateStatus, 'unavailable', label);
    assert.ok(state.problems.some((problem) => problem.startsWith('Ledger (shop status)')), label);
  }
});

test('a failed mandate review is unavailable, not unstored', async (t) => {
  const { run } = fakeRunner({ 'backend mandate-review': REVISION_NOT_FOUND });
  const state = await buildDashboardState(demoDirectory(t, session()), run);
  assert.equal(state.mandate, null);
  assert.equal(state.mandateStatus, 'unavailable');
  assert.equal(state.ledgerStatus, 'read', 'the ledger read stands on its own');
  assert.ok(state.problems.some((problem) => problem.startsWith('Mandate')));
});

test('a failed, malformed or mismatched confirmation read stays unknown despite session claims', async (t) => {
  const successful = outputs['shop status'] as Record<string, unknown>;
  const { confirmedAt: ignored, ...missingConfirmation } = successful;
  void ignored;
  const failures: CommandResult[] = [
    { status: 1, stdout: '', stderr: 'shop: The application database could not be validated\n' },
    { status: null, stdout: '', stderr: 'The command took too long' },
    { status: 0, stdout: JSON.stringify(missingConfirmation), stderr: '' },
    { status: 0, stdout: JSON.stringify({ ...successful, mandateId: 'another-mandate' }), stderr: '' },
    { status: 0, stdout: JSON.stringify({ ...successful, mandateVersion: 2 }), stderr: '' },
    { status: 0, stdout: JSON.stringify({ ...successful, backend: 'contract-mock' }), stderr: '' },
  ];
  for (const failure of failures) {
    const { run } = fakeRunner({ 'shop status': failure });
    const state = await buildDashboardState(demoDirectory(t, session()), run);
    assert.equal(state.mandate?.confirmationStatus, 'unknown');
    assert.equal(state.mandate?.confirmedAt, null);
    assert.equal(state.ledger, null);
    assert.equal(state.ledgerStatus, 'unavailable', 'a failed or mismatched read is not an unconfirmed mandate');
    assert.ok(state.problems.some((problem) => problem.startsWith('Ledger (shop status)')));
  }
});

test('before the demo stores a mandate, no ledger read runs and the ledger is not called unavailable', async (t) => {
  const { run, calls } = fakeRunner();
  const state = await buildDashboardState(demoDirectory(t, session({ scene: 1, mandate: null, operationIds: [] })), run);
  assert.deepEqual(calls, ['main store show']);
  assert.equal(state.ledgerStatus, 'no-mandate');
  assert.equal(state.mandateStatus, 'not-stored');
  assert.equal(state.ledger, null);
  assert.deepEqual(state.problems, []);
});

test('every fact on the page comes from a read command, with payment, order and refund kept apart', async (t) => {
  const { run, calls } = fakeRunner();
  const state = await buildDashboardState(demoDirectory(t, session()), run, () => new Date(NOW));
  assert.deepEqual(calls.sort(), ['backend audit', 'backend mandate-review', 'backend status', 'main store show', 'shop status']);
  assert.deepEqual(state.problems, []);
  assert.equal(state.ledgerStatus, 'read');
  assert.deepEqual(state.ledger?.budget, { totalMinor: 800000, committedMinor: 751010, reservedMinor: 0, remainingMinor: 48990 });
  assert.equal(state.mandate?.evidenceMaxAgeHours, 72);
  assert.equal(state.mandate?.confirmationStatus, 'confirmed');
  assert.equal(state.mandate?.confirmedAt, NOW);
  assert.equal(state.mandate?.requirements[0]?.role, 'engineering laptop');
  const [op] = state.operations;
  assert.equal(op?.paymentProvider, 'paypal-sandbox');
  assert.equal(op?.paymentStatus, 'succeeded');
  assert.equal(op?.orderStatus, 'succeeded');
  assert.equal(op?.refundStatus, 'not_started');
  assert.equal(op?.readinessStatus, 'not_assessed');
  assert.deepEqual(op?.providerIds, outputs['backend status'] && (outputs['backend status'] as { providerIds: unknown }).providerIds);
  assert.deepEqual(op?.events.map(({ kind }) => kind), ['operation_reserved', 'capture_succeeded']);
  assert.equal(state.stores[0]?.supplierId, 'store-a');
  assert.equal(state.stores[0]?.oldestRecordAt, NOW);
  assert.equal(state.stores[0]?.newestRecordAt, NOW);
  assert.deepEqual(state.demo?.results, ['Confirmation: refused until confirmed']);
});

test('store evidence keeps both time bounds when ordinary records use different offsets', async (t) => {
  const deliveryAt = '2026-11-08T15:00:00+08:00'; // 07:00 UTC, before the other records.
  const productAt = '2026-11-08T08:00:00.000Z';
  const { run } = fakeRunner({
    'main store show': {
      status: 0, stderr: '', stdout: JSON.stringify({
        catalog: {
          supplierId: 'store-a', shippingMinor: 2500,
          delivery: { by: NOW, evidence: { ...evidence, observedAt: deliveryAt } },
          products: [{
            sku: 'LAP-14-AIR', unitPriceMinor: 119900, availableUnits: 9,
            productEvidence: { ...evidence, observedAt: productAt }, stockEvidence: evidence,
          }],
        },
      }),
    },
  });
  const state = await buildDashboardState(demoDirectory(t, session()), run, () => new Date(NOW));
  assert.deepEqual(state.problems, []);
  assert.equal(state.stores[0]?.oldestRecordAt, deliveryAt);
  assert.equal(state.stores[0]?.newestRecordAt, NOW);
});

test('a future delivery, product or stock record stays visible alongside older evidence', async (t) => {
  const older = '2026-11-08T08:00:00.000Z';
  const future = '2026-11-08T09:00:00.001Z';
  for (const record of ['delivery', 'product', 'stock', 'second-product'] as const) {
    const at = (kind: 'delivery' | 'product' | 'stock') => ({ ...evidence, observedAt: record === kind ? future : older });
    const products = [{
      sku: 'LAP-14-AIR', unitPriceMinor: 119900, availableUnits: 9,
      productEvidence: at('product'), stockEvidence: at('stock'),
    }];
    if (record === 'second-product') products.push({
      sku: 'MON-27-QHD', unitPriceMinor: 24500, availableUnits: 9,
      productEvidence: { ...evidence, observedAt: future }, stockEvidence: { ...evidence, observedAt: older },
    });
    const { run } = fakeRunner({
      'main store show': {
        status: 0, stderr: '', stdout: JSON.stringify({
          catalog: { supplierId: 'store-a', shippingMinor: 2500, delivery: { by: NOW, evidence: at('delivery') }, products },
        }),
      },
    });
    const state = await buildDashboardState(demoDirectory(t, session()), run, () => new Date(NOW));
    assert.deepEqual(state.problems, [], record);
    assert.equal(state.stores[0]?.oldestRecordAt, older, record);
    assert.equal(state.stores[0]?.newestRecordAt, future, record);
  }
});

test('a failed read shows its own short, inert message and the rest of the page still renders', async (t) => {
  const { run } = fakeRunner({
    'shop status': { status: 1, stdout: '', stderr: `shop: Ledger \u001b[31mlocked\u001b[0m\n${'x'.repeat(400)}` },
    'backend audit': { status: 0, stdout: '{"not":"an audit"}', stderr: '' },
  });
  const state = await buildDashboardState(demoDirectory(t, session()), run);
  assert.equal(state.ledger, null);
  assert.equal(state.ledgerStatus, 'unavailable');
  assert.equal(state.operations.length, 1, 'the operation still shows');
  assert.deepEqual(state.operations[0]?.events, []);
  const shopProblem = state.problems.find((line) => line.startsWith('Ledger (shop status)'));
  assert.ok(shopProblem);
  assert.doesNotMatch(shopProblem, /[\u0000-\u001f]/);
  assert.ok(shopProblem.length < 340);
  assert.ok(state.problems.some((line) => line.startsWith('Audit for op-1')));
});

test('a backend that is followed directly reads the revision the ledger confirms', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-dashboard-backend-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'config.json'), JSON.stringify({ catalogFiles: [] }));
  const { run, calls } = fakeRunner();
  const state = await buildDashboardState({
    kind: 'backend', root, databasePath: join(directory, 'app.db'), configPath: join(directory, 'config.json'),
    mandateId: 'engineering-hires-demo', operationIds: ['op-1'],
  }, run);
  assert.deepEqual(calls.sort(), ['backend audit', 'backend mandate-review', 'backend status', 'shop status']);
  assert.equal(state.demo, null);
  assert.equal(state.mandate?.revision, 1);
  assert.equal(state.mandate?.confirmationStatus, 'confirmed');
  assert.equal(state.mandate?.confirmedAt, NOW, 'direct backend mode gets the confirmation from mandate.get');
  assert.equal(state.mandateStatus, 'read');
  assert.equal(state.operations[0]?.id, 'op-1');
});

test('a followed backend with an unconfirmed mandate calls its details unavailable, not unstored', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-dashboard-backend-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'config.json'), JSON.stringify({ catalogFiles: [] }));
  const source: DashboardSource = {
    kind: 'backend', root, databasePath: join(directory, 'app.db'), configPath: join(directory, 'config.json'),
    mandateId: 'engineering-hires-demo', operationIds: [],
  };
  const { run, calls } = fakeRunner({
    'shop status': { status: 1, stdout: '', stderr: 'shop: Mandate has no confirmed active revision\n' },
  });
  const state = await buildDashboardState(source, run);
  assert.deepEqual(calls, ['shop status'], 'the revision is unknown, so no review can run');
  assert.equal(state.mandate, null);
  assert.equal(state.mandateStatus, 'revision-unknown');
  assert.equal(state.ledgerStatus, 'unconfirmed');
  assert.deepEqual(state.problems, []);

  // Without a session awaiting storage, not-found is a failure like any other.
  for (const failure of [MANDATE_NOT_FOUND, { status: 1, stdout: '', stderr: 'shop: The application database could not be validated\n' }]) {
    const { run: failing } = fakeRunner({ 'shop status': failure });
    const failed = await buildDashboardState(source, failing);
    assert.equal(failed.mandateStatus, 'unavailable', failure.stderr);
    assert.equal(failed.ledgerStatus, 'unavailable', failure.stderr);
    assert.ok(failed.problems.some((problem) => problem.startsWith('Ledger (shop status)')), failure.stderr);
  }
});

test('a missing operation cannot hide the confirmed mandate and ledger', async (t) => {
  const { run: canned } = fakeRunner({
    'backend status': { status: 1, stdout: '', stderr: 'backend: Operation was not found\n' },
  });
  const state = await buildDashboardState(demoDirectory(t, session()), async (entry, args) => {
    if (entry === 'shop') assert.ok(!args.some((arg) => arg.startsWith('--operation')), 'confirmation is read independently of operation IDs');
    return canned(entry, args);
  });
  assert.equal(state.mandate?.confirmationStatus, 'confirmed');
  assert.ok(state.ledger);
  assert.deepEqual(state.operations, []);
  assert.deepEqual(state.requestedOperationIds, ['op-1'], 'a failed read does not erase the requested IDs');
  assert.ok(state.problems.some((problem) => problem.startsWith('Operation op-1')));
});

test('operation panels are bound to the requested operation, mandate and revision', async (t) => {
  const original = outputs['backend status'] as Record<string, unknown>;
  for (const mismatch of [{ id: 'another-operation' }, { mandateId: 'another-mandate' }, { mandateVersion: 2 }]) {
    const { run } = fakeRunner({
      'backend status': { status: 0, stdout: JSON.stringify({ ...original, operation: { ...operation, ...mismatch } }), stderr: '' },
    });
    const state = await buildDashboardState(demoDirectory(t, session()), run);
    assert.equal(state.mandate?.confirmationStatus, 'confirmed');
    assert.deepEqual(state.operations, []);
    assert.ok(state.problems.some((problem) => /requested operation and mandate revision/.test(problem)));
  }

  const demo = demoDirectory(t, session());
  assert.equal(demo.kind, 'demo');
  if (demo.kind !== 'demo') assert.fail();
  const { run } = fakeRunner({ 'shop status': { status: 1, stdout: '', stderr: 'shop: Backend RPC timed out\n' } });
  const state = await buildDashboardState({
    kind: 'backend', root, databasePath: join(demo.directory, 'app.db'), configPath: join(demo.directory, 'config.json'),
    mandateId: 'engineering-hires-demo', operationIds: ['op-1'],
  }, run);
  assert.deepEqual(state.operations, [], 'an unavailable active revision cannot establish operation scope');
  assert.ok(state.problems.some((problem) => /requested operation and mandate revision/.test(problem)));
});

test('an audit for another operation cannot supply events for this panel', async (t) => {
  const { run } = fakeRunner({
    'backend audit': { status: 0, stdout: JSON.stringify({ ...(outputs['backend audit'] as object), operationId: 'another-operation' }), stderr: '' },
  });
  const state = await buildDashboardState(demoDirectory(t, session()), run);
  assert.equal(state.operations[0]?.id, 'op-1');
  assert.deepEqual(state.operations[0]?.events, []);
  assert.ok(state.problems.some((problem) => /Audit for op-1.*requested operation/.test(problem)));
});

test('real dashboard read children never overlap, and a persistent refusal stays visible', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-dashboard-children-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const entries = join(directory, 'apps', 'cli', 'src');
  mkdirSync(entries, { recursive: true });
  const eventsPath = join(directory, 'events.jsonl');
  const lockPath = join(directory, 'active-read');
  // These are real CLI children. An exclusive file stands in for a resource that
  // concurrent readers would disturb; overlap makes the read fail rather than
  // merely recording the order in which promises were created.
  const script = `
    import { appendFileSync, closeSync, openSync, unlinkSync } from 'node:fs';
    import { basename } from 'node:path';
    const entry = basename(process.argv[1], '.ts');
    const args = process.argv.slice(2);
    const action = entry === 'backend' ? args.find((value) => ['mandate-review', 'status', 'audit'].includes(value))
      : entry === 'main' ? args.slice(0, 2).join(' ') : args[0];
    const key = entry + ' ' + action;
    const log = (event) => appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event, key }) + '\\n');
    let lock;
    try { lock = openSync(${JSON.stringify(lockPath)}, 'wx'); }
    catch { console.error('Overlapping dashboard read'); process.exit(1); }
    log('start');
    await new Promise((resolve) => setTimeout(resolve, 80));
    closeSync(lock);
    unlinkSync(${JSON.stringify(lockPath)});
    log('end');
    if (key === 'backend audit') {
      console.error('backend: The application database could not be validated');
      process.exitCode = 1;
    } else console.log(JSON.stringify((${JSON.stringify(outputs)})[key]));
  `;
  for (const entry of ['backend', 'shop', 'main']) writeFileSync(join(entries, `${entry}.ts`), script);
  const source = demoDirectory(t, session());
  const state = await buildDashboardState(source, createProcessRunner(directory));
  assert.equal(state.mandate?.confirmationStatus, 'confirmed');
  assert.ok(state.ledger);
  assert.ok(state.problems.some((problem) => problem === 'Audit for op-1: The application database could not be validated'));
  assert.ok(state.problems.every((problem) => !problem.includes('Overlapping')));
  const events = readFileSync(eventsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { event: string; key: string });
  assert.equal(events.length, 10, 'five read commands each ran once; no silent retry or skipped refusal');
  for (let index = 0; index < events.length; index += 2) {
    assert.equal(events[index]?.event, 'start');
    assert.deepEqual(events[index + 1], { event: 'end', key: events[index]!.key });
  }
});

test('the reader rebuilds only when a watched file changes, and never runs two builds at once', async (t) => {
  const source = demoDirectory(t, session());
  const { run, calls } = fakeRunner();
  const reader = createDashboardReader({ source, run });
  const [first, second] = await Promise.all([reader.read(), reader.read()]);
  assert.equal(first, second, 'concurrent reads share one build');
  const perBuild = calls.length;
  await reader.read();
  assert.equal(calls.length, perBuild, 'nothing changed, so nothing ran');
  const sessionPath = join((source as { directory: string }).directory, 'session.json');
  writeFileSync(sessionPath, JSON.stringify(session({ finished: true })));
  const later = new Date(Date.now() + 5_000);
  utimesSync(sessionPath, later, later);
  const rebuilt = await reader.read();
  assert.equal(calls.length, perBuild * 2);
  assert.equal(rebuilt.demo?.finished, true);
});

test('following a real demo:flow run: the session, the ledger and the stores all come through', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-dashboard-flow-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const work = join(directory, 'work');
  mkdirSync(directory, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const flow = spawnSync(process.execPath, [join(here, 'demo-flow.ts'), '--dir', work], { cwd: root, encoding: 'utf8', env });
  assert.equal(flow.status, 0, flow.stderr);

  const recorded = JSON.parse(readFileSync(join(work, 'session.json'), 'utf8')) as DemoSession;
  assert.equal(recorded.finished, true);
  assert.equal(recorded.failure, null);
  assert.equal(recorded.scene, DEMO_SCENES.length);
  assert.equal(recorded.paymentProvider, 'fake');
  assert.equal(recorded.operationIds.length, 1);
  assert.equal(recorded.mandate?.stored, true);
  assert.ok(recorded.mandate?.confirmedAt);
  assert.equal(recorded.results.length, 3, 'confirmation, hostile listing and recovery; the fake execution adds none');

  return buildDashboardState({ kind: 'demo', root, directory: work }, createProcessRunner(root, env)).then((state) => {
    assert.deepEqual(state.problems, []);
    assert.equal(state.ledger?.budget.totalMinor, 800000);
    assert.equal(state.ledger?.budget.committedMinor, 751010);
    assert.equal(state.ledger?.budget.remainingMinor, 800000 - 751010);
    assert.equal(state.mandate?.id, recorded.mandate?.id);
    assert.equal(state.mandate?.confirmationStatus, 'confirmed');
    assert.ok(state.mandate?.confirmedAt);
    assert.ok((state.mandate?.evidenceMaxAgeHours ?? 0) > 0);
    const [op] = state.operations;
    assert.equal(op?.status, 'ordered');
    assert.equal(op?.paymentProvider, 'fake');
    assert.deepEqual(op?.providerIds, {}, 'fake provider labels are never shown as sandbox IDs');
    const kinds = op?.events.map(({ kind }) => kind) ?? [];
    for (const kind of ['operation_reserved', 'capture_succeeded', 'order_succeeded']) assert.ok(kinds.includes(kind), kind);
    assert.deepEqual(state.stores.map(({ supplierId }) => supplierId).sort(), ['store-a', 'store-b']);
    const storeB = state.stores.find(({ supplierId }) => supplierId === 'store-b')!;
    const ageHours = (Date.now() - Date.parse(storeB.oldestRecordAt)) / 3_600_000;
    assert.ok(ageHours > (state.mandate?.evidenceMaxAgeHours ?? Infinity), 'scene 5 aged store-b past the policy limit');
  });
});
