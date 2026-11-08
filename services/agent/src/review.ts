import { z } from 'zod';
import type { Operation } from '../../../packages/contracts/src/backend.ts';
import type { BudgetSnapshot, Mandate } from '../../../packages/contracts/src/index.ts';
import { ToolArgsSchemas } from './shopper.ts';
import type { ShoppingOutcome, ShoppingRunReport } from './worker.ts';

// Turns what a run produced into what a person can read. Pure: it opens nothing and
// sanitizes nothing, so whoever renders this must treat every string as hostile.
// The run report and the ledger are the record. Events supply only order, estimates and
// refused calls, and the model's summary is carried along without affecting anything.

const MISSING_RECORDS = 'missing, stale or unverified';

/**
 * The one map to plain language, for closed error codes and check code prefixes. A check
 * code's part after the colon fills {subject}. Wording states only what the code
 * establishes: a code never says which of its possible causes applied.
 */
const PLAIN_WORDING: ReadonlyMap<string, string> = new Map([
  // Refused at the shopper's tool boundary.
  ['INVALID_TOOL_CALL', 'This tool does not accept those arguments.'],
  ['TOOL_LIMIT', "The run's tool-call allowance is used up."],
  ['TOOL_BUSY', 'Another tool call was still in progress.'],
  ['TOOL_FAILED', 'The tool call could not be completed.'],
  ['SESSION_COMPLETE', 'This run accepts no further carts.'],
  ['SUPPLIER_NOT_ALLOWED', "This store is not on the mandate's approved list."],
  ['REQUIREMENT_NOT_FOUND', 'The mandate has no such requirement.'],
  ['SKU_NOT_ALLOWED', 'This product is not approved for that requirement.'],
  ['SKU_UNAVAILABLE', "This store's catalog does not list that product."],
  ['CATALOG_UNAVAILABLE', "This store's catalog could not be read."],
  ['INVALID_CATALOG', "This store's catalog did not match the expected format."],
  ['CATALOG_TIMEOUT', "This store's catalog did not answer in time."],
  ['CART_NOT_FOUND', 'That cart ID is not the one that can be submitted now.'],
  ['SUBMISSION_UNRESOLVED', 'An earlier submission is unresolved; only it can be retried.'],
  ['SUBMISSION_NOT_RECORDED', 'The submission could not be recorded, so it was not sent.'],
  // Closed backend codes. QUANTITY_EXCEEDED is also a tool-boundary code.
  ['QUANTITY_EXCEEDED', 'More units than this requirement still needs.'],
  ['BUDGET_EXCEEDED', "The checker's total is more than the budget still available."],
  ['QUOTE_EXPIRED', "The store's quote is expired, future-dated or too old."],
  ['MANDATORY_EVIDENCE_UNKNOWN', `Required records are ${MISSING_RECORDS}.`],
  ['INELIGIBLE', 'The cart failed a mandatory policy check.'],
  ['SUPPLIER_UNAVAILABLE', 'The store is not approved, not configured or could not quote.'],
  ['INVALID_REQUEST', 'The backend refused a malformed request.'],
  ['UNSUPPORTED_VERSION', 'The backend does not support this API version.'],
  ['NOT_FOUND', 'The backend has no such record.'],
  ['MANDATE_NOT_CONFIRMED', 'The mandate has no confirmed active revision.'],
  ['MANDATE_REVISION_CONFLICT', 'The cart names a mandate revision that is not the active one.'],
  ['IDEMPOTENCY_CONFLICT', 'This cart ID was already used with different content.'],
  ['BUSY', 'The ledger was busy, so the outcome is not established.'],
  ['INTERNAL_ERROR', 'The backend hit an internal error, so the outcome is not established.'],
  // Check code prefixes from the checker's rules.
  ['BUDGET', "The checker's total is more than the budget still available."],
  ['QUANTITY', 'This cart plus earlier allocations would exceed what {subject} needs.'],
  ['STOCK', 'The store does not report enough units of {subject}.'],
  ['UNIT_PRICE', 'The unit price of {subject} is above the allowed cap.'],
  ['WARRANTY', 'The warranty on {subject} is below the required minimum.'],
  ['SKU', '{subject} is not an approved product for this mandate.'],
  ['REQUIREMENT', 'Cart line {subject} names no known requirement.'],
  ['SUPPLIER', 'This store is not allowed by both the policy and the mandate.'],
  ['DELIVERY', 'The quoted delivery date has passed or misses the ready-by date.'],
  ['MANDATE_TIMING', "The mandate's confirmation or purchase dates do not allow buying now."],
  ['MANDATE_IDENTITY', 'The cart does not reference this mandate revision.'],
  ['QUOTE_TIMING', "The store's quote is expired, future-dated or too old."],
  ['QUOTE_IDENTITY', "The store's quote does not match this cart, store and destination."],
  ['QUOTE_LINES', "The store's quote does not match the cart's products and quantities."],
  ['QUOTE_TOTAL', "The store's quoted total does not add up."],
  ['CURRENCY', 'Not every amount is in the mandate currency.'],
  ['POLICY_VERSION', 'The mandate does not reference the current company policy.'],
  ['POLICY_BUDGET', 'The mandate budget is above the company policy limit.'],
  ['POLICY_SUPPLIERS', 'The mandate lists a store company policy does not allow.'],
  ['POLICY_REQUIREMENT', 'Requirement {subject} goes beyond what company policy allows.'],
  ['POLICY_UNITS', 'The mandate asks for more {subject} units than policy allows.'],
  ['SNAPSHOT_IDENTITY', 'The budget record does not belong to this mandate revision.'],
  ['SNAPSHOT_REQUIREMENTS', 'The budget record names a requirement this mandate lacks.'],
  // Only the contract mock returns this one.
  ['TOTAL_OUT_OF_RANGE_OR_UNKNOWN_SKU', 'The contract mock could not price this cart.'],
]);

/** A closed code in plain language. A code with no wording shows raw, never dropped. */
export function plainReason(code: string): string {
  return PLAIN_WORDING.get(code) ?? `Unrecognized code: ${code}`;
}

export interface CheckGroup {
  sentence: string;
  codes: string[];
  /** False means the sentence only repeats a raw code this module has no wording for. */
  recognized: boolean;
}

function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function sameItems(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}

/**
 * Names only the records the codes name. Different SKUs for product and stock stay
 * separate, so a sentence never implies a record is bad when no code says so.
 */
function evidenceSentence(productSkus: readonly string[], stockSkus: readonly string[], delivery: boolean): string {
  const parts: string[] = [];
  if (productSkus.length > 0 && sameItems(productSkus, stockSkus)) {
    parts.push(`product and stock records for ${joinWords(productSkus)}`);
  } else {
    if (productSkus.length > 0) parts.push(`product records for ${joinWords(productSkus)}`);
    if (stockSkus.length > 0) parts.push(`stock records for ${joinWords(stockSkus)}`);
  }
  if (delivery) parts.push('the delivery record');
  const subject = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)},`;
  const verb = parts.length === 1 && delivery ? 'is' : 'are';
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${verb} ${MISSING_RECORDS}.`;
}

/** Reads a checker's codes as sentences, in the order they first appear. */
export function groupCheckCodes(codes: readonly string[]): CheckGroup[] {
  const groups = new Map<string, { codes: string[]; subjects: string[] }>();
  const groupFor = (key: string) => {
    const group = groups.get(key) ?? { codes: [], subjects: [] };
    groups.set(key, group);
    return group;
  };
  const productSkus: string[] = [];
  const stockSkus: string[] = [];
  let delivery = false;

  for (const code of codes) {
    const separator = code.indexOf(':');
    const prefix = separator === -1 ? code : code.slice(0, separator);
    const subject = separator === -1 ? '' : code.slice(separator + 1);
    const isEvidence = ((prefix === 'PRODUCT_EVIDENCE' || prefix === 'STOCK_EVIDENCE') && subject !== '')
      || code === 'DELIVERY_EVIDENCE';
    if (isEvidence) {
      groupFor('evidence').codes.push(code);
      if (prefix === 'PRODUCT_EVIDENCE' && !productSkus.includes(subject)) productSkus.push(subject);
      if (prefix === 'STOCK_EVIDENCE' && !stockSkus.includes(subject)) stockSkus.push(subject);
      if (code === 'DELIVERY_EVIDENCE') delivery = true;
      continue;
    }
    const template = PLAIN_WORDING.get(prefix);
    // A known prefix that does not fit its template is still a code nobody has wording for.
    const fits = template !== undefined && template.includes('{subject}') === (subject !== '');
    const group = groupFor(fits ? `known:${prefix}` : `raw:${code}`);
    group.codes.push(code);
    if (subject !== '' && !group.subjects.includes(subject)) group.subjects.push(subject);
  }

  return [...groups].map(([key, group]) => {
    if (key === 'evidence') {
      return { sentence: evidenceSentence(productSkus, stockSkus, delivery), codes: group.codes, recognized: true };
    }
    if (key.startsWith('raw:')) {
      return { sentence: `Unrecognized check: ${group.codes[0]}`, codes: group.codes, recognized: false };
    }
    const template = PLAIN_WORDING.get(key.slice('known:'.length))!;
    // A function, because a subject could hold "$&" and similar replacement patterns.
    return { sentence: template.replace('{subject}', () => joinWords(group.subjects)), codes: group.codes, recognized: true };
  });
}

/** What a scripted stand-in says at the end. It reports nothing, so a brief review drops it. */
export const SCRIPTED_PLACEHOLDER_SUMMARY = 'Scripted run finished.';

export const OUTCOME_SENTENCES: Readonly<Record<ShoppingOutcome, string>> = {
  completed: 'Every unit needed is covered by a reservation or an earlier commitment.',
  partial: 'Some units were reserved, but the requirements are not fully covered.',
  no_feasible_cart: 'This run reserved nothing: no cart was accepted.',
  limit_exceeded: 'A host limit ended the run before every unit was covered.',
  unknown_submission: 'A submission has an unknown outcome, and a reservation may exist.',
  backend_refused: 'The backend refused in a way a different cart cannot fix.',
  model_refused: 'The model declined, so the run ended.',
  failed: 'The run failed: the model call failed or its output was truncated.',
};

export const MOCK_WARNING = 'Contract mock: it checks nothing and keeps no ledger, so nothing here is a checker decision.';

const amount = z.number().int().min(0);
const LineSchema = z.object({ requirementId: z.string(), sku: z.string(), quantity: z.number().int() });
const ToolCallEventSchema = z.object({ type: z.literal('tool_call'), tool: z.string(), args: z.unknown() });
const ToolResultEventSchema = z.object({ type: z.literal('tool_result'), tool: z.string(), isError: z.boolean(), content: z.string() });
const ToolFailureSchema = z.object({ error: z.object({ code: z.string().min(1) }) });
const CartBuildSchema = z.object({
  cart: z.object({ id: z.string(), supplierId: z.string(), lines: z.array(LineSchema) }),
  // A figure claiming to be authoritative is not the estimate this tool returns.
  estimate: z.object({ authoritative: z.literal(false), totalMinor: amount }).nullable(),
});
const CartSubmitSchema = z.object({
  submission: z.object({
    kind: z.string(),
    cart: z.object({ id: z.string(), supplierId: z.string(), lines: z.array(LineSchema) }),
    code: z.string().optional(),
    operation: z.object({ totalMinor: amount }).optional(),
  }),
});

function parseContent<T>(schema: z.ZodType<T>, content: string): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Model-supplied arguments in a few words. Anything but text and numbers is left out. */
export function describeAttempt(args: unknown): string {
  if (!isRecord(args)) return '';
  const word = (value: unknown): string | undefined =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  const lines = Array.isArray(args.lines)
    ? args.lines.map((line) => (isRecord(line) ? `${word(line.sku) ?? '?'} x${word(line.quantity) ?? '?'}` : '?')).join(', ')
    : undefined;
  return [word(args.supplierId), word(args.requirementId), word(args.sku), lines, word(args.cartId)]
    .filter((part) => part !== undefined).join(' ');
}

export type RunEventReading =
  | { kind: 'ignored' }
  | { kind: 'unreadable' }
  | { kind: 'call'; tool: string; target: string }
  | { kind: 'refused'; tool: string; code: string | null; reason: string }
  | { kind: 'built'; cartId: string; supplierId: string; lines: z.infer<typeof LineSchema>[]; estimateMinor: number | null }
  | {
    kind: 'submitted'; result: string; cartId: string; supplierId: string; lines: z.infer<typeof LineSchema>[];
    code: string | null; totalMinor: number | null;
  };

/** One run event, validated. A bad event reads as unreadable and never throws. */
export function readRunEvent(event: unknown): RunEventReading {
  if (isRecord(event) && event.type === 'model_turn') return { kind: 'ignored' };
  const call = ToolCallEventSchema.safeParse(event);
  if (call.success) return { kind: 'call', tool: call.data.tool, target: describeAttempt(call.data.args) };
  const result = ToolResultEventSchema.safeParse(event);
  if (!result.success) return { kind: 'unreadable' };
  const { tool, isError, content } = result.data;
  if (isError) {
    const failure = parseContent(ToolFailureSchema, content);
    if (!failure) return { kind: 'refused', tool, code: null, reason: 'The refusal could not be read.' };
    const { code } = failure.error;
    // The tool name establishes which of the two things this code covers.
    const noSuchTool = code === 'INVALID_TOOL_CALL' && !Object.hasOwn(ToolArgsSchemas, tool);
    return { kind: 'refused', tool, code, reason: noSuchTool ? 'The shopper has no such tool.' : plainReason(code) };
  }
  if (tool === 'cart.build') {
    const built = parseContent(CartBuildSchema, content);
    if (!built) return { kind: 'unreadable' };
    return {
      kind: 'built', cartId: built.cart.id, supplierId: built.cart.supplierId, lines: built.cart.lines,
      estimateMinor: built.estimate?.totalMinor ?? null,
    };
  }
  if (tool === 'cart.submit') {
    const submitted = parseContent(CartSubmitSchema, content);
    if (!submitted) return { kind: 'unreadable' };
    const { submission } = submitted;
    return {
      kind: 'submitted', result: submission.kind, cartId: submission.cart.id, supplierId: submission.cart.supplierId,
      lines: submission.cart.lines, code: submission.code ?? null, totalMinor: submission.operation?.totalMinor ?? null,
    };
  }
  return { kind: 'ignored' };
}

export type BackendKind = 'simulation-backend' | 'contract-mock';
export type ShopperKind = { kind: 'scripted' } | { kind: 'live'; modelId: string };
/** The result of the backend's mandate.get. */
export interface LedgerFacts {
  mandate: Mandate;
  snapshot: BudgetSnapshot;
}

export type StoreDecisionKind = 'accepted' | 'rejected' | 'refused' | 'unknown' | 'not_submitted' | 'not_checked';

export interface StoreDecision {
  supplierId: string;
  cartId: string;
  /** Comparison figure from cart.build. Never authoritative, and never the checker's price. */
  estimate: { authoritative: false; totalMinor: number } | null;
  decision: StoreDecisionKind;
  /** The checker's own total. Set only when it accepted the cart. */
  checkerTotalMinor: number | null;
  operation: Operation | null;
  lines: Array<{ requirementId: string; sku: string; quantity: number }>;
  /** The closed code, its sentence and the grouped check codes, for a rejection or refusal. */
  code: string | null;
  codeReason: string | null;
  checks: CheckGroup[];
  /** An earlier attempt came back unknown, and a retry settled it. */
  retriedAfterUnknown: boolean;
  /** An event says this cart was submitted, but the run report records no result for it. */
  eventsDisagree: boolean;
}

export interface RefusedCall {
  tool: string;
  /** What the call asked for, in the model's own arguments. */
  target: string;
  /** Null when the refusal itself could not be read. */
  code: string | null;
  reason: string;
}

export interface RequirementView {
  requirementId: string;
  required: number;
  /** Reserved or committed: from the ledger when it could be read, otherwise the run's own count. */
  allocatedUnits: number;
  acceptedThisRun: number;
  remainingUnits: number;
}

export interface BudgetView {
  /** ledger: read after the run. contract-mock and run-only: only what the run itself knows. */
  source: 'ledger' | 'contract-mock' | 'run-only';
  totalMinor: number | null;
  committedMinor: number | null;
  reservedMinor: number | null;
  remainingMinor: number | null;
  allocatedMinor: number | null;
  acceptedThisRunMinor: number;
  /** Ledger remaining minus the run's own figure, when both exist and differ. */
  ledgerDiffersByMinor: number | null;
}

export interface RunReview {
  simulation: true;
  runId: string;
  mandateId: string;
  mandateVersion: number;
  backend: BackendKind;
  shopper: ShopperKind;
  outcome: ShoppingOutcome;
  outcomeSentence: string;
  /** Host wording for a non-business ending. */
  detail: string | null;
  decisions: StoreDecision[];
  refusals: RefusedCall[];
  requirements: RequirementView[];
  budget: BudgetView;
  /** Operations waiting for the operator. Never executed by the shopper. */
  operationsToRun: string[];
  unresolved: boolean;
  usage: ShoppingRunReport['usage'];
  /** The model's words. Nothing above comes from this. */
  modelSummary: string | null;
  /** Events that failed validation. The report still supplies the facts. */
  unreadableEvents: number;
}

export interface RunReviewInput {
  report: ShoppingRunReport;
  events: readonly unknown[];
  /** Null when the read after the run failed. Ignored for the mock, which keeps no ledger. */
  ledger: LedgerFacts | null;
  backend: BackendKind;
  shopper: ShopperKind;
  /** The mandate's total, known from the session even when the ledger read fails. */
  budgetMinor: number | null;
}

interface CartTrail {
  supplierId: string;
  lines: StoreDecision['lines'];
  estimateMinor: number | null;
  submitted: boolean;
  sawUnknown: boolean;
}

function cartTrails(events: readonly unknown[]) {
  const trails = new Map<string, CartTrail>(); // Insertion order is the order of decisions.
  const refusals: RefusedCall[] = [];
  let unreadableEvents = 0;
  let lastCall: { tool: string; target: string } | null = null;
  for (const event of events) {
    const reading = readRunEvent(event);
    if (reading.kind === 'unreadable') unreadableEvents += 1;
    else if (reading.kind === 'call') lastCall = reading;
    else if (reading.kind === 'refused') {
      if (reading.code === null) unreadableEvents += 1;
      const { tool, code, reason } = reading;
      refusals.push({ tool, target: lastCall?.tool === tool ? lastCall.target : '', code, reason });
    } else if (reading.kind === 'built' || reading.kind === 'submitted') {
      const trail = trails.get(reading.cartId)
        ?? { supplierId: reading.supplierId, lines: reading.lines, estimateMinor: null, submitted: false, sawUnknown: false };
      trails.set(reading.cartId, trail);
      if (reading.kind === 'built') trail.estimateMinor = reading.estimateMinor;
      else {
        trail.submitted = true;
        if (reading.result === 'proposal-outcome-unknown') trail.sawUnknown = true;
      }
    }
  }
  return { trails, refusals, unreadableEvents };
}

function storeDecisions(report: ShoppingRunReport, trails: Map<string, CartTrail>): StoreDecision[] {
  const { progress } = report;
  const accepted = new Map(progress.accepted.map((receipt) => [receipt.cart.id, receipt]));
  const rejected = new Map(progress.rejected.map((rejection) => [rejection.cart.id, rejection]));
  // A result the events never mentioned, because they were bad or lost, still appears.
  const recorded = [...progress.accepted, ...progress.rejected, ...(progress.refused ? [progress.refused] : [])]
    .map(({ cart }) => cart).concat(progress.unresolved ? [progress.unresolved] : []);
  for (const cart of recorded) {
    if (!trails.has(cart.id)) {
      trails.set(cart.id, { supplierId: cart.supplierId, lines: cart.lines, estimateMinor: null, submitted: true, sawUnknown: false });
    }
  }

  return [...trails].map(([cartId, trail]) => {
    const base: StoreDecision = {
      supplierId: trail.supplierId, cartId, lines: trail.lines,
      estimate: trail.estimateMinor === null ? null : { authoritative: false, totalMinor: trail.estimateMinor },
      decision: 'not_submitted', checkerTotalMinor: null, operation: null, code: null, codeReason: null, checks: [],
      retriedAfterUnknown: false, eventsDisagree: false,
    };
    const settled = { ...base, retriedAfterUnknown: trail.sawUnknown };
    const receipt = accepted.get(cartId);
    if (receipt?.kind === 'proposal-accepted') {
      return {
        ...settled, supplierId: receipt.cart.supplierId, lines: receipt.cart.lines, decision: 'accepted',
        checkerTotalMinor: receipt.operation.totalMinor, operation: receipt.operation,
      };
    }
    if (receipt) return { ...settled, decision: 'not_checked' };
    const rejection = rejected.get(cartId);
    if (rejection) {
      return {
        ...settled, supplierId: rejection.cart.supplierId, lines: rejection.cart.lines, decision: 'rejected',
        code: rejection.code, codeReason: plainReason(rejection.code), checks: groupCheckCodes(rejection.checkCodes),
      };
    }
    if (progress.refused?.cart.id === cartId) {
      const { code } = progress.refused;
      return { ...settled, decision: 'refused', code, codeReason: plainReason(code) };
    }
    if (progress.unresolved?.id === cartId) return { ...base, decision: 'unknown' };
    // Sent, by an event's account, yet not in the record: that is not "never sent" or "accepted".
    if (trail.submitted) return { ...base, decision: 'unknown', eventsDisagree: true };
    return base;
  });
}

function usableLedger(input: RunReviewInput): LedgerFacts | null {
  const { ledger, report, backend } = input;
  if (backend !== 'simulation-backend' || ledger === null) return null;
  const matches = ledger.mandate.id === report.mandateId && ledger.mandate.version === report.mandateVersion
    && ledger.snapshot.mandateId === report.mandateId && ledger.snapshot.mandateVersion === report.mandateVersion;
  return matches ? ledger : null;
}

function budgetView(input: RunReviewInput, ledger: LedgerFacts | null): BudgetView {
  const { report, backend } = input;
  const runRemaining = report.progress.budgetRemainingMinor;
  let acceptedThisRunMinor = 0;
  for (const receipt of report.progress.accepted) {
    if (receipt.kind === 'proposal-accepted') acceptedThisRunMinor += receipt.operation.totalMinor;
  }
  if (ledger) {
    const { committedMinor, reservedMinor } = ledger.snapshot;
    const totalMinor = ledger.mandate.budgetMinor;
    const remainingMinor = totalMinor - committedMinor - reservedMinor;
    return {
      source: 'ledger', totalMinor, committedMinor, reservedMinor, remainingMinor,
      allocatedMinor: committedMinor + reservedMinor, acceptedThisRunMinor,
      ledgerDiffersByMinor: runRemaining !== null && runRemaining !== remainingMinor ? remainingMinor - runRemaining : null,
    };
  }
  const totalMinor = input.budgetMinor;
  return {
    source: backend === 'contract-mock' ? 'contract-mock' : 'run-only',
    totalMinor, committedMinor: null, reservedMinor: null, remainingMinor: runRemaining,
    allocatedMinor: totalMinor !== null && runRemaining !== null ? totalMinor - runRemaining : null,
    acceptedThisRunMinor, ledgerDiffersByMinor: null,
  };
}

/** Everything a person needs to read a run. Facts here come only from the report and ledger. */
export function buildRunReview(input: RunReviewInput): RunReview {
  const { report, events, backend, shopper } = input;
  const { trails, refusals, unreadableEvents } = cartTrails(events);
  const ledger = usableLedger(input);
  const decisions = storeDecisions(report, trails);
  const quantities = new Map(ledger?.snapshot.quantities.map((item) => [item.requirementId, item]));
  const requirements = report.progress.requirements.map((item): RequirementView => {
    const entry = quantities.get(item.requirementId);
    const allocatedUnits = entry ? entry.committed + entry.reserved : item.priorUnits + item.acceptedUnits;
    return {
      requirementId: item.requirementId, required: item.required, allocatedUnits, acceptedThisRun: item.acceptedUnits,
      remainingUnits: Math.max(0, item.required - allocatedUnits),
    };
  });
  return {
    simulation: true,
    runId: report.runId,
    mandateId: report.mandateId,
    mandateVersion: report.mandateVersion,
    backend,
    shopper,
    outcome: report.outcome,
    outcomeSentence: OUTCOME_SENTENCES[report.outcome] ?? `Unrecognized outcome: ${report.outcome}`,
    detail: report.detail,
    decisions,
    refusals,
    requirements,
    budget: budgetView(input, ledger),
    operationsToRun: backend === 'simulation-backend'
      ? decisions.flatMap(({ operation }) => (operation?.status === 'reserved' ? [operation.id] : []))
      : [],
    unresolved: report.progress.unresolved !== null,
    usage: report.usage,
    modelSummary: report.modelSummary,
    unreadableEvents,
  };
}

export interface StatusView {
  kind: 'shop-status';
  simulation: true;
  backend: BackendKind;
  /** Set for the contract mock, whose numbers are placeholders. */
  warning: string | null;
  mandateId: string;
  mandateVersion: number;
  /** From mandate.get, rather than a draft or orchestration file. */
  confirmedAt: string;
  budget: { totalMinor: number; committedMinor: number; reservedMinor: number; remainingMinor: number; allocatedMinor: number };
  requirements: Array<{
    requirementId: string; required: number; committedUnits: number; reservedUnits: number; allocatedUnits: number; remainingUnits: number;
  }>;
  /** Exactly what operation.get returned. Payment, order, refund and readiness stay separate. */
  operations: Operation[];
  /** Where operation IDs come from, when none were named. */
  operationsHint: string | null;
}

export const OPERATIONS_HINT = 'The client cannot list operations. Each shop run prints the operation ID of every reservation it makes; pass it with --operation ID.';

export function buildStatusView(input: { ledger: LedgerFacts; operations: readonly Operation[]; backend: BackendKind }): StatusView {
  const { ledger: { mandate, snapshot }, operations, backend } = input;
  const allocatedMinor = snapshot.committedMinor + snapshot.reservedMinor;
  const quantities = new Map(snapshot.quantities.map((item) => [item.requirementId, item]));
  return {
    kind: 'shop-status',
    simulation: true,
    backend,
    warning: backend === 'contract-mock' ? MOCK_WARNING : null,
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    confirmedAt: mandate.confirmedAt,
    budget: {
      totalMinor: mandate.budgetMinor, committedMinor: snapshot.committedMinor, reservedMinor: snapshot.reservedMinor,
      remainingMinor: mandate.budgetMinor - allocatedMinor, allocatedMinor,
    },
    requirements: mandate.requirements.map(({ id, quantity }) => {
      const committedUnits = quantities.get(id)?.committed ?? 0;
      const reservedUnits = quantities.get(id)?.reserved ?? 0;
      const allocatedUnits = committedUnits + reservedUnits;
      return { requirementId: id, required: quantity, committedUnits, reservedUnits, allocatedUnits, remainingUnits: Math.max(0, quantity - allocatedUnits) };
    }),
    operations: [...operations],
    operationsHint: operations.length === 0 ? OPERATIONS_HINT : null,
  };
}
