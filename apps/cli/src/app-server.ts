import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { buildConversation, readTakeRecords, type ConversationEntry } from './app-conversation.ts';
import { createTakeManager, InputError, parseContinueInput, parseRunInput, type Outcome, type TakeInfo, type TakeManager } from './app-takes.ts';
import { SECURITY_HEADERS } from './dashboard.ts';
import { createDashboardReader, createProcessRunner, type CommandRunner, type DashboardReader, type DashboardState } from './dashboard-state.ts';
import { demoPlan } from './demo-flow.ts';

/**
 * The local app: one page on 127.0.0.1 that starts a demo:flow take and answers its
 * prompts. Three fixed actions only (start, continue, stop). Every fact on the page
 * comes from the take's records and the backend's existing read commands.
 */

const HELP = `Local app for the demo flow (simulation; PayPal sandbox only when chosen)

Usage:
  npm run app -- [--port N]

  --port    Local port. Default 7171. The page is served on 127.0.0.1 only.

The page starts one demo:flow take at a time in a new folder under .runtime/app and
replaces each Enter press with a button. Claude mode spends API credit; PayPal mode
needs sandbox credentials in .env, as the terminal flow does.
`;

/** Printed at startup. Ctrl+C reaches the flow too, exactly as in the terminal. */
export const STARTUP_NOTE = 'Press Ctrl+C to stop the app. Ctrl+C also stops a take that is running, as it does in the terminal; its folder is kept for backend status and operation-reconcile.';

const DEFAULT_PORT = 7171;
const MAX_BODY_BYTES = 8_192;
const root = fileURLToPath(new URL('../../../', import.meta.url));

export interface AppState {
  take: TakeInfo | null;
  dashboard: DashboardState | null;
  conversation: ConversationEntry[];
  terminal: string[];
  approvalUrl: string | null;
  demoRequest: string;
}

export interface AppAssets {
  html: string;
  script: string;
  style: string;
}

export function loadAppAssets(): AppAssets {
  const asset = (name: string): string => readFileSync(new URL(`./app/${name}`, import.meta.url), 'utf8');
  return { html: asset('index.html'), script: asset('app.js'), style: asset('app.css') };
}

/** Builds the page's state from the current take; one dashboard reader per take folder. */
export function createAppStateReader(options: { root: string; takes: TakeManager; run?: CommandRunner }): () => Promise<AppState> {
  const run = options.run ?? createProcessRunner(options.root);
  let reader: { directory: string; reader: DashboardReader } | null = null;
  return async () => {
    const take = options.takes.current();
    const demoRequest = demoPlan(new Date()).requestText;
    if (take === null) return { take, dashboard: null, conversation: [], terminal: [], approvalUrl: null, demoRequest };
    if (reader?.directory !== take.directory) {
      reader = { directory: take.directory, reader: createDashboardReader({ source: { kind: 'demo', root: options.root, directory: take.directory }, run, maxAgeMs: 2_000 }) };
    }
    const dashboard = await reader.reader.read();
    const records = readTakeRecords(take.directory);
    const conversation = buildConversation({ mode: dashboard.demo?.mode ?? null, ...records, state: dashboard });
    return { take, dashboard, conversation, terminal: options.takes.terminal(), approvalUrl: dashboard.demo?.approvalUrl ?? null, demoRequest };
  };
}

const StopInputSchema = z.object({}).strict();
const POST_PATHS = new Set(['/api/run', '/api/continue', '/api/stop']);

function sameToken(given: string | string[] | undefined, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

class HttpRefusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let refused = false;
    request.on('data', (chunk: Buffer) => {
      if (refused) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        refused = true;
        reject(new HttpRefusal(413, 'The request is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (refused) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpRefusal(400, 'The request could not be read as JSON.'));
      }
    });
    request.on('error', reject);
  });
}

export function createAppServer(options: {
  takes: TakeManager;
  readState: () => Promise<AppState>;
  policyText: string;
  assets: AppAssets;
  token: string;
  log?: (line: string) => void;
}): Server {
  const log = options.log ?? ((line: string) => console.error(line));
  const html = options.assets.html.replaceAll('{{TOKEN}}', options.token);
  const files = JSON.stringify({ policy: JSON.parse(options.policyText) as unknown });

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, type: string, body: string, extra: Record<string, string> = {}): void => {
      if (response.headersSent) return;
      response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const json = (status: number, value: unknown): void => send(status, 'application/json; charset=utf-8', JSON.stringify(value));
    const port = (server.address() as AddressInfo | null)?.port;
    const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
    if (!new Set([`127.0.0.1:${port}`, `localhost:${port}`]).has(request.headers.host ?? '')) {
      send(403, 'text/plain; charset=utf-8', 'This app answers only on 127.0.0.1 or localhost.\n');
      return;
    }
    let path: string;
    try {
      path = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      send(400, 'text/plain; charset=utf-8', 'The request URL could not be read.\n');
      return;
    }

    if (request.method === 'POST' && POST_PATHS.has(path)) {
      if (!origins.has(String(request.headers.origin ?? '')) || !sameToken(request.headers['x-splittap-token'], options.token)) {
        json(403, { error: 'This action must come from the app page. Reload it and try again.' });
        return;
      }
      if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) {
        json(415, { error: 'Actions are sent as JSON.' });
        return;
      }
      readBody(request).then((body) => {
        let outcome: Outcome;
        if (path === '/api/run') outcome = options.takes.start(parseRunInput(body));
        else if (path === '/api/continue') outcome = options.takes.continue(parseContinueInput(body).step);
        else {
          if (!StopInputSchema.safeParse(body).success) throw new InputError('The stop request could not be read.');
          outcome = options.takes.stop();
        }
        if (outcome.ok) json(200, { ok: true });
        else json(outcome.status, { error: outcome.message });
      }).catch((error: unknown) => {
        if (error instanceof HttpRefusal) json(error.status, { error: error.message });
        else if (error instanceof InputError) json(400, { error: error.message });
        else {
          log(`app: action failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          json(500, { error: 'The action failed. Check the terminal that runs npm run app.' });
        }
      });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(405, 'text/plain; charset=utf-8', 'Not allowed here.\n', { Allow: 'GET, HEAD' });
      return;
    }
    if (path === '/' || path === '/index.html') send(200, 'text/html; charset=utf-8', html);
    else if (path === '/app.js') send(200, 'text/javascript; charset=utf-8', options.assets.script);
    else if (path === '/app.css') send(200, 'text/css; charset=utf-8', options.assets.style);
    else if (path === '/api/files') send(200, 'application/json; charset=utf-8', files);
    else if (path === '/api/state') {
      options.readState().then(
        (state) => json(200, state),
        (error: unknown) => {
          log(`app: state read failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          json(500, { error: 'The app could not read the current state' });
        },
      );
    } else send(404, 'text/plain; charset=utf-8', 'Not found.\n');
  });
  return server;
}

class UsageError extends Error {}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  if (!/^\d{1,5}$/.test(value) || Number(value) > 65_535) throw new UsageError('--port must be a whole number from 0 to 65535');
  return Number(value);
}

async function main(): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({ options: { help: { type: 'boolean', short: 'h' }, port: { type: 'string' } } }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : 'The options could not be read');
  }
  if (values.help) {
    console.log(HELP);
    return;
  }
  const port = parsePort(values.port);
  const takes = createTakeManager({ root });
  const server = createAppServer({
    takes,
    readState: createAppStateReader({ root, takes }),
    policyText: readFileSync(join(root, 'config/policies/hardware.example.json'), 'utf8'),
    assets: loadAppAssets(),
    token: randomBytes(24).toString('base64url'),
  });
  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') throw new UsageError(`Port ${port} is in use. Start with --port <other>.`);
    throw error;
  }
  const { port: bound } = server.address() as AddressInfo;
  console.log(`Splittap app: http://127.0.0.1:${bound}`);
  console.log(STARTUP_NOTE);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`app: ${error instanceof Error ? error.message : 'The app failed to start'}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
