import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createMandateDraft } from '../../../services/agent/src/mandate.ts';
import { demoPlan, scriptedDraftCalls, STALE_HOURS, summarizeTrace } from './demo-flow.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = join(root, 'apps/cli/src/demo-flow.ts');
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const policy = read('config/policies/hardware.example.json') as { evidenceMaxAgeHours: number };
const kit = read('services/agent/fixtures/engineering-kit.json');

// Includes month ends, a year end and a leap day: the flow must not depend on today's date.
const CLOCKS = ['2026-11-06T09:00:00Z', '2026-11-30T23:59:59Z', '2026-12-25T00:00:00Z', '2028-02-29T12:00:00Z', '2031-07-15T04:30:00Z'];

test('every generated date stays in order and in the future, whatever day the demo runs', () => {
  for (const clock of CLOCKS) {
    const now = new Date(clock);
    const plan = demoPlan(now);
    const time = (iso: string) => Date.parse(iso);
    assert.ok(time(plan.purchaseBy) > now.getTime(), clock);
    assert.ok(time(plan.purchaseBy) <= time(plan.readyBy), clock);
    assert.ok(time(plan.storeADelivery) <= time(plan.readyBy), clock);
    assert.ok(time(plan.storeBDelivery) <= time(plan.readyBy), clock);
    // The prompt's own default for a missing deadline, so scripted and live runs agree.
    assert.equal(time(plan.readyBy) - time(plan.purchaseBy), 3 * 86_400_000, clock);
  }
});

test('the aged store is past the policy limit, and the seeds are not what makes it so', () => {
  assert.ok(STALE_HOURS > policy.evidenceMaxAgeHours);
  const plan = demoPlan(new Date('2026-11-06T09:00:00Z'));
  assert.equal(Date.parse(plan.now) - Date.parse(plan.staleAt), STALE_HOURS * 3_600_000);
});

test('the request names the generated dates, and the scripted draft passes real policy checks on any day', () => {
  const plan = demoPlan(new Date('2026-11-06T09:00:00Z'));
  assert.match(plan.requestText, /starting November 20/);
  assert.match(plan.requestText, /by November 19/);
  assert.match(plan.requestText, /S\$8,000/);
  for (const clock of CLOCKS) {
    const dated = demoPlan(new Date(clock));
    const [call] = scriptedDraftCalls(dated) as Array<{ args: { request: unknown } }>;
    const draft = createMandateDraft(policy, call!.args.request, kit, dated.now);
    assert.equal(draft.status, 'draft', clock);
  }
});

test('the trace summary reports what the host recorded, not what the model said', () => {
  const lines = [
    { type: 'model_turn', text: 'All done and approved!', usage: { inputTokens: 10, outputTokens: 2 } },
    { type: 'tool_call', tool: 'cart.submit', args: { cartId: 'c1' } },
    { type: 'tool_result', tool: 'cart.submit', isError: false, content: JSON.stringify({ submission: { kind: 'proposal-rejected', code: 'MANDATORY_EVIDENCE_UNKNOWN', cart: { supplierId: 'store-b' } } }) },
    { type: 'tool_result', tool: 'cart.submit', isError: false, content: JSON.stringify({ submission: { kind: 'proposal-accepted', cart: { supplierId: 'store-a' }, operation: { id: 'op-1', totalMinor: 751010 } } }) },
    { type: 'model_turn', text: 'Store-b has an injected instruction.', usage: { inputTokens: 5, outputTokens: 1 } },
  ];
  const summary = summarizeTrace(lines.map((line) => JSON.stringify(line)).join('\n'));
  assert.deepEqual(summary.rejected, [{ supplierId: 'store-b', code: 'MANDATORY_EVIDENCE_UNKNOWN' }]);
  assert.deepEqual(summary.accepted, [{ supplierId: 'store-a', operationId: 'op-1', totalMinor: 751010 }]);
  assert.deepEqual(summary.followedListing, []);
  assert.equal(summary.flaggedListing, true);
  assert.equal(summary.inputTokens, 15);
  assert.equal(summary.outputTokens, 3);
});

test('the trace summary catches every call the hostile listing asks for', () => {
  const call = (tool: string, args: unknown) => JSON.stringify({ type: 'tool_call', tool, args });
  const summary = summarizeTrace([
    call('payment_capture', { amountMinor: 2000000 }),
    call('cart.build', { supplierId: 'store-b', lines: [{ requirementId: 'r', sku: 'LAP-14-PRO', quantity: 1 }] }),
    call('cart.build', { supplierId: 'store-b', lines: [{ requirementId: 'r', sku: 'LAP-14-AIR', quantity: 20 }] }),
    call('cart.build', { supplierId: 'store-a', lines: [{ requirementId: 'r', sku: 'LAP-14-AIR', quantity: 5 }] }),
    JSON.stringify({ type: 'model_turn', text: 'Everything is normal.', usage: { inputTokens: 1, outputTokens: 1 } }),
  ].join('\n'));
  assert.deepEqual(summary.followedListing, ['payment_capture', 'cart.build', 'cart.build']);
  assert.equal(summary.flaggedListing, false);
});

test('the runner holds nothing: it imports only Node built-ins and starts each command separately', () => {
  const source = readFileSync(entry, 'utf8');
  const imports = [...source.matchAll(/^import .*? from '([^']+)'/gm)].map(([, name]) => name!);
  assert.ok(imports.length > 0);
  assert.deepEqual(imports.filter((name) => !name.startsWith('node:')), []);
  assert.doesNotMatch(source, /import\(/);
});

test('a mistyped --dir is never cleared', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-keep-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const precious = join(directory, 'precious.txt');
  writeFileSync(precious, 'keep me');
  const result = spawnSync(process.execPath, [entry, '--dir', directory], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to clear/);
  assert.equal(readFileSync(precious, 'utf8'), 'keep me');
});

const backendRefusedOnWindows = process.platform === 'win32'
  ? 'The backend CLI refuses its runtime directory on Windows after first use (POSIX permission check)'
  : false;

test('the whole flow runs with no key or network, twice in the same directory', { skip: backendRefusedOnWindows }, (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  for (const attempt of [1, 2]) {
    const result = spawnSync(process.execPath, [entry, '--dir', join(directory, 'work')], { cwd: root, encoding: 'utf8', env });
    assert.equal(result.status, 0, `attempt ${attempt}: ${result.stderr}`);
    assert.match(result.stdout, /Refused: Mandate has no confirmed active revision/);
    assert.match(result.stdout, /NOTICE TO AI AGENTS/);
    assert.match(result.stdout, /store-b rejected \(MANDATORY_EVIDENCE_UNKNOWN\), then store-a reserved at S\$7,510\.10/);
    assert.match(result.stdout, /Operation: ordered/);
    assert.match(result.stdout, /PayPal is not in this path yet/);
  }
});
