import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MandateDraftSchema } from '../../../services/agent/src/mandate.ts';
import { printable, printableLine } from './mandate.ts';

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

test('human draft and review output show money as S$, and JSON keeps integer cents', () => {
  const human = run(['mandate', 'draft', '--request', requestPath, '--now', now]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /budget: S\$\d[\d,]*\.\d{2} \(all-in\)/);
  assert.match(human.stdout, /cap: S\$\d[\d,]*\.\d{2} each/);
  assert.doesNotMatch(human.stdout, /SGD cents/);
  const artifact = draft();
  assert.ok(Number.isInteger(artifact.proposal.budgetMinor));
  const review = run(['mandate', 'review', '--draft', '-', '--now', now], JSON.stringify(artifact));
  assert.equal(review.status, 0, review.stderr);
  assert.match(review.stdout, /budget: S\$/);
  assert.doesNotMatch(review.stdout, /SGD cents/);
});

test('printable neutralizes escape sequences, C1 controls and bidi overrides, and keeps ordinary text', () => {
  const ESC = String.fromCharCode(0x1b);
  const BEL = String.fromCharCode(0x07);
  const c1 = (code: number): string => String.fromCharCode(code);
  const inert = (text: string): string => printable(text).replace(/ +/g, ' ').trim();
  // CSI, in 7-bit and C1 form, takes its parameters and final byte with it.
  assert.equal(inert(`a${ESC}[2Jb`), 'a b');
  assert.equal(inert(`a${ESC}[38;5;196mb`), 'a b');
  assert.equal(inert(`a${c1(0x9b)}31mb`), 'a b');
  // OSC, DCS and APC strings go whole, with either terminator, including a clipboard write.
  assert.equal(inert(`a${ESC}]52;c;ZXZpbA==${BEL}b`), 'a b');
  assert.equal(inert(`a${ESC}]0;title${ESC}\\b`), 'a b');
  assert.equal(inert(`a${ESC}Ppayload${ESC}\\b`), 'a b');
  assert.equal(inert(`a${ESC}_payload${c1(0x9c)}b`), 'a b');
  assert.equal(inert(`a${c1(0x9d)}title${c1(0x9c)}b`), 'a b');
  // Other ESC sequences and a lone ESC.
  assert.equal(inert(`a${ESC}cb`), 'a b');
  assert.equal(inert(`a${ESC}(0b`), 'a b');
  assert.equal(inert(`a${ESC}`), 'a');
  // An unterminated string loses its introducer, not the text after it.
  assert.equal(inert(`a${ESC}]0;still visible`), 'a 0;still visible');
  // Every C1 control and every bidi override.
  for (let code = 0x80; code <= 0x9f; code += 1) {
    assert.ok(!printable(`a${c1(code)}b`).includes(c1(code)), code.toString(16));
  }
  for (const code of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c, 0x2028, 0x2029]) {
    assert.equal(printable(`a${c1(code)}b`), 'a b', code.toString(16));
  }
  // Nothing dangerous can be reassembled from what is left.
  const nested = printable(`${ESC}${ESC}[2J${c1(0x9b)}${ESC}]0;x${BEL}`);
  assert.ok(![...nested].some((character) => character.charCodeAt(0) < 0x20 || (character.charCodeAt(0) >= 0x7f && character.charCodeAt(0) <= 0x9f)));
  // Tabs and carriage returns are controls too, while a newline stays for multi-line text.
  assert.equal(printable('a\tb\rc\nd'), 'a b c\nd');
  assert.equal(printableLine('a\nb\r\nc'), 'a b  c');
  // Ordinary text is untouched, including non-English text.
  const text = `Caf${c1(0xe9)} ${c1(0x4e2d)}${c1(0x6587)} S$8,000 (all-in)`;
  assert.equal(printable(text), text);
  assert.equal(printableLine(text), text);
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
