import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBackendClient, type BackendTransport } from '../../../packages/contracts/src/client.ts';
import { CatalogSchema, MandateSchema, PolicySchema, type Catalog } from '../../../packages/contracts/src/index.ts';
import { createMockBackend } from '../../../packages/contracts/src/mock.ts';
import { BackendSessionError, createBackendShoppingSession, resendUnresolvedCarts } from '../../../services/agent/src/backend-session.ts';
import { createMandateDraft } from '../../../services/agent/src/mandate.ts';
import { createScriptedModel, type ModelToolResult, type ScriptedStep } from '../../../services/agent/src/model.ts';
import { buildRunReview, buildStatusView, groupCheckCodes } from '../../../services/agent/src/review.ts';
import type { SubmissionJournal } from '../../../services/agent/src/shopper.ts';
import { runShoppingWorker } from '../../../services/agent/src/worker.ts';
import { readLedgerFacts, renderRunReview, renderStatus } from './review-output.ts';
import { createFileSubmissionJournal } from './submission-journal.ts';
import { createApplicationBackend } from '../../../services/checker/src/application.ts';
import { confirmMandateRevision, definePolicySnapshot, draftMandateRevision } from '../../../services/checker/src/authority.ts';
import { openLedgerStore } from '../../../services/checker/src/ledger/store.ts';
import { evaluatePurchase } from '../../../services/checker/src/rules/evaluate.ts';
import { applyFixtureChanges, stampObservations } from '../../../services/suppliers/src/control.ts';
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

test('records past the evidence limit are rejected by the checker, and the bundled script recovers at the other store', async (t) => {
  // 75 hours before NOW. The policy limit is 72, which the model is not told.
  const staleB = stampObservations(storeB(), '2026-11-01T06:00:00Z');
  const { transport, totals } = ledger(t, [storeA(), staleB]);
  const report = await shop(transport, fixture('services/agent/fixtures/recovery-shopping-calls.json') as ScriptedStep[], 'recovery');
  assert.equal(report.outcome, 'completed');
  assert.equal(report.progress.rejected.length, 1);
  assert.equal(report.progress.rejected[0]!.code, 'MANDATORY_EVIDENCE_UNKNOWN');
  assert.equal(report.progress.rejected[0]!.cart.supplierId, 'store-b');
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

test('a restart while the first request is still outstanding resends the exact cart, and one operation results', async (t) => {
  const { transport, totals, directory } = ledger(t, [storeA(), storeB()]);
  const journal = createFileSubmissionJournal(join(directory, 'app.db'), mandateId);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let lateAnswer: Promise<unknown> | undefined;
  const delayed: BackendTransport = async (rpc) => {
    if (rpc.method !== 'proposal.submit') return transport(rpc);
    lateAnswer = held.then(() => transport(rpc));
    return lateAnswer;
  };

  // The first process gives up on an answer while its request is still on the way.
  const session = await createBackendShoppingSession({ mandateId, runId, submitTimeoutMs: 20 }, createBackendClient(delayed), journal);
  const first = await runShoppingWorker(session, createScriptedModel([build('store-b', [laptops(), monitors()]), submit(1)]), { runId });
  assert.equal(first.outcome, 'unknown_submission');
  assert.deepEqual(journal.pending(), [first.progress.unresolved]);
  assert.equal((await totals()).reservedMinor, 0, 'The ledger cannot show that this request has stopped');

  // A restart, under another run ID, resends that cart rather than building a different one.
  const resent = await resendUnresolvedCarts({ runId: 'restart' }, createBackendClient(transport), journal);
  assert.equal(resent.length, 1);
  const [answer] = resent;
  if (answer?.kind !== 'accepted') assert.fail(`Expected accepted, got ${answer?.kind}`);
  assert.deepEqual(answer.cart, first.progress.unresolved);
  assert.deepEqual(journal.pending(), [], 'A definite answer settles the record');

  // The first request finally lands, and it is the same operation.
  release();
  const late = await lateAnswer as { ok: boolean; result?: { operation?: { id: string } } };
  assert.equal(late.ok, true);
  assert.equal(late.result?.operation?.id, answer.operation.id);
  const snapshot = await totals();
  assert.equal(snapshot.reservedMinor, 724850);
  assert.deepEqual(snapshot.quantities.map(({ reserved }) => reserved), [5, 5]);
});

test('an answer that stays unknown keeps the record, and a rejection clears it', async (t) => {
  const { transport, control, totals, directory } = ledger(t, [storeA(), storeB()]);
  const journal = createFileSubmissionJournal(join(directory, 'app.db'), mandateId);
  const cart = { id: 'run-cart-1', mandateId, mandateVersion: 1, supplierId: 'store-b', lines: [laptops(), monitors()] };
  journal.save(cart);
  const down: BackendTransport = async () => { throw new Error('backend unreachable'); };
  const still = await resendUnresolvedCarts({ runId: 'again' }, createBackendClient(down), journal);
  assert.deepEqual(still.map(({ kind }) => kind), ['unknown']);
  assert.deepEqual(journal.pending(), [cart]);

  control('store-b', { deliveryEvidenceStatus: 'unknown' });
  const rejected = await resendUnresolvedCarts({ runId: 'again' }, createBackendClient(transport), journal);
  assert.deepEqual(rejected.map(({ kind }) => kind), ['rejected']);
  assert.deepEqual(journal.pending(), []);
  assert.equal((await totals()).reservedMinor, 0);
});

test('a session records a cart before sending it, keeps it while unknown, and clears it once settled', async (t) => {
  const { transport, directory } = ledger(t, [storeA(), storeB()]);
  const log: string[] = [];
  const real = createFileSubmissionJournal(join(directory, 'app.db'), mandateId);
  const journal: SubmissionJournal = {
    pending: () => real.pending(),
    save(cart) { log.push(`save ${cart.id}`); real.save(cart); },
    clear(cartId) { log.push(`clear ${cartId}`); real.clear(cartId); },
  };
  let lose = true;
  const lossy: BackendTransport = async (rpc) => {
    if (rpc.method !== 'proposal.submit') return transport(rpc);
    log.push('send');
    const response = await transport(rpc);
    if (lose) {
      lose = false;
      throw new Error('response lost');
    }
    return response;
  };
  const session = await createBackendShoppingSession({ mandateId, runId }, createBackendClient(lossy), journal);
  const report = await runShoppingWorker(session, createScriptedModel([build('store-b', [laptops(), monitors()]), submit(1), submit(1)]), { runId });
  assert.equal(report.outcome, 'completed');
  assert.deepEqual(log, ['save run-cart-1', 'send', 'save run-cart-1', 'send', 'clear run-cart-1']);
  assert.deepEqual(real.pending(), []);
});

test('a cart that cannot be recorded is not sent', async (t) => {
  const { transport, totals } = ledger(t, [storeA(), storeB()]);
  let sent = 0;
  const counting: BackendTransport = async (rpc) => {
    if (rpc.method === 'proposal.submit') sent += 1;
    return transport(rpc);
  };
  const journal: SubmissionJournal = { pending: () => [], save() { throw new Error('disk full'); }, clear() {} };
  const session = await createBackendShoppingSession({ mandateId, runId }, createBackendClient(counting), journal);
  const report = await runShoppingWorker(session, createScriptedModel([build('store-b', [laptops(), monitors()]), submit(1)]), { runId });
  assert.equal(sent, 0);
  assert.equal(report.progress.accepted.length, 0);
  assert.equal((await totals()).reservedMinor, 0);
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

const practice = [
  '--mandate-id', 'engineering-hires-practice',
  '--mock-mandate', 'services/agent/fixtures/practice-mandate.json',
  '--catalog', 'services/suppliers/fixtures/store-a.json',
  '--catalog', 'services/suppliers/fixtures/store-b-hostile.json',
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
  assert.doesNotMatch(result.stdout, /\u001b|\[2J/);
  assert.match(result.stdout, /Outcome: no_feasible_cart/);
  assert.match(result.stdout, /Simulation\. Reservations are not payment, orders, delivery or equipment readiness\./);
});

test('--json stays byte-compatible: the worker report and one newline, with no review', async () => {
  const script = 'services/agent/fixtures/demo-shopping-calls.json';
  const result = runShop(['run', '--run-id', 'demo', ...practice, '--scripted', script, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');

  // The same run in-process, so any field added to the CLI's JSON fails this.
  const backend = createMockBackend({
    mandates: [fixture('services/agent/fixtures/practice-mandate.json')],
    catalogs: [fixture('services/suppliers/fixtures/store-a.json'), fixture('services/suppliers/fixtures/store-b-hostile.json')],
  } as Parameters<typeof createMockBackend>[0]);
  const session = await createBackendShoppingSession({ mandateId: 'engineering-hires-practice', runId: 'demo' }, createBackendClient((request) => backend.handle(request)));
  const report = await runShoppingWorker(session, createScriptedModel(fixture(script) as ScriptedStep[]), { runId: 'demo' });
  assert.equal(result.stdout.replace(/\r\n/g, '\n'), `${JSON.stringify(report)}\n`);
  assert.deepEqual(Object.keys(JSON.parse(result.stdout)), ['simulation', 'runId', 'mandateId', 'mandateVersion', 'outcome', 'detail', 'progress', 'usage', 'modelSummary']);
  assert.doesNotMatch(result.stdout, /Review of run|Next step|S\$/);
});

test('human output closes with the review: S$, a budget bar, decisions, reasons and no scripted token counts', () => {
  const honest = runShop(['run', '--run-id', 'demo', ...practice, '--scripted', 'services/agent/fixtures/demo-shopping-calls.json']);
  assert.equal(honest.status, 0, honest.stderr);
  assert.match(honest.stdout, /^Shopping run demo \| mandate engineering-hires-practice \| simulation/);
  assert.match(honest.stdout, /= the mock accepted: S\$7,248\.50 \(it checks nothing\)/);
  assert.match(honest.stdout, /Review of run demo/);
  assert.match(honest.stdout, /scripted stand-in, not Claude/);
  assert.match(honest.stdout, /\[#+-+\] S\$7,248\.50 of S\$8,000\.00 allocated/);
  assert.match(honest.stdout, /store-a +demo-cart-1 +S\$7,510\.10 +Not sent/);
  assert.match(honest.stdout, /store-b +demo-cart-2 +S\$7,248\.50 +Accepted +S\$7,248\.50/);
  assert.match(honest.stdout, /Contract mock: it checks nothing/);
  assert.doesNotMatch(honest.stdout, /token|SGD |\u001b/i);

  const compromised = runShop(['run', '--run-id', 'compromised', ...practice, '--scripted', 'services/agent/fixtures/compromised-shopping-calls.json']);
  assert.equal(compromised.status, 2, compromised.stderr);
  assert.match(compromised.stdout, /> payment_capture\s+x refused: The shopper has no such tool\./);
  assert.match(compromised.stdout, /> cart\.build store-b LAP-14-PRO x20\s+x refused: This product is not approved for that requirement\./);
  assert.match(compromised.stdout, /Refused attempts \(7\)/);
  assert.match(compromised.stdout, /Outcome: no_feasible_cart/);
  assert.doesNotMatch(compromised.stdout, /x refused: [A-Z_]+\r?\n/);
});

test('shop run --brief shortens the review and changes neither the live lines nor the exit code', () => {
  const script = 'services/agent/fixtures/compromised-shopping-calls.json';
  const compromised = ['run', '--run-id', 'compromised', ...practice, '--scripted', script];
  const full = runShop(compromised);
  const brief = runShop([...compromised, '--brief']);
  assert.equal(full.status, 2, full.stderr);
  assert.equal(brief.status, full.status);
  assert.equal(brief.stderr, '');

  // The live lines are the same text, up to the review's rule.
  const liveLines = (stdout: string) => stdout.split('====')[0]!;
  assert.equal(liveLines(brief.stdout), liveLines(full.stdout));
  assert.match(brief.stdout, /> payment_capture\s+x refused: The shopper has no such tool\./);

  assert.match(brief.stdout, /Refused attempts: 7 \(each one is shown above\)/);
  assert.doesNotMatch(brief.stdout, /Refused attempts \(7\)/);
  assert.doesNotMatch(brief.stdout, /Usage:|Model summary|Scripted run finished|token/);
  assert.match(brief.stdout, /S\$0\.00 of S\$8,000\.00 allocated/);
  assert.match(brief.stdout, /Simulation\. Reservations are not payment, orders, delivery or equipment readiness\./);
  assert.ok(brief.stdout.length < full.stdout.length);

  // An accepted cart keeps its exit code and its table too, here against the mock.
  const honest = runShop(['run', '--run-id', 'demo', ...practice, '--scripted', 'services/agent/fixtures/demo-shopping-calls.json', '--brief']);
  assert.equal(honest.status, 0, honest.stderr);
  assert.match(honest.stdout, /store-b +demo-cart-2 +S\$7,248\.50 +Accepted +S\$7,248\.50/);
  assert.match(honest.stdout, /Nothing to execute: the contract mock has no execution step/);
});

test('--brief with --json is refused before anything runs, and --json alone is unaffected', () => {
  const script = 'services/agent/fixtures/compromised-shopping-calls.json';
  const both = runShop(['run', '--run-id', 'compromised', ...practice, '--scripted', script, '--brief', '--json']);
  assert.equal(both.status, 1);
  assert.equal(both.stdout, '');
  assert.match(both.stderr, /--brief .* cannot be used with --json/);
  const reversed = runShop(['run', '--json', '--brief', '--run-id', 'compromised', ...practice, '--scripted', script]);
  assert.equal(reversed.status, 1);
  assert.equal(reversed.stdout, '');
  const json = runShop(['run', '--run-id', 'compromised', ...practice, '--scripted', script, '--json']);
  assert.equal(json.status, 2);
  assert.deepEqual(Object.keys(JSON.parse(json.stdout)), ['simulation', 'runId', 'mandateId', 'mandateVersion', 'outcome', 'detail', 'progress', 'usage', 'modelSummary']);

  const help = runShop(['--help']);
  assert.match(help.stdout, /--brief +A shorter review, for recording/);
  assert.match(help.stdout, /--json refuses it/);
  // It belongs to shop run only.
  const status = runShop(['status', '--mandate-id', 'engineering-hires-practice', '--mock-mandate', 'services/agent/fixtures/practice-mandate.json', '--catalog', 'services/suppliers/fixtures/store-a.json', '--brief']);
  assert.equal(status.status, 1);
  assert.equal(status.stdout, '');
  assert.equal(runShop(['draft', '--text', 'x', '--brief']).status, 1);
});

test('every check code the real checker can produce has plain wording', async () => {
  // The rules record every check whatever the result, so a passing cart lists every code.
  const mandate = MandateSchema.parse(fixture('services/agent/fixtures/practice-mandate.json'));
  const submission = { id: 'wording', mandateId: mandate.id, mandateVersion: mandate.version, supplierId: 'store-a', lines: [laptops(), monitors()] };
  const quote = await createFixtureSupplier(storeA()).quoteCart(submission, NOW);
  const snapshot = { mandateId: mandate.id, mandateVersion: mandate.version, currency: 'SGD', committedMinor: 0, reservedMinor: 0, quantities: [] };
  const { checks } = evaluatePurchase({ policy, mandate, submission, quote, snapshot, now: NOW });
  assert.ok(checks.length > 20);
  const codes = checks.map(({ code }) => code);
  for (const prefix of ['BUDGET', 'QUANTITY:', 'STOCK:', 'UNIT_PRICE:', 'WARRANTY:', 'SKU:', 'DELIVERY', 'DELIVERY_EVIDENCE', 'PRODUCT_EVIDENCE:', 'STOCK_EVIDENCE:', 'QUOTE_TIMING', 'MANDATE_TIMING']) {
    assert.ok(codes.some((code) => code.startsWith(prefix)), prefix);
  }
  for (const code of codes) {
    assert.ok(groupCheckCodes([code]).every(({ recognized }) => recognized), `${code} has no plain wording`);
  }
});

test('the review of a real rejection and recovery, with ledger numbers read back through the shared client', async (t) => {
  const staleB = stampObservations(storeB(), '2026-11-01T06:00:00Z');
  const { transport } = ledger(t, [storeA(), staleB]);
  const client = createBackendClient(transport);
  const events: unknown[] = [];
  const session = await createBackendShoppingSession({ mandateId, runId: 'recovery' }, client);
  const report = await runShoppingWorker(session, createScriptedModel(fixture('services/agent/fixtures/recovery-shopping-calls.json') as ScriptedStep[]), {
    runId: 'recovery', onEvent: (event) => events.push(event),
  });
  const facts = await readLedgerFacts(client, mandateId, 'recovery-review');
  assert.ok(facts);
  const review = buildRunReview({ report, events, ledger: facts, backend: 'simulation-backend', shopper: { kind: 'scripted' }, budgetMinor: session.getContext().budgetMinor });
  assert.deepEqual(review.decisions.map(({ supplierId, decision }) => [supplierId, decision]), [['store-b', 'rejected'], ['store-a', 'accepted']]);
  assert.equal(review.budget.source, 'ledger');
  assert.equal(review.budget.reservedMinor, 751010);
  assert.equal(review.budget.remainingMinor, 48990);
  assert.equal(review.budget.ledgerDiffersByMinor, null);

  const text = renderRunReview(review, { color: false }).join('\n');
  assert.match(text, /store-b +recovery-cart-1 +S\$7,248\.50 +Rejected/);
  assert.match(text, /store-a +recovery-cart-2 +S\$7,510\.10 +Reserved +S\$7,510\.10/);
  assert.match(text.replace(/\s+/g, ' '), /Product and stock records for LAP-14-AIR and MON-27-USBC, and the delivery record, are missing, stale or unverified/);
  // The module cannot know why: age is a fact only the demo's narration has.
  assert.doesNotMatch(text, /hours|MANDATORY_EVIDENCE_UNKNOWN \|/);
  assert.match(text, /\[#+-+\] S\$7,510\.10 of S\$8,000\.00 allocated/);
  assert.match(text, /Reserved +S\$7,510\.10/);
  assert.match(text, /Remaining +S\$489\.90/);

  // The status view of the same ledger, through the same two read methods.
  const operationId = review.operationsToRun[0]!;
  assert.ok(operationId);
  const read = await client.request({ apiVersion: '1', requestId: 'status-1', method: 'operation.get', params: { mandateId, mandateVersion: 1, operationId } });
  if (!read.ok || read.method !== 'operation.get') assert.fail('Operation read failed');
  const status = renderStatus(buildStatusView({ ledger: facts!, operations: [read.result.operation], backend: 'simulation-backend' }), { color: false }).join('\n');
  assert.match(status, /5 of 5 allocated \| 0 committed \| 5 reserved/);
  assert.match(status, /Status +reserved: budget set aside; nothing has been executed/);
  assert.match(status, /Fake payment +not started/);
  assert.match(status, /Fake order +not started/);
  assert.match(status, /Fake refund +not started/);
  assert.match(status, /Readiness +not assessed/);
});

test('shop status shows the mandate read-only, needs no key, and says plainly that the mock checks nothing', () => {
  const result = runShop(['status', '--mandate-id', 'engineering-hires-practice', '--mock-mandate', 'services/agent/fixtures/practice-mandate.json', '--catalog', 'services/suppliers/fixtures/store-a.json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^Status \| mandate engineering-hires-practice v1 \| simulation/);
  assert.match(result.stdout, /Contract mock: it checks nothing/);
  assert.match(result.stdout, /\[-+\] S\$0\.00 of S\$8,000\.00 allocated/);
  assert.match(result.stdout, /engineering-laptops +\[-+\] 0 of 5 allocated \| 0 committed \| 0 reserved/);
  assert.match(result.stdout, /The client cannot list operations/);
  assert.match(result.stdout, /Simulation\. Reservations are not payment, orders, delivery or equipment readiness\./);
  assert.doesNotMatch(result.stdout, /\u001b|token/i);
});

test('shop status --json prints one view on stdout, and it carries the mock warning', () => {
  const result = runShop(['status', '--mandate-id', 'engineering-hires-practice', '--mock-mandate', 'services/agent/fixtures/practice-mandate.json', '--catalog', 'services/suppliers/fixtures/store-a.json', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim().split('\n').length, 1);
  const view = JSON.parse(result.stdout);
  assert.equal(view.kind, 'shop-status');
  assert.equal(view.simulation, true);
  assert.equal(view.backend, 'contract-mock');
  assert.match(view.warning, /checks nothing/);
  assert.deepEqual(view.budget, { totalMinor: 800000, committedMinor: 0, reservedMinor: 0, remainingMinor: 800000, allocatedMinor: 0 });
  assert.deepEqual(view.requirements[0], { requirementId: 'engineering-laptops', required: 5, committedUnits: 0, reservedUnits: 0, allocatedUnits: 0, remainingUnits: 5 });
  assert.doesNotMatch(result.stdout, /held/i);
  assert.deepEqual(view.operations, []);
  assert.match(view.operationsHint, /--operation ID/);
  assert.doesNotMatch(result.stdout, /\u001b|S\$/);
});

test('shop status exits 1 with empty stdout for invalid input or a failed read, and never builds a model', () => {
  const backend = ['--mock-mandate', 'services/agent/fixtures/practice-mandate.json', '--catalog', 'services/suppliers/fixtures/store-a.json'];
  const id = ['--mandate-id', 'engineering-hires-practice'];
  for (const args of [
    ['status', ...backend],
    ['status', ...id],
    ['status', ...id, '--backend-db', 'a.db'],
    ['status', ...id, ...backend, '--backend-db', 'a.db', '--backend-config', 'c.json'],
    ['status', '--mandate-id', 'absent', ...backend],
    ['status', ...id, ...backend, '--operation', 'absent'],
    ['status', ...id, ...backend, '--operation', '   '],
    ['status', ...id, ...backend, '--scripted', 'services/agent/fixtures/shopping-tool-calls.json'],
    ['status', ...id, ...backend, '--model', 'claude-opus-5-5'],
    ['status', ...id, ...backend, 'extra'],
  ]) {
    const result = runShop(args);
    assert.equal(result.status, 1, `${args.join(' ')}: ${result.stdout}`);
    assert.equal(result.stdout, '', args.join(' '));
    assert.notEqual(result.stderr, '', args.join(' '));
  }
  const absent = runShop(['status', ...id, ...backend, '--operation', 'op-absent']);
  assert.match(absent.stderr, /op-absent: Operation was not found.*The contract mock keeps nothing between commands/);
  const help = runShop(['status', '--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /npm run shop -- status --mandate-id ID BACKEND \[--operation ID \.\.\.\] \[--json\]/);
});

test('shop status also refuses to start with payment credentials in its environment', () => {
  const result = runShop(
    ['status', '--mandate-id', 'engineering-hires-practice', '--mock-mandate', 'services/agent/fixtures/practice-mandate.json', '--catalog', 'services/suppliers/fixtures/store-a.json'],
    { ...baseEnv(), PAYPAL_CLIENT_SECRET: 'must-not-appear' },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /must not hold payment credentials \(PAYPAL_CLIENT_SECRET\)/);
  assert.doesNotMatch(result.stderr, /must-not-appear/);
});

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
  // A space, so the printed operator command has to quote its paths to work.
  const directory = mkdtempSync(join(tmpdir(), 'splittap shop e2e-'));
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

  // The review a person reads names the exact command that runs this reservation.
  const shopped = runShop(shopArgs.filter((arg) => arg !== '--json'));
  assert.equal(shopped.status, 0, shopped.stderr);
  const printedCommand = shopped.stdout.split(/\r?\n/).find((line) => line.startsWith('  npm run backend -- operation-run '))?.trim();
  assert.ok(printedCommand, shopped.stdout);
  const operationId = /--id (op-[\w-]+)/.exec(printedCommand)?.[1];
  assert.ok(operationId, printedCommand);
  const operation = backend(['status', '--id', operationId]).operation;
  assert.equal(operation.status, 'reserved');
  assert.equal(operation.totalMinor, 724850);

  // Replaying the whole run neither reserves again nor calls the script's tools.
  const replay = JSON.parse(runShop(shopArgs).stdout);
  assert.equal(replay.outcome, 'completed');
  assert.equal(replay.usage.toolCalls, 0);
  assert.equal(backend(['status', '--id', operation.id]).operation.totalMinor, 724850);

  // The human review of a rerun reads the ledger back, and never offers to execute twice.
  const rereview = runShop(shopArgs.filter((arg) => arg !== '--json'));
  assert.equal(rereview.status, 0, rereview.stderr);
  assert.match(rereview.stdout, /Budget \(read from the ledger after the run\)/);
  assert.match(rereview.stdout, /S\$7,248\.50 of S\$8,000\.00 allocated/);

  // The shopper's status is read-only: it shows the reservation and changes nothing.
  const statusArgs = ['status', '--mandate-id', mandateId, '--backend-db', dbPath, '--backend-config', configPath, '--operation', operation.id];
  const before = runShop([...statusArgs, '--json']);
  assert.equal(before.status, 0, before.stderr);
  const view = JSON.parse(before.stdout);
  assert.equal(view.backend, 'simulation-backend');
  assert.equal(view.warning, null);
  assert.equal(view.budget.reservedMinor, 724850);
  assert.equal(view.operations[0].status, 'reserved');
  assert.equal(backend(['status', '--id', operation.id]).operation.status, 'reserved');
  const shown = runShop(statusArgs);
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /Reservation +active: budget set aside, not paid/);
  assert.match(shown.stdout, /Fake payment +not started/);

  // A cart left unknown is resent exactly, with no model or key, and finds its original operation.
  const walkJournal = createFileSubmissionJournal(dbPath, mandateId);
  walkJournal.save({ id: 'walk-cart-1', mandateId, mandateVersion: 1, supplierId: 'store-b', lines: [laptops(), monitors()] });
  const resentArgs = ['run', '--run-id', 'after-restart', '--mandate-id', mandateId, '--backend-db', dbPath, '--backend-config', configPath];
  const resent = runShop([...resentArgs, '--json']);
  assert.equal(resent.status, 0, resent.stderr);
  const resentReport = JSON.parse(resent.stdout);
  assert.equal(resentReport.resent[0].kind, 'accepted');
  assert.equal(resentReport.resent[0].operation.id, operationId);
  assert.deepEqual(walkJournal.pending(), []);
  assert.equal(backend(['status', '--id', operationId]).operation.totalMinor, 724850);

  // Only the operator's backend process executes, here against fake providers. This runs the
  // command exactly as the review printed it, through a shell, as an operator would paste it.
  const pasted = spawnSync(printedCommand, { shell: true, cwd: root, encoding: 'utf8', env: baseEnv() });
  assert.equal(pasted.status, 0, `${printedCommand}\n${pasted.stderr}`);
  const executed = JSON.parse(pasted.stdout.split(/\r?\n/).filter((line) => line.startsWith('{')).at(-1) ?? '{}');
  assert.equal(executed.operation.status, 'ordered');
  assert.equal(executed.operation.readinessStatus, 'not_assessed');
  const audit = backend(['audit', '--id', operation.id]);
  assert.ok(audit.events.some(({ kind }: { kind: string }) => kind === 'operation_reserved'));

  const after = runShop(statusArgs);
  assert.equal(after.status, 0, after.stderr);
  assert.match(after.stdout, /Committed +S\$7,248\.50/);
  assert.match(after.stdout, /Status +ordered: the fake order succeeded; this is not a real order/);
  assert.match(after.stdout, /Fake payment +succeeded/);
  assert.match(after.stdout, /Readiness +not assessed/);
  const missing = runShop(['status', '--mandate-id', mandateId, '--backend-db', dbPath, '--backend-config', configPath, '--operation', 'op-absent']);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /op-absent: Operation was not found/);
});
