import { createInterface } from 'node:readline';
import { CatalogSchema } from '../../../../../packages/contracts/src/index.ts';
import { createFixtureSupplier } from '../../../../../services/suppliers/src/fixture.ts';
import { createApplicationBackend, type ConfiguredSupplier } from '../../application.ts';

// Child-process worker: never imported; run as `node tests/test-worker.ts <mode>`
// with one JSON config line on stdin. It replies READY, the parent writes GO,
// then it prints one JSON result line and exits.

interface SubmitConfig {
  databasePath: string;
  catalog: unknown;
  clock: string;
  attempts: Array<{ idempotencyKey: string; cart: unknown }>;
}

interface VerifyConfig {
  databasePath: string;
  mandateId: string;
}

function readLine(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input: stream });
    reader.once('line', (line) => {
      reader.close();
      resolve(line);
    });
    reader.once('error', reject);
  });
}

async function runSubmit(config: SubmitConfig): Promise<unknown> {
  const catalog = CatalogSchema.parse(config.catalog);
  const suppliers: ConfiguredSupplier[] = [
    { supplierId: catalog.supplierId, catalog, adapter: createFixtureSupplier(catalog) },
  ];
  // Open the backend before READY so GO releases straight into the racing
  // calls instead of into store startup that can serialize the race.
  const backend = createApplicationBackend({
    databasePath: config.databasePath,
    suppliers,
    clock: () => config.clock,
  });
  process.stdout.write('READY\n');
  const start = await readLine(process.stdin);
  if (start.trim() !== 'GO') throw new Error('test worker did not receive the start barrier');
  const responses = [];
  for (const attempt of config.attempts) {
    responses.push(await backend.handle({
      apiVersion: '1',
      requestId: `worker-${process.pid}-${responses.length}`,
      method: 'proposal.submit',
      params: { idempotencyKey: attempt.idempotencyKey, cart: attempt.cart },
    }));
  }
  backend.close();
  return { kind: 'submit', responses };
}

async function runVerify(config: VerifyConfig): Promise<unknown> {
  const { openLedgerStore } = await import('../store.ts');
  const { loadMandateRow, loadRevisionRow, loadConfirmationRow, loadMandateTotals } = await import('../store.ts');
  // Open the store before READY so GO releases into the racing verification.
  const database = openLedgerStore(config.databasePath);
  process.stdout.write('READY\n');
  const start = await readLine(process.stdin);
  if (start.trim() !== 'GO') throw new Error('test worker did not receive the start barrier');
  const count = (sql: string, ...params: (string | number)[]): number => {
    const row = database.prepare(sql).get(...params) as { total?: unknown } | undefined;
    return typeof row?.total === 'number' ? row.total : 0;
  };
  const mandate = loadMandateRow(database, config.mandateId);
  const activeVersion = mandate?.activeVersion ?? null;
  const confirmation = activeVersion === null ? null : loadConfirmationRow(database, config.mandateId, activeVersion);
  const revision = activeVersion === null ? null : loadRevisionRow(database, config.mandateId, activeVersion);
  const totals = loadMandateTotals(database, config.mandateId);
  const result = {
    kind: 'verify',
    mandateFound: mandate !== null,
    exposureStarted: mandate?.exposureStarted === true,
    activeVersion,
    confirmationDigest: confirmation?.digest ?? null,
    confirmedAt: confirmation?.confirmedAt ?? null,
    approvedBy: confirmation?.approvedBy ?? null,
    revisionDigest: revision?.digest ?? null,
    policyId: revision?.policyId ?? null,
    operations: count('SELECT COUNT(*) AS total FROM operations'),
    reservations: count('SELECT COUNT(*) AS total FROM reservations'),
    aliases: count('SELECT COUNT(*) AS total FROM idempotency_aliases'),
    auditEvents: count('SELECT COUNT(*) AS total FROM audit_events'),
    committedMinor: totals.committedMinor,
    reservedMinor: totals.reservedMinor,
    perRequirement: Object.fromEntries([...totals.perRequirement.entries()]),
  };
  database.close();
  return result;
}

const mode = process.argv[2] ?? 'submit';
const configLine = await readLine(process.stdin);
const raw = JSON.parse(configLine) as unknown;
const result = mode === 'verify' ? await runVerify(raw as VerifyConfig) : await runSubmit(raw as SubmitConfig);
process.stdout.write(`${JSON.stringify(result)}\n`, () => {
  // Explicit exit: the parent keeps our stdin open past the GO barrier.
  process.exit(0);
});
