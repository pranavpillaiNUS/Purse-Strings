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

- Execution: `../execution/{gateway,fake,worker}.ts` drive the durable
  simulated payment/supplier state machine on top of these tables. Effects
  (capture/order/refund) use immutable keys `operationId:kind`, intents are
  persisted before dispatch, every write asserts the `worker_leases` owner,
  generation and expiry inside its transaction, and fake providers live in a
  SEPARATE SQLite file (see `../execution/fake.ts`). The operator/RPC surface
  is `apps/cli/src/backend.ts` (mandate draft/review/confirm, operation
  run/reconcile, status, audit, strict stdin RPC).

Not implemented yet (no code may claim it): real money or supplier effects —
everything above is a labelled simulation over fake providers — readiness assessment,
production authentication, or any real spend. `ordered`/`compensated` are
fake-provider facts and never mean delivered or ready.

A unit-4 PayPal gateway contract now exists at `../paypal/gateway.ts` (sandbox-only,
fetch-mocked contract tests, documented in `docs/backend-api.md`). It is deliberately
NOT imported by the execution worker or this ledger: PayPal is still not wired into
the purchase path here, and nothing about a real PayPal account has been verified.
Wiring it as a provider behind the `ExecutionProvider` seam is future work.
