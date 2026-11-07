# Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen

Date: 2026-11-07. Branch: `unit5-paypal-in-path` (fresh from `origin/main`, df5a854),
two focused commits. Everything ran offline: NOT ONE real or sandbox PayPal request
was made, and the buyer-approval sandbox exercise remains an explicitly authorized
interactive step outside this unit. Binding inputs: GitHub issues #16 and #14,
`.audit/backend-delivery/design.md` (worker/provider/uncertainty contract; the
"no gateway selection by execution CLI" line superseded per issue #16 item 1 by a
config-only opt-in), repo `AGENTS.md`, unit-4 contracts and tests.

## Delivered

| File (+ lines) | Content |
| --- | --- |
| `services/checker/src/ledger/schema.ts` (314) | Migration 3: `operation_paypal_bindings` — STRICT, FK to `operations`, CHECK-bounded `order_id`/nullable `authorization_id`, `currency='SGD'`, `amount_minor ≤ 1e9`, `provider_state IN ('order_created','authorization_held')`; identity-immutable triggers (order/invoice/currency/amount/created at any write; `authorization_id` write-once even to the same value). Tidy upgrade, no data rewrite. |
| `services/checker/src/ledger/store.ts` (991) | Binding helpers (`insertPayPalBindingRow` with replay/conflict semantics, `upgradePayPalBindingRow`) and `loadEffectRowByKey` for provider reconciliation. |
| `services/checker/src/paypal/gateway.ts` (681) | Unit-4 four-method contract INTACT; added `createAuthorizationOrder` (intent AUTHORIZATION, invoice id, stable request id; only a parseable https `paypal.com`/`*.paypal.com` `rel:'approve'` link is returned as `approvalUrl`; links never fetched), `authorizeOrder` (one validated authorization whose amount matches expected; PayPal's documented `ORDER_NOT_APPROVED` → distinct `buyer_not_approved`), `getAuthorization` (verified status read over the recognized authorization statuses + `captureIdHint` limited to exact sandbox-origin `/v2/payments/captures/{validated id}` paths — hints only, verified later via full unit-4 `getCapture`). Shared `GatewayUnknown` shape; all existing reason mappings unchanged. |
| `services/checker/src/execution/paypal-provider.ts` (586, NEW) | Composite provider over the unchanged `ExecutionProvider` seam: `order` kind ALWAYS the fake provider store; under `paypal-sandbox`, capture/refund go through the gateway with `requestId = effectKey`, final capture `invoice_id = binding.invoice_id`, amounts and bindings re-checked. Fail-safe before effects: malformed request, missing binding, `order_created` state or amount conflict → `{outcome:'unknown'}` (authority retained, nothing released). Lookup: binding missing/`order_created` → `not_applied`; `CREATED`/`PENDING` → `not_applied` (worker's same-key revalidation retry preserved); `CAPTURED` → hint + full unit-4 `getCapture` binding check; `DENIED/VOIDED/EXPIRED` → durable non-application evidence (rejected, release-safe); `PARTIALLY_CAPTURED` → unknown. Refunds: apply with persisted capture id; lookup verifies a persisted refund id via `getRefund` and does NO refund discovery without one. Operator-command cores `authorizeOperationHold` / `completeAuthorizationHold` write binding rows + `binding_created`/`binding_upgraded` audit events in short synchronous transactions, idempotent replays, refused conflicts, sanitized unknowns. |
| `services/checker/src/execution/test-worker.ts` (150) | Test-only child config extension: `paymentProvider`, `paypalScriptPath` (scripted fake fetch with route/marker `stall`, exchange log), `paypalLedgerPath`. Never product CLI; the fake-only path is unchanged. |
| `apps/cli/src/backend.ts` (860) | Config gains optional `paymentProvider: 'fake'|'paypal-sandbox'` (strict schema; unknown values refused; NEVER a command flag or shopper input).readFileBounded strips ONE leading UTF-8 BOM (issue #14). `.env` loader (`readEnvFile`/`loadSandboxCredentials`): `<cwd>/.env`, tolerant parse, process env precedence, only the three `PAYPAL_*` names, only in-process only for `operation-authorize`/`operation-complete-authorization`/`operation-run`/`operation-reconcile` under the sandbox config, `PAYPAL_ENV` must be sandbox (live refused), absent creds → sanitized refusal; never logged/echoed/passed on. `rpc` never triggers it; the CLI never propagates `PAYPAL_*` to rpc children (loader is in-process). Two new operator commands; `paymentProvider` + sanitized `providerIds` on run/reconcile/status/audit output (constant per invocation, backend-owned; packages/contracts untouched); audit details annotated. Exit-code agreement documented in `--help` (no behavior change). |
| Tests | `paypal/gateway.test.ts` (735): +16 unit-5 tests (41 in file): create/authorize/getAuthorization success + binding/amount/currency/status/id-mismatch + ORDER_NOT_APPROVED classification + link-host/sandbox-origin discipline + transport/HTTP/malformed + request-ID forwarding + input validation before fetch. `execution/paypal-provider.test.ts` (853, NEW, 13 tests): every applyEffect/lookupEffect branch, order-stays-fake proof, pre-fetch refusals, hold lifecycle + replay + conflicts, buyer-not-approved closed refusal, immutability triggers, FKs, crash-after-commit hook. `execution/worker-paypal.test.ts` (514, NEW, 4 tests): full run to ordered with exactly one capture POST and the fake order row; SIGKILL after provider commit with recovery via getAuthorization→getCapture under an EXPIRED mandate (exactly one capture, consume, ordered, no refund); stalled call → `reconciliation_required` with authority retained; DENIED hold → durable rejection, release, failed, refundStatus `not_started`. `ledger/tests/store.test.ts` (665): migration-3 upgrade parity (v2 DB → v3 trigger-set identical to a fresh DB, data preserved) + identity/FK trigger evidence. `apps/cli/src/backend.test.ts` (683): +5 tests — constant provider fact on screen (and its absence for fake ids), config-gated authorize refusals, invalid `paymentProvider` value refused, credential refusals without values leaking, rpc-never-loads-`.env`, BOM'd config/draft accepted while invalid JSON still fails (through the exact file paths), `--help` mentions. |

## Answers for the teammate (issue #16)

- **(2) Where the hold sits: after the cart is reserved, before `operation-run`** —
  not in scene 3 at mandate confirmation. The hold amount must equal the reserved
  all-in total of a concrete operation, and the capture gate revalidates against
  that reserved operation at execution. So: scene (rpc submit) prints the operation →
  demo prints `operation-authorize`'s JSON line (`approvalUrl`) and waits for Enter →
  operator/buyer approves on PayPal's hosted page → `operation-complete-authorization`
  → `operation-run` proceeds against the held authorization. If run without the hold,
  the operation lands in `reconciliation_required` (authority retained) instead of
  executing, which fails loud rather than silently running fake.
- **(1) Opt-in:** config-only `paymentProvider`, exactly as requested; demo-flow can
  write `"paymentProvider": "paypal-sandbox"` into its config; absent key = fake =
  today's behavior, no key, no network.
- **(3) Provider on screen:** `paymentProvider` rides backend-owned output for
  run/reconcile/status/audit. `OperationSchema` is deliberately untouched — the
  ready-to-co-sign shape is documented below. Wording per fact: under fake config
  "fake payment provider" remains true; "PayPal (sandbox)" appears only when the
  config selected it. The supplier order is ALWAYS the fake store — screens should
  split the two statements.
- **(4) Credentials:** the backend reads `.env` itself, only in the PayPal-calling
  commands, in-process; rpc never loads it; process env wins over the file.
- **(5) IDs:** `providerIds: {authorizationId?, captureId?, refundId?}` on
  audit/status/run when present in ledger facts, all from provider response evidence.
- **Worker gaps the teammate raised:** "rejected" and `lookupEffect(effectKey)`
  existed in the ExecutionProvider seam ("Expecting" was pre-wired); the gateway
  still has NO lookup-by-request-id by design — the binding row + durable resource
  reads (getAuthorization→getCapture) resolve it instead.

## Exact output shapes

`operation-authorize` (created):
`{"simulation":true,"paymentProvider":"paypal-sandbox","operationId":"op-…","providerState":"order_created","currency":"SGD","amountMinor":119791,"orderId":"ORD…","approvalUrl":"https://www.sandbox.paypal.com/…"}`
(replay: same shape, `approvalUrl` re-derived; already-held: additionally `authorizationId`
with `providerState:"authorization_held"` and no fetch). Refused: exit 2, empty stdout,
sanitized stderr; unapproved buyer: "The sandbox buyer has not approved this hold yet".

`operation-complete-authorization`:
`{"simulation":true,"paymentProvider":"paypal-sandbox","operationId":"op-…","providerState":"authorization_held","currency":"SGD","amountMinor":119791,"orderId":"ORD…","authorizationId":"AUTH…"}`

`operation-run`/`operation-reconcile`/`status`:
`{"simulation":true,"paymentProvider":"fake|paypal-sandbox","operation":{…unchanged Operation…},"providerIds":{"authorizationId?:…","captureId?:…","refundId?:…"}}`
(`providerIds` only when present and provider is paypal-sandbox).

`audit`: `{"simulation":true,"paymentProvider":…,"operationId":…,"events":[{"eventId","kind","createdAt","details":{…event specifics…,"paymentProvider":"…"}}],"providerIds":{…}?}`

Binding lifecycle: `rpc proposal.submit` → reserved → `operation-authorize`
(binding row `order_created` + `binding_created` event) → buyer approves on
PayPal's hosted page → `operation-complete-authorization` (`authorization_held`
+ `binding_upgraded`) → `operation-run` (capture consumed against the held
authorization; order stays fake; refund path identical to unit 3 with sandbox
capture/refund ids). Any unknown keeps authority; DENIED/VOIDED/EXPIRED reads are
durable non-application evidence.

## Operation schema proposal (needs both owners' co-sign)

`OperationSchema` diff-ready shape (packages/contracts, do NOT land alone):

```ts
paymentProvider: z.enum(['fake', 'paypal-sandbox']).optional(), // absent ⇒ backend 'fake'
// optional extended facts (both owners to agree): providerIds?:
// z.object({ authorizationId?, captureId?, refundId? }).strict()
```

Semantics: `fake` = simulated providers; `paypal-sandbox` = capture/refund via
sandbox gateway, order still fake. The backend-owned output field keeps the same
name so the shared-shape upgrade can alias it.

## Checks

- `npm test`: 363 tests, 362 pass, 0 fail, 1 skipped (pre-existing skips only).
  Baseline before this unit: 328 tests (327 pass, 0 fail — the unit-4 era
  anthropic module-missing failure had already resolved on main), so this unit
  adds 35 tests, all green, and no existing test was weakened.
- `npm run typecheck`: 0 errors.
- `npm run demo`: exit 0 ("Offline checks only").
- Execution suites standalone twice: `worker.test.ts` 26 pass both runs (the
  unit-3 suite runs untouched and unchanged). PayPal suites standalone:
  `client.test.ts` + `gateway.test.ts` = 48 pass, global fetch denied.
- `git diff --check` clean after commit 1; re-run before commit 2.
- Every scripted PayPal exchange stayed on `https://api-m.sandbox.paypal.com`
  (assert in tests); no network I/O anywhere.

## Honest limitations

- Nothing was verified against a real PayPal account: request-id replay across
  create→authorize endpoints, overcapture refusal, authorization expiry windows,
  hosted-page consent flow and Activity-page id shapes are contract-test facts only.
- Buyer consent REQUIRES the operator: `operation-complete-authorization` after a
  human approves the hold on PayPal's hosted page. The demo cannot do that step
  itself and never should.
- The authorized interactive sandbox exercise is explicitly NOT part of this unit
  (brief: "the buyer-approval sandbox exercise stays an explicitly authorized
  interactive step").
- `operation-authorize`/`operation-complete-authorization` SUCCESS paths cannot be
  exercised in fresh-process CLI tests without network; they are proven at the
  provider-command-core level (in-process, fake fetch) plus CLI refusal shapes.
- Windows blocker: untouched, tracked in issue #9 / PR #15 as instructed.
- `docs/paypal-spike.md` untouched: still no results; the spike remains the
  separate authorized interactive exercise.

## Deviations

- Added `services/checker/src/execution/worker-paypal.test.ts` (new test file next
  to worker.test.ts rather than appending to that 1,548-line file) and
  `services/checker/src/execution/paypal-provider.test.ts` — both inside the
  allowed execution area, test-only.
- Extended `services/checker/src/execution/test-worker.ts` (test-only child)
  rather than adding a new child harness file, so the CRASHPOINT/SIGKILL
  infrastructure could be reused verbatim for the network provider.
- During provider tests a node:test nuance has been noted: global `before()` fetch
  swaps in a mixed async file silently removed sibling registrations; that hook
  pattern is NOT used in the new suites (each gateway always uses an injected
  fetch instead).
