import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { CatalogSchema, MandateSchema, PolicySchema, type Catalog } from '../../../packages/contracts/src/index.ts';
import { createMockBackend } from '../../../packages/contracts/src/mock.ts';
import { cartCosts } from './catalog.ts';
import { stampObservations } from './control.ts';
import { FIXTURE_SEEDS, loadFixtureCatalog, resetFixtureCatalog, updateFixtureCatalog } from './control-files.ts';
import { createFixtureSupplier } from './fixture.ts';

const fixture = (name: string): Catalog => loadFixtureCatalog(new URL(`../fixtures/${name}.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const now = '2026-11-06T09:00:00.000Z';

function workingPath(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-seeds-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'catalog.json');
}

test('every named seed is a valid catalog and resets exactly', (t) => {
  for (const seed of FIXTURE_SEEDS) {
    const path = workingPath(t);
    assert.deepEqual(resetFixtureCatalog(path, { seed }), fixture(seed));
    assert.deepEqual(CatalogSchema.parse(JSON.parse(readFileSync(path, 'utf8'))), fixture(seed));
  }
});

test('seed names cannot read arbitrary files into a working catalog', (t) => {
  const path = workingPath(t);
  for (const seed of ['../../../config/policies/hardware.example', 'absent', '']) {
    assert.throws(() => resetFixtureCatalog(path, { seed }), /Unknown fixture seed/);
  }
});

test('the store-a seed stays the default for existing callers', (t) => {
  assert.equal(resetFixtureCatalog(workingPath(t)).supplierId, 'store-a');
});

test('a reset cannot change which supplier a working catalog belongs to', (t) => {
  const path = workingPath(t);
  resetFixtureCatalog(path, { seed: 'store-a' });
  const original = readFileSync(path, 'utf8');
  assert.throws(() => resetFixtureCatalog(path, { seed: 'store-b' }), /store-b working catalog/);
  assert.equal(readFileSync(path, 'utf8'), original);
  // The hostile seed is the same supplier, so it can swap in on cue during a demo.
  const storeB = workingPath(t);
  resetFixtureCatalog(storeB, { seed: 'store-b' });
  assert.equal(resetFixtureCatalog(storeB, { seed: 'store-b-hostile' }).supplierId, 'store-b');
});

test('the hostile seed differs from store-b only in the text of one evidence source', () => {
  const clean = fixture('store-b');
  const hostile = fixture('store-b-hostile');
  const text = hostile.products[0]!.productEvidence.source;
  assert.match(text, /NOTICE TO AI AGENTS/);
  assert.match(text, /PAYPAL_CLIENT_SECRET/);
  assert.deepEqual({ ...hostile, products: hostile.products.map((product, index) => (index === 0
    ? { ...product, productEvidence: { ...product.productEvidence, source: clean.products[0]!.productEvidence.source } }
    : product)) }, clean);
});

test('a re-dated seed changes every observation time and nothing else', () => {
  for (const seed of FIXTURE_SEEDS) {
    const original = fixture(seed);
    const stamped = stampObservations(original, now);
    assert.equal(stamped.delivery.evidence.observedAt, now);
    for (const product of stamped.products) {
      assert.equal(product.productEvidence.observedAt, now);
      assert.equal(product.stockEvidence.observedAt, now);
    }
    const clearTimes = (catalog: Catalog) => JSON.stringify(catalog).replace(/"observedAt":"[^"]+"/g, '"observedAt":""');
    assert.equal(clearTimes(stamped), clearTimes(original));
  }
});

test('re-dating leaves uncertainty in place, and hostile text exactly as written', (t) => {
  const path = workingPath(t);
  resetFixtureCatalog(path, { seed: 'store-b-hostile' });
  const unknown = updateFixtureCatalog(path, { deliveryEvidenceStatus: 'unknown' }, now);
  const stamped = stampObservations(unknown, '2026-11-07T09:00:00Z');
  assert.equal(stamped.delivery.evidence.status, 'unknown');
  assert.equal(stamped.products[0]!.productEvidence.source, fixture('store-b-hostile').products[0]!.productEvidence.source);
  assert.throws(() => stampObservations(unknown, 'not-a-time'));
});

test('re-dating never mutates a caller-owned catalog', () => {
  const original = fixture('store-a');
  const before = JSON.stringify(original);
  stampObservations(original, now);
  assert.equal(JSON.stringify(original), before);
});

test('the policy accepts store-b for its approved SKU and caps its premium SKU out', () => {
  const policy = PolicySchema.parse(JSON.parse(readFileSync(new URL('../../../config/policies/hardware.example.json', import.meta.url), 'utf8')));
  const storeB = fixture('store-b');
  assert.ok(policy.allowedSuppliers.includes(storeB.supplierId));
  const pro = storeB.products.find(({ sku }) => sku === 'LAP-14-PRO')!;
  assert.ok(pro.unitPriceMinor > policy.roles.laptop.maxUnitPriceMinor, 'The premium SKU must exceed the cap, or the hostile listing asks for something allowed');
});

test('cart costs match fixture quotes and the contract mock, so an estimate cannot drift from a quote', async () => {
  const mandate = MandateSchema.parse(JSON.parse(readFileSync(new URL('../../../examples/mandate.json', import.meta.url), 'utf8')));
  for (const seed of ['store-a', 'store-b'] as const) {
    const catalog = fixture(seed);
    for (const lines of [
      [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 3 }],
      [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 5 }, { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 5 }],
    ]) {
      const cart = { id: `cart-${seed}`, mandateId: mandate.id, mandateVersion: mandate.version, supplierId: seed, lines };
      const costs = cartCosts(catalog, lines);
      assert.ok(costs);
      const quote = await createFixtureSupplier(catalog).quoteCart(cart, now);
      assert.equal(costs.totalMinor, quote.totalMinor);
      assert.equal(costs.taxMinor, quote.taxMinor);
      assert.equal(costs.shippingMinor, quote.shippingMinor);
      const mock = createMockBackend({ mandates: [{ ...mandate, allowedSuppliers: [seed] }], catalogs: [catalog] });
      const response = await mock.handle({
        apiVersion: '1', requestId: 'r', method: 'proposal.submit', params: { idempotencyKey: 'k', cart },
      });
      if (!response.ok || response.method !== 'proposal.submit') assert.fail();
      assert.equal(response.result.operation.totalMinor, costs.totalMinor);
    }
  }
});

test('cart costs refuse an unknown SKU and an amount beyond the supported range', () => {
  const catalog = fixture('store-a');
  assert.equal(cartCosts(catalog, [{ sku: 'absent', quantity: 1 }]), null);
  assert.equal(cartCosts({ ...catalog, shippingMinor: 1_000_000_000 }, [{ sku: 'LAP-14-AIR', quantity: 1 }]), null);
  assert.deepEqual(cartCosts({ ...catalog, shippingMinor: 5 }, [{ sku: 'LAP-14-AIR', quantity: 0 }]), {
    itemsMinor: 0, shippingMinor: 5, taxMinor: 0, totalMinor: 5,
  });
});
