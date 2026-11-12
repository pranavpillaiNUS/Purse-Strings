import { spawn as spawnProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { DEMO_SESSION_FILE, DemoSessionSchema, type DemoSession } from './dashboard-state.ts';
import { MAX_REQUEST_CHARACTERS } from './demo-flow.ts';

/**
 * One demo:flow take at a time for the local app. The page never types into the flow
 * directly: each Enter is sent once per wait the flow recorded in session.json (its
 * step and wait number), never because of text the flow printed. Printed text includes
 * the typed request, model output and supplier listings, which are untrusted.
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

const WaitBindingSchema = z.object({
  // Correlates the displayed take; this value is never used to resolve or read a path.
  takeDirectory: z.string().min(1).max(4_096),
  waitId: z.number().int().min(0).max(1_000_000),
}).strict();
const ContinueInputSchema = WaitBindingSchema.extend({ step: z.enum(['next-scene', 'operator-confirm', 'sandbox-buyer']) }).strict();

export type WaitBinding = z.infer<typeof WaitBindingSchema>;
export type ContinueInput = z.infer<typeof ContinueInputSchema>;

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

export function parseContinueInput(body: unknown): ContinueInput {
  const parsed = ContinueInputSchema.safeParse(body);
  if (!parsed.success) throw new InputError('That step could not be read. Reload the page and try again.');
  return parsed.data;
}

export function parseStopInput(body: unknown): WaitBinding {
  const parsed = WaitBindingSchema.safeParse(body);
  if (!parsed.success) throw new InputError('That prompt could not be read. Reload the page and try again.');
  return parsed.data;
}

export interface TakeInfo {
  directory: string;
  startedAt: string;
  input: RunInput | null;
  status: 'running' | 'ended' | 'interrupted';
  exitCode: number | null;
  /** The step the flow's latest unanswered recorded wait is for; null when nothing waits. */
  awaiting: WaitStep | null;
  /** The same recorded wait as `awaiting`; both are null when nothing waits. */
  waitId: number | null;
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

export function flowArguments(input: RunInput, takeDirectory: string, policyPath?: string): string[] {
  return [
    FLOW_ENTRY, '--pause',
    ...(policyPath === undefined ? [] : ['--policy', policyPath]),
    ...(input.shopper === 'claude' ? ['--live'] : []),
    ...(input.payment === 'paypal-sandbox' ? ['--sandbox-paypal'] : []),
    '--dir', takeDirectory,
    ...(input.shopper === 'claude' ? ['--request-file', `${takeDirectory}.request.txt`] : []),
  ];
}

const refuse = (message: string): Outcome => ({ ok: false, status: 409, message });

export function defaultSpawn(args: readonly string[], cwd: string): FlowChild {
  const child = spawnProcess(process.execPath, [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  // A flow that already exited closes its input; a late write must not crash the server.
  child.stdin.on('error', () => {});
  const output: Array<(text: string) => void> = [];
  const exits: Array<(code: number | null) => void> = [];
  let ended: { code: number | null } | null = null;
  const end = (code: number | null): void => {
    if (ended !== null) return;
    ended = { code };
    for (const listener of exits) listener(code);
  };
  child.on('exit', (code) => end(code));
  // A flow that cannot start emits 'error', and may never emit 'exit'. Unhandled, that
  // would end the whole app and leave the take running forever, so it ends the take.
  child.on('error', (error) => {
    for (const listener of output) listener(`app: the demo flow process failed: ${error.message}\n`);
    end(null);
  });
  return {
    stdin: { write: (text) => child.stdin.write(text), end: () => child.stdin.end() },
    onOutput: (listener) => {
      output.push(listener);
      child.stdout.setEncoding('utf8').on('data', listener);
      child.stderr.setEncoding('utf8').on('data', listener);
    },
    onExit: (listener) => {
      exits.push(listener);
      if (ended !== null) listener(ended.code);
    },
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
    waitId: null,
  };
}

export function createTakeManager(options: {
  root: string;
  runtimeDirectory?: string;
  spawn?: SpawnFlow;
  now?: () => Date;
  /** The active company policy at the moment a take starts; the take pins a copy. */
  policyPath?: () => string;
}) {
  const runtimeDirectory = options.runtimeDirectory ?? join(options.root, '.runtime', 'app');
  const spawn = options.spawn ?? defaultSpawn;
  const now = options.now ?? (() => new Date());
  let take: TakeInfo | null = lastTake(runtimeDirectory);
  let child: FlowChild | null = null;
  let lines: string[] = [];
  let partial = '';
  /** The wait number last answered; each recorded wait gets one Enter at most. */
  let answeredWaitId: number | null = null;

  /** The recorded wait still unanswered, read from the flow's own session file. */
  function pending(): { step: WaitStep; waitId: number } | null {
    if (take?.status !== 'running') return null;
    const session = readSessionIn(take.directory);
    if (!session?.waiting || session.waitId === undefined || session.waitId === answeredWaitId) return null;
    return { step: session.waiting, waitId: session.waitId };
  }

  function receive(text: string): void {
    const clean = text.replace(ANSI, '');
    const parts = (partial + clean).split(/\r?\n/);
    partial = parts.pop() ?? '';
    lines = [...lines, ...parts].slice(-TERMINAL_LINES);
  }

  return {
    start(input: RunInput): Outcome {
      if (take?.status === 'running') return refuse('A run is already going. Stop it or wait for it to finish.');
      const policyPath = options.policyPath?.();
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
      answeredWaitId = null;
      take = { directory, startedAt: now().toISOString(), input, status: 'running', exitCode: null, awaiting: null, waitId: null };
      const started = spawn(flowArguments(input, directory, policyPath), options.root);
      child = started;
      started.onOutput(receive);
      started.onExit((code) => {
        if (child !== started) return;
        if (partial.length > 0) lines = [...lines, partial].slice(-TERMINAL_LINES);
        partial = '';
        child = null;
        if (take !== null) take = { ...take, status: 'ended', exitCode: code, awaiting: null, waitId: null };
      });
      return { ok: true };
    },

    continue(input: ContinueInput): Outcome {
      if (take?.status !== 'running' || child === null) return refuse('No run is going.');
      if (input.takeDirectory !== take.directory) return refuse('The run has changed. Review the current run before continuing.');
      const awaited = pending();
      if (awaited === null) {
        const session = readSessionIn(take.directory);
        return session?.waiting && session.waitId === answeredWaitId
          ? refuse('Already sent; waiting for the flow.')
          : refuse('The run is not waiting for you yet.');
      }
      if (awaited.waitId !== input.waitId || awaited.step !== input.step) return refuse('The run is waiting for a different prompt. Review the current prompt before continuing.');
      child.stdin.write('\n');
      answeredWaitId = awaited.waitId;
      return { ok: true };
    },

    stop(input: WaitBinding): Outcome {
      const awaited = pending();
      if (take?.status !== 'running' || child === null || awaited === null) {
        return refuse('Stop works only while the run waits for you, so no step is cut off halfway.');
      }
      if (input.takeDirectory !== take.directory || input.waitId !== awaited.waitId) {
        return refuse('The run or prompt has changed. Review the current run before stopping it.');
      }
      child.kill();
      // Exit is asynchronous. A stopped prompt must not accept Enter or another
      // Stop while the child is still being reported as running.
      answeredWaitId = awaited.waitId;
      return { ok: true };
    },

    current(): TakeInfo | null {
      if (take === null) return null;
      const awaited = pending();
      return { ...take, awaiting: awaited?.step ?? null, waitId: awaited?.waitId ?? null };
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
