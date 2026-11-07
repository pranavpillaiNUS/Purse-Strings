# PayPal sandbox spike (build step 1)

`services/checker/scripts/paypal-spike.ts` tests the PayPal behaviour the whole design depends on,
against the real sandbox with hardcoded carts: one S$8,000 hold, three partial captures, then release the rest.

## Application path (exercised 2026-11-07, PR #17 tree + one live fix)

The same evening, the wired application path ran end to end against the sandbox with the gateway
behind `paymentProvider: "paypal-sandbox"`:

1. `mandate-draft` → `mandate-review` → `mandate-confirm` (dig-bound OS-user confirmation).
2. Cart submission over rpc for one LAP-14-AIR @ 1,099.00 + 9% GST → operation
   `op-9e0c96e2-5c33-4a4d-956c-a2cc035c24ea` **reserved** at exactly **119,791 minor (S$1,197.91)**.
3. `operation-authorize` minted sandbox order `84356576HC687815U` (invoice id = operation id,
   request id = binding identity) and printed one JSON line with the approval link.
4. The named buyer approved on PayPal's hosted page ("review order" after approval
   is cosmetic; PayPal recorded the consent server-side — the backend replayed fine).
5. `operation-complete-authorization` upgraded the binding to `authorization_held` under
   authorization `0DY26454FF666080L`.
6. `operation-run` captured S$1,197.91 as `70023069VM754651G` (`COMPLETED`) and consumed
   the reservation; **status/audit show `paymentProvider: "paypal-sandbox"`, the real sandbox ids,
   and the supplier order as a fake provider id (`fake-order-…`) — supplier ordering stayed
   simulated, as designed.**
7. The audit trail reads `operation_reserved → binding_created → binding_upgraded →
   capture_succeeded → order_succeeded`.

**Live fix found by this exercise:** the gateway minted buyer orders with
`intent: "AUTHORIZATION"`; PayPal returns `400 INVALID_PARAMETER_VALUE` — Orders v2 documents
`AUTHORIZE`. Fetch-mocked tests could not catch a request-grammar typo, so this class of fact now
depends on the recorded sandbox evidence above. One diagnostic probe order (`79W2716935161023K`)
was created while reproducing the error and was never approved; no hold exists on it.

**Claude-clock note for the recorded demo:** the sandbox hold's honor period ends ~3 days after
creation, so create the demo hold on demo day.

## One-time setup (about 15 minutes)

1. Sign in at [developer.paypal.com](https://developer.paypal.com), then go to **Testing Tools → Sandbox Accounts → Create account**:
   - **Business**, country **Singapore**. This is our app, the merchant. A Singapore account holds SGD,
     so captures don't sit in `PENDING` waiting for currency acceptance.
   - **Personal**, country **Singapore**. This is the buyer. If the form lets you set a PayPal balance, make it at least 10,000.
   - Write down both logins (the **⋯ → View/Edit account** menu shows them).
2. **Apps & Credentials → Sandbox → Create App**, type Merchant, linked to the Singapore business account.
   Copy the Client ID and Secret.
3. `cp .env.example .env` and fill in `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.

## Run

```sh
npm run spike:paypal                                  # run 1: void the remainder
npm run spike:paypal -- --finish=final --refund       # run 2: release with final_capture=true, then a partial refund
```

Other flags: `--skip-overcapture` skips step 6, and `--open` opens the approval link in your default browser.

Each run asks for one buyer approval. Open the printed link in a **private window**, log in as the
*personal* sandbox account, and click Continue. The script then runs on its own and writes every request and
response, with PayPal `debug_id`s, to `spike-logs/` (gitignored).

To see the money, log in to [sandbox.paypal.com](https://www.sandbox.paypal.com) as the business account and open
Activity. The demo needs this view anyway.

## What each check means

| Check | If PASS | If FAIL or WARN |
|---|---|---|
| Authorization created / hold equals budget | One approval can hold the whole budget. | Read the reason code. `PENDING` means a sandbox risk review, so try another buyer account. |
| Partial capture #1, concurrent captures, re-read "settled" | Several partial captures on one authorization work, and money moves (status `COMPLETED` on a fresh `GET`, with a net amount). | `RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION`: the currency doesn't match the account (see setup step 1). `MAX_CAPTURE_COUNT_EXCEEDED`: there's a cap on captures, so design for one capture per store per mandate. |
| Retried capture is idempotent | Reusing a `PayPal-Request-Id` returns the original capture, so retries are safe. | A **second capture** is a blocker: the checker must never retry captures. A rejected replay is survivable: treat that error as "already captured" and re-read the order. |
| Concurrent capture | PayPal accepted two at once. The checker still serializes captures per authorization. | `PREVIOUS_REQUEST_IN_PROGRESS` confirms that captures must be serialized. |
| Hold is a hard ceiling | PayPal refuses to capture more than the hold. This is a second safety net under the checker, and a strong point for judges. | PayPal allowed an over-capture, so the checker is the only cap. Say so honestly in the write-up. |
| Void after partial captures | The rest can be released at close-out. | `PREVIOUSLY_CAPTURED`: close mandates by marking the last capture `final_capture=true` (run 2 tests this). If a mandate ends with no final purchase, the hold just expires. |
| Final capture / no captures after final | `final_capture=true` closes the authorization. | Fall back to letting the hold expire, and show that in the audit log. |
| Partial refund | Returns can go through PayPal. | Cut refunds from the demo. |

## Results

Fill this in after each run. It is evidence for the write-up and the demo.

| Date | Currency | Captures OK | Idempotent | Concurrent | Hard ceiling | Void after partial | Final capture | Refund |
|---|---|---|---|---|---|---|---|---|
| 2026-11-07 (run `spike-20261107190313`, log in gitignored `spike-logs/`) | SGD | yes — 3 of 3 `COMPLETED`, re-read from PayPal with net amounts | yes — replay with the same `PayPal-Request-Id` returned the original capture `56E36975AL768471P` | yes — B and C captured at the same moment, no `PREVIOUS_REQUEST_IN_PROGRESS` | **WARN — no**: PayPal accepted an over-capture of S$507.35 when only S$495.35 remained | skipped — the over-capture consumed the remainder, so this row needs the `--finish=final` run | not yet run | not yet run |

Run 1 facts (authorization `48N27869UF418711G`, order `4KP481773U222774K`):

- A single buyer approval held the full S$8,000 with no fee and no risk review (`PENDING`).
- Hold timing: created 2026-11-07T19:06:13Z, honor period ends ~2026-11-10, full expiry 2026-12-06. **Demo consequence: sandbox holds go stale inside three days, so refresh the hold on demo day instead of pre-creating one.**
- Captures settled with fees (S$122.69 / 81.77 / 52.20 gross→net visible on re-read), and the authorization moved to `PARTIALLY_CAPTURED` with exactly 3 captures on the order.
- **Over-capture: the surprising result.** PayPal accepted S$507.35 against a S$495.35 remainder (`COMPLETED`) — the hold is **not** a hard ceiling on this account. The checker's own amount verification in `services/checker/src/paypal/gateway.ts` (expected amount passed per capture) is therefore the *only* cap; say this honestly in the demo/write-up.
- The earlier run `spike-20261107190056` ended with `buyer cancelled` at the approval page (login trouble before the dashboard credentials were recovered); order `9TK54416118491612` — no hold was exercised, no state to clean up.
- Raw request/response excerpts for this run (with PayPal `debug_id`s) stay in `spike-logs/` (gitignored); they are not reproduced in this file.

