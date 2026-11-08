import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { EffectKind } from '../ledger/store.ts';
import { canonicalize, isSqliteBusy, sha256Hex } from '../ledger/store.ts';
import type { ApplyOutcome, ExecutionProvider, LookupOutcome } from './gateway.ts';

/**
 * Durable fake payment/supplier providers.
 *
 * They live in a SEPARATE persistent SQLite file from the application ledger.
 * A scenario always commits its effect to the provider database BEFORE any
 * success response is simulated back to the worker, so a process killed after
 * the call still left the established outcome behind and a fresh process can
 * reconcile from it. No money, inventory or supplier is real: everything here
 * is a labelled simulation.
 */

const PROVIDER_MIGRATION = `
CREATE TABLE provider_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE provider_effects (
  effect_key TEXT NOT NULL PRIMARY KEY CHECK (length(effect_key) BETWEEN 1 AND 500),
  kind TEXT NOT NULL CHECK (kind IN ('capture', 'order', 'refund')),
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'rejected')),
  provider_id TEXT NOT NULL CHECK (length(provider_id) BETWEEN 1 AND 200),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL
) STRICT;

INSERT INTO provider_migrations (version, applied_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%f000Z','now'));
`;

interface RawRow {
  [column: string]: unknown;
}

function readString(row: RawRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`Provider row column ${column} is missing`);
  return value;
}

export function openProviderDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  try {
    // busy_timeout must be set before journal_mode: concurrent executors opening
    // the same provider file would otherwise fail the WAL switch on SQLITE_BUSY.
    database.exec('PRAGMA busy_timeout = 5000');
    // SQLite does not honor the busy handler for the WAL switch itself: only a
    // waiting-read retry rescues contended first openers. The winner's committed
    // switch makes the file permanently WAL, so on BUSY wait through one read
    // and retry the now no-op switch instead of surfacing it.
    for (let attempt = 1; ; attempt += 1) {
      try {
        database.exec('PRAGMA journal_mode = WAL');
        break;
      } catch (error) {
        if (!isSqliteBusy(error) || attempt >= 5) throw error;
        database.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
      }
    }
    database.exec('PRAGMA synchronous = FULL');
    database.exec('PRAGMA foreign_keys = ON');
    const migrationTable = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provider_migrations'",
    ).get();
    if (!migrationTable) {
      database.exec('BEGIN IMMEDIATE');
      try {
        // Concurrent executors can both reach the migration; the second one
        // re-checks inside the write transaction and no-ops instead of failing.
        const recheck = database.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provider_migrations'",
        ).get();
        if (!recheck) {
          database.exec(PROVIDER_MIGRATION);
        }
        database.exec('COMMIT');
      } catch (error) {
        try { database.exec('ROLLBACK'); } catch { /* rollback is best-effort */ }
        throw error;
      }
    } else {
      const version = database.prepare('SELECT MAX(version) AS max FROM provider_migrations').get() as
        { max?: unknown } | undefined;
      if (version?.max !== 1) {
        throw new Error('Provider database schema is unknown to this build');
      }
    }
    return database;
  } catch (error) {
    try { database.close(); } catch { /* preserve the initialization error */ }
    throw error;
  }
}

/**
 * Test-only injected scenarios. Never reachable through CLI config, shopper
 * payloads or public API shape; only execution tests build the gateway with
 * them to kill the worker process at the right instant or lose a response.
 */
export interface FakeProviderScenario {
  /**
   * After the provider database commit for this kind, emit a parent signal
   * ("CRASHPOINT:<kind>") and never return: the test process then SIGKILLs the
   * worker, leaving the provider row durable but the application
   * unacknowledged.
   */
  crashAfterCommit?: EffectKind;
  /**
   * Before the provider even commits, emit the parent signal and never return:
   * the application effect row stays marked in-flight while the provider has
   * no record at all, which is exactly the ambiguous-absence case.
   */
  crashBeforeCommit?: EffectKind;
  /** The provider response is lost after the commit: apply reports unknown. */
  responseLossFor?: EffectKind;
  /** The provider outcome is a definitive rejection instead of success. */
  rejectFor?: EffectKind;
}

interface ProviderRow {
  effectKey: string;
  kind: string;
  requestDigest: string;
  outcome: string;
  providerId: string;
  responseJson: string;
}

function loadProviderRow(database: DatabaseSync, key: string): ProviderRow | null {
  const row = database.prepare(
    `SELECT effect_key, kind, request_digest, outcome, provider_id, response_json
     FROM provider_effects WHERE effect_key = ?`,
  ).get(key) as RawRow | undefined;
  if (!row) return null;
  return {
    effectKey: readString(row, 'effect_key'),
    kind: readString(row, 'kind'),
    requestDigest: readString(row, 'request_digest'),
    outcome: readString(row, 'outcome'),
    providerId: readString(row, 'provider_id'),
    responseJson: readString(row, 'response_json'),
  };
}

function hangForever(): Promise<never> {
  // The worker blocks inside applyEffect; the test parent SIGKILLs the process.
  return new Promise<never>(() => {});
}

export interface FakeProviderGateway extends ExecutionProvider {
  close(): void;
  /** Direct row count for tests; never a business surface. */
  countProviderRows(): number;
}

/**
 * Builds the fake provider gateway over its own database file. The request
 * identity (canonical JSON + SHA-256) must match the application effect row
 * byte-for-byte: same key with a different digest conflicts, and the conflict
 * surfaces to the worker as unknown, never silent success.
 */
export function createFakeProviderGateway(
  providerDatabasePath: string,
  scenario: FakeProviderScenario = {},
): FakeProviderGateway {
  const database = openProviderDatabase(providerDatabasePath);

  function emitCrash(kind: EffectKind, effectKey: string): void {
    // Signal the test parent through its stdout watcher; diagnostics stay on stderr.
    process.stdout.write(`CRASHPOINT:${kind}:${effectKey}\n`);
  }

  const gateway: FakeProviderGateway = {
    paymentProvider: 'fake',
    async applyEffect(effectKey: string, kind: EffectKind, request: unknown) {
      const requestJson = canonicalize(request);
      const requestDigest = sha256Hex(requestJson);
      let row = loadProviderRow(database, effectKey);
      if (row !== null && row.requestDigest !== requestDigest) {
        return { outcome: 'unknown' as const };
      }
      if (scenario.crashBeforeCommit === kind) {
        emitCrash(kind, effectKey);
        return await hangForever();
      }
      if (row === null) {
        const outcome = scenario.rejectFor === kind ? 'rejected' : 'succeeded';
        const providerId = `fake-${kind}-${randomUUID()}`;
        const responseJson = canonicalize({ providerId, outcome });
        database.exec('BEGIN IMMEDIATE');
        try {
          durableInsert(database, effectKey, kind, requestDigest, requestJson, outcome, providerId, responseJson);
          database.exec('COMMIT');
        } catch (error) {
          try { database.exec('ROLLBACK'); } catch { /* rollback is best-effort */ }
          throw error;
        }
        // The provider DB now durably owns the outcome; the worker records it
        // next. Crash hooks fire exactly here: after commit, before ack.
        if (scenario.crashAfterCommit === kind) {
          emitCrash(kind, effectKey);
          return await hangForever();
        }
        row = { effectKey, kind, requestDigest, outcome, providerId, responseJson };
      }
      if (scenario.responseLossFor === kind) {
        return { outcome: 'unknown' as const };
      }
      return {
        outcome: row.outcome === 'rejected' ? ('rejected' as const) : ('succeeded' as const),
        providerId: row.providerId,
        responseJson: row.responseJson,
      };
    },
    async lookupEffect(effectKey: string): Promise<LookupOutcome> {
      const row = loadProviderRow(database, effectKey);
      if (row === null) return { outcome: 'not_applied' };
      return {
        outcome: row.outcome === 'rejected' ? ('rejected' as const) : ('succeeded' as const),
        providerId: row.providerId,
        responseJson: row.responseJson,
      };
    },
    close(): void {
      database.close();
    },
    countProviderRows(): number {
      const row = database.prepare('SELECT COUNT(*) AS total FROM provider_effects').get() as
        { total?: unknown };
      return typeof row.total === 'number' ? row.total : 0;
    },
  };
  return gateway;
}

function durableInsert(
  database: DatabaseSync,
  effectKey: string,
  kind: EffectKind,
  requestDigest: string,
  requestJson: string,
  outcome: 'succeeded' | 'rejected',
  providerId: string,
  responseJson: string,
): void {
  database.prepare(
    `INSERT INTO provider_effects
      (effect_key, kind, request_digest, request_json, outcome, provider_id, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(effectKey, kind, requestDigest, requestJson, outcome, providerId, responseJson,
    new Date().toISOString());
}
