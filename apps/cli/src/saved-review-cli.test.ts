import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_SAVED_REVIEW_BYTES, parseSavedReview } from '../../../services/agent/src/saved-review.ts';
import { createFileSubmissionJournal } from './submission-journal.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = join(root, 'apps/cli/src/shop.ts');
const mandateId = 'engineering-hires-practice';
const mandateFile = join(root, 'services/agent/fixtures/practice-mandate.json');
const catalogFile = join(root, 'services/suppliers/fixtures/store-a.json');
const lines = [
  { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 5 },
  { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 5 },
];
const mockArgs = ['--mandate-id', mandateId, '--mock-mandate', mandateFile, '--catalog', catalogFile];
const fixture = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
function directory(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'splittap-saved-review-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
function calls(path: string, id: string): string {
  const script = join(path, 'calls.json');
  writeFileSync(script, JSON.stringify([
    { tool: 'catalog.search', args: { supplierId: 'hostile\u001b[2J\u202e\nOutcome: hacked', requirementId: 'engineering-laptops' } },
    { tool: 'cart.build', args: { supplierId: 'store-a', lines } },
    { tool: 'cart.submit', args: { cartId: `${id}-cart-1` } },
  ]));
  return script;
}
function run(args: string[], hook?: string, extra: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env, ...extra };
  delete env.ANTHROPIC_API_KEY;
  delete env.NODE_OPTIONS;
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('PAYPAL_')) delete env[key];
  const result = spawnSync(process.execPath, [...(hook ? ['--import', pathToFileURL(hook).href] : []), entry, ...args], {
    cwd: root, encoding: 'utf8', env, timeout: 15_000,
  });
  assert.equal(result.error, undefined);
  return result;
}

/** Test-only process transport: no checker/payment implementation, model or network. */
function preload(path: string): string {
  const hook = join(path, 'trap.mjs');
  writeFileSync(hook, `
import fs from 'node:fs';
import cp from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { createMockBackend } from ${JSON.stringify(pathToFileURL(join(root, 'packages/contracts/src/mock.ts')).href)};
const read = fs.readFileSync;
const backend = createMockBackend({ mandates: [JSON.parse(read(${JSON.stringify(mandateFile)}, 'utf8'))], catalogs: [JSON.parse(read(${JSON.stringify(catalogFile)}, 'utf8'))] });
fs.readFileSync = function(path, ...args) {
  if (String(path).endsWith('.env')) throw new Error('TEST: .env read forbidden');
  return read(path, ...args);
};
globalThis.fetch = () => { throw new Error('TEST: network forbidden'); };
cp.spawn = function() {
  if (process.env.REVIEW_TEST_MODE === 'trap') throw new Error('TEST: backend forbidden');
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.kill = () => true;
  let input = '';
  child.stdin.on('data', chunk => { input += chunk; });
  child.stdin.on('end', async () => {
    const request = JSON.parse(input);
    fs.appendFileSync(process.env.REVIEW_TEST_LOG, request.method + '\\n');
    let response;
    if (request.method === 'proposal.submit' && process.env.REVIEW_TEST_MODE === 'unknown') {
      response = {apiVersion:'1',requestId:request.requestId,method:request.method,simulation:true,ok:false,error:{code:'INTERNAL_ERROR',message:'Unresolved',details:{checkCodes:[]}}};
    } else response = await backend.handle(request);
    if (request.method === 'proposal.submit' && process.env.REVIEW_TEST_OUT) fs.writeFileSync(process.env.REVIEW_TEST_OUT, 'competing file', {flag:'wx'});
    child.stdout.end(JSON.stringify(response));
    child.emit('close', 0);
  });
  return child;
};
syncBuiltinESMExports();
`);
  return hook;
}

test('saving with --json keeps stdout report unchanged and saves full normalized events; replay is historical and offline', (t) => {
  const path = directory(t);
  const script = calls(path, 'saved');
  const file = join(path, 'review.json');
  const args = ['run', '--run-id', 'saved', ...mockArgs, '--scripted', script, '--json'];
  const original = run(args);
  const captured = run([...args, '--review-out', file]);
  assert.equal(captured.status, 0, captured.stderr);
  assert.equal(captured.stdout, original.stdout);
  assert.equal(captured.stderr, '');
  const saved = parseSavedReview(fixture(file));
  assert.equal(saved.kind, 'saved-shop-review');
  if (saved.kind !== 'saved-shop-review') assert.fail();
  assert.equal(saved.review.decisions.length, 1);
  assert.ok(saved.review.decisions[0]!.estimate);
  assert.equal(saved.review.decisions[0]!.estimate!.authoritative, false);
  assert.equal(saved.review.refusals.length, 1);
  assert.equal(saved.review.backend, 'contract-mock');
  assert.equal(saved.historical, true);
  assert.deepEqual(readdirSync(path).filter((name) => name.includes('.tmp')), []);
  // A deadline and capture date in the past are valid historical data, with no refresh.
  const old = { ...saved, savedAt: '2001-01-01T00:00:00Z' };
  writeFileSync(file, JSON.stringify(old));
  const hook = preload(path);
  const replay = run(['review', '--file', file], hook, { REVIEW_TEST_MODE: 'trap' });
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /HISTORICAL REVIEW \| captured 2001-01-01T00:00:00Z/);
  assert.match(replay.stdout, /Editable saved file; not authenticated authority or current ledger facts/);
  assert.match(replay.stdout, /Contract mock: it checks nothing/);
  assert.match(replay.stdout, /Estimate.*never authoritative/s);
  assert.match(replay.stdout, /npm run shop -- status/);
  assert.doesNotMatch(replay.stdout, /\u001b|\u202e|\[2J|operation-run|operation-authorize|resends|Run the shopper again/);
  assert.equal(replay.stdout.split('\n').filter((line) => line.startsWith('Outcome:')).length, 1);
  const json = run(['review', '--file', file, '--json'], hook, { REVIEW_TEST_MODE: 'trap' });
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), old);
  const brief = run(['review', '--file', file, '--brief'], hook, { REVIEW_TEST_MODE: 'trap' });
  assert.equal(brief.status, 0, brief.stderr);
  assert.match(brief.stdout, /details remain in the saved full review/);
  assert.doesNotMatch(brief.stdout, /Usage:|operation-run/);
});

test('--brief saves the same full review as normal output, including refused calls', (t) => {
  const path = directory(t);
  const script = calls(path, 'brief');
  const a = join(path, 'full.json'); const b = join(path, 'brief.json');
  const args = ['run', '--run-id', 'brief', ...mockArgs, '--scripted', script];
  const full = run([...args, '--review-out', a]);
  const brief = run([...args, '--brief', '--review-out', b]);
  assert.equal(full.status, 0, full.stderr);
  assert.equal(brief.status, 0, brief.stderr);
  const first = fixture(a) as { savedAt?: string }; const second = fixture(b) as { savedAt?: string };
  delete first.savedAt; delete second.savedAt;
  assert.deepEqual(first, second);
});

test('invalid, oversized, nonregular and future-version review files fail with empty stdout', (t) => {
  const path = directory(t);
  const file = join(path, 'bad.json');
  for (const content of ['{broken', '{"schemaVersion":2,"historical":true}', '"text"', JSON.stringify({schemaVersion: 1, historical: true, extra: 'x'}), Buffer.from([0xff, 0x7b]), ' '.repeat(MAX_SAVED_REVIEW_BYTES + 1)]) {
    writeFileSync(file, content);
    const result = run(['review', '--file', file]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Saved review/);
  }
  for (const args of [['review'], ['review', '--file', file, '--brief', '--json'], ['review', '--file', file, '--backend-db', 'forbidden']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
  }
  const nonregular = run(['review', '--file', path]);
  assert.equal(nonregular.status, 1);
  assert.equal(nonregular.stdout, '');
});

test('output destinations are rejected before model reads, backend calls or journal resends', (t) => {
  const path = directory(t);
  const hook = preload(path);
  const database = join(path, 'app.db');
  const config = join(path, 'config.json');
  const script = join(path, 'missing-script.json');
  const trace = join(path, 'trace.json');
  const existing = join(path, 'existing.json');
  writeFileSync(existing, 'keep me');
  const journal = `${database}.shop-journal`;
  mkdirSync(join(journal, 'nested'), { recursive: true });
  const alias = join(path, 'journal-alias');
  symlinkSync(journal, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const args = ['run', '--run-id', 'preflight', '--mandate-id', mandateId, '--backend-db', database, '--backend-config', config, '--scripted', script, '--trace', trace];
  const badWindowsNames = process.platform === 'win32' ? ['NUL', 'CON.json', 'lpt1.txt', 'review.json:stream', 'trailing.', 'trailing ', 'invalid?.json'].map((name) => join(path, name)) : [];
  for (const output of [existing, database, `${database}-wal`, `${database}-shm`, `${database}-journal`, config, script, trace, journal, join(journal, 'nested', 'review.json'), join(alias, 'nested', 'review.json'), join(path, 'absent', 'review.json'), ...badWindowsNames]) {
    const result = run([...args, '--review-out', output], hook, { REVIEW_TEST_MODE: 'trap' });
    assert.equal(result.status, 1, output);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /review-out/);
    assert.doesNotMatch(result.stderr, /Scripted|TEST: backend|\.env/);
  }
  assert.equal(readFileSync(existing, 'utf8'), 'keep me');
  assert.equal(existsSync(database), false);
  const good = join(path, 'unused.json');
  const unknownFlag = run([...args, '--review-out', good, '--execute'], hook, { REVIEW_TEST_MODE: 'trap' });
  assert.equal(unknownFlag.status, 1);
  assert.equal(unknownFlag.stdout, '');
  assert.equal(existsSync(good), false);
  assert.deepEqual(readdirSync(path).filter((name) => name.includes('.tmp')), []);
});

test('unknown run and recovery-only resends save and replay without offering stale retry instructions', (t) => {
  const path = directory(t);
  const hook = preload(path);
  const database = join(path, 'app.db');
  const config = join(path, 'config.json');
  const log = join(path, 'backend.log');
  const script = calls(path, 'unknown');
  const file = join(path, 'unknown.json');
  const backend = ['--mandate-id', mandateId, '--backend-db', database, '--backend-config', config];
  const captured = run(['run', '--run-id', 'unknown', ...backend, '--scripted', script, '--json', '--review-out', file], hook, { REVIEW_TEST_MODE: 'unknown', REVIEW_TEST_LOG: log });
  assert.equal(captured.status, 3, captured.stderr);
  assert.equal(JSON.parse(captured.stdout).outcome, 'unknown_submission');
  const saved = parseSavedReview(fixture(file));
  assert.equal(saved.kind, 'saved-shop-review');
  if (saved.kind !== 'saved-shop-review') assert.fail();
  assert.equal(saved.review.unresolved, true);
  assert.equal(saved.review.decisions[0]!.decision, 'unknown');
  const replay = run(['review', '--file', file], hook, { REVIEW_TEST_MODE: 'trap' });
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /UNKNOWN/);
  assert.match(replay.stdout, /reservation may exist/);
  assert.doesNotMatch(replay.stdout, /operation-run|resends|Run the shopper again/);
  const journal = createFileSubmissionJournal(database, mandateId);
  assert.equal(journal.pending().length, 1);

  const unresolved = join(path, 'still-unknown.json');
  const recovery = run(['run', '--run-id', 'recovery-unknown', ...backend, '--scripted', join(path, 'must-not-read.json'), '--review-out', unresolved, '--json'], hook, { REVIEW_TEST_MODE: 'unknown', REVIEW_TEST_LOG: log });
  assert.equal(recovery.status, 3, recovery.stderr);
  const recoverySaved = parseSavedReview(fixture(unresolved));
  assert.equal(recoverySaved.kind, 'saved-shop-recovery-review');
  if (recoverySaved.kind !== 'saved-shop-recovery-review') assert.fail();
  assert.equal(recoverySaved.resent[0]!.kind, 'unknown');
  assert.equal(journal.pending().length, 1);
  const recoveryReplay = run(['review', '--file', unresolved], hook, { REVIEW_TEST_MODE: 'trap' });
  assert.equal(recoveryReplay.status, 0, recoveryReplay.stderr);
  assert.match(recoveryReplay.stdout, /still unknown/);
  assert.doesNotMatch(recoveryReplay.stdout, /Run the shopper again|operation-run/);

  const accepted = join(path, 'recovered.json');
  const settled = run(['run', '--run-id', 'recovered', ...backend, '--scripted', join(path, 'must-not-read.json'), '--review-out', accepted, '--json'], hook, { REVIEW_TEST_MODE: 'accept', REVIEW_TEST_LOG: log });
  assert.equal(settled.status, 0, settled.stderr);
  const acceptedSaved = parseSavedReview(fixture(accepted));
  assert.equal(acceptedSaved.kind, 'saved-shop-recovery-review');
  if (acceptedSaved.kind !== 'saved-shop-recovery-review') assert.fail();
  assert.equal(acceptedSaved.resent[0]!.kind, 'accepted');
  assert.equal(journal.pending().length, 0);
  const acceptedReplay = run(['review', '--file', accepted], hook, { REVIEW_TEST_MODE: 'trap' });
  assert.equal(acceptedReplay.status, 0, acceptedReplay.stderr);
  assert.match(acceptedReplay.stdout, /Operation /);
  assert.match(acceptedReplay.stdout, /Payment/);
  assert.doesNotMatch(acceptedReplay.stdout, /operation-run|operation-authorize|Run the shopper again/);
});

test('a late save collision preserves accepted and unknown stdout, operation identity and exit code', (t) => {
  for (const mode of ['accept', 'unknown']) {
    const path = directory(t);
    const hook = preload(path);
    const output = join(path, 'review.json');
    const script = calls(path, mode);
    const database = join(path, 'app.db');
    const args = ['run', '--run-id', mode, '--mandate-id', mandateId, '--backend-db', database, '--backend-config', join(path, 'config.json'), '--scripted', script, '--json', '--review-out', output];
    const result = run(args, hook, { REVIEW_TEST_MODE: mode, REVIEW_TEST_LOG: join(path, 'backend.log'), REVIEW_TEST_OUT: output });
    assert.equal(result.status, mode === 'accept' ? 0 : 3, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.outcome, mode === 'accept' ? 'completed' : 'unknown_submission');
    if (mode === 'accept') assert.ok(report.progress.accepted[0].operation.id);
    else assert.equal(report.progress.unresolved.id, `${mode}-cart-1`);
    assert.match(result.stderr, /WARNING: the review could not be saved/);
    assert.equal(readFileSync(output, 'utf8'), 'competing file');
    assert.deepEqual(readdirSync(path).filter((name) => name.includes('.tmp')), []);
  }
});

test('a late recovery save failure keeps recovered operation identity and unknown outcomes intact', (t) => {
  for (const mode of ['accept', 'unknown']) {
    const path = directory(t);
    const hook = preload(path);
    const database = join(path, 'app.db');
    const output = join(path, 'review.json');
    const journal = createFileSubmissionJournal(database, mandateId);
    journal.save({ id: 'earlier-cart-1', mandateId, mandateVersion: 1, supplierId: 'store-a', lines });
    const result = run(['run', '--run-id', 'recovery', '--mandate-id', mandateId, '--backend-db', database, '--backend-config', join(path, 'config.json'), '--scripted', join(path, 'must-not-read.json'), '--json', '--review-out', output], hook,
      { REVIEW_TEST_MODE: mode, REVIEW_TEST_LOG: join(path, 'backend.log'), REVIEW_TEST_OUT: output });
    assert.equal(result.status, mode === 'accept' ? 0 : 3, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.resent[0].kind, mode === 'accept' ? 'accepted' : 'unknown');
    if (mode === 'accept') assert.ok(report.resent[0].operation.id);
    else assert.equal(journal.pending().length, 1);
    assert.match(result.stderr, /WARNING: the recovery review could not be saved/);
    assert.equal(readFileSync(output, 'utf8'), 'competing file');
  }
});

test('review replay preserves the shopper credential guard without requiring a model key', (t) => {
  const path = directory(t);
  const env: NodeJS.ProcessEnv = { ...process.env, PAYPAL_TEST_UNEXPECTED: 'not-a-secret' };
  delete env.ANTHROPIC_API_KEY;
  const result = spawnSync(process.execPath, [entry, 'review', '--file', join(path, 'unused.json')], { cwd: root, env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /shopper must not hold payment credentials/);
  assert.doesNotMatch(result.stderr, /not-a-secret/);
});

test('a POSIX FIFO review input is rejected without waiting for a writer', { skip: process.platform === 'win32' }, (t) => {
  const path = directory(t);
  const fifo = join(path, 'input.fifo');
  const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  if (made.error && (made.error as NodeJS.ErrnoException).code === 'ENOENT') { t.skip('mkfifo unavailable'); return; }
  assert.equal(made.status, 0, made.stderr);
  const result = run(['review', '--file', fifo]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /regular file/);
});
