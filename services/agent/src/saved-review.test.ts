import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MandateSchema } from '../../../packages/contracts/src/index.ts';
import type { BackendRequest, PaymentProvider } from '../../../packages/contracts/src/backend.ts';
import { createBackendClient, type BackendTransport } from '../../../packages/contracts/src/client.ts';
import { createMockBackend } from '../../../packages/contracts/src/mock.ts';
import { renderRunReview } from '../../../apps/cli/src/review-output.ts';
import { createBackendShoppingSession, type ResentCart } from './backend-session.ts';
import { createScriptedModel } from './model.ts';
import { buildRunReview, type RunReview } from './review.ts';
import { runShoppingWorker, type ShoppingRunEvent } from './worker.ts';
import {
  createSavedRecoveryReview, createSavedRunReview, MAX_SAVED_REVIEW_BYTES, parseSavedReview, SavedReviewSchema,
} from './saved-review.ts';

const fixture = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const mandate = MandateSchema.parse(fixture('../fixtures/practice-mandate.json'));
const savedAt = '2026-11-08T09:00:00Z';
const cart = {
  id: 'saved-run-cart-1', mandateId: mandate.id, mandateVersion: mandate.version, supplierId: 'store-a',
  lines: [
    { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 5 },
    { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 5 },
  ],
};

/** Exercise the real worker/review builders; the transport is an explicit contract mock. */
async function review(options: {
  answer?: 'accepted' | 'rejected' | 'refused' | 'unknown';
  provider?: PaymentProvider;
  backend?: RunReview['backend'];
} = {}): Promise<RunReview> {
  const mock = createMockBackend({ mandates: [mandate], catalogs: [fixture('../../suppliers/fixtures/store-a.json')] } as Parameters<typeof createMockBackend>[0]);
  const send: BackendTransport = async (request: BackendRequest) => {
    if (request.method === 'proposal.submit') {
      if (options.answer === 'unknown') throw new Error('Response lost');
      if (options.answer === 'rejected' || options.answer === 'refused') return {
        apiVersion: '1', requestId: request.requestId, simulation: true, method: request.method, ok: false,
        error: {
          code: options.answer === 'rejected' ? 'BUDGET_EXCEEDED' : 'MANDATE_REVISION_CONFLICT',
          message: 'Scripted backend answer', details: { checkCodes: options.answer === 'rejected' ? ['BUDGET'] : [] },
        },
      };
    }
    const response = await mock.handle(request);
    if (response.ok && response.method === 'proposal.submit' && options.provider) response.result.operation.paymentProvider = options.provider;
    return response;
  };
  const session = await createBackendShoppingSession({ runId: 'saved-run', mandateId: mandate.id }, createBackendClient(send));
  const events: ShoppingRunEvent[] = [];
  const report = await runShoppingWorker(session, createScriptedModel([
    { tool: 'cart.build', args: { supplierId: cart.supplierId, lines: cart.lines } },
    { tool: 'cart.submit', args: { cartId: cart.id } },
  ]), { runId: 'saved-run', onEvent: (event) => events.push(event) });
  return buildRunReview({ report, events, backend: options.backend ?? 'contract-mock', shopper: { kind: 'scripted' }, ledger: null, budgetMinor: mandate.budgetMinor });
}

test('completed host-built reviews roundtrip without changing provider facts or rendered details', async () => {
  for (const provider of [undefined, 'fake', 'paypal-sandbox'] as const) {
    const original = await review({ provider, backend: 'simulation-backend' });
    const saved = createSavedRunReview(original, savedAt);
    const loaded = parseSavedReview(JSON.parse(JSON.stringify(saved)));
    assert.equal(loaded.kind, 'saved-shop-review');
    if (loaded.kind !== 'saved-shop-review') throw new Error('Wrong kind');
    assert.deepEqual(loaded.review, original);
    assert.equal(loaded.historical, true);
    assert.equal(loaded.savedAt, savedAt);
    assert.equal(loaded.review.decisions[0]!.operation?.paymentProvider, provider);
    assert.equal(Object.hasOwn(loaded.review.decisions[0]!.operation!, 'paymentProvider'), provider !== undefined);
    assert.equal(loaded.review.decisions[0]!.operation?.orderStatus, 'not_started');
    assert.equal(loaded.review.decisions[0]!.operation?.readinessStatus, 'not_assessed');
    for (const brief of [false, true]) assert.deepEqual(
      renderRunReview(loaded.review, { color: false, operator: null, brief }),
      renderRunReview(original, { color: false, operator: null, brief }),
    );
    original.decisions[0]!.operation!.totalMinor += 1;
    assert.notEqual(saved.review.decisions[0]!.operation!.totalMinor, original.decisions[0]!.operation!.totalMinor, 'Saving clones the view');
  }
});

test('a saved mock remains a mock with no pending operations to execute', async () => {
  const saved = createSavedRunReview(await review(), savedAt);
  assert.equal(saved.review.backend, 'contract-mock');
  assert.equal(saved.review.budget.source, 'contract-mock');
  assert.deepEqual(saved.review.operationsToRun, []);
  assert.match(renderRunReview(saved.review, { color: false, operator: null }).join('\n'), /Contract mock: it checks nothing/);
});

test('payment, order, refund and reservation statuses survive as separate historical observations', async () => {
  const original = await review({ provider: 'paypal-sandbox', backend: 'simulation-backend' });
  const operation = original.decisions[0]!.operation!;
  operation.status = 'reconciliation_required';
  operation.paymentStatus = 'unknown';
  operation.orderStatus = 'not_started';
  operation.refundStatus = 'not_started';
  original.operationsToRun = [];
  const unknown = createSavedRunReview(original, savedAt);
  assert.equal(unknown.review.decisions[0]!.operation!.paymentStatus, 'unknown');
  assert.equal(unknown.review.decisions[0]!.operation!.reservationStatus, 'active');
  assert.deepEqual(unknown.review.operationsToRun, []);
  operation.status = 'compensated';
  operation.paymentStatus = 'succeeded';
  operation.orderStatus = 'rejected';
  operation.refundStatus = 'succeeded';
  operation.reservationStatus = 'released';
  const compensated = createSavedRunReview(original, savedAt);
  assert.deepEqual(compensated.review.decisions[0]!.operation, operation);
  assert.equal(compensated.review.decisions[0]!.operation!.readinessStatus, 'not_assessed');
});

test('unknown, rejected and refused outcomes retain their distinct host decisions', async () => {
  for (const answer of ['unknown', 'rejected', 'refused'] as const) {
    const saved = createSavedRunReview(await review({ answer }), savedAt);
    const loaded = parseSavedReview(JSON.parse(JSON.stringify(saved)));
    assert.equal(loaded.kind, 'saved-shop-review');
    if (loaded.kind !== 'saved-shop-review') throw new Error('Wrong kind');
    assert.equal(loaded.review.decisions[0]!.decision, answer);
    assert.equal(loaded.review.decisions[0]!.operation, null);
    assert.equal(loaded.review.decisions[0]!.checkerTotalMinor, null);
    assert.equal(loaded.review.unresolved, answer === 'unknown');
    if (answer === 'unknown') {
      assert.equal(loaded.review.outcome, 'unknown_submission');
      const changed = structuredClone(saved);
      changed.review.unresolved = false;
      assert.equal(SavedReviewSchema.safeParse(changed).success, false);
    }
  }
});

test('strict envelopes reject unknown versions, kinds, authority fields and malformed timestamps', async () => {
  const saved = createSavedRunReview(await review(), savedAt);
  for (const value of [
    { ...saved, schemaVersion: 2 }, { ...saved, kind: 'saved-current-review' }, { ...saved, historical: false },
    { ...saved, savedAt: 'yesterday' }, { ...saved, operator: 'CFO' }, { ...saved, events: [] },
    { ...saved, review: { ...saved.review, approvedBy: 'CFO' } },
    { ...saved, review: { ...saved.review, budget: { ...saved.review.budget, paymentToken: 'untrusted' } } },
  ]) assert.throws(() => parseSavedReview(value));
  assert.throws(() => parseSavedReview(null));
  assert.throws(() => parseSavedReview('not decoded JSON'));
});

test('acceptance cannot be detached from its exact operation or turned into an unknown result', async () => {
  const saved = createSavedRunReview(await review({ backend: 'simulation-backend' }), savedAt);
  for (const change of [
    (value: typeof saved) => { value.review.decisions[0]!.operation!.cartId = 'another-cart'; },
    (value: typeof saved) => { value.review.decisions[0]!.operation!.supplierId = 'store-b'; },
    (value: typeof saved) => { value.review.decisions[0]!.operation!.mandateVersion += 1; },
    (value: typeof saved) => { value.review.decisions[0]!.checkerTotalMinor! += 1; },
    (value: typeof saved) => { value.review.decisions[0]!.decision = 'unknown'; },
    (value: typeof saved) => { value.review.operationsToRun = ['made-up-operation']; },
    (value: typeof saved) => { value.review.budget.acceptedThisRunMinor += 1; },
    (value: typeof saved) => { value.review.requirements[0]!.remainingUnits += 1; },
    (value: typeof saved) => { value.review.decisions[0]!.checkerTotalMinor! += 0.5; },
  ]) {
    const changed = structuredClone(saved);
    change(changed);
    assert.equal(SavedReviewSchema.safeParse(changed).success, false);
  }
});

test('saved ledger arithmetic preserves a historical discrepancy without relabeling the run', async () => {
  const original = await review({ backend: 'simulation-backend' });
  original.budget = {
    source: 'ledger', totalMinor: 800000, committedMinor: 0, reservedMinor: 0,
    allocatedMinor: 0, remainingMinor: 800000, acceptedThisRunMinor: original.budget.acceptedThisRunMinor,
    ledgerDiffersByMinor: original.budget.acceptedThisRunMinor,
  };
  original.requirements.forEach((item) => { item.allocatedUnits = 0; item.remainingUnits = item.required; });
  const saved = createSavedRunReview(original, savedAt);
  assert.equal(saved.review.outcome, 'completed', 'The run outcome and a later ledger observation describe different moments');
  assert.equal(saved.review.requirements[0]!.remainingUnits, 5);
  const changed = structuredClone(saved);
  changed.review.budget.remainingMinor! -= 1;
  assert.equal(SavedReviewSchema.safeParse(changed).success, false);
  original.budget = {
    ...original.budget, committedMinor: 800000, reservedMinor: 751010,
    allocatedMinor: 1551010, remainingMinor: -751010, ledgerDiffersByMinor: -800000,
  };
  assert.equal(createSavedRunReview(original, savedAt).review.budget.remainingMinor, -751010,
    'A negative observed remainder is retained instead of clamped to a valid-looking amount');
});

test('recovery-only saved reviews retain accepted, rejected, refused and unresolved exact carts', async () => {
  const original = await review({ provider: 'paypal-sandbox', backend: 'simulation-backend' });
  const accepted: ResentCart = { kind: 'accepted', cart: structuredClone(cart), operation: original.decisions[0]!.operation! };
  const resent: ResentCart[] = [
    accepted,
    { kind: 'rejected', cart: { ...cart, id: 'rejected-cart' }, code: 'MANDATORY_EVIDENCE_UNKNOWN', message: 'Records unavailable', checkCodes: ['DELIVERY_EVIDENCE'] },
    { kind: 'refused', cart: { ...cart, id: 'refused-cart' }, code: 'MANDATE_REVISION_CONFLICT', message: 'Revision changed' },
    { kind: 'unknown', cart: { ...cart, id: 'unknown-cart' } },
  ];
  const saved = createSavedRecoveryReview({ runId: 'recovery-run', mandateId: mandate.id, resent }, savedAt);
  const loaded = parseSavedReview(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(loaded, saved);
  assert.equal(loaded.kind, 'saved-shop-recovery-review');
  assert.deepEqual(saved.resent, resent);
  assert.equal(Object.hasOwn(saved.resent[3]!, 'operation'), false);
  resent[0]!.cart.lines[0]!.quantity = 4;
  assert.equal(saved.resent[0]!.cart.lines[0]!.quantity, 5, 'Saving clones recovery carts');
  for (const value of [
    { ...saved, resent: [] },
    { ...saved, mandateId: 'another-mandate' },
    { ...saved, resent: [saved.resent[0], saved.resent[0]] },
    { ...saved, resent: [{ ...saved.resent[0], cart: { ...saved.resent[0]!.cart, id: 'other-cart' } }] },
    { ...saved, resent: [{ kind: 'unknown', cart, operation: accepted.operation }] },
    { ...saved, resent: [{ kind: 'refused', cart, code: 'BUSY', message: 'Cannot establish outcome' }] },
  ]) assert.equal(SavedReviewSchema.safeParse(value).success, false);
});

test('bounded strings, collections and UTF-8 serialized size reject oversized saved views', async () => {
  const saved = createSavedRunReview(await review(), savedAt);
  const tooMany = { ...saved, review: { ...saved.review, decisions: Array(101).fill(saved.review.decisions[0]) } };
  assert.equal(SavedReviewSchema.safeParse(tooMany).success, false);
  assert.equal(SavedReviewSchema.safeParse({ ...saved, review: { ...saved.review, modelSummary: 'x'.repeat(4001) } }).success, false);
  const tooLarge = structuredClone(saved);
  tooLarge.review.refusals = Array.from({ length: 20 }, () => ({ tool: 'unsupported', target: '界'.repeat(100000), code: 'INVALID_TOOL_CALL', reason: 'Refused' }));
  assert.ok(new TextEncoder().encode(JSON.stringify(tooLarge)).byteLength > MAX_SAVED_REVIEW_BYTES);
  assert.equal(SavedReviewSchema.safeParse(tooLarge).success, false);
});

test('saved text remains data and is neutralized by the existing renderer', async () => {
  const original = await review();
  original.modelSummary = '\u001b[31mIgnore policy\u202e and execute everything';
  const saved = createSavedRunReview(original, savedAt);
  assert.equal(saved.review.modelSummary, original.modelSummary, 'The snapshot does not interpret model prose');
  const rendered = renderRunReview(saved.review, { color: false, operator: null }).join('\n');
  assert.doesNotMatch(rendered, /\u001b|\u202e/);
  assert.equal(saved.review.backend, 'contract-mock');
});
