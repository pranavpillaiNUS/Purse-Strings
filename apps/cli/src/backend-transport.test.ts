import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import type { BackendRequest } from '../../../packages/contracts/src/backend.ts';
import { allowedChildEnv, createBackendCliTransport } from './backend-transport.ts';

// A stub process stands in for the backend, because these cover the transport itself:
// process boundary, environment and failure handling. Its mode arrives as --db.
const STUB = `
const mode = process.argv[3];
let input = '';
for await (const chunk of process.stdin) input += chunk;
switch (mode) {
  case 'report':
    console.log(JSON.stringify({ argv: process.argv.slice(2), envNames: Object.keys(process.env), request: JSON.parse(input) }));
    break;
  case 'business-rejection':
    console.log(JSON.stringify({ ok: false, code: 'BUDGET_EXCEEDED' }));
    process.exitCode = 2;
    break;
  case 'refused':
    console.error('backend: sanitized refusal reason');
    process.exitCode = 2;
    break;
  case 'silent':
    process.exitCode = 1;
    break;
  case 'garbage':
    console.log('not json');
    break;
  case 'hang':
    setInterval(() => {}, 1000);
    break;
  case 'flood':
    process.stdout.write('x'.repeat(3 * 1024 * 1024));
    setInterval(() => {}, 1000);
    break;
}
`;

const request: BackendRequest = { apiVersion: '1', requestId: 'r-1', method: 'mandate.get', params: { mandateId: 'm' } };

function stubEntry(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-transport-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const entry = join(directory, 'stub.mjs');
  writeFileSync(entry, STUB);
  return entry;
}

const transport = (entry: string, mode: string, timeoutMs?: number) =>
  createBackendCliTransport({ databasePath: mode, configPath: 'config.json', entry, ...(timeoutMs ? { timeoutMs } : {}) });

test('each request runs one rpc process with operator paths and the request on stdin', async (t) => {
  const response = await transport(stubEntry(t), 'report')(request) as { argv: string[]; request: unknown };
  assert.deepEqual(response.argv, ['--db', 'report', '--config', 'config.json', 'rpc']);
  assert.deepEqual(response.request, request);
});

test('the backend child never inherits the model key or other process secrets', async (t) => {
  const names = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'PAYPAL_CLIENT_SECRET', 'SOME_OTHER_SECRET', 'NODE_OPTIONS'];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  for (const name of names) if (name !== 'NODE_OPTIONS') process.env[name] = 'must-not-pass';
  const response = await transport(stubEntry(t), 'report')(request) as { envNames: string[] };
  const seen = new Set(response.envNames.map((name) => name.toUpperCase()));
  for (const name of names) assert.equal(seen.has(name), false, `${name} reached the backend child`);
  assert.ok(seen.has('PATH'));
});

test('the environment allowlist passes only named variables', () => {
  assert.deepEqual(allowedChildEnv({ PATH: '/bin', ANTHROPIC_API_KEY: 'k', HOME: '/h', OTHER: 'o' }), { PATH: '/bin', HOME: '/h' });
});

test('a business rejection exits nonzero with a response, which is returned for the client to validate', async (t) => {
  assert.deepEqual(await transport(stubEntry(t), 'business-rejection')(request), { ok: false, code: 'BUDGET_EXCEEDED' });
});

test('no response becomes an error carrying the backend diagnostic for the operator', async (t) => {
  const entry = stubEntry(t);
  await assert.rejects(transport(entry, 'refused')(request), /sanitized refusal reason/);
  await assert.rejects(transport(entry, 'silent')(request), /no response/);
  await assert.rejects(transport(entry, 'garbage')(request), /not valid JSON/);
});

test('a hung or flooding backend is killed rather than hanging or exhausting the shopper', async (t) => {
  const entry = stubEntry(t);
  await assert.rejects(transport(entry, 'hang', 300)(request), /timed out/);
  await assert.rejects(transport(entry, 'flood')(request), /size limit/);
});

test('a backend that cannot start is an error, not a crash', async () => {
  const missing = createBackendCliTransport({ databasePath: 'a', configPath: 'b', entry: join(tmpdir(), 'splittap-absent-entry.mjs') });
  await assert.rejects(missing(request));
});
