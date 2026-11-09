# Graph Report - Splittap-pay  (2026-11-09)

## Corpus Check
- 145 files · ~200,135 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 1751 nodes · 4357 edges · 89 communities (84 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 152 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9201b5af`
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
- review.test.ts
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
- execution/worker.ts
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- dashboard.ts
- worker-paypal.test.ts
- demo-flow.test.ts
- cli/src/backend.ts
- Backend delivery design (accepted specification with implementation status)
- paypal-provider.test.ts
- cli/src/mandate.test.ts
- shopper.test.ts
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
- formatSgd
- createPayPalGateway
- saved-review.ts
- Delivered
- Setting up a new device
- handleCommand
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
- Unit 1 result
- createApplicationBackend
- application.ts
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
- `Milestones M4/M5` --references--> `createBackendClient()`  [INFERRED]
  docs/backend-delivery-review.md → packages/contracts/src/client.ts
- `Authority and evidence` --references--> `BudgetSnapshot`  [INFERRED]
  docs/architecture.md → packages/contracts/src/index.ts
- `M0 — delivered by the scaffold` --references--> `BudgetSnapshot`  [INFERRED]
  docs/backend-delivery-review.md → packages/contracts/src/index.ts
- `The contract mock, and why accepting a mock result proves nothing` --references--> `createMockBackend()`  [INFERRED]
  docs/backend-api.md → packages/contracts/src/mock.ts
- `Observations (records, no code)` --references--> `authorizeOperationHold()`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/execution/paypal-provider.ts

## Import Cycles
- None detected.

## Communities (89 total, 5 thin omitted)

### Community 0 - "authority.ts"
Cohesion: 0.12
Nodes (22): parseStoredPolicy(), ValidatedMandateRead, AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), DraftRevisionResult, loadPolicySnapshot(), MandateAuthority (+14 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.11
Nodes (26): BUDGET, capture(), captureCart(), Cart, CART_A, CART_B, CART_C, checkCapture() (+18 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.07
Nodes (38): CaptureAuthorizationInput, GetCaptureInput, RefundCaptureInput, approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody(), authorizeInput (+30 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (23): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+15 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.07
Nodes (32): BackendErrorResponseSchema, BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema (+24 more)

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
Cohesion: 0.16
Nodes (22): briefNextStepLines(), briefRefusalLine(), executionCommands(), fitLine(), historicalHeading(), historicalNextSteps(), isScriptedPlaceholder(), isUnstartedReservation() (+14 more)

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

### Community 23 - "mock.ts"
Cohesion: 0.18
Nodes (17): Unit 1 review follow-up, BackendMethod, canonicalCart(), canonicalize(), compareText(), correlationFields(), findMandate(), handleValidRequest() (+9 more)

### Community 24 - "ledger/store.ts"
Cohesion: 0.11
Nodes (37): resolveIdentities(), seedBinding(), applyMigrations(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION, bindIdempotencyAlias() (+29 more)

### Community 25 - "src/worker.ts"
Cohesion: 0.09
Nodes (23): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+15 more)

### Community 26 - "cli/src/backend.test.ts"
Cohesion: 0.12
Nodes (18): accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest(), root, runBackend() (+10 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.09
Nodes (30): ledger(), confirmMandateRevision(), definePolicySnapshot(), draftMandateRevision(), createHarness(), bindingState(), createHarness(), effectRow() (+22 more)

### Community 28 - "review.test.ts"
Cohesion: 0.10
Nodes (15): BackendErrorCodeSchema, budgetView(), buildRunReview(), MOCK_WARNING, RunReviewInput, SCRIPTED_PLACEHOLDER_SUMMARY, lines, mandate (+7 more)

### Community 29 - "dashboard-state.ts"
Cohesion: 0.08
Nodes (30): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, DashboardOperation, DashboardReader, DashboardStore, DEMO_SESSION_FILE (+22 more)

### Community 30 - "ref_node_path"
Cohesion: 0.18
Nodes (19): integerOption(), runStore(), Catalog, EvidenceSchema, applyFixtureChanges(), controlSource(), FIXTURE_SEEDS, fixtureDirectory (+11 more)

### Community 32 - "index.ts"
Cohesion: 0.11
Nodes (28): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshotSchema (+20 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.16
Nodes (19): AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, describeUnknown(), HoldCommandConfig, HoldRefusalCode (+11 more)

### Community 34 - "app.js"
Cohesion: 0.25
Nodes (23): card(), chip(), date(), dateTime(), eventText(), h(), lookup(), money() (+15 more)

### Community 35 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.33
Nodes (6): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Private runtime folders, Provider selection and credentials (unit 5), Starting point: the operator CLI

### Community 36 - "review-output.ts"
Cohesion: 0.13
Nodes (22): ascii(), ASCII_FOLDS, briefSummaryBody(), cartLinesText(), cell(), COLUMNS, decisionDetail(), decisionLabel() (+14 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.20
Nodes (10): Dashboard, Demo flow, Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here (+2 more)

### Community 39 - "shop.ts"
Cohesion: 0.13
Nodes (35): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), readLedgerFacts() (+27 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "agent/src/mandate.ts"
Cohesion: 0.07
Nodes (39): compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DRAFT_TOOL_NAME, draftMandateWithModel() (+31 more)

### Community 42 - "dashboard.test.ts"
Cohesion: 0.10
Nodes (18): assertReadOnlyCommand(), commandAction(), CommandResult, CommandRunner, createProcessRunner(), DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), ReadEntry (+10 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "execution/worker.ts"
Cohesion: 0.06
Nodes (81): database(), Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Checks, Checks, Delivered, Deviations, Deviations, Goldfish review round 1 (2026-11-05) (+73 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.07
Nodes (29): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, CaptureEvidence, CreateAuthorizationOrderInput (+21 more)

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
Nodes (60): awaitEnter(), checkSummary(), childEnvironment(), DEFAULT_MODE_STATEMENT, DEMO_SESSION_FILE, demoBackendConfig(), DemoFailure, DemoPlan (+52 more)

### Community 50 - "cli/src/backend.ts"
Cohesion: 0.12
Nodes (23): buildSuppliers(), Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog, DATABASE_FILE_SUFFIXES, emit(), LoadedConfig (+15 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.15
Nodes (13): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), Current system and sources, Detailed implementation plan, Durable fake execution, Goals and exclusions, Implementation status (addendum, accurate as of unit 4, 2026-11-06) (+5 more)

### Community 52 - "paypal-provider.test.ts"
Cohesion: 0.16
Nodes (23): sha256CanonicalJson(), createFakeProviderGateway(), createExecutionProvider(), payPalApply(), payPalLookupCapture(), payPalLookupRefund(), authorizationReadRoute(), captureSucceededRoute() (+15 more)

### Community 53 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 54 - "shopper.test.ts"
Cohesion: 0.13
Nodes (21): catalogFacts(), createOfflineShoppingSession(), createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput() (+13 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.29
Nodes (6): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.09
Nodes (28): BackendErrorCode, CartSubmission, INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES, resendUnresolvedCarts(), ResentCart (+20 more)

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
Cohesion: 0.23
Nodes (15): assertPrivateWindowsDirectory(), checkPrivateRuntimeDirectory(), CliError, createPrivateRuntimeDirectory(), loadConfig(), loadSnapshotSet(), operatorIdentity(), parseArgv() (+7 more)

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (16): AI tools list, Checklist, Devpost description draft, How AI is used, How it works, How PayPal is used, In the product, Judge access: proposal (+8 more)

### Community 62 - "CatalogSchema"
Cohesion: 0.22
Nodes (9): CartSubmissionSchema, CatalogSchema, MAX_AMOUNT_MINOR, CartCosts, createFixtureCatalogSource(), FixtureCatalogsSchema, seed(), cart (+1 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation, ExpectedMoney

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "fake.ts"
Cohesion: 0.18
Nodes (11): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, loadProviderRow(), openProviderDatabase(), ProviderRow (+3 more)

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.09
Nodes (32): Operation, amount, BackendKind, BudgetView, CartBuildSchema, CartSubmitSchema, CartTrail, cartTrails() (+24 more)

### Community 68 - "formatSgd"
Cohesion: 0.26
Nodes (11): formatSgd(), bar(), barLine(), budgetHeading(), capitalized(), labelWidthFor(), moneyPair(), operationLines() (+3 more)

### Community 69 - "createPayPalGateway"
Cohesion: 0.29
Nodes (9): cart(), assertSupportedCurrency(), fromMinor(), paypalMoney(), SUPPORTED_CURRENCIES, toMinor(), createPayPalGateway(), assessAmount() (+1 more)

### Community 70 - "saved-review.ts"
Cohesion: 0.08
Nodes (28): canonical(), prepareSavedReviewFile(), present(), SavedReviewDestination, OUTCOME_SENTENCES, RunReview, aggregateMinor, BudgetSchema (+20 more)

### Community 71 - "Delivered"
Cohesion: 0.18
Nodes (11): loadSandboxCredentials(), readEnvFile(), Answers for the teammate (issue #16), Checks, Delivered, Deviations, Exact output shapes, Honest limitations (+3 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.25
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "handleCommand"
Cohesion: 0.27
Nodes (10): assertDistinctDatabases(), assertPrivateWindowsDatabase(), expandPath(), handleCommand(), loadWindowsVerdicts(), pathIdentity(), positiveRevision(), requireFlag() (+2 more)

### Community 74 - "shop-draft.test.ts"
Cohesion: 0.20
Nodes (6): calls, cliEntry, root, shopEntry, textFile, UnconfirmedMandateSchema

### Community 75 - "ref_node_url"
Cohesion: 0.25
Nodes (7): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendTransport

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
Cohesion: 0.11
Nodes (27): fixture(), review(), shop(), createBackendClient(), createMock(), createMockBackend(), BackendSessionError, createBackendShoppingSession() (+19 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.09
Nodes (13): entry, fixedClock, root, catalogFile, directory(), entry, lines, mandateFile (+5 more)

### Community 84 - "paypal-provider.test.ts"
Cohesion: 0.13
Nodes (20): createHarness(), Harness, NarrowingCase, OpenChildRun, SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH, WorkerResult (+12 more)

### Community 85 - "Unit 1 result"
Cohesion: 0.33
Nodes (5): Delivered, Files and scope notes, Limitations, Unit 1 result, Verification

### Community 89 - "createApplicationBackend"
Cohesion: 0.19
Nodes (22): Review record (EGM goldfish, five-round cap reached), authorityFailureResponse(), buildSnapshot(), createApplicationBackend(), catalogList(), handleProposalSubmit(), handleValidRequest(), mandateAuthorityForRead() (+14 more)

### Community 91 - "application.ts"
Cohesion: 0.08
Nodes (24): BackendMethodSchema, PaymentProvider, BudgetSnapshot, Mandate, Policy, Quote, LedgerFacts, SessionConfig (+16 more)

### Community 96 - "agent/README.md"
Cohesion: 0.20
Nodes (8): Drafting from plain English, Mandate planning, Mandate planning and the bounded shopper, Tests, Acceptance, Interface, Output and authority, Saved shopper reviews

## Knowledge Gaps
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `execution/worker.test.ts`, `execution/worker.ts`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `authority.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12318840579710146 - nodes in this community are weakly interconnected._
- **Why does `runTransaction()` connect `execution/worker.test.ts` to `authority.ts`, `paypal-provider.ts`, `execution/worker.ts`, `README.md`, `worker-paypal.test.ts`, `paypal-provider.test.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `ledger/store.ts`, `createApplicationBackend`, `cli/src/backend.test.ts`, `application.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11083743842364532 - nodes in this community are weakly interconnected._
- **Why does `openLedgerStore()` connect `execution/worker.test.ts` to `fake.ts`, `shop.test.ts`, `handleCommand`, `execution/worker.ts`, `worker-paypal.test.ts`, `cli/src/backend.ts`, `paypal-provider.test.ts`, `paypal-provider.test.ts`, `ledger/store.ts`, `createApplicationBackend`, `cli/src/backend.test.ts`, `application.ts`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0743321718931475 - nodes in this community are weakly interconnected._