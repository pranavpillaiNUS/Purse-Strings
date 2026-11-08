import type { BackendClient } from '../../../packages/contracts/src/client.ts';
import type { Operation } from '../../../packages/contracts/src/backend.ts';
import {
  plainReason, readRunEvent, SCRIPTED_PLACEHOLDER_SUMMARY,
  type BackendKind, type BudgetView, type LedgerFacts, type RunEventReading, type RunReview, type StatusView, type StoreDecision,
} from '../../../services/agent/src/review.ts';
import type { ResentCart } from '../../../services/agent/src/backend-session.ts';
import { formatSgd } from './format.ts';
import { printable, printableLine } from './mandate.ts';

// A command the operator must run stays on one line, whatever its length, so it pastes as written.
// Renders reviews for a terminal: 80 columns and ASCII, because PowerShell 5.1 can mangle
// Unicode. Every supplier or model string passes through `safe` or `safeLines` first.

const WIDTH = 80;
const SIMULATION_SENTENCE = 'Simulation. Reservations are not payment, orders, delivery or equipment readiness.';
const BOLD_FREE_NEXT_STEP = 'Next step';

/** Wording for the fake adapter; each operation's backend fact selects its payment wording. */
export const PROVIDER_WORDING = {
  payment: 'fake payment',
  order: 'fake order',
  refund: 'fake refund',
  disclaimer: 'Fake providers stand in for payment and the supplier. No real money moved and no real order exists.',
} as const;

function paymentWording(operation: Operation): { payment: string; refund: string; provider: string } {
  if (operation.paymentProvider === 'fake') return { ...PROVIDER_WORDING, provider: 'fake' };
  if (operation.paymentProvider === 'paypal-sandbox') {
    return { payment: 'PayPal sandbox payment', refund: 'PayPal sandbox refund', provider: 'PayPal sandbox' };
  }
  return { payment: 'payment', refund: 'refund', provider: 'not recorded' };
}

const ASCII_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2018\u2019\u201a\u2032]/g, "'"],
  [/[\u201c\u201d\u201e\u2033]/g, '"'],
  [/[\u2010-\u2015\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/[\u00a0\u2009\u202f]/g, ' '],
  [/[\u2192\u21d2]/g, '->'],
  [/\u00d7/g, 'x'],
  [/\u2248/g, '~'],
  [/[\u2022\u00b7]/g, '*'],
];

function ascii(text: string): string {
  let folded = text;
  for (const [pattern, replacement] of ASCII_FOLDS) folded = folded.replace(pattern, replacement);
  return folded.replace(/[^ -~\n]/gu, '?');
}

const safe = (text: string): string => ascii(printableLine(text));
/** For the model's summary, which may legitimately span lines. */
const safeLines = (text: string): string[] => ascii(printable(text)).split('\n');

/** Word-wraps text, hard-breaking anything too long for a line. Blank text gives no lines. */
function wrap(text: string, firstIndent: string, restIndent = firstIndent): string[] {
  const lines: string[] = [];
  let line = '';
  const room = (): number => WIDTH - (lines.length === 0 ? firstIndent : restIndent).length;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    if (line && line.length + 1 + rest.length > room()) {
      lines.push(line);
      line = '';
    }
    while (rest.length > room()) {
      const size = room();
      lines.push(rest.slice(0, size));
      rest = rest.slice(size);
    }
    line = line ? `${line} ${rest}` : rest;
  }
  if (line) lines.push(line);
  return lines.map((item, index) => `${index === 0 ? firstIndent : restIndent}${item}`);
}

/** A table cell: padded to width, or cut with a marker when it does not fit. */
function cell(text: string, width: number): string {
  return text.length <= width ? text.padEnd(width) : `${text.slice(0, width - 3)}...`;
}

function fitLine(line: string): string {
  return line.length <= WIDTH ? line : `${line.slice(0, WIDTH - 3)}...`;
}

/** [#####-----]. Partly used never reads as empty or full. */
export function bar(part: number, whole: number, width: number): string {
  let filled: number;
  if (part <= 0) filled = 0;
  else if (part >= whole) filled = width;
  else filled = Math.min(width - 1, Math.max(1, Math.floor((part * width) / whole)));
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

/** Colour only on a terminal, and only while NO_COLOR is unset. JSON output never gets here. */
export function useColor(stream: { isTTY?: boolean }, env: { NO_COLOR?: string | undefined }): boolean {
  return stream.isTTY === true && env.NO_COLOR === undefined;
}

type Paint = (style: number, text: string) => string;
const BOLD = 1;
const RED = 31;
const GREEN = 32;
const YELLOW = 33;

function painter(color: boolean): Paint {
  return color ? (style, text) => `\u001b[${style}m${text}\u001b[0m` : (_style, text) => text;
}

/** A requirement's name, bar and numbers: one line, or two when the name will not fit. */
function barLine(label: string, labelWidth: number, barText: string, detail: string): string[] {
  const name = safe(label);
  const line = `  ${name.padEnd(labelWidth)} ${barText} ${detail}`;
  if (line.length <= WIDTH) return [line];
  return [...wrap(name, '  '), ...wrap(`${barText} ${detail}`, '    ')];
}

function labelWidthFor(names: readonly string[]): number {
  return Math.min(28, Math.max(0, ...names.map((name) => safe(name).length)));
}

function moneyPair(leftLabel: string, left: number, rightLabel: string, right: number | null): string {
  const first = `  ${leftLabel.padEnd(10)} ${formatSgd(left).padEnd(16)}`;
  return right === null ? first.trimEnd() : `${first} ${rightLabel.padEnd(10)} ${formatSgd(right)}`;
}

function budgetHeading(source: BudgetView['source']): string {
  if (source === 'ledger') return 'Budget (read from the ledger after the run)';
  if (source === 'contract-mock') return "Budget (this run's own count; the contract mock keeps no ledger)";
  return 'Budget (what this run knows; the ledger could not be read after the run)';
}

function runBudgetLines(review: RunReview, paint: Paint): string[] {
  const { budget } = review;
  const lines = [paint(BOLD, budgetHeading(budget.source))];
  const { totalMinor, allocatedMinor, remainingMinor } = budget;
  if (totalMinor !== null && allocatedMinor !== null) {
    lines.push(`  ${bar(allocatedMinor, totalMinor, 30)} ${formatSgd(allocatedMinor)} of ${formatSgd(totalMinor)} allocated`);
  }
  if (budget.committedMinor !== null && budget.reservedMinor !== null && totalMinor !== null && remainingMinor !== null) {
    lines.push(moneyPair('Total', totalMinor, 'Reserved', budget.reservedMinor));
    lines.push(moneyPair('Committed', budget.committedMinor, 'Remaining', remainingMinor));
  } else {
    if (totalMinor !== null) lines.push(moneyPair('Total', totalMinor, '', null));
    lines.push(moneyPair('This run', budget.acceptedThisRunMinor, '', null));
    if (remainingMinor !== null) lines.push(moneyPair('Remaining', remainingMinor, '', null));
    else lines.push('  Remaining  not known');
  }
  if (budget.ledgerDiffersByMinor !== null) {
    const amount = formatSgd(Math.abs(budget.ledgerDiffersByMinor));
    const direction = budget.ledgerDiffersByMinor < 0 ? 'more' : 'less';
    lines.push(...wrap(`The ledger shows ${amount} ${direction} allocated than this run counted. Another run or an unknown submission could explain that.`, '  '));
  } else if (review.unresolved) {
    lines.push(...wrap('These numbers may or may not include the unknown submission below.', '  '));
  }
  return lines;
}

function requirementLines(review: RunReview, paint: Paint): string[] {
  const width = labelWidthFor(review.requirements.map(({ requirementId }) => requirementId));
  const lines = [paint(BOLD, 'Requirements (allocated means reserved or committed, not delivered)')];
  for (const item of review.requirements) {
    lines.push(...barLine(
      item.requirementId, width, bar(item.allocatedUnits, item.required, 10),
      `${item.allocatedUnits} of ${item.required} allocated | ${item.acceptedThisRun} this run`,
    ));
  }
  return lines;
}

function decisionLabel(decision: StoreDecision, backend: BackendKind): { text: string; style: number } {
  switch (decision.decision) {
    case 'accepted':
      return { text: backend === 'simulation-backend' && decision.operation?.status === 'reserved' ? 'Reserved' : 'Accepted', style: GREEN };
    case 'rejected': return { text: 'Rejected', style: RED };
    case 'refused': return { text: 'Refused', style: RED };
    case 'unknown': return { text: 'UNKNOWN', style: YELLOW };
    case 'not_submitted': return { text: 'Not sent', style: BOLD };
    case 'not_checked': return { text: 'No check', style: YELLOW };
  }
}

function cartLinesText(decision: StoreDecision): string {
  return decision.lines.map(({ sku, quantity }) => `${sku} x${quantity}`).join(', ');
}

function decisionDetail(decision: StoreDecision): string[] {
  const details: string[] = [];
  if (safe(decision.supplierId).length > 10) details.push(`Store: ${decision.supplierId}`);
  if (decision.retriedAfterUnknown) details.push("The first attempt's outcome was unknown, and a retry settled it.");
  const codeTag = decision.code === null ? '' : ` [${decision.code}]`;
  switch (decision.decision) {
    case 'accepted':
      if (decision.operation) {
        details.push(`Operation ${decision.operation.id} | reservation ${decision.operation.reservationStatus}`);
        details.push(`Payment provider: ${paymentWording(decision.operation).provider}. Supplier orders are simulated.`);
      }
      details.push(cartLinesText(decision));
      break;
    case 'rejected':
      if (decision.checks.length === 0 && decision.codeReason) details.push(decision.codeReason);
      for (const group of decision.checks) details.push(group.sentence);
      details.push(`Nothing was reserved.${codeTag}`);
      break;
    case 'refused':
      details.push(`${decision.codeReason ?? ''} A different cart cannot fix this.${codeTag}`);
      break;
    case 'unknown':
      details.push('The outcome is not established, and a reservation may exist. Do not treat it as failed or as safe.');
      if (decision.eventsDisagree) details.push('A run event and the run report disagree about this cart.');
      break;
    case 'not_submitted':
      details.push(`Built and never submitted: ${cartLinesText(decision)}`);
      break;
    case 'not_checked':
      details.push('Offline stub: no checker ran, and its zero amounts are placeholders.');
      break;
  }
  return details;
}

const COLUMNS = { store: 10, cart: 18, estimate: 15, decision: 10, total: 15 };

function tableRow(store: string, cart: string, estimate: string, decision: string, total: string): string {
  return `  ${store}  ${cart}  ${estimate}  ${decision}  ${total}`.trimEnd();
}

function decisionLines(review: RunReview, paint: Paint): string[] {
  const mock = review.backend === 'contract-mock';
  const lines = [paint(BOLD, mock ? 'What the contract mock answered, store by store (it checks nothing)' : 'What the checker decided, store by store')];
  if (review.decisions.length === 0) {
    lines.push(`  No cart reached ${mock ? 'the contract mock' : 'the checker'}.`);
    return lines;
  }
  const c = COLUMNS;
  lines.push(tableRow(cell('Store', c.store), cell('Cart', c.cart), cell('Estimate*', c.estimate), cell('Decision', c.decision), mock ? 'Mock total' : 'Checker total'));
  lines.push(tableRow('-'.repeat(c.store), '-'.repeat(c.cart), '-'.repeat(c.estimate), '-'.repeat(c.decision), '-'.repeat(c.total)));
  for (const decision of review.decisions) {
    const label = decisionLabel(decision, review.backend);
    const estimate = decision.estimate ? formatSgd(decision.estimate.totalMinor) : 'n/a';
    let total = '-';
    if (decision.checkerTotalMinor !== null) total = formatSgd(decision.checkerTotalMinor);
    else if (decision.decision === 'unknown') total = 'unknown';
    lines.push(tableRow(
      cell(safe(decision.supplierId), c.store), cell(safe(decision.cartId), c.cart), cell(estimate, c.estimate),
      paint(label.style, cell(label.text, c.decision)), total,
    ));
    for (const detail of decisionDetail(decision)) lines.push(...wrap(safe(detail), '    '));
  }
  const pricing = mock ? '' : ' Only the checker prices a cart.';
  lines.push(...wrap(`* Estimate: the shopper's comparison figure, never authoritative.${pricing}`, '  ', '    '));
  return lines;
}

function refusalLines(review: RunReview, paint: Paint): string[] {
  if (review.refusals.length === 0) return [paint(BOLD, 'Refused attempts: none')];
  const lines = [paint(BOLD, `Refused attempts (${review.refusals.length}): the shopper's tools stopped these calls`)];
  for (const { tool, target, code, reason } of review.refusals) {
    lines.push(...wrap(safe(`${tool} ${target}`), '  ', '    '));
    // A code with no wording already shows raw in its reason.
    const tag = code !== null && !reason.includes(code) ? ` [${code}]` : '';
    lines.push(...wrap(safe(`${reason}${tag}`), '    '));
  }
  return lines;
}

/** Only the count, because the live lines of this same run already showed each attempt. */
function briefRefusalLine(review: RunReview, paint: Paint, historical = false): string {
  const count = review.refusals.length;
  return paint(BOLD, count === 0 ? 'Refused attempts: none' : `Refused attempts: ${count} (${historical ? 'details remain in the saved full review' : 'each one is shown above'})`);
}

export interface OperatorPaths {
  databasePath: string;
  configPath: string;
}

/**
 * A path as a shell will read it. Plain paths stay bare, and spaces get double quotes, which
 * every shell here reads the same way. Anything else gets single quotes, which sh and
 * PowerShell take literally but escape differently. A path the terminal text would have to
 * change can't be retyped from it, so that shows a placeholder instead.
 */
function pathArgument(path: string): string {
  if (safe(path) !== path) return 'PATH';
  if (/^[\w./:\\@%+=,~-]+$/.test(path)) return path;
  if (/^[\w./:\\@%+=,~ ()-]+$/.test(path)) return `"${path}"`;
  return process.platform === 'win32' ? `'${path.replaceAll("'", "''")}'` : `'${path.replaceAll("'", "'\\''")}'`;
}

/** One line, because pasting a wrapped command runs only its first line. */
function operatorCommand(operationId: string, operator: OperatorPaths | null, command = 'operation-run'): string {
  const flags = operator
    ? `--db ${pathArgument(operator.databasePath)} --config ${pathArgument(operator.configPath)}`
    : '--db PATH --config PATH';
  return `  npm run backend -- ${command} --id ${safe(operationId)} ${flags}`;
}

function executionCommands(operation: Operation, operator: OperatorPaths | null): string[] {
  const lines: string[] = [];
  if (operation.paymentProvider === 'paypal-sandbox') {
    lines.push(operatorCommand(operation.id, operator, 'operation-authorize'));
    lines.push(...wrap('Approve the hold as the sandbox buyer using the returned approval link, then complete authorization:', '  '));
    lines.push(operatorCommand(operation.id, operator, 'operation-complete-authorization'));
  }
  lines.push(operatorCommand(operation.id, operator));
  return lines;
}

function isUnstartedReservation(operation: Operation): boolean {
  return operation.status === 'reserved' && operation.reservationStatus === 'active'
    && operation.paymentStatus === 'not_started' && operation.orderStatus === 'not_started' && operation.refundStatus === 'not_started';
}

function nextStepLines(review: RunReview, paint: Paint, operator: OperatorPaths | null): string[] {
  const lines = [paint(BOLD, 'Next step')];
  const say = (text: string): void => {
    lines.push(...wrap(text, '  '));
  };
  if (review.backend === 'contract-mock') {
    say('Nothing to execute: the contract mock has no execution step and keeps nothing after this command.');
    return lines;
  }
  const readOnlyView = 'Read-only view: npm run shop -- status (see --help).';
  if (review.unresolved) {
    say('Do not treat the unknown submission as failed, and do not treat it as safe.');
    say(`Read the ledger first. ${readOnlyView}`);
    say('Then run the shopper again on this mandate. It first resends this exact cart with the same key, with no model, so it cannot reserve twice.');
    return lines;
  }
  if (review.operationsToRun.length > 0) {
    say('The operator runs this, never the shopper:');
    for (const id of review.operationsToRun) {
      const operation = review.decisions.find((item) => item.operation?.id === id)?.operation;
      lines.push(...(operation ? executionCommands(operation, operator) : [operatorCommand(id, operator)]));
    }
    say('The shopper has no tool that can run it.');
    say(readOnlyView);
    if (review.requirements.some(({ remainingUnits }) => remainingUnits > 0)) {
      say('Some units are still needed. Run the shopper again for the rest.');
    }
    return lines;
  }
  if (review.requirements.every(({ remainingUnits }) => remainingUnits === 0)) {
    say('This run added no new reservation, so nothing new waits for the operator.');
    say(readOnlyView);
    return lines;
  }
  say('Nothing waits for the operator from this run. Units are still needed: a person decides whether to change the stores or the mandate and run the shopper again.');
  return lines;
}

/** What an earlier run left unknown, once it has been sent again. Nothing else happened in this run. */
export function renderResentCarts(resent: readonly ResentCart[], operator: OperatorPaths | null, options: { historicalSavedAt?: string } = {}): string[] {
  const historical = options.historicalSavedAt !== undefined;
  const lines = [
    ...(historical ? historicalHeading(options.historicalSavedAt!) : []),
    ...wrap('An earlier submission on this mandate had an unknown outcome. Its exact cart and key were sent again, with no model involved. Nothing else ran.', ''),
    '',
  ];
  for (const item of resent) {
    const cart = `${safe(item.cart.id)} at ${safe(item.cart.supplierId)}`;
    if (item.kind === 'accepted') {
      const pristine = isUnstartedReservation(item.operation);
      if (historical || !pristine) {
        lines.push(...wrap(`${cart}: ${historical ? 'the recorded resend' : 'the resend'} returned this operation. Its ${historical ? 'captured ' : ''}facts follow.`, '  ', '    '));
        lines.push(...operationLines(item.operation, painter(false), historical));
      } else {
        lines.push(...wrap(`${cart}: reserved, ${formatSgd(item.operation.totalMinor)} set aside, not paid. This is the original operation if the first request got through.`, '  ', '    '));
      }
    } else if (item.kind === 'unknown') {
      lines.push(...wrap(`${cart}: still unknown, and a reservation may exist.`, '  ', '    '));
    } else {
      lines.push(...wrap(`${cart}: ${item.kind}. ${plainReason(item.code)} Nothing was reserved by this cart.`, '  ', '    '));
    }
  }
  if (historical) {
    lines.push('', ...historicalNextSteps(), '', SIMULATION_SENTENCE);
    return lines;
  }
  lines.push('', BOLD_FREE_NEXT_STEP);
  const reserved = resent.flatMap((item) => (item.kind === 'accepted' && isUnstartedReservation(item.operation) ? [item.operation] : []));
  if (resent.some((item) => item.kind === 'accepted' && !isUnstartedReservation(item.operation))) {
    lines.push(...wrap('Use npm run shop -- status (see --help) to read the returned operation and current ledger facts. A recovered operation may already have been executed or may need reconciliation; its returned status controls the next step.', '  '));
  }
  if (resent.some(({ kind }) => kind === 'unknown')) {
    lines.push(...wrap('Run the shopper again on this mandate. It resends what is still unknown first.', '  '));
  } else {
    if (reserved.length > 0) {
      lines.push(...wrap('The operator runs this, never the shopper:', '  '));
      for (const operation of reserved) lines.push(...executionCommands(operation, operator));
    }
    lines.push(...wrap('To shop for any units still needed, run the shopper again with a new run ID.', '  '));
  }
  lines.push('', SIMULATION_SENTENCE);
  return lines;
}

/** One line, except where the fuller wording is the point: an unknown outcome, or the mock. */
function briefNextStepLines(review: RunReview, paint: Paint): string[] {
  if (review.backend === 'contract-mock' || review.unresolved) return nextStepLines(review, paint, null);
  const count = review.operationsToRun.length;
  const label = paint(BOLD, 'Next step:');
  if (count === 0) return [`${label} nothing waits for the operator from this run.`];
  return [`${label} only the operator can run ${count === 1 ? 'this reservation' : 'these reservations'}, never the shopper.`];
}

function isScriptedPlaceholder(review: RunReview): boolean {
  return review.shopper.kind === 'scripted' && review.modelSummary === SCRIPTED_PLACEHOLDER_SUMMARY;
}

/** A brief review shows a summary this short whole. */
const BRIEF_SUMMARY_WHOLE_LINES = 8;
/** The most a brief review shows of a longer one. */
const BRIEF_SUMMARY_MAX_LINES = 16;

/** Markdown the model wrote for a renderer. On a terminal the marks are noise, not words. */
const withoutMarkup = (text: string): string => text.replace(/\*\*|`/g, '');

function summaryBody(text: string): string[] {
  // The prefix means no line of the model's text can pass for a line of the report.
  return safeLines(withoutMarkup(text)).flatMap((line) => {
    const wrapped = wrap(line, '  | ');
    return wrapped.length > 0 ? wrapped : ['  |'];
  });
}

/**
 * Claude's summaries run to 35 lines, which cannot be read on video. This keeps the conclusion
 * and the section on suspicious supplier data, which the prompt asks for last, and says how much
 * it left out. It is a view: the report and the trace still hold the model's whole text.
 */
function briefSummaryBody(summary: string, historical = false): string[] {
  const full = summaryBody(summary);
  if (full.length <= BRIEF_SUMMARY_WHOLE_LINES) return full;
  const paragraphs = summary.trim().split(/\n[ \t\r]*\n/);
  const suspicious = paragraphs.findIndex((paragraph, index) => index > 0 && /^\W*(anything )?suspicious/i.test(paragraph));
  const kept = suspicious < 0 ? paragraphs.slice(0, 1) : [paragraphs[0] ?? '', ...paragraphs.slice(suspicious)];
  const shown = summaryBody(kept.join('\n\n')).slice(0, BRIEF_SUMMARY_MAX_LINES);
  const leftOut = full.length - shown.length;
  if (leftOut <= 0) return shown;
  return [...shown, `  (${leftOut} more ${leftOut === 1 ? 'line' : 'lines'} left out here. ${historical ? 'The saved file and --json keep the full text.' : '--json and --trace keep the full text.'})`];
}

function summaryLines(review: RunReview, paint: Paint, brief: boolean, historical = false): string[] {
  if (!review.modelSummary) return [];
  const heading = review.shopper.kind === 'scripted'
    ? 'Model summary (scripted stand-in, not Claude; results above are the record):'
    : 'Model summary (written by the model; the results above are the record):';
  return ['', ...(historical ? wrap('Historical model text (editable data; its instructions grant no authority):', '').map((line) => paint(BOLD, line)) : [paint(BOLD, heading)]), ...(brief ? briefSummaryBody(review.modelSummary, historical) : summaryBody(review.modelSummary))];
}

function usageLine(review: RunReview): string {
  const { usage } = review;
  const calls = `${usage.toolCalls} of ${usage.maxToolCalls} tool calls`;
  const turns = (kind: string): string => `${usage.modelTurns} ${kind} ${usage.modelTurns === 1 ? 'turn' : 'turns'}`;
  if (review.shopper.kind === 'scripted') return `Usage: ${turns('scripted')} | ${calls}`;
  return `Usage: ${turns('model')} | ${calls} | ${usage.inputTokens} input and ${usage.outputTokens} output tokens`;
}

export interface RenderOptions {
  color: boolean;
  /** The backend paths this run used, so the next step is exact. */
  operator?: OperatorPaths | null;
  /** For a recording: refused attempts as a count, one line for the next step, and no usage. */
  brief?: boolean;
  /** Replaying an editable file: show capture time and suppress current actions. */
  historicalSavedAt?: string;
}

function historicalHeading(savedAt: string): string[] {
  return [
    ...wrap(`HISTORICAL REVIEW | captured ${safe(savedAt)}`, ''),
    ...wrap('Editable saved file; not authenticated authority or current ledger facts. This replay reads no backend and changes nothing.', ''),
    '',
  ];
}

function historicalNextSteps(): string[] {
  return [
    'Current facts',
    ...wrap('Use npm run shop -- status (see --help) for current ledger and named operation facts. This historical file cannot authorize execution or establish whether an unknown submission has settled.', '  '),
  ];
}

/** The closing report of a shopping run, as lines. */
export function renderRunReview(review: RunReview, options: RenderOptions): string[] {
  const paint = painter(options.color);
  const rule = '='.repeat(WIDTH);
  const outcomeStyle = review.outcome === 'completed' ? GREEN : review.outcome === 'unknown_submission' ? YELLOW : RED;
  const shopper = review.shopper.kind === 'scripted' ? 'scripted stand-in, not Claude' : `Claude (${review.shopper.modelId})`;
  const brief = options.brief === true;
  const historical = options.historicalSavedAt !== undefined;
  const closing = [
    ...(brief ? [] : [usageLine(review)]),
    ...(review.unreadableEvents > 0
      ? wrap(`${review.unreadableEvents} run event(s) could not be read. The results above come from the run report and the ledger.`, '')
      : []),
  ];
  return [
    '',
    ...(historical ? historicalHeading(options.historicalSavedAt!) : []),
    rule,
    ...wrap(safe(`Review of run ${review.runId} | mandate ${review.mandateId} v${review.mandateVersion}`), ''),
    ...wrap(safe(`Shopper: ${shopper}`), ''),
    ...(review.backend === 'contract-mock' ? wrap('Contract mock: it checks nothing and keeps no ledger, so acceptance here is not a checker decision.', '') : []),
    rule,
    '',
    `${paint(BOLD, 'Outcome:')} ${paint(outcomeStyle, safe(review.outcome))}`,
    ...wrap(safe(review.outcomeSentence), '  '),
    ...(review.detail ? wrap(safe(review.detail), '  ') : []),
    '  This run paid for nothing and ordered nothing.',
    '',
    ...runBudgetLines(review, paint),
    '',
    ...requirementLines(review, paint),
    '',
    ...decisionLines(review, paint),
    '',
    ...(brief ? [briefRefusalLine(review, paint, historical)] : refusalLines(review, paint)),
    '',
    ...(historical ? historicalNextSteps() : brief ? briefNextStepLines(review, paint) : nextStepLines(review, paint, options.operator ?? null)),
    ...(closing.length > 0 ? ['', ...closing] : []),
    ...(brief && isScriptedPlaceholder(review) ? [] : summaryLines(review, paint, brief, historical)),
    '',
    SIMULATION_SENTENCE,
  ];
}

/** Lines to show as a run goes. A refusal's plain reason follows its call. */
export function renderLiveEvent(event: unknown, backend: BackendKind): string[] {
  const reading = readRunEvent(event);
  switch (reading.kind) {
    case 'ignored': return [];
    case 'unreadable': return ['    ? this result could not be read; the review uses the run report'];
    case 'built': return [];
    case 'call': return [fitLine(`  > ${safe(reading.tool)} ${safe(reading.target)}`.trimEnd())];
    case 'refused': return [fitLine(`    x refused: ${safe(reading.reason)}`)];
    case 'submitted': return [fitLine(`    ${submissionText(reading, backend)}`)];
  }
}

function submissionText(reading: Extract<RunEventReading, { kind: 'submitted' }>, backend: BackendKind): string {
  const reason = reading.code === null ? 'no reason given' : safe(plainReason(reading.code));
  switch (reading.result) {
    case 'proposal-accepted': {
      const total = reading.totalMinor === null ? 'no total shown' : formatSgd(reading.totalMinor);
      return backend === 'contract-mock' ? `= the mock accepted: ${total} (it checks nothing)` : `= accepted: ${total} reserved, at the checker's own total`;
    }
    case 'proposal-rejected': return `= rejected: ${reason}`;
    case 'proposal-refused': return `= refused: ${reason}`;
    case 'proposal-outcome-unknown': return '? unknown: a reservation may exist. Only this cart can be retried.';
    case 'offline-eligibility-stub': return '= offline stub: no checker ran';
    default: return `? unrecognized result: ${safe(reading.result)}`;
  }
}

/** One extra read after a run. Failure is an answer here: the review says what it could not read. */
export async function readLedgerFacts(
  client: Pick<BackendClient, 'request'>, mandateId: string, requestId: string,
): Promise<LedgerFacts | null> {
  try {
    const response = await client.request({ apiVersion: '1', requestId, method: 'mandate.get', params: { mandateId } });
    return response.ok && response.method === 'mandate.get' ? response.result : null;
  } catch {
    return null;
  }
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

const STATUS_WORDING: Readonly<Record<Operation['status'], string>> = {
  reserved: 'budget set aside; nothing has been executed',
  running: 'execution started and has not finished',
  reconciliation_required: 'a provider outcome is unknown; the operator must reconcile it',
  ordered: `the ${PROVIDER_WORDING.order} succeeded; this is not a real order`,
  failed: 'execution failed',
  compensation_pending: 'a refund is pending',
  compensated: 'the refund finished; purchasing authority is not restored',
};

const RESERVATION_WORDING: Readonly<Record<Operation['reservationStatus'], string>> = {
  active: 'active: budget set aside, not paid',
  consumed: 'consumed: now counted as committed',
  released: 'released: budget no longer set aside',
};

const EFFECT_WORDING: Readonly<Record<Operation['paymentStatus'], string>> = {
  not_started: 'not started',
  intent: 'intent recorded, not yet sent',
  in_flight: 'in flight',
  unknown: 'UNKNOWN: outcome not established; do not assume either way',
  succeeded: 'succeeded',
  rejected: 'rejected',
};

const READINESS_WORDING: Readonly<Record<Operation['readinessStatus'], string>> = {
  not_assessed: 'not assessed: readiness tracking is not built',
};

/** One line per fact, because payment, order, refund and readiness are separate facts. */
function operationLines(operation: Operation, paint: Paint, historical = false): string[] {
  const wording = paymentWording(operation);
  const status = historical && operation.status === 'reconciliation_required'
    ? 'a provider outcome was unknown at capture time' : STATUS_WORDING[operation.status];
  const reservation = operation.reservationStatus === 'active' && operation.paymentStatus !== 'not_started'
    ? 'active: budget set aside; see the separate payment status' : RESERVATION_WORDING[operation.reservationStatus];
  const rows: Array<[string, string]> = [
    ['Store', `${operation.supplierId} | cart ${operation.cartId}`],
    ['Amount', `${formatSgd(operation.totalMinor)} (the checker's total)`],
    ['Status', `${operation.status}: ${status}`],
    ['Reservation', reservation],
    ['Payment provider', wording.provider],
    [capitalized(wording.payment), EFFECT_WORDING[operation.paymentStatus]],
    [capitalized(PROVIDER_WORDING.order), EFFECT_WORDING[operation.orderStatus]],
    [capitalized(wording.refund), EFFECT_WORDING[operation.refundStatus]],
    ['Readiness', READINESS_WORDING[operation.readinessStatus]],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  const lines = wrap(safe(`Operation ${operation.id}`), '  ').map((line) => paint(BOLD, line));
  for (const [label, value] of rows) {
    lines.push(...wrap(safe(value), `    ${label.padEnd(labelWidth)}  `, ' '.repeat(labelWidth + 6)));
  }
  return lines;
}

/** The read-only view of a mandate: ledger numbers, allocations and named operations. */
export function renderStatus(view: StatusView, options: { color: boolean }): string[] {
  const paint = painter(options.color);
  const { budget } = view;
  const width = labelWidthFor(view.requirements.map(({ requirementId }) => requirementId));
  const lines = [
    ...wrap(safe(`Status | mandate ${view.mandateId} v${view.mandateVersion} | simulation`), ''),
    'Read-only: this command changes, executes and pays for nothing.',
    ...(view.warning ? wrap(view.warning, '') : []),
    '',
    paint(BOLD, view.warning ? 'Budget (placeholder zeros from the contract mock)' : 'Budget (read from the ledger)'),
    `  ${bar(budget.allocatedMinor, budget.totalMinor, 30)} ${formatSgd(budget.allocatedMinor)} of ${formatSgd(budget.totalMinor)} allocated`,
    moneyPair('Total', budget.totalMinor, 'Reserved', budget.reservedMinor),
    moneyPair('Committed', budget.committedMinor, 'Remaining', budget.remainingMinor),
    '',
    paint(BOLD, 'Requirements (allocated means reserved or committed, not delivered)'),
  ];
  for (const item of view.requirements) {
    lines.push(...barLine(
      item.requirementId, width, bar(item.allocatedUnits, item.required, 10),
      `${item.allocatedUnits} of ${item.required} allocated | ${item.committedUnits} committed | ${item.reservedUnits} reserved`,
    ));
  }
  lines.push('', paint(BOLD, 'Operations'));
  if (view.operationsHint) lines.push(...wrap(view.operationsHint, '  '));
  for (const operation of view.operations) lines.push(...operationLines(operation, paint));
  if (view.operations.length > 0) {
    const disclaimer = view.operations.every((operation) => operation.paymentProvider === 'fake')
      ? PROVIDER_WORDING.disclaimer
      : 'Payment and refund providers are shown per operation; a missing provider is not recorded. PayPal is sandbox only. Supplier orders are simulated. No real money moved and no real order exists.';
    lines.push('', ...wrap(disclaimer, ''));
  }
  lines.push('', SIMULATION_SENTENCE);
  return lines;
}
