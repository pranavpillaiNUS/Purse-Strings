# Saved shopper reviews

This Role B checkpoint adds a local saved review for recording and later inspection.
It preserves the final normalized shopper review, including comparisons, backend
decisions, unknown outcomes and the ledger figures observed after that run. It does
not resume an interrupted worker or authenticate an audit record.

## Interface being implemented

- `shop run --review-out NEW.json` saves a completed command's review without
  changing its normal stdout or run exit code. This includes a command that only
  resends an earlier unresolved cart before stopping.
- `shop review --file FILE [--brief|--json]` validates and replays that file offline.
  It needs no model key, reads no backend and changes no purchasing state.
- Every replay identifies its capture time and historical status. It preserves
  recorded unknowns and separates estimates, reservations, payment, supplier order
  and readiness. It gives no execution or retry instructions from saved state;
  the operator uses `shop status` for current facts.

The version-1 envelope has `historical: true`, `savedAt`, and one of two kinds:
`saved-shop-review` with a normalized `RunReview`, or
`saved-shop-recovery-review` with the run/mandate IDs and resubmission results.
Strict runtime schemas bound strings and collections. Files are limited to 4 MiB.
Saved files contain no operator paths or raw prompts/tool-event trace. Model summary
text remains explicitly model-written data, displayed through the existing sanitizer.

## Output and authority

The CLI checks output destinations before starting model calls or resending carts.
Publication must not overwrite an existing file. A failure to save after shopping
must leave the original outcome, operation IDs, stdout JSON and exit code visible,
with a separate diagnostic on stderr. Saving a review cannot turn an unknown
submission into a safe failure.

These are editable local snapshots. Valid JSON, a schema version or a capture time
does not authenticate their contents. They never confirm a mandate, assign stock,
authorize payment, reconcile an unknown result or establish current ledger totals.
The backend ledger and its current read methods remain authoritative.

## Acceptance

1. Normal, rejected/recovered, unknown and mock runs round-trip with their meanings
   intact, including runs that only resend a pending cart.
2. Brief/JSON run output keeps its existing behavior; saved review detail is retained.
3. Replay requires no credentials, model call, backend request or journal mutation.
4. Invalid versions, malformed or oversized files fail before rendering; hostile
   terminal text stays inert.
5. Existing files and protected input/runtime paths cannot be overwritten. Late
   save failures preserve the shopper's outcome and operation information.
6. Boundary checks and the repository's offline tests, typecheck and demos pass.

All implementation stays in Role B's agent and CLI files. No checker, backend ACL,
shared contract or dashboard read-command changes are part of this checkpoint.
No M1–M5 gate is advanced. Durable stock assignment and account exercises remain
separate work with their existing ownership and operator requirements.
