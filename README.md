# Splittap — CLI-first equipment purchasing

Help a small-company operations manager equip new hires on time, using approved
hardware, suppliers and an all-in budget. The AI proposes; independent rules and
human-confirmed authority govern execution. The name is provisional.

**Stage one is terminal input/output only.** Prove the purchasing core before building
a website. This scaffold implements offline eligibility checking, not payment execution.

## Start here

- [Project scope and acceptance gates](docs/project-scope.md)
- [Architecture and implementation status](docs/architecture.md)
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
symlink destinations and existing non-catalog files cannot be overwritten. `reset`
restores the dated store-a seed exactly; it does not refresh evidence. A later
`check` loads a fresh supplier snapshot, while an already-created adapter keeps its
original snapshot. Store controls exit `0` on success and `1` on errors; `--json`
emits one JSON result, and diagnostics go to stderr. In Windows PowerShell, use
`npm.cmd` if the local execution policy blocks `npm.ps1`.

These are offline simulation controls, not inventory reservations, supplier orders
or payment execution. Run `npm run cli -- store --help` for all options.

## Mandate draft and review

Plan requirements from a structured hire request, a versioned kit and company
policy. The sample request produces five laptops and five monitors with exact
approved SKUs and policy price/warranty limits. This is deterministic JSON planning;
model integration is still planned.

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
as confirmed mandates by `check`. Stock assignment, human confirmation, quote
eligibility and execution are still separate work, and M1 is incomplete.

The digest above is not the one the backend confirms. To take a draft to confirmation,
pass only its `proposal` to the backend's `mandate-draft`, then confirm the digest the
backend prints. See the [confirmation/stock handoff](services/agent/CONFIRMATION_HANDOFF.md).

Exit codes: `draft` uses 0 for a produced draft and 1 for invalid input; `review`
uses 0 for `draft_valid`, 2 for `needs_revision` and 1 for invalid input. JSON mode
keeps stdout machine-readable and sends errors to stderr. See
[agent planning details](services/agent/README.md) and the
[confirmation/stock handoff](services/agent/CONFIRMATION_HANDOFF.md).

## Status

**Implemented:** runtime contracts, company-policy/mandate examples, fixture supplier,
deterministic eligibility checks, CLI demo/check and fixture-store controls with
behavior tests, plus deterministic mandate draft/review planning. The checker adds a
SQLite ledger for mandate authority and atomic reservations, and a simulation-only
backend CLI (`npm run backend`) with local operator confirmation and durable execution
over fake providers; see [its limits](services/checker/src/ledger/README.md). The
original sandbox PayPal client, money helpers and spike remain intact.

**Planned:** stock assignment, bounded AI shopper, PayPal and real supplier execution
through the ledger, exceptions and equipment-readiness tracking. All will be tested
through the CLI. No website scaffold or frontend dependencies are included.

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
