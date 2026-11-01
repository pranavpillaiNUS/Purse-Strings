# PayPal sandbox spike (build step 1)

`services/checker/scripts/paypal-spike.ts` tests the PayPal behaviour the whole design depends on,
against the real sandbox with hardcoded carts: one S$8,000 hold, three partial captures, then release the rest.

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
| | | | | | | | | |
