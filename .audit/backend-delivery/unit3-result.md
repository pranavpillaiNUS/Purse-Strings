# Unit 3 result: durable simulated execution and the backend operator/RPC CLI

Date: 2026-11-05. Branch: `unit3-durable-execution` (based on merged `origin/main`
74366c0), uncommitted. Scope governed by `.audit/backend-delivery/unit3.md`,
`.audit/backend-delivery/design.md` (lines 47-55 lease/provider behavior,
138-144 CLI contract, 146-158 review resolutions binding), and repo `AGENTS.md`.

## Delivered

Durable simulated payment/supplier execution with real process-crash restart
recovery, plus a separate strict operator/RPC CLI. Offline only; fake providers
over their own SQLite file; nothing financial is real.

| File | Content |
| --- | --- |
| `services/checker/src/execution/gateway.ts` | `ExecutionProvider` seam (apply/lookup), stable `effectKey(operationId, kind)`, 10 s simulated call budget constant |
| `services/checker/src/execution/fake.ts` | Separate persistent provider SQLite (`provider_effects`, STRICT, own versioned migration + transactional re-check for concurrent openers); commit-before-response ordering; test-only scenarios (`crashAfterCommit`, `crashBeforeCommit`, `responseLossFor`, `rejectFor`) emit parent `CRASHPOINT` signals; key+digest conflict surfaces as unknown |
| `services/checker/src/execution/worker.ts` | Durable worker: lease claim (unowned/expired only, fresh UUID owner, generation increment, 30 s TTL), every write lease-asserted inside one BEGIN IMMEDIATE transaction, renew-before-provider-work, capture gate (fresh quote outside any transaction, exact commercial-terms comparison, totals excluding own reservation, evaluator must be currently eligible), full state machine (capture→order→refund; consumed/released; reconciliation retention on absence; same-key retry after renewed eligibility only; refund never restores authority; terminal passthrough), sanitized BUSY/not_found results, ownership released after each bounded run (generation retained) |
| `services/checker/src/execution/test-worker.ts` | Disclosed child-process driver (READY/GO barrier, config JSON on stdin, one result JSON line; crash scenarios hold the process open for SIGKILL) |
| `services/checker/src/execution/worker.test.ts` | 13 tests incl. mandatory child-process SIGKILL evidence after capture/order commits (recovered in fresh processes, mandate expired past capture still consumes and orders), 3-way worker race at a start barrier, lapsed-lease fencing (stale generation renew/commit rejected), gate failures (expired purchaseBy, changed quote terms, stale evidence, unconfigured supplier; own-reservation exclusion proven), unknown/absence/definitive-rejection semantics, persisted-intent safe-fail, refund/entitlement |
| `apps/cli/src/backend.ts` | Strict operator CLI: `--db`/`--config` required; mandate-draft/review/confirm; operation-run/reconcile; status; audit; rpc (≤1 MiB, exactly one JSON response line, sanitized envelopes); closed flag sets (duplicates, unknown, inappropriate, `--now` all exit 2); strict config schema with identical-duplicate/conflicting-identity rules and per-invocation reload; 1 MiB source-file bound; operator identity `os.userInfo()`; owner-only runtime dirs (create 0700, refuse and never chmod unsafe); distinct-file/symlink+inode alias rejection; exit codes 0/2/1 |
| `apps/cli/src/backend.test.ts` | 6 tests over entirely fresh child processes (full walkthrough with one clean JSON stdout line each; refusals; rpc constraints; unsafe-dir refusal preserved; alias refusals) |
| `package.json` | `backend` script only |
| `services/checker/src/ledger/store.ts` | Narrowly necessary Unit-2 integration: optional `excludeOperationId` on `loadMandateTotals`; execution helpers (`loadLeaseRow`, `claimLeaseRow`, `assertLeaseHeld`, `renewLeaseRow`, `releaseLeaseOwnerRow`, `loadEffectRowByKind`, `insertEffectIntentRow`, `setEffectStateRow`, `updateOperationStatusRow`, `consumeReservationRow`, `releaseReservationRow`, `LeaseLost`, `EffectKind`) |
| `services/checker/src/application.ts` | `buildWireOperation` exported (unchanged shape) for uniform wire-operation views in worker and CLI |
| `services/checker/src/ledger/README.md` | Seam doc updated: execution surfaces documented; "not implemented yet" corrected |

## Checks

- `npm test`: 110/110 pass, 0 fail (was 91 after unit 2; +12 worker tests, +6 CLI tests, counting baseline drift).
- `npm run typecheck`: clean.
- `npm run demo`: exit 0.
- `git diff --check`: clean.
- Executable CLI walkthrough through fresh processes (verbatim transcript in the
  executor session report): draft → confirm-wrong-digest (exit 2) → confirm
  (0) → rpc submit (0, reserved, total 119791) → status (0) → operation-run
  (0, ordered, payment/order succeeded, reservation consumed, readiness
  not_assessed) → reconcile (0, terminal passthrough) → audit (0, three
  domain events) → `--now` refused (2) → trailing-JSON rpc refused (2, one
  JSON error line). DB files 0600 (`app.db`, `providers.db`), runtime dir 0700.

## Honest boundaries

- Nothing financial is real: all payment/supplier facts are the labelled fake
  provider simulation; `ordered`/`compensated` never imply delivered/ready.
- No `not found… provider row absent plus unknown` release shortcut beyond the
  resolved contract; a suspended old worker's absence cannot release (tested).
- "Invalid authority" at the gate is exercised via the unconfigured-supplier and
  unreadable-stored-state paths; row deletion is blocked by immutability
  triggers, so no direct authority-removal case exists.
- The 10 s provider timeout remains a seam constant; the deterministic fake
  completes instantly and crash tests explicitly disable the race (no sleeps).
- Same-OS-user hostile processes remain outside the local trust model; no
  production isolation claim.

## Goldfish review round 1 (2026-11-05)

Accepted findings applied as a bounded repair, exactly as written in the review
record; no commit, no new dependencies. Checks after the round: `npm test`
119/119 pass (110 baseline + 9 new tests), `npm run typecheck` clean,
`npm run demo` exit 0, `git diff --check` clean; the crash/fencing suite
(`services/checker/src/execution/worker.test.ts`, 19 tests) re-ran standalone
twice with 0 failures both times.

Pre-existing flake disclosed (out of the accepted set, untouched by this
repair): the unit-2 `services/checker/src/ledger/tests/concurrency.test.ts`
races occasionally flake under full-suite parallel process load ("competing
quantity requests cap the summed requirement units" and "concurrent identical
key and cart yields exactly one operation"). Evidence: stable standalone 5/5
runs; the same flake reproduced twice in the committed 91-test base suite with
all unit 3 work stashed away; it resolves to pass on every immediate re-run. No
test or schema change here touches those files, so this belongs to unit 2's
review lane.

### Majors

- EXEC-R1-001 → `services/checker/src/execution/worker.ts:299-304`: `renewLease`
  now reads the trusted clock fresh on every lease-wrap and writes
  `freshNowMs + TTL` (the `underLease` assert at :291 already read fresh, but the
  renewal wrote `expires_at_ms = claimNow + 30s`, making later renewals no-ops).
  New test at `worker.test.ts` ("a long run renews its lease on a fresh clock")
  advances the simulated clock 20 s per provider dispatch through a wrapping
  `ExecutionProvider`, and asserts the run completes `ordered` without
  `LeaseLost` while `worker_leases.expires_at_ms` grows past claim-time + 30 s
  (it becomes claim + 50 s across two renewals).
- RECOVERY-R1-001 → new test at `worker.test.ts` ("an active version pointing at
  an unconfirmed revision fails the capture gate as invalid authority"). The
  reachable state uses legitimate store-level calls only: the same fixture
  mandate gets a second revision via `draftMandateRevision` (never confirmed)
  and `activateMandateRevision` points `mandates.active_version` at it, so
  `loadMandateAuthority` returns a revision with `confirmation === null`.
  Confirmations stay immutable and no trigger or schema constraint was changed.
  The gate refuses the first mutation: operation `failed`, reservation
  `released`, provider DB still empty.
- RECOVERY-R1-002 → new test at `apps/cli/src/backend.test.ts` ("fresh runtime
  state and database files are owner-only at first use"): after a real CLI
  `mandate-draft` the created runtime state directory stats 0o700 and the
  application DB 0o600; the first `operation-run` creates the provider DB, which
  stats 0o600.
- CLI-R1-001 → `apps/cli/src/backend.ts:300-312`: new `snapshotParser` wraps the
  policy and catalog schema parses in `loadSnapshotSet` calls with a sanitized
  `CliError`, so a schema-invalid snapshot exits 2 instead of an unclassified
  exit 1. The draft-file path was audited and has no matching hole (draft
  content is validated with `safeParse` inside `draftMandateRevision`, already
  surfacing as `AuthorityFailure` exit 2). New backend test ("a schema-invalid
  policy snapshot is operator validation").

### Minors

- EXEC-R1-002 → `worker.ts:105-119` extracts the bounded-call budget into a
  generic `callBounded`, the provider seam uses it (`worker.ts:393`), and the
  supplier quote fetch in the capture gate is routed through the same budget
  (`worker.ts:215`, bound threaded in via the new `callTimeoutMs` gate parameter
  at :177, set from the existing `providerTimeoutMs`). A supplier timeout fails
  the gate on the pre-existing supplier-unavailable path before any mutation,
  covered by a new test ("an unresponsive supplier quotation is bounded").
- EXEC-R1-003 → `services/checker/src/ledger/store.ts:625-628`: the banner
  comment now claims the in-transaction rule only for mutating helpers and notes
  that read helpers legitimately run outside transactions.
- EXEC-R1-004 → `store.ts`: the duplicated banner at the old :629 was deleted.
- EXEC-R1-005 → `worker.ts:490-495`: the same-key retry-after-absence success
  path now sets the operation status with
  `succeeded ? 'running' : 'failed'`, matching the recovery path at
  `worker.ts:462-463`.
- RECOVERY-R1-003 → `apps/cli/src/backend.test.ts` (rpc constraints test): added
  a well-formed single JSON value over 1 MiB (padding field) that still hits the
  byte bound with an `INVALID_REQUEST` envelope, distinct from the kept
  unterminated-JSON parse case.
- RECOVERY-R1-004 → new backend test ("an uncategorized internal failure exits
  1"): `--db` naming an existing directory makes `openLedgerStore` throw outside
  all diagnostic families; exit 1, empty stdout, generic sanitized message.
- RECOVERY-R1-005 → new `worker.test.ts` gateway-level test ("the fake provider
  surfaces a same-key different-digest apply as unknown"): a changed request
  digest on a known key returns `{outcome: 'unknown'}`, `lookupEffect` still
  returns the original row unchanged, and `countProviderRows` stays 1.
- RECOVERY-R1-006 → new `worker.test.ts` test ("a full run over a persisted
  ambiguous capture at lapsed eligibility retains authority for
  reconciliation"): crash-before-commit leaves the capture in_flight with an
  empty provider DB; a full run (not reconcile) at the expired clock asserts
  `reconciliation_required` retained, reservation active, no order/refund
  dispatch, provider rows still 0.

### Observations recorded, deliberately no code change

- EXEC-R1-006: reconcile never dispatches a never-started order; two-run
  convergence is observable from the existing unknown-capture suite.
- EXEC-R1-007: supplier adapter errors collapse into one gate reason.
- CLI-R1-004: `--help` mid-command is swallowed (treated as a flag value); the
  flag-value error message surfaces instead.
- CLI-R1-005: stored audit details are trusted at read time; a write-time
  schema is future hardening.
- CLI-R1-006: convention documented here rather than in docs: a command exit 0
  means the command ran; the operation's business outcome lives in its status
  field.
- CLI-R1-007: an existing DB file with broad permissions is accepted (only the
  runtime directory is checked).
- RECOVERY-R1-008/-009/-010: stale-fencing via parent-process store calls is
  adequate evidence; internal-table assertions in tests are acceptable; the
  vacuous killedAt disjunct in `runExecutionChild` was left alone (not trivial
  enough to remove under the accepted-set discipline, zero behavior effect).

### Deviations

- One editable-line slip during editing (a blank line in `worker.ts` and the
  `settle` declaration in `worker.test.ts`) was caught by typecheck and restored
  byte-identical; the final files contain no diff beyond the findings above.

## Goldfish review round 2 (2026-11-05)

Round-2 findings applied as the specified bounded repairs, exactly as written;
no commit, no new dependencies, all pre-existing behavior preserved outside the
finding set.

### Majors

- CLI-R2-001 → `apps/cli/src/backend.ts:140-142`: empty and whitespace-only flag
  VALUES are rejected for every flag in `parseArgv` with a sanitized usage
  `CliError` (exit 2) before any path resolution, so `--db ''` cannot resolve to
  the ambient CWD. New cases in the refusals test:
  `--db ''`, `--config ''` and whitespace-only `--id` all exit 2 with empty
  stdout (`backend.test.ts`, refusals case list).
- CLI-R2-002 → `apps/cli/src/backend.ts:270-283`: the `'local-operator'` fallback
  is deleted. `operatorIdentity()` throws a sanitized `CliError` (exit 2) when
  `userInfo()` fails or the username is empty, so confirmation metadata is never
  written from a fabricated identity. Evidence path disclosed: direct unit-level
  simulation is impossible (backend.ts is an executable entry module running
  `main()` at import, and a real process cannot remove its OS identity), so the
  contract is machine-checked by a source-inspection test
  (`backend.test.ts:442`, asserts no fallback constant, identity refusal throw,
  and exactly one return of the real username) plus the walkthrough
  `approvedBy === userInfo()` assertion. Code inspection was additionally
  performed by the executor: `grep -n 'local-operator'` on backend.ts returns
  nothing and the helper's only failure paths throw.
- RECOVERY-R2-001 → the well-formed oversize rpc case now pins the
  oversize-specific message `'The RPC request exceeds the 1 MiB input limit'`
  (`backend.test.ts:263`), which only the byte-bound path in
  `backend.ts:398-417` can emit, so deleting the bound turns the assertion red
  even though the envelope code is identical. A passing-side witness was added:
  a well-formed schema-valid `proposal.submit` is accepted with exit 0
  (`backend.test.ts:272-296`), after draft + confirm over fresh processes. The
  existing malformed-JSON oversize case is kept.

### Minors

- EXEC-R2-001 → `worker.ts:114-125` adds the bounded `lookupProvider` helper
  (timeout and transport failure map to `{ outcome: 'unknown' }`), and all three
  lookup sites route through it (`worker.ts:484, 618, 687`; capture, order and
  refund). An unbounded lookup could never produce a premature timeout crash;
  timeouts now degrade to the existing ambiguous-reconciliation branches.
- EXEC-R2-002 → `worker.ts:181-194` samples a FRESH `trustedClock()` inside
  `validateCaptureGate` (new `gateClock` parameter) and threads the gate-time
  value into `quoteCart` (`worker.ts:230`) and `evaluatePurchase`'s `now`
  (`worker.ts:262`); call sites pass `trustedClock` (`worker.ts:510, 551`).
  Claim-time semantics remain for lease math (`underLease`, `renewLease`,
  `markInFlight`). Behavior-preserving for all fixed-clock tests because a
  static clock returns the same sample.
- EXEC-R2-003 → `worker.ts:119-121`: the losing `call` promise receives a no-op
  rejection observer inside the timeout callback before the race rejects, so a
  late rejection cannot crash the worker after the race resolved.
- EXEC-R2-005 → `worker.ts:454-469`: the capture-succeeded branch now guards on
  the prior reservation state (`reservation.state === 'active'`); only the first
  capture-to-consumed transition appends `capture_succeeded`, so
  `compensation_pending` replays stop duplicating the event. Consumption, status
  and event behavior are identical on first occurrence. Evidence: new worker
  test (`worker.test.ts:1060`, order rejected + refund response lost → status
  `compensation_pending`; a replay asserts exactly one `capture_succeeded` row
  afterwards).
- CLI-R2-003 → `backend.ts:222-252` splits the directory ensure into a
  pre-flight `checkPrivateRuntimeDirectory` (refuses invalid, foreign-owned or
  permission-open directories) and `createPrivateRuntimeDirectory`
  (mkdir 0700 only if missing). `handleCommand` (`backend.ts:489-492`) runs both
  checks for BOTH directories before any creation, so a refusal leaks no empty
  0700 provider runtime directory.
- test-worker.ts stray comment ('budget enforcement happens off the seam')
  deleted; the worker enforces the budget on the seam via `callBounded`.

### Observations recorded, deliberately no code change

- EXEC-R2-004 (advancing-clock quality analysis): recorded as analysis. The one
  advancing-clock test proves lease renewal against 20 s-per-dispatch drift, not
  gate-time re-evaluation; after EXEC-R2-002 the gate also samples gate-time, but
  no test advances the clock across a gate-to-dispatch interval yet. The
  existing fixed-clock suite cannot distinguish claim-time from gate-time
  sampling; noted as accepted residual, no change made under the accepted-set
  discipline.
- RECOVERY-R2-002: skipped per the finding's own condition — `ExecutionResult`
  (`worker.ts:92-96`) is a named-result union with no reason-code field, so
  there is nothing to pin; gate failure reasons remain recorded in audit events.
- RECOVERY-R2-003: provider DB creation-order coupling noted; both directories
  are now pre-flighted (CLI-R2-003), and no further coupling change was made.
- RECOVERY-R2-004: the `killedAt` disjunct in `runExecutionChild` (worker
  crash-evidence plumbing) noted; left alone as in round 1.
- The concurrency hang guard's single-line change is intentional and proven by
  three consecutive green full suites on this repair (plus the standalone runs
  recorded below).

### Deviations

- RECOVERY-R2-001 (2): the passing-side witness cannot sit literally "a few
  bytes under the bound". The strict request schemas (`ProposalSubmitRequestSchema`
  and friends) reject padding fields, and every identifier is capped at 200
  characters, so the largest schema-valid request is ~650 bytes; the test
  asserts `underBoundRequest.length < 1_048_576` and is documented as the
  closest a legal request reaches the bound.
- RECOVERY-R2-001 tail ("keeping the current int-size undersized cases"): no
  int-size undersized cases exist in `backend.test.ts` (verified by search).
  Treated as "keep the existing cases"; the malformed-JSON oversize and
  well-formed oversize cases are both preserved unchanged.
- The `--id '   '` whitespace-value case was added beyond the two requested
  cases to exercise the whitespace-half of CLI-R2-001 (zero behavior change);
  and the EXEC-R2-005 worker test was added as finding evidence, both inside
  the allowed file set.
- No other deviations: no file outside the allowed set was modified; the
  pre-existing unit-3 tracked modifications (`package.json`, `application.ts`,
  `ledger/*`) are untouched by this round.

### Checks

- `npm test`: 121/121 pass, 0 fail (round 1 ended at 119; +1 identity test,
  +1 replay-audit test, counting within the same test count).
- `npm run typecheck`: clean.
- `npm run demo`: exit 0.
- `git diff --check`: clean.
- Crash/fencing suite (`services/checker/src/execution/worker.test.ts`, now 20
  tests) standalone twice: 20/20 pass both times.
- Backend suite standalone: `apps/cli/src/backend.test.ts` 10/10 pass.

## Goldfish review round 3 (2026-11-05)

Final round-3 residuals applied as the specified bounded repairs, exactly as
written; no commit, no new dependencies (worker.ts touched comment-only).
`worker.ts` line numbering is unchanged, so the round-1/round-2 citations above
remain current; `backend.ts` grew by +9 lines, so round-1/round-2 `backend.ts`
citations below shift by +9 after this round (recorded here rather than silently
rewritten outside the accepted set).

- CLI-R3-001 → `backend.test.ts:502-504`: the identity-harness assertion now
  counts `return` matches with `[...identitySource.matchAll(/\breturn\b/g)]`
  (must be exactly 1) and additionally asserts the `operatorIdentity` helper's
  source contains no `process.env` read, so a hypothetical env-fallback return
  can no longer pass the match-based check.
- CLI-R3-002 + RECOVERY-R3-003 → new `backend.test.ts` test ("both runtime
  parents are pre-flighted before any creation: a refused app parent never
  creates the provider parent", `backend.test.ts:353-376`): two distinct
  runtime parents, the provider runtime parent left missing/fresh and the app
  runtime parent pre-created at exactly 0o755 via `mkdirSync` + `chmodSync`
  (umask-independent), then the `mandate-draft` refusal asserts exit 2, empty
  stdout, `refusing to chmod`, the 0o755 mode untouched and
  `assert.throws(() => statSync(providerRuntime))` — the safe provider parent
  is never created despite a successful pre-flight (check-both-then-create
  ordering pinned).
- CLI-R3-003 → `backend.ts:231-239`: `checkPrivateRuntimeDirectory`
  re-throws a sanitized `CliError` (`${label} could not be validated as a
  runtime directory`) when `statSync` fails with anything other than ENOENT,
  so EACCES/EPERM/ENOTDIR exit 2 as operator validation instead of degrading
  to an unclassified exit 1. New test ("a runtime parent blocked by a regular
  file is operator validation", `backend.test.ts:379-400`): a regular file
  occupies the `state` directory path so both runtime parents (`state/inner`)
  hit ENOTDIR inside a real process; exit 2, empty stdout, sanitized stderr
  (no `ENOTDIR`, `.ts`, `sqlite`, `node:` leakage).
- CLI-R3-004 (observation accepted as fix) → `backend.ts:493-497`: the confirm
  path evaluates `operatorIdentity()` BEFORE any directory creation or store
  open (`backend.ts:499-502` run the pre-flight/create steps after it), and the
  `mandate-confirm` case binds the pre-computed identity
  (`backend.ts:560`, with a provably dead `?? operatorIdentity()` fallback for
  TypeScript's exclusive use; no non-null assertion). A refused identity now
  creates no runtime artifacts. No discriminating test exists because a real
  process cannot shed its OS identity; the ordering is code-inspected by the
  executor.
- EXEC-R3-001 → `worker.ts:190-192` comment rewritten: claim-time values
  persist only as record timestamps; every lease write samples the trusted
  clock fresh (kept to exactly three comment lines so downstream line numbers
  do not shift).
- EXEC-R3-003 → `services/checker/src/execution/test-worker.ts:6,51`: the
  hard-coded 10 s default is replaced by the imported
  `PROVIDER_CALL_TIMEOUT_MS` seam constant, so one definition owns it.
- EXEC-R3-002 (documentation) → this file, round-2 EXEC-R2-002 section: the
  two stale gate-threading citations refreshed to `worker.ts:230` (quoteCart)
  and `worker.ts:262` (`evaluatePurchase` `now`).
- RECOVERY-R3-002 (observation accepted as test) → new in-process
  `worker.test.ts` test ("a bounded lookup that never settles maps to unknown
  exactly like an apply timeout", `worker.test.ts:1106-1163`): phase one runs a
  worker whose `applyEffect` never resolves against a finite 50 ms budget (the
  capture lands unknown at zero provider commits), phase two runs a worker
  whose `lookupEffect` never resolves; the capture phase then lands in the
  identical ambiguous/reconciliation branches — `reconciliation_required`,
  payment unknown, reservation active, order/refund forbidden, effect row still
  `unknown` under the original `op:<kind>` key (no new-key retry) and provider
  row count 0.

### Checks

- `npm test`: 125/125 pass, 0 fail (round 2 ended at 121; +2 backend tests,
  +1 crash/fencing worker test).
- `npm run typecheck`: clean.
- `npm run demo`: exit 0.
- `git diff --check`: clean.
- Crash/fencing suite standalone: `worker.test.ts` 21/21 pass (once).
- Backend suite standalone: `backend.test.ts` 12/12 pass.

### Deviations

- `graphify update .` was not run: `graphify-out/` is outside this bounded
  repair's allowed file set and already carries pre-existing uncommitted unit-3
  churn from the orchestrating session; regenerate there before merging.
- None expected: no file outside the allowed set was modified and every repair
  above maps one-to-one onto its finding.

## LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward

The unit-2 goldfish finding LEDGER-R5-001 (ledger open/migration multiprocess
race behind the `concurrency.test.ts` "database is locked" flake) was carried
forward through rounds 1-3 as out of the accepted sets. It is now closed by a
bounded executor repair on the same branch; scope was restricted to
`services/checker/src/ledger/{schema.ts,store.ts,tests/concurrency.test.ts}`
plus this record, and no unit-3 execution file, `apps/cli/` or `packages/`
file was touched.

### Root cause, with runtime evidence

Two stacked defects fired the observed flake; both are at store-open time, so
each "database is locked" hit the child's `openLedgerStore` and surfaced as a
worker exit (`concurrency.test.ts` close handler, the readiness-barrier path).

1. Primary: `store.ts` pre-fix line 116 executed `PRAGMA journal_mode = WAL`
   BEFORE `PRAGMA busy_timeout` (pre-fix line 119), and SQLite does not honor
   the busy handler for the journal-mode switch at all: it returns immediate
   `SQLITE_BUSY` under contention instead of waiting. An instrumented probe
   (6 concurrent openers on one fresh database, 12 iterations) failed every
   iteration: 11 labeled `journal_mode` `database is locked`, 1 labeled
   `migration1` `table schema_migrations already exists`. A second probe
   showed an already-WAL file opens cleanly even while a sibling holds an
   active write transaction, ruling out general write-transaction contention
   as the trigger and pinning the switch itself.
2. Secondary (the notified hypothesis, confirmed narrow): `schema.ts`
   pre-fix `applyMigrations` (241-276) read the applied-version set OUTSIDE
   its transaction, so a serialized second opener re-ran `MIGRATION_1`
   (`table schema_migrations already exists` captured verbatim).

The unit-3 `execution/fake.ts:50` comment already documented defect 1 and its
fix for the provider database (`busy_timeout must be set before journal_mode:
concurrent executors opening the same provider file would otherwise fail the
WAL switch on SQLITE_BUSY`), making this the established in-repo pattern
without it being applied to the ledger store.

### Change (exact)

- `services/checker/src/ledger/store.ts` `openLedgerStore` (now 114-137):
  `busy_timeout = 5000` moved before the WAL switch, and the switch is retried
  at most 5 attempts through a busy-honored waiting read
  (`SELECT 1 FROM sqlite_master LIMIT 1`) on sanitized `isSqliteBusy` errors,
  because the switch itself ignores `busy_timeout` while ordinary reads honor
  it and the winner's committed switch makes the file permanently WAL. A
  genuine lock exhaustion still surfaces as the error, unchanged.
- `services/checker/src/ledger/schema.ts` `applyMigrations` (now 242-281): the
  whole read-applied-then-apply cycle now runs inside ONE `BEGIN IMMEDIATE`
  transaction (re-check inside the transaction, per-migration transactions
  removed), so a serialized second opener observes the winner's committed
  versions and skips cleanly. Rollback on error, unknown-version rejection
  and the migration-2 upgrade behavior are preserved (store.test.ts strand,
  rollback, future-version and upgrade tests all pass unchanged).
- `services/checker/src/ledger/tests/concurrency.test.ts`: new deterministic
  regression test `start-barrier race: two fresh processes open one fresh
  database and both apply migrations` (test at line 455, driver written into
  the test's os.tmpdir temp dir at 402-419, barrier runner 421-452): two fresh
  child processes race `openLedgerStore` on the SAME fresh temp database after
  a READY/GO barrier, the dual-open loops 4 times on fresh databases per run,
  and BOTH openers must report every migration applied and execute a probing
  statement (no `SQLITE_BUSY`, no duplicate-table noise). Discriminating
  proof: the new test fails 8/8 runs against the pre-fix code with verbatim
  `code: 'ERR_SQLITE_ERROR', errcode: 5, errstr: 'database is locked'` at
  pre-fix `store.ts:116`, identical to the suite flake signature; after the
  fix it passes.

### Checks

- `npm test` FULL twice consecutively: 125/125 pass, 0 fail both (the new
  regression test confirmed present in both runs).
- `npm run typecheck`: clean. `npm run demo`: exit 0. `git diff --check`: clean.
- `concurrency.test.ts` standalone repeatedly: 30 consecutive green runs
  (0 failures) after the final fix, plus earlier 3-run batches.
- Store/probe stress: 6 concurrent openers x 60 fresh databases
  (360 opens): 0 failures post-fix (pre-fix: 11 "database is locked" +
  1 duplicate-table across 12 iterations).
- Execution suite standalone re-run as regression insurance for the provider
  DB machinery: `worker.test.ts` 21/21 pass. `store.test.ts` +
  `backend.test.ts` standalone: 30/30 pass.

### Residuals disclosed

- The same WAL-switch-vs-busy-timeout gap this repair closed for the ledger
  also exists at `services/checker/src/execution/fake.ts:52-53`
  (`openProviderDatabase`): it sets `busy_timeout` before `journal_mode` but
  has no per-opener switch retry, and its migration recheck guards only the
  migration half. It has not produced an observed failure in any run of the
  execution suites this session (21/21 repeatedly) and the file is outside
  this repair's allowed set. Left as an observation for the execution lane.
- The old per-migration-transaction splitting inside a single
  `applyMigrations` call is gone: a fresh database whose LATER migration
  fails now leaves the database completely unmigrated (earlier migrations in
  that same call roll back with the failed one) instead of committing the
  earlier migrations. `store.test.ts` asserted none of that in-between state
  (its rollback case opens an already-migrated database; its strand case
  applies migration 1 in a separate call), so no asserted behavior changed;
  total-cycle atomicity is strictly stronger for the ledger's money tables.

## Orchestrator closeout (2026-11-05)

The invalidate-this-record residual above was closed by the orchestrator in the
same session: `services/checker/src/execution/fake.ts` now sets `busy_timeout`
before the WAL switch and retries the switch through a bounded busy-honored
waiting read (≤5 attempts, non-busy errors propagate immediately), mirroring
`openLedgerStore`, and gained `PRAGMA foreign_keys = ON` for future schema use.
Two independent confirm reviews verified the ledger fix and this mirrored
provider fix (CONF-LEDGER / CONF-EXEC: VERDICT PASS each), and their two cheap
residuals were applied directly by the orchestrator: the dual-open regression
test now releases GO only after both children report READY (two-phase barrier)
and asserts the driver's returned `operations` probe count equals 0.

Final convergence statement for the Unit 3 EGM review:

- Rounds: R1 all lenses FAIL (4 Majors), fixed; R2 EXEC PASS, CLI FAIL,
  RECOVERY FAIL, fixed; R3 all lenses PASS after fix pass 2; round-3 residuals
  (small) fixed; confirm round on the changed ledger and provider files: PASS,
  PASS.
- The review cycle ended at its sanctioned single post-fix re-audit per edited
  stage, with the repair surface shrinking per round (Majors only, then minors,
  then comments and tests). No Blocker or Major findings remain open.
- Carried-forward open minors stay listed earlier in this file, unchanged by
  the closeout; LEDGER-R5-001 (and its provider-loop residual) is REPAIRED.

Final checks at orchestrator level (2026-11-05, branch `unit3-durable-execution`,
uncommitted):

- `npm test`: 125/125 pass, 0 fail, consecutively green twice after the flake
  repair (the pre-existing "database is locked" flake is root-caused, fixed and
  regression-covered).
- `npm run typecheck`: clean; `npm run demo`: exit 0; `git diff --check`: clean.
- `graphify update .`: run by the orchestrator for all unit-3 sources.
- CLI walkthrough: covered by `backend.test.ts` fresh-process flows exercising
  the exact documented command sequence; the delegate's verbatim manual
  walkthrough appears earlier in this file.
