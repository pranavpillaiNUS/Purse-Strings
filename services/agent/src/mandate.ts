import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MandateSchema, PolicySchema } from '../../../packages/contracts/src/index.ts';
import type { Policy } from '../../../packages/contracts/src/index.ts';

const requirement = MandateSchema.shape.requirements.element;
const timestamp = MandateSchema.shape.purchaseBy;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const distinct = (items: string[]): boolean => new Set(items).size === items.length;

/** Agent-local planning inputs, not agreed confirmation or stock-assignment contracts. */
export const KitTemplateSchema = z.object({
  id: MandateSchema.shape.id,
  version: MandateSchema.shape.version,
  lines: z.array(z.object({
    requirementId: requirement.shape.id,
    role: requirement.shape.role,
    unitsPerHire: requirement.shape.quantity,
    allowedSkus: requirement.shape.allowedSkus.refine(distinct, 'Kit SKUs must be unique'),
    maxUnitPriceMinor: requirement.shape.maxUnitPriceMinor.optional(),
    minWarrantyMonths: requirement.shape.minWarrantyMonths.optional(),
  }).strict()).min(1).max(100)
    .refine((lines) => distinct(lines.map((line) => line.requirementId)), 'Kit requirement IDs must be unique'),
}).strict();

export const MandateRequestSchema = MandateSchema.pick({
  id: true, version: true, budgetMinor: true, purchaseBy: true, readyBy: true,
  deliveryLocationId: true, allowedSuppliers: true,
}).extend({
  hireCount: requirement.shape.quantity,
  kitId: KitTemplateSchema.shape.id,
  kitVersion: KitTemplateSchema.shape.version,
}).strict().refine((request) => distinct(request.allowedSuppliers), 'Supplier IDs must be unique');

export const UnconfirmedMandateSchema = MandateSchema.omit({ approvedBy: true, confirmedAt: true });

export const MAX_REQUEST_TEXT_LENGTH = 4000;

/** A value the model chose that the request text did not state. */
export const DraftAssumptionSchema = z.object({
  field: MandateRequestSchema.keyof(),
  reason: z.string().trim().min(1).max(500),
}).strict();

/** Where a model-drafted request came from, for the human reviewer. It grants no authority. */
export const DraftOriginSchema = z.object({
  kind: z.literal('model-drafted'),
  requestedModel: z.string().trim().min(1).max(200),
  requestText: z.string().trim().min(1).max(MAX_REQUEST_TEXT_LENGTH),
  assumptions: z.array(DraftAssumptionSchema).max(20),
  notCaptured: z.array(z.string().trim().min(1).max(500)).max(20),
}).strict();

export const MandateDraftSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('mandate-draft'),
  status: z.literal('draft'),
  createdAt: timestamp,
  policyDigest: digest,
  request: MandateRequestSchema,
  kit: KitTemplateSchema,
  proposal: UnconfirmedMandateSchema,
  origin: DraftOriginSchema.optional(),
  digest,
}).strict();

export type MandateDraft = z.infer<typeof MandateDraftSchema>;
export type DraftOrigin = z.infer<typeof DraftOriginSchema>;
type Request = z.infer<typeof MandateRequestSchema>;
type Kit = z.infer<typeof KitTemplateSchema>;
type Proposal = z.infer<typeof UnconfirmedMandateSchema>;

/** Stable record identity only. This is an unkeyed hash, not a signature or approval. */
export function contentDigest(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    }
    return item;
  });
  if (canonical === undefined) throw new Error('Cannot identify an undefined record');
  return createHash('sha256').update(canonical).digest('hex');
}

function compileProposal(policy: Policy, request: Request, kit: Kit): Proposal {
  if (request.kitId !== kit.id || request.kitVersion !== kit.version) {
    throw new Error('Request must reference this exact kit ID and version');
  }
  if (request.budgetMinor > policy.maxBudgetMinor) throw new Error('Request budget exceeds company policy');
  if (request.allowedSuppliers.some((supplier) => !policy.allowedSuppliers.includes(supplier))) {
    throw new Error('Request includes a supplier outside company policy');
  }
  if (Date.parse(request.purchaseBy) > Date.parse(request.readyBy)) {
    throw new Error('Purchase deadline must be on or before the equipment readiness date');
  }

  const quantities = { laptop: 0, monitor: 0 };
  const requirements = kit.lines.map((line) => {
    const limits = policy.roles[line.role];
    if (line.allowedSkus.some((sku) => !limits.allowedSkus.includes(sku))) {
      throw new Error(`Kit requirement ${line.requirementId} includes a SKU outside its role policy`);
    }
    const maxUnitPriceMinor = line.maxUnitPriceMinor ?? limits.maxUnitPriceMinor;
    const minWarrantyMonths = line.minWarrantyMonths ?? limits.minWarrantyMonths;
    if (maxUnitPriceMinor > limits.maxUnitPriceMinor) {
      throw new Error(`Kit requirement ${line.requirementId} relaxes the policy price cap`);
    }
    if (minWarrantyMonths < limits.minWarrantyMonths) {
      throw new Error(`Kit requirement ${line.requirementId} relaxes the policy warranty minimum`);
    }
    const quantity = request.hireCount * line.unitsPerHire;
    quantities[line.role] += quantity;
    if (quantities[line.role] > limits.maxUnits) {
      throw new Error(`Total ${line.role} units exceed company policy across kit requirements`);
    }
    return { id: line.requirementId, role: line.role, quantity,
      allowedSkus: line.allowedSkus, maxUnitPriceMinor, minWarrantyMonths };
  });

  return UnconfirmedMandateSchema.parse({
    id: request.id, version: request.version, policyId: policy.id, policyVersion: policy.version,
    currency: policy.currency, budgetMinor: request.budgetMinor,
    purchaseBy: request.purchaseBy, readyBy: request.readyBy,
    deliveryLocationId: request.deliveryLocationId, allowedSuppliers: request.allowedSuppliers,
    requirements,
  });
}

/**
 * Deterministic planning only: no stock assignment, confirmation or payment. A model may
 * have written the request (see `origin`), but it passes through these same checks.
 */
export function createMandateDraft(rawPolicy: unknown, rawRequest: unknown, rawKit: unknown, now: string, rawOrigin?: unknown): MandateDraft {
  const policy = PolicySchema.parse(rawPolicy);
  const request = MandateRequestSchema.parse(rawRequest);
  const kit = KitTemplateSchema.parse(rawKit);
  const createdAt = timestamp.parse(now);
  const origin = rawOrigin === undefined ? undefined : DraftOriginSchema.parse(rawOrigin);
  const proposal = compileProposal(policy, request, kit);
  if (Date.parse(proposal.purchaseBy) <= Date.parse(createdAt)) throw new Error('Purchase deadline has passed');
  const content = {
    schemaVersion: 1 as const, kind: 'mandate-draft' as const, status: 'draft' as const,
    createdAt, policyDigest: contentDigest(policy), request, kit, proposal,
    ...(origin === undefined ? {} : { origin }),
  };
  return MandateDraftSchema.parse({ ...content, digest: contentDigest(content) });
}

export interface DraftReviewCheck {
  code: string;
  status: 'pass' | 'fail';
  message: string;
}

export interface MandateDraftReview {
  kind: 'mandate-draft-review';
  decision: 'draft_valid' | 'needs_revision';
  draftDigest: string;
  reviewedAt: string;
  checks: DraftReviewCheck[];
  proposal: Proposal;
  /** Present on model drafts, so the reviewer sees the assumptions and what was left out. */
  origin?: DraftOrigin;
}

/** Re-derive under current policy and kit references; hashes grant no authority. */
export function reviewMandateDraft(rawDraft: unknown, rawPolicy: unknown, rawKit: unknown, now: string): MandateDraftReview {
  const draft = MandateDraftSchema.parse(rawDraft);
  const policy = PolicySchema.parse(rawPolicy);
  const kit = KitTemplateSchema.parse(rawKit);
  const reviewedAt = timestamp.parse(now);
  const { digest: draftDigest, ...content } = draft;
  const checks: DraftReviewCheck[] = [];
  function check(code: string, passed: boolean, message: string): void {
    checks.push({ code, status: passed ? 'pass' : 'fail', message });
  }
  check('DRAFT_DIGEST', contentDigest(content) === draftDigest, 'Digest must match this draft and its input snapshots');
  check('POLICY_BINDING', draft.policyDigest === contentDigest(policy)
    && draft.proposal.policyId === policy.id && draft.proposal.policyVersion === policy.version,
  'Draft must reference the current policy ID, version and content');
  check('KIT_BINDING', contentDigest(draft.kit) === contentDigest(kit),
    'Draft must reference the current kit ID, version and content');
  check('DRAFT_TIME', Date.parse(draft.createdAt) <= Date.parse(reviewedAt), 'Draft cannot be created in the future');
  check('PURCHASE_DEADLINE', Date.parse(draft.proposal.purchaseBy) > Date.parse(reviewedAt),
    'Draft must be reviewed before its purchase deadline');
  try {
    const expected = compileProposal(policy, draft.request, kit);
    check('POLICY_AND_KIT', contentDigest(expected) === contentDigest(draft.proposal),
      'Proposal must exactly match request and kit requirements under current policy');
  } catch (error) {
    check('POLICY_AND_KIT', false, error instanceof Error ? error.message : 'Request or kit violates policy');
  }
  return {
    kind: 'mandate-draft-review', decision: checks.every((item) => item.status === 'pass') ? 'draft_valid' : 'needs_revision',
    draftDigest, reviewedAt, checks, proposal: draft.proposal,
    ...(draft.origin === undefined ? {} : { origin: draft.origin }),
  };
}
