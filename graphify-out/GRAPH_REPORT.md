# Graph Report - Splittap-pay  (2026-11-08)

## Corpus Check
- 139 files · ~190,196 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 1682 nodes · 4146 edges · 89 communities (82 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 145 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `148bca93`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- application.test.ts
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
- src/worker.ts
- cli/src/backend.ts
- execution/worker.test.ts
- backend-transport.test.ts
- dashboard-state.ts
- ref_node_path
- index.ts
- paypal-provider.ts
- app.js
- fixtures.ts
- review-output.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- cli/src/mandate.ts
- dashboard.test.ts
- CLI-first architecture
- createExecutionWorker
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- dashboard.ts
- worker-paypal.test.ts
- demo-flow.test.ts
- ledger/store.ts
- Backend delivery design (accepted specification with implementation status)
- execution/worker.ts
- cli/src/backend.test.ts
- shopper.test.ts
- Unit 2 result: trusted authority and SQLite atomic reservations
- shopper.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- Backend wire API (simulation) and the PayPal gateway contract
- Devpost description draft
- mock.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- tests/test-worker.ts
- ci.yml
- review.ts
- createMockBackend
- Detailed implementation decisions
- Demo script
- Delivered
- Setting up a new device
- evaluatePurchase
- src/client.ts
- review.test.ts
- CliError
- dashboard-http-ui.test.ts
- execution/test-worker.ts
- client.test.ts
- paypal-provider.test.ts
- paypal/client.ts
- control.ts
- ref_node_fs
- Delivered
- providerFacts
- ExecutionWorker
- money.ts
- application.ts

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 45 edges
2. `openLedgerStore()` - 42 edges
3. `createApplicationBackend()` - 33 edges
4. `handleCommand()` - 32 edges
5. `canonicalize()` - 29 edges
6. `confirmMandateRevision()` - 28 edges
7. `createFixtureSupplier()` - 27 edges
8. `runTransaction()` - 25 edges
9. `draftMandateRevision()` - 24 edges
10. `CatalogSchema` - 24 edges

## Surprising Connections (you probably didn't know these)
- `PayPal gateway (unit-4 contract + unit-5 sandbox additions)` --references--> `GatewayInputError`  [INFERRED]
  docs/backend-api.md → services/checker/src/paypal/gateway.ts
- `Delivered` --references--> `GatewayUnknown`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/paypal/gateway.ts
- `Authority and evidence` --references--> `BudgetSnapshot`  [INFERRED]
  docs/architecture.md → packages/contracts/src/index.ts
- `M0 — delivered by the scaffold` --references--> `BudgetSnapshot`  [INFERRED]
  docs/backend-delivery-review.md → packages/contracts/src/index.ts
- `Orchestrator closeout (2026-11-05)` --references--> `openLedgerStore()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/ledger/store.ts

## Import Cycles
- None detected.

## Communities (89 total, 7 thin omitted)

### Community 0 - "application.test.ts"
Cohesion: 0.10
Nodes (33): ledger(), confirmMandateRevision(), definePolicySnapshot(), draftMandateRevision(), loadPolicySnapshot(), parsePolicy(), closeHarness(), createHarness() (+25 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.11
Nodes (27): Current implementation boundary, BUDGET, capture(), captureCart(), Cart, CART_A, CART_B, CART_C (+19 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.08
Nodes (35): approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody(), authorizeInput, authorizeRoute(), capBodySGD5541(), capBodyUSD() (+27 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (23): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+15 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.10
Nodes (22): BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, mandateVersion, OperationGetRequestSchema (+14 more)

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
Nodes (36): compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DRAFT_TOOL_NAME, draftMandateWithModel() (+28 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "The shopper"
Cohesion: 0.15
Nodes (13): BackendClient, Mandate draft and review, Drafting from plain English, Live runs, Mandate planning, Mandate planning and the bounded shopper, Read-only status, Run it (+5 more)

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

### Community 24 - "authority.ts"
Cohesion: 0.17
Nodes (14): ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), DraftRevisionResult, MandateAuthority, MandateDraft, MandateDraftSchema, PolicyIdentitySchema (+6 more)

### Community 25 - "src/worker.ts"
Cohesion: 0.07
Nodes (30): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+22 more)

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.13
Nodes (29): assertDistinctDatabases(), assertPrivateWindowsDatabase(), buildSuppliers(), Command, COMMAND_FLAGS, ConfigSchema, DATABASE_FILE_SUFFIXES, emit() (+21 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.06
Nodes (26): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, bindingState(), effectRow(), operationAndReservation() (+18 more)

### Community 28 - "backend-transport.test.ts"
Cohesion: 0.29
Nodes (7): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendTransport

### Community 29 - "dashboard-state.ts"
Cohesion: 0.08
Nodes (30): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, DashboardOperation, DashboardReader, DashboardStore, DEMO_SESSION_FILE (+22 more)

### Community 30 - "ref_node_path"
Cohesion: 0.23
Nodes (13): integerOption(), runStore(), fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog(), seedPath(), fixtureDirectory (+5 more)

### Community 32 - "index.ts"
Cohesion: 0.10
Nodes (28): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshotSchema (+20 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.13
Nodes (25): AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, createExecutionProvider(), payPalApply(), payPalLookupCapture() (+17 more)

### Community 34 - "app.js"
Cohesion: 0.25
Nodes (23): card(), chip(), date(), dateTime(), eventText(), h(), lookup(), money() (+15 more)

### Community 35 - "fixtures.ts"
Cohesion: 0.14
Nodes (20): ConfiguredCatalog, LoadedConfig, Catalog, CatalogSchema, Policy, Quote, asConfirmedMandate(), countingAdapter() (+12 more)

### Community 36 - "review-output.ts"
Cohesion: 0.09
Nodes (52): formatSgd(), ascii(), ASCII_FOLDS, bar(), barLine(), briefNextStepLines(), briefRefusalLine(), briefSummaryBody() (+44 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.22
Nodes (9): Dashboard, Demo flow, Fixture-store controls, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status (+1 more)

### Community 39 - "shop.ts"
Cohesion: 0.17
Nodes (26): readLedgerFacts(), useColor(), backendKind(), buildModel(), buildTransport(), displayPath(), DRAFT_EXIT_CODES, EXIT_CODES (+18 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.22
Nodes (8): Authority and trust, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent, Team, ownership and branches

### Community 41 - "cli/src/mandate.ts"
Cohesion: 0.35
Nodes (10): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), outputTarget() (+2 more)

### Community 42 - "dashboard.test.ts"
Cohesion: 0.11
Nodes (17): assertReadOnlyCommand(), commandAction(), CommandResult, CommandRunner, createProcessRunner(), DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), DashboardSource (+9 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.29
Nodes (26): database(), effectKey(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim(), createIntent(), execute() (+18 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.07
Nodes (31): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, CaptureAuthorizationInput, CaptureEvidence (+23 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (6): Application path (exercised 2026-11-07, PR #17 tree + one live fix), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "dashboard.ts"
Cohesion: 0.27
Nodes (13): commandId(), createDashboardServer(), DashboardAssets, DashboardServerOptions, loadDashboardAssets(), main(), parsePort(), root (+5 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.12
Nodes (15): authorizationCapturedRoute(), authorizationDeniedRoute(), capturedAmount(), captureReadRoute(), captureRoute(), ChildOperation, ChildResult, ExchangeLine (+7 more)

### Community 49 - "demo-flow.test.ts"
Cohesion: 0.06
Nodes (59): awaitEnter(), checkSummary(), childEnvironment(), DEMO_SESSION_FILE, demoBackendConfig(), DemoFailure, DemoPlan, demoPlan() (+51 more)

### Community 50 - "ledger/store.ts"
Cohesion: 0.13
Nodes (34): resolveIdentities(), loadMandateAuthority(), seedBinding(), bindIdempotencyAlias(), databasesInTransaction, findOperationIdentities(), IdempotencyConflictErrorOptions, insertPayPalBindingRow() (+26 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.15
Nodes (13): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), Current system and sources, Detailed implementation plan, Durable fake execution, Goals and exclusions, Implementation status (addendum, accurate as of unit 4, 2026-11-06) (+5 more)

### Community 52 - "execution/worker.ts"
Cohesion: 0.10
Nodes (19): PaymentProvider, ApplicationBackendConfig, FakeProviderGateway, loadProviderRow(), ProviderRow, RawRow, readString(), ApplyOutcome (+11 more)

### Community 53 - "cli/src/backend.test.ts"
Cohesion: 0.12
Nodes (18): accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest(), root, runBackend() (+10 more)

### Community 54 - "shopper.test.ts"
Cohesion: 0.13
Nodes (20): catalogFacts(), createOfflineShoppingSession(), createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput() (+12 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.29
Nodes (6): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.07
Nodes (34): BackendErrorCode, CartSubmission, EligibilityResult, Mandate, BackendSessionError, INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome() (+26 more)

### Community 57 - "agent/package.json"
Cohesion: 0.24
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery + mocked contract coverage ONLY (real feasibility unverified), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.08
Nodes (29): built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview(), CSI_C1 (+21 more)

### Community 60 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.33
Nodes (6): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Private runtime folders, Provider selection and credentials (unit 5), Starting point: the operator CLI

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (16): AI tools list, Checklist, Devpost description draft, How AI is used, How it works, How PayPal is used, In the product, Judge access: proposal (+8 more)

### Community 62 - "mock.ts"
Cohesion: 0.21
Nodes (12): BackendMethod, BackendMethodSchema, MandateGetResultSchema, canonicalCart(), canonicalize(), compareText(), correlationFields(), MockBackend (+4 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation, ExpectedMoney

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "tests/test-worker.ts"
Cohesion: 0.28
Nodes (7): ConfiguredSupplier, raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.08
Nodes (38): Operation, BudgetSnapshot, amount, BackendKind, BudgetView, budgetView(), buildRunReview(), CartBuildSchema (+30 more)

### Community 68 - "createMockBackend"
Cohesion: 0.33
Nodes (9): createMock(), createMockBackend(), findMandate(), handleValidRequest(), submitProposal(), errorResponse(), identityKey(), transport() (+1 more)

### Community 69 - "Detailed implementation decisions"
Cohesion: 0.29
Nodes (7): CLI contract, Concrete storage, Detailed implementation decisions, Exact wire shapes, Lease and provider behavior, Readiness resolutions: imports and PayPal adapter, Review resolutions: cart identity and capture retries

### Community 70 - "Demo script"
Cohesion: 0.33
Nodes (6): Before you record, Demo script, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), The script, What not to say, With the dashboard beside the terminal

### Community 71 - "Delivered"
Cohesion: 0.20
Nodes (10): loadSandboxCredentials(), readEnvFile(), Answers for the teammate (issue #16), Checks, Delivered, Deviations, Exact output shapes, Honest limitations (+2 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.25
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "evaluatePurchase"
Cohesion: 0.14
Nodes (18): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Checks, Checks, Deviations, Deviations, Goldfish review round 1 (2026-11-05), Goldfish review round 2 (2026-11-05), Honest boundaries (+10 more)

### Community 74 - "src/client.ts"
Cohesion: 0.20
Nodes (6): BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendProtocolError, ApplicationBackend

### Community 75 - "review.test.ts"
Cohesion: 0.11
Nodes (13): BackendErrorCodeSchema, MOCK_WARNING, RunReview, RunReviewInput, SCRIPTED_PLACEHOLDER_SUMMARY, lines, mandate, STALE_CODES (+5 more)

### Community 76 - "CliError"
Cohesion: 0.23
Nodes (15): assertPrivateWindowsDirectory(), checkPrivateRuntimeDirectory(), CliError, createPrivateRuntimeDirectory(), loadConfig(), loadSnapshotSet(), operatorIdentity(), parseArgv() (+7 more)

### Community 77 - "dashboard-http-ui.test.ts"
Cohesion: 0.14
Nodes (4): ClientNode, descendants(), renderClient(), SECURITY_HEADERS

### Community 78 - "execution/test-worker.ts"
Cohesion: 0.17
Nodes (14): Observations recorded, deliberately no code change, createFakeProviderGateway(), FakeProviderScenario, openProviderDatabase(), PaymentProviderSelection, PayPalProviderScenario, buildScriptedPayPalChild(), PayPalScript (+6 more)

### Community 79 - "client.test.ts"
Cohesion: 0.20
Nodes (8): Delivered, createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError, DENIED()

### Community 80 - "paypal-provider.test.ts"
Cohesion: 0.24
Nodes (13): payPalLookupRefund(), authorizationReadRoute(), captureSucceededRoute(), Harness, holdCreateRoutes(), json(), minorToDecimal(), refundSucceededRoute() (+5 more)

### Community 81 - "paypal/client.ts"
Cohesion: 0.22
Nodes (12): PayPalMoney, Authorization, BASE_URLS, Capture, CaptureParams, Order, PayPalClient, PayPalConfig (+4 more)

### Community 82 - "control.ts"
Cohesion: 0.22
Nodes (8): EvidenceSchema, MAX_AMOUNT_MINOR, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema, cart, seedPath

### Community 83 - "ref_node_fs"
Cohesion: 0.05
Nodes (35): entry, fixedClock, root, draft(), entry, invalid(), kitPath, policyPath (+27 more)

### Community 84 - "Delivered"
Cohesion: 0.29
Nodes (9): Delivered, assertLeaseHeld(), claimLeaseRow(), consumeReservationRow(), insertEffectIntentRow(), LeaseLost, loadLeaseRow(), releaseReservationRow() (+1 more)

### Community 85 - "providerFacts"
Cohesion: 0.33
Nodes (7): providerFacts(), providerIdFilter(), Applied, Deviation (disclosed), Observations (records, no code), Review round 1 (2026-11-07), Round-1 checks

### Community 87 - "money.ts"
Cohesion: 0.23
Nodes (11): cart(), harnessFetch(), paypalAdapter(), assertSupportedCurrency(), fromMinor(), paypalMoney(), SUPPORTED_CURRENCIES, toMinor() (+3 more)

### Community 89 - "application.ts"
Cohesion: 0.12
Nodes (36): Review record (EGM goldfish, five-round cap reached), authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend(), catalogList(), handleProposalSubmit() (+28 more)

## Knowledge Gaps
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runTransaction()` connect `application.test.ts` to `paypal-provider.ts`, `createExecutionWorker`, `README.md`, `paypal-provider.test.ts`, `worker-paypal.test.ts`, `ledger/store.ts`, `execution/worker.ts`, `cli/src/backend.test.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `authority.ts`, `application.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `application.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09745293466223699 - nodes in this community are weakly interconnected._
- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `application.test.ts`, `execution/worker.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10574712643678161 - nodes in this community are weakly interconnected._
- **Why does `Hackathon project: an AI purchasing agent that can't overspend` connect `Hackathon project: an AI purchasing agent that can't overspend` to `README.md`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08232118758434548 - nodes in this community are weakly interconnected._