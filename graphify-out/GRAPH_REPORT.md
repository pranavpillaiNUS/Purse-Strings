# Graph Report - Splittap-pay  (2026-11-06)

## Corpus Check
- 84 files · ~78,915 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 822 nodes · 2009 edges · 49 communities (42 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 84 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3f0f7144`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- worker.test.ts
- paypal-spike.ts
- ledger/store.ts
- package.json
- control-files.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- ref_node_fs
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
- agent/src/mandate.ts
- application.test.ts
- application.ts
- control-files.test.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- control-files.ts
- index.ts
- agent/src/mandate.ts
- mock.ts
- inputs.ts
- src/store.test.ts
- CatalogSchema
- Splittap — CLI-first equipment purchasing
- cli/src/backend.test.ts
- Splittap purchasing agent
- cli/src/mandate.test.ts
- fake.ts
- CLI-first architecture
- agent/package.json
- What we have to do
- PayPal sandbox spike (build step 1)
- Confirmation and stock: proposed next integration
- ExecutionWorker

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 44 edges
2. `openLedgerStore()` - 28 edges
3. `createApplicationBackend()` - 27 edges
4. `handleCommand()` - 25 edges
5. `confirmMandateRevision()` - 22 edges
6. `CatalogSchema` - 22 edges
7. `canonicalize()` - 21 edges
8. `CliError` - 19 edges
9. `phaseCapture()` - 19 edges
10. `createFixtureSupplier()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Delivered` --references--> `runTransaction()`  [INFERRED]
  .audit/backend-delivery/unit2-result.md → services/checker/src/ledger/store.ts
- `Orchestrator closeout (2026-11-05)` --references--> `openLedgerStore()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/ledger/store.ts
- `Delivered planning slice` --references--> `draft()`  [INFERRED]
  services/agent/README.md → apps/cli/src/mandate.test.ts
- `Majors` --references--> `AuthorityFailure`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/authority.ts
- `Majors` --references--> `LeaseLost`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/ledger/store.ts

## Import Cycles
- None detected.

## Communities (49 total, 7 thin omitted)

### Community 0 - "worker.test.ts"
Cohesion: 0.06
Nodes (55): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, PolicySchema, definePolicySnapshot(), draftMandateRevision() (+47 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.07
Nodes (47): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+39 more)

### Community 2 - "ledger/store.ts"
Cohesion: 0.07
Nodes (95): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Delivered, Minors, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), createApplicationBackend(), catalogList() (+87 more)

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

### Community 10 - "ref_node_fs"
Cohesion: 0.23
Nodes (11): bundled(), printProposal(), readJson(), runMandate(), compileProposal(), contentDigest(), createMandateDraft(), reviewMandateDraft() (+3 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "shopper.test.ts"
Cohesion: 0.09
Nodes (25): CatalogFacts, catalogFacts(), createOfflineShoppingSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), selection (+17 more)

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
Cohesion: 0.08
Nodes (32): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations, extractSupplierId() (+24 more)

### Community 25 - "agent/src/mandate.ts"
Cohesion: 0.20
Nodes (11): digest, distinct(), DraftReviewCheck, Kit, KitTemplateSchema, MandateDraft, MandateDraftReview, MandateRequestSchema (+3 more)

### Community 26 - "application.test.ts"
Cohesion: 0.11
Nodes (42): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog (+34 more)

### Community 27 - "application.ts"
Cohesion: 0.12
Nodes (20): Team, ownership and branches, Authority and evidence, BackendMethod, BudgetSnapshot, CartSubmission, EligibilityResult, Mandate, Policy (+12 more)

### Community 28 - "control-files.test.ts"
Cohesion: 0.20
Nodes (5): entry, fixedClock, root, fixtureDirectory, seedPath

### Community 29 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.14
Nodes (14): Checks, Checks, Deviations, Deviations, Goldfish review round 1 (2026-11-05), Goldfish review round 2 (2026-11-05), Honest boundaries, Minors (+6 more)

### Community 30 - "control-files.ts"
Cohesion: 0.38
Nodes (10): integerOption(), runStore(), fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog(), seedPath, updateFixtureCatalog() (+2 more)

### Community 32 - "index.ts"
Cohesion: 0.14
Nodes (16): amount, BudgetSnapshotSchema, Check, currency, EvaluationInputSchema, Evidence, id, MandateSchema (+8 more)

### Community 33 - "agent/src/mandate.ts"
Cohesion: 0.12
Nodes (13): BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendClient, BackendProtocolError, BackendTransport, createBackendClient() (+5 more)

### Community 34 - "mock.ts"
Cohesion: 0.15
Nodes (21): Unit 1 review follow-up, BackendErrorCode, BackendMethodSchema, Operation, createMock(), canonicalCart(), canonicalize(), compareText() (+13 more)

### Community 35 - "inputs.ts"
Cohesion: 0.33
Nodes (7): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), evaluatePurchase()

### Community 36 - "src/store.test.ts"
Cohesion: 0.29
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 37 - "CatalogSchema"
Cohesion: 0.20
Nodes (10): CartSubmissionSchema, CatalogSchema, EvidenceSchema, MAX_AMOUNT_MINOR, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema (+2 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.20
Nodes (10): draft(), Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status (+2 more)

### Community 39 - "cli/src/backend.test.ts"
Cohesion: 0.22
Nodes (3): BackendFixture, entry, root

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.22
Nodes (8): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent

### Community 41 - "cli/src/mandate.test.ts"
Cohesion: 0.25
Nodes (8): entry, invalid(), kitPath, policyPath, requestPath, root, run(), MandateDraftSchema

### Community 42 - "fake.ts"
Cohesion: 0.08
Nodes (23): createFakeProviderGateway(), FakeProviderGateway, FakeProviderScenario, loadProviderRow(), openProviderDatabase(), ProviderRow, RawRow, readString() (+15 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.33
Nodes (6): CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "agent/package.json"
Cohesion: 0.29
Nodes (7): dependencies, zod@^4.0.0, description, zod, name, private, type

### Community 45 - "What we have to do"
Cohesion: 0.33
Nodes (6): Judging criteria, Prizes, Schedule, The rules, What to submit, What we have to do

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

- **Why does `runTransaction()` connect `ledger/store.ts` to `authority.ts`, `worker.test.ts`, `application.ts`, `README.md`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `worker.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05583308845136644 - nodes in this community are weakly interconnected._
- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `ledger/store.ts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07184325108853411 - nodes in this community are weakly interconnected._
- **Why does `Hackathon project: an AI purchasing agent that can't overspend` connect `Hackathon project: an AI purchasing agent that can't overspend` to `What we have to do`, `README.md`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `ledger/store.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06885178313749743 - nodes in this community are weakly interconnected._