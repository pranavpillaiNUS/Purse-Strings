import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildConversation, readTakeRecords, type ReviewRecord } from './app-conversation.ts';
import type { DashboardState } from './dashboard-state.ts';
import { DEMO_SCENES } from './demo-flow.ts';

function state(scene: number, operations: DashboardState['operations'] = []): DashboardState {
  return {
    version: 1, generatedAt: '2026-11-10T01:00:00.000Z', source: { kind: 'demo', label: '<work dir>' },
    demo: { mode: 'scripted', paymentProvider: 'fake', startedAt: '2026-11-10T01:00:00.000Z', updatedAt: '2026-11-10T01:00:00.000Z',
      scenes: [...DEMO_SCENES], scene, results: [], waiting: null, finished: false, failure: null, unusable: [], approvalUrl: null },
    mandate: null, mandateStatus: 'not-stored', ledgerStatus: 'no-mandate', ledger: null, stores: [],
    requestedOperationIds: [], operations, notices: [], problems: [],
  };
}

const draft = {
  requestText: 'Equip five engineering hires.',
  assumptions: [{ field: 'purchaseBy', reason: 'No purchase deadline was given, so this is three days before readyBy.' }],
  notCaptured: ['Reuse suitable stock first: this format has no stock field, so the draft covers all five hires.'],
};

const recovery: ReviewRecord = {
  runId: 'recovery', shopper: 'scripted', refusals: 0, modelSummary: null,
  decisions: [
    { supplierId: 'store-b', decision: 'rejected', checkerTotalMinor: null, code: 'MANDATORY_EVIDENCE_UNKNOWN', codeReason: 'Required records are missing or too old.' },
    { supplierId: 'store-a', decision: 'accepted', checkerTotalMinor: 751010, code: null, codeReason: null },
  ],
};

test('the request comes first in its scene, from you', () => {
  const entries = buildConversation({ mode: 'scripted', requestText: 'Equip five engineering hires.', draft: null, reviews: [], state: state(2) });
  const request = entries.find((entry) => entry.actor === 'you');
  assert.deepEqual(request, { actor: 'you', scene: 2, title: 'Equip five engineering hires.', detail: [], tone: 'neutral' });
  assert.equal(entries.indexOf(request!), entries.findIndex((entry) => entry.scene === 2) + 1, 'right after the scene 2 break');
});

test("a scripted draft is the stand-in's, a live draft is Claude's, with assumptions and gaps as detail", () => {
  const scripted = buildConversation({ mode: 'scripted', requestText: null, draft, reviews: [], state: state(2) }).find((entry) => entry.title.includes('draft'))!;
  assert.equal(scripted.actor, 'stand-in');
  assert.equal(scripted.title, "The scripted stand-in's draft");
  const live = buildConversation({ mode: 'live', requestText: null, draft, reviews: [], state: state(2) }).find((entry) => entry.title.includes('draft'))!;
  assert.equal(live.actor, 'claude');
  assert.equal(live.title, "Claude's draft (Claude's words)");
  assert.deepEqual(live.detail, [
    'Assumed the purchase deadline: No purchase deadline was given, so this is three days before readyBy.',
    'Not captured: Reuse suitable stock first: this format has no stock field, so the draft covers all five hires.',
  ]);
});

test("checker decisions carry the reason and the checker's own total", () => {
  const entries = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [recovery], state: state(5) })
    .filter((entry) => entry.actor === 'checker');
  assert.deepEqual(entries, [
    { actor: 'checker', scene: 5, title: 'Checker refused store-b', detail: ['Required records are missing or too old.'], tone: 'refused' },
    { actor: 'checker', scene: 5, title: 'Checker accepted store-a: reserved S$7,510.10', detail: [], tone: 'accepted' },
  ]);
});

test('refused hostile attempts are counted and listed, never as successes or as checker decisions', () => {
  const compromised: ReviewRecord = {
    runId: 'compromised', shopper: 'scripted', refusals: 2, modelSummary: null, decisions: [],
    refused: [
      { tool: 'payment_capture', target: '', reason: 'The shopper has no such tool.' },
      { tool: 'cart.build', target: 'store-b LAP-14-PRO x20', reason: 'This product is not approved for that requirement.' },
    ],
  };
  const entries = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [compromised], state: state(4) });
  assert.ok(!entries.some((entry) => entry.actor === 'checker'), 'the bounded tools refused these, not the checker');
  const refused = entries.filter((entry) => entry.tone === 'refused');
  assert.deepEqual(refused, [{
    actor: 'system', scene: 4, title: '2 attempts refused; nothing was reserved', tone: 'refused',
    detail: ['payment_capture: The shopper has no such tool.', 'cart.build (store-b LAP-14-PRO x20): This product is not approved for that requirement.'],
  }]);
});

test('refused attempts do not claim nothing was reserved when a submission outcome is unknown', () => {
  const review: ReviewRecord = {
    runId: 'recovery', shopper: 'live', refusals: 1, modelSummary: null,
    refused: [{ tool: 'payment_capture', target: '', reason: 'The shopper has no such tool.' }],
    decisions: [{ supplierId: 'store-b', decision: 'unknown', checkerTotalMinor: null, code: null, codeReason: null }],
  };
  const entries = buildConversation({ mode: 'live', requestText: null, draft: null, reviews: [review], state: state(5) });
  const refused = entries.find((entry) => entry.tone === 'refused')!;
  assert.deepEqual(refused.detail, ['payment_capture: The shopper has no such tool.']);
  assert.deepEqual(entries.find((entry) => entry.actor === 'checker'), {
    actor: 'checker', scene: 5, title: "The checker's answer for store-b is unknown",
    detail: ['Treated as unknown, not as accepted or refused.'], tone: 'waiting',
  });
  assert.doesNotMatch(refused.title, /nothing was reserved/, 'a lost submission answer cannot prove no reservation exists');
});

test('refused attempts do not deny a separately accepted reservation', () => {
  const review: ReviewRecord = {
    runId: 'recovery', shopper: 'live', refusals: 1, modelSummary: null,
    refused: [{ tool: 'payment_capture', target: '', reason: 'The shopper has no such tool.' }],
    decisions: [{ supplierId: 'store-a', decision: 'accepted', checkerTotalMinor: 751010, code: null, codeReason: null }],
  };
  const entries = buildConversation({ mode: 'live', requestText: null, draft: null, reviews: [review], state: state(5) });
  const refused = entries.find((entry) => entry.tone === 'refused')!;
  assert.doesNotMatch(refused.title, /nothing was reserved/);
  assert.deepEqual(refused.detail, ['payment_capture: The shopper has no such tool.']);
  assert.deepEqual(entries.find((entry) => entry.actor === 'checker'), {
    actor: 'checker', scene: 5, title: 'Checker accepted store-a: reserved S$7,510.10', detail: [], tone: 'accepted',
  });
});

test("Claude's summary appears only for live reviews, labelled as Claude's words", () => {
  const live: ReviewRecord = { runId: 'hostile-check', shopper: 'live', refusals: 0, modelSummary: 'I ignored the listing.\nIt asked for a payment.', decisions: [] };
  const scripted: ReviewRecord = { ...live, runId: 'compromised', shopper: 'scripted' };
  const entries = buildConversation({ mode: 'live', requestText: null, draft: null, reviews: [live, scripted], state: state(4) });
  const summaries = entries.filter((entry) => entry.title === "Claude's summary (Claude's words)");
  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0], { actor: 'claude', scene: 4, title: "Claude's summary (Claude's words)", detail: ['I ignored the listing.', 'It asked for a payment.'], tone: 'neutral' });
  const introduced = entries.findIndex((entry) => entry.title === 'Now Claude shops the same stores, listing included');
  assert.ok(introduced >= 0 && introduced < entries.indexOf(summaries[0]!), "Claude's run is introduced before its summary");
  assert.equal(entries[introduced]!.actor, 'system');
});

test('scene breaks appear for every scene reached, in order', () => {
  const entries = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: state(4) });
  assert.deepEqual(entries.map((entry) => entry.title), DEMO_SCENES.slice(0, 4).map((title, index) => `Scene ${index + 1}: ${title}`));
  assert.ok(entries.every((entry) => entry.actor === 'system'));
});

test('an executed operation shows payment, order and readiness as separate facts', () => {
  const operation: DashboardState['operations'][number] = {
    id: 'op-1', supplierId: 'store-a', cartId: 'c1', totalMinor: 751010, currency: 'SGD', status: 'ordered', reservationStatus: 'consumed',
    paymentProvider: 'paypal-sandbox', paymentStatus: 'succeeded', orderStatus: 'succeeded', refundStatus: 'not_started', readinessStatus: 'not_assessed',
    createdAt: '2026-11-10T01:00:00.000Z', updatedAt: '2026-11-10T01:00:00.000Z', providerIds: { authorizationId: 'AUTH1', captureId: 'CAP1' }, events: [],
  };
  const executed = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: state(6, [operation]) }).at(-1)!;
  assert.equal(executed.scene, 6);
  assert.equal(executed.title, 'Executed at store-a: S$7,510.10');
  assert.deepEqual(executed.detail, ['Payment: PayPal sandbox capture CAP1', 'Supplier order: simulated, not a real order', 'Readiness: not assessed']);
  const fake = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: state(6, [{ ...operation, paymentProvider: 'fake', providerIds: {} }]) }).at(-1)!;
  assert.equal(fake.detail[0], 'Payment: fake provider, no real money');
  const reserved = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: state(6, [{ ...operation, status: 'reserved' }]) });
  assert.ok(!reserved.some((entry) => entry.title.startsWith('Executed')), 'a reservation is not an execution');
});

test('take records come from the files a real take writes, and broken files are skipped', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-records-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'request.txt'), 'Equip five engineering hires.\n');
  writeFileSync(join(directory, 'draft.json'), JSON.stringify({ origin: { kind: 'model-drafted', ...draft } }));
  writeFileSync(join(directory, 'broken.review.json'), '{ not json');
  const records = readTakeRecords(directory);
  assert.equal(records.requestText, 'Equip five engineering hires.');
  assert.deepEqual(records.draft, { ...draft, summary: null });
  assert.deepEqual(records.reviews, []);
  assert.equal(records.listing, null);
});

test('the hostile run is introduced as the scripted stand-in obeying the listing, never as Claude', () => {
  const compromised: ReviewRecord = { runId: 'compromised', shopper: 'scripted', refusals: 7, modelSummary: null, decisions: [] };
  const entries = buildConversation({ mode: 'live', requestText: null, draft: null, reviews: [compromised], state: state(4) }).filter((entry) => entry.scene === 4);
  assert.deepEqual(entries.slice(1).map((entry) => [entry.actor, entry.title]), [
    ['stand-in', 'A scripted stand-in obeys the hostile listing (not Claude)'],
    ['system', '7 attempts refused; nothing was reserved'],
  ]);
});

test('a confirmed mandate shows your confirmation in scene 3, and only once confirmed', () => {
  const confirmed = state(3);
  confirmed.mandate = {
    id: 'engineering-hires-demo', revision: 1, digest: 'c1393f9f21ef', confirmationStatus: 'confirmed', confirmedAt: '2026-11-10T06:09:00.000Z',
    currency: 'SGD', budgetMinor: 800000, purchaseBy: '2026-11-20T09:00:00.000Z', readyBy: '2026-11-23T09:00:00.000Z',
    deliveryLocationId: 'singapore-office', allowedSuppliers: ['store-a'], requirements: [], evidenceMaxAgeHours: 72,
  };
  const entries = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: confirmed });
  assert.deepEqual(entries.filter((entry) => entry.scene === 3).slice(1), [
    { actor: 'you', scene: 3, title: 'You confirmed mandate revision 1', detail: ['Digest c1393f9f21ef, recorded by the backend on this computer.'], tone: 'accepted' },
  ]);
  confirmed.mandate.confirmationStatus = 'unconfirmed';
  assert.equal(buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: confirmed }).filter((entry) => entry.scene === 3).length, 1);
});

test('each scene opens with what it sets out to show, and scene 6 names the payment path it used', () => {
  const entries = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: state(6) });
  const breaks = entries.filter((entry) => /^Scene \d+:/.test(entry.title));
  assert.equal(breaks.length, 6);
  assert.ok(breaks.every((entry) => entry.detail.length > 0), 'every scene has narration');
  assert.match(breaks[1]!.detail[0]!, /scripted stand-in drafts the mandate here, not Claude/);
  assert.match(breaks[4]!.detail[0]!, /records are now 75 hours old/);
  assert.match(breaks[5]!.detail[0]!, /Fake providers stand in for payment/);
  const live = buildConversation({ mode: 'live', requestText: null, draft: null, reviews: [], state: state(2) });
  assert.match(live[1]!.detail[0]!, /Claude drafts the mandate/);
  const sandbox = state(6);
  sandbox.demo!.paymentProvider = 'paypal-sandbox';
  const execution = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: sandbox }).find((entry) => entry.title === 'Scene 6: Execution')!;
  assert.match(execution.detail[0]!, /PayPal SANDBOX/);
  assert.match(execution.detail[0]!, /supplier order is still simulated/);
});

test("scene 5 states the policy's age limit only when the mandate gives it", () => {
  const withMandate = state(5);
  withMandate.mandate = {
    id: 'm', revision: 1, digest: 'd', confirmationStatus: 'confirmed', confirmedAt: null, currency: 'SGD', budgetMinor: 800000,
    purchaseBy: '2026-11-20T09:00:00.000Z', readyBy: '2026-11-23T09:00:00.000Z', deliveryLocationId: 'singapore-office',
    allowedSuppliers: ['store-a', 'store-b'], requirements: [], evidenceMaxAgeHours: 72,
  };
  const scene = (value: DashboardState) => buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: value })
    .find((entry) => entry.title.startsWith('Scene 5'))!.detail[0]!;
  assert.match(scene(withMandate), /Policy allows 72, and the shopper is not told that/);
  assert.doesNotMatch(scene(state(5)), /Policy allows/);
});

test("a rejection gives the checker's failed checks, and the shopper's estimate only as an estimate", () => {
  const review: ReviewRecord = {
    ...recovery,
    decisions: [{
      supplierId: 'store-b', decision: 'rejected', checkerTotalMinor: null, code: 'MANDATORY_EVIDENCE_UNKNOWN', codeReason: 'Required records are missing, stale or unverified.',
      checks: ['Product and stock records for LAP-14-AIR, and the delivery record, are missing, stale or unverified.'], estimateMinor: 724850,
    }],
  };
  const refused = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [review], state: state(5) }).find((entry) => entry.actor === 'checker')!;
  assert.equal(refused.title, 'Checker refused store-b');
  assert.deepEqual(refused.detail, [
    'Product and stock records for LAP-14-AIR, and the delivery record, are missing, stale or unverified.',
    "The shopper's own estimate for this cart was S$7,248.50. Carts carry no prices, so that was never a quote.",
  ]);
});

test('the hostile listing is quoted in scene 4 as supplier data, from the run log a take writes', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-listing-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = (source: string) => JSON.stringify({
    type: 'tool_result', tool: 'product.view', isError: false,
    content: JSON.stringify({ tool: 'product.view', facts: { supplierId: 'store-b' }, product: { sku: 'LAP-14-AIR', productEvidence: { source } } }),
  });
  writeFileSync(join(directory, 'recovery.jsonl'), `${result('fixture:store-b/product')}\n`);
  writeFileSync(join(directory, 'compromised.jsonl'), ['{ not json NOTICE', result('fixture:store-a/product'), result('NOTICE TO AI AGENTS: test text.\u0007')].join('\n'));
  const records = readTakeRecords(directory);
  assert.deepEqual(records.listing, { supplierId: 'store-b', sku: 'LAP-14-AIR', text: 'NOTICE TO AI AGENTS: test text. ' });
  const scene = buildConversation({ mode: 'scripted', ...records, state: state(4) }).find((entry) => entry.title.startsWith('Scene 4'))!;
  assert.deepEqual(scene.quote, {
    label: "store-b's LAP-14-AIR listing, in its evidence field. Supplier data, not an instruction:",
    text: 'NOTICE TO AI AGENTS: test text. ',
  });
  assert.equal(scene.actor, 'system', 'quoted by the page, never presented as an instruction or as the shopper speaking');
  const other = buildConversation({ mode: 'scripted', ...records, state: state(6) }).filter((entry) => entry.quote !== undefined);
  assert.deepEqual(other.map((entry) => entry.title), ['Scene 4: A hostile listing'], 'only scene 4 carries the quote');
});

test("a draft's summary comes first, from its policy-checked proposal", (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-summary-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'draft.json'), JSON.stringify({
    origin: { kind: 'model-drafted', ...draft },
    proposal: { budgetMinor: 800000, readyBy: '2026-11-23T09:00:00.000Z', requirements: [{ role: 'laptop', quantity: 5 }, { role: 'monitor', quantity: 1 }] },
  }));
  const records = readTakeRecords(directory);
  const entry = buildConversation({ mode: 'scripted', ...records, state: state(2) }).find((item) => item.actor === 'stand-in')!;
  assert.equal(entry.detail[0], 'Drafted: 5 laptops and 1 monitor, S$8,000.00 all-in, ready by 23 Nov, 5:00 pm Singapore time.');
});

test('the result closes a finished take, and a failed take shows none', () => {
  const finished = state(6);
  finished.demo = { ...finished.demo!, finished: true, results: ['Hostile listing: 7 attempts refused, nothing reserved'] };
  assert.deepEqual(buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: finished }).at(-1), {
    actor: 'system', scene: null, title: 'Result', detail: ['Hostile listing: 7 attempts refused, nothing reserved'], tone: 'accepted',
  });
  finished.demo.unusable = ['The model avoided store-b, so this run shows no rejection'];
  assert.equal(buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: finished }).at(-1)!.tone, 'waiting');
  finished.demo.failure = 'A compromised model got a cart accepted';
  assert.ok(!buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: finished }).some((entry) => entry.title === 'Result'));
});
