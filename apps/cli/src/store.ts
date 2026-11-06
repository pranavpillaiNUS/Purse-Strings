import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import {
  loadFixtureCatalog, resetFixtureCatalog, updateFixtureCatalog,
} from '../../../services/suppliers/src/control-files.ts';
import type { Catalog } from '../../../packages/contracts/src/index.ts';

const HELP = `Synthetic fixture-store controls (offline only)

Usage:
  npm run cli -- store reset --catalog working.json [--seed NAME] [--now ISO_TIMESTAMP] [--json]
  npm run cli -- store show --catalog working.json [--json]
  npm run cli -- store set --catalog working.json --now ISO_TIMESTAMP [--json]
    [--shipping-minor N] [--delivery-by ISO_TIMESTAMP]
    [--delivery-evidence supported|partial|unknown]
    [--sku SKU --price-minor N --stock N]
    [--product-evidence supported|partial|unknown]
    [--stock-evidence supported|partial|unknown]

set needs at least one change; product changes need --sku. Amounts are integer
SGD cents, stock is integer units. All set operations require an explicit clock.
Only changed evidence is re-observed; existing uncertainty stays until changed.
A price edit does not re-observe product evidence; use --product-evidence for that.
reset copies a dated bundled seed exactly: store-a (default), store-b, or
store-b-hostile (store-b with a prompt-injection listing). Add --now to re-date its
evidence for runs under the backend's real clock; status and source do not change.
The destination's parent directory must exist. Seed fixtures and existing
non-catalog files are protected.
Use check --catalog working.json --now ISO_TIMESTAMP to evaluate the new state.
Exit codes: 0 success; 1 invalid input/error. No orders or payments are made.
`;

function integerOption(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`--${name} must be a non-negative integer in decimal notation`);
  }
  return Number(value);
}

/** CLI parsing/output only; supplier simulation and persistence live in suppliers. */
export function runStore(args: string[]): void {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      catalog: { type: 'string' },
      now: { type: 'string' },
      seed: { type: 'string' },
      sku: { type: 'string' },
      'shipping-minor': { type: 'string' },
      'price-minor': { type: 'string' },
      stock: { type: 'string' },
      'delivery-by': { type: 'string' },
      'delivery-evidence': { type: 'string' },
      'product-evidence': { type: 'string' },
      'stock-evidence': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const action = positionals[0];
  if (positionals.length !== 1 || !['show', 'reset', 'set'].includes(action ?? '')) {
    throw new Error('Expected store show, reset or set. Use store --help.');
  }
  if (!values.catalog?.trim()) throw new Error('store requires --catalog with a working catalog path');
  if (action === 'show' && Object.entries(values).some(([key, value]) =>
    !['json', 'catalog'].includes(key) && value !== undefined)) {
    throw new Error('store show accepts only --catalog and --json');
  }
  if (action === 'reset' && Object.entries(values).some(([key, value]) =>
    !['json', 'catalog', 'seed', 'now'].includes(key) && value !== undefined)) {
    throw new Error('store reset accepts only --catalog, --seed, --now and --json');
  }
  if (action === 'set' && values.seed !== undefined) {
    throw new Error('store set does not accept --seed; use store reset');
  }

  let catalog: Catalog;
  if (action === 'show') catalog = loadFixtureCatalog(values.catalog);
  else if (action === 'reset') {
    catalog = resetFixtureCatalog(values.catalog, { seed: values.seed, now: values.now });
  } else {
    if (!values.now) throw new Error('store set requires --now ISO_TIMESTAMP for the offline observation clock');
    const hasProductChange = ['sku', 'price-minor', 'stock', 'product-evidence', 'stock-evidence']
      .some((key) => values[key as keyof typeof values] !== undefined);
    if (hasProductChange && !values.sku) throw new Error('Product changes require --sku');
    catalog = updateFixtureCatalog(values.catalog, {
      shippingMinor: integerOption(values['shipping-minor'], 'shipping-minor'),
      deliveryBy: values['delivery-by'],
      deliveryEvidenceStatus: values['delivery-evidence'],
      product: hasProductChange ? {
        sku: values.sku,
        unitPriceMinor: integerOption(values['price-minor'], 'price-minor'),
        availableUnits: integerOption(values.stock, 'stock'),
        productEvidenceStatus: values['product-evidence'],
        stockEvidenceStatus: values['stock-evidence'],
      } : undefined,
    }, values.now);
  }

  if (values.json) {
    console.log(JSON.stringify({ mode: 'fixture-store', action, catalogPath: resolve(values.catalog), catalog }));
    return;
  }
  console.log(`Fixture store ${catalog.supplierId} | ${action} | ${resolve(values.catalog)}`);
  console.log(`  shipping: ${catalog.shippingMinor} SGD cents`);
  console.log(`  delivery by: ${catalog.delivery.by} | evidence: ${catalog.delivery.evidence.status}`);
  for (const product of catalog.products) {
    console.log(`  ${product.sku}: ${product.unitPriceMinor} SGD cents | stock: ${product.availableUnits}`);
  }
  console.log('Synthetic supplier state only. No stock reserved, order placed or payment made.');
}
