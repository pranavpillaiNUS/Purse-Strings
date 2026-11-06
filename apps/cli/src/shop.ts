import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { z } from 'zod';
import { createBackendClient, type BackendTransport } from '../../../packages/contracts/src/client.ts';
import { createMockBackend } from '../../../packages/contracts/src/mock.ts';
import { BackendSessionError, createBackendShoppingSession } from '../../../services/agent/src/backend-session.ts';
import { createScriptedModel, type ShoppingModel } from '../../../services/agent/src/model.ts';
import { runShoppingWorker, type ShoppingOutcome, type ShoppingRunEvent, type ShoppingRunReport } from '../../../services/agent/src/worker.ts';
import { createBackendCliTransport } from './backend-transport.ts';

// Separate entry point, like the backend CLI: this process holds the model key and
// never loads checker or payment modules. It reaches the checker only through the
// shared client, over a child process that does not inherit the model key.

const HELP = `Bounded AI shopper (simulation; no real money or orders)

Usage:
  npm run shop -- run --run-id ID --mandate-id ID BACKEND [MODEL] [options]

BACKEND (choose one):
  --backend-db PATH --backend-config PATH
                        Real simulation backend: one fresh rpc process per request.
                        The mandate must already be confirmed by an operator.
  --mock-mandate FILE --catalog FILE [--catalog FILE ...]
                        In-process contract mock, for rehearsal without a ledger.

MODEL (default is Claude; credentials come from ANTHROPIC_API_KEY or .env):
  --model ID            Claude model ID.
  --scripted FILE       Replay a JSON list of {tool, args} calls: no key, no network.

Options:
  --max-tool-calls N    Host limit, default 24.
  --max-model-turns N   Host limit, default 16.
  --max-carts N         Host limit, default 3.
  --trace FILE          Append each model turn and tool call as JSON lines.
  --json                Print one JSON report on stdout.

Exit codes: 0 completed; 2 not completed (partial, no feasible cart, limit, refused);
3 a submission's outcome is unknown and a reservation may exist; 1 invalid input/error.

An accepted proposal is a reservation, not payment, an order or delivery. Reusing a
run ID cannot duplicate a reservation: changed content under one cart ID is refused.
`;

/** Backend diagnostics already shown, so a startup failure is not printed twice. */
const reportedDiagnostics = new Set<string>();

const ScriptSchema = z.array(z.object({ tool: z.string().min(1).max(100), args: z.unknown() }).strict()).max(100);

const EXIT_CODES: Record<ShoppingOutcome, number> = {
  completed: 0,
  partial: 2,
  no_feasible_cart: 2,
  limit_exceeded: 2,
  backend_refused: 2,
  model_refused: 2,
  unknown_submission: 3,
  failed: 1,
};

function readJson(path: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`${label} could not be read: ${path}`);
  }
  try {
    // PowerShell's UTF-8 Set-Content may write a BOM; it is not part of JSON content.
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`${label} is not valid JSON: ${path}`);
  }
}

function positiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d{0,5}$/.test(value)) throw new Error(`--${name} must be a positive integer`);
  return Number(value);
}

/**
 * Reads only the model key from .env. Loading the whole file would put PayPal
 * credentials in this process's environment, which the shopper must never hold.
 */
function modelApiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const text = readFileSync(fileURLToPath(new URL('../../../.env', import.meta.url)), 'utf8');
    return parseEnv(text.replace(/^\uFEFF/, '')).ANTHROPIC_API_KEY || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error('.env could not be read');
  }
}

function formatMinor(minor: number): string {
  return `SGD ${Math.trunc(minor / 100)}.${String(Math.abs(minor) % 100).padStart(2, '0')}`;
}

/** Supplier and model text can carry terminal escape sequences; show it inert. */
function printable(text: string): string {
  return text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, ' ');
}

function describeCall(event: Extract<ShoppingRunEvent, { type: 'tool_call' }>): string {
  const args = event.args !== null && typeof event.args === 'object' ? event.args as Record<string, unknown> : {};
  const lines = Array.isArray(args.lines)
    ? (args.lines as Array<Record<string, unknown>>).map((line) => `${String(line.sku)} x${String(line.quantity)}`).join(', ')
    : undefined;
  return printable([args.supplierId, args.requirementId, args.sku, lines, args.cartId]
    .filter((part) => part !== undefined).map(String).join(' '));
}

function printEvent(event: ShoppingRunEvent): void {
  if (event.type === 'tool_call') console.log(`  > ${printable(event.tool)} ${describeCall(event)}`);
  if (event.type === 'tool_result' && event.isError) {
    let code = 'error';
    try {
      code = String((JSON.parse(event.content) as { error?: { code?: unknown } }).error?.code ?? 'error');
    } catch { /* The report still carries the facts. */ }
    console.log(`    x refused: ${code}`);
  }
  if (event.type === 'tool_result' && event.tool === 'cart.submit' && !event.isError) {
    const kind = (JSON.parse(event.content) as { submission: { kind: string; code?: string } }).submission;
    console.log(`    = ${kind.kind}${kind.code ? ` (${kind.code})` : ''}`);
  }
}

function printReport(report: ShoppingRunReport): void {
  const { progress, usage } = report;
  console.log(`\nOutcome: ${report.outcome}${report.detail ? ` | ${report.detail}` : ''}`);
  for (const receipt of progress.accepted) {
    if (receipt.kind !== 'proposal-accepted') continue;
    const { operation, cart } = receipt;
    console.log(`  accepted ${cart.id} | ${cart.supplierId} | ${formatMinor(operation.totalMinor)} | ${operation.id} | reservation ${operation.reservationStatus}`);
    for (const line of cart.lines) console.log(`    ${line.requirementId}: ${line.sku} x${line.quantity}`);
  }
  for (const rejection of progress.rejected) {
    console.log(`  rejected ${rejection.cart.id} | ${rejection.cart.supplierId} | ${rejection.code} | ${printable(rejection.checkCodes.join(', ')) || 'no check codes'}`);
  }
  if (progress.refused) console.log(`  refused ${progress.refused.cart.id} | ${progress.refused.code}`);
  if (progress.unresolved) {
    console.log(`  UNKNOWN ${progress.unresolved.id} | a reservation may exist. Do not assume it failed; check the backend.`);
  }
  console.log('Requirements:');
  for (const item of progress.requirements) {
    console.log(`  ${item.requirementId}: ${item.required} required | ${item.priorUnits} already held | ${item.acceptedUnits} this run | ${item.remainingUnits} still needed`);
  }
  if (progress.budgetRemainingMinor !== null) console.log(`Budget remaining: ${formatMinor(progress.budgetRemainingMinor)}`);
  console.log(`Usage: ${usage.modelTurns} model turns | ${usage.toolCalls}/${usage.maxToolCalls} tool calls | ${usage.inputTokens} input and ${usage.outputTokens} output tokens`);
  if (report.modelSummary) {
    console.log('\nModel summary (written by the model; the results above are the record):');
    console.log(printable(report.modelSummary));
  }
  console.log('\nSimulation. Reservations are not payment, orders, delivery or equipment readiness.');
}

async function buildModel(scripted: string | undefined, modelId: string | undefined): Promise<ShoppingModel> {
  if (scripted !== undefined) {
    if (modelId !== undefined) throw new Error('Choose either --scripted or --model');
    const parsed = ScriptSchema.safeParse(readJson(scripted, 'Scripted call list'));
    if (!parsed.success) throw new Error('Scripted call list must be a JSON array of {tool, args} objects');
    return createScriptedModel(parsed.data.map(({ tool, args }) => ({ tool, args })));
  }
  // Loaded only for a live run, so offline rehearsal never touches the provider SDK.
  const { createAnthropicModel } = await import('../../../services/agent/src/anthropic.ts');
  return createAnthropicModel({ apiKey: modelApiKey(), model: modelId });
}

function buildTransport(values: {
  'backend-db'?: string | undefined; 'backend-config'?: string | undefined;
  'mock-mandate'?: string | undefined; catalog?: string[] | undefined;
}): BackendTransport {
  const real = values['backend-db'] !== undefined || values['backend-config'] !== undefined;
  const mock = values['mock-mandate'] !== undefined || values.catalog !== undefined;
  if (real === mock) {
    throw new Error('Choose one backend: --backend-db with --backend-config, or --mock-mandate with --catalog');
  }
  if (real) {
    if (!values['backend-db'] || !values['backend-config']) throw new Error('--backend-db and --backend-config are both required');
    const transport = createBackendCliTransport({ databasePath: values['backend-db'], configPath: values['backend-config'] });
    return async (request) => {
      try {
        return await transport(request);
      } catch (error) {
        // The session deliberately hides transport text from the model; the operator still needs it.
        const message = error instanceof Error ? error.message : 'Backend request failed';
        if (!reportedDiagnostics.has(message)) console.error(`shop: ${message}`);
        reportedDiagnostics.add(message);
        throw error;
      }
    };
  }
  if (!values['mock-mandate'] || !values.catalog?.length) throw new Error('--mock-mandate and at least one --catalog are required');
  const backend = createMockBackend({
    mandates: [readJson(values['mock-mandate'], 'Mock mandate')],
    catalogs: values.catalog.map((path) => readJson(path, 'Mock catalog')),
  } as Parameters<typeof createMockBackend>[0]);
  return (request) => backend.handle(request);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      'run-id': { type: 'string' },
      'mandate-id': { type: 'string' },
      'backend-db': { type: 'string' },
      'backend-config': { type: 'string' },
      'mock-mandate': { type: 'string' },
      catalog: { type: 'string', multiple: true },
      scripted: { type: 'string' },
      model: { type: 'string' },
      trace: { type: 'string' },
      'max-tool-calls': { type: 'string' },
      'max-model-turns': { type: 'string' },
      'max-carts': { type: 'string' },
    },
  });
  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return;
  }
  if (positionals.length !== 1 || positionals[0] !== 'run') throw new Error('Expected shop run. Use --help.');
  // Fail closed rather than filter: if payment credentials reached this process, the
  // launch itself is wrong, and the operator should fix it before a model runs here.
  const paypalNames = Object.keys(process.env).filter((name) => name.toUpperCase().startsWith('PAYPAL_'));
  if (paypalNames.length > 0) {
    throw new Error(`Refusing to run: the shopper must not hold payment credentials (${paypalNames.join(', ')}). Do not launch it with --env-file.`);
  }
  const runId = values['run-id'];
  const mandateId = values['mandate-id'];
  if (!runId?.trim()) throw new Error('shop run requires --run-id');
  if (!mandateId?.trim()) throw new Error('shop run requires --mandate-id');

  const transport = buildTransport(values);
  const model = await buildModel(values.scripted, values.model);
  const maxToolCalls = positiveInteger(values['max-tool-calls'], 'max-tool-calls');
  const maxCarts = positiveInteger(values['max-carts'], 'max-carts');
  const maxModelTurns = positiveInteger(values['max-model-turns'], 'max-model-turns');

  const session = await createBackendShoppingSession({
    mandateId, runId,
    ...(maxToolCalls === undefined ? {} : { maxToolCalls }),
    ...(maxCarts === undefined ? {} : { maxCarts }),
  }, createBackendClient(transport));

  if (!values.json) console.log(`Shopping run ${runId} | mandate ${mandateId} | simulation`);
  const trace = values.trace;
  let traceFailed = false;
  const report = await runShoppingWorker(session, model, {
    runId,
    ...(maxModelTurns === undefined ? {} : { limits: { maxModelTurns } }),
    onEvent(event) {
      // Written before the tool runs, so the intent survives a crash during the call.
      if (trace && !traceFailed) {
        try {
          appendFileSync(trace, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
        } catch {
          traceFailed = true;
          console.error('shop: the trace file could not be written; continuing without it');
        }
      }
      if (!values.json) printEvent(event);
    },
  });

  if (values.json) console.log(JSON.stringify(report));
  else printReport(report);
  if (report.outcome === 'failed' && report.detail) console.error(`shop: ${report.detail}`);
  process.exitCode = EXIT_CODES[report.outcome];
}

try {
  await main();
} catch (error) {
  // Only messages this CLI wrote or the sanitized backend produced reach the operator.
  const safe = error instanceof BackendSessionError || (error instanceof Error && !(error instanceof z.ZodError));
  const message = safe ? (error as Error).message : 'The command input was invalid';
  if (!reportedDiagnostics.has(message)) console.error(`shop: ${message}`);
  process.exitCode = 1;
}
