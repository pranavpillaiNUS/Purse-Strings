import { createHash } from 'node:crypto';
import {
  CartSubmissionSchema, CatalogSchema, QuoteSchema, MAX_AMOUNT_MINOR,
} from '../../../packages/contracts/src/index.ts';
import type { SupplierAdapter } from './adapter.ts';

/** Synthetic quote adapter. No network, real inventory reservation or orders. */
export function createFixtureSupplier(rawCatalog: unknown): SupplierAdapter {
  const catalog = CatalogSchema.parse(rawCatalog);
  return {
    async quoteCart(rawCart, now) {
      const cart = CartSubmissionSchema.parse(rawCart);
      if (cart.supplierId !== catalog.supplierId) throw new Error('Supplier does not match catalog');
      const lines = cart.lines.map((line) => {
        const product = catalog.products.find((item) => item.sku === line.sku);
        if (!product) throw new Error(`SKU unavailable in fixture catalog: ${line.sku}`);
        return { ...product, quantity: line.quantity };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
      if (subtotal + catalog.shippingMinor > MAX_AMOUNT_MINOR) {
        throw new Error('Fixture quote exceeds supported amount limit');
      }
      // Fixture convention: shipping is taxable, half-up to one cent. This is not
      // a production tax engine. Quotations own their authoritative tax amounts.
      const taxMinor = Math.floor(((subtotal + catalog.shippingMinor) * catalog.taxRateBasisPoints + 5000) / 10000);
      const content = { cartId: cart.id, catalog, lines, now };
      return QuoteSchema.parse({
        id: `fixture-${createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 24)}`,
        cartId: cart.id,
        supplierId: catalog.supplierId,
        currency: 'SGD',
        deliveryLocationId: catalog.deliveryLocationId,
        createdAt: now,
        expiresAt: new Date(Date.parse(now) + 5 * 60_000).toISOString(),
        lines,
        shippingMinor: catalog.shippingMinor,
        taxMinor,
        totalMinor: subtotal + catalog.shippingMinor + taxMinor,
        delivery: catalog.delivery,
      });
    },
  };
}
