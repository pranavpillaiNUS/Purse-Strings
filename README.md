# Splittap — CLI-first equipment purchasing

Help a small-company operations manager equip new hires on time, using approved
hardware, suppliers and an all-in budget. The AI proposes; independent rules and
human-confirmed authority govern execution. The name is provisional.

**Stage one is terminal input/output only.** Prove the purchasing core before building
a website. The checker supports offline eligibility and simulated payment execution
using fake providers.

## Start here

- [Project scope and acceptance gates](docs/project-scope.md)
- [Architecture and implementation status](docs/architecture.md)
- [Backend delivery: specification, wire API and evidence](docs/backend-delivery-review.md)
- [Instructions for coding agents](AGENTS.md)
- [Original hackathon plan](docs/hackathon-plan.md) — historical, superseded by scope

## Run

Requires Node 24+ and npm. No API keys or network calls are used by the offline commands.

```sh
npm ci
npm test
npm run typecheck
npm run demo
npm run cli -- check --request examples/cart.json --now 2026-11-03T09:00:00Z
npm run --silent cli -- check --request examples/cart.json --now 2026-11-03T09:00:00Z --json
```

The demo uses a fixed clock and synthetic SGD data. It shows an eligible cart, a
shipping increase exceeding the remaining budget, cumulative over-purchasing and
unknown delivery. It never reserves money or places an order.

`check` loads the bundled policy, mandate, budget snapshot and fixture catalog by
default. Override them with `--policy`, `--mandate`, `--snapshot`, `--catalog`; all
paths resolve from the current working directory. `--request -` reads cart JSON
from stdin. Omit `--now` to use current time; dated fixtures may then expire.

Exit codes for `check`: `0` eligible, `2` blocked, `3` needs review (unknown mandatory
evidence), `1` malformed input or operational error. `demo` exits zero only when all
expected scenarios match. Use `--json` plus npm's `--silent` for clean JSON stdout;
errors go to stderr. Run `npm run cli -- --help` for usage.

## Fixture-store controls

Use a working catalog to change synthetic supplier conditions between checks. The
bundled seed stays unchanged; the supplied `services/suppliers/state/` directory
ignores working files in Git. Custom paths need an existing parent directory.

```sh
npm run cli -- store reset --catalog services/suppliers/state/store-a.json
npm run --silent cli -- store show --catalog services/suppliers/state/store-a.json --json
npm run cli -- check --catalog services/suppliers/state/store-a.json --now 2026-11-03T09:00:00Z
npm run cli -- store set --catalog services/suppliers/state/store-a.json --shipping-minor 50000 --now 2026-11-03T09:00:00Z
# The same cart now exceeds the remaining budget (check exits 2).
npm run cli -- check --catalog services/suppliers/state/store-a.json --now 2026-11-03T09:00:00Z
npm run cli -- store reset --catalog services/suppliers/state/store-a.json
```

`store reset --seed NAME` chooses the baseline: `store-a` (the default), `store-b`, or
`store-b-hostile`, which is store-b with a prompt-injection listing. Add `--now
ISO_TIMESTAMP` to re-date all of its evidence, which runs under the backend's real clock
need. It keeps every status and source as written.

`store set` accepts one or more of these changes:

| Option | Effect |
| --- | --- |
| `--shipping-minor N` | Shipping in integer SGD cents |
| `--sku SKU --price-minor N` | Product price in integer SGD cents |
| `--sku SKU --stock N` | Available integer units; zero is allowed |
| `--delivery-by ISO_TIMESTAMP` | Delivery commitment |
| `--delivery-evidence STATUS` | Delivery evidence status |
| `--sku SKU --stock-evidence STATUS` | Stock evidence status |
| `--sku SKU --product-evidence STATUS` | Product/warranty evidence status |

Evidence status is `supported`, `partial` or `unknown`. Every `set` requires
`--now ISO_TIMESTAMP`. Stock, delivery and explicit evidence changes record synthetic
control provenance and that observation time only for the affected evidence. Unchanged
evidence retains its original time and status; uncertainty is preserved unless
explicitly changed. Shipping or price alone does not refresh evidence, so use
`--product-evidence` to record a new product or warranty observation.

Changes are validated together before replacing the working catalog. Unknown SKUs,
invalid values and unsupported options fail without changing the file. Seed files,
symlink destinations and existing non-catalog files cannot be overwritten. Without
`--now`, `reset` restores the dated seed exactly and does not refresh evidence. A later
`check` loads a fresh supplier snapshot, while an already-created adapter keeps its
original snapshot. Store controls exit `0` on success and `1` on errors; `--json`
emits one JSON result, and diagnostics go to stderr. In Windows PowerShell, use
`npm.cmd` if the local execution policy blocks `npm.ps1`.

These are offline simulation controls, not inventory reservations, supplier orders
or payment execution. Run `npm run cli -- store --help` for all options.

## Mandate draft and review

Plan requirements from a structured hire request, a versioned kit and company
policy. The sample request produces five laptops and five monitors with exact
approved SKUs and policy price/warranty limits. This command uses deterministic JSON
planning; model-assisted drafting is described below.

For PowerShell, save a draft and review it:

```powershell
npm.cmd run --silent cli -- mandate draft --request services/agent/fixtures/hire-request.json --now 2026-11-04T09:00:00Z --json | Set-Content -Encoding utf8 services/agent/state/draft.json
npm.cmd run cli -- mandate review --draft services/agent/state/draft.json --now 2026-11-04T09:00:00Z
```

Both commands accept `--policy` and `--kit`; the defaults are synthetic examples.
Each needs an explicit `--now`. Use `--request -` or `--draft -` for UTF-8 stdin.
`draft --json` emits the artifact itself and `review --json` emits its checks.
Working files under `services/agent/state/` are ignored by Git. Input files are
never edited by these commands; the example saves stdout explicitly.

Review compares the current policy and kit, re-derives the requirements and detects
changed content, modified proposals and expired drafts. A content digest identifies
the draft; it is not a signature or approval. A review result of `draft_valid`
means only that the supplied planning records are consistent. Drafts cannot be used
as confirmed mandates by `check`. Stock assignment remains planned; backend
confirmation, quote eligibility and simulated execution are separate steps, and M1
is incomplete.

The digest above is not the one the backend confirms. To take a draft to confirmation,
save its proposal with `mandate draft --proposal-out FILE`, pass that file to the
backend's `mandate-draft`, then confirm the digest the backend prints. See the
[confirmation/stock handoff](services/agent/CONFIRMATION_HANDOFF.md).

To draft from plain English instead, `npm run shop -- draft` asks Claude to fill in the
request and applies the same policy checks. The result is still only a draft, and it lists
what Claude assumed and could not capture. See
[drafting from plain English](services/agent/README.md#drafting-from-plain-english).

Exit codes: `draft` uses 0 for a produced draft and 1 for invalid input; `review`
uses 0 for `draft_valid`, 2 for `needs_revision` and 1 for invalid input. JSON mode
keeps stdout machine-readable and sends errors to stderr. See
[agent planning details](services/agent/README.md) and the
[confirmation/stock handoff](services/agent/CONFIRMATION_HANDOFF.md).

## The shopper

`npm run shop -- run` lets a model compare approved suppliers and propose price-free
carts. The checker prices each cart independently and reserves budget in its ledger. A
reservation is not payment, an order or delivery. Limits, tools, outcomes and what is
still unproven are in the [agent README](services/agent/README.md#the-shopper).

This PowerShell walkthrough uses the scripted model, so it needs no API key. **It stops
at the second backend command on Windows**, because of the runtime-directory check
described in the [handoff](services/agent/CONFIRMATION_HANDOFF.md#blocked-on-windows).
The contract-mock command in the agent README works everywhere.

```powershell
$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$config = "services/agent/fixtures/backend-demo-config.json"

# Control panel: two working catalogs, re-dated for the backend's real clock.
npm.cmd run --silent cli -- store reset --catalog services/suppliers/state/store-a.json --seed store-a --now $now
npm.cmd run --silent cli -- store reset --catalog services/suppliers/state/store-b.json --seed store-b-hostile --now $now

# Plan, then the operator stores, reviews and confirms the exact revision.
npm.cmd run --silent cli -- mandate draft --request services/agent/fixtures/demo-hire-request.json --now $now --proposal-out services/agent/state/proposal.json
$draft = npm.cmd run --silent backend -- --db .runtime/app.db --config $config mandate-draft --file services/agent/state/proposal.json | ConvertFrom-Json
npm.cmd run --silent backend -- --db .runtime/app.db --config $config mandate-review --id engineering-hires-demo --revision 1
npm.cmd run --silent backend -- --db .runtime/app.db --config $config mandate-confirm --id engineering-hires-demo --revision 1 --digest $draft.digest

# A compromised model obeys the hostile listing. Everything is refused, nothing reserved.
npm.cmd run --silent shop -- run --run-id compromised --mandate-id engineering-hires-demo --backend-db .runtime/app.db --backend-config $config --scripted services/agent/fixtures/compromised-shopping-calls.json

# An honest run compares both stores and reserves the cheaper cart. Prints the operation ID.
npm.cmd run --silent shop -- run --run-id demo --mandate-id engineering-hires-demo --backend-db .runtime/app.db --backend-config $config --scripted services/agent/fixtures/demo-shopping-calls.json

# Only the operator's backend process executes, here against fake providers.
npm.cmd run --silent backend -- --db .runtime/app.db --config $config operation-run --id OPERATION_ID
npm.cmd run --silent backend -- --db .runtime/app.db --config $config audit --id OPERATION_ID
```

To use Claude, add `ANTHROPIC_API_KEY` to `.env` and drop `--scripted`. Delete `.runtime/`
and the `state` files to start again. Change a store between runs with `store set`: a
shipping jump, for example, makes the checker reject a cart the model had estimated
within budget.

## Status

**Implemented:** runtime contracts, company-policy/mandate examples, fixture supplier,
deterministic eligibility checks, CLI demo/check and fixture-store controls with
behavior tests, plus deterministic mandate draft/review planning. The checker adds a
SQLite ledger for mandate authority and atomic reservations, and a simulation-only
backend CLI (`npm run backend`) with local operator confirmation and durable execution
over fake providers; see [its limits](services/checker/src/ledger/README.md). The
bounded shopper worker (`npm run shop`) submits through the shared client to that
backend. It is tested with scripted models against the real checker core, and has had
four live Claude runs so far, all against the contract mock, two of them with both stores
and the hostile listing. Mandates can also be drafted from plain English (`npm run shop --
draft`), which has had two live Claude runs. The original sandbox PayPal client, money
helpers and spike remain intact. Unit 4 added a separate PayPal gateway
([docs/backend-api.md](docs/backend-api.md#paypal-gateway-unit-4-contract--unit-5-sandbox-additions))
with capture/refund read-and-write contracts — sandbox host only, injected fetch,
finite timeouts, `SGD`/minor-unit money at the edge — proven by fetch-mocked tests
only. Unit 5 wires that gateway into the execution ledger behind the backend
config (`paymentProvider: "paypal-sandbox"`): operator-only hold commands
(`operation-authorize`, `operation-complete-authorization`) place a sandbox hold
on a reserved operation before `operation-run`, and the durable worker recovers
crashes through sandbox reads. Nothing here has been verified against a real
PayPal account, the supplier order stays fake in every configuration, and no
live or unscripted PayPal request has ever been sent; [delivery
evidence](docs/backend-delivery-review.md) separates simulated execution,
contract coverage and code wiring from account feasibility.

**Planned (still unimplemented):** stock assignment, at least one authorized
interactive sandbox exercise recorded in `docs/paypal-spike.md` (buyer consent on
PayPal's hosted page during the operator's own authorized steps), and the
`packages/contracts` `paymentProvider` proposal
through the ledger, real supplier
execution, exceptions and equipment-readiness tracking. All will be tested through the
CLI. No custom website is in the scaffold or stage-one acceptance; the only browser
page involved anywhere is PayPal's own hosted buyer-consent screen during the
optional sandbox spike.

## Separate PayPal feasibility spike

Read [setup and results](docs/paypal-spike.md) before invoking:

```sh
cp .env.example .env
# Add sandbox credentials locally. Never commit .env.
npm run spike:paypal
```

The interactive spike creates sandbox authorizations/captures after buyer approval.
It is separate from offline checks and remains unverified by this scaffold. A PayPal
authorization is not the application's exact budget-enforcement layer.
