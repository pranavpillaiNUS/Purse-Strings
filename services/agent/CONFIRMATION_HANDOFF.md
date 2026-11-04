# Confirmation and stock: proposed next integration

This is a review proposal, not an implemented authority system or an agreed shared
contract. No changes to `packages/contracts/` have been made.

## Current review surface

The `mandate draft` / `mandate review` CLI slice produces a non-executable planning
artifact with an exact proposal, request and kit snapshots, policy digest and
creation time. The existing confirmed-mandate schema rejects both the artifact
and its bare proposal. A public content digest is only record identity: anyone
can recompute it. `draft_valid` never authorizes a purchase.

## Decisions for Pranav and Danny

| Seam | Proposed requirement |
| --- | --- |
| Shared draft | Agree which agent-local request, kit and draft fields should become shared schemas. Keep draft and confirmed states distinct; model output must never supply authoritative confirmation metadata. |
| Confirmation | A trusted local operator explicitly confirms an exact draft digest/revision, policy identity/content and kit revision. The trusted process loads current records, rechecks policy and records actor and trusted confirmation time. Caller-provided `approvedBy` is not identity. |
| Revision | Any material edit creates a new revision requiring review and confirmation. Agree monotonic revision allocation and stale-confirmation rejection in trusted storage. |
| Stock attestation | Record a unique unit ID, exact vetted SKU, serviceability/compatibility, location and readiness evidence, attestor and observation time. Unknown or stale mandatory facts cannot reduce purchasing needs automatically. |
| Stock assignment | The storage owner atomically binds a unit to one active request/revision. Competing requests and restart must not assign it twice. A supplied stock list, preview or JSON file cannot prove this. |
| Requirement accounting | Agree how total equipment need, confirmed stock assignments and remaining purchase quantities are represented. Keep prior purchases and active reservations visible; a future refund must not silently restore purchasing authority. |
| Executor handoff | The executor loads confirmed mandate, policy, assignments, quote and ledger state independently. It never accepts an agent-supplied confirmation identity, authoritative quote or budget snapshot. |

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
behavior. Both must agree before editing shared contracts. These are not gates
proved by the current draft/review implementation.
