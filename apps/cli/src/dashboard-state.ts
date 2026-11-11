import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { PolicySchema, type Policy } from '../../../packages/contracts/src/index.ts';

// The dashboard is a view. It learns everything by running the same read-only
// commands an operator would type, each in its own process, so it loads no
// checker, payment or shopper code and holds no key. The ledger stays the only
// source of truth; nothing here can reserve, confirm, authorize, run or edit.

/** The only commands the dashboard may start. Each one only reads. */
export const DASHBOARD_READ_COMMANDS = Object.freeze({
  backend: Object.freeze(['mandate-review', 'status', 'audit']),
  shop: Object.freeze(['status']),
  main: Object.freeze(['store show']),
});

export type ReadEntry = keyof typeof DASHBOARD_READ_COMMANDS;

/** The action a command line asks for, in the form DASHBOARD_READ_COMMANDS lists it. */
export function commandAction(entry: ReadEntry, args: readonly string[]): string | null {
  if (entry === 'shop') return args[0] ?? null;
  if (entry === 'main') return args.length >= 2 ? `${args[0]} ${args[1]}` : null;
  // Backend: root flags come in --name value pairs, then the command.
  for (let index = 0; index < args.length; index += 1) {
    if (args[index]!.startsWith('--')) {
      index += 1;
      continue;
    }
    return args[index]!;
  }
  return null;
}

/** Refuses anything that is not a listed read command, before a process starts. */
export function assertReadOnlyCommand(entry: ReadEntry, args: readonly string[]): void {
  const action = commandAction(entry, args);
  const allowed: readonly string[] = DASHBOARD_READ_COMMANDS[entry] ?? [];
  if (action === null || !allowed.includes(action)) {
    throw new Error(`The dashboard only runs read commands; refused ${entry} ${action ?? '(no command)'}`);
  }
}

/** No model key and no PayPal detail reaches a command the dashboard starts. None of them needs one. */
export function dashboardChildEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy = { ...env };
  for (const name of Object.keys(copy)) {
    const upper = name.toUpperCase();
    if (upper.startsWith('PAYPAL_') || upper === 'ANTHROPIC_API_KEY') delete copy[name];
  }
  return copy;
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (entry: ReadEntry, args: readonly string[]) => Promise<CommandResult>;

const COMMAND_TIMEOUT_MS = 30_000;
const COMMAND_OUTPUT_LIMIT = 4 * 1024 * 1024;

/** Starts each read command as its own process, the way an operator would. */
export function createProcessRunner(root: string, env: NodeJS.ProcessEnv = process.env): CommandRunner {
  const childEnv = dashboardChildEnvironment(env);
  return (entry, args) => {
    assertReadOnlyCommand(entry, args);
    return new Promise((resolveResult) => {
      const child = spawn(process.execPath, [join(root, 'apps/cli/src', `${entry}.ts`), ...args], {
        cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let size = 0;
      let settled = false;
      const finish = (result: CommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveResult(result);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish({ status: null, stdout: '', stderr: 'The command took too long' });
      }, COMMAND_TIMEOUT_MS);
      const collect = (append: (text: string) => void) => (chunk: Buffer): void => {
        size += chunk.length;
        if (size > COMMAND_OUTPUT_LIMIT) {
          child.kill();
          finish({ status: null, stdout: '', stderr: 'The command printed more than the dashboard reads' });
          return;
        }
        append(chunk.toString('utf8'));
      };
      child.stdout.on('data', collect((text) => { stdout += text; }));
      child.stderr.on('data', collect((text) => { stderr += text; }));
      child.on('error', (error) => finish({ status: null, stdout: '', stderr: error.message }));
      child.on('close', (status) => finish({ status, stdout, stderr }));
    });
  };
}

// --- What demo:flow records as it goes ---------------------------------------

/**
 * IDs go to child processes as separate arguments, never through a shell. They are
 * still bounded, printable and never start with '-', so no ID can read as a flag.
 */
const CommandIdSchema = z.string().regex(/^[\x21-\x7E]{1,200}$/).refine((value) => !value.startsWith('-'));
const TimestampSchema = z.iso.datetime({ offset: true });

export const DEMO_SESSION_FILE = 'session.json';

export const DemoSessionSchema = z.object({
  kind: z.literal('splittap-demo-session'),
  version: z.literal(1),
  mode: z.enum(['scripted', 'live']),
  paymentProvider: z.enum(['fake', 'paypal-sandbox']),
  startedAt: TimestampSchema,
  updatedAt: TimestampSchema,
  scenes: z.array(z.string().min(1).max(120)).min(1).max(12),
  /** 0 before the first scene starts. */
  scene: z.number().int().min(0).max(12),
  mandate: z.object({
    id: CommandIdSchema,
    revision: z.number().int().positive().max(10_000),
    stored: z.boolean(),
    confirmedAt: TimestampSchema.nullable(),
  }).strict().nullable(),
  operationIds: z.array(CommandIdSchema).max(20),
  results: z.array(z.string().max(500)).max(20),
  waiting: z.enum(['next-scene', 'operator-confirm', 'sandbox-buyer']).nullable(),
  finished: z.boolean(),
  failure: z.string().max(2_000).nullable(),
  /** Absent in sessions written before the flow recorded it; those read as no problems listed. */
  unusable: z.array(z.string().max(500)).max(20).default([]),
  /** Only while waiting for the sandbox buyer; absent in older sessions. */
  approvalUrl: z.string().max(2048).regex(/^https:\/\//).nullable().default(null),
  /** Counts the flow's recorded waits; the local app answers each one once. */
  waitId: z.number().int().min(0).max(1_000_000).optional(),
}).strict();

export type DemoSession = z.infer<typeof DemoSessionSchema>;

// --- What the read commands print (only the parts the page shows) -------------

const MinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const EffectSchema = z.enum(['not_started', 'intent', 'in_flight', 'unknown', 'succeeded', 'rejected']);
const ProviderSchema = z.enum(['fake', 'paypal-sandbox']);

const OperationSchema = z.object({
  id: z.string(),
  mandateId: z.string(),
  mandateVersion: z.number().int().positive(),
  cartId: z.string(),
  supplierId: z.string(),
  status: z.enum(['reserved', 'running', 'reconciliation_required', 'ordered', 'failed', 'compensation_pending', 'compensated']),
  currency: z.literal('SGD'),
  totalMinor: MinorSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  reservationStatus: z.enum(['active', 'consumed', 'released']),
  paymentStatus: EffectSchema,
  paymentProvider: ProviderSchema.optional(),
  orderStatus: EffectSchema,
  refundStatus: EffectSchema,
  readinessStatus: z.literal('not_assessed'),
});

const ProviderIdsSchema = z.object({
  orderId: z.string().optional(),
  authorizationId: z.string().optional(),
  captureId: z.string().optional(),
  refundId: z.string().optional(),
});

const OperationStatusOutputSchema = z.object({
  paymentProvider: ProviderSchema.nullable(),
  operation: OperationSchema,
  providerIds: ProviderIdsSchema.optional(),
});

const AuditOutputSchema = z.object({
  operationId: z.string(),
  events: z.array(z.object({ eventId: z.number().int(), kind: z.string().max(80), createdAt: TimestampSchema })).max(500),
});

const ShopStatusSchema = z.object({
  kind: z.literal('shop-status'),
  simulation: z.literal(true),
  backend: z.literal('simulation-backend'),
  mandateId: z.string(),
  mandateVersion: z.number().int().positive(),
  confirmedAt: TimestampSchema,
  budget: z.object({ totalMinor: MinorSchema, committedMinor: MinorSchema, reservedMinor: MinorSchema, remainingMinor: z.number().int() }),
  requirements: z.array(z.object({
    requirementId: z.string(), required: z.number().int(), committedUnits: z.number().int(),
    reservedUnits: z.number().int(), remainingUnits: z.number().int(),
  })).max(100),
  operations: z.array(OperationSchema).max(100),
});

const MandateReviewSchema = z.object({
  mandateId: z.string(),
  mandateVersion: z.number().int().positive(),
  digest: z.string(),
  draft: z.object({
    currency: z.string(),
    budgetMinor: MinorSchema,
    purchaseBy: TimestampSchema,
    readyBy: TimestampSchema,
    deliveryLocationId: z.string(),
    allowedSuppliers: z.array(z.string()).max(100),
    requirements: z.array(z.object({
      id: z.string(), role: z.string(), quantity: z.number().int(), allowedSkus: z.array(z.string()).max(100),
      maxUnitPriceMinor: MinorSchema, minWarrantyMonths: z.number().int(),
    })).max(100),
  }).passthrough(),
  policy: z.object({ evidenceMaxAgeHours: z.number().int().positive().optional() }).passthrough().optional(),
});

const EvidenceSchema = z.object({ status: z.string().max(40), observedAt: TimestampSchema });
const StoreShowSchema = z.object({
  catalog: z.object({
    supplierId: z.string(),
    shippingMinor: MinorSchema,
    delivery: z.object({ by: TimestampSchema, evidence: EvidenceSchema }),
    products: z.array(z.object({
      sku: z.string(), unitPriceMinor: MinorSchema, availableUnits: z.number().int().min(0),
      productEvidence: EvidenceSchema, stockEvidence: EvidenceSchema,
    })).max(200),
  }),
});

const BackendConfigSchema = z.object({ catalogFiles: z.array(z.string().min(1)).max(20) });

// --- What the page receives ---------------------------------------------------

export interface DashboardOperation {
  id: string;
  supplierId: string;
  cartId: string;
  totalMinor: number;
  currency: 'SGD';
  status: string;
  reservationStatus: string;
  paymentProvider: 'fake' | 'paypal-sandbox' | null;
  paymentStatus: string;
  orderStatus: string;
  refundStatus: string;
  readinessStatus: string;
  createdAt: string;
  updatedAt: string;
  providerIds: { orderId?: string; authorizationId?: string; captureId?: string; refundId?: string };
  events: Array<{ eventId: number; kind: string; createdAt: string }>;
}

export interface DashboardStore {
  supplierId: string;
  shippingMinor: number;
  deliveryBy: string;
  /** The oldest record, which is what the policy's evidence age limit applies to. */
  oldestRecordAt: string;
  /** The newest record, so any future-dated observation remains visible. */
  newestRecordAt: string;
  recordStatuses: string[];
  products: Array<{ sku: string; unitPriceMinor: number; availableUnits: number }>;
}

export interface DashboardState {
  version: 1;
  generatedAt: string;
  source: { kind: 'demo' | 'backend'; label: string };
  /** The full stored policy from the exact mandate-review result, never the current policy file. */
  policy?: Policy | null;
  demo: null | {
    mode: 'scripted' | 'live';
    paymentProvider: 'fake' | 'paypal-sandbox';
    startedAt: string;
    updatedAt: string;
    scenes: string[];
    scene: number;
    results: string[];
    waiting: DemoSession['waiting'];
    finished: boolean;
    failure: string | null;
    unusable: string[];
    /** Always set by buildDashboardState; optional so older fixtures still type-check. */
    approvalUrl?: string | null;
  };
  mandate: null | {
    id: string;
    revision: number;
    digest: string;
    /** Confirmation belongs to this exact revision and comes only from the backend. */
    confirmationStatus: 'confirmed' | 'unconfirmed' | 'unknown';
    confirmedAt: string | null;
    currency: string;
    budgetMinor: number;
    purchaseBy: string;
    readyBy: string;
    deliveryLocationId: string;
    allowedSuppliers: string[];
    requirements: Array<{ id: string; role: string; quantity: number; allowedSkus: string[]; maxUnitPriceMinor: number; minWarrantyMonths: number }>;
    evidenceMaxAgeHours: number | null;
  };
  /**
   * Why `mandate` is or is not present. `not-stored`: no stored mandate is
   * selected yet. `revision-unknown`: the backend holds the mandate but refused it
   * as unconfirmed, and a followed backend learns the revision only from the
   * confirmed ledger, so its details cannot be read. `unavailable`: a read failed
   * or did not match. `read`: the backend's review of the revision.
   */
  mandateStatus: 'not-stored' | 'revision-unknown' | 'unavailable' | 'read';
  /**
   * Why `ledger` is or is not present. `no-mandate`: nothing was asked yet.
   * `unconfirmed`: the backend's exact refusal for an unconfirmed revision.
   * `unavailable`: the read failed or did not match, so reservations are unknown;
   * the page must never describe that as an unconfirmed mandate or an empty ledger.
   */
  ledgerStatus: 'no-mandate' | 'unconfirmed' | 'unavailable' | 'read';
  /** From the ledger, through shop status. Absent until a revision is confirmed. */
  ledger: null | {
    mandateId: string;
    mandateVersion: number;
    budget: { totalMinor: number; committedMinor: number; reservedMinor: number; remainingMinor: number };
    requirements: Array<{ requirementId: string; required: number; committedUnits: number; reservedUnits: number; remainingUnits: number }>;
  };
  stores: DashboardStore[];
  /** IDs selected for reading, including ones whose facts are unavailable. */
  requestedOperationIds: string[];
  operations: DashboardOperation[];
  /** Expected states, such as waiting for the demo to start. */
  notices: string[];
  /** A command that failed. Shown, never guessed around. */
  problems: string[];
}

export type DashboardSource =
  | { kind: 'demo'; root: string; directory: string }
  | { kind: 'backend'; root: string; databasePath: string; configPath: string; mandateId: string; operationIds: readonly string[] };

export function validateCommandId(value: string, label: string): string {
  const parsed = CommandIdSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${label} must be 1 to 200 printable characters and must not start with "-"`);
  return parsed.data;
}

/** A path for the screen: relative inside the repository, a label outside it, so no user name shows. */
export function displayPath(root: string, path: string): string {
  const fromRoot = relative(root, path);
  return fromRoot === '' ? '.' : fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot) ? '<work dir>' : fromRoot.split(sep).join('/');
}

/** Command errors are our own sanitized CLI text; still keep them short, one line and inert. */
export function problemText(label: string, result: CommandResult): string {
  const raw = result.stderr.trim() || (result.status === null ? 'did not finish' : `exit code ${result.status}`);
  const line = raw.split(/\r?\n/).find((item) => item.trim().length > 0) ?? raw;
  const inert = line.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/^(backend|shop|cli): /, '');
  return `${label}: ${inert.length > 300 ? `${inert.slice(0, 297)}...` : inert}`;
}

function parseJson<T>(schema: z.ZodType<T>, result: CommandResult): T | null {
  if (result.status !== 0) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(result.stdout));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function sourcePaths(source: DashboardSource): { databasePath: string; configPath: string } {
  return source.kind === 'demo'
    ? { databasePath: join(source.directory, 'runtime', 'app.db'), configPath: join(source.directory, 'config.json') }
    : { databasePath: source.databasePath, configPath: source.configPath };
}

function readCatalogPaths(configPath: string): string[] {
  try {
    const parsed = BackendConfigSchema.safeParse(JSON.parse(readFileSync(configPath, 'utf8').replace(/^﻿/, '')));
    if (!parsed.success) return [];
    return parsed.data.catalogFiles.map((file) => resolve(dirname(configPath), file));
  } catch {
    return [];
  }
}

/** Every file whose change can change the page. Unchanged files mean an unchanged page. */
export function sourceFingerprint(source: DashboardSource): string {
  const { databasePath, configPath } = sourcePaths(source);
  const files = [configPath, databasePath, `${databasePath}-wal`, ...readCatalogPaths(configPath)];
  if (source.kind === 'demo') files.unshift(join(source.directory, DEMO_SESSION_FILE));
  return files.map((file) => {
    try {
      const stats = statSync(file);
      return `${file}:${stats.mtimeMs}:${stats.size}`;
    } catch {
      return `${file}:missing`;
    }
  }).join('|');
}

type SessionRead = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'ok'; session: DemoSession };

function readSession(directory: string): SessionRead {
  const path = join(directory, DEMO_SESSION_FILE);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return { kind: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid' };
  }
  try {
    const parsed = DemoSessionSchema.safeParse(JSON.parse(text));
    return parsed.success ? { kind: 'ok', session: parsed.data } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

function storeSummary(catalog: z.infer<typeof StoreShowSchema>['catalog']): DashboardStore {
  const records = [catalog.delivery.evidence, ...catalog.products.flatMap(({ productEvidence, stockEvidence }) => [productEvidence, stockEvidence])];
  const oldest = records.reduce((min, record) => (Date.parse(record.observedAt) < Date.parse(min) ? record.observedAt : min), records[0]!.observedAt);
  const newest = records.reduce((max, record) => (Date.parse(record.observedAt) > Date.parse(max) ? record.observedAt : max), records[0]!.observedAt);
  return {
    supplierId: catalog.supplierId,
    shippingMinor: catalog.shippingMinor,
    deliveryBy: catalog.delivery.by,
    oldestRecordAt: oldest,
    newestRecordAt: newest,
    recordStatuses: [...new Set(records.map(({ status }) => status))].sort(),
    products: catalog.products.map(({ sku, unitPriceMinor, availableUnits }) => ({ sku, unitPriceMinor, availableUnits })),
  };
}

/** One read of everything the page shows. Each fact comes from a read command's own output. */
export async function buildDashboardState(source: DashboardSource, run: CommandRunner, now: () => Date = () => new Date()): Promise<DashboardState> {
  const { databasePath, configPath } = sourcePaths(source);
  const backendRoot = ['--db', databasePath, '--config', configPath];
  const label = source.kind === 'demo' ? displayPath(source.root, source.directory) : displayPath(source.root, databasePath);
  const state: DashboardState = {
    version: 1,
    generatedAt: now().toISOString(),
    source: { kind: source.kind, label },
    demo: null,
    policy: null,
    mandate: null,
    mandateStatus: 'not-stored',
    ledgerStatus: 'no-mandate',
    ledger: null,
    stores: [],
    requestedOperationIds: [],
    operations: [],
    notices: [],
    problems: [],
  };

  let mandateId: string | null;
  let revision: number | null = null;
  let confirmedAt: string | null = null;
  let confirmationStatus: 'confirmed' | 'unconfirmed' | 'unknown' = 'unknown';
  let operationIds: readonly string[];
  // The demo records a drafted mandate before the backend stores it.
  let sessionAwaitsStorage = false;
  let backendHasNoMandate = false;

  if (source.kind === 'demo') {
    let session = readSession(source.directory);
    // demo:flow replaces the file whole; one retry covers a read that raced a write.
    if (session.kind === 'invalid') {
      await new Promise((wait) => setTimeout(wait, 50));
      session = readSession(source.directory);
    }
    if (session.kind === 'missing') {
      state.notices.push(`Waiting for npm run demo:flow to start in ${label}.`);
      return state;
    }
    if (session.kind === 'invalid') {
      state.mandateStatus = 'unavailable';
      state.ledgerStatus = 'unavailable';
      state.problems.push(`The demo session file in ${label} could not be read.`);
      return state;
    }
    const value = session.session;
    state.demo = {
      mode: value.mode, paymentProvider: value.paymentProvider, startedAt: value.startedAt, updatedAt: value.updatedAt,
      scenes: value.scenes, scene: value.scene, results: value.results, waiting: value.waiting, finished: value.finished, failure: value.failure,
      unusable: value.unusable, approvalUrl: value.approvalUrl,
    };
    // Session metadata selects what to inspect; it cannot establish or suppress
    // the backend's confirmation facts, even while a demo scene is catching up.
    mandateId = value.mandate?.id ?? null;
    revision = value.mandate?.revision ?? null;
    operationIds = value.operationIds;
    sessionAwaitsStorage = value.mandate !== null && !value.mandate.stored;
    if (sessionAwaitsStorage) state.notices.push('Demo scene: preparing the mandate for storage and confirmation.');
  } else {
    mandateId = source.mandateId;
    operationIds = source.operationIds;
  }
  state.requestedOperationIds = [...operationIds];

  const catalogPaths = readCatalogPaths(configPath);
  // A read command still opens SQLite and validates the database and sidecars.
  // Run one at a time so the dashboard's own children cannot race those checks.
  const stores: CommandResult[] = [];
  for (const catalog of catalogPaths) stores.push(await run('main', ['store', 'show', '--catalog', catalog, '--json']));
  // Operations have their own independent reads below. A missing operation must
  // not hide a successful mandate confirmation or the budget view.
  const shop = mandateId !== null
    ? await run('shop', ['status', `--mandate-id=${mandateId}`, '--backend-db', databasePath, '--backend-config', configPath, '--json'])
    : null;
  const operations: Array<readonly [CommandResult, CommandResult]> = [];
  for (const id of operationIds) {
    const status = await run('backend', [...backendRoot, 'status', '--id', id]);
    const audit = await run('backend', [...backendRoot, 'audit', '--id', id]);
    operations.push([status, audit]);
  }

  for (const [index, result] of stores.entries()) {
    const parsed = parseJson(StoreShowSchema, result);
    if (parsed === null) state.problems.push(problemText(`Store ${displayPath(source.root, catalogPaths[index]!)}`, result));
    else state.stores.push(storeSummary(parsed.catalog));
  }

  if (shop !== null) {
    const parsed = parseJson(ShopStatusSchema, shop);
    // Only the exact refusal or a matching read below may replace this.
    state.ledgerStatus = 'unavailable';
    if (parsed === null) {
      // This is the exact trusted CLI refusal for mandate.get. Other failures,
      // including storage/ACL refusal, do not establish a confirmation state.
      if (shop.status === 1 && shop.stdout.trim() === ''
        && shop.stderr.trim() === 'shop: Mandate has no confirmed active revision') {
        confirmationStatus = 'unconfirmed';
        state.ledgerStatus = 'unconfirmed';
        state.notices.push('The backend has no confirmed active revision for this mandate. The shopper is refused until a person confirms it.');
      } else if (sessionAwaitsStorage && shop.status === 1 && shop.stdout.trim() === ''
        && shop.stderr.trim() === 'shop: Mandate was not found') {
        // The backend's own exact refusal agrees with the session: the mandate
        // is not stored yet. The session alone could not establish this.
        backendHasNoMandate = true;
        state.ledgerStatus = 'no-mandate';
      } else state.problems.push(problemText('Ledger (shop status)', shop));
    } else if (parsed.mandateId !== mandateId || (revision !== null && parsed.mandateVersion !== revision)) {
      state.problems.push('Ledger (shop status): the confirmed mandate does not match the revision being reviewed.');
    } else {
      state.ledger = { mandateId: parsed.mandateId, mandateVersion: parsed.mandateVersion, budget: parsed.budget, requirements: parsed.requirements };
      state.ledgerStatus = 'read';
      revision ??= parsed.mandateVersion;
      confirmedAt = parsed.confirmedAt;
      confirmationStatus = 'confirmed';
    }
  }

  // The backend mode only learns the revision from the ledger, so this read comes second.
  if (mandateId !== null && revision === null) {
    // Only the exact unconfirmed refusal shows the backend holds this mandate.
    // Any other failure leaves its details unknown, not unstored.
    state.mandateStatus = state.ledgerStatus === 'unconfirmed' ? 'revision-unknown' : 'unavailable';
  }
  if (mandateId !== null && revision !== null && !backendHasNoMandate) {
    const review = await run('backend', [...backendRoot, 'mandate-review', '--id', mandateId, '--revision', String(revision)]);
    const parsed = parseJson(MandateReviewSchema, review);
    state.mandateStatus = 'unavailable';
    if (parsed === null) state.problems.push(problemText('Mandate', review));
    else if (parsed.mandateId !== mandateId || parsed.mandateVersion !== revision) {
      state.problems.push('Mandate: the backend review did not match the requested revision.');
    } else {
      state.mandateStatus = 'read';
      const policy = PolicySchema.safeParse(parsed.policy);
      state.policy = policy.success && policy.data.id === parsed.draft.policyId && policy.data.version === parsed.draft.policyVersion
        ? policy.data : null;
      state.mandate = {
        id: parsed.mandateId, revision: parsed.mandateVersion, digest: parsed.digest, confirmationStatus, confirmedAt,
        currency: parsed.draft.currency, budgetMinor: parsed.draft.budgetMinor, purchaseBy: parsed.draft.purchaseBy,
        readyBy: parsed.draft.readyBy, deliveryLocationId: parsed.draft.deliveryLocationId,
        allowedSuppliers: parsed.draft.allowedSuppliers, requirements: parsed.draft.requirements,
        evidenceMaxAgeHours: parsed.policy?.evidenceMaxAgeHours ?? null,
      };
    }
  }

  for (const [index, [statusResult, auditResult]] of operations.entries()) {
    const id = operationIds[index]!;
    const status = parseJson(OperationStatusOutputSchema, statusResult);
    if (status === null) {
      state.problems.push(problemText(`Operation ${id}`, statusResult));
      continue;
    }
    const { operation } = status;
    if (operation.id !== id || operation.mandateId !== mandateId || revision === null || operation.mandateVersion !== revision) {
      state.problems.push(`Operation ${id}: the backend result does not match the requested operation and mandate revision.`);
      continue;
    }
    const audit = parseJson(AuditOutputSchema, auditResult);
    const matchingAudit = audit?.operationId === id ? audit : null;
    if (audit === null) state.problems.push(problemText(`Audit for ${id}`, auditResult));
    else if (matchingAudit === null) state.problems.push(`Audit for ${id}: the backend result does not match the requested operation.`);
    state.operations.push({
      id: operation.id, supplierId: operation.supplierId, cartId: operation.cartId, totalMinor: operation.totalMinor,
      currency: operation.currency, status: operation.status, reservationStatus: operation.reservationStatus,
      paymentProvider: operation.paymentProvider ?? null, paymentStatus: operation.paymentStatus,
      orderStatus: operation.orderStatus, refundStatus: operation.refundStatus, readinessStatus: operation.readinessStatus,
      createdAt: operation.createdAt, updatedAt: operation.updatedAt,
      providerIds: status.providerIds ?? {},
      events: matchingAudit?.events ?? [],
    });
  }

  if (source.kind === 'demo' && state.demo !== null && state.demo.scene === 0) {
    state.notices.push('demo:flow is setting up the stores.');
  }
  return state;
}

export interface DashboardReader {
  read(): Promise<DashboardState>;
}

/**
 * Rebuilds only when a watched file changed, or after maxAgeMs, and never runs two
 * builds at once. Refreshing therefore costs nothing while nothing moves.
 */
export function createDashboardReader(options: {
  source: DashboardSource;
  run: CommandRunner;
  now?: () => Date;
  maxAgeMs?: number;
}): DashboardReader {
  const maxAgeMs = options.maxAgeMs ?? 15_000;
  let cached: { fingerprint: string; builtAt: number; state: DashboardState } | null = null;
  let inflight: Promise<DashboardState> | null = null;
  return {
    read(): Promise<DashboardState> {
      const fingerprint = sourceFingerprint(options.source);
      if (cached !== null && cached.fingerprint === fingerprint && Date.now() - cached.builtAt < maxAgeMs) {
        return Promise.resolve(cached.state);
      }
      if (inflight !== null) return inflight;
      inflight = buildDashboardState(options.source, options.run, options.now)
        .then((state) => {
          cached = { fingerprint, builtAt: Date.now(), state };
          return state;
        })
        .finally(() => { inflight = null; });
      return inflight;
    },
  };
}
