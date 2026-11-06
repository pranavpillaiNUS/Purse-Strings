import { z } from 'zod';
import type { BackendErrorCode, Operation } from '../../../packages/contracts/src/backend.ts';
import {
  BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, MandateSchema,
  type BudgetSnapshot, type CartSubmission, type Catalog, type EligibilityResult, type Mandate,
} from '../../../packages/contracts/src/index.ts';
import { cartCosts, type CatalogSource } from '../../suppliers/src/catalog.ts';

const id = MandateSchema.shape.id;
const selection = { supplierId: id, requirementId: id };

/** Tool arguments, shared by host validation and the schemas shown to a model. */
export const ToolArgsSchemas = {
  'catalog.search': z.object({ ...selection, limit: z.number().int().min(1).max(25).default(10) }).strict(),
  'product.view': z.object({ ...selection, sku: id }).strict(),
  'cart.build': CartSubmissionSchema.pick({ supplierId: true, lines: true }),
  'cart.submit': z.object({ cartId: id }).strict(),
} as const;

/** The complete model-facing surface. No envelope permits caller authority or URLs. */
export const ShoppingToolCallSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('catalog.search'), args: ToolArgsSchemas['catalog.search'] }).strict(),
  z.object({ tool: z.literal('product.view'), args: ToolArgsSchemas['product.view'] }).strict(),
  z.object({ tool: z.literal('cart.build'), args: ToolArgsSchemas['cart.build'] }).strict(),
  z.object({ tool: z.literal('cart.submit'), args: ToolArgsSchemas['cart.submit'] }).strict(),
]);

const SessionLimits = {
  runId: z.string().trim().min(1).max(100),
  maxToolCalls: z.number().int().min(1).max(100).default(24),
  catalogTimeoutMs: z.number().int().min(1).max(10_000).default(1_000),
};

const OfflineSessionInputSchema = z.object({
  ...SessionLimits,
  mandate: MandateSchema,
  now: z.iso.datetime({ offset: true }),
}).strict();

const SessionInputSchema = z.object({
  ...SessionLimits,
  mandate: MandateSchema,
  snapshot: BudgetSnapshotSchema,
  submitTimeoutMs: z.number().int().min(1).max(120_000).default(30_000),
  maxCarts: z.number().int().min(1).max(10).default(3),
}).strict().refine(({ mandate, snapshot }) => snapshot.mandateId === mandate.id,
  'Snapshot must belong to the mandate');

export type ShoppingToolErrorCode =
  | 'INVALID_TOOL_CALL' | 'TOOL_LIMIT' | 'TOOL_BUSY' | 'SESSION_COMPLETE'
  | 'SUPPLIER_NOT_ALLOWED' | 'REQUIREMENT_NOT_FOUND' | 'SKU_NOT_ALLOWED'
  | 'SKU_UNAVAILABLE' | 'QUANTITY_EXCEEDED' | 'CATALOG_UNAVAILABLE'
  | 'INVALID_CATALOG' | 'CATALOG_TIMEOUT' | 'CART_NOT_FOUND' | 'SUBMISSION_UNRESOLVED';

export class ShoppingToolError extends Error {
  readonly code: ShoppingToolErrorCode;

  constructor(code: ShoppingToolErrorCode, message: string) {
    super(message);
    this.name = 'ShoppingToolError';
    this.code = code;
  }
}

/**
 * What the shopper learns from submitting a proposal. `unknown` means the outcome
 * could not be established, so a reservation may exist: only the same cart may be
 * retried, because a stable identity makes that retry resolve to one operation.
 */
export type ProposalOutcome =
  | { kind: 'accepted'; operation: Operation }
  | { kind: 'rejected'; code: BackendErrorCode; message: string; checkCodes: string[] }
  | { kind: 'refused'; code: BackendErrorCode; message: string }
  | { kind: 'unknown' };

export interface ProposalPort {
  submit(cart: CartSubmission): Promise<ProposalOutcome>;
}

type CatalogFacts = Pick<Catalog,
  'supplierId' | 'shippingMinor' | 'taxRateBasisPoints' | 'deliveryLocationId' | 'delivery'> & {
    currency: 'SGD';
  };

export interface OfflineSubmission {
  kind: 'offline-eligibility-stub';
  simulation: true;
  cart: CartSubmission;
  eligibility: EligibilityResult;
  warning: string;
}

export interface AcceptedSubmission {
  kind: 'proposal-accepted';
  simulation: true;
  cart: CartSubmission;
  operation: Operation;
  note: string;
}

export interface RejectedSubmission {
  kind: 'proposal-rejected';
  simulation: true;
  cart: CartSubmission;
  code: BackendErrorCode;
  message: string;
  checkCodes: string[];
  note: string;
}

export interface RefusedSubmission {
  kind: 'proposal-refused';
  simulation: true;
  cart: CartSubmission;
  code: BackendErrorCode;
  message: string;
  note: string;
}

export interface UnknownSubmission {
  kind: 'proposal-outcome-unknown';
  simulation: true;
  cart: CartSubmission;
  note: string;
}

export type Submission = OfflineSubmission | AcceptedSubmission | RejectedSubmission | RefusedSubmission | UnknownSubmission;

export interface RequirementProgress {
  requirementId: string;
  required: number;
  priorUnits: number;
  acceptedUnits: number;
  remainingUnits: number;
}

export interface ShoppingProgress {
  requirements: RequirementProgress[];
  /** Null when no ledger snapshot exists, as in the offline stub. */
  budgetRemainingMinor: number | null;
  accepted: Array<AcceptedSubmission | OfflineSubmission>;
  rejected: RejectedSubmission[];
  refused: RefusedSubmission | null;
  unresolved: CartSubmission | null;
  closed: boolean;
}

/** A host-computed comparison aid. The supplier's quote remains the only authoritative price. */
export interface CartEstimate {
  authoritative: false;
  currency: 'SGD';
  itemsMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export type ShoppingToolOutput =
  | { tool: 'catalog.search'; facts: CatalogFacts; requirementId: string; products: Catalog['products'] }
  | { tool: 'product.view'; facts: CatalogFacts; requirementId: string; product: Catalog['products'][number] }
  | { tool: 'cart.build'; cart: CartSubmission; estimate: CartEstimate | null }
  | { tool: 'cart.submit'; submission: Submission; budgetRemainingMinor: number | null; remainingUnits: Record<string, number> };

function catalogFacts(catalog: Catalog): CatalogFacts {
  const { supplierId, shippingMinor, taxRateBasisPoints, deliveryLocationId, delivery } = catalog;
  return { supplierId, currency: 'SGD', shippingMinor, taxRateBasisPoints, deliveryLocationId, delivery };
}

interface SessionConfig {
  mandate: Mandate;
  snapshot: BudgetSnapshot | null;
  runId: string;
  maxToolCalls: number;
  catalogTimeoutMs: number;
  maxCarts: number;
  submit(cart: CartSubmission): Promise<Submission>;
}

function createSession(config: SessionConfig, catalogs: CatalogSource) {
  const { mandate, snapshot, runId, maxToolCalls, catalogTimeoutMs, maxCarts } = config;
  let usedCalls = 0;
  let busy = false;
  let cartRevision = 0;
  let cart: CartSubmission | undefined;
  let unresolved: CartSubmission | undefined;
  let refused: RefusedSubmission | undefined;
  const receipts = new Map<string, AcceptedSubmission | OfflineSubmission>();
  const rejected: RejectedSubmission[] = [];
  const acceptedUnits = new Map<string, number>();

  const priorUnits = (requirementId: string): number => {
    const entry = snapshot?.quantities.find((item) => item.requirementId === requirementId);
    return (entry?.committed ?? 0) + (entry?.reserved ?? 0);
  };
  const remainingUnits = (requirementId: string, required: number): number =>
    Math.max(0, required - priorUnits(requirementId) - (acceptedUnits.get(requirementId) ?? 0));
  const remainingByRequirement = (): Record<string, number> => Object.fromEntries(
    mandate.requirements.map(({ id: requirementId, quantity }) => [requirementId, remainingUnits(requirementId, quantity)]),
  );
  const nothingRemaining = (): boolean => mandate.requirements
    .every(({ id: requirementId, quantity }) => remainingUnits(requirementId, quantity) === 0);
  const closed = (): boolean => refused !== undefined || receipts.size >= maxCarts || nothingRemaining();
  const budgetRemainingMinor = (): number | null => {
    if (!snapshot) return null;
    let accepted = 0;
    for (const receipt of receipts.values()) {
      if (receipt.kind === 'proposal-accepted') accepted += receipt.operation.totalMinor;
    }
    return mandate.budgetMinor - snapshot.committedMinor - snapshot.reservedMinor - accepted;
  };

  function requireSupplier(supplierId: string): void {
    if (!mandate.allowedSuppliers.includes(supplierId)) {
      throw new ShoppingToolError('SUPPLIER_NOT_ALLOWED', 'Supplier is outside the configured mandate');
    }
  }

  function requireRequirement(requirementId: string) {
    const requirement = mandate.requirements.find(({ id: candidate }) => candidate === requirementId);
    if (!requirement) throw new ShoppingToolError('REQUIREMENT_NOT_FOUND', 'Requirement is outside the configured mandate');
    return requirement;
  }

  async function loadCatalog(supplierId: string): Promise<Catalog> {
    requireSupplier(supplierId);
    let raw: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = new ShoppingToolError('CATALOG_TIMEOUT', 'Configured catalog read timed out');
    try {
      raw = await Promise.race([
        catalogs.getCatalog(supplierId),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(timeoutError), catalogTimeoutMs);
        }),
      ]);
    } catch (error) {
      if (error === timeoutError) throw timeoutError;
      // Do not propagate connector messages, which may contain secrets or prose.
      throw new ShoppingToolError('CATALOG_UNAVAILABLE', 'Configured supplier catalog could not be read');
    } finally {
      clearTimeout(timer);
    }
    const parsed = CatalogSchema.safeParse(raw);
    if (!parsed.success || parsed.data.supplierId !== supplierId) {
      throw new ShoppingToolError('INVALID_CATALOG', 'Catalog did not match the configured supplier contract');
    }
    return parsed.data;
  }

  function submitOutput(submission: Submission): ShoppingToolOutput {
    return {
      tool: 'cart.submit', submission,
      budgetRemainingMinor: budgetRemainingMinor(), remainingUnits: remainingByRequirement(),
    };
  }

  async function handle(call: z.infer<typeof ShoppingToolCallSchema>): Promise<ShoppingToolOutput> {
    if (call.tool === 'cart.submit') {
      const receipt = receipts.get(call.args.cartId);
      if (receipt) return submitOutput(receipt);
    }
    if (closed()) throw new ShoppingToolError('SESSION_COMPLETE', 'This session accepts no further carts');
    switch (call.tool) {
      case 'catalog.search': {
        const requirement = requireRequirement(call.args.requirementId);
        const catalog = await loadCatalog(call.args.supplierId);
        return {
          tool: call.tool, facts: catalogFacts(catalog), requirementId: requirement.id,
          products: catalog.products.filter(({ sku }) => requirement.allowedSkus.includes(sku)).slice(0, call.args.limit),
        };
      }
      case 'product.view': {
        const requirement = requireRequirement(call.args.requirementId);
        if (!requirement.allowedSkus.includes(call.args.sku)) {
          throw new ShoppingToolError('SKU_NOT_ALLOWED', 'SKU is outside the configured requirement');
        }
        const catalog = await loadCatalog(call.args.supplierId);
        const product = catalog.products.find(({ sku }) => sku === call.args.sku);
        if (!product) throw new ShoppingToolError('SKU_UNAVAILABLE', 'SKU is absent from the configured catalog');
        return { tool: call.tool, facts: catalogFacts(catalog), requirementId: requirement.id, product };
      }
      case 'cart.build': {
        if (unresolved) {
          throw new ShoppingToolError('SUBMISSION_UNRESOLVED',
            'An earlier submission has an unknown outcome and may hold a reservation. Retry that exact cartId; do not build another cart');
        }
        requireSupplier(call.args.supplierId);
        const quantities = new Map<string, number>();
        for (const line of call.args.lines) {
          const requirement = requireRequirement(line.requirementId);
          if (!requirement.allowedSkus.includes(line.sku)) {
            throw new ShoppingToolError('SKU_NOT_ALLOWED', 'SKU is outside the configured requirement');
          }
          const total = (quantities.get(requirement.id) ?? 0) + line.quantity;
          if (total > remainingUnits(requirement.id, requirement.quantity)) {
            throw new ShoppingToolError('QUANTITY_EXCEEDED', 'Cart exceeds the units still needed for this requirement');
          }
          quantities.set(requirement.id, total);
        }
        const catalog = await loadCatalog(call.args.supplierId);
        if (call.args.lines.some(({ sku }) => !catalog.products.some((product) => product.sku === sku))) {
          throw new ShoppingToolError('SKU_UNAVAILABLE', 'SKU is absent from the configured catalog');
        }
        // Host-owned identity binds one exact build; a rebuild invalidates the old ID.
        const nextCart = CartSubmissionSchema.parse({
          id: `${runId}-cart-${cartRevision + 1}`,
          mandateId: mandate.id, mandateVersion: mandate.version,
          supplierId: call.args.supplierId, lines: call.args.lines,
        });
        cartRevision += 1;
        cart = nextCart;
        const costs = cartCosts(catalog, cart.lines);
        return {
          tool: call.tool, cart,
          estimate: costs && { authoritative: false, currency: 'SGD', ...costs },
        };
      }
      case 'cart.submit': {
        const target = unresolved ?? cart;
        if (!target || target.id !== call.args.cartId) {
          throw new ShoppingToolError('CART_NOT_FOUND', unresolved
            ? 'Submit must retry the cart whose outcome is unknown'
            : 'Submit requires the current cart.build identity');
        }
        const submission = await config.submit(target);
        if (submission.kind === 'proposal-outcome-unknown') {
          unresolved = target;
          cart = undefined;
          return submitOutput(submission);
        }
        unresolved = undefined;
        cart = undefined;
        if (submission.kind === 'proposal-rejected') rejected.push(submission);
        else if (submission.kind === 'proposal-refused') refused = submission;
        else {
          receipts.set(target.id, submission);
          for (const line of target.lines) {
            acceptedUnits.set(line.requirementId, (acceptedUnits.get(line.requirementId) ?? 0) + line.quantity);
          }
        }
        return submitOutput(submission);
      }
    }
  }

  return {
    /** Host-provided planning context, excluding descriptive confirmation metadata. */
    getContext() {
      const { id: mandateId, version, currency, budgetMinor, purchaseBy, readyBy, deliveryLocationId, allowedSuppliers, requirements } = mandate;
      return structuredClone({
        simulation: true as const, mandateId, mandateVersion: version,
        currency, budgetMinor, purchaseBy, readyBy, deliveryLocationId, allowedSuppliers, requirements,
      });
    },
    getUsage() { return { usedCalls, maxToolCalls, submitted: receipts.size > 0 }; },
    /** Host-derived facts. A model's account of the run never changes these. */
    getProgress(): ShoppingProgress {
      return structuredClone({
        requirements: mandate.requirements.map(({ id: requirementId, quantity }) => ({
          requirementId, required: quantity, priorUnits: priorUnits(requirementId),
          acceptedUnits: acceptedUnits.get(requirementId) ?? 0,
          remainingUnits: remainingUnits(requirementId, quantity),
        })),
        budgetRemainingMinor: budgetRemainingMinor(),
        accepted: [...receipts.values()],
        rejected,
        refused: refused ?? null,
        unresolved: unresolved ?? null,
        closed: closed(),
      });
    },
    async dispatch(rawCall: unknown): Promise<ShoppingToolOutput> {
      if (usedCalls >= maxToolCalls) throw new ShoppingToolError('TOOL_LIMIT', 'Tool-call limit exhausted');
      usedCalls += 1; // Invalid and overlapping attempts also consume the fixed budget.
      if (busy) throw new ShoppingToolError('TOOL_BUSY', 'Only one tool call may be in flight');
      const parsed = ShoppingToolCallSchema.safeParse(rawCall);
      if (!parsed.success) throw new ShoppingToolError('INVALID_TOOL_CALL', 'Tool call did not match the bounded shopping contract');
      busy = true;
      try {
        return structuredClone(await handle(parsed.data));
      } finally {
        busy = false;
      }
    },
  };
}

export type ShoppingSession = ReturnType<typeof createSession>;

/**
 * Offline, single-cart rehearsal of the worker's tools. The configured mandate is
 * fixture context, not authenticated authority. Nothing here quotes, reserves,
 * orders, pays, or calls the checker/backend.
 */
export function createOfflineShoppingSession(rawInput: unknown, catalogs: CatalogSource): ShoppingSession {
  const { mandate, runId, now, maxToolCalls, catalogTimeoutMs } = OfflineSessionInputSchema.parse(rawInput);
  return createSession({
    mandate, snapshot: null, runId, maxToolCalls, catalogTimeoutMs, maxCarts: 1,
    async submit(cart) {
      return {
        kind: 'offline-eligibility-stub', simulation: true, cart,
        eligibility: {
          cartId: cart.id, quoteId: 'offline-stub-no-quote', evaluatedAt: now,
          decision: 'eligible', totalMinor: 0, remainingBeforeMinor: 0,
          checks: [{ code: 'OFFLINE_STUB', status: 'unknown', message: 'No policy, quote, budget or evidence evaluation was performed' }],
        },
        warning: 'Stub only: eligible and zero amounts are placeholders. No eligibility established, funds reserved, payment, order or readiness confirmed.',
      };
    },
  }, catalogs);
}

const UNKNOWN_NOTE = 'The outcome could not be established and a reservation may exist. Call cart_submit again with this exact cartId; it cannot create a second operation. Do not build a different cart.';
const REJECTED_NOTE = 'The independent checker rejected this cart and reserved nothing. Build a different cart if another option could work; otherwise stop and explain.';
const REFUSED_NOTE = 'The backend refused this proposal in a way a different cart cannot fix. Stop shopping and report it.';
const ACCEPTED_NOTE = 'Reservation only. This is not payment, an order or delivery, and the backend revalidates before executing.';

/**
 * Session over a proposal port. Mandate and snapshot must come from the trusted
 * backend, never from model output. Proposal-port failures and timeouts become
 * `unknown`, which holds the cart: the session cannot move on from a submission
 * that may have reserved funds.
 */
export function createShoppingSession(
  rawInput: unknown,
  ports: { catalogs: CatalogSource; proposals: ProposalPort },
): ShoppingSession {
  const { mandate, snapshot, runId, maxToolCalls, catalogTimeoutMs, submitTimeoutMs, maxCarts } = SessionInputSchema.parse(rawInput);

  async function boundedSubmit(cart: CartSubmission): Promise<ProposalOutcome> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        ports.proposals.submit(cart),
        new Promise<ProposalOutcome>((resolve) => {
          timer = setTimeout(() => resolve({ kind: 'unknown' }), submitTimeoutMs);
        }),
      ]);
    } catch {
      return { kind: 'unknown' };
    } finally {
      clearTimeout(timer);
    }
  }

  return createSession({
    mandate, snapshot, runId, maxToolCalls, catalogTimeoutMs, maxCarts,
    async submit(cart) {
      const outcome = await boundedSubmit(cart);
      switch (outcome.kind) {
        case 'accepted':
          return { kind: 'proposal-accepted', simulation: true, cart, operation: outcome.operation, note: ACCEPTED_NOTE };
        case 'rejected':
          return {
            kind: 'proposal-rejected', simulation: true, cart, code: outcome.code,
            message: outcome.message, checkCodes: outcome.checkCodes, note: REJECTED_NOTE,
          };
        case 'refused':
          return { kind: 'proposal-refused', simulation: true, cart, code: outcome.code, message: outcome.message, note: REFUSED_NOTE };
        case 'unknown':
          return { kind: 'proposal-outcome-unknown', simulation: true, cart, note: UNKNOWN_NOTE };
      }
    },
  }, ports.catalogs);
}
