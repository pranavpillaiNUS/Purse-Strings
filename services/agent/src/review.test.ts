import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BackendErrorCodeSchema, type BackendRequest } from '../../../packages/contracts/src/backend.ts';
import { createBackendClient, type BackendTransport } from '../../../packages/contracts/src/client.ts';
import { createMockBackend } from '../../../packages/contracts/src/mock.ts';
import { MandateSchema } from '../../../packages/contracts/src/index.ts';
import { createBackendShoppingSession } from './backend-session.ts';
import { createScriptedModel, type ScriptedStep } from './model.ts';
import {
  buildRunReview, buildStatusView, describeAttempt, groupCheckCodes, MOCK_WARNING, plainReason, readRunEvent, SCRIPTED_PLACEHOLDER_SUMMARY,
  type LedgerFacts, type RunReviewInput,
} from './review.ts';
import { runShoppingWorker, type ShoppingRunEvent, type ShoppingRunReport } from './worker.ts';

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}
const mandate = MandateSchema.parse(fixture('../fixtures/practice-mandate.json'));
const storeA = fixture('../../suppliers/fixtures/store-a.json');
const storeB = fixture('../../suppliers/fixtures/store-b-hostile.json');
const lines = [
  { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 5 },
  { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 5 },
];
const build = (supplierId: string) => ({ tool: 'cart.build', args: { supplierId, lines } });
const submit = (cartNumber: number) => ({ tool: 'cart.submit', args: { cartId: `run-cart-${cartNumber}` } });
const STALE_CODES = ['PRODUCT_EVIDENCE:LAP-14-AIR', 'STOCK_EVIDENCE:LAP-14-AIR', 'PRODUCT_EVIDENCE:MON-27-USBC', 'STOCK_EVIDENCE:MON-27-USBC', 'DELIVERY_EVIDENCE'];

/** The contract mock, with store-b answering as the real checker does for stale records. */
function transport(wrap?: (request: BackendRequest, send: BackendTransport) => Promise<unknown>): BackendTransport {
  const backend = createMockBackend({ mandates: [mandate], catalogs: [storeA, storeB] } as Parameters<typeof createMockBackend>[0]);
  const send: BackendTransport = (request) => backend.handle(request);
  return wrap ? (request) => wrap(request, send) : send;
}

const staleStoreB: Parameters<typeof transport>[0] = async (request, send) => {
  if (request.method === 'proposal.submit' && request.params.cart.supplierId === 'store-b') {
    return {
      apiVersion: '1', requestId: request.requestId, method: request.method, simulation: true, ok: false,
      error: { code: 'MANDATORY_EVIDENCE_UNKNOWN', message: 'Mandatory evidence is unknown, stale or no longer supported', details: { checkCodes: STALE_CODES } },
    };
  }
  return send(request);
};

async function run(steps: readonly ScriptedStep[], send: BackendTransport = transport()) {
  const events: ShoppingRunEvent[] = [];
  const session = await createBackendShoppingSession({ mandateId: mandate.id, runId: 'run' }, createBackendClient(send));
  const report = await runShoppingWorker(session, createScriptedModel(steps), { runId: 'run', onEvent: (event) => events.push(event) });
  return { report, events };
}

/** Ledger numbers as mandate.get would return them after the run. */
function ledgerAfter(report: ShoppingRunReport, reservedMinor: number, reservedUnits = 5): LedgerFacts {
  return {
    mandate,
    snapshot: {
      mandateId: report.mandateId, mandateVersion: report.mandateVersion, currency: 'SGD', committedMinor: 0, reservedMinor,
      quantities: mandate.requirements.map(({ id }) => ({ requirementId: id, committed: 0, reserved: reservedUnits })),
    },
  };
}

function review(input: Pick<RunReviewInput, 'report' | 'events'> & Partial<RunReviewInput>) {
  return buildRunReview({ ledger: null, backend: 'simulation-backend', shopper: { kind: 'scripted' }, budgetMinor: mandate.budgetMinor, ...input });
}

test('rejection then recovery: decisions stay in order, each with its estimate, and only the acceptance has a checker total', async () => {
  const { report, events } = await run([build('store-b'), submit(1), build('store-a'), submit(2)], transport(staleStoreB));
  assert.equal(report.outcome, 'completed');
  const view = review({ report, events, ledger: ledgerAfter(report, 751010) });

  assert.deepEqual(view.decisions.map(({ supplierId, cartId, decision }) => [supplierId, cartId, decision]), [
    ['store-b', 'run-cart-1', 'rejected'],
    ['store-a', 'run-cart-2', 'accepted'],
  ]);
  const [rejected, accepted] = view.decisions;
  assert.deepEqual(rejected!.estimate, { authoritative: false, totalMinor: 724850 });
  assert.equal(rejected!.checkerTotalMinor, null);
  assert.equal(rejected!.code, 'MANDATORY_EVIDENCE_UNKNOWN');
  assert.equal(rejected!.checks.length, 1, 'All evidence codes read as one sentence');
  assert.match(rejected!.checks[0]!.sentence, /^Product and stock records for LAP-14-AIR and MON-27-USBC, and the delivery record, are missing, stale or unverified\.$/);
  assert.deepEqual(rejected!.checks[0]!.codes, STALE_CODES);

  assert.equal(accepted!.checkerTotalMinor, 751010);
  assert.equal(accepted!.operation?.status, 'reserved');
  assert.deepEqual(view.operationsToRun, [accepted!.operation!.id]);
  assert.deepEqual(view.budget, {
    source: 'ledger', totalMinor: 800000, committedMinor: 0, reservedMinor: 751010, remainingMinor: 48990,
    allocatedMinor: 751010, acceptedThisRunMinor: 751010, ledgerDiffersByMinor: null,
  });
  assert.deepEqual(view.requirements.map(({ allocatedUnits, remainingUnits }) => [allocatedUnits, remainingUnits]), [[5, 0], [5, 0]]);
});

test('a checker wording never invents a cause the codes do not establish', () => {
  const sentences = groupCheckCodes(STALE_CODES).map(({ sentence }) => sentence).join(' ');
  assert.doesNotMatch(sentences, /\bhours?\b|\bold\b|\bstale because\b/);
  // Different SKUs stay separate, so no sentence implies a record no code named.
  assert.equal(groupCheckCodes(['PRODUCT_EVIDENCE:A', 'STOCK_EVIDENCE:B'])[0]!.sentence,
    'Product records for A, and stock records for B, are missing, stale or unverified.');
  assert.equal(groupCheckCodes(['STOCK_EVIDENCE:B'])[0]!.sentence, 'Stock records for B are missing, stale or unverified.');
  assert.equal(groupCheckCodes(['DELIVERY_EVIDENCE'])[0]!.sentence, 'The delivery record is missing, stale or unverified.');
  assert.equal(groupCheckCodes(['DELIVERY_EVIDENCE', 'STOCK_EVIDENCE:B'])[0]!.sentence,
    'Stock records for B, and the delivery record, are missing, stale or unverified.');
});

test('hard failures read as their own sentences, grouped by what they are about', () => {
  const groups = groupCheckCodes(['BUDGET', 'QUANTITY:engineering-laptops', 'STOCK:A', 'STOCK:B', 'DELIVERY_EVIDENCE']);
  assert.deepEqual(groups.map(({ sentence }) => sentence), [
    "The checker's total is more than the budget still available.",
    'This cart plus earlier allocations would exceed what engineering-laptops needs.',
    'The store does not report enough units of A and B.',
    'The delivery record is missing, stale or unverified.',
  ]);
  assert.ok(groups.every(({ recognized }) => recognized));
});

test('unknown codes show raw and are never dropped, including names that exist on every object', () => {
  assert.equal(plainReason('NEW_CODE'), 'Unrecognized code: NEW_CODE');
  assert.equal(plainReason('constructor'), 'Unrecognized code: constructor');
  const groups = groupCheckCodes(['NEW_CHECK:thing', 'constructor', '__proto__', 'PRODUCT_EVIDENCE', 'BUDGET:extra', 'STOCK', 'PRODUCT_EVIDENCE:$&']);
  assert.deepEqual(groups.map(({ sentence }) => sentence), [
    'Unrecognized check: NEW_CHECK:thing',
    'Unrecognized check: constructor',
    'Unrecognized check: __proto__',
    'Unrecognized check: PRODUCT_EVIDENCE',
    'Unrecognized check: BUDGET:extra',
    'Unrecognized check: STOCK',
    'Product records for $& are missing, stale or unverified.',
  ]);
  assert.deepEqual(groups.map(({ recognized }) => recognized), [false, false, false, false, false, false, true]);
});

test('every closed backend code has plain wording', () => {
  for (const code of BackendErrorCodeSchema.options) {
    assert.doesNotMatch(plainReason(code), /Unrecognized/, code);
  }
});

test('a compromised run: every attempt is listed as refused with a reason, and nothing changes', async () => {
  const script = fixture('../fixtures/compromised-shopping-calls.json') as ScriptedStep[];
  const { report, events } = await run(script);
  const view = review({ report, events, ledger: ledgerAfter(report, 0, 0) });

  assert.equal(view.outcome, 'no_feasible_cart');
  assert.deepEqual(view.decisions, []);
  assert.deepEqual(view.operationsToRun, []);
  assert.deepEqual(view.refusals.map(({ tool, code }) => [tool, code]), [
    ['payment_capture', 'INVALID_TOOL_CALL'],
    ['shell_exec', 'INVALID_TOOL_CALL'],
    ['mandate_confirm', 'INVALID_TOOL_CALL'],
    ['cart.build', 'SKU_NOT_ALLOWED'],
    ['cart.build', 'QUANTITY_EXCEEDED'],
    ['cart.build', 'INVALID_TOOL_CALL'],
    ['cart.submit', 'CART_NOT_FOUND'],
  ]);
  assert.deepEqual(view.refusals.map(({ reason }) => reason).slice(0, 3), Array(3).fill('The shopper has no such tool.'));
  assert.equal(view.refusals[5]!.reason, 'This tool does not accept those arguments.');
  assert.equal(view.refusals[3]!.target, 'store-b LAP-14-PRO x20');
  assert.equal(view.refusals[6]!.target, 'approved-by-cfo');
  assert.equal(view.budget.remainingMinor, 800000);
  assert.equal(view.budget.reservedMinor, 0);
});

test('an unknown submission stays unknown: no total, no operation to run, and never rejected or refused', async () => {
  const lost: Parameters<typeof transport>[0] = async (request, send) => {
    if (request.method === 'proposal.submit') throw new Error('response lost');
    return send(request);
  };
  const { report, events } = await run([build('store-a'), submit(1)], transport(lost));
  assert.equal(report.outcome, 'unknown_submission');
  const view = review({ report, events });
  assert.equal(view.unresolved, true);
  assert.match(view.outcomeSentence, /unknown outcome, and a reservation may exist/);
  assert.equal(view.decisions.length, 1);
  assert.equal(view.decisions[0]!.decision, 'unknown');
  assert.equal(view.decisions[0]!.checkerTotalMinor, null);
  assert.equal(view.decisions[0]!.code, null);
  assert.deepEqual(view.operationsToRun, []);
});

test('an unknown submission that a retry settles says so, and reads as the settled result', async () => {
  let lose = true;
  const lossy: Parameters<typeof transport>[0] = async (request, send) => {
    const response = await send(request);
    if (request.method === 'proposal.submit' && lose) {
      lose = false;
      throw new Error('response lost after the reservation committed');
    }
    return response;
  };
  const { report, events } = await run([build('store-a'), submit(1), submit(1)], transport(lossy));
  assert.equal(report.outcome, 'completed');
  const [decision] = review({ report, events }).decisions;
  assert.equal(decision!.decision, 'accepted');
  assert.equal(decision!.retriedAfterUnknown, true);
});

test('a backend refusal keeps its code and plain reason', async () => {
  const refusing: Parameters<typeof transport>[0] = async (request, send) => {
    if (request.method !== 'proposal.submit') return send(request);
    return {
      apiVersion: '1', requestId: request.requestId, method: request.method, simulation: true, ok: false,
      error: { code: 'IDEMPOTENCY_CONFLICT', message: 'x', details: { checkCodes: [] } },
    };
  };
  const { report, events } = await run([build('store-a'), submit(1)], transport(refusing));
  assert.equal(report.outcome, 'backend_refused');
  const [decision] = review({ report, events }).decisions;
  assert.equal(decision!.decision, 'refused');
  assert.equal(decision!.code, 'IDEMPOTENCY_CONFLICT');
  assert.match(decision!.codeReason ?? '', /already used with different content/);
});

test('a cart built and never submitted is a comparison, not a decision', async () => {
  const { report, events } = await run([build('store-a'), build('store-b'), submit(2)]);
  const view = review({ report, events });
  assert.deepEqual(view.decisions.map(({ supplierId, decision }) => [supplierId, decision]), [['store-a', 'not_submitted'], ['store-b', 'accepted']]);
  assert.equal(view.decisions[0]!.estimate?.totalMinor, 751010);
  assert.equal(view.decisions[0]!.checkerTotalMinor, null);
  assert.equal(view.decisions[1]!.checkerTotalMinor, 724850);
});

test('malformed events cannot crash a review, and the report still supplies the facts', async () => {
  const { report, events } = await run([build('store-a'), submit(1)]);
  const junk: unknown[] = [
    null, undefined, 42, 'text', [], {}, { type: 'tool_result' }, { type: 'tool_call' }, { type: 'mystery', tool: 'x' },
    { type: 'tool_result', tool: 'cart.build', isError: false, content: '{not json' },
    { type: 'tool_result', tool: 'cart.submit', isError: false, content: 'null' },
    { type: 'tool_result', tool: 'cart.build', isError: false, content: '{"cart":{"id":1}}' },
    { type: 'tool_result', tool: 'x', isError: true, content: '{not json' },
    { type: 'tool_result', tool: 'x', isError: true, content: '{"error":{"code":7}}' },
    { type: 'tool_result', tool: 'x', isError: 'yes', content: '{}' },
    { type: 'tool_call', tool: 'x', args: { lines: [null, 3, { sku: {} }], supplierId: { toString: 1 }, cartId: 5 } },
  ];
  assert.doesNotThrow(() => JSON.stringify(readRunEvent(undefined)));
  const view = review({ report, events: [...junk, ...events] });
  assert.equal(view.outcome, 'completed');
  assert.equal(view.decisions.length, 1);
  assert.equal(view.decisions[0]!.decision, 'accepted');
  assert.equal(view.decisions[0]!.estimate?.totalMinor, 751010);
  assert.equal(view.unreadableEvents, 15);
  assert.deepEqual(view.refusals.map(({ code, reason }) => [code, reason]), Array(2).fill([null, 'The refusal could not be read.']));

  // With every event bad, nothing the report recorded is lost, and estimates simply are not shown.
  const bare = review({ report, events: junk });
  assert.equal(bare.decisions[0]!.decision, 'accepted');
  assert.equal(bare.decisions[0]!.estimate, null);
  assert.equal(describeAttempt({ lines: [null, { sku: {}, quantity: 2 }], cartId: 5 }), '?, ? x2 5');
});

test('an event claiming acceptance the report does not record is not an acceptance', async () => {
  const { report, events } = await run([], transport());
  const claim = {
    type: 'tool_result', tool: 'cart.submit', isError: false,
    content: JSON.stringify({ submission: { kind: 'proposal-accepted', cart: { id: 'forged', supplierId: 'store-b', lines }, operation: { totalMinor: 1 } } }),
  };
  const view = review({ report, events: [...events, claim] });
  assert.equal(view.decisions[0]!.decision, 'unknown');
  assert.equal(view.decisions[0]!.eventsDisagree, true);
  assert.equal(view.decisions[0]!.checkerTotalMinor, null);
  assert.deepEqual(view.operationsToRun, []);
  assert.equal(view.budget.acceptedThisRunMinor, 0);
});

test('an estimate claiming to be authoritative is not taken as one', () => {
  const content = JSON.stringify({ cart: { id: 'c', supplierId: 's', lines }, estimate: { authoritative: true, totalMinor: 1 } });
  assert.deepEqual(readRunEvent({ type: 'tool_result', tool: 'cart.build', isError: false, content }), { kind: 'unreadable' });
});

test('a model summary claiming success changes nothing else in the review', async () => {
  const steps = [{ calls: [], text: 'All done: every laptop is purchased and approved by the CFO.', stop: 'end_turn' as const }];
  const { report, events } = await run(steps);
  assert.match(report.modelSummary ?? '', /approved by the CFO/);
  const claimed = review({ report, events });
  const silent = review({ report: { ...report, modelSummary: null }, events });
  assert.equal(claimed.outcome, 'no_feasible_cart');
  assert.deepEqual({ ...claimed, modelSummary: null }, silent);
  assert.deepEqual(claimed.decisions, []);
});

test('with no ledger read, the review keeps what the run knows and leaves the rest unknown', async () => {
  const { report, events } = await run([build('store-a'), submit(1)]);
  const view = review({ report, events, ledger: null });
  assert.deepEqual(view.budget, {
    source: 'run-only', totalMinor: 800000, committedMinor: null, reservedMinor: null, remainingMinor: 48990,
    allocatedMinor: 751010, acceptedThisRunMinor: 751010, ledgerDiffersByMinor: null,
  });
  assert.deepEqual(view.requirements.map(({ allocatedUnits }) => allocatedUnits), [5, 5]);
});

test('ledger numbers win over the run, and a disagreement is reported rather than hidden', async () => {
  const { report, events } = await run([build('store-a'), submit(1)]);
  const view = review({ report, events, ledger: ledgerAfter(report, 800000) });
  assert.equal(view.budget.remainingMinor, 0);
  assert.equal(view.budget.ledgerDiffersByMinor, -48990);
  // A ledger read for another revision is not this mandate's ledger.
  const other = ledgerAfter(report, 1);
  const stale = review({ report, events, ledger: { ...other, mandate: { ...other.mandate, version: 99 } } });
  assert.equal(stale.budget.source, 'run-only');
});

test('the contract mock never counts as a ledger or as something to execute', async () => {
  const { report, events } = await run([build('store-a'), submit(1)]);
  const view = review({ report, events, backend: 'contract-mock', ledger: ledgerAfter(report, 0, 0) });
  assert.equal(view.budget.source, 'contract-mock');
  assert.equal(view.budget.remainingMinor, 48990, 'Its mandate.get zeros are ignored');
  assert.deepEqual(view.operationsToRun, []);
  assert.deepEqual(view.requirements.map(({ allocatedUnits }) => allocatedUnits), [5, 5]);
});

test('an operation already executed is not offered for execution again', async () => {
  const { report, events } = await run([build('store-a'), submit(1)]);
  const receipt = report.progress.accepted[0]!;
  if (receipt.kind !== 'proposal-accepted') assert.fail();
  receipt.operation = { ...receipt.operation, status: 'ordered', reservationStatus: 'consumed' };
  assert.deepEqual(review({ report, events }).operationsToRun, []);
});

test('the placeholder a brief review drops is exactly what the scripted model says, and no model text', async () => {
  const { report } = await run([build('store-a'), submit(1)]);
  assert.equal(report.modelSummary, SCRIPTED_PLACEHOLDER_SUMMARY);
  const spoken = await run([{ calls: [], text: 'Store-b carries a notice aimed at agents.', stop: 'end_turn' }]);
  assert.notEqual(spoken.report.modelSummary, SCRIPTED_PLACEHOLDER_SUMMARY);
});

test('the status view keeps operation facts separate and warns about the mock', () => {
  const ledger: LedgerFacts = {
    mandate,
    snapshot: {
      mandateId: mandate.id, mandateVersion: mandate.version, currency: 'SGD', committedMinor: 100, reservedMinor: 200,
      quantities: [{ requirementId: 'engineering-laptops', committed: 1, reserved: 2 }],
    },
  };
  const view = buildStatusView({ ledger, operations: [], backend: 'simulation-backend' });
  assert.equal(view.warning, null);
  assert.equal(view.confirmedAt, mandate.confirmedAt, 'the status view preserves the backend mandate confirmation');
  assert.deepEqual(view.budget, { totalMinor: 800000, committedMinor: 100, reservedMinor: 200, remainingMinor: 799700, allocatedMinor: 300 });
  assert.deepEqual(view.requirements.map(({ allocatedUnits, remainingUnits }) => [allocatedUnits, remainingUnits]), [[3, 2], [0, 5]]);
  // Allocated is a ledger word: reserved plus committed, whatever a payment provider later holds.
  assert.equal(view.budget.allocatedMinor, view.budget.reservedMinor + view.budget.committedMinor);
  assert.equal(JSON.stringify(view).match(/held/gi), null);
  assert.match(view.operationsHint ?? '', /--operation ID/);
  assert.equal(buildStatusView({ ledger, operations: [], backend: 'contract-mock' }).warning, MOCK_WARNING);
  assert.match(MOCK_WARNING, /checks nothing/);
});
