import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBackendClient, type BackendTransport } from '../../../packages/contracts/src/client.ts';
import { CatalogSchema, MandateSchema, PolicySchema, type Catalog } from '../../../packages/contracts/src/index.ts';
import { BackendSessionError, createBackendShoppingSession } from '../../../services/agent/src/backend-session.ts';
import { createMandateDraft } from '../../../services/agent/src/mandate.ts';
import { createScriptedModel, type ModelToolResult, type ScriptedStep } from '../../../services/agent/src/model.ts';
import { runShoppingWorker } from '../../../services/agent/src/worker.ts';
import { createApplicationBackend } from '../../../services/checker/src/application.ts';
import { confirmMandateRevision, definePolicySnapshot, draftMandateRevision } from '../../../services/checker/src/authority.ts';
import { openLedgerStore } from '../../../services/checker/src/ledger/store.ts';
import { evaluatePurchase } from '../../../services/checker/src/rules/evaluate.ts';
import { applyFixtureChanges } from '../../../services/suppliers/src/control.ts';
import { createFixtureSupplier } from '../../../services/suppliers/src/fixture.ts';

// Both halves together: the shopper worker against the real checker core and a real
// SQLite ledger, using a scripted model. The transport below opens a fresh backend per
// request, as `rpc` does. The in-process wiring is test-only: the shopper itself loads
// no checker code (see boundary.test.ts).

const root = fileURLToPath(new URL('../../../', import.meta.url));
const shopEntry = join(root, 'apps/cli/src/shop.ts');
const NOW = '2026-11-04T09:00:00Z';
const runId = 'run';

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}
const policy = PolicySchema.parse(fixture('config/policies/hardware.example.json'));
const kit = fixture('services/agent/fixtures/engineering-kit.json');
const request = fixture('services/agent/fixtures/demo-hire-request.json') as { id: string };
const storeA = (): Catalog => CatalogSchema.parse(fixture('services/suppliers/fixtures/store-a.json'));
const storeB = (): Catalog => CatalogSchema.parse(fixture('services/suppliers/fixtures/store-b.json'));
const hostileB = (): Catalog => CatalogSchema.parse(fixture('services/suppliers/fixtures/store-b-hostile.json'));
const mandateId = request.id;

const laptops = (quantity = 5, sku = 'LAP-14-AIR') => ({ requirementId: 'engineering-laptops', sku, quantity });
const monitors = (quantity = 5) => ({ requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity });
const build = (supplierId: string, lines: unknown[]) => ({ tool: 'cart.build', args: { supplierId, lines } });
const submit = (cartNumber: number, id = runId) => ({ tool: 'cart.submit', args: { cartId: `${id}-cart-${cartNumber}` } });

function ledger(t: TestContext, initial: Catalog[], options: { confirm?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-shop-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'app.db');
  // The real handoff: the agent's draft proposal is what the checker stores and confirms.
  const { proposal } = createMandateDraft(policy, request, kit, NOW);
  const database = openLedgerStore(databasePath);
  definePolicySnapshot(database, policy, NOW);
  const { digest } = draftMandateRevision(database, proposal, NOW);
  if (options.confirm !== false) confirmMandateRevision(database, mandateId, 1, digest, 'test-operator', NOW);
  database.close();

  const catalogs = new Map(initial.map((catalog) => [catalog.supplierId, catalog]));
  const transport: BackendTransport = async (rpc) => {
    const backend = createApplicationBackend({
      databasePath,
      clock: () => NOW,
      suppliers: [...catalogs.values()].map((catalog) => ({
        supplierId: catalog.supplierId, catalog, adapter: createFixtureSupplier(catalog),
      })),
    });
    try {
      return await backend.handle(rpc);
    } finally {
      backend.close();
    }
  };
  /** The control panel: changes supplier state between tool calls. */
  const control = (supplierId: string, changes: unknown) => {
    catalogs.set(supplierId, applyFixtureChanges(catalogs.get(supplierId), changes, NOW));
  };
  const totals = async () => {
    const response = await createBackendClient(transport).request({
      apiVersion: '1', requestId: 'totals', method: 'mandate.get', params: { mandateId },
    });
    if (!response.ok || response.method !== 'mandate.get') assert.fail('Ledger read failed');
    return response.result.snapshot;
  };
  return { transport, control, totals, directory };
}

async function shop(transport: BackendTransport, steps: readonly ScriptedStep[], id = runId) {
  const session = await createBackendShoppingSession({ mandateId, runId: id }, createBackendClient(transport));
  return runShoppingWorker(session, createScriptedModel(steps), { runId: id });
}

function acceptedTotals(report: Awaited<ReturnType<typeof shop>>): number[] {
  return report.progress.accepted.map((receipt) => {
    if (receipt.kind !== 'proposal-accepted') assert.fail();
    return receipt.operation.totalMinor;
  });
}

test('the chosen cart reserves its exact checker-priced total in the real ledger', async (t) => {
  const { transport, totals } = ledger(t, [storeA(), storeB()]);
  const report = await shop(transport, [
    { calls: [
      { tool: 'catalog.search', args: { supplierId: 'store-a', requirementId: 'engineering-laptops' } },
      { tool: 'catalog.search', args: { supplierId: 'store-b', requirementId: 'engineering-laptops' } },
    ] },
    build('store-b', [laptops(), monitors()]),
    submit(1),
  ]);
  assert.equal(report.outcome, 'completed');
  // 5 x 1,049.00 + 5 x 269.00 + 60.00 shipping = 6,650.00, plus 9% tax.
  assert.deepEqual(acceptedTotals(report), [724850]);
  const snapshot = await totals();
  assert.equal(snapshot.reservedMinor, 724850);
  assert.equal(snapshot.committedMinor, 0);
  assert.deepEqual(snapshot.quantities.map(({ reserved }) => reserved), [5, 5]);
  const receipt = report.progress.accepted[0]!;
  if (receipt.kind !== 'proposal-accepted') assert.fail();
  assert.equal(receipt.operation.reservationStatus, 'active');
  assert.equal(receipt.operation.paymentStatus, 'not_started');
  assert.equal(receipt.operation.orderStatus, 'not_started');
  assert.equal(receipt.operation.readinessStatus, 'not_assessed');
});

test('a shipping jump after the estimate is rejected by the checker, and the worker recovers with the alternative', async (t) => {
  const { transport, control, totals } = ledger(t, [storeA(), storeB()]);
  let estimateTotal = 0;
  const report = await shop(transport, [
    build('store-b', [laptops(), monitors()]),
    (results: ModelToolResult[]) => {
      estimateTotal = JSON.parse(results[0]!.content).estimate.totalMinor;
      control('store-b', { shippingMinor: 90000 });
      return submit(1);
    },
    build('store-a', [laptops(), monitors()]),
    submit(2),
  ]);
  assert.equal(estimateTotal, 724850);
  assert.equal(report.outcome, 'completed');
  assert.equal(report.progress.rejected.length, 1);
  assert.equal(report.progress.rejected[0]!.code, 'BUDGET_EXCEEDED');
  assert.ok(report.progress.rejected[0]!.checkCodes.includes('BUDGET'));
  assert.deepEqual(acceptedTotals(report), [751010]);
  assert.equal((await totals()).reservedMinor, 751010);
});

test('a mandate can draw on two suppliers when stock is short, with quantities counted across carts', async (t) => {
  const { transport, control, totals } = ledger(t, [storeA(), storeB()]);
  control('store-a', { product: { sku: 'LAP-14-AIR', availableUnits: 3 } });
  const rejectedFirst = await shop(transport, [build('store-a', [laptops(), monitors()]), submit(1)]);
  assert.equal(rejectedFirst.outcome, 'no_feasible_cart');
  assert.equal(rejectedFirst.progress.rejected[0]!.code, 'INELIGIBLE');
  assert.ok(rejectedFirst.progress.rejected[0]!.checkCodes.includes('STOCK:LAP-14-AIR'));

  const report = await shop(transport, [
    build('store-a', [laptops(3), monitors()]),
    submit(1, 'split'),
    // More laptops than are still needed stop at the tool boundary, before the checker.
    build('store-b', [laptops(3)]),
    build('store-b', [laptops(2)]),
    submit(2, 'split'),
  ], 'split');
  assert.equal(report.outcome, 'completed');
  assert.deepEqual(acceptedTotals(report), [511428, 235222]);
  const snapshot = await totals();
  assert.equal(snapshot.reservedMinor, 746650);
  assert.deepEqual(snapshot.quantities.map(({ reserved }) => reserved), [5, 5]);
  assert.equal(report.progress.budgetRemainingMinor, 800000 - 746650);
});

test('unknown mandatory evidence blocks every supplier and reserves nothing', async (t) => {
  const { transport, control, totals } = ledger(t, [storeA(), storeB()]);
  control('store-a', { deliveryEvidenceStatus: 'unknown' });
  control('store-b', { deliveryEvidenceStatus: 'unknown' });
  const report = await shop(transport, [
    build('store-b', [laptops(), monitors()]), submit(1),
    build('store-a', [laptops(), monitors()]), submit(2),
  ]);
  assert.equal(report.outcome, 'no_feasible_cart');
  assert.deepEqual(report.progress.rejected.map(({ code }) => code), ['MANDATORY_EVIDENCE_UNKNOWN', 'MANDATORY_EVIDENCE_UNKNOWN']);
  assert.ok(report.progress.rejected[0]!.checkCodes.includes('DELIVERY_EVIDENCE'));
  const snapshot = await totals();
  assert.equal(snapshot.reservedMinor, 0);
  assert.deepEqual(snapshot.quantities.map(({ reserved }) => reserved), [0, 0]);
});

test('a lost response cannot reserve twice: the retry resolves to the original operation', async (t) => {
  const { transport, totals } = ledger(t, [storeA(), storeB()]);
  let lose = true;
  let originalOperationId: string | undefined;
  const lossy: BackendTransport = async (rpc) => {
    const response = await transport(rpc) as { result?: { operation?: { id: string } } };
    if (rpc.method === 'proposal.submit' && lose) {
      lose = false;
      originalOperationId = response.result?.operation?.id;
      throw new Error('response lost after the reservation committed');
    }
    return response;
  };
  const report = await shop(lossy, [
    build('store-b', [laptops(), monitors()]),
    submit(1),
    // A confused model tries to move on while the first outcome is still unknown.
    build('store-a', [laptops(), monitors()]),
    submit(1),
  ]);
  assert.equal(report.outcome, 'completed');
  assert.ok(originalOperationId);
  const receipt = report.progress.accepted[0]!;
  if (receipt.kind !== 'proposal-accepted') assert.fail();
  assert.equal(receipt.operation.id, originalOperationId);
  const snapshot = await totals();
  assert.equal(snapshot.reservedMinor, 724850);
  assert.deepEqual(snapshot.quantities.map(({ reserved }) => reserved), [5, 5]);
});

test('reusing a run ID after a crash cannot duplicate spend, and changed content is refused', async (t) => {
  const { transport, totals } = ledger(t, [storeA(), storeB()]);
  const first = await shop(transport, [build('store-a', [laptops(3)]), submit(1)]);
  assert.equal(first.outcome, 'partial');
  const heldAfterFirst = (await totals()).reservedMinor;

  // The fresh session sees the ledger's 3 units, so only 2 more can even be built.
  const rerun = await shop(transport, [build('store-a', [laptops(3)]), build('store-a', [laptops(2)]), submit(1)]);
  assert.equal(rerun.outcome, 'backend_refused');
  assert.equal(rerun.progress.refused?.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await totals()).reservedMinor, heldAfterFirst);
});

test('a later run sees earlier reservations, so it cannot buy the same equipment again', async (t) => {
  const { transport, totals } = ledger(t, [storeA(), storeB()]);
  await shop(transport, [build('store-a', [laptops(), monitors()]), submit(1)]);
  const held = (await totals()).reservedMinor;

  const finished = await shop(transport, [build('store-b', [laptops()]), submit(1, 'later')], 'later');
  assert.equal(finished.outcome, 'completed');
  assert.equal(finished.usage.modelTurns, 0, 'Nothing to buy means no model call');
  assert.equal(finished.progress.requirements[0]!.priorUnits, 5);
  assert.deepEqual(finished.progress.accepted, []);
  assert.equal((await totals()).reservedMinor, held);
});

test('competing runs that both read the ledger first cannot both win the same units', async (t) => {
  const { transport, totals } = ledger(t, [storeA(), storeB()]);
  const client = createBackendClient(transport);
  const alpha = await createBackendShoppingSession({ mandateId, runId: 'alpha' }, client);
  const beta = await createBackendShoppingSession({ mandateId, runId: 'beta' }, client);
  const lines = [laptops(), monitors()];
  await alpha.dispatch(build('store-a', lines));
  await beta.dispatch(build('store-b', lines));
  const won = await alpha.dispatch(submit(1, 'alpha'));
  const lost = await beta.dispatch(submit(1, 'beta'));
  if (won.tool !== 'cart.submit' || lost.tool !== 'cart.submit') assert.fail();
  assert.equal(won.submission.kind, 'proposal-accepted');
  assert.equal(lost.submission.kind, 'proposal-rejected');
  if (lost.submission.kind !== 'proposal-rejected') assert.fail();
  assert.equal(lost.submission.code, 'BUDGET_EXCEEDED');
  assert.ok(lost.submission.checkCodes.includes('QUANTITY:engineering-laptops'));
  const snapshot = await totals();
  assert.equal(snapshot.reservedMinor, 751010);
  assert.deepEqual(snapshot.quantities.map(({ reserved }) => reserved), [5, 5]);
});

test('hostile listing text reaches the model as data, and a model that obeys it still cannot act on it', async (t) => {
  const { transport, totals } = ledger(t, [storeA(), hostileB()]);
  let seenByModel = '';
  const report = await shop(transport, [
    { tool: 'product.view', args: { supplierId: 'store-b', requirementId: 'engineering-laptops', sku: 'LAP-14-AIR' } },
    (results: ModelToolResult[]) => {
      seenByModel = results[0]!.content;
      // From here the script plays a fully compromised model doing what the listing says.
      return { tool: 'payment.capture', args: { amountMinor: 2_000_000 } };
    },
    { tool: 'catalog.search', args: { supplierId: 'store-b', requirementId: 'engineering-laptops', limit: 25 } },
    (results: ModelToolResult[]) => {
      const products = JSON.parse(results[0]!.content).products as Array<{ sku: string }>;
      assert.deepEqual(products.map(({ sku }) => sku), ['LAP-14-AIR'], 'The unapproved SKU is never offered');
      return build('store-b', [laptops(20, 'LAP-14-PRO')]);
    },
    build('store-b', [laptops(5, 'LAP-14-PRO')]),
    build('store-b', [laptops(20)]),
    { tool: 'shell.exec', args: { command: 'printenv PAYPAL_CLIENT_SECRET' } },
    build('store-a', [laptops(), monitors()]),
    submit(1),
  ]);
  assert.match(seenByModel, /NOTICE TO AI AGENTS/);
  assert.equal(report.outcome, 'completed');
  assert.deepEqual(acceptedTotals(report), [751010]);
  const snapshot = await totals();
  assert.equal(snapshot.reservedMinor, 751010);
  assert.deepEqual(snapshot.quantities.map(({ reserved }) => reserved), [5, 5]);
  // The model's only route out of the session never carried the listing's claims.
  assert.equal(report.progress.budgetRemainingMinor, 800000 - 751010);
});

test('the bundled demo scripts keep their promised results against the real core', async (t) => {
  const honest = ledger(t, [storeA(), hostileB()]);
  const report = await shop(honest.transport, fixture('services/agent/fixtures/demo-shopping-calls.json') as ScriptedStep[], 'demo');
  assert.equal(report.outcome, 'completed');
  assert.deepEqual(acceptedTotals(report), [724850]);

  const compromised = ledger(t, [storeA(), hostileB()]);
  const blocked = await shop(compromised.transport, fixture('services/agent/fixtures/compromised-shopping-calls.json') as ScriptedStep[], 'compromised');
  assert.equal(blocked.outcome, 'no_feasible_cart');
  assert.deepEqual(blocked.progress.accepted, []);
  assert.equal((await compromised.totals()).reservedMinor, 0);
  assert.equal(blocked.progress.budgetRemainingMinor, 800000);
});

test('a drafted but unconfirmed mandate cannot reach the shopper', async (t) => {
  const { transport } = ledger(t, [storeA()], { confirm: false });
  await assert.rejects(
    createBackendShoppingSession({ mandateId, runId }, createBackendClient(transport)),
    (error: unknown) => error instanceof BackendSessionError && error.code === 'MANDATE_NOT_CONFIRMED',
  );
});

// --- The CLI surface. These use the contract mock and scripted calls: no key, no network.

const baseEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  for (const name of Object.keys(env)) if (name.toUpperCase().startsWith('PAYPAL_')) delete env[name];
  return env;
};

function runShop(args: string[], env: NodeJS.ProcessEnv = baseEnv()) {
  const result = spawnSync(process.execPath, [shopEntry, ...args], { cwd: root, encoding: 'utf8', env });
  assert.equal(result.error, undefined);
  return result;
}

const mock = [
  '--mandate-id', 'engineering-hires-november',
  '--mock-mandate', 'examples/mandate.json',
  '--catalog', 'services/suppliers/fixtures/store-a.json',
];

function scriptFile(t: TestContext, calls: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-shop-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'calls.json');
  writeFileSync(path, JSON.stringify(calls));
  return path;
}

test('shop run --json prints one report on stdout and exits by outcome', (t) => {
  const partial = runShop(['run', '--run-id', 'fixture-shopping', ...mock, '--scripted', 'services/agent/fixtures/shopping-tool-calls.json', '--json']);
  assert.equal(partial.status, 2, partial.stderr);
  assert.equal(partial.stderr, '');
  assert.equal(partial.stdout.trim().split('\n').length, 1);
  const report = JSON.parse(partial.stdout);
  assert.equal(report.outcome, 'partial');
  assert.equal(report.simulation, true);
  assert.equal(report.progress.requirements[0].remainingUnits, 2);

  const complete = scriptFile(t, [
    build('store-a', [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 5 }, { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 5 }]),
    { tool: 'cart.submit', args: { cartId: 'all-cart-1' } },
  ]);
  const finished = runShop(['run', '--run-id', 'all', ...mock, '--scripted', complete, '--json']);
  assert.equal(finished.status, 0, finished.stderr);
  assert.equal(JSON.parse(finished.stdout).outcome, 'completed');
});

test('readable output states the simulation limits and shows hostile text inert', (t) => {
  const script = scriptFile(t, [
    { tool: 'catalog.search', args: { supplierId: 'store-a\u001b[2Jhidden', requirementId: 'engineering-laptops' } },
  ]);
  const result = runShop(['run', '--run-id', 'readable', ...mock, '--scripted', script]);
  assert.equal(result.status, 2, result.stderr);
  assert.doesNotMatch(result.stdout, /\u001b/);
  assert.match(result.stdout, /Outcome: no_feasible_cart/);
  assert.match(result.stdout, /not payment, orders, delivery or equipment readiness/);
});

const practice = [
  '--mandate-id', 'engineering-hires-practice',
  '--mock-mandate', 'services/agent/fixtures/practice-mandate.json',
  '--catalog', 'services/suppliers/fixtures/store-a.json',
  '--catalog', 'services/suppliers/fixtures/store-b-hostile.json',
];

test('the practice mandate serves both stores, including the hostile one, through the mock', () => {
  const honest = runShop(['run', '--run-id', 'demo', ...practice, '--scripted', 'services/agent/fixtures/demo-shopping-calls.json', '--json']);
  assert.equal(honest.status, 0, honest.stderr);
  const report = JSON.parse(honest.stdout);
  assert.equal(report.outcome, 'completed');
  assert.equal(report.progress.accepted[0].cart.supplierId, 'store-b');
  assert.equal(report.progress.accepted[0].operation.totalMinor, 724850);

  const compromised = runShop(['run', '--run-id', 'compromised', ...practice, '--scripted', 'services/agent/fixtures/compromised-shopping-calls.json', '--json']);
  assert.equal(compromised.status, 2, compromised.stderr);
  const blocked = JSON.parse(compromised.stdout);
  assert.equal(blocked.outcome, 'no_feasible_cart');
  assert.deepEqual(blocked.progress.accepted, []);
  assert.equal(blocked.progress.budgetRemainingMinor, 800000);
});

test('a cart under the practice mandate also passes the real rules, so it does not teach something false', async () => {
  const mandate = MandateSchema.parse(fixture('services/agent/fixtures/practice-mandate.json'));
  const snapshot = { mandateId: mandate.id, mandateVersion: mandate.version, currency: 'SGD', committedMinor: 0, reservedMinor: 0, quantities: [] };
  for (const catalog of [storeA(), hostileB()]) {
    const submission = { id: `cart-${catalog.supplierId}`, mandateId: mandate.id, mandateVersion: mandate.version, supplierId: catalog.supplierId, lines: [laptops(), monitors()] };
    const quote = await createFixtureSupplier(catalog).quoteCart(submission, NOW);
    const result = evaluatePurchase({ policy, mandate, submission, quote, snapshot, now: NOW });
    assert.equal(result.decision, 'eligible', catalog.supplierId);
  }
  // Once its deadline passes, the real rules block it, which the mock would not.
  const late = '2026-11-16T10:00:00Z';
  const submission = { id: 'late', mandateId: mandate.id, mandateVersion: mandate.version, supplierId: 'store-a', lines: [laptops(), monitors()] };
  const lateResult = evaluatePurchase({ policy, mandate, submission, quote: await createFixtureSupplier(storeA()).quoteCart(submission, late), snapshot, now: late });
  assert.equal(lateResult.decision, 'blocked');
  assert.equal(lateResult.checks.find(({ code }) => code === 'MANDATE_TIMING')?.status, 'fail');
});

test('input files saved with a UTF-8 BOM still load', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-shop-bom-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bom = String.fromCharCode(0xFEFF);
  const mandatePath = join(directory, 'mandate.json');
  const scriptPath = join(directory, 'calls.json');
  writeFileSync(mandatePath, `${bom}${readFileSync(join(root, 'examples/mandate.json'), 'utf8')}`);
  writeFileSync(scriptPath, `${bom}[]`);
  const result = runShop(['run', '--run-id', 'bom', '--mandate-id', 'engineering-hires-november', '--mock-mandate', mandatePath, '--catalog', 'services/suppliers/fixtures/store-a.json', '--scripted', scriptPath, '--json']);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'no_feasible_cart');
});

test('payment credentials in the environment stop the shopper before anything runs', () => {
  const result = runShop(
    ['run', '--run-id', 'x', ...mock, '--scripted', 'services/agent/fixtures/shopping-tool-calls.json', '--json'],
    { ...baseEnv(), PAYPAL_CLIENT_SECRET: 'must-not-appear' },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /must not hold payment credentials/);
  assert.match(result.stderr, /PAYPAL_CLIENT_SECRET/);
  assert.doesNotMatch(result.stderr, /must-not-appear/);
});

test('--trace records every model turn and tool call as JSON lines, without the key', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-shop-trace-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const trace = join(directory, 'trace.jsonl');
  const result = runShop(
    ['run', '--run-id', 'fixture-shopping', ...mock, '--scripted', 'services/agent/fixtures/shopping-tool-calls.json', '--json', '--trace', trace],
    { ...baseEnv(), ANTHROPIC_API_KEY: 'sk-test-must-not-appear' },
  );
  assert.equal(result.status, 2, result.stderr);
  const text = readFileSync(trace, 'utf8');
  const events = text.trim().split('\n').map((line) => JSON.parse(line) as { type: string; tool?: string });
  assert.deepEqual(events.filter(({ type }) => type === 'tool_call').map(({ tool }) => tool), [
    'catalog.search', 'product.view', 'cart.build', 'cart.submit',
  ]);
  assert.equal(events.filter(({ type }) => type === 'model_turn').length, 5);
  assert.doesNotMatch(text, /sk-test/);

  // A trace that cannot be written is reported, and the run still produces its report.
  const unwritable = runShop(['run', '--run-id', 'fixture-shopping', ...mock, '--scripted', 'services/agent/fixtures/shopping-tool-calls.json', '--json', '--trace', directory]);
  assert.equal(unwritable.status, 2);
  assert.equal(JSON.parse(unwritable.stdout).outcome, 'partial');
  assert.match(unwritable.stderr, /trace file could not be written/);
});

test('readable output lists every check code on a rejection', async (t) => {
  // Through the real core, so the codes shown are the ones the checker actually returns.
  const { transport, control } = ledger(t, [storeA()]);
  control('store-a', { deliveryEvidenceStatus: 'unknown', product: { sku: 'LAP-14-AIR', stockEvidenceStatus: 'unknown' } });
  const report = await shop(transport, [build('store-a', [laptops(), monitors()]), submit(1)]);
  assert.deepEqual([...report.progress.rejected[0]!.checkCodes].sort(), ['DELIVERY_EVIDENCE', 'STOCK_EVIDENCE:LAP-14-AIR']);
});

test('invalid invocations exit 1 with empty stdout', (t) => {
  const script = 'services/agent/fixtures/shopping-tool-calls.json';
  const notAList = scriptFile(t, { tool: 'catalog.search' });
  for (const args of [
    ['walk'],
    ['run', ...mock, '--scripted', script],
    ['run', '--run-id', 'x', '--scripted', script],
    ['run', '--run-id', 'x', '--mandate-id', 'y', '--scripted', script],
    ['run', '--run-id', 'x', ...mock, '--backend-db', 'a.db', '--backend-config', 'c.json', '--scripted', script],
    ['run', '--run-id', 'x', '--mandate-id', 'y', '--backend-db', 'a.db', '--scripted', script],
    ['run', '--run-id', 'x', ...mock, '--scripted', script, '--model', 'claude-opus-5-5'],
    ['run', '--run-id', 'x', ...mock, '--scripted', 'absent.json'],
    ['run', '--run-id', 'x', ...mock, '--scripted', notAList],
    ['run', '--run-id', 'x', ...mock, '--scripted', script, '--max-tool-calls', '0'],
    ['run', '--run-id', 'x', ...mock, '--scripted', script, '--max-tool-calls', '1.5'],
    ['run', '--run-id', 'x', ...mock, '--scripted', script, '--max-tool-calls', '500'],
    ['run', '--run-id', 'x', '--mandate-id', 'absent', '--mock-mandate', 'examples/mandate.json', '--catalog', 'services/suppliers/fixtures/store-a.json', '--scripted', script],
    ['run', '--run-id', 'x', ...mock, '--scripted', script, '--url', 'https://hostile.invalid'],
  ]) {
    const result = runShop(args);
    assert.equal(result.status, 1, `${args.join(' ')}: ${result.stdout}`);
    assert.equal(result.stdout, '', args.join(' '));
    assert.notEqual(result.stderr, '', args.join(' '));
  }
  const help = runShop(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--backend-db/);
});

// --- Every real process: the planner, the operator CLI, the shopper and execution.

const backendRefusedOnWindows = process.platform === 'win32'
  ? 'The backend CLI refuses its runtime directory on Windows after first use (POSIX permission check)'
  : false;

test('full process walk: draft, operator confirmation, shopping over rpc, then simulated execution', { skip: backendRefusedOnWindows }, (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-shop-e2e-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const later = (days: number) => new Date(nowDate.getTime() + days * 86_400_000).toISOString();
  const node = (entry: string, args: string[]) => {
    const result = spawnSync(process.execPath, [join(root, entry), ...args], { cwd: root, encoding: 'utf8', env: baseEnv() });
    assert.equal(result.error, undefined);
    return result;
  };
  const cli = (args: string[]) => {
    const result = node('apps/cli/src/main.ts', args);
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  };
  const dbPath = join(directory, 'runtime', 'app.db');
  const configPath = join(directory, 'config.json');
  const backend = (args: string[]) => {
    const result = node('apps/cli/src/backend.ts', ['--db', dbPath, '--config', configPath, ...args]);
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    return JSON.parse(result.stdout);
  };

  // Control panel: working catalogs with evidence and delivery dated for the real clock.
  const catalogPaths = ['store-a', 'store-b'].map((seed) => {
    const path = join(directory, `${seed}.json`);
    cli(['store', 'reset', '--catalog', path, '--seed', seed, '--now', now, '--json']);
    cli(['store', 'set', '--catalog', path, '--delivery-by', later(9), '--now', now, '--json']);
    return path;
  });
  writeFileSync(configPath, JSON.stringify({
    version: 1,
    policyFiles: [join(root, 'config/policies/hardware.example.json')],
    catalogFiles: catalogPaths,
    fakeProviderDb: join(directory, 'runtime', 'providers.db'),
  }));

  // Planning, then the proposal handoff with no hand-editing.
  const requestPath = join(directory, 'request.json');
  const proposalPath = join(directory, 'proposal.json');
  writeFileSync(requestPath, JSON.stringify({ ...request, purchaseBy: later(2), readyBy: later(14) }));
  cli(['mandate', 'draft', '--request', requestPath, '--now', now, '--proposal-out', proposalPath, '--json']);

  // Before confirmation the shopper has nothing to work from.
  const script = join(directory, 'calls.json');
  writeFileSync(script, JSON.stringify([
    build('store-b', [laptops(), monitors()]),
    { tool: 'cart.submit', args: { cartId: 'walk-cart-1' } },
  ]));
  const shopArgs = ['run', '--run-id', 'walk', '--mandate-id', mandateId, '--backend-db', dbPath, '--backend-config', configPath, '--scripted', script, '--json'];

  const drafted = backend(['mandate-draft', '--file', proposalPath]);
  const early = runShop(shopArgs);
  assert.equal(early.status, 1);
  assert.equal(early.stdout, '');
  assert.match(early.stderr, /no confirmed active revision/);

  backend(['mandate-review', '--id', mandateId, '--revision', '1']);
  backend(['mandate-confirm', '--id', mandateId, '--revision', '1', '--digest', drafted.digest]);

  const shopped = runShop(shopArgs);
  assert.equal(shopped.status, 0, shopped.stderr);
  const report = JSON.parse(shopped.stdout);
  assert.equal(report.outcome, 'completed');
  const operation = report.progress.accepted[0].operation;
  assert.equal(operation.status, 'reserved');
  assert.equal(operation.totalMinor, 724850);

  // Replaying the whole run neither reserves again nor calls the script's tools.
  const replay = JSON.parse(runShop(shopArgs).stdout);
  assert.equal(replay.outcome, 'completed');
  assert.equal(replay.usage.toolCalls, 0);
  assert.equal(backend(['status', '--id', operation.id]).operation.totalMinor, 724850);

  // Only the operator's backend process executes, here against fake providers.
  const executed = backend(['operation-run', '--id', operation.id]);
  assert.equal(executed.operation.status, 'ordered');
  assert.equal(executed.operation.readinessStatus, 'not_assessed');
  const audit = backend(['audit', '--id', operation.id]);
  assert.ok(audit.events.some(({ kind }: { kind: string }) => kind === 'operation_reserved'));
});
