// Unit 5 worker-level PayPal integration evidence: fresh child processes run
// the real durable worker with the composite execution provider whose
// capture/refund kinds go through the sandbox PayPal gateway backed by a
// scripted fake fetch inside the child, and whose order kind stays on the fake
// provider store. Crash evidence uses the existing CRASHPOINT/SIGKILL
// infrastructure adapted for the network provider. Deterministic, zero
// network: the child rejects any unscripted route and the parent only ever
// reads the SQLite files the children wrote plus the exchange log itself.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  insertPayPalBindingRow,
  loadReservationRow,
  openLedgerStore,
  runTransaction,
  upgradePayPalBindingRow,
} from '../ledger/store.ts';
import {
  confirmMandateRevision,
  definePolicySnapshot,
  draftMandateRevision,
} from '../authority.ts';
import { createApplicationBackend, type ConfiguredSupplier } from '../application.ts';
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

const EXEC_WORKER_PATH = fileURLToPath(new URL('./test-worker.ts', import.meta.url));
const EXPIRED_CLOCK = '2026-11-08T09:00:00.000Z'; // after TEST_MANDATE_DRAFT.purchaseBy
const APPROVER = 'fixture-ops-manager';
const AUTH_ID = 'AUTHDEMO000';
const CAPTURE_ID = 'CAPDEMO0001';
const SANDBOX = 'https://api-m.sandbox.paypal.com';

interface Harness {
  directory: string;
  databasePath: string;
  providerDatabasePath: string;
  catalogPath: string;
  operationId: string;
  totalMinor: number;
}

function minorToDecimal(amountMinor: number): string {
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;
}

async function createHarness(prefix: string): Promise<Harness> {
  const directory = makeTempDir(prefix);
  const databasePath = `${directory}/app.db`;
  const providerDatabasePath = `${directory}/providers.db`;
  const catalogPath = `${directory}/catalog.json`;
  writeFileSync(catalogPath, JSON.stringify(TEST_CATALOG));
  const database = openLedgerStore(databasePath);
  definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
  draftMandateRevision(database, { ...TEST_MANDATE_DRAFT }, TEST_CLOCK);
  const digest = database.prepare(
    'SELECT digest FROM mandate_revisions WHERE mandate_id = ? AND version = ?',
  ).get(TEST_MANDATE_DRAFT.id, TEST_MANDATE_DRAFT.version) as { digest: string };
  confirmMandateRevision(
    database, TEST_MANDATE_DRAFT.id, TEST_MANDATE_DRAFT.version, digest.digest, APPROVER, TEST_CLOCK,
  );
  database.close();

  const backend = createApplicationBackend({
    databasePath,
    paymentProvider: 'paypal-sandbox',
    suppliers: [
      { supplierId: 'store-a', catalog: TEST_CATALOG, adapter: createFixtureSupplier(TEST_CATALOG) },
    ] as unknown as ConfiguredSupplier[],
    clock: () => TEST_CLOCK,
  });
  let operationId: string;
  let totalMinor: number;
  try {
    const response = await backend.handle({
      apiVersion: '1', requestId: 'paypal-worker-test-submit', method: 'proposal.submit',
      params: { idempotencyKey: `key-${prefix}`, cart: TEST_CART },
    });
    if (!response.ok || response.method !== 'proposal.submit') {
      assert.fail(`fixture submission failed: ${JSON.stringify(response)}`);
    }
    operationId = response.result.operation.id;
    totalMinor = response.result.operation.totalMinor;
  } finally {
    backend.close();
  }
  // The operator's hold, exactly as operation-complete-authorization leaves it.
  const db = openLedgerStore(databasePath);
  try {
    const reservation = loadReservationRow(db, operationId);
    assert.ok(reservation !== null);
    runTransaction(db, () => {
      insertPayPalBindingRow(db, {
        operationId,
        orderId: 'ORDDEMO0001',
        invoiceId: operationId,
        amountMinor: reservation.amountMinor,
        createdAt: TEST_CLOCK,
      });
      upgradePayPalBindingRow(db, operationId, AUTH_ID, TEST_CLOCK);
    });
  } finally {
    db.close();
  }
  return {
    directory, databasePath, providerDatabasePath, catalogPath,
    operationId, totalMinor,
  };
}

interface PayPalChildConfig {
  databasePath: string;
  providerDatabasePath: string;
  catalogPath: string;
  clock: string;
  operationId: string;
  mode: 'run' | 'reconcile';
  providerTimeoutMs: number | null;
  paymentProvider: 'paypal-sandbox';
  paypalScriptPath: string;
  paypalLedgerPath: string;
}

interface ScriptRoute {
  pattern: string;
  status?: number;
  body?: unknown;
  stall?: boolean;
}

interface PayPalScriptConfig {
  log?: string;
  scenario?: { crashAfterCommit?: boolean };
  routes: ScriptRoute[];
}

/**
 * Builds the scripted exchange set. Accepts a router-owned ordering: the
 * token route always answers; the caller injects whichever resource bodies the
 * scenario needs. `log` records every issued call (method + URL) so the parent
 * can prove call counts across child restarts.
 */
function writeScript(
  harness: Harness,
  options: { log?: string; scenario?: { crashAfterCommit?: boolean } },
  ...routes: ScriptRoute[]
): string {
  const script: PayPalScriptConfig = { routes, ...(options.log !== undefined ? { log: options.log } : {}), ...(options.scenario !== undefined ? { scenario: options.scenario } : {}) };
  const path = `${harness.directory}/paypal-script-${writeScriptIter++}.json`;
  writeFileSync(path, JSON.stringify(script));
  return path;
}

let writeScriptIter = 0;

function tokenRoute(): ScriptRoute {
  return { pattern: '/v1/oauth2/token', body: { access_token: 'tok-1', expires_in: 3600 } };
}

function capturedAmount(harness: Harness): { currency_code: string; value: string } {
  return { currency_code: 'SGD', value: minorToDecimal(harness.totalMinor) };
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

type ChildResult = { kind: 'outcome'; result: ChildOperation } | { kind: 'killedAt'; kindName: string };

function runExecutionChild(config: PayPalChildConfig, mode: 'run' | 'reconcile'): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [EXEC_WORKER_PATH, mode], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let killedAt: string | null = null;
    let goSent = false;
    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
      rejectChild(new Error(`execution worker timed out\nstderr: ${stderr}\nstdout: ${stdout}`));
    }, 45_000);
    child.on('error', (error) => { clearTimeout(deadline); rejectChild(error); });
    child.on('close', (code) => {
      clearTimeout(deadline);
      if (killedAt !== null) {
        resolveChild({ kind: 'killedAt', kindName: killedAt });
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
    child.stderr.on('data', (chunk: Buffer) => { stderr += String(chunk); });
    child.stdin.write(`${JSON.stringify(config)}\n`);
  });
}

interface ExchangeLine { method: string; url: string }

function exchangeLog(path: string): ExchangeLine[] {
  const text = readFileSync(path, 'utf8').trim();
  if (text.length === 0) return [];
  return text.split('\n').map((line) => JSON.parse(line) as ExchangeLine);
}

function bindingState(databasePath: string, operationId: string): string | null {
  const database = openLedgerStore(databasePath);
  try {
    const row = database.prepare(
      'SELECT provider_state FROM operation_paypal_bindings WHERE operation_id = ?',
    ).get(operationId) as { provider_state?: unknown } | undefined;
    return typeof row?.provider_state === 'string' ? row.provider_state : null;
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

function childConfig(
  harness: Harness,
  scriptPath: string,
  clock: string,
  mode: 'run' | 'reconcile',
  providerTimeoutMs: number | null = 30_000,
): PayPalChildConfig {
  return {
    databasePath: harness.databasePath,
    providerDatabasePath: harness.providerDatabasePath,
    catalogPath: harness.catalogPath,
    clock,
    operationId: harness.operationId,
    mode,
    providerTimeoutMs,
    paymentProvider: 'paypal-sandbox',
    paypalScriptPath: scriptPath,
    paypalLedgerPath: harness.databasePath,
  };
}

const captureRoute = (harness: Harness): ScriptRoute => ({
  pattern: '/v2/payments/authorizations/AUTHDEMO000/capture$',
  body: {
    id: CAPTURE_ID,
    status: 'COMPLETED',
    amount: capturedAmount(harness),
    invoice_id: harness.operationId,
    supplementary_data: { related_ids: { authorization_id: AUTH_ID } },
  },
});

const authorizationCapturedRoute = (harness: Harness): ScriptRoute => ({
  pattern: '/v2/payments/authorizations/AUTHDEMO000$',
  body: {
    id: AUTH_ID,
    status: 'CAPTURED',
    amount: capturedAmount(harness),
    links: [
      { rel: 'self', href: `${SANDBOX}/v2/payments/authorizations/${AUTH_ID}` },
      { rel: 'capture', href: `${SANDBOX}/v2/payments/captures/${CAPTURE_ID}` },
    ],
  },
});

const captureReadRoute = (harness: Harness): ScriptRoute => ({
  pattern: '/v2/payments/captures/CAPDEMO0001$',
  body: {
    id: CAPTURE_ID,
    status: 'COMPLETED',
    amount: capturedAmount(harness),
    invoice_id: harness.operationId,
    supplementary_data: { related_ids: { authorization_id: AUTH_ID } },
  },
});

const authorizationDeniedRoute = (harness: Harness): ScriptRoute => ({
  pattern: '/v2/payments/authorizations/AUTHDEMO000$',
  body: {
    id: AUTH_ID,
    status: 'DENIED',
    amount: capturedAmount(harness),
    links: [{ rel: 'self', href: `${SANDBOX}/v2/payments/authorizations/${AUTH_ID}` }],
  },
});

test('a full paypal-sandbox run consumes the hold capture, keeps the fake order, and leaves the binding held', async () => {
  const harness = await createHarness('pp-w-full');
  try {
    const logPath = `${harness.directory}/exchange-log.jsonl`;
    const scriptPath = writeScript(harness, { log: logPath }, tokenRoute(), captureRoute(harness));
    const outcome = await runExecutionChild(childConfig(harness, scriptPath, TEST_CLOCK, 'run'), 'run');
    assert.equal(outcome.kind, 'outcome');
    if (outcome.kind !== 'outcome') return;
    assert.equal(outcome.result.operation?.status, 'ordered');
    assert.equal(outcome.result.operation?.paymentStatus, 'succeeded');
    assert.equal(outcome.result.operation?.orderStatus, 'succeeded');
    assert.equal(outcome.result.operation?.refundStatus, 'not_started');
    assert.equal(outcome.result.operation?.reservationStatus, 'consumed');
    assert.equal(outcome.result.operation?.readinessStatus, 'not_assessed');
    // The supplier order is the ONLY fake provider row; the capture lives at PayPal.
    assert.equal(providerRowCount(harness.providerDatabasePath), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'order'), 1);
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 0);
    // Exactly one token + one capture call; the mandate lifecycle showed no refund.
    const calls = exchangeLog(logPath);
    assert.equal(calls.filter((call) => call.method === 'POST' && /\/capture$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => call.url.includes('/refunds/')).length, 0);
    assert.ok(calls.every((call) => call.url.startsWith(SANDBOX)));
    // The operator binding survived untouched.
    assert.equal(bindingState(harness.databasePath, harness.operationId), 'authorization_held');
  } finally {
    removeTempDir(harness.directory);
  }
});

test('SIGKILL after the PayPal capture commit recovers via getAuthorization→getCapture after mandate expiry; exactly one capture, no refund', async () => {
  const harness = await createHarness('pp-w-crash');
  try {
    const logPath = `${harness.directory}/exchange-log.jsonl`;
    // Both children share one script: a fresh capture read-back exists at PayPal
    // from the first child's commit, which is exactly the crash groundwork.
    const scriptPath = writeScript(
      harness,
      { log: logPath, scenario: { crashAfterCommit: true } },
      tokenRoute(),
      captureRoute(harness),
      authorizationCapturedRoute(harness),
      captureReadRoute(harness),
    );
    const killed = await runExecutionChild(childConfig(harness, scriptPath, TEST_CLOCK, 'run'), 'run');
    assert.equal(killed.kind, 'killedAt');
    assert.equal(killed.kindName, 'capture');
    // Application state never recorded the answer.
    assert.equal(effectRow(harness.databasePath, harness.operationId, 'capture').state, 'in_flight');
    assert.equal(operationAndReservation(harness.databasePath, harness.operationId).reservation.state, 'active');
    assert.equal(providerRowCount(harness.providerDatabasePath, 'capture'), 0);

    // Fresh process, mandate long expired: PayPal's durable CAPTURED status plus
    // the verified capture read are definitive evidence. Authority is consumed,
    // the original (fake) order runs, and no refund is invented.
    const recovered = await runExecutionChild(childConfig(harness, scriptPath, EXPIRED_CLOCK, 'run'), 'run');
    assert.equal(recovered.kind, 'outcome');
    if (recovered.kind !== 'outcome') return;
    assert.equal(recovered.result.operation?.status, 'ordered');
    assert.equal(recovered.result.operation?.paymentStatus, 'succeeded');
    assert.equal(recovered.result.operation?.reservationStatus, 'consumed');
    assert.equal(recovered.result.operation?.refundStatus, 'not_started');
    // Exactly ONE capture POST exists in the whole history; the recovery only read.
    const calls = exchangeLog(logPath);
    assert.equal(calls.filter((call) =>
      call.method === 'POST' && /authorizations\/AUTHDEMO000\/capture$/.test(call.url)).length,
      1, 'exactly one capture commit');
    assert.ok(calls.some((call) => call.url.endsWith(`/v2/payments/authorizations/${AUTH_ID}`)));
    assert.ok(calls.some((call) => call.url.endsWith(`/v2/payments/captures/${CAPTURE_ID}`)));
    assert.equal(calls.filter((call) => call.url.includes('/refunds/')).length, 0);
    assert.equal(bindingState(harness.databasePath, harness.operationId), 'authorization_held');
  } finally {
    removeTempDir(harness.directory);
  }
});

test('an unanswered PayPal call retains authority: unknown keeps the operation in reconciliation', async () => {
  const harness = await createHarness('pp-w-unknown');
  try {
    const logPath = `${harness.directory}/exchange-log.jsonl`;
    const scriptPath = writeScript(
      harness,
      { log: logPath },
      tokenRoute(),
      { ...captureRoute(harness), stall: true },
    );
    const outcome = await runExecutionChild(childConfig(harness, scriptPath, TEST_CLOCK, 'run', 400), 'run');
    assert.equal(outcome.kind, 'outcome');
    if (outcome.kind !== 'outcome') return;
    assert.equal(outcome.result.operation?.status, 'reconciliation_required');
    assert.equal(outcome.result.operation?.paymentStatus, 'unknown');
    assert.equal(outcome.result.operation?.orderStatus, 'not_started');
    assert.equal(outcome.result.operation?.refundStatus, 'not_started');
    // Nothing was released and nothing was consumed; no order row exists.
    const state = operationAndReservation(harness.databasePath, harness.operationId);
    assert.equal(state.reservation.state, 'active');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    assert.equal(bindingState(harness.databasePath, harness.operationId), 'authorization_held');
  } finally {
    removeTempDir(harness.directory);
  }
});

test('a DENIED hold is durable non-application evidence: the capture releases and the operation fails', async () => {
  const harness = await createHarness('pp-w-denied');
  try {
    const logPath = `${harness.directory}/exchange-log.jsonl`;
    const staleScript = writeScript(
      harness,
      { log: logPath },
      tokenRoute(),
      { ...captureRoute(harness), stall: true },
    );
    const unknown = await runExecutionChild(childConfig(harness, staleScript, TEST_CLOCK, 'run', 400), 'run');
    assert.equal(unknown.kind, 'outcome');
    if (unknown.kind !== 'outcome') return;
    assert.equal(unknown.result.operation?.status, 'reconciliation_required');

    // Next run: lookup says the hold was DENIED — a definitive provider fact.
    const deniedScript = writeScript(
      harness,
      { log: logPath },
      tokenRoute(),
      // The capture POST route is still scripted; the recovery must NOT call it,
      // because the unknown branch consults the provider first.
      { ...captureRoute(harness), stall: true },
      authorizationDeniedRoute(harness),
    );
    const outcome = await runExecutionChild(childConfig(harness, deniedScript, TEST_CLOCK, 'run'), 'run');
    assert.equal(outcome.kind, 'outcome');
    if (outcome.kind !== 'outcome') return;
    assert.equal(outcome.result.operation?.status, 'failed');
    assert.equal(outcome.result.operation?.paymentStatus, 'rejected');
    assert.equal(outcome.result.operation?.orderStatus, 'not_started');
    assert.equal(outcome.result.operation?.refundStatus, 'not_started');
    const state = operationAndReservation(harness.databasePath, harness.operationId);
    assert.equal(state.reservation.state, 'released');
    assert.equal(providerRowCount(harness.providerDatabasePath), 0);
    const calls = exchangeLog(logPath);
    // Exactly one capture POST exists: the stalled dispatch child1 abandoned
    // (never answered, so nothing was committed). The rejection came purely
    // from the durable DENIED status read; no refund was ever attempted.
    assert.equal(calls.filter((call) => call.method === 'POST' && /\/capture$/.test(call.url)).length, 1);
    assert.equal(calls.filter((call) => call.url.includes('/refunds/')).length, 0);
  } finally {
    removeTempDir(harness.directory);
  }
});
