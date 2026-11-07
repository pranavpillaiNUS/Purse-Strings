# Graph Report - Splittap-pay  (2026-11-07)

## Corpus Check
- 118 files · ~134,512 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1250 nodes · 2896 edges · 80 communities (72 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2c30eb83`
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
- model.ts
- cli/src/backend.ts
- execution/worker.test.ts
- backend-transport.test.ts
- shopper.ts
- seeds.test.ts
- index.ts
- paypal-provider.ts
- tests/store.test.ts
- src/store.test.ts
- openLedgerStore
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- agent/src/mandate.ts
- ref_node_test
- CLI-first architecture
- createExecutionWorker
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- application.ts
- worker-paypal.test.ts
- CatalogSchema
- ledger/store.ts
- Backend delivery design (accepted specification with implementation status)
- fake.ts
- ref_node_fs
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- Unit 2 result: trusted authority and SQLite atomic reservations
- src/worker.test.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- cli/src/backend.test.ts
- Backend wire API (simulation) and the PayPal gateway contract
- client.test.ts
- paypal/client.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- execution/test-worker.ts
- ref_node_assert
- src/worker.ts
- createSession
- paypal-provider.test.ts
- cli/src/mandate.test.ts
- Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen
- shop-draft.test.ts
- ExecutionWorker
- backend-session.ts
- control.ts
- money.ts
- canonicalize
- createExecutionProvider
- ConfirmationRow

## God Nodes (most connected - your core abstractions)
1. `openLedgerStore()` - 36 edges
2. `handleCommand()` - 29 edges
3. `confirmMandateRevision()` - 28 edges
4. `createFixtureSupplier()` - 26 edges
5. `CatalogSchema` - 24 edges
6. `createExecutionWorker()` - 24 edges
7. `draftMandateRevision()` - 23 edges
8. `createApplicationBackend()` - 22 edges
9. `canonicalize()` - 22 edges
10. `definePolicySnapshot()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `LoadedConfig` --references--> `Catalog`  [EXTRACTED]
  apps/cli/src/backend.ts → packages/contracts/src/index.ts
- `providerFacts()` --calls--> `loadPayPalBindingRow()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/ledger/store.ts
- `loadSnapshotSet()` --calls--> `canonicalize()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/ledger/store.ts
- `ConfiguredCatalog` --references--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/suppliers/src/fixture.ts
- `buildSuppliers()` --calls--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/suppliers/src/fixture.ts

## Import Cycles
- None detected.

## Communities (80 total, 3 thin omitted)

### Community 0 - "concurrency.test.ts"
Cohesion: 0.11
Nodes (18): Harness, NarrowingCase, OpenChildRun, SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH, WorkerResult, asConfirmedMandate() (+10 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.12
Nodes (25): BUDGET, capture(), captureCart(), CART_A, CART_B, CART_C, checkCapture(), describe() (+17 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.08
Nodes (36): CaptureAuthorizationInput, GetCaptureInput, RefundCaptureInput, approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody(), authorizeInput (+28 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (24): description, devDependencies, @types/node, typescript, engines, node, license, name (+16 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.05
Nodes (54): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendMethod, BackendMethodSchema, BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema (+46 more)

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
Cohesion: 0.10
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
Cohesion: 0.16
Nodes (26): loadActiveAuthority(), parseStoredPolicy(), AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult, loadMandateAuthority() (+18 more)

### Community 25 - "model.ts"
Cohesion: 0.11
Nodes (17): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+9 more)

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.13
Nodes (37): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, createPrivateRuntimeDirectory() (+29 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.11
Nodes (18): Quote, ConfiguredSupplier, ExecutionSupplier, auditDetailsFor(), ChildOperation, ChildResult, effectRow(), EXEC_WORKER_PATH (+10 more)

### Community 28 - "backend-transport.test.ts"
Cohesion: 0.29
Nodes (7): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendTransport

### Community 29 - "shopper.ts"
Cohesion: 0.11
Nodes (23): BackendErrorCode, Operation, BudgetSnapshot, CartSubmission, EligibilityResult, BackendSessionError, AcceptedSubmission, CartEstimate (+15 more)

### Community 30 - "seeds.test.ts"
Cohesion: 0.24
Nodes (16): ConfiguredCatalog, integerOption(), runStore(), Catalog, ref_node_path, FIXTURE_SEEDS, fixtureDirectory, isWithin() (+8 more)

### Community 32 - "index.ts"
Cohesion: 0.12
Nodes (23): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshotSchema (+15 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.11
Nodes (25): ApplyOutcome, ExecutionProvider, LookupOutcome, ProviderAnswer, AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult (+17 more)

### Community 34 - "tests/store.test.ts"
Cohesion: 0.15
Nodes (23): ref_node_sqlite, resolveIdentities(), validateCaptureGate(), applyMigrations(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION (+15 more)

### Community 35 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 36 - "openLedgerStore"
Cohesion: 0.32
Nodes (14): ledger(), definePolicySnapshot(), draftMandateRevision(), createHarness(), seedBinding(), seedRefundEffect(), createHarness(), seedConfirmedStore() (+6 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.12
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.25
Nodes (8): Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status, The shopper

### Community 39 - "shop.ts"
Cohesion: 0.18
Nodes (24): bundled(), printable(), printOrigin(), printProposal(), readJson(), runMandate(), buildModel(), buildTransport() (+16 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "agent/src/mandate.ts"
Cohesion: 0.12
Nodes (21): PolicySchema, compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DraftOrigin (+13 more)

### Community 42 - "ref_node_test"
Cohesion: 0.16
Nodes (15): CartSubmissionSchema, MAX_AMOUNT_MINOR, ref_node_readline, ref_node_test, raw, readLine(), runSubmit(), runVerify() (+7 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.27
Nodes (25): effectKey(), callBounded(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim(), createIntent(), execute() (+17 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.08
Nodes (27): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, CaptureEvidence, CreateAuthorizationOrderInput (+19 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (5): One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "application.ts"
Cohesion: 0.13
Nodes (27): LoadedConfig, Mandate, Policy, ApplicationBackendConfig, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields() (+19 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.10
Nodes (17): authorizationCapturedRoute(), authorizationDeniedRoute(), bindingState(), capturedAmount(), captureReadRoute(), captureRoute(), ChildOperation, ChildResult (+9 more)

### Community 49 - "CatalogSchema"
Cohesion: 0.12
Nodes (15): CatalogSchema, createOfflineShoppingSession(), ShoppingToolErrorCode, build, catalog, getCatalog(), line, mandate (+7 more)

### Community 50 - "ledger/store.ts"
Cohesion: 0.09
Nodes (31): openProviderDatabase(), payPalLookupRefund(), ClockSample, GateResult, RunContext, TERMINAL_STATUSES, assertLeaseHeld(), claimLeaseRow() (+23 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.10
Nodes (20): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+12 more)

### Community 52 - "fake.ts"
Cohesion: 0.22
Nodes (5): FakeProviderGateway, loadProviderRow(), ProviderRow, RawRow, readString()

### Community 53 - "ref_node_fs"
Cohesion: 0.15
Nodes (9): entry, fixedClock, root, ref_node_fs, ref_node_os, ref_node_url, root, fixtureDirectory (+1 more)

### Community 54 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.08
Nodes (25): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Change (exact), Checks, Checks, Checks, Checks, Delivered, Deviations (+17 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "src/worker.test.ts"
Cohesion: 0.15
Nodes (13): shop(), createBackendClient(), createBackendShoppingSession(), recording(), createScriptedModel(), build, laptops, mandate (+5 more)

### Community 57 - "agent/package.json"
Cohesion: 0.20
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, zod, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery + mocked contract coverage ONLY (real feasibility unverified), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "cli/src/backend.test.ts"
Cohesion: 0.18
Nodes (4): BackendFixture, entry, root, ref_node_child_process

### Community 60 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.22
Nodes (9): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Provider selection and credentials (unit 5), Replay, cart identity and idempotency aliases, Starting point: the operator CLI, The contract mock, and why accepting a mock result proves nothing, The four shared methods (rpc) (+1 more)

### Community 61 - "client.test.ts"
Cohesion: 0.21
Nodes (6): createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError

### Community 62 - "paypal/client.ts"
Cohesion: 0.22
Nodes (12): paypalMoney, Authorization, BASE_URLS, Capture, CaptureParams, Order, PayPalClient, PayPalConfig (+4 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Delivered, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Blocked on Windows, Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence

### Community 65 - "execution/test-worker.ts"
Cohesion: 0.14
Nodes (17): createFakeProviderGateway(), FakeProviderScenario, PROVIDER_CALL_TIMEOUT_MS, PaymentProviderSelection, PayPalProviderScenario, harnessFetch(), paypalAdapter(), buildScriptedPayPalChild() (+9 more)

### Community 67 - "src/worker.ts"
Cohesion: 0.19
Nodes (11): ModelToolDefinition, ShoppingProgress, ToolArgsSchemas, beforeDeadline(), contractNames, deriveOutcome(), LimitsSchema, runShoppingWorker() (+3 more)

### Community 68 - "createSession"
Cohesion: 0.32
Nodes (10): createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput(), createShoppingSession(), boundedSubmit() (+2 more)

### Community 69 - "paypal-provider.test.ts"
Cohesion: 0.25
Nodes (13): authorizationReadRoute(), captureSucceededRoute(), closeHarness(), Harness, holdCreateRoutes(), json(), minorToDecimal(), refundSucceededRoute() (+5 more)

### Community 70 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 71 - "Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen"
Cohesion: 0.14
Nodes (13): Answers for the teammate (issue #16), Applied, Checks, Delivered, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations (+5 more)

### Community 72 - "shop-draft.test.ts"
Cohesion: 0.20
Nodes (6): calls, cliEntry, root, shopEntry, textFile, UnconfirmedMandateSchema

### Community 74 - "backend-session.ts"
Cohesion: 0.25
Nodes (7): BackendClient, INDETERMINATE_CODES, proposalIdempotencyKey(), REJECTION_CODES, SessionOptionsSchema, ProposalOutcome, ShoppingSession

### Community 75 - "control.ts"
Cohesion: 0.33
Nodes (6): EvidenceSchema, ref_node_crypto, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema

### Community 76 - "money.ts"
Cohesion: 0.38
Nodes (5): cart(), assertSupportedCurrency(), fromMinor(), SUPPORTED_CURRENCIES, toMinor()

### Community 77 - "canonicalize"
Cohesion: 0.40
Nodes (6): sha256CanonicalJson(), payPalLookupCapture(), commercialTerms(), canonicalCartJson(), canonicalize(), compareText()

### Community 78 - "createExecutionProvider"
Cohesion: 0.33
Nodes (5): createExecutionProvider(), payPalApply(), isUsableIdentity(), openLedgerReadConnection(), parseCaptureRequest()

### Community 79 - "ConfirmationRow"
Cohesion: 0.50
Nodes (5): ValidatedMandateRead, MandateAuthority, ConfirmationRow, PolicyRow, RevisionRow

## Knowledge Gaps
- **471 isolated node(s):** `name`, `private`, `type`, `description`, `request` (+466 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 587 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createFixtureSupplier()` connect `ref_node_test` to `index.ts`, `execution/test-worker.ts`, `concurrency.test.ts`, `openLedgerStore`, `shop.test.ts`, `contracts/src/backend.ts`, `paypal-provider.test.ts`, `worker-paypal.test.ts`, `cli/src/backend.ts`, `execution/worker.test.ts`, `seeds.test.ts`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `CatalogSchema` connect `CatalogSchema` to `index.ts`, `execution/test-worker.ts`, `concurrency.test.ts`, `src/store.test.ts`, `contracts/src/backend.ts`, `shop.test.ts`, `ref_node_test`, `control.ts`, `application.ts`, `ledger/store.ts`, `cli/src/backend.ts`, `shopper.ts`, `seeds.test.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `createPayPalGateway()` connect `execution/test-worker.ts` to `gateway.test.ts`, `paypal-provider.test.ts`, `paypal/gateway.ts`, `cli/src/backend.ts`, `client.test.ts`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _471 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `concurrency.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11330049261083744 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1225071225071225 - nodes in this community are weakly interconnected._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0782051282051282 - nodes in this community are weakly interconnected._