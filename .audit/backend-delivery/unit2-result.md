# Unit 2 result: trusted authority and SQLite atomic reservations

Date: 2026-11-04. Branch: `work/backend-contract-client`, uncommitted. Scope governed by
`.audit/backend-delivery/unit2.md`, `.audit/backend-delivery/design.md` (lines 31-176,
review resolutions binding), and repo `AGENTS.md`.

## Delivered

Trusted local mandate authority and real SQLite atomic reservations behind the shared
shopper contract. Offline only; no external execution.

| File | Content |
| --- | --- |
| `services/checker/src/authority.ts` | Drafts (Mandate minus approvedBy/confirmedAt), canonical digests, idempotent confirmations, policy narrowing, trusted clock, exposure gate |
| `services/checker/src/ledger/schema.ts` | Schema v2: STRICT tables, bounds, CHECK enums, FKs, immutability triggers, versioned migrations with the audit-table rebuild in MIGRATION_2, `AUDIT_IMMUTABILITY_TRIGGERS` shared constant |
| `services/checker/src/ledger/store.ts` | Connection pragmas (foreign_keys, WAL, synchronous FULL, busy_timeout 5000), canonical JSON + SHA-256, synchronous `runTransaction` (BEGIN IMMEDIATE, nesting/async misuse rejected), identity resolution, totals, reservations, alias binding |
| `services/checker/src/application.ts` | Strict four-method dispatcher (mandate.get, catalog.list, proposal.submit, operation.get); replay resolved before any supplier/authority work and rechecked in-transaction; fresh quote outside the transaction; atomic operation+reservation+lines+alias+audit insert; sanitized closed-code envelopes; type-level exhaustive replay resolution |
| `services/checker/src/ledger/tests/{store,authority,concurrency,application}.test.ts` | 91 tests total across the repo (was 44) |
| `services/checker/src/ledger/tests/{fixtures,test-worker}.ts` | Disclosed helpers: shared fixtures with temp-dir hygiene; child-process driver (submit with start barrier, verify as a fresh process) |
| `services/checker/src/ledger/README.md` | Seam doc reflecting implemented truth incl. fail-closed migration stranding note |
| `.gitignore` | Runtime DB directories/artifacts ignored |

Key enforced invariants: permanent cart identity `(mandateId, cart.id)` plus immutable
`(mandateId, idempotencyKey)` aliases resolving to exactly one operation; one short
transaction rechecks both identities, reloads authority/totals, and reserves money and
units atomically; `exposure_started` permanent (trigger-enforced); reservations money
immutable (trigger-enforced); released authority ignored in totals; refund never
replenishes; timestamps only from the injected clock; no shopper-supplied authority.

## Checks (run at delegation and again at orchestrator level)

- `npm test`: 91/91 pass, 0 fail (baseline 44 before this unit).
- `npm run typecheck`: clean.
- `npm run demo`: exit 0.
- `git diff --check`: clean.
- Concurrency test file standalone: 10/10 across repeated runs (multiprocess races stable).

## Review record (EGM goldfish, five-round cap reached)

Rounds R1-R5; each round three fresh-context read-only lenses over disjoint files
(LEDGER storage/authority, WIRE contract/sanitization, RACE/persistence evidence);
reviewers never repaired; OpenCode applied accepted repairs.

- R1: FAIL. Majors: operator writes outside transactions (LEDGER-R1-001); evaluator
  priority by array order not design ranking (WIRE-R1-001); mandated conflicting-payload
  barrier race missing (RACE-R1-001). 9 accepted minors fixed.
- R2: LEDGER FAIL / WIRE PASS / RACE PASS. Major: repairs had been edited into the
  already-applied MIGRATION_1, silently skipping older DBs (LEDGER-R2-001) — restored
  MIGRATION_1 and shipped MIGRATION_2 (audit_events rebuild with both FKs, trigger
  recreation, immutability additions). 5 minors/observations fixed.
- R3: PASS all lenses. 6 accepted findings fixed (shared audit-trigger constant,
  operation-linked upgrade-fidelity row, exhaustive replay via discriminated union,
  divergent-identity assertion, close-in-finally, dynamic migration version injection).
- R4: PASS all lenses. 8 accepted findings fixed (README version accuracy, stranded-v1
  fail-closed test, comment fidelity, divergent alias binding assert, cleanup chains
  hardened, both-quotes-asserted before racing).
- R5: PASS all lenses, zero Blockers/Majors. Carried-forward residuals below.

Carried-forward residuals (open, dispositioned, not auto-accepted):

- LEDGER-R5-001 (Minor): concurrent first-open of a fresh DB can surface a raw
  duplicate-table error on migration 1. Direction: treat table-exISTS as re-read or document retry.
- LEDGER-R5-002 (Minor): `insertReservationOperation` raises raw UNIQUE instead of typed
  `LedgerIdentityConflict` (defense-in-depth; application rechecks in-transaction).
- LEDGER-R5-003 (Minor): doc comment typo "never a update".
- WIRE-R5-001 (Minor): transactional replay conflict falls back to INTERNAL_ERROR;
  consider IDEMPOTENCY_CONFLICT parity.
- WIRE-R5-002 (Minor): correlation requestId bound hand-copied, not derived from
  `MandateSchema.shape.id`.
- RACE-R5-001 (Minor): no dispatcher-level test for cart-prebound-under-alias-resolved-elsewhere conflict.
- RACE-R5-002 (Minor): whether replays append audit rows is unsettled; exact-count
  assertion should follow the Unit 3 decision.
- RACE-R5-003 (Minor): cleanup try/catch swallows teardown errors silently; consider verbose-mode surfacing.
- RACE-R5-004 (Minor): a few `assert.throws` lack `/CHECK/` message pins.

## Brief corrections and disclosures

- The orchestrator's delegate brief said "six-method dispatcher" by mistake;
  `packages/contracts/src/backend.ts` defines four methods. The contract's four were
  implemented. No `packages/contracts` edits were needed at any round.
- MIGRATION_1 was edited in place briefly during the first fix pass and corrected to the
  versioned MIGRATION_2 approach in the second; only gitignored temp DBs existed in
  between. No committed database was ever affected.
- `tests/fixtures.ts` and `tests/test-worker.ts` are disclosed helpers within the
  allowed components.

## Limitations (no capability claimed beyond tests)

- No execution of any kind: `effects` and `worker_leases` tables exist with zero write
  paths; only `status='reserved'` operations are created. Unit 3 owns execution,
  workers, and CLI.
- Consumed/released transitions are proven at SQL/totals level; the state machine that
  sets them is Unit 3.
- Money-and-quantity race evidence comes from real child processes on one SQLite file
  with a start barrier; `BUSY` after a full 5s lock window is mapped but untested.
- Operator identity is an explicit `approvedBy` argument at the authority API; OS-user
  stamping arrives with the Unit 3 CLI boundary.
- Nothing financial, supplier, or PayPal-related is proven beyond reservation arithmetic.

## Suggested next steps

1. Commit Unit 2 (agent deliberately did not commit; timing is the owner's call).
2. Unit 3 per design (durable fake execution, crashes, reconciliation) — resolve
   RACE-R5-002's replay-audit policy as part of it.
