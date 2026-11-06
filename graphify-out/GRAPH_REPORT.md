# Graph Report - Splittap-pay  (2026-11-06)

## Corpus Check
- 104 files · ~95,222 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 970 nodes · 2418 edges · 56 communities (49 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 93 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bf20f28c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- concurrency.test.ts
- paypal-spike.ts
- ledger/store.ts
- package.json
- contracts/src/backend.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- agent/src/mandate.ts
- checker/package.json
- suppliers/package.json
- README.md
- shopper.test.ts
- agent/src/mandate.ts
- CLAUDE.md
- Backend delivery run
- Delivery findings
- Unit 1 result
- authority.ts
- src/worker.test.ts
- application.test.ts
- execution/worker.test.ts
- ref_node_fs
- shopper.ts
- seeds.test.ts
- index.ts
- agent/src/mandate.ts
- mock.ts
- ExecutionWorker
- cli/src/mandate.test.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- Splittap purchasing agent
- src/client.ts
- createFixtureSupplier
- CLI-first architecture
- backend-session.ts
- PayPal sandbox spike (build step 1)
- createApplicationBackend
- Confirmation and stock: proposed next integration
- fixture.ts
- tests/store.test.ts
- AuthorityFailure
- src/store.test.ts
- The shopper
- Unit 2 result: trusted authority and SQLite atomic reservations
- agent/package.json
- createSession
- application.ts

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 44 edges
2. `openLedgerStore()` - 30 edges
3. `createApplicationBackend()` - 29 edges
4. `handleCommand()` - 25 edges
5. `confirmMandateRevision()` - 24 edges
6. `CatalogSchema` - 24 edges
7. `createFixtureSupplier()` - 23 edges
8. `canonicalize()` - 21 edges
9. `draftMandateRevision()` - 20 edges
10. `CliError` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Orchestrator closeout (2026-11-05)` --references--> `openLedgerStore()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/ledger/store.ts
- `Mandate planning` --references--> `draft()`  [INFERRED]
  services/agent/README.md → apps/cli/src/mandate.test.ts
- `Delivered` --references--> `runTransaction()`  [INFERRED]
  .audit/backend-delivery/unit2-result.md → services/checker/src/ledger/store.ts
- `Current implementation boundary` --references--> `store()`  [INFERRED]
  AGENTS.md → apps/cli/src/store.test.ts
- `Team, ownership and branches` --references--> `store()`  [INFERRED]
  AGENTS.md → apps/cli/src/store.test.ts

## Import Cycles
- None detected.

## Communities (56 total, 7 thin omitted)

### Community 0 - "concurrency.test.ts"
Cohesion: 0.12
Nodes (21): createHarness(), Harness, NarrowingCase, OpenChildRun, SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH, WorkerResult (+13 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.06
Nodes (53): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), BUDGET, capture() (+45 more)

### Community 2 - "ledger/store.ts"
Cohesion: 0.06
Nodes (87): wireOperation(), Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Delivered, Minors, buildWireOperation(), resolveIdentities(), createFakeProviderGateway(), FakeProviderGateway (+79 more)

### Community 3 - "package.json"
Cohesion: 0.10
Nodes (21): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+13 more)

### Community 4 - "contracts/src/backend.ts"
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

### Community 14 - "shopper.test.ts"
Cohesion: 0.15
Nodes (12): createOfflineShoppingSession(), ShoppingToolErrorCode, build, catalog, code(), getCatalog(), line, mandate (+4 more)

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
Cohesion: 0.12
Nodes (30): ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult, loadMandateAuthority(), loadPolicySnapshot(), MandateAuthority (+22 more)

### Community 25 - "src/worker.test.ts"
Cohesion: 0.06
Nodes (52): buildModel(), buildTransport(), describeCall(), EXIT_CODES, formatMinor(), main(), modelApiKey(), positiveInteger() (+44 more)

### Community 26 - "application.test.ts"
Cohesion: 0.07
Nodes (52): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, createPrivateRuntimeDirectory() (+44 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.10
Nodes (21): ledger(), definePolicySnapshot(), draftMandateRevision(), auditDetailsFor(), ChildOperation, ChildResult, effectRow(), EXEC_WORKER_PATH (+13 more)

### Community 28 - "ref_node_fs"
Cohesion: 0.09
Nodes (11): BackendFixture, entry, root, entry, fixedClock, root, root, fixtureDirectory (+3 more)

### Community 29 - "shopper.ts"
Cohesion: 0.14
Nodes (15): BackendErrorCode, BackendSessionError, CartEstimate, CatalogFacts, catalogFacts(), OfflineSessionInputSchema, RefusedSubmission, RejectedSubmission (+7 more)

### Community 30 - "seeds.test.ts"
Cohesion: 0.18
Nodes (19): integerOption(), runStore(), Catalog, EvidenceSchema, applyFixtureChanges(), controlSource(), FIXTURE_SEEDS, fixtureDirectory (+11 more)

### Community 32 - "index.ts"
Cohesion: 0.12
Nodes (22): amount, BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, Check, currency, EligibilityResult, EvaluationInputSchema (+14 more)

### Community 33 - "agent/src/mandate.ts"
Cohesion: 0.14
Nodes (10): BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendProtocolError, cart, cartBase, catalog (+2 more)

### Community 34 - "mock.ts"
Cohesion: 0.16
Nodes (20): Unit 1 review follow-up, BackendMethod, createMock(), canonicalCart(), canonicalize(), compareText(), correlationFields(), createMockBackend() (+12 more)

### Community 36 - "cli/src/mandate.test.ts"
Cohesion: 0.22
Nodes (10): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+2 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.12
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.29
Nodes (7): Fixture-store controls, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status, The shopper

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.25
Nodes (7): Authority and trust, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent

### Community 41 - "src/client.ts"
Cohesion: 0.25
Nodes (7): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendTransport

### Community 42 - "createFixtureSupplier"
Cohesion: 0.28
Nodes (7): ConfiguredSupplier, raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig

### Community 43 - "CLI-first architecture"
Cohesion: 0.33
Nodes (6): CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 45 - "backend-session.ts"
Cohesion: 0.15
Nodes (9): INDETERMINATE_CODES, proposalIdempotencyKey(), REJECTION_CODES, SessionOptionsSchema, createShoppingSession(), ProposalOutcome, ProposalPort, ShoppingSession (+1 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (5): One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "createApplicationBackend"
Cohesion: 0.27
Nodes (16): authorityFailureResponse(), buildSnapshot(), createApplicationBackend(), catalogList(), handleProposalSubmit(), handleValidRequest(), mandateAuthorityForRead(), operationGet() (+8 more)

### Community 48 - "Confirmation and stock: proposed next integration"
Cohesion: 0.40
Nodes (5): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence

### Community 49 - "fixture.ts"
Cohesion: 0.26
Nodes (9): ConfiguredCatalog, input(), load(), CartCosts, cartCosts(), createFixtureCatalogSource(), FixtureCatalogsSchema, seed() (+1 more)

### Community 50 - "tests/store.test.ts"
Cohesion: 0.26
Nodes (10): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, applyMigrations(), LedgerMigration, maxKnownMigrationVersion() (+2 more)

### Community 51 - "AuthorityFailure"
Cohesion: 0.39
Nodes (7): loadActiveAuthority(), parseStoredPolicy(), AuthorityFailure, parseDraft(), reconstructMandate(), reviewMandateRevision(), digestOf()

### Community 52 - "src/store.test.ts"
Cohesion: 0.29
Nodes (9): Current implementation boundary, check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath (+1 more)

### Community 53 - "The shopper"
Cohesion: 0.20
Nodes (10): BackendClient, Mandate planning, Mandate planning and the bounded shopper, Not established, Run it, Submission outcomes, Tests, The shopper (+2 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 57 - "agent/package.json"
Cohesion: 0.25
Nodes (8): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, name, private, type

### Community 58 - "createSession"
Cohesion: 0.54
Nodes (7): createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput(), ShoppingToolError

### Community 60 - "application.ts"
Cohesion: 0.11
Nodes (22): Team, ownership and branches, Authority and evidence, BackendMethodSchema, Operation, createBackendClient(), BudgetSnapshot, CartSubmission, Mandate (+14 more)

## Knowledge Gaps
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runTransaction()` connect `execution/worker.test.ts` to `ledger/store.ts`, `README.md`, `createApplicationBackend`, `tests/store.test.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `authority.ts`, `application.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `concurrency.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11931818181818182 - nodes in this community are weakly interconnected._
- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `execution/worker.test.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06229508196721312 - nodes in this community are weakly interconnected._
- **Should `ledger/store.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.059207920792079205 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09956709956709957 - nodes in this community are weakly interconnected._