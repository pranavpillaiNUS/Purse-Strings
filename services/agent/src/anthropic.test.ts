import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnthropicModel, DEFAULT_SHOPPER_MODEL } from './anthropic.ts';
import { ModelCallError, type ModelPrompt } from './model.ts';
import { SHOPPER_SYSTEM_PROMPT, SHOPPING_MODEL_TOOLS } from './worker.ts';

// These run the real SDK against a stubbed fetch. They prove the request and response
// mapping offline. They do not prove how the live API or a real model behaves.

const prompt: ModelPrompt = { system: SHOPPER_SYSTEM_PROMPT, tools: SHOPPING_MODEL_TOOLS, task: 'Shop for this mandate.' };

function message(content: unknown[], stopReason = 'end_turn', usage: Record<string, number> = {}) {
  return {
    id: 'msg_1', type: 'message', role: 'assistant', model: DEFAULT_SHOPPER_MODEL, content,
    stop_reason: stopReason, stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, ...usage },
  };
}

function stubFetch(responses: Array<{ status?: number; body: unknown }>) {
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    const next = responses.shift();
    assert.ok(next, 'Unexpected extra API request');
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { fetchStub, requests };
}

test('sends the expected model, tools, system prompt and refusal fallback', async () => {
  const { fetchStub, requests } = stubFetch([{ body: message([{ type: 'text', text: 'Done.' }]) }]);
  const conversation = createAnthropicModel({ apiKey: 'test-key', fetch: fetchStub }).open(prompt);
  const turn = await conversation.next([]);
  assert.equal(turn.stop, 'end_turn');
  assert.equal(turn.text, 'Done.');
  assert.deepEqual(turn.calls, []);

  const { url, headers, body } = requests[0]!;
  assert.match(url, /\/v1\/messages/);
  assert.match(headers.get('anthropic-beta') ?? '', /server-side-fallback-2026-07-01/);
  assert.match(`${headers.get('authorization')} ${headers.get('x-api-key')}`, /test-key/);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.output_config, { effort: 'medium' });
  assert.equal(body.system, SHOPPER_SYSTEM_PROMPT);
  assert.equal('thinking' in body, false);
  assert.equal('tool_choice' in body, false);
  const tools = body.tools as Array<{ name: string; input_schema: { type: string; additionalProperties: boolean } }>;
  assert.deepEqual(tools.map(({ name }) => name), ['catalog_search', 'product_view', 'cart_build', 'cart_submit']);
  for (const tool of tools) {
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(tool.input_schema.additionalProperties, false);
    assert.doesNotMatch(tool.name, /[^a-zA-Z0-9_-]/);
  }
  assert.deepEqual(body.messages, [{ role: 'user', content: 'Shop for this mandate.' }]);
});

test('the transcript is append-only: thinking replays unchanged and results follow their calls', async () => {
  const assistant = [
    { type: 'thinking', thinking: '', signature: 'sig-opaque' },
    { type: 'text', text: 'Checking the store.' },
    { type: 'tool_use', id: 'toolu_1', name: 'catalog_search', input: { supplierId: 'store-a', requirementId: 'r' } },
    { type: 'tool_use', id: 'toolu_2', name: 'catalog_search', input: { supplierId: 'store-b', requirementId: 'r' } },
  ];
  const { fetchStub, requests } = stubFetch([
    { body: message(assistant, 'tool_use', { cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }) },
    { body: message([{ type: 'text', text: 'Finished.' }]) },
  ]);
  const conversation = createAnthropicModel({ apiKey: 'test-key', fetch: fetchStub }).open(prompt);
  const first = await conversation.next([]);
  assert.equal(first.stop, 'tool_use');
  assert.equal(first.text, 'Checking the store.');
  assert.deepEqual(first.calls, [
    { id: 'toolu_1', name: 'catalog_search', input: { supplierId: 'store-a', requirementId: 'r' } },
    { id: 'toolu_2', name: 'catalog_search', input: { supplierId: 'store-b', requirementId: 'r' } },
  ]);
  assert.deepEqual(first.usage, { inputTokens: 130, outputTokens: 5 });

  await conversation.next([
    { id: 'toolu_1', content: '{"products":[]}', isError: false },
    { id: 'toolu_2', content: '{"error":{"code":"CATALOG_TIMEOUT"}}', isError: true },
  ]);
  const messages = requests[1]!.body.messages as Array<{ role: string; content: unknown }>;
  assert.equal(messages.length, 3);
  assert.deepEqual(messages[1], { role: 'assistant', content: assistant });
  // Every result for a turn travels in one user message.
  assert.deepEqual(messages[2], {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"products":[]}', is_error: false },
      { type: 'tool_result', tool_use_id: 'toolu_2', content: '{"error":{"code":"CATALOG_TIMEOUT"}}', is_error: true },
    ],
  });
});

test('stop reasons map so the worker can refuse to run truncated or refused calls', async () => {
  for (const [wire, expected] of [
    ['max_tokens', 'max_tokens'], ['refusal', 'refusal'], ['tool_use', 'tool_use'],
    ['end_turn', 'end_turn'], ['pause_turn', 'other'], ['model_context_window_exceeded', 'other'],
  ] as const) {
    const { fetchStub } = stubFetch([{ body: message([], wire) }]);
    const turn = await createAnthropicModel({ apiKey: 'test-key', fetch: fetchStub }).open(prompt).next([]);
    assert.equal(turn.stop, expected);
  }
});

test('API failures become fixed wording that cannot echo provider or request text', async () => {
  const secret = 'request-text-must-not-escape';
  for (const [status, pattern] of [
    [401, /rejected the API key/], [403, /may not use this model/], [404, /does not recognize this model/],
    [400, /rejected the request as invalid/], [422, /returned an error \(status 422\)/],
  ] as const) {
    const { fetchStub } = stubFetch([{ status, body: { type: 'error', error: { type: 'x', message: secret } } }]);
    const next = createAnthropicModel({ apiKey: 'test-key', fetch: fetchStub }).open(prompt).next([]);
    await assert.rejects(next, (error: unknown) => {
      assert.ok(error instanceof ModelCallError);
      assert.match(error.message, pattern);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    });
  }
});

test('missing credentials fail before any network call with a clear remedy', async (t) => {
  // The SDK reads this variable, so isolate the test from a developer's real key.
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  t.after(() => { if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved; });
  const { fetchStub, requests } = stubFetch([]);
  await assert.rejects(createAnthropicModel({ fetch: fetchStub }).open(prompt).next([]), /ANTHROPIC_API_KEY/);
  assert.equal(requests.length, 0);
});
