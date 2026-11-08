# Backend delivery review: evidence trail and honest limits

This is the review surface for what the offline backend actually proves, what was
verified at which unit, what reproduction commands to run, and what remains
unproven. Companion documents:

- Accepted specification, copied with an accurate status addendum:
  [backend-delivery-design.md](backend-delivery-design.md)
- Wire API, mock limits, runtime state layout and the PayPal gateway contract:
  [backend-api.md](backend-api.md)
- Living audit record: `.audit/backend-delivery/decisions.tsv` and the per-unit
  results `unit1-result.md` through `unit5-result.md` in the same
  directory. This page links that trail without copying transcripts or secrets.

## What the different proof classes mean

Four levels appear below and must not be confused:

1. **Simulated execution** — Singapore money is computed and reserved inside a
   SQLite ledger, but every payment/supplier effect is a labelled fake provider in a
   separate fake DB (`execution/fake.ts`). `ordered`/`compensated` are fake-provider
   facts. Simulated recovery does not prove real provider feasibility.
2. **PayPal contract coverage** — the gateway's tests run entirely on an
   injected fake `fetch` with global fetch denied. They prove what the adapter does
   given a response, never what PayPal actually sends or accepts. Contract coverage
   is not sandbox-account feasibility.
3. **Worker/CLI integration** — fresh processes, real SQLite files, SIGKILL between
   provider commit and acknowledgement. PayPal-backed variants run the same crash
   evidence against a scripted fake fetch inside the child. This is the strongest
   offline evidence class but still says nothing about real suppliers or a real PayPal account.
4. **Wiring in code is not account feasibility** — unit 5 connects the gateway,
   the binding ledger table, the operator hold commands and credential containment.
   The purchase path now EXISTS for `paymentProvider:"paypal-sandbox"`, but no
   sandbox account was contacted: the binding lifecycle, PayPal's response shapes
   (overcapture, pending reasons, request-id replay across endpoints) and buyer
   consent behavior remain unverified until one authorized interactive sandbox
   exercise is recorded in `docs/paypal-spike.md` and the demo. A "sandbox-verified"
   claim is not possible from this branch alone, and no live capture has occurred.

## Acceptance evidence trail (offline, all reproducible below)

### M0 — delivered by the scaffold

Pure eligibility checks, CLI `demo`/`check`, exit codes and fixture-store controls,
behaviour-tested and reproducible offline (`npm test`, `npm run demo`). Snapshot
inputs (`BudgetSnapshot`, fixture mandate) are offline inputs, never authority.

### M1 — authority SUBSET only

Delivered: deterministic CLI mandate draft/review from structured requests and kit
templates; backend-side immutable revisions with review digests and local operator
confirmation (`mandate-draft/review/confirm`), verifiable by digest; confirmation
refuses replacement revisions after the first reservation (permanent
`exposure_started`). Not delivered and not claimed: manually attested stock,
stock/assignment subtracting from requirements, approval/exception flows,
production authentication of the confirming operator (the OS-user identity is
explicitly a prototype boundary).

### M2 — ledger and recovery slice on real-storage evidence

`services/checker/src/ledger/` + tests prove, over real SQLite files and fresh
child processes: atomic amount and per-requirement quantity reservations that cap
summed requirements across racing carts; single-operation resolution for the same
cart raced under different keys and the changed-payload conflict; immutable
confirmation/digest revision management; restart persistence with WAL
(`synchronous=FULL`, `BEGIN IMMEDIATE`, applied set re-read inside one
transaction); and a dual-open migration race that was root-caused and fixed with a
regression test (see `unit3-result.md`, LEDGER-R5-001 repair section). No gate is
claimed beyond what those tests exercise.

### M3 — simulated recovery + mocked contract coverage ONLY (real feasibility unverified)

- Execution: durable worker over fake providers with real crash-restart recovery:
  lease claim/renew/fencing across processes, SIGKILL after a successful capture or
  order commit with reconciliation resuming the original idempotent request,
  unknown retention forcing `reconciliation_required`, definitive rejection
  (release), refund without entitlement restoration, capture gate revalidation
  (fresh quote/authority/timeliness, excluding own reservation). Tests:
  `services/checker/src/execution/worker.test.ts` (fresh child processes with
  crash scenarios; see `unit3-result.md`).
- PayPal: unit-4/5 gateway + injected-fetch/finite-timeout client as described in
  [backend-api.md](backend-api.md). The purchase path is wired behind the backend
  config (`paymentProvider`) with ledger binding rows (migration 3), the two
  operator hold commands, and recovery through authorization status, the persisted
  order's payment history and an independent capture read (`worker-paypal.test.ts`).
  The November 8 cleanup replaced a synthetic capture-link assumption in that
  test. This remains a fake-fetch crash proof; no account recovery exercise ran
  during the cleanup. Separate manual observations live in `docs/paypal-spike.md`
  and do not establish response-loss recovery, early-approval retry or unused-hold
  release. M3 remains incomplete. Real supplier quote APIs also remain unchecked.

### Milestones M4/M5

- **M4 partial:** the bounded shopper worker
  (`services/agent`, merged from main via role-b-shop) submits price-free carts
  through the shared client (`createBackendClient`) to this backend and its
  contract mock; the demo/handoff files describe what its scripted and live-mock
  runs reached. Its CLI approval/exception commands, payment secrets and any
  claim about model behaviour beyond what the run reports show are absent.
  Model-assisted drafting from a plain-English request is available via
  `npm run shop -- draft`. Its output remains a draft until the operator reviews
  and confirms it through the backend; full M1 acceptance remains incomplete.
- **M5 (delivery/readiness/close-out) is deferred; nothing is claimed beyond
  readiness `not_assessed`.**

## Reproduction commands (offline only — no network anywhere here)

Code and doc checks:

```sh
npm test
npm run typecheck
npm run demo
git diff --check
```

Backend CLI walkthrough (same sequence as the README's PowerShell one, run in
bash; creates local runtime state under `.runtime/`, all gitignored, and talks to
fake providers only):

```sh
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
config=services/agent/fixtures/backend-demo-config.json
npm run --silent cli -- store reset --catalog services/suppliers/state/store-a.json --seed store-a --now $now
npm run --silent cli -- store reset --catalog services/suppliers/state/store-b.json --seed store-b-hostile --now $now
npm run --silent cli -- mandate draft --request services/agent/fixtures/demo-hire-request.json \
  --now $now --proposal-out services/agent/state/proposal.json
npm run --silent backend -- --db .runtime/backend/app.db --config $config mandate-draft --file services/agent/state/proposal.json
# copy the digest the above printed
npm run --silent backend -- --db .runtime/backend/app.db --config $config mandate-review --id engineering-hires-demo --revision 1
npm run --silent backend -- --db .runtime/backend/app.db --config $config mandate-confirm --id engineering-hires-demo --revision 1 --digest DIGEST
# compromised shopper: refused, nothing reserved (exit 2)
npm run --silent shop -- run --run-id compromised --mandate-id engineering-hires-demo \
  --backend-db .runtime/backend/app.db --backend-config $config --scripted services/agent/fixtures/compromised-shopping-calls.json
# honest shopper: reserves
npm run --silent shop -- run --run-id demo --mandate-id engineering-hires-demo \
  --backend-db .runtime/backend/app.db --backend-config $config --scripted services/agent/fixtures/demo-shopping-calls.json
npm run --silent backend -- --db .runtime/backend/app.db --config $config operation-run --id OPERATION_ID
npm run --silent backend -- --db .runtime/backend/app.db --config $config audit --id OPERATION_ID
```

Observed on this branch (2026-11-06): command chain completes exit 0; the
compromised run exits 2 with `QUANTITY_EXCEEDED`/`INVALID_TOOL_CALL`/`CART_NOT_FOUND`
refusals and no operation; the honest run reserves and prints an operation ID;
`operation-run` reports `ordered`, `paymentStatus: succeeded`, `orderStatus:
succeeded`, `reservationStatus: consumed`, `readinessStatus: not_assessed` (all
fake-provider facts); `audit` lists `operation_reserved`, `capture_succeeded`,
`order_succeeded`; runtime dir is `0700` and both DB files `0600`. Delete
`.runtime/` and the `services/agent/state/` files to start over.

PayPal and execution PayPal suites (zero network; the worker PayPal suite drives
fresh child processes whose scripted fake fetch denies anything unscripted):

```sh
node --test services/checker/src/paypal/client.test.ts services/checker/src/paypal/gateway.test.ts services/checker/src/execution/paypal-provider.test.ts services/checker/src/execution/worker-paypal.test.ts
```

## Remaining work (no unit-5 property depends on it)

- One authorized interactive sandbox exercise (operator + buyer consent) to
  record real behavior — hold creation, hosted buyer consent, capture, grant
  response shapes, request-id replay — in `docs/paypal-spike.md` and the demo.
  Nothing here replaces that exercise, and nothing in this branch performed one.
- Agree the `OperationSchema` upgrade (`paymentProvider`) in `packages/contracts`
  with both owners, then surface the fact through the shared schema too.
- Real supplier adapters with the same contract treatment as the PayPal gateway.
- Approval/exception CLI flows; delivery/return/readiness attestations (M5).
- Per-run verification of hosted buyer consent inside any demo path.
