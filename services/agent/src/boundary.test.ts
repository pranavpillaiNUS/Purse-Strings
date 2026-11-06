import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Static dependency check. It proves what the shopper loads, not deployment isolation:
// module boundaries alone do not establish process isolation, as AGENTS.md notes.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const IMPORT = /(?:from\s+|import\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

function walk(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const pending = [resolve(root, entry)];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (specifier!.startsWith('.')) pending.push(resolve(dirname(file), specifier!));
      else bare.add(specifier!);
    }
  }
  return { files, bare };
}

const repoPath = (file: string): string => relative(root, file).split(sep).join('/');

test('the shopper process never loads checker, payment or ledger modules', () => {
  const { files, bare } = walk('apps/cli/src/shop.ts');
  const loaded = [...files].map(repoPath);
  // Guards against the walk silently finding nothing.
  assert.ok(loaded.includes('services/agent/src/worker.ts'));
  assert.ok(loaded.includes('services/agent/src/anthropic.ts'));
  assert.deepEqual(loaded.filter((path) => /services\/checker|paypal|apps\/cli\/src\/backend\.ts/i.test(path)), []);
  assert.equal(bare.has('node:sqlite'), false);
});

test('agent code has no shell, network or filesystem access of its own', () => {
  const directory = fileURLToPath(new URL('./', import.meta.url));
  const sources = readdirSync(directory).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
  assert.ok(sources.includes('worker.ts'));
  for (const name of sources) {
    const source = readFileSync(join(directory, name), 'utf8');
    const imports = [...source.matchAll(IMPORT)].map(([, specifier]) => specifier!);
    const nonPure = name === 'mandate.ts' ? imports.filter((item) => item !== 'node:crypto') : imports;
    assert.deepEqual(nonPure.filter((item) => item.startsWith('node:')), [], `${name} imports Node built-ins`);
    assert.doesNotMatch(source, /\bfetch\s*\(|process\.env/, `${name} reaches the network or environment directly`);
    assert.deepEqual(imports.filter((item) => item.startsWith('.') && /checker/.test(item)), [], `${name} imports checker code`);
    const packages = imports.filter((item) => !item.startsWith('.') && !item.startsWith('node:'));
    assert.deepEqual(packages.filter((item) => item !== 'zod' && !(name === 'anthropic.ts' && item === '@anthropic-ai/sdk')), [], `${name} has an unexpected dependency`);
  }
});
