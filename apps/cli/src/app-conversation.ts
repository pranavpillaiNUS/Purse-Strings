import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSavedReview } from '../../../services/agent/src/saved-review.ts';
import type { DashboardState } from './dashboard-state.ts';
import { DEMO_SCENES, formatMinor } from './demo-flow.ts';

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
}

export interface DraftOrigin {
  requestText: string;
  assumptions: Array<{ field: string; reason: string }>;
  notCaptured: string[];
}

export interface ReviewRecord {
  runId: string;
  shopper: 'scripted' | 'live';
  decisions: Array<{ supplierId: string; decision: string; checkerTotalMinor: number | null; code: string | null; codeReason: string | null }>;
  refusals: number;
  modelSummary: string | null;
}

const MAX_LINE = 500;
const clip = (text: string): string => (text.length > MAX_LINE ? `${text.slice(0, MAX_LINE - 1)}…` : text);

/** Which scene each shopper run belongs to in demo:flow. */
const RUN_SCENES: Readonly<Record<string, number>> = { compromised: 4, 'hostile-check': 4, recovery: 5 };

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readDraft(directory: string): DraftOrigin | null {
  const text = readText(join(directory, 'draft.json'));
  if (text === null) return null;
  try {
    const origin = (JSON.parse(text) as { origin?: unknown }).origin as Partial<DraftOrigin> | undefined;
    if (!origin || typeof origin.requestText !== 'string' || !Array.isArray(origin.assumptions) || !Array.isArray(origin.notCaptured)) return null;
    const assumptions = origin.assumptions.filter(
      (item): item is { field: string; reason: string } => typeof item?.field === 'string' && typeof item?.reason === 'string',
    ).map(({ field, reason }) => ({ field, reason }));
    const notCaptured = origin.notCaptured.filter((item): item is string => typeof item === 'string');
    return { requestText: origin.requestText, assumptions, notCaptured };
  } catch {
    return null;
  }
}

/** Reads the request, draft and saved shopper reviews a take wrote. Unreadable files are skipped. */
export function readTakeRecords(takeDirectory: string): { requestText: string | null; draft: DraftOrigin | null; reviews: ReviewRecord[] } {
  const reviews: ReviewRecord[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(takeDirectory).filter((name) => name.endsWith('.review.json')).sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    try {
      const saved = parseSavedReview(JSON.parse(readFileSync(join(takeDirectory, name), 'utf8')));
      if (saved.kind !== 'saved-shop-review') continue;
      const { review } = saved;
      reviews.push({
        runId: review.runId,
        shopper: review.shopper.kind === 'live' ? 'live' : 'scripted',
        decisions: review.decisions.map(({ supplierId, decision, checkerTotalMinor, code, codeReason }) => ({ supplierId, decision, checkerTotalMinor, code, codeReason })),
        refusals: review.refusals.length,
        modelSummary: review.modelSummary,
      });
    } catch {
      // A file that is not a valid saved review is not evidence of anything.
    }
  }
  const request = readText(join(takeDirectory, 'request.txt'));
  return { requestText: request === null ? null : request.trim(), draft: readDraft(takeDirectory), reviews };
}

function reviewEntries(review: ReviewRecord, scene: number): ConversationEntry[] {
  const entries: ConversationEntry[] = [];
  if (review.runId === 'compromised') {
    entries.push({ actor: 'stand-in', scene, title: 'A scripted stand-in obeys the hostile listing (not Claude)', detail: [], tone: 'neutral' });
  }
  if (review.shopper === 'live' && review.modelSummary !== null && review.modelSummary.trim().length > 0) {
    entries.push({
      actor: 'claude', scene, title: "Claude's summary (Claude's words)",
      detail: review.modelSummary.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0).map(clip),
      tone: 'neutral',
    });
  }
  if (review.refusals > 0) {
    const reserved = review.decisions.some((decision) => decision.decision === 'accepted');
    entries.push({
      actor: 'checker', scene,
      title: `Checker refused ${review.refusals} ${review.refusals === 1 ? 'attempt' : 'attempts'}${reserved ? '' : '; nothing was reserved'}`,
      detail: [], tone: 'refused',
    });
  }
  for (const decision of review.decisions) {
    if (decision.decision === 'accepted' && decision.checkerTotalMinor !== null) {
      entries.push({ actor: 'checker', scene, title: `Checker accepted ${decision.supplierId}: reserved ${formatMinor(decision.checkerTotalMinor)}`, detail: [], tone: 'accepted' });
    } else if (decision.decision === 'rejected' || decision.decision === 'refused') {
      const reason = decision.codeReason ?? decision.code;
      entries.push({ actor: 'checker', scene, title: `Checker refused ${decision.supplierId}`, detail: reason === null ? [] : [clip(reason)], tone: 'refused' });
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
    : operation.paymentProvider === 'fake' ? 'Payment: fake provider, no real money' : 'Payment provider: unknown';
  return {
    actor: 'system', scene: 6, title: `Executed at ${operation.supplierId}: ${formatMinor(operation.totalMinor)}`,
    detail: [payment, 'Supplier order: simulated, not a real order', 'Readiness: not assessed'], tone: 'accepted',
  };
}

export function buildConversation(input: {
  mode: 'scripted' | 'live' | null;
  requestText: string | null;
  draft: DraftOrigin | null;
  reviews: ReviewRecord[];
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
        ...input.draft.assumptions.map(({ field, reason }) => clip(`Assumed ${field}: ${reason}`)),
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
  for (let scene = 1; scene <= Math.min(last, DEMO_SCENES.length); scene += 1) {
    if (scene <= reached) entries.push({ actor: 'system', scene, title: `Scene ${scene}: ${DEMO_SCENES[scene - 1]}`, detail: [], tone: 'neutral' });
    entries.push(...(byScene.get(scene) ?? []));
  }
  return entries;
}
