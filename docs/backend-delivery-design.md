# Backend delivery design (accepted specification with implementation status)

This is the accepted backend delivery specification, copied from
`.audit/backend-delivery/design.md` so incoming developers can read it without the
audit trail. The specification text below is unchanged from the accepted design; the
"Implementation status" addendum at the end records what is actually delivered and
what every status claim means. The living audit record stays in
`.audit/backend-delivery/decisions.tsv` and the per-unit result files there.

## Outcome

Deliver a teammate-facing contract and a durable backend simulation, independently
runnable through the terminal. This is the backend foundation, not completion of all stage-one milestones. The teammate owns the shopping implementation. OpenCode exclusively implements source, tests, scripts, generated artifacts and product docs. Design and Review specify and verify.

## Current system and sources

Read AGENTS.md, docs/project-scope.md, docs/architecture.md, packages/contracts/src/index.ts, services/checker/src/rules/evaluate.ts, services/checker/src/paypal/client.ts and services/suppliers/src/fixture.ts in /home/danny/Splittap-pay. Existing demo/check provide offline eligibility only. They accept externally supplied authority, snapshots and clocks; these inputs cannot become an execution API. The supplier fixture only quotes. The existing sandbox spike is preserved and not run.

## Goals and exclusions

The operator confirms an immutable mandate. The backend independently obtains quotes and loads state, atomically reserves budget and units, records stable operation/effect identities, and reconciles uncertain fake-provider outcomes after process death. The teammate can use a shared client/mock without importing backend internals.

No HTTP server, website, shopping worker, live payment, interactive sandbox transaction, global configuration, new agent roles, deployment or remote publication. Role kits, stock assignment, exceptions, delivery/returns/readiness and production access control are deferred. Status must not claim them delivered. Same-OS-user hostile processes are outside the local trust model, which is not production isolation.

## Alternatives and choice

Retain the committed SQLite M2 plan with Node builtin node:sqlite and a small persisted state machine. SQLite is runnable here; PostgreSQL CLI is absent and Docker WSL integration unavailable. PostgreSQL/Drizzle/DBOS remains a candidate after an actual integration/recovery experiment. In-memory persistence cannot prove restart or multiprocess reservation correctness. No new runtime dependencies are required.

## Public interface

Shared strict Zod request/response envelopes use apiVersion "1" and requestId. Methods: mandate.get, catalog.list, proposal.submit, operation.get. Each carries its relevant mandate ID/revision; proposals carry idempotencyKey and the existing price-free cart. Unknown versions/methods and extra fields fail closed. Request fields cannot supply policy, quote, prices, budget snapshot, clock, operator identity, provider identifiers or fake scenarios.

Response is a typed result or stable error code/message/details, labelled simulation for this delivery. Codes include INVALID_REQUEST, UNSUPPORTED_VERSION, NOT_FOUND, MANDATE_NOT_CONFIRMED, MANDATE_REVISION_CONFLICT, IDEMPOTENCY_CONFLICT, BUDGET_EXCEEDED, QUANTITY_EXCEEDED, QUOTE_EXPIRED, MANDATORY_EVIDENCE_UNKNOWN and BUSY. Operations distinguish payment, supplier order, reservation and readiness facts. Accepted or reserved never means paid, ordered or ready.

The typed client accepts an injected JSON transport. It cannot spawn processes, load env/files/DB or import checker code. The labelled in-memory mock validates the same envelopes and implements duplicate/conflict semantics. Same key plus canonical same payload returns the original operation; changed payload conflicts. Sort cart lines by requirement/SKU before hashing. Scope key uniqueness to mandate identity and retain across revisions. Shared consumer scenarios run against mock and real dispatcher.

A separate backend CLI accepts one JSON request of at most 1 MiB on stdin for shopper RPC and emits exactly one JSON response. Diagnostics go to stderr. DB/config paths are trusted operator launch options, never fields in shopper input. Preserve offline check/demo behavior and their fixture clock.

## Operator authority

Commands: mandate-draft --file PATH; mandate-review --id ID --revision N; mandate-confirm --id ID --revision N --digest DIGEST; operation-run --id ID; operation-reconcile --id ID; status --id ID; audit --id ID. Root options select DB/config. Backend commands reject --now and approval metadata input.

Draft schema omits approvedBy and confirmedAt. Store immutable policy/mandate revisions and content digests. Review returns digest. Confirmation loads stored exact revision, verifies digest, validates all policy narrowing and temporal validity, then stamps trusted executor time and OS-derived operator identity. Explicit local confirmation is consent, not remote authentication. Restrict runtime directory to owner access. Document same-user limitation and future separate environment/filesystem credentials.

Only active confirmed revision accepts proposals. Once any prior revision reserved or consumed authority, refuse replacement revision confirmation rather than resetting budget/units. Before exposure, revision updates may be confirmed. Scope ledger totals to mandate identity across revisions. Reject unknown fields and mutation of existing snapshots.

## Ledger and proposal flow

SQLite uses foreign keys, WAL, finite busy timeout, versioned migrations and synchronous short BEGIN IMMEDIATE transactions with rollback. No awaited network/provider calls inside transaction. Logical tables: policy snapshots, mandate revisions/active revision, operations, reservation lines, effects, audit events and worker lease metadata. Unique idempotency and effect identities, nonnegative bounded integers and ownership foreign keys are required.

Load trusted mandate and configured supplier; obtain quote outside transaction. In transaction reload authority/totals, resolve duplicate identity before reevaluation, evaluate with trusted current time, and insert operation plus amount/unit reservation plus audit atomically. Duplicate replay must remain valid after quote expiry and must not depend on fresh supplier success; resolve existing identities before quote acquisition as well, then recheck in transaction to cover races.

Reservations are active or consumed, with explicit released state for definitively safe failures. Capture success consumes money and purchasing quantities conservatively even before supplier acceptance. Refund never replenishes authority. Release only when no external success or ambiguity exists. Audit is application append-only, not tamper-proof.

## Durable fake execution

Payment and supplier facts are independent. Effect states are intent, in_flight, unknown, succeeded, rejected. Stable effect keys and request digests persist before calls. Claim operation using lease/fencing generation; obsolete workers cannot overwrite current state. Provider idempotency remains necessary when an expired worker continues.

Before first effect, refresh quote and compare commercial terms (supplier, destination, exact lines, amount, warranty, delivery commitment), revalidate authority/current time/evidence against ledger excluding this operation's own reservation. Do not require identical quote ID/timestamps. Changed terms prevent effects. If effects already started, reconcile before any new action, even if authority/quote expired.

Capture precedes supplier order. Confirmed payment success permits order. Supplier rejection after payment yields compensation_pending. Refund only after established order rejection, never unknown order. Refund confirmation does not restore entitlement. After expired claim or ambiguous call, query effect first; definitive not-applied may retry original key/identical payload. Unresolved lookup remains unknown and retains authority. End state ordered never implies delivered/ready.

Fake providers use a separate SQLite file from application state, with durable unique effect keys and payload hashes. They model success, definitive rejection, response loss after success and unresolved lookup. Test-only injected hooks/scenarios allow child-process termination between remote success and local acknowledgement; shopper input cannot select them.

## PayPal boundary

Keep client API/spike compatibility. Add injected fetch, finite timeout, getRefund if needed and a backend gateway with runtime validation of IDs/status/currency/amount and resource binding where available. All writes require stable nonempty request IDs. Convert minor units at edge. Sandbox URL only. Malformed/incomplete/uncertain responses become unknown; sanitize errors. Do not invent lookup-by-request-id. Missing resource evidence remains unknown. No PayPal gateway selection by execution CLI in this slice. Fetch-mocked tests deny real calls.

## Detailed implementation plan

Unit 1 creates packages/contracts/src/backend.ts, client.ts, mock.ts, backend.test.ts; modifies packages/contracts/src/index.ts exports and root package.json test glob. Gate strict envelope/client/mock tests plus original tests/typecheck/demo. No backend imports.

Unit 2 creates services/checker/src/authority.ts; ledger/schema.ts, store.ts, store.test.ts, concurrency.test.ts, test-worker.ts; application.ts and application.test.ts. Updates ledger/README.md and .gitignore for runtime state/sidecars. Gate separate-process amount/unit and same-key races, conflicting payload, immutable confirmation/policy narrowing/stale revision tests and restart persistence. No external execution.

Unit 3 creates services/checker/src/execution/gateway.ts, fake.ts, worker.ts, worker.test.ts, test-worker.ts; apps/cli/src/backend.ts and backend.test.ts. Root script backend and necessary unit2 integration changes permitted. Gate independent-process crash after remote acceptance, payment/order unknown recovery, duplicate workers, definitive reject/release, compensation without entitlement restoration, quote/evidence revalidation, sanitized RPC and clean stdout. Real CLI demo uses synthetic relative-date data so it does not rot with historical fixtures.

Unit 4 creates services/checker/src/paypal/gateway.ts and gateway.test.ts, docs/backend-delivery-design.md and docs/backend-api.md. Changes paypal/client.ts only compatible fetch/timeout/refund read, README.md, docs/architecture.md, docs/project-scope.md, ledger/README.md and AGENTS.md current-status/ownership only. Update knowledge graph through graphify update . after final code. Preserve untracked research and graph metadata. Gate full tests/typecheck/demo, executable CLI walkthrough, fake-fetch PayPal tests, independent review and accurate milestone claims.

Every unit ends green and returns changed files/check output/deviations. OpenCode may add narrowly necessary helper/tests within listed components, but must disclose them for review. No changes to services/agent. No silent framework or scope expansion.

## Acceptance and remaining milestones

Verify real process races for budget, quantities and duplicate identity; persisted confirmation/reservations/audit across restarts; reject input authority and clock; kill worker after payment/order remote acceptance and reconcile one effect; unknown retains authority; definitive payment reject releases; refund does not restore entitlement; changed quote/expired evidence blocks initial effect; mock and real pass shared scenarios; strict 1MiB stdin and single JSON stdout; PayPal tests have no real calls.

M1 authority subset only. M2 delivered only on storage concurrency/restart evidence. M3 simulated recovery and mocked adapter coverage only, real PayPal/supplier feasibility unverified. M4 contract/mock only, teammate worker and exceptions deferred. M5 deferred. No production readiness or credential isolation claims.

## Detailed implementation decisions

This addendum settles the remaining choices. It is part of the implementation-plan range.

### Exact wire shapes

Reuse existing ID/timestamp/amount/quantity constraints. Revision is named mandateVersion on wire. All objects, including nested objects, are strict.

Requests: {apiVersion:"1",requestId:ID,method:Method,params:Params}.

- mandate.get params {mandateId}; result {mandate:Mandate,snapshot:BudgetSnapshot}. Return active confirmed revision only.
- catalog.list params {mandateId,mandateVersion,supplierId}; result {mandateId,mandateVersion,catalog:Catalog}. Check active authority and approved configured supplier.
- proposal.submit params {idempotencyKey,cart:CartSubmission}; result {operation:Operation}.
- operation.get params {mandateId,mandateVersion,operationId}; result {operation:Operation}. Match immutable original ownership, even when revision is no longer active.

Success envelope: {apiVersion:"1",requestId,method,simulation:true,ok:true,result:MethodResult}.
Error envelope: {apiVersion:"1",requestId:ID|null,method:Method|null,simulation:true,ok:false,error:{code,message,details:{checkCodes:string[]}}}. Message max500 chars, checkCodes max1000 entries each max250 chars. Never expose raw exceptions, paths, SQL, tokens or provider payloads. Preserve independently valid correlation fields; otherwise null.

Closed codes: INVALID_REQUEST, UNSUPPORTED_VERSION, NOT_FOUND, MANDATE_NOT_CONFIRMED, MANDATE_REVISION_CONFLICT, IDEMPOTENCY_CONFLICT, BUDGET_EXCEEDED, QUANTITY_EXCEEDED, QUOTE_EXPIRED, MANDATORY_EVIDENCE_UNKNOWN, INELIGIBLE, SUPPLIER_UNAVAILABLE, BUSY, INTERNAL_ERROR. Unknown method is INVALID_REQUEST; other string apiVersion is UNSUPPORTED_VERSION. Evaluator error priority BUDGET, QUANTITY, QUOTE_TIMING, INELIGIBLE; only no hard failures permits MANDATORY_EVIDENCE_UNKNOWN. Include all non-pass check codes.

Operation fields exactly: id,mandateId,mandateVersion,cartId,supplierId,status,currency:"SGD",totalMinor,createdAt,updatedAt,reservationStatus,paymentStatus,orderStatus,refundStatus,readinessStatus:"not_assessed". status enum reserved/running/reconciliation_required/ordered/failed/compensation_pending/compensated. reservationStatus active/consumed/released. Each effect status not_started/intent/in_flight/unknown/succeeded/rejected. No public provider IDs, effect keys or leases.

Canonical cart recursively sorts object keys and lines by requirementId then SKU. Includes all cart fields including cart id/version; excludes envelope requestId and idempotencyKey. Unique identity (mandateId,idempotencyKey), across revisions. Mock compares canonical JSON without Node imports; backend stores canonical JSON and SHA256. Replay returns current operation with new requestId. Replay is resolved before new authority/quote lookup and transactionally rechecked for races.

Client transport signature (request:BackendRequest)=>Promise<unknown>; validate before send, after receive, and exact method/requestId correlation. Transport/malformed response errors reject locally, not fabricated business responses.

Mock input strict {mandates:Mandate[],catalogs:Catalog[]}, max100 each, unique mandate/supplier IDs, defensive copies. Start zero usage and return deterministic reserved simulated operations. No policy/budget/stock/execution enforcement claims. Shared scenarios cover discovery, strict envelopes, ownership, correlation, duplicate/conflict. Avoid object reference escape.

### Concrete storage

Schema version1, STRICT tables with TEXT/INTEGER, NOT NULL unless marked nullable. Validated canonical JSON has json_valid constraint. Positive versions, bounded IDs, 64hex hashes, amount0..1e9, quantities1..1000. Foreign keys ON, WAL, synchronous FULL, busy_timeout5000 every connection. Short synchronous BEGIN IMMEDIATE transactions with rollback for migrations/writes, no awaits.

Tables:
- schema_migrations(version PK,applied_at).
- policies(policy_id,policy_version,content_json,digest,created_at); composite PK.
- mandates(mandate_id PK,active_version nullable,exposure_started boolean); deferred composite FK active revision.
- mandate_revisions(mandate_id,version,policy_id,policy_version,draft_json,digest,created_at); composite PK, FKs mandate/policy.
- confirmations(mandate_id,version,digest,approved_by,confirmed_at); composite PK/FK revision. Reconstruct Mandate by adding confirmation metadata to stored draft.
- operations(operation_id PK,mandate_id,mandate_version,idempotency_key,request_digest,cart_json,quote_json,terms_digest,status,created_at,updated_at); unique(mandate_id,idempotency_key); unique(operation_id,mandate_id,mandate_version); FK revision; checked status enum.
- reservations(operation_id PK,mandate_id,mandate_version,currency='SGD',amount_minor,state active/consumed/released); composite ownership FK operations.
- reservation_lines(operation_id,requirement_id,sku,quantity); PK(operation_id,sku); FK reservation; membership checked against immutable mandate in transaction.
- effects(effect_id PK,operation_id,kind capture/order/refund,effect_key UNIQUE,request_digest,request_json,state intent/in_flight/unknown/succeeded/rejected,provider_id nullable,response_json nullable,created_at,updated_at); FK operation; unique(operation_id,kind).
- worker_leases(operation_id PK/FK,owner_id nullable,generation>=0,expires_at_ms>=0).
- audit_events(event_id INTEGER PK,mandate_id,operation_id nullable,kind,event_json,created_at); FKs; verify operation belongs to mandate before insert.

Triggers prevent update/delete of policy/revision/confirmation/audit snapshots and mutation of operation authority/cart/quote identity or effect request identity. No delete cascades. Runtime state and audit updates share transactions. Permanent exposure_started=1 on first reservation even if later released. Same revision/digest confirmation replays unchanged; different confirmation after exposure prohibited. Same draft identity/digest replay allowed, changed contents conflict.

Review digest SHA256(canonical {policyDigest,mandateDraft}). Draft exactly MandateSchema minus approvedBy/confirmedAt. Confirmation checks digest/policy identity, all narrowing rules, summed role quantities and trustedNow<purchaseBy<=readyBy. No cart required. Totals across mandate identity: active reserved, consumed committed, released ignored. Refund never replenishes consumed authority.

### Lease and provider behavior

Claim requires unowned/expired lease, fresh process UUID, increment generation, expiry trustedNow+30sec. Every worker write atomically matches owner/generation and unexpired lease. Renew before provider work; call timeout10sec. Expired worker cannot renew/commit. Claim conflict BUSY. Release owner after bounded run, retain generation. Idempotent provider effects cover earlier still-running process.

Effect key operationId+":"+kind. Exact immutable requests: capture {operationId,currency,amountMinor}; order {operationId,cart,quote} with original accepted snapshots; refund {operationId,captureId,currency,amountMinor}. Fresh quote comparison uses supplier/destination/currency/cart/exact line SKU/qty/unitprice/warranty/shipping/tax/total/delivery.by; timestamps/ID/evidence source may differ but current evidence must pass. Before effects failure safely releases/fails. After effects start reconcile first even if authority/quote expires.

Inherited in_flight/unknown effect queried first. Definitive not_applied retries same key/payload, unknown retains authority/reconciliation_required. Capture rejected releases/fails; capture succeeded consumes before order. Order succeeded ordered; order rejected compensation_pending permits refund. Refund succeeded compensated, rejected/unknown remains compensation_pending. No refund of unknown order. Ordered/failed/compensated terminal, readiness always not_assessed.

Separate fake DB provider_effects(effect_key PK,kind,request_digest,request_json,outcome succeeded/rejected,provider_id,response_json,created_at). Commit before return/response-loss/crash hook. Key/different digest conflicts; same digest replays. Lookup succeeded/rejected/not_applied/unknown. Failure scenarios injectable only through tests, not config/CLI/shopper payloads.

### CLI contract

npm run backend -- --db PATH --config PATH COMMAND ... . Root paths required. Config strict {version:1,policyFiles:string[],catalogFiles:string[],fakeProviderDb:string}; arrays1..100 paths1..4096 chars relative to config directory. Individual config/draft/policy/catalog max1MiB. Validate existing Policy/Catalog schemas. Identical duplicate configured snapshots allowed, conflicting identity rejected. Reload catalogs per invocation. No provider selector/URLs/credentials/clock/scenarios/approval metadata. App/fake DB must resolve to distinct files, including existing aliases.

rpc reads one UTF8 JSON value <=1048576 bytes including whitespace; rejects trailing values. Exactly one response line; diagnostics stderr. Exit0 success,2 validation/business,1 INTERNAL_ERROR; operator usage2. Reject unknown command/flags, duplicate flags, inappropriate command flags and --now.

Draft output {simulation:true,mandateId,mandateVersion,digest}. Review {simulation:true,mandateId,mandateVersion,digest,draft,policy}. Confirm {simulation:true,mandate,digest}. Run/reconcile/status {simulation:true,operation}. audit --id uses operationId; output {simulation:true,operationId,events:[{eventId,kind,createdAt,details}]}, sanitized domain metadata. Confirmation identity OS user, never env or request. New runtime directories owner-only and DB0600, restrictive umask for sidecars. Reject unsafe existing runtime directory permissions rather than chmod unrelated directories. Config/source files need not be inside private runtime directory. No production hostile same-user isolation claim.

### Review resolutions: cart identity and capture retries

These rules supersede the earlier single-key operation identity and unconditional not_applied retry descriptions.

Maintain permanent cart identity (mandateId,cart.id) and idempotency alias (mandateId,idempotencyKey), each resolving to one operation. Canonical payload includes every CartSubmission field, including id and mandateVersion. Resolve both before authority/quote work. Existing identity with changed canonical payload conflicts; identities resolving to different operations conflict. Matching identity returns current operation and atomically binds any unused supplied key as an alias. New cart requires new cart ID and unused key. Aliases remain after failures/release and cannot be reassigned. Transactionally recheck both identities before creating reservation.

Storage correction: add immutable cart_id and UNIQUE(mandate_id,cart_id) to operations. Replace operations.idempotency_key with idempotency_aliases(mandate_id,idempotency_key,operation_id), PK(mandate_id,idempotency_key), FK(operation_id,mandate_id) to corresponding unique operation ownership. Alias rows immutable. Mock has identical behavior. Tests race same cart under different keys and verify one operation/reservation/effect, reject changed version/payload without binding key, reject key reuse for different cart, and replay after expiry/provider unavailability/terminal states without fetching quotes.

Before every capture dispatch that could establish first successful payment, including retry after not_applied, refresh authority/quote/evidence and validate current time and unchanged terms against totals excluding own reservation. Preserve original effect key/payload. An intent or earlier attempt does not satisfy this gate. Known success must still be recorded/consumed after expiry, and original order or rejection-triggered compensation may proceed. Unknown capture retains authority and forbids order/refund/new-key capture.

Lookup absence alone cannot prove no outstanding request can apply. Inherited in_flight/unknown plus absent provider record remains uncertain for release purposes. If current eligibility fails, retain reconciliation_required rather than release unless a definitive provider rejection/nonapplication guarantee fences late effects. The initial fake provider supplies such definitive evidence through a durably rejected effect row, never mere absence. A never-dispatched newly claimed intent may safely fail before any in_flight transition. Reconciliation may retry the original idempotent capture only after renewed eligibility; release after ambiguous history requires definitive provider rejection. No claim of remote cancellation from local lease expiry.

Additional tests: persisted intent/attempt followed by expired deadline, changed terms, invalid authority or stale evidence cannot dispatch capture. Definitive rejection releases, mere absence after ambiguous attempt retains. Valid retry uses same payload/key. Remote capture success then process death then expiry still consumes and reconciles original order. Suspended old worker plus lookup absence cannot trigger release. Unknown order after expiry forbids refund. These resolve design-critic-r1-1 and design-critic-r1-2 while preserving the conservative authority boundary.

### Readiness resolutions: imports and PayPal adapter

These choices supersede Unit1 index reexports and the previously unspecified PayPal gateway interface.

Keep packages/contracts/src/index.ts unchanged. backend.ts imports domain schemas from index.ts. client.ts/mock.ts and consumers import backend.ts directly. Neither index.ts nor backend.ts reexports client/mock. Fresh Node-process tests import each new entrypoint first and exercise representative schemas/client/mock without initialization failure.

paypal/gateway.ts is separate from execution/gateway.ts and is never imported/selected by the execution worker or CLI. It cannot resolve authorization from operation IDs. Caller supplies trusted persisted resource binding. Input ExpectedMoney is {currency:'SGD',amountMinor:positive bounded integer}. Gateway methods:
- captureAuthorization({authorizationId,requestId,invoiceId,finalCapture:boolean,expected:ExpectedMoney}).
- getCapture({captureId,authorizationId,invoiceId,expected:ExpectedMoney}).
- refundCapture({captureId,requestId,expected:ExpectedMoney}).
- getRefund({refundId,captureId,expected:ExpectedMoney}).

Result is {state:'succeeded',resource:Evidence} or {state:'unknown',reason:'transport'|'provider_error'|'invalid_response'|'unconfirmed_status'|'binding_unverified',resourceId?:validated ID}. Capture evidence {authorizationId,captureId,invoiceId,currency:'SGD',amountMinor}; refund evidence {captureId,refundId,currency:'SGD',amountMinor}. Invalid caller input rejects locally before fetch. IDs/invoice bounded nonempty, request ID stable nonempty forwarded unchanged. No generated fallback keys or automatic write retries. Capture/refund map directly to existing client methods, minor-unit conversion at edge. Add client.getRefund(refundId), preserving other signatures.

Success requires valid resource ID, COMPLETED status, exact expected currency/amount, and verified binding; capture also matches invoiceId. Write parent binding comes from authenticated request endpoint; contradictory parent evidence fails. GET resource ID exactly matches requested ID, and parent binding must come from response evidence, never copied expected values. Accepted parent evidence is an exact matching ID in supplementary_data.related_ids.authorization_id for capture or capture_id for refund, or a links entry rel='up' with exact sandbox API origin and path /v2/payments/authorizations/{encoded expected authorizationId} or /v2/payments/captures/{encoded expected captureId}; reject contradictory recognized evidence, do not follow links. Missing read parent evidence yields binding_unverified. All other provider statuses return unknown, never safe-release evidence. Optional resourceId on unknown must pass ID validation and is only a reconciliation hint.

Fetch injection and finite timeout apply to OAuth and resource requests. Sandbox only. Mocked tests deny global fetch and cover paths/request IDs/amounts, valid success, mismatched IDs/currency/amount/invoice/parent, missing parent evidence on GET, contradictory evidence on POST, pending status, malformed JSON, HTTP errors, token/resource timeout and lost response without inventing IDs. This settles sourcefit-r1-1 and readiness-r1-1. Standalone adapter coverage is not account feasibility or worker integration.

---

## Implementation status (addendum, accurate as of unit 4, 2026-11-06)

The specification text above is the accepted design, unchanged. This addendum records
what exists; nothing here relaxes the specification's claims.

- **Unit 1 — delivered and verified** (`packages/contracts/src/backend.ts`,
  `client.ts`, `mock.ts` + tests): strict v1 envelopes, injected-transport client,
  labelled in-memory mock with replay/alias semantics. Evidence:
  `.audit/backend-delivery/unit1-result.md`.
- **Unit 2 — delivered and verified** (`services/checker/src/authority.ts`,
  `ledger/*` + tests): SQLite ledger with atomic amount/quantity/idempotency
  reservations, immutable confirmation digests, restart persistence and real-process
  races; the earlier concurrent-open migration race is root-caused and
  regression-covered. Evidence: `.audit/backend-delivery/unit2-result.md` and
  round-3 tests in `unit3-result.md`.
- **Unit 3 — delivered and verified** (`services/checker/src/execution/*`,
  `apps/cli/src/backend.ts` + tests): durable simulated execution over fake
  providers with real process-crash recovery, lease fencing, capture gate, and the
  operator/RPC CLI contract. Evidence: `.audit/backend-delivery/unit3-result.md`.
- **Unit 4 (this unit) — delivered as fetch-mocked contract coverage only**:
  `services/checker/src/paypal/gateway.ts` (+ `gateway.test.ts`) implements the
  PayPal adapter exactly as specified above, and `paypal/client.ts` gained injected
  fetch, finite per-call timeouts (OAuth and resources) and `getRefund` while
  preserving every existing export and spike behavior. All evidence comes from fake
  `fetch` implementations with global fetch denied; **no sandbox or live request was
  made and nothing has been verified against a real PayPal account** — this is
  contract coverage, not account feasibility. Unit-5 addendum: this changed —
  the gateway is now wired into durable execution behind the backend config
  opt-in `paymentProvider: "paypal-sandbox"` (`execution/paypal-provider.ts`,
  hold lifecycle through migration 3's `operation_paypal_bindings`), still
  sandbox-verified-pending, no live request made.
- **Not built (unchanged from the specification's exclusions):** live payments, real
  supplier calls, PayPal wiring into execution, delivery/readiness, production
  authentication, and the website/shopper-worker milestones. No gate after M0 is
  recorded as passed.
