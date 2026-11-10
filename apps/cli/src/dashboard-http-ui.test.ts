import assert from 'node:assert/strict';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import type { DashboardState } from './dashboard-state.ts';
import { createDashboardServer, loadDashboardAssets, SECURITY_HEADERS } from './dashboard.ts';

const NOW = '2026-11-08T09:00:00.000Z';
const HOUR_MS = 3_600_000;

function stateWithRecord(observedAt: string): DashboardState {
  return {
    version: 1,
    generatedAt: NOW,
    source: { kind: 'backend', label: 'engineering-hires-demo' },
    demo: null,
    mandate: {
      id: 'engineering-hires-demo', revision: 1, digest: 'd'.repeat(64), confirmationStatus: 'confirmed', confirmedAt: NOW,
      currency: 'SGD', budgetMinor: 800000, purchaseBy: '2026-11-18T00:00:00.000Z', readyBy: '2026-11-19T00:00:00.000Z',
      deliveryLocationId: 'singapore-office', allowedSuppliers: ['store-a'], requirements: [], evidenceMaxAgeHours: 72,
    },
    mandateStatus: 'read',
    ledgerStatus: 'unavailable',
    ledger: null,
    stores: [{ supplierId: 'store-a', shippingMinor: 0, deliveryBy: '2026-11-18T00:00:00.000Z', oldestRecordAt: observedAt, newestRecordAt: observedAt, recordStatuses: ['verified'], products: [] }],
    requestedOperationIds: [], operations: [], notices: [], problems: [],
  };
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

function send(port: number, path: string, method = 'GET', host = `127.0.0.1:${port}`): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, path, method, headers: { host } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test('a malformed request URL returns 400 and the same dashboard server keeps answering read-only requests', async (t) => {
  let reads = 0;
  const state = stateWithRecord(NOW);
  const server = createDashboardServer({ read: async () => { reads += 1; return state; }, assets: loadDashboardAssets(), log: () => {} });
  const port = await listen(server);
  t.after(() => { server.close(); server.closeAllConnections(); });
  assert.equal((server.address() as AddressInfo).address, '127.0.0.1');

  for (const method of ['GET', 'HEAD']) {
    const malformed = await send(port, '//[', method);
    assert.equal(malformed.status, 400, method);
    assert.equal(malformed.body, method === 'HEAD' ? '' : 'The request URL could not be read.\n');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(malformed.headers[name.toLowerCase()], value, name);
  }
  assert.equal(reads, 0, 'invalid URLs do not read ledger state');
  const later = await send(port, '/api/state');
  assert.equal(later.status, 200);
  assert.deepEqual(JSON.parse(later.body), state);
  assert.equal(reads, 1);
  const head = await send(port, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal((await send(port, '/api/state', 'POST')).status, 405);
  assert.equal((await send(port, '/api/state', 'GET', 'other.example')).status, 403);
  assert.equal(reads, 1, 'refused methods and hosts still do not read state');
});

/** Only the DOM operations used by the shipped renderer; markup is never parsed. */
class ClientNode {
  readonly tagName: string | null;
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> = {};
  childNodes: ClientNode[] = [];
  className = '';
  private text: string | null;

  constructor(tagName: string | null, text: string | null = null) {
    this.tagName = tagName;
    this.text = text;
  }

  readonly classList = {
    add: (...names: string[]): void => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
    remove: (...names: string[]): void => { this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
  };

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  append(...children: ClientNode[]): void { this.childNodes.push(...children); }
  replaceChildren(...children: ClientNode[]): void { this.text = null; this.childNodes = children; }
  get textContent(): string { return this.text ?? this.childNodes.map((child) => child.textContent).join(''); }
  set textContent(value: string) { this.text = value; this.childNodes = []; }
}

function descendants(node: ClientNode, predicate: (node: ClientNode) => boolean): ClientNode[] {
  return [...(predicate(node) ? [node] : []), ...node.childNodes.flatMap((child) => descendants(child, predicate))];
}

async function renderClient(state: DashboardState, initialTime = NOW) {
  let clock = Date.parse(initialTime);
  const elements = Object.fromEntries(['app', 'badges', 'updated'].map((id) => [id, new ClientNode('div')]));
  const scheduled: Array<() => Promise<void>> = [];
  const fetched: string[] = [];
  let firstPollFinished!: () => void;
  const ready = new Promise<void>((resolve) => { firstPollFinished = resolve; });
  class ClockDate extends Date { static override now(): number { return clock; } }
  runInNewContext(loadDashboardAssets().script, {
    Node: ClientNode,
    Date: ClockDate,
    document: {
      getElementById: (id: string) => elements[id],
      createElement: (tag: string) => new ClientNode(tag),
      createTextNode: (text: string) => new ClientNode(null, text),
    },
    fetch: async (path: string) => {
      fetched.push(path);
      return { ok: true, text: async () => JSON.stringify(state) };
    },
    setTimeout: (callback: () => Promise<void>, delay: number) => {
      assert.equal(delay, 1500);
      scheduled.push(callback);
      firstPollFinished();
    },
  }, { filename: 'dashboard/app.js', timeout: 1000 });
  await ready;
  const app = elements.app!;
  assert.doesNotMatch(elements.updated!.textContent, /Connection lost/, 'the actual client renderer completed');
  return {
    app,
    fetched,
    recordCell: (): ClientNode => {
      const rows = descendants(app, (node) => node.tagName === 'tr');
      const row = rows.find((node) => node.childNodes[0]?.textContent === 'Oldest record');
      assert.ok(row?.childNodes[1], 'the actual Stores table contains its evidence row');
      return row.childNodes[1];
    },
    pollAt: async (iso: string): Promise<void> => {
      clock = Date.parse(iso);
      const callback = scheduled.shift();
      assert.ok(callback, 'the client scheduled another poll');
      await callback();
      assert.doesNotMatch(elements.updated!.textContent, /Connection lost/);
    },
  };
}

test('the rendered Stores evidence uses the exact age limit before rounding hours for display', async () => {
  for (const [ageMs, stale] of [[72 * HOUR_MS, false], [72 * HOUR_MS + 1, true], [72.5 * HOUR_MS, true]] as const) {
    const observedAt = new Date(Date.parse(NOW) - ageMs).toISOString();
    const client = await renderClient(stateWithRecord(observedAt));
    const record = client.recordCell();
    assert.equal(record.className === 'stale', stale, `${ageMs} milliseconds old`);
    assert.match(record.textContent, /^72 h old/);
    assert.equal(record.textContent.includes('past the 72 h policy limit'), stale);
    assert.deepEqual(client.fetched, ['/api/state']);
  }
});

test('unchanged API state still becomes visibly stale when the next poll crosses the age limit', async () => {
  const observedAt = new Date(Date.parse(NOW) - 72 * HOUR_MS).toISOString();
  const client = await renderClient(stateWithRecord(observedAt));
  assert.equal(client.recordCell().className, '');
  await client.pollAt(new Date(Date.parse(NOW) + 1).toISOString());
  assert.equal(client.recordCell().className, 'stale');
  assert.match(client.recordCell().textContent, /past the 72 h policy limit/);
  assert.deepEqual(client.fetched, ['/api/state', '/api/state']);
});

test('the rendered Stores evidence flags a future observation instead of describing it as fresh', async () => {
  const future = new Date(Date.parse(NOW) + 1).toISOString();
  const client = await renderClient(stateWithRecord(future));
  assert.equal(client.recordCell().className, 'stale');
  assert.match(client.recordCell().textContent, /Future-dated record: not valid evidence/);
  await client.pollAt(future);
  assert.equal(client.recordCell().className, '');
  assert.match(client.recordCell().textContent, /^0 h old/);
});

test('an older record cannot hide a future observation, and both age warnings stay visible', async () => {
  for (const ageHours of [1, 73]) {
    const observedAt = new Date(Date.parse(NOW) - ageHours * HOUR_MS).toISOString();
    const future = new Date(Date.parse(NOW) + 1).toISOString();
    const state = stateWithRecord(observedAt);
    state.stores[0]!.newestRecordAt = future;
    const client = await renderClient(state);
    assert.equal(client.recordCell().className, 'stale');
    assert.match(client.recordCell().textContent, new RegExp(`^${ageHours} h old`));
    assert.match(client.recordCell().textContent, /Future-dated record: not valid evidence/);
    assert.equal(client.recordCell().textContent.includes('past the 72 h policy limit'), ageHours > 72);

    // The same cached timestamps become current without a backend state change.
    await client.pollAt(future);
    assert.equal(client.recordCell().className === 'stale', ageHours > 72);
    assert.doesNotMatch(client.recordCell().textContent, /Future-dated/);
  }
});

function budgetCard(app: ClientNode): ClientNode {
  const budget = descendants(app, (node) => node.tagName === 'section')
    .find((node) => node.childNodes[0]?.textContent.startsWith('Budget'));
  assert.ok(budget, 'the page renders its Budget card');
  return budget;
}

function mandateCard(app: ClientNode): ClientNode {
  const mandate = descendants(app, (node) => node.tagName === 'section')
    .find((node) => node.childNodes[0]?.textContent.startsWith('Mandate'));
  assert.ok(mandate, 'the page renders its Mandate card');
  return mandate;
}

test('the mandate card says why its details are missing, and never calls a stored mandate unstored', async () => {
  const cases = [
    ['not-stored', /Appears once a drafted mandate is stored for confirmation/],
    ['revision-unknown', /Mandate details are unavailable\. The backend holds this mandate but has no confirmed revision/],
    ['unavailable', /Mandate details are unavailable\. The read did not succeed/],
  ] as const;
  for (const kind of ['backend', 'demo'] as const) {
    for (const [mandateStatus, expected] of cases) {
      const state = stateWithRecord(NOW);
      state.source.kind = kind;
      if (kind === 'demo') state.demo = {
        mode: 'scripted', paymentProvider: 'fake', startedAt: NOW, updatedAt: NOW, scenes: ['One', 'Two'], scene: 2,
        results: [], waiting: 'next-scene', finished: false, failure: null, unusable: [],
      };
      state.mandate = null;
      state.mandateStatus = mandateStatus;
      const text = mandateCard((await renderClient(state)).app).textContent;
      assert.match(text, expected, `${kind} ${mandateStatus}`);
      if (mandateStatus !== 'not-stored') assert.doesNotMatch(text, /Appears once|is stored for confirmation/, `${kind} ${mandateStatus}`);
    }
  }
});

test('an unavailable ledger never implies an unconfirmed mandate or an absence of reservations', async () => {
  // The mandate card's own status cannot change what a failed ledger read means.
  for (const confirmation of ['confirmed', 'unconfirmed', 'unknown', null] as const) {
    const state = stateWithRecord(NOW);
    if (confirmation === null) state.mandate = null;
    else state.mandate!.confirmationStatus = confirmation;
    state.problems = ['Ledger (shop status): the read failed'];
    const budget = budgetCard((await renderClient(state)).app);
    assert.match(budget.textContent, /Budget and allocated units are unavailable/, String(confirmation));
    assert.doesNotMatch(budget.textContent, /once a person confirms|nothing can be reserved/);
  }
});

test('before a mandate exists, or while the backend refuses an unconfirmed one, the ledger is not called unavailable', async () => {
  for (const [kind, ledgerStatus] of [['demo', 'no-mandate'], ['demo', 'unconfirmed'], ['backend', 'unconfirmed']] as const) {
    const state = stateWithRecord(NOW);
    state.source.kind = kind;
    // The opening scenes have no mandate yet. A followed backend cannot review an
    // unconfirmed mandate without its revision, so it has no mandate details either.
    state.mandate = null;
    state.mandateStatus = kind === 'backend' ? 'revision-unknown' : 'not-stored';
    state.ledgerStatus = ledgerStatus;
    if (kind === 'demo') state.demo = {
      mode: 'scripted', paymentProvider: 'fake', startedAt: NOW, updatedAt: NOW, scenes: ['One', 'Two'], scene: 1,
      results: [], waiting: null, finished: false, failure: null, unusable: [],
    };
    else state.notices = ['The backend has no confirmed active revision for this mandate.'];
    const client = await renderClient(state);
    assert.doesNotMatch(client.app.textContent, /Waiting for the demo|npm run demo:flow/, `${kind} ${ledgerStatus}`);
    const budget = budgetCard(client.app);
    assert.match(budget.textContent, /Shown once a person confirms the mandate/);
    assert.doesNotMatch(budget.textContent, /unavailable/);
  }
});

test('only a demo that has not started shows the waiting screen', async () => {
  const state = stateWithRecord(NOW);
  Object.assign(state, { source: { kind: 'demo', label: '.runtime/demo' }, mandate: null, ledgerStatus: 'no-mandate', stores: [], notices: ['Waiting for npm run demo:flow to start in .runtime/demo.'] });
  const client = await renderClient(state);
  assert.match(client.app.textContent, /Waiting for the demo/);
  assert.equal(descendants(client.app, (node) => node.tagName === 'section' && node.className === 'card').length, 0);
});

test('an invalid demo session shows unavailable budget data instead of an empty or unconfirmed ledger', async () => {
  const state = stateWithRecord(NOW);
  Object.assign(state, { source: { kind: 'demo', label: '.runtime/demo' }, mandate: null, ledgerStatus: 'unavailable', stores: [], problems: ['The demo session file could not be read.'] });
  const client = await renderClient(state);
  assert.match(budgetCard(client.app).textContent, /Budget and allocated units are unavailable/);
  assert.match(client.app.textContent, /Operation details are unavailable/);
  assert.doesNotMatch(client.app.textContent, /Waiting for the demo|nothing can be reserved|No operation IDs were given|None yet/);
});

test('failed operation reads are unavailable rather than no IDs or no operations yet', async () => {
  for (const demoMode of [false, true]) {
    const state = stateWithRecord(NOW);
    state.requestedOperationIds = ['op-1'];
    state.problems = ['Operation op-1: the read failed'];
    if (demoMode) {
      state.source.kind = 'demo';
      state.demo = { mode: 'scripted', paymentProvider: 'fake', startedAt: NOW, updatedAt: NOW, scenes: ['One'], scene: 1, results: [], waiting: null, finished: false, failure: null, unusable: [] };
    }
    const client = await renderClient(state);
    assert.match(client.app.textContent, /Operation details are unavailable/);
    assert.doesNotMatch(client.app.textContent, /No operation IDs were given|None yet/);
  }
});

test('a finished take that is not usable says why, and never shows the every-scene-ran line', async () => {
  const state = stateWithRecord(NOW);
  state.source.kind = 'demo';
  const demo = {
    mode: 'live' as const, paymentProvider: 'paypal-sandbox' as const, startedAt: NOW, updatedAt: NOW, scenes: ['One'], scene: 1,
    results: ['Recovery: nothing was reserved', 'Execution: skipped, because nothing was reserved'], waiting: null, finished: true, failure: null,
  };
  state.demo = { ...demo, unusable: ['The model did not recover: nothing was reserved'] };
  const unusable = await renderClient(state);
  assert.match(unusable.app.textContent, /Finished: not a usable take/);
  assert.match(unusable.app.textContent, /The model did not recover: nothing was reserved\./);
  assert.match(unusable.app.textContent, /None\. Scene 5 reserved nothing, so scene 6 executed nothing\./);
  assert.doesNotMatch(unusable.app.textContent, /Every scene ran|None yet/);

  state.demo = { ...demo, unusable: [] };
  const usable = await renderClient(state);
  assert.match(usable.app.textContent, /Every scene ran/);
  assert.doesNotMatch(usable.app.textContent, /not a usable take/);
});

test('the rendered mandate distinguishes trusted confirmation, refusal and unknown status in both dashboard modes', async () => {
  for (const demoMode of [false, true]) {
    for (const status of ['confirmed', 'unconfirmed', 'unknown'] as const) {
      const state = stateWithRecord(NOW);
      state.mandate!.confirmationStatus = status;
      // A timestamp by itself cannot turn unknown/unconfirmed into authority.
      state.mandate!.confirmedAt = NOW;
      if (demoMode) state.demo = {
        mode: 'scripted', paymentProvider: 'fake', startedAt: NOW, updatedAt: NOW, scenes: [], scene: 0,
        results: [], waiting: 'operator-confirm', finished: false, failure: null, unusable: [],
      };
      const client = await renderClient(state);
      const mandate = descendants(client.app, (node) => node.tagName === 'section')
        .find((node) => node.childNodes[0]?.textContent.startsWith('Mandate'));
      assert.ok(mandate);
      const chips = descendants(mandate, (node) => node.className.split(' ').includes('chip'));
      assert.equal(chips.length, 1);
      if (status === 'confirmed') {
        assert.match(chips[0]!.textContent, /^Confirmed /);
        assert.match(chips[0]!.className, /tone-good/);
      } else {
        assert.match(chips[0]!.textContent, status === 'unconfirmed' ? /^Not confirmed:/ : /^Confirmation unknown:/);
        assert.match(chips[0]!.className, /tone-warn/);
        assert.doesNotMatch(chips[0]!.className, /tone-good/);
      }
    }
  }
});
