import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createMandateDraft, reviewMandateDraft } from '../../../services/agent/src/mandate.ts';
import type { DraftOrigin, MandateDraft } from '../../../services/agent/src/mandate.ts';
import { formatSgd } from './format.ts';

const HELP = `Mandate draft and review (offline planning only)

Usage:
  npm run cli -- mandate draft --request request.json|- --now ISO_TIMESTAMP [--json]
    [--policy policy.json] [--kit kit.json] [--proposal-out proposal.json]
  npm run cli -- mandate review --draft draft.json|- --now ISO_TIMESTAMP [--json]
    [--policy policy.json] [--kit kit.json]

The bundled policy and engineering kit are synthetic defaults. Override them for
local planning. Input and output schemas are agent-local, pending shared agreement.
--request - or --draft - reads UTF-8 JSON from stdin. Other paths are relative to
the current directory. Every command needs an explicit offline clock.

draft --json emits the draft artifact itself, suitable for saving and review.
--proposal-out writes only the proposal to a new file (never overwriting one), in
the form the backend's mandate-draft accepts. That handoff is not a confirmation.
review checks the content digest, current policy and kit, deadlines and kit needs.
Exit codes: 0 draft produced/valid; 2 review needs revision; 1 invalid input/error.
The digest identifies content; it is not a signature or approval. These commands
do not confirm mandates, assign stock, establish authority or execute purchases.
`;

export function bundled(path: string): string {
  return fileURLToPath(new URL(`../../../${path}`, import.meta.url));
}

/**
 * Terminal escape sequences in their 7-bit and C1 forms: CSI, then OSC, DCS, SOS, PM and
 * APC strings with a terminator, then any other ESC sequence. An unterminated string
 * loses only its introducer, so its text stays visible instead of vanishing.
 */
const ESCAPE_SEQUENCES = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]?|(?:\u001b[\]PX^_]|[\u0090\u0098\u009d-\u009f])[^\u0007\u001b\u009c]*(?:\u0007|\u001b\\|\u009c)|\u001b[ -/]*[0-~]?/g;
/** Newlines stay, because model text can be several lines. Use printableLine for one field. */
const CONTROLS_AND_BIDI = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/** Supplier and model text can carry escape sequences and bidi overrides; show it inert. */
export function printable(text: string): string {
  return text.replace(ESCAPE_SEQUENCES, ' ').replace(CONTROLS_AND_BIDI, ' ');
}

/** For anything shown on one line: a newline here could forge a line of the report. */
export function printableLine(text: string): string {
  return printable(text).replace(/\n/g, ' ');
}

function readJson(path: string): unknown {
  // PowerShell's UTF-8 Set-Content may write a BOM; it is not part of JSON content.
  return JSON.parse(readFileSync(path === '-' ? 0 : path, 'utf8').replace(/^\uFEFF/, ''));
}

/** A model's guesses and omissions, shown so a person can catch them before confirming. */
export function printOrigin(origin: DraftOrigin): void {
  console.log(`Drafted by a model (${printableLine(origin.requestedModel)}) from this request:`);
  console.log(`  ${printableLine(origin.requestText)}`);
  console.log('Assumptions the model declared (check each before confirming):');
  if (origin.assumptions.length === 0) console.log('  none declared, which does not mean there are none');
  for (const { field, reason } of origin.assumptions) console.log(`  ${printableLine(field)}: ${printableLine(reason)}`);
  console.log('Asked for but NOT captured in this draft:');
  if (origin.notCaptured.length === 0) console.log('  none declared, which does not mean there are none');
  for (const item of origin.notCaptured) console.log(`  - ${printableLine(item)}`);
}

export function printProposal(proposal: MandateDraft['proposal']): void {
  console.log(printableLine(`${proposal.id} v${proposal.version} | policy ${proposal.policyId} v${proposal.policyVersion}`));
  console.log(`  budget: ${formatSgd(proposal.budgetMinor)} (all-in)`);
  console.log(`  purchase by: ${proposal.purchaseBy} | ready by: ${proposal.readyBy}`);
  console.log(printableLine(`  location: ${proposal.deliveryLocationId} | suppliers: ${proposal.allowedSuppliers.join(', ')}`));
  for (const line of proposal.requirements) {
    console.log(printableLine(`  ${line.id}: ${line.quantity} ${line.role}(s) | SKUs: ${line.allowedSkus.join(', ')}`));
    console.log(`    cap: ${formatSgd(line.maxUnitPriceMinor)} each | warranty: ${line.minWarrantyMonths} months minimum`);
  }
}

export function runMandate(args: string[]): void {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      request: { type: 'string' },
      draft: { type: 'string' },
      policy: { type: 'string' },
      kit: { type: 'string' },
      now: { type: 'string' },
      'proposal-out': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const action = positionals[0];
  if (positionals.length !== 1 || (action !== 'draft' && action !== 'review')) {
    throw new Error('Expected mandate draft or review. Use mandate --help.');
  }
  if (!values.now) throw new Error(`mandate ${action} requires --now ISO_TIMESTAMP for offline planning`);
  const allowed = action === 'draft' ? ['request', 'policy', 'kit', 'now', 'json', 'proposal-out'] : ['draft', 'policy', 'kit', 'now', 'json'];
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.includes(key))) {
    throw new Error(`mandate ${action} accepts only ${allowed.map((name) => `--${name}`).join(', ')}`);
  }
  const inputPath = action === 'draft' ? values.request : values.draft;
  if (!inputPath?.trim()) throw new Error(`mandate ${action} requires --${action === 'draft' ? 'request' : 'draft'}`);
  const policyPath = values.policy ?? bundled('config/policies/hardware.example.json');
  if (policyPath === '-' || values.kit === '-') throw new Error('Only --request or --draft can read stdin');
  const policy = readJson(policyPath);
  const kit = readJson(values.kit ?? bundled('services/agent/fixtures/engineering-kit.json'));
  if (action === 'draft') {
    const draft = createMandateDraft(policy, readJson(inputPath), kit, values.now);
    // Written directly, because PowerShell's stdout redirection adds a BOM the backend refuses.
    if (values['proposal-out']) {
      writeFileSync(values['proposal-out'], `${JSON.stringify(draft.proposal, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    }
    if (values.json) console.log(JSON.stringify(draft));
    else {
      console.log(`Mandate draft | digest ${draft.digest}`);
      console.log(`  ${draft.request.hireCount} hires | kit ${draft.kit.id} v${draft.kit.version}`);
      printProposal(draft.proposal);
      console.log('Draft only. No mandate confirmed, stock assigned or purchase authorized.');
    }
    return;
  }
  const review = reviewMandateDraft(readJson(inputPath), policy, kit, values.now);
  if (values.json) console.log(JSON.stringify(review));
  else {
    console.log(`${review.decision} | draft ${review.draftDigest}`);
    printProposal(review.proposal);
    for (const check of review.checks) console.log(`  ${check.status} ${check.code}: ${check.message}`);
    if (review.origin) printOrigin(review.origin);
    console.log('Draft review only. Human confirmation and stock assignment remain pending.');
  }
  process.exitCode = review.decision === 'draft_valid' ? 0 : 2;
}
