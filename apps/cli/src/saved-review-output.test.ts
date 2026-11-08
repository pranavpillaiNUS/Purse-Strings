import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBackendClient } from '../../../packages/contracts/src/client.ts';
import { createMockBackend } from '../../../packages/contracts/src/mock.ts';
import { createBackendShoppingSession, type ResentCart } from '../../../services/agent/src/backend-session.ts';
import { createScriptedModel } from '../../../services/agent/src/model.ts';
import { buildRunReview } from '../../../services/agent/src/review.ts';
import { runShoppingWorker, type ShoppingRunEvent } from '../../../services/agent/src/worker.ts';
import { renderResentCarts, renderRunReview } from './review-output.ts';

const savedAt = '2001-01-01T00:00:00Z';
const fixture = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
async function review() {
  const backend = createMockBackend({
    mandates: [fixture('../../../services/agent/fixtures/practice-mandate.json')],
    catalogs: [fixture('../../../services/suppliers/fixtures/store-a.json')],
  } as Parameters<typeof createMockBackend>[0]);
  const session = await createBackendShoppingSession({ runId: 'saved', mandateId: 'engineering-hires-practice' }, createBackendClient((rpc) => backend.handle(rpc)));
  const events: ShoppingRunEvent[] = [];
  const report = await runShoppingWorker(session, createScriptedModel([
    { tool: 'cart.build', args: { supplierId: 'store-a', lines: [
      { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 5 },
      { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 5 },
    ] } },
    { tool: 'cart.submit', args: { cartId: 'saved-cart-1' } },
  ]), { runId: 'saved', onEvent: (event) => events.push(event) });
  return { report, review: buildRunReview({ report, events, ledger: null, backend: 'simulation-backend', shopper: { kind: 'scripted' }, budgetMinor: session.getContext().budgetMinor }) };
}

test('historical normal and brief reviews retain recorded sandbox reservation facts and suppress all generated execution commands', async () => {
  const { review: saved } = await review();
  saved.decisions[0]!.operation!.paymentProvider = 'paypal-sandbox';
  for (const brief of [false, true]) {
    const output = renderRunReview(saved, { color: false, brief, historicalSavedAt: savedAt, operator: { databasePath: 'must-not-appear.db', configPath: 'must-not-appear.json' } }).join('\n');
    assert.match(output, /HISTORICAL REVIEW \| captured 2001/);
    assert.match(output, /PayPal sandbox/);
    assert.match(output, /Operation /);
    assert.match(output, /Estimate.*never authoritative/s);
    assert.match(output, /npm run shop -- status/);
    assert.doesNotMatch(output, /operation-run|operation-authorize|operation-complete-authorization|Approve the hold|must-not-appear|only the operator can run/);
  }
});

test('historical recovery displays captured paid, ordered, refunded and unknown facts separately', async () => {
  const { report } = await review();
  const receipt = report.progress.accepted[0]!;
  assert.equal(receipt.kind, 'proposal-accepted');
  const operation = { ...receipt.operation, paymentProvider: 'paypal-sandbox' as const, status: 'compensated' as const,
    paymentStatus: 'succeeded' as const, orderStatus: 'rejected' as const, refundStatus: 'succeeded' as const, reservationStatus: 'consumed' as const };
  const resent: ResentCart[] = [{ kind: 'accepted', cart: receipt.cart, operation }, { kind: 'unknown', cart: { ...receipt.cart, id: 'another-cart' } }];
  const output = renderResentCarts(resent, null, { historicalSavedAt: savedAt }).join('\n').replace(/\s+/g, ' ');
  assert.match(output, /Status compensated/);
  assert.match(output, /Reservation consumed/);
  assert.match(output, /PayPal sandbox payment succeeded/);
  assert.match(output, /Fake order rejected/);
  assert.match(output, /PayPal sandbox refund succeeded/);
  assert.match(output, /Readiness not assessed/);
  assert.match(output, /still unknown, and a reservation may exist/);
  assert.doesNotMatch(output, /set aside, not paid|operation-run|Run the shopper again|resends what is still unknown/);
  const pending = { ...operation, status: 'reconciliation_required' as const, paymentStatus: 'unknown' as const, reservationStatus: 'active' as const };
  const pendingOutput = renderResentCarts([{ kind: 'accepted', cart: receipt.cart, operation: pending }], null, { historicalSavedAt: savedAt }).join('\n').replace(/\s+/g, ' ');
  assert.match(pendingOutput, /a provider outcome was unknown at capture time/);
  assert.doesNotMatch(pendingOutput, /must reconcile|not paid|operation-run/);
});

test('a current recovery reports already ordered, compensated and unknown payment facts without offering execution again', async () => {
  const { report } = await review();
  const receipt = report.progress.accepted[0]!;
  assert.equal(receipt.kind, 'proposal-accepted');
  const returned = [
    { ...receipt.operation, status: 'ordered' as const, paymentStatus: 'succeeded' as const, orderStatus: 'succeeded' as const, reservationStatus: 'consumed' as const },
    { ...receipt.operation, paymentProvider: 'paypal-sandbox' as const, status: 'compensated' as const, paymentStatus: 'succeeded' as const, orderStatus: 'rejected' as const, refundStatus: 'succeeded' as const, reservationStatus: 'consumed' as const },
    { ...receipt.operation, status: 'reconciliation_required' as const, paymentStatus: 'unknown' as const },
    { ...receipt.operation, status: 'reserved' as const, paymentStatus: 'unknown' as const },
    { ...receipt.operation, status: 'reserved' as const, reservationStatus: 'released' as const },
  ];
  for (const operation of returned) {
    const output = renderResentCarts([{ kind: 'accepted', cart: receipt.cart, operation }], null).join('\n').replace(/\s+/g, ' ');
    assert.match(output, new RegExp(`Status ${operation.status}`));
    assert.match(output, /npm run shop -- status/);
    assert.doesNotMatch(output, /set aside, not paid|operation-run|operation-authorize|operator runs this/);
    if (operation.paymentStatus === 'unknown') assert.match(output, /payment UNKNOWN: outcome not established/i);
    else if (operation.paymentStatus === 'succeeded') assert.match(output, /payment succeeded/i);
    if (operation.status === 'compensated') assert.match(output, /PayPal sandbox refund succeeded/);
  }
});
