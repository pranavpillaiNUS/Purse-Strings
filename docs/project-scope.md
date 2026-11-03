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

**Delivery constraint:** stage one uses CLI input/output exclusively. No website,
frontend, web framework or browser-driven workflow. Build and test the purchasing
implementation before adding any website. Later UI work calls the proven core.

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

## Stage two — deferred

A website may later provide mandate review, exceptions, progress and readiness views.
It must reuse the tested application core and persisted operations. No website files
or dependencies are part of this scaffold or stage-one acceptance.

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

M0 is delivered by this scaffold; M1–M5 are planned. PayPal feasibility is unverified
until `docs/paypal-spike.md` records observed results. The original hackathon schedule
is preserved in `docs/hackathon-plan.md`, not adopted as a current commitment.
