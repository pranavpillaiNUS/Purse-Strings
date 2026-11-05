import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogSchema } from '../../../packages/contracts/src/index.ts';
import { createFixtureCatalogSource } from './catalog.ts';

function seed() {
  return CatalogSchema.parse(JSON.parse(readFileSync(
    new URL('../fixtures/store-a.json', import.meta.url), 'utf8',
  )));
}

test('catalog reads preserve all synthetic product, stock and delivery evidence', async () => {
  const original = seed();
  original.products[0]!.stockEvidence.status = 'unknown';
  original.products[0]!.availableUnits = 0;
  original.products[1]!.productEvidence.status = 'partial';
  original.delivery.evidence.status = 'unknown';
  const second = { ...seed(), supplierId: 'store-b', shippingMinor: 1234 };
  const source = createFixtureCatalogSource([original, second]);

  assert.deepEqual(await source.getCatalog('store-a'), original);
  assert.deepEqual(await source.getCatalog('store-b'), second);
  const catalog = CatalogSchema.parse(await source.getCatalog('store-a'));
  assert.equal(catalog.products[0]!.stockEvidence.status, 'unknown');
  assert.equal(catalog.products[0]!.stockEvidence.source, 'fixture:store-a/stock');
  assert.equal(catalog.products[0]!.stockEvidence.observedAt, '2026-11-03T08:30:00Z');
});

test('sources snapshot their inputs and each result is independent of every other read', async () => {
  const input = [seed()];
  const expected = structuredClone(input[0]!);
  const source = createFixtureCatalogSource(input);
  input[0]!.products[0]!.unitPriceMinor = 1;
  input[0]!.delivery.evidence.status = 'unknown';
  input.push({ ...seed(), supplierId: 'added-later' });

  const result = await source.getCatalog('store-a');
  assert.deepEqual(result, expected);
  // Mutate the actual returned object, rather than a schema-parsed clone.
  const returned = result as typeof expected;
  returned.products[0]!.stockEvidence.source = 'modified-by-reader';
  returned.products.splice(1);
  returned.delivery.by = '2026-12-31T00:00:00Z';
  assert.deepEqual(await source.getCatalog('store-a'), expected);
  await assert.rejects(source.getCatalog('added-later'), /Supplier unavailable/);
});

test('malformed catalogs, duplicate supplier IDs and oversized configurations fail at creation', () => {
  const original = seed();
  const malformed: unknown[] = [
    null, {}, original, [null],
    [{ ...original, shippingMinor: -1 }],
    [{ ...original, shippingMinor: 0.5 }],
    [{ ...original, endpoint: 'https://unconfigured.example' }],
    [{ ...original, approvedBy: 'catalog-author' }],
    [{ ...original, products: [{ ...original.products[0], unitPriceMinor: '100' }] }],
    [{ ...original, delivery: { ...original.delivery, evidence: { status: 'supported' } } }],
    [original, structuredClone(original)],
    [original, { ...original, supplierId: ' store-a ' }],
    Array.from({ length: 101 }, (_, index) => ({ ...original, supplierId: `store-${index}` })),
  ];
  for (const input of malformed) {
    assert.throws(() => createFixtureCatalogSource(input));
  }
});

test('unknown suppliers fail without exposing a fallback catalog', async () => {
  const source = createFixtureCatalogSource([seed()]);
  await assert.rejects(source.getCatalog('store-unknown'), /Supplier unavailable/);
  await assert.rejects(source.getCatalog('https://unconfigured.example/catalog'), /Supplier unavailable/);
  await assert.rejects(source.getCatalog(''));
  assert.deepEqual(await source.getCatalog('store-a'), seed());
  await assert.rejects(createFixtureCatalogSource([]).getCatalog('store-a'), /Supplier unavailable/);
});

test('one hundred distinct configured suppliers remain readable by exact ID', async () => {
  const original = seed();
  const catalogs = Array.from({ length: 100 }, (_, index) => ({ ...original, supplierId: `store-${index}` }));
  const source = createFixtureCatalogSource(catalogs);
  assert.deepEqual(await source.getCatalog('store-0'), catalogs[0]);
  assert.deepEqual(await source.getCatalog('store-99'), catalogs[99]);
});
