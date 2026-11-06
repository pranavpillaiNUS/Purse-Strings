import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep, toNamespacedPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixtureCatalog, resetFixtureCatalog, updateFixtureCatalog } from './control-files.ts';

const fixtureDirectory = fileURLToPath(new URL('../fixtures/', import.meta.url));
const seedPath = join(fixtureDirectory, 'store-a.json');
const now = '2026-11-03T09:00:00Z';

function temporaryDirectory(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-control-files-'));
  t.after(() => {
    const target = resolve(directory);
    const withinTemporaryDirectory = relative(resolve(tmpdir()), target);
    assert.ok(withinTemporaryDirectory !== '' && withinTemporaryDirectory !== '..'
      && !withinTemporaryDirectory.startsWith(`..${sep}`));
    assert.ok(basename(target).startsWith('splittap-control-files-'));
    rmSync(target, { recursive: true, force: true });
  });
  return directory;
}

test('working catalog reset, edits and reset preserve the seed and reproduce its baseline', (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'catalog.json');
  const seedBytes = readFileSync(seedPath, 'utf8');
  const baseline = loadFixtureCatalog(seedPath);
  assert.deepEqual(resetFixtureCatalog(path), baseline);
  const baselineBytes = readFileSync(path, 'utf8');

  const changed = updateFixtureCatalog(path, {
    shippingMinor: 50000,
    product: { sku: 'LAP-14-AIR', availableUnits: 1 },
  }, now);
  assert.equal(changed.shippingMinor, 50000);
  assert.equal(changed.products[0]!.availableUnits, 1);
  assert.deepEqual(loadFixtureCatalog(path), changed);
  assert.deepEqual(resetFixtureCatalog(path), baseline);
  assert.equal(readFileSync(path, 'utf8'), baselineBytes);
  assert.equal(readFileSync(seedPath, 'utf8'), seedBytes);
  assert.deepEqual(readdirSync(directory), ['catalog.json']);
});

test('invalid or partly invalid changes preserve existing catalog bytes', (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'catalog.json');
  resetFixtureCatalog(path);
  const original = readFileSync(path, 'utf8');
  for (const [change, clock] of [
    [{ shippingMinor: -1 }, now],
    [{ shippingMinor: 1, product: { sku: 'missing', availableUnits: 1 } }, now],
    [{ shippingMinor: 1 }, 'invalid'],
    [{ supplierId: 'unapproved' }, now],
  ] as const) {
    assert.throws(() => updateFixtureCatalog(path, change, clock));
    assert.equal(readFileSync(path, 'utf8'), original);
  }
  assert.deepEqual(readdirSync(directory), ['catalog.json']);
});

test('reset refuses malformed JSON, policy JSON and another supplier catalog', (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'catalog.json');
  const otherSupplier = { ...loadFixtureCatalog(seedPath), supplierId: 'store-b' };
  for (const original of ['not JSON', JSON.stringify({ id: 'company-policy', maxBudgetMinor: 800000 }),
    JSON.stringify(otherSupplier)]) {
    writeFileSync(path, original);
    assert.throws(() => resetFixtureCatalog(path));
    assert.equal(readFileSync(path, 'utf8'), original);
  }
});

test('catalog writes reject directories and missing parent directories', (t) => {
  const directory = temporaryDirectory(t);
  const targetDirectory = join(directory, 'catalog-directory');
  mkdirSync(targetDirectory);
  assert.throws(() => resetFixtureCatalog(targetDirectory), /regular file/);
  assert.throws(() => resetFixtureCatalog(join(directory, 'missing', 'catalog.json')), /ENOENT/);
  assert.throws(() => updateFixtureCatalog(join(directory, 'absent.json'), { shippingMinor: 1 }, now),
    /does not exist/);
  assert.deepEqual(readdirSync(directory), ['catalog-directory']);
});

test('bundled fixture directory is protected from reset and edits', () => {
  const original = readFileSync(seedPath, 'utf8');
  for (const path of [seedPath, join(fixtureDirectory, 'new-catalog.json'),
    join(fixtureDirectory, '..', 'fixtures', 'store-a.json')]) {
    assert.throws(() => resetFixtureCatalog(path), /read-only/);
    assert.throws(() => updateFixtureCatalog(path, { shippingMinor: 1 }, now), /read-only/);
  }
  assert.equal(readFileSync(seedPath, 'utf8'), original);
});

test('Windows namespace aliases preserve seed protection and allow working catalogs', {
  skip: process.platform !== 'win32',
}, (t) => {
  const original = readFileSync(seedPath, 'utf8');
  // These inputs cannot write even if the protection regresses: reset targets a
  // directory, and the seed update contains an invalid negative amount.
  assert.throws(() => resetFixtureCatalog(toNamespacedPath(fixtureDirectory)), /read-only/);
  assert.throws(() => updateFixtureCatalog(toNamespacedPath(seedPath), { shippingMinor: -1 }, now),
    /read-only/);
  assert.equal(readFileSync(seedPath, 'utf8'), original);

  const path = join(temporaryDirectory(t), 'catalog.json');
  resetFixtureCatalog(toNamespacedPath(path));
  updateFixtureCatalog(toNamespacedPath(path), { shippingMinor: 123 }, now);
  assert.equal(loadFixtureCatalog(path).shippingMinor, 123);
});

test('parent directory aliases cannot bypass bundled seed protection', (t) => {
  const directory = temporaryDirectory(t);
  const alias = join(directory, 'fixture-alias');
  try {
    symlinkSync(fixtureDirectory, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') return t.skip('Directory links unavailable');
    throw error;
  }
  assert.throws(() => resetFixtureCatalog(join(alias, 'store-a.json')), /read-only/);
  assert.throws(() => updateFixtureCatalog(join(alias, 'new.json'), { shippingMinor: 1 }, now), /read-only/);
});

test('symbolic link destination is rejected without changing its target', (t) => {
  const directory = temporaryDirectory(t);
  const target = join(directory, 'catalog.json');
  const alias = join(directory, 'linked-catalog.json');
  resetFixtureCatalog(target);
  const original = readFileSync(target, 'utf8');
  try {
    symlinkSync(target, alias, 'file');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') return t.skip('File symlinks unavailable');
    throw error;
  }
  assert.throws(() => resetFixtureCatalog(alias), /symbolic link/);
  assert.throws(() => updateFixtureCatalog(alias, { shippingMinor: 1 }, now), /symbolic link/);
  assert.equal(readFileSync(target, 'utf8'), original);
});
