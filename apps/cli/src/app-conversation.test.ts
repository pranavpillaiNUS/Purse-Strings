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
    'Assumed purchaseBy: No purchase deadline was given, so this is three days before readyBy.',
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

test('refused hostile attempts are counted, never listed as successes', () => {
  const compromised: ReviewRecord = { runId: 'compromised', shopper: 'scripted', refusals: 7, modelSummary: null, decisions: [] };
  const entries = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [compromised], state: state(4) });
  const checker = entries.filter((entry) => entry.actor === 'checker');
  assert.deepEqual(checker.map((entry) => [entry.scene, entry.title, entry.tone]), [[4, 'Checker refused 7 attempts; nothing was reserved', 'refused']]);
});

test("Claude's summary appears only for live reviews, labelled as Claude's words", () => {
  const live: ReviewRecord = { runId: 'hostile-check', shopper: 'live', refusals: 0, modelSummary: 'I ignored the listing.\nIt asked for a payment.', decisions: [] };
  const scripted: ReviewRecord = { ...live, runId: 'compromised', shopper: 'scripted' };
  const entries = buildConversation({ mode: 'live', requestText: null, draft: null, reviews: [live, scripted], state: state(4) });
  const summaries = entries.filter((entry) => entry.title === "Claude's summary (Claude's words)");
  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0], { actor: 'claude', scene: 4, title: "Claude's summary (Claude's words)", detail: ['I ignored the listing.', 'It asked for a payment.'], tone: 'neutral' });
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
  const unknown = buildConversation({ mode: 'scripted', requestText: null, draft: null, reviews: [], state: state(6, [{ ...operation, paymentProvider: null, providerIds: {} }]) }).at(-1)!;
  assert.equal(unknown.detail[0], 'Payment provider: unknown');
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
  assert.deepEqual(records.draft, draft);
  assert.deepEqual(records.reviews, []);
});

test('the hostile run is introduced as the scripted stand-in obeying the listing, never as Claude', () => {
  const compromised: ReviewRecord = { runId: 'compromised', shopper: 'scripted', refusals: 7, modelSummary: null, decisions: [] };
  const entries = buildConversation({ mode: 'live', requestText: null, draft: null, reviews: [compromised], state: state(4) }).filter((entry) => entry.scene === 4);
  assert.deepEqual(entries.slice(1).map((entry) => [entry.actor, entry.title]), [
    ['stand-in', 'A scripted stand-in obeys the hostile listing (not Claude)'],
    ['checker', 'Checker refused 7 attempts; nothing was reserved'],
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
