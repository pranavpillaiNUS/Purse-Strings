import { z } from 'zod';
import { OperationSchema } from '../../../packages/contracts/src/backend.ts';
import { CartSubmissionSchema, MandateSchema, MAX_AMOUNT_MINOR } from '../../../packages/contracts/src/index.ts';
import type { ResentCart } from './backend-session.ts';
import { OUTCOME_SENTENCES, type RunReview } from './review.ts';

/** The CLI checks bytes before decoding a file; the schema also bounds serialized data. */
export const MAX_SAVED_REVIEW_BYTES = 4 * 1024 * 1024;

const id = MandateSchema.shape.id;
const runId = z.string().min(1).max(100);
const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().min(0).max(1000);
const minor = z.number().int().min(0).max(MAX_AMOUNT_MINOR);
// A review can show sums across carts, or a negative remaining amount from a stale
// snapshot. Retain those observations instead of making an invalid budget look valid.
const aggregateMinor = z.number().int().min(0).max(12 * MAX_AMOUNT_MINOR);
const signedMinor = z.number().int().min(-12 * MAX_AMOUNT_MINOR).max(12 * MAX_AMOUNT_MINOR);
const text = z.string().max(262_144);
const code = z.string().min(1).max(250);
const unique = (items: readonly string[]): boolean => new Set(items).size === items.length;
const outcome = z.enum([
  'completed', 'partial', 'no_feasible_cart', 'limit_exceeded',
  'unknown_submission', 'backend_refused', 'model_refused', 'failed',
]);

const CheckGroupSchema = z.object({
  sentence: text,
  codes: z.array(code).min(1).max(1000),
  recognized: z.boolean(),
}).strict();

const DecisionSchema = z.object({
  supplierId: id,
  cartId: id,
  estimate: z.object({ authoritative: z.literal(false), totalMinor: aggregateMinor }).strict().nullable(),
  decision: z.enum(['accepted', 'rejected', 'refused', 'unknown', 'not_submitted', 'not_checked']),
  checkerTotalMinor: minor.nullable(),
  operation: OperationSchema.nullable(),
  lines: CartSubmissionSchema.shape.lines,
  code: code.nullable(),
  codeReason: text.nullable(),
  checks: z.array(CheckGroupSchema).max(1000),
  retriedAfterUnknown: z.boolean(),
  eventsDisagree: z.boolean(),
}).strict().superRefine((decision, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (decision.decision === 'accepted') {
    const operation = decision.operation;
    if (!operation || decision.checkerTotalMinor !== operation.totalMinor
      || operation.cartId !== decision.cartId || operation.supplierId !== decision.supplierId) {
      issue('An accepted decision must match its operation, supplier, cart and checker total');
    }
  } else if (decision.operation !== null || decision.checkerTotalMinor !== null) {
    issue('Only an accepted decision can carry an operation or checker total');
  }
  if (decision.decision === 'rejected' || decision.decision === 'refused') {
    if (decision.code === null || decision.codeReason === null) issue('A rejection or refusal must retain its code and reason');
  } else if (decision.code !== null || decision.codeReason !== null || decision.checks.length !== 0) {
    issue('Only a rejection or refusal can carry check explanations');
  }
  if (decision.eventsDisagree && decision.decision !== 'unknown') issue('A disputed event must remain an unknown decision');
});

const RequirementSchema = z.object({
  requirementId: id,
  required: count.min(1),
  allocatedUnits: z.number().int().min(0).max(3000),
  acceptedThisRun: count,
  remainingUnits: count,
}).strict().refine((item) => item.remainingUnits === Math.max(0, item.required - item.allocatedUnits),
  'Remaining units must match the saved required and allocated quantities');

const BudgetSchema = z.object({
  source: z.enum(['ledger', 'contract-mock', 'run-only']),
  totalMinor: minor.nullable(),
  committedMinor: minor.nullable(),
  reservedMinor: minor.nullable(),
  remainingMinor: signedMinor.nullable(),
  allocatedMinor: aggregateMinor.nullable(),
  acceptedThisRunMinor: aggregateMinor,
  ledgerDiffersByMinor: signedMinor.nullable(),
}).strict().superRefine((budget, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (budget.source === 'ledger') {
    if (budget.totalMinor === null || budget.committedMinor === null || budget.reservedMinor === null
      || budget.remainingMinor === null || budget.allocatedMinor === null) {
      issue('A saved ledger budget must retain every observed amount');
    } else if (budget.allocatedMinor !== budget.committedMinor + budget.reservedMinor
      || budget.remainingMinor !== budget.totalMinor - budget.allocatedMinor) {
      issue('Saved ledger amounts must add up');
    }
  } else if (budget.committedMinor !== null || budget.reservedMinor !== null || budget.ledgerDiffersByMinor !== null) {
    issue('A mock or run-only budget cannot claim ledger amounts');
  }
  if (budget.source !== 'ledger') {
    const expected = budget.totalMinor !== null && budget.remainingMinor !== null ? budget.totalMinor - budget.remainingMinor : null;
    if (budget.allocatedMinor !== expected) issue('Saved run-only allocation must match its known total and remaining amount');
  }
});

/** Local display contract only. Passing this schema never authenticates saved facts. */
const RunReviewSchema = z.object({
  simulation: z.literal(true),
  runId,
  mandateId: id,
  mandateVersion: MandateSchema.shape.version,
  backend: z.enum(['simulation-backend', 'contract-mock']),
  shopper: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('scripted') }).strict(),
    z.object({ kind: z.literal('live'), modelId: z.string().min(1).max(200) }).strict(),
  ]),
  outcome,
  outcomeSentence: z.string().max(500),
  detail: text.nullable(),
  decisions: z.array(DecisionSchema).max(100),
  refusals: z.array(z.object({ tool: z.string().min(1).max(200), target: text, code: code.nullable(), reason: text }).strict()).max(1000),
  requirements: z.array(RequirementSchema).min(1).max(100),
  budget: BudgetSchema,
  operationsToRun: z.array(id).max(10),
  unresolved: z.boolean(),
  usage: z.object({
    modelTurns: z.number().int().min(0).max(50),
    toolCalls: z.number().int().min(0).max(100),
    maxToolCalls: z.number().int().min(1).max(100),
    inputTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    outputTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }).strict(),
  modelSummary: z.string().max(4000).nullable(),
  unreadableEvents: count,
}).strict().superRefine((review, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (review.outcomeSentence !== OUTCOME_SENTENCES[review.outcome]) issue('Saved outcome wording must match the recorded outcome');
  if (review.unresolved !== (review.outcome === 'unknown_submission')) issue('An unresolved submission must retain the unknown outcome');
  if (review.unresolved && !review.decisions.some((item) => item.decision === 'unknown')) issue('An unresolved review must retain its unknown cart');
  if (!unique(review.decisions.map((item) => item.cartId)) || !unique(review.requirements.map((item) => item.requirementId))) {
    issue('Saved carts and requirements must have unique identities');
  }
  if (review.usage.toolCalls > review.usage.maxToolCalls) issue('Recorded tool use exceeds the saved host limit');
  if ((review.backend === 'contract-mock') !== (review.budget.source === 'contract-mock')) issue('A mock budget must retain the mock backend label');
  const operations = review.decisions.flatMap((item) => item.operation ? [item.operation] : []);
  if (!unique(operations.map((item) => item.id))) issue('An operation cannot appear as two accepted carts');
  for (const operation of operations) {
    if (operation.mandateId !== review.mandateId || operation.mandateVersion !== review.mandateVersion) {
      issue('Every saved operation must belong to the reviewed mandate revision');
    }
  }
  if (review.budget.acceptedThisRunMinor !== operations.reduce((sum, item) => sum + item.totalMinor, 0)) {
    issue('The saved accepted amount must match the accepted operations');
  }
  const expected = review.backend === 'simulation-backend' ? operations.filter((item) => item.status === 'reserved').map((item) => item.id) : [];
  if (JSON.stringify(review.operationsToRun) !== JSON.stringify(expected)) issue('Saved pending operation IDs must match their historical operation facts');
});

const ResentCartSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('accepted'), operation: OperationSchema, cart: CartSubmissionSchema }).strict(),
  z.object({ kind: z.literal('rejected'), code: z.enum([
    'BUDGET_EXCEEDED', 'QUANTITY_EXCEEDED', 'QUOTE_EXPIRED',
    'MANDATORY_EVIDENCE_UNKNOWN', 'INELIGIBLE', 'SUPPLIER_UNAVAILABLE',
  ]), message: z.string().max(500), checkCodes: z.array(z.string().max(250)).max(1000), cart: CartSubmissionSchema }).strict(),
  z.object({ kind: z.literal('refused'), code: z.enum([
    'INVALID_REQUEST', 'UNSUPPORTED_VERSION', 'NOT_FOUND', 'MANDATE_NOT_CONFIRMED',
    'MANDATE_REVISION_CONFLICT', 'IDEMPOTENCY_CONFLICT',
  ]), message: z.string().max(500), cart: CartSubmissionSchema }).strict(),
  z.object({ kind: z.literal('unknown'), cart: CartSubmissionSchema }).strict(),
]).superRefine((item, context) => {
  if (item.kind === 'accepted' && (item.operation.cartId !== item.cart.id
    || item.operation.supplierId !== item.cart.supplierId || item.operation.mandateId !== item.cart.mandateId
    || item.operation.mandateVersion !== item.cart.mandateVersion)) {
    context.addIssue({ code: 'custom', message: 'The recovered operation must match its exact saved cart and mandate revision' });
  }
});

const common = { schemaVersion: z.literal(1), historical: z.literal(true), savedAt: timestamp };
const SavedRunReviewSchema = z.object({ ...common, kind: z.literal('saved-shop-review'), review: RunReviewSchema }).strict();
const SavedRecoveryReviewSchema = z.object({
  ...common, kind: z.literal('saved-shop-recovery-review'), runId, mandateId: id,
  resent: z.array(ResentCartSchema).min(1).max(100),
}).strict().superRefine((saved, context) => {
  if (!unique(saved.resent.map((item) => item.cart.id)) || saved.resent.some((item) => item.cart.mandateId !== saved.mandateId)) {
    context.addIssue({ code: 'custom', message: 'Recovered carts must be unique and belong to the saved mandate' });
  }
});

export const SavedReviewSchema = z.discriminatedUnion('kind', [SavedRunReviewSchema, SavedRecoveryReviewSchema])
  .superRefine((saved, context) => {
    if (new TextEncoder().encode(JSON.stringify(saved)).byteLength > MAX_SAVED_REVIEW_BYTES) {
      context.addIssue({ code: 'custom', message: 'Saved review exceeds the supported byte limit' });
    }
  });

export type SavedReview = z.infer<typeof SavedReviewSchema>;

/** Validate and clone untrusted decoded JSON. A schema-valid file remains editable history. */
export function parseSavedReview(raw: unknown): SavedReview {
  return SavedReviewSchema.parse(raw);
}

export function createSavedRunReview(review: RunReview, savedAt: string): Extract<SavedReview, { kind: 'saved-shop-review' }> {
  const saved = parseSavedReview({ schemaVersion: 1, kind: 'saved-shop-review', historical: true, savedAt, review });
  if (saved.kind !== 'saved-shop-review') throw new Error('Saved review kind did not match');
  return saved;
}

export function createSavedRecoveryReview(
  input: { runId: string; mandateId: string; resent: readonly ResentCart[] }, savedAt: string,
): Extract<SavedReview, { kind: 'saved-shop-recovery-review' }> {
  const saved = parseSavedReview({ schemaVersion: 1, kind: 'saved-shop-recovery-review', historical: true, savedAt, ...input });
  if (saved.kind !== 'saved-shop-recovery-review') throw new Error('Saved recovery review kind did not match');
  return saved;
}
