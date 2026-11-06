import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MandateSchema } from '../../../packages/contracts/src/index.ts';
import { DRAFT_MODEL_TOOLS, DRAFT_TOOL_NAME, draftMandateWithModel, type MandateDraftInput } from './mandate-drafter.ts';
import { contentDigest, createMandateDraft, MandateRequestSchema, reviewMandateDraft, UnconfirmedMandateSchema } from './mandate.ts';
import { createScriptedModel, ModelCallError, type ModelPrompt, type ModelToolResult, type ScriptedStep, type ShoppingModel } from './model.ts';

// These prove the host's handling of model output with a scripted model. They do not
// prove how a real model reads a request; that takes a live run.

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const now = '2026-11-06T09:00:00Z';
const policy = fixture('../../../config/policies/hardware.example.json');
const kit = fixture('../fixtures/engineering-kit.json');
const requestText = readFileSync(new URL('../fixtures/hire-request-text.txt', import.meta.url), 'utf8').trim();
const [scriptedCall] = fixture('../fixtures/draft-request-calls.json') as Array<{ tool: string; args: { request: Record<string, unknown>; assumptions: unknown[]; notCaptured: string[] } }>;
const goodArgs = scriptedCall!.args;
const input: MandateDraftInput = { requestText, policy, kit, clock: () => now, locations: ['singapore-office'], requestedModel: 'scripted' };

const propose = (args: unknown): ScriptedStep => ({ tool: DRAFT_TOOL_NAME, args });
const withRequest = (patch: Record<string, unknown>) => ({ ...goodArgs, request: { ...goodArgs.request, ...patch } });

/** Records what the host sends, so tests can see what reached the model and how often. */
function recording(steps: readonly ScriptedStep[], finalText?: string) {
  const inner = createScriptedModel(steps, finalText);
  const prompts: ModelPrompt[] = [];
  const results: ModelToolResult[][] = [];
  const model: ShoppingModel = {
    open(prompt) {
      prompts.push(prompt);
      const conversation = inner.open(prompt);
      return {
        next(toolResults) {
          results.push(toolResults);
          return conversation.next(toolResults);
        },
      };
    },
  };
  return { model, prompts, results };
}

test('a model answer becomes a policy-checked draft that cannot pass as a confirmed mandate', async () => {
  const { model } = recording([propose(goodArgs)]);
  const run = await draftMandateWithModel(input, model);
  assert.equal(run.outcome, 'drafted');
  assert.equal(run.detail, null);
  const draft = run.draft!;
  assert.equal(draft.status, 'draft');
  assert.deepEqual(draft.request, MandateRequestSchema.parse(goodArgs.request));
  assert.deepEqual(draft.proposal.requirements.map(({ id, quantity }) => [id, quantity]), [['engineering-laptops', 5], ['engineering-monitors', 5]]);
  // Cannot execute: both the artifact and its proposal fail the confirmed schema.
  assert.equal(MandateSchema.safeParse(draft).success, false);
  assert.equal(MandateSchema.safeParse(draft.proposal).success, false);
  assert.equal('approvedBy' in draft.proposal, false);
  assert.equal(UnconfirmedMandateSchema.safeParse(draft.proposal).success, true);
});

test('the draft keeps the request text, assumptions and omissions for the reviewer', async () => {
  const run = await draftMandateWithModel(input, recording([propose(goodArgs)]).model);
  assert.deepEqual(run.draft!.origin, {
    kind: 'model-drafted', requestedModel: 'scripted', requestText,
    assumptions: goodArgs.assumptions, notCaptured: goodArgs.notCaptured,
  });
  const review = reviewMandateDraft(run.draft, policy, kit, now);
  assert.equal(review.decision, 'draft_valid');
  assert.deepEqual(review.origin, run.draft!.origin);
});

test('editing an assumption or omission after drafting fails review', async () => {
  const { draft } = await draftMandateWithModel(input, recording([propose(goodArgs)]).model);
  for (const origin of [
    { ...draft!.origin, assumptions: [] },
    { ...draft!.origin, notCaptured: [] },
    { ...draft!.origin, requestText: 'Something else' },
  ]) {
    const review = reviewMandateDraft({ ...draft, origin }, policy, kit, now);
    assert.equal(review.decision, 'needs_revision');
    assert.equal(review.checks.find(({ code }) => code === 'DRAFT_DIGEST')?.status, 'fail');
  }
});

test('the model is given the request, clock, kit and choices, but no policy limits or approval fields', async () => {
  const { model, prompts } = recording([propose(goodArgs)]);
  await draftMandateWithModel(input, model);
  const [prompt] = prompts;
  assert.equal(prompts.length, 1);
  assert.deepEqual(prompt!.tools.map(({ name }) => name), [DRAFT_TOOL_NAME]);
  const task = JSON.parse(prompt!.task.slice(prompt!.task.indexOf('{'))) as Record<string, unknown>;
  assert.equal(task.currentTime, now);
  assert.equal(task.requestText, requestText);
  assert.deepEqual(task.approvedSuppliers, ['store-a', 'store-b']);
  assert.deepEqual(task.deliveryLocations, ['singapore-office']);
  assert.doesNotMatch(prompt!.task, /maxBudgetMinor|maxUnitPriceMinor|maxUnits/);
  // Nothing in the tool's schema can carry an identity, confirmation or stock claim.
  assert.doesNotMatch(JSON.stringify(DRAFT_MODEL_TOOLS), /approvedBy|confirmedAt|stockAssignments|\$schema/);
});

test('the host still rejects impossible dates, though the model-facing schema omits the regex', async () => {
  assert.doesNotMatch(JSON.stringify(DRAFT_MODEL_TOOLS), /"pattern"/);
  assert.match(JSON.stringify(DRAFT_MODEL_TOOLS), /"format":"date-time"/);
  for (const patch of [{ readyBy: '2026-11-31T09:00:00Z' }, { readyBy: '2026-11-19' }, { purchaseBy: 'soon' }]) {
    const run = await draftMandateWithModel(input, recording([propose(withRequest(patch))]).model);
    assert.equal(run.outcome, 'invalid_output', JSON.stringify(patch));
    assert.equal(run.draft, null);
  }
});

test('a number the format cannot hold ends the run, so a retry cannot turn it into a different request', async () => {
  for (const [patch, field] of [
    [{ hireCount: 1001 }, 'hireCount'], [{ hireCount: 0 }, 'hireCount'], [{ hireCount: 1.5 }, 'hireCount'],
    [{ budgetMinor: 2_000_000_000 }, 'budgetMinor'], [{ budgetMinor: -1 }, 'budgetMinor'],
    [{ kitVersion: 0 }, 'kitVersion'],
  ] as const) {
    // The second step would pass. It must never be asked for.
    const { model, results } = recording([propose(withRequest(patch)), propose(goodArgs)]);
    const run = await draftMandateWithModel(input, model);
    assert.equal(run.outcome, 'policy_refused', JSON.stringify(patch));
    assert.match(run.detail!, new RegExp(field));
    assert.equal(run.draft, null);
    assert.equal(results.length, 1, 'The model must not get another turn');
  }
});

test('a stated value of the wrong type ends the run too', async () => {
  for (const patch of [{ hireCount: 'five' }, { budgetMinor: '8000' }, { allowedSuppliers: [] }, { allowedSuppliers: 'store-a' }, { kitVersion: 'one' }]) {
    const { model, results } = recording([propose(withRequest(patch)), propose(goodArgs)]);
    const run = await draftMandateWithModel(input, model);
    assert.equal(run.outcome, 'invalid_output', JSON.stringify(patch));
    assert.equal(run.draft, null);
    assert.equal(results.length, 1, 'The model must not get another turn');
  }
});

test('a retry can correct the format but cannot change what the manager asked for', async () => {
  // The first attempt is rejected for a reason that has nothing to do with these values.
  const { notCaptured: _omitted, ...malformed } = goodArgs;
  for (const [field, value] of [
    ['hireCount', 4], ['budgetMinor', 700000], ['purchaseBy', '2026-11-15T09:00:00Z'], ['readyBy', '2026-11-20T09:00:00Z'],
    ['deliveryLocationId', 'other-office'], ['allowedSuppliers', ['store-a']], ['kitId', 'other'], ['kitVersion', 2],
  ] as const) {
    const { model, results } = recording([propose(malformed), propose(withRequest({ [field]: value }))]);
    const run = await draftMandateWithModel({ ...input, locations: ['singapore-office', 'other-office'] }, model);
    assert.equal(run.outcome, 'invalid_output', field);
    assert.match(run.detail!, new RegExp(`changed ${field}`));
    assert.equal(run.draft, null);
    assert.equal(results.length, 2);
  }
});

test('a value missing on the first attempt can still be supplied on the retry', async () => {
  const { purchaseBy: _omitted, ...request } = goodArgs.request;
  const run = await draftMandateWithModel(input, recording([propose({ ...goodArgs, request }), propose(goodArgs)]).model);
  assert.equal(run.outcome, 'drafted');
  assert.equal(run.draft!.request.purchaseBy, goodArgs.request.purchaseBy);
});

test('the deadline is checked against the time the model answered, not the time it was asked', async () => {
  let time = now;
  const prompts: ModelPrompt[] = [];
  const inner = createScriptedModel([propose(goodArgs)]);
  const model: ShoppingModel = {
    open(prompt) {
      prompts.push(prompt);
      const conversation = inner.open(prompt);
      return {
        next(results) {
          // One second past goodArgs' purchase deadline of 2026-11-16T09:00:00Z.
          time = '2026-11-16T09:00:01Z';
          return conversation.next(results);
        },
      };
    },
  };
  const run = await draftMandateWithModel({ ...input, clock: () => time }, model);
  assert.equal(run.outcome, 'policy_refused');
  assert.match(run.detail!, /deadline has passed/);
  assert.equal(run.draft, null);
  // The model was asked before the deadline, so only the second reading catches this.
  assert.match(prompts[0]!.task, /"currentTime":"2026-11-06T09:00:00Z"/);
});

test('the draft records when the model answered, and a fixed clock stays fixed for rehearsals', async () => {
  let time = now;
  const inner = createScriptedModel([propose(goodArgs)]);
  const model: ShoppingModel = {
    open(prompt) {
      const conversation = inner.open(prompt);
      return {
        next(results) {
          time = '2026-11-06T09:05:00Z';
          return conversation.next(results);
        },
      };
    },
  };
  const moved = await draftMandateWithModel({ ...input, clock: () => time }, model);
  assert.equal(moved.draft!.createdAt, '2026-11-06T09:05:00Z');
  const fixed = await draftMandateWithModel(input, recording([propose(goodArgs)]).model);
  assert.equal(fixed.draft!.createdAt, now);
});

test('malformed output goes back to the model with the reason, and a correction can succeed', async () => {
  const { model, results } = recording([propose({ ...goodArgs, notCaptured: 'nothing' }), propose(goodArgs)]);
  const run = await draftMandateWithModel(input, model);
  assert.equal(run.outcome, 'drafted');
  assert.equal(run.usage.modelTurns, 2);
  const [failure] = results[1]!;
  assert.equal(failure!.isError, true);
  assert.match(failure!.content, /INVALID_REQUEST/);
  assert.match(failure!.content, /notCaptured/);
});

test('invented authority and unknown fields never reach a draft', async () => {
  for (const args of [
    withRequest({ approvedBy: 'CFO' }),
    withRequest({ confirmedAt: now }),
    withRequest({ stockAssignments: ['spare-1'] }),
    { ...goodArgs, approved: true },
    { ...goodArgs, assumptions: [{ field: 'approvedBy', reason: 'The CFO agreed.' }] },
  ]) {
    const run = await draftMandateWithModel(input, recording([propose(args), propose(args), propose(args)]).model);
    assert.equal(run.outcome, 'invalid_output', JSON.stringify(args));
    assert.equal(run.draft, null);
  }
});

test('retries stop at the turn limit', async () => {
  const bad = propose({ ...goodArgs, notCaptured: 'nothing' });
  const { model, results } = recording([bad, bad, bad, bad, bad]);
  const run = await draftMandateWithModel(input, model);
  assert.equal(run.outcome, 'invalid_output');
  assert.equal(run.usage.modelTurns, 3);
  assert.equal(results.length, 3);
});

test('a policy refusal ends the run, so the model cannot adjust numbers until they pass', async () => {
  for (const [patch, pattern] of [
    [{ budgetMinor: 2_000_000 }, /budget exceeds company policy/],
    [{ allowedSuppliers: ['store-z'] }, /supplier outside company policy/],
    [{ hireCount: 21 }, /units exceed company policy/],
    [{ kitId: 'sales' }, /exact kit/],
    [{ purchaseBy: '2026-11-20T09:00:00Z' }, /on or before the equipment readiness date/],
    [{ purchaseBy: '2026-11-05T09:00:00Z' }, /deadline has passed/],
  ] as const) {
    // The second step would pass. It must never be asked for.
    const { model, results } = recording([propose(withRequest(patch)), propose(goodArgs)]);
    const run = await draftMandateWithModel(input, model);
    assert.equal(run.outcome, 'policy_refused', JSON.stringify(patch));
    assert.match(run.detail!, pattern);
    assert.equal(run.draft, null);
    assert.equal(results.length, 1, 'The model must not get another turn');
    assert.deepEqual(run.refused?.request, MandateRequestSchema.parse(withRequest(patch).request));
    assert.deepEqual(run.refused?.notCaptured, goodArgs.notCaptured);
  }
});

test('a location the operator has not listed ends the run, and is never swapped for one that is', async () => {
  const { model, results } = recording([propose(withRequest({ deliveryLocationId: 'jakarta-office' })), propose(goodArgs)]);
  const run = await draftMandateWithModel(input, model);
  assert.equal(run.outcome, 'policy_refused');
  assert.match(run.detail!, /jakarta-office/);
  assert.equal(run.draft, null);
  assert.equal(run.refused?.request.deliveryLocationId, 'jakarta-office');
  assert.equal(results.length, 1, 'The model must not get another turn');

  const listed = await draftMandateWithModel({ ...input, locations: ['jakarta-office'] }, recording([
    propose(withRequest({ deliveryLocationId: 'jakarta-office' })),
  ]).model);
  assert.equal(listed.outcome, 'drafted');
});

test('model-chosen IDs are limited to what a terminal can show, and only they can be retried freely', async () => {
  for (const id of ['Engineering Hires', 'engineering\u001b[31m-hires', 'a'.repeat(65)]) {
    const { model, results } = recording([propose(withRequest({ id })), propose(goodArgs)]);
    const run = await draftMandateWithModel(input, model);
    assert.equal(run.outcome, 'drafted', id);
    assert.equal(run.draft!.request.id, goodArgs.request.id);
    assert.equal(results[1]![0]!.isError, true);
  }
});

test('a model that asks a question produces no draft and its question is passed on', async () => {
  const run = await draftMandateWithModel(input, recording([], 'What is the budget?').model);
  assert.equal(run.outcome, 'needs_input');
  assert.equal(run.modelText, 'What is the budget?');
  assert.equal(run.draft, null);
});

test('calls in a truncated or refused turn are never used', async () => {
  for (const [stop, outcome] of [['max_tokens', 'failed'], ['refusal', 'model_refused'], ['other', 'failed']] as const) {
    const { model, results } = recording([{ calls: [{ tool: DRAFT_TOOL_NAME, args: goodArgs }], stop }]);
    const run = await draftMandateWithModel(input, model);
    assert.equal(run.outcome, outcome, stop);
    assert.equal(run.draft, null);
    assert.equal(results.length, 1);
  }
});

test('two proposals in one turn could be two readings of the request, so neither is used', async () => {
  const two = { calls: [{ tool: DRAFT_TOOL_NAME, args: withRequest({ hireCount: 1001 }) }, { tool: DRAFT_TOOL_NAME, args: goodArgs }] };
  const { model, results } = recording([two, propose(goodArgs)]);
  const run = await draftMandateWithModel(input, model);
  assert.equal(run.outcome, 'invalid_output');
  assert.equal(run.draft, null);
  assert.equal(results.length, 1, 'The model must not get another turn');
});

test('a call to any other tool is refused, and the model can then call the right one', async () => {
  const { model, results } = recording([{ tool: 'cart_submit', args: { cartId: 'x' } }, propose(goodArgs)]);
  const run = await draftMandateWithModel(input, model);
  assert.equal(run.outcome, 'drafted');
  assert.ok(results[1]!.every(({ isError, content }) => isError && /INVALID_TOOL_CALL/.test(content)));
});

test('a failed model call reports only fixed wording', async () => {
  const failing = (error: unknown): ShoppingModel => ({
    open: () => ({ next: () => Promise.reject(error) }),
  });
  const safe = await draftMandateWithModel(input, failing(new ModelCallError('Claude rate limit reached after retries')));
  assert.equal(safe.outcome, 'failed');
  assert.equal(safe.detail, 'Claude rate limit reached after retries');
  const other = await draftMandateWithModel(input, failing(new Error('provider text with the request in it')));
  assert.equal(other.outcome, 'failed');
  assert.equal(other.detail, 'The model call failed');
});

test('bad local input fails before any model call', async () => {
  for (const patch of [
    { requestText: '   ' },
    { requestText: 'x'.repeat(4001) },
    { policy: { id: 'not a policy' } },
    { kit: { id: 'not a kit' } },
    { locations: [] },
    { clock: () => 'tomorrow' },
  ]) {
    const { model, prompts } = recording([propose(goodArgs)]);
    await assert.rejects(draftMandateWithModel({ ...input, ...patch }, model), JSON.stringify(patch));
    assert.equal(prompts.length, 0);
  }
});

test('a hand-written request produces no origin, and the digest covers exactly its content', () => {
  const handWritten = fixture('../fixtures/demo-hire-request.json');
  const draft = createMandateDraft(policy, handWritten, kit, now);
  assert.equal('origin' in draft, false);
  const { digest, ...content } = draft;
  assert.equal(digest, contentDigest(content));
  assert.equal('origin' in reviewMandateDraft(draft, policy, kit, now), false);
});
