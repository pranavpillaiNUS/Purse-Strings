# Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation

Date: 2026-11-06. Branch: `unit4-paypal-boundary` (based on merged `origin/main`
700079a), uncommitted, no commits/pushes/deploys. Scope governed by
`.audit/backend-delivery/unit4.md`, `.audit/backend-delivery/design.md` lines 57-59,
69 and 160-176 (binding), and repo `AGENTS.md`.

## Delivered

| File | Content |
| --- | --- |
| `services/checker/src/paypal/client.ts` | Only compatible edits: optional injected `fetchFn` (defaults to platform fetch), finite per-call timeout (`timeoutMs`, default 10 s, applied to OAuth and resource calls alike, raced so a signal-ignoring fetch still loses the timer, late-losing rejection observed to prevent unhandled rejection) and `getRefund(refundId)`. Every existing export, signature, path, header behavior and the 2xx non-JSON pass-through remain unchanged for the spike. A `PayPalTimeoutError` distinguishes timeouts from provider errors. |
| `services/checker/src/paypal/gateway.ts` (new) | The exact unit-4 adapter contract: `captureAuthorization`, `getCapture`, `refundCapture`, `getRefund` over a sandbox-only client; `ExpectedMoney {currency:'SGD', amountMinor: 1..1e9}`; local validation of all caller inputs (IDs `^[A-Za-z0-9_-]{1,64}$`, invoice/request IDs `^[\x21-\x7E]{1,127}$`, boolean `finalCapture`) with `GatewayInputError` before any fetch; request IDs forwarded unchanged, no fallback generation, no write retries, no lookup-by-request-id; minor-unit ⇄ decimal only at the edge via `money.ts`; results `{state:'succeeded', resource}` or `{state:'unknown', reason: transport|provider_error|invalid_response|unconfirmed_status|binding_unverified, resourceId?}` (hinted only with validated response IDs); write parent = authenticated endpoint + contradiction check, read parent strictly from response evidence (`supplementary_data.related_ids` or exact sandbox-origin `rel:'up'` path, never followed); non-`COMPLETED` = `unconfirmed_status`; documented mapping for every malformed/missing/mismatched field. Never imported by execution or CLI; imports nothing from `execution/`. |
| `services/checker/src/paypal/client.test.ts` (new, 7 tests) | Injected fetch with denied global fetch; token POST/bearer/request-ID forwarding and encoded paths; token caching; request-ID preserved across retries; `PayPalApiError` (status/issue/debugId); `getRefund`; OAuth and resource timeouts bounded in wall clock < 5 s. |
| `services/checker/src/paypal/gateway.test.ts` (new, 25 tests) | Full contract matrix over fake fetch: 4 success paths (+ rel-up variants, edge conversion `1 → "0.01"`), contradictory parent on POST (capture/refund), recognized-but-wrong rel-up link, foreign-origin and wrong-shape links not recognized, missing parent on GET, GET ID mismatch, refund parent mismatch, currency/amount/invoice `binding_unverified`, pending/unrecognized → `unconfirmed_status`, 403/500 → `provider_error`, 401 token → `provider_error`, never-resolving resources/tokens → `transport` under finite timeouts, dropped-body lost response → `transport`, malformed JSON/missing/malformed evidence → `invalid_response`, 15 local input rejections with zero fetch calls, request-ID unchanged, sandbox host asserted on every request URL. No test performs any network I/O. |
| `docs/backend-delivery-design.md` (new) | Accepted design copied verbatim (verified textually against `.audit/backend-delivery/design.md`) with a clearly separated implementation-status addendum (units 1-3 verified, unit 4 fetch-mocked only). |
| `docs/backend-api.md` (new) | Wire API actually in the tree: CLI commands/outputs/exit codes, config + private runtime layout, four shared methods with params/results/error codes, operation fields, replay/cart-identity/alias semantics, mock-limitation semantics, and the full PayPal gateway contract table. |
| `docs/backend-delivery-review.md` (new) | Evidence trail per milestone with the three proof classes (simulated execution ≠ real provider feasibility ≠ sandbox-account feasibility), exact offline reproduction commands, observed walkthrough results, remaining work, link to `.audit/backend-delivery/decisions.tsv`. |
| Status-accuracy edits | `README.md` (status + doc links), `docs/architecture.md` (diagram node, no-website wording fixed to "no custom website; PayPal's hosted consent page excepted", paypal row), `docs/project-scope.md` (delivery-constraint wording fixed, implementation status), `services/checker/src/ledger/README.md` ("next unit" claim corrected), `AGENTS.md` (one factual current-status paragraph only). No historical/research content deleted; the Windows known-problem note is untouched. |

## Checks

- `npm test`: 286 tests, 284 pass, 0 fail from this unit's changes, 1 skipped
  (pre-existing); the single failing file is `services/agent/src/anthropic.test.ts`,
  which fails at module load because `@anthropic-ai/sdk` is not installed in this
  checkout (partial node_modules, 6 packages). It failed identically on the clean
  base commit before any unit-4 work; `services/agent/**` is outside this unit's
  allowed files. My +32 tests (7 client, 25 gateway) all pass; baseline was 254
  tests (252 pass, 1 fail, 1 skipped).
- `npm run typecheck`: the only errors are the same two pre-existing
  `services/agent/src/anthropic.ts` module-not-found / unknown-type errors; no
  error in any unit-4 file.
- `npm run demo`: exit 0.
- `git diff --check`: clean.
- README backend walkthrough executed offline end to end (README order,
  fresh `.runtime-walkthrough`, bash instead of the README's PowerShell wording):
  two store resets with `--seed`/`--now`, `mandate draft --proposal-out`, backend
  `mandate-draft` (digest), `mandate-review`, `mandate-confirm`; compromised
  scripted shopper run exits 2 with `QUANTITY_EXCEEDED`/`INVALID_TOOL_CALL`/
  `CART_NOT_FOUND` refusals and reserves nothing; honest scripted run exits 0 and
  reserves (operation ID printed); `operation-run` reports `ordered`, payment/order
  `succeeded`, reservation `consumed`, readiness `not_assessed` (fake-provider
  facts); `audit` lists `operation_reserved`, `capture_succeeded`,
  `order_succeeded`; runtime dir `0700`, `app.db`/`providers.db` `0600`. No network
  use. An incidental observation: a pre-created `0755` runtime dir is refused exit
  2 ("too open; refusing to chmod"), matching design.
- `graphify update .`: run last; report in the orchestrator envelope.

## Honest boundaries

- No network was touched at any point: no sandbox request, no live request, no
  account activity. `docs/paypal-spike.md` still records no results.
- The gateway is defined but unwired; nothing imports it except its tests.
- Contract tests prove response handling, not PayPal account behavior
  (idempotency replay, overcapture, capture counts, pending reasons are all
  unverified).
- Type-level caller input is runtime-validated because the brief forbids trusting
  TS types alone; the `ExpectedMoney` currency is a literal type in TS, but the
  gateway still rejects non-'SGD' at runtime for dynamically-shaped callers.
- Reason-mapping choices contractually unstated by design.md are documented in
  `docs/backend-api.md`: mismatched expected values/recognized contradictions →
  `binding_unverified`; missing amount/status/ID/invoice fields →
  `invalid_response`; non-`COMPLETED` → `unconfirmed_status`. Unknown-with-hint
  carries `resourceId` when the response ID validates.

## Deviations from the orchestrator's file list

- `.audit/backend-delivery/unit4-result.md` (this file) is outside the listed
  allowed files but is required output by binding `unit4.md` line 8 and matches the
  unit1-3 record pattern. Created and disclosed; no other file outside the list was
  touched (`services/agent/**`, spike script, `apps/cli/**`, `packages/**`).
- During the offline walkthrough the repo's gitignored working files
  (`services/agent/state/proposal.json`, `services/suppliers/state/*.json`,
  `.runtime/`) were created; `services/agent/state/.gitignore` was momentarily
  deleted by an over-broad cleanup and restored byte-identical from HEAD
  (verified md5). Only gitignored/runtime state remains from the walkthrough.
