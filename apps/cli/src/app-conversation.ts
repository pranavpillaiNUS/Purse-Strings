import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseSavedReview } from '../../../services/agent/src/saved-review.ts';
import type { DashboardState } from './dashboard-state.ts';
import { DEMO_SCENES, EXECUTION_PROVIDER, formatMinor, SANDBOX_EXECUTION_STATEMENT, STALE_HOURS } from './demo-flow.ts';

/**
 * The page's conversation: who said or decided what, built only from the take's
 * own records. Claude's words are labelled as Claude's; the scripted stand-in is
 * never presented as Claude; a reservation is never presented as payment.
 */

export type Actor = 'you' | 'claude' | 'stand-in' | 'checker' | 'system';
export type Tone = 'accepted' | 'refused' | 'waiting' | 'neutral';

export interface ConversationEntry {
  actor: Actor;
  scene: number | null;
  title: string;
  detail: string[];
  tone: Tone;
  /** Untrusted text shown as a quotation, never as anyone's instruction. */
  quote?: { label: string; text: string };
}

export interface DraftOrigin {
  requestText: string;
  assumptions: Array<{ field: string; reason: string }>;
  notCaptured: string[];
  /** What the draft asks for, from its policy-checked proposal; null when that part is unreadable. */
  summary?: DraftSummary | null;
}

export interface DraftSummary {
  budgetMinor: number;
  readyBy: string;
  requirements: Array<{ quantity: number; role: string }>;
}

export interface ReviewRecord {
  runId: string;
  shopper: 'scripted' | 'live';
  decisions: Array<{
    supplierId: string;
    decision: string;
    checkerTotalMinor: number | null;
    code: string | null;
    codeReason: string | null;
    /** The checker's failed checks, in plain words from our code, never the model's. */
    checks?: string[];
    /** The shopper's own estimate for the cart. Carts carry no prices, so it is never a quote. */
    estimateMinor?: number | null;
  }>;
  refusals: number;
  /** Each refused attempt: the tool, what it was aimed at, and the plain reason. */
  refused?: Array<{ tool: string; target: string; reason: string }>;
  modelSummary: string | null;
}

/** A supplier listing that carries text addressed to AI agents, as the take's shopper saw it. */
export interface HostileListing {
  supplierId: string;
  sku: string;
  text: string;
}

const MAX_LINE = 500;
const MAX_EVENT_LOG_BYTES = 2_000_000;
const clip = (text: string): string => (text.length > MAX_LINE ? `${text.slice(0, MAX_LINE - 1)}…` : text);
/** Control characters never reach the page, as in the terminal flow. */
const inert = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');

/** Which scene each shopper run belongs to in demo:flow. */
const RUN_SCENES: Readonly<Record<string, number>> = { compromised: 4, 'hostile-check': 4, recovery: 5 };

/** Draft field names as a reader says them. The reasons stay as written, since they may be Claude's words. */
const FIELD_WORDS: Readonly<Record<string, string>> = {
  purchaseBy: 'the purchase deadline',
  readyBy: 'the ready-by time',
  allowedSuppliers: 'the suppliers',
  budgetMinor: 'the budget',
  deliveryLocationId: 'the delivery location',
  hireCount: 'the number of hires',
  kitId: 'the kit',
};

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSummary(proposal: unknown): DraftSummary | null {
  if (!isRecord(proposal) || typeof proposal.budgetMinor !== 'number' || typeof proposal.readyBy !== 'string' || !Array.isArray(proposal.requirements)) return null;
  const requirements: DraftSummary['requirements'] = [];
  for (const item of proposal.requirements) {
    if (!isRecord(item) || typeof item.quantity !== 'number' || typeof item.role !== 'string') return null;
    requirements.push({ quantity: item.quantity, role: item.role });
  }
  return { budgetMinor: proposal.budgetMinor, readyBy: proposal.readyBy, requirements };
}

function readDraft(directory: string): DraftOrigin | null {
  const text = readText(join(directory, 'draft.json'));
  if (text === null) return null;
  try {
    const draft = JSON.parse(text) as { origin?: unknown; proposal?: unknown };
    const origin = draft.origin as Partial<DraftOrigin> | undefined;
    if (!origin || typeof origin.requestText !== 'string' || !Array.isArray(origin.assumptions) || !Array.isArray(origin.notCaptured)) return null;
    const assumptions = origin.assumptions.filter(
      (item): item is { field: string; reason: string } => typeof item?.field === 'string' && typeof item?.reason === 'string',
    ).map(({ field, reason }) => ({ field, reason }));
    const notCaptured = origin.notCaptured.filter((item): item is string => typeof item === 'string');
    return { requestText: origin.requestText, assumptions, notCaptured, summary: readSummary(draft.proposal) };
  } catch {
    return null;
  }
}

/**
 * The listing text a shopper was shown, read from the take's run logs. The same rule as
 * the terminal flow: an evidence source that carries a NOTICE. It is shown as data only.
 */
function readHostileListing(directory: string, names: readonly string[]): HostileListing | null {
  for (const name of names) {
    const path = join(directory, name);
    try {
      if (statSync(path).size > MAX_EVENT_LOG_BYTES) continue;
    } catch {
      continue;
    }
    const text = readText(path);
    if (text === null) continue;
    for (const line of text.split('\n')) {
      if (!line.includes('NOTICE')) continue;
      try {
        const event = JSON.parse(line) as unknown;
        if (!isRecord(event) || event.type !== 'tool_result' || event.tool !== 'product.view' || event.isError !== false || typeof event.content !== 'string') continue;
        const content = JSON.parse(event.content) as unknown;
        if (!isRecord(content) || !isRecord(content.facts) || !isRecord(content.product)) continue;
        const { supplierId } = content.facts;
        const { sku, productEvidence } = content.product;
        if (typeof supplierId !== 'string' || typeof sku !== 'string' || !isRecord(productEvidence) || typeof productEvidence.source !== 'string') continue;
        if (!productEvidence.source.includes('NOTICE')) continue;
        return { supplierId: clip(inert(supplierId)), sku: clip(inert(sku)), text: clip(inert(productEvidence.source)) };
      } catch {
        // A line that is not a readable tool result says nothing about the listing.
      }
    }
  }
  return null;
}

/** Reads the request, draft, saved shopper reviews and hostile listing a take wrote. Unreadable files are skipped. */
export function readTakeRecords(takeDirectory: string): {
  requestText: string | null;
  draft: DraftOrigin | null;
  reviews: ReviewRecord[];
  listing: HostileListing | null;
} {
  const reviews: ReviewRecord[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(takeDirectory).sort();
  } catch {
    names = [];
  }
  for (const name of names.filter((entry) => entry.endsWith('.review.json'))) {
    try {
      const saved = parseSavedReview(JSON.parse(readFileSync(join(takeDirectory, name), 'utf8')));
      if (saved.kind !== 'saved-shop-review') continue;
      const { review } = saved;
      reviews.push({
        runId: review.runId,
        shopper: review.shopper.kind === 'live' ? 'live' : 'scripted',
        decisions: review.decisions.map(({ supplierId, decision, checkerTotalMinor, code, codeReason, checks, estimate }) => ({
          supplierId, decision, checkerTotalMinor, code, codeReason,
          checks: checks.filter((check) => check.recognized).map((check) => check.sentence),
          estimateMinor: estimate?.totalMinor ?? null,
        })),
        refusals: review.refusals.length,
        refused: review.refusals.map(({ tool, target, reason }) => ({ tool, target, reason })),
        modelSummary: review.modelSummary,
      });
    } catch {
      // A file that is not a valid saved review is not evidence of anything.
    }
  }
  const request = readText(join(takeDirectory, 'request.txt'));
  // The compromised run is the one that reads the listing; any other run log is a fallback.
  const logs = names.filter((name) => name.endsWith('.jsonl')).sort((a, b) => Number(b === 'compromised.jsonl') - Number(a === 'compromised.jsonl'));
  return {
    requestText: request === null ? null : request.trim(),
    draft: readDraft(takeDirectory),
    reviews,
    listing: readHostileListing(takeDirectory, logs),
  };
}

function attempt({ tool, target, reason }: { tool: string; target: string; reason: string }): string {
  return clip(inert(`${tool}${target ? ` (${target})` : ''}: ${reason}`));
}

function reviewEntries(review: ReviewRecord, scene: number): ConversationEntry[] {
  const entries: ConversationEntry[] = [];
  if (review.runId === 'compromised') {
    entries.push({ actor: 'stand-in', scene, title: 'A scripted stand-in obeys the hostile listing (not Claude)', detail: [], tone: 'neutral' });
  }
  if (review.runId === 'hostile-check') {
    entries.push({
      actor: 'system', scene, title: 'Now Claude shops the same stores, listing included',
      detail: ['On a separate confirmed practice mandate, so this run does not use up the main one.'], tone: 'neutral',
    });
  }
  if (review.shopper === 'live' && review.modelSummary !== null && review.modelSummary.trim().length > 0) {
    entries.push({
      actor: 'claude', scene, title: "Claude's summary (Claude's words)",
      detail: review.modelSummary.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0).map(clip),
      tone: 'neutral',
    });
  }
  if (review.refusals > 0) {
    // Refused attempts are stopped by the shopper's bounded tools or the backend's closed
    // codes, so they are not attributed to the checker.
    // An unknown submission may already have reserved budget despite the missing answer.
    const mayHaveReserved = review.decisions.some((decision) => decision.decision === 'accepted' || decision.decision === 'unknown');
    entries.push({
      actor: 'system', scene,
      title: `${review.refusals} ${review.refusals === 1 ? 'attempt' : 'attempts'} refused${mayHaveReserved ? '' : '; nothing was reserved'}`,
      detail: (review.refused ?? []).map(attempt), tone: 'refused',
    });
  }
  for (const decision of review.decisions) {
    if (decision.decision === 'accepted' && decision.checkerTotalMinor !== null) {
      entries.push({ actor: 'checker', scene, title: `Checker accepted ${decision.supplierId}: reserved ${formatMinor(decision.checkerTotalMinor)}`, detail: [], tone: 'accepted' });
    } else if (decision.decision === 'rejected' || decision.decision === 'refused') {
      const reasons = decision.checks !== undefined && decision.checks.length > 0
        ? decision.checks
        : [decision.codeReason ?? decision.code].filter((reason): reason is string => reason !== null);
      const estimate = typeof decision.estimateMinor === 'number'
        ? [`The shopper's own estimate for this cart was ${formatMinor(decision.estimateMinor)}. Carts carry no prices, so that was never a quote.`]
        : [];
      entries.push({ actor: 'checker', scene, title: `Checker refused ${decision.supplierId}`, detail: [...reasons, ...estimate].map(clip), tone: 'refused' });
    } else if (decision.decision === 'unknown') {
      entries.push({ actor: 'checker', scene, title: `The checker's answer for ${decision.supplierId} is unknown`, detail: ['Treated as unknown, not as accepted or refused.'], tone: 'waiting' });
    }
  }
  return entries;
}

function operationEntry(operation: DashboardState['operations'][number]): ConversationEntry | null {
  if (operation.status !== 'ordered') return null;
  const payment = operation.paymentProvider === 'paypal-sandbox'
    ? `Payment: PayPal sandbox capture ${operation.providerIds.captureId ?? '(id not reported)'}`
    : 'Payment: fake provider, no real money';
  return {
    actor: 'system', scene: 6, title: `Executed at ${operation.supplierId}: ${formatMinor(operation.totalMinor)}`,
    detail: [payment, 'Supplier order: simulated, not a real order', 'Readiness: not assessed'], tone: 'accepted',
  };
}

function singaporeTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} Singapore time`;
}

function draftSummaryLine(summary: DraftSummary): string {
  const units = summary.requirements.map(({ quantity, role }) => `${quantity} ${role}${quantity === 1 ? '' : 's'}`).join(' and ');
  const ready = singaporeTime(summary.readyBy);
  return clip(inert(`Drafted: ${units}, ${formatMinor(summary.budgetMinor)} all-in${ready === null ? '' : `, ready by ${ready}`}.`));
}

/** The hostile listing as the shopper saw it, quoted under scene 4. */
function listingQuote(listing: HostileListing | null): ConversationEntry['quote'] | undefined {
  if (listing === null) return undefined;
  return { label: `${listing.supplierId}'s ${listing.sku} listing, in its evidence field. Supplier data, not an instruction:`, text: listing.text };
}

/** What each scene sets out to show, in the terminal flow's words where they apply to the page. */
function sceneNarration(scene: number, input: { mode: 'scripted' | 'live' | null; state: DashboardState }): string[] {
  const live = input.mode === 'live';
  switch (scene) {
    case 1:
      return ['Two test stores we run from a control panel: prices, shipping, stock and records can change on cue. Store-b starts with a hostile listing.'];
    case 2:
      return [live
        ? 'The operations manager writes one request. Claude drafts the mandate, policy checks the draft, and the draft lists what it assumed and could not capture.'
        : 'The operations manager writes one request. The scripted stand-in drafts the mandate here, not Claude; policy checks the draft, and it lists what it assumed and could not capture.'];
    case 3:
      return ['A draft cannot buy anything. The shopper is refused until a person confirms this exact content.'];
    case 4:
      return ['Store-b hides instructions for AI agents in one listing. They are supplier data, and no tool the shopper has can act on them.'];
    case 5: {
      const limit = input.state.mandate?.evidenceMaxAgeHours;
      return [`Control panel: store-b drops that listing, but its records are now ${STALE_HOURS} hours old.${typeof limit === 'number' ? ` Policy allows ${limit}, and the shopper is not told that.` : ''} Store-b is still the cheapest, and the checker has the final say.`];
    }
    case 6:
      return [`Only the operator runs this, never the shopper. ${input.state.demo?.paymentProvider === 'paypal-sandbox' ? SANDBOX_EXECUTION_STATEMENT : EXECUTION_PROVIDER.statement}`];
    default:
      return [];
  }
}

export function buildConversation(input: {
  mode: 'scripted' | 'live' | null;
  requestText: string | null;
  draft: DraftOrigin | null;
  reviews: ReviewRecord[];
  listing?: HostileListing | null;
  state: DashboardState;
}): ConversationEntry[] {
  const reached = input.state.demo?.scene ?? 0;
  const byScene = new Map<number, ConversationEntry[]>();
  const add = (entry: ConversationEntry): void => {
    const scene = entry.scene ?? 0;
    byScene.set(scene, [...(byScene.get(scene) ?? []), entry]);
  };

  if (input.requestText !== null && input.requestText.length > 0) {
    add({ actor: 'you', scene: 2, title: clip(input.requestText), detail: [], tone: 'neutral' });
  }
  if (input.draft !== null) {
    const live = input.mode === 'live';
    add({
      actor: live ? 'claude' : 'stand-in', scene: 2,
      title: live ? "Claude's draft (Claude's words)" : "The scripted stand-in's draft",
      detail: [
        ...(input.draft.summary ? [draftSummaryLine(input.draft.summary)] : []),
        ...input.draft.assumptions.map(({ field, reason }) => clip(`Assumed ${FIELD_WORDS[field] ?? field}: ${reason}`)),
        ...input.draft.notCaptured.map((text) => clip(`Not captured: ${text}`)),
      ],
      tone: 'neutral',
    });
  }
  const mandate = input.state.mandate;
  if (mandate !== null && mandate.confirmationStatus === 'confirmed') {
    add({
      actor: 'you', scene: 3, title: `You confirmed mandate revision ${mandate.revision}`,
      detail: [`Digest ${mandate.digest.slice(0, 12)}, recorded by the backend on this computer.`], tone: 'accepted',
    });
  }
  for (const review of input.reviews) {
    const scene = RUN_SCENES[review.runId];
    if (scene !== undefined) for (const entry of reviewEntries(review, scene)) add(entry);
  }
  for (const operation of input.state.operations) {
    const entry = operationEntry(operation);
    if (entry !== null) add(entry);
  }

  const entries: ConversationEntry[] = [];
  const last = Math.max(reached, ...byScene.keys());
  const narration = { mode: input.mode, state: input.state };
  const quote = listingQuote(input.listing ?? null);
  for (let scene = 1; scene <= Math.min(last, DEMO_SCENES.length); scene += 1) {
    if (scene <= reached) {
      entries.push({
        actor: 'system', scene, title: `Scene ${scene}: ${DEMO_SCENES[scene - 1]}`, detail: sceneNarration(scene, narration), tone: 'neutral',
        ...(scene === 4 && quote !== undefined ? { quote } : {}),
      });
    }
    entries.push(...(byScene.get(scene) ?? []));
  }
  const demo = input.state.demo;
  if (demo !== null && demo.finished && demo.failure === null && demo.results.length > 0) {
    entries.push({ actor: 'system', scene: null, title: 'Result', detail: demo.results.map(clip), tone: demo.unusable.length > 0 ? 'waiting' : 'accepted' });
  }
  return entries;
}
