# Graph Report - Splittap-pay  (2026-11-06)

## Corpus Check
- 114 files · ~114,884 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1130 nodes · 2556 edges · 67 communities (60 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8bd0d8b3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- concurrency.test.ts
- paypal-spike.ts
- gateway.test.ts
- package.json
- contracts/src/backend.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- mandate-drafter.test.ts
- checker/package.json
- suppliers/package.json
- README.md
- The shopper
- CLI backend delivery specification
- Team scope and framework assessment
- Backend delivery run
- Delivery findings
- Unit 1 result
- authority.ts
- src/worker.test.ts
- cli/src/backend.ts
- execution/worker.test.ts
- backend-transport.test.ts
- shopper.ts
- control-files.ts
- index.ts
- cli/src/mandate.test.ts
- mock.ts
- src/store.test.ts
- shop-draft.test.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- agent/src/mandate.ts
- tests/test-worker.ts
- CLI-first architecture
- execution/worker.ts
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- application.ts
- tests/store.test.ts
- ref_node_fs
- ledger/store.ts
- Backend delivery design (accepted specification with implementation status)
- paypal/client.ts
- ref_node_path
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- Unit 2 result: trusted authority and SQLite atomic reservations
- client.test.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- cli/src/backend.test.ts
- Backend wire API (simulation) and the PayPal gateway contract
- createApplicationBackend
- client.mock.test.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- createPayPalGateway
- ref_node_assert

## God Nodes (most connected - your core abstractions)
1. `openLedgerStore()` - 26 edges
2. `handleCommand()` - 24 edges
3. `CatalogSchema` - 24 edges
4. `confirmMandateRevision()` - 24 edges
5. `createExecutionWorker()` - 24 edges
6. `createFixtureSupplier()` - 22 edges
7. `draftMandateRevision()` - 19 edges
8. `phaseCapture()` - 19 edges
9. `MandateSchema` - 18 edges
10. `createApplicationBackend()` - 18 edges

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

## Communities (67 total, 2 thin omitted)

### Community 0 - "concurrency.test.ts"
Cohesion: 0.11
Nodes (24): definePolicySnapshot(), createHarness(), Harness, setup(), NarrowingCase, setup(), OpenChildRun, SubmitWorkerResult (+16 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.12
Nodes (27): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+19 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.11
Nodes (25): ExpectedMoney, GatewayOutcome, capBodySGD5541(), capBodyUSD(), capInvoiceOther(), captureBody(), captureInput, captureProblemHarness() (+17 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (24): description, devDependencies, @types/node, typescript, engines, node, license, name (+16 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.09
Nodes (24): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendMethod, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema (+16 more)

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

### Community 10 - "mandate-drafter.test.ts"
Cohesion: 0.11
Nodes (18): DRAFT_TOOL_NAME, draftMandateWithModel(), InputSchema, MandateDraftInput, MandateDraftOutcome, MandateDraftRun, ProposalSchema, { $schema: _dialect, ...proposalInputSchema } (+10 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "The shopper"
Cohesion: 0.20
Nodes (10): Drafting from plain English, Mandate planning, Mandate planning and the bounded shopper, Not established, Run it, Submission outcomes, Tests, The shopper (+2 more)

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
Nodes (30): extractSupplierId(), loadActiveAuthority(), parseStoredPolicy(), AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), draftMandateRevision() (+22 more)

### Community 25 - "src/worker.test.ts"
Cohesion: 0.06
Nodes (34): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+26 more)

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.14
Nodes (31): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, createPrivateRuntimeDirectory() (+23 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.13
Nodes (17): auditDetailsFor(), ChildOperation, ChildResult, effectRow(), EXEC_WORKER_PATH, Harness, operationAndReservation(), providerEffectOutcomes() (+9 more)

### Community 28 - "backend-transport.test.ts"
Cohesion: 0.25
Nodes (8): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendTransport, ref_node_child_process

### Community 29 - "shopper.ts"
Cohesion: 0.06
Nodes (47): BackendErrorCode, BackendClient, CartSubmission, BackendSessionError, INDETERMINATE_CODES, proposalIdempotencyKey(), REJECTION_CODES, SessionOptionsSchema (+39 more)

### Community 30 - "control-files.ts"
Cohesion: 0.17
Nodes (20): integerOption(), runStore(), EvidenceSchema, ref_node_crypto, ref_node_util, applyFixtureChanges(), controlSource(), FIXTURE_SEEDS (+12 more)

### Community 32 - "index.ts"
Cohesion: 0.13
Nodes (22): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshotSchema (+14 more)

### Community 33 - "cli/src/mandate.test.ts"
Cohesion: 0.28
Nodes (8): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run()

### Community 34 - "mock.ts"
Cohesion: 0.18
Nodes (18): Operation, canonicalCart(), canonicalize(), compareText(), correlationFields(), createMockBackend(), findMandate(), handleValidRequest() (+10 more)

### Community 35 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 36 - "shop-draft.test.ts"
Cohesion: 0.18
Nodes (7): calls, cliEntry, root, shopEntry, textFile, MandateDraftSchema, UnconfirmedMandateSchema

### Community 37 - "shop.test.ts"
Cohesion: 0.11
Nodes (12): fixture(), hostileB(), kit, ledger(), mock, policy, practice, request (+4 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.25
Nodes (8): Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status, The shopper

### Community 39 - "shop.ts"
Cohesion: 0.17
Nodes (25): printable(), buildModel(), buildTransport(), describeCall(), DRAFT_EXIT_CODES, EXIT_CODES, formatMinor(), main() (+17 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "agent/src/mandate.ts"
Cohesion: 0.13
Nodes (22): bundled(), printOrigin(), printProposal(), readJson(), runMandate(), compileProposal(), contentDigest(), createMandateDraft() (+14 more)

### Community 42 - "tests/test-worker.ts"
Cohesion: 0.32
Nodes (7): ref_node_readline, raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "execution/worker.ts"
Cohesion: 0.07
Nodes (52): FakeProviderGateway, FakeProviderScenario, loadProviderRow(), ProviderRow, RawRow, readString(), ApplyOutcome, effectKey() (+44 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.11
Nodes (21): PayPalExchange, CaptureAuthorizationInput, CaptureEvidence, relayFailure(), Failure, GatewayInputError, GetCaptureInput, GetRefundInput (+13 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (5): One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "application.ts"
Cohesion: 0.13
Nodes (20): ConfiguredCatalog, LoadedConfig, BackendMethodSchema, BudgetSnapshot, Catalog, Mandate, Policy, Quote (+12 more)

### Community 48 - "tests/store.test.ts"
Cohesion: 0.14
Nodes (20): ref_node_sqlite, openProviderDatabase(), commercialTerms(), validateCaptureGate(), applyMigrations(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS (+12 more)

### Community 49 - "ref_node_fs"
Cohesion: 0.12
Nodes (23): CartSubmissionSchema, CatalogSchema, MandateSchema, MAX_AMOUNT_MINOR, PolicySchema, QuoteSchema, uniqueBy(), ref_node_fs (+15 more)

### Community 50 - "ledger/store.ts"
Cohesion: 0.11
Nodes (28): resolveIdentities(), ValidatedMandateRead, MandateAuthority, assertLeaseHeld(), bindIdempotencyAlias(), claimLeaseRow(), ConfirmationRow, databasesInTransaction (+20 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.10
Nodes (20): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+12 more)

### Community 52 - "paypal/client.ts"
Cohesion: 0.18
Nodes (15): assertSupportedCurrency(), fromMinor(), paypalMoney, SUPPORTED_CURRENCIES, Authorization, BASE_URLS, Capture, CaptureParams (+7 more)

### Community 53 - "ref_node_path"
Cohesion: 0.15
Nodes (9): entry, fixedClock, root, ref_node_os, ref_node_path, ref_node_url, root, fixtureDirectory (+1 more)

### Community 54 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.08
Nodes (25): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Change (exact), Checks, Checks, Checks, Checks, Delivered, Deviations (+17 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "client.test.ts"
Cohesion: 0.21
Nodes (6): createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError

### Community 57 - "agent/package.json"
Cohesion: 0.20
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, zod, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — delivered on real-storage evidence, M3 — simulated recovery + mocked contract coverage ONLY (real feasibility unverified), Milestones M4/M5, Remaining work (no unit-4 property depends on it) (+2 more)

### Community 59 - "cli/src/backend.test.ts"
Cohesion: 0.22
Nodes (3): BackendFixture, entry, root

### Community 60 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.29
Nodes (7): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, Replay, cart identity and idempotency aliases, Starting point: the operator CLI, The contract mock, and why accepting a mock result proves nothing, The four shared methods (rpc), Unit-4 PayPal gateway (contract only — not wired into execution)

### Community 61 - "createApplicationBackend"
Cohesion: 0.31
Nodes (14): wireOperation(), authorityFailureResponse(), buildSnapshot(), buildWireOperation(), createApplicationBackend(), catalogList(), handleProposalSubmit(), handleValidRequest() (+6 more)

### Community 62 - "client.mock.test.ts"
Cohesion: 0.14
Nodes (11): BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendProtocolError, cart, cartBase, catalog (+3 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Delivered, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Blocked on Windows, Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence

### Community 65 - "createPayPalGateway"
Cohesion: 0.67
Nodes (3): createPayPalGateway(), assessAmount(), validIdHint()

## Knowledge Gaps
- **427 isolated node(s):** `name`, `private`, `type`, `description`, `request` (+422 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 533 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CatalogSchema` connect `ref_node_fs` to `index.ts`, `concurrency.test.ts`, `mock.ts`, `src/store.test.ts`, `contracts/src/backend.ts`, `shop.test.ts`, `tests/test-worker.ts`, `execution/worker.ts`, `application.ts`, `control-files.ts`, `cli/src/backend.ts`, `shopper.ts`, `client.mock.test.ts`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `MandateSchema` connect `ref_node_fs` to `index.ts`, `concurrency.test.ts`, `mock.ts`, `contracts/src/backend.ts`, `shop-draft.test.ts`, `shop.test.ts`, `agent/src/mandate.ts`, `mandate-drafter.test.ts`, `authority.ts`, `src/worker.test.ts`, `shopper.ts`, `client.mock.test.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _427 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `concurrency.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1126984126984127 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11822660098522167 - nodes in this community are weakly interconnected._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11083743842364532 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._