/**
 * Provider-neutral model seam. The worker depends only on this, so its bounds can be
 * proven offline with a scripted model. A model only ever returns proposed tool
 * calls and prose; the worker validates and executes calls through the session.
 */
export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelPrompt {
  system: string;
  tools: ModelToolDefinition[];
  task: string;
}

export interface ModelToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ModelToolResult {
  id: string;
  content: string;
  isError: boolean;
}

export interface ModelTurn {
  /** `max_tokens` can truncate a tool input and `refusal` can cut one off: never run those calls. */
  stop: 'tool_use' | 'end_turn' | 'max_tokens' | 'refusal' | 'other';
  text: string;
  calls: ModelToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface ModelConversation {
  /** Results answer the previous turn's calls; the first turn receives none. */
  next(results: ModelToolResult[]): Promise<ModelTurn>;
}

export interface ShoppingModel {
  open(prompt: ModelPrompt): ModelConversation;
}

/** A safe, operator-readable failure. Provider error text never reaches the report unfiltered. */
export class ModelCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelCallError';
  }
}

export interface ScriptedCall {
  tool: string;
  args: unknown;
}

/** One model turn: its calls and optional prose, or a function choosing them from the last results. */
export type ScriptedStep =
  | ScriptedCall
  | { calls: ScriptedCall[]; text?: string; stop?: ModelTurn['stop'] }
  | ((results: ModelToolResult[]) => ScriptedStep | null);

/** Maps contract tool names to the model-facing names a real model would use. */
const modelToolName = (tool: string): string => tool.replaceAll('.', '_');

/**
 * Deterministic stand-in for a model: rehearsals, tests and demos with no key or
 * network. It proves the host's bounds, not how a real model behaves.
 */
export function createScriptedModel(steps: readonly ScriptedStep[], finalText = 'Scripted run finished.'): ShoppingModel {
  return {
    open() {
      let index = 0;
      let callNumber = 0;
      return {
        async next(results) {
          let step: ScriptedStep | null | undefined = steps[index];
          index += 1;
          while (typeof step === 'function') step = step(results);
          if (!step) return { stop: 'end_turn', text: finalText, calls: [], usage: { inputTokens: 0, outputTokens: 0 } };
          const script = 'calls' in step ? step : { calls: [step], text: undefined, stop: undefined };
          const calls = script.calls.map(({ tool, args }) => {
            callNumber += 1;
            return { id: `scripted-${callNumber}`, name: modelToolName(tool), input: args };
          });
          return { stop: script.stop ?? 'tool_use', text: script.text ?? '', calls, usage: { inputTokens: 0, outputTokens: 0 } };
        },
      };
    },
  };
}
