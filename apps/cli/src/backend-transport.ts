import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { BackendTransport } from '../../../packages/contracts/src/client.ts';

const MAX_RPC_OUTPUT_BYTES = 2_097_152;

/**
 * Environment names the backend child needs to run. An allowlist means shopper
 * secrets, such as the model key, can never reach the checker process by default.
 */
const CHILD_ENV_ALLOWLIST = [
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'USER', 'USERNAME', 'LOGNAME',
  'LANG', 'LC_ALL', 'TZ',
];

export interface BackendCliTransportOptions {
  databasePath: string;
  configPath: string;
  /** Defaults to the real backend CLI; tests substitute a stub process. */
  entry?: string;
  timeoutMs?: number;
}

export function allowedChildEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(CHILD_ENV_ALLOWLIST.flatMap((name) => {
    const value = source[name];
    return value === undefined ? [] : [[name, value]];
  }));
}

/**
 * One fresh backend process per request, exactly as an operator would run `rpc`.
 * This is the process boundary between the shopper and the checker. Exit codes are
 * not interpreted: a business rejection exits 2 with a valid JSON response on
 * stdout, and the shared client validates that response.
 */
export function createBackendCliTransport(options: BackendCliTransportOptions): BackendTransport {
  const entry = options.entry ?? fileURLToPath(new URL('./backend.ts', import.meta.url));
  const timeoutMs = options.timeoutMs ?? 25_000;

  return (request) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      entry, '--db', options.databasePath, '--config', options.configPath, 'rpc',
    ], { env: allowedChildEnv(process.env), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let received = 0;
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle();
    };
    const fail = (message: string): void => {
      finish(() => {
        child.kill();
        reject(new Error(message));
      });
    };
    const timer = setTimeout(() => fail('Backend RPC timed out'), timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_RPC_OUTPUT_BYTES) fail('Backend RPC response exceeded the size limit');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      // Backend diagnostics are sanitized; keep a bounded amount for the operator.
      if (stderr.length < 16) stderr.push(chunk);
    });
    child.on('error', () => fail('Backend RPC process could not start'));
    child.on('close', () => {
      const text = Buffer.concat(stdout).toString('utf8').trim();
      if (text.length === 0) {
        const diagnostic = Buffer.concat(stderr).toString('utf8').trim().split('\n')[0]?.slice(0, 300);
        fail(diagnostic || 'Backend RPC returned no response');
        return;
      }
      try {
        const response: unknown = JSON.parse(text);
        finish(() => resolve(response));
      } catch {
        fail('Backend RPC response was not valid JSON');
      }
    });
    // A child that exits before reading stdin must surface through `close`, not crash us.
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}
