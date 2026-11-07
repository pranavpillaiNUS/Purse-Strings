import { existsSync, readFileSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import {
  BackendResponseSchema,
  type BackendResponse,
} from '../../../packages/contracts/src/backend.ts';
import {
  CatalogSchema,
  PolicySchema,
  type Catalog,
  type Policy,
} from '../../../packages/contracts/src/index.ts';
import type { Operation } from '../../../packages/contracts/src/backend.ts';
import {
  createApplicationBackend,
  buildWireOperation,
  type ConfiguredSupplier,
} from '../../../services/checker/src/application.ts';
import {
  AuthorityFailure,
  confirmMandateRevision,
  definePolicySnapshot,
  draftMandateRevision,
  loadPolicySnapshot,
  reviewMandateRevision,
} from '../../../services/checker/src/authority.ts';
import {
  LedgerIdentityConflict,
  loadEffectRows,
  loadOperationStorageRow,
  openLedgerStore,
  canonicalize,
  type OperationStorageRow,
} from '../../../services/checker/src/ledger/store.ts';
import { createFakeProviderGateway } from '../../../services/checker/src/execution/fake.ts';
import {
  createExecutionWorker,
  type ExecutionSupplier,
} from '../../../services/checker/src/execution/worker.ts';
import { createFixtureSupplier } from '../../../services/suppliers/src/fixture.ts';
import { createWindowsPrivateDirectory, inspectWindowsPaths, type PathVerdict } from './windows-acl.ts';

// Separate backend operator/RPC CLI. This entrypoint never reuses the offline
// eligibility demo logic; it is the durable execution surface: operators store,
// review and confirm mandates, the shopper RPC submits price-free carts, and
// execution runs against the labelled fake providers. No HTTP, no network, no
// real suppliers, and no operator-supplied clocks or scenarios.

const SIMULATION = true;
const MAX_RPC_BYTES = 1_048_576;
const MAX_FILE_BYTES = 1_048_576;
const MAX_PATH_CHARS = 4096;

const USAGE = `Splittap backend CLI (simulation)

Usage: npm run backend -- --db PATH --config PATH COMMAND [flags]

Commands:
  mandate-draft --file PATH             store a draft mandate revision
  mandate-review --id ID --revision N   review the exact stored revision
  mandate-confirm --id ID --revision N --digest DIGEST
                                        confirm with OS-derived operator identity
  operation-run --id ID                 execute against fake providers
  operation-reconcile --id ID           resolve ambiguous provider outcomes only
  status --id ID                        print the current operation
  audit --id ID                         print the operation audit events
  rpc                                   one JSON request (max 1 MiB) on stdin,
                                        exactly one JSON response on stdout

Root options select the application database and the config file; all paths are
trusted operator launch options, never shopper input. No clock, scenario,
credential, provider selector or approval metadata may be supplied on the
command line. Exit codes: 0 success, 2 usage/validation/business, 1 internal.
`;

class CliError extends Error {
  readonly usage: boolean;
  constructor(message: string, usage = false) {
    super(message);
    this.name = 'CliError';
    this.usage = usage;
  }
}

const COMMAND_FLAGS: Record<string, readonly string[]> = {
  'mandate-draft': ['file'],
  'mandate-review': ['id', 'revision'],
  'mandate-confirm': ['id', 'revision', 'digest'],
  'operation-run': ['id'],
  'operation-reconcile': ['id'],
  status: ['id'],
  audit: ['id'],
  rpc: [],
};
const ROOT_FLAGS: readonly string[] = ['db', 'config'];

const ConfigSchema = z.object({
  version: z.literal(1),
  policyFiles: z.array(z.string().min(1).max(MAX_PATH_CHARS)).min(1).max(100),
  catalogFiles: z.array(z.string().min(1).max(MAX_PATH_CHARS)).min(1).max(100),
  fakeProviderDb: z.string().min(1).max(MAX_PATH_CHARS),
}).strict();

interface LoadedConfig {
  policies: Policy[];
  catalogs: Catalog[];
  providerPath: string;
}

interface Command {
  name: string;
  values: Map<string, string>;
}

interface ParsedArgs {
  command: string | null;
  flags: Map<string, string>;
  positionals: string[];
}

function parseArgv(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const positionals: string[] = [];
  let index = 0;
  while (index < argv.length) {
    const token = argv[index]!;
    if (token === '--help' || token === '-h') {
      index += 1;
      continue;
    }
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`Flag --${name} requires a value`, true);
      }
      if (value.trim().length === 0) {
        throw new CliError(`Flag --${name} requires a non-empty value`, true);
      }
      if (flags.has(name)) {
        throw new CliError(`Flag --${name} was supplied more than once`, true);
      }
      flags.set(name, value);
      index += 2;
      continue;
    }
    if (token.startsWith('-')) {
      throw new CliError(`Short options are not accepted: ${token}`, true);
    }
    positionals.push(token);
    index += 1;
  }
  return { command: positionals[0] ?? null, flags, positionals: positionals.slice(1) };
}

function validateSelection(parsed: ParsedArgs): Command {
  if (parsed.positionals.length > 0) {
    throw new CliError(`Unexpected positional arguments: ${parsed.positionals.join(' ')}`, true);
  }
  if (parsed.command === null) {
    throw new CliError('A command is required. See --help.', true);
  }
  const commandFlags = COMMAND_FLAGS[parsed.command];
  if (commandFlags === undefined) {
    throw new CliError('Unknown command. See --help.', true);
  }
  for (const [name] of parsed.flags) {
    if (ROOT_FLAGS.includes(name)) continue;
    if (!commandFlags.includes(name)) {
      throw new CliError(`Command ${parsed.command} does not accept --${name}`, true);
    }
  }
  const missing = ['db', 'config', ...commandFlags].filter((name) => !parsed.flags.has(name));
  if (missing.length > 0) {
    throw new CliError(`Missing required flags: ${missing.map((name) => `--${name}`).join(' ')}`, true);
  }
  return { name: parsed.command, values: parsed.flags };
}

function requireFlag(command: Command, name: string): string {
  const value = command.values.get(name);
  if (value === undefined) throw new CliError(`Flag --${name} is required`, true);
  return value;
}

function readFileBounded(path: string, label: string): unknown {
  if (path.length > MAX_PATH_CHARS) throw new CliError(`${label} path is too long`);
  let raw: unknown;
  try {
    const stats = statSync(path);
    if (!stats.isFile()) throw new Error('not a regular file');
    if (stats.size > MAX_FILE_BYTES) throw new Error('oversized');
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new CliError(`${label} could not be read as one JSON document within the size limit`);
  }
  return raw;
}

/** Deepest-existing-ancestor resolution so symlinked directory aliases count. */
function expandPath(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    let cursor = absolute;
    let suffix: string[] = [];
    for (;;) {
      const parent = dirname(cursor);
      if (parent === cursor) return absolute;
      suffix.push(basename(cursor));
      cursor = parent;
      try {
        return join(realpathSync(cursor), ...suffix.reverse());
      } catch {
        // keep walking up until an existing ancestor is found
      }
    }
  }
}

/** Pre-flight validation of an existing private runtime directory. A missing
 * directory returns without creating anything: creation happens only after
 * every check has run, so a refusal leaks no empty 0700 directories. */
function checkPrivateRuntimeDirectory(directory: string, label: string): void {
  let stats;
  try {
    stats = statSync(directory);
  } catch (error) {
    // Absence is the only non-error answer here: any other stat failure
    // (EACCES, EPERM, ENOTDIR) is an operator validation problem and must not
    // surface later as an unclassified exit 1.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new CliError(`${label} could not be validated as a runtime directory`);
    }
    return;
  }
  if (!stats.isDirectory()) {
    throw new CliError(`${label} is not a directory`);
  }
  if (process.platform === 'win32') {
    assertPrivateWindowsDirectory(directory, label);
    return;
  }
  const uid = process.getuid?.();
  if (uid !== undefined && stats.uid !== uid) {
    throw new CliError(`${label} is not owned by the operating-system user running this command`);
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new CliError(`${label} permissions are too open; refusing to chmod an existing unsafe directory`);
  }
}

/** Filled by one PowerShell start, because each one costs about half a second. */
const windowsVerdicts = new Map<string, PathVerdict>();
const DATABASE_FILE_SUFFIXES = ['', '-wal', '-shm', '-journal'];

/** Every path this command relies on, resolved like the POSIX stat: a link is judged by what it reaches. */
function loadWindowsVerdicts(directories: readonly string[], databases: readonly string[]): void {
  const candidates = [
    ...directories,
    ...databases.flatMap((database) => DATABASE_FILE_SUFFIXES.map((suffix) => `${database}${suffix}`)),
  ];
  const paths = new Set<string>();
  for (const candidate of candidates) {
    try {
      paths.add(realpathSync(candidate));
    } catch {
      // Not there yet, which later steps handle.
    }
  }
  if (paths.size === 0) return;
  for (const [path, verdict] of inspectWindowsPaths([...paths])) windowsVerdicts.set(path, verdict);
}

function assertPrivateWindowsDirectory(directory: string, label: string, fresh = false): void {
  let real: string;
  try {
    real = realpathSync(directory);
  } catch {
    throw new CliError(`${label} could not be validated as a runtime directory`);
  }
  const verdict = (!fresh ? windowsVerdicts.get(real) : undefined) ?? inspectWindowsPaths([real]).get(real);
  if (verdict !== undefined) windowsVerdicts.set(real, verdict);
  if (verdict === 'foreign_owner') {
    throw new CliError(`${label} is not owned by the operating-system user running this command`);
  }
  if (verdict === 'too_open') {
    throw new CliError(`${label} permissions are too open; refusing to chmod an existing unsafe directory`);
  }
  if (verdict !== 'ok') {
    throw new CliError(`${label} could not be validated as a runtime directory`);
  }
}

/**
 * A private folder does not protect a file on Windows. Accounts can open a file by its full
 * path without rights to the folder, so a database moved in from elsewhere can stay open
 * to them. Sidecar files hold ledger data too.
 */
function assertPrivateWindowsDatabase(database: string, label: string): void {
  for (const suffix of DATABASE_FILE_SUFFIXES) {
    let real: string;
    try {
      real = realpathSync(`${database}${suffix}`);
    } catch {
      continue;
    }
    const verdict = windowsVerdicts.get(real) ?? inspectWindowsPaths([real]).get(real);
    if (verdict === 'missing') continue;
    if (verdict === 'foreign_owner') {
      throw new CliError(`${label} is not owned by the operating-system user running this command`);
    }
    if (verdict === 'too_open') {
      throw new CliError(`${label} permissions are too open; refusing to use or change it`);
    }
    if (verdict !== 'ok') {
      throw new CliError(`${label} could not be validated`);
    }
  }
}

function createPrivateRuntimeDirectory(directory: string, label: string): void {
  try {
    statSync(directory);
    // It may have appeared after the pre-flight, so it has not necessarily been judged.
    if (process.platform === 'win32') assertPrivateWindowsDirectory(directory, label);
    return;
  } catch (error) {
    if (error instanceof CliError) throw error;
    // Missing, and every pre-flight check has passed: create it below.
  }
  try {
    if (process.platform === 'win32') {
      mkdirSync(dirname(directory), { recursive: true });
      createWindowsPrivateDirectory(directory);
    } else {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
  } catch {
    throw new CliError(`${label} could not be created`);
  }
  // Judge what now exists, not what was asked for: another process may have got there first.
  if (process.platform === 'win32') assertPrivateWindowsDirectory(directory, label, true);
}

function assertDistinctDatabases(applicationPath: string, providerPath: string): void {
  const applicationReal = expandPath(applicationPath);
  const providerReal = expandPath(providerPath);
  if (applicationReal === providerReal) {
    throw new CliError('The application database and fake provider database must be distinct files');
  }
  try {
    const appStats = statSync(applicationPath);
    const providerStats = statSync(providerPath);
    if (appStats.dev === providerStats.dev && appStats.ino === providerStats.ino) {
      throw new CliError('The application database and fake provider database must be distinct files');
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    // at least one file does not exist yet; the path-level check already ran
  }
}

function operatorIdentity(): string {
  let username: string;
  try {
    username = userInfo().username;
  } catch {
    throw new CliError('The operating-system identity could not be established; confirmation was refused');
  }
  if (username.length === 0) {
    throw new CliError('The operating-system identity could not be established; confirmation was refused');
  }
  return username;
}

function trustedClock(): string {
  // Trusted executor clock only: operator commands may never supply one.
  return new Date().toISOString();
}

function loadSnapshotSet<T>(
  files: readonly string[],
  label: string,
  parse: (raw: unknown) => T,
  identity: (item: T) => string,
): T[] {
  const byIdentity = new Map<string, { canonical: string; item: T }>();
  const ordered: T[] = [];
  for (const path of files) {
    const item = parse(readFileBounded(path, `${label} file`));
    const key = identity(item);
    const canonical = canonicalize(item);
    const existing = byIdentity.get(key);
    if (existing !== undefined) {
      if (existing.canonical !== canonical) {
        throw new CliError(`Conflicting ${label} snapshots share one identity`);
      }
      continue; // exact duplicate snapshot: allowed, loaded once
    }
    byIdentity.set(key, { canonical, item });
    ordered.push(item);
  }
  if (ordered.length === 0) throw new CliError(`No ${label} snapshots were configured`);
  return ordered;
}

/** Snapshot schema validation is operator validation: a schema-invalid file is
 * a sanitized exit 2, never an unclassified internal error. */
function snapshotParser<T>(schema: z.ZodType<T>, label: string): (raw: unknown) => T {
  return (raw: unknown) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new CliError(`A ${label} snapshot does not match the required schema`);
    }
    return parsed.data;
  };
}

function loadConfig(configPath: string): LoadedConfig {
  const raw = readFileBounded(configPath, 'Configuration file');
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError('Configuration file does not match the required backend config schema');
  }
  const configDir = dirname(resolve(configPath));
  return {
    policies: loadSnapshotSet(
      parsed.data.policyFiles.map((entry) => resolve(configDir, entry)),
      'policy', snapshotParser(PolicySchema, 'policy'), (policy) => `${policy.id}\u0000${policy.version}`,
    ),
    catalogs: loadSnapshotSet(
      parsed.data.catalogFiles.map((entry) => resolve(configDir, entry)),
      'catalog', snapshotParser(CatalogSchema, 'catalog'), (catalog) => catalog.supplierId,
    ),
    providerPath: resolve(configDir, parsed.data.fakeProviderDb),
  };
}

interface ConfiguredCatalog {
  supplierId: string;
  catalog: Catalog;
  adapter: ReturnType<typeof createFixtureSupplier>;
}

function buildSuppliers(config: LoadedConfig): ConfiguredCatalog[] {
  return config.catalogs.map((catalog) => ({
    supplierId: catalog.supplierId,
    catalog,
    adapter: createFixtureSupplier(catalog),
  }));
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function positiveRevision(command: Command): number {
  const raw = requireFlag(command, 'revision');
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 1_000_000_000) {
    throw new CliError('Flag --revision must be a positive integer', true);
  }
  return value;
}

function operationRow(database: DatabaseSync, operationId: string): OperationStorageRow {
  const row = loadOperationStorageRow(database, operationId);
  if (row === null) {
    throw new CliError('Operation was not found');
  }
  return row;
}

function wireOperation(database: DatabaseSync, row: OperationStorageRow): Operation {
  return buildWireOperation(database, row, loadEffectRows(database, row.operationId));
}

function rpcErrorResponse(code: 'INVALID_REQUEST', message: string): BackendResponse {
  return BackendResponseSchema.parse({
    apiVersion: '1',
    requestId: null,
    method: null,
    simulation: SIMULATION,
    ok: false,
    error: { code, message, details: { checkCodes: [] } },
  });
}

async function readStdinBounded(): Promise<string | { oversize: true }> {
  const chunks: Buffer[] = [];
  let total = 0;
  let oversize = false;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    if (oversize) continue;
    if (total + chunk.length > MAX_RPC_BYTES) {
      oversize = true;
      continue;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  if (oversize) return { oversize: true };
  return Buffer.concat(chunks).toString('utf8');
}

async function runRpc(applicationPath: string, config: LoadedConfig): Promise<number> {
  const input = await readStdinBounded();
  if (typeof input !== 'string') {
    emit(rpcErrorResponse('INVALID_REQUEST', 'The RPC request exceeds the 1 MiB input limit'));
    return 2;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    emit(rpcErrorResponse('INVALID_REQUEST', 'The RPC input is not one valid JSON value'));
    return 2;
  }
  const suppliers: ConfiguredSupplier[] = buildSuppliers(config).map((supplier) => ({
    supplierId: supplier.supplierId,
    catalog: supplier.catalog,
    adapter: supplier.adapter,
  }));
  const backend = createApplicationBackend({
    databasePath: applicationPath,
    suppliers,
    clock: trustedClock,
  });
  try {
    const response = await backend.handle(parsed);
    emit(response);
    if (response.ok) return 0;
    if (response.error.code === 'INTERNAL_ERROR') return 1;
    return 2;
  } finally {
    backend.close();
  }
}

async function runOperationCommand(
  name: 'operation-run' | 'operation-reconcile',
  applicationPath: string,
  providerPath: string,
  config: LoadedConfig,
  operationId: string,
): Promise<number> {
  const suppliers: ExecutionSupplier[] = buildSuppliers(config).map((supplier) => ({
    supplierId: supplier.supplierId,
    catalog: supplier.catalog,
    adapter: supplier.adapter,
  }));
  const provider = createFakeProviderGateway(providerPath);
  const worker = createExecutionWorker({
    databasePath: applicationPath,
    suppliers,
    provider,
    clock: trustedClock,
  });
  try {
    const outcome = name === 'operation-run'
      ? await worker.run(operationId)
      : await worker.reconcile(operationId);
    if (outcome.kind === 'busy' || outcome.kind === 'not_found') {
      throw new CliError(outcome.message);
    }
    emit({ simulation: SIMULATION, operation: outcome.operation });
    return 0;
  } finally {
    worker.close();
    provider.close();
  }
}

async function handleCommand(command: Command): Promise<number> {
  const dbPath = expandPath(requireFlag(command, 'db'));
  const configPath = resolve(requireFlag(command, 'config'));
  const config = loadConfig(configPath);

  // mandate-confirm evaluates the operator identity BEFORE any directory is
  // created or the store is opened, so a refused confirmation identity leaves
  // no runtime artifacts on disk.
  const confirmedOperator = command.name === 'mandate-confirm' ? operatorIdentity() : null;

  assertDistinctDatabases(dbPath, config.providerPath);
  if (process.platform === 'win32') {
    loadWindowsVerdicts([dirname(config.providerPath), dirname(dbPath)], [config.providerPath, dbPath]);
  }
  checkPrivateRuntimeDirectory(dirname(config.providerPath), 'The fake provider database runtime directory');
  checkPrivateRuntimeDirectory(dirname(dbPath), 'The application runtime directory');
  if (process.platform === 'win32') {
    assertPrivateWindowsDatabase(config.providerPath, 'The fake provider database');
    assertPrivateWindowsDatabase(dbPath, 'The application database');
  }
  createPrivateRuntimeDirectory(dirname(config.providerPath), 'The fake provider database runtime directory');
  createPrivateRuntimeDirectory(dirname(dbPath), 'The application runtime directory');
  // DB files under the private runtime directory inherit the 0600 umask set in main().

  switch (command.name) {
    case 'rpc':
      return await runRpc(dbPath, config);
    case 'mandate-draft': {
      const draft = readFileBounded(requireFlag(command, 'file'), 'Mandate draft file');
      const database = openLedgerStore(dbPath);
      try {
        const now = trustedClock();
        for (const policy of config.policies) {
          definePolicySnapshot(database, policy, now);
        }
        const result = draftMandateRevision(database, draft, now);
        emit({
          simulation: SIMULATION,
          mandateId: result.mandateId,
          mandateVersion: result.version,
          digest: result.digest,
        });
        return 0;
      } finally {
        database.close();
      }
    }
    case 'mandate-review': {
      const mandateId = requireFlag(command, 'id');
      const revision = positiveRevision(command);
      const database = openLedgerStore(dbPath);
      try {
        const review = reviewMandateRevision(database, mandateId, revision);
        if (review === null) throw new CliError('Mandate revision was not found');
        const policySnapshot = loadPolicySnapshot(database, review.policyId, review.policyVersion);
        if (policySnapshot === null) {
          throw new Error('Mandate revision references a missing policy snapshot');
        }
        emit({
          simulation: SIMULATION,
          mandateId: review.mandateId,
          mandateVersion: review.version,
          digest: review.digest,
          draft: review.draft,
          policy: policySnapshot.policy,
        });
        return 0;
      } finally {
        database.close();
      }
    }
    case 'mandate-confirm': {
      const mandateId = requireFlag(command, 'id');
      const revision = positiveRevision(command);
      const digest = requireFlag(command, 'digest');
      const database = openLedgerStore(dbPath);
      try {
        const mandate = confirmMandateRevision(
          database, mandateId, revision, digest, confirmedOperator ?? operatorIdentity(), trustedClock(),
        );
        emit({ simulation: SIMULATION, mandate, digest });
        return 0;
      } finally {
        database.close();
      }
    }
    case 'status': {
      const operationId = requireFlag(command, 'id');
      const database = openLedgerStore(dbPath);
      try {
        const operation = wireOperation(database, operationRow(database, operationId));
        emit({ simulation: SIMULATION, operation });
        return 0;
      } finally {
        database.close();
      }
    }
    case 'audit': {
      const operationId = requireFlag(command, 'id');
      const database = openLedgerStore(dbPath);
      try {
        operationRow(database, operationId);
        const events = (database.prepare(
          'SELECT event_id, kind, event_json, created_at FROM audit_events WHERE operation_id = ? ORDER BY event_id',
        ).all(operationId) as Array<Record<string, unknown>>).map((row) => {
          let details: unknown;
          try {
            details = JSON.parse(row.event_json as string);
          } catch {
            throw new Error('Stored audit event is unreadable');
          }
          return {
            eventId: row.event_id,
            kind: row.kind,
            createdAt: row.created_at,
            details,
          };
        });
        emit({ simulation: SIMULATION, operationId, events });
        return 0;
      } finally {
        database.close();
      }
    }
    case 'operation-run':
    case 'operation-reconcile':
      return await runOperationCommand(
        command.name, dbPath, config.providerPath, config, requireFlag(command, 'id'),
      );
    default:
      throw new CliError('Unknown command. See --help.', true);
  }
}

function showHelp(): void {
  process.stdout.write(USAGE);
}

async function main(): Promise<void> {
  // Restrictive umask from process start: created DB files land at 0600.
  process.umask(0o077);
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.every((token) => token === '--help' || token === '-h')) {
    showHelp();
    process.exitCode = 0;
    return;
  }
  const parsed = parseArgv(argv);
  const command = validateSelection(parsed);
  process.exitCode = await handleCommand(command);
}

try {
  await main();
} catch (error) {
  if (error instanceof CliError || error instanceof AuthorityFailure || error instanceof LedgerIdentityConflict) {
    // CliError and both authority-layer classes carry sanitized domain messages.
    console.error(`backend: ${error.message}`);
    process.exitCode = 2;
  } else {
    console.error('backend: the command failed unexpectedly');
    process.exitCode = 1;
  }
}
