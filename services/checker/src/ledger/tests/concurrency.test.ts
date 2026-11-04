import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { openLedgerStore } from '../store.ts';
import { MIGRATIONS } from '../schema.ts';
import {
  confirmMandateRevision,
  definePolicySnapshot,
  draftMandateRevision,
  reviewMandateRevision,
} from '../../authority.ts';
import { CartSubmissionSchema } from '../../../../../packages/contracts/src/index.ts';
import {
  TEST_CART,
  TEST_CART_TOTAL_MINOR,
  TEST_CATALOG,
  TEST_CLOCK,
  TEST_MANDATE_DRAFT,
  TEST_POLICY,
  fixtureAdapter,
  makeTempDir,
  removeTempDir,
} from './fixtures.ts';

// Multiprocess reservation races: real child processes share one SQLite file;
// authority setup (policy/draft/confirmation) stays in this parent process and
// children only submit proposals.

const WORKER_PATH = new URL('./test-worker.ts', import.meta.url).pathname;

function digestOf(database: import('node:sqlite').DatabaseSync, mandateId: string, version: number): string {
  const review = reviewMandateRevision(database, mandateId, version);
  if (review === null) throw new Error('missing revision for test setup');
  return review.digest;
}

interface SubmitWorkerResult {
  kind: 'submit';
  responses: Array<{
    ok: boolean;
    error?: { code: string };
    result?: { operation: { id: string; totalMinor: number; cartId: string } };
  }>;
}

interface VerifyWorkerResult {
  kind: 'verify';
  mandateFound: boolean;
  exposureStarted: boolean;
  activeVersion: number | null;
  confirmationDigest: string | null;
  confirmedAt: string | null;
  approvedBy: string | null;
  revisionDigest: string | null;
  policyId: string | null;
  operations: number;
  reservations: number;
  aliases: number;
  auditEvents: number;
  committedMinor: number;
  reservedMinor: number;
  perRequirement: Record<string, { committed: number; reserved: number }>;
}

type WorkerResult = SubmitWorkerResult | VerifyWorkerResult;

function runWorker(mode: 'submit' | 'verify', config: object): Promise<WorkerResult> {
  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(process.execPath, [WORKER_PATH, mode], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    const fail = (message: string) => {
      child.kill('SIGKILL');
      rejectWorker(new Error(`${message}\nstderr: ${stderr}`));
    };
    const deadline = setTimeout(() => fail('worker timed out'), 120_000);
    child.on('error', (error) => { clearTimeout(deadline); rejectWorker(error); });
    child.on('close', (code) => {
      clearTimeout(deadline);
      const lines = stdout.trim().split('\n').filter((line) => line.length > 0);
      const resultLine = lines[lines.length - 1];
      if (code !== 0 || resultLine === undefined) {
        rejectWorker(new Error(`worker exited ${code}\nstdout: ${stdout}\nstderr: ${stderr}`));
        return;
      }
      resolveWorker(JSON.parse(resultLine) as WorkerResult);
    });
    child.stdin.write(`${JSON.stringify(config)}\n`);
    // READY may share or straddle a chunk with other output: match on the
    // accumulated stream, not a single chunk, before releasing GO.
    let readyBuffer = '';
    const onLine = (chunk: Buffer) => {
      readyBuffer += String(chunk);
      if (/READY/.test(readyBuffer)) {
        child.stdin.write('GO\n');
        child.stdout.removeListener('data', onLine);
      }
    };
    child.stdout.on('data', onLine);
  });
}

function submitConfig(databasePath: string, attempts: Array<{ idempotencyKey: string; cart: unknown }>): object {
  return { databasePath, catalog: TEST_CATALOG, clock: TEST_CLOCK, attempts };
}

function setupConfirmedStore(databasePath: string, draftOverrides: Partial<typeof TEST_MANDATE_DRAFT> = {}): string {
  const database = openLedgerStore(databasePath);
  const policy = { ...TEST_POLICY };
  definePolicySnapshot(database, policy, TEST_CLOCK);
  const draft = { ...TEST_MANDATE_DRAFT, ...draftOverrides };
  draftMandateRevision(database, draft, TEST_CLOCK);
  const confirmed = confirmMandateRevision(database, draft.id, draft.version, digestOf(database, draft.id, draft.version), 'fixture-ops-manager', TEST_CLOCK);
  assert.equal(confirmed.version, draft.version);
  database.close();
  return draft.id;
}

test('competing amount requests cannot double-spend the mandate budget', async () => {
  const dir = makeTempDir('budget-race');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath, { budgetMinor: TEST_CART_TOTAL_MINOR });
    const cartOne = { ...TEST_CART, id: 'race-cart-one' };
    const cartTwo = { ...TEST_CART, id: 'race-cart-two' };
    const [one, two] = await Promise.all([
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'race-key-one', cart: cartOne }])),
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'race-key-two', cart: cartTwo }])),
    ]) as [SubmitWorkerResult, SubmitWorkerResult];
    const outcomes = [one.responses[0], two.responses[0]].map((response) =>
      response?.ok ? 'ok' : response?.error?.code);
    assert.deepEqual(outcomes.sort(), ['BUDGET_EXCEEDED', 'ok']);

    const verify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(verify.operations, 1);
    assert.equal(verify.reservations, 1);
    assert.equal(verify.reservedMinor + verify.committedMinor, TEST_CART_TOTAL_MINOR);
    assert.equal(verify.reservedMinor, TEST_CART_TOTAL_MINOR);
    assert.equal(verify.aliases, 1);
    assert.equal(verify.exposureStarted, true);
  } finally {
    removeTempDir(dir);
  }
});

test('competing quantity requests cap the summed requirement units', async () => {
  const dir = makeTempDir('quantity-race');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath, {
      requirements: TEST_MANDATE_DRAFT.requirements.map((requirement) =>
        requirement.id === 'engineering-laptops' ? { ...requirement, quantity: 3 } : requirement),
    });
    const cartOne = { ...TEST_CART, id: 'qty-cart-one', lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 2 }] };
    const cartTwo = { ...TEST_CART, id: 'qty-cart-two', lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 2 }] };
    const adapter = fixtureAdapter();
    const [quoteOne, quoteTwo] = await Promise.all([
      adapter.quoteCart(CartSubmissionSchema.parse(cartOne), TEST_CLOCK),
      adapter.quoteCart(CartSubmissionSchema.parse(cartTwo), TEST_CLOCK),
    ]);
    assert.equal(quoteOne.totalMinor, quoteTwo.totalMinor);
    const winnerQuote = quoteTwo;
    const [one, two] = await Promise.all([
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'qty-key-one', cart: cartOne }])),
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'qty-key-two', cart: cartTwo }])),
    ]) as [SubmitWorkerResult, SubmitWorkerResult];
    const outcomes = [one.responses[0], two.responses[0]].map((response) =>
      response?.ok ? 'ok' : response?.error?.code);
    assert.deepEqual(outcomes.sort(), ['QUANTITY_EXCEEDED', 'ok']);

    const verify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(verify.operations, 1);
    assert.equal(verify.reservations, 1);
    assert.equal(verify.aliases, 1);
    assert.equal(verify.reservedMinor, winnerQuote.totalMinor);
    assert.deepEqual(verify.perRequirement['engineering-laptops'], { committed: 0, reserved: 2 });
  } finally {
    removeTempDir(dir);
  }
});

test('concurrent identical key and cart yields exactly one operation and replay for all', async () => {
  const dir = makeTempDir('identical-race');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath);
    const workers = await Promise.all([
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'same-key', cart: TEST_CART }])),
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'same-key', cart: TEST_CART }])),
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'same-key', cart: TEST_CART }])),
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'same-key', cart: TEST_CART }])),
    ]) as SubmitWorkerResult[];
    const operationIds = workers.flatMap((worker) => worker.responses.map((response) => {
      assert.equal(response.ok, true, JSON.stringify(response));
      return response.result?.operation.id;
    }));
    assert.equal(operationIds.length, 4);
    assert.equal(new Set(operationIds).size, 1);

    const verify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(verify.operations, 1);
    assert.equal(verify.reservations, 1);
    assert.equal(verify.aliases, 1);
    assert.equal(verify.reservedMinor, TEST_CART_TOTAL_MINOR);
    assert.equal(verify.auditEvents >= 1, true);
  } finally {
    removeTempDir(dir);
  }
});

test('start-barrier race: same cart id with divergent payloads keeps one operation and the loser key unbound', async () => {
  const dir = makeTempDir('diverge-race');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath);
    const cartThree = { ...TEST_CART, id: 'diverge-cart', lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 3 }] };
    const cartTwo = { ...TEST_CART, id: 'diverge-cart', lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 2 }] };
    const [one, two] = await Promise.all([
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'diverge-key-three', cart: cartThree }])),
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'diverge-key-two', cart: cartTwo }])),
    ]) as [SubmitWorkerResult, SubmitWorkerResult];
    const outcomes = [one.responses[0], two.responses[0]];
    const winners = outcomes.filter((response) => response?.ok);
    const losers = outcomes.filter((response) => !response?.ok);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(losers[0]?.error?.code, 'IDEMPOTENCY_CONFLICT');
    const winnerTotal = winners[0]?.result?.operation.totalMinor;
    assert.ok(typeof winnerTotal === 'number');

    const verify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(verify.operations, 1);
    assert.equal(verify.reservations, 1);
    // Exactly one alias: the losing key stayed unbound.
    assert.equal(verify.aliases, 1);
    // The persisted total is the winner's payload, untouched by the conflicting loser.
    assert.equal(verify.reservedMinor, winnerTotal);
    assert.equal(verify.committedMinor, 0);
    assert.equal(verify.exposureStarted, true);
  } finally {
    removeTempDir(dir);
  }
});

test('start-barrier race: one idempotency key across two different carts binds only the winner', async () => {
  const dir = makeTempDir('shared-key-race');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath);
    const cartThree = { ...TEST_CART, id: 'shared-cart-three' };
    const cartTwo = { ...TEST_CART, id: 'shared-cart-two', lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 2 }] };
    const [one, two] = await Promise.all([
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'shared-race-key', cart: cartThree }])),
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'shared-race-key', cart: cartTwo }])),
    ]) as [SubmitWorkerResult, SubmitWorkerResult];
    const outcomes = [one.responses[0], two.responses[0]];
    const winners = outcomes.filter((response) => response?.ok);
    const losers = outcomes.filter((response) => !response?.ok);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(losers[0]?.error?.code, 'IDEMPOTENCY_CONFLICT');
    const winnerTotal = winners[0]?.result?.operation.totalMinor;
    const winnerCartId = winners[0]?.result?.operation.cartId;
    assert.ok(typeof winnerTotal === 'number' && typeof winnerCartId === 'string');

    const verify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(verify.operations, 1);
    assert.equal(verify.reservations, 1);
    assert.equal(verify.aliases, 1);
    assert.equal(verify.reservedMinor, winnerTotal);

    // The conflict consumed neither the shared key for the loser's cart nor the
    // losing cart identity: it can still submit under a fresh key.
    const losingCart = winnerCartId === cartThree.id ? cartTwo : cartThree;
    const recovery = await runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'recovery-key', cart: losingCart }])) as SubmitWorkerResult;
    assert.equal(recovery.responses[0]?.ok, true);
    const recoveryTotal = recovery.responses[0]?.result?.operation.totalMinor;
    assert.ok(typeof recoveryTotal === 'number');
    const afterVerify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(afterVerify.operations, 2);
    assert.equal(afterVerify.reservations, 2);
    assert.equal(afterVerify.aliases, 2);
    assert.equal(afterVerify.reservedMinor, winnerTotal + recoveryTotal);
  } finally {
    removeTempDir(dir);
  }
});

test('same cart under different concurrent keys keeps one operation with one alias per key', async () => {
  const dir = makeTempDir('alias-race');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath);
    const [one, two] = await Promise.all([
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'alias-a', cart: TEST_CART }])),
      runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'alias-b', cart: TEST_CART }])),
    ]) as [SubmitWorkerResult, SubmitWorkerResult];
    assert.equal(one.responses[0]?.ok, true);
    assert.equal(two.responses[0]?.ok, true);
    assert.equal(one.responses[0]?.result?.operation.id, two.responses[0]?.result?.operation.id);

    const verify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(verify.operations, 1);
    assert.equal(verify.reservations, 1);
    assert.equal(verify.aliases, 2);
  } finally {
    removeTempDir(dir);
  }
});

test('persistent confirmation, reservations, aliases and audit survive into a fresh process', async () => {
  const dir = makeTempDir('restart');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath);
    const submitted = await runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'restart-key', cart: TEST_CART }])) as SubmitWorkerResult;
    assert.equal(submitted.responses[0]?.ok, true);

    const verify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(verify.mandateFound, true);
    assert.equal(verify.activeVersion, 1);
    assert.equal(verify.policyId, 'hardware-policy');
    assert.equal(verify.approvedBy, 'fixture-ops-manager');
    assert.equal(verify.confirmedAt, TEST_CLOCK);
    assert.equal(verify.confirmationDigest, verify.revisionDigest);
    assert.equal(verify.operations, 1);
    assert.equal(verify.reservations, 1);
    assert.equal(verify.aliases, 1);
    assert.equal(verify.auditEvents, 1);
    assert.equal(verify.exposureStarted, true);
    assert.equal(verify.reservedMinor, TEST_CART_TOTAL_MINOR);
    assert.deepEqual(verify.perRequirement['engineering-laptops'], { committed: 0, reserved: 3 });
  } finally {
    removeTempDir(dir);
  }
});

test('replay and identity conflicts agree across processes after restart', async () => {
  const dir = makeTempDir('identity-restart');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath);
    const first = await runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'idem-key', cart: TEST_CART }])) as SubmitWorkerResult;
    assert.equal(first.responses[0]?.ok, true);
    const operationId = first.responses[0]?.result?.operation.id;

    // Same key and cart in a fresh process replays the original operation
    // without a fresh quote (the worker's clock moved past quote expiry).
    const replayClock = '2026-11-06T09:00:00.000Z';
    const replay = await runWorker('submit', { ...submitConfig(databasePath, [{ idempotencyKey: 'idem-key', cart: TEST_CART }]), clock: replayClock }) as SubmitWorkerResult;
    assert.equal(replay.responses[0]?.ok, true);
    assert.equal(replay.responses[0]?.result?.operation.id, operationId);

    // Same cart id with changed contents conflicts; the unbound key stays unbound.
    const changed = { ...TEST_CART, lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 2 }] };
    const conflict = await runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'unused-key', cart: changed }])) as SubmitWorkerResult;
    assert.equal(conflict.responses[0]?.ok, false);
    assert.equal(conflict.responses[0]?.error?.code, 'IDEMPOTENCY_CONFLICT');

    const sameKeyDifferentCart = await runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'idem-key', cart: { ...TEST_CART, id: 'other-cart' } }])) as SubmitWorkerResult;
    assert.equal(sameKeyDifferentCart.responses[0]?.ok, false);
    assert.equal(sameKeyDifferentCart.responses[0]?.error?.code, 'IDEMPOTENCY_CONFLICT');

    const verify = await runWorker('verify', { databasePath, mandateId }) as VerifyWorkerResult;
    assert.equal(verify.operations, 1);
    assert.equal(verify.aliases, 1);
  } finally {
    removeTempDir(dir);
  }
});

test('replay after terminal-state mutation returns the current operation without a fresh quote', async () => {
  const dir = makeTempDir('replay-terminal');
  try {
    const databasePath = `${dir}/ledger.db`;
    const mandateId = setupConfirmedStore(databasePath);
    const submitted = await runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'terminal-key', cart: TEST_CART }])) as SubmitWorkerResult;
    assert.equal(submitted.responses[0]?.ok, true);
    const operationId = submitted.responses[0]?.result?.operation.id;
    assert.ok(typeof operationId === 'string');

    const database = openLedgerStore(databasePath);
    database.prepare("UPDATE operations SET status = 'failed', updated_at = ? WHERE operation_id = ?")
      .run(TEST_CLOCK, operationId);
    database.close();

    const replay = await runWorker('submit', submitConfig(databasePath, [{ idempotencyKey: 'terminal-key', cart: TEST_CART }])) as SubmitWorkerResult;
    assert.equal(replay.responses[0]?.ok, true);
    assert.equal(replay.responses[0]?.result?.operation.id, operationId);
  } finally {
    removeTempDir(dir);
  }
});

// Dual-open regression (LEDGER-R5-001): two fresh processes must race
// openLedgerStore on one fresh database with a start barrier and both end
// migrated and usable. The driver is materialized into the temp dir with its
// own package.json so a clean-child spawn outside the repo tree stays ESM.
const OPEN_DRIVER_TEMPLATE = (storeUrl: string) => `import { createInterface } from 'node:readline';
import { openLedgerStore } from '${storeUrl}';

process.stdout.write('READY\\n');
const reader = createInterface({ input: process.stdin });
const start = await new Promise<string>((resolve, reject) => {
  reader.once('line', resolve);
  reader.once('error', reject);
});
reader.close();
if (start.trim() !== 'GO') throw new Error('test driver did not receive the start barrier');
const database = openLedgerStore(process.argv[2]);
const applied = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
  .map((row) => (row as { version: number }).version);
const total = Number((database.prepare('SELECT COUNT(*) AS total FROM operations').get() as { total?: unknown }).total);
database.close();
process.stdout.write(JSON.stringify({ applied, total }) + '\\n', () => process.exit(0));
`;

interface OpenChildRun {
  ready: Promise<void>;
  release: () => void;
  done: Promise<{ applied: Array<number>; total: number }>;
}

function runOpenChild(driverPath: string, databasePath: string): OpenChildRun {
  let resolveChild!: (result: { applied: Array<number>; total: number }) => void;
  let rejectChild!: (error: Error) => void;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let released = false;
  const done = new Promise<{ applied: Array<number>; total: number }>((resolve, reject) => {
    resolveChild = resolve;
    rejectChild = reject;
  });
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const child = spawn(process.execPath, [driverPath, databasePath], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const fail = (message: string) => {
    child.kill('SIGKILL');
    const error = new Error(`${message}\nstderr: ${stderr}`);
    rejectChild(error);
    if (!released) rejectReady(error);
  };
  const deadline = setTimeout(() => fail('open driver timed out'), 120_000);
  child.on('error', (error) => { clearTimeout(deadline); fail(String(error)); });
  child.on('close', (code) => {
    clearTimeout(deadline);
    const resultLine = stdout.trim().split('\n').filter((line) => line.length > 0).pop();
    if (code !== 0 || resultLine === undefined) {
      rejectChild(new Error(`open driver exited ${code}\nstdout: ${stdout}\nstderr: ${stderr}`));
      if (!released) rejectReady(new Error(`open driver failed before readiness: exit ${code}`));
      return;
    }
    resolveChild(JSON.parse(resultLine) as { applied: Array<number>; total: number });
  });
  let readyBuffer = '';
  child.stdout.on('data', (chunk) => {
    readyBuffer += String(chunk);
    if (/READY/.test(readyBuffer) && !released) resolveReady();
  });
  return {
    ready,
    release: () => {
      released = true;
      child.stdin.write('GO\n');
    },
    done,
  };
}

test('start-barrier race: two fresh processes open one fresh database and both apply migrations', async () => {
  const home = makeTempDir('open-race');
  try {
    const driverPath = `${home}/open-driver.ts`;
    writeFileSync(driverPath, OPEN_DRIVER_TEMPLATE(new URL('../store.ts', import.meta.url).href));
    writeFileSync(`${home}/package.json`, JSON.stringify({ type: 'module' }));
    const expected = MIGRATIONS.map((migration) => migration.version);
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const dir = makeTempDir('open-race-db');
      try {
        const databasePath = `${dir}/ledger.db`;
        const first = runOpenChild(driverPath, databasePath);
        const second = runOpenChild(driverPath, databasePath);
        await Promise.all([first.ready, second.ready]);
        first.release();
        second.release();
        const [one, two] = await Promise.all([first.done, second.done]);
        assert.deepEqual(one.applied, expected);
        assert.deepEqual(two.applied, expected);
        assert.equal(one.total, 0);
        assert.equal(two.total, 0);
      } finally {
        removeTempDir(dir);
      }
    }
  } finally {
    removeTempDir(home);
  }
});

// Parent-process sanity for the fixture adapter the workers rely on.
test('fixture adapter agrees with the stored reservation total', async () => {
  const quote = await fixtureAdapter().quoteCart(CartSubmissionSchema.parse(TEST_CART), TEST_CLOCK);
  assert.equal(quote.totalMinor, TEST_CART_TOTAL_MINOR);
});
