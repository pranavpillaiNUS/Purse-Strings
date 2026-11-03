import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixtureSupplier } from '../../../suppliers/src/fixture.ts';
import {
  PolicySchema, MandateSchema, CartSubmissionSchema, BudgetSnapshotSchema, CatalogSchema,
} from '../../../../packages/contracts/src/index.ts';
import { evaluatePurchase } from './evaluate.ts';

const now = '2026-11-03T09:00:00Z';
const load = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

async function input() {
  const submission = CartSubmissionSchema.parse(load('examples/cart.json'));
  return {
    policy: PolicySchema.parse(load('config/policies/hardware.example.json')),
    mandate: MandateSchema.parse(load('examples/mandate.json')),
    snapshot: BudgetSnapshotSchema.parse(load('examples/budget-snapshot.json')),
    submission,
    quote: await createFixtureSupplier(load('services/suppliers/fixtures/store-a.json')).quoteCart(submission, now),
    now,
  };
}

test('three laptops fit remaining amount and five-unit requirement across prior carts', async () => {
  const result = evaluatePurchase(await input());
  assert.equal(result.decision, 'eligible');
  // Independent arithmetic: 3 * S$1,099 plus 9% tax = S$3,593.73.
  assert.equal(result.totalMinor, 359373);
  assert.equal(result.remainingBeforeMinor, 400000);
});

test('shipping increase cannot consume more than the remaining all-in budget', async () => {
  const request = await input();
  request.quote.shippingMinor += 50000;
  request.quote.totalMinor += 50000;
  const result = evaluatePurchase(request);
  assert.equal(result.decision, 'blocked');
  assert.ok(result.checks.some((check) => check.code === 'BUDGET' && check.status === 'fail'));
});

test('exact remaining budget is eligible but one additional cent is blocked', async () => {
  const request = await input();
  request.snapshot.reservedMinor = request.mandate.budgetMinor - request.snapshot.committedMinor - request.quote.totalMinor;
  assert.equal(evaluatePurchase(request).decision, 'eligible');
  request.snapshot.reservedMinor += 1;
  assert.equal(evaluatePurchase(request).decision, 'blocked');
});

test('prior reserved units count even when this cart fits the money budget', async () => {
  const request = await input();
  request.snapshot.quantities[0]!.reserved = 2;
  const result = evaluatePurchase(request);
  assert.equal(result.decision, 'blocked');
  assert.ok(result.checks.some((check) => check.code === 'QUANTITY:engineering-laptops' && check.status === 'fail'));
});

test('missing mandatory delivery evidence requests review rather than approval', async () => {
  const request = await input();
  request.quote.delivery.evidence.status = 'unknown';
  assert.equal(evaluatePurchase(request).decision, 'needs_review');
});

test('stale or future evidence cannot be treated as supported', async () => {
  for (const observedAt of ['2026-10-01T00:00:00Z', '2026-11-04T00:00:00Z']) {
    const request = await input();
    request.quote.lines[0]!.stockEvidence.observedAt = observedAt;
    assert.equal(evaluatePurchase(request).decision, 'needs_review');
  }
});

test('a good price cannot compensate for a mandate that weakens company policy', async () => {
  const request = await input();
  request.mandate.requirements[0]!.minWarrantyMonths = 0;
  assert.equal(evaluatePurchase(request).decision, 'blocked');
});

test('an agent cannot add prices or duplicate SKUs to its submission', async () => {
  const request = await input();
  assert.throws(() => evaluatePurchase({ ...request, submission: { ...request.submission, price: 1 } }));
  request.submission.lines.push({ ...request.submission.lines[0]! });
  assert.throws(() => evaluatePurchase(request));
});

test('quote must bind the original supplier, cart, destination and exact line quantities', async () => {
  for (const change of [
    { supplierId: 'store-b' }, { cartId: 'different-cart' }, { deliveryLocationId: 'different-office' },
  ]) {
    const request = await input();
    Object.assign(request.quote, change);
    assert.equal(evaluatePurchase(request).decision, 'blocked');
  }
  const request = await input();
  request.quote.lines[0]!.quantity = 2;
  assert.equal(evaluatePurchase(request).decision, 'blocked');
});

test('expired quote and late delivery fail independently of price', async () => {
  const request = await input();
  request.now = request.quote.expiresAt;
  assert.equal(evaluatePurchase(request).decision, 'blocked');
  const late = await input();
  late.quote.delivery.by = '2026-11-21T00:00:00Z';
  assert.equal(evaluatePurchase(late).decision, 'blocked');
});

test('stale mandate or ledger revision blocks a cart', async () => {
  const request = await input();
  request.snapshot.mandateVersion = 2;
  assert.equal(evaluatePurchase(request).decision, 'blocked');
});

test('incorrect quote total and insufficient stock fail', async () => {
  const total = await input();
  total.quote.totalMinor = 1;
  assert.equal(evaluatePurchase(total).decision, 'blocked');
  const stock = await input();
  stock.quote.lines[0]!.availableUnits = 1;
  assert.equal(evaluatePurchase(stock).decision, 'blocked');
});

test('price, warranty and unapproved product rules are hard failures', async () => {
  const price = await input();
  price.mandate.requirements[0]!.maxUnitPriceMinor = 100000;
  assert.equal(evaluatePurchase(price).decision, 'blocked');
  const warranty = await input();
  warranty.quote.lines[0]!.warrantyMonths = 12;
  assert.equal(evaluatePurchase(warranty).decision, 'blocked');
  const product = await input();
  product.mandate.requirements[0]!.allowedSkus.push('UNAPPROVED-LAPTOP');
  assert.equal(evaluatePurchase(product).decision, 'blocked');
});

test('unsupported currency, fractional/negative amounts and duplicate requirements reject malformed input', async () => {
  const request = await input();
  for (const committedMinor of [-1, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => evaluatePurchase({ ...request, snapshot: { ...request.snapshot, committedMinor } }));
  }
  assert.throws(() => evaluatePurchase({ ...request, quote: { ...request.quote, currency: 'USD' } }));
  request.mandate.requirements.push({ ...request.mandate.requirements[0]! });
  assert.throws(() => evaluatePurchase(request));
});

test('hard failures take precedence when another required fact is unknown', async () => {
  const request = await input();
  request.quote.delivery.evidence.status = 'unknown';
  request.snapshot.committedMinor = 799999;
  assert.equal(evaluatePurchase(request).decision, 'blocked');
});

test('fixtures are quotes, not guarantees of orders or inventory reservations', async () => {
  const request = await input();
  const supplier = createFixtureSupplier(load('services/suppliers/fixtures/store-a.json'));
  assert.equal((await supplier.quoteCart(request.submission, now)).id, request.quote.id);
  await assert.rejects(() => supplier.quoteCart({ ...request.submission, supplierId: 'store-b' }, now));
});

test('fixture supplier rejects totals above the contract limit before calculating tax', async () => {
  const request = await input();
  const catalog = CatalogSchema.parse(load('services/suppliers/fixtures/store-a.json'));
  catalog.products[0]!.unitPriceMinor = 1_000_000_000;
  const supplier = createFixtureSupplier(catalog);
  await assert.rejects(() => supplier.quoteCart(request.submission, now), /amount limit/);
});
