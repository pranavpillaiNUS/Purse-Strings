import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createMandateDraft, reviewMandateDraft } from '../../../services/agent/src/mandate.ts';
import type { MandateDraft } from '../../../services/agent/src/mandate.ts';

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

function bundled(path: string): string {
  return fileURLToPath(new URL(`../../../${path}`, import.meta.url));
}

function readJson(path: string): unknown {
  // PowerShell's UTF-8 Set-Content may write a BOM; it is not part of JSON content.
  return JSON.parse(readFileSync(path === '-' ? 0 : path, 'utf8').replace(/^\uFEFF/, ''));
}

function printProposal(proposal: MandateDraft['proposal']): void {
  console.log(`${proposal.id} v${proposal.version} | policy ${proposal.policyId} v${proposal.policyVersion}`);
  console.log(`  budget: ${proposal.budgetMinor} SGD cents (all-in)`);
  console.log(`  purchase by: ${proposal.purchaseBy} | ready by: ${proposal.readyBy}`);
  console.log(`  location: ${proposal.deliveryLocationId} | suppliers: ${proposal.allowedSuppliers.join(', ')}`);
  for (const line of proposal.requirements) {
    console.log(`  ${line.id}: ${line.quantity} ${line.role}(s) | SKUs: ${line.allowedSkus.join(', ')}`);
    console.log(`    cap: ${line.maxUnitPriceMinor} SGD cents each | warranty: ${line.minWarrantyMonths} months minimum`);
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
    console.log('Draft review only. Human confirmation and stock assignment remain pending.');
  }
  process.exitCode = review.decision === 'draft_valid' ? 0 : 2;
}
