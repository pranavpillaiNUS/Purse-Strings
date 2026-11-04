import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  LeaseLost,
  activateMandateRevision,
  assertLeaseHeld,
  claimLeaseRow,
  openLedgerStore,
  renewLeaseRow,
  runTransaction,
} from '../ledger/store.ts';
import {
  confirmMandateRevision,
  definePolicySnapshot,
  draftMandateRevision,
} from '../authority.ts';
import { createApplicationBackend, type ConfiguredSupplier } from '../application.ts';
import { createFakeProviderGateway, type FakeProviderScenario } from './fake.ts';
import type { ExecutionProvider } from './gateway.ts';
import { createExecutionWorker, type ExecutionResult, type ExecutionSupplier } from './worker.ts';
import type { SupplierAdapter } from '../../../suppliers/src/adapter.ts';
import type { Quote } from '../../../../packages/contracts/src/index.ts';
import { createFixtureSupplier } from '../../../suppliers/src/fixture.ts';
import {
  TEST_CART,
  TEST_CATALOG,
  TEST_CLOCK,
  TEST_MANDATE_DRAFT,
  TEST_POLICY,
  makeTempDir,
  removeTempDir,
} from '../ledger/tests/fixtures.ts';

// Multiprocess execution evidence: real child processes race and crash against
// shared SQLite files. Authority setup stays in this parent process; children
// only execute or reconcile operations. Crash evidence is a real SIGKILL issued
// by the parent exactly when the child emits CRASHPOINT from its injected hook.

const EXEC_WORKER_PATH = new URL('./test-worker.ts', import.meta.url).pathname;
const TEST_CLOCK_MS = Date.parse(TEST_CLOCK);
const EXPIRED_CLOCK = '2026-11-08T09:00:00.000Z'; // after TEST_MANDATE_DRAFT.purchaseBy
const LEASE_LAPSED_CLOCK = '2026-11-04T09:01:00.000Z'; // 60s after TEST_CLOCK: past the 30s lease
const RECOVERY_CLOCK = '2026-11-04T09:03:00.000Z'; // past an additional 30s lease taken at LEASE_LAPSED

const APPROVER = 'fixture-ops-manager';

interface Harness {
  directory: string;
  databasePath: string;
  providerDatabasePath: string;
  catalogPath: string;
  catalog: object;
  close(): void;
}

function seedConfirmedStore(databasePath: string, draftOverrides: Partial<typeof TEST_MANDATE_DRAFT> = {}): void {
  const database = openLedgerStore(databasePath);
  definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
  const draft = { ...TEST_MANDATE_DRAFT, ...draftOverrides };
  draftMandateRevision(database, draft, TEST_CLOCK);
  const digest = database.prepare(
    'SELECT digest FROM mandate_revisions WHERE mandate_id = ? AND version = ?',
  ).get(draft.id, draft.version);
  assert.ok(typeof (digest as { digest?: unknown })?.digest === 'string');
  confirmMandateRevision(
    database, draft.id, draft.version,
    (digest as { digest: string }).digest, APPROVER, TEST_CLOCK,
  );
  database.close();
}

async function createHarness(options: {
  prefix: string;
  draftOverrides?: Partial<typeof TEST_MANDATE_DRAFT>;
  catalog?: object;
}): Promise<Harness> {
  const directory = makeTempDir(options.prefix);
  const databasePath = `${directory}/app.db`;
  const providerDatabasePath = `${directory}/providers.db`;
  const catalogPath = `${directory}/catalog.json`;
  const catalog = options.catalog ?? TEST_CATALOG;
  writeFileSync(catalogPath, JSON.stringify(catalog));
  seedConfirmedStore(databasePath, options.draftOverrides ?? {});
  return {
    directory, databasePath, providerDatabasePath, catalogPath, catalog,
    close() { removeTempDir(directory); },
  };
}

function suppliersFor(catalogObject: object): ExecutionSupplier[] {
  // The caller decides which catalog the supplier actually quotes from: gate
  // scenarios submit under the stored catalog and execute against a changed one.
  return [
    { supplierId: 'store-a', catalog: TEST_CATALOG, adapter: createFixtureSupplier(catalogObject) },
  ];
}

/** Creates a reserved operation through the real application backend. */
async function submitOperation(harness: Harness, cart: object, key: string): Promise<{ operationId: string; totalMinor: number }> {
  const backend = createApplicationBackend({
    databasePath: harness.databasePath,
    // Submissions always quote the ORIGINAL configured catalog. Execution-side
    // changed catalogs are a separate scenario and must not leak into setup.
    suppliers: suppliersFor(TEST_CATALOG) as unknown as ConfiguredSupplier[],
    clock: () => TEST_CLOCK,
  });
  try {
    const response = await backend.handle({
      apiVersion: '1', requestId: 'test-submit', method: 'proposal.submit',
      params: { idempotencyKey: key, cart },
    });
    if (!response.ok || response.method !== 'proposal.submit') {
      assert.fail(`fixture submission failed: ${JSON.stringify(response)}`);
    }
    return { operationId: response.result.operation.id, totalMinor: response.result.operation.totalMinor };
  } finally {
    backend.close();
  }
}

function childConfig(
  harness: Harness,
  clock: string,
  operationId: string,
  mode: 'run' | 'reconcile',
  scenario?: FakeProviderScenario,
  extra: object = {},
): object {
  return {
    databasePath: harness.databasePath,
    providerDatabasePath: harness.providerDatabasePath,
    catalogPath: harness.catalogPath,
    clock,
    operationId,
    mode,
    scenario: scenario ?? {},
    // Crash scenarios block indefinitely; the parent decides by SIGKILL.
    providerTimeoutMs: null,
    ...extra,
  };
}

interface ChildOperation {
  kind?: string;
  message?: string;
  operation?: {
    status: string;
    reservationStatus: string;
    paymentStatus: string;
    orderStatus: string;
    refundStatus: string;
    readinessStatus: string;
    totalMinor: number;
  };
}

type ChildResult =
  | { kind: 'outcome'; result: ChildOperation }
  | { kind: 'killedAt' };

function runExecutionChild(config: object, mode: 'run' | 'reconcile'): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [EXEC_WORKER_PATH, mode], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let killedAt: string | null = null;
    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
      rejectChild(new Error(`execution worker timed out\nstderr: ${stderr}\nstdout: ${stdout}`));
    }, 45_000);
    child.on('error', (error) => { clearTimeout(deadline); rejectChild(error); });
    child.on('close', (code) => {
      clearTimeout(deadline);
      if (killedAt !== null) {
        resolveChild({ kind: 'killedAt' });
        return;
      }
      const lines = stdout.trim().split('\n').filter((line) => line.length > 0 && !line.startsWith('CRASHPOINT:'));
      const last = lines[lines.length - 1];
      if (code !== 0 || last === undefined) {
        rejectChild(new Error(`execution worker exited ${code}\nstderr: ${stderr}\nstdout: ${stdout}`));
        return;
      }
      resolveChild({ kind: 'outcome', result: (JSON.parse(last) as { outcome: ChildOperation }).outcome });
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += String(chunk);
      if (killedAt === null) {
        const match = /CRASHPOINT(?:-intent)?:(capture|order|refund)/.exec(String(chunk));
        if (match !== null) {
          killedAt = match[1]!;
          child.kill('SIGKILL');
        }
      }
      if (stdout.includes('READY') && !goSent) {
        goSent = true;
        child.stdin.write('GO\n');
      }
    });
    let goSent = false;
    child.stderr.on('data', (chunk: Buffer) => { stderr += String(chunk); });
    child.stdin.write(`${JSON.stringify(config)}\n`);
  });
}

function providerRowCount(providerDatabasePath: string, kind?: string): number {
  const database = new DatabaseSync(providerDatabasePath);
  try {
    const row = kind === undefined
      ? database.prepare('SELECT COUNT(*) AS total FROM provider_effects').get()
      : database.prepare('SELECT COUNT(*) AS total FROM provider_effects WHERE kind = ?').get(kind);
    return typeof row?.total === 'number' ? row.total : 0;
  } finally {
    database.close();
  }
}

function providerRowsFor(providerDatabasePath: string, effectKey: string): number {
  const database = new DatabaseSync(providerDatabasePath);
  try {
    const row = database.prepare('SELECT COUNT(*) AS total FROM provider_effects WHERE effect_key = ?')
      .get(effectKey);
    return typeof row?.total === 'number' ? row.total : 0;
  } finally {
    database.close();
  }
}

function providerEffectOutcomes(providerDatabasePath: string): Array<{ kind: string; outcome: string }> {
  const database = new DatabaseSync(providerDatabasePath);
  try {
    return (database.prepare('SELECT kind, outcome FROM provider_effects ORDER BY kind, effect_key').all() as
      Array<{ kind: string; outcome: string }>).map((row) => ({ kind: row.kind, outcome: row.outcome }));
  } finally {
    database.close();
  }
}

function operationAndReservation(databasePath: string, operationId: string): {
  operation: { status: string };
  reservation: { state: string; amountMinor: number };
} {
  const database = openLedgerStore(databasePath);
  try {
    const operation = database.prepare('SELECT status FROM operations WHERE operation_id = ?')
      .get(operationId) as { status: string } | undefined;
    const reservation = database.prepare('SELECT state, amount_minor FROM reservations WHERE operation_id = ?')
      .get(operationId) as { state: string; amount_minor: number } | undefined;
    assert.ok(operation !== undefined && reservation !== undefined, 'operation storage rows must exist');
    return {
      operation: { status: operation.status },
      reservation: { state: reservation.state, amountMinor: reservation.amount_minor },
    };
  } finally {
    database.close();
  }
}

function effectRow(databasePath: string, operationId: string, kind: string): { state: string; key: string } {
  const database = openLedgerStore(databasePath);
  try {
    const row = database.prepare('SELECT state, effect_key FROM effects WHERE operation_id = ? AND kind = ?')
      .get(operationId, kind) as { state: string; effect_key: string } | undefined;
    assert.ok(row !== undefined, `effect row for ${kind} must exist`);
    return { state: row.state, key: row.effect_key };
  } finally {
    database.close();
  }
}

function readEffectJson(databasePath: string, operationId: string, kind: string): { operationId: string; currency: string; amountMinor: number } {
  const database = openLedgerStore(databasePath);
  try {
    const row = database.prepare('SELECT request_json FROM effects WHERE operation_id = ? AND kind = ?')
      .get(operationId, kind) as { request_json: string } | undefined;
    assert.ok(row !== undefined, `effect row for ${kind} must exist`);
    return JSON.parse(row.request_json);
  } finally {
    database.close();
  }
}

test('a full run dispatches capture then order exactly once and consumes the reservation once', async () => {
  const harness = await createHarness({ prefix: 'exec-happy' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'happy-key');
    const provider = createFakeProviderGateway(harness.providerDatabasePath);
    const worker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog), provider, clock: () => TEST_CLOCK,
    });
    try {
      const result: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(result.kind, 'executed');
      if (result.kind !== 'executed') return;
      assert.equal(result.operation.status, 'ordered');
      assert.equal(result.operation.reservationStatus, 'consumed');
      assert.equal(result.operation.paymentStatus, 'succeeded');
      assert.equal(result.operation.orderStatus, 'succeeded');
      assert.equal(result.operation.refundStatus, 'not_started');
      assert.equal(result.operation.readinessStatus, 'not_assessed');
      assert.equal(result.operation.totalMinor, submitted.totalMinor);
      assert.equal(providerRowCount(harness.providerDatabasePath), 2);
      assert.deepEqual(
        providerEffectOutcomes(harness.providerDatabasePath),
        [{ kind: 'capture', outcome: 'succeeded' }, { kind: 'order', outcome: 'succeeded' }],
      );
      const stored = operationAndReservation(harness.databasePath, submitted.operationId);
      assert.equal(stored.reservation.state, 'consumed');
      assert.equal(stored.reservation.amountMinor, submitted.totalMinor);
      assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').key,
        `${submitted.operationId}:capture`);
      // Re-running a terminal operation is a sanitized passthrough, not a retry.
      const repeat: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(repeat.kind, 'already_terminal');
      assert.equal(providerRowCount(harness.providerDatabasePath), 2);
    } finally {
      worker.close();
      provider.close();
    }
  } finally {
    harness.close();
  }
});

test('SIGKILL after the capture commit recovers to its established outcome even after mandate expiry; no blind refund', async () => {
  const harness = await createHarness({ prefix: 'exec-crash-capture' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'crash-capture-key');
    const killed = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run', { crashAfterCommit: 'capture' }), 'run',
    );
    assert.equal(killed.kind, 'killedAt');
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'order'), 0);
    // The application never recorded the response before the kill.
    const intermediates = operationAndReservation(harness.databasePath, submitted.operationId);
    assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').state, 'in_flight');
    assert.equal(intermediates.reservation.state, 'active');
    // Fresh process, mandate long expired: the persisted provider row is the
    // definitive evidence, so authority is consumed, the original order runs,
    // and no refund is invented.
    const recovered = await runExecutionChild(
      childConfig(harness, EXPIRED_CLOCK, submitted.operationId, 'run'), 'run',
    );
    assert.equal(recovered.kind, 'outcome');
    if (recovered.kind !== 'outcome') return;
    assert.equal(recovered.result.operation?.status, 'ordered');
    assert.equal(recovered.result.operation?.paymentStatus, 'succeeded');
    assert.equal(recovered.result.operation?.reservationStatus, 'consumed');
    assert.equal(recovered.result.operation?.refundStatus, 'not_started');
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'order'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'refund'), 0);
  } finally {
    harness.close();
  }
});

test('SIGKILL after the order commit recovers to ordered with exactly one provider effect per kind', async () => {
  const harness = await createHarness({ prefix: 'exec-crash-order' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'crash-order-key');
    const killed = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run', { crashAfterCommit: 'order' }), 'run',
    );
    assert.equal(killed.kind, 'killedAt');
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'order'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'refund'), 0);
    const recovered = await runExecutionChild(
      childConfig(harness, LEASE_LAPSED_CLOCK, submitted.operationId, 'run'), 'run',
    );
    assert.equal(recovered.kind, 'outcome');
    if (recovered.kind !== 'outcome') return;
    assert.equal(recovered.result.operation?.status, 'ordered');
    assert.equal(recovered.result.operation?.orderStatus, 'succeeded');
    assert.equal(providerRowCount(harness.providerDatabasePath), 2);
  } finally {
    harness.close();
  }
});

test('two fresh workers race one operation at a start barrier; exactly one ends ordered and effects stay singular', async () => {
  const harness = await createHarness({ prefix: 'exec-race' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'race-key');
    const configuration = childConfig(harness, TEST_CLOCK, submitted.operationId, 'run');
    const [one, two, three] = await Promise.all([
      runExecutionChild(configuration, 'run'),
      runExecutionChild(configuration, 'run'),
      runExecutionChild(configuration, 'run'),
    ]);
    const kinds = [one, two, three].map((entry) =>
      entry.kind === 'outcome' ? entry.result.kind ?? '<unset>' : '<killed>');
    const executed = [one, two, three].filter((entry) =>
      entry.kind === 'outcome' && entry.result.kind === 'executed');
    assert.equal(executed.length, 1, `exactly one worker executes: ${JSON.stringify(kinds)}`);
    assert.ok([one, two, three].every((entry) =>
      entry.kind === 'killedAt'
      || entry.result.kind === 'executed' || entry.result.kind === 'already_terminal' || entry.result.kind === 'busy'),
    `losers must be sanitized outcomes: ${JSON.stringify([one, two, three])}`);
    const winner = executed[0];
    if (winner !== undefined && winner.kind === 'outcome') {
      assert.equal(winner.result.operation?.status, 'ordered');
    }
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'order'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'refund'), 0);
    const stored = operationAndReservation(harness.databasePath, submitted.operationId);
    assert.equal(stored.reservation.state, 'consumed');
    assert.equal(stored.reservation.amountMinor, submitted.totalMinor);
  } finally {
    harness.close();
  }
});

test('a lapsed lease is fenced: unexpired workers busy, stale generations cannot renew or commit, recovery takes generation+1', async () => {
  const harness = await createHarness({ prefix: 'exec-lease' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'lease-key');
    const killed = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run', { crashAfterCommit: 'capture' }), 'run',
    );
    assert.equal(killed.kind, 'killedAt');
    // The dead worker's lease is still owned and unexpired: the next worker
    // gets sanitized BUSY and dispatches nothing.
    const blocked = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run'), 'run',
    );
    assert.equal(blocked.kind, 'outcome');
    if (blocked.kind !== 'outcome') return;
    assert.equal(blocked.result.kind, 'busy');
    assert.doesNotMatch(blocked.result.message ?? '', /[0-9a-f]{8}-[0-9a-f]{4}/i,
      'sanitized BUSY never leaks lease owner ids');
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'order'), 0);

    // Store-level fencing on the same DB: a stale generation cannot renew or
    // commit, and once lapsed, the old owner loses everything too.
    const database = openLedgerStore(harness.databasePath);
    try {
      const lease = database.prepare('SELECT owner_id, generation, expires_at_ms FROM worker_leases WHERE operation_id = ?')
        .get(submitted.operationId) as { owner_id: string; generation: number; expires_at_ms: number };
      assert.ok(lease.owner_id !== null);
      const staleGeneration = lease.generation - 1;
      assert.throws(() => runTransaction(database, () => {
        assertLeaseHeld(database, submitted.operationId, lease.owner_id!, staleGeneration, TEST_CLOCK_MS);
        database.prepare("UPDATE operations SET status = 'failed', updated_at = ? WHERE operation_id = ?")
          .run(TEST_CLOCK, submitted.operationId);
      }), LeaseLost, 'stale generation commits must be rejected');
      assert.equal(operationAndReservation(harness.databasePath, submitted.operationId).reservation.state,
        'active', 'the fenced write must have rolled back');
      assert.throws(() => runTransaction(database, () => {
        renewLeaseRow(database, submitted.operationId, lease.owner_id!, staleGeneration, TEST_CLOCK_MS, 30_000);
      }), LeaseLost, 'stale generation renewal must be rejected');
      // Once the real lease lapses, a stale owner can neither renew nor commit.
      assert.throws(() => runTransaction(database, () => {
        renewLeaseRow(database, submitted.operationId, lease.owner_id!, lease.generation,
          Date.parse(LEASE_LAPSED_CLOCK), 30_000);
      }), LeaseLost, 'expired workers cannot renew');
      assert.throws(() => runTransaction(database, () => {
        assertLeaseHeld(database, submitted.operationId, lease.owner_id!, lease.generation, Date.parse(LEASE_LAPSED_CLOCK));
        database.prepare('UPDATE worker_leases SET expires_at_ms = ? WHERE operation_id = ?')
          .run(Date.parse(LEASE_LAPSED_CLOCK) + 30_000, submitted.operationId);
      }), LeaseLost, 'expired workers cannot commit');
      // Recovery claims generation+1.
      const takeover = runTransaction(database, () =>
        claimLeaseRow(database, submitted.operationId, 'recovery-owner', Date.parse(LEASE_LAPSED_CLOCK), 30_000));
      assert.equal(takeover.kind, 'claimed');
      if (takeover.kind === 'claimed') assert.equal(takeover.generation, lease.generation + 1);
      const conflict = runTransaction(database, () =>
        claimLeaseRow(database, submitted.operationId, 'second-owner', Date.parse(LEASE_LAPSED_CLOCK), 30_000));
      assert.equal(conflict.kind, 'conflict');
    } finally {
      database.close();
    }
    // A genuine recovery run finishes the operation despite the history: it
    // must take over again once this takeover's lease has lapsed too.
    const recovered = await runExecutionChild(
      childConfig(harness, RECOVERY_CLOCK, submitted.operationId, 'run'), 'run',
    );
    assert.equal(recovered.kind, 'outcome');
    if (recovered.kind === 'outcome') {
      assert.equal(recovered.result.operation?.status, 'ordered');
    }
  } finally {
    harness.close();
  }
});

test('a persisted intent that was never dispatched stays safe to fail once eligibility lapses and can never dispatch', async () => {
  const harness = await createHarness({ prefix: 'exec-intent' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'intent-key');
    const killed = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run', undefined, { pauseAfterIntent: 'capture' }),
      'run',
    );
    assert.equal(killed.kind, 'killedAt');
    // The intent row is durable; the provider database has nothing at all.
    assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').state, 'intent');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    assert.equal(operationAndReservation(harness.databasePath, submitted.operationId).reservation.state, 'active');

    // With eligibility expired, the never-dispatched intent cannot satisfy the
    // capture gate: it stays not-applied, authority is released, and the
    // operation safely fails without any provider mutation.
    const failed = await runExecutionChild(
      childConfig(harness, EXPIRED_CLOCK, submitted.operationId, 'run'), 'run',
    );
    assert.equal(failed.kind, 'outcome');
    if (failed.kind !== 'outcome') return;
    assert.equal(failed.result.kind, 'executed');
    assert.equal(failed.result.operation?.status, 'failed');
    assert.equal(failed.result.operation?.paymentStatus, 'intent');
    assert.equal(failed.result.operation?.reservationStatus, 'released');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);
  } finally {
    harness.close();
  }
});

test('capture gate failures prevent the first mutation: expired deadline, changed terms, stale evidence', async () => {
  const bumpedLaptop = { ...TEST_CATALOG.products[0]!, unitPriceMinor: TEST_CATALOG.products[0]!.unitPriceMinor + 1 };
  const staleEvidence = TEST_CATALOG.products.map((product) => product.sku === 'LAP-14-AIR'
    ? { ...product, productEvidence: { ...product.productEvidence, observedAt: '2026-10-31T00:00:00Z' } }
    : product);
  const cases: Array<{ name: string; clock: string; catalog: object }> = [
    { name: 'expired-purchase-by', clock: EXPIRED_CLOCK, catalog: TEST_CATALOG },
    {
      name: 'changed-quote-terms', clock: TEST_CLOCK,
      catalog: { ...TEST_CATALOG, products: [bumpedLaptop, ...TEST_CATALOG.products.slice(1)] },
    },
    { name: 'stale-evidence', clock: TEST_CLOCK, catalog: { ...TEST_CATALOG, products: staleEvidence } },
  ];
  for (const scenario of cases) {
    const harness = await createHarness({ prefix: 'exec-gate', catalog: scenario.catalog });
    try {
      const submitted = await submitOperation(harness, TEST_CART, `gate-${scenario.name}`);
      const provider = createFakeProviderGateway(harness.providerDatabasePath);
      const worker = createExecutionWorker({
        databasePath: harness.databasePath,
        suppliers: suppliersFor(harness.catalog),
        provider,
        clock: () => scenario.clock,
      });
      try {
        const result: ExecutionResult = await worker.run(submitted.operationId);
        assert.equal(result.kind, 'executed');
        if (result.kind !== 'executed') return;
        assert.equal(result.operation.status, 'failed', scenario.name);
        assert.equal(result.operation.reservationStatus, 'released', scenario.name);
        assert.equal(result.operation.paymentStatus, 'not_started', scenario.name);
        assert.equal(providerRowCount(harness.providerDatabasePath), 0, scenario.name);
        const stored = operationAndReservation(harness.databasePath, submitted.operationId);
        assert.equal(stored.reservation.state, 'released', scenario.name);
      } finally {
        worker.close();
        provider.close();
      }
    } finally {
      harness.close();
    }
  }
});

test('the capture gate revalidates against totals excluding the operation own reservation', async () => {
  const harness = await createHarness({ prefix: 'exec-gate-exclusion' });
  try {
    const prior = { ...TEST_CART, id: 'prior-quantity-cart', lines: [
      { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 2 },
    ] };
    const priorOperation = await submitOperation(harness, prior, 'prior-key');
    assert.equal(priorOperation.totalMinor, 239582);
    const own = { ...TEST_CART, id: 'own-quantity-cart', lines: [
      { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 3 },
    ] };
    const ownOperation = await submitOperation(harness, own, 'own-key');
    const provider = createFakeProviderGateway(harness.providerDatabasePath);
    const worker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog), provider, clock: () => TEST_CLOCK,
    });
    try {
      const result: ExecutionResult = await worker.run(ownOperation.operationId);
      assert.equal(result.kind, 'executed');
      if (result.kind !== 'executed') return;
      // 2 committed/laptops + 3 laptop dispatch = 5 units: only valid when the
      // gate ignores this operation's own 3-laptop reservation.
      assert.equal(result.operation.status, 'ordered');
      assert.equal(result.operation.reservationStatus, 'consumed');
    } finally {
      worker.close();
      provider.close();
    }
  } finally {
    harness.close();
  }
});

test('an unconfigured approved supplier fails the capture gate before any dispatch', async () => {
  const harness = await createHarness({ prefix: 'exec-gate-supplier' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'gate-supplier-key');
    const provider = createFakeProviderGateway(harness.providerDatabasePath);
    const worker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: [], provider, clock: () => TEST_CLOCK,
    });
    try {
      const result: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(result.kind, 'executed');
      assert.equal(result.kind === 'executed' && result.operation.status, 'failed');
      assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    } finally {
      worker.close();
      provider.close();
    }
  } finally {
    harness.close();
  }
});

test('a lost provider response persists unknown; reconcile resolves it from the definitive provider row without dispatching', async () => {
  const harness = await createHarness({ prefix: 'exec-unknown' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'unknown-key');
    const first = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run', { responseLossFor: 'capture' }), 'run',
    );
    assert.equal(first.kind, 'outcome');
    if (first.kind !== 'outcome') return;
    assert.equal(first.result.kind, 'executed');
    assert.equal(first.result.operation?.paymentStatus, 'unknown');
    assert.equal(first.result.operation?.status, 'reconciliation_required');
    assert.equal(first.result.operation?.reservationStatus, 'active');
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 1);

    // Reconcile consults the provider DB: the durable row is definitive, so the
    // captured outcome is recorded and authority is consumed. Reconciliation
    // itself never dispatches new effects (no order appears).
    const reconciled = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'reconcile'), 'reconcile',
    );
    assert.equal(reconciled.kind, 'outcome');
    if (reconciled.kind !== 'outcome') return;
    assert.equal(reconciled.result.operation?.paymentStatus, 'succeeded');
    assert.equal(reconciled.result.operation?.reservationStatus, 'consumed');
    assert.equal(reconciled.result.operation?.orderStatus, 'not_started');
    assert.equal(reconciled.result.operation?.status, 'running');
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'order'), 0);

    // A full run then completes the original order flow.
    const completed = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run'), 'run',
    );
    assert.equal(completed.kind, 'outcome');
    if (completed.kind !== 'outcome') return;
    assert.equal(completed.result.operation?.status, 'ordered');
    assert.equal(providerRowCount(harness.providerDatabasePath), 2);
  } finally {
    harness.close();
  }
});

test('absence after an ambiguous attempt retains authority, never retries new keys, and only a definitive rejection releases', async () => {
  const harness = await createHarness({ prefix: 'exec-absence' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'absence-key');
    // Kill the worker BEFORE the provider commits: the effect marker is
    // in-flight and the provider DB stays empty.
    const attached = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run', { crashBeforeCommit: 'capture' }), 'run',
    );
    assert.equal(attached.kind, 'killedAt');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').state, 'in_flight');

    // Absence alone with a live in-flight marker: reconcile retains, never
    // releases, never dispatches.
    const reconciled = await runExecutionChild(
      childConfig(harness, LEASE_LAPSED_CLOCK, submitted.operationId, 'reconcile'), 'reconcile',
    );
    assert.equal(reconciled.kind, 'outcome');
    if (reconciled.kind !== 'outcome') return;
    assert.equal(reconciled.result.operation?.paymentStatus, 'unknown');
    assert.equal(reconciled.result.operation?.status, 'reconciliation_required');
    assert.equal(reconciled.result.operation?.reservationStatus, 'active');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);

    // Even after the mandate expires, absence is not release evidence.
    const expiredReconcile = await runExecutionChild(
      childConfig(harness, EXPIRED_CLOCK, submitted.operationId, 'reconcile'), 'reconcile',
    );
    assert.equal(expiredReconcile.kind, 'outcome');
    if (expiredReconcile.kind !== 'outcome') return;
    assert.equal(expiredReconcile.result.operation?.reservationStatus, 'active');
    assert.equal(expiredReconcile.result.operation?.paymentStatus, 'unknown');
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 0);

    // A durably definitive provider rejection record is the required release
    // evidence. Renewed eligibility retries the original key and payload only
    // (the provider commits the rejected row under that same key).
    const rejectedProvider = createFakeProviderGateway(harness.providerDatabasePath, { rejectFor: 'capture' });
    const rejectionWorker = createExecutionWorker({
      databasePath: harness.databasePath,
      suppliers: suppliersFor(harness.catalog),
      provider: rejectedProvider,
      clock: () => TEST_CLOCK,
    });
    try {
      const released = await rejectionWorker.run(submitted.operationId);
      assert.equal(released.kind, 'executed');
      if (released.kind !== 'executed') return;
      assert.equal(released.operation.status, 'failed');
      assert.equal(released.operation.reservationStatus, 'released');
      assert.equal(released.operation.paymentStatus, 'rejected');
      const rows = providerEffectOutcomes(harness.providerDatabasePath).filter((row) => row.kind === 'capture');
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.outcome, 'rejected');
      assert.equal(providerRowsFor(harness.providerDatabasePath, `${submitted.operationId}:capture`), 1);
      // The effect identity never moved to a second key.
      assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').key,
        `${submitted.operationId}:capture`);
      const stored = operationAndReservation(harness.databasePath, submitted.operationId);
      assert.equal(stored.reservation.state, 'released');
    } finally {
      rejectionWorker.close();
      rejectedProvider.close();
    }
  } finally {
    harness.close();
  }
});

test('renewed eligibility retries the original absent capture with the same key and payload into a clean success', async () => {
  const harness = await createHarness({ prefix: 'exec-retry' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'retry-key');
    const attached = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run', { crashBeforeCommit: 'capture' }), 'run',
    );
    assert.equal(attached.kind, 'killedAt');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').state, 'in_flight');
    const requestBefore = readEffectJson(harness.databasePath, submitted.operationId, 'capture');

    // Renewed eligibility, full run: the original key is retried.
    const retried = await runExecutionChild(
      childConfig(harness, LEASE_LAPSED_CLOCK, submitted.operationId, 'run'), 'run',
    );
    assert.equal(retried.kind, 'outcome');
    if (retried.kind !== 'outcome') return;
    assert.equal(retried.result.kind, 'executed');
    assert.equal(retried.result.operation?.status, 'ordered');
    // Same key, same immutable request payload, exactly one provider attempt.
    assert.equal(providerRowsFor(harness.providerDatabasePath, `${submitted.operationId}:capture`), 1);
    assert.equal(providerRowsFor(harness.providerDatabasePath, `${submitted.operationId}:order`), 1);
    const effectKeyStored = effectRow(harness.databasePath, submitted.operationId, 'capture');
    assert.equal(effectKeyStored.key, `${submitted.operationId}:capture`);
    assert.deepEqual(readEffectJson(harness.databasePath, submitted.operationId, 'capture'), requestBefore);
  } finally {
    harness.close();
  }
});

test('confirmed order rejection leads to a refund that never restores authority; unknown order still forbids refund after expiry', async () => {
  const harness = await createHarness({ prefix: 'exec-refund' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'refund-key');
    const provider = createFakeProviderGateway(harness.providerDatabasePath, { rejectFor: 'order' });
    const worker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog), provider, clock: () => TEST_CLOCK,
    });
    try {
      const result: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(result.kind, 'executed');
      if (result.kind !== 'executed') return;
      // Order rejected durably, so the compensation refund proceeds in-run.
      assert.equal(result.operation.status, 'compensated');
      assert.equal(result.operation.paymentStatus, 'succeeded');
      assert.equal(result.operation.orderStatus, 'rejected');
      assert.equal(result.operation.refundStatus, 'succeeded');
      assert.equal(result.operation.readinessStatus, 'not_assessed');
      assert.deepEqual(providerEffectOutcomes(harness.providerDatabasePath).sort((a, b) => a.kind.localeCompare(b.kind)), [
        { kind: 'capture', outcome: 'succeeded' },
        { kind: 'order', outcome: 'rejected' },
        { kind: 'refund', outcome: 'succeeded' },
      ]);
      // Refund consumed nothing back: money stays spent, quantities stay spent.
      const stored = operationAndReservation(harness.databasePath, submitted.operationId);
      assert.equal(stored.reservation.state, 'consumed');
      const database = openLedgerStore(harness.databasePath);
      try {
        const totals = database.prepare(
          `SELECT r.state AS state, r.amount_minor AS amount
           FROM reservations AS r WHERE r.operation_id = ?`,
        ).get(submitted.operationId) as { state: string; amount: number };
        assert.equal(totals.state, 'consumed');
        assert.equal(totals.amount, submitted.totalMinor);
      } finally {
        database.close();
      }
    } finally {
      worker.close();
      provider.close();
    }

    // Unknown order: refund is forbidden, no matter how late reconciliation runs.
    const unknownOrder = { ...TEST_CART, id: 'unknown-order-cart', lines: [
      { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 1 },
    ] };
    const second = await submitOperation(harness, unknownOrder, 'unknown-order-key');
    const attached = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, second.operationId, 'run', { crashBeforeCommit: 'order' }), 'run',
    );
    assert.equal(attached.kind, 'killedAt');
    // The first operation's durably committed order row is the only one so far,
    // and the second operation committed nothing new.
    assert.equal(providerRowCount(harness.providerDatabasePath, 'order'), 1);
    assert.equal(providerRowsFor(harness.providerDatabasePath, `${second.operationId}:order`), 0);
    const forbidden = await runExecutionChild(
      childConfig(harness, EXPIRED_CLOCK, second.operationId, 'run'), 'run',
    );
    assert.equal(forbidden.kind, 'outcome');
    if (forbidden.kind !== 'outcome') return;
    assert.equal(forbidden.result.operation?.orderStatus, 'unknown');
    assert.equal(forbidden.result.operation?.status, 'reconciliation_required');
    assert.equal(forbidden.result.operation?.refundStatus, 'not_started');
    assert.equal(forbidden.result.operation?.reservationStatus, 'consumed');
    assert.equal(providerRowsFor(harness.providerDatabasePath, `${second.operationId}:refund`), 0);

    // Terminal commerce outcomes stay untouched: reconcile is a safe passthrough.
    const settle = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, second.operationId, 'reconcile'), 'reconcile',
    );
    assert.equal(settle.kind, 'outcome');
    if (settle.kind === 'outcome') {
      assert.equal(settle.result.operation?.orderStatus, 'unknown');
      assert.equal(settle.result.operation?.refundStatus, 'not_started');
    }
  } finally {
    harness.close();
  }
});

test('a long run renews its lease on a fresh clock; expiry grows past claim-time plus the TTL', async () => {
  const harness = await createHarness({ prefix: 'exec-lease-fresh' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'lease-fresh-key');
    let clockMs = Date.parse(TEST_CLOCK);
    const provider = createFakeProviderGateway(harness.providerDatabasePath);
    // Each provider dispatch advances the simulated clock across a renewed
    // lease window, so the post-capture commit would hit a stale lease if
    // renewal still expired against claim time.
    const advancingProvider: ExecutionProvider = {
      async applyEffect(key, kind, request) {
        clockMs += 20_000;
        return await provider.applyEffect(key, kind, request);
      },
      async lookupEffect(key) { return await provider.lookupEffect(key); },
    };
    const worker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog),
      provider: advancingProvider, clock: () => new Date(clockMs).toISOString(),
    });
    try {
      const result: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(result.kind, 'executed');
      if (result.kind !== 'executed') return;
      assert.equal(result.operation.status, 'ordered');
      const database = openLedgerStore(harness.databasePath);
      try {
        const lease = database.prepare(
          'SELECT expires_at_ms FROM worker_leases WHERE operation_id = ?',
        ).get(submitted.operationId) as { expires_at_ms: number };
        assert.ok(lease.expires_at_ms > Date.parse(TEST_CLOCK) + 30_000,
          `lease must be extended beyond claim-time+TTL, got ${lease.expires_at_ms}`);
      } finally {
        database.close();
      }
      assert.equal(providerRowCount(harness.providerDatabasePath), 2);
    } finally {
      worker.close();
      provider.close();
    }
  } finally {
    harness.close();
  }
});

test('an unresponsive supplier quotation is bounded and fails the capture gate before any mutation', async () => {
  const harness = await createHarness({ prefix: 'exec-gate-slow' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'gate-slow-key');
    const hangingAdapter: SupplierAdapter = {
      quoteCart: () => new Promise<Quote>(() => {}),
    };
    const provider = createFakeProviderGateway(harness.providerDatabasePath);
    const worker = createExecutionWorker({
      databasePath: harness.databasePath,
      suppliers: [{ supplierId: 'store-a', catalog: TEST_CATALOG, adapter: hangingAdapter }],
      provider,
      clock: () => TEST_CLOCK,
      providerTimeoutMs: 50,
    });
    try {
      const result: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(result.kind, 'executed');
      if (result.kind !== 'executed') return;
      assert.equal(result.operation.status, 'failed');
      assert.equal(result.operation.paymentStatus, 'not_started');
      assert.equal(result.operation.reservationStatus, 'released');
      assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    } finally {
      worker.close();
      provider.close();
    }
  } finally {
    harness.close();
  }
});

test('an active version pointing at an unconfirmed revision fails the capture gate as invalid authority before any mutation', async () => {
  const harness = await createHarness({ prefix: 'exec-gate-noauthority' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'authority-missing-key');
    // Confirmations are immutable, so the simplest reachable invalid-authority
    // state is a store-level activation of a legitimately drafted but never
    // confirmed revision: active_version must not trail unconfirmed trust.
    const database = openLedgerStore(harness.databasePath);
    try {
      draftMandateRevision(database, { ...TEST_MANDATE_DRAFT, version: 2 }, TEST_CLOCK);
      activateMandateRevision(database, TEST_MANDATE_DRAFT.id, 2);
    } finally {
      database.close();
    }
    const provider = createFakeProviderGateway(harness.providerDatabasePath);
    const worker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog), provider, clock: () => TEST_CLOCK,
    });
    try {
      const result: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(result.kind, 'executed');
      if (result.kind !== 'executed') return;
      assert.equal(result.operation.status, 'failed');
      assert.equal(result.operation.paymentStatus, 'not_started');
      assert.equal(result.operation.reservationStatus, 'released');
      assert.equal(result.operation.readinessStatus, 'not_assessed');
      const stored = operationAndReservation(harness.databasePath, submitted.operationId);
      assert.equal(stored.reservation.state, 'released');
      assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    } finally {
      worker.close();
      provider.close();
    }
  } finally {
    harness.close();
  }
});

test('the fake provider surfaces a same-key different-digest apply as unknown and never fabricates a row', async () => {
  const directory = makeTempDir('fake-digest');
  try {
    const provider = createFakeProviderGateway(`${directory}/providers.db`);
    try {
      const first = await provider.applyEffect('op-digest:capture', 'capture', { operationId: 'op-digest', amountMinor: 100 });
      assert.equal(first.outcome, 'succeeded');
      if (first.outcome !== 'succeeded') return;
      const replay = await provider.applyEffect('op-digest:capture', 'capture', { operationId: 'op-digest', amountMinor: 500 });
      assert.deepEqual(replay, { outcome: 'unknown' });
      const lookup = await provider.lookupEffect('op-digest:capture');
      assert.equal(lookup.outcome, 'succeeded');
      if (lookup.outcome !== 'succeeded') return;
      assert.equal(lookup.providerId, first.providerId);
      assert.equal(lookup.responseJson, first.responseJson);
      assert.equal(provider.countProviderRows(), 1, 'the conflict must not create or mutate provider rows');
    } finally {
      provider.close();
    }
  } finally {
    removeTempDir(directory);
  }
});

test('a full run over a persisted ambiguous capture at lapsed eligibility retains authority for reconciliation', async () => {
  const harness = await createHarness({ prefix: 'exec-persist-vague' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'persist-vague-key');
    const killed = await runExecutionChild(
      childConfig(harness, TEST_CLOCK, submitted.operationId, 'run', { crashBeforeCommit: 'capture' }), 'run',
    );
    assert.equal(killed.kind, 'killedAt');
    assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').state, 'in_flight');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);

    // Full run, not reconcile, at a clock past the mandate deadline: absence is
    // never release evidence, so authority stays reserved and the operation is
    // retained for reconciliation without any provider mutation.
    const retained = await runExecutionChild(
      childConfig(harness, EXPIRED_CLOCK, submitted.operationId, 'run'), 'run',
    );
    assert.equal(retained.kind, 'outcome');
    if (retained.kind !== 'outcome') return;
    assert.equal(retained.result.kind, 'executed');
    assert.equal(retained.result.operation?.status, 'reconciliation_required');
    assert.equal(retained.result.operation?.paymentStatus, 'unknown');
    assert.equal(retained.result.operation?.orderStatus, 'not_started');
    assert.equal(retained.result.operation?.refundStatus, 'not_started');
    assert.equal(retained.result.operation?.reservationStatus, 'active');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    const stored = operationAndReservation(harness.databasePath, submitted.operationId);
    assert.equal(stored.reservation.state, 'active');
  } finally {
    harness.close();
  }
});

test('the capture gate validates money only when its own reservation is excluded, proven just below the mandate cap', async () => {
  const harness = await createHarness({ prefix: 'exec-gate-money' });
  try {
    // 4 laptops + 5 monitors consumed = 631219 minor. Adding one more laptop
    // (119791) stays under the 800000 mandate budget only while the gate
    // excludes this operation's own active reservation; counting it twice
    // would cross the cap and fail the dispatch.
    const prior = { ...TEST_CART, id: 'money-prior-cart', lines: [
      { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 4 },
      { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 5 },
    ] };
    const priorOperation = await submitOperation(harness, prior, 'money-prior-key');
    assert.equal(priorOperation.totalMinor, 631219);
    const own = { ...TEST_CART, id: 'money-cap-cart', lines: [
      { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 1 },
    ] };
    const ownOperation = await submitOperation(harness, own, 'money-cap-key');
    assert.equal(ownOperation.totalMinor, 119791);
    const provider = createFakeProviderGateway(harness.providerDatabasePath);
    const worker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog), provider, clock: () => TEST_CLOCK,
    });
    try {
      const priorResult: ExecutionResult = await worker.run(priorOperation.operationId);
      assert.equal(priorResult.kind === 'executed' && priorResult.operation.status, 'ordered');
      const result: ExecutionResult = await worker.run(ownOperation.operationId);
      assert.equal(result.kind, 'executed');
      if (result.kind !== 'executed') return;
      assert.equal(result.operation.status, 'ordered');
      assert.equal(result.operation.reservationStatus, 'consumed');
    } finally {
      worker.close();
      provider.close();
    }
  } finally {
    harness.close();
  }
});

test('a compensation_pending replay never re-records capture_succeeded without a transition', async () => {
  const harness = await createHarness({ prefix: 'exec-replay-audit' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'replay-audit-key');
    const provider = createFakeProviderGateway(harness.providerDatabasePath,
      { rejectFor: 'order', responseLossFor: 'refund' });
    const worker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog), provider, clock: () => TEST_CLOCK,
    });
    try {
      const first: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(first.kind, 'executed');
      if (first.kind !== 'executed') return;
      assert.equal(first.operation.status, 'compensation_pending');
      assert.equal(first.operation.orderStatus, 'rejected');
      assert.equal(first.operation.refundStatus, 'unknown');
      const captureSucceededCount = () => {
        const database = openLedgerStore(harness.databasePath);
        try {
          const row = database.prepare(
            "SELECT COUNT(*) AS total FROM audit_events WHERE operation_id = ? AND kind = 'capture_succeeded'",
          ).get(submitted.operationId) as { total: number };
          return row.total;
        } finally {
          database.close();
        }
      };
      assert.equal(captureSucceededCount(), 1);

      // A replay through the capture-succeeded branch with the reservation
      // already consumed must not append the audit event again.
      const replay: ExecutionResult = await worker.run(submitted.operationId);
      assert.equal(replay.kind, 'executed');
      if (replay.kind !== 'executed') return;
      assert.equal(providerRowsFor(harness.providerDatabasePath, `${submitted.operationId}:capture`), 1);
      assert.equal(providerRowsFor(harness.providerDatabasePath, `${submitted.operationId}:order`), 1);
      assert.equal(captureSucceededCount(), 1, 'replays must not duplicate capture_succeeded');
    } finally {
      worker.close();
      provider.close();
    }
  } finally {
    harness.close();
  }
});

test('a bounded lookup that never settles maps to unknown exactly like an apply timeout: retained, no new-key retry, zero provider rows', async () => {
  const harness = await createHarness({ prefix: 'exec-lookup-timeout' });
  try {
    const submitted = await submitOperation(harness, TEST_CART, 'lookup-timeout-key');

    // First in-process run: the apply call never resolves, so the bounded
    // budget sends the capture to reconciliation with zero provider commits.
    const lostGateway = createFakeProviderGateway(harness.providerDatabasePath);
    const hangingApply: ExecutionProvider = {
      async applyEffect(): Promise<never> { return await new Promise<never>(() => {}); },
      async lookupEffect(key) { return await lostGateway.lookupEffect(key); },
    };
    const firstWorker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog),
      provider: hangingApply, clock: () => TEST_CLOCK, providerTimeoutMs: 50,
    });
    try {
      const first = await firstWorker.run(submitted.operationId);
      assert.equal(first.kind, 'executed');
      if (first.kind !== 'executed') return;
      assert.equal(first.operation.status, 'reconciliation_required');
      assert.equal(first.operation.paymentStatus, 'unknown');
      assert.equal(first.operation.reservationStatus, 'active');
      assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    } finally {
      firstWorker.close();
      lostGateway.close();
    }

    // Second run: the LOOKUP itself never settles while the earlier attempt
    // stays ambiguous. The bounded budget maps it to unknown on the same seam,
    // so the capture lands in the identical ambiguous/reconciliation branches:
    // authority retained, order and refund forbidden, the original effect key
    // and payload preserved, and never a new-key retry.
    const hangingLookup: ExecutionProvider = {
      async applyEffect(): Promise<never> { return await new Promise<never>(() => {}); },
      async lookupEffect(): Promise<never> { return await new Promise<never>(() => {}); },
    };
    const secondWorker = createExecutionWorker({
      databasePath: harness.databasePath, suppliers: suppliersFor(harness.catalog),
      provider: hangingLookup, clock: () => TEST_CLOCK, providerTimeoutMs: 50,
    });
    try {
      const second = await secondWorker.run(submitted.operationId);
      assert.equal(second.kind, 'executed');
      if (second.kind !== 'executed') return;
      assert.equal(second.operation.status, 'reconciliation_required');
      assert.equal(second.operation.paymentStatus, 'unknown');
      assert.equal(second.operation.orderStatus, 'not_started');
      assert.equal(second.operation.refundStatus, 'not_started');
      assert.equal(second.operation.reservationStatus, 'active');
      assert.equal(providerRowCount(harness.providerDatabasePath), 0,
        'an unresolved lookup must not create any provider row');
      assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').state, 'unknown');
      assert.equal(effectRow(harness.databasePath, submitted.operationId, 'capture').key,
        `${submitted.operationId}:capture`, 'the effect identity never moved to a new key');
    } finally {
      secondWorker.close();
    }
  } finally {
    harness.close();
  }
});
