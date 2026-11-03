import type { CartSubmission, Quote } from '../../../packages/contracts/src/index.ts';

/** Implementations resolve authoritative quotes; the agent never supplies prices. */
export interface SupplierAdapter {
  quoteCart(cart: CartSubmission, now: string): Promise<Quote>;
}

// Inventory reservation, idempotent order commit and order-status lookup are M3
// requirements. Do not expose placeholder methods that pretend orders were placed.
