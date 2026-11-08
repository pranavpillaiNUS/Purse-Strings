# Graph Report - Splittap-pay  (2026-11-08)

## Corpus Check
- 145 files · ~197,705 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 1746 nodes · 4343 edges · 87 communities (79 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 146 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8e457287`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- contracts/src/backend.test.ts
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
- ledger/store.ts
- src/worker.ts
- cli/src/backend.ts
- execution/worker.test.ts
- backend-transport.test.ts
- dashboard-state.ts
- ref_node_path
- index.ts
- paypal-provider.ts
- app.js
- Backend wire API (simulation) and the PayPal gateway contract
- review-output.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- BackendResponse
- dashboard.test.ts
- CLI-first architecture
- createExecutionWorker
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- dashboard.ts
- worker-paypal.test.ts
- demo-flow.test.ts
- canonicalize
- Backend delivery design (accepted specification with implementation status)
- execution/worker.ts
- shopper.test.ts
- Unit 2 result: trusted authority and SQLite atomic reservations
- shopper.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- saved-review-cli.test.ts
- Devpost description draft
- mock.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- ci.yml
- review.ts
- ref_node_child_process
- Detailed implementation decisions
- saved-review.ts
- Delivered
- Setting up a new device
- evaluatePurchase
- backend-session.ts
- client.mock.test.ts
- ClientNode
- client.test.ts
- paypal/client.ts
- saved-review.test.ts
- ref_node_fs
- paypal-provider.test.ts
- ExecutionWorker
- createPayPalGateway
- application.ts
- cli/src/mandate.test.ts
- application.ts
- createMockBackend
- agent/README.md

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 45 edges
2. `openLedgerStore()` - 42 edges
3. `createApplicationBackend()` - 33 edges
4. `handleCommand()` - 32 edges
5. `canonicalize()` - 29 edges
6. `confirmMandateRevision()` - 28 edges
7. `main()` - 27 edges
8. `createFixtureSupplier()` - 27 edges
9. `renderRunReview()` - 25 edges
10. `runTransaction()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `PayPal gateway (unit-4 contract + unit-5 sandbox additions)` --references--> `GatewayInputError`  [INFERRED]
  docs/backend-api.md → services/checker/src/paypal/gateway.ts
- `Delivered` --references--> `GatewayUnknown`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/paypal/gateway.ts
- `Authority and evidence` --references--> `BudgetSnapshot`  [INFERRED]
  docs/architecture.md → packages/contracts/src/index.ts
- `M0 — delivered by the scaffold` --references--> `BudgetSnapshot`  [INFERRED]
  docs/backend-delivery-review.md → packages/contracts/src/index.ts
- `Observations (records, no code)` --references--> `authorizeOperationHold()`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/execution/paypal-provider.ts

## Import Cycles
- None detected.

## Communities (87 total, 8 thin omitted)

### Community 0 - "contracts/src/backend.test.ts"
Cohesion: 0.17
Nodes (10): BackendErrorResponseSchema, CatalogListResultSchema, MandateGetResultSchema, OperationGetResultSchema, OperationSchema, cart, catalog, mandate (+2 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.11
Nodes (26): BUDGET, capture(), captureCart(), Cart, CART_A, CART_B, CART_C, checkCapture() (+18 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.08
Nodes (35): approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody(), authorizeInput, authorizeRoute(), capBodySGD5541(), capBodyUSD() (+27 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (23): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+15 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.15
Nodes (12): BackendSuccessResponseSchema, CatalogListRequestSchema, EffectStatusSchema, MandateGetRequestSchema, mandateVersion, OperationGetRequestSchema, OperationStatusSchema, PaymentProviderSchema (+4 more)

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

### Community 10 - "mandate-drafter.test.ts"
Cohesion: 0.07
Nodes (38): compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DRAFT_TOOL_NAME, draftMandateWithModel() (+30 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 13 - "README.md"
Cohesion: 0.16
Nodes (8): Before you record, Demo script, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), The script, What not to say, With the dashboard beside the terminal, Historical hackathon plan (superseded), Durable ledger (M2 slice — authority + reservations)

### Community 14 - "The shopper"
Cohesion: 0.25
Nodes (8): BackendClient, Live runs, Read-only status, Run it, Save and replay a review, Submission outcomes, The shopper, Tools

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
Cohesion: 0.25
Nodes (7): Delivered, Files and scope notes, Limitations, Unit 1 result, Unit 1 review follow-up, Verification, projectedTotal()

### Community 24 - "ledger/store.ts"
Cohesion: 0.08
Nodes (52): resolveIdentities(), ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult, loadMandateAuthority(), loadPolicySnapshot() (+44 more)

### Community 25 - "src/worker.ts"
Cohesion: 0.07
Nodes (32): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+24 more)

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.06
Nodes (66): assertDistinctDatabases(), assertPrivateWindowsDatabase(), assertPrivateWindowsDirectory(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS (+58 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.10
Nodes (10): Quote, ChildOperation, ChildResult, EXEC_WORKER_PATH, Harness, submitOperation(), suppliersFor(), TEST_CLOCK_MS (+2 more)

### Community 28 - "backend-transport.test.ts"
Cohesion: 0.29
Nodes (6): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport()

### Community 29 - "dashboard-state.ts"
Cohesion: 0.08
Nodes (30): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, DashboardOperation, DashboardReader, DashboardStore, DEMO_SESSION_FILE (+22 more)

### Community 30 - "ref_node_path"
Cohesion: 0.16
Nodes (21): ConfiguredCatalog, integerOption(), runStore(), Catalog, EvidenceSchema, ExecutionSupplier, applyFixtureChanges(), controlSource() (+13 more)

### Community 32 - "index.ts"
Cohesion: 0.09
Nodes (34): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshotSchema (+26 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.15
Nodes (29): Delivered, AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, payPalApply(), describeUnknown() (+21 more)

### Community 34 - "app.js"
Cohesion: 0.25
Nodes (23): card(), chip(), date(), dateTime(), eventText(), h(), lookup(), money() (+15 more)

### Community 35 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.33
Nodes (6): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Private runtime folders, Provider selection and credentials (unit 5), Starting point: the operator CLI

### Community 36 - "review-output.ts"
Cohesion: 0.09
Nodes (55): formatSgd(), ascii(), ASCII_FOLDS, bar(), barLine(), briefNextStepLines(), briefRefusalLine(), briefSummaryBody() (+47 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (13): fixture(), hostileB(), kit, mock, policy, practice, request, root (+5 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.20
Nodes (10): Dashboard, Demo flow, Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here (+2 more)

### Community 39 - "shop.ts"
Cohesion: 0.16
Nodes (30): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), readLedgerFacts() (+22 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.22
Nodes (8): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent

### Community 42 - "dashboard.test.ts"
Cohesion: 0.12
Nodes (15): assertReadOnlyCommand(), commandAction(), CommandResult, CommandRunner, createProcessRunner(), DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), DashboardSource (+7 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.19
Nodes (39): database(), Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Delivered, Minors, effectKey(), callBounded(), createExecutionWorker(), callProvider() (+31 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.06
Nodes (34): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, AuthorizeOutcome, CaptureAuthorizationInput (+26 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (6): Application path (exercised 2026-11-07, PR #17 tree + one live fix), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "dashboard.ts"
Cohesion: 0.16
Nodes (16): commandId(), createDashboardServer(), DashboardAssets, DashboardServerOptions, descendants(), renderClient(), loadDashboardAssets(), main() (+8 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.07
Nodes (39): ledger(), Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, definePolicySnapshot(), draftMandateRevision() (+31 more)

### Community 49 - "demo-flow.test.ts"
Cohesion: 0.06
Nodes (62): awaitEnter(), checkSummary(), childEnvironment(), DEMO_SCENES, DEMO_SESSION_FILE, demoBackendConfig(), DemoFailure, DemoPlan (+54 more)

### Community 50 - "canonicalize"
Cohesion: 0.21
Nodes (13): sha256CanonicalJson(), createExecutionProvider(), payPalLookupCapture(), payPalLookupRefund(), openLedgerReadConnection(), seedRefundEffect(), commercialTerms(), canonicalCartJson() (+5 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.15
Nodes (13): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), Current system and sources, Detailed implementation plan, Durable fake execution, Goals and exclusions, Implementation status (addendum, accurate as of unit 4, 2026-11-06) (+5 more)

### Community 52 - "execution/worker.ts"
Cohesion: 0.09
Nodes (29): createFakeProviderGateway(), FakeProviderGateway, FakeProviderScenario, loadProviderRow(), openProviderDatabase(), ProviderRow, RawRow, readString() (+21 more)

### Community 54 - "shopper.test.ts"
Cohesion: 0.11
Nodes (23): catalogFacts(), createOfflineShoppingSession(), createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput() (+15 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.09
Nodes (24): Operation, BudgetSnapshot, CartSubmission, EligibilityResult, Mandate, LedgerFacts, StatusView, StoreDecision (+16 more)

### Community 57 - "agent/package.json"
Cohesion: 0.24
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery, mocked contracts and limited manual observations (incomplete), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.08
Nodes (29): built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview(), CSI_C1 (+21 more)

### Community 60 - "saved-review-cli.test.ts"
Cohesion: 0.17
Nodes (7): catalogFile, entry, lines, mandateFile, mockArgs, root, MAX_SAVED_REVIEW_BYTES

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (16): AI tools list, Checklist, Devpost description draft, How AI is used, How it works, How PayPal is used, In the product, Judge access: proposal (+8 more)

### Community 62 - "mock.ts"
Cohesion: 0.21
Nodes (12): BackendMethod, BackendMethodSchema, ProposalSubmitResultSchema, canonicalCart(), canonicalize(), compareText(), correlationFields(), MockBackend (+4 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation, ExpectedMoney

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.06
Nodes (46): BackendErrorCodeSchema, amount, BackendKind, BudgetView, budgetView(), buildRunReview(), CartBuildSchema, CartSubmitSchema (+38 more)

### Community 68 - "ref_node_child_process"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 69 - "Detailed implementation decisions"
Cohesion: 0.29
Nodes (7): CLI contract, Concrete storage, Detailed implementation decisions, Exact wire shapes, Lease and provider behavior, Readiness resolutions: imports and PayPal adapter, Review resolutions: cart identity and capture retries

### Community 70 - "saved-review.ts"
Cohesion: 0.08
Nodes (28): canonical(), prepareSavedReviewFile(), present(), SavedReviewDestination, OUTCOME_SENTENCES, aggregateMinor, BudgetSchema, CheckGroupSchema (+20 more)

### Community 71 - "Delivered"
Cohesion: 0.17
Nodes (11): Answers for the teammate (issue #16), Checks, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations, Observations (records, no code), Original operation schema proposal (superseded by issue #16 follow-up) (+3 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.25
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "evaluatePurchase"
Cohesion: 0.13
Nodes (14): Checks, Checks, Deviations, Deviations, Goldfish review round 1 (2026-11-05), Goldfish review round 2 (2026-11-05), Honest boundaries, Majors (+6 more)

### Community 74 - "backend-session.ts"
Cohesion: 0.15
Nodes (13): BackendErrorCode, BackendSessionError, INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES, resendUnresolvedCarts(), ResentCart (+5 more)

### Community 75 - "client.mock.test.ts"
Cohesion: 0.19
Nodes (9): BackendRequest, BackendRequestSchema, BackendResponseSchema, BackendProtocolError, cart, cartBase, catalog, createMock() (+1 more)

### Community 79 - "client.test.ts"
Cohesion: 0.20
Nodes (8): Delivered, createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError, DENIED()

### Community 81 - "paypal/client.ts"
Cohesion: 0.22
Nodes (12): PayPalMoney, Authorization, BASE_URLS, Capture, CaptureParams, Order, PayPalClient, PayPalConfig (+4 more)

### Community 82 - "saved-review.test.ts"
Cohesion: 0.22
Nodes (19): Team, ownership and branches, fixture(), review(), shop(), BackendTransport, createBackendClient(), createMockBackend(), createBackendShoppingSession() (+11 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.10
Nodes (13): entry, fixedClock, root, calls, cliEntry, root, shopEntry, textFile (+5 more)

### Community 84 - "paypal-provider.test.ts"
Cohesion: 0.09
Nodes (35): reviewMandateRevision(), authorizationReadRoute(), captureSucceededRoute(), closeHarness(), Harness, harnessFetch(), holdCreateRoutes(), json() (+27 more)

### Community 87 - "createPayPalGateway"
Cohesion: 0.29
Nodes (9): cart(), assertSupportedCurrency(), fromMinor(), paypalMoney(), SUPPORTED_CURRENCIES, toMinor(), createPayPalGateway(), assessAmount() (+1 more)

### Community 89 - "application.ts"
Cohesion: 0.21
Nodes (20): wireOperation(), authorityFailureResponse(), buildSnapshot(), buildWireOperation(), createApplicationBackend(), catalogList(), handleProposalSubmit(), handleValidRequest() (+12 more)

### Community 90 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 91 - "application.ts"
Cohesion: 0.12
Nodes (18): LoadedConfig, PaymentProvider, Policy, ApplicationBackendConfig, ConfiguredSupplier, correlationFields(), FAILURE_PRIORITY, IdentityResolution (+10 more)

### Community 93 - "createMockBackend"
Cohesion: 0.60
Nodes (5): findMandate(), handleValidRequest(), submitProposal(), errorResponse(), identityKey()

### Community 96 - "agent/README.md"
Cohesion: 0.20
Nodes (8): Drafting from plain English, Mandate planning, Mandate planning and the bounded shopper, Tests, Acceptance, Interface, Output and authority, Saved shopper reviews

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `paypal-provider.ts`, `execution/worker.ts`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11083743842364532 - nodes in this community are weakly interconnected._
- **Why does `runTransaction()` connect `paypal-provider.ts` to `execution/worker.test.ts`, `createExecutionWorker`, `README.md`, `worker-paypal.test.ts`, `canonicalize`, `paypal-provider.test.ts`, `execution/worker.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `ledger/store.ts`, `application.ts`, `cli/src/backend.ts`, `application.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08232118758434548 - nodes in this community are weakly interconnected._
- **Why does `BudgetSnapshot` connect `shopper.ts` to `index.ts`, `review.ts`, `CLI-first architecture`, `execution/worker.ts`, `Acceptance evidence trail (offline, all reproducible below)`, `application.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09057971014492754 - nodes in this community are weakly interconnected._