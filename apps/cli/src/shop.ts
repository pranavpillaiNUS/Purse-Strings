import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { z } from 'zod';
import { createBackendClient, type BackendTransport } from '../../../packages/contracts/src/client.ts';
import type { Operation } from '../../../packages/contracts/src/backend.ts';
import { createMockBackend } from '../../../packages/contracts/src/mock.ts';
import { BackendSessionError, createBackendShoppingSession } from '../../../services/agent/src/backend-session.ts';
import { draftMandateWithModel, type MandateDraftOutcome } from '../../../services/agent/src/mandate-drafter.ts';
import { createScriptedModel, type ShoppingModel } from '../../../services/agent/src/model.ts';
import { buildRunReview, buildStatusView, type BackendKind, type ShopperKind } from '../../../services/agent/src/review.ts';
import { runShoppingWorker, type ShoppingOutcome, type ShoppingRunEvent } from '../../../services/agent/src/worker.ts';
import { createBackendCliTransport } from './backend-transport.ts';
import { bundled, printable, printableLine, printOrigin, printProposal } from './mandate.ts';
import { readLedgerFacts, renderLiveEvent, renderRunReview, renderStatus, useColor } from './review-output.ts';

// Separate entry point, like the backend CLI: this process holds the model key and
// never loads checker or payment modules. It reaches the checker only through the
// shared client, over a child process that does not inherit the model key.

const HELP = `Bounded AI shopper (simulation; no real money or orders)

Usage:
  npm run shop -- run --run-id ID --mandate-id ID BACKEND [MODEL] [options]
  npm run shop -- draft (--text TEXT | --text-file FILE) [MODEL] [draft options]
  npm run shop -- status --mandate-id ID BACKEND [--operation ID ...] [--json]

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
  --brief               A shorter review, for recording: refused attempts become a count,
                        the next step one line, and usage is left out. Exit codes do not
                        change. It shapes the readable review, so --json refuses it.

Exit codes: 0 completed; 2 not completed (partial, no feasible cart, limit, refused);
3 a submission's outcome is unknown and a reservation may exist; 1 invalid input/error.

An accepted proposal is a reservation, not payment, an order or delivery. Reusing a
run ID cannot duplicate a reservation: changed content under one cart ID is refused.
Without --json, a run closes with a review, using one extra read of the ledger.

Draft options (a model reads a plain-English request; policy checks its answer):
  --policy FILE         Company policy. Default is the bundled synthetic example.
  --kit FILE            Kit template. Default is the bundled engineering kit.
  --location ID         A known delivery location, repeatable. Default singapore-office.
  --now ISO_TIMESTAMP   Clock for offline rehearsal. Default is the real time.
  --draft-out FILE      Write the draft to a new file, for mandate review.
  --proposal-out FILE   Write only the proposal to a new file, for the backend's mandate-draft.
  --json                Print one JSON report on stdout.

Draft exit codes: 0 drafted; 2 no draft (needs input, policy refused, invalid output
or model refused); 1 invalid input/error. A draft is never a confirmation. It lists what
the model assumed and could not capture, and a person must review it and confirm it.

Status options (read-only: no model or key, and it never executes anything):
  --operation ID        An operation to show, repeatable. The client cannot list
                        operations; shop run prints the ID of each reservation.
  --json                Print one JSON view on stdout.

Status exit codes: 0 shown; 1 invalid input or backend failure. It shows the budget and
what each requirement has allocated, with reservation, payment, order, refund and
readiness on separate lines, because those are separate facts.
`;

const DRAFT_EXIT_CODES: Record<MandateDraftOutcome, number> = {
  drafted: 0,
  needs_input: 2,
  policy_refused: 2,
  invalid_output: 2,
  model_refused: 2,
  failed: 1,
};

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

/**
 * Fail closed rather than filter: if payment credentials reached this process, the
 * launch itself is wrong, and the operator should fix it before a model runs here.
 */
function refuseIfPaymentCredentialsPresent(): void {
  const paypalNames = Object.keys(process.env).filter((name) => name.toUpperCase().startsWith('PAYPAL_'));
  if (paypalNames.length > 0) {
    throw new Error(`Refusing to run: the shopper must not hold payment credentials (${paypalNames.join(', ')}). Do not launch it with --env-file.`);
  }
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

function backendKind(values: { 'mock-mandate'?: string | undefined }): BackendKind {
  return values['mock-mandate'] === undefined ? 'simulation-backend' : 'contract-mock';
}

/** A path as the operator should retype it: short, and free of their home directory when it can be. */
function displayPath(path: string): string {
  const fromHere = relative(process.cwd(), resolve(path));
  return fromHere === '' || fromHere.startsWith('..') || isAbsolute(fromHere) ? path : fromHere;
}

/** Where an output file will land. Lowercased because Windows and macOS usually ignore case. */
function outputTarget(path: string): string {
  try {
    return join(realpathSync.native(dirname(resolve(path))), basename(path)).toLowerCase();
  } catch {
    throw new Error(`Output directory does not exist: ${dirname(path)}`);
  }
}

async function runDraft(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      text: { type: 'string' },
      'text-file': { type: 'string' },
      policy: { type: 'string' },
      kit: { type: 'string' },
      location: { type: 'string', multiple: true },
      now: { type: 'string' },
      'draft-out': { type: 'string' },
      'proposal-out': { type: 'string' },
      scripted: { type: 'string' },
      model: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  refuseIfPaymentCredentialsPresent();
  if ((values.text === undefined) === (values['text-file'] === undefined)) {
    throw new Error('shop draft requires exactly one of --text or --text-file');
  }
  let requestText = values.text;
  if (values['text-file'] !== undefined) {
    try {
      requestText = readFileSync(values['text-file'], 'utf8').replace(/^﻿/, '');
    } catch {
      throw new Error(`Request text could not be read: ${values['text-file']}`);
    }
  }
  // Checked before the model call, so a bad destination cannot waste a paid run.
  const outputs = [values['draft-out'], values['proposal-out']].filter((path) => path !== undefined);
  for (const path of outputs) {
    if (existsSync(path)) throw new Error(`Refusing to overwrite an existing file: ${path}`);
  }
  if (new Set(outputs.map(outputTarget)).size < outputs.length) {
    throw new Error('--draft-out and --proposal-out must be different files');
  }

  const policy = readJson(values.policy ?? bundled('config/policies/hardware.example.json'), 'Policy');
  const kit = readJson(values.kit ?? bundled('services/agent/fixtures/engineering-kit.json'), 'Kit');
  const model = await buildModel(values.scripted, values.model);
  const requestedModel = values.scripted !== undefined
    ? 'scripted'
    : values.model ?? (await import('../../../services/agent/src/anthropic.ts')).DEFAULT_SHOPPER_MODEL;
  const fixedNow = values.now;
  const run = await draftMandateWithModel({
    requestText: requestText ?? '',
    policy,
    kit,
    clock: () => fixedNow ?? new Date().toISOString(),
    locations: values.location ?? ['singapore-office'],
    requestedModel,
  }, model);

  if (run.draft) {
    // Written directly, because PowerShell's stdout redirection adds a BOM the backend refuses.
    if (values['draft-out']) writeFileSync(values['draft-out'], `${JSON.stringify(run.draft, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    if (values['proposal-out']) writeFileSync(values['proposal-out'], `${JSON.stringify(run.draft.proposal, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  }
  process.exitCode = DRAFT_EXIT_CODES[run.outcome];
  if (values.json) {
    console.log(JSON.stringify(run));
  } else if (run.draft) {
    console.log(`Mandate draft | digest ${run.draft.digest}`);
    console.log(`  ${run.draft.request.hireCount} hires | kit ${run.draft.kit.id} v${run.draft.kit.version}`);
    printProposal(run.draft.proposal);
    if (run.draft.origin) printOrigin(run.draft.origin);
    console.log('Draft only. No mandate confirmed, stock assigned or purchase authorized.');
  } else {
    console.log(`No draft: ${run.outcome} | ${printableLine(run.detail ?? '')}`);
    if (run.refused) {
      console.log(`The request as the model read it: ${printableLine(JSON.stringify(run.refused.request))}`);
      for (const item of run.refused.notCaptured) console.log(`  not captured: ${printableLine(item)}`);
    }
    if (run.modelText) console.log(`The model said:\n${printable(run.modelText)}`);
  }
  // A scripted stand-in has no tokens to report, and zero would read as a real count.
  if (!values.json && values.scripted === undefined) console.log(`Usage: ${run.usage.modelTurns} model ${run.usage.modelTurns === 1 ? 'turn' : 'turns'} | ${run.usage.inputTokens} input and ${run.usage.outputTokens} output tokens`);
  if (run.outcome === 'failed' && run.detail) console.error(`shop: ${run.detail}`);
}

/**
 * Read-only. All reads finish before anything prints, so a failure leaves stdout empty.
 * It reaches the backend only through the shared client's two read methods.
 */
async function runStatus(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      'mandate-id': { type: 'string' },
      'backend-db': { type: 'string' },
      'backend-config': { type: 'string' },
      'mock-mandate': { type: 'string' },
      catalog: { type: 'string', multiple: true },
      operation: { type: 'string', multiple: true },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  refuseIfPaymentCredentialsPresent();
  const mandateId = values['mandate-id'];
  if (!mandateId?.trim()) throw new Error('shop status requires --mandate-id');

  const backend = backendKind(values);
  const client = createBackendClient(buildTransport(values));
  const loaded = await client.request({ apiVersion: '1', requestId: 'status-mandate', method: 'mandate.get', params: { mandateId } });
  if (!loaded.ok) throw new Error(loaded.error.message);
  if (loaded.method !== 'mandate.get') throw new Error('Backend response did not match mandate.get');
  const { mandate } = loaded.result;

  const operations: Operation[] = [];
  for (const [index, operationId] of (values.operation ?? []).entries()) {
    const response = await client.request({
      apiVersion: '1', requestId: `status-operation-${index + 1}`, method: 'operation.get',
      params: { mandateId: mandate.id, mandateVersion: mandate.version, operationId },
    });
    if (!response.ok) {
      const hint = backend === 'contract-mock' ? ' The contract mock keeps nothing between commands.' : '';
      throw new Error(`Operation ${operationId}: ${response.error.message}.${hint}`);
    }
    if (response.method !== 'operation.get') throw new Error('Backend response did not match operation.get');
    operations.push(response.result.operation);
  }

  const view = buildStatusView({ ledger: loaded.result, operations, backend });
  if (values.json) console.log(JSON.stringify(view));
  else console.log(renderStatus(view, { color: useColor(process.stdout, process.env) }).join('\n'));
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'draft') {
    await runDraft(rest);
    return;
  }
  if (command === 'status') {
    await runStatus(rest);
    return;
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      brief: { type: 'boolean' },
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
  if (positionals.length !== 1 || positionals[0] !== 'run') throw new Error('Expected shop run, draft or status. Use --help.');
  if (values.brief && values.json) throw new Error('--brief shapes the readable review, so it cannot be used with --json');
  refuseIfPaymentCredentialsPresent();
  const runId = values['run-id'];
  const mandateId = values['mandate-id'];
  if (!runId?.trim()) throw new Error('shop run requires --run-id');
  if (!mandateId?.trim()) throw new Error('shop run requires --mandate-id');

  const backend = backendKind(values);
  const client = createBackendClient(buildTransport(values));
  const model = await buildModel(values.scripted, values.model);
  const maxToolCalls = positiveInteger(values['max-tool-calls'], 'max-tool-calls');
  const maxCarts = positiveInteger(values['max-carts'], 'max-carts');
  const maxModelTurns = positiveInteger(values['max-model-turns'], 'max-model-turns');

  const session = await createBackendShoppingSession({
    mandateId, runId,
    ...(maxToolCalls === undefined ? {} : { maxToolCalls }),
    ...(maxCarts === undefined ? {} : { maxCarts }),
  }, client);

  if (!values.json) console.log(printableLine(`Shopping run ${runId} | mandate ${mandateId} | simulation`));
  const trace = values.trace;
  let traceFailed = false;
  const events: ShoppingRunEvent[] = [];
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
      if (values.json) return;
      events.push(event);
      for (const line of renderLiveEvent(event, backend)) console.log(line);
    },
  });

  // Set first: nothing in the review below can change what this run exits with.
  process.exitCode = EXIT_CODES[report.outcome];
  if (values.json) console.log(JSON.stringify(report));
  else {
    let shopper: ShopperKind = { kind: 'scripted' };
    if (values.scripted === undefined) {
      const { DEFAULT_SHOPPER_MODEL } = await import('../../../services/agent/src/anthropic.ts');
      shopper = { kind: 'live', modelId: values.model ?? DEFAULT_SHOPPER_MODEL };
    }
    // The contract mock has no ledger to read, and its mandate.get would report zeros.
    const ledger = backend === 'simulation-backend' ? await readLedgerFacts(client, mandateId, `${runId}-review`) : null;
    const operator = values['backend-db'] !== undefined && values['backend-config'] !== undefined
      ? { databasePath: displayPath(values['backend-db']), configPath: displayPath(values['backend-config']) }
      : null;
    try {
      const review = buildRunReview({ report, events, ledger, backend, shopper, budgetMinor: session.getContext().budgetMinor });
      console.log(renderRunReview(review, { color: useColor(process.stdout, process.env), operator, brief: values.brief === true }).join('\n'));
    } catch {
      console.log(`\nOutcome: ${printableLine(report.outcome)}\nThe review could not be shown. Use --json for this run's report.`);
    }
  }
  if (report.outcome === 'failed' && report.detail) console.error(`shop: ${printableLine(report.detail)}`);
}

try {
  await main();
} catch (error) {
  // Only messages this CLI wrote or the sanitized backend produced reach the operator.
  const safe = error instanceof BackendSessionError || (error instanceof Error && !(error instanceof z.ZodError));
  const message = safe ? (error as Error).message : 'The command input was invalid';
  if (!reportedDiagnostics.has(message)) console.error(`shop: ${printableLine(message)}`);
  process.exitCode = 1;
}
