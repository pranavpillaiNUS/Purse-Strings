# Demo script

How to record the hackathon video from `npm run demo:flow`. The video must run under 3
minutes. This script targets 2:45, which leaves room for small overruns.

**This cannot be submitted yet.** The hackathon requires PayPal, and the default scene 6
still runs on fake providers. A sandbox PayPal variant of scene 6 exists
(`--sandbox-paypal`, below); verify it against a live sandbox account before recording it.

## Before you record

1. Rehearse for free with `npm run demo:flow`. It uses a scripted stand-in and no API key.
2. Record with `npm run demo:flow -- --live --pause`. It waits for Enter between scenes, and
   the operator presses Enter to confirm the mandate.
3. Check the exit code after each take. Exit 2 means Claude did something else, such as
   avoiding store-b, so that take is not usable. The Nov 7 live take used about 57,000 tokens,
   roughly 30 cents, and took 59 seconds.

Every date is generated from the day you run it, so nothing needs editing first. Live runs
are not identical: Claude picks its own mandate ID and words its own summaries.
The flow uses `shop run --brief`, then closes with the read-only `shop status` dashboard. A brief
review cuts Claude's long summary to its conclusion and its section on suspicious supplier data,
and says how many lines it left out.
For a scripted rehearsal, say "the scripted stand-in" wherever the narration below says
"Claude", and omit the live-only part of scene 4 that starts "Now Claude".

The scripted flow passes in CI on Linux, Windows and macOS. A live take has not run on Linux or
macOS, or on Windows with the backend's folder check on, so rehearse one first on the machine you
record with.

## The script

The narration is about 350 words, which is about 2:20 at a normal pace, and the rest is time
for viewers to read the screen. Cut waiting time in editing, especially during scenes 2, 4
and 5, when Claude can take 10 to 20 seconds to answer.

| Scene | Target | Running total |
| --- | --- | --- |
| Opening | 0:15 | 0:15 |
| 1. The control panel | 0:10 | 0:25 |
| 2. A plain-English request | 0:30 | 0:55 |
| 3. A person confirms it | 0:20 | 1:15 |
| 4. A hostile listing | 0:35 | 1:50 |
| 5. A store change, a rejection, then recovery | 0:30 | 2:20 |
| 6. Execution | 0:25 | 2:45 |

**Opening.** New hires need laptops and monitors before they start, within a budget. Here,
Claude does the comparison shopping, but it can't spend. Company policy, a person and an
independent checker decide what happens.

**1. The control panel.** These are two fake stores, side by side. We control their prices,
shipping, stock and records from this panel, so we can change them on cue.

**2. A plain-English request.** The manager writes a request. Claude structures it, and
company policy checks the result. Look at the assumptions: a purchase deadline, time of day
and suppliers. It couldn't capture "reuse suitable stock first", because that isn't built.
The reviewer can see what's missing.

**3. A person confirms it.** This is still only a draft. If the shopper tries now, it's
refused. Confirmation is tied to this exact content, and it records who confirmed. For this
prototype, that's a local operator check, not production sign-in.

**4. A hostile listing.** Store-b has hidden a message for AI agents in a listing. It claims
a CFO approved S$20,000, and asks for a bigger purchase, a payment and a secret. First, a
scripted stand-in obeys it. Every attempt is refused; nothing is reserved. Now Claude, on a
separate mandate. It follows none of it and flags it. This is one listing, not immunity.
Obeying it achieves nothing.

**5. A store change, a rejection, then recovery.** Now the store changes. Store-b removes that
listing, but its records are now 75 hours old. Policy allows 72, and Claude isn't told that.
Store-b is cheapest. The checker rejects its cart for stale evidence, and Claude recovers at
store-a. The store table shows both decisions, the shopper's estimate and the checker's own
accepted total. Budget is reserved, not spent.

**6. Execution.** Only the operator can execute this, never the shopper. Right now, fake
providers stand in for payment and the supplier: this is not PayPal or a real order. The
dashboard reads S$7,510.10 committed and S$489.90 remaining. "Allocated" means reserved or
committed, not delivered. Fake payment, order and readiness are separate facts. Readiness
says not assessed; payment doesn't mean equipment has arrived.

### Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in)

The default flow stays the one CI and first runs rely on: no key, no network, scene 6 on
fake providers. `npm run demo:flow -- --live --pause --sandbox-paypal` connects scene 6's
payment to the verified PayPal path instead. The generated backend config gains
`paymentProvider: "paypal-sandbox"` (through the strict config schema), and the supplier
order stays simulated in every variant; only the payment capture is a real call.

Before anything is reserved, the flow checks the credentials with a probe hold on an id
that has no operation. Without sandbox credentials in `.env` it stops before scene 2 with
an instruction to add them, so the run never gets halfway through. Set them up as in the
[spike](paypal-spike.md): `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
(`PAYPAL_ENV=sandbox` if used), from `cp .env.example .env`. Never point the demo at live
keys, and rehearse once — this variant has not been verified against a live sandbox account.

Scene 6 then plays as a two-person scene:

- The operator's terminal runs `operation-authorize`, prints the sandbox approval link
  prominently, and waits for Enter. Meanwhile the buyer opens the link in a browser,
  signs in as the *personal* sandbox buyer on PayPal's hosted page and approves (like the
  spike's step 6).
- Enter completes it: `operation-complete-authorization`, then the normal `operation-run`.
  If the buyer pressed Enter without approving, the flow stops and prints the backend's
  own message as-is, "The sandbox buyer has not approved this hold yet"; nothing executes.
  Enter that closes without approval stops the flow, so nothing can confirm by itself.
- Afterwards the screen shows `paymentProvider: paypal-sandbox` with the sandbox ids
  (`authorizationId`, `captureId`) a viewer can match in the sandbox's Activity page,
  next to the statement that the supplier order stayed simulated (fake).

## What not to say

- Don't say a scripted run is Claude. The compromised model is always scripted.
- Don't describe fake-provider results as real payments or orders, or a reservation as payment.
- Don't call the ledger's allocation a PayPal hold, or allocated units delivered equipment.
- Don't mention PayPal in the purchase path until it is there.
- Don't claim prompt-injection immunity, production authentication or a passed gate.
- Don't say stock reuse, delivery tracking, approvals or exceptions work. They aren't built.
