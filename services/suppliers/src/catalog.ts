import { CatalogSchema } from '../../../packages/contracts/src/index.ts';

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
