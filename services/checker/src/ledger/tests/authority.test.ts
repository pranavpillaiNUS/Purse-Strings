import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AuthorityFailure,
  confirmMandateRevision,
  definePolicySnapshot,
  draftMandateRevision,
  loadMandateAuthority,
  loadPolicySnapshot,
  reconstructMandate,
  reviewMandateRevision,
} from '../../authority.ts';
import { insertReservationOperation, openLedgerStore, canonicalCartJson, sha256Hex, isSqliteBusy, LedgerIdentityConflict } from '../store.ts';
import {
  TEST_CART,
  TEST_CLOCK,
  TEST_MANDATE_DRAFT,
  TEST_POLICY,
  asConfirmedMandate,
  makeTempDir,
  removeTempDir,
} from './fixtures.ts';

const APPROVER = 'fixture-ops-manager';

function setup(dir: string): { database: ReturnType<typeof openLedgerStore>; draft: typeof TEST_MANDATE_DRAFT; digest: string } {
  const database = openLedgerStore(`${dir}/ledger.db`);
  definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
  const draft = { ...TEST_MANDATE_DRAFT };
  const drafted = draftMandateRevision(database, draft, TEST_CLOCK);
  return { database, draft, digest: drafted.digest };
}

test('policy snapshots replay identically and load back with their digest', () => {
  const dir = makeTempDir('authority-policy');
  try {
    const database = openLedgerStore(`${dir}/ledger.db`);
    const first = definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
    const second = definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
    assert.equal(first.state, 'created');
    assert.equal(second.state, 'replayed');
    assert.equal(first.digest, second.digest);
    const loaded = loadPolicySnapshot(database, 'hardware-policy', 1);
    assert.equal(loaded?.policy.maxBudgetMinor, TEST_POLICY.maxBudgetMinor);
    assert.equal(loaded?.digest, first.digest);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('drafting the same revision with identical contents replays the same digest', () => {
  const dir = makeTempDir('authority-draft');
  try {
    const { database, draft, digest } = setup(dir);
    const replay = draftMandateRevision(database, draft, TEST_CLOCK);
    assert.equal(replay.state, 'replayed');
    assert.equal(replay.digest, digest);
    const review = reviewMandateRevision(database, draft.id, draft.version);
    assert.equal(review?.digest, digest);
    assert.equal(review?.policyId, draft.policyId);
    assert.equal(review?.policyVersion, draft.policyVersion);
    assert.ok(review !== null && 'approvedBy' in review.draft === false, 'draft must not carry confirmation metadata');
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('digest mismatch and unknown revisions fail confirmation; replay is idempotent', () => {
  const dir = makeTempDir('authority-confirm');
  try {
    const { database, draft, digest } = setup(dir);
    assert.throws(
      () => confirmMandateRevision(database, draft.id, draft.version, 'z'.repeat(64), APPROVER, TEST_CLOCK),
      (error: unknown) => error instanceof AuthorityFailure && error.code === 'MANDATE_REVISION_CONFLICT',
    );
    assert.throws(
      () => confirmMandateRevision(database, 'ghost-mandate', 1, 'z'.repeat(64), APPROVER, TEST_CLOCK),
      (error: unknown) => error instanceof AuthorityFailure && error.code === 'NOT_FOUND',
    );

    const confirmed = confirmMandateRevision(database, draft.id, draft.version, digest, APPROVER, TEST_CLOCK);
    assert.deepEqual(confirmed, asConfirmedMandate(draft, APPROVER, TEST_CLOCK));

    // Replay with different operator metadata keeps the stored confirmation unchanged.
    const replayed = confirmMandateRevision(database, draft.id, draft.version, digest, 'other-operator', '2026-11-10T09:00:00.000Z');
    assert.equal(replayed.confirmedAt, TEST_CLOCK);
    assert.equal(replayed.approvedBy, APPROVER);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('confirmation enforces every policy narrowing rule and the purchase window', () => {
  interface NarrowingCase {
    name: string;
    policyOverrides?: Partial<typeof TEST_POLICY>;
    draftOverrides?: Partial<typeof TEST_MANDATE_DRAFT>;
    expectedCode: string;
  }
  const laptopRequirement = TEST_MANDATE_DRAFT.requirements.find((item) => item.id === 'engineering-laptops')!;
  const narrowingCases: NarrowingCase[] = [
    {
      name: 'role unit limits',
      policyOverrides: { roles: { ...TEST_POLICY.roles, laptop: { ...TEST_POLICY.roles.laptop, maxUnits: 3 } } },
      expectedCode: 'POLICY_UNITS:laptop',
    },
    {
      name: 'mandate budget ceiling',
      draftOverrides: { budgetMinor: TEST_POLICY.maxBudgetMinor + 1 },
      expectedCode: 'POLICY_BUDGET',
    },
    {
      name: 'requirement price ceiling',
      draftOverrides: {
        requirements: TEST_MANDATE_DRAFT.requirements.map((item) =>
          item.id === laptopRequirement.id ? { ...item, maxUnitPriceMinor: TEST_POLICY.roles.laptop.maxUnitPriceMinor + 1 } : item),
      },
      expectedCode: `POLICY_REQUIREMENT:${laptopRequirement.id}`,
    },
    {
      name: 'requirement SKU allowlist',
      draftOverrides: {
        requirements: TEST_MANDATE_DRAFT.requirements.map((item) =>
          item.id === laptopRequirement.id ? { ...item, allowedSkus: ['MON-27-USBC'] } : item),
      },
      expectedCode: `POLICY_REQUIREMENT:${laptopRequirement.id}`,
    },
    {
      name: 'requirement minimum warranty',
      draftOverrides: {
        requirements: TEST_MANDATE_DRAFT.requirements.map((item) =>
          item.id === laptopRequirement.id ? { ...item, minWarrantyMonths: TEST_POLICY.roles.laptop.minWarrantyMonths - 1 } : item),
      },
      expectedCode: `POLICY_REQUIREMENT:${laptopRequirement.id}`,
    },
  ];

  for (const narrowingCase of narrowingCases) {
    const dir = makeTempDir(`authority-narrowing-${narrowingCase.name.replace(/\W+/g, '-')}`);
    try {
      const database = openLedgerStore(`${dir}/ledger.db`);
      try {
        definePolicySnapshot(database, { ...TEST_POLICY, ...narrowingCase.policyOverrides }, TEST_CLOCK);
        const draft = { ...TEST_MANDATE_DRAFT, ...narrowingCase.draftOverrides };
        draftMandateRevision(database, draft, TEST_CLOCK);
        const review = reviewMandateRevision(database, draft.id, draft.version);
        assert.throws(
          () => confirmMandateRevision(database, draft.id, draft.version, review!.digest, APPROVER, TEST_CLOCK),
          (error: unknown) => {
            assert.ok(error instanceof AuthorityFailure && error.code === 'INVALID_REQUEST', narrowingCase.name);
            assert.ok(error.checkCodes.includes(narrowingCase.expectedCode),
              `${narrowingCase.name}: expected ${narrowingCase.expectedCode} in ${JSON.stringify(error.checkCodes)}`);
            return true;
          },
        );
      } finally {
        database.close();
      }
    } finally {
      removeTempDir(dir);
    }
  }
});

test('a mandate whose purchase deadline already passed cannot be confirmed', () => {
  const dir = makeTempDir('authority-timing');
  try {
    const database = openLedgerStore(`${dir}/ledger.db`);
    definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
    const stale = { ...TEST_MANDATE_DRAFT, purchaseBy: '2026-11-03T10:00:00Z' };
    draftMandateRevision(database, stale, TEST_CLOCK);
    const review = reviewMandateRevision(database, stale.id, stale.version);
    assert.throws(
      () => confirmMandateRevision(database, stale.id, stale.version, review!.digest, APPROVER, TEST_CLOCK),
      (error: unknown) => {
        assert.ok(error instanceof AuthorityFailure && error.code === 'INVALID_REQUEST');
        assert.ok(error.checkCodes.includes('MANDATE_TIMING'));
        return true;
      },
    );
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('exposure permanently blocks replacement revisions but confirmation replays stay allowed', () => {
  const dir = makeTempDir('authority-exposure');
  try {
    const { database, draft, digest } = setup(dir);
    confirmMandateRevision(database, draft.id, draft.version, digest, APPROVER, TEST_CLOCK);
    insertReservationOperation(database, {
      operationId: 'op-expo',
      mandateId: draft.id,
      mandateVersion: 1,
      cartId: 'exposure-cart',
      supplierId: 'store-a',
      cartJson: canonicalCartJson({ ...TEST_CART }),
      quoteJson: JSON.stringify({ totalMinor: 1 }),
      requestDigest: sha256Hex('exposure'),
      termsDigest: 'a'.repeat(64),
      amountMinor: 1,
      currency: 'SGD',
      createdAt: TEST_CLOCK,
      lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 1 }],
      idempotencyKey: 'exposure-key',
      auditKind: 'operation_reserved',
      auditDetails: {},
    });

    // Direct reservation above sets exposure; verify the flag is visible.
    const exposed = loadMandateAuthority(database, draft.id);
    assert.equal(exposed?.exposureStarted, true);

    // A replacement revision is refused after exposure.
    const replacement = { ...TEST_MANDATE_DRAFT, version: 2 };
    const replacementDraft = draftMandateRevision(database, replacement, TEST_CLOCK);
    assert.throws(
      () => confirmMandateRevision(database, draft.id, 2, replacementDraft.digest, APPROVER, TEST_CLOCK),
      (error: unknown) => error instanceof AuthorityFailure && error.code === 'MANDATE_REVISION_CONFLICT',
    );

    // The still-active revision replays idempotently even after exposure.
    const replay = confirmMandateRevision(database, draft.id, draft.version, digest, APPROVER, TEST_CLOCK);
    assert.equal(replay.version, 1);
    assert.equal(loadMandateAuthority(database, draft.id)?.activeVersion, 1);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('exposure without an active revision still refuses confirming a different version', () => {
  const dir = makeTempDir('authority-exposure-null');
  try {
    const { database, draft, digest } = setup(dir);
    // Recovered/historical state: exposure recorded while no revision is active.
    database.prepare('UPDATE mandates SET exposure_started = 1 WHERE mandate_id = ?').run(draft.id);
    assert.throws(
      () => confirmMandateRevision(database, draft.id, draft.version, digest, APPROVER, TEST_CLOCK),
      (error: unknown) => error instanceof AuthorityFailure && error.code === 'MANDATE_REVISION_CONFLICT',
    );
    assert.equal(loadMandateAuthority(database, draft.id)?.activeVersion, null);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('concurrent draft attempts serialise into replay or conflict, never raw constraint errors', () => {
  const dir = makeTempDir('authority-contention');
  try {
    const databasePath = `${dir}/ledger.db`;
    const holder = openLedgerStore(databasePath);
    const contender = openLedgerStore(databasePath);
    contender.exec('PRAGMA busy_timeout = 100');
    definePolicySnapshot(holder, { ...TEST_POLICY }, TEST_CLOCK);

    // Another writer holds the write transaction; the contender must serialise
    // behind it (busy), never interleave into a raw constraint failure.
    holder.exec('BEGIN IMMEDIATE');
    assert.throws(
      () => draftMandateRevision(contender, TEST_MANDATE_DRAFT, TEST_CLOCK),
      (error: unknown) => isSqliteBusy(error),
    );
    holder.exec('COMMIT');

    const created = draftMandateRevision(contender, TEST_MANDATE_DRAFT, TEST_CLOCK);
    assert.equal(created.state, 'created');
    const replay = draftMandateRevision(holder, TEST_MANDATE_DRAFT, TEST_CLOCK);
    assert.equal(replay.state, 'replayed');
    assert.equal(replay.digest, created.digest);
    assert.throws(
      () => draftMandateRevision(holder, { ...TEST_MANDATE_DRAFT, budgetMinor: 1 }, TEST_CLOCK),
      LedgerIdentityConflict,
    );

    const mandates = (holder.prepare('SELECT COUNT(*) AS total FROM mandates').get() as { total: number }).total;
    const revisions = (holder.prepare('SELECT COUNT(*) AS total FROM mandate_revisions').get() as { total: number }).total;
    assert.equal(mandates, 1);
    assert.equal(revisions, 1);
    holder.close();
    contender.close();
  } finally {
    removeTempDir(dir);
  }
});

test('a forced mid-sequence failure leaves no half-created mandate', () => {
  const dir = makeTempDir('authority-atomic-draft');
  try {
    const database = openLedgerStore(`${dir}/ledger.db`);
    try {
      definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
      database.exec(
        "CREATE TRIGGER fail_revision_insert BEFORE INSERT ON mandate_revisions BEGIN SELECT RAISE(ABORT, 'forced mid-sequence failure'); END;",
      );
      assert.throws(
        () => draftMandateRevision(database, TEST_MANDATE_DRAFT, TEST_CLOCK),
        /forced mid-sequence failure/,
      );
      database.exec('DROP TRIGGER fail_revision_insert');

      const mandates = (database.prepare('SELECT COUNT(*) AS total FROM mandates').get() as { total: number }).total;
      const revisions = (database.prepare('SELECT COUNT(*) AS total FROM mandate_revisions').get() as { total: number }).total;
      assert.equal(mandates, 0);
      assert.equal(revisions, 0);
      // The identity is untouched: drafting the same revision afterwards succeeds.
      assert.equal(draftMandateRevision(database, TEST_MANDATE_DRAFT, TEST_CLOCK).state, 'created');
    } finally {
      database.close();
    }
  } finally {
    removeTempDir(dir);
  }
});

test('before exposure a replacement revision may be confirmed and becomes active', () => {
  const dir = makeTempDir('authority-revision');
  try {
    const { database, draft, digest } = setup(dir);
    confirmMandateRevision(database, draft.id, draft.version, digest, APPROVER, TEST_CLOCK);
    const replacement = { ...TEST_MANDATE_DRAFT, version: 2, budgetMinor: 700000 };
    const replacementDraft = draftMandateRevision(database, replacement, TEST_CLOCK);
    const confirmed = confirmMandateRevision(database, draft.id, 2, replacementDraft.digest, APPROVER, TEST_CLOCK);
    assert.equal(confirmed.budgetMinor, 700000);
    const authority = loadMandateAuthority(database, draft.id);
    assert.equal(authority?.activeVersion, 2);
    assert.equal(reconstructMandate(authority!.revision!, authority!.confirmation!).version, 2);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});

test('loadMandateAuthority distinguishes unknown, draft-only and confirmed states', () => {
  const dir = makeTempDir('authority-states');
  try {
    const { database, draft, digest } = setup(dir);
    assert.equal(loadMandateAuthority(database, 'missing'), null);
    const draftState = loadMandateAuthority(database, draft.id);
    assert.equal(draftState?.activeVersion, null);
    assert.equal(draftState?.exposureStarted, false);
    confirmMandateRevision(database, draft.id, draft.version, digest, APPROVER, TEST_CLOCK);
    const confirmedState = loadMandateAuthority(database, draft.id);
    assert.equal(confirmedState?.activeVersion, 1);
    assert.equal(confirmedState?.revision?.digest, digest);
    assert.equal(confirmedState?.confirmation?.approvedBy, APPROVER);
    database.close();
  } finally {
    removeTempDir(dir);
  }
});
