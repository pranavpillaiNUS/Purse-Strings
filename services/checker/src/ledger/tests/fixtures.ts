import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CatalogSchema,
  MandateSchema,
  PolicySchema,
  type Catalog,
  type Mandate,
  type Policy,
} from '../../../../../packages/contracts/src/index.ts';
import { createFixtureSupplier } from '../../../../../services/suppliers/src/fixture.ts';
import type { SupplierAdapter } from '../../../../../services/suppliers/src/adapter.ts';

export const TEST_CLOCK = '2026-11-04T09:00:00.000Z';

const RAW_CATALOG = JSON.parse(readFileSync(
  new URL('../../../../../services/suppliers/fixtures/store-a.json', import.meta.url), 'utf8',
)) as unknown;

export const TEST_CATALOG: Catalog = CatalogSchema.parse(RAW_CATALOG);

export const TEST_POLICY: Policy = PolicySchema.parse({
  id: 'hardware-policy',
  version: 1,
  currency: 'SGD',
  maxBudgetMinor: 900000,
  allowedSuppliers: ['store-a'],
  evidenceMaxAgeHours: 48,
  roles: {
    laptop: { allowedSkus: ['LAP-14-AIR'], maxUnitPriceMinor: 120000, minWarrantyMonths: 24, maxUnits: 10 },
    monitor: { allowedSkus: ['MON-27-USBC'], maxUnitPriceMinor: 30000, minWarrantyMonths: 24, maxUnits: 10 },
  },
});

export const TEST_MANDATE_DRAFT = {
  id: 'engineering-hires-november',
  version: 1,
  policyId: 'hardware-policy',
  policyVersion: 1,
  currency: 'SGD',
  budgetMinor: 800000,
  purchaseBy: '2026-11-05T10:00:00Z',
  readyBy: '2026-11-19T09:00:00Z',
  deliveryLocationId: 'singapore-office',
  allowedSuppliers: ['store-a'],
  requirements: [
    { id: 'engineering-laptops', role: 'laptop', quantity: 5, allowedSkus: ['LAP-14-AIR'], maxUnitPriceMinor: 120000, minWarrantyMonths: 24 },
    { id: 'engineering-monitors', role: 'monitor', quantity: 5, allowedSkus: ['MON-27-USBC'], maxUnitPriceMinor: 30000, minWarrantyMonths: 24 },
  ],
};

export const TEST_CART = {
  id: 'laptop-cart-a',
  mandateId: 'engineering-hires-november',
  mandateVersion: 1,
  supplierId: 'store-a',
  lines: [
    { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 3 },
  ],
};

/** The example cart total under the fixture catalog (3 laptops, taxable shipping 0). */
export const TEST_CART_TOTAL_MINOR = 359373;

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `splittap-${prefix}-`));
}

export function removeTempDir(directory: string): void {
  // Windows can briefly retain a file handle after the child has closed.
  // Retry transient EPERM/EBUSY cleanup errors; persistent failures still fail.
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export function fixtureAdapter(catalog: Catalog = TEST_CATALOG): SupplierAdapter {
  return createFixtureSupplier(catalog);
}

export function asConfirmedMandate(draft: typeof TEST_MANDATE_DRAFT, approvedBy: string, confirmedAt: string): Mandate {
  return MandateSchema.parse({ ...draft, approvedBy, confirmedAt });
}

export interface SupplierCallCounter extends SupplierAdapter {
  calls: number;
  failAfterCall: number | null;
}

export function countingAdapter(catalog: Catalog = TEST_CATALOG): SupplierCallCounter {
  const inner = createFixtureSupplier(catalog);
  const counter: SupplierCallCounter = {
    calls: 0,
    failAfterCall: null,
    async quoteCart(cart, now) {
      counter.calls += 1;
      if (counter.failAfterCall !== null && counter.calls > counter.failAfterCall) {
        throw new Error('simulated supplier outage');
      }
      return inner.quoteCart(cart, now);
    },
  };
  return counter;
}
