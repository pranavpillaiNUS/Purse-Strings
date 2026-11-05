# Graph Report - Splittap-pay  (2026-11-06)

## Corpus Check
- 79 files · ~75,363 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 787 nodes · 1930 edges · 46 communities (39 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 81 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c0a70118`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- application.test.ts
- paypal-spike.ts
- ledger/store.ts
- package.json
- control-files.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- agent/src/mandate.ts
- checker/package.json
- suppliers/package.json
- README.md
- draftMandateRevision
- agent/src/mandate.ts
- CLAUDE.md
- Backend delivery run
- Delivery findings
- Unit 1 result
- authority.ts
- Unit 2 result: trusted authority and SQLite atomic reservations
- application.test.ts
- application.ts
- worker.test.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- control-files.ts
- index.ts
- agent/src/mandate.ts
- mock.ts
- tests/store.test.ts
- draft
- CatalogSchema
- Splittap — CLI-first equipment purchasing
- Splittap purchasing agent
- fake.ts
- CLI-first architecture
- agent/package.json
- PayPal sandbox spike (build step 1)
- Confirmation and stock: proposed next integration
- ExecutionWorker

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 44 edges
2. `openLedgerStore()` - 28 edges
3. `createApplicationBackend()` - 27 edges
4. `handleCommand()` - 25 edges
5. `confirmMandateRevision()` - 22 edges
6. `canonicalize()` - 21 edges
7. `CliError` - 19 edges
8. `phaseCapture()` - 19 edges
9. `createFixtureSupplier()` - 19 edges
10. `draftMandateRevision()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Delivered` --references--> `runTransaction()`  [INFERRED]
  .audit/backend-delivery/unit2-result.md → services/checker/src/ledger/store.ts
- `Orchestrator closeout (2026-11-05)` --references--> `openLedgerStore()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/ledger/store.ts
- `Mandate draft and review` --references--> `draft()`  [INFERRED]
  README.md → apps/cli/src/mandate.test.ts
- `Delivered planning slice` --references--> `draft()`  [INFERRED]
  services/agent/README.md → apps/cli/src/mandate.test.ts
- `Majors` --references--> `AuthorityFailure`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/authority.ts

## Import Cycles
- None detected.

## Communities (46 total, 7 thin omitted)

### Community 0 - "application.test.ts"
Cohesion: 0.12
Nodes (20): createHarness(), Harness, NarrowingCase, OpenChildRun, SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH, WorkerResult (+12 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.06
Nodes (53): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), BUDGET, capture() (+45 more)

### Community 2 - "ledger/store.ts"
Cohesion: 0.08
Nodes (85): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Delivered, Minors, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), createApplicationBackend(), catalogList() (+77 more)

### Community 3 - "package.json"
Cohesion: 0.10
Nodes (20): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+12 more)

### Community 4 - "control-files.ts"
Cohesion: 0.10
Nodes (23): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema (+15 more)

### Community 5 - "Hackathon project: an AI purchasing agent that can't overspend"
Cohesion: 0.11
Nodes (19): Answers to likely judge questions, Architecture, Decision log, Demo script, Design rules (non-negotiable), Hackathon project: an AI purchasing agent that can't overspend, How it works, Judging criteria (+11 more)

### Community 6 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+5 more)

### Community 7 - "Project scope: CLI-first equipment procurement"
Cohesion: 0.15
Nodes (13): Acceptance scenarios for stage one, Decisions the product must make, Delivered scaffold: M0, Excluded until a production scope, Implementation status, Outcomes and improvement loop, Payment and business-model gate, Product decision (+5 more)

### Community 8 - "contracts/package.json"
Cohesion: 0.29
Nodes (7): dependencies, zod@^4.0.0, description, zod, name, private, type

### Community 9 - "cli/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 10 - "agent/src/mandate.ts"
Cohesion: 0.12
Nodes (23): bundled(), printProposal(), readJson(), runMandate(), PolicySchema, compileProposal(), contentDigest(), createMandateDraft() (+15 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "draftMandateRevision"
Cohesion: 0.36
Nodes (8): definePolicySnapshot(), draftMandateRevision(), seedConfirmedStore(), setup(), setup(), digestOf(), setupConfirmedStore(), countingAdapter()

### Community 15 - "agent/src/mandate.ts"
Cohesion: 0.10
Nodes (19): Acceptance and remaining milestones, Alternatives and choice, CLI backend delivery specification, CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+11 more)

### Community 16 - "CLAUDE.md"
Cohesion: 0.12
Nodes (16): Backend exclusions, Backend framework comparison, Contract operations to design first, Optional supplier simulator platforms, Order of implementation, Ownership in the current repository, PayPal adapter, Persistence (+8 more)

### Community 17 - "Backend delivery run"
Cohesion: 0.25
Nodes (7): Backend delivery run, Current phase, Evidence and constraints, Outcome and authority, Planned acceptance, Throughput checkpoint, Workflow

### Community 18 - "Delivery findings"
Cohesion: 0.50
Nodes (3): Delivery findings, design-critic-r1-1, design-critic-r1-2

### Community 23 - "Unit 1 result"
Cohesion: 0.33
Nodes (5): Delivered, Files and scope notes, Limitations, Unit 1 result, Verification

### Community 24 - "authority.ts"
Cohesion: 0.13
Nodes (24): extractSupplierId(), ValidatedMandateRead, AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult, loadPolicySnapshot() (+16 more)

### Community 25 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 26 - "application.test.ts"
Cohesion: 0.08
Nodes (51): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog (+43 more)

### Community 27 - "application.ts"
Cohesion: 0.17
Nodes (13): CartSubmission, Mandate, Quote, ApplicationBackendConfig, correlationFields(), evaluatorFailure(), FAILURE_PRIORITY, IdentityResolution (+5 more)

### Community 28 - "worker.test.ts"
Cohesion: 0.09
Nodes (19): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, auditDetailsFor(), ChildOperation, ChildResult (+11 more)

### Community 29 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.14
Nodes (14): Checks, Checks, Deviations, Deviations, Goldfish review round 1 (2026-11-05), Goldfish review round 2 (2026-11-05), Honest boundaries, Minors (+6 more)

### Community 30 - "control-files.ts"
Cohesion: 0.07
Nodes (34): BackendFixture, entry, root, entry, fixedClock, root, entry, invalid() (+26 more)

### Community 32 - "index.ts"
Cohesion: 0.14
Nodes (15): Authority and evidence, amount, BudgetSnapshot, Check, currency, EligibilityResult, EvaluationInputSchema, Evidence (+7 more)

### Community 33 - "agent/src/mandate.ts"
Cohesion: 0.12
Nodes (13): BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendClient, BackendProtocolError, BackendTransport, createBackendClient() (+5 more)

### Community 34 - "mock.ts"
Cohesion: 0.14
Nodes (22): Unit 1 review follow-up, BackendErrorCode, BackendMethod, BackendMethodSchema, Operation, createMock(), canonicalCart(), canonicalize() (+14 more)

### Community 35 - "tests/store.test.ts"
Cohesion: 0.22
Nodes (14): resolveIdentities(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION, bindIdempotencyAlias(), findOperationIdentities(), LedgerIdentityConflict (+6 more)

### Community 36 - "draft"
Cohesion: 0.33
Nodes (5): draft(), Mandate draft and review, Delivered planning slice, Mandate planning and the planned bounded shopper, Planned shopper (M4)

### Community 37 - "CatalogSchema"
Cohesion: 0.17
Nodes (14): BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, EvidenceSchema, MandateSchema, MAX_AMOUNT_MINOR, QuoteSchema, uniqueBy() (+6 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.33
Nodes (6): Fixture-store controls, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 42 - "fake.ts"
Cohesion: 0.11
Nodes (19): createFakeProviderGateway(), FakeProviderGateway, FakeProviderScenario, loadProviderRow(), openProviderDatabase(), ProviderRow, RawRow, readString() (+11 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.33
Nodes (6): CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "agent/package.json"
Cohesion: 0.29
Nodes (7): dependencies, zod@^4.0.0, description, zod, name, private, type

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (5): One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 48 - "Confirmation and stock: proposed next integration"
Cohesion: 0.40
Nodes (5): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to confirmation, Next milestone exit evidence

## Knowledge Gaps
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runTransaction()` connect `ledger/store.ts` to `tests/store.test.ts`, `README.md`, `draftMandateRevision`, `authority.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `application.ts`, `worker.test.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `application.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11942959001782531 - nodes in this community are weakly interconnected._
- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `ledger/store.ts`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06229508196721312 - nodes in this community are weakly interconnected._
- **Why does `Hackathon project: an AI purchasing agent that can't overspend` connect `Hackathon project: an AI purchasing agent that can't overspend` to `README.md`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `ledger/store.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0778855975485189 - nodes in this community are weakly interconnected._