import { createInterface } from 'node:readline';
import { appendFileSync, readFileSync } from 'node:fs';
import { CatalogSchema } from '../../../../packages/contracts/src/index.ts';
import { createFixtureSupplier } from '../../../suppliers/src/fixture.ts';
import { createFakeProviderGateway, type FakeProviderScenario } from './fake.ts';
import { PROVIDER_CALL_TIMEOUT_MS } from './gateway.ts';
import { createExecutionProvider, type PaymentProviderSelection, type PayPalProviderScenario } from './paypal-provider.ts';
import { createPayPalGateway } from '../paypal/gateway.ts';
import { createExecutionWorker, type ExecutionResult, type ExecutionSupplier } from './worker.ts';

// Child-process execution worker: never imported by product code. Run as
// `node execution/test-worker.ts <mode>` with one JSON config line on stdin.
// It replies READY, the parent writes GO, then it prints one JSON result line
// and exits. Crash scenarios hold the process open after the provider commit
// so the parent can SIGKILL it; every other scenario runs to completion.

interface RunConfig {
  databasePath: string;
  providerDatabasePath: string;
  catalogPath: string;
  clock: string;
  /**
   * Test-only lease-fence scenarios: the trusted clock reads this file per
   * call so the parent can advance it while the worker is suspended.
   */
  clockPath?: string;
  operationId: string;
  mode: 'full' | 'reconcile';
  scenario?: FakeProviderScenario;
  /** Test-only: pause after the intent row, before the in-flight marker. */
  pauseAfterIntent?: 'capture' | null;
  /**
   * Test-only: checkpoint after the intent commit; emits
   * "BARRIER-intent:<kind>" and resumes on a RESUME line from the parent.
   */
  resumeAfterIntent?: boolean;
  /**
   * Unit 5 (test-only): operator-selection mirror for the child provider.
   * Default 'fake'; 'paypal-sandbox' requires paypalScriptPath.
   */
  paymentProvider?: PaymentProviderSelection;
  /**
   * Unit 5 (test-only): scripted PayPal fetch config, a JSON file of
   * {routes:[{pattern,status?,body}],scenario?,log?}. Every request is matched
   * against the routes before the network; the log file records method+URL per
   * call so the parent can prove call counts after child restarts.
   */
  paypalScriptPath?: string;
  /** Unit 5 (test-only): required with paymentProvider 'paypal-sandbox'. */
  paypalLedgerPath?: string;
  /** Test-only: crash scenarios need an unbounded provider call. */
  providerTimeoutMs?: number | null;
}

interface PayPalScript {
  routes: Array<{ pattern: string; status?: number; body?: unknown; stall?: boolean }>;
  scenario?: PayPalProviderScenario;
  log?: string;
}

/** Test-only scripted fetch inside the child. No network I/O ever happens. */
function buildScriptedPayPalChild(scriptPath: string): { fetchFn: typeof fetch; scenario: PayPalProviderScenario } {
  const script = JSON.parse(readFileSync(scriptPath, 'utf8')) as PayPalScript;
  const fetchFn: typeof fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (script.log !== undefined) {
      appendFileSync(script.log, `${JSON.stringify({ method: init?.method ?? 'GET', url })}\n`);
    }
    const route = script.routes.find((candidate) => new RegExp(candidate.pattern).test(url));
    if (!route) return Promise.reject(new Error(`no scripted route matched: ${url}`));
    if (route.stall === true) return new Promise<Response>(() => {}); // never resolves
    return Promise.resolve(new Response(JSON.stringify(route.body ?? null), {
      status: route.status ?? 200,
      headers: { 'paypal-debug-id': 'dbg' },
    }));
  }) as typeof fetch;
  return { fetchFn, scenario: script.scenario ?? {} };
}

async function readLine(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input: stream });
    reader.once('line', (line) => {
      reader.close();
      resolve(line);
    });
    reader.once('error', reject);
  });
}

async function runExecution(config: RunConfig): Promise<unknown> {
  const catalog = CatalogSchema.parse(JSON.parse(readFileSync(config.catalogPath, 'utf8')));
  const suppliers: ExecutionSupplier[] = [
    { supplierId: catalog.supplierId, catalog, adapter: createFixtureSupplier(catalog) },
  ];
  const selection: PaymentProviderSelection = config.paymentProvider ?? 'fake';
  let paypalConfig;
  if (selection === 'paypal-sandbox') {
    if (config.paypalScriptPath === undefined || config.paypalLedgerPath === undefined) {
      throw new Error('the paypal-sandbox test child requires paypalScriptPath and paypalLedgerPath');
    }
    const script = buildScriptedPayPalChild(config.paypalScriptPath);
    paypalConfig = {
      selection,
      ledgerPath: config.paypalLedgerPath,
      paypal: createPayPalGateway({ clientId: 'test-client', clientSecret: 'test-secret', fetchFn: script.fetchFn, timeoutMs: PROVIDER_CALL_TIMEOUT_MS }),
      scenario: script.scenario,
    };
  }
  const provider = createExecutionProvider({
    selection,
    fake: createFakeProviderGateway(config.providerDatabasePath, config.scenario ?? {}),
    ...(paypalConfig ?? {}),
  });
  const worker = createExecutionWorker({
    databasePath: config.databasePath,
    suppliers,
    provider,
    clock: config.clockPath === undefined
      ? () => config.clock
      : () => readFileSync(config.clockPath!, 'utf8'),
    providerTimeoutMs: config.providerTimeoutMs === undefined ? PROVIDER_CALL_TIMEOUT_MS : config.providerTimeoutMs,
    testPauseAfterIntent: config.pauseAfterIntent ?? null,
    testWaitAfterIntent: config.resumeAfterIntent
      ? async () => {
          const line = await readLine(process.stdin);
          if (line.trim() !== 'RESUME') throw new Error('test worker did not receive the resume barrier');
        }
      : undefined,
  });
  process.stdout.write('READY\n');
  const start = await readLine(process.stdin);
  if (start.trim() !== 'GO') throw new Error('test worker did not receive the start barrier');
  const result: ExecutionResult = config.mode === 'reconcile'
    ? await worker.reconcile(config.operationId)
    : await worker.run(config.operationId);
  worker.close();
  provider.close();
  return { kind: 'execution', outcome: result };
}

const mode = process.argv[2] ?? 'run';
const configLine = await readLine(process.stdin);
const raw = JSON.parse(configLine) as RunConfig;
if (mode !== 'run' && mode !== 'reconcile') throw new Error(`unknown test-worker mode ${mode}`);
const result = await runExecution({ ...raw, mode: mode === 'reconcile' ? 'reconcile' : 'full' });
process.stdout.write(`${JSON.stringify(result)}\n`, () => {
  // Explicit exit: the parent keeps our stdin open past the GO barrier.
  process.exit(0);
});
