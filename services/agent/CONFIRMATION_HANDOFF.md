# Confirmation and stock: integration status

Mandate drafting here and operator confirmation in the checker both exist. They are
separate CLIs joined by a file handoff, and the shopper then works from whatever the
operator confirmed. Stock attestation and assignment are not implemented. No changes
to `packages/contracts/` have been made for this.

## Current review surface

The `mandate draft` / `mandate review` CLI slice produces a non-executable planning
artifact with an exact proposal, request and kit snapshots, policy digest and
creation time. The existing confirmed-mandate schema rejects both the artifact
and its bare proposal. A public content digest is only record identity: anyone
can recompute it. `draft_valid` never authorizes a purchase.

## From draft to shopping

`services/agent` must not import checker code, so the handoff is a file:

1. Run `mandate draft --proposal-out proposal.json` to save the proposal on its own, or
   `shop draft --proposal-out proposal.json` to have a model write the request first.
   The backend refuses the whole draft artifact.
2. Run `npm run backend -- --db PATH --config PATH mandate-draft --file proposal.json`.
   It stores a revision and prints the digest to confirm.
3. Run `mandate-review --id ID --revision N`, then
   `mandate-confirm --id ID --revision N --digest DIGEST`, with the same root options.
4. Run `npm run shop -- run --run-id ID --mandate-id ID --backend-db PATH --backend-config PATH`.
   The shopper reads the confirmed mandate and ledger totals through `mandate.get`, and
   stops before any model call if the mandate is unconfirmed.

`mandate-confirm` refuses the digest printed by `mandate review`. The planning digest
covers the request, kit, creation time and proposal. The backend digest covers only
the policy digest and proposal, so a confirmation does not bind the request or kit.

The backend is a simulation over fake providers, and its operator identity comes
from the OS user, which is not production authentication. See
[the ledger README](../checker/src/ledger/README.md) for its limits.

## Blocked on Windows

The backend CLI refuses its runtime directory after first use on Windows, because
`checkPrivateRuntimeDirectory` in `apps/cli/src/backend.ts` tests POSIX mode bits that
Windows does not report. This blocks the steps above on Windows, and 8 of the 12 tests
in `apps/cli/src/backend.test.ts` fail there, including on a clean `main`.

That code is Danny's, so it is unchanged here. Skipping only the mode check on `win32`
in a scratch copy made the full process walk in `apps/cli/src/shop.test.ts` pass, and
cleared 3 of those 8 tests. The other 5 need their own decisions (lines 336, 353, 379,
402 and 437 of the test file). That skip would leave a Windows runtime directory with
no owner-only check, so whether to accept it for a local prototype or to check ACLs is
also Danny's decision. The walk has not been run on Linux or macOS.

## Decisions for Pranav and Danny

| Seam | Status | Remaining decision |
| --- | --- | --- |
| Shared draft | Agent and checker each have their own draft schema and digest | Keep the proposal file handoff, or agree shared schemas and one digest in `packages/contracts/`. Keep draft and confirmed states distinct; model output must never supply authoritative confirmation metadata. |
| Confirmation | Backend checks the exact digest and policy, and records OS-derived identity and trusted time | Decide whether the confirmed digest must also bind the kit revision and request. Caller-provided `approvedBy` is not identity. |
| Model assumptions | `shop draft` and `mandate review` show what a model assumed and could not capture. The backend's `mandate-review` and confirmation digest do not cover them, so someone confirming from the backend alone would not see them | Decide whether the backend should show them before confirmation, which would change what it stores. |
| Revision | Backend refuses changed content under an existing version, and replacement revisions after the first reservation | Agree who allocates revision numbers. |
| Stock attestation | Not implemented | Record a unique unit ID, exact vetted SKU, serviceability/compatibility, location and readiness evidence, attestor and observation time. Unknown or stale mandatory facts cannot reduce purchasing needs automatically. |
| Stock assignment | Not implemented | The storage owner atomically binds a unit to one active request/revision. Competing requests and restart must not assign it twice. A supplied stock list, preview or JSON file cannot prove this. |
| Requirement accounting | Ledger tracks reserved and committed units, and the shopper subtracts them; stock-adjusted need is not implemented | Agree how total equipment need, confirmed stock assignments and remaining purchase quantities are represented. Keep prior purchases and active reservations visible; a future refund must not silently restore purchasing authority. |
| Listing text | The strict catalog contract has no description field, so the hostile listing lives in an evidence `source` string (200 characters at most) | Decide whether to add an optional listing description to the shared catalog. It would make the demo listing more realistic and needs agreement from both people. |
| Executor handoff | Backend executes against fake providers only | When real providers connect, the executor must still load confirmed mandate, policy, assignments, quote and ledger state independently. It never accepts an agent-supplied confirmation identity, authoritative quote or budget snapshot. |

## Next milestone exit evidence

1. An unconfirmed or superseded draft cannot reach execution through the CLI.
2. Policy/kit edits after review require re-review; a confirmation binds the exact
   approved content and cannot be transplanted to another request or revision.
3. Five hires with two serviceable, compatible and durably assigned spare laptops
   leave three laptops to buy; monitors still follow the kit requirements.
4. Concurrent attempts to assign the same spare to two active requests yield only
   one assignment, and restart preserves it, using real storage tests.
5. JSON containing a made-up actor or assignment is rejected as authority.

Danny owns checker/ledger/authority integration; Pranav owns planning and shopper
behavior. Both must agree before editing shared contracts. Point 1 is tested for the
shopper, but no gate is recorded as passed.
