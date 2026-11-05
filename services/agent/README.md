# Mandate planning and the planned bounded shopper

## Delivered planning slice

`src/mandate.ts` deterministically turns a structured hire request and versioned kit
template into a policy-constrained draft. No model integration is implemented yet.
All input is runtime-validated. Supplier lists, exact role SKUs, per-item price caps,
warranty minimums, total budget and aggregate role quantities must stay within the
supplied policy. Templates can narrow limits; attempted relaxations fail rather
than being silently clamped. Purchase must be on or before readiness, and the
purchase deadline must not have passed at the explicit offline clock.

The sample request needs five laptops and five monitors. The template and request
in `fixtures/` and the default company policy are synthetic. No stock is subtracted:
proposed reuse is not an assignment. Per-request quantity checks do not prevent
double allocation or over-purchasing across requests.

From the repository root:

```powershell
npm.cmd run --silent cli -- mandate draft --request services/agent/fixtures/hire-request.json --now 2026-11-04T09:00:00Z --json | Set-Content -Encoding utf8 services/agent/state/draft.json
npm.cmd run cli -- mandate review --draft services/agent/state/draft.json --now 2026-11-04T09:00:00Z
```

Use `--policy` and `--kit` with either command for other local planning files, or
`--request -` / `--draft -` for UTF-8 stdin. UTF-8 BOMs are supported. Working
artifacts under `state/` are ignored in Git. The commands do not write input files;
the example explicitly saves stdout. `--json` emits one artifact or review result;
errors go to stderr. `draft` exits 0 on creation and 1 on invalid input. `review`
exits 0 for `draft_valid`, 2 for `needs_revision` and 1 for invalid input.

Drafts retain the request and kit snapshots, policy content digest, revisions and
creation time. Digests use SHA-256 over JSON with recursively sorted object keys
and original array order. They identify content and are neither signatures nor
approval evidence, and they differ from the digest the backend confirms. Review compares the current policy and kit against the draft,
re-derives the proposal, and checks its digest and deadlines. A changed template or
policy requires a new draft, including edits under an unchanged version number.

`draft_valid` means only that the supplied planning records are consistent. It is
not cart eligibility, affordability, verified evidence, stock assignment, human
confirmation or payment permission. No trusted source identity is established by
passing a file path. Drafts omit `approvedBy` and `confirmedAt` and cannot satisfy
the existing confirmed `MandateSchema`; the CLI `check` command rejects them.

The planning schemas live only in this service. They are experimental inputs and
artifacts, not additions to `packages/contracts/`. See
[the confirmation and stock handoff](CONFIRMATION_HANDOFF.md) before connecting them
to execution. M1 is still incomplete.

## Planned shopper (M4)

First prove authority and the ledger. Later expose only catalog search, product
view, cart building and price-free cart submission tools to a separate worker.
Model output remains a draft until human confirmation. There are no payment
credentials, payment tools, policy writes, shell tools or arbitrary URL fetching
in this service. Bound future tool calls and model spend. Keep hostile catalog
prose as data. The trusted executor loads quotes and ledger state independently.
See `AGENTS.md`.
