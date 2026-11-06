import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MandateDraftSchema } from '../../../services/agent/src/mandate.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = join(root, 'apps/cli/src/main.ts');
const requestPath = join(root, 'services/agent/fixtures/hire-request.json');
const kitPath = join(root, 'services/agent/fixtures/engineering-kit.json');
const policyPath = join(root, 'config/policies/hardware.example.json');
const now = '2026-11-04T09:00:00Z';

function run(args: string[], input?: string) {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, encoding: 'utf8', input });
  assert.equal(result.error, undefined, result.error?.message ?? 'CLI subprocess failed');
  return result;
}

function draft(inputPath = requestPath, input?: string) {
  const result = run(['mandate', 'draft', '--request', inputPath, '--now', now, '--json'], input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return MandateDraftSchema.parse(JSON.parse(result.stdout));
}

function invalid(args: string[], input?: string) {
  const result = run(args, input);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr, '');
}

test('--proposal-out writes a BOM-free proposal for the backend and never overwrites a file', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-proposal-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const out = join(directory, 'proposal.json');
  const result = run(['mandate', 'draft', '--request', requestPath, '--now', now, '--proposal-out', out, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const artifact = MandateDraftSchema.parse(JSON.parse(result.stdout));
  const bytes = readFileSync(out);
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  const proposal = JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(proposal, artifact.proposal);
  assert.equal('approvedBy' in proposal, false);
  assert.equal('digest' in proposal, false);

  const before = readFileSync(out, 'utf8');
  const repeat = run(['mandate', 'draft', '--request', requestPath, '--now', now, '--proposal-out', out, '--json']);
  assert.equal(repeat.status, 1);
  assert.equal(repeat.stdout, '');
  assert.equal(readFileSync(out, 'utf8'), before);
  invalid(['mandate', 'review', '--draft', requestPath, '--now', now, '--proposal-out', join(directory, 'other.json')]);
});

test('mandate draft JSON is directly reviewable from stdin and contains no confirmation authority', () => {
  const artifact = draft('-', `\uFEFF${readFileSync(requestPath, 'utf8')}`);
  assert.equal(artifact.request.hireCount, 5);
  assert.deepEqual(artifact.proposal.requirements.map((line) => line.quantity), [5, 5]);
  assert.equal('approvedBy' in artifact.proposal, false);
  const review = run(['mandate', 'review', '--draft', '-', '--now', now, '--json'], `\uFEFF${JSON.stringify(artifact)}`);
  assert.equal(review.status, 0, review.stderr);
  assert.equal(review.stderr, '');
  const result = JSON.parse(review.stdout);
  assert.equal(result.kind, 'mandate-draft-review');
  assert.equal(result.decision, 'draft_valid');
  assert.equal(result.draftDigest, artifact.digest);
  assert.ok(result.checks.every((check: { status: string }) => check.status === 'pass'));
});

test('review loads the current policy and kit files and detects drift under the same version', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-mandate-drift-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifactPath = join(directory, 'draft.json');
  writeFileSync(artifactPath, JSON.stringify(draft()));
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  policy.maxBudgetMinor += 1;
  const changedPolicy = join(directory, 'policy.json');
  writeFileSync(changedPolicy, JSON.stringify(policy));
  const policyReview = run(['mandate', 'review', '--draft', artifactPath, '--policy', changedPolicy, '--now', now, '--json']);
  assert.equal(policyReview.status, 2, policyReview.stderr);
  assert.equal(policyReview.stderr, '');
  assert.equal(JSON.parse(policyReview.stdout).checks.find((check: { code: string }) => check.code === 'POLICY_BINDING').status, 'fail');

  const kit = JSON.parse(readFileSync(kitPath, 'utf8'));
  kit.lines.pop();
  const changedKit = join(directory, 'kit.json');
  writeFileSync(changedKit, JSON.stringify(kit));
  const kitReview = run(['mandate', 'review', '--draft', artifactPath, '--kit', changedKit, '--now', now, '--json']);
  assert.equal(kitReview.status, 2, kitReview.stderr);
  assert.equal(kitReview.stderr, '');
  assert.equal(JSON.parse(kitReview.stdout).checks.find((check: { code: string }) => check.code === 'KIT_BINDING').status, 'fail');
});

test('tampered or expired drafts need revision and human output explains the planning boundary', () => {
  const artifact = draft();
  artifact.proposal.budgetMinor -= 1;
  const tampered = run(['mandate', 'review', '--draft', '-', '--now', now, '--json'], JSON.stringify(artifact));
  assert.equal(tampered.status, 2, tampered.stderr);
  assert.equal(tampered.stderr, '');
  assert.equal(JSON.parse(tampered.stdout).decision, 'needs_revision');
  const expired = run(['mandate', 'review', '--draft', '-', '--now', '2026-11-06T09:00:00Z'], JSON.stringify(draft()));
  assert.equal(expired.status, 2, expired.stderr);
  assert.match(expired.stdout, /fail PURCHASE_DEADLINE/);
  assert.match(expired.stdout, /confirmation and stock assignment remain pending/);
  const humanDraft = run(['mandate', 'draft', '--request', requestPath, '--now', now]);
  assert.equal(humanDraft.status, 0, humanDraft.stderr);
  assert.match(humanDraft.stdout, /5 hires/);
  assert.match(humanDraft.stdout, /5 laptop/);
  assert.match(humanDraft.stdout, /Draft only/);
});

test('draft artifacts and bare proposals cannot be passed as confirmed mandates to check', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-mandate-authority-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifact = draft();
  for (const value of [artifact, artifact.proposal]) {
    const path = join(directory, 'unconfirmed.json');
    writeFileSync(path, JSON.stringify(value));
    invalid(['check', '--mandate', path, '--now', now, '--json']);
  }
  invalid(['mandate', 'confirm', '--draft', '-', '--now', now], JSON.stringify(artifact));
});

test('malformed and authority-bearing external inputs fail without emitting a draft', () => {
  const request = JSON.parse(readFileSync(requestPath, 'utf8'));
  for (const input of ['not JSON', JSON.stringify({ ...request, approvedBy: 'model' }),
    JSON.stringify({ ...request, budgetMinor: 1000001 }), JSON.stringify({ ...request, hireCount: 1.5 })]) {
    invalid(['mandate', 'draft', '--request', '-', '--now', now, '--json'], input);
  }
  invalid(['mandate', 'review', '--draft', '-', '--now', now, '--json'], '{"status":"confirmed"}');
  invalid(['mandate', 'draft', '--request', requestPath, '--now', 'invalid', '--json']);
});

test('mandate parsing rejects unsupported actions and flags without affecting other commands', () => {
  for (const args of [
    ['mandate'], ['mandate', 'draft'], ['mandate', 'draft', '--request', requestPath],
    ['mandate', 'review', '--now', now],
    ['mandate', 'draft', '--request', requestPath, '--now', now, '--draft', 'extra.json'],
    ['mandate', 'review', '--draft', '-', '--now', now, '--request', requestPath],
    ['mandate', 'draft', '--request', requestPath, '--now', now, '--shipping-minor', '0'],
    ['mandate', 'draft', '--request', requestPath, '--policy', '-', '--now', now],
    ['mandate', 'draft', '--request', requestPath, '--kit', '-', '--now', now],
    ['mandate', 'draft', 'extra', '--request', requestPath, '--now', now],
    ['store', 'show', '--draft', 'extra.json'], ['check', '--kit', kitPath],
  ]) invalid(args);
  const help = run(['mandate', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /offline planning only/);
});
