# Mandate planning and offline shopping tools

## Delivered planning slice

`src/mandate.ts` deterministically turns a structured hire request and versioned kit
template into a policy-constrained draft. No model integration is implemented yet.
All input is runtime-validated. Supplier lists, exact role SKUs, per-item price caps,
warranty minimums, total budget and aggregate role quantities must stay within the
supplied policy. Templates can narrow limits; attempted relaxations fail rather
than being silently clamped. Purchase must be on or before readiness, and the
purchase deadline must not have passed at the explicit offline clock.

The sample request needs five laptops and five monitors. The template and request
in `fixtures/` and the default company policy are synthetic. No stock is subtracted:
proposed reuse is not an assignment. Per-request quantity checks do not prevent
double allocation or over-purchasing across requests.

From the repository root:

```powershell
npm.cmd run --silent cli -- mandate draft --request services/agent/fixtures/hire-request.json --now 2026-11-04T09:00:00Z --json | Set-Content -Encoding utf8 services/agent/state/draft.json
npm.cmd run cli -- mandate review --draft services/agent/state/draft.json --now 2026-11-04T09:00:00Z
```

Use `--policy` and `--kit` with either command for other local planning files, or
`--request -` / `--draft -` for UTF-8 stdin. UTF-8 BOMs are supported. Working
artifacts under `state/` are ignored in Git. The commands do not write input files;
the example explicitly saves stdout. `--json` emits one artifact or review result;
errors go to stderr. `draft` exits 0 on creation and 1 on invalid input. `review`
exits 0 for `draft_valid`, 2 for `needs_revision` and 1 for invalid input.

Drafts retain the request and kit snapshots, policy content digest, revisions and
creation time. Digests use SHA-256 over JSON with recursively sorted object keys
and original array order. They identify content and are neither signatures nor
approval evidence, and they differ from the digest the backend confirms. Review compares the current policy and kit against the draft,
re-derives the proposal, and checks its digest and deadlines. A changed template or
policy requires a new draft, including edits under an unchanged version number.

`draft_valid` means only that the supplied planning records are consistent. It is
not cart eligibility, affordability, verified evidence, stock assignment, human
confirmation or payment permission. No trusted source identity is established by
passing a file path. Drafts omit `approvedBy` and `confirmedAt` and cannot satisfy
the existing confirmed `MandateSchema`; the CLI `check` command rejects them.

The planning schemas live only in this service. They are experimental inputs and
artifacts, not additions to `packages/contracts/`. See
[the confirmation and stock handoff](CONFIRMATION_HANDOFF.md) before connecting them
to execution. M1 is still incomplete.

## Offline shopping tools: preparatory M4 slice

`src/shopper.ts` exposes four runtime-validated tools through
`createOfflineShoppingSession(input, catalogSource).dispatch(call)`. This is a
deterministic rehearsal surface for a future model worker, not an AI shopper or a
backend connection. Shared contracts and CLI parsing are unchanged. No M1 or M4
acceptance gate is established by this slice.

| Tool | Arguments | Result |
| --- | --- | --- |
| `catalog.search` | `supplierId`, `requirementId`, optional `limit` (1–25, default 10) | Exact approved SKU matches in catalog order, with supplier facts and original evidence |
| `product.view` | `supplierId`, `requirementId`, `sku` | One exact approved product with supplier facts and original evidence |
| `cart.build` | `supplierId`, `lines: [{requirementId, sku, quantity}]` | A price-free `CartSubmission` with host-bound mandate revision and cart ID |
| `cart.submit` | `cartId` returned by the latest successful build | An explicitly labelled offline stub receipt |

Every call is `{ "tool": "NAME", "args": { ... } }`. Extra fields, unrecognized
tools, arbitrary URLs, prices, quote/budget snapshots, clocks, mandate revisions
and approval identities are rejected. Prices can appear in catalog observations;
they cannot enter a cart. The supplied catalog port has only
`getCatalog(supplierId)`; the fixture implementation is
`createFixtureCatalogSource(catalogs)` in `services/suppliers/src/catalog.ts`.
It snapshots configured catalogs and returns separate copies on every read.
The session validates connector output and supplier identity again. Evidence
status, source and observation time are preserved, including unknown or stale facts.
Supplier strings are never interpreted as tool calls or authority.

The host configures a full fixture mandate, `runId`, explicit offline `now`,
optional `maxToolCalls` (1–100, default 24) and `catalogTimeoutMs` (1–10,000,
default 1,000). `getContext()` returns planning fields without `approvedBy` or
`confirmedAt`; accepting a schema-valid mandate does not authenticate it. Calls
are serialized. Invalid, overlapping and replay attempts consume the call budget.
A read timeout discards late results and clears the busy state; it cannot cancel
an adapter's underlying work. Only trusted, read-only adapters belong on this port.

A cart must use configured suppliers, requirements and exact SKUs present in the
catalog. Quantity limits add all lines for each requirement, including different
SKUs. Duplicate SKUs fail validation. A successful rebuild receives a new host ID
and replaces the previous build; a failed rebuild preserves the last valid cart.
One session submits at most one cart. Repeating that submission returns a separate
copy of the same receipt; other tools are closed after submission. These are
in-memory rehearsal semantics, not durable idempotency or cumulative accounting
across sessions. Reuse distinct host run IDs for distinct rehearsals.

The submission receipt has `kind: "offline-eligibility-stub"`, `simulation: true`,
the exact price-free cart and a warning. As specified by the current Role B stub
seam, its nested `EligibilityResult` always says `eligible`; `totalMinor` and
`remainingBeforeMinor` are zero placeholders, `quoteId` is `offline-stub-no-quote`
and the `OFFLINE_STUB` check is `unknown`. **This is not an eligibility decision.**
Keep the wrapper and warning when rendering it. Never pass it off as a checker
result, reservation or payment authority.

The tools constrain proposals but do not check policy narrowing, affordability,
unit prices, stock availability, warranty or delivery evidence. Unknown evidence
stays visible; it is not promoted to verified evidence or purchase permission.
The future trusted executor must independently resolve current authority, quotes
and ledger state, and block execution when required evidence is missing.

Run the behavior tests from the repository root:

```powershell
node --test --test-isolation=none services/agent/src/shopper.test.ts services/suppliers/src/catalog.test.ts
```

`fixtures/shopping-tool-calls.json` is an editable synthetic transcript for terminal
review. To replay it from PowerShell without changing shared CLI routing:

```powershell
@'
import { readFileSync } from 'node:fs';
import { createOfflineShoppingSession } from './services/agent/src/shopper.ts';
import { createFixtureCatalogSource } from './services/suppliers/src/catalog.ts';
const read = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const session = createOfflineShoppingSession({
  mandate: read('examples/mandate.json'), runId: 'fixture-shopping',
  now: '2026-11-03T09:00:00Z'
}, createFixtureCatalogSource([read('services/suppliers/fixtures/store-a.json')]));
const results = [];
for (const call of read('services/agent/fixtures/shopping-tool-calls.json')) {
  results.push(await session.dispatch(call));
}
console.log(JSON.stringify({ mode: 'offline-shopping-replay', results }));
'@ | node --input-type=module
```

The fixed clock keeps dated fixtures reproducible and is not execution time.
The example needs no keys, network, database or external effects. Tests include
hostile supplier text, rejected authority/payment tools, quantity splitting,
mutation isolation, cart identity changes, overlap and timeout recovery. There is
no model here, so these tests do not establish prompt-injection immunity.

Next work is a separately bounded model driver and a coordinated CLI command.
Stock assignment/confirmation integration remains in Danny's ledger scope; see
[the handoff](CONFIRMATION_HANDOFF.md). The future worker must also run without
payment secrets and with process isolation: module separation and these tests do
not prove that deployment boundary. See `AGENTS.md`.
