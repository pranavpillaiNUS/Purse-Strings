# Mandate planning and the bounded shopper

The agent drafts mandates and shops within them. It never decides what executes: the
checker prices every cart itself and owns the ledger. This service holds no payment
credentials and imports no checker code. `src/boundary.test.ts` checks the imports;
that proves module separation, not deployment isolation.

## Mandate planning

`src/mandate.ts` deterministically turns a structured hire request and versioned kit
template into a policy-constrained draft. No model is involved yet. All input is
runtime-validated. Supplier lists, exact role SKUs, per-item price caps, warranty
minimums, total budget and aggregate role quantities must stay within the supplied
policy. Templates can narrow limits; attempted relaxations fail rather than being
silently clamped. Purchase must be on or before readiness, and the purchase deadline
must not have passed at the explicit offline clock.

The sample request needs five laptops and five monitors. The template and requests in
`fixtures/` and the default company policy are synthetic. `hire-request.json` is dated
for fixed-clock tests and its deadline has passed; `demo-hire-request.json` allows both
stores and is dated for real-clock runs until November 16, 2026. No stock is
subtracted: proposed reuse is not an assignment.

From the repository root:

```powershell
npm.cmd run --silent cli -- mandate draft --request services/agent/fixtures/hire-request.json --now 2026-11-04T09:00:00Z --json | Set-Content -Encoding utf8 services/agent/state/draft.json
npm.cmd run cli -- mandate review --draft services/agent/state/draft.json --now 2026-11-04T09:00:00Z
```

Use `--policy` and `--kit` with either command for other local planning files, or
`--request -` / `--draft -` for UTF-8 stdin. UTF-8 BOMs are supported. Working
artifacts under `state/` are ignored in Git. `--json` emits one artifact or review
result; errors go to stderr. `draft` exits 0 on creation and 1 on invalid input.
`review` exits 0 for `draft_valid`, 2 for `needs_revision` and 1 for invalid input.

`mandate draft --proposal-out FILE` also writes just the proposal to a new file, in the
form the backend's `mandate-draft` accepts. It refuses to overwrite an existing file.

Drafts retain the request and kit snapshots, policy content digest, revisions and
creation time. Digests use SHA-256 over JSON with recursively sorted object keys and
original array order. They identify content and are neither signatures nor approval
evidence, and they differ from the digest the backend confirms. Review compares the
current policy and kit against the draft, re-derives the proposal, and checks its digest
and deadlines. A changed template or policy requires a new draft, including edits under
an unchanged version number.

`draft_valid` means only that the supplied planning records are consistent. It is not
cart eligibility, affordability, verified evidence, stock assignment, human confirmation
or payment permission. Drafts omit `approvedBy` and `confirmedAt` and cannot satisfy
`MandateSchema`. The planning schemas live only in this service, not in
`packages/contracts/`. See [the confirmation and stock handoff](CONFIRMATION_HANDOFF.md).

## The shopper

`npm run shop -- run` runs a model in a loop over four tools, through the shared
`BackendClient`. The mandate and ledger totals come from the backend's `mandate.get`, so
an unconfirmed mandate stops the run before any model call.

| Module | Responsibility |
| --- | --- |
| `src/shopper.ts` | The tool boundary: validates each call and tracks carts, units and submission state |
| `src/backend-session.ts` | Connects the session to the shared backend client |
| `src/worker.ts` | The bounded model loop, the prompt and the host-derived report |
| `src/model.ts` | The provider-neutral model seam, plus a scripted model for offline runs |
| `src/anthropic.ts` | Claude through a manual Messages loop |

`apps/cli/src/shop.ts` is a separate entry point, like `backend.ts`, so this process
never loads checker modules. It reaches the backend through
`apps/cli/src/backend-transport.ts`: one fresh `rpc` child process per request, with an
allowlisted environment that excludes the model key.

### Tools

| Tool | Arguments | Result |
| --- | --- | --- |
| `catalog.search` | `supplierId`, `requirementId`, optional `limit` (1–25, default 10) | Approved exact SKU matches with supplier facts and original evidence |
| `product.view` | `supplierId`, `requirementId`, `sku` | One approved product with supplier facts and original evidence |
| `cart.build` | `supplierId`, `lines: [{requirementId, sku, quantity}]` | A price-free cart with a host-assigned ID, and a non-authoritative estimate for comparison |
| `cart.submit` | `cartId` from the latest successful build | The checker's answer, plus remaining units and budget |

Models see these as `catalog_search` and so on. Extra fields, other tools, URLs, prices,
quotes, budgets, clocks, mandate revisions and approval identities are all rejected, and
those attempts still consume the tool budget. Supplier strings are never interpreted as
tool calls or authority. Unknown or stale evidence stays visible, not promoted.

### What the host enforces

| Limit | Default |
| --- | --- |
| Tool calls, including invalid ones | 24 (`--max-tool-calls`) |
| Model turns | 16 (`--max-model-turns`) |
| Carts accepted per run | 3 (`--max-carts`) |
| Total tokens counted across turns | 150,000 |
| Wall clock for the run | 5 minutes |

Quantities count ledger holdings plus this run's accepted carts, across all carts and
suppliers. A truncated or refused model turn never runs its tool calls. A model's final
text is reported as `modelSummary`; `outcome` and `progress` come only from host state,
so a model claiming success changes nothing.

### Submission outcomes

| Backend answer | Session behavior |
| --- | --- |
| Accepted | Units and budget update. This is a reservation, not payment or an order |
| `BUDGET_EXCEEDED`, `QUANTITY_EXCEEDED`, `QUOTE_EXPIRED`, `MANDATORY_EVIDENCE_UNKNOWN`, `INELIGIBLE`, `SUPPLIER_UNAVAILABLE` | Nothing reserved. The model may build an alternative |
| `IDEMPOTENCY_CONFLICT`, `MANDATE_REVISION_CONFLICT`, `MANDATE_NOT_CONFIRMED`, `NOT_FOUND`, `INVALID_REQUEST`, `UNSUPPORTED_VERSION` | Run ends as `backend_refused`. Another cart cannot fix these |
| `BUSY`, `INTERNAL_ERROR`, timeout or lost response | Unknown: a reservation may exist. No other cart can be built until the same cart ID resolves it |

One cart always carries the same idempotency key, so retrying can only return the
original operation. Reusing a run ID is safe too: a fresh session reads the ledger's
holdings first, and changed content under an existing cart ID is refused.

### Run it

Exit codes: 0 `completed`; 2 `partial`, `no_feasible_cart`, `limit_exceeded`,
`backend_refused` or `model_refused`; 3 `unknown_submission`; 1 `failed` or invalid
input. `--json` prints one report on stdout, and `--trace FILE` appends each model turn
and tool call as JSON lines before the tool runs. Run `npm run shop -- --help` for all
options.

Against the contract mock, with no ledger, key or network:

```powershell
npm.cmd run --silent shop -- run --run-id fixture-shopping --mandate-id engineering-hires-november --mock-mandate examples/mandate.json --catalog services/suppliers/fixtures/store-a.json --scripted services/agent/fixtures/shopping-tool-calls.json
```

Against the real simulation backend, see the [README walkthrough](../../README.md#the-shopper).

For a live model, set `ANTHROPIC_API_KEY` in `.env` and omit `--scripted`. The shopper
reads only that one name from `.env`, because loading the whole file would put PayPal
credentials in its process; it refuses to start if any `PAYPAL_*` variable is set. It
uses `claude-opus-5-5` unless `--model` says otherwise, at `medium` effort, with server-side
refusal fallback (`fallbacks: "default"`) enabled. The task states the host's current time
so the model can flag a passed deadline; the backend's own clock still decides every
deadline.

To try a live model on any machine, use the practice mandate, which allows both stores and
has a deadline of November 16, 2026. This example includes the hostile listing:

```powershell
npm.cmd run --silent shop -- run --run-id two-store-live --mandate-id engineering-hires-practice --mock-mandate services/agent/fixtures/practice-mandate.json --catalog services/suppliers/fixtures/store-a.json --catalog services/suppliers/fixtures/store-b-hostile.json
```

The contract mock checks no policy, budget, evidence or deadlines. Acceptance there is not a
checker decision, even when a model's summary calls it one, because the model cannot tell
which backend answered.

Scripted runs use `fixtures/*-shopping-calls.json`. `demo-shopping-calls.json` compares
both stores and buys from the cheaper one (`--run-id demo`).
`compromised-shopping-calls.json` plays a model obeying the hostile listing
(`--run-id compromised`): every attempt is refused and nothing is reserved.

### Not established

- **Live model behavior is barely tested.** Claude has run once, on November 6, 2026,
  against the contract mock with one store and only one possible cart. That confirmed the
  live connection and tool use, and it predates the current-time context. No live run has
  yet chosen between stores, read the hostile listing or used the real backend, so there
  is no claim of prompt-injection immunity. `src/anthropic.test.ts` proves the request and
  response mapping with a stubbed `fetch`, and the scripted model proves the host's bounds.
  The protection tested here is that obeying the listing achieves nothing.
- **No acceptance gate is passed by this.** M4 still needs a live hostile-listing run,
  CLI review and approval, and bounded exceptions.
- **Run state is not durable.** An interrupted worker keeps nothing but its optional trace.
  The ledger holds the facts, and a rerun with the same run ID reads them. Nothing here
  looks up an operation by cart ID, so an `unknown_submission` needs the same run rerun or
  an operator check.
- **No deployment isolation.** The worker should run without payment secrets under its own
  OS identity; the environment guard and module boundary do not prove that alone.

## Tests

From the repository root:

```powershell
node --test "services/agent/src/*.test.ts" "services/suppliers/src/*.test.ts" apps/cli/src/shop.test.ts apps/cli/src/backend-transport.test.ts
```

`apps/cli/src/shop.test.ts` runs the worker against the real checker core and a real
SQLite ledger: normal purchase, a shipping jump then recovery, a split across suppliers,
unknown evidence, a lost response, reuse of a run ID, competing runs, and a compromised
model. Its full-process walk is skipped on Windows; see
[the handoff](CONFIRMATION_HANDOFF.md).

`createOfflineShoppingSession` remains as a single-cart rehearsal that never contacts a
backend. Its receipt always says `eligible` with zero placeholder amounts and an `unknown`
`OFFLINE_STUB` check. **That is not an eligibility decision.** Keep the wrapper and warning
when rendering it, and never pass it off as a checker result.
