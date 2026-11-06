import { CatalogSchema, MAX_AMOUNT_MINOR } from '../../../packages/contracts/src/index.ts';
import type { Catalog } from '../../../packages/contracts/src/index.ts';

/** Catalog reads only; this surface has no quote, reservation, order or payment operations. */
export interface CatalogSource {
  getCatalog(supplierId: string): Promise<unknown>;
}

const FixtureCatalogsSchema = CatalogSchema.array().max(100)
  .refine((catalogs) => new Set(catalogs.map(({ supplierId }) => supplierId)).size === catalogs.length,
    'Supplier IDs must be unique');

/** Snapshot configured synthetic catalogs without accessing files or the network. */
export function createFixtureCatalogSource(rawCatalogs: unknown): CatalogSource {
  const catalogs = new Map(FixtureCatalogsSchema.parse(rawCatalogs)
    .map((catalog) => [catalog.supplierId, catalog] as const));

  return {
    async getCatalog(supplierId) {
      const id = CatalogSchema.shape.supplierId.parse(supplierId);
      const catalog = catalogs.get(id);
      if (!catalog) throw new Error('Supplier unavailable in fixture catalog source');
      return structuredClone(catalog);
    },
  };
}

export interface CartCosts {
  itemsMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Integer cart arithmetic shared by fixture quotes and non-authoritative shopper
 * estimates, so the two cannot drift. Returns null for an unknown SKU or when the
 * pre-tax amount exceeds the supported range.
 *
 * Fixture convention: shipping is taxable, half-up to one cent. This is not a
 * production tax engine. Quotations own their authoritative tax amounts.
 */
export function cartCosts(
  catalog: Pick<Catalog, 'products' | 'shippingMinor' | 'taxRateBasisPoints'>,
  lines: ReadonlyArray<{ sku: string; quantity: number }>,
): CartCosts | null {
  let itemsMinor = 0;
  for (const line of lines) {
    const product = catalog.products.find(({ sku }) => sku === line.sku);
    if (!product) return null;
    itemsMinor += product.unitPriceMinor * line.quantity;
  }
  const taxable = itemsMinor + catalog.shippingMinor;
  if (taxable > MAX_AMOUNT_MINOR) return null;
  const taxMinor = Math.floor((taxable * catalog.taxRateBasisPoints + 5000) / 10000);
  return { itemsMinor, shippingMinor: catalog.shippingMinor, taxMinor, totalMinor: taxable + taxMinor };
}
