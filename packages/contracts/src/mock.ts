import { z } from 'zod';
import {
  BackendMethodSchema,
  BackendRequestSchema,
  BackendResponseSchema,
  CatalogListResultSchema,
  MandateGetResultSchema,
  OperationGetResultSchema,
  OperationSchema,
  ProposalSubmitResultSchema,
  type BackendErrorCode,
  type BackendMethod,
  type BackendRequest,
  type BackendResponse,
  type Operation,
} from './backend.ts';
import {
  CatalogSchema,
  MandateSchema,
  MAX_AMOUNT_MINOR,
  type Catalog,
  type CartSubmission,
  type Mandate,
} from './index.ts';

const MockInputSchema = z.object({
  mandates: z.array(MandateSchema).max(100),
  catalogs: z.array(CatalogSchema).max(100),
}).strict().superRefine(({ mandates, catalogs }, context) => {
  if (new Set(mandates.map(({ id }) => id)).size !== mandates.length) {
    context.addIssue({ code: 'custom', message: 'Mandate IDs must be unique', path: ['mandates'] });
  }
  if (new Set(catalogs.map(({ supplierId }) => supplierId)).size !== catalogs.length) {
    context.addIssue({ code: 'custom', message: 'Supplier IDs must be unique', path: ['catalogs'] });
  }
});

type MockInput = z.input<typeof MockInputSchema>;

type StoredOperation = {
  operation: Operation;
  canonicalCart: string;
};

const SIMULATION_TIME = '2026-11-04T00:00:00.000Z';

function identityKey(...parts: string[]): string {
  return JSON.stringify(parts);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => compareText(left, right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function canonicalCart(cart: CartSubmission): string {
  return canonicalize({
    ...cart,
    lines: [...cart.lines].sort((left, right) =>
      compareText(left.requirementId, right.requirementId) || compareText(left.sku, right.sku)),
  });
}

function errorResponse(
  requestId: string | null,
  method: BackendMethod | null,
  code: BackendErrorCode,
  message: string,
  checkCodes: string[] = [],
): BackendResponse {
  return BackendResponseSchema.parse({
    apiVersion: '1',
    requestId,
    method,
    simulation: true,
    ok: false,
    error: { code, message: message.slice(0, 500), details: { checkCodes: checkCodes.slice(0, 1000) } },
  });
}

function correlationFields(input: unknown): { requestId: string | null; method: BackendMethod | null } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { requestId: null, method: null };
  }
  const parsedFields = z.record(z.string(), z.unknown()).safeParse(input);
  if (!parsedFields.success) return { requestId: null, method: null };
  const fields = parsedFields.data;
  const parsedId = z.string().trim().min(1).max(200).safeParse(fields.requestId);
  const parsedMethod = BackendMethodSchema.safeParse(fields.method);
  return {
    requestId: parsedId.success ? parsedId.data : null,
    method: parsedMethod.success ? parsedMethod.data : null,
  };
}

function requestError(input: unknown): BackendResponse | null {
  const parsed = BackendRequestSchema.safeParse(input);
  if (parsed.success) return null;

  const { requestId, method } = correlationFields(input);
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    const fields = z.record(z.string(), z.unknown()).safeParse(input);
    const apiVersion = fields.success ? fields.data.apiVersion : undefined;
    if (typeof apiVersion === 'string' && apiVersion !== '1') {
      return errorResponse(requestId, method, 'UNSUPPORTED_VERSION', 'API version is not supported');
    }
  }
  return errorResponse(requestId, method, 'INVALID_REQUEST', 'Request did not match the v1 contract');
}

function projectedTotal(cart: CartSubmission, catalog: Catalog): number | null {
  let subtotal = 0n;
  const products = new Map(catalog.products.map((product) => [product.sku, product]));
  for (const line of cart.lines) {
    const product = products.get(line.sku);
    if (!product) return null;
    subtotal += BigInt(product.unitPriceMinor) * BigInt(line.quantity);
  }
  const taxable = subtotal + BigInt(catalog.shippingMinor);
  const tax = (taxable * BigInt(catalog.taxRateBasisPoints) + 5_000n) / 10_000n;
  const total = subtotal + BigInt(catalog.shippingMinor) + tax;
  return total <= BigInt(MAX_AMOUNT_MINOR) ? Number(total) : null;
}

export function createMockBackend(input: MockInput) {
  const parsedInput = MockInputSchema.parse(input);
  const mandates = new Map<string, Mandate>(parsedInput.mandates.map((mandate) => [mandate.id, mandate]));
  const catalogs = new Map<string, Catalog>(parsedInput.catalogs.map((catalog) => [catalog.supplierId, catalog]));
  const operations = new Map<string, StoredOperation>();
  const cartIdentities = new Map<string, string>();
  const idempotencyAliases = new Map<string, string>();
  let nextOperationId = 1;

  function findMandate(mandateId: string): Mandate | undefined {
    return mandates.get(mandateId);
  }

  function handleValidRequest(request: BackendRequest): BackendResponse {
    switch (request.method) {
      case 'mandate.get': {
        const mandate = findMandate(request.params.mandateId);
        if (!mandate) return errorResponse(request.requestId, request.method, 'NOT_FOUND', 'Mandate was not found');
        const result = MandateGetResultSchema.parse({
          mandate,
          snapshot: {
            mandateId: mandate.id,
            mandateVersion: mandate.version,
            currency: mandate.currency,
            committedMinor: 0,
            reservedMinor: 0,
            quantities: mandate.requirements.map(({ id }) => ({ requirementId: id, committed: 0, reserved: 0 })),
          },
        });
        return BackendResponseSchema.parse({
          apiVersion: '1', requestId: request.requestId, method: request.method,
          simulation: true, ok: true, result,
        });
      }
      case 'catalog.list': {
        const mandate = findMandate(request.params.mandateId);
        if (!mandate) return errorResponse(request.requestId, request.method, 'NOT_FOUND', 'Mandate was not found');
        if (mandate.version !== request.params.mandateVersion) {
          return errorResponse(request.requestId, request.method, 'MANDATE_REVISION_CONFLICT', 'Mandate version is not current');
        }
        const catalog = catalogs.get(request.params.supplierId);
        if (!catalog || !mandate.allowedSuppliers.includes(request.params.supplierId)) {
          return errorResponse(request.requestId, request.method, 'SUPPLIER_UNAVAILABLE', 'Approved supplier catalog was not found');
        }
        const result = CatalogListResultSchema.parse({
          mandateId: mandate.id,
          mandateVersion: mandate.version,
          catalog,
        });
        return BackendResponseSchema.parse({
          apiVersion: '1', requestId: request.requestId, method: request.method,
          simulation: true, ok: true, result,
        });
      }
      case 'proposal.submit':
        return submitProposal(request);
      case 'operation.get': {
        const stored = operations.get(request.params.operationId);
        if (!stored || stored.operation.mandateId !== request.params.mandateId ||
            stored.operation.mandateVersion !== request.params.mandateVersion) {
          return errorResponse(request.requestId, request.method, 'NOT_FOUND', 'Operation was not found');
        }
        const result = OperationGetResultSchema.parse({ operation: stored.operation });
        return BackendResponseSchema.parse({
          apiVersion: '1', requestId: request.requestId, method: request.method,
          simulation: true, ok: true, result,
        });
      }
      default: {
        const exhaustive: never = request;
        return exhaustive;
      }
    }
  }

  function submitProposal(request: Extract<BackendRequest, { method: 'proposal.submit' }>): BackendResponse {
    const { cart, idempotencyKey } = request.params;
    const canonical = canonicalCart(cart);
    const cartKey = identityKey(cart.mandateId, cart.id);
    const aliasKey = identityKey(cart.mandateId, idempotencyKey);
    const cartOperationId = cartIdentities.get(cartKey);
    const aliasOperationId = idempotencyAliases.get(aliasKey);

    if (cartOperationId && aliasOperationId && cartOperationId !== aliasOperationId) {
      return errorResponse(request.requestId, request.method, 'IDEMPOTENCY_CONFLICT', 'Cart and key identify different operations');
    }
    const existingId = cartOperationId ?? aliasOperationId;
    if (existingId) {
      const existing = operations.get(existingId);
      if (!existing || existing.canonicalCart !== canonical) {
        return errorResponse(request.requestId, request.method, 'IDEMPOTENCY_CONFLICT', 'Cart identity was already used with different contents');
      }
      if (!aliasOperationId) idempotencyAliases.set(aliasKey, existingId);
      const result = ProposalSubmitResultSchema.parse({ operation: existing.operation });
      return BackendResponseSchema.parse({
        apiVersion: '1', requestId: request.requestId, method: request.method,
        simulation: true, ok: true, result,
      });
    }

    const mandate = findMandate(cart.mandateId);
    if (!mandate) return errorResponse(request.requestId, request.method, 'NOT_FOUND', 'Mandate was not found');
    if (mandate.version !== cart.mandateVersion) {
      return errorResponse(request.requestId, request.method, 'MANDATE_REVISION_CONFLICT', 'Mandate version is not current');
    }
    const catalog = catalogs.get(cart.supplierId);
    if (!catalog || !mandate.allowedSuppliers.includes(cart.supplierId)) {
      return errorResponse(request.requestId, request.method, 'SUPPLIER_UNAVAILABLE', 'Approved supplier catalog was not found');
    }
    const totalMinor = projectedTotal(cart, catalog);
    if (totalMinor === null) {
      return errorResponse(request.requestId, request.method, 'INELIGIBLE', 'Cart cannot be represented by the configured catalog', ['TOTAL_OUT_OF_RANGE_OR_UNKNOWN_SKU']);
    }

    const operation = OperationSchema.parse({
      id: `mock-operation-${nextOperationId}`,
      mandateId: cart.mandateId,
      mandateVersion: cart.mandateVersion,
      cartId: cart.id,
      supplierId: cart.supplierId,
      status: 'reserved',
      currency: mandate.currency,
      totalMinor,
      createdAt: SIMULATION_TIME,
      updatedAt: SIMULATION_TIME,
      reservationStatus: 'active',
      paymentStatus: 'not_started',
      orderStatus: 'not_started',
      refundStatus: 'not_started',
      readinessStatus: 'not_assessed',
    });
    nextOperationId += 1;
    operations.set(operation.id, { operation, canonicalCart: canonical });
    cartIdentities.set(cartKey, operation.id);
    idempotencyAliases.set(aliasKey, operation.id);
    const result = ProposalSubmitResultSchema.parse({ operation });
    return BackendResponseSchema.parse({
      apiVersion: '1', requestId: request.requestId, method: request.method,
      simulation: true, ok: true, result,
    });
  }

  return {
    async handle(inputRequest: unknown): Promise<BackendResponse> {
      const validationError = requestError(inputRequest);
      if (validationError) return validationError;
      const request = BackendRequestSchema.parse(inputRequest);
      const response = handleValidRequest(request);
      return BackendResponseSchema.parse(response);
    },
  };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
