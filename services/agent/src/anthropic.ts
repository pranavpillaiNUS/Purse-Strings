import Anthropic from '@anthropic-ai/sdk';
import { ModelCallError, type ModelPrompt, type ModelToolResult, type ModelTurn, type ShoppingModel } from './model.ts';

export const DEFAULT_SHOPPER_MODEL = 'claude-opus-5-5';
const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface AnthropicModelOptions {
  /** Omit to use the SDK's own credential resolution. */
  apiKey?: string | undefined;
  model?: string | undefined;
  /** Injected in tests so the real request can be inspected without a network call. */
  fetch?: typeof globalThis.fetch;
}

/** Most specific first. Only fixed wording leaves here, because provider text can echo request content. */
function describe(error: unknown): ModelCallError {
  if (error instanceof Anthropic.AuthenticationError) return new ModelCallError('Claude rejected the API key');
  if (error instanceof Anthropic.PermissionDeniedError) return new ModelCallError('The API key may not use this model');
  if (error instanceof Anthropic.NotFoundError) return new ModelCallError('Claude does not recognize this model ID');
  if (error instanceof Anthropic.RateLimitError) return new ModelCallError('Claude rate limit reached after retries');
  if (error instanceof Anthropic.BadRequestError) return new ModelCallError('Claude rejected the request as invalid');
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ModelCallError('The Claude request timed out after retries');
  if (error instanceof Anthropic.APIConnectionError) return new ModelCallError('Could not reach the Claude API');
  if (error instanceof Anthropic.APIError) return new ModelCallError(`The Claude API returned an error (status ${error.status ?? 'unknown'})`);
  // Anything else never got a response. The SDK raises missing credentials as a plain Error.
  return new ModelCallError('The Claude call could not start. Check credentials: set ANTHROPIC_API_KEY in .env, or use --scripted');
}

function mapStop(stopReason: string | null): ModelTurn['stop'] {
  switch (stopReason) {
    case 'tool_use':
    case 'end_turn':
    case 'max_tokens':
    case 'refusal':
      return stopReason;
    default:
      return 'other';
  }
}

/**
 * Claude over a manual Messages loop, because the worker must own every bound and
 * validate every call. Thinking stays on (it cannot be disabled on this model) and
 * the transcript is append-only, so thinking blocks replay unchanged.
 */
export function createAnthropicModel(options: AnthropicModelOptions = {}): ShoppingModel {
  const client = new Anthropic({
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    timeout: 120_000,
    maxRetries: 2,
  });
  const model = options.model ?? DEFAULT_SHOPPER_MODEL;

  return {
    open(prompt: ModelPrompt) {
      const tools: Anthropic.Beta.BetaToolUnion[] = prompt.tools.map(({ name, description, inputSchema }) => ({
        name, description,
        input_schema: { ...inputSchema, type: 'object' as const },
      }));
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt.task }];
      let started = false;

      return {
        async next(results: ModelToolResult[]): Promise<ModelTurn> {
          if (started) {
            messages.push({
              role: 'user',
              content: results.map(({ id, content, isError }) => ({
                type: 'tool_result' as const, tool_use_id: id, content, is_error: isError,
              })),
            });
          }
          started = true;
          let response: Anthropic.Beta.BetaMessage;
          try {
            response = await client.beta.messages.create({
              model,
              max_tokens: 16_000,
              betas: [REFUSAL_FALLBACK_BETA],
              fallbacks: 'default',
              output_config: { effort: 'medium' },
              cache_control: { type: 'ephemeral' },
              system: prompt.system,
              tools,
              messages,
            });
          } catch (error) {
            throw describe(error);
          }
          messages.push({ role: 'assistant', content: response.content });
          const text: string[] = [];
          const calls: ModelTurn['calls'] = [];
          for (const block of response.content) {
            if (block.type === 'text') text.push(block.text);
            else if (block.type === 'tool_use') calls.push({ id: block.id, name: block.name, input: block.input });
          }
          const { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } = response.usage;
          return {
            stop: mapStop(response.stop_reason),
            text: text.join('\n'),
            calls,
            usage: {
              inputTokens: input_tokens + (cache_creation_input_tokens ?? 0) + (cache_read_input_tokens ?? 0),
              outputTokens: output_tokens,
            },
          };
        },
      };
    },
  };
}
