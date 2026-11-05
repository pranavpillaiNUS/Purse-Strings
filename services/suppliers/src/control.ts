import { createHash } from 'node:crypto';
import { CatalogSchema, EvidenceSchema } from '../../../packages/contracts/src/index.ts';
import type { Catalog } from '../../../packages/contracts/src/index.ts';

const ProductChangesSchema = CatalogSchema.shape.products.element
  .pick({ sku: true, unitPriceMinor: true, availableUnits: true })
  .partial({ unitPriceMinor: true, availableUnits: true })
  .extend({
    productEvidenceStatus: EvidenceSchema.shape.status.optional(),
    stockEvidenceStatus: EvidenceSchema.shape.status.optional(),
  })
  .strict()
  .refine((change) => Object.entries(change).some(([key, value]) => key !== 'sku' && value !== undefined),
    'Supply at least one product change');

/** Local simulation controls, deliberately separate from shared purchasing contracts. */
export const FixtureChangesSchema = CatalogSchema.pick({ shippingMinor: true })
  .partial()
  .extend({
    deliveryBy: CatalogSchema.shape.delivery.shape.by.optional(),
    deliveryEvidenceStatus: EvidenceSchema.shape.status.optional(),
    product: ProductChangesSchema.optional(),
  })
  .strict()
  .refine((change) => Object.values(change).some((value) => value !== undefined),
    'Supply at least one catalog change');

function controlSource(path: string): string {
  // Supplier and SKU IDs can each be 200 characters; evidence sources share that limit.
  return path.length <= 200 ? path : `fixture:control/${createHash('sha256').update(path).digest('hex')}`;
}

/**
 * Change synthetic supplier observations without mutating the seed or input.
 * The explicit clock is for offline scenarios, never execution authority.
 */
export function applyFixtureChanges(rawCatalog: unknown, rawChanges: unknown, now: string): Catalog {
  const catalog = CatalogSchema.parse(rawCatalog);
  const changes = FixtureChangesSchema.parse(rawChanges);
  const observedAt = EvidenceSchema.shape.observedAt.parse(now);
  const source = `fixture:control/${catalog.supplierId}`;

  if (changes.shippingMinor !== undefined) catalog.shippingMinor = changes.shippingMinor;
  if (changes.deliveryBy !== undefined || changes.deliveryEvidenceStatus !== undefined) {
    if (changes.deliveryBy !== undefined) catalog.delivery.by = changes.deliveryBy;
    catalog.delivery.evidence = {
      status: changes.deliveryEvidenceStatus ?? catalog.delivery.evidence.status,
      source: controlSource(`${source}/delivery`),
      observedAt,
    };
  }

  if (changes.product) {
    const change = changes.product;
    const product = catalog.products.find((item) => item.sku === change.sku);
    if (!product) throw new Error(`SKU unavailable in fixture catalog: ${change.sku}`);
    if (change.unitPriceMinor !== undefined) product.unitPriceMinor = change.unitPriceMinor;
    // Product evidence covers product and warranty facts, which a price edit does not
    // re-observe. Quote timing governs price freshness. Only an explicit status refreshes it.
    if (change.productEvidenceStatus !== undefined) {
      product.productEvidence = {
        status: change.productEvidenceStatus,
        source: controlSource(`${source}/${product.sku}/product`),
        observedAt,
      };
    }
    if (change.availableUnits !== undefined || change.stockEvidenceStatus !== undefined) {
      if (change.availableUnits !== undefined) product.availableUnits = change.availableUnits;
      product.stockEvidence = {
        status: change.stockEvidenceStatus ?? product.stockEvidence.status,
        source: controlSource(`${source}/${product.sku}/stock`),
        observedAt,
      };
    }
  }

  return CatalogSchema.parse(catalog);
}
