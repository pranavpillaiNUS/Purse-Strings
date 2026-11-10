import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createMandateDraft } from '../../../services/agent/src/mandate.ts';
import { parseSavedReview } from '../../../services/agent/src/saved-review.ts';
import {
  awaitEnter, checkSummary, childEnvironment, closingStatement, DEFAULT_MODE_STATEMENT, DEMO_SESSION_FILE, demoBackendConfig, demoPlan, dropEchoedRequest, EXECUTION_PROVIDER, formatMinor, MAX_REQUEST_CHARACTERS, readRequestFile,
  revisionSummary, runSandboxPayment, sandboxCredentialRefusal, scriptedDraftCalls, SANDBOX_CREDENTIAL_PROBE_ID, STALE_HOURS,
  storeTable, summarizeTrace, wrapCommand, wrapLine, type DemoSession, type SandboxPaymentBackend, type StoreView,
} from './demo-flow.ts';
import { formatSgd } from './format.ts';
import { PROVIDER_WORDING } from './review-output.ts';

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

test('refused attempts are counted from the trace: every refused result, and nothing else', () => {
  const result = (tool: string, isError: boolean) => JSON.stringify({ type: 'tool_result', tool, isError, content: isError ? '{"error":{"code":"X"}}' : '{}' });
  const text = [result('product.view', false), result('payment_capture', true), result('cart.build', true), result('catalog.search', false)].join('\r\n');
  assert.equal(summarizeTrace(text).refused, 2);
  assert.equal(summarizeTrace('').refused, 0);
  // A claim in the model's words is not a refusal, and neither is the call on its own.
  const said = [JSON.stringify({ type: 'model_turn', text: 'Everything was refused.' }), JSON.stringify({ type: 'tool_call', tool: 'payment_capture', args: {} })].join('\n');
  assert.equal(summarizeTrace(said).refused, 0);
});

test('money on screen matches the shared formatter, which this file cannot import', () => {
  for (const minor of [0, 1, 5, 99, 100, 99999, 100000, 751010, 1_000_000_000, -5, -751010, Number.MAX_SAFE_INTEGER]) {
    assert.equal(formatMinor(minor), formatSgd(minor), String(minor));
  }
});

test('long lines wrap at spaces and keep their indent, and nothing passes the width', () => {
  assert.deepEqual(wrapLine('short'), ['short']);
  assert.deepEqual(wrapLine(''), ['']);
  assert.deepEqual(wrapLine('one two three four', 8), ['one two', 'three', 'four']);
  assert.deepEqual(wrapLine('  one two three four', 10), ['  one two', '  three', '  four']);
  assert.deepEqual(wrapLine('  - one two three', 10), ['  - one', '    two', '    three']);
  assert.deepEqual(wrapLine('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(wrapLine('  abcdefghij kl', 6), ['  abcd', '  efgh', '  ij', '  kl']);
  for (const line of wrapLine(`${'word '.repeat(60)}${'x'.repeat(250)}`)) assert.ok(line.length <= 100, line);
});

test('a wrapped command keeps each flag beside its value', () => {
  const digest = 'a'.repeat(64);
  assert.deepEqual(wrapCommand('npm run backend --', ['mandate-confirm', '--id', 'm', '--revision', '1', '--digest', digest]), [
    `$ npm run backend -- mandate-confirm --id m --revision 1`,
    `    --digest ${digest}`,
  ]);
  assert.deepEqual(wrapCommand('npm run shop --', ['run', '--brief', '--scripted', 'a.json']), ['$ npm run shop -- run --brief --scripted a.json']);
  assert.deepEqual(wrapCommand('x', ['--a', '1', '--bb', '2'], 10), ['$ x --a 1', '    --bb 2']);
  for (const line of wrapCommand('npm run shop --', ['status', '--mandate-id', 'x'.repeat(200)])) assert.ok(line.length <= 100, line);
});

const evidence = (observedAt: string, status = 'supported') => ({ status, observedAt });
const NOW = '2026-11-07T09:00:00.000Z';
const store = (supplierId: string, shippingMinor: number, products: Array<[string, number, number]>, observedAt = NOW): StoreView => ({
  supplierId, shippingMinor,
  delivery: { by: '2026-11-19T09:00:00.000Z', evidence: evidence(observedAt) },
  products: products.map(([sku, unitPriceMinor, availableUnits]) => ({
    sku, unitPriceMinor, availableUnits, productEvidence: evidence(observedAt), stockEvidence: evidence(observedAt),
  })),
});

test('the store table puts the stores side by side, with every thing the panel controls', () => {
  const lines = storeTable([
    store('store-a', 0, [['MON-27-USBC', 27900, 10], ['LAP-14-AIR', 109900, 10]]),
    store('store-b', 6000, [['LAP-14-AIR', 104900, 8], ['LAP-14-PRO', 145000, 20]], '2026-11-04T06:00:00.000Z'),
  ], NOW);
  assert.deepEqual(lines, [
    '  Control panel  store-a                   store-b',
    '  Shipping       S$0.00                    S$60.00',
    '  Delivery by    2026-11-19                2026-11-19',
    '  Records        supported, 0 hours old    supported, 75 hours old',
    '  LAP-14-AIR     S$1,099.00 | 10 in stock  S$1,049.00 | 8 in stock',
    '  LAP-14-PRO     -                         S$1,450.00 | 20 in stock',
    '  MON-27-USBC    S$279.00 | 10 in stock    -',
  ]);
});

test('the store table says when records differ, uses the oldest age, and shows store text inert', () => {
  const mixed = store('store\u001b[2J', 0, [['A', 1, 1]]);
  mixed.products[0]!.stockEvidence = evidence('2026-11-07T08:00:00.000Z', 'unknown');
  const lines = storeTable([mixed], NOW);
  assert.match(lines[3]!, /supported\/unknown, 1 hour old/);
  assert.ok(!lines.join('\n').includes('\u001b'));
});

test('the echoed request goes, and anything else stays exactly as printed', () => {
  const request = 'Equip five hires.';
  const output = ['Mandate draft | digest d', 'Drafted by a model (scripted) from this request:', `  ${request}`, 'Assumptions the model declared:'].join('\r\n');
  assert.equal(dropEchoedRequest(output, request), ['Mandate draft | digest d', 'Drafted by a model (scripted) from the request above.', 'Assumptions the model declared:'].join('\n'));
  // A different text under that heading is not an echo, so a model's own wording is never hidden.
  assert.equal(dropEchoedRequest(output, 'Something else.'), output.replaceAll('\r\n', '\n'));
  assert.equal(dropEchoedRequest(`No draft: failed | x\n  ${request}`, request), `No draft: failed | x\n  ${request}`);
});

test('passing checks share a line, and a failure keeps its full message', () => {
  const pass = (code: string) => ({ status: 'pass', code, message: `${code} must hold` });
  assert.deepEqual(checkSummary({ decision: 'draft_valid', checks: [pass('A'), pass('B')] }), ['draft_valid: 2 of 2 planning checks pass', '  A, B']);
  assert.deepEqual(checkSummary({ decision: 'needs_revision', checks: [pass('A'), { status: 'fail', code: 'B', message: 'B must hold' }] }), [
    'needs_revision: 1 of 2 planning checks pass',
    '  A',
    '  fail B: B must hold',
  ]);
});

test('the revision line comes from the stored record, in S$', () => {
  assert.equal(
    revisionSummary({ budgetMinor: 800000, allowedSuppliers: ['store-a', 'store-b'], requirements: [{ quantity: 5, role: 'laptop' }, { quantity: 5, role: 'monitor' }] }),
    'To confirm: S$8,000.00 all-in | 5 laptop(s), 5 monitor(s) | store-a, store-b',
  );
});

test('the model key reaches only the shopper commands that call a model', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-test', PATH: 'p' };
  assert.equal(childEnvironment('shop', ['run'], env).ANTHROPIC_API_KEY, 'sk-test');
  assert.equal(childEnvironment('shop', ['draft'], env).ANTHROPIC_API_KEY, 'sk-test');
  assert.equal(childEnvironment('shop', ['status'], env).ANTHROPIC_API_KEY, undefined);
  assert.equal(childEnvironment('shop', ['review'], env).ANTHROPIC_API_KEY, undefined);
  assert.equal(childEnvironment('backend', ['audit'], env).ANTHROPIC_API_KEY, undefined);
  assert.equal(childEnvironment('main', ['store'], env).ANTHROPIC_API_KEY, undefined);
  assert.equal(childEnvironment('main', ['store'], env).PATH, 'p');
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-test', 'The caller keeps its own copy');
});

test('PayPal details reach only the backend, so the shopper can still start beside them', () => {
  const env = { PATH: 'p', PAYPAL_CLIENT_ID: 'id', PayPal_Client_Secret: 'secret' };
  const backend = childEnvironment('backend', ['operation-run'], env);
  assert.equal(backend.PAYPAL_CLIENT_ID, 'id');
  assert.equal(backend.PayPal_Client_Secret, 'secret');
  for (const [entry, args] of [['shop', ['run']], ['shop', ['draft']], ['shop', ['status']], ['shop', ['review']], ['main', ['store']]] as const) {
    assert.deepEqual(childEnvironment(entry, args, env), { PATH: 'p' }, `${entry} ${args[0]}`);
  }
  assert.equal(env.PAYPAL_CLIENT_ID, 'id', 'The caller keeps its own copy');
});

test('one constant labels who executes, and the screen still says this is not PayPal', () => {
  const source = readFileSync(entry, 'utf8');
  const block = /export const EXECUTION_PROVIDER = \{[\s\S]*?\} as const;/.exec(source);
  assert.ok(block);
  assert.doesNotMatch(source.replace(block[0], ''), /fake provider|fake payment|fake order/i);
  assert.match(EXECUTION_PROVIDER.statement, /not PayPal and not a real order/);
  // The review's own wording is a second place, because this file cannot import it. Both say fake today.
  assert.match(EXECUTION_PROVIDER.label, /fake/);
  assert.match(PROVIDER_WORDING.payment, /fake/);
  assert.match(source, /Change the two together/);
  // A default run is a simulation, and still says the sandbox path exists behind its flag.
  assert.ok(DEFAULT_MODE_STATEMENT.includes(EXECUTION_PROVIDER.label));
  assert.match(DEFAULT_MODE_STATEMENT, /no real money/);
  assert.match(DEFAULT_MODE_STATEMENT, /--sandbox-paypal .*PayPal sandbox/);
});

test('the runner holds nothing: it imports only Node built-ins and starts each command separately', () => {
  const source = readFileSync(entry, 'utf8');
  const imports = [...source.matchAll(/^import .*? from '([^']+)'/gm)].map(([, name]) => name!);
  assert.ok(imports.length > 0);
  assert.deepEqual(imports.filter((name) => !name.startsWith('node:')), []);
  assert.doesNotMatch(source, /import\(/);
});

test('documented backend state has its own folder, so running this flow first cannot get it refused', () => {
  // The flow creates .runtime/ as an ordinary folder, and the backend refuses an existing
  // folder it did not make private. .runtime/backend/ is one the backend creates itself.
  const config = read('services/agent/fixtures/backend-demo-config.json') as { fakeProviderDb: string };
  assert.equal(config.fakeProviderDb, '../../../.runtime/backend/providers.db');
  for (const doc of ['README.md', 'docs/backend-api.md', 'docs/backend-delivery-review.md']) {
    assert.doesNotMatch(readFileSync(join(root, doc), 'utf8'), /\.runtime\/app\.db/, doc);
  }
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
  assert.equal(existsSync(join(directory, 'session.json')), false, 'nothing is written into a folder it refused');
});

test('a previous sandbox demo keeps its ledger and intents on flagged and unflagged reruns', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-keep-sandbox-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const savedBy of ['config', 'marker'] as const) {
    const work = join(directory, savedBy);
    mkdirSync(join(work, 'runtime'), { recursive: true });
    writeFileSync(join(work, '.splittap-demo'), '');
    // Older releases wrote only config. New releases also keep a marker, so
    // losing or editing config cannot erase the evidence that this was sandbox.
    const config = savedBy === 'config' ? '{"version":1,"paymentProvider":"paypal-sandbox"}' : '{"version":1}';
    writeFileSync(join(work, 'config.json'), config);
    if (savedBy === 'marker') writeFileSync(join(work, '.splittap-demo-paypal'), '');
    const files = [
      ['runtime/app.db', 'ledger with unresolved capture'],
      ['runtime/app.db-wal', 'capture intent not checkpointed'],
      ['runtime/providers.db', 'supplier order facts'],
      ['recovery.jsonl', 'operation id and original cart'],
    ] as const;
    for (const [path, value] of files) writeFileSync(join(work, path), value);
    for (const flags of [[], ['--sandbox-paypal']]) {
      const result = spawnSync(process.execPath, [entry, ...flags, '--dir', work], {
        cwd: root, encoding: 'utf8', input: '',
      });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, '', 'refuse before any scene or backend command');
      assert.match(result.stderr, /PayPal sandbox recovery state/);
      assert.match(result.stderr, /backend status and operation-reconcile/);
      assert.match(result.stderr, /fresh --dir/);
      assert.equal(readFileSync(join(work, 'config.json'), 'utf8'), config);
      for (const [path, value] of files) assert.equal(readFileSync(join(work, path), 'utf8'), value);
    }
  }
});

test('a markerless legacy sandbox ledger survives reruns after config changes to fake', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-keep-legacy-sandbox-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const evidence of ['binding', 'operation_reserved', 'payment_provider_selected'] as const) {
    const work = join(directory, evidence);
    mkdirSync(join(work, 'runtime'), { recursive: true });
    writeFileSync(join(work, '.splittap-demo'), '');
    const config = '{"version":1,"paymentProvider":"fake"}';
    writeFileSync(join(work, 'config.json'), config);
    const ledger = join(work, 'runtime', 'app.db');
    const database = new DatabaseSync(ledger);
    try {
      // The storage inspected by the operator script, with the same table and
      // column names as a legacy ledger. No account or external call is involved.
      database.exec(`
        CREATE TABLE operation_paypal_bindings (operation_id TEXT PRIMARY KEY);
        CREATE TABLE audit_events (kind TEXT, event_json TEXT);
        CREATE TABLE effects (kind TEXT, provider_id TEXT);
      `);
      if (evidence === 'binding') {
        database.prepare('INSERT INTO operation_paypal_bindings VALUES (?)').run('unsettled-sandbox-operation');
      } else {
        database.prepare('INSERT INTO audit_events VALUES (?, ?)').run(evidence, '{"paymentProvider":"paypal-sandbox"}');
      }
    } finally { database.close(); }
    const original = readFileSync(ledger);
    for (const flags of [[], ['--sandbox-paypal']]) {
      const result = spawnSync(process.execPath, [entry, ...flags, '--dir', work], { cwd: root, encoding: 'utf8', input: '' });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, '', 'refuse before any scene or backend command');
      assert.match(result.stderr, /PayPal sandbox recovery state/);
      assert.match(result.stderr, /fresh --dir/);
      assert.deepEqual(readFileSync(ledger), original, 'the read-only inspection must leave recovery facts unchanged');
      assert.equal(readFileSync(join(work, 'config.json'), 'utf8'), config);
    }
  }
});

test('unverifiable prior runtime state is preserved when config or ledger cannot be classified', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-keep-unclassified-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [index, savedConfig] of [undefined, 'not JSON', '{"version":1,"paymentProvider":"unknown"}', '{"version":1,"paymentProvider":"fake"}'].entries()) {
    const work = join(directory, String(index));
    mkdirSync(join(work, 'runtime'), { recursive: true });
    writeFileSync(join(work, '.splittap-demo'), '');
    if (savedConfig !== undefined) writeFileSync(join(work, 'config.json'), savedConfig);
    const ledger = join(work, 'runtime', 'app.db');
    writeFileSync(ledger, 'keep existing recovery state');
    const result = spawnSync(process.execPath, [entry, '--dir', work], { cwd: root, encoding: 'utf8', input: '' });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /PayPal sandbox recovery state/);
    assert.equal(readFileSync(ledger, 'utf8'), 'keep existing recovery state');
    if (savedConfig !== undefined) assert.equal(readFileSync(join(work, 'config.json'), 'utf8'), savedConfig);
  }
});

test('closed input stops the flow at the first prompt, so nothing is confirmed', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-eof-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [entry, '--pause', '--dir', join(directory, 'work')], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Input closed before Enter was pressed/);
  assert.doesNotMatch(result.stdout, /Confirmed by OS user/);
  assert.doesNotMatch(result.stdout, /Operation: ordered/);
  // The dashboard follows the session file, so it says where and why the flow stopped.
  const session = JSON.parse(readFileSync(join(directory, 'work', 'session.json'), 'utf8')) as DemoSession;
  assert.equal(session.scene, 1);
  assert.match(session.failure ?? '', /Input closed before Enter was pressed/);
  assert.equal(session.waiting, null);
  assert.equal(session.finished, false);
  assert.equal(session.mandate, null);
});

test('input that closes at the confirmation prompt stops the flow before anything is confirmed', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-eof-confirm-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // Enter for scene 2 and scene 3, then nothing for the operator's own prompt.
  const result = spawnSync(process.execPath, [entry, '--pause', '--dir', join(directory, 'work')], {
    cwd: root, encoding: 'utf8', input: '\n\n',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /You are the operator\. Press Enter to confirm this exact digest/);
  assert.match(result.stderr, /Input closed before Enter was pressed/);
  assert.doesNotMatch(result.stdout, /Confirmed by OS user/);
});

test('input that closes at the last prompt still shows the result, because nothing is left to confirm', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-eof-last-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // Enter for scenes 2 to 6 and the operator's prompt, then nothing for the last prompt.
  const result = spawnSync(process.execPath, [entry, '--pause', '--dir', join(directory, 'work')], {
    cwd: root, encoding: 'utf8', input: '\n'.repeat(6),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Press Enter for the result/);
  assert.match(result.stdout, /Operation: ordered/);
  assert.match(result.stdout, /=== Result ===/);
  assert.doesNotMatch(result.stderr, /Input closed/);
});

test('input not ready yet gets a rest between reads, and only a real Enter or a closed input ends the wait', () => {
  const notReady = Object.assign(new Error('not ready'), { code: 'EAGAIN' });
  const reader = (steps: Array<Error | string | null>) => (buffer: Buffer): number => {
    const step = steps.shift();
    if (step === undefined) throw new Error('Read past the end of the script');
    if (step instanceof Error) throw step;
    if (step === null) return 0;
    buffer.write(step);
    return 1;
  };
  let rests = 0;
  const rest = () => { rests += 1; };
  assert.equal(awaitEnter(reader([notReady, notReady, 'x', notReady, '\n']), rest), true);
  assert.equal(rests, 3, 'every read that found nothing is followed by a rest');
  assert.equal(awaitEnter(reader(['x', null]), rest), false);
  assert.equal(awaitEnter(reader([Object.assign(new Error('gone'), { code: 'EOF' })]), rest), false);
  assert.equal(rests, 3, 'closed input does not rest');
  const started = Date.now();
  assert.equal(awaitEnter(reader([notReady, '\n'])), true);
  assert.ok(Date.now() - started >= 25, 'the real rest takes time');
});

test('the whole flow runs with no key or network, twice in the same directory', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // A PayPal name in the terminal must not stop the shopper, which refuses to start beside one.
  const env: NodeJS.ProcessEnv = { ...process.env, PAYPAL_CLIENT_ID: 'dummy-not-a-credential' };
  delete env.ANTHROPIC_API_KEY;
  const work = join(directory, 'work');
  for (const attempt of [1, 2]) {
    const result = spawnSync(process.execPath, [entry, '--dir', work], { cwd: root, encoding: 'utf8', env });
    assert.equal(result.status, 0, `attempt ${attempt}: ${result.stderr}`);
    const { stdout } = result;
    assert.match(stdout, /Control panel +store-a +store-b/);
    assert.match(stdout, /budget: S\$8,000\.00 \(all-in\)/);
    assert.match(stdout, /cap: S\$1,200\.00 each/);
    assert.match(stdout, /Assumptions the model declared/);
    assert.match(stdout, /Asked for but NOT captured in this draft/);
    assert.match(stdout, /Refused: Mandate has no confirmed active revision/);
    assert.match(stdout, /NOTICE TO AI AGENTS/);
    assert.match(stdout, /x refused: The shopper has no such tool\./);
    assert.doesNotMatch(stdout, /calls obeying it/);
    assert.match(stdout, new RegExp(`records are now ${STALE_HOURS} hours old`));
    assert.match(stdout, new RegExp(`Policy allows ${policy.evidenceMaxAgeHours},`));
    assert.match(stdout, /store-b +recovery-cart-1 +S\$7,248\.50 +Rejected/);
    assert.match(stdout, /store-a +recovery-cart-2 +S\$7,510\.10 +Reserved +S\$7,510\.10/);
    assert.match(stdout, /Recovery: store-b rejected, then store-a reserved/);
    assert.match(stdout, /Operation: ordered/);
    assert.match(stdout, /Fake payment +succeeded/);
    assert.match(stdout, /Fake order +succeeded/);
    assert.match(stdout, /Readiness +not assessed/);
    assert.match(stdout, /this is not PayPal and not a real order/);
    // Opening and closing line; it can wrap, so compare with whitespace collapsed.
    assert.equal(stdout.replace(/\s+/g, ' ').split(DEFAULT_MODE_STATEMENT).length - 1, 2);
    assert.doesNotMatch(stdout, /not in this path yet/, 'PayPal is opt-in, not absent');
    // Default mode: byte-for-byte the pre-sandbox flow. No provider flag on the config,
    // no hold command, nothing of the sandbox purchase path on screen.
    assert.doesNotMatch(stdout, /operation-authorize|paypal-sandbox/i);
    const generatedConfig = JSON.parse(readFileSync(join(work, 'config.json'), 'utf8')) as Record<string, unknown>;
    assert.equal('paymentProvider' in generatedConfig, false);
    const flowSession = JSON.parse(readFileSync(join(work, DEMO_SESSION_FILE), 'utf8')) as DemoSession;
    assert.deepEqual([flowSession.finished, flowSession.unusable], [true, []], 'a usable take records no unusable reasons');

    // The count on screen is the trace's, so it cannot drift from what the run recorded.
    const { refused, accepted } = summarizeTrace(readFileSync(join(work, 'compromised.jsonl'), 'utf8'));
    assert.ok(refused > 0);
    assert.deepEqual(accepted, []);
    assert.match(stdout, new RegExp(`Refused attempts: ${refused} \\(each one is shown above\\)`));
    assert.match(stdout, new RegExp(`Hostile listing: ${refused} attempts refused, nothing reserved`));

    const compromised = parseSavedReview(JSON.parse(readFileSync(join(work, 'compromised.review.json'), 'utf8')));
    const savedRecoveryPath = join(work, 'recovery.review.json');
    const savedRecovery = parseSavedReview(JSON.parse(readFileSync(savedRecoveryPath, 'utf8')));
    assert.equal(compromised.kind, 'saved-shop-review');
    assert.equal(savedRecovery.kind, 'saved-shop-review');
    if (compromised.kind !== 'saved-shop-review' || savedRecovery.kind !== 'saved-shop-review') assert.fail('Expected saved run reviews');
    assert.equal(compromised.review.refusals.length, refused);
    assert.equal(compromised.review.decisions.filter(({ decision }) => decision === 'accepted').length, 0);
    assert.deepEqual(savedRecovery.review.decisions.map(({ decision }) => decision), ['rejected', 'accepted']);
    assert.equal(savedRecovery.review.budget.source, 'ledger');
    assert.equal(savedRecovery.review.budget.committedMinor, 0);
    assert.equal(savedRecovery.review.budget.reservedMinor, 751010);
    const recordedOperation = savedRecovery.review.decisions[1]!.operation!;
    assert.equal(recordedOperation.status, 'reserved', 'the saved shopper review predates scene 6 execution');
    assert.equal(recordedOperation.paymentStatus, 'not_started');
    assert.equal(recordedOperation.orderStatus, 'not_started');
    assert.equal(recordedOperation.paymentProvider, 'fake');
    const replay = spawnSync(process.execPath, [join(root, 'apps/cli/src/shop.ts'), 'review', '--file', savedRecoveryPath, '--brief'], {
      cwd: root, encoding: 'utf8', env: childEnvironment('shop', ['review'], env),
    });
    assert.equal(replay.status, 0, replay.stderr);
    assert.match(replay.stdout, /HISTORICAL REVIEW/);
    assert.match(replay.stdout, /S\$7,510\.10/);
    assert.doesNotMatch(replay.stdout, /operation-run|operation-authorize|operation-complete-authorization|Run the shopper again/);

    // Brief, so the recording does not repeat itself or wrap a long command.
    assert.doesNotMatch(stdout, /^Usage:|Model summary|operation-run --id \S+\s+--db/m);
    assert.doesNotMatch(stdout, /\bheld\b/);
    // Nothing identifying, even with --dir outside the repository, and nothing too wide.
    assert.ok(!stdout.includes(directory), 'The work directory path must not reach the screen');
    assert.ok(!stdout.includes(root.replace(/[\\/]$/, '')), 'The repository path must not reach the screen');
    for (const line of stdout.split(/\r?\n/)) assert.ok(line.length <= 100, `${line.length} columns: ${line}`);
  }
});

const baseConfig = { policyFile: 'p.json', catalogFiles: ['a.json', 'b.json'], fakeProviderDb: 'providers.db' };

test('the generated backend config gains the sandbox provider only when the flag asks for it', () => {
  assert.deepEqual(demoBackendConfig(baseConfig), {
    version: 1, policyFiles: ['p.json'], catalogFiles: ['a.json', 'b.json'], fakeProviderDb: 'providers.db',
  });
  assert.deepEqual(demoBackendConfig({ ...baseConfig, paymentProvider: 'paypal-sandbox' }), {
    version: 1, policyFiles: ['p.json'], catalogFiles: ['a.json', 'b.json'], fakeProviderDb: 'providers.db',
    paymentProvider: 'paypal-sandbox',
  });
});

test('the sandbox credential probe id satisfies the binding identity limits; no PayPal request is sent', () => {
  assert.ok(SANDBOX_CREDENTIAL_PROBE_ID.length > 0 && SANDBOX_CREDENTIAL_PROBE_ID.length <= 100);
  assert.match(SANDBOX_CREDENTIAL_PROBE_ID, /^[A-Za-z0-9_-]+$/);
});

test('the loader\'s credential refusals map to operator guidance, other stderr does not', () => {
  assert.match(sandboxCredentialRefusal('backend: Sandbox credentials are not configured: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must come from the process environment or the invocation directory .env') ?? '', /^Add the sandbox PayPal keys/);
  assert.match(sandboxCredentialRefusal('backend: Only the sandbox PayPal environment is supported in this stage; PAYPAL_ENV was not "sandbox"') ?? '', /not the PayPal sandbox/);
  assert.equal(sandboxCredentialRefusal('backend: Operation was not found'), null);
  // No value ever rides through, only names.
  assert.doesNotMatch(sandboxCredentialRefusal('backend: Sandbox credentials are not configured: PAYPAL_CLIENT_ID values stay out') ?? '', /SECRET=.|secret./);
});

// An offline fake runner stands in for the spawned backend: no network anywhere. The
// whole-flow sandbox run needs a browser and real sandbox credentials, so the wiring is
// proven here instead; the spawn tests cover flag-default equality and the early abort.
function fakeBackend(
  authorize: SandboxPaymentBackend['authorize'],
  complete: SandboxPaymentBackend['complete'],
  execute: SandboxPaymentBackend['execute'],
): SandboxPaymentBackend {
  return { authorize, complete, execute };
}

test('(offline fake runner) the sandbox scene runs hold, buyer wait, completion, execution, in that order', async () => {
  const order: string[] = [];
  const output: string[] = [];
  const step = (name: string, data: Record<string, unknown>) => async () => {
    order.push(name);
    return { ok: true as const, data };
  };
  const result = await runSandboxPayment({
    backend: fakeBackend(
      step('authorize', { approvalUrl: 'https://www.sandbox.paypal.com/mock/approve' }),
      step('complete', { authorizationId: 'AUTHDEMO1' }),
      step('execute', { paymentProvider: 'paypal-sandbox', operation: { status: 'ordered' }, providerIds: { authorizationId: 'AUTHDEMO1', captureId: 'CAPDEMO1' } }),
    ),
    operationId: 'op-demo-1',
    waitForBuyer: () => { order.push('buyer'); },
    print: (line) => output.push(line),
  });
  assert.deepEqual(order, ['authorize', 'buyer', 'complete', 'execute']);
  assert.equal(result.status, 'ordered');
  assert.deepEqual([result.authorizationId, result.captureId], ['AUTHDEMO1', 'CAPDEMO1']);
  const screen = output.join('\n');
  assert.match(screen, /https:\/\/www\.sandbox\.paypal\.com\/mock\/approve/);
  assert.match(screen, /Payment provider: paypal-sandbox/);
  assert.match(screen, /authorizationId=AUTHDEMO1 captureId=CAPDEMO1/);
  assert.match(screen, /supplier order stayed simulated \(fake\)/);
  assert.match(screen, /never real money/);
});

test('(offline fake runner) an unapproved buyer prints the backend message as-is and nothing executes', async () => {
  const order: string[] = [];
  const output: string[] = [];
  const refused = {
    ok: false as const,
    stderr: 'backend: The sandbox buyer has not approved this hold yet',
  };
  let conclusion: unknown;
  try {
    await runSandboxPayment({
      backend: fakeBackend(
        async () => { order.push('authorize'); return { ok: true as const, data: { approvalUrl: 'https://www.sandbox.paypal.com/mock/approve' } }; },
        async () => { order.push('complete'); return refused; },
        async () => { order.push('execute'); return { ok: true as const, data: {} }; },
      ),
      operationId: 'op-demo-2',
      waitForBuyer: () => { order.push('buyer'); },
      print: (line) => output.push(line),
    });
  } catch (error) { conclusion = error; }
  assert.ok(conclusion instanceof Error);
  assert.ok((conclusion as Error).message.includes('The sandbox buyer has not approved this hold yet'),
    (conclusion as Error).message);
  assert.deepEqual(order, ['authorize', 'buyer', 'complete']);
  assert.match(output.join('\n'), /The sandbox buyer has not approved this hold yet/);
});

test('(offline fake runner) the flow stops loudly when the operation does not end ordered', async () => {
  await assert.rejects(
    runSandboxPayment({
      backend: fakeBackend(
        async () => ({ ok: true as const, data: { approvalUrl: 'https://www.sandbox.paypal.com/mock/approve' } }),
        async () => ({ ok: true as const, data: { authorizationId: 'AUTHDEMO1' } }),
        async () => ({ ok: true as const, data: { paymentProvider: 'paypal-sandbox', operation: { status: 'reconciliation_required' } } }),
      ),
      operationId: 'op-demo-3',
      waitForBuyer: () => {},
      print: () => {},
    }),
    /ended as "reconciliation_required"/,
  );
});

test('the sandbox flag aborts before anything is reserved when the credentials are absent', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-sandbox-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // PAYPAL_ENV=live makes the backend's credential loader refuse deterministically,
  // even on a machine whose .env carries real sandbox keys, and it refuses before the
  // probe would ever reach the network: the spawn stays offline.
  const env: NodeJS.ProcessEnv = { ...process.env, PAYPAL_ENV: 'live' };
  delete env.ANTHROPIC_API_KEY;
  const work = join(directory, 'work');
  const result = spawnSync(process.execPath, [entry, '--sandbox-paypal', '--dir', work], {
    cwd: root, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 1, result.stderr);
  const combined = result.stdout + result.stderr;
  assert.match(combined, /Sandbox mode stopped after store setup and before any reservation/);
  assert.match(combined, /not the PayPal sandbox/);
  // The generated config did ask for the sandbox provider, and nothing was reserved.
  const generatedConfig = JSON.parse(readFileSync(join(work, 'config.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(generatedConfig.paymentProvider, 'paypal-sandbox');
  assert.equal(readFileSync(join(work, '.splittap-demo-paypal'), 'utf8'), '',
    'sandbox recovery protection exists even when the credential probe stops before reservation');
  assert.ok(!/Recovery: |Operation: ordered|Attempted/.test(result.stdout), result.stdout);
});

test('the closing line claims a payment only when scene 6 executed one', () => {
  const skippedSandbox = closingStatement(true, false);
  const skippedDefault = closingStatement(false, false);
  for (const line of [skippedSandbox, skippedDefault]) {
    assert.match(line, /nothing was reserved/);
    assert.doesNotMatch(line, /went through|pays over|Scene 6 pays/);
  }
  assert.match(skippedSandbox, /no PayPal sandbox hold or capture was attempted/);
  assert.match(closingStatement(true, true), /hold and capture went through the PayPal sandbox/);
  assert.equal(closingStatement(false, true), DEFAULT_MODE_STATEMENT);
});

// What follows stands in for sandbox takes, offline. A preload rewrites the flow's live
// shopper commands to scripted ones and answers the credential probe as a backend with
// keys would. It logs every payment command, then refuses it, or returns the canned
// reply a test supplies. No model, key, PayPal request or browser is involved.
const PAYMENT_STUB_PRELOAD = String.raw`
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const original = childProcess.spawnSync;
const stub = JSON.parse(process.env.SPLITTAP_TEST_FLOW_STUB);
const reply = (status, stderr) => ({ pid: 0, output: [null, '', stderr], stdout: '', stderr, status, signal: null });
childProcess.spawnSync = (command, args = [], options = {}) => {
  const [script, ...rest] = args;
  const entry = typeof script === 'string' ? basename(script) : '';
  if (entry === 'backend.ts') {
    const action = rest.find((arg) => /^operation-(authorize|complete-authorization|run)$/.test(arg));
    const id = rest[rest.indexOf('--id') + 1];
    if (action === 'operation-authorize' && id === stub.probeId) return reply(2, 'backend: Operation was not found\n');
    if (action !== undefined) {
      appendFileSync(stub.paymentLog, action + ' ' + id + '\n');
      const canned = stub.paymentReplies?.[action];
      if (canned === undefined) return reply(1, 'test stub: payment commands are refused here\n');
      const stdout = JSON.stringify(canned);
      return { pid: 0, output: [null, stdout, ''], stdout, stderr: '', status: 0, signal: null };
    }
  }
  if (entry === 'shop.ts' && !rest.includes('--scripted')) {
    if (rest[0] === 'draft') {
      const request = resolve(options.cwd ?? '.', rest[rest.indexOf('--text-file') + 1]);
      return original(command, [...args, '--scripted', resolve(dirname(request), 'draft-calls.json')], options);
    }
    if (rest[0] === 'run') {
      const runId = rest[rest.indexOf('--run-id') + 1];
      return original(command, [...args, '--scripted', stub.scripts[runId]], options);
    }
  }
  return original(command, args, options);
};
syncBuiltinESMExports();
`;

test('a live sandbox take that reserves nothing reports no hold or capture, and runs no payment command', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-skipped-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preload = join(directory, 'stub.mjs');
  writeFileSync(preload, PAYMENT_STUB_PRELOAD);
  const recovery = read('services/agent/fixtures/recovery-shopping-calls.json') as Array<{ tool: string }>;
  // Store-b is rejected as stale, and the stand-in stops instead of recovering at store-a.
  const noRecovery = recovery.slice(0, recovery.findIndex(({ tool }) => tool === 'cart.submit') + 1);
  const scripts = { 'hostile-check': join(directory, 'hostile-check.json'), recovery: join(directory, 'no-recovery.json') };
  writeFileSync(scripts['hostile-check'], JSON.stringify(recovery.slice(0, 1)));
  writeFileSync(scripts.recovery, JSON.stringify(noRecovery));
  const paymentLog = join(directory, 'payment-commands.log');
  // PAYPAL_ENV=live makes any credential load refuse before the network, as a second guard.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PAYPAL_ENV: 'live',
    SPLITTAP_TEST_FLOW_STUB: JSON.stringify({ probeId: SANDBOX_CREDENTIAL_PROBE_ID, paymentLog, scripts }),
  };
  delete env.ANTHROPIC_API_KEY;
  const work = join(directory, 'work');
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, entry, '--live', '--sandbox-paypal', '--dir', work], {
    cwd: root, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  const screen = result.stdout.replace(/\s+/g, ' ');
  assert.match(screen, /store-b +recovery-cart-1 +S\$7,248\.50 +Rejected/);
  assert.match(screen, /Execution: skipped, because nothing was reserved/);
  assert.match(screen, /Not a usable take: .*nothing was reserved/);
  assert.ok(screen.includes(closingStatement(true, false)), result.stdout);
  assert.doesNotMatch(screen, /went through the PayPal sandbox|real PayPal SANDBOX capture|Payment provider:/);
  assert.equal(existsSync(paymentLog), false, 'no hold, completion or execution command ran');
  const session = JSON.parse(readFileSync(join(work, DEMO_SESSION_FILE), 'utf8')) as DemoSession;
  assert.deepEqual(session.operationIds, []);
  assert.ok(session.results.includes('Execution: skipped, because nothing was reserved'), session.results.join('\n'));
  // The dashboard shows the same reasons the terminal printed, not a clean finish.
  assert.equal(session.finished, true);
  assert.ok(session.unusable.includes('The model did not recover: nothing was reserved'), session.unusable.join('\n'));
});

test('both recording commands wait for every Enter in order, and pay only the reserved operation', (t) => {
  // The Nov 9 sandbox rehearsal left out --pause, so this is the recording command's only
  // full run: eight Enters, with PayPal's replies canned by the preload.
  const directory = mkdtempSync(join(tmpdir(), 'splittap-demo-recording-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preload = join(directory, 'stub.mjs');
  writeFileSync(preload, PAYMENT_STUB_PRELOAD);
  const recovery = read('services/agent/fixtures/recovery-shopping-calls.json') as Array<{ tool: string }>;
  const scripts = { 'hostile-check': join(directory, 'hostile-check.json'), recovery: join(root, 'services/agent/fixtures/recovery-shopping-calls.json') };
  writeFileSync(scripts['hostile-check'], JSON.stringify(recovery.slice(0, 1)));
  const paymentReplies = {
    'operation-authorize': { approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=TESTONLY' },
    'operation-complete-authorization': { authorizationId: 'AUTHTEST1' },
    'operation-run': { paymentProvider: 'paypal-sandbox', operation: { status: 'ordered' }, providerIds: { authorizationId: 'AUTHTEST1', captureId: 'CAPTEST1' } },
  };
  const next = 'Press Enter for the next scene';
  const expectedPrompts = [
    next, next, 'You are the operator. Press Enter to confirm this exact digest', next, next, next,
    'The sandbox buyer has approved the hold; press Enter to complete it', 'Press Enter for the result',
  ];
  for (const live of [false, true]) {
    const paymentLog = join(directory, `payments-${live}.log`);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PAYPAL_ENV: 'live',
      SPLITTAP_TEST_FLOW_STUB: JSON.stringify({ probeId: SANDBOX_CREDENTIAL_PROBE_ID, paymentLog, scripts, paymentReplies }),
    };
    delete env.ANTHROPIC_API_KEY;
    const work = join(directory, `take-${live}`);
    const flags = [...(live ? ['--live'] : []), '--pause', '--sandbox-paypal', '--dir', work];
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, entry, ...flags], {
      cwd: root, encoding: 'utf8', env, input: '\n'.repeat(expectedPrompts.length),
    });
    const session = JSON.parse(readFileSync(join(work, DEMO_SESSION_FILE), 'utf8')) as DemoSession;
    // A scripted stand-in writes no summary, so the live take's only problem is the flag check.
    assert.deepEqual(session.unusable, live ? ['Claude did not flag the hostile listing in its summary'] : []);
    assert.equal(result.status, live ? 2 : 0, `${flags.join(' ')}\n${result.stdout}\n${result.stderr}`);
    const prompts = [...result.stdout.matchAll(/\[([^\]\n]*Press Enter[^\]\n]*|[^\]\n]*press Enter[^\]\n]*)\]/g)].map(([, prompt]) => prompt);
    assert.deepEqual(prompts, expectedPrompts);
    const [operationId] = session.operationIds;
    assert.ok(operationId);
    assert.equal(readFileSync(paymentLog, 'utf8'),
      ['operation-authorize', 'operation-complete-authorization', 'operation-run'].map((action) => `${action} ${operationId}\n`).join(''));
    const screen = result.stdout.replace(/\s+/g, ' ');
    assert.match(screen, /checkoutnow\?token=TESTONLY/);
    assert.match(screen, /Sandbox ids: authorizationId=AUTHTEST1 captureId=CAPTEST1/);
    assert.ok(screen.includes(closingStatement(true, true)), result.stdout);
    assert.deepEqual([session.finished, session.waiting, session.failure], [true, null, null]);
  }
});

test('the sandbox scene never describes a fake or unlabelled execution as a sandbox capture', async () => {
  for (const paymentProvider of ['fake', undefined]) {
    const output: string[] = [];
    await assert.rejects(runSandboxPayment({
      backend: fakeBackend(
        async () => ({ ok: true as const, data: { approvalUrl: 'https://www.sandbox.paypal.com/mock/approve' } }),
        async () => ({ ok: true as const, data: { authorizationId: 'AUTHDEMO1' } }),
        async () => ({ ok: true as const, data: { paymentProvider, operation: { status: 'ordered' } } }),
      ),
      operationId: 'op-mismatched-provider', waitForBuyer: () => {}, print: (line) => output.push(line),
    }), /did not report paypal-sandbox/);
    assert.doesNotMatch(output.join('\n'), /real PayPal SANDBOX capture/);
  }
});

test('a request file gives its trimmed text, and refuses empty, oversized or missing files', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'splittap-request-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = (name: string, text: string): string => { const path = join(dir, name); writeFileSync(path, text); return path; };
  assert.equal(readRequestFile(file('ok.txt', '  Equip three designers.\r\n')), 'Equip three designers.');
  assert.throws(() => readRequestFile(file('empty.txt', ' \n ')), /empty/);
  assert.throws(() => readRequestFile(file('long.txt', 'x'.repeat(MAX_REQUEST_CHARACTERS + 1))), /1,000 characters/);
  assert.equal([...readRequestFile(file('max.txt', 'é'.repeat(MAX_REQUEST_CHARACTERS)))].length, MAX_REQUEST_CHARACTERS);
  assert.throws(() => readRequestFile(join(dir, 'missing.txt')), /could not be read/);
});

test('--request-file without --live stops before anything is created', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'splittap-request-scripted-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const request = join(dir, 'request.txt');
  writeFileSync(request, 'Equip two analysts.');
  const work = join(dir, 'work');
  const result = spawnSync(process.execPath, [entry, '--request-file', request, '--dir', work], { cwd: root, encoding: 'utf8', input: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only used with --live/);
  assert.equal(existsSync(work), false);
});

test('a live take writes the request file text to request.txt', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'splittap-request-live-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const preload = join(dir, 'stub.mjs');
  writeFileSync(preload, PAYMENT_STUB_PRELOAD);
  const recovery = read('services/agent/fixtures/recovery-shopping-calls.json') as Array<{ tool: string }>;
  const scripts = { 'hostile-check': join(dir, 'hostile-check.json'), recovery: join(root, 'services/agent/fixtures/recovery-shopping-calls.json') };
  writeFileSync(scripts['hostile-check'], JSON.stringify(recovery.slice(0, 1)));
  const request = join(dir, 'typed.txt');
  writeFileSync(request, '  Equip five engineering hires with approved laptops and monitors within S$8,000.  \n');
  const env: NodeJS.ProcessEnv = { ...process.env, SPLITTAP_TEST_FLOW_STUB: JSON.stringify({ probeId: SANDBOX_CREDENTIAL_PROBE_ID, paymentLog: join(dir, 'payments.log'), scripts }) };
  delete env.ANTHROPIC_API_KEY;
  const work = join(dir, 'take');
  spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, entry, '--live', '--request-file', request, '--dir', work], { cwd: root, encoding: 'utf8', env, input: '' });
  assert.equal(readFileSync(join(work, 'request.txt'), 'utf8').trim(), 'Equip five engineering hires with approved laptops and monitors within S$8,000.');
});
