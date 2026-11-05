import { z } from 'zod';
import {
  CartSubmissionSchema, CatalogSchema, MandateSchema,
  type CartSubmission, type Catalog, type EligibilityResult,
} from '../../../packages/contracts/src/index.ts';
import type { CatalogSource } from '../../suppliers/src/catalog.ts';

const id = MandateSchema.shape.id;
const selection = { supplierId: id, requirementId: id };

/** The complete model-facing surface. No envelope permits caller authority or URLs. */
export const ShoppingToolCallSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('catalog.search'),
    args: z.object({ ...selection, limit: z.number().int().min(1).max(25).default(10) }).strict(),
  }).strict(),
  z.object({
    tool: z.literal('product.view'),
    args: z.object({ ...selection, sku: id }).strict(),
  }).strict(),
  z.object({
    tool: z.literal('cart.build'),
    args: CartSubmissionSchema.pick({ supplierId: true, lines: true }),
  }).strict(),
  z.object({
    tool: z.literal('cart.submit'),
    args: z.object({ cartId: id }).strict(),
  }).strict(),
]);

const SessionInputSchema = z.object({
  mandate: MandateSchema,
  runId: z.string().trim().min(1).max(100),
  now: z.iso.datetime({ offset: true }),
  maxToolCalls: z.number().int().min(1).max(100).default(24),
  catalogTimeoutMs: z.number().int().min(1).max(10_000).default(1_000),
}).strict();

export type ShoppingToolErrorCode =
  | 'INVALID_TOOL_CALL' | 'TOOL_LIMIT' | 'TOOL_BUSY' | 'SESSION_COMPLETE'
  | 'SUPPLIER_NOT_ALLOWED' | 'REQUIREMENT_NOT_FOUND' | 'SKU_NOT_ALLOWED'
  | 'SKU_UNAVAILABLE' | 'QUANTITY_EXCEEDED' | 'CATALOG_UNAVAILABLE'
  | 'INVALID_CATALOG' | 'CATALOG_TIMEOUT' | 'CART_NOT_FOUND';

export class ShoppingToolError extends Error {
  readonly code: ShoppingToolErrorCode;

  constructor(code: ShoppingToolErrorCode, message: string) {
    super(message);
    this.name = 'ShoppingToolError';
    this.code = code;
  }
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

export type ShoppingToolOutput =
  | { tool: 'catalog.search'; facts: CatalogFacts; requirementId: string; products: Catalog['products'] }
  | { tool: 'product.view'; facts: CatalogFacts; requirementId: string; product: Catalog['products'][number] }
  | { tool: 'cart.build'; cart: CartSubmission }
  | { tool: 'cart.submit'; submission: OfflineSubmission };

function catalogFacts(catalog: Catalog): CatalogFacts {
  const { supplierId, shippingMinor, taxRateBasisPoints, deliveryLocationId, delivery } = catalog;
  return { supplierId, currency: 'SGD', shippingMinor, taxRateBasisPoints, deliveryLocationId, delivery };
}

/**
 * Offline, single-cart rehearsal of the future worker's tools. The configured
 * mandate is fixture context, not authenticated authority. Nothing here quotes,
 * reserves, orders, pays, or calls the checker/backend.
 */
export function createOfflineShoppingSession(
  rawInput: unknown,
  catalogs: CatalogSource,
) {
  const { mandate, runId, now, maxToolCalls, catalogTimeoutMs } = SessionInputSchema.parse(rawInput);
  let usedCalls = 0;
  let busy = false;
  let cartRevision = 0;
  let cart: CartSubmission | undefined;
  let submitted: OfflineSubmission | undefined;

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

  async function handle(call: z.infer<typeof ShoppingToolCallSchema>): Promise<ShoppingToolOutput> {
    if (submitted) {
      if (call.tool === 'cart.submit' && call.args.cartId === submitted.cart.id) {
        return { tool: 'cart.submit', submission: submitted };
      }
      throw new ShoppingToolError('SESSION_COMPLETE', 'This offline session already submitted its cart');
    }
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
        requireSupplier(call.args.supplierId);
        const quantities = new Map<string, number>();
        for (const line of call.args.lines) {
          const requirement = requireRequirement(line.requirementId);
          if (!requirement.allowedSkus.includes(line.sku)) {
            throw new ShoppingToolError('SKU_NOT_ALLOWED', 'SKU is outside the configured requirement');
          }
          const total = (quantities.get(requirement.id) ?? 0) + line.quantity;
          if (total > requirement.quantity) {
            throw new ShoppingToolError('QUANTITY_EXCEEDED', 'Cart exceeds the configured requirement quantity');
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
        return { tool: call.tool, cart };
      }
      case 'cart.submit': {
        if (!cart || cart.id !== call.args.cartId) {
          throw new ShoppingToolError('CART_NOT_FOUND', 'Submit requires the current cart.build identity');
        }
        submitted = {
          kind: 'offline-eligibility-stub', simulation: true, cart,
          eligibility: {
            cartId: cart.id, quoteId: 'offline-stub-no-quote', evaluatedAt: now,
            decision: 'eligible', totalMinor: 0, remainingBeforeMinor: 0,
            checks: [{ code: 'OFFLINE_STUB', status: 'unknown', message: 'No policy, quote, budget or evidence evaluation was performed' }],
          },
          warning: 'Stub only: eligible and zero amounts are placeholders. No eligibility established, funds reserved, payment, order or readiness confirmed.',
        };
        return { tool: call.tool, submission: submitted };
      }
    }
  }

  return {
    /** Host-provided planning context, excluding descriptive confirmation metadata. */
    getContext() {
      const { id, version, currency, budgetMinor, purchaseBy, readyBy, deliveryLocationId, allowedSuppliers, requirements } = mandate;
      return structuredClone({
        simulation: true as const, mandateId: id, mandateVersion: version,
        currency, budgetMinor, purchaseBy, readyBy, deliveryLocationId, allowedSuppliers, requirements,
      });
    },
    getUsage() { return { usedCalls, maxToolCalls, submitted: submitted !== undefined }; },
    async dispatch(rawCall: unknown): Promise<ShoppingToolOutput> {
      if (usedCalls >= maxToolCalls) throw new ShoppingToolError('TOOL_LIMIT', 'Offline tool-call limit exhausted');
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
