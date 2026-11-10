import { parseArgs } from 'node:util';
import { loadInput, DEMO_NOW } from './inputs.ts';
import { runStore } from './store.ts';
import { runMandate } from './mandate.ts';
import { evaluatePurchase } from '../../../services/checker/src/rules/evaluate.ts';
import { fromMinor } from '../../../services/checker/src/money.ts';
import type { EligibilityResult } from '../../../packages/contracts/src/index.ts';

const HELP = `Purse Strings — offline purchasing eligibility (no money moves)

Usage:
  npm run cli -- demo [--json]
  npm run cli -- check [--request cart.json|-] [--json] [--now ISO_TIMESTAMP]
    [--policy policy.json] [--mandate mandate.json]
    [--snapshot budget.json] [--catalog catalog.json]
  npm run cli -- store show|reset|set --catalog working.json [options]
    Use store --help for synthetic supplier controls.
  npm run cli -- mandate draft|review [options]
    Use mandate --help for policy-constrained draft planning.

Bundled examples load by default. Override paths are relative to your current
directory; --request - reads stdin. check uses the current time unless --now is
supplied. demo uses the fixed fixture clock 2026-11-03T09:00:00Z.

check exit codes: 0 eligible; 2 blocked; 3 needs_review; 1 invalid input/error.
demo exit codes: 0 all expected outcomes match; 1 unexpected outcome/error.
Use npm run --silent cli -- ... --json for machine-readable stdout.
Eligibility is not a reservation, payment permission or confirmed equipment readiness.
`;

function printResult(result: EligibilityResult): void {
  console.log(`${result.decision} | ${result.cartId} | total SGD ${fromMinor(result.totalMinor)}`);
  for (const check of result.checks) {
    if (check.status !== 'pass' || check.code === 'BUDGET' || check.code.startsWith('QUANTITY:')) {
      console.log(`  ${check.status} ${check.code}: ${check.message}`);
    }
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === 'mandate') {
    runMandate(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === 'store') {
    runStore(process.argv.slice(3));
    return;
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      request: { type: 'string' },
      policy: { type: 'string' },
      mandate: { type: 'string' },
      snapshot: { type: 'string' },
      catalog: { type: 'string' },
      now: { type: 'string' },
    },
  });
  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return;
  }
  if (positionals.length !== 1) throw new Error('Expected one command. Use --help.');
  const command = positionals[0];
  if (command === 'check') {
    const result = evaluatePurchase(await loadInput(values));
    if (values.json) console.log(JSON.stringify(result));
    else {
      printResult(result);
      console.log('Offline check only. No funds reserved and no order placed.');
    }
    process.exitCode = result.decision === 'eligible' ? 0 : result.decision === 'blocked' ? 2 : 3;
    return;
  }
  if (command !== 'demo') throw new Error(`Unknown command: ${command}. Use --help.`);
  if (Object.entries(values).some(([key, value]) => key !== 'json' && value !== undefined)) {
    throw new Error('demo accepts only --json; use check for custom inputs and clocks.');
  }

  const normal = await loadInput({ now: DEMO_NOW });
  const shipping = structuredClone(normal);
  shipping.quote.id += '-shipping';
  shipping.quote.shippingMinor += 50000;
  shipping.quote.taxMinor += 4500;
  shipping.quote.totalMinor += 54500;
  const quantities = structuredClone(normal);
  quantities.snapshot.quantities[0]!.reserved = 2;
  const unknown = structuredClone(normal);
  unknown.quote.delivery.evidence.status = 'unknown';

  const scenarios = [
    { name: 'approved equipment within remaining budget', expected: 'eligible', input: normal },
    { name: 'shipping increase exceeds remaining budget', expected: 'blocked', input: shipping },
    { name: 'prior reservations exhaust required quantity', expected: 'blocked', input: quantities },
    { name: 'delivery commitment lacks evidence', expected: 'needs_review', input: unknown },
  ].map(({ name, expected, input }) => ({ name, expected, result: evaluatePurchase(input) }));

  const passed = scenarios.every((scenario) => scenario.expected === scenario.result.decision);
  if (values.json) console.log(JSON.stringify({ mode: 'offline-demo', passed, scenarios }));
  else {
    console.log(`Offline fixture demo | clock ${DEMO_NOW}`);
    for (const scenario of scenarios) {
      console.log(`\n${scenario.name}`);
      printResult(scenario.result);
    }
    console.log('\nOffline checks only. No funds reserved and no orders placed.');
  }
  process.exitCode = passed ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'CLI operation failed');
  process.exitCode = 1;
}
