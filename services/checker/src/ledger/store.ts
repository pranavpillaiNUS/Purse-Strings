import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type { DatabaseSync };
import { applyMigrations } from './schema.ts';
import type { CartSubmission } from '../../../../packages/contracts/src/index.ts';

export interface MandateRow {
  mandateId: string;
  activeVersion: number | null;
  exposureStarted: boolean;
}

export interface RevisionRow {
  mandateId: string;
  version: number;
  policyId: string;
  policyVersion: number;
  draftJson: string;
  digest: string;
  createdAt: string;
}

export interface PolicyRow {
  policyId: string;
  policyVersion: number;
  contentJson: string;
  digest: string;
  createdAt: string;
}

export interface ConfirmationRow {
  mandateId: string;
  version: number;
  digest: string;
  approvedBy: string;
  confirmedAt: string;
}

export interface OperationStorageRow {
  operationId: string;
  mandateId: string;
  mandateVersion: number;
  cartId: string;
  requestDigest: string;
  cartJson: string;
  quoteJson: string;
  termsDigest: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationStorageRow {
  operationId: string;
  mandateId: string;
  mandateVersion: number;
  currency: string;
  amountMinor: number;
  state: 'active' | 'consumed' | 'released';
}

export interface EffectStorageRow {
  effectId: string;
  operationId: string;
  kind: string;
  effectKey: string;
  requestDigest: string;
  requestJson: string;
  state: string;
  providerId: string | null;
  responseJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdempotencyConflictErrorOptions {
  message: string;
}

/** Same immutable identity, different content. Never a mutation. */
export class LedgerIdentityConflict extends Error {
  readonly checkCodes: string[];
  constructor(message: string, checkCodes: string[] = []) {
    super(message);
    this.name = 'LedgerIdentityConflict';
    this.checkCodes = checkCodes;
  }
}

interface RawRow {
  [column: string]: unknown;
}

function readString(row: RawRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`Ledger row column ${column} is missing`);
  return value;
}

function readStringOrNull(row: RawRow, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`Ledger row column ${column} is invalid`);
  return value;
}

function readNumber(row: RawRow, column: string): number {
  const value = row[column];
  if (typeof value !== 'number') throw new Error(`Ledger row column ${column} is missing`);
  return value;
}

export function openLedgerStore(databasePath: string): DatabaseSync {
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA synchronous = FULL');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  applyMigrations(database);
  return database;
}

const databasesInTransaction = new WeakSet<DatabaseSync>();

export function runTransaction<T>(database: DatabaseSync, work: () => T): T {
  // Synchronous on purpose: the quote has already been obtained; the reservation
  // transaction must hold the write lock only long enough to check and commit.
  // An async callback would leave BEGIN/COMMIT racing pending awaits, and a
  // nested BEGIN failure would ROLLBACK the outer transaction, so both are
  // rejected loudly instead of corrupting the caller's transaction scope.
  if (databasesInTransaction.has(database)) {
    throw new TypeError('runTransaction cannot nest: a transaction is already open on this database');
  }
  database.exec('BEGIN IMMEDIATE');
  databasesInTransaction.add(database);
  try {
    const value = work();
    if (value instanceof Promise) {
      throw new TypeError(
        'runTransaction work returned a Promise after work already started: the transaction is rolled back, '
        + 'but pending async continuations would then execute outside it in autocommit; '
        + 'work callbacks must be synchronous',
      );
    }
    database.exec('COMMIT');
    return value;
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* rollback is best-effort */ }
    throw error;
  } finally {
    databasesInTransaction.delete(database);
  }
}

export function isSqliteBusy(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('errcode' in error)) return false;
  const errcode = (error as { errcode?: unknown }).errcode;
  // Extended result codes keep the primary code in the low byte, so the
  // extended busy variants (BUSY_RECOVERY 261, BUSY_SNAPSHOT 517) map to BUSY.
  return typeof errcode === 'number' && (errcode & 0xff) === 5;
}

// Canonical text is the stored content identity; these digests must stay
// byte-identical to packages/contracts/src/mock.ts for the same content.
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const sorted = Object.entries(value).sort(([left], [right]) => compareText(left, right));
    return `{${sorted.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function canonicalCartJson(cart: CartSubmission): string {
  return canonicalize({
    ...cart,
    lines: [...cart.lines].sort((left, right) =>
      compareText(left.requirementId, right.requirementId) || compareText(left.sku, right.sku)),
  });
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function storePolicySnapshot(
  database: DatabaseSync,
  snapshot: { policyId: string; policyVersion: number; contentJson: string; digest: string; createdAt: string },
): 'created' | 'replayed' {
  const existing = database.prepare(
    'SELECT content_json AS contentJson, digest AS digest FROM policies WHERE policy_id = ? AND policy_version = ?',
  ).get(snapshot.policyId, snapshot.policyVersion) as RawRow | undefined;
  if (existing) {
    if (readString(existing, 'digest') !== snapshot.digest
      || readString(existing, 'contentJson') !== snapshot.contentJson) {
      throw new LedgerIdentityConflict('A different policy snapshot already exists for this identity');
    }
    return 'replayed';
  }
  database.prepare(
    'INSERT INTO policies (policy_id, policy_version, content_json, digest, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(snapshot.policyId, snapshot.policyVersion, snapshot.contentJson, snapshot.digest, snapshot.createdAt);
  return 'created';
}

export function storeMandateRevision(
  database: DatabaseSync,
  revision: {
    mandateId: string;
    version: number;
    policyId: string;
    policyVersion: number;
    draftJson: string;
    digest: string;
    createdAt: string;
  },
): 'created' | 'replayed' {
  const mandate = loadMandateRow(database, revision.mandateId);
  if (!mandate) {
    database.prepare(
      'INSERT INTO mandates (mandate_id, exposure_started) VALUES (?, 0)',
    ).run(revision.mandateId);
  }
  const existing = database.prepare(
    'SELECT digest FROM mandate_revisions WHERE mandate_id = ? AND version = ?',
  ).get(revision.mandateId, revision.version) as RawRow | undefined;
  if (existing) {
    if (readString(existing, 'digest') !== revision.digest) {
      throw new LedgerIdentityConflict('A different draft already exists for this mandate revision');
    }
    return 'replayed';
  }
  database.prepare(
    `INSERT INTO mandate_revisions
      (mandate_id, version, policy_id, policy_version, draft_json, digest, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    revision.mandateId,
    revision.version,
    revision.policyId,
    revision.policyVersion,
    revision.draftJson,
    revision.digest,
    revision.createdAt,
  );
  return 'created';
}

export function loadMandateRow(database: DatabaseSync, mandateId: string): MandateRow | null {
  const row = database.prepare(
    'SELECT mandate_id, active_version, exposure_started FROM mandates WHERE mandate_id = ?',
  ).get(mandateId) as RawRow | undefined;
  if (!row) return null;
  const activeRaw = row.active_version;
  if (activeRaw !== null && activeRaw !== undefined && typeof activeRaw !== 'number') {
    throw new Error('Ledger row column active_version is invalid');
  }
  return {
    mandateId: readString(row, 'mandate_id'),
    activeVersion: activeRaw === null || activeRaw === undefined ? null : activeRaw,
    exposureStarted: readNumber(row, 'exposure_started') === 1,
  };
}

export function activateMandateRevision(database: DatabaseSync, mandateId: string, version: number): void {
  database.prepare(
    'UPDATE mandates SET active_version = ? WHERE mandate_id = ?',
  ).run(version, mandateId);
}

export function markMandateExposed(database: DatabaseSync, mandateId: string): void {
  // Permanent: decided reservations (even later released) expose the authority once.
  database.prepare(
    'UPDATE mandates SET exposure_started = 1 WHERE mandate_id = ? AND exposure_started = 0',
  ).run(mandateId);
}

export function loadPolicyRow(
  database: DatabaseSync,
  policyId: string,
  policyVersion: number,
): PolicyRow | null {
  const row = database.prepare(
    'SELECT policy_id, policy_version, content_json, digest, created_at FROM policies WHERE policy_id = ? AND policy_version = ?',
  ).get(policyId, policyVersion) as RawRow | undefined;
  if (!row) return null;
  return {
    policyId: readString(row, 'policy_id'),
    policyVersion: readNumber(row, 'policy_version'),
    contentJson: readString(row, 'content_json'),
    digest: readString(row, 'digest'),
    createdAt: readString(row, 'created_at'),
  };
}

export function loadRevisionRow(
  database: DatabaseSync,
  mandateId: string,
  version: number,
): RevisionRow | null {
  const row = database.prepare(
    'SELECT mandate_id, version, policy_id, policy_version, draft_json, digest, created_at FROM mandate_revisions WHERE mandate_id = ? AND version = ?',
  ).get(mandateId, version) as RawRow | undefined;
  if (!row) return null;
  return {
    mandateId: readString(row, 'mandate_id'),
    version: readNumber(row, 'version'),
    policyId: readString(row, 'policy_id'),
    policyVersion: readNumber(row, 'policy_version'),
    draftJson: readString(row, 'draft_json'),
    digest: readString(row, 'digest'),
    createdAt: readString(row, 'created_at'),
  };
}

export function loadConfirmationRow(
  database: DatabaseSync,
  mandateId: string,
  version: number,
): ConfirmationRow | null {
  const row = database.prepare(
    'SELECT mandate_id, version, digest, approved_by, confirmed_at FROM confirmations WHERE mandate_id = ? AND version = ?',
  ).get(mandateId, version) as RawRow | undefined;
  if (!row) return null;
  return {
    mandateId: readString(row, 'mandate_id'),
    version: readNumber(row, 'version'),
    digest: readString(row, 'digest'),
    approvedBy: readString(row, 'approved_by'),
    confirmedAt: readString(row, 'confirmed_at'),
  };
}

/**
 * Idempotent: identical digest replays the stored confirmation unchanged;
 * a different digest for the same revision is a conflict, never an update.
 */
export function storeConfirmationRow(
  database: DatabaseSync,
  confirmation: {
    mandateId: string;
    version: number;
    digest: string;
    approvedBy: string;
    confirmedAt: string;
  },
): 'created' | 'replayed' {
  const existing = loadConfirmationRow(database, confirmation.mandateId, confirmation.version);
  if (existing) {
    if (existing.digest !== confirmation.digest) {
      throw new LedgerIdentityConflict('This mandate revision was previously confirmed with a different digest');
    }
    return 'replayed';
  }
  database.prepare(
    'INSERT INTO confirmations (mandate_id, version, digest, approved_by, confirmed_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    confirmation.mandateId,
    confirmation.version,
    confirmation.digest,
    confirmation.approvedBy,
    confirmation.confirmedAt,
  );
  return 'created';
}

export interface OperationIdentities {
  cartOperationId: string | null;
  aliasOperationId: string | null;
}

export function findOperationIdentities(
  database: DatabaseSync,
  mandateId: string,
  cartId: string,
  idempotencyKey: string,
): OperationIdentities {
  const cartRow = database.prepare(
    'SELECT operation_id FROM operations WHERE mandate_id = ? AND cart_id = ?',
  ).get(mandateId, cartId) as RawRow | undefined;
  const aliasRow = database.prepare(
    'SELECT operation_id FROM idempotency_aliases WHERE mandate_id = ? AND idempotency_key = ?',
  ).get(mandateId, idempotencyKey) as RawRow | undefined;
  return {
    cartOperationId: cartRow ? readString(cartRow, 'operation_id') : null,
    aliasOperationId: aliasRow ? readString(aliasRow, 'operation_id') : null,
  };
}

/** Binds the alias unless present; a present alias must already name this operation. */
export function bindIdempotencyAlias(
  database: DatabaseSync,
  mandateId: string,
  idempotencyKey: string,
  operationId: string,
): void {
  const existing = database.prepare(
    'SELECT operation_id FROM idempotency_aliases WHERE mandate_id = ? AND idempotency_key = ?',
  ).get(mandateId, idempotencyKey) as RawRow | undefined;
  if (existing) {
    if (readString(existing, 'operation_id') !== operationId) {
      throw new LedgerIdentityConflict('Idempotency key already binds a different operation');
    }
    return;
  }
  database.prepare(
    'INSERT INTO idempotency_aliases (mandate_id, idempotency_key, operation_id) VALUES (?, ?, ?)',
  ).run(mandateId, idempotencyKey, operationId);
}

export interface NewReservationRecord {
  operationId: string;
  mandateId: string;
  mandateVersion: number;
  cartId: string;
  supplierId: string;
  cartJson: string;
  quoteJson: string;
  requestDigest: string;
  termsDigest: string;
  amountMinor: number;
  currency: 'SGD';
  createdAt: string;
  lines: ReadonlyArray<{ requirementId: string; sku: string; quantity: number }>;
  idempotencyKey: string;
  auditKind: string;
  auditDetails: Record<string, unknown>;
}

/** Inserts the whole reservation atomically. Caller must already hold the write transaction. */
export function insertReservationOperation(
  database: DatabaseSync,
  record: NewReservationRecord,
): void {
  database.prepare(
    `INSERT INTO operations
      (operation_id, mandate_id, mandate_version, cart_id, request_digest,
       cart_json, quote_json, terms_digest, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`,
  ).run(
    record.operationId,
    record.mandateId,
    record.mandateVersion,
    record.cartId,
    record.requestDigest,
    record.cartJson,
    record.quoteJson,
    record.termsDigest,
    record.createdAt,
    record.createdAt,
  );
  database.prepare(
    `INSERT INTO reservations
      (operation_id, mandate_id, mandate_version, currency, amount_minor, state)
     VALUES (?, ?, ?, 'SGD', ?, 'active')`,
  ).run(
    record.operationId,
    record.mandateId,
    record.mandateVersion,
    record.amountMinor,
  );
  const insertLine = database.prepare(
    'INSERT INTO reservation_lines (operation_id, requirement_id, sku, quantity) VALUES (?, ?, ?, ?)',
  );
  for (const line of record.lines) {
    insertLine.run(record.operationId, line.requirementId, line.sku, line.quantity);
  }
  database.prepare(
    'INSERT INTO idempotency_aliases (mandate_id, idempotency_key, operation_id) VALUES (?, ?, ?)',
  ).run(record.mandateId, record.idempotencyKey, record.operationId);
  recordAuditEvent(database, record.mandateId, record.operationId, record.auditKind, {
    operationId: record.operationId,
    mandateId: record.mandateId,
    mandateVersion: record.mandateVersion,
    cartId: record.cartId,
    supplierId: record.supplierId,
    currency: record.currency,
    amountMinor: record.amountMinor,
    ...record.auditDetails,
  }, record.createdAt);
  markMandateExposed(database, record.mandateId);
}

export function recordAuditEvent(
  database: DatabaseSync,
  mandateId: string,
  operationId: string | null,
  kind: string,
  details: Record<string, unknown>,
  createdAt: string,
): void {
  database.prepare(
    'INSERT INTO audit_events (mandate_id, operation_id, kind, event_json, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(mandateId, operationId, kind, canonicalize(details), createdAt);
}

export interface MandateTotals {
  committedMinor: number;
  reservedMinor: number;
  perRequirement: Map<string, { committed: number; reserved: number }>;
}

/**
 * Total authority scope is the mandate identity across all revisions.
 * Active reservations count as reserved, consumed as committed; released is ignored.
 */
export function loadMandateTotals(database: DatabaseSync, mandateId: string): MandateTotals {
  const amountRows = database.prepare(
    `SELECT r.state AS state, r.amount_minor AS amount
     FROM reservations AS r JOIN operations AS o ON o.operation_id = r.operation_id
     WHERE o.mandate_id = ? AND r.state IN ('active', 'consumed')`,
  ).all(mandateId) as RawRow[];
  let committedMinor = 0;
  let reservedMinor = 0;
  for (const row of amountRows) {
    const amount = readNumber(row, 'amount');
    if (readString(row, 'state') === 'consumed') committedMinor += amount;
    else reservedMinor += amount;
  }
  const lineRows = database.prepare(
    `SELECT rl.requirement_id AS rid, r.state AS state, rl.quantity AS quantity
     FROM reservation_lines AS rl
     JOIN reservations AS r ON r.operation_id = rl.operation_id
     JOIN operations AS o ON o.operation_id = r.operation_id
     WHERE o.mandate_id = ? AND r.state IN ('active', 'consumed')`,
  ).all(mandateId) as RawRow[];
  const perRequirement = new Map<string, { committed: number; reserved: number }>();
  for (const row of lineRows) {
    const rid = readString(row, 'rid');
    const entry = perRequirement.get(rid) ?? { committed: 0, reserved: 0 };
    if (readString(row, 'state') === 'consumed') entry.committed += readNumber(row, 'quantity');
    else entry.reserved += readNumber(row, 'quantity');
    perRequirement.set(rid, entry);
  }
  return { committedMinor, reservedMinor, perRequirement };
}

export function loadOperationStorageRow(
  database: DatabaseSync,
  operationId: string,
): OperationStorageRow | null {
  const row = database.prepare(
    `SELECT operation_id, mandate_id, mandate_version, cart_id, request_digest,
       cart_json, quote_json, terms_digest, status, created_at, updated_at
     FROM operations WHERE operation_id = ?`,
  ).get(operationId) as RawRow | undefined;
  if (!row) return null;
  return {
    operationId: readString(row, 'operation_id'),
    mandateId: readString(row, 'mandate_id'),
    mandateVersion: readNumber(row, 'mandate_version'),
    cartId: readString(row, 'cart_id'),
    requestDigest: readString(row, 'request_digest'),
    cartJson: readString(row, 'cart_json'),
    quoteJson: readString(row, 'quote_json'),
    termsDigest: readString(row, 'terms_digest'),
    status: readString(row, 'status'),
    createdAt: readString(row, 'created_at'),
    updatedAt: readString(row, 'updated_at'),
  };
}

export function loadReservationRow(
  database: DatabaseSync,
  operationId: string,
): ReservationStorageRow | null {
  const row = database.prepare(
    'SELECT operation_id, mandate_id, mandate_version, currency, amount_minor, state FROM reservations WHERE operation_id = ?',
  ).get(operationId) as RawRow | undefined;
  if (!row) return null;
  const state = readString(row, 'state');
  if (state !== 'active' && state !== 'consumed' && state !== 'released') {
    throw new Error('Ledger reservation state is invalid');
  }
  return {
    operationId: readString(row, 'operation_id'),
    mandateId: readString(row, 'mandate_id'),
    mandateVersion: readNumber(row, 'mandate_version'),
    currency: readString(row, 'currency'),
    amountMinor: readNumber(row, 'amount_minor'),
    state,
  };
}

export function loadEffectRows(database: DatabaseSync, operationId: string): EffectStorageRow[] {
  const rows = database.prepare(
    `SELECT effect_id, operation_id, kind, effect_key, request_digest, request_json,
       state, provider_id, response_json, created_at, updated_at
     FROM effects WHERE operation_id = ? ORDER BY created_at, effect_id`,
  ).all(operationId) as RawRow[];
  return rows.map((row) => ({
    effectId: readString(row, 'effect_id'),
    operationId: readString(row, 'operation_id'),
    kind: readString(row, 'kind'),
    effectKey: readString(row, 'effect_key'),
    requestDigest: readString(row, 'request_digest'),
    requestJson: readString(row, 'request_json'),
    state: readString(row, 'state'),
    providerId: readStringOrNull(row, 'provider_id'),
    responseJson: readStringOrNull(row, 'response_json'),
    createdAt: readString(row, 'created_at'),
    updatedAt: readString(row, 'updated_at'),
  }));
}
