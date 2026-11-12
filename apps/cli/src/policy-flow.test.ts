import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LocalFileStore } from './file-store.ts';
import { PolicyRegistry } from './policy-upload.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('a scripted take pins the confirmed policy even after another policy is activated', { timeout: 60_000 }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'policy-flow-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fallbackPath = join(root, 'config/policies/hardware.example.json');
  const bundled = JSON.parse(readFileSync(fallbackPath, 'utf8'));
  const registry = new PolicyRegistry({
    directory: join(dir, 'policies'), fallbackPath,
    files: new LocalFileStore(join(dir, 'uploads')), operator: () => 'ops',
  });
  const pending = registry.upload(Buffer.from(JSON.stringify({ ...bundled, maxBudgetMinor: 900_000 })), 'json', ['store-a', 'store-b']);
  registry.activate(pending.digest);
  const take = join(dir, 'take');
  const result = spawnSync(process.execPath, [join(root, 'apps/cli/src/demo-flow.ts'), '--policy', registry.activePath(), '--dir', take], {
    cwd: root, encoding: 'utf8', timeout: 50_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout.slice(-3000));
  const pinned = JSON.parse(readFileSync(join(take, 'policy.json'), 'utf8'));
  assert.equal(pinned.version, pending.policy.version);
  assert.equal(pinned.maxBudgetMinor, 900_000);
  const config = JSON.parse(readFileSync(join(take, 'config.json'), 'utf8')) as { policyFiles: string[] };
  assert.deepEqual(config.policyFiles, [join(take, 'policy.json')]);
  const next = registry.upload(Buffer.from(JSON.stringify({ ...bundled, maxBudgetMinor: 950_000 })), 'json', ['store-a', 'store-b']);
  registry.activate(next.digest);
  assert.equal(registry.active().policy.maxBudgetMinor, 950_000);
  assert.deepEqual(JSON.parse(readFileSync(join(take, 'policy.json'), 'utf8')), pinned);
});
