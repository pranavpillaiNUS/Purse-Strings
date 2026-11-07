import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createWindowsPrivateDirectory, evaluateDirectorySecurity, readWindowsSecurity } from './windows-acl.ts';

const isWindows = process.platform === 'win32';
const windowsOnly = isWindows ? false : 'Windows access rules only';

/** The real access boundary: mode bits on POSIX, the security descriptor on Windows. */
function accessFingerprint(path: string): number | string {
  return isWindows ? readWindowsSecurity(path).sddl : statSync(path).mode & 0o777;
}

function makeUnsafeDirectory(path: string): void {
  mkdirSync(path, { mode: 0o700 });
  // A real grant, not a mode number: Everyone may read.
  if (isWindows) execFileSync('icacls', [path, '/grant', '*S-1-1-0:(OI)(CI)R'], { stdio: 'ignore' });
  else chmodSync(path, 0o755); // umask-independent: the assertion pins 0o755 exactly
}

function makePrivateDirectory(path: string): void {
  if (isWindows) createWindowsPrivateDirectory(path);
  else mkdirSync(path, { mode: 0o700 });
}

function assertOwnerOnlyOnWindows(path: string): void {
  const { sddl, userSid } = readWindowsSecurity(path);
  assert.equal(evaluateDirectorySecurity(sddl, userSid), 'ok', sddl);
}

// Backend operator/RPC CLI contract: every step here is a FRESH node process.
// The synthetic fixture data uses dates relative to the real current time so
// the walkthrough does not rot with historical fixture dates.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = join(root, 'apps/cli/src/backend.ts');

function runBackend(args: readonly string[], input?: string): {
  status: number; stdout: string; stderr: string;
} {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, input, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function singleJsonLine(stdout: string, label: string): unknown {
  const lines = stdout.trim().split('\n').filter((line) => line.length > 0);
  assert.equal(lines.length, 1, `${label}: exactly one JSON response line is expected: ${stdout}`);
  return JSON.parse(lines[0]!);
}

interface BackendFixture {
  directory: string;
  dbPath: string;
  configPath: string;
  draftPath: string;
  close(): void;
}

function buildFixture(prefix: string, options: { runtimeDirName?: string } = {}): BackendFixture {
  const directory = mkdtempSync(join(tmpdir(), `backend-${prefix}-`));
  const now = new Date();
  const iso = (offsetHours: number) => new Date(now.getTime() + offsetHours * 3_600_000).toISOString();
  const observedAt = iso(-2);
  const policy = {
    id: 'cli-policy', version: 1, currency: 'SGD', maxBudgetMinor: 900000,
    allowedSuppliers: ['store-a'], evidenceMaxAgeHours: 168,
    roles: {
      laptop: { allowedSkus: ['LAP-14-AIR'], maxUnitPriceMinor: 120000, minWarrantyMonths: 24, maxUnits: 5 },
      monitor: { allowedSkus: ['MON-27-USBC'], maxUnitPriceMinor: 30000, minWarrantyMonths: 24, maxUnits: 5 },
    },
  };
  const catalog = {
    supplierId: 'store-a', shippingMinor: 0, taxRateBasisPoints: 900,
    deliveryLocationId: 'sg-office',
    delivery: {
      by: iso(24 * 9), evidence: { status: 'supported', source: 'fixture:store-a/delivery', observedAt },
    },
    products: [
      {
        sku: 'LAP-14-AIR', unitPriceMinor: 109900, warrantyMonths: 36,
        productEvidence: { status: 'supported', source: 'fixture:store-a/LAP', observedAt },
        availableUnits: 10,
        stockEvidence: { status: 'supported', source: 'fixture:store-a/stock', observedAt },
      },
    ],
  };
  const draft = {
    id: 'cli-mandate', version: 1, policyId: 'cli-policy', policyVersion: 1, currency: 'SGD',
    budgetMinor: 400000, purchaseBy: iso(2 * 24), readyBy: iso(14 * 24),
    deliveryLocationId: 'sg-office', allowedSuppliers: ['store-a'],
    requirements: [
      { id: 'eng-laptops', role: 'laptop', quantity: 5, allowedSkus: ['LAP-14-AIR'], maxUnitPriceMinor: 120000, minWarrantyMonths: 24 },
    ],
  };
  const policyPath = join(directory, 'policy.json');
  const catalogPath = join(directory, 'catalog.json');
  const draftPath = join(directory, 'draft.json');
  const runtimeName = options.runtimeDirName ?? 'state';
  const dbPath = join(directory, runtimeName, 'app.db');
  const providerPath = join(directory, runtimeName, 'providers.db');
  const configPath = join(directory, 'backend-config.json');
  writeFileSync(policyPath, JSON.stringify(policy));
  writeFileSync(catalogPath, JSON.stringify(catalog));
  writeFileSync(draftPath, JSON.stringify(draft));
  writeFileSync(configPath, JSON.stringify({
    version: 1, policyFiles: [policyPath], catalogFiles: [catalogPath], fakeProviderDb: providerPath,
  }));
  return {
    directory, dbPath, configPath, draftPath,
    close() { rmSync(directory, { recursive: true, force: true }); },
  };
}

function rootArgs(fixture: BackendFixture): string[] {
  return ['--db', fixture.dbPath, '--config', fixture.configPath];
}

test('the CLI walks draft, review, confirm, rpc submit, status, run, reconcile and audit through fresh processes', () => {
  const fixture = buildFixture('e2e');
  try {
    const draft = runBackend([...rootArgs(fixture), 'mandate-draft', '--file', fixture.draftPath]);
    assert.equal(draft.status, 0, draft.stderr);
    const draftLine = singleJsonLine(draft.stdout, 'mandate-draft') as {
      simulation: unknown; mandateId: string; mandateVersion: number; digest: string;
    };
    assert.equal(draftLine.simulation, true);
    assert.equal(draftLine.mandateId, 'cli-mandate');
    assert.equal(draftLine.mandateVersion, 1);
    assert.match(draftLine.digest, /^[0-9a-f]{64}$/);

    const review = runBackend([...rootArgs(fixture), 'mandate-review', '--id', 'cli-mandate', '--revision', '1']);
    assert.equal(review.status, 0, review.stderr);
    const reviewLine = singleJsonLine(review.stdout, 'mandate-review') as {
      digest: string; draft: unknown; policy: unknown;
    };
    assert.equal(reviewLine.digest, draftLine.digest);

    // Draft confirmation data must never be part of the stored revision.
    assert.ok(!JSON.stringify(reviewLine.draft).includes('approvedBy'), reviewLine.draft as never);

    const wrongDigest = runBackend([...rootArgs(fixture), 'mandate-confirm', '--id', 'cli-mandate', '--revision', '1', '--digest', 'z'.repeat(64)]);
    assert.equal(wrongDigest.status, 2);
    assert.equal(wrongDigest.stdout, '');
    assert.notEqual(wrongDigest.stderr, '');

    const confirm = runBackend([...rootArgs(fixture), 'mandate-confirm', '--id', 'cli-mandate', '--revision', '1', '--digest', draftLine.digest]);
    assert.equal(confirm.status, 0, confirm.stderr);
    const confirmLine = singleJsonLine(confirm.stdout, 'mandate-confirm') as {
      mandate: { approvedBy: string; id: string }; digest: string;
    };
    assert.equal(confirmLine.mandate.approvedBy, userInfo().username);
    assert.equal(confirmLine.mandate.id, 'cli-mandate');
    assert.equal(confirmLine.digest, draftLine.digest);

    const cart = {
      id: 'cli-cart-1', mandateId: 'cli-mandate', mandateVersion: 1, supplierId: 'store-a',
      lines: [{ requirementId: 'eng-laptops', sku: 'LAP-14-AIR', quantity: 1 }],
    };
    const rpcRequest = JSON.stringify({
      apiVersion: '1', requestId: 'rpc-1', method: 'proposal.submit',
      params: { idempotencyKey: 'rpc-key-1', cart },
    });
    const rpc = runBackend([...rootArgs(fixture), 'rpc'], `${rpcRequest}\n`);
    assert.equal(rpc.status, 0, rpc.stderr);
    const rpcLine = singleJsonLine(rpc.stdout, 'rpc') as {
      ok: boolean; requestId: string; simulation: boolean;
      result?: { operation: { id: string; status: string; reservationStatus: string; readinessStatus: string; totalMinor: number } };
    };
    assert.equal(rpcLine.ok, true);
    assert.equal(rpcLine.requestId, 'rpc-1');
    assert.equal(rpcLine.simulation, true);
    assert.equal(rpcLine.result?.operation.status, 'reserved');
    assert.equal(rpcLine.result?.operation.reservationStatus, 'active');
    assert.equal(rpcLine.result?.operation.readinessStatus, 'not_assessed');
    // One laptop, 9% taxable fixture tax, no shipping.
    assert.equal(rpcLine.result?.operation.totalMinor, 119791);
    const operationId = rpcLine.result?.operation.id ?? '';
    assert.match(operationId, /^op-/);

    const status = runBackend([...rootArgs(fixture), 'status', '--id', operationId]);
    assert.equal(status.status, 0, status.stderr);
    const statusLine = singleJsonLine(status.stdout, 'status') as { operation: { id: string; status: string } };
    assert.equal(statusLine.operation.id, operationId);
    assert.equal(statusLine.operation.status, 'reserved');

    const attempt = runBackend([...rootArgs(fixture), 'operation-run', '--id', operationId]);
    assert.equal(attempt.status, 0, attempt.stderr);
    const attemptLine = singleJsonLine(attempt.stdout, 'operation-run') as {
      operation: {
        status: string; paymentStatus: string; orderStatus: string; refundStatus: string;
        reservationStatus: string; readinessStatus: string;
      };
    };
    assert.equal(attemptLine.operation.status, 'ordered');
    assert.equal(attemptLine.operation.paymentStatus, 'succeeded');
    assert.equal(attemptLine.operation.orderStatus, 'succeeded');
    assert.equal(attemptLine.operation.reservationStatus, 'consumed');
    assert.equal(attemptLine.operation.refundStatus, 'not_started');
    assert.equal(attemptLine.operation.readinessStatus, 'not_assessed');

    const reconcile = runBackend([...rootArgs(fixture), 'operation-reconcile', '--id', operationId]);
    assert.equal(reconcile.status, 0, reconcile.stderr);
    const reconcileLine = singleJsonLine(reconcile.stdout, 'operation-reconcile') as {
      operation: { id: string; status: string };
    };
    assert.equal(reconcileLine.operation.id, operationId);
    assert.equal(reconcileLine.operation.status, 'ordered');

    const audit = runBackend([...rootArgs(fixture), 'audit', '--id', operationId]);
    assert.equal(audit.status, 0, audit.stderr);
    const auditLine = singleJsonLine(audit.stdout, 'audit') as {
      operationId: string; events: Array<{ eventId: number; kind: string; createdAt: string; details: unknown }>;
    };
    assert.equal(auditLine.operationId, operationId);
    assert.ok(auditLine.events.length >= 3);
    assert.deepEqual(auditLine.events.map((event) => event.kind).filter((kind) =>
      kind === 'operation_reserved' || kind === 'capture_succeeded' || kind === 'order_succeeded'),
    ['operation_reserved', 'capture_succeeded', 'order_succeeded']);
  } finally {
    fixture.close();
  }
});

test('backend commands refuse unknown commands and flags with exit 2 and clean stdout', () => {
  const fixture = buildFixture('refusals');
  try {
    const cases: Array<[string[], string]> = [
      [[...rootArgs(fixture), 'nonsense'], 'unknown command'],
      [[...rootArgs(fixture), 'status', '--id', 'op-1', '--file', 'x'], 'inappropriate flag'],
      [[...rootArgs(fixture), 'status', '--id', 'op-1', '--id', 'op-2'], 'duplicate flag'],
      [[...rootArgs(fixture), 'status', '--id', 'op-1', '--now', '2030-01-01T00:00:00Z'], 'caller-supplied clock'],
      [[...rootArgs(fixture), 'mandate-draft', '--file', fixture.draftPath, '--digest', 'x'], 'inappropriate flag'],
      [['status', '--id', 'op-1'], 'missing root options'],
      [[...rootArgs(fixture), 'mandate-review', '--id', 'cli-mandate', '--revision', '0'], 'invalid revision'],
      [['--db', '', '--config', fixture.configPath, 'status', '--id', 'op-1'], 'empty database value'],
      [['--db', fixture.dbPath, '--config', '', 'status', '--id', 'op-1'], 'empty config value'],
      [[...rootArgs(fixture), 'status', '--id', '   '], 'whitespace-only id value'],
    ];
    for (const [args] of cases) {
      const result = runBackend(args);
      assert.equal(result.status, 2, `${args.join(' ')} must exit 2: ${result.stderr}`);
      assert.equal(result.stdout, '', `${args.join(' ')} must print nothing on stdout`);
      assert.notEqual(result.stderr, '');
      assert.doesNotMatch(result.stderr, /node:|\.ts|SELECT|sqlite/i, 'sanitized diagnostics only');
    }
    // Missing per-command flags.
    const missing = runBackend([...rootArgs(fixture), 'mandate-confirm', '--id', 'cli-mandate']);
    assert.equal(missing.status, 2);
  } finally {
    fixture.close();
  }
});

test('rpc input constraints are enforced in fresh processes: oversize, trailing data, hostile fields', () => {
  const fixture = buildFixture('rpc-constraints');
  try {
    const oversized = runBackend([...rootArgs(fixture), 'rpc'],
      `${'{"apiVersion":"1","pad":"'}${'x'.repeat(1_048_600)}"}`);
    assert.equal(oversized.status, 2);
    const oversizeLine = singleJsonLine(oversized.stdout, 'oversize rpc') as {
      ok: boolean; error: { code: string };
    };
    assert.equal(oversizeLine.ok, false);
    assert.equal(oversizeLine.error.code, 'INVALID_REQUEST');

    // A well-formed single JSON value must still hit the byte bound, not the
    // parse path, so the oversize check is provably distinct from malformed
    // input handling.
    const wellFormedOversize = runBackend([...rootArgs(fixture), 'rpc'], JSON.stringify({
      apiVersion: '1', requestId: 'rpc-oversize', method: 'proposal.submit',
      params: {
        idempotencyKey: 'rpc-key-2',
        cart: { id: 'cart-2', mandateId: 'cli-mandate', mandateVersion: 1, supplierId: 'store-a', lines: [] },
      },
      pad: 'x'.repeat(1_048_600),
    }));
    assert.equal(wellFormedOversize.status, 2);
    const wellFormedLine = singleJsonLine(wellFormedOversize.stdout, 'well-formed oversize rpc') as {
      ok: boolean; error: { code: string; message: string };
    };
    assert.equal(wellFormedLine.ok, false);
    assert.equal(wellFormedLine.error.code, 'INVALID_REQUEST');
    // The byte bound owns this message: the pad field alone cannot produce it,
    // so a failing bound would leave this assertion red.
    assert.equal(wellFormedLine.error.message, 'The RPC request exceeds the 1 MiB input limit');

    // The passing side: a confirmed mandate makes a well-formed rpc under the
    // bound fully accepted. The strict request schema has no padding field, so
    // the largest legal identifiers fill the request as close to the bound as
    // the contracts allow.
    const acceptedDraft = runBackend([...rootArgs(fixture), 'mandate-draft', '--file', fixture.draftPath]);
    assert.equal(acceptedDraft.status, 0, acceptedDraft.stderr);
    const acceptedDraftLine = singleJsonLine(acceptedDraft.stdout, 'under-bound draft') as { digest: string };
    const acceptedConfirm = runBackend([...rootArgs(fixture), 'mandate-confirm', '--id', 'cli-mandate', '--revision', '1', '--digest', acceptedDraftLine.digest]);
    assert.equal(acceptedConfirm.status, 0, acceptedConfirm.stderr);
    const underBoundRequest = JSON.stringify({
      apiVersion: '1', requestId: 'rpc-under-bound'.padEnd(200, '-'),
      method: 'proposal.submit',
      params: {
        idempotencyKey: 'rpc-key-under-bound'.padEnd(200, '-'),
        cart: {
          id: 'cart-under-bound', mandateId: 'cli-mandate', mandateVersion: 1, supplierId: 'store-a',
          lines: [{ requirementId: 'eng-laptops', sku: 'LAP-14-AIR', quantity: 1 }],
        },
      },
    });
    assert.ok(underBoundRequest.length < 1_048_576);
    const underBound = runBackend([...rootArgs(fixture), 'rpc'], `${underBoundRequest}\n`);
    assert.equal(underBound.status, 0, underBound.stderr);
    const underBoundLine = singleJsonLine(underBound.stdout, 'under-bound rpc') as {
      ok: boolean; requestId: string; result?: { operation: { status: string; reservationStatus: string } };
    };
    assert.equal(underBoundLine.ok, true);
    assert.equal(underBoundLine.requestId, 'rpc-under-bound'.padEnd(200, '-'));
    assert.equal(underBoundLine.result?.operation.status, 'reserved');
    assert.equal(underBoundLine.result?.operation.reservationStatus, 'active');

    const trailing = runBackend([...rootArgs(fixture), 'rpc'], '{} { "apiVersion": "2" }');
    assert.equal(trailing.status, 2);
    const trailingLine = singleJsonLine(trailing.stdout, 'trailing rpc') as { ok: boolean; error: { code: string } };
    assert.equal(trailingLine.ok, false);
    assert.equal(trailingLine.error.code, 'INVALID_REQUEST');

    const hostileRequest = JSON.stringify({
      apiVersion: '1', requestId: 'hostile-1', method: 'proposal.submit',
      params: { idempotencyKey: 'hostile-key', cart: {
        id: 'cart-h', mandateId: 'cli-mandate', mandateVersion: 1, supplierId: 'store-a',
        lines: [{ requirementId: 'eng-laptops', sku: 'LAP-14-AIR', quantity: 1 }],
      }, approvedBy: 'attacker', scenario: { crashAfterCommit: 'capture' }, now: '2020-01-01T00:00:00Z' },
    });
    const hostile = runBackend([...rootArgs(fixture), 'rpc'], hostileRequest);
    assert.equal(hostile.status, 2);
    const hostileLine = singleJsonLine(hostile.stdout, 'hostile rpc') as { ok: boolean; error: { code: string; message: string } };
    assert.equal(hostileLine.ok, false);
    assert.equal(hostileLine.error.code, 'INVALID_REQUEST');
    assert.doesNotMatch(hostileLine.error.message, /node:|\.ts|app\.db|sqlite|approvedBy/i);
  } finally {
    fixture.close();
  }
});

test('business and lookup failures exit 2 with no stdout', () => {
  const fixture = buildFixture('business');
  try {
    const status = runBackend([...rootArgs(fixture), 'status', '--id', 'op-ghost']);
    assert.equal(status.status, 2);
    assert.equal(status.stdout, '');
    assert.notEqual(status.stderr, '');

    const review = runBackend([...rootArgs(fixture), 'mandate-review', '--id', 'ghost-mandate', '--revision', '1']);
    assert.equal(review.status, 2);
    assert.equal(review.stdout, '');
  } finally {
    fixture.close();
  }
});

test('an existing unsafe runtime directory is refused and never chmodded', () => {
  const fixture = buildFixture('unsafe-dir', { runtimeDirName: 'state-unsafe' });
  try {
    const runtimeDir = join(fixture.directory, 'state-unsafe');
    makeUnsafeDirectory(runtimeDir);
    const before = accessFingerprint(runtimeDir);
    if (!isWindows) assert.equal(before, 0o755);
    const result = runBackend([...rootArgs(fixture), 'mandate-draft', '--file', fixture.draftPath]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /refusing to chmod/);
    assert.equal(accessFingerprint(runtimeDir), before, 'the unsafe directory must remain untouched');
  } finally {
    fixture.close();
  }
});

test('both runtime parents are pre-flighted before any creation: a refused app parent never creates the provider parent', () => {
  const fixture = buildFixture('unsafe-two-parents', { runtimeDirName: 'state-unsafe' });
  try {
    // Two DISTINCT runtime parents pin the check-both-then-create ordering:
    // the provider runtime parent stays missing/fresh while the application
    // runtime parent already exists as an unsafe 0o755 directory.
    const appRuntime = join(fixture.directory, 'state-unsafe');
    makeUnsafeDirectory(appRuntime);
    const before = accessFingerprint(appRuntime);
    if (!isWindows) assert.equal(before, 0o755);
    const providerRuntime = join(fixture.directory, 'providers-state');
    const original = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(fixture.configPath, JSON.stringify({
      ...original, fakeProviderDb: join(providerRuntime, 'providers.db'),
    }));
    const refused = runBackend([...rootArgs(fixture), 'mandate-draft', '--file', fixture.draftPath]);
    assert.equal(refused.status, 2);
    assert.equal(refused.stdout, '');
    assert.match(refused.stderr, /refusing to chmod/);
    assert.equal(accessFingerprint(appRuntime), before, 'the unsafe application parent must remain untouched');
    assert.throws(() => statSync(providerRuntime),
      'the refusal must not create the provider runtime parent despite its successful pre-flight');
  } finally {
    fixture.close();
  }
});

test('a runtime parent blocked by a regular file is operator validation: exit 2 with sanitized stderr', () => {
  const fixture = buildFixture('enotdir');
  try {
    // A regular FILE occupies the state directory path, so both runtime
    // parents (`state/inner`) cannot be stat'd: statSync fails with ENOTDIR,
    // not ENOENT, and that must be refused as operator validation instead of
    // silently degrading to a later unclassified internal failure (exit 1).
    writeFileSync(join(fixture.directory, 'state'), '');
    const appDb = join(fixture.directory, 'state', 'inner', 'app.db');
    const providerDb = join(fixture.directory, 'state', 'inner', 'providers.db');
    const original = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(fixture.configPath, JSON.stringify({ ...original, fakeProviderDb: providerDb }));
    const result = runBackend(['--db', appDb, '--config', fixture.configPath, 'mandate-draft',
      '--file', fixture.draftPath]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.notEqual(result.stderr, '');
    assert.doesNotMatch(result.stderr, /node:|\.ts|sqlite|ENOTDIR/i, 'sanitized diagnostics only');
  } finally {
    fixture.close();
  }
});

test('aliased application and provider database paths are refused', () => {
  const fixture = buildFixture('alias');
  try {
    const runtimeDir = join(fixture.directory, 'alias-state');
    mkdirSync(runtimeDir, { mode: 0o700 });
    const dbPath = join(runtimeDir, 'app.db');
    // Lexically distinct but resolving to the same real file through a symlink.
    // Windows refuses file symlinks without Developer Mode or elevation, and a hard
    // link is the alias any user can make there.
    writeFileSync(dbPath, '');
    const providerAlias = join(runtimeDir, 'providers.db');
    if (isWindows) linkSync(dbPath, providerAlias);
    else symlinkSync(dbPath, providerAlias);
    const aliasedConfigPath = join(fixture.directory, 'aliased-config.json');
    const configRaw = readFileSync(fixture.configPath, 'utf8');
    const aliasedConfig = { ...JSON.parse(configRaw), fakeProviderDb: providerAlias };
    writeFileSync(aliasedConfigPath, JSON.stringify(aliasedConfig));
    const result = runBackend(['--db', dbPath, '--config', aliasedConfigPath, 'status', '--id', 'op-x']);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /must be distinct files/);

    // Same file name twice: config relative to the config directory documents
    // that resolution, so configure the provider DB exactly at the app path.
    writeFileSync(fixture.configPath, JSON.stringify({
      version: 1,
      policyFiles: JSON.parse(configRaw).policyFiles,
      catalogFiles: JSON.parse(configRaw).catalogFiles,
      fakeProviderDb: join(fixture.directory, 'same.db'),
    }));
    const sameName = runBackend(['--db', join(fixture.directory, 'same.db'), '--config', fixture.configPath, 'status', '--id', 'op-x']);
    assert.equal(sameName.status, 2);
    assert.match(sameName.stderr, /must be distinct files/);
  } finally {
    fixture.close();
  }
});

test('fresh runtime state and database files are owner-only at first use', () => {
  const fixture = buildFixture('fresh-perms');
  try {
    const runtimeDir = join(fixture.directory, 'state');
    const draft = runBackend([...rootArgs(fixture), 'mandate-draft', '--file', fixture.draftPath]);
    assert.equal(draft.status, 0, draft.stderr);
    if (isWindows) {
      assert.match(readWindowsSecurity(runtimeDir).sddl, /D:P/, 'inheritance from the parent must be off');
      assertOwnerOnlyOnWindows(runtimeDir);
      assertOwnerOnlyOnWindows(fixture.dbPath);
    } else {
      assert.equal(statSync(runtimeDir).mode & 0o777, 0o700);
      assert.equal(statSync(fixture.dbPath).mode & 0o777, 0o600);
    }

    // The provider database opens on the first execution command even when the
    // operation is missing (exit 2 not-found leaves the file created).
    const run = runBackend([...rootArgs(fixture), 'operation-run', '--id', 'op-ghost']);
    assert.equal(run.status, 2);
    assert.equal(run.stdout, '');
    if (isWindows) assertOwnerOnlyOnWindows(join(fixture.directory, 'state', 'providers.db'));
    else assert.equal(statSync(join(fixture.directory, 'state', 'providers.db')).mode & 0o777, 0o600);
  } finally {
    fixture.close();
  }
});

test('a schema-invalid policy snapshot is operator validation: exit 2 with sanitized diagnostics', () => {
  const fixture = buildFixture('bad-policy');
  try {
    const badPolicy = join(fixture.directory, 'bad-policy.json');
    writeFileSync(badPolicy, JSON.stringify({ id: 'cli-policy' }));
    const original = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(fixture.configPath, JSON.stringify({ ...original, policyFiles: [badPolicy] }));
    const result = runBackend([...rootArgs(fixture), 'status', '--id', 'op-x']);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.notEqual(result.stderr, '');
    assert.doesNotMatch(result.stderr, /node:|\.ts|SELECT|sqlite|Zod/i, 'sanitized diagnostics only');
  } finally {
    fixture.close();
  }
});

test('an uncategorized internal failure exits 1 with empty stdout and a sanitized message', () => {
  const fixture = buildFixture('internal-failure');
  try {
    const runtimeDir = join(fixture.directory, 'state');
    makePrivateDirectory(runtimeDir);
    // The application database flag now names a DIRECTORY: opening it throws
    // outside every classified diagnostic family.
    mkdirSync(fixture.dbPath);
    const status = runBackend([...rootArgs(fixture), 'status', '--id', 'op-1']);
    assert.equal(status.status, 1);
    assert.equal(status.stdout, '');
    assert.equal(status.stderr.trim(), 'backend: the command failed unexpectedly');
  } finally {
    fixture.close();
  }
});

test('Windows: access inherited from the parent counts, and is refused with the directory untouched', { skip: windowsOnly }, () => {
  const fixture = buildFixture('win-inherited');
  try {
    const parent = join(fixture.directory, 'open-parent');
    mkdirSync(parent);
    execFileSync('icacls', [parent, '/grant', '*S-1-1-0:(OI)(CI)R'], { stdio: 'ignore' });
    const runtimeDir = join(parent, 'state');
    mkdirSync(runtimeDir);
    const before = accessFingerprint(runtimeDir);
    const original = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(fixture.configPath, JSON.stringify({ ...original, fakeProviderDb: join(runtimeDir, 'providers.db') }));
    const result = runBackend(['--db', join(runtimeDir, 'app.db'), '--config', fixture.configPath, 'mandate-draft', '--file', fixture.draftPath]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /too open/);
    assert.equal(accessFingerprint(runtimeDir), before);
    assert.throws(() => statSync(join(runtimeDir, 'app.db')), 'nothing may be created inside');
  } finally {
    fixture.close();
  }
});

test('Windows: a fresh directory under an open parent shuts that inherited access out', { skip: windowsOnly }, () => {
  const fixture = buildFixture('win-fresh-open-parent');
  try {
    const parent = join(fixture.directory, 'open-parent');
    mkdirSync(parent);
    execFileSync('icacls', [parent, '/grant', '*S-1-1-0:(OI)(CI)F'], { stdio: 'ignore' });
    const runtimeDir = join(parent, 'state');
    const original = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(fixture.configPath, JSON.stringify({ ...original, fakeProviderDb: join(runtimeDir, 'providers.db') }));
    const dbPath = join(runtimeDir, 'app.db');
    const first = runBackend(['--db', dbPath, '--config', fixture.configPath, 'mandate-draft', '--file', fixture.draftPath]);
    assert.equal(first.status, 0, first.stderr);
    assertOwnerOnlyOnWindows(runtimeDir);
    assertOwnerOnlyOnWindows(dbPath);
    const second = runBackend(['--db', dbPath, '--config', fixture.configPath, 'mandate-review', '--id', 'cli-mandate', '--revision', '1']);
    assert.equal(second.status, 0, second.stderr);
  } finally {
    fixture.close();
  }
});

test('Windows: a junction is judged by what it reaches, and never changes that directory', { skip: windowsOnly }, () => {
  const fixture = buildFixture('win-junction');
  try {
    const unsafeTarget = join(fixture.directory, 'unsafe-target');
    makeUnsafeDirectory(unsafeTarget);
    const before = accessFingerprint(unsafeTarget);
    const junction = join(fixture.directory, 'junction');
    symlinkSync(unsafeTarget, junction, 'junction');
    assert.ok(statSync(junction).isDirectory());
    const original = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(fixture.configPath, JSON.stringify({ ...original, fakeProviderDb: join(junction, 'providers.db') }));
    const refused = runBackend([...rootArgs(fixture), 'mandate-draft', '--file', fixture.draftPath]);
    assert.equal(refused.status, 2, refused.stderr);
    assert.match(refused.stderr, /too open/);
    assert.equal(accessFingerprint(unsafeTarget), before);
  } finally {
    fixture.close();
  }
});

test('Windows: both databases reached through a junction alias are one file and refused', { skip: windowsOnly }, () => {
  const fixture = buildFixture('win-junction-alias');
  try {
    const runtimeDir = join(fixture.directory, 'state');
    makePrivateDirectory(runtimeDir);
    const junction = join(fixture.directory, 'alias');
    symlinkSync(runtimeDir, junction, 'junction');
    const original = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(fixture.configPath, JSON.stringify({ ...original, fakeProviderDb: join(junction, 'app.db') }));
    const result = runBackend([...rootArgs(fixture), 'status', '--id', 'op-x']);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /must be distinct files/);
  } finally {
    fixture.close();
  }
});

test('Windows: when the security descriptor cannot be read, the backend refuses rather than proceeds', { skip: windowsOnly }, () => {
  const fixture = buildFixture('win-unverifiable');
  try {
    const runtimeDir = join(fixture.directory, 'state');
    makePrivateDirectory(runtimeDir);
    // Every spelling goes, because Windows names are case-insensitive and the first sorted one wins.
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'SYSTEMROOT'),
    );
    env.SYSTEMROOT = join(fixture.directory, 'no-such-windows');
    const result = spawnSync(process.execPath, [entry, ...rootArgs(fixture), 'mandate-draft', '--file', fixture.draftPath], {
      cwd: root, encoding: 'utf8', env,
    });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /could not be validated/);
    assert.throws(() => statSync(fixture.dbPath), 'nothing may be created inside');
  } finally {
    fixture.close();
  }
});

test('operator identity can never be fabricated: the fallback branch is gone and refusal is the only path', () => {
  // A real process cannot remove its OS identity and backend.ts is an
  // executable entry module that cannot be imported as a unit, so the
  // zero-fallback contract is machine-checked by source inspection here; the
  // walkthrough test asserts the approvedBy positive case against the live OS.
  const source = readFileSync(entry, 'utf8');
  assert.ok(!source.includes('local-operator'), 'a fabricated identity constant must not exist');
  const identitySource = source.slice(
    source.indexOf('function operatorIdentity'),
    source.indexOf('function trustedClock'),
  );
  assert.match(identitySource, /throw new CliError\('The operating-system identity could not be established/);
  assert.equal([...identitySource.matchAll(/\breturn\b/g)].length, 1,
    'the helper returns only the real username (a hypothetical env fallback must not appear)');
  assert.ok(!identitySource.includes('process.env'), 'the identity helper reads no environment variable');
});
