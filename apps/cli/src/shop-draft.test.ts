import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MandateSchema } from '../../../packages/contracts/src/index.ts';
import { MandateDraftSchema, UnconfirmedMandateSchema } from '../../../services/agent/src/mandate.ts';

// Every run here passes --scripted. Without it, the command would read the developer's
// real .env and spend API credit, so no test may run this command without it.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const shopEntry = join(root, 'apps/cli/src/shop.ts');
const cliEntry = join(root, 'apps/cli/src/main.ts');
const textFile = join(root, 'services/agent/fixtures/hire-request-text.txt');
const calls = join(root, 'services/agent/fixtures/draft-request-calls.json');
const now = '2026-11-06T09:00:00Z';

function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function draft(args: string[], env: NodeJS.ProcessEnv = baseEnv()) {
  const result = spawnSync(process.execPath, [shopEntry, 'draft', ...args], { cwd: root, encoding: 'utf8', env });
  assert.equal(result.error, undefined);
  return result;
}

function tempDir(t: { after: (fn: () => void) => void }): string {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-draft-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('draft, then review: the files work with the existing commands and show the model guesses', (t) => {
  const directory = tempDir(t);
  const draftFile = join(directory, 'draft.json');
  const proposalFile = join(directory, 'proposal.json');
  const result = draft(['--text-file', textFile, '--scripted', calls, '--now', now, '--draft-out', draftFile, '--proposal-out', proposalFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Mandate draft \| digest [a-f0-9]{64}/);
  assert.match(result.stdout, /purchaseBy: No purchase deadline was given/);
  assert.match(result.stdout, /NOT captured[\s\S]*Reuse suitable stock first/);
  assert.match(result.stdout, /Draft only\. No mandate confirmed/);
  assert.match(result.stdout, /budget: S\$8,000\.00 \(all-in\)/);
  assert.match(result.stdout, /cap: S\$\d[\d,]*\.\d{2} each/);
  assert.doesNotMatch(result.stdout, /SGD cents/);

  const artifact = MandateDraftSchema.parse(JSON.parse(readFileSync(draftFile, 'utf8')));
  assert.equal(artifact.origin?.requestedModel, 'scripted');
  // The proposal is the backend's input form: no BOM, unconfirmed, and not a mandate.
  const bytes = readFileSync(proposalFile);
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  const proposal = JSON.parse(bytes.toString('utf8')) as unknown;
  assert.deepEqual(UnconfirmedMandateSchema.parse(proposal), artifact.proposal);
  assert.equal(MandateSchema.safeParse(proposal).success, false);

  const review = spawnSync(process.execPath, [cliEntry, 'mandate', 'review', '--draft', draftFile, '--now', now], { cwd: root, encoding: 'utf8' });
  assert.equal(review.status, 0, review.stderr);
  assert.match(review.stdout, /draft_valid/);
  assert.match(review.stdout, /Equip five engineering hires/);
  assert.match(review.stdout, /NOT captured[\s\S]*Reuse suitable stock first/);
});

test('--json prints one report, and it says a draft is all it produced', () => {
  const result = draft(['--text', 'Equip five engineering hires.', '--scripted', calls, '--now', now, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as { kind: string; outcome: string; draft: { status: string; proposal: Record<string, unknown> } };
  assert.equal(report.kind, 'mandate-draft-run');
  assert.equal(report.outcome, 'drafted');
  assert.equal(report.draft.status, 'draft');
  assert.equal('approvedBy' in report.draft.proposal, false);
});

test('a policy refusal exits 2, writes no files and shows the request as read', (t) => {
  const directory = tempDir(t);
  const script = join(directory, 'calls.json');
  const [call] = JSON.parse(readFileSync(calls, 'utf8')) as Array<{ tool: string; args: { request: Record<string, unknown> } }>;
  writeFileSync(script, JSON.stringify([{ ...call, args: { ...call!.args, request: { ...call!.args.request, budgetMinor: 2_000_000 } } }]));
  const draftFile = join(directory, 'draft.json');
  const result = draft(['--text-file', textFile, '--scripted', script, '--now', now, '--draft-out', draftFile]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /No draft: policy_refused \| Request budget exceeds company policy/);
  assert.match(result.stdout, /"budgetMinor":2000000/);
  assert.match(result.stdout, /not captured: Reuse suitable stock first/);
  assert.throws(() => readFileSync(draftFile));
});

test('a model question exits 2 with no draft', (t) => {
  // An empty script is a model that stops without calling the tool.
  const script = join(tempDir(t), 'calls.json');
  writeFileSync(script, '[]');
  const result = draft(['--text', 'Buy some laptops.', '--scripted', script, '--now', now, '--json']);
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout) as { outcome: string; draft: unknown };
  assert.equal(report.outcome, 'needs_input');
  assert.equal(report.draft, null);
});

test('an existing output file is refused before any model call', (t) => {
  const directory = tempDir(t);
  const existing = join(directory, 'draft.json');
  writeFileSync(existing, 'keep me');
  // A broken script path would fail later, so this error can only come from the early check.
  const result = draft(['--text-file', textFile, '--scripted', join(directory, 'missing.json'), '--now', now, '--draft-out', existing]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to overwrite/);
  assert.equal(readFileSync(existing, 'utf8'), 'keep me');
});

test('the same file for both outputs is refused before any model call', (t) => {
  const directory = tempDir(t);
  const missing = join(directory, 'missing.json');
  // Each pair names one new file, including through a relative path and different case.
  for (const [first, second] of [
    [join(directory, 'same.json'), join(directory, 'same.json')],
    [join(directory, 'same.json'), join(directory, '.', 'x', '..', 'same.json')],
    [join(directory, 'same.json'), join(directory, 'SAME.JSON')],
  ] as const) {
    // A broken script path would fail later, so this error can only come from the early check.
    const result = draft(['--text-file', textFile, '--scripted', missing, '--now', now, '--draft-out', first, '--proposal-out', second]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be different files/);
    assert.equal(result.stdout, '');
    assert.throws(() => readFileSync(first));
  }
});

test('an output directory that does not exist is refused before any model call', (t) => {
  const directory = tempDir(t);
  const result = draft(['--text-file', textFile, '--scripted', join(directory, 'missing.json'), '--now', now, '--draft-out', join(directory, 'nowhere', 'draft.json')]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Output directory does not exist/);
});

test('invalid command lines exit 1 with empty stdout', () => {
  for (const args of [
    ['--scripted', calls, '--now', now],
    ['--text', 'a', '--text-file', textFile, '--scripted', calls, '--now', now],
    ['--text-file', join(root, 'does-not-exist.txt'), '--scripted', calls, '--now', now],
    ['--text', '   ', '--scripted', calls, '--now', now],
    ['--text', 'a', '--scripted', calls, '--model', 'claude-opus-5-5', '--now', now],
  ]) {
    const result = draft(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout, '', JSON.stringify(args));
    assert.notEqual(result.stderr, '', JSON.stringify(args));
  }
});

test('drafting also refuses to run with payment credentials in its environment', () => {
  const result = draft(['--text', 'a', '--scripted', calls, '--now', now], { ...baseEnv(), PAYPAL_CLIENT_SECRET: 'must-not-appear' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not hold payment credentials \(PAYPAL_CLIENT_SECRET\)/);
  assert.doesNotMatch(result.stderr, /must-not-appear/);
});
