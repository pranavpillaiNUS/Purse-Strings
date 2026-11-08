import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { openProviderDatabase } from '../../execution/fake.ts';
import {
  applyMigrations,
  maxKnownMigrationVersion,
  SCHEMA_VERSION,
  MIGRATIONS,
} from '../schema.ts';
import {
  LedgerIdentityConflict,
  bindIdempotencyAlias,
  bindOperationPaymentProvider,
  findOperationIdentities,
  insertPayPalBindingRow,
  upgradePayPalBindingRow,
  insertReservationOperation,
  loadMandateRow,
  loadMandateTotals,
  loadOperationStorageRow,
  loadOperationPaymentProvider,
  loadPolicyRow,
  loadReservationRow,
  loadRevisionRow,
  openLedgerStore,
  recordAuditEvent,
  runTransaction,
  storeConfirmationRow,
  storeMandateRevision,
  storePolicySnapshot,
  canonicalCartJson,
  sha256Hex,
} from '../store.ts';
import { TEST_CART, TEST_CART_TOTAL_MINOR, TEST_CLOCK, TEST_MANDATE_DRAFT, makeTempDir, removeTempDir } from './fixtures.ts';

function freshDatabase(dir: string, name: string): { database: DatabaseSync; path: string } {
  const path = `${dir}/${name}`;
  return { database: openLedgerStore(path), path };
}

test('schema migrations apply once and create every designed table', () => {
  const dir = makeTempDir('schema');
  try {
    const { database, path } = freshDatabase(dir, 'ledger.db');
    const tables = (database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all() as Array<{ name: string }>).map((row) => row.name);
    for (const table of ['schema_migrations', 'policies', 'mandates', 'mandate_revisions', 'confirmations',
      'operations', 'reservations', 'reservation_lines', 'idempotency_aliases', 'effects',
      'worker_leases', 'audit_events']) {
      assert.ok(tables.includes(table), `missing table ${table}`);
    }
    const applied = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      .map((row) => (row as { version: number }).version);
    assert.deepEqual(applied, MIGRATIONS.map((migration) => migration.version));
    assert.equal(SCHEMA_VERSION, maxKnownMigrationVersion());
    const policiesTable = database.prepare("PRAGMA table_list('policies')").get() as
      { strict: number } | undefined;
    assert.equal(policiesTable?.strict, 1, 'policies must be a STRICT table');
    // Re-opening is idempotent and rejects nothing.
    database.close();
    const reopened = openLedgerStore(path);
    const reopenedTotal = (reopened.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get() as { total: number }).total;
    assert.equal(reopenedTotal, MIGRATIONS.length);
    reopened.close();
  } finally {
    removeTempDir(dir);
  }
});

test('a database written by a newer schema version is rejected', () => {
  const dir = makeTempDir('future-version');
  try {
    const { database, path } = freshDatabase(dir, 'ledger.db');
    database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      maxKnownMigrationVersion() + 1, TEST_CLOCK,
    );
    database.close();
    assert.throws(() => openLedgerStore(path), /unknown to this build/);
  } finally {
    removeTempDir(dir);
  }
});

test('failed ledger and provider initialization closes the database connection', (t) => {
  const dir = makeTempDir('failed-open-cleanup');
  try {
    const ledgerPath = `${dir}/ledger.db`;
    const ledger = openLedgerStore(ledgerPath);
    ledger.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(maxKnownMigrationVersion() + 1, TEST_CLOCK);
    ledger.close();

    const providerPath = `${dir}/provider.db`;
    const provider = openProviderDatabase(providerPath);
    provider.prepare('INSERT INTO provider_migrations (version, applied_at) VALUES (?, ?)')
      .run(999, TEST_CLOCK);
    provider.close();

    const close = t.mock.method(DatabaseSync.prototype, 'close');
    assert.throws(() => openLedgerStore(ledgerPath), /unknown to this build/);
    assert.equal(close.mock.callCount(), 1, 'failed ledger open must close its connection');
    assert.throws(() => openProviderDatabase(providerPath), /unknown to this build/);
    assert.equal(close.mock.callCount(), 2, 'failed provider open must close its connection');
  } finally {
    t.mock.restoreAll();
    removeTempDir(dir);
  }
});

test('a failing migration rolls back completely without recording its version', () => {
  const dir = makeTempDir('migration-rollback');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    const broken: typeof MIGRATIONS = [...MIGRATIONS, {
      version: maxKnownMigrationVersion() + 1,
      sql: 'CREATE TABLE half_written (id INTEGER); INSERT INTO no_such_table VALUES (1);',
    }];
    assert.throws(() => applyMigrations(database, broken));
    const applied = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      .map((row) => (row as { version: number }).version);
    assert.deepEqual(applied, MIGRATIONS.map((migration) => migration.version));
    const tables = (database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'half_written'",
    ).all() as Array<{ name: string }>);
    assert.equal(tables.length, 0);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('a migration-1 strand with an anonymous audit row lacking its mandate fails closed at migration 2', () => {
  const dir = makeTempDir('legacy-v1-strand');
  try {
    const path = `${dir}/ledger.db`;
    const legacy = new DatabaseSync(path);
    applyMigrations(legacy, MIGRATIONS.filter((migration) => migration.version === 1));
    // Legal under migration 1: a NULL operation_id satisfies the composite
    // foreign key, so the mandate id was only re-checked by migration 2.
    legacy.prepare(
      `INSERT INTO audit_events (mandate_id, operation_id, kind, event_json, created_at)
       VALUES ('m-1', NULL, 'policy_defined', '{}', '${TEST_CLOCK}')`,
    ).run();
    legacy.close();

    const database = new DatabaseSync(path);
    database.exec('PRAGMA foreign_keys = ON');
    assert.throws(() => applyMigrations(database), /FOREIGN KEY constraint failed/);
    const applied = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      .map((row) => (row as { version: number }).version);
    assert.deepEqual(applied, [1]);
    database.close();

    assert.throws(() => openLedgerStore(path), /FOREIGN KEY constraint failed/);
  } finally {
    removeTempDir(dir);
  }
});

test('an old-shape database upgraded by migration 2 gains the audit, reservation and exposure invariants', () => {
  const dir = makeTempDir('migration-2-upgrade');
  try {
    const path = `${dir}/ledger.db`;
    // Recreate a migration-1 database with the current MIGRATION_1 text, so the
    // immutability triggers are shared with the final schema via the shared
    // constant; only the foreign-key shape is legacy here (audit_events without
    // the mandate foreign key migration 2 adds).
    const legacy = new DatabaseSync(path);
    applyMigrations(legacy, MIGRATIONS.filter((migration) => migration.version === 1));
    legacy.prepare(
      `INSERT INTO policies (policy_id, policy_version, content_json, digest, created_at)
       VALUES ('hardware-policy', 1, '{}', '${'a'.repeat(64)}', '${TEST_CLOCK}')`,
    ).run();
    legacy.prepare("INSERT INTO mandates (mandate_id, exposure_started) VALUES ('m-1', 0)").run();
    legacy.prepare(
      `INSERT INTO mandate_revisions (mandate_id, version, policy_id, policy_version, draft_json, digest, created_at)
       VALUES ('m-1', 1, 'hardware-policy', 1, '{}', '${'b'.repeat(64)}', '${TEST_CLOCK}')`,
    ).run();
    // One legacy operation with an audit row linked to it, so the INSERT SELECT
    // rebuild is exercised for operation-linked rows as well as anonymous ones.
    legacy.prepare(
      `INSERT INTO operations (operation_id, mandate_id, mandate_version, cart_id, request_digest, cart_json,
         quote_json, terms_digest, status, created_at, updated_at)
       VALUES ('op-legacy', 'm-1', 1, 'cart-legacy', '${'c'.repeat(64)}', '{}', '{}', '${'d'.repeat(64)}',
         'reserved', '${TEST_CLOCK}', '${TEST_CLOCK}')`,
    ).run();
    legacy.prepare(
      `INSERT INTO audit_events (mandate_id, operation_id, kind, event_json, created_at)
       VALUES ('m-1', NULL, 'policy_defined', '{}', '${TEST_CLOCK}')`,
    ).run();
    legacy.prepare(
      `INSERT INTO audit_events (mandate_id, operation_id, kind, event_json, created_at)
       VALUES ('m-1', 'op-legacy', 'operation_reserved', '${JSON.stringify({ linked: true })}', '${TEST_CLOCK}')`,
    ).run();
    legacy.close();

    const database = openLedgerStore(path);
    const migrated = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      .map((row) => (row as { version: number }).version);
    assert.deepEqual(migrated, MIGRATIONS.map((migration) => migration.version));
    // Existing audit rows survive the rebuild field-by-field, including the
    // operation link and the anonymous row.
    const kept = database.prepare(
      `SELECT event_id, mandate_id, operation_id, kind, event_json, created_at
         FROM audit_events ORDER BY event_id`,
    ).all() as Array<{
      event_id: number; mandate_id: string; operation_id: string | null;
      kind: string; event_json: string; created_at: string;
    }>;
    assert.equal(kept.length, 2);
    // node:sqlite rows are null-prototype objects; spread into a plain object
    // so strict deep equality compares values, not prototypes.
    assert.deepEqual({ ...kept[0] }, {
      event_id: 1, mandate_id: 'm-1', operation_id: null, kind: 'policy_defined',
      event_json: '{}', created_at: TEST_CLOCK,
    });
    assert.deepEqual({ ...kept[1] }, {
      event_id: 2, mandate_id: 'm-1', operation_id: 'op-legacy', kind: 'operation_reserved',
      event_json: '{"linked":true}', created_at: TEST_CLOCK,
    });
    // The upgrade path and a fresh migration-1-plus-2 database end with the
    // byte-identical trigger set, closing the silent-missing-invariant gap.
    const triggerSet = (db: DatabaseSync) => (db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
    ).all() as Array<{ name: string; sql: string }>).map((row) => ({ ...row }));
    const fresh = freshDatabase(dir, 'ledger-fresh.db').database;
    assert.deepEqual(triggerSet(database), triggerSet(fresh));
    fresh.close();
    // The rebuilt table regains its immutability triggers.
    assert.throws(() => database.prepare('UPDATE audit_events SET event_json = ?').run('{}'), /immutable/);
    assert.throws(() => database.prepare('DELETE FROM audit_events').run(), /immutable/);
    // Both foreign keys are enforced on the rebuilt table.
    assert.throws(() => recordAuditEvent(database, 'm-ghost', null, 'forge', {}, TEST_CLOCK), /FOREIGN KEY/);
    assert.throws(() => recordAuditEvent(database, 'm-1', 'op-ghost', 'forge', {}, TEST_CLOCK), /FOREIGN KEY/);
    // Reservation money and exposure-permanence invariants now exist.
    seedReservationOperation(database, 'op-up');
    assert.throws(() => database.prepare("UPDATE reservations SET amount_minor = 1 WHERE operation_id = 'op-up'").run(),
      /immutable/);
    assert.throws(() => database.prepare("UPDATE mandates SET exposure_started = 0 WHERE mandate_id = 'm-1'").run(),
      /permanent/);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

function seedAuthority(database: DatabaseSync): void {
  storePolicySnapshot(database, {
    policyId: 'hardware-policy',
    policyVersion: 1,
    contentJson: JSON.stringify(TEST_MANDATE_DRAFT),
    digest: sha256Hex(JSON.stringify(TEST_MANDATE_DRAFT)),
    createdAt: TEST_CLOCK,
  });
  database.prepare("INSERT INTO mandates (mandate_id, exposure_started) VALUES ('m-1', 0)").run();
  storeMandateRevision(database, {
    mandateId: 'm-1',
    version: 1,
    policyId: 'hardware-policy',
    policyVersion: 1,
    draftJson: JSON.stringify(TEST_MANDATE_DRAFT),
    digest: 'a'.repeat(64),
    createdAt: TEST_CLOCK,
  });
}

function seedReservationOperation(database: DatabaseSync, operationId: string): void {
  const cart = { ...TEST_CART, id: `cart-${operationId}` };
  insertReservationOperation(database, {
    operationId,
    mandateId: 'm-1',
    mandateVersion: 1,
    cartId: cart.id,
    supplierId: 'store-a',
    cartJson: canonicalCartJson({ ...cart, mandateId: 'm-1', mandateVersion: 1 } as typeof TEST_CART),
    quoteJson: JSON.stringify({ totalMinor: TEST_CART_TOTAL_MINOR }),
    requestDigest: sha256Hex(cart.id),
    termsDigest: 'b'.repeat(64),
    amountMinor: TEST_CART_TOTAL_MINOR,
    currency: 'SGD',
    createdAt: TEST_CLOCK,
    lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 3 }],
    idempotencyKey: `key-${operationId}`,
    auditKind: 'operation_reserved',
    auditDetails: {},
  });
}

test('policy, revision, confirmation, audit and alias rows are immutable', () => {
  const dir = makeTempDir('immutability');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    storeConfirmationRow(database, {
      mandateId: 'm-1', version: 1, digest: 'a'.repeat(64), approvedBy: 'fixture-ops-manager', confirmedAt: TEST_CLOCK,
    });
    recordAuditEvent(database, 'm-1', null, 'policy_defined', {}, TEST_CLOCK);

    assert.throws(() => database.prepare('UPDATE policies SET digest = ?').run('c'.repeat(64)), /immutable/);
    assert.throws(() => database.prepare('DELETE FROM policies').run(), /immutable/);
    assert.throws(() => database.prepare('UPDATE mandate_revisions SET draft_json = ?').run('{}'), /immutable/);
    assert.throws(() => database.prepare('DELETE FROM mandate_revisions').run(), /immutable/);
    assert.throws(() => database.prepare('UPDATE confirmations SET confirmed_at = ?').run(TEST_CLOCK), /immutable/);
    assert.throws(() => database.prepare('DELETE FROM confirmations').run(), /immutable/);
    assert.throws(() => database.prepare('UPDATE audit_events SET event_json = ?').run('{}'), /immutable/);
    assert.throws(() => database.prepare('DELETE FROM audit_events').run(), /immutable/);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('operation identity columns cannot mutate; status can advance for the execution state machine', () => {
  const dir = makeTempDir('operation-immutability');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    seedReservationOperation(database, 'op-1');
    for (const [column, value] of [
      ['cart_id', 'rotated'], ['request_digest', 'd'.repeat(64)], ['mandate_id', 'm-2'],
      ['mandate_version', 2], ['quote_json', '{}'], ['cart_json', '{}'], ['terms_digest', 'e'.repeat(64)],
      ['created_at', '2000-01-01T00:00:00Z'],
    ] as const) {
      assert.throws(() => database.prepare(`UPDATE operations SET ${column} = ? WHERE operation_id = 'op-1'`).run(value),
        /immutable/, `expected ${column} to be immutable`);
    }
    database.prepare("UPDATE operations SET status = 'running', updated_at = ? WHERE operation_id = 'op-1'")
      .run(TEST_CLOCK);
    assert.equal((loadOperationStorageRow(database, 'op-1') as { status: string }).status, 'running');
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('effect request identity is immutable; worker leases and effects accept schema-shaped rows', () => {
  const dir = makeTempDir('effects-schema');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    seedReservationOperation(database, 'op-1');
    database.prepare(
      `INSERT INTO effects (effect_id, operation_id, kind, effect_key, request_digest, request_json,
         state, provider_id, response_json, created_at, updated_at)
       VALUES ('fx-1', 'op-1', 'capture', 'op-1:capture', '${'f'.repeat(64)}', '{}', 'intent', NULL, NULL, ?, ?)`,
    ).run(TEST_CLOCK, TEST_CLOCK);
    assert.throws(() => database.prepare("UPDATE effects SET kind = 'order' WHERE effect_id = 'fx-1'").run(), /immutable/);
    assert.throws(() => database.prepare("UPDATE effects SET request_json = '{}' WHERE effect_id = 'fx-1'").run(), /immutable/);
    database.prepare("UPDATE effects SET state = 'in_flight', updated_at = ? WHERE effect_id = 'fx-1'").run(TEST_CLOCK);
    database.prepare(
      "INSERT INTO worker_leases (operation_id, owner_id, generation, expires_at_ms) VALUES ('op-1', NULL, 0, 0)",
    ).run();
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('storage CHECK bounds reject out-of-range amounts, quantities, currency, status and digests', () => {
  const dir = makeTempDir('bounds');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    seedReservationOperation(database, 'op-1');
    assert.throws(() => database.prepare(
      "INSERT INTO reservations (operation_id, mandate_id, mandate_version, currency, amount_minor, state) VALUES ('op-x', 'm-1', 1, 'SGD', 1000000001, 'active')",
    ).run(), /CHECK/);
    // A second valid operation removes the foreign key as a failure candidate.
    seedReservationOperation(database, 'op-2');
    assert.throws(() => database.prepare(
      "INSERT INTO reservations (operation_id, mandate_id, mandate_version, currency, amount_minor, state) VALUES ('op-2', 'm-1', 1, 'USD', 10, 'active')",
    ).run(), /CHECK/);
    assert.throws(() => database.prepare(
      "INSERT INTO reservation_lines (operation_id, requirement_id, sku, quantity) VALUES ('op-1', 'engineering-laptops', 'LAP-14-AIR', 0)",
    ).run());
    assert.throws(() => database.prepare(
      "UPDATE operations SET status = 'paid' WHERE operation_id = 'op-1'",
    ).run());
    assert.throws(() => database.prepare(
      "INSERT INTO policies (policy_id, policy_version, content_json, digest, created_at) VALUES ('p2', 1, '{}', 'nothex', ?)",
    ).run(TEST_CLOCK));
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('policy and revision snapshots replay identical content and conflict on changed content', () => {
  const dir = makeTempDir('snapshot-replay');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    const content = JSON.stringify(TEST_MANDATE_DRAFT);
    const digest = sha256Hex(content);
    const snapshot = { policyId: 'hardware-policy', policyVersion: 1, contentJson: content, digest, createdAt: TEST_CLOCK };
    assert.equal(storePolicySnapshot(database, snapshot), 'created');
    assert.equal(storePolicySnapshot(database, snapshot), 'replayed');
    assert.throws(() => storePolicySnapshot(database, { ...snapshot, contentJson: '{"changed":true}', digest: sha256Hex('{"changed":true}') }),
      LedgerIdentityConflict);

    const revision = {
      mandateId: 'm-1', version: 1, policyId: 'hardware-policy', policyVersion: 1,
      draftJson: content, digest: 'a'.repeat(64), createdAt: TEST_CLOCK,
    };
    database.prepare("INSERT INTO mandates (mandate_id, exposure_started) VALUES ('m-1', 0)").run();
    assert.equal(storeMandateRevision(database, revision), 'created');
    assert.equal(storeMandateRevision(database, revision), 'replayed');
    assert.throws(() => storeMandateRevision(database, { ...revision, draftJson: '{"other":1}', digest: '9'.repeat(64) }),
      LedgerIdentityConflict);
    assert.equal(loadRevisionRow(database, 'm-1', 1)?.digest, 'a'.repeat(64));
    assert.equal(loadPolicyRow(database, 'hardware-policy', 1)?.digest, digest);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('confirmation rows replay the same digest unchanged and refuse a different digest', () => {
  const dir = makeTempDir('confirmation-replay');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    const confirmation = { mandateId: 'm-1', version: 1, digest: 'a'.repeat(64), approvedBy: 'fixture-ops-manager', confirmedAt: TEST_CLOCK };
    assert.equal(storeConfirmationRow(database, confirmation), 'created');
    const replay = storeConfirmationRow(database, { ...confirmation, approvedBy: 'someone-else', confirmedAt: '2030-01-01T00:00:00Z' });
    assert.equal(replay, 'replayed');
    const stored = database.prepare('SELECT approved_by, confirmed_at FROM confirmations').get() as { approved_by: string; confirmed_at: string };
    assert.equal(stored.approved_by, 'fixture-ops-manager');
    assert.equal(stored.confirmed_at, TEST_CLOCK);
    assert.throws(() => storeConfirmationRow(database, { ...confirmation, digest: 'c'.repeat(64) }), LedgerIdentityConflict);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('alias binding is idempotent per operation and refuses to rebind to another operation', () => {
  const dir = makeTempDir('alias-binding');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    seedReservationOperation(database, 'op-1');
    seedReservationOperation(database, 'op-2');
    bindIdempotencyAlias(database, 'm-1', 'shared-key', 'op-1');
    bindIdempotencyAlias(database, 'm-1', 'shared-key', 'op-1');
    assert.throws(() => bindIdempotencyAlias(database, 'm-1', 'shared-key', 'op-2'), LedgerIdentityConflict);
    const identities = findOperationIdentities(database, 'm-1', 'cart-op-1', 'shared-key');
    assert.equal(identities.cartOperationId, 'op-1');
    assert.equal(identities.aliasOperationId, 'op-1');
    bindIdempotencyAlias(database, 'm-1', 'another-key', 'op-2');
    const divergent = findOperationIdentities(database, 'm-1', 'cart-op-1', 'another-key');
    assert.equal(divergent.cartOperationId, 'op-1');
    assert.equal(divergent.aliasOperationId, 'op-2');
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('audit events verify the operation belongs to the mandate through the foreign key', () => {
  const dir = makeTempDir('audit-fk');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    seedReservationOperation(database, 'op-1');
    recordAuditEvent(database, 'm-1', 'op-1', 'note', {}, TEST_CLOCK);
    assert.throws(() => recordAuditEvent(database, 'm-other', 'op-1', 'forge', {}, TEST_CLOCK));
    assert.throws(() => recordAuditEvent(database, 'm-1', 'op-ghost', 'forge', {}, TEST_CLOCK));
    // An audit event must also reference a mandate that actually exists.
    assert.throws(() => recordAuditEvent(database, 'm-ghost', null, 'forge', {}, TEST_CLOCK));
    const count = (database.prepare('SELECT COUNT(*) AS total FROM audit_events').get() as { total: number }).total;
    // The seeded reservation already wrote one operation_reserved event.
    assert.equal(count, 2);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('mandate totals count active as reserved and consumed as committed across revisions, ignoring released', () => {
  const dir = makeTempDir('totals');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    seedReservationOperation(database, 'op-1');
    seedReservationOperation(database, 'op-2');
    database.prepare("UPDATE reservations SET state = 'consumed' WHERE operation_id = 'op-1'").run();
    database.prepare("UPDATE reservations SET state = 'released' WHERE operation_id = 'op-2'").run();
    const totals = loadMandateTotals(database, 'm-1');
    assert.equal(totals.committedMinor, TEST_CART_TOTAL_MINOR);
    assert.equal(totals.reservedMinor, 0);
    assert.deepEqual(totals.perRequirement.get('engineering-laptops'), { committed: 3, reserved: 0 });
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('runTransaction rolls back failed work and commits successful work', () => {
  const dir = makeTempDir('transaction');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    assert.throws(() => runTransaction(database, () => {
      seedReservationOperation(database, 'op-rb');
      throw new Error('simulated failure');
    }), /simulated failure/);
    assert.equal(loadOperationStorageRow(database, 'op-rb'), null);
    const committed = runTransaction(database, () => {
      seedReservationOperation(database, 'op-ok');
      return loadOperationStorageRow(database, 'op-ok');
    });
    assert.equal(committed?.operationId, 'op-ok');
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('runTransaction rejects nested entry and async work instead of corrupting the transaction', () => {
  const dir = makeTempDir('transaction-misuse');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);

    assert.throws(() => runTransaction(database, () => {
      seedReservationOperation(database, 'op-nest');
      return runTransaction(database, () => seedReservationOperation(database, 'op-inner'));
    }), /cannot nest/);
    // The aborted outer transaction leaves nothing behind and the connection
    // is usable again, not stuck inside a broken transaction.
    assert.equal(loadOperationStorageRow(database, 'op-nest'), null);
    assert.equal(loadOperationStorageRow(database, 'op-inner'), null);
    assert.equal(runTransaction(database, () => 'usable'), 'usable');

    assert.throws(() => runTransaction(database, () => {
      seedReservationOperation(database, 'op-async');
      return Promise.resolve('later');
    }), /Promise/);
    assert.equal(loadOperationStorageRow(database, 'op-async'), null);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('reservation money and ownership columns are immutable; state stays mutable', () => {
  const dir = makeTempDir('reservation-immutability');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    seedReservationOperation(database, 'op-1');
    for (const [column, value] of [
      ['amount_minor', 1], ['currency', 'USD'], ['mandate_id', 'm-2'], ['mandate_version', 2],
    ] as const) {
      assert.throws(() => database.prepare(`UPDATE reservations SET ${column} = ? WHERE operation_id = 'op-1'`).run(value),
        /immutable/, `expected ${column} to be immutable`);
    }
    database.prepare("UPDATE reservations SET state = 'consumed' WHERE operation_id = 'op-1'").run();
    assert.equal((loadReservationRow(database, 'op-1') as { state: string }).state, 'consumed');
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('exposure_started never reverses from exposed back to unexposed', () => {
  const dir = makeTempDir('exposure-permanence');
  try {
    const { database } = freshDatabase(dir, 'ledger.db');
    seedAuthority(database);
    seedReservationOperation(database, 'op-1');
    assert.throws(() => database.prepare("UPDATE mandates SET exposure_started = 0 WHERE mandate_id = 'm-1'").run(),
      /permanent/);
    assert.equal(loadMandateRow(database, 'm-1')?.exposureStarted, true);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

// --- Migration 3: the PayPal binding table (unit 5) ---

test('migration 3 adds paypal binding storage with fresh-parity invariants and immutable identities', () => {
  const dir = makeTempDir('migration-3');
  try {
    const path = `${dir}/ledger.db`;
    // Build a pre-v3 (v1+v2) database with confirmed authority and one operation.
    const legacy = new DatabaseSync(path);
    applyMigrations(legacy, MIGRATIONS.filter((migration) => migration.version <= 2));
    seedAuthority(legacy);
    seedReservationOperation(legacy, 'op-v3-up');
    legacy.close();

    // Opening the store upgrades 2 → 3 and keeps the stored facts.
    const database = openLedgerStore(path);
    try {
      const applied = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
        .map((row) => (row as { version: number }).version);
      assert.deepEqual(applied, MIGRATIONS.map((migration) => migration.version));

      const bindingTable = database.prepare("PRAGMA table_list('operation_paypal_bindings')").get() as
        { strict: number } | undefined;
      assert.equal(bindingTable?.strict, 1, 'the binding table must be STRICT');

      // The upgraded and a fresh database end with the byte-identical trigger set.
      const triggerSet = (db: DatabaseSync) => (db.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
      ).all() as Array<{ name: string; sql: string }>).map((row) => ({ ...row }));
      const fresh = freshDatabase(dir, 'ledger-fresh-v3.db').database;
      try {
        assert.deepEqual(triggerSet(database), triggerSet(fresh));
      } finally {
        fresh.close();
      }

      // Insert + upgrade + replay behavior through the storage helpers.
      runTransaction(database, () => {
        insertPayPalBindingRow(database, {
          operationId: 'op-v3-up', orderId: 'ORD-V3', invoiceId: 'op-v3-up',
          amountMinor: TEST_CART_TOTAL_MINOR, createdAt: TEST_CLOCK,
        });
      });
      assert.throws(() => runTransaction(database, () => {
        // A ghost operation is refused by the foreign key.
        insertPayPalBindingRow(database, {
          operationId: 'op-ghost-v3', orderId: 'ORD-X', invoiceId: 'op-ghost-v3',
          amountMinor: 1, createdAt: TEST_CLOCK,
        });
      }), /FOREIGN KEY/);
      assert.throws(() => runTransaction(database, () => {
        insertPayPalBindingRow(database, {
          operationId: 'op-v3-up', orderId: 'ORD-OTHER', invoiceId: 'op-v3-up',
          amountMinor: TEST_CART_TOTAL_MINOR, createdAt: TEST_CLOCK,
        });
      }), /A different paypal binding already exists/);

      runTransaction(database, () => {
        upgradePayPalBindingRow(database, 'op-v3-up', 'AUTH-V3', TEST_CLOCK);
      });
      // Second write (even the same value) is refused: authorization_id is write-once.
      assert.throws(() => database.prepare(
        'UPDATE operation_paypal_bindings SET authorization_id = ? WHERE operation_id = ?',
      ).run('AUTH-V3-AGAIN', 'op-v3-up'), /authorization id is immutable/);
      assert.throws(() => database.prepare(
        'UPDATE operation_paypal_bindings SET amount_minor = 1 WHERE operation_id = ?',
      ).run('op-v3-up'), /identity columns are immutable/);
      assert.throws(() => database.prepare(
        'UPDATE operation_paypal_bindings SET order_id = ? WHERE operation_id = ?',
      ).run('ORD-OTHER', 'op-v3-up'), /identity columns are immutable/);
      // provider_state is the one controlled upgrade; the row is still readable.
      // Rows are also never removable: even the owner of the row cannot DELETE it.
      assert.throws(() => database.prepare(
        'DELETE FROM operation_paypal_bindings WHERE operation_id = ?',
      ).run('op-v3-up'), /never deleted/);
      const binding = database.prepare(
        'SELECT provider_state, authorization_id, amount_minor FROM operation_paypal_bindings WHERE operation_id = ?',
      ).get('op-v3-up') as { provider_state: string; authorization_id: string; amount_minor: number };
      assert.equal(binding.provider_state, 'authorization_held');
      assert.equal(binding.authorization_id, 'AUTH-V3');
      assert.equal(binding.amount_minor, TEST_CART_TOTAL_MINOR);
      // The pre-existing operation survived the upgrade untouched.
      assert.equal(loadOperationStorageRow(database, 'op-v3-up')?.status, 'reserved');
    } finally {
      database.close();
    }
  } finally {
    removeTempDir(dir);
  }
});

test('legacy payment-provider facts remain unknown until pinned or supported by a binding, and conflicting facts refuse', () => {
  const dir = makeTempDir('provider-history');
  const { database, path } = freshDatabase(dir, 'ledger.db');
  try {
    seedAuthority(database);
    seedReservationOperation(database, 'op-legacy');
    seedReservationOperation(database, 'op-legacy-sandbox');
    assert.equal(loadOperationPaymentProvider(database, 'op-legacy'), null);
    runTransaction(database, () => {
      bindOperationPaymentProvider(database, loadOperationStorageRow(database, 'op-legacy')!, 'fake', TEST_CLOCK);
      insertPayPalBindingRow(database, {
        operationId: 'op-legacy-sandbox', orderId: 'ORDER-LEGACY', invoiceId: 'op-legacy-sandbox',
        amountMinor: TEST_CART_TOTAL_MINOR, createdAt: TEST_CLOCK,
      });
    });
    assert.throws(() => runTransaction(database, () => {
      bindOperationPaymentProvider(database, loadOperationStorageRow(database, 'op-legacy')!, 'paypal-sandbox', TEST_CLOCK);
    }), /configured payment provider differs/);
    assert.equal(loadOperationPaymentProvider(database, 'op-legacy-sandbox'), 'paypal-sandbox');
    const reopened = openLedgerStore(path);
    try { assert.equal(loadOperationPaymentProvider(reopened, 'op-legacy'), 'fake'); }
    finally { reopened.close(); }
    recordAuditEvent(database, 'm-1', 'op-legacy', 'payment_provider_selected', { paymentProvider: 'paypal-sandbox' }, TEST_CLOCK);
    assert.throws(() => loadOperationPaymentProvider(database, 'op-legacy'), /facts conflict/);
  } finally {
    database.close();
    removeTempDir(dir);
  }
});
