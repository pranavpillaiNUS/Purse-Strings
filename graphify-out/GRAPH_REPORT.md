# Graph Report - Splittap-pay  (2026-11-05)

## Corpus Check
- 65 files · ~63,347 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 685 nodes · 1545 edges · 37 communities (29 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `74366c01`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- worker.test.ts
- paypal-spike.ts
- worker.ts
- package.json
- contracts/src/backend.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- main.test.ts
- checker/package.json
- suppliers/package.json
- agent/README.md
- ledger/README.md
- CLI backend delivery specification
- Team scope and framework assessment
- Backend delivery run
- Delivery findings
- Unit 1 result
- store.ts
- application.ts
- cli/src/backend.ts
- fake.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- cli/src/backend.test.ts
- Unit 2 result: trusted authority and SQLite atomic reservations
- index.ts
- client.mock.test.ts
- mock.ts
- submitProposal
- BackendResponse

## God Nodes (most connected - your core abstractions)
1. `handleCommand()` - 24 edges
2. `createExecutionWorker()` - 24 edges
3. `openLedgerStore()` - 23 edges
4. `confirmMandateRevision()` - 22 edges
5. `phaseCapture()` - 19 edges
6. `handleProposalSubmit()` - 18 edges
7. `createFixtureSupplier()` - 18 edges
8. `draftMandateRevision()` - 17 edges
9. `CliError` - 16 edges
10. `createApplicationBackend()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `loadSnapshotSet()` --calls--> `canonicalize()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/ledger/store.ts
- `ConfiguredCatalog` --references--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/suppliers/src/fixture.ts
- `buildSuppliers()` --calls--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/suppliers/src/fixture.ts
- `operationRow()` --calls--> `loadOperationStorageRow()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/ledger/store.ts
- `runRpc()` --calls--> `createApplicationBackend()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/application.ts

## Import Cycles
- None detected.

## Communities (37 total, 3 thin omitted)

### Community 0 - "worker.test.ts"
Cohesion: 0.08
Nodes (40): CartSubmission, CatalogSchema, Quote, ConfiguredSupplier, ChildOperation, ChildResult, createHarness(), effectRow() (+32 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.07
Nodes (46): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+38 more)

### Community 2 - "worker.ts"
Cohesion: 0.11
Nodes (43): effectKey(), callBounded(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim(), createIntent(), execute() (+35 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (23): description, devDependencies, @types/node, typescript, engines, node, license, name (+15 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.10
Nodes (23): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema (+15 more)

### Community 5 - "Hackathon project: an AI purchasing agent that can't overspend"
Cohesion: 0.11
Nodes (19): Answers to likely judge questions, Architecture, Decision log, Demo script, Design rules (non-negotiable), Hackathon project: an AI purchasing agent that can't overspend, How it works, Judging criteria (+11 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (17): apps/**/*.ts, node, packages/**/*.ts, services/**/*.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, module (+9 more)

### Community 7 - "Project scope: CLI-first equipment procurement"
Cohesion: 0.05
Nodes (40): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+32 more)

### Community 8 - "contracts/package.json"
Cohesion: 0.25
Nodes (7): dependencies, zod, description, name, private, type, zod

### Community 9 - "cli/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 10 - "main.test.ts"
Cohesion: 0.40
Nodes (3): entry, fixedClock, root

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 15 - "CLI backend delivery specification"
Cohesion: 0.10
Nodes (19): Acceptance and remaining milestones, Alternatives and choice, CLI backend delivery specification, CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+11 more)

### Community 16 - "Team scope and framework assessment"
Cohesion: 0.12
Nodes (15): Backend exclusions, Backend framework comparison, Contract operations to design first, Optional supplier simulator platforms, Order of implementation, Ownership in the current repository, PayPal adapter, Persistence (+7 more)

### Community 17 - "Backend delivery run"
Cohesion: 0.25
Nodes (7): Backend delivery run, Current phase, Evidence and constraints, Outcome and authority, Planned acceptance, Throughput checkpoint, Workflow

### Community 18 - "Delivery findings"
Cohesion: 0.50
Nodes (3): Delivery findings, design-critic-r1-1, design-critic-r1-2

### Community 23 - "Unit 1 result"
Cohesion: 0.29
Nodes (6): Delivered, Files and scope notes, Limitations, Unit 1 result, Unit 1 review follow-up, Verification

### Community 24 - "store.ts"
Cohesion: 0.06
Nodes (69): ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), definePolicySnapshot(), draftMandateRevision(), DraftRevisionResult, loadMandateAuthority() (+61 more)

### Community 25 - "application.ts"
Cohesion: 0.14
Nodes (31): wireOperation(), Mandate, ApplicationBackendConfig, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend() (+23 more)

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.12
Nodes (36): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog (+28 more)

### Community 27 - "fake.ts"
Cohesion: 0.11
Nodes (20): FakeProviderGateway, FakeProviderScenario, loadProviderRow(), openProviderDatabase(), ProviderRow, RawRow, readString(), ApplyOutcome (+12 more)

### Community 28 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.08
Nodes (23): Change (exact), Checks, Checks, Checks, Checks, Delivered, Deviations, Deviations (+15 more)

### Community 29 - "cli/src/backend.test.ts"
Cohesion: 0.22
Nodes (3): BackendFixture, entry, root

### Community 30 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 32 - "index.ts"
Cohesion: 0.10
Nodes (32): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshot (+24 more)

### Community 33 - "client.mock.test.ts"
Cohesion: 0.17
Nodes (11): BackendRequest, BackendRequestSchema, BackendResponseSchema, BackendClient, BackendProtocolError, BackendTransport, createBackendClient(), cart (+3 more)

### Community 34 - "mock.ts"
Cohesion: 0.17
Nodes (14): BackendErrorCode, BackendMethod, BackendMethodSchema, Operation, MAX_AMOUNT_MINOR, canonicalCart(), canonicalize(), compareText() (+6 more)

### Community 35 - "submitProposal"
Cohesion: 0.39
Nodes (8): createMock(), createMockBackend(), findMandate(), handleValidRequest(), submitProposal(), errorResponse(), identityKey(), projectedTotal()

## Knowledge Gaps
- **271 isolated node(s):** `name`, `private`, `type`, `description`, `root` (+266 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 325 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fromMinor()` connect `index.ts` to `paypal-spike.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `createExecutionWorker()` connect `worker.ts` to `store.ts`, `worker.test.ts`, `cli/src/backend.ts`, `fake.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `openLedgerStore()` connect `store.ts` to `worker.test.ts`, `worker.ts`, `application.ts`, `cli/src/backend.ts`, `fake.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _271 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `worker.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07662337662337662 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07013574660633484 - nodes in this community are weakly interconnected._
- **Should `worker.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10884353741496598 - nodes in this community are weakly interconnected._