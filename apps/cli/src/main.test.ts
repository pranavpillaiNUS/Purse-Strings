import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = join(root, 'apps/cli/src/main.ts');
const fixedClock = ['--now', '2026-11-03T09:00:00Z'];
function run(args: string[], input?: string) {
  return spawnSync(process.execPath, [entry, ...args], { cwd: root, input, encoding: 'utf8' });
}

test('check outputs a single parseable JSON document and exit zero for eligible cart', () => {
  const result = run(['check', ...fixedClock, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).decision, 'eligible');
});

test('stdin cart input works and human output explains the result', () => {
  const result = run(['check', ...fixedClock, '--request', '-'], readFileSync(join(root, 'examples/cart.json'), 'utf8'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /eligible.*SGD 3593\.73/);
  assert.match(result.stdout, /BUDGET/);
});

test('malformed and price-bearing cart JSON fail with stderr diagnostics and no stdout', () => {
  const cart = JSON.parse(readFileSync(join(root, 'examples/cart.json'), 'utf8'));
  for (const input of ['not JSON', JSON.stringify({ ...cart, price: 1 })]) {
    const result = run(['check', '--request', '-', '--json'], input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.notEqual(result.stderr, '');
  }
});

test('blocked and unknown evidence have distinct exit codes with JSON output', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const snapshot = JSON.parse(readFileSync(join(root, 'examples/budget-snapshot.json'), 'utf8'));
  snapshot.committedMinor = 799999;
  const snapshotPath = join(directory, 'budget.json');
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const blocked = run(['check', ...fixedClock, '--snapshot', snapshotPath, '--json']);
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).decision, 'blocked');

  const catalog = JSON.parse(readFileSync(join(root, 'services/suppliers/fixtures/store-a.json'), 'utf8'));
  catalog.delivery.evidence.status = 'unknown';
  const catalogPath = join(directory, 'catalog.json');
  writeFileSync(catalogPath, JSON.stringify(catalog));
  const unknown = run(['check', ...fixedClock, '--catalog', catalogPath, '--json']);
  assert.equal(unknown.status, 3, unknown.stderr);
  assert.equal(JSON.parse(unknown.stdout).decision, 'needs_review');
});

test('demo reports all four expected outcomes without external services', () => {
  const result = run(['demo', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const demo = JSON.parse(result.stdout);
  assert.equal(demo.passed, true);
  assert.deepEqual(demo.scenarios.map((scenario: { result: { decision: string } }) => scenario.result.decision),
    ['eligible', 'blocked', 'blocked', 'needs_review']);
});

test('CLI rejects unknown commands/options and invalid clocks instead of silently ignoring input', () => {
  for (const args of [['purchase'], ['check', '--unknown'], ['check', '--now', 'invalid'], ['demo', ...fixedClock]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.notEqual(result.stderr, '');
  }
  assert.equal(run(['--help']).status, 0);
});
