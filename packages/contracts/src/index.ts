import { z } from 'zod';

const id = z.string().trim().min(1).max(200);
const timestamp = z.iso.datetime({ offset: true });
// Bounded business inputs keep aggregate arithmetic well within Number's safe range.
export const MAX_AMOUNT_MINOR = 1_000_000_000;
const amount = z.number().int().min(0).max(MAX_AMOUNT_MINOR);
const units = z.number().int().min(0).max(1000);
const role = z.enum(['laptop', 'monitor']);
const currency = z.literal('SGD');

function uniqueBy<T>(items: T[], key: (item: T) => string): boolean {
  return new Set(items.map(key)).size === items.length;
}

export const EvidenceSchema = z.object({
  status: z.enum(['supported', 'partial', 'unknown']),
  source: id,
  observedAt: timestamp,
}).strict();

const RolePolicySchema = z.object({
  allowedSkus: z.array(id).min(1).max(100),
  maxUnitPriceMinor: amount,
  minWarrantyMonths: z.number().int().min(0).max(120),
  maxUnits: units,
}).strict();

export const PolicySchema = z.object({
  id,
  version: z.number().int().positive(),
  currency,
  maxBudgetMinor: amount,
  allowedSuppliers: z.array(id).min(1).max(100),
  evidenceMaxAgeHours: z.number().int().min(1).max(168),
  roles: z.object({ laptop: RolePolicySchema, monitor: RolePolicySchema }).strict(),
}).strict();

const RequirementSchema = z.object({
  id,
  role,
  quantity: units.positive(),
  allowedSkus: z.array(id).min(1).max(100),
  maxUnitPriceMinor: amount,
  minWarrantyMonths: z.number().int().min(0).max(120),
}).strict();

export const MandateSchema = z.object({
  id,
  version: z.number().int().positive(),
  policyId: id,
  policyVersion: z.number().int().positive(),
  currency,
  budgetMinor: amount,
  purchaseBy: timestamp,
  readyBy: timestamp,
  deliveryLocationId: id,
  approvedBy: id,
  confirmedAt: timestamp,
  allowedSuppliers: z.array(id).min(1).max(100),
  requirements: z.array(RequirementSchema).min(1).max(100)
    .refine((items) => uniqueBy(items, (item) => item.id), 'Requirement IDs must be unique'),
}).strict();

export const CartSubmissionSchema = z.object({
  id,
  mandateId: id,
  mandateVersion: z.number().int().positive(),
  supplierId: id,
  lines: z.array(z.object({
    requirementId: id,
    sku: id,
    quantity: units.positive(),
  }).strict()).min(1).max(100)
    .refine((items) => uniqueBy(items, (item) => item.sku), 'Combine duplicate SKUs into one cart line'),
}).strict();

export const QuoteLineSchema = z.object({
  sku: id,
  quantity: units.positive(),
  unitPriceMinor: amount,
  warrantyMonths: z.number().int().min(0).max(120),
  productEvidence: EvidenceSchema,
  availableUnits: units,
  stockEvidence: EvidenceSchema,
}).strict();

export const QuoteSchema = z.object({
  id,
  cartId: id,
  supplierId: id,
  currency,
  deliveryLocationId: id,
  createdAt: timestamp,
  expiresAt: timestamp,
  lines: z.array(QuoteLineSchema).min(1).max(100)
    .refine((items) => uniqueBy(items, (item) => item.sku), 'Quote SKUs must be unique'),
  shippingMinor: amount,
  taxMinor: amount,
  totalMinor: amount,
  delivery: z.object({ by: timestamp, evidence: EvidenceSchema }).strict(),
}).strict();

export const BudgetSnapshotSchema = z.object({
  mandateId: id,
  mandateVersion: z.number().int().positive(),
  currency,
  committedMinor: amount,
  reservedMinor: amount,
  quantities: z.array(z.object({
    requirementId: id,
    committed: units,
    reserved: units,
  }).strict()).max(100)
    .refine((items) => uniqueBy(items, (item) => item.requirementId), 'Snapshot requirement IDs must be unique'),
}).strict();

export const EvaluationInputSchema = z.object({
  policy: PolicySchema,
  mandate: MandateSchema,
  submission: CartSubmissionSchema,
  quote: QuoteSchema,
  snapshot: BudgetSnapshotSchema,
  now: timestamp,
}).strict();

export const CatalogSchema = z.object({
  supplierId: id,
  shippingMinor: amount,
  taxRateBasisPoints: z.number().int().min(0).max(10000),
  deliveryLocationId: id,
  delivery: z.object({ by: timestamp, evidence: EvidenceSchema }).strict(),
  products: z.array(QuoteLineSchema.omit({ quantity: true })).min(1).max(100)
    .refine((items) => uniqueBy(items, (item) => item.sku), 'Catalog SKUs must be unique'),
}).strict();

export type Policy = z.infer<typeof PolicySchema>;
export type Mandate = z.infer<typeof MandateSchema>;
export type CartSubmission = z.infer<typeof CartSubmissionSchema>;
export type Quote = z.infer<typeof QuoteSchema>;
export type BudgetSnapshot = z.infer<typeof BudgetSnapshotSchema>;
export type EvaluationInput = z.infer<typeof EvaluationInputSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;

export interface Check {
  code: string;
  status: 'pass' | 'fail' | 'unknown';
  message: string;
}

export interface EligibilityResult {
  cartId: string;
  quoteId: string;
  evaluatedAt: string;
  decision: 'eligible' | 'blocked' | 'needs_review';
  totalMinor: number;
  remainingBeforeMinor: number;
  checks: Check[];
}
