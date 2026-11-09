# Project scope: CLI-first equipment procurement

## Product decision

**User:** the operations manager at a 10–50 person company, initially a Singapore
team purchasing in SGD from a small approved supplier list.

**Trigger:** new hires need laptops and monitors before their start date.

**Outcome:** each hire has the required compatible equipment ready at the approved
location on time, with spend reconciled and exceptions attributable to a human.

**Promise:** the AI proposes; company policy, confirmed human authority and a
transactional budget govern what can execute. Do not claim universal novelty or
prompt-injection immunity.

**Delivery constraint:** stage one purchasing uses CLI input/output exclusively. The
agreed stage-two local read-only dashboard below displays those command results without
adding purchasing actions. The only purchasing step that opens a browser is PayPal's
hosted buyer-consent page, reached by the operator during authorized sandbox hold
commands or the sandbox spike. Later UI actions require separate agreement and must
call the proven core.

## Representative task

“Equip five engineering hires starting November 20 with approved laptops and 27-inch
monitors. Reuse suitable stock first. Have equipment ready at the Singapore office
by November 19. Spend at most S$8,000 including shipping and GST.”

Example dates and suppliers are synthetic test data, not live availability claims.

### Decisions the product must make

1. Which role-specific kit is needed, and what serviceable stock can be assigned?
2. Which exact SKUs have vetted compatibility, specifications and warranty?
3. Is the supplier approved and is its current quote complete and authoritative?
4. Do budget and quantities hold across completed and pending purchases?
5. What evidence supports stock and delivery before the readiness date?
6. What fails policy, what is unknown, and what bounded exception needs a human?
7. Has equipment arrived and been assigned, rather than merely been paid for?

## Delivered scaffold: M0

- Shared runtime contracts for policy, confirmed mandate, price-free cart, supplier
  quote, evidence, prior commitments and an eligibility explanation.
- Company-policy example, synthetic five-hire mandate, cart and supplier catalog.
- Pure eligibility checks for policy narrowing, cart/quote identity, cumulative
  budget/quantities, exact SKUs, price, warranty, timing and stock/delivery evidence.
- CLI `demo` and `check` commands, readable or JSON output and documented exit codes.
- Offline demo: valid cart, shipping jump, cumulative excess quantity and unknown delivery.
- CLI fixture-store controls for price, shipping, stock, delivery/evidence and reset;
  working catalogs feed fresh quotes into offline checks without editing seed data.
- Scope, architecture, agent instructions and seams for later CLI implementation.
- Preserve the pre-existing sandbox PayPal client, money helpers and spike.

**M0 never reserves funds or executes orders.** It consumes a supplied budget
snapshot. `eligible` means only “these records passed these checks at this time.”
It does not authenticate the buyer, prevent races, certify suppliers or prove readiness.

## Stage one milestones — terminal only

| Gate | Deliverable | Exit evidence |
| --- | --- | --- |
| M1: authority and stock | CLI draft/review/confirm mandate; role kit templates; manually attested stock; versioned company policy and local operator authority | Draft cannot execute; mandate cannot loosen policy; five hires minus two assigned spare laptops yields three to buy; one spare cannot serve two active requests |
| M2: reliable core | SQLite ledger for one checker process; atomic amount/unit reservations; durable jobs; audit events; CLI status/audit output | Racing carts cannot both consume the same budget or quantity; restart preserves reservations and operation identity |
| M3: supplier/payment feasibility | Controlled supplier APIs with quotes, reservations, idempotent orders/status lookup; PayPal sandbox captures and reconciliation | Real results recorded; repeated requests cannot duplicate payment/order; timeout retains reservation and reconciles; no blind refund of possibly accepted order |
| M4: bounded shopper and approvals | Model drafts mandates and searches catalogs; CLI run/review/approve/reject commands with exact operation IDs | Agent has no payment secrets; malformed tools rejected; hostile listing cannot bypass checks; one-time exception does not edit policy |
| M5: close-out | CLI delivery/assignment attestations, unresolved items, returns, readiness and spend exports | Missing equipment keeps request open; paid is not delivered; refunds and hold release remain pending until confirmed |

Gates are dependency-ordered, not delivery-date promises. M2 precedes automatic
execution. Stage one is complete only when CLI acceptance scenarios below are proven.
M1–M5 command names and contracts will be finalized with each implementation; do not
add empty commands that report success. M0's fixture checks are not those implementations.

## Stage two — read-only dashboard started

Both people agreed on Nov 8 to start stage two with a read-only dashboard
(`npm run dashboard`, `apps/cli/src/dashboard.ts`). It shows the demo's scene, the stored
mandate, the ledger's budget and units, each operation's separate payment, supplier order,
refund and readiness facts with its audit trail, and the stores. Every fact comes from an
existing read command (backend `mandate-review`, `status` and `audit`, `shop status`,
`store show`); `demo:flow` adds only the scene, the IDs to read and its result lines. It
serves one page on 127.0.0.1, needs no key, and adds no frontend dependency or build step.
Confirmation is bound to the backend's active mandate revision, never the session file.
Unavailable or mismatched confirmation reads remain unknown. Dashboard child reads run
sequentially to avoid racing their SQLite validation, and evidence freshness uses exact
elapsed time before rounding its display.
Nothing in stage-one acceptance depends on it.

Still deferred, each needing both people's agreement: any page that acts (mandate review and
confirmation, approvals, exceptions, running or reconciling operations), progress and
readiness views beyond what the ledger records, and anything served beyond this machine. A
page that acts must reuse the tested application core and persisted operations, and keep the
same authority boundaries as the CLI.

## Prototype boundaries

- Laptops/monitors and exact pre-vetted SKUs; no universal compatibility inference.
- SGD only in new procurement contracts; existing PayPal helpers retain USD support.
- Two or three controlled stores; no arbitrary websites or browser automation.
- Manual stock/delivery attestations labelled as such; no HRIS/MDM integration.
- One company and trusted local operator initially; remote/multi-user operation
  requires an explicit identity/access-control design before deployment.
- Human confirms mandates and exceptions, rather than every compliant cart.
- Rank eligible options by all-in cost, delivery confidence and warranty. Ranking
  never overrides a hard rule or unknown mandatory evidence.

## Excluded until a production scope

Live money, real supplier onboarding, marketplace settlement, international tax/FX,
credit, subscriptions, expense management, autonomous policy changes, full asset
management, multi-tenant billing and universal web shopping.

## Payment and business-model gate

The existing spike makes this app the buyer-facing merchant. Settlement to suppliers
is separate; a single hold is not a wallet for arbitrary merchants. Production
merchant/marketplace arrangements need explicit design before real purchasing.

PayPal documents possible overcapture, account enablement for partial captures, a
29-day authorization window and a recommended three-day capture window. Our ledger
must enforce the exact budget. Verify behavior on the intended account. Keep the
purchase deadline separate from the equipment readiness date.
[PayPal authorization rules](https://developer.paypal.com/payment-methods/auth-honor/)

The spike's extra S$1 final capture is a feasibility probe, not permission to charge
a user just to close a hold. Close-out must never invent a fee. Authorization is not escrow.

## Acceptance scenarios for stage one

| Scenario | Required CLI-observable behavior |
| --- | --- |
| Normal request | Approved kit minus assigned stock produces requirements; current quotes pass; amount/units reserve atomically before execution |
| Quote change | Show changed all-in total; revalidation blocks or requests a bounded exception |
| Duplicate cart | Return original operation; no second reservation, capture or order |
| Competing carts | Budget and quantities remain valid across both; stale check output is not execution authority |
| Unknown warranty/delivery | State missing evidence and prevent automatic purchase |
| Hostile listing | Treat instructions as data; proposed cart still faces independent checks |
| Payment response lost | Retain reservation; query provider; report unknown until established |
| Order response lost | Query supplier by operation ID before retrying/refunding |
| Exception accepted | Record exact bounded authority; recheck quote/evidence; preserve standing policy |
| Equipment missing/returned | Request remains unresolved; payment success cannot mark it ready |

For M0 these are specifications; only the eligibility subset is implemented/tested.

## Outcomes and improvement loop

Track readiness by required date, human interventions per request, unsuitable-item
returns, quoted/paid cost differences and supplier delivery reliability. Show sample
counts; pending requests are not completed successes or failures. Corrections become
reviewable proposed changes, separated into facts, preferences, exceptions and policy.

## Implementation status

M0 is delivered by this scaffold. A partial M1 slice now supports deterministic CLI
mandate draft/review from structured hire requests and kit templates, with runtime
validation and policy narrowing. That slice establishes no confirmation or stock
authority, and M1 is incomplete. A model can also draft from a plain-English request
(`npm run shop -- draft`), with five live runs so far; its output is checked the same way
and stays a draft. M2 implementation exists: a SQLite ledger with atomic
reservations, plus a simulation-only backend CLI with local operator confirmation and
durable execution over fake providers (see `services/checker/src/ledger/README.md`).
A partial M4 slice adds the bounded shopper worker over the shared client, tested
against the real checker core with scripted models. It has had ten live model runs: four
against the contract mock, and six against the real backend on Windows. Four of those used
temporary copies with the backend's mode check skipped; the Nov 9 pair ran from the
repository with the folder check on. Its CLI approval and exception flows do not exist.
`npm run demo:flow` runs the story end to end over fake providers. Shopper reviews can
be saved and replayed offline with an explicit historical label; demo takes save each
run's review before execution. These editable snapshots add no purchasing authority
or interrupted-worker recovery. Units 4 and 5 of the
backend delivery add a sandbox-only PayPal gateway
(`services/checker/src/paypal/gateway.ts`, wired into the execution ledger behind
the backend config `paymentProvider` and documented in `docs/backend-api.md`) with
fetch-mocked capture/refund/refund-read tests, operator hold commands and
crash-recovery evidence through sandbox reads. `docs/paypal-spike.md` records limited
historical manual observations: a Nov 7 application capture on the earlier PR #17 tree plus the AUTHORIZE fix,
and separate Nov 7–8 spike captures and a refund. A Nov 9 scripted Windows
[demo rehearsal](paypal-spike.md#demo-flow-sandbox-rehearsal-2026-11-09) at `17e917c`
records one normal sandbox authorization/capture for S$7,510.10; supplier ordering
stayed fake. The reported buyer-consent exercise and subsequent local ledger reads do
not establish response-loss recovery, refunds or unused-hold closure on this path.
The final recorded take and judge-account setup remain outstanding.
No gate after M0 is recorded as passed; M3 remains incomplete and M5 is planned.
See `docs/backend-delivery-review.md` for the distinction between simulated execution,
mocked contract coverage and manual account observations. The next PayPal evidence
requires authorized account exercises for current-path recovery and hold closure.
The original hackathon schedule
is preserved in `docs/hackathon-plan.md`, not adopted as a current commitment.
