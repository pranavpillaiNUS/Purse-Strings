# Mandate planning and the bounded shopper

The agent drafts mandates and shops within them. It never decides what executes: the
checker prices every cart itself and owns the ledger. This service holds no payment
credentials and imports no checker code. `src/boundary.test.ts` checks the imports;
that proves module separation, not deployment isolation.

## Mandate planning

`src/mandate.ts` deterministically turns a structured hire request and versioned kit
template into a policy-constrained draft. No model is involved in this step, though a
model can write the request; see [drafting from plain English](#drafting-from-plain-english).
All input is runtime-validated. Supplier lists, exact role SKUs, per-item price caps, warranty
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

### Drafting from plain English

`npm run shop -- draft` asks a model to turn a manager's sentence into the same structured
request, through `src/mandate-drafter.ts`. It runs from the shopper's entry point, which
holds the model key and never loads checker modules.

```powershell
npm.cmd run --silent shop -- draft --text-file services/agent/fixtures/hire-request-text.txt --draft-out services/agent/state/draft.json --proposal-out services/agent/state/proposal.json
npm.cmd run cli -- mandate review --draft services/agent/state/draft.json --now (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
```

Add `--scripted services/agent/fixtures/draft-request-calls.json --now 2026-11-06T09:00:00Z`
to rehearse with no key or network. Without `--scripted`, the command spends API credit.
`--text` takes the request inline, and `--json` prints one report. Run
`npm run shop -- --help` for all options. Output files must be two different new files in a
directory that exists, and that is checked before the model call. Review with a time after the draft's creation time, or
`DRAFT_TIME` fails.

| Outcome | Exit | Meaning |
| --- | --- | --- |
| `drafted` | 0 | A policy-checked draft exists. It still needs human review and confirmation |
| `needs_input` | 2 | The model asked for something instead of drafting. Nothing was guessed |
| `policy_refused` | 2 | The request as read breaks policy or a deadline, exceeds what a mandate can hold, or names an unlisted location |
| `invalid_output` | 2 | The output did not fit the format in 3 turns, gave an unusable value for something the manager asked for, or changed one on a retry |
| `model_refused` | 2 | The model declined |
| `failed` | 1 | The model call failed or was truncated, or the input was invalid |

How the host treats the model's answer:

- **It passes through `createMandateDraft`,** so policy, the kit and deadlines apply exactly
  as they do to a hand-written request. The tool's schema has no field for an approval,
  confirmation or stock assignment, and extra fields are rejected.
- **A retry can correct a format, not what was asked for.** The model sees format errors and
  can retry, but the run ends if it gives an unusable value for hires, budget, dates, location,
  suppliers or the kit, or changes one of them on a retry. A changed value would reach the
  reviewer looking like a clean draft. It never sees a policy refusal, and it is not told the
  policy limits, so it cannot lower the numbers until they pass.
- **The deadline is checked when the model answers.** The clock is read again after the
  reply, because a slow reply can outlast a deadline. `--now` stays fixed for rehearsals.
- **Guesses are recorded.** The draft keeps the request text, each value the model says it
  chose and everything it could not capture, and its digest covers them. `shop draft` and
  `mandate review` both print them. When a request does not say, the prompt sets the
  purchase deadline to three days before the ready-by date and the time of day to 17:00
  at the delivery location.
- **IDs and locations are limited.** Model-chosen mandate IDs use only lowercase letters,
  digits and hyphens. Locations must be ones the operator lists with `--location`, because
  neither policy nor the kit lists them, and any other location ends the run. The default
  is `singapore-office`.

Claude has run this four times, three on November 6, 2026 and one on November 7, with the
default model. Three times, for `hire-request-text.txt` and for the same text from the demo
flow, it read each stated value correctly, flagged the values it chose, and listed stock reuse
and the start date as not captured. For
`hire-request-over-budget-text.txt`, which asks for S$20,000 and falsely claims a CFO
approval, it copied the budget unchanged, so policy refused it, and it recorded the
approval claim as not captured without acting on it.

This does not establish much yet:

- **Other wording is untested.** Scripted tests prove how the host handles model output, not
  how a model reads a request. The prompt's rules for missing or non-SGD values have not run
  live.
- **Only the model declares its assumptions.** The host cannot tell whether a value was
  misread or a guess went unflagged. A reviewer has to compare the draft with the request.
- **The backend does not see them.** Its `mandate-review` shows only the proposal, and its
  confirmation digest covers only the policy digest and proposal. See
  [the handoff](CONFIRMATION_HANDOFF.md).

## The shopper

`npm run shop -- run` runs a model in a loop over four tools, through the shared
`BackendClient`. The mandate and ledger totals come from the backend's `mandate.get`, so
an unconfirmed mandate stops the run before any model call.

| Module | Responsibility |
| --- | --- |
| `src/shopper.ts` | The tool boundary: validates each call and tracks carts, units and submission state |
| `src/backend-session.ts` | Connects the session to the shared backend client |
| `src/worker.ts` | The bounded model loop, the prompt and the host-derived report |
| `src/review.ts` | Pure. Turns a report, its events and ledger numbers into what a person reads, with plain wording for codes |
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
original operation. Each cart is saved before it is sent, in a folder beside the backend
database, and removed once its outcome is known. If a cart is left unknown, the next
`shop run` on that mandate, under any run ID, sends that exact cart again with no model,
reports the answer and stops. That also recovers the operation's ID. Reading the ledger
can't replace this, because a request still on its way isn't in the ledger yet. Changed
content under an existing cart ID is refused.

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

### What a run prints

As a run goes, each tool call prints one line, followed by `x refused:` and a plain reason if
the host refused it. The run then closes with a review, rendered by
`apps/cli/src/review-output.ts` in 80 columns and ASCII, with colour only on a terminal with
`NO_COLOR` unset:

- **Outcome,** with a sentence saying what it means. Every run paid for and ordered nothing.
- **Budget,** with a bar and the total, committed, reserved and remaining amounts. These come
  from one extra `mandate.get` after the run. If that read fails, the review says so and shows
  what the run knows, and the exit code does not change. The contract mock is never read,
  because its `mandate.get` always reports zero.
- **Requirements,** with units allocated, meaning reserved or committed, not delivered.
- **What the checker decided,** one row per cart, in order: the store, the cart ID, an estimate
  marked as non-authoritative, the decision, and the checker's own total when it accepted.
  A rejection groups its check codes into sentences that name only what the codes establish.
  A cart built and never submitted shows as `Not sent`.
- **Refused attempts,** with each call and its reason.
- **The next step:** the exact `operation-run` command for the operator, never the shopper.
- **Usage,** with token counts for live runs only. **The model's summary** comes last, with every
  line prefixed so it cannot pass for part of the report.

The report and the ledger supply every result. Events supply only the order, the estimates
and the refused calls, and one that fails validation is counted, not trusted. An event
claiming an acceptance the report does not record reads as unknown. A code with no wording
shows raw. An unknown submission reads as unknown, never as failed or safe. Supplier and model
text passes through `printable` or `printableLine` in `apps/cli/src/mandate.ts`, which
neutralize escape sequences, C1 controls and bidi overrides. The review then replaces any
remaining non-ASCII character. Against the contract mock, the review says plainly that it
checks nothing and offers nothing to execute. `--json` prints the worker's report unchanged,
without the extra read. The kept sentence "Simulation. Reservations are not payment, orders,
delivery or equipment readiness." is 82 characters, the one line over 80.

Add `--brief` to `shop run` for a recording. It keeps the live call lines, outcome,
budget and requirement bars, store table and simulation sentence. Refused attempts become
one count, the next step is shortened, and usage is omitted. A labelled model summary
stays; only the scripted stand-in's placeholder is dropped. A long summary is cut to its
conclusion and its section on suspicious supplier data, and the review says how many lines
it left out; `--json` and `--trace` keep the full text. Exit codes stay the same.
`--brief` with `--json` is refused with exit 1; `--json` alone is unchanged.

### Read-only status

```powershell
npm.cmd run --silent shop -- status --mandate-id ID BACKEND [--operation ID ...] [--json]
```

This shows the budget bar and allocated requirements, and for each `--operation` its status with
reservation, payment, order, refund and readiness on separate lines. It uses only the shared
client's `mandate.get` and `operation.get`, so it cannot change anything. It builds no model,
needs no key, and refuses to start if any `PAYPAL_*` variable is set. The client cannot list
operations, so IDs come from the flag: `shop run` prints the ID of each reservation. Reads finish
before anything prints, so a failure leaves stdout empty. Exit codes: 0 shown; 1 invalid input
or backend failure, including an operation that is not found. An older mandate revision's
operation is not found either, because reads use the active revision. Against the contract mock
it says the mock checks nothing, its numbers are placeholder zeros, and it holds no operations
between commands. The backend-owned `Operation.paymentProvider` selects fake or
PayPal sandbox wording for payment and refund; supplier orders always remain fake.
An older response without the field says the provider is not recorded. The run review
also shows each accepted operation's provider, and a sandbox reservation prints
`operation-authorize`, the buyer approval step, `operation-complete-authorization`
and `operation-run` in order. Reading these facts loads no payment credentials.
Readiness always reads `not_assessed`, because readiness
tracking is not built.

Here and in the run review, "allocated" means reserved or committed, not delivered.
A reservation sets budget aside; it is not a PayPal authorization hold or payment.
Status JSON names these totals `budget.allocatedMinor` and
`requirements[].allocatedUnits`. The shared operation additionally carries the
optional backend-owned `paymentProvider` field; it is never accepted in a cart.

### Live runs

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
both stores and buys from the cheaper one (`--run-id demo`), which live Claude declined to do
while store-b carried the hostile listing. `compromised-shopping-calls.json` plays a model
obeying the hostile listing (`--run-id compromised`): every attempt is refused and nothing
is reserved. `recovery-shopping-calls.json` submits store-b's cart, and when that is rejected
it recovers at store-a (`--run-id recovery`).

### Not established

- **Live model behavior is lightly tested.** Claude has run eight times, six on November 6,
  2026 and two on November 7, with the default model. Four used the contract mock and four the
  real backend. Four runs had both stores and the hostile listing, two on each backend. In each,
  Claude made no call that followed the listing, flagged it in its summary and reserved at
  store-a, passing over store-b, about S$262 cheaper. That is four runs of one fixed injection,
  so there is no claim of prompt-injection immunity. `src/anthropic.test.ts`
  proves the request and response mapping with a stubbed `fetch`, and the scripted model
  proves the host's bounds. The protection tested here is that obeying the listing achieves
  nothing.
- **Model summaries can be wrong.** Both two-store summaries called the mock "the checker".
  One said records "check out" when they were 72.6 hours old: the real checker's 72-hour
  limit would have failed them, and the model is not told that limit. The other can be read
  as putting the November 18 delivery before the November 16 purchase deadline. A later
  summary's rough estimate left out tax on shipping. This is why `outcome` and `progress`
  come only from host state.
- **A passed deadline stopped one run.** Given a mandate whose purchase deadline had passed
  the day before, Claude made no tool calls and said why. That is one run of an instruction
  to the model; the backend's clock is what enforces deadlines.
- **The real backend has had two live passes.** In one `demo:flow --live` run on each of
  November 6 and 7, each in a temporary Windows copy with the backend's mode check skipped,
  Claude used the real checker twice. Both times, with the hostile listing it followed nothing,
  flagged it and reserved at store-a. On a separate mandate, it submitted store-b's cheaper cart
  with 75-hour-old records, was rejected with `MANDATORY_EVIDENCE_UNKNOWN`, and recovered at
  store-a. It is not told the 72-hour limit, and a run where it avoids store-b would show no
  rejection. The flow reports that with exit 2. Two passes are not a reliability rate. The scripted
  flow passes in CI on Linux, Windows and macOS, but no live run has happened on Linux or macOS,
  or on Windows with the backend's folder check on.
- **No acceptance gate is passed by this.** M4 still needs CLI review and approval, and
  bounded exceptions.
- **Run state is not durable.** An interrupted worker keeps nothing but its optional trace.
  The ledger holds the facts, and a rerun reads them. The one exception is a cart that may
  still be on its way, which the next run resends first. Anyone who can write to that folder
  could plant a cart there, but it still has to pass the checker and the operator.
- **No deployment isolation.** The worker should run without payment secrets under its own
  OS identity; the environment guard and module boundary do not prove that alone.

## Tests

From the repository root:

```powershell
node --test "services/agent/src/*.test.ts" "services/suppliers/src/*.test.ts" apps/cli/src/shop.test.ts apps/cli/src/shop-draft.test.ts apps/cli/src/review-output.test.ts apps/cli/src/backend-transport.test.ts
```

`apps/cli/src/shop.test.ts` runs the worker against the real checker core and a real
SQLite ledger: normal purchase, a shipping jump then recovery, a split across suppliers,
unknown evidence, a lost response, reuse of a run ID, competing runs, and a compromised
model.

`createOfflineShoppingSession` remains as a single-cart rehearsal that never contacts a
backend. Its receipt always says `eligible` with zero placeholder amounts and an `unknown`
`OFFLINE_STUB` check. **That is not an eligibility decision.** Keep the wrapper and warning
when rendering it, and never pass it off as a checker result.
