import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogSchema } from '../../../packages/contracts/src/index.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = join(root, 'apps/cli/src/main.ts');
const seedPath = join(root, 'services/suppliers/fixtures/store-a.json');
const now = '2026-11-03T09:00:00Z';
function run(args: string[]) {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message ?? 'CLI subprocess failed');
  return result;
}
function store(action: string, catalogPath: string, flags: string[] = []) {
  return run(['store', action, '--catalog', catalogPath, '--json', ...flags]);
}
function expectSuccess(action: string, catalogPath: string, flags: string[] = []) {
  const result = store(action, catalogPath, flags);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'fixture-store');
  assert.equal(output.action, action);
  assert.equal(output.catalogPath, resolve(catalogPath));
  CatalogSchema.parse(output.catalog);
  return output;
}
function expectFailure(args: string[]) {
  const result = run(args);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr, '');
}
function check(catalogPath: string, expectedCode: number, expectedDecision: string) {
  const result = run(['check', '--catalog', catalogPath, '--now', now, '--json']);
  assert.equal(result.status, expectedCode, result.stderr);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, expectedDecision);
  return output;
}

test('store reset/show return validated JSON and reset restores the baseline bytes', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-store-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalogPath = join(directory, 'working catalog.json');
  const reset = expectSuccess('reset', catalogPath);
  const baselineBytes = readFileSync(catalogPath, 'utf8');
  assert.deepEqual(reset.catalog, JSON.parse(readFileSync(seedPath, 'utf8')));
  assert.deepEqual(expectSuccess('show', catalogPath).catalog, reset.catalog);
  expectSuccess('set', catalogPath, ['--now', now, '--shipping-minor', '50000']);
  expectSuccess('reset', catalogPath);
  assert.equal(readFileSync(catalogPath, 'utf8'), baselineBytes);
  const human = run(['store', 'show', '--catalog', catalogPath]);
  assert.equal(human.status, 0, human.stderr);
  assert.equal(human.stderr, '');
  assert.match(human.stdout, /store-a/);
});

test('persisted supplier controls drive normal, cost, stock and evidence check decisions', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-store-scenarios-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalogPath = join(directory, 'catalog.json');
  expectSuccess('reset', catalogPath);
  const baseline = check(catalogPath, 0, 'eligible');

  expectSuccess('set', catalogPath, ['--now', now, '--shipping-minor', '50000']);
  const shipping = check(catalogPath, 2, 'blocked');
  assert.equal(shipping.totalMinor, 413873);
  assert.notEqual(shipping.quoteId, baseline.quoteId);

  expectSuccess('reset', catalogPath);
  expectSuccess('set', catalogPath, ['--now', now, '--sku', 'LAP-14-AIR', '--price-minor', '130000']);
  check(catalogPath, 2, 'blocked');

  expectSuccess('reset', catalogPath);
  expectSuccess('set', catalogPath, ['--now', now, '--sku', 'LAP-14-AIR', '--stock', '2']);
  check(catalogPath, 2, 'blocked');

  expectSuccess('reset', catalogPath);
  expectSuccess('set', catalogPath, ['--now', now, '--delivery-evidence', 'unknown']);
  check(catalogPath, 3, 'needs_review');

  expectSuccess('reset', catalogPath);
  const restored = check(catalogPath, 0, 'eligible');
  assert.equal(restored.quoteId, baseline.quoteId);
  assert.equal(restored.totalMinor, baseline.totalMinor);
});

test('a price edit cannot make stale product evidence current', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-store-stale-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalogPath = join(directory, 'catalog.json');
  const later = '2026-11-07T09:00:00Z';
  const productEvidence = () => {
    const result = run(['check', '--catalog', catalogPath, '--now', later, '--json']);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout).checks
      .find((item: { code: string }) => item.code === 'PRODUCT_EVIDENCE:LAP-14-AIR').status;
  };

  expectSuccess('reset', catalogPath);
  assert.equal(productEvidence(), 'unknown');
  expectSuccess('set', catalogPath, ['--now', later, '--sku', 'LAP-14-AIR', '--price-minor', '109900']);
  assert.equal(productEvidence(), 'unknown');
  expectSuccess('set', catalogPath, ['--now', later, '--sku', 'LAP-14-AIR', '--product-evidence', 'supported']);
  assert.equal(productEvidence(), 'pass');
});

test('catalogs saved with a UTF-8 BOM stay usable and can be repaired', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-store-bom-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalogPath = join(directory, 'catalog.json');
  expectSuccess('reset', catalogPath);
  const baselineBytes = readFileSync(catalogPath, 'utf8');
  const baseline = check(catalogPath, 0, 'eligible');

  writeFileSync(catalogPath, `﻿${baselineBytes}`);
  expectSuccess('show', catalogPath);
  assert.equal(check(catalogPath, 0, 'eligible').quoteId, baseline.quoteId);

  expectSuccess('set', catalogPath, ['--now', now, '--shipping-minor', '0']);
  assert.notEqual(readFileSync(catalogPath, 'utf8').charCodeAt(0), 0xFEFF);

  writeFileSync(catalogPath, `﻿${baselineBytes}`);
  expectSuccess('reset', catalogPath);
  assert.equal(readFileSync(catalogPath, 'utf8'), baselineBytes);
});

test('store set exposes delivery and separate product/stock evidence controls', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-store-evidence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalogPath = join(directory, 'catalog.json');
  expectSuccess('reset', catalogPath);
  const output = expectSuccess('set', catalogPath, [
    '--now', now, '--sku', 'LAP-14-AIR', '--product-evidence', 'partial',
    '--stock-evidence', 'unknown', '--delivery-by', '2026-11-21T09:00:00Z',
    '--delivery-evidence', 'unknown',
  ]);
  const product = output.catalog.products[0];
  assert.equal(product.productEvidence.status, 'partial');
  assert.equal(product.stockEvidence.status, 'unknown');
  assert.equal(product.productEvidence.observedAt, now);
  assert.equal(product.stockEvidence.observedAt, now);
  assert.equal(output.catalog.delivery.by, '2026-11-21T09:00:00Z');
  assert.equal(output.catalog.delivery.evidence.status, 'unknown');
  assert.equal(output.catalog.delivery.evidence.observedAt, now);
  assert.deepEqual(JSON.parse(readFileSync(catalogPath, 'utf8')), output.catalog);
});

test('invalid changes fail with diagnostics and leave working catalog bytes untouched', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-store-invalid-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalogPath = join(directory, 'catalog.json');
  expectSuccess('reset', catalogPath);
  const originalBytes = readFileSync(catalogPath, 'utf8');
  const invalidFlags = [
    [],
    ['--shipping-minor', '1'],
    ['--now', now],
    ['--now', 'invalid', '--shipping-minor', '1'],
    ['--now', now, '--shipping-minor', '-1'],
    ['--now', now, '--shipping-minor', '0.5'],
    ['--now', now, '--shipping-minor', '1000000001'],
    ['--now', now, '--shipping-minor', 'NaN'],
    ['--now', now, '--price-minor', '1'],
    ['--now', now, '--stock', '1'],
    ['--now', now, '--product-evidence', 'unknown'],
    ['--now', now, '--stock-evidence', 'unknown'],
    ['--now', now, '--sku', 'LAP-14-AIR'],
    ['--now', now, '--sku', 'LAP-14-AIR', '--price-minor', '0.1'],
    ['--now', now, '--sku', 'LAP-14-AIR', '--stock', '1001'],
    ['--now', now, '--sku', 'UNKNOWN', '--stock', '1'],
    ['--now', now, '--delivery-evidence', 'verified'],
    ['--now', now, '--delivery-by', 'not-a-date'],
    ['--now', now, '--shipping-minor', '1', '--policy', 'anything.json'],
  ];
  for (const flags of invalidFlags) {
    expectFailure(['store', 'set', '--catalog', catalogPath, '--json', ...flags]);
    assert.equal(readFileSync(catalogPath, 'utf8'), originalBytes, flags.join(' '));
  }
  const malformedPath = join(directory, 'malformed.json');
  writeFileSync(malformedPath, '{invalid');
  expectFailure(['store', 'set', '--catalog', malformedPath, '--now', now, '--shipping-minor', '1', '--json']);
  assert.equal(readFileSync(malformedPath, 'utf8'), '{invalid');
});

test('store actions reject missing arguments, unrelated options and extra positionals', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-store-arguments-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const catalogPath = join(directory, 'catalog.json');
  expectSuccess('reset', catalogPath);
  for (const args of [
    ['store'], ['store', 'unknown'], ['store', 'show'], ['store', 'reset'],
    ['store', 'set', '--now', now, '--shipping-minor', '1'],
    ['store', 'show', '--catalog', catalogPath, '--now', now],
    ['store', 'reset', '--catalog', catalogPath, '--shipping-minor', '1'],
    ['store', 'show', '--catalog', catalogPath, '--request', 'anything.json'],
    ['store', 'reset', '--catalog', catalogPath, 'extra'],
    ['check', '--shipping-minor', '1'],
    ['demo', '--stock', '1'],
  ]) {
    expectFailure(args);
  }
  const help = run(['store', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /store/);
});

test('store mutations protect the bundled seed and do not invent missing working catalogs', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-store-protection-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const seedBytes = readFileSync(seedPath, 'utf8');
  expectFailure(['store', 'reset', '--catalog', seedPath, '--json']);
  expectFailure(['store', 'set', '--catalog', seedPath, '--now', now, '--shipping-minor', '1', '--json']);
  assert.equal(readFileSync(seedPath, 'utf8'), seedBytes);
  const missing = join(directory, 'missing.json');
  expectFailure(['store', 'show', '--catalog', missing, '--json']);
  expectFailure(['store', 'set', '--catalog', missing, '--now', now, '--shipping-minor', '1', '--json']);
  expectFailure(['store', 'reset', '--catalog', join(directory, 'missing-directory', 'catalog.json'), '--json']);
});
