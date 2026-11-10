# PayPal sandbox spike (build step 1)

`services/checker/scripts/paypal-spike.ts` tests the PayPal behaviour the whole design depends on,
against the real sandbox with hardcoded carts: one S$8,000 hold, three partial captures, then release the rest.

## Demo-flow sandbox rehearsal (2026-11-09)

Pranav reported one completed rehearsal of the demo flow's sandbox variant in
[PR #26](https://github.com/pranavpillaiNUS/Purse-Strings/pull/26#issuecomment-6738320826).
This was the application path, separate from the interactive spike below. The reported
command was `npm run demo:flow -- --sandbox-paypal --dir .runtime/demo-sandbox-rehearsal-1`.
The report identifies a clean `main` at `17e917c`, Windows 11, Node 26.13.0 and enabled
backend folder checks; it records exit 0 after 3,318 seconds, mostly waiting for the buyer.
The shopper was scripted, with neither `--live` nor `--pause`. Scene 3 therefore invoked
the local confirmation command automatically, rather than waiting for a person to press Enter.

**Provenance:** the original process exit, run revision and hosted-page buyer approval
are the operator's report. A subsequent documentation check independently read the saved
session and local backend `status`, `audit` and `shop status` output. Those reads confirmed
the stored facts below without making a fresh PayPal request. They do not independently
re-read the sandbox account or establish its current resource state.

| Stored fact | Local readback |
| --- | --- |
| Session | Scripted; `paymentProvider: paypal-sandbox`; scene 6 finished with no failure; started `2026-11-09T08:32:14.831Z`, final session update `2026-11-09T09:27:33.144Z` |
| Operation | `op-ad4ce834-7272-40b3-9d90-96cba6b39459`, store-a, SGD 751,010 minor units (S$7,510.10) |
| PayPal references | Order `7PM55607UC388470N`; authorization `11C077066A694603P`; capture `72K10179MD737102M` |
| Operation effects | `status: ordered`; reservation consumed; sandbox payment succeeded; simulated supplier order succeeded; refund not started; readiness not assessed |
| Budget | S$8,000.00 total; S$7,510.10 committed; S$0 reserved; S$489.90 remaining |
| Quantities | Five laptops and five monitors committed; no units reserved or remaining to purchase. This is not delivery or equipment readiness |

The local audit records, in UTC: `operation_reserved` at `08:32:25.669`,
`binding_created` at `08:32:26.660`, `binding_upgraded` at `09:27:21.694`,
`capture_succeeded` at `09:27:31.231`, and `order_succeeded` at `09:27:31.252`.
Pranav reports approving on PayPal's hosted sandbox page, then completing authorization
before `operation-run` captured the reserved amount. The supplier order stayed fake;
no real money or real supplier order was involved.

**Binding state after capture:** the operator noticed that the stored binding's
`provider_state` still reads `authorization_held` after the capture effect succeeded.
Danny [confirmed](https://github.com/pranavpillaiNUS/Purse-Strings/pull/26#pullrequestreview-5826663514)
this is the current design, not a defect. The ledger only upgrades a binding from
`order_created` to `authorization_held`, and `worker-paypal.test.ts` expects it to stay in
that state after a successful capture. The capture is tracked separately as an effect,
which the audit shows as `capture_succeeded`. The field describes our stored record; it
does not establish the authorization's current state at PayPal.

**Limits:** this is one normal authorization/capture rehearsal on one Windows machine,
not the final recorded take. It establishes no crash/unknown-outcome recovery, refund,
partial capture or unused-hold closure. The captured amount equalled the hold, so there
was no unused remainder to release. It adds no live-model run and does not exercise the
sandbox variant with `--live` or `--pause`, another platform, or judge credentials.
The take directory is retained locally; a later authorized take must use a new directory.
No acceptance gate is recorded as passed by this observation.

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
| 2026-11-08 (run `spike-20261108062830`, `--finish=final --refund`, log in gitignored `spike-logs/`) | SGD | yes — 3 of 3 `COMPLETED`, re-read from PayPal with net amounts (fees 122.69 / 81.77 / 52.20) | yes — replay with the same `PayPal-Request-Id` returned the original capture `3HR51156CD066832X` | yes — B and C captured in parallel, both `COMPLETED` | **WARN — no**, reproduced: PayPal accepted S$507.35 against a S$495.35 remainder | skipped — the over-capture probe used `final_capture=false` and consumed the remainder, leaving nothing to void | skipped — same cause; a dedicated final-capture pass is still owed | yes — partial refund `100.00` returned `COMPLETED` and the capture re-read as `PARTIALLY_REFUNDED` |

Run 1 facts (authorization `48N27869UF418711G`, order `4KP481773U222774K`):

- A single buyer approval held the full S$8,000 with no fee and no risk review (`PENDING`).
- Hold timing: created 2026-11-07T19:06:13Z, honor period ends ~2026-11-10, full expiry 2026-12-06. **Demo consequence: sandbox holds go stale inside three days, so refresh the hold on demo day instead of pre-creating one.**
- Captures settled with fees (S$122.69 / 81.77 / 52.20 gross→net visible on re-read), and the authorization moved to `PARTIALLY_CAPTURED` with exactly 3 captures on the order.
- **Over-capture: the surprising result.** PayPal accepted S$507.35 against a S$495.35 remainder (`COMPLETED`) — the hold is **not** a hard ceiling on this account. The transactional ledger must enforce the approved total across commitments and active reservations. Gateway checks verify each capture's expected amount; they do not establish the cumulative budget ceiling. State the ledger's role honestly in the demo/write-up.
- The earlier run `spike-20261107190056` ended with `buyer cancelled` at the approval page (login trouble before the dashboard credentials were recovered); order `9TK54416118491612` — no hold was exercised, no state to clean up.
- Raw request/response excerpts for this run (with PayPal `debug_id`s) stay in `spike-logs/` (gitignored); they are not reproduced in this file.

Run 2 facts (`--finish=final --refund`, run `spike-20261108062830`, authorization `4A446567Y9042202W`, order `0YL616644P7131011`):

- Reproduces every run-1 result and adds the partial refund: refund `5MV8654727882740K` for `100.00` of capture `3HR51156CD066832X` came back `COMPLETED`, and a fresh capture read showed `PARTIALLY_REFUNDED`.
- **Racing bug found and fixed.** Two earlier `--finish=final` attempts (`spike-20261108061154`, `spike-20261108061237`) died with `422 ORDER_NOT_APPROVED` on the authorize: the buyer's browser hits our local `/return` before PayPal's server-side approval state settles, so an immediate `authorizeOrder` can replay before the order is authorizable. The spike now retries `authorizeOrder` briefly on `ORDER_NOT_APPROVED` (up to 6 attempts with backoff); a genuinely unapproved order still fails after the window.
- Over-capture warning held again: `507.35` accepted against a `495.35` remainder (`COMPLETED`). The transactional ledger enforces the approved total; per-capture verification checks the individual amount. The provider authorization is not a budget cap — state this in the demo and write-up.
- The over-capture step and closing steps are one design gap: with the remainder consumed by the probe, neither void nor `final_capture=true` was exercised on this pass. Either cap the last probe to the true remainder (then void the rest) or drop the probe's amount to leave a remainder.
- Hold timing: created 2026-11-08T06:34:08Z, honor period ends ~2026-11-11, full expiry 2026-12-07. The three-day staleness rule stands: create demo holds on demo day.

