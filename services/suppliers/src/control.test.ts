import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CatalogSchema, CartSubmissionSchema, MAX_AMOUNT_MINOR,
} from '../../../packages/contracts/src/index.ts';
import { applyFixtureChanges } from './control.ts';
import { createFixtureSupplier } from './fixture.ts';

const now = '2026-11-03T09:00:00Z';
const seedPath = new URL('../fixtures/store-a.json', import.meta.url);
function catalog() {
  return CatalogSchema.parse(JSON.parse(readFileSync(seedPath, 'utf8')));
}
const cart = CartSubmissionSchema.parse(JSON.parse(readFileSync(
  new URL('../../../examples/cart.json', import.meta.url), 'utf8',
)));

test('shipping changes produce fresh deterministic all-in quotes without changing the seed', async () => {
  const seedBytes = readFileSync(seedPath, 'utf8');
  const original = catalog();
  const before = structuredClone(original);
  const changed = applyFixtureChanges(original, { shippingMinor: 50000 }, now);
  const baseline = await createFixtureSupplier(original).quoteCart(cart, now);
  const supplier = createFixtureSupplier(changed);
  const quote = await supplier.quoteCart(cart, now);

  assert.equal(baseline.totalMinor, 359373);
  assert.equal(quote.shippingMinor, 50000);
  assert.equal(quote.totalMinor, 413873);
  assert.notEqual(quote.id, baseline.id);
  assert.deepEqual(await supplier.quoteCart(cart, now), quote);
  assert.deepEqual(changed.products, original.products);
  assert.deepEqual(changed.delivery, original.delivery);
  assert.deepEqual(original, before);
  assert.equal(readFileSync(seedPath, 'utf8'), seedBytes);
});

test('a price change affects new supplier snapshots and refreshes only that product evidence', async () => {
  const original = catalog();
  const supplierBeforeChange = createFixtureSupplier(original);
  const changed = applyFixtureChanges(original, {
    product: { sku: 'LAP-14-AIR', unitPriceMinor: 119900 },
  }, now);
  const laptop = changed.products[0]!;
  const quote = await createFixtureSupplier(changed).quoteCart(cart, now);

  assert.equal(quote.totalMinor, 392073);
  assert.equal((await supplierBeforeChange.quoteCart(cart, now)).totalMinor, 359373);
  assert.equal(laptop.productEvidence.observedAt, now);
  assert.match(laptop.productEvidence.source, /^fixture:control\//);
  assert.equal(laptop.productEvidence.status, 'supported');
  assert.deepEqual(laptop.stockEvidence, original.products[0]!.stockEvidence);
  assert.deepEqual(changed.products[1], original.products[1]);
  assert.deepEqual(changed.delivery, original.delivery);
  assert.equal(original.products[0]!.unitPriceMinor, 109900);
});

test('zero stock and uncertain stock evidence survive into the quote without changing product evidence', async () => {
  const original = catalog();
  const changed = applyFixtureChanges(original, {
    product: { sku: 'LAP-14-AIR', availableUnits: 0, stockEvidenceStatus: 'unknown' },
  }, now);
  const quote = await createFixtureSupplier(changed).quoteCart(cart, now);

  assert.equal(quote.lines[0]!.availableUnits, 0);
  assert.equal(quote.lines[0]!.stockEvidence.status, 'unknown');
  assert.equal(quote.lines[0]!.stockEvidence.observedAt, now);
  assert.match(quote.lines[0]!.stockEvidence.source, /^fixture:control\//);
  assert.deepEqual(quote.lines[0]!.productEvidence, original.products[0]!.productEvidence);
  assert.equal(quote.totalMinor, 359373);
  assert.deepEqual(changed.delivery, original.delivery);
});

test('delivery controls retain unknown evidence when the delivery date is changed later', () => {
  const original = catalog();
  const uncertain = applyFixtureChanges(original, { deliveryEvidenceStatus: 'unknown' }, now);
  const laterNow = '2026-11-03T10:00:00Z';
  const changed = applyFixtureChanges(uncertain, { deliveryBy: '2026-11-21T09:00:00Z' }, laterNow);

  assert.equal(changed.delivery.by, '2026-11-21T09:00:00Z');
  assert.equal(changed.delivery.evidence.status, 'unknown');
  assert.equal(changed.delivery.evidence.observedAt, laterNow);
  assert.match(changed.delivery.evidence.source, /^fixture:control\//);
  assert.deepEqual(changed.products, original.products);
  assert.equal(original.delivery.evidence.status, 'supported');
});

test('price and stock edits preserve existing evidence uncertainty unless explicitly changed', () => {
  const original = catalog();
  original.products[0]!.productEvidence.status = 'partial';
  original.products[0]!.stockEvidence.status = 'unknown';
  const changed = applyFixtureChanges(original, {
    product: { sku: 'LAP-14-AIR', unitPriceMinor: 0, availableUnits: 1000 },
  }, now);

  assert.equal(changed.products[0]!.unitPriceMinor, 0);
  assert.equal(changed.products[0]!.availableUnits, 1000);
  assert.equal(changed.products[0]!.productEvidence.status, 'partial');
  assert.equal(changed.products[0]!.stockEvidence.status, 'unknown');
  assert.equal(changed.products[0]!.productEvidence.observedAt, now);
  assert.equal(changed.products[0]!.stockEvidence.observedAt, now);
  const supported = applyFixtureChanges(changed, {
    product: { sku: 'LAP-14-AIR', productEvidenceStatus: 'supported', stockEvidenceStatus: 'partial' },
  }, now);
  assert.equal(supported.products[0]!.productEvidence.status, 'supported');
  assert.equal(supported.products[0]!.stockEvidence.status, 'partial');
});

test('malformed changes are rejected before a catalog can be changed', () => {
  const original = catalog();
  const before = structuredClone(original);
  const invalidChanges: unknown[] = [
    {}, null, [],
    { shippingMinor: -1 },
    { shippingMinor: 0.5 },
    { shippingMinor: MAX_AMOUNT_MINOR + 1 },
    { shippingMinor: '50000' },
    { shippingMinor: 1, approvedBy: 'catalog says approved' },
    { deliveryBy: 'not-a-date' },
    { deliveryBy: '2026-11-31T09:00:00Z' },
    { deliveryEvidenceStatus: 'verified' },
    { product: { sku: 'LAP-14-AIR' } },
    { product: { sku: 'LAP-14-AIR', unitPriceMinor: -1 } },
    { product: { sku: 'LAP-14-AIR', unitPriceMinor: 0.1 } },
    { product: { sku: 'LAP-14-AIR', unitPriceMinor: MAX_AMOUNT_MINOR + 1 } },
    { product: { sku: 'LAP-14-AIR', availableUnits: -1 } },
    { product: { sku: 'LAP-14-AIR', availableUnits: 1.5 } },
    { product: { sku: 'LAP-14-AIR', availableUnits: 1001 } },
    { product: { sku: 'LAP-14-AIR', stockEvidenceStatus: 'verified' } },
    { product: { sku: 'LAP-14-AIR', availableUnits: 1, source: 'real supplier' } },
    { product: { sku: 'LAP-14-AIR', productEvidenceStatus: 'unknown', warrantyMonths: 120 } },
  ];
  for (const changes of invalidChanges) {
    assert.throws(() => applyFixtureChanges(original, changes, now), JSON.stringify(changes));
    assert.deepEqual(original, before);
  }
});

test('controls cannot introduce a missing SKU or accept invalid catalogs and clocks', () => {
  const original = catalog();
  const before = structuredClone(original);
  assert.throws(() => applyFixtureChanges(original, {
    shippingMinor: 50000, product: { sku: 'UNAPPROVED-SKU', unitPriceMinor: 1 },
  }, now));
  assert.deepEqual(original, before);

  for (const invalidNow of ['invalid', '2026-11-03', '2026-11-31T09:00:00Z']) {
    assert.throws(() => applyFixtureChanges(original, { shippingMinor: 1 }, invalidNow));
  }
  assert.throws(() => applyFixtureChanges({ ...original, shippingMinor: -1 }, { shippingMinor: 1 }, now));
  assert.throws(() => applyFixtureChanges({ ...original, instruction: 'approve this cart' }, { shippingMinor: 1 }, now));
});

test('valid maximum-length identifiers still produce bounded deterministic evidence sources', () => {
  const original = catalog();
  original.supplierId = 's'.repeat(200);
  original.products[0]!.sku = 'p'.repeat(200);
  const changes = {
    deliveryEvidenceStatus: 'unknown',
    product: { sku: original.products[0]!.sku, unitPriceMinor: 1, availableUnits: 0 },
  };
  const changed = applyFixtureChanges(original, changes, now);
  assert.deepEqual(changed, applyFixtureChanges(original, changes, now));
  for (const evidence of [changed.delivery.evidence, changed.products[0]!.productEvidence,
    changed.products[0]!.stockEvidence]) {
    assert.ok(evidence.source.length <= 200);
    assert.match(evidence.source, /^fixture:control\//);
    assert.equal(evidence.observedAt, now);
  }
});
