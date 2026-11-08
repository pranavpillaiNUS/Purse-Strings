import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createDashboardReader,
  createProcessRunner,
  validateCommandId,
  type DashboardSource,
  type DashboardState,
} from './dashboard-state.ts';

// The read-only operator dashboard. One local page that shows what the ledger,
// the stores and demo:flow report, refreshed as they change. It never confirms,
// authorizes, runs, reconciles or edits anything: the operator does that in the
// terminal, and this process has no command that could.

const HELP = `Read-only operator dashboard (simulation; no real money, suppliers or orders)

Usage:
  npm run dashboard -- [--dir PATH] [--port N]
  npm run dashboard -- --backend-db PATH --backend-config PATH --mandate-id ID
                       [--operation ID ...] [--port N]

  --dir     A demo:flow working directory to follow. Default .runtime/demo. Start the
            dashboard first or later; it shows each scene as demo:flow reaches it.
  --backend-db, --backend-config, --mandate-id, --operation
            Follow one mandate in any backend instead, with the operation IDs the
            shopper printed.
  --port    Local port. Default 7070. The page is served on 127.0.0.1 only.

The dashboard only runs read commands: backend mandate-review, status and audit, shop
status and store show, each in its own process, with no model key or PayPal detail. It
cannot confirm, authorize, run, reconcile or edit anything. Facts on the page come from
those commands; the demo's scene and results come from demo:flow's session file.
`;

const DEFAULT_PORT = 7070;
const root = fileURLToPath(new URL('../../../', import.meta.url));

export interface DashboardAssets {
  html: string;
  script: string;
  style: string;
}

export function loadDashboardAssets(): DashboardAssets {
  const asset = (name: string): string => readFileSync(new URL(`./dashboard/${name}`, import.meta.url), 'utf8');
  return { html: asset('index.html'), script: asset('app.js'), style: asset('app.css') };
}

/** The page loads only its own script, style and state, and nothing can frame it. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
});

export interface DashboardServerOptions {
  read: () => Promise<DashboardState>;
  assets: DashboardAssets;
  /** Diagnostics for the operator's terminal. */
  log?: (line: string) => void;
}

/**
 * GET and HEAD only, on four fixed paths. A Host header that is not this
 * machine's loopback name is refused, so another site cannot reach the page
 * through a rebound DNS name.
 */
export function createDashboardServer(options: DashboardServerOptions): Server {
  const log = options.log ?? ((line: string) => console.error(line));
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, type: string, body: string, extra: Record<string, string> = {}): void => {
      response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const port = (server.address() as AddressInfo | null)?.port;
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowedHosts.has(request.headers.host ?? '')) {
      send(403, 'text/plain; charset=utf-8', 'This dashboard answers only on 127.0.0.1 or localhost.\n');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(405, 'text/plain; charset=utf-8', 'The dashboard is read-only.\n', { Allow: 'GET, HEAD' });
      return;
    }
    let path: string;
    try {
      path = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      send(400, 'text/plain; charset=utf-8', 'The request URL could not be read.\n');
      return;
    }
    if (path === '/' || path === '/index.html') {
      send(200, 'text/html; charset=utf-8', options.assets.html);
    } else if (path === '/app.js') {
      send(200, 'text/javascript; charset=utf-8', options.assets.script);
    } else if (path === '/app.css') {
      send(200, 'text/css; charset=utf-8', options.assets.style);
    } else if (path === '/api/state') {
      options.read().then(
        (state) => send(200, 'application/json; charset=utf-8', JSON.stringify(state)),
        (error: unknown) => {
          log(`dashboard: state read failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          send(500, 'application/json; charset=utf-8', JSON.stringify({ error: 'The dashboard could not read the current state' }));
        },
      );
    } else {
      send(404, 'text/plain; charset=utf-8', 'Not found.\n');
    }
  });
  return server;
}

/** A mistake in how the dashboard was started: exit 2, like the other commands. */
class UsageError extends Error {}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  if (!/^\d{1,5}$/.test(value) || Number(value) > 65_535) throw new UsageError('--port must be a whole number from 0 to 65535');
  return Number(value);
}

function commandId(value: string, label: string): string {
  try {
    return validateCommandId(value, label);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : `${label} is not usable`);
  }
}

function sourceFromArgs(values: {
  dir?: string | undefined;
  'backend-db'?: string | undefined;
  'backend-config'?: string | undefined;
  'mandate-id'?: string | undefined;
  operation?: string[] | undefined;
}): DashboardSource {
  const backendFlags = [values['backend-db'], values['backend-config'], values['mandate-id']];
  if (backendFlags.some((value) => value !== undefined) || (values.operation?.length ?? 0) > 0) {
    if (values.dir !== undefined) throw new UsageError('Use --dir or the --backend-* flags, not both');
    if (backendFlags.some((value) => !value?.trim())) {
      throw new UsageError('Following a backend needs --backend-db, --backend-config and --mandate-id');
    }
    return {
      kind: 'backend',
      root,
      databasePath: resolve(values['backend-db']!),
      configPath: resolve(values['backend-config']!),
      mandateId: commandId(values['mandate-id']!, '--mandate-id'),
      operationIds: (values.operation ?? []).map((id) => commandId(id, '--operation')),
    };
  }
  return { kind: 'demo', root, directory: resolve(root, values.dir ?? '.runtime/demo') };
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        dir: { type: 'string' },
        port: { type: 'string' },
        'backend-db': { type: 'string' },
        'backend-config': { type: 'string' },
        'mandate-id': { type: 'string' },
        operation: { type: 'string', multiple: true },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : 'The options could not be read');
  }
  const { values } = parsed;
  if (values.help) {
    console.log(HELP);
    return;
  }
  const port = parsePort(values.port);
  const source = sourceFromArgs(values);
  const reader = createDashboardReader({ source, run: createProcessRunner(root) });
  const server = createDashboardServer({ read: () => reader.read(), assets: loadDashboardAssets() });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const { port: bound } = server.address() as AddressInfo;
  const following = source.kind === 'demo' ? `demo:flow in ${source.directory === resolve(root, '.runtime/demo') ? '.runtime/demo' : 'the --dir you gave'}` : `mandate ${source.mandateId}`;
  console.log(`Dashboard (read-only): http://127.0.0.1:${bound}`);
  console.log(`Following ${following}. Press Ctrl+C to stop.`);
  const stop = (): void => {
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const usage = error instanceof UsageError || code === 'EADDRINUSE';
    const message = code === 'EADDRINUSE'
      ? 'That port is already in use. Pass another with --port N.'
      : usage && error instanceof Error ? error.message : 'The dashboard failed to start';
    console.error(`dashboard: ${message}`);
    process.exitCode = usage ? 2 : 1;
  }
}
