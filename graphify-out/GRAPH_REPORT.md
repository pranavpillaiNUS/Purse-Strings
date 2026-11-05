# Graph Report - Splittap-pay  (2026-11-06)

## Corpus Check
- 79 files · ~74,671 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 786 nodes · 1927 edges · 50 communities (42 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 81 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e3ca909b`
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
- createApplicationBackend
- application.test.ts
- application.ts
- worker.test.ts
- cli/src/backend.test.ts
- control-files.ts
- index.ts
- agent/src/mandate.ts
- mock.ts
- tests/store.test.ts
- BackendResponse
- CatalogSchema
- concurrency.test.ts
- inputs.ts
- Splittap purchasing agent
- src/store.test.ts
- createFixtureSupplier
- CLI-first architecture
- agent/package.json
- What we have to do
- PayPal sandbox spike (build step 1)
- control.ts
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
10. `CatalogSchema` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Orchestrator closeout (2026-11-05)` --references--> `openLedgerStore()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/ledger/store.ts
- `Delivered` --references--> `runTransaction()`  [INFERRED]
  .audit/backend-delivery/unit2-result.md → services/checker/src/ledger/store.ts
- `Minors` --references--> `checkPrivateRuntimeDirectory()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → apps/cli/src/backend.ts
- `Minors` --references--> `createPrivateRuntimeDirectory()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → apps/cli/src/backend.ts
- `Minors` --references--> `handleCommand()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → apps/cli/src/backend.ts

## Import Cycles
- None detected.

## Communities (50 total, 8 thin omitted)

### Community 0 - "application.test.ts"
Cohesion: 0.17
Nodes (16): createHarness(), Harness, NarrowingCase, asConfirmedMandate(), countingAdapter(), fixtureAdapter(), makeTempDir(), RAW_CATALOG (+8 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.07
Nodes (46): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+38 more)

### Community 2 - "ledger/store.ts"
Cohesion: 0.06
Nodes (83): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Delivered, Minors, buildWireOperation(), createFakeProviderGateway(), FakeProviderGateway, FakeProviderScenario, loadProviderRow() (+75 more)

### Community 3 - "package.json"
Cohesion: 0.10
Nodes (20): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+12 more)

### Community 4 - "control-files.ts"
Cohesion: 0.10
Nodes (23): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema (+15 more)

### Community 5 - "Hackathon project: an AI purchasing agent that can't overspend"
Cohesion: 0.15
Nodes (13): Answers to likely judge questions, Architecture, Decision log, Demo script, Design rules (non-negotiable), Hackathon project: an AI purchasing agent that can't overspend, How it works, PayPal: what we rely on (+5 more)

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
Cohesion: 0.06
Nodes (41): bundled(), printProposal(), readJson(), runMandate(), draft(), entry, invalid(), kitPath (+33 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "draftMandateRevision"
Cohesion: 0.36
Nodes (7): definePolicySnapshot(), draftMandateRevision(), seedConfirmedStore(), Durable ledger (M2 slice — authority + reservations), runTransaction(), setup(), setup()

### Community 15 - "agent/src/mandate.ts"
Cohesion: 0.10
Nodes (19): Acceptance and remaining milestones, Alternatives and choice, CLI backend delivery specification, CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+11 more)

### Community 16 - "CLAUDE.md"
Cohesion: 0.12
Nodes (15): Backend exclusions, Backend framework comparison, Contract operations to design first, Optional supplier simulator platforms, Order of implementation, Ownership in the current repository, PayPal adapter, Persistence (+7 more)

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
Cohesion: 0.17
Nodes (25): AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult, loadMandateAuthority(), loadPolicySnapshot(), MandateDraft (+17 more)

### Community 25 - "createApplicationBackend"
Cohesion: 0.13
Nodes (26): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations, authorityFailureResponse() (+18 more)

### Community 26 - "application.test.ts"
Cohesion: 0.07
Nodes (53): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog (+45 more)

### Community 27 - "application.ts"
Cohesion: 0.12
Nodes (19): BackendErrorCode, BackendMethod, CartSubmission, Mandate, Policy, Quote, ApplicationBackendConfig, correlationFields() (+11 more)

### Community 28 - "worker.test.ts"
Cohesion: 0.09
Nodes (19): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, auditDetailsFor(), ChildOperation, ChildResult (+11 more)

### Community 29 - "cli/src/backend.test.ts"
Cohesion: 0.13
Nodes (6): BackendFixture, entry, root, entry, fixedClock, root

### Community 30 - "control-files.ts"
Cohesion: 0.24
Nodes (12): integerOption(), runStore(), fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog(), seedPath, fixtureDirectory (+4 more)

### Community 32 - "index.ts"
Cohesion: 0.17
Nodes (13): amount, Check, currency, EligibilityResult, EvaluationInputSchema, Evidence, id, QuoteLineSchema (+5 more)

### Community 33 - "agent/src/mandate.ts"
Cohesion: 0.17
Nodes (11): BackendRequest, BackendRequestSchema, BackendResponseSchema, BackendClient, BackendProtocolError, BackendTransport, createBackendClient(), cart (+3 more)

### Community 34 - "mock.ts"
Cohesion: 0.15
Nodes (20): Unit 1 review follow-up, BackendMethodSchema, Operation, createMock(), canonicalCart(), canonicalize(), compareText(), correlationFields() (+12 more)

### Community 35 - "tests/store.test.ts"
Cohesion: 0.19
Nodes (13): sha256CanonicalJson(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION, bindIdempotencyAlias(), canonicalCartJson(), findOperationIdentities() (+5 more)

### Community 37 - "CatalogSchema"
Cohesion: 0.22
Nodes (11): BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, MandateSchema, MAX_AMOUNT_MINOR, QuoteSchema, uniqueBy(), input() (+3 more)

### Community 38 - "concurrency.test.ts"
Cohesion: 0.17
Nodes (7): digestOf(), OpenChildRun, setupConfirmedStore(), SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH, WorkerResult

### Community 39 - "inputs.ts"
Cohesion: 0.26
Nodes (9): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), EvaluationInput, PolicySchema (+1 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.22
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 42 - "createFixtureSupplier"
Cohesion: 0.31
Nodes (7): raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig, createFixtureSupplier()

### Community 43 - "CLI-first architecture"
Cohesion: 0.25
Nodes (8): Authority and evidence, CLI-first architecture, Ledger and recovery requirements (planned), Repository map, Stage-one boundaries, Technology decisions, Test strategy, BudgetSnapshot

### Community 44 - "agent/package.json"
Cohesion: 0.29
Nodes (7): dependencies, zod@^4.0.0, description, zod, name, private, type

### Community 45 - "What we have to do"
Cohesion: 0.33
Nodes (6): Judging criteria, Prizes, Schedule, The rules, What to submit, What we have to do

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (5): One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "control.ts"
Cohesion: 0.40
Nodes (5): EvidenceSchema, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema

### Community 48 - "Confirmation and stock: proposed next integration"
Cohesion: 0.50
Nodes (4): Confirmation and stock: proposed next integration, Current review surface, Decisions for Pranav and Danny, Next milestone exit evidence

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Team, ownership and branches` connect `Splittap purchasing agent` to `index.ts`, `ledger/store.ts`, `application.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07013574660633484 - nodes in this community are weakly interconnected._
- **Why does `Splittap purchasing agent` connect `Splittap purchasing agent` to `README.md`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `ledger/store.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05875077303648732 - nodes in this community are weakly interconnected._
- **Why does `BudgetSnapshot` connect `CLI-first architecture` to `index.ts`, `ledger/store.ts`, `application.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.10476190476190476 - nodes in this community are weakly interconnected._