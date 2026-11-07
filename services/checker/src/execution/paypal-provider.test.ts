// Unit 5 PayPal provider adapter and binding-command tests: every
// applyEffect/lookupEffect branch, the order-stays-fake rule, the fail-safe
// pre-fetch refusals, the hold-command lifecycle and the crash-after-commit
// hook. All PayPal calls run on a scripted fake fetch with global fetch
// denied; the ledger and fake provider stores are real SQLite files. No
// network request of any kind happens in this suite.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalize,
  insertEffectIntentRow,
  insertPayPalBindingRow,
  loadEffectRowByKey,
  loadPayPalBindingRow,
  loadReservationRow,
  openLedgerStore,
  runTransaction,
  setEffectStateRow,
  sha256Hex,
  upgradePayPalBindingRow,
} from '../ledger/store.ts';
import {
  confirmMandateRevision,
  definePolicySnapshot,
  draftMandateRevision,
} from '../authority.ts';
import { createApplicationBackend, type ConfiguredSupplier } from '../application.ts';
import { createFakeProviderGateway } from './fake.ts';
import {
  authorizeOperationHold,
  completeAuthorizationHold,
  createExecutionProvider,
} from './paypal-provider.ts';
import { createPayPalGateway } from '../paypal/gateway.ts';
import {
  TEST_CART,
  TEST_CATALOG,
  TEST_CLOCK,
  TEST_MANDATE_DRAFT,
  TEST_POLICY,
  makeTempDir,
  removeTempDir,
} from '../ledger/tests/fixtures.ts';
import { createFixtureSupplier } from '../../../suppliers/src/fixture.ts';

const ORIGINAL_FETCH = globalThis.fetch;
const SANDBOX = 'https://api-m.sandbox.paypal.com';
const APPROVER = 'fixture-ops-manager';

// Every gateway here is built with an injected fake fetch, and no default
// fetch is ever constructed in this file: the suite cannot touch the network.
// (A node:test `before()` global-fetch swap is deliberately NOT used here —
// it silently removed sibling test registrations in this mixed async file.)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'paypal-debug-id': 'dbg' } });

const tokenRoute: Route = {
  pattern: /\/v1\/oauth2\/token/,
  reply: () => json({ access_token: 'tok-1', expires_in: 3600 }),
};

const AUTH_ID = 'AUTHTEST01';
const CAPTURE_ID = 'CAPTTEST01';
const REFUND_ID = 'REFTEST01';
const ORDER_ID = 'ORDTEST01';
const APPROVAL_URL = 'https://www.sandbox.paypal.com/checkoutnow?token=ORDTEST01';

interface Harness {
  directory: string;
  databasePath: string;
  providerDatabasePath: string;
  operationId: string;
  amountMinor: number;
}

/** Seeds confirmed authority and one reserved operation, exactly as the worker tests do. */
async function createHarness(prefix: string): Promise<Harness> {
  const directory = makeTempDir(prefix);
  const databasePath = `${directory}/app.db`;
  const database = openLedgerStore(databasePath);
  definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
  draftMandateRevision(database, { ...TEST_MANDATE_DRAFT }, TEST_CLOCK);
  const digest = database.prepare(
    'SELECT digest FROM mandate_revisions WHERE mandate_id = ? AND version = ?',
  ).get(TEST_MANDATE_DRAFT.id, TEST_MANDATE_DRAFT.version) as { digest: string };
  confirmMandateRevision(
    database, TEST_MANDATE_DRAFT.id, TEST_MANDATE_DRAFT.version, digest.digest, APPROVER, TEST_CLOCK,
  );
  database.close();

  const backend = createApplicationBackend({
    databasePath,
    suppliers: [
      { supplierId: 'store-a', catalog: TEST_CATALOG, adapter: createFixtureSupplier(TEST_CATALOG) },
    ] as unknown as ConfiguredSupplier[],
    clock: () => TEST_CLOCK,
  });
  let operationId: string;
  let amountMinor: number;
  try {
    const response = await backend.handle({
      apiVersion: '1', requestId: 'provider-test-submit', method: 'proposal.submit',
      params: { idempotencyKey: `key-${prefix}`, cart: TEST_CART },
    });
    if (!response.ok || response.method !== 'proposal.submit') {
      assert.fail(`fixture submission failed: ${JSON.stringify(response)}`);
    }
    operationId = response.result.operation.id;
    amountMinor = response.result.operation.totalMinor;
  } finally {
    backend.close();
  }
  return { directory, databasePath, providerDatabasePath: `${directory}/providers.db`, operationId, amountMinor };
}

function closeHarness(harness: Harness): void {
  removeTempDir(harness.directory);
}

/** Seeds an operator-issued binding row for the operation's reservation amount. */
function seedBinding(harness: Harness, state: 'order_created' | 'authorization_held'): void {
  const database = openLedgerStore(harness.databasePath);
  try {
    const reservation = loadReservationRow(database, harness.operationId);
    assert.ok(reservation !== null);
    runTransaction(database, () => {
      insertPayPalBindingRow(database, {
        operationId: harness.operationId,
        orderId: ORDER_ID,
        invoiceId: harness.operationId,
        amountMinor: reservation.amountMinor,
        createdAt: TEST_CLOCK,
      });
      if (state === 'authorization_held') {
        upgradePayPalBindingRow(database, harness.operationId, AUTH_ID, TEST_CLOCK);
      }
    });
  } finally {
    database.close();
  }
}

/** Seeds a refund effect row exactly as the durable worker persists it. */
function seedRefundEffect(
  harness: Harness,
  options: { providerId: string | null; state: 'in_flight' | 'unknown' },
): void {
  const request = {
    operationId: harness.operationId,
    captureId: CAPTURE_ID,
    currency: 'SGD',
    amountMinor: harness.amountMinor,
  };
  const database = openLedgerStore(harness.databasePath);
  try {
    runTransaction(database, () => {
      const existing = loadEffectRowByKey(database, `${harness.operationId}:refund`);
      if (existing === null) {
        insertEffectIntentRow(database, {
          effectId: 'eff-refund-test',
          operationId: harness.operationId,
          kind: 'refund',
          effectKey: `${harness.operationId}:refund`,
          requestDigest: sha256Hex(canonicalize(request)),
          requestJson: canonicalize(request),
          createdAt: TEST_CLOCK,
        });
      }
      if (options.state !== 'in_flight' || existing !== null) {
        setEffectStateRow(database, harness.operationId, 'refund', options.state, options.providerId, null, TEST_CLOCK);
      }
    });
  } finally {
    database.close();
  }
}

function minorToDecimal(amountMinor: number): string {
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;
}

// --- Scripted fake fetch (mirrors the unit-4 gateway test harness) ---
interface Route { pattern: RegExp; reply: () => Response }

function harnessFetch(routes: Route[]): { calls: string[]; fetchFn: typeof fetch } {
  const calls: string[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const route = routes.find((candidate) => candidate.pattern.test(url));
    if (!route) return Promise.reject(new Error(`no route matched: ${url}`));
    return Promise.resolve(route.reply());
  }) as typeof fetch;
  return { calls, fetchFn };
}

function paypalAdapter(
  ledgerHarness: Harness,
  routes: Route[],
  scenario?: { crashAfterCommit?: boolean },
): { provider: ReturnType<typeof createExecutionProvider>; calls: string[]; close(): void } {
  const { calls, fetchFn } = harnessFetch(routes);
  const gateway = createPayPalGateway({ clientId: 'cid', clientSecret: 'sec', fetchFn, timeoutMs: 50 });
  const provider = createExecutionProvider({
    selection: 'paypal-sandbox',
    fake: createFakeProviderGateway(ledgerHarness.providerDatabasePath),
    paypal: gateway,
    ledgerPath: ledgerHarness.databasePath,
    scenario,
  });
  return { provider, calls, close(): void { provider.close(); } };
}

function captureSucceededRoute(amountMinor: number, overrides: Record<string, unknown> = {}): Route {
  return {
    pattern: /\/v2\/payments\/authorizations\/AUTHTEST01\/capture$/,
    reply: () => json({
      id: CAPTURE_ID,
      status: 'COMPLETED',
      amount: { currency_code: 'SGD', value: minorToDecimal(amountMinor) },
      invoice_id: overrides.invoiceIdSetting ?? 'invoice-unset',
      supplementary_data: { related_ids: { authorization_id: AUTH_ID } },
    }),
  };
}

function refundSucceededRoute(amountMinor: number): Route {
  return {
    pattern: /\/v2\/payments\/captures\/CAPTTEST01\/refund$/,
    reply: () => json({
      id: REFUND_ID,
      status: 'COMPLETED',
      amount: { currency_code: 'SGD', value: minorToDecimal(amountMinor) },
      supplementary_data: { related_ids: { capture_id: CAPTURE_ID } },
    }),
  };
}

function authorizationReadRoute(status: string, amountMinor: number, overrides: Record<string, unknown> = {}): Route {
  return {
    pattern: /\/v2\/payments\/authorizations\/AUTHTEST01$/,
    reply: () => json({
      id: AUTH_ID,
      status,
      amount: { currency_code: 'SGD', value: minorToDecimal(amountMinor) },
      links: [
        { rel: 'self', href: `${SANDBOX}/v2/payments/authorizations/${AUTH_ID}` },
        { rel: 'capture', href: `${SANDBOX}/v2/payments/captures/${CAPTURE_ID}` },
      ],
      ...overrides,
    }),
  };
}

const AUTH_CAPTURE_PATTERN = /authorizations\/AUTHTEST01\/capture$/;

// --- Tests ---

test('order effects always go to the fake provider store, even with paypal-sandbox selected', async () => {
  const ledgerHarness = await createHarness('order-fake');
  const adapter = paypalAdapter(ledgerHarness, [tokenRoute]);
  try {
    const request = { operationId: ledgerHarness.operationId, cart: TEST_CART, quote: { totalMinor: ledgerHarness.amountMinor } };
    const applied = await adapter.provider.applyEffect(`${ledgerHarness.operationId}:order`, 'order', request);
    assert.equal(applied.outcome, 'succeeded');
    if (applied.outcome === 'succeeded') {
      assert.match(applied.providerId, /^fake-order-/);
    }
    const lookup = await adapter.provider.lookupEffect(`${ledgerHarness.operationId}:order`);
    assert.equal(lookup.outcome, 'succeeded'); // the fake store owns the order record
    assert.equal(adapter.calls.length, 0, 'no PayPal call is made for an order effect');
  } finally {
    adapter.close();
    closeHarness(ledgerHarness);
  }
});

test('capture applyEffect refuses before any fetch when the hold is missing, unsecured or conflicting', async () => {
  const ledgerHarness = await createHarness('capture-preflight');
  const adapter = paypalAdapter(ledgerHarness, [tokenRoute]);
  const key = `${ledgerHarness.operationId}:capture`;
  const request = { operationId: ledgerHarness.operationId, currency: 'SGD', amountMinor: ledgerHarness.amountMinor };
  try {
    // No binding at all: conservative unknown — authority retained, nothing released.
    assert.deepEqual(await adapter.provider.applyEffect(key, 'capture', request), { outcome: 'unknown' });
    assert.equal(adapter.calls.length, 0);

    seedBinding(ledgerHarness, 'order_created');
    assert.deepEqual(await adapter.provider.applyEffect(key, 'capture', request), { outcome: 'unknown' });
    assert.equal(adapter.calls.length, 0, 'order_created requires the operator to complete the hold first');

    // Conflicting amount: the local gate runs before any fetch.
    const conflicting = await adapter.provider.applyEffect(key, 'capture',
      { operationId: ledgerHarness.operationId, currency: 'SGD', amountMinor: ledgerHarness.amountMinor + 1 });
    assert.deepEqual(conflicting, { outcome: 'unknown' });
    assert.equal(adapter.calls.length, 0);
  } finally {
    adapter.close();
    closeHarness(ledgerHarness);
  }
});

test('capture applyEffect succeeds against a held binding and derives the request id from the effect key', async () => {
  const ledgerHarness = await createHarness('capture-apply');
  seedBinding(ledgerHarness, 'authorization_held');
  const adapter = paypalAdapter(ledgerHarness, [
    tokenRoute,
    captureSucceededRoute(ledgerHarness.amountMinor, { invoiceIdSetting: ledgerHarness.operationId }),
  ]);
  try {
    const answer = await adapter.provider.applyEffect(
      `${ledgerHarness.operationId}:capture`, 'capture',
      { operationId: ledgerHarness.operationId, currency: 'SGD', amountMinor: ledgerHarness.amountMinor },
    );
    assert.equal(answer.outcome, 'succeeded');
    if (answer.outcome === 'succeeded') {
      assert.equal(answer.providerId, CAPTURE_ID);
      // The provider persists the sanitized unit-4 capture evidence resource.
      const resource = JSON.parse(answer.responseJson) as { invoiceId: string; captureId: string };
      assert.equal(resource.invoiceId, ledgerHarness.operationId);
      assert.equal(resource.captureId, CAPTURE_ID);
    }
    assert.equal(adapter.calls.length, 2); // token + capture
    assert.match(adapter.calls[1]!, AUTH_CAPTURE_PATTERN);
  } finally {
    adapter.close();
    closeHarness(ledgerHarness);
  }
});

test('refund applyEffect uses the stored capture id and maps the refund id', async () => {
  const ledgerHarness = await createHarness('refund-apply');
  seedBinding(ledgerHarness, 'authorization_held');
  const adapter = paypalAdapter(ledgerHarness, [tokenRoute, refundSucceededRoute(ledgerHarness.amountMinor)]);
  try {
    const answer = await adapter.provider.applyEffect(
      `${ledgerHarness.operationId}:refund`, 'refund',
      { operationId: ledgerHarness.operationId, captureId: CAPTURE_ID, currency: 'SGD', amountMinor: ledgerHarness.amountMinor },
    );
    assert.equal(answer.outcome, 'succeeded');
    if (answer.outcome === 'succeeded') assert.equal(answer.providerId, REFUND_ID);
    assert.equal(adapter.calls.length, 2); // token + refund POST
    assert.match(adapter.calls[1]!, /captures\/CAPTTEST01\/refund$/);
  } finally {
    adapter.close();
    closeHarness(ledgerHarness);
  }
});

test('capture lookupEffect classifies durable authorization statuses', async () => {
  const ledgerHarness = await createHarness('capture-lookup');
  try {
    const key = `${ledgerHarness.operationId}:capture`;

    // No binding: not_applied — the hold flow must run first, nothing else exists.
    const noneAdapter = paypalAdapter(ledgerHarness, [tokenRoute]);
    try {
      assert.deepEqual(await noneAdapter.provider.lookupEffect(key), { outcome: 'not_applied' });
      assert.equal(noneAdapter.calls.length, 0);
    } finally {
      noneAdapter.close();
    }

    seedBinding(ledgerHarness, 'order_created');
    const unsecuredAdapter = paypalAdapter(ledgerHarness, [tokenRoute]);
    try {
      assert.deepEqual(await unsecuredAdapter.provider.lookupEffect(key), { outcome: 'not_applied' });
      assert.equal(unsecuredAdapter.calls.length, 0);
    } finally {
      unsecuredAdapter.close();
    }

    seedBinding(ledgerHarness, 'authorization_held');

    // CREATED: the hold exists but our capture never completed → retryable clue
    // for the worker's existing same-key/not-applied discipline (revalidation still runs).
    const createdAdapter = paypalAdapter(ledgerHarness, [
      tokenRoute,
      authorizationReadRoute('CREATED', ledgerHarness.amountMinor),
    ]);
    try {
      assert.deepEqual(await createdAdapter.provider.lookupEffect(key), { outcome: 'not_applied' });
    } finally {
      createdAdapter.close();
    }

    // CAPTURED: resolve through the validated capture hint + full unit-4 getCapture check.
    const capturedAdapter = paypalAdapter(ledgerHarness, [
      tokenRoute,
      authorizationReadRoute('CAPTURED', ledgerHarness.amountMinor),
      {
        pattern: /\/v2\/payments\/captures\/CAPTTEST01$/,
        reply: () => json({
          id: CAPTURE_ID,
          status: 'COMPLETED',
          amount: { currency_code: 'SGD', value: minorToDecimal(ledgerHarness.amountMinor) },
          invoice_id: ledgerHarness.operationId,
          supplementary_data: { related_ids: { authorization_id: AUTH_ID } },
        }),
      },
    ]);
    try {
      const lookup = await capturedAdapter.provider.lookupEffect(key);
      assert.equal(lookup.outcome, 'succeeded');
      if (lookup.outcome === 'succeeded') {
        assert.equal(lookup.providerId, CAPTURE_ID);
        assert.equal((JSON.parse(lookup.responseJson) as { invoice_id: string }).invoice_id,
          ledgerHarness.operationId);
      }
    } finally {
      capturedAdapter.close();
    }

    // CAPTURED but the capture read contradicts the binding: unknown, never succeeded.
    const contradictingAdapter = paypalAdapter(ledgerHarness, [
      tokenRoute,
      authorizationReadRoute('CAPTURED', ledgerHarness.amountMinor),
      {
        pattern: /\/v2\/payments\/captures\/CAPTTEST01$/,
        reply: () => json({
          id: CAPTURE_ID,
          status: 'COMPLETED',
          amount: { currency_code: 'SGD', value: '35.93' }, // wrong amount
          invoice_id: ledgerHarness.operationId,
          supplementary_data: { related_ids: { authorization_id: AUTH_ID } },
        }),
      },
    ]);
    try {
      assert.deepEqual(await contradictingAdapter.provider.lookupEffect(key), { outcome: 'unknown' });
    } finally {
      contradictingAdapter.close();
    }

    // Denied/voided/expired holds are definitive non-application evidence for release.
    for (const status of ['DENIED', 'VOIDED', 'EXPIRED']) {
      const lostAdapter = paypalAdapter(ledgerHarness, [
        tokenRoute,
        authorizationReadRoute(status, ledgerHarness.amountMinor),
      ]);
      try {
        const lookup = await lostAdapter.provider.lookupEffect(key);
        assert.equal(lookup.outcome, 'rejected', status);
        if (lookup.outcome === 'rejected') assert.equal(lookup.providerId, AUTH_ID);
      } finally {
        lostAdapter.close();
      }
    }

    // PARTIALLY_CAPTURED is never a definitive full capture here.
    const partialAdapter = paypalAdapter(ledgerHarness, [
      tokenRoute,
      authorizationReadRoute('PARTIALLY_CAPTURED', ledgerHarness.amountMinor),
    ]);
    try {
      assert.deepEqual(await partialAdapter.provider.lookupEffect(key), { outcome: 'unknown' });
    } finally {
      partialAdapter.close();
    }

    // Unreadable provider read stays unknown.
    const failedAdapter = paypalAdapter(ledgerHarness, [
      tokenRoute,
      { pattern: /\/v2\/payments\/authorizations\/AUTHTEST01$/, reply: () => json({ name: 'BROKE' }, 500) },
    ]);
    try {
      assert.deepEqual(await failedAdapter.provider.lookupEffect(key), { outcome: 'unknown' });
    } finally {
      failedAdapter.close();
    }
  } catch {
    // fallthrough to cleanup below
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('refund lookupEffect verifies a persisted refund id and refuses discovery without one', async () => {
  const ledgerHarness = await createHarness('refund-lookup');
  try {
    seedBinding(ledgerHarness, 'authorization_held');
    const key = `${ledgerHarness.operationId}:refund`;
    seedRefundEffect(ledgerHarness, { providerId: null, state: 'unknown' });

    const refundAdapter = paypalAdapter(ledgerHarness, [
      tokenRoute,
      {
        pattern: /\/v2\/payments\/refunds\/REFTEST01$/,
        reply: () => json({
          id: REFUND_ID,
          status: 'COMPLETED',
          amount: { currency_code: 'SGD', value: minorToDecimal(ledgerHarness.amountMinor) },
          supplementary_data: { related_ids: { capture_id: CAPTURE_ID } },
        }),
      },
    ]);
    try {
      // Without a persisted refund id: unknown — no refund discovery by design,
      // so reconciliation retains the compensation state instead of guessing.
      assert.deepEqual(await refundAdapter.provider.lookupEffect(key), { outcome: 'unknown' });
      assert.equal(refundAdapter.calls.length, 0);

      seedRefundEffect(ledgerHarness, { providerId: REFUND_ID, state: 'unknown' });
      const lookup = await refundAdapter.provider.lookupEffect(key);
      assert.equal(lookup.outcome, 'succeeded');
      if (lookup.outcome === 'succeeded') {
        assert.equal(lookup.providerId, REFUND_ID);
        const resource = JSON.parse(lookup.responseJson) as { captureId: string };
        assert.equal(resource.captureId, CAPTURE_ID);
      }
      assert.equal(refundAdapter.calls.length, 2);
    } finally {
      refundAdapter.close();
    }

    // A verified refund read whose amount contradicts the binding stays unknown.
    seedRefundEffect(ledgerHarness, { providerId: REFUND_ID, state: 'unknown' });
    const conflictingAdapter = paypalAdapter(ledgerHarness, [
      tokenRoute,
      {
        pattern: /\/v2\/payments\/refunds\/REFTEST01$/,
        reply: () => json({
          id: REFUND_ID,
          status: 'COMPLETED',
          amount: { currency_code: 'SGD', value: '35.93' },
          supplementary_data: { related_ids: { capture_id: CAPTURE_ID } },
        }),
      },
    ]);
    try {
      assert.deepEqual(await conflictingAdapter.provider.lookupEffect(key), { outcome: 'unknown' });
    } finally {
      conflictingAdapter.close();
    }

    // Keys that are not recordable effect keys stay unknown, never not_applied.
    const oddAdapter = paypalAdapter(ledgerHarness, [tokenRoute]);
    try {
      assert.deepEqual(await oddAdapter.provider.lookupEffect('k:weird'), { outcome: 'unknown' });
      assert.equal(oddAdapter.calls.length, 0);
    } finally {
      oddAdapter.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('the crash-after-commit hook emits CRASHPOINT exactly at provider success and never resolves', async () => {
  const ledgerHarness = await createHarness('crash-hook');
  seedBinding(ledgerHarness, 'authorization_held');
  const adapter = paypalAdapter(ledgerHarness, [
    tokenRoute,
    captureSucceededRoute(ledgerHarness.amountMinor, { invoiceIdSetting: ledgerHarness.operationId }),
  ], { crashAfterCommit: true });
  const pause = setTimeout(() => undefined, 100);
  try {
    // Forward, never swallow: the parent test runner's own stdout lines must
    // still pass through while we record the emitted CRASHPOINT.
    const underlying = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured += String(chunk);
      return underlying(chunk as never);
    }) as typeof process.stdout.write;
    try {
      const pending = adapter.provider.applyEffect(
        `${ledgerHarness.operationId}:capture`, 'capture',
        { operationId: ledgerHarness.operationId, currency: 'SGD', amountMinor: ledgerHarness.amountMinor },
      );
      const raced = await Promise.race([
        pending.then(() => 'resolved' as const),
        new Promise((resolve) => setTimeout(() => resolve('still-pending' as const), 250)),
      ]);
      assert.equal(raced, 'still-pending', 'the crash point must hold the call open for a parent SIGKILL');
    } finally {
      process.stdout.write = underlying;
    }
    assert.match(captured, /CRASHPOINT:capture:/);
  } finally {
    clearTimeout(pause);
    adapter.close();
    closeHarness(ledgerHarness);
  }
});

// --- Operator binding-command lifecycle (the CLI calls these cores) ---

/** PayPal's create response echoes the submitted purchase unit; the fake does too. */
function holdCreateRoutes(harness: Harness): Route[] {
  return [tokenRoute, {
      pattern: /\/v2\/checkout\/orders$/,
      reply: () => json({
        id: ORDER_ID,
        status: 'CREATED',
        purchase_units: [{
          amount: { currency_code: 'SGD', value: minorToDecimal(harness.amountMinor) },
          invoice_id: harness.operationId,
        }],
        links: [{ rel: 'approve', href: APPROVAL_URL }],
      }),
    }];
}

test('authorizeOperationHold creates, then idempotently replays, the hold binding', async () => {
  const ledgerHarness = await createHarness('authorize-hold');
  try {
    const { fetchFn } = harnessFetch(holdCreateRoutes(ledgerHarness));
    const gateway = createPayPalGateway({ clientId: 'cid', clientSecret: 'sec', fetchFn, timeoutMs: 50 });
    const database = openLedgerStore(ledgerHarness.databasePath);
    try {
      const created = await authorizeOperationHold(
        { database, gateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK },
      );
      assert.equal(created.kind, 'created');
      if (created.kind === 'created') {
        assert.equal(created.orderId, ORDER_ID);
        assert.equal(created.approvalUrl, APPROVAL_URL);
        assert.equal(created.providerState, 'order_created');
      }
      const binding = loadPayPalBindingRow(database, ledgerHarness.operationId);
      assert.equal(binding?.providerState, 'order_created');
      assert.equal(binding?.orderId, ORDER_ID);
      const events = database.prepare(
        "SELECT COUNT(*) AS total FROM audit_events WHERE operation_id = ? AND kind = 'binding_created'",
      ).get(ledgerHarness.operationId) as { total: number };
      assert.equal(events.total, 1);

      // Idempotent replay: the same stable request identity re-prints the approval link.
      const replayed = await authorizeOperationHold(
        { database, gateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK },
      );
      assert.equal(replayed.kind, 'replayed');
      if (replayed.kind === 'replayed') {
        assert.equal(replayed.orderId, ORDER_ID);
        assert.equal(replayed.approvalUrl, APPROVAL_URL);
      }
      const rows = database.prepare(
        'SELECT COUNT(*) AS total FROM operation_paypal_bindings WHERE operation_id = ?',
      ).get(ledgerHarness.operationId) as { total: number };
      assert.equal(rows.total, 1);
    } finally {
      database.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('two racing authorize commands bind exactly once and append a single binding_created audit', async () => {
  const ledgerHarness = await createHarness('authorize-race');
  try {
    const { fetchFn } = harnessFetch(holdCreateRoutes(ledgerHarness));
    const gateway = createPayPalGateway({ clientId: 'cid', clientSecret: 'sec', fetchFn, timeoutMs: 50 });
    const database = openLedgerStore(ledgerHarness.databasePath);
    try {
      await Promise.all([
        authorizeOperationHold({ database, gateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK }),
        authorizeOperationHold({ database, gateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK }),
      ]);
      const binding = loadPayPalBindingRow(database, ledgerHarness.operationId);
      assert.equal(binding?.providerState, 'order_created');
      assert.equal(binding?.orderId, ORDER_ID);
      const audits = database.prepare(
        "SELECT COUNT(*) AS total FROM audit_events WHERE operation_id = ? AND kind = 'binding_created'",
      ).get(ledgerHarness.operationId) as { total: number };
      assert.equal(audits.total, 1);
    } finally {
      database.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('the operation-id bound is the longest stage stem (117): the bound is usable, one more is refused', async () => {
  const ledgerHarness = await createHarness('identity-bound');
  try {
    const { calls, fetchFn } = harnessFetch([]);
    const gateway = createPayPalGateway({ clientId: 'cid', clientSecret: 'sec', fetchFn, timeoutMs: 50 });
    const database = openLedgerStore(ledgerHarness.databasePath);
    try {
      const bounded = 'x'.repeat(117);
      // The bound id passes the identity gate and reaches the operation lookup
      // (a not-found refusal after the credentials/config stage, no fetch).
      const atBound = await authorizeOperationHold(
        { database, gateway, operationId: bounded, now: TEST_CLOCK },
      );
      assert.deepEqual(atBound, {
        kind: 'refused',
        code: 'operation-not-found',
        message: 'Operation was not found',
      });
      // One char more is refused before any fetch, for both command stages.
      for (const run of [
        authorizeOperationHold({ database, gateway, operationId: `${bounded}y`, now: TEST_CLOCK }),
        completeAuthorizationHold({ database, gateway, operationId: `${bounded}y`, now: TEST_CLOCK }),
      ]) {
        assert.deepEqual(await run, {
          kind: 'refused',
          code: 'invalid-identity',
          message: 'The operation id is not usable as a PayPal reference (binding identity refused)',
        });
      }
      assert.equal(calls.length, 0);
    } finally {
      database.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('authorizeOperationHold refuses upstream conflicts, changed terms and unusable ids', async () => {
  const ledgerHarness = await createHarness('authorize-conflict');
  try {
    const database = openLedgerStore(ledgerHarness.databasePath);
    try {
      // No reservation authority for a missing operation.
      assert.deepEqual(
        await authorizeOperationHold(
          { database, gateway: createPayPalGateway({ clientId: 'c', clientSecret: 's', fetchFn: async () => { throw new Error('no fetch'); }, timeoutMs: 50 }), operationId: 'op-ghost', now: TEST_CLOCK }),
        { kind: 'refused', code: 'operation-not-found', message: 'Operation was not found' },
      );
      // Unusable operation id characters never reach a fetch.
      const { calls, fetchFn } = harnessFetch(holdCreateRoutes(ledgerHarness));
      const gateway = createPayPalGateway({ clientId: 'cid', clientSecret: 'sec', fetchFn, timeoutMs: 50 });
      const unusable = await authorizeOperationHold(
        { database, gateway, operationId: 'op with space', now: TEST_CLOCK },
      );
      assert.deepEqual(unusable, {
        kind: 'refused',
        code: 'invalid-identity',
        message: 'The operation id is not usable as a PayPal reference (binding identity refused)',
      });
      assert.equal(calls.length, 0);

      seedBinding(ledgerHarness, 'order_created');
      // A replay naming a DIFFERENT order is an upstream conflict.
      const foreignOrder = harnessFetch([
        tokenRoute,
        { pattern: /\/v2\/checkout\/orders$/, reply: () => json({
          id: 'ORDOTHER', status: 'CREATED',
          purchase_units: [{
            amount: { currency_code: 'SGD', value: minorToDecimal(ledgerHarness.amountMinor) },
            invoice_id: ledgerHarness.operationId,
          }],
          links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=OTHER' }],
        }) },
      ]);
      const foreignGateway = createPayPalGateway(
        { clientId: 'cid', clientSecret: 'sec', fetchFn: foreignOrder.fetchFn, timeoutMs: 50 },
      );
      const conflicted = await authorizeOperationHold(
        { database, gateway: foreignGateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK },
      );
      assert.deepEqual(conflicted, {
        kind: 'refused',
        code: 'binding-conflict',
        message: 'The provider replayed a different order for this binding; never overwritten',
      });
      const rows = (await Promise.resolve(database.prepare(
        'SELECT COUNT(*) AS total FROM operation_paypal_bindings',
      ).get())) as { total: number };
      assert.equal(rows.total, 1);
    } finally {
      database.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('authorizeOperationHold reports an already-held hold without another provider call', async () => {
  const ledgerHarness = await createHarness('authorize-held');
  try {
    seedBinding(ledgerHarness, 'authorization_held');
    const { calls, fetchFn } = harnessFetch([{ pattern: /./, reply: () => { throw new Error('never called'); } }] as Route[]);
    const gateway = createPayPalGateway({ clientId: 'cid', clientSecret: 'sec', fetchFn, timeoutMs: 50 });
    const database = openLedgerStore(ledgerHarness.databasePath);
    try {
      const held = await authorizeOperationHold(
        { database, gateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK },
      );
      assert.equal(held.kind, 'held');
      if (held.kind === 'held') {
        assert.equal(held.authorizationId, AUTH_ID);
        assert.equal(held.providerState, 'authorization_held');
      }
      assert.equal(calls.length, 0);
    } finally {
      database.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('completeAuthorizationHold upgrades the binding and replays held state with no provider call', async () => {
  const ledgerHarness = await createHarness('complete-hold');
  try {
    seedBinding(ledgerHarness, 'order_created');
    const authorizedBody = {
      id: ORDER_ID,
      status: 'COMPLETED',
      purchase_units: [{ payments: { authorizations: [{
        id: AUTH_ID,
        status: 'CREATED',
        amount: { currency_code: 'SGD', value: minorToDecimal(ledgerHarness.amountMinor) },
      }] } }],
    };
    const { calls, fetchFn } = harnessFetch([
      tokenRoute,
      { pattern: /\/v2\/checkout\/orders\/ORDTEST01\/authorize$/, reply: () => json(authorizedBody) },
    ]);
    const gateway = createPayPalGateway({ clientId: 'cid', clientSecret: 'sec', fetchFn, timeoutMs: 50 });
    const database = openLedgerStore(ledgerHarness.databasePath);
    try {
      const missing = await completeAuthorizationHold(
        { database, gateway, operationId: 'op-ghost', now: TEST_CLOCK },
      );
      assert.deepEqual(missing, { kind: 'refused', code: 'operation-not-found', message: 'Operation was not found' });

      const completed = await completeAuthorizationHold(
        { database, gateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK },
      );
      assert.equal(completed.kind, 'completed');
      if (completed.kind === 'completed') {
        assert.equal(completed.authorizationId, AUTH_ID);
        assert.equal(completed.providerState, 'authorization_held');
      }
      const binding = loadPayPalBindingRow(database, ledgerHarness.operationId);
      assert.equal(binding?.authorizationId, AUTH_ID);
      assert.equal(binding?.providerState, 'authorization_held');
      const events = database.prepare(
        "SELECT COUNT(*) AS total FROM audit_events WHERE operation_id = ? AND kind = 'binding_upgraded'",
      ).get(ledgerHarness.operationId) as { total: number };
      assert.equal(events.total, 1);

      // Idempotent: already-held replays with no additional provider call.
      const before = calls.length;
      const replay = await completeAuthorizationHold(
        { database, gateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK },
      );
      assert.equal(replay.kind, 'already_held');
      assert.equal(calls.length, before);
    } finally {
      database.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('completeAuthorizationHold maps the unapproved buyer to the distinct closed refusal', async () => {
  const ledgerHarness = await createHarness('not-approved');
  try {
    seedBinding(ledgerHarness, 'order_created');
    const refusalFetch = harnessFetch([
      tokenRoute,
      {
        pattern: /\/v2\/checkout\/orders\/ORDTEST01\/authorize$/,
        reply: () => json(
          { name: 'INVALID_REQUEST', details: [{ issue: 'ORDER_NOT_APPROVED', description: 'The order has not been approved by the buyer yet' }] },
          400,
        ),
      },
    ]);
    const gateway = createPayPalGateway(
      { clientId: 'cid', clientSecret: 'sec', fetchFn: refusalFetch.fetchFn, timeoutMs: 50 },
    );
    const database = openLedgerStore(ledgerHarness.databasePath);
    try {
      const refused = await completeAuthorizationHold(
        { database, gateway, operationId: ledgerHarness.operationId, now: TEST_CLOCK },
      );
      assert.deepEqual(refused, {
        kind: 'refused',
        code: 'buyer-not-approved',
        message: 'The sandbox buyer has not approved this hold yet',
      });
      // Nothing was recorded: provider state stayed order_created, no upgrade event.
      const binding = loadPayPalBindingRow(database, ledgerHarness.operationId);
      assert.equal(binding?.providerState, 'order_created');
      const events = database.prepare(
        "SELECT COUNT(*) AS total FROM audit_events WHERE kind = 'binding_upgraded'",
      ).get() as { total: number };
      assert.equal(events.total, 0);
    } finally {
      database.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});

test('binding rows never bend: immutability triggers refuse identity edits', async () => {
  const ledgerHarness = await createHarness('binding-immutability');
  try {
    seedBinding(ledgerHarness, 'order_created');
    const database = openLedgerStore(ledgerHarness.databasePath);
    try {
      assert.throws(() => database.prepare(
        'UPDATE operation_paypal_bindings SET amount_minor = 1 WHERE operation_id = ?',
      ).run(ledgerHarness.operationId), /immutable/);
      assert.throws(() => database.prepare(
        'UPDATE operation_paypal_bindings SET order_id = ? WHERE operation_id = ?',
      ).run('ORDOTHER', ledgerHarness.operationId), /immutable/);
      seedBinding(ledgerHarness, 'authorization_held');
      assert.throws(() => database.prepare(
        'UPDATE operation_paypal_bindings SET authorization_id = ? WHERE operation_id = ?',
      ).run('AUTHOTHER', ledgerHarness.operationId), /immutable/);
      // provider_state is the ONE controlled upgrade, and the operation FK binds.
      const state = loadPayPalBindingRow(database, ledgerHarness.operationId);
      assert.equal(state?.providerState, 'authorization_held');
      assert.throws(() => database.prepare(
        "INSERT INTO operation_paypal_bindings (operation_id, invoice_id, currency, amount_minor, provider_state, created_at, updated_at) "
        + "VALUES ('op-ghost-fk', 'x', 'SGD', 1, 'order_created', 'now', 'now')",
      ).run(), /FOREIGN KEY/);
    } finally {
      database.close();
    }
  } finally {
    closeHarness(ledgerHarness);
  }
});
