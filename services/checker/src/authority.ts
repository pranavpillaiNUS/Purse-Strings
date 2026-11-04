import { z } from 'zod';
import {
  MandateSchema,
  PolicySchema,
  type Mandate,
  type Policy,
} from '../../../packages/contracts/src/index.ts';
import {
  LedgerIdentityConflict,
  activateMandateRevision,
  canonicalize,
  loadConfirmationRow,
  loadMandateRow,
  loadPolicyRow,
  loadRevisionRow,
  runTransaction,
  sha256Hex,
  storeConfirmationRow,
  storeMandateRevision,
  storePolicySnapshot,
  type ConfirmationRow,
  type PolicyRow,
  type RevisionRow,
  type DatabaseSync,
} from './ledger/store.ts';

const MandateDraftSchema = MandateSchema.omit({ approvedBy: true, confirmedAt: true });
const PolicyIdentitySchema = z.object({ policyId: MandateSchema.shape.policyId });

export type MandateDraft = z.infer<typeof MandateDraftSchema>;

export type AuthorityFailureCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'MANDATE_NOT_CONFIRMED'
  | 'MANDATE_REVISION_CONFLICT'
  | 'SUPPLIER_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AuthorityFailure extends Error {
  readonly code: AuthorityFailureCode;
  readonly checkCodes: string[];

  constructor(code: AuthorityFailureCode, message: string, checkCodes: string[] = []) {
    super(message);
    this.name = 'AuthorityFailure';
    this.code = code;
    this.checkCodes = checkCodes;
  }
}

export interface PolicySnapshotResult {
  policyId: string;
  policyVersion: number;
  digest: string;
  state: 'created' | 'replayed';
}

export interface DraftRevisionResult {
  mandateId: string;
  version: number;
  digest: string;
  state: 'created' | 'replayed';
}

export interface ReviewRevisionResult {
  mandateId: string;
  version: number;
  digest: string;
  draft: MandateDraft;
  policyId: string;
  policyVersion: number;
  policyDigest: string;
}

export interface MandateAuthority {
  mandateId: string;
  exposureStarted: boolean;
  activeVersion: number | null;
  revision: RevisionRow | null;
  confirmation: ConfirmationRow | null;
  policyRow: PolicyRow | null;
}

/** Shared v1 canonical text ("policy draft" identity) helper: SHA-256 over key-sorted JSON. */
export function sha256CanonicalJson(value: Record<string, unknown>): string {
  return sha256Hex(canonicalize(value));
}

function parseDraft(draftJson: string): MandateDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(draftJson);
  } catch {
    throw new AuthorityFailure('INTERNAL_ERROR', 'Stored mandate revision is unreadable');
  }
  const parsed = MandateDraftSchema.safeParse(raw);
  if (!parsed.success) throw new AuthorityFailure('INTERNAL_ERROR', 'Stored mandate revision is invalid');
  return parsed.data;
}

function parsePolicy(policyRow: PolicyRow): Policy {
  let raw: unknown;
  try {
    raw = JSON.parse(policyRow.contentJson);
  } catch {
    throw new AuthorityFailure('INTERNAL_ERROR', 'Stored policy snapshot is unreadable');
  }
  const parsed = PolicySchema.safeParse(raw);
  if (!parsed.success) throw new AuthorityFailure('INTERNAL_ERROR', 'Stored policy snapshot is invalid');
  return parsed.data;
}

/** Immutable policy snapshot. Same identity with different content is a conflict. */
export function definePolicySnapshot(
  database: DatabaseSync,
  policy: Policy,
  now: string,
): PolicySnapshotResult {
  const contentJson = canonicalize(policy);
  const digest = sha256Hex(contentJson);
  // The check-then-insert replay/conflict decision must be atomic with the
  // insert: two concurrent definers otherwise surface raw constraint errors.
  const state = runTransaction(database, () => storePolicySnapshot(database, {
    policyId: policy.id,
    policyVersion: policy.version,
    contentJson,
    digest,
    createdAt: now,
  }));
  return { policyId: policy.id, policyVersion: policy.version, digest, state };
}

export function loadPolicySnapshot(
  database: DatabaseSync,
  policyId: string,
  policyVersion: number,
): { contentJson: string; digest: string; policy: Policy } | null {
  const row = loadPolicyRow(database, policyId, policyVersion);
  if (!row) return null;
  return { contentJson: row.contentJson, digest: row.digest, policy: parsePolicy(row) };
}

/**
 * Draft = the confirmed mandate shape minus approvedBy/confirmedAt. Same identity
 * and digest replays; changed contents for the same version are refused.
 */
export function draftMandateRevision(
  database: DatabaseSync,
  rawDraft: unknown,
  now: string,
): DraftRevisionResult {
  const parsed = MandateDraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    throw new AuthorityFailure('INVALID_REQUEST', 'Mandate draft did not match the v1 draft schema');
  }
  const draft = parsed.data;
  const policyRow = loadPolicyRow(database, draft.policyId, draft.policyVersion);
  if (!policyRow) {
    throw new AuthorityFailure('INVALID_REQUEST', 'Mandate draft references an unknown policy snapshot');
  }
  if (policyRow.policyId !== draft.policyId || policyRow.policyVersion !== draft.policyVersion) {
    throw new AuthorityFailure('INVALID_REQUEST', 'Mandate draft policy identity does not match its content');
  }
  const digest = sha256CanonicalJson({ policyDigest: policyRow.digest, mandateDraft: draft });
  // Atomic: the mandates row creation and the revision insert commit together,
  // so a crash or concurrent drafter can never leave a half-created mandate.
  const state = runTransaction(database, () => storeMandateRevision(database, {
    mandateId: draft.id,
    version: draft.version,
    policyId: draft.policyId,
    policyVersion: draft.policyVersion,
    draftJson: canonicalize(draft),
    digest,
    createdAt: now,
  }));
  return { mandateId: draft.id, version: draft.version, digest, state };
}

export function reviewMandateRevision(
  database: DatabaseSync,
  mandateId: string,
  version: number,
): ReviewRevisionResult | null {
  const revision = loadRevisionRow(database, mandateId, version);
  if (!revision) return null;
  const policyRow = loadPolicyRow(database, revision.policyId, revision.policyVersion);
  if (!policyRow) throw new AuthorityFailure('INTERNAL_ERROR', 'Mandate revision references a missing policy');
  return {
    mandateId,
    version,
    digest: revision.digest,
    draft: parseDraft(revision.draftJson),
    policyId: revision.policyId,
    policyVersion: revision.policyVersion,
    policyDigest: policyRow.digest,
  };
}

/** Reconstructs the confirmed mandate by joining stored draft with confirmation metadata. */
export function reconstructMandate(revision: RevisionRow, confirmation: ConfirmationRow): Mandate {
  const draft = parseDraft(revision.draftJson);
  const mandate = MandateSchema.safeParse({
    ...draft,
    approvedBy: confirmation.approvedBy,
    confirmedAt: confirmation.confirmedAt,
  });
  if (!mandate.success) throw new AuthorityFailure('INTERNAL_ERROR', 'Stored mandate confirmation is invalid');
  return mandate.data;
}

function checkPolicyNarrowing(policy: Policy, draft: MandateDraft): string[] {
  const failing: string[] = [];
  const note = (code: string, ok: boolean) => {
    if (!ok) failing.push(code);
  };
  note('POLICY_VERSION', draft.policyId === policy.id && draft.policyVersion === policy.version);
  note('POLICY_BUDGET', draft.budgetMinor <= policy.maxBudgetMinor);
  note('POLICY_CURRENCY', policy.currency === draft.currency);
  note('POLICY_SUPPLIERS',
    draft.allowedSuppliers.every((supplier) => policy.allowedSuppliers.includes(supplier)));
  for (const requirement of draft.requirements) {
    const rule = policy.roles[requirement.role];
    note(`POLICY_REQUIREMENT:${requirement.id}`,
      requirement.allowedSkus.every((sku) => rule.allowedSkus.includes(sku))
      && requirement.maxUnitPriceMinor <= rule.maxUnitPriceMinor
      && requirement.minWarrantyMonths >= rule.minWarrantyMonths);
  }
  for (const role of ['laptop', 'monitor'] as const) {
    const requested = draft.requirements.filter((item) => item.role === role)
      .reduce((sum, item) => sum + item.quantity, 0);
    note(`POLICY_UNITS:${role}`, requested <= policy.roles[role].maxUnits);
  }
  return failing;
}

/**
 * Confirmation binds trust to the exact stored revision: verifies the digest,
 * all policy narrowing rules and the purchase window against the trusted
 * executor clock, then stamps the OS-derived operator identity immutable.
 * Same revision/digest replays unchanged; the exposure flag permanently blocks
 * replacing the active revision with a new one ("authority exposed once").
 */
export function confirmMandateRevision(
  database: DatabaseSync,
  mandateId: string,
  version: number,
  digest: string,
  approvedBy: string,
  now: string,
): Mandate {
  if (!PolicyIdentitySchema.safeParse({ policyId: mandateId }).success
    || typeof approvedBy !== 'string' || approvedBy.trim().length === 0) {
    throw new AuthorityFailure('INVALID_REQUEST', 'Confirmation arguments are invalid');
  }
  return runTransaction(database, () => {
    const revision = loadRevisionRow(database, mandateId, version);
    if (!revision) throw new AuthorityFailure('NOT_FOUND', 'Mandate revision is unknown');

    const existing = loadConfirmationRow(database, mandateId, version);
    if (existing) {
      if (existing.digest !== digest) {
        throw new AuthorityFailure(
          'MANDATE_REVISION_CONFLICT',
          'This mandate revision was previously confirmed with a different digest',
        );
      }
      return reconstructMandate(revision, existing);
    }

    const mandateRow = loadMandateRow(database, mandateId);
    if (!mandateRow) throw new AuthorityFailure('INTERNAL_ERROR', 'Mandate revision lost its mandate row');
    // Once authority was exposed, only the currently active revision may be
    // (re)confirmed; a missing active version must refuse a new one too.
    if (mandateRow.exposureStarted && mandateRow.activeVersion !== version) {
      throw new AuthorityFailure(
        'MANDATE_REVISION_CONFLICT',
        'Mandate authority was already exposed by reservations; replacement revision confirmation is refused',
      );
    }
    if (revision.digest !== digest) {
      throw new AuthorityFailure(
        'MANDATE_REVISION_CONFLICT',
        'Confirmation digest does not match the stored revision review digest',
        ['DIGEST_MISMATCH'],
      );
    }
    const policyRow = loadPolicyRow(database, revision.policyId, revision.policyVersion);
    if (!policyRow) throw new AuthorityFailure('INTERNAL_ERROR', 'Mandate revision references a missing policy');
    const policy = parsePolicy(policyRow);
    const draft = parseDraft(revision.draftJson);

    const failingChecks = checkPolicyNarrowing(policy, draft);
    const purchaseTime = Date.parse(draft.purchaseBy);
    const readyTime = Date.parse(draft.readyBy);
    const nowTime = Date.parse(now);
    if (!Number.isFinite(purchaseTime) || !Number.isFinite(readyTime) || !Number.isFinite(nowTime)
      || !(nowTime < purchaseTime) || !(purchaseTime <= readyTime)) {
      failingChecks.push('MANDATE_TIMING');
    }
    if (failingChecks.length > 0) {
      throw new AuthorityFailure(
        'INVALID_REQUEST',
        'Mandate revision does not conform to the stored policy and deadline window',
        failingChecks,
      );
    }

    storeConfirmationRow(database, {
      mandateId,
      version,
      digest: revision.digest,
      approvedBy,
      confirmedAt: now,
    });
    activateMandateRevision(database, mandateId, version);
    const confirmation = loadConfirmationRow(database, mandateId, version);
    if (confirmation === null) {
      throw new AuthorityFailure('INTERNAL_ERROR', 'Confirmation was not stored');
    }
    return reconstructMandate(revision, confirmation);
  });
}

export function loadMandateAuthority(database: DatabaseSync, mandateId: string): MandateAuthority | null {
  const mandateRow = loadMandateRow(database, mandateId);
  if (!mandateRow) return null;
  const activeVersion = mandateRow.activeVersion;
  const revision = activeVersion === null ? null : loadRevisionRow(database, mandateId, activeVersion);
  const confirmation = activeVersion === null ? null : loadConfirmationRow(database, mandateId, activeVersion);
  const policyRow = revision === null ? null
    : loadPolicyRow(database, revision.policyId, revision.policyVersion);
  return {
    mandateId,
    exposureStarted: mandateRow.exposureStarted,
    activeVersion,
    revision,
    confirmation,
    policyRow,
  };
}

export { LedgerIdentityConflict };
