import { z } from 'zod';
import {
  BudgetSnapshotSchema,
  CatalogSchema,
  CartSubmissionSchema,
  MandateSchema,
  MAX_AMOUNT_MINOR,
} from './index.ts';

const id = MandateSchema.shape.id;
const mandateVersion = z.number().int().positive();

export const BackendMethodSchema = z.enum([
  'mandate.get',
  'catalog.list',
  'proposal.submit',
  'operation.get',
]);

export type BackendMethod = z.infer<typeof BackendMethodSchema>;

const MandateGetRequestSchema = z.object({
  apiVersion: z.literal('1'),
  requestId: id,
  method: z.literal('mandate.get'),
  params: z.object({ mandateId: id }).strict(),
}).strict();

const CatalogListRequestSchema = z.object({
  apiVersion: z.literal('1'),
  requestId: id,
  method: z.literal('catalog.list'),
  params: z.object({
    mandateId: id,
    mandateVersion,
    supplierId: id,
  }).strict(),
}).strict();

const ProposalSubmitRequestSchema = z.object({
  apiVersion: z.literal('1'),
  requestId: id,
  method: z.literal('proposal.submit'),
  params: z.object({
    idempotencyKey: id,
    cart: CartSubmissionSchema,
  }).strict(),
}).strict();

const OperationGetRequestSchema = z.object({
  apiVersion: z.literal('1'),
  requestId: id,
  method: z.literal('operation.get'),
  params: z.object({
    mandateId: id,
    mandateVersion,
    operationId: id,
  }).strict(),
}).strict();

export const BackendRequestSchema = z.discriminatedUnion('method', [
  MandateGetRequestSchema,
  CatalogListRequestSchema,
  ProposalSubmitRequestSchema,
  OperationGetRequestSchema,
]);

export type BackendRequest = z.infer<typeof BackendRequestSchema>;

export const OperationStatusSchema = z.enum([
  'reserved',
  'running',
  'reconciliation_required',
  'ordered',
  'failed',
  'compensation_pending',
  'compensated',
]);

export const ReservationStatusSchema = z.enum(['active', 'consumed', 'released']);

export const EffectStatusSchema = z.enum([
  'not_started',
  'intent',
  'in_flight',
  'unknown',
  'succeeded',
  'rejected',
]);

export const ReadinessStatusSchema = z.literal('not_assessed');

export const PaymentProviderSchema = z.enum(['fake', 'paypal-sandbox']);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export const OperationSchema = z.object({
  id,
  mandateId: id,
  mandateVersion,
  cartId: id,
  supplierId: id,
  status: OperationStatusSchema,
  currency: z.literal('SGD'),
  totalMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  reservationStatus: ReservationStatusSchema,
  paymentStatus: EffectStatusSchema,
  /** Backend-owned execution route. Older responses may omit it; absence is unknown. */
  paymentProvider: PaymentProviderSchema.optional(),
  orderStatus: EffectStatusSchema,
  refundStatus: EffectStatusSchema,
  readinessStatus: ReadinessStatusSchema,
}).strict();

export type Operation = z.infer<typeof OperationSchema>;

export const MandateGetResultSchema = z.object({
  mandate: MandateSchema,
  snapshot: BudgetSnapshotSchema,
}).strict();

export const CatalogListResultSchema = z.object({
  mandateId: id,
  mandateVersion,
  catalog: CatalogSchema,
}).strict();

export const ProposalSubmitResultSchema = z.object({
  operation: OperationSchema,
}).strict();

export const OperationGetResultSchema = z.object({
  operation: OperationSchema,
}).strict();

const SuccessBase = {
  apiVersion: z.literal('1'),
  requestId: id,
  simulation: z.literal(true),
  ok: z.literal(true),
} as const;

export const BackendSuccessResponseSchema = z.discriminatedUnion('method', [
  z.object({ ...SuccessBase, method: z.literal('mandate.get'), result: MandateGetResultSchema }).strict(),
  z.object({ ...SuccessBase, method: z.literal('catalog.list'), result: CatalogListResultSchema }).strict(),
  z.object({ ...SuccessBase, method: z.literal('proposal.submit'), result: ProposalSubmitResultSchema }).strict(),
  z.object({ ...SuccessBase, method: z.literal('operation.get'), result: OperationGetResultSchema }).strict(),
]);

export const BackendErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'UNSUPPORTED_VERSION',
  'NOT_FOUND',
  'MANDATE_NOT_CONFIRMED',
  'MANDATE_REVISION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'BUDGET_EXCEEDED',
  'QUANTITY_EXCEEDED',
  'QUOTE_EXPIRED',
  'MANDATORY_EVIDENCE_UNKNOWN',
  'INELIGIBLE',
  'SUPPLIER_UNAVAILABLE',
  'BUSY',
  'INTERNAL_ERROR',
]);

export const BackendErrorResponseSchema = z.object({
  apiVersion: z.literal('1'),
  requestId: id.nullable(),
  method: BackendMethodSchema.nullable(),
  simulation: z.literal(true),
  ok: z.literal(false),
  error: z.object({
    code: BackendErrorCodeSchema,
    message: z.string().max(500),
    details: z.object({
      checkCodes: z.array(z.string().max(250)).max(1000),
    }).strict(),
  }).strict(),
}).strict();

export const BackendResponseSchema = z.union([
  BackendSuccessResponseSchema,
  BackendErrorResponseSchema,
]);

export type BackendResponse = z.infer<typeof BackendResponseSchema>;
export type BackendErrorCode = z.infer<typeof BackendErrorCodeSchema>;
