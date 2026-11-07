import type { DatabaseSync } from 'node:sqlite';

export const SCHEMA_VERSION = 3;

// Versioned migrations. Applying them runs the whole read-applied-then-apply
// cycle inside one synchronous BEGIN IMMEDIATE transaction, so a failing
// migration rolls back completely and concurrent openers serialize.
export interface LedgerMigration {
  version: number;
  sql: string;
}

// Shared verbatim between migration 1 and migration 2: the migration 2 rebuild
// drops audit_events and its triggers, so a divergent copy would recreate
// different invariants on upgraded databases than fresh ones get.
const AUDIT_IMMUTABILITY_TRIGGERS = `CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;

`;

const MIGRATION_1 = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE policies (
  policy_id TEXT NOT NULL CHECK (length(policy_id) BETWEEN 1 AND 200),
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  digest TEXT NOT NULL CHECK (length(digest) = 64 AND digest NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (policy_id, policy_version)
) STRICT;

CREATE TABLE mandates (
  mandate_id TEXT NOT NULL PRIMARY KEY CHECK (length(mandate_id) BETWEEN 1 AND 200),
  active_version INTEGER CHECK (active_version > 0),
  exposure_started INTEGER NOT NULL CHECK (exposure_started IN (0, 1)),
  FOREIGN KEY (mandate_id, active_version)
    REFERENCES mandate_revisions(mandate_id, version) DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE mandate_revisions (
  mandate_id TEXT NOT NULL CHECK (length(mandate_id) BETWEEN 1 AND 200),
  version INTEGER NOT NULL CHECK (version > 0),
  policy_id TEXT NOT NULL CHECK (length(policy_id) BETWEEN 1 AND 200),
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  digest TEXT NOT NULL CHECK (length(digest) = 64 AND digest NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (mandate_id, version),
  FOREIGN KEY (mandate_id) REFERENCES mandates(mandate_id),
  FOREIGN KEY (policy_id, policy_version) REFERENCES policies(policy_id, policy_version)
) STRICT;

CREATE TABLE confirmations (
  mandate_id TEXT NOT NULL CHECK (length(mandate_id) BETWEEN 1 AND 200),
  version INTEGER NOT NULL CHECK (version > 0),
  digest TEXT NOT NULL CHECK (length(digest) = 64 AND digest NOT GLOB '*[^0-9a-f]*'),
  approved_by TEXT NOT NULL CHECK (length(approved_by) BETWEEN 1 AND 200),
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (mandate_id, version),
  FOREIGN KEY (mandate_id, version) REFERENCES mandate_revisions(mandate_id, version)
) STRICT;

CREATE TABLE operations (
  operation_id TEXT NOT NULL PRIMARY KEY CHECK (length(operation_id) BETWEEN 1 AND 200),
  mandate_id TEXT NOT NULL CHECK (length(mandate_id) BETWEEN 1 AND 200),
  mandate_version INTEGER NOT NULL CHECK (mandate_version > 0),
  cart_id TEXT NOT NULL CHECK (length(cart_id) BETWEEN 1 AND 200),
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  cart_json TEXT NOT NULL CHECK (json_valid(cart_json)),
  quote_json TEXT NOT NULL CHECK (json_valid(quote_json)),
  terms_digest TEXT NOT NULL CHECK (length(terms_digest) = 64 AND terms_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK (status IN (
    'reserved', 'running', 'reconciliation_required', 'ordered',
    'failed', 'compensation_pending', 'compensated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (mandate_id, cart_id),
  UNIQUE (operation_id, mandate_id),
  FOREIGN KEY (mandate_id, mandate_version)
    REFERENCES mandate_revisions(mandate_id, version)
) STRICT;

CREATE TABLE reservations (
  operation_id TEXT NOT NULL PRIMARY KEY CHECK (length(operation_id) BETWEEN 1 AND 200),
  mandate_id TEXT NOT NULL CHECK (length(mandate_id) BETWEEN 1 AND 200),
  mandate_version INTEGER NOT NULL CHECK (mandate_version > 0),
  currency TEXT NOT NULL CHECK (currency = 'SGD'),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0 AND amount_minor <= 1000000000),
  state TEXT NOT NULL CHECK (state IN ('active', 'consumed', 'released')),
  FOREIGN KEY (operation_id, mandate_id)
    REFERENCES operations(operation_id, mandate_id)
) STRICT;

CREATE TABLE reservation_lines (
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 200),
  requirement_id TEXT NOT NULL CHECK (length(requirement_id) BETWEEN 1 AND 200),
  sku TEXT NOT NULL CHECK (length(sku) BETWEEN 1 AND 200),
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 1000),
  PRIMARY KEY (operation_id, sku),
  FOREIGN KEY (operation_id) REFERENCES reservations(operation_id)
) STRICT;

CREATE TABLE idempotency_aliases (
  mandate_id TEXT NOT NULL CHECK (length(mandate_id) BETWEEN 1 AND 200),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 200),
  PRIMARY KEY (mandate_id, idempotency_key),
  FOREIGN KEY (operation_id, mandate_id)
    REFERENCES operations(operation_id, mandate_id)
) STRICT;

CREATE TABLE effects (
  effect_id TEXT NOT NULL PRIMARY KEY CHECK (length(effect_id) BETWEEN 1 AND 200),
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('capture', 'order', 'refund')),
  effect_key TEXT NOT NULL UNIQUE CHECK (length(effect_key) BETWEEN 1 AND 500),
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  state TEXT NOT NULL CHECK (state IN ('intent', 'in_flight', 'unknown', 'succeeded', 'rejected')),
  provider_id TEXT,
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (operation_id, kind),
  FOREIGN KEY (operation_id) REFERENCES operations(operation_id)
) STRICT;

CREATE TABLE worker_leases (
  operation_id TEXT NOT NULL PRIMARY KEY CHECK (length(operation_id) BETWEEN 1 AND 200),
  owner_id TEXT,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms >= 0),
  FOREIGN KEY (operation_id) REFERENCES operations(operation_id)
) STRICT;

CREATE TABLE audit_events (
  event_id INTEGER PRIMARY KEY,
  mandate_id TEXT NOT NULL CHECK (length(mandate_id) BETWEEN 1 AND 200),
  operation_id TEXT CHECK (operation_id IS NULL OR (length(operation_id) BETWEEN 1 AND 200)),
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 100),
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (operation_id, mandate_id)
    REFERENCES operations(operation_id, mandate_id)
) STRICT;

CREATE TRIGGER policies_no_update
BEFORE UPDATE ON policies
BEGIN SELECT RAISE(ABORT, 'policy snapshots are immutable'); END;

CREATE TRIGGER policies_no_delete
BEFORE DELETE ON policies
BEGIN SELECT RAISE(ABORT, 'policy snapshots are immutable'); END;

CREATE TRIGGER mandate_revisions_no_update
BEFORE UPDATE ON mandate_revisions
BEGIN SELECT RAISE(ABORT, 'mandate revisions are immutable'); END;

CREATE TRIGGER mandate_revisions_no_delete
BEFORE DELETE ON mandate_revisions
BEGIN SELECT RAISE(ABORT, 'mandate revisions are immutable'); END;

CREATE TRIGGER confirmations_no_update
BEFORE UPDATE ON confirmations
BEGIN SELECT RAISE(ABORT, 'confirmations are immutable'); END;

CREATE TRIGGER confirmations_no_delete
BEFORE DELETE ON confirmations
BEGIN SELECT RAISE(ABORT, 'confirmations are immutable'); END;

${AUDIT_IMMUTABILITY_TRIGGERS}CREATE TRIGGER idempotency_aliases_no_update
BEFORE UPDATE ON idempotency_aliases
BEGIN SELECT RAISE(ABORT, 'idempotency aliases are immutable'); END;

CREATE TRIGGER idempotency_aliases_no_delete
BEFORE DELETE ON idempotency_aliases
BEGIN SELECT RAISE(ABORT, 'idempotency aliases are immutable'); END;

CREATE TRIGGER operations_identity_immutable
BEFORE UPDATE OF operation_id, mandate_id, mandate_version, cart_id,
  request_digest, cart_json, quote_json, terms_digest, created_at ON operations
BEGIN SELECT RAISE(ABORT, 'operation authority identity columns are immutable'); END;

CREATE TRIGGER effects_request_identity_immutable
BEFORE UPDATE OF effect_id, operation_id, kind, effect_key, request_digest, request_json ON effects
BEGIN SELECT RAISE(ABORT, 'effect request identity is immutable'); END;
`;

// Version 2 upgrades databases created by pre-repair builds: those applied the
// original migration 1 (audit_events without the mandate foreign key, no
// reservation-money or exposure-permanence triggers), so the same end state is
// enforced here on the existing data instead of being edited into migration 1.
const MIGRATION_2 = `
CREATE TABLE audit_events_new (
  event_id INTEGER PRIMARY KEY,
  mandate_id TEXT NOT NULL CHECK (length(mandate_id) BETWEEN 1 AND 200),
  operation_id TEXT CHECK (operation_id IS NULL OR (length(operation_id) BETWEEN 1 AND 200)),
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 100),
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (operation_id, mandate_id)
    REFERENCES operations(operation_id, mandate_id),
  FOREIGN KEY (mandate_id) REFERENCES mandates(mandate_id)
) STRICT;

INSERT INTO audit_events_new (event_id, mandate_id, operation_id, kind, event_json, created_at)
  SELECT event_id, mandate_id, operation_id, kind, event_json, created_at
  FROM audit_events;

DROP TABLE audit_events;
ALTER TABLE audit_events_new RENAME TO audit_events;

-- Dropping audit_events dropped its triggers; recreate them on the rebuilt table.
${AUDIT_IMMUTABILITY_TRIGGERS}CREATE TRIGGER reservations_money_immutable
BEFORE UPDATE OF amount_minor, currency, mandate_id, mandate_version ON reservations
BEGIN SELECT RAISE(ABORT, 'reservation money and ownership are immutable'); END;

CREATE TRIGGER mandates_exposure_never_reverses
BEFORE UPDATE OF exposure_started ON mandates
WHEN NEW.exposure_started = 0 AND OLD.exposure_started = 1
BEGIN SELECT RAISE(ABORT, 'exposure_started is permanent'); END;
`;

// Version 3 adds the PayPal authorization binding table (unit 5). Rows are
// written only by the operator's `operation-authorize` /
// `operation-complete-authorization` commands in short synchronous
// transactions; identity columns (order/authorization/invoice/currency/amount)
// are immutable once written, while provider_state is a controlled upgrade.
const MIGRATION_3 = `
CREATE TABLE operation_paypal_bindings (
  operation_id TEXT NOT NULL PRIMARY KEY CHECK (length(operation_id) BETWEEN 1 AND 200),
  order_id TEXT CHECK (order_id IS NULL OR (length(order_id) BETWEEN 1 AND 200)),
  authorization_id TEXT CHECK (authorization_id IS NULL OR (length(authorization_id) BETWEEN 1 AND 200)),
  invoice_id TEXT NOT NULL CHECK (length(invoice_id) BETWEEN 1 AND 127),
  currency TEXT NOT NULL CHECK (currency = 'SGD'),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0 AND amount_minor <= 1000000000),
  provider_state TEXT NOT NULL CHECK (provider_state IN ('order_created', 'authorization_held')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (operation_id) REFERENCES operations(operation_id)
) STRICT;

CREATE TRIGGER operation_paypal_bindings_identity_immutable
BEFORE UPDATE OF operation_id, order_id, invoice_id, currency, amount_minor, created_at
ON operation_paypal_bindings
BEGIN SELECT RAISE(ABORT, 'paypal binding identity columns are immutable'); END;

-- authorization_id is written exactly once: NULL (order_created) → held id.
-- A second write, even a same-value write, is refused.
CREATE TRIGGER operation_paypal_bindings_authorization_immutable
BEFORE UPDATE OF authorization_id ON operation_paypal_bindings
WHEN OLD.authorization_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'paypal binding authorization id is immutable'); END;
`;

export const MIGRATIONS: readonly LedgerMigration[] = [
  { version: 1, sql: MIGRATION_1 },
  { version: 2, sql: MIGRATION_2 },
  { version: 3, sql: MIGRATION_3 },
];

export function maxKnownMigrationVersion(): number {
  return MIGRATIONS.reduce((max, migration) => Math.max(max, migration.version), 0);
}

export function applyMigrations(
  database: DatabaseSync,
  migrations: readonly LedgerMigration[] = MIGRATIONS,
): void {
  // One BEGIN IMMEDIATE transaction covers reading the applied versions AND
  // applying what is missing: a second opener that waits out the first one
  // re-reads the winner's committed versions and skips cleanly instead of
  // re-running already-applied SQL. Caller is expected to have a busy_timeout
  // set, so a genuine lock timeout surfaces here as SQLITE_BUSY.
  database.exec('BEGIN IMMEDIATE');
  try {
    // Version 1 owns the schema_migrations table itself, so only read applied
    // versions when an earlier migration has already created it.
    const migrationTable = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    ).get();
    const applied = new Set<number>();
    if (migrationTable) {
      for (const row of database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()) {
        const version = (row as { version: unknown }).version;
        if (typeof version === 'number') applied.add(version);
      }
    }
    // A database written by a newer schema must never be "upgraded" backwards.
    const highestStored = applied.size === 0 ? 0 : Math.max(...applied);
    if (highestStored > maxKnownMigrationVersion()) {
      throw new Error(`Ledger schema version ${highestStored} is unknown to this build`);
    }
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      database.exec(migration.sql);
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, new Date().toISOString());
    }
    database.exec('COMMIT');
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* rollback is best-effort */ }
    throw error;
  }
}
