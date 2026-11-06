import { randomUUID } from 'node:crypto';
import {
  closeSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogSchema } from '../../../packages/contracts/src/index.ts';
import type { Catalog } from '../../../packages/contracts/src/index.ts';
import { applyFixtureChanges, stampObservations } from './control.ts';

const fixtureDirectory = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** Named seeds only: a free-form seed path could read any JSON file into a working catalog. */
export const FIXTURE_SEEDS = ['store-a', 'store-b', 'store-b-hostile'] as const;

function seedPath(seed: string): string {
  if (!(FIXTURE_SEEDS as readonly string[]).includes(seed)) {
    throw new Error(`Unknown fixture seed. Choose one of: ${FIXTURE_SEEDS.join(', ')}`);
  }
  return join(fixtureDirectory, `${seed}.json`);
}

/** Files are synthetic catalog state, never a purchasing ledger or execution authority. */
export function loadFixtureCatalog(path: string): Catalog {
  // Windows PowerShell's UTF-8 Set-Content may write a BOM; it is not part of JSON content.
  return CatalogSchema.parse(JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')));
}

function isWithin(directory: string, target: string): boolean {
  const path = relative(directory, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function writableCatalogPath(path: string): { target: string; existing?: Catalog } {
  const absolute = resolve(path);
  // Resolve the existing parent first: aliases/junctions must not bypass seed protection.
  // The native resolver also normalizes Windows namespace aliases (\\?\C:\...),
  // which otherwise compare as a different root from the same ordinary path.
  const target = join(realpathSync.native(dirname(absolute)), basename(absolute));
  if (isWithin(realpathSync.native(fixtureDirectory), target)) {
    throw new Error('Bundled fixture catalogs are read-only; choose a separate working catalog');
  }

  let exists = true;
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('Working catalog must be a regular file, not a symbolic link or directory');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    exists = false;
  }
  // Refuse to overwrite arbitrary JSON (including company policy) or malformed files.
  return { target, existing: exists ? loadFixtureCatalog(target) : undefined };
}

function writeCatalog(target: string, catalog: Catalog): void {
  const validated = CatalogSchema.parse(catalog);
  const temporary = join(dirname(target), `.splittap-catalog-${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
  } finally {
    try {
      if (descriptor !== undefined) closeSync(descriptor);
    } finally {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}

/**
 * Restore a named bundled baseline, by default with its original observation times.
 * `now` re-dates its evidence for runs under the backend's real clock.
 */
export function resetFixtureCatalog(
  path: string,
  options: { seed?: string; now?: string } = {},
): Catalog {
  const seeded = loadFixtureCatalog(seedPath(options.seed ?? 'store-a'));
  const catalog = options.now === undefined ? seeded : stampObservations(seeded, options.now);
  const { target, existing } = writableCatalogPath(path);
  if (existing && existing.supplierId !== catalog.supplierId) {
    throw new Error(`Reset requires a ${catalog.supplierId} working catalog`);
  }
  writeCatalog(target, catalog);
  return catalog;
}

/** Apply one fully validated synthetic change; failed validation preserves prior bytes. */
export function updateFixtureCatalog(path: string, changes: unknown, now: string): Catalog {
  const { target, existing } = writableCatalogPath(path);
  if (!existing) throw new Error('Working catalog does not exist; run store reset first');
  const catalog = applyFixtureChanges(existing, changes, now);
  writeCatalog(target, catalog);
  return catalog;
}
