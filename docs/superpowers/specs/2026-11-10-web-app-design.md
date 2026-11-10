# Local web app that runs the demo flow — design

**Status:** design approved by Danny section by section on Nov 10, 2026. **Not approved by
Pranav yet.** `AGENTS.md` requires both people to agree to "any page that acts", and this
design changes Role B files. No code is written until Pranav agrees.

**Target:** the Nov 12 submission. Go/no-go at **Nov 11, 18:00 SGT** (see Schedule).

## Goal

Run the application from a browser on the operator's own machine. The operations manager
types a request in a chat box, sees the company's files (policy and mandate), and moves the
run forward with buttons instead of terminal Enter presses. The page must make plain what
the project does: Claude proposes, the checker decides, a person confirms, and the PayPal
sandbox buyer approves.

Audience: the operator recording the video, and judges watching it.

## Approach: a web wrapper around `demo:flow`

The page drives the existing, CI-tested six-scene `demo:flow` as a child process. The
manager's message replaces the fixed request, and each Enter prompt becomes a button. The
checker, ledger, backend, shopper and PayPal code do not change.

Rejected for Nov 12:

- **One endpoint per command** (draft, confirm, shop, authorize, complete, run). A truer
  product, but new untested orchestration and roughly three times the work, and it drops the
  hostile-listing and recovery scenes unless rebuilt. Revisit after the hackathon.
- **Chat-styled read-only dashboard.** Safe, but the page could not run anything.
- **Web search for products instead of the two test stores.** It would let model-read web
  pages set prices the checker cannot verify, opens the shopper to uncontrolled prompt
  injection, contradicts `AGENTS.md` (no arbitrary URL fetch or browser for the shopper;
  connectors resolve configured endpoints), ends in a simulated order anyway, and removes
  the on-cue stale-records rejection in scene 5. Real suppliers through trusted catalog APIs
  stay in "What's next".

## Screen

### Layout (laptop)

```
┌───────────────────────────────────────────────────────────────────┐
│ Splittap     Shopper: Claude   Payment: PayPal sandbox   ● Waiting for you to confirm │
├──────────────┬──────────────────────────────────┬─────────────────┤
│ Company files│ Conversation                     │ Budget          │
│ Policy v1    │ You: "Five engineers start…"     │ committed / left│
│ Mandate r1   │ Claude's draft (Claude's words)  │ Operations      │
│  [stamp]     │ ── A store change ──             │ PayPal sandbox  │
│ Test stores  │ Checker: store-b refused …       │  ids            │
│              │ [ Confirm this mandate ]         │                 │
└──────────────┴──────────────────────────────────┴─────────────────┘
```

- **Status line, no banner.** It shows only facts a viewer cannot otherwise tell: the
  shopper (Claude or the scripted stand-in), payment (fake or PayPal sandbox), and what the
  run is waiting for. No tagline and no scene track.
- **Company files (left).** The policy file (`config/policies/hardware.example.json`) shown
  read-only in plain language: approved SKUs, unit price caps, warranty minimums, maximum
  units, evidence age limit, budget cap. The mandate once drafted: revision, digest,
  budget, deadlines, the draft's assumptions and what it could not capture, and its
  confirmation status. The two test stores, with the line "Two test suppliers we control, so
  the demo can show a rejection and a recovery on cue."
- **Conversation (centre).** A log of entries labelled by who produced them, not chat
  bubbles: **You** (the request), **Claude** (marked as Claude's words), **Checker**
  (accepted or refused, with its reason and its own priced total), **System** (scene
  changes and waits). Scenes appear as section breaks in the log. The single action button
  sits at the bottom and appears only while the run waits. A collapsible **Terminal** panel
  holds the raw child output.
- **Budget (right).** Committed, reserved and remaining from the ledger; operations with
  status; PayPal order, authorization and capture ids in sandbox mode; payment, supplier
  order and readiness as separate facts (readiness "not assessed").
- **Before a run.** The centre column explains the project in four lines following the
  decision chain, then the chat box prefilled with the demo request, the shopper choice
  (scripted or Claude) and the payment choice (fake or PayPal sandbox), and **Start run**.
- **Phone width.** Columns stack; Company files and Budget become two tabs.

### Visual direction

The vernacular of an office purchase requisition, not a chat app.

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#EEF1F4` | Page background, cool form grey |
| Ink | `#1C2633` | Text and rules |
| Stamp violet | `#4B3FA8` | Authority: confirmation stamp, primary action |
| Accepted | `#1F7A55` | Checker accepted, captured |
| Refused | `#B4372E` | Checker refused, failures |
| Waiting | `#B7791F` | Waiting for a person |

- **Type:** system stacks only (`"Avenir Next", "Segoe UI Variable", system-ui, sans-serif`);
  the demo must run offline, so no font downloads. Tabular figures for money. Monospace only
  for digests and PayPal ids, which people compare by eye.
- **The one bold element:** on confirmation a violet stamp lands on the mandate with the OS
  user name, digest prefix and time from the backend's confirmation record. It is the only
  motion not triggered by a click, and `prefers-reduced-motion` disables it.
- **Quality floor:** visible keyboard focus, every action reachable by keyboard, colour never
  the only signal (each status also has a word), dark mode via tokens.
- **Copy rules:** sentence case; buttons name what happens ("Start run", "Next scene",
  "Confirm this mandate", "Buyer has approved"); never call a reservation payment or a fake
  order real; label scripted runs and historical data as such.

## Architecture

```
Browser ──HTTP 127.0.0.1──► app server ──stdin "\n"──► demo:flow child ──► backend / shop / store
   ▲                           │                            │
   └──── state, polled 1 s ◄───┴── session.json, review files, existing read commands
```

### New command: `npm run app`

- New entry `apps/cli/src/app-server.ts` and static files in `apps/cli/src/app/`
  (`index.html`, `app.css`, `app.js`). Plain HTML/CSS/JS; no frontend dependencies.
- Serves on 127.0.0.1 only (default port 7171, `--port` to change), with the dashboard's
  Host check.
- Reads state through `dashboard-state.ts` (mandate, budget, operations, audit, stores),
  plus the take's `session.json` and `<runId>.review.json` files. The page computes no
  facts itself.
- The read-only dashboard, `DASHBOARD_READ_COMMANDS` and their tests are unchanged.

### HTTP surface

| Method and path | Body | Effect |
| --- | --- | --- |
| `GET /` and static files | — | The page, with a per-launch token embedded |
| `GET /api/state` | — | Current or last take: session, dashboard state, conversation entries, terminal lines |
| `GET /api/files` | — | Policy file contents (read-only) |
| `POST /api/run` | `{ request, shopper: "scripted" \| "claude", payment: "fake" \| "paypal-sandbox" }` | Starts one `demo:flow` child in a new folder `.runtime/app/take-<UTC time>` |
| `POST /api/continue` | `{ step: "next-scene" \| "operator-confirm" \| "sandbox-buyer" }` | Writes one `\n` to the child only if `session.waiting === step` |
| `POST /api/stop` | `{}` | Ends the child, only while it waits at a prompt |

- Every `POST` requires the launch token in a custom header and an `Origin` matching the
  server, so another site open in the browser cannot act. Bodies are JSON, capped at 8 KB,
  validated with a runtime schema; unknown fields are refused.
- One run at a time. A new folder for every run, so sandbox records are never cleared.
- The child is started with the same arguments a terminal user would type:
  `demo:flow --pause [--live] [--sandbox-paypal] --dir <take> --request-file <take>/request.txt`.

### Changes to `demo:flow` (Role B file)

1. **`--request-file FILE`.** Replaces the generated request text. 1–1,000 characters of
   text, otherwise the flow stops with a clear message before scene 1. Only meaningful with
   `--live`: the scripted stand-in's drafting calls are fixed to the demo request, so in
   scripted mode the page shows the demo request read-only, labelled "The scripted stand-in
   always uses this request. Choose Claude to use your own words."
2. **Wait again when the buyer has not approved.** Today a premature Enter at the
   sandbox-buyer step stops the flow (nothing is charged, but the hold needs a new run).
   Instead print the backend's message, "The sandbox buyer has not approved this hold yet",
   and wait for Enter again. Closed input still stops the flow. Applies in the terminal too.
3. **`approvalUrl` in `session.json`** while waiting for the buyer, so the page can show
   "Open PayPal approval page" (new tab). Only an `https://` link the backend returned.
4. **Pipe input.** `awaitEnter` reads fd 0 with `readSync` and handles `EAGAIN`, so pipe input
   should already work on Linux. Verify with a test before relying on it, and on Windows by
   hand (see Verification).

### Custom requests and the six scenes

The drafted mandate drives the later scenes, which are tuned to the demo request. A different
request may be refused by policy at drafting (shown with the policy's reason), or finish but
be marked "not usable for the video" (exit 2, reasons listed). The page states this next to
the chat box. This is correct behaviour, not an error to hide.

### Identity and authority

- The server runs as the operator's OS user, so `mandate-confirm` records the same person as
  from the terminal. The page shows the backend's confirmation record; it never asserts an
  identity itself. This is still a local operator check, not production sign-in.
- The server reads no `.env`. `demo:flow` and the backend load credentials as they do from
  the terminal; the shopper still refuses any `PAYPAL_*` variable; the child environment
  allowlist (`childEnvironment`) is unchanged.
- Only the operator's button runs `operation-run`; the shopper has no route to it. The PayPal
  buyer still approves on PayPal's hosted page.

## Errors

A failure never retries by itself, never hides, and never leaves a step half done without
saying so. Every take folder is kept.

| Situation | Behaviour |
| --- | --- |
| Request empty or over 1,000 characters | Inline message; nothing starts |
| A run is active | Start is replaced by the active run; a second start is refused (409) |
| Claude chosen, no `ANTHROPIC_API_KEY` | Flow stops before scene 2; page shows "Add ANTHROPIC_API_KEY to .env, then start again." |
| PayPal chosen, no sandbox credentials | Flow stops before scene 2, before any reservation; page shows the flow's instruction |
| Claude fails or hits a limit | Run ends; the flow's failure message verbatim, Terminal panel, "Start a new run" |
| Exit 2 | "Finished, but this take isn't usable for the video" with the listed reasons |
| Buyer not approved yet | The flow's message; the button stays; press again after approving |
| Stop pressed | Allowed only while waiting at a prompt. If a PayPal hold may exist, say so: it expires on its own; keep the folder for `status` and `operation-reconcile` |
| Tab closed or reloaded | The run continues; reopening reconnects |
| Server stops mid-run | Child input closes, so the flow stops at its next prompt (existing behaviour). Next launch shows the last take read-only as "Interrupted" |
| Port in use | `npm run app` exits naming the port and `--port` |

## Verification

All automated tests use `node:test`, run offline with the scripted shopper and fake or
mocked PayPal, and spend no model credit or sandbox calls.

- **`demo:flow`:** `--request-file` accepts valid text and rejects empty, oversized and
  missing files; a scripted fake-provider run driven by Enter through a pipe exits 0; a
  premature buyer Enter waits again instead of stopping (extending #24's offline sandbox
  tests); `approvalUrl` appears in `session.json`.
- **App server:** wrong Host, wrong Origin and missing or wrong token are refused with no
  side effect; Continue works only for the awaited step; a second Start and a Stop while a
  command runs are refused; reload reconnects to the same run.
- **End to end over HTTP:** a scripted fake-payment run driven by Continue ends with
  S$7,510.10 committed, S$489.90 remaining and readiness not assessed.
- **Page:** loads with no external URLs; all actions keyboard-reachable; screenshots at laptop
  and phone widths if a headless browser is available.
- **Unchanged checks:** `npm test`, `npm run typecheck`, `npm run demo`, scripted
  `npm run demo:flow`, and the shopper boundary test.
- **People (CI is stopped by GitHub billing):**
  1. Danny: one scripted fake-payment run in a browser on this machine.
  2. Pranav: the same on Windows, where the video is likely recorded and pipes behave
     differently.
  3. Danny or Pranav: one Claude plus PayPal sandbox run from the page (also freeze handoff
     step 2).

## Ownership and agreement

| File | Owner | Change |
| --- | --- | --- |
| `apps/cli/src/demo-flow.ts` and its tests | Role B (Pranav) | `--request-file`, buyer re-wait, `approvalUrl` |
| `apps/cli/src/app-server.ts`, `apps/cli/src/app/*` | Shared CLI, new | The server and page |
| `apps/cli/src/dashboard-state.ts` | Role B | Reused unchanged if possible; any export change is flagged |
| `package.json` | Shared | `app` script |
| `AGENTS.md`, `README.md`, `docs/project-scope.md`, `docs/demo-script.md`, `docs/submission.md` | Shared | Scope paragraph (both agree), new command, recording from the page, Design row |

Pranav agrees to: a local page with three fixed actions on 127.0.0.1 and no hosting; the
`demo-flow.ts` changes; reuse of `dashboard-state.ts`; and the `AGENTS.md` scope update.

## Schedule

| When (SGT) | What |
| --- | --- |
| Nov 10 | Spec and plan approved by Danny; Pranav agrees to scope |
| Nov 10 – midday Nov 11 | Build and automated tests |
| Nov 11 afternoon | Danny's browser check; Pranav's Windows check |
| **Nov 11, 18:00** | **Go:** the page joins the freeze revision and the video uses it. **No-go:** it stays on its branch; the video uses the terminal and read-only dashboard as planned |
| Nov 12 | Sandbox rehearsal from the page, then recording |

## Out of scope

Web search; editing policy or mandate in the page; more than one run; sign-in or hosting;
approvals and exceptions; resuming or choosing past takes; changes to the checker, ledger,
backend, shopper, contracts or PayPal gateway.
