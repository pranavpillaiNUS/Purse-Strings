# Graph Report - Splittap-pay  (2026-11-10)

## Corpus Check
- 145 files · ~200,812 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 1753 nodes · 4362 edges · 94 communities (87 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 152 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bda7db24`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authority.ts
- paypal-spike.ts
- gateway.test.ts
- package.json
- contracts/src/backend.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- renderRunReview
- checker/package.json
- suppliers/package.json
- README.md
- The shopper
- CLI backend delivery specification
- Team scope and framework assessment
- Backend delivery run
- Delivery findings
- mock.ts
- ledger/store.ts
- src/worker.ts
- cli/src/backend.test.ts
- execution/worker.test.ts
- evaluatePurchase
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
- agent/src/mandate.ts
- dashboard.test.ts
- CLI-first architecture
- createExecutionWorker
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- dashboard.ts
- worker-paypal.test.ts
- demo-flow.test.ts
- cli/src/backend.ts
- Backend delivery design (accepted specification with implementation status)
- paypal-provider.test.ts
- cli/src/mandate.test.ts
- execution/worker.ts
- Unit 2 result: trusted authority and SQLite atomic reservations
- shopper.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- CliError
- Devpost description draft
- CatalogSchema
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- fake.ts
- ci.yml
- review.ts
- safe
- createPayPalGateway
- saved-review.ts
- Delivered
- Setting up a new device
- execution/test-worker.ts
- shop-draft.test.ts
- ref_node_url
- src/store.test.ts
- dashboard-http-ui.test.ts
- providerFacts
- client.test.ts
- Detailed implementation decisions
- paypal/client.ts
- src/worker.test.ts
- ref_node_fs
- paypal-provider.test.ts
- backend-session.ts
- isSqliteBusy
- summaryBody
- Demo script
- application.ts
- control.ts
- tests/test-worker.ts
- ExecutionWorker
- Saved shopper reviews

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 45 edges
2. `openLedgerStore()` - 42 edges
3. `createApplicationBackend()` - 33 edges
4. `handleCommand()` - 32 edges
5. `canonicalize()` - 29 edges
6. `confirmMandateRevision()` - 28 edges
7. `createFixtureSupplier()` - 27 edges
8. `main()` - 27 edges
9. `renderRunReview()` - 25 edges
10. `runTransaction()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `PayPal gateway (unit-4 contract + unit-5 sandbox additions)` --references--> `GatewayInputError`  [INFERRED]
  docs/backend-api.md → services/checker/src/paypal/gateway.ts
- `Authority and evidence` --references--> `BudgetSnapshot`  [INFERRED]
  docs/architecture.md → packages/contracts/src/index.ts
- `M0 — delivered by the scaffold` --references--> `BudgetSnapshot`  [INFERRED]
  docs/backend-delivery-review.md → packages/contracts/src/index.ts
- `Orchestrator closeout (2026-11-05)` --references--> `openLedgerStore()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/ledger/store.ts
- `Delivered` --references--> `runTransaction()`  [INFERRED]
  .audit/backend-delivery/unit2-result.md → services/checker/src/ledger/store.ts

## Import Cycles
- None detected.

## Communities (94 total, 7 thin omitted)

### Community 0 - "authority.ts"
Cohesion: 0.17
Nodes (15): ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), DraftRevisionResult, loadPolicySnapshot(), MandateAuthority, MandateDraft, MandateDraftSchema (+7 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.10
Nodes (32): BUDGET, capture(), captureCart(), cart(), Cart, CART_A, CART_B, CART_C (+24 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.08
Nodes (37): CaptureAuthorizationInput, RefundCaptureInput, approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody(), authorizeInput, authorizeRoute() (+29 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (23): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+15 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.06
Nodes (36): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema (+28 more)

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

### Community 10 - "renderRunReview"
Cohesion: 0.18
Nodes (18): briefNextStepLines(), briefRefusalLine(), capitalized(), executionCommands(), historicalHeading(), historicalNextSteps(), isScriptedPlaceholder(), isUnstartedReservation() (+10 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "The shopper"
Cohesion: 0.20
Nodes (10): Drafting from plain English, Live runs, Mandate planning, Mandate planning and the bounded shopper, Read-only status, Run it, Save and replay a review, Submission outcomes (+2 more)

### Community 15 - "CLI backend delivery specification"
Cohesion: 0.10
Nodes (19): Acceptance and remaining milestones, Alternatives and choice, CLI backend delivery specification, CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+11 more)

### Community 16 - "Team scope and framework assessment"
Cohesion: 0.14
Nodes (13): Backend exclusions, Backend framework comparison, Optional supplier simulator platforms, Order of implementation, Ownership in the current repository, PayPal adapter, Persistence, Recommendation (+5 more)

### Community 17 - "Backend delivery run"
Cohesion: 0.25
Nodes (7): Backend delivery run, Current phase, Evidence and constraints, Outcome and authority, Planned acceptance, Throughput checkpoint, Workflow

### Community 18 - "Delivery findings"
Cohesion: 0.50
Nodes (3): Delivery findings, design-critic-r1-1, design-critic-r1-2

### Community 23 - "mock.ts"
Cohesion: 0.11
Nodes (26): Delivered, Files and scope notes, Limitations, Unit 1 result, Unit 1 review follow-up, Verification, BackendMethod, BackendMethodSchema (+18 more)

### Community 24 - "ledger/store.ts"
Cohesion: 0.10
Nodes (42): Review record (EGM goldfish, five-round cap reached), resolveIdentities(), loadMandateAuthority(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION, bindIdempotencyAlias() (+34 more)

### Community 25 - "src/worker.ts"
Cohesion: 0.07
Nodes (29): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+21 more)

### Community 26 - "cli/src/backend.test.ts"
Cohesion: 0.11
Nodes (20): assertPrivateWindowsDatabase(), accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest(), root (+12 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.09
Nodes (31): ledger(), confirmMandateRevision(), definePolicySnapshot(), draftMandateRevision(), createHarness(), bindingState(), createHarness(), effectRow() (+23 more)

### Community 28 - "evaluatePurchase"
Cohesion: 0.14
Nodes (18): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Checks, Checks, Deviations, Deviations, Goldfish review round 1 (2026-11-05), Goldfish review round 2 (2026-11-05), Honest boundaries (+10 more)

### Community 29 - "dashboard-state.ts"
Cohesion: 0.08
Nodes (30): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, DashboardOperation, DashboardReader, DashboardStore, DEMO_SESSION_FILE (+22 more)

### Community 30 - "ref_node_path"
Cohesion: 0.22
Nodes (15): main(), printResult(), integerOption(), runStore(), FIXTURE_SEEDS, fixtureDirectory, isWithin(), loadFixtureCatalog() (+7 more)

### Community 32 - "index.ts"
Cohesion: 0.11
Nodes (23): DEMO_NOW, InputOptions, loadInput(), readJson(), Contract operations to design first, Shared interface and separation, amount, BudgetSnapshotSchema (+15 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.17
Nodes (22): AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, describeUnknown(), HoldCommandConfig, HoldRefusalCode (+14 more)

### Community 34 - "app.js"
Cohesion: 0.25
Nodes (23): card(), chip(), date(), dateTime(), eventText(), h(), lookup(), money() (+15 more)

### Community 35 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.33
Nodes (6): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Private runtime folders, Provider selection and credentials (unit 5), Starting point: the operator CLI

### Community 36 - "review-output.ts"
Cohesion: 0.11
Nodes (26): formatSgd(), ASCII_FOLDS, budgetHeading(), cartLinesText(), cell(), COLUMNS, decisionDetail(), decisionLabel() (+18 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.20
Nodes (10): Dashboard, Demo flow, Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here (+2 more)

### Community 39 - "shop.ts"
Cohesion: 0.17
Nodes (23): readLedgerFacts(), useColor(), backendKind(), buildModel(), buildTransport(), displayPath(), DRAFT_EXIT_CODES, EXIT_CODES (+15 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.22
Nodes (8): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent

### Community 41 - "agent/src/mandate.ts"
Cohesion: 0.06
Nodes (48): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), outputTarget() (+40 more)

### Community 42 - "dashboard.test.ts"
Cohesion: 0.10
Nodes (18): assertReadOnlyCommand(), commandAction(), CommandResult, CommandRunner, createProcessRunner(), DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), ReadEntry (+10 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.34
Nodes (23): database(), effectKey(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim(), createIntent(), execute() (+15 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.07
Nodes (28): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, CaptureEvidence, CreateAuthorizationOrderInput (+20 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (6): Application path (exercised 2026-11-07, PR #17 tree + one live fix), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "dashboard.ts"
Cohesion: 0.25
Nodes (14): commandId(), createDashboardServer(), DashboardAssets, DashboardServerOptions, loadDashboardAssets(), main(), parsePort(), root (+6 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.12
Nodes (15): authorizationCapturedRoute(), authorizationDeniedRoute(), capturedAmount(), captureReadRoute(), captureRoute(), ChildOperation, ChildResult, ExchangeLine (+7 more)

### Community 49 - "demo-flow.test.ts"
Cohesion: 0.06
Nodes (62): awaitEnter(), checkSummary(), childEnvironment(), closingStatement(), DEFAULT_MODE_STATEMENT, DEMO_SESSION_FILE, demoBackendConfig(), DemoFailure (+54 more)

### Community 50 - "cli/src/backend.ts"
Cohesion: 0.13
Nodes (28): assertDistinctDatabases(), buildSuppliers(), Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog, DATABASE_FILE_SUFFIXES, emit() (+20 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.15
Nodes (13): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), Current system and sources, Detailed implementation plan, Durable fake execution, Goals and exclusions, Implementation status (addendum, accurate as of unit 4, 2026-11-06) (+5 more)

### Community 52 - "paypal-provider.test.ts"
Cohesion: 0.11
Nodes (29): sha256CanonicalJson(), createFakeProviderGateway(), createExecutionProvider(), payPalApply(), payPalLookupCapture(), payPalLookupRefund(), isUsableIdentity(), openLedgerReadConnection() (+21 more)

### Community 53 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 54 - "execution/worker.ts"
Cohesion: 0.18
Nodes (14): Delivered, buildWireOperation(), ClockSample, GateResult, RunContext, TERMINAL_STATUSES, assertLeaseHeld(), claimLeaseRow() (+6 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.29
Nodes (6): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.05
Nodes (49): BackendErrorCode, Operation, BudgetSnapshot, CartSubmission, EligibilityResult, Tests, LedgerFacts, StatusView (+41 more)

### Community 57 - "agent/package.json"
Cohesion: 0.24
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery, mocked contracts and limited manual observations (incomplete), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.08
Nodes (29): built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview(), CSI_C1 (+21 more)

### Community 60 - "CliError"
Cohesion: 0.18
Nodes (18): assertPrivateWindowsDirectory(), checkPrivateRuntimeDirectory(), CliError, createPrivateRuntimeDirectory(), loadConfig(), loadSnapshotSet(), main(), operatorIdentity() (+10 more)

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (16): AI tools list, Checklist, Devpost description draft, How AI is used, How it works, How PayPal is used, In the product, Judge access: proposal (+8 more)

### Community 62 - "CatalogSchema"
Cohesion: 0.18
Nodes (12): Catalog, CatalogSchema, MAX_AMOUNT_MINOR, input(), load(), CartCosts, cartCosts(), createFixtureCatalogSource() (+4 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation, ExpectedMoney

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "fake.ts"
Cohesion: 0.13
Nodes (14): PaymentProvider, ApplicationBackendConfig, FakeProviderGateway, loadProviderRow(), ProviderRow, RawRow, readString(), ApplyOutcome (+6 more)

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.07
Nodes (41): amount, budgetView(), buildRunReview(), CartBuildSchema, CartSubmitSchema, CartTrail, cartTrails(), CheckGroup (+33 more)

### Community 68 - "safe"
Cohesion: 0.43
Nodes (8): bar(), barLine(), labelWidthFor(), operatorCommand(), pathArgument(), renderStatus(), requirementLines(), safe()

### Community 69 - "createPayPalGateway"
Cohesion: 0.67
Nodes (3): createPayPalGateway(), assessAmount(), validIdHint()

### Community 70 - "saved-review.ts"
Cohesion: 0.09
Nodes (27): canonical(), prepareSavedReviewFile(), present(), readSavedReviewFile(), SavedReviewDestination, OUTCOME_SENTENCES, aggregateMinor, BudgetSchema (+19 more)

### Community 71 - "Delivered"
Cohesion: 0.18
Nodes (11): loadSandboxCredentials(), readEnvFile(), Answers for the teammate (issue #16), Checks, Delivered, Deviations, Exact output shapes, Honest limitations (+3 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.25
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "execution/test-worker.ts"
Cohesion: 0.22
Nodes (12): Observations recorded, deliberately no code change, FakeProviderScenario, PaymentProviderSelection, PayPalProviderScenario, buildScriptedPayPalChild(), PayPalScript, raw, readLine() (+4 more)

### Community 74 - "shop-draft.test.ts"
Cohesion: 0.20
Nodes (6): calls, cliEntry, root, shopEntry, textFile, UnconfirmedMandateSchema

### Community 75 - "ref_node_url"
Cohesion: 0.25
Nodes (8): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendRequest, BackendTransport

### Community 76 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 77 - "dashboard-http-ui.test.ts"
Cohesion: 0.14
Nodes (6): budgetCard(), ClientNode, descendants(), mandateCard(), renderClient(), SECURITY_HEADERS

### Community 78 - "providerFacts"
Cohesion: 0.33
Nodes (7): providerFacts(), providerIdFilter(), Applied, Deviation (disclosed), Observations (records, no code), Review round 1 (2026-11-07), Round-1 checks

### Community 79 - "client.test.ts"
Cohesion: 0.20
Nodes (8): Delivered, createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError, DENIED()

### Community 80 - "Detailed implementation decisions"
Cohesion: 0.29
Nodes (7): CLI contract, Concrete storage, Detailed implementation decisions, Exact wire shapes, Lease and provider behavior, Readiness resolutions: imports and PayPal adapter, Review resolutions: cart identity and capture retries

### Community 81 - "paypal/client.ts"
Cohesion: 0.22
Nodes (12): PayPalMoney, Authorization, BASE_URLS, Capture, CaptureParams, Order, PayPalClient, PayPalConfig (+4 more)

### Community 82 - "src/worker.test.ts"
Cohesion: 0.18
Nodes (20): Team, ownership and branches, fixture(), review(), shop(), createBackendClient(), BackendSessionError, createBackendShoppingSession(), ResentCart (+12 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.09
Nodes (14): entry, fixedClock, root, catalogFile, directory(), entry, lines, mandateFile (+6 more)

### Community 84 - "paypal-provider.test.ts"
Cohesion: 0.12
Nodes (21): createHarness(), Harness, NarrowingCase, digestOf(), OpenChildRun, SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH (+13 more)

### Community 85 - "backend-session.ts"
Cohesion: 0.20
Nodes (8): INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES, resendUnresolvedCarts(), SessionOptionsSchema, createShoppingSession(), ShoppingSession

### Community 86 - "isSqliteBusy"
Cohesion: 0.36
Nodes (8): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, openProviderDatabase(), applyMigrations(), isSqliteBusy()

### Community 87 - "summaryBody"
Cohesion: 0.40
Nodes (6): ascii(), briefSummaryBody(), safeLines(), summaryBody(), summaryLines(), withoutMarkup()

### Community 88 - "Demo script"
Cohesion: 0.33
Nodes (6): Before you record, Demo script, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), The script, What not to say, With the dashboard beside the terminal

### Community 89 - "application.ts"
Cohesion: 0.14
Nodes (28): Mandate, Policy, PolicySchema, authorityFailureResponse(), buildSnapshot(), correlationFields(), createApplicationBackend(), catalogList() (+20 more)

### Community 90 - "control.ts"
Cohesion: 0.40
Nodes (5): EvidenceSchema, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema

### Community 91 - "tests/test-worker.ts"
Cohesion: 0.19
Nodes (9): Quote, ConfiguredSupplier, raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig (+1 more)

### Community 96 - "Saved shopper reviews"
Cohesion: 0.40
Nodes (4): Acceptance, Interface, Output and authority, Saved shopper reviews

## Knowledge Gaps
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `fake.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1021021021021021 - nodes in this community are weakly interconnected._
- **Why does `runTransaction()` connect `execution/worker.test.ts` to `authority.ts`, `paypal-provider.ts`, `createExecutionWorker`, `README.md`, `worker-paypal.test.ts`, `paypal-provider.test.ts`, `execution/worker.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `ledger/store.ts`, `application.ts`, `cli/src/backend.test.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07682926829268293 - nodes in this community are weakly interconnected._
- **Why does `Backend delivery design (accepted specification with implementation status)` connect `Backend delivery design (accepted specification with implementation status)` to `Detailed implementation decisions`, `README.md`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09057971014492754 - nodes in this community are weakly interconnected._