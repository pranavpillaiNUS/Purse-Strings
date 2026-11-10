import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createAppServer, createAppStateReader, loadAppAssets, type AppState } from './app-server.ts';
import { createTakeManager } from './app-takes.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('a scripted fake-payment take driven only through HTTP ends with the demo ledger', { timeout: 240_000 }, async (t) => {
  const runtime = mkdtempSync(join(tmpdir(), 'splittap-app-e2e-'));
  t.after(() => rmSync(runtime, { recursive: true, force: true }));
  const takes = createTakeManager({ root, runtimeDirectory: runtime });
  const token = 'e2e-token';
  const server: Server = createAppServer({
    takes, readState: createAppStateReader({ root, takes }), token, log: () => {},
    policyText: readFileSync(join(root, 'config/policies/hardware.example.json'), 'utf8'), assets: loadAppAssets(),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { takes.stop(); server.close(); });
  const port = (server.address() as AddressInfo).port;
  const call = (method: string, path: string, body?: unknown) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, method, path, headers: {
      host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json', 'x-splittap-token': token,
    } }, (response) => {
      let text = '';
      response.setEncoding('utf8').on('data', (chunk) => { text += chunk; }).on('end', () => resolve({ status: response.statusCode ?? 0, body: text }));
    });
    request.on('error', reject);
    if (body !== undefined) request.write(JSON.stringify(body));
    request.end();
  });

  const started = await call('POST', '/api/run', { request: 'ignored by the scripted stand-in', shopper: 'scripted', payment: 'fake' });
  assert.equal(started.status, 200, started.body);
  let state: AppState | null = null;
  const continued: string[] = [];
  for (let polls = 0; polls < 400; polls += 1) {
    state = JSON.parse((await call('GET', '/api/state')).body) as AppState;
    if (state.take?.status === 'ended') break;
    const step = state.take?.awaiting;
    if (step) {
      assert.equal((await call('POST', '/api/continue', { step })).status, 200);
      continued.push(step);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(state?.take?.status, 'ended', state?.terminal.slice(-20).join('\n') ?? 'no state');
  assert.equal(state.take.exitCode, 0, state.terminal.slice(-20).join('\n'));
  assert.ok(continued.includes('operator-confirm'), 'the operator confirmed through the page');
  assert.equal(continued.filter((step) => step === 'operator-confirm').length, 1);
  assert.equal(state.dashboard?.ledger?.budget.committedMinor, 751010);
  assert.equal(state.dashboard?.ledger?.budget.remainingMinor, 48990);
  assert.ok((state.dashboard?.operations ?? []).every((operation) => operation.readinessStatus === 'not_assessed'));
  assert.ok(state.conversation.some((entry) => entry.actor === 'checker' && entry.tone === 'refused' && entry.title === 'Checker refused store-b'));
});
