# Durable ledger (M2 slice — authority + reservations)

The SQLite ledger behind the shared shopper contract is implemented for mandate
authority and atomic reservations. Storage: `schema.ts` (versioned migrations,
STRICT tables, immutability triggers) and `store.ts` (open/pragmas, canonical
JSON + SHA-256 identity helpers, row reads/writes, `runTransaction`). A legacy
database whose audit rows violate migration 2's mandate foreign key fails
closed on the row copy and stays stranded at version 1 when reopened;
recovery is manual data repair, never a silent drop.

- Connection facts: WAL, `synchronous=FULL`, `foreign_keys=ON`,
  `busy_timeout=5000`, migrations through version 2, one short synchronous
  `BEGIN IMMEDIATE` transaction per write with rollback; no awaits inside
  transactions; quotes are obtained outside the write transaction.
- Authority: `../authority.ts` stores immutable policy snapshots, mandate
  drafts (`MandateSchema` minus `approvedBy`/`confirmedAt`), review digests
  (SHA-256 over canonical `{policyDigest, mandateDraft}`) and idempotent
  confirmations. Confirmation verifies digest, policy narrowing, summed role
  quantities and `trustedNow < purchaseBy <= readyBy`; the permanent
  `exposure_started` flag refuses replacement revisions after the first
  reservation. Totals scope is the mandate identity across revisions:
  active reservations count as reserved, consumed as committed, released is
  ignored; refunds never replenish authority.
- Application: `../application.ts` dispatches the four strict v1 methods
  (`mandate.get`, `catalog.list`, `proposal.submit`, `operation.get`) with
  replay resolution (cart identity `(mandateId, cart.id)` and alias
  `(mandateId, idempotencyKey)`) before any supplier call and again inside the
  write transaction; failures are sanitized into the closed error codes.
- Tests: `tests/*.test.ts` use real child processes on a shared DB file with a
  start barrier (`tests/test-worker.ts`) and temporary databases outside the
  repository tree. Per-statement cleanup try/catch guards are applied only at
  the reviewed hot spots (the application harness and its evaluator cases, two
  authority tests); elsewhere a bare `finally` cleanup is an accepted
  inconsistency, not a claim that no cleanup step can fail.

Not implemented yet (no code may claim it): effect write paths (`effects`,
`worker_leases` tables exist but no worker claims/leases or gateway calls),
payment/order execution, PayPal integration through this ledger, readiness
assessment, production authentication, or any real spend. Statuses other than
`reserved` are stored-schema only until the execution unit lands.
