import { spawn as spawnProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { DEMO_SESSION_FILE, DemoSessionSchema, type DemoSession } from './dashboard-state.ts';
import { MAX_REQUEST_CHARACTERS } from './demo-flow.ts';

/**
 * One demo:flow take at a time for the local app. The page never types into the flow
 * directly: each Enter is sent only for the prompt the flow has printed and only once.
 */

export type WaitStep = 'next-scene' | 'operator-confirm' | 'sandbox-buyer';

export interface RunInput {
  request: string;
  shopper: 'scripted' | 'claude';
  payment: 'fake' | 'paypal-sandbox';
}

/** A mistake in what the page sent. The message is shown to the person as written. */
export class InputError extends Error {}

const RunInputSchema = z.object({
  request: z.string(),
  shopper: z.enum(['scripted', 'claude']),
  payment: z.enum(['fake', 'paypal-sandbox']),
}).strict();

const ContinueInputSchema = z.object({ step: z.enum(['next-scene', 'operator-confirm', 'sandbox-buyer']) }).strict();

export function parseRunInput(body: unknown): RunInput {
  const parsed = RunInputSchema.safeParse(body);
  if (!parsed.success) throw new InputError('The run request could not be read. Reload the page and try again.');
  const request = parsed.data.request.trim();
  if (request.length === 0) throw new InputError('Type a request first.');
  if ([...request].length > MAX_REQUEST_CHARACTERS) {
    throw new InputError(`The request is longer than ${MAX_REQUEST_CHARACTERS.toLocaleString('en-US')} characters. Shorten it and start again.`);
  }
  return { ...parsed.data, request };
}

export function parseContinueInput(body: unknown): { step: WaitStep } {
  const parsed = ContinueInputSchema.safeParse(body);
  if (!parsed.success) throw new InputError('That step could not be read. Reload the page and try again.');
  return parsed.data;
}

export interface TakeInfo {
  directory: string;
  startedAt: string;
  input: RunInput | null;
  status: 'running' | 'ended' | 'interrupted';
  exitCode: number | null;
  /** The step the flow's latest unanswered prompt waits for; null when nothing waits. */
  awaiting: WaitStep | null;
}

export type Outcome = { ok: true } | { ok: false; status: 409; message: string };

export interface FlowChild {
  stdin: { write(text: string): boolean; end(): void };
  onOutput(listener: (text: string) => void): void;
  onExit(listener: (code: number | null) => void): void;
  kill(): void;
}

export type SpawnFlow = (args: readonly string[], cwd: string) => FlowChild;

const FLOW_ENTRY = 'apps/cli/src/demo-flow.ts';
const TERMINAL_LINES = 400;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const PROMPT = /\[([^\]\n]*\bEnter\b[^\]\n]*)\]/gi;

export function flowArguments(input: RunInput, takeDirectory: string): string[] {
  return [
    FLOW_ENTRY, '--pause',
    ...(input.shopper === 'claude' ? ['--live'] : []),
    ...(input.payment === 'paypal-sandbox' ? ['--sandbox-paypal'] : []),
    '--dir', takeDirectory,
    ...(input.shopper === 'claude' ? ['--request-file', `${takeDirectory}.request.txt`] : []),
  ];
}

/** The step a printed demo:flow prompt waits for. */
export function stepForPrompt(prompt: string): WaitStep | null {
  if (/sandbox buyer/i.test(prompt)) return 'sandbox-buyer';
  if (/confirm this exact digest/i.test(prompt)) return 'operator-confirm';
  if (/Press Enter for the (next scene|result)/i.test(prompt)) return 'next-scene';
  return null;
}

const refuse = (message: string): Outcome => ({ ok: false, status: 409, message });

function defaultSpawn(args: readonly string[], cwd: string): FlowChild {
  const child = spawnProcess(process.execPath, [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  // A flow that already exited closes its input; a late write must not crash the server.
  child.stdin.on('error', () => {});
  return {
    stdin: { write: (text) => child.stdin.write(text), end: () => child.stdin.end() },
    onOutput: (listener) => {
      child.stdout.setEncoding('utf8').on('data', listener);
      child.stderr.setEncoding('utf8').on('data', listener);
    },
    onExit: (listener) => { child.on('exit', (code) => listener(code)); },
    kill: () => { child.kill(); },
  };
}

function takeName(now: Date): string {
  return `take-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`;
}

function readSessionIn(directory: string): DemoSession | null {
  try {
    const parsed = DemoSessionSchema.safeParse(JSON.parse(readFileSync(join(directory, DEMO_SESSION_FILE), 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The newest earlier take, shown read-only: unfinished means this server stopped mid-run. */
function lastTake(runtimeDirectory: string): TakeInfo | null {
  if (!existsSync(runtimeDirectory)) return null;
  const names = readdirSync(runtimeDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^take-\d{8}T\d{6}Z(-\d+)?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const name = names.at(-1);
  if (name === undefined) return null;
  const directory = join(runtimeDirectory, name);
  const session = readSessionIn(directory);
  return {
    directory,
    startedAt: session?.startedAt ?? '',
    input: null,
    status: session?.finished === true ? 'ended' : 'interrupted',
    exitCode: null,
    awaiting: null,
  };
}

export function createTakeManager(options: {
  root: string;
  runtimeDirectory?: string;
  spawn?: SpawnFlow;
  now?: () => Date;
}) {
  const runtimeDirectory = options.runtimeDirectory ?? join(options.root, '.runtime', 'app');
  const spawn = options.spawn ?? defaultSpawn;
  const now = options.now ?? (() => new Date());
  let take: TakeInfo | null = lastTake(runtimeDirectory);
  let child: FlowChild | null = null;
  let lines: string[] = [];
  let partial = '';
  let pendingText = '';
  let promptsSeen: WaitStep[] = [];
  let answered = 0;

  function pending(): WaitStep | null {
    if (take?.status !== 'running' || answered >= promptsSeen.length) return null;
    return promptsSeen[answered] ?? null;
  }

  function refresh(): void {
    if (take !== null) take = { ...take, awaiting: pending() };
  }

  function receive(text: string): void {
    const clean = text.replace(ANSI, '');
    const parts = (partial + clean).split(/\r?\n/);
    partial = parts.pop() ?? '';
    lines = [...lines, ...parts].slice(-TERMINAL_LINES);
    // Prompts can arrive split across chunks, so keep an unmatched tail.
    pendingText += clean;
    let match: RegExpExecArray | null;
    let consumed = 0;
    PROMPT.lastIndex = 0;
    while ((match = PROMPT.exec(pendingText)) !== null) {
      const step = stepForPrompt(match[1]!);
      if (step !== null) promptsSeen.push(step);
      consumed = PROMPT.lastIndex;
    }
    pendingText = pendingText.slice(consumed).slice(-200);
    refresh();
  }

  return {
    start(input: RunInput): Outcome {
      if (take?.status === 'running') return refuse('A run is already going. Stop it or wait for it to finish.');
      mkdirSync(runtimeDirectory, { recursive: true });
      const base = takeName(now());
      let directory = join(runtimeDirectory, base);
      for (let n = 2; existsSync(directory) || existsSync(`${directory}.request.txt`); n += 1) {
        directory = join(runtimeDirectory, `${base}-${n}`);
      }
      directory = resolve(directory);
      if (input.shopper === 'claude') writeFileSync(`${directory}.request.txt`, input.request);
      lines = [];
      partial = '';
      pendingText = '';
      promptsSeen = [];
      answered = 0;
      take = { directory, startedAt: now().toISOString(), input, status: 'running', exitCode: null, awaiting: null };
      const started = spawn(flowArguments(input, directory), options.root);
      child = started;
      started.onOutput(receive);
      started.onExit((code) => {
        if (child !== started) return;
        if (partial.length > 0) lines = [...lines, partial].slice(-TERMINAL_LINES);
        partial = '';
        child = null;
        if (take !== null) take = { ...take, status: 'ended', exitCode: code, awaiting: null };
      });
      return { ok: true };
    },

    continue(step: WaitStep): Outcome {
      if (take?.status !== 'running' || child === null) return refuse('No run is going.');
      const awaited = pending();
      if (awaited === null) {
        return answered > 0 && answered === promptsSeen.length
          ? refuse('Already sent; waiting for the flow.')
          : refuse('The run is not waiting for you yet.');
      }
      if (awaited !== step) return refuse('The run is waiting for a different step. Reload the page.');
      child.stdin.write('\n');
      answered += 1;
      refresh();
      return { ok: true };
    },

    stop(): Outcome {
      if (take?.status !== 'running' || child === null || pending() === null) {
        return refuse('Stop works only while the run waits for you, so no step is cut off halfway.');
      }
      child.kill();
      return { ok: true };
    },

    current(): TakeInfo | null {
      return take;
    },

    terminal(): string[] {
      return partial.length > 0 ? [...lines, partial].slice(-TERMINAL_LINES) : [...lines];
    },

    readSession(): DemoSession | null {
      return take === null ? null : readSessionIn(take.directory);
    },
  };
}

export type TakeManager = ReturnType<typeof createTakeManager>;
