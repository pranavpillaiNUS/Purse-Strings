# Demo script

How to record the hackathon video from `npm run demo:flow`. The video must run under 3
minutes. This script targets 2:45, which leaves room for small overruns.

**This cannot be submitted yet.** The hackathon requires PayPal, and scene 6 runs on fake
providers. Re-record scene 6 once sandbox PayPal is in the purchase path.

## Before you record

1. Rehearse for free with `npm run demo:flow`. It uses a scripted stand-in and no API key.
2. Record with `npm run demo:flow -- --live --pause`. It waits for Enter between scenes, and
   the operator presses Enter to confirm the mandate.
3. Check the exit code after each take. Exit 2 means Claude did something else, such as
   avoiding store-b, so that take is not usable. Each live take uses about 55,000 tokens,
   roughly 30 cents.

Every date is generated from the day you run it, so nothing needs editing first. Live runs
are not identical: Claude picks its own mandate ID and words its own summaries.

**On Windows, the flow stops in scene 3** until the runtime-directory check in issue #9 is
resolved. Record on Linux or macOS, or after that fix. The flow has not yet run on either,
so rehearse there first.

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

**1. The control panel.** These are two fake stores. We control their prices, stock and
records from this panel, so we can change them on cue.

**2. A plain-English request.** The operations manager writes one sentence. Claude turns it
into a structured request, and company policy checks the result. Look at what it flags. It
had to assume a purchase deadline and the suppliers. And it says plainly that it couldn't
capture "reuse suitable stock first", because that isn't built yet. So the person reviewing
can see what's missing.

**3. A person confirms it.** This is still only a draft. If the shopper tries now, it's
refused. Confirmation is tied to this exact content, and it records who confirmed. For this
prototype, that's a local operator check, not production sign-in.

**4. A hostile listing.** Store-b has hidden a message for AI agents in a listing. It claims
a CFO approved S$20,000, and asks for a bigger purchase, a payment and a secret. First, a
scripted model that obeys it. That's a stand-in, not Claude. Every attempt is refused and
nothing is reserved, because no tool can do those things. Now Claude, on a separate mandate.
It searches both stores, follows none of it and flags it for the manager. That's one listing,
not a claim of immunity. The real protection is that obeying it achieves nothing.

**5. A store change, a rejection, then recovery.** Now the store changes. Store-b removes that
listing, but its records are now 75 hours old. Policy allows 72, and Claude isn't told that.
Store-b is cheapest, so Claude submits it. The checker prices the cart itself and rejects it
for stale evidence. Claude reads the reason, switches to store-a, and that's accepted. The
budget is reserved in a ledger, not spent.

**6. Execution.** Only the operator can execute this, never the shopper. Right now, fake
providers stand in for payment and the supplier, so this is not a real order. Payment, the
order and readiness are tracked separately. Readiness says not assessed, because paid doesn't
mean the equipment has arrived.

## What not to say

- Don't say a scripted run is Claude. The compromised model is always scripted.
- Don't describe fake-provider results as payments or orders, or a reservation as payment.
- Don't mention PayPal in the purchase path until it is there.
- Don't claim prompt-injection immunity, production authentication or a passed gate.
- Don't say stock reuse, delivery tracking, approvals or exceptions work. They aren't built.
