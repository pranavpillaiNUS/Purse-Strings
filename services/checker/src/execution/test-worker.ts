import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';import { CatalogSchema } from '../../../../packages/contracts/src/index.ts';
import { createFixtureSupplier } from '../../../suppliers/src/fixture.ts';
import { createFakeProviderGateway, type FakeProviderScenario } from './fake.ts';
import { PROVIDER_CALL_TIMEOUT_MS } from './gateway.ts';
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
  /** Test-only: crash scenarios need an unbounded provider call. */
  providerTimeoutMs?: number | null;
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
  const provider = createFakeProviderGateway(config.providerDatabasePath, config.scenario ?? {});
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
