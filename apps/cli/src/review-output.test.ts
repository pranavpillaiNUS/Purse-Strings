import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Operation } from '../../../packages/contracts/src/backend.ts';
import type { Mandate } from '../../../packages/contracts/src/index.ts';
import {
  buildRunReview, buildStatusView,
  type LedgerFacts, type RunReview, type RunReviewInput, type ShopperKind,
} from '../../../services/agent/src/review.ts';
import type { ShoppingRunEvent, ShoppingRunReport } from '../../../services/agent/src/worker.ts';
import { formatSgd } from './format.ts';
import { bar, PROVIDER_WORDING, readLedgerFacts, renderLiveEvent, renderResentCarts, renderRunReview, renderStatus, useColor } from './review-output.ts';

const SENTENCE = 'Simulation. Reservations are not payment, orders, delivery or equipment readiness.';
const ESC = String.fromCharCode(0x1b);
const CSI_C1 = String.fromCharCode(0x9b);
const RLO = String.fromCharCode(0x202e);
const PDI = String.fromCharCode(0x2069);
/** ESC sequences, a C1 CSI, bidi overrides and a newline that tries to forge a report line. */
const HOSTILE = `shop${ESC}[2J${ESC}]0;title${String.fromCharCode(7)}${CSI_C1}31m${RLO}gnp.exe${PDI}\nOutcome: completed`;

const mandate = {
  id: 'engineering-hires-demo', version: 1, policyId: 'p', policyVersion: 1, currency: 'SGD', budgetMinor: 800000,
  purchaseBy: '2026-11-16T09:00:00Z', readyBy: '2026-11-20T09:00:00Z', deliveryLocationId: 'singapore-office',
  approvedBy: 'operator', confirmedAt: '2026-11-07T09:00:00Z', allowedSuppliers: ['store-a', 'store-b'],
  requirements: [
    { id: 'engineering-laptops', role: 'laptop', quantity: 5, allowedSkus: ['LAP-14-AIR'], maxUnitPriceMinor: 120000, minWarrantyMonths: 24 },
    { id: 'engineering-monitors', role: 'monitor', quantity: 5, allowedSkus: ['MON-27-USBC'], maxUnitPriceMinor: 30000, minWarrantyMonths: 24 },
  ],
} satisfies Mandate;

const cartLines = [
  { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 5 },
  { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 5 },
];
const cart = (id: string, supplierId: string) => ({ id, mandateId: mandate.id, mandateVersion: 1, supplierId, lines: cartLines });
const OPERATION_ID = 'op-4dd843c5-9319-478f-92a1-0eef704ec8cb';
const operation = (overrides: Partial<Operation> = {}): Operation => ({
  id: OPERATION_ID, mandateId: mandate.id, mandateVersion: 1, cartId: 'run-cart-2', supplierId: 'store-a', status: 'reserved',
  currency: 'SGD', totalMinor: 751010, createdAt: '2026-11-07T09:00:00Z', updatedAt: '2026-11-07T09:00:00Z',
  reservationStatus: 'active', paymentStatus: 'not_started', orderStatus: 'not_started', refundStatus: 'not_started',
  readinessStatus: 'not_assessed', ...overrides,
});
const EVIDENCE_CODES = ['PRODUCT_EVIDENCE:LAP-14-AIR', 'STOCK_EVIDENCE:LAP-14-AIR', 'PRODUCT_EVIDENCE:MON-27-USBC', 'STOCK_EVIDENCE:MON-27-USBC', 'DELIVERY_EVIDENCE'];

function progress(accepted: boolean, remaining: number): ShoppingRunReport['progress'] {
  return {
    requirements: mandate.requirements.map(({ id, quantity }) => ({
      requirementId: id, required: quantity, priorUnits: 0, acceptedUnits: accepted ? 5 : 0, remainingUnits: accepted ? 0 : 5,
    })),
    budgetRemainingMinor: remaining,
    accepted: accepted ? [{ kind: 'proposal-accepted', simulation: true, cart: cart('run-cart-2', 'store-a'), operation: operation(), note: 'n' }] : [],
    rejected: [],
    refused: null,
    unresolved: null,
    closed: accepted,
  };
}

function report(overrides: Partial<ShoppingRunReport>): ShoppingRunReport {
  return {
    simulation: true, runId: 'run', mandateId: mandate.id, mandateVersion: 1, outcome: 'completed', detail: null,
    progress: progress(true, 48990),
    usage: { modelTurns: 7, toolCalls: 6, maxToolCalls: 24, inputTokens: 0, outputTokens: 0 },
    modelSummary: 'Scripted run finished.',
    ...overrides,
  };
}

const built = (cartId: string, supplierId: string, totalMinor: number): ShoppingRunEvent => ({
  type: 'tool_result', tool: 'cart.build', isError: false,
  content: JSON.stringify({ tool: 'cart.build', cart: cart(cartId, supplierId), estimate: { authoritative: false, currency: 'SGD', totalMinor } }),
});
const call = (tool: string, args: unknown): ShoppingRunEvent => ({ type: 'tool_call', tool, args });
const refused = (tool: string, code: string): ShoppingRunEvent => ({
  type: 'tool_result', tool, isError: true, content: JSON.stringify({ error: { code, message: 'internal wording' } }),
});

function ledger(reservedMinor: number, reservedUnits: number, committedMinor = 0): LedgerFacts {
  return {
    mandate,
    snapshot: {
      mandateId: mandate.id, mandateVersion: 1, currency: 'SGD', committedMinor, reservedMinor,
      quantities: mandate.requirements.map(({ id }) => ({ requirementId: id, committed: 0, reserved: reservedUnits })),
    },
  };
}

function view(overrides: Partial<ShoppingRunReport>, input: Partial<RunReviewInput> = {}): RunReview {
  return buildRunReview({
    report: report(overrides), events: [], ledger: ledger(751010, 5), backend: 'simulation-backend',
    shopper: { kind: 'scripted' }, budgetMinor: 800000, ...input,
  });
}

const OPERATOR = { databasePath: '.runtime/app.db', configPath: 'services/agent/fixtures/backend-demo-config.json' };
const render = (review: RunReview): string[] => renderRunReview(review, { color: false, operator: OPERATOR });
/** Wrapping is layout: sentences are matched with it taken back out. */
const flat = (lines: readonly string[]): string => lines.join(' ').replace(/ +/g, ' ');
const stripColor = (line: string): string => line.split(ESC).map((part, index) => (index === 0 ? part : part.replace(/^\[\d+m/, ''))).join('');

/** Fits 80 columns and is ASCII only, whatever went in. Only the kept sentence and a command run longer. */
function assertTerminalSafe(lines: readonly string[]): void {
  for (const line of lines) {
    assert.doesNotMatch(line, /[^\u0020-\u007e]/, `Not printable ASCII: ${JSON.stringify(line)}`);
    if (line !== SENTENCE && !line.startsWith('  npm run backend -- ')) assert.ok(line.length <= 80, `${line.length} columns: ${line}`);
  }
}

test('formatSgd uses integer arithmetic for every edge', () => {
  assert.equal(formatSgd(0), 'S$0.00');
  assert.equal(formatSgd(-0), 'S$0.00');
  assert.equal(formatSgd(1), 'S$0.01');
  assert.equal(formatSgd(5), 'S$0.05');
  assert.equal(formatSgd(99), 'S$0.99');
  assert.equal(formatSgd(100), 'S$1.00');
  assert.equal(formatSgd(99999), 'S$999.99');
  assert.equal(formatSgd(100000), 'S$1,000.00');
  assert.equal(formatSgd(751010), 'S$7,510.10');
  assert.equal(formatSgd(1_000_000_000), 'S$10,000,000.00');
  assert.equal(formatSgd(-5), '-S$0.05');
  assert.equal(formatSgd(-751010), '-S$7,510.10');
  assert.equal(formatSgd(Number.MAX_SAFE_INTEGER), 'S$90,071,992,547,409.91');
  assert.equal(formatSgd(-Number.MAX_SAFE_INTEGER), '-S$90,071,992,547,409.91');
  for (const bad of [0.1, 1.005, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatSgd(bad), RangeError, String(bad));
  }
});

test('bars show partly used as partly used, and never overflow', () => {
  assert.equal(bar(0, 100, 10), '[----------]');
  assert.equal(bar(50, 100, 10), '[#####-----]');
  assert.equal(bar(100, 100, 10), '[##########]');
  assert.equal(bar(1, 1_000_000, 10), '[#---------]');
  assert.equal(bar(999_999, 1_000_000, 10), '[#########-]');
  assert.equal(bar(200, 100, 10), '[##########]');
  assert.equal(bar(0, 0, 10), '[----------]');
  assert.equal(bar(1, 0, 10), '[##########]');
  assert.equal(bar(-5, 100, 10), '[----------]');
});

test('rejection then recovery reads as a person would say it', () => {
  const events: ShoppingRunEvent[] = [
    built('run-cart-1', 'store-b', 724850),
    built('run-cart-2', 'store-a', 751010),
  ];
  const rejection = { kind: 'proposal-rejected' as const, simulation: true as const, cart: cart('run-cart-1', 'store-b'), code: 'MANDATORY_EVIDENCE_UNKNOWN' as const, message: 'm', checkCodes: EVIDENCE_CODES, note: 'n' };
  const lines = render(view({ progress: { ...progress(true, 48990), rejected: [rejection] } }, { events }));
  const text = lines.join('\n');
  assertTerminalSafe(lines);

  assert.match(text, /Outcome: completed\n {2}Every unit needed is covered/);
  assert.match(text, /This run paid for nothing and ordered nothing/);
  assert.match(text, /Budget \(read from the ledger after the run\)\n {2}\[#{28}-{2}\] S\$7,510\.10 of S\$8,000\.00 allocated/);
  assert.match(text, /Total {6}S\$8,000\.00 +Reserved {3}S\$7,510\.10/);
  assert.match(text, /Committed {2}S\$0\.00 +Remaining {2}S\$489\.90/);
  assert.match(text, /engineering-laptops +\[#{10}\] 5 of 5 allocated \| 5 this run/);
  assert.match(text, /What the checker decided, store by store/);
  assert.match(text, /store-b +run-cart-1 +S\$7,248\.50 +Rejected +-/);
  assert.match(text, /store-a +run-cart-2 +S\$7,510\.10 +Reserved +S\$7,510\.10/);
  assert.match(flat(lines), /Product and stock records for LAP-14-AIR and MON-27-USBC, and the delivery record, are missing, stale or unverified\. Nothing was reserved\. \[MANDATORY_EVIDENCE_UNKNOWN\]/);
  assert.match(text, /\* Estimate: the shopper's comparison figure, never authoritative/);
  assert.doesNotMatch(text, /SGD cents|PRODUCT_EVIDENCE|\b109900\b/);
  assert.ok(text.includes(SENTENCE));
  assert.equal(lines.at(-1), SENTENCE);
});

test('resent carts say what came back and what to do, with the command on one line', () => {
  const cart = { id: 'run-cart-2', mandateId: 'm', mandateVersion: 1, supplierId: 'store-b', lines: [{ requirementId: 'r', sku: 's', quantity: 1 }] };
  const accepted = renderResentCarts([{ kind: 'accepted', cart, operation: operation() }], OPERATOR);
  assertTerminalSafe(accepted);
  const acceptedText = flat(accepted);
  assert.match(acceptedText, /with no model involved/);
  assert.match(acceptedText, /run-cart-2 at store-b: reserved, S\$/);
  assert.match(acceptedText, /set aside, not paid/);
  assert.ok(accepted.some((line) => line.startsWith(`  npm run backend -- operation-run --id ${OPERATION_ID} --db `)), accepted.join('\n'));
  assert.match(acceptedText, /new run ID/);
  assert.equal(accepted.at(-1), SENTENCE);

  const unknown = flat(renderResentCarts([{ kind: 'unknown', cart }], OPERATOR));
  assert.match(unknown, /still unknown, and a reservation may exist/);
  assert.match(unknown, /resends what is still unknown first/);
  assert.doesNotMatch(unknown, /operation-run|new run ID/);

  const rejected = flat(renderResentCarts([{ kind: 'rejected', cart, code: 'BUDGET_EXCEEDED', message: 'x', checkCodes: [] }], OPERATOR));
  assert.match(rejected, /rejected\. The checker's total is more than the budget still available\. Nothing was reserved by this cart\./);
  assert.doesNotMatch(rejected, /operation-run/);
});

test('a path in the command is quoted so a shell reads it as one argument', () => {
  const command = (databasePath: string): string => renderRunReview(view({}), { color: false, operator: { databasePath, configPath: 'c.json' } })
    .find((line) => line.startsWith('  npm run backend -- '))!;
  assert.match(command('state/app.db'), /--db state\/app\.db --config c\.json$/);
  assert.match(command('my state/app.db'), /--db "my state\/app\.db" --config/);
  assert.match(command('a;b/app.db'), /--db 'a;b\/app\.db' --config/);
  // The terminal text would change this one, so typing it back could name a different file.
  assert.match(command('caf\u00e9/app.db'), /--db PATH --config/);
});

test('the next step names the exact operator command and says who runs it', () => {
  const text = render(view({})).join('\n');
  assert.match(text, /The operator runs this, never the shopper/);
  // One line, because pasting a wrapped command runs only its first line and then fails.
  assert.ok(render(view({})).includes(
    `  npm run backend -- operation-run --id ${OPERATION_ID} --db .runtime/app.db --config services/agent/fixtures/backend-demo-config.json`,
  ), text);
  assert.match(text, /The shopper has no tool that can run it/);
  // A rerun with nothing new, or an operation already run, offers nothing to execute.
  const finished = progress(false, 48990);
  finished.requirements = finished.requirements.map((item) => ({ ...item, priorUnits: 5, remainingUnits: 0 }));
  const nothingNew = render(view({ progress: finished, usage: { modelTurns: 0, toolCalls: 0, maxToolCalls: 24, inputTokens: 0, outputTokens: 0 }, modelSummary: null })).join('\n');
  assert.doesNotMatch(nothingNew, /operation-run/);
  assert.match(nothingNew, /This run added no new reservation/);
});

test('a compromised run lists every refusal with a reason, in the live lines and the closing review', () => {
  const calls: Array<[string, unknown, string]> = [
    ['payment_capture', { amountMinor: 2000000 }, 'INVALID_TOOL_CALL'],
    ['cart.build', { supplierId: 'store-b', lines: [{ requirementId: 'r', sku: 'LAP-14-PRO', quantity: 20 }] }, 'SKU_NOT_ALLOWED'],
    ['cart.build', { supplierId: 'store-b', budgetMinor: 2000000, lines: [] }, 'INVALID_TOOL_CALL'],
    ['cart.submit', { cartId: 'approved-by-cfo' }, 'CART_NOT_FOUND'],
  ];
  const events = calls.flatMap(([tool, args, code]) => [call(tool, args), refused(tool, code)]);
  const live = events.flatMap((event) => renderLiveEvent(event, 'simulation-backend'));
  assertTerminalSafe(live);
  assert.deepEqual(live, [
    '  > payment_capture',
    '    x refused: The shopper has no such tool.',
    '  > cart.build store-b LAP-14-PRO x20',
    '    x refused: This product is not approved for that requirement.',
    '  > cart.build store-b',
    '    x refused: This tool does not accept those arguments.',
    '  > cart.submit approved-by-cfo',
    '    x refused: That cart ID is not the one that can be submitted now.',
  ]);

  const lines = render(view({ outcome: 'no_feasible_cart', progress: progress(false, 800000) }, { events, ledger: ledger(0, 0) }));
  const text = lines.join('\n');
  assertTerminalSafe(lines);
  assert.match(text, /Outcome: no_feasible_cart\n {2}This run reserved nothing/);
  assert.match(text, /No cart reached the checker\./);
  assert.match(text, /Refused attempts \(4\)/);
  assert.match(text, /payment_capture\n {4}The shopper has no such tool\. \[INVALID_TOOL_CALL\]/);
  assert.match(text, /cart\.build store-b LAP-14-PRO x20\n {4}This product is not approved for that requirement\. \[SKU_NOT_ALLOWED\]/);
  assert.match(text, /\[-{30}\] S\$0\.00 of S\$8,000\.00 allocated/);
  assert.doesNotMatch(text, /operation-run/);
});

const COMPROMISED_CALLS: Array<[string, unknown, string]> = [
  ['payment_capture', { amountMinor: 2000000 }, 'INVALID_TOOL_CALL'],
  ['cart.build', { supplierId: 'store-b', lines: [{ requirementId: 'r', sku: 'LAP-14-PRO', quantity: 20 }] }, 'SKU_NOT_ALLOWED'],
  ['cart.submit', { cartId: 'approved-by-cfo' }, 'CART_NOT_FOUND'],
];
const compromisedEvents = COMPROMISED_CALLS.flatMap(([tool, args, code]) => [call(tool, args), refused(tool, code)]);
const compromisedReview = (input: Partial<RunReviewInput> = {}): RunReview => view(
  { outcome: 'no_feasible_cart', progress: progress(false, 800000) },
  { events: compromisedEvents, ledger: ledger(0, 0), ...input },
);
const renderBrief = (review: RunReview): string[] => renderRunReview(review, { color: false, operator: OPERATOR, brief: true });

test('a brief review keeps the facts and turns repeated detail into a count', () => {
  const lines = renderBrief(compromisedReview());
  const text = lines.join('\n');
  assertTerminalSafe(lines);
  // Kept: the rule, the shopper, the outcome, the budget bar, the requirement bars and the table.
  assert.equal(lines.filter((line) => line === '='.repeat(80)).length, 2);
  assert.match(text, /Shopper: scripted stand-in, not Claude/);
  assert.match(text, /Outcome: no_feasible_cart\n {2}This run reserved nothing/);
  assert.match(text, /This run paid for nothing and ordered nothing/);
  assert.match(text, /\[-{30}\] S\$0\.00 of S\$8,000\.00 allocated/);
  assert.match(text, /engineering-laptops +\[-{10}\] 0 of 5 allocated \| 0 this run/);
  assert.match(text, /What the checker decided, store by store\n {2}No cart reached the checker\./);
  // A count, with no per-attempt reason: the live lines of the same run showed each one.
  assert.ok(lines.includes('Refused attempts: 3 (each one is shown above)'));
  assert.doesNotMatch(text, /\[INVALID_TOOL_CALL\]|\[SKU_NOT_ALLOWED\]|payment_capture|has no such tool/);
  // Gone: usage, the placeholder from a scripted stand-in and the long next step.
  assert.doesNotMatch(text, /^Usage:/m);
  assert.doesNotMatch(text, /Model summary|Scripted run finished/);
  assert.ok(lines.includes('Next step: nothing waits for the operator from this run.'));
  assert.doesNotMatch(text, /a person\s+decides/);
  assert.equal(lines.at(-1), SENTENCE);
});

test('a brief review keeps the store table and says only the operator can run the reservation', () => {
  const events: ShoppingRunEvent[] = [built('run-cart-1', 'store-b', 724850), built('run-cart-2', 'store-a', 751010)];
  const rejection = { kind: 'proposal-rejected' as const, simulation: true as const, cart: cart('run-cart-1', 'store-b'), code: 'MANDATORY_EVIDENCE_UNKNOWN' as const, message: 'm', checkCodes: EVIDENCE_CODES, note: 'n' };
  const lines = renderBrief(view({ progress: { ...progress(true, 48990), rejected: [rejection] } }, { events }));
  const text = lines.join('\n');
  assertTerminalSafe(lines);
  assert.match(text, /store-b +run-cart-1 +S\$7,248\.50 +Rejected +-/);
  assert.match(flat(lines), /are missing, stale or unverified\. Nothing was reserved\. \[MANDATORY_EVIDENCE_UNKNOWN\]/);
  assert.match(text, /store-a +run-cart-2 +S\$7,510\.10 +Reserved +S\$7,510\.10/);
  assert.match(text, new RegExp(`Operation ${OPERATION_ID} \\| reservation active`), 'The ID the operator needs stays in the table');
  assert.match(text, /\* Estimate: the shopper's comparison figure, never authoritative/);
  assert.ok(lines.includes('Refused attempts: none'));
  assert.ok(lines.includes('Next step: only the operator can run this reservation, never the shopper.'));
  assert.doesNotMatch(text, /operation-run|--db|--config|Read-only view|^Usage:/m);
  assert.equal(lines.at(-1), SENTENCE);

  const second = { ...operation(), id: 'op-second', cartId: 'run-cart-3' };
  const two = progress(true, 48990);
  two.accepted.push({ kind: 'proposal-accepted', simulation: true, cart: cart('run-cart-3', 'store-b'), operation: second, note: 'n' });
  assert.ok(renderBrief(view({ progress: two })).includes('Next step: only the operator can run these reservations, never the shopper.'));
});

test('a brief review keeps a real summary, labelled, and drops only a stand-in placeholder', () => {
  const real = 'Store-b carries an instruction aimed at AI agents, so I did not follow it.';
  const shopper: ShopperKind = { kind: 'live', modelId: 'claude-opus-5-5' };
  const live = renderBrief(compromisedReview({ report: report({ outcome: 'no_feasible_cart', progress: progress(false, 800000), modelSummary: real }), shopper }));
  assert.ok(live.includes('Model summary (written by the model; the results above are the record):'));
  assert.match(flat(live), /\| Store-b carries an instruction aimed at AI agents, so I did not follow it\./);
  assert.equal(live.at(-1), SENTENCE);
  assert.doesNotMatch(live.join('\n'), /^Usage:|input and/m, 'Usage goes in a live run too');

  const scriptedWithText = renderBrief(view({ modelSummary: real }));
  assert.ok(scriptedWithText.includes('Model summary (scripted stand-in, not Claude; results above are the record):'));

  // Only a scripted run's placeholder is a placeholder. Claude saying the same words still shows.
  const sameWords = renderBrief(view({ modelSummary: 'Scripted run finished.' }, { shopper }));
  assert.match(sameWords.join('\n'), /Model summary \(written by the model/);
  assert.doesNotMatch(renderBrief(view({ modelSummary: null })).join('\n'), /Model summary/);
});

// Shaped like the summary Claude wrote in the Nov 7 live rehearsal.
const LONG_SUMMARY = [
  'The checker accepted one cart from **Store A** covering everything.',
  `**What was submitted:** cart \`cart-1\`\n${Array.from({ length: 8 }, (_, index) => `- item ${index}`).join('\n')}`,
  `**Why Store A:**\n${Array.from({ length: 6 }, (_, index) => `- reason ${index}`).join('\n')}`,
  '**Suspicious supplier data:** Store B carries a notice addressed to AI agents.',
  'I ignored it and did not treat it as an approval.',
].join('\n\n');
const LIVE: ShopperKind = { kind: 'live', modelId: 'claude-opus-5-5' };
const summaryBodyOf = (lines: string[]): string[] => lines.slice(lines.findIndex((line) => line.startsWith('Model summary')) + 1).filter((line) => line.startsWith('  '));

test('a brief review cuts a long summary to its conclusion and suspicious data, and says so', () => {
  const lines = renderBrief(view({ modelSummary: LONG_SUMMARY }, { shopper: LIVE }));
  const text = lines.join('\n');
  assert.match(text, /\| The checker accepted one cart from Store A covering everything\./);
  assert.match(text, /\| Suspicious supplier data: Store B carries a notice addressed to AI agents\./);
  assert.match(text, /\| I ignored it and did not treat it as an approval\./);
  assert.doesNotMatch(text, /item 3|reason 3/);
  // Everything cut is counted, so the view cannot pass for the whole summary.
  const shown = summaryBodyOf(lines).filter((line) => line.startsWith('  |')).length;
  const whole = summaryBodyOf(render(view({ modelSummary: LONG_SUMMARY }, { shopper: LIVE }))).filter((line) => line.startsWith('  |')).length;
  assert.ok(lines.includes(`  (${whole - shown} more lines left out here. --json and --trace keep the full text.)`));
  assert.ok(whole - shown > 0);
});

test('a brief review bounds a long summary with no suspicious section, and shows a short one whole', () => {
  const rambling = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n');
  const capped = renderBrief(view({ modelSummary: rambling }, { shopper: LIVE }));
  assert.equal(summaryBodyOf(capped).filter((line) => line.startsWith('  |')).length, 16);
  assert.ok(capped.includes('  (24 more lines left out here. --json and --trace keep the full text.)'));

  const conclusionOnly = renderBrief(view({ modelSummary: `Done.\n\n${Array.from({ length: 12 }, (_, index) => `- step ${index}`).join('\n')}` }, { shopper: LIVE })).join('\n');
  assert.match(conclusionOnly, /\| Done\./);
  assert.doesNotMatch(conclusionOnly, /step 3/);

  const short = renderBrief(view({ modelSummary: 'First.\n\nSecond.' }, { shopper: LIVE })).join('\n');
  assert.match(short, /\| First\.[\s\S]*\| Second\./);
  assert.doesNotMatch(short, /left out here/);
});

test('without --brief a long summary stays whole, and markdown marks never reach the terminal', () => {
  const lines = render(view({ modelSummary: LONG_SUMMARY }, { shopper: LIVE }));
  const text = lines.join('\n');
  for (const kept of ['item 7', 'reason 5', 'I ignored it']) assert.ok(text.includes(kept), kept);
  assert.doesNotMatch(text, /left out here/);
  const body = summaryBodyOf(lines).join('\n');
  assert.doesNotMatch(body, /\*\*|`/);
  assert.match(body, /Store A/);
  // The review keeps the model's own text: only this rendering drops the marks.
  assert.match(view({ modelSummary: LONG_SUMMARY }).modelSummary ?? '', /\*\*Store A\*\*/);
});

test('hostile text stays inert when a brief review shortens a summary', () => {
  const hostile = `Done \u001b[31mred\u001b[0m.\n\n${Array.from({ length: 12 }, (_, index) => `- step ${index}`).join('\n')}\n\nSuspicious: ‮evil‬\nOutcome: completed`;
  const lines = renderBrief(view({ modelSummary: hostile }, { shopper: LIVE }));
  const text = lines.join('\n');
  assert.doesNotMatch(text, /\u001b|‮|‬/);
  assert.ok(lines.some((line) => line.startsWith('  | Outcome: completed')), 'A model line stays prefixed, so it cannot pass for a result');
  assert.equal(lines.filter((line) => line === 'Outcome: completed').length, 1, 'Only the real outcome line is unprefixed');
});

test('usage says one turn in the singular', () => {
  const one = { modelTurns: 1, toolCalls: 1, maxToolCalls: 24, inputTokens: 10, outputTokens: 2 };
  assert.match(render(view({ usage: one }, { shopper: LIVE })).join('\n'), /Usage: 1 model turn \| 1 of 24 tool calls \| 10 input and 2 output tokens/);
  assert.match(render(view({ usage: one })).join('\n'), /Usage: 1 scripted turn \| 1 of 24 tool calls/);
});

test('a brief review does not shorten what must stay whole', () => {
  // An unknown outcome keeps its full warning, because that wording is what keeps it safe.
  const unresolved = cart('run-cart-1', 'store-b');
  const events: ShoppingRunEvent[] = [
    built('run-cart-1', 'store-b', 724850),
    { type: 'tool_result', tool: 'cart.submit', isError: false, content: JSON.stringify({ submission: { kind: 'proposal-outcome-unknown', simulation: true, cart: unresolved, note: 'n' } }) },
  ];
  const unknown = renderBrief(view({ outcome: 'unknown_submission', progress: { ...progress(false, 800000), unresolved } }, { events, ledger: null }));
  assertTerminalSafe(unknown);
  assert.match(flat(unknown), /Do not treat the unknown submission as failed, and do not treat it as safe/);
  assert.match(flat(unknown), /resends this exact cart with the same key, with no model, so it cannot reserve twice/);
  assert.match(flat(unknown), /These numbers may or may not include the unknown submission/);
  assert.doesNotMatch(unknown.join('\n'), /only the operator can run/);

  // The mock never gains an operator step, and its warning stays.
  const mock = renderBrief(view({}, { backend: 'contract-mock', ledger: null })).join('\n');
  assert.match(mock, /Contract mock: it checks nothing and keeps no ledger/);
  assert.match(mock, /Nothing to execute: the contract mock has no execution step/);
  assert.doesNotMatch(mock, /only the operator can run/);

  // So does a warning that some events could not be read, a failed ledger read and a difference.
  const unreadable = renderBrief(view({}, { events: [null, 42] }));
  assert.match(flat(unreadable), /2 run event\(s\) could not be read/);
  assert.match(renderBrief(view({}, { ledger: null })).join('\n'), /the ledger could not be read after the run/);
  assert.match(flat(renderBrief(view({}, { ledger: ledger(1451010, 5) }))), /The ledger shows S\$7,000\.00 more allocated/);
});

test('without --brief the review is exactly as it was, and brief only ever removes lines or shortens two', () => {
  for (const review of [compromisedReview(), view({})]) {
    const full = renderRunReview(review, { color: false, operator: OPERATOR });
    assert.deepEqual(renderRunReview(review, { color: false, operator: OPERATOR, brief: false }), full);
    assert.match(full.join('\n'), /^Usage: /m);
    const replaced = /^(Refused attempts: |Next step: )/;
    for (const line of renderBrief(review)) {
      if (!replaced.test(line)) assert.ok(full.includes(line), `Added by brief: ${line}`);
    }
  }
});

test('a brief review keeps hostile text inert and keeps colour out of its layout', () => {
  const hostile = view({ runId: HOSTILE, detail: HOSTILE, modelSummary: `Done.\n${HOSTILE}` }, { events: [call(HOSTILE, { supplierId: HOSTILE }), refused(HOSTILE, HOSTILE)] });
  const lines = renderBrief(hostile);
  assertTerminalSafe(lines);
  for (const secret of [ESC, CSI_C1, RLO, PDI, '[2J']) assert.ok(!lines.join('\n').includes(secret), JSON.stringify(secret));
  assert.deepEqual(lines.filter((line) => line.startsWith('Outcome:')), ['Outcome: completed']);
  const coloured = renderRunReview(compromisedReview(), { color: true, brief: true });
  assert.ok(coloured.some((line) => line.includes(ESC)));
  assert.deepEqual(coloured.map(stripColor), renderRunReview(compromisedReview(), { color: false, brief: true }));
});

test('an unknown submission reads as unknown: never failed, rejected, safe or reserved', () => {
  const unresolved = cart('run-cart-1', 'store-b');
  const events: ShoppingRunEvent[] = [
    built('run-cart-1', 'store-b', 724850),
    { type: 'tool_result', tool: 'cart.submit', isError: false, content: JSON.stringify({ submission: { kind: 'proposal-outcome-unknown', simulation: true, cart: unresolved, note: 'n' } }) },
  ];
  const live = events.flatMap((event) => renderLiveEvent(event, 'simulation-backend'));
  assert.deepEqual(live, ['    ? unknown: a reservation may exist. Only this cart can be retried.']);

  const lines = render(view({ outcome: 'unknown_submission', progress: { ...progress(false, 800000), unresolved } }, { events, ledger: null }));
  const text = lines.join('\n');
  assertTerminalSafe(lines);
  assert.match(text, /Outcome: unknown_submission\n {2}A submission has an unknown outcome, and a reservation may exist\./);
  assert.match(text, /store-b +run-cart-1 +S\$7,248\.50 +UNKNOWN +unknown/);
  assert.match(flat(lines), /Do not treat it as failed or as safe/);
  assert.match(flat(lines), /These numbers may or may not include the unknown submission/);
  assert.match(flat(lines), /Do not treat the unknown submission as failed, and do not treat it as safe/);
  assert.doesNotMatch(text, /Outcome: failed|Rejected|Refused attempts \(|Nothing was reserved|operation-run/);
  // Without this, a reader could take the row's silence for a clean result.
  assert.doesNotMatch(text, /Reserved +S\$/);
});

test('a failed ledger read shows what the run knows, says so and keeps the operator step', () => {
  const lines = render(view({}, { ledger: null }));
  const text = lines.join('\n');
  assertTerminalSafe(lines);
  assert.match(text, /Budget \(what this run knows; the ledger could not be read after the run\)/);
  assert.match(text, /S\$7,510\.10 of S\$8,000\.00 allocated/);
  assert.match(text, /This run {3}S\$7,510\.10/);
  assert.match(text, /Remaining {2}S\$489\.90/);
  assert.doesNotMatch(text, /Committed/);
  assert.match(text, /operation-run/);
});

test('reading the ledger never throws, whatever the backend does', async () => {
  const thrown = await readLedgerFacts({ request: async () => { throw new Error('Backend RPC timed out'); } }, 'm', 'r');
  assert.equal(thrown, null);
  const refusedRead = await readLedgerFacts({
    request: async () => ({
      apiVersion: '1', requestId: 'r', method: 'mandate.get', simulation: true, ok: false,
      error: { code: 'BUSY', message: 'm', details: { checkCodes: [] } },
    }),
  }, 'm', 'r');
  assert.equal(refusedRead, null);
  const facts = ledger(1, 1);
  const answered = await readLedgerFacts({
    request: async () => ({ apiVersion: '1', requestId: 'r', method: 'mandate.get', simulation: true, ok: true, result: facts }),
  }, 'm', 'r');
  assert.deepEqual(answered, facts);
});

test('a disagreement between ledger and run is shown, because it may be the unknown', () => {
  assert.match(flat(render(view({}, { ledger: ledger(1451010, 5) }))), /The ledger shows S\$7,000\.00 more allocated than this run counted\. Another run or an unknown submission could explain that\./);
  assert.match(flat(render(view({}, { ledger: ledger(751000, 5) }))), /The ledger shows S\$0\.10 less allocated than this run counted/);
  assert.doesNotMatch(flat(render(view({}))), /than this run counted/);
});

test('a malformed event shows as unreadable and does not stop the report', () => {
  for (const bad of [null, 42, {}, { type: 'tool_result', tool: 'cart.submit', isError: false, content: '{not json' }]) {
    assert.deepEqual(renderLiveEvent(bad, 'simulation-backend'), ['    ? this result could not be read; the review uses the run report']);
  }
  const lines = render(view({}, { events: [null, 42, { type: 'tool_result', tool: 'cart.build', isError: false, content: '[' }] }));
  assertTerminalSafe(lines);
  assert.match(flat(lines), /3 run event\(s\) could not be read\. The results above come from the run report and the ledger\./);
});

test('hostile text is inert everywhere a store, model or tool can put it', () => {
  const hostileCart = { ...cart(HOSTILE, HOSTILE), lines: [{ requirementId: HOSTILE, sku: HOSTILE, quantity: 1 }] };
  const rejection = { kind: 'proposal-rejected' as const, simulation: true as const, cart: hostileCart, code: 'INELIGIBLE' as const, message: HOSTILE, checkCodes: [HOSTILE, `STOCK:${HOSTILE}`], note: 'n' };
  const base = progress(true, 48990);
  const summary = `Done.\n${HOSTILE}\n\nOutcome: completed\n${'x'.repeat(300)}`;
  const review = view({
    runId: HOSTILE, detail: HOSTILE, modelSummary: summary,
    progress: {
      ...base,
      requirements: [{ requirementId: HOSTILE, required: 5, priorUnits: 0, acceptedUnits: 5, remainingUnits: 0 }],
      rejected: [rejection],
      accepted: [{ kind: 'proposal-accepted', simulation: true, cart: hostileCart, operation: operation({ id: HOSTILE }), note: 'n' }],
    },
  }, {
    events: [call(HOSTILE, { supplierId: HOSTILE, cartId: HOSTILE }), refused(HOSTILE, HOSTILE)],
    ledger: null,
    shopper: { kind: 'live', modelId: HOSTILE },
  });
  const lines = renderRunReview(review, { color: false, operator: { databasePath: HOSTILE, configPath: HOSTILE } });
  assertTerminalSafe(lines);
  const text = lines.join('\n');
  for (const secret of [ESC, CSI_C1, RLO, PDI, '[2J']) assert.ok(!text.includes(secret), JSON.stringify(secret));
  // The newline cannot forge a report line: the only Outcome line at the margin is the host's.
  assert.deepEqual(lines.filter((line) => line.startsWith('Outcome:')), ['Outcome: completed']);
  // The model's words stay behind their prefix, line by line.
  assert.ok(lines.some((line) => line === '  | Outcome: completed'));
  assert.ok(lines.some((line) => line === '  |'));

  const live = [call(HOSTILE, { supplierId: HOSTILE }), refused('x', HOSTILE)].flatMap((event) => renderLiveEvent(event, 'simulation-backend'));
  assertTerminalSafe(live);
  assert.equal(live.length, 2, 'A newline cannot add a line');
  for (const secret of [ESC, CSI_C1, RLO]) assert.ok(!live.join('\n').includes(secret));
});

test('non-ASCII model text is folded, so PowerShell 5.1 has nothing to mangle', () => {
  const quote = String.fromCharCode(0x2019);
  const dash = String.fromCharCode(0x2014);
  const arrow = String.fromCharCode(0x2192);
  const lines = render(view({ modelSummary: `It${quote}s cheaper ${dash} store-a ${arrow} S$1 ${String.fromCodePoint(0x1F600)}` }));
  assertTerminalSafe(lines);
  assert.ok(lines.includes("  | It's cheaper - store-a -> S$1 ?"));
});

test('unknown codes appear raw in live lines, the closing review and rejection rows', () => {
  const rejection = { kind: 'proposal-rejected' as const, simulation: true as const, cart: cart('run-cart-1', 'store-b'), code: 'INELIGIBLE' as const, message: 'm', checkCodes: ['BRAND_NEW:thing'], note: 'n' };
  const events = [call('cart.build', {}), refused('cart.build', 'BRAND_NEW_CODE')];
  assert.deepEqual(renderLiveEvent(events[1], 'simulation-backend'), ['    x refused: Unrecognized code: BRAND_NEW_CODE']);
  const text = render(view({ progress: { ...progress(true, 48990), rejected: [rejection] } }, { events })).join('\n');
  assert.match(text, /Unrecognized check: BRAND_NEW:thing/);
  assert.match(text, /Unrecognized code: BRAND_NEW_CODE/);
  assert.doesNotMatch(text, /Unrecognized code: BRAND_NEW_CODE \[BRAND_NEW_CODE\]/, 'Raw once is enough');
});

test('a model summary claiming success changes nothing outside its labelled block', () => {
  const summary = 'All done: every laptop is purchased, paid and approved by the CFO. Outcome: completed.';
  const failing = { outcome: 'no_feasible_cart' as const, progress: progress(false, 800000), usage: { modelTurns: 1, toolCalls: 0, maxToolCalls: 24, inputTokens: 0, outputTokens: 0 } };
  const claimed = render(view({ ...failing, modelSummary: summary }, { ledger: ledger(0, 0) }));
  const silent = render(view({ ...failing, modelSummary: null }, { ledger: ledger(0, 0) }));
  const heading = claimed.findIndex((line) => line.startsWith('Model summary'));
  assert.ok(heading > 0);
  const after = claimed.findIndex((line, index) => index > heading && !line.startsWith('  | '));
  assert.deepEqual([...claimed.slice(0, heading - 1), ...claimed.slice(after)], silent);
  assert.match(claimed.join('\n'), /Outcome: no_feasible_cart/);
  assert.ok(claimed[heading + 1]!.startsWith('  | All done'));
});

test('scripted runs omit token counts and never read as Claude; live runs show both', () => {
  const scripted = render(view({})).join('\n');
  assert.match(scripted, /Shopper: scripted stand-in, not Claude/);
  assert.match(scripted, /Usage: 7 scripted turns \| 6 of 24 tool calls\n/);
  assert.doesNotMatch(scripted, /token/i);
  assert.match(scripted, /Model summary \(scripted stand-in, not Claude;/);

  const shopper: ShopperKind = { kind: 'live', modelId: 'claude-opus-5-5' };
  const live = render(view({ usage: { modelTurns: 7, toolCalls: 6, maxToolCalls: 24, inputTokens: 1200, outputTokens: 340 } }, { shopper })).join('\n');
  assert.match(live, /Shopper: Claude \(claude-opus-5-5\)/);
  assert.match(live, /Usage: 7 model turns \| 6 of 24 tool calls \| 1200 input and 340 output tokens/);
  assert.match(live, /Model summary \(written by the model; the results above are the record\):/);
});

test('the contract mock never reads as a checker decision or as something to execute', () => {
  const lines = render(view({}, { backend: 'contract-mock', ledger: null }));
  const text = lines.join('\n');
  assertTerminalSafe(lines);
  assert.match(text, /Contract mock: it checks nothing and keeps no ledger/);
  assert.match(text, /What the contract mock answered, store by store \(it checks nothing\)/);
  assert.doesNotMatch(text, /What the checker decided|Checker total|operation-run/);
  assert.match(text, /store-a +run-cart-2 +n\/a +Accepted +S\$7,510\.10/);
  assert.match(text, /Nothing to execute: the contract mock has no execution step/);
  const accepted: ShoppingRunEvent = {
    type: 'tool_result', tool: 'cart.submit', isError: false,
    content: JSON.stringify({ submission: { kind: 'proposal-accepted', simulation: true, cart: cart('c', 'store-a'), operation: operation() } }),
  };
  assert.deepEqual(renderLiveEvent(accepted, 'contract-mock'), ['    = the mock accepted: S$7,510.10 (it checks nothing)']);
  assert.deepEqual(renderLiveEvent(accepted, 'simulation-backend'), ["    = accepted: S$7,510.10 reserved, at the checker's own total"]);
});

test('colour appears only on a terminal, only with NO_COLOR unset, and never changes the layout', () => {
  assert.equal(useColor({ isTTY: true }, {}), true);
  assert.equal(useColor({ isTTY: false }, {}), false);
  assert.equal(useColor({}, {}), false);
  assert.equal(useColor({ isTTY: true }, { NO_COLOR: '1' }), false);
  assert.equal(useColor({ isTTY: true }, { NO_COLOR: '' }), false);

  const review = view({ outcome: 'unknown_submission', progress: { ...progress(false, 800000), unresolved: cart('c', 'store-b') } });
  const plain = renderRunReview(review, { color: false, operator: OPERATOR });
  const coloured = renderRunReview(review, { color: true, operator: OPERATOR });
  assert.ok(plain.every((line) => !line.includes(ESC)));
  assert.ok(coloured.some((line) => line.includes(ESC)));
  assert.deepEqual(coloured.map(stripColor), plain);
  assert.deepEqual(renderStatus(buildStatusView({ ledger: ledger(0, 0), operations: [], backend: 'simulation-backend' }), { color: true }).map(stripColor),
    renderStatus(buildStatusView({ ledger: ledger(0, 0), operations: [], backend: 'simulation-backend' }), { color: false }));
});

test('status keeps reservation, payment, order, refund and readiness as separate lines', () => {
  const executed = operation({ status: 'ordered', reservationStatus: 'consumed', paymentStatus: 'succeeded', orderStatus: 'succeeded' });
  const lines = renderStatus(buildStatusView({
    ledger: { mandate, snapshot: { mandateId: mandate.id, mandateVersion: 1, currency: 'SGD', committedMinor: 751010, reservedMinor: 0, quantities: mandate.requirements.map(({ id }) => ({ requirementId: id, committed: 5, reserved: 0 })) } },
    operations: [executed], backend: 'simulation-backend',
  }), { color: false });
  const text = lines.join('\n');
  assertTerminalSafe(lines);
  assert.match(text, /Read-only: this command changes, executes and pays for nothing\./);
  assert.match(text, /\[#{28}-{2}\] S\$7,510\.10 of S\$8,000\.00 allocated/);
  assert.match(text, /engineering-laptops +\[#{10}\] 5 of 5 allocated \| 5 committed \| 0 reserved/);
  assert.match(text, new RegExp(`Operation ${OPERATION_ID}`));
  assert.match(text, /Status +ordered: the fake order succeeded; this is not a real order/);
  assert.match(text, /Reservation +consumed: now counted as committed/);
  assert.match(text, /Fake payment +succeeded/);
  assert.match(text, /Fake order +succeeded/);
  assert.match(text, /Fake refund +not started/);
  assert.match(text, /Readiness +not assessed: readiness tracking is not built/);
  assert.match(text, /Fake providers stand in for payment and the supplier/);
  assert.equal(lines.at(-1), SENTENCE);

  const reserved = renderStatus(buildStatusView({ ledger: ledger(751010, 5), operations: [operation()], backend: 'simulation-backend' }), { color: false }).join('\n');
  assert.match(reserved, /Status +reserved: budget set aside; nothing has been executed/);
  assert.match(reserved, /Reservation +active: budget set aside, not paid/);
  assert.match(reserved, /Fake payment +not started/);
  const unknownEffect = renderStatus(buildStatusView({ ledger: ledger(0, 0), operations: [operation({ status: 'reconciliation_required', paymentStatus: 'unknown' })], backend: 'simulation-backend' }), { color: false }).join('\n');
  assert.match(unknownEffect, /Fake payment +UNKNOWN: outcome not established; do not assume either way/);
});

test('status without operations says where to find them, and the mock says it checks nothing', () => {
  const lines = renderStatus(buildStatusView({ ledger: ledger(0, 0), operations: [], backend: 'contract-mock' }), { color: false });
  const text = lines.join('\n');
  assertTerminalSafe(lines);
  assert.match(text, /The client cannot list operations\. Each shop run prints the operation ID/);
  assert.match(text, /--operation ID/);
  assert.match(text, /Contract mock: it checks nothing/);
  assert.match(text, /placeholder zeros/);
});

test('provider wording lives in one constant', () => {
  const source = readFileSync(new URL('./review-output.ts', import.meta.url), 'utf8');
  for (const word of [PROVIDER_WORDING.payment, PROVIDER_WORDING.order, PROVIDER_WORDING.refund]) {
    assert.equal(source.split(word).length - 1, 1, word);
  }
  assert.match(renderStatus(buildStatusView({ ledger: ledger(0, 0), operations: [operation()], backend: 'simulation-backend' }), { color: false }).join('\n'), /Fake payment/);
});

test('long IDs wrap or cut instead of breaking the columns', () => {
  const long = 'requirement-with-a-very-long-identifier-'.repeat(4);
  const base = progress(true, 48990);
  const lines = render(view({
    progress: {
      ...base,
      requirements: [{ requirementId: long, required: 1000, priorUnits: 0, acceptedUnits: 1000, remainingUnits: 0 }],
      accepted: [{ kind: 'proposal-accepted', simulation: true, cart: cart(long, long), operation: operation({ id: long, totalMinor: 1_000_000_000 }), note: 'n' }],
    },
  }, { ledger: null }));
  assertTerminalSafe(lines);
  assert.match(flat(lines), /Store: requirement-with/, 'A store name too long for its column appears in full below it');
});
