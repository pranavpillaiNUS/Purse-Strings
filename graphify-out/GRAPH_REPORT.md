# Graph Report - Splittap-pay  (2026-11-06)

## Corpus Check
- 110 files · ~108,085 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1086 nodes · 2436 edges · 70 communities (62 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `700079a3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- concurrency.test.ts
- paypal-spike.ts
- createExecutionWorker
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
- index.ts
- CLI backend delivery specification
- Team scope and framework assessment
- Backend delivery run
- Delivery findings
- Unit 1 result
- authority.ts
- src/worker.ts
- cli/src/backend.ts
- execution/worker.test.ts
- ref_node_assert
- shopper.ts
- src/store.test.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- client.mock.test.ts
- mock.ts
- paypal/gateway.ts
- gateway.test.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- Backend delivery design (accepted specification with implementation status)
- Splittap purchasing agent
- backend-transport.test.ts
- src/worker.test.ts
- CLI-first architecture
- model.ts
- fake.ts
- PayPal sandbox spike (build step 1)
- application.ts
- Confirmation and stock: integration status
- paypal/client.ts
- ledger/store.ts
- shop.ts
- openLedgerStore
- The shopper
- client.test.ts
- Unit 2 result: trusted authority and SQLite atomic reservations
- Acceptance evidence trail (offline, all reproducible below)
- agent/package.json
- execution/worker.ts
- createMockBackend
- seeds.test.ts
- Backend wire API (simulation) and the PayPal gateway contract
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- BackendResponse
- createPayPalGateway
- createFixtureSupplier
- Catalog
- cli/src/mandate.test.ts
- ref_node_fs
- control.ts

## God Nodes (most connected - your core abstractions)
1. `openLedgerStore()` - 26 edges
2. `handleCommand()` - 24 edges
3. `CatalogSchema` - 24 edges
4. `confirmMandateRevision()` - 24 edges
5. `createExecutionWorker()` - 24 edges
6. `createFixtureSupplier()` - 22 edges
7. `draftMandateRevision()` - 19 edges
8. `phaseCapture()` - 19 edges
9. `createApplicationBackend()` - 18 edges
10. `handleProposalSubmit()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `LoadedConfig` --references--> `Catalog`  [EXTRACTED]
  apps/cli/src/backend.ts → packages/contracts/src/index.ts
- `loadSnapshotSet()` --calls--> `canonicalize()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/ledger/store.ts
- `ConfiguredCatalog` --references--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/suppliers/src/fixture.ts
- `buildSuppliers()` --calls--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/suppliers/src/fixture.ts
- `operationRow()` --calls--> `loadOperationStorageRow()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/ledger/store.ts

## Import Cycles
- None detected.

## Communities (70 total, 3 thin omitted)

### Community 0 - "concurrency.test.ts"
Cohesion: 0.11
Nodes (22): createHarness(), Harness, NarrowingCase, digestOf(), OpenChildRun, SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH (+14 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.12
Nodes (27): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+19 more)

### Community 2 - "createExecutionWorker"
Cohesion: 0.25
Nodes (26): effectKey(), callBounded(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim(), createIntent(), execute() (+18 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (24): description, devDependencies, @types/node, typescript, engines, node, license, name (+16 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.10
Nodes (22): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema (+14 more)

### Community 5 - "Hackathon project: an AI purchasing agent that can't overspend"
Cohesion: 0.11
Nodes (19): Answers to likely judge questions, Architecture, Decision log, Demo script, Design rules (non-negotiable), Hackathon project: an AI purchasing agent that can't overspend, How it works, Judging criteria (+11 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (17): apps/**/*.ts, node, packages/**/*.ts, services/**/*.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, module (+9 more)

### Community 7 - "Project scope: CLI-first equipment procurement"
Cohesion: 0.15
Nodes (13): Acceptance scenarios for stage one, Decisions the product must make, Delivered scaffold: M0, Excluded until a production scope, Implementation status, Outcomes and improvement loop, Payment and business-model gate, Product decision (+5 more)

### Community 8 - "contracts/package.json"
Cohesion: 0.25
Nodes (7): dependencies, zod, description, zod, name, private, type

### Community 9 - "cli/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 10 - "agent/src/mandate.ts"
Cohesion: 0.13
Nodes (23): bundled(), printProposal(), readJson(), runMandate(), PolicySchema, compileProposal(), contentDigest(), createMandateDraft() (+15 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "index.ts"
Cohesion: 0.13
Nodes (19): amount, BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, currency, id, MAX_AMOUNT_MINOR, QuoteLineSchema (+11 more)

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

### Community 24 - "authority.ts"
Cohesion: 0.13
Nodes (29): loadActiveAuthority(), parseStoredPolicy(), ValidatedMandateRead, AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult (+21 more)

### Community 25 - "src/worker.ts"
Cohesion: 0.13
Nodes (14): describe(), prompt, ModelCallError, ShoppingProgress, ToolArgsSchemas, beforeDeadline(), contractNames, deriveOutcome() (+6 more)

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.13
Nodes (33): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, createPrivateRuntimeDirectory() (+25 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.11
Nodes (17): Quote, ExecutionSupplier, auditDetailsFor(), ChildOperation, ChildResult, effectRow(), EXEC_WORKER_PATH, Harness (+9 more)

### Community 29 - "shopper.ts"
Cohesion: 0.05
Nodes (53): BackendErrorCode, Operation, BackendClient, BudgetSnapshot, CartSubmission, Mandate, BackendSessionError, INDETERMINATE_CODES (+45 more)

### Community 30 - "src/store.test.ts"
Cohesion: 0.10
Nodes (17): BackendFixture, entry, root, entry, fixedClock, root, check(), entry (+9 more)

### Community 32 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.08
Nodes (25): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Change (exact), Checks, Checks, Checks, Checks, Delivered, Deviations (+17 more)

### Community 33 - "client.mock.test.ts"
Cohesion: 0.16
Nodes (11): BackendRequest, BackendRequestSchema, BackendResponseSchema, BackendProtocolError, BackendTransport, cart, cartBase, catalog (+3 more)

### Community 34 - "mock.ts"
Cohesion: 0.21
Nodes (12): BackendMethod, BackendMethodSchema, OperationGetResultSchema, canonicalCart(), canonicalize(), compareText(), correlationFields(), MockBackend (+4 more)

### Community 35 - "paypal/gateway.ts"
Cohesion: 0.11
Nodes (21): PayPalExchange, CaptureAuthorizationInput, CaptureEvidence, relayFailure(), Failure, GatewayInputError, GetCaptureInput, GetRefundInput (+13 more)

### Community 36 - "gateway.test.ts"
Cohesion: 0.11
Nodes (25): ExpectedMoney, GatewayOutcome, capBodySGD5541(), capBodyUSD(), capInvoiceOther(), captureBody(), captureInput, captureProblemHarness() (+17 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.12
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.25
Nodes (8): Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status, The shopper

### Community 39 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.10
Nodes (20): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+12 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "backend-transport.test.ts"
Cohesion: 0.33
Nodes (6): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport()

### Community 42 - "src/worker.test.ts"
Cohesion: 0.16
Nodes (13): shop(), createBackendClient(), createBackendShoppingSession(), createScriptedModel(), runShoppingWorker(), build, laptops, mandate (+5 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "model.ts"
Cohesion: 0.14
Nodes (12): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, ModelConversation, ModelPrompt, ModelToolCall, ModelToolDefinition, ModelToolResult (+4 more)

### Community 45 - "fake.ts"
Cohesion: 0.11
Nodes (18): FakeProviderGateway, FakeProviderScenario, loadProviderRow(), ProviderRow, RawRow, readString(), ApplyOutcome, ExecutionProvider (+10 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (5): One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "application.ts"
Cohesion: 0.17
Nodes (23): wireOperation(), ApplicationBackendConfig, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend(), catalogList() (+15 more)

### Community 48 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Blocked on Windows, Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence

### Community 49 - "paypal/client.ts"
Cohesion: 0.18
Nodes (15): assertSupportedCurrency(), fromMinor(), paypalMoney, SUPPORTED_CURRENCIES, Authorization, BASE_URLS, Capture, CaptureParams (+7 more)

### Community 50 - "ledger/store.ts"
Cohesion: 0.12
Nodes (33): ref_node_sqlite, resolveIdentities(), openProviderDatabase(), applyMigrations(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION (+25 more)

### Community 51 - "shop.ts"
Cohesion: 0.25
Nodes (14): buildModel(), buildTransport(), describeCall(), EXIT_CODES, formatMinor(), main(), modelApiKey(), positiveInteger() (+6 more)

### Community 52 - "openLedgerStore"
Cohesion: 0.27
Nodes (14): ledger(), definePolicySnapshot(), draftMandateRevision(), sha256CanonicalJson(), seedConfirmedStore(), canonicalCartJson(), canonicalize(), compareText() (+6 more)

### Community 53 - "The shopper"
Cohesion: 0.22
Nodes (9): Mandate planning, Mandate planning and the bounded shopper, Not established, Run it, Submission outcomes, Tests, The shopper, Tools (+1 more)

### Community 54 - "client.test.ts"
Cohesion: 0.21
Nodes (6): createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — delivered on real-storage evidence, M3 — simulated recovery + mocked contract coverage ONLY (real feasibility unverified), Milestones M4/M5, Remaining work (no unit-4 property depends on it) (+2 more)

### Community 57 - "agent/package.json"
Cohesion: 0.20
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, zod, description, zod, name, private (+1 more)

### Community 58 - "execution/worker.ts"
Cohesion: 0.10
Nodes (17): ClockSample, ExecutionWorker, GateResult, RunContext, TERMINAL_STATUSES, assertLeaseHeld(), claimLeaseRow(), consumeReservationRow() (+9 more)

### Community 59 - "createMockBackend"
Cohesion: 0.39
Nodes (8): createMockBackend(), findMandate(), handleValidRequest(), submitProposal(), errorResponse(), identityKey(), projectedTotal(), mockTransport()

### Community 60 - "seeds.test.ts"
Cohesion: 0.21
Nodes (16): integerOption(), runStore(), ref_node_path, FIXTURE_SEEDS, fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog() (+8 more)

### Community 61 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.29
Nodes (7): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, Replay, cart identity and idempotency aliases, Starting point: the operator CLI, The contract mock, and why accepting a mock result proves nothing, The four shared methods (rpc), Unit-4 PayPal gateway (contract only — not wired into execution)

### Community 62 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Delivered, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation

### Community 64 - "createPayPalGateway"
Cohesion: 0.67
Nodes (3): createPayPalGateway(), assessAmount(), validIdHint()

### Community 65 - "createFixtureSupplier"
Cohesion: 0.19
Nodes (14): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), Check, EligibilityResult (+6 more)

### Community 66 - "Catalog"
Cohesion: 0.22
Nodes (10): ConfiguredCatalog, Catalog, ref_node_readline, ConfiguredSupplier, raw, readLine(), runSubmit(), runVerify() (+2 more)

### Community 67 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 68 - "ref_node_fs"
Cohesion: 0.28
Nodes (5): ref_node_fs, ref_node_test, root, input(), load()

### Community 69 - "control.ts"
Cohesion: 0.33
Nodes (6): EvidenceSchema, ref_node_crypto, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema

## Knowledge Gaps
- **412 isolated node(s):** `name`, `private`, `type`, `description`, `request` (+407 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 511 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CatalogSchema` connect `index.ts` to `concurrency.test.ts`, `client.mock.test.ts`, `mock.ts`, `Catalog`, `contracts/src/backend.ts`, `shop.test.ts`, `execution/worker.ts`, `ref_node_fs`, `control.ts`, `fake.ts`, `application.ts`, `cli/src/backend.ts`, `seeds.test.ts`, `shopper.ts`, `src/store.test.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `createExecutionWorker()` connect `createExecutionWorker` to `execution/worker.ts`, `fake.ts`, `openLedgerStore`, `cli/src/backend.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `createPayPalGateway()` connect `createPayPalGateway` to `paypal/gateway.ts`, `gateway.test.ts`, `client.test.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _412 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `concurrency.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1140819964349376 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11822660098522167 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._