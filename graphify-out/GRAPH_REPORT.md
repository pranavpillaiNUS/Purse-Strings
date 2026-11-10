# Graph Report - Purse-Strings  (2026-11-11)

## Corpus Check
- 157 files · ~225,506 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 4, .css 2, .tsv 1)

## Summary
- 1960 nodes · 4845 edges · 108 communities (98 shown, 10 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 184 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `be81e4a3`
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
- anthropic.ts
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
- mandate-drafter.test.ts
- cli/src/backend.ts
- shopper.test.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- dashboard-state.ts
- ref_node_path
- index.ts
- json
- app.js
- Backend wire API (simulation) and the PayPal gateway contract
- review-output.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- dashboard.test.ts
- dashboard.test.ts
- CLI-first architecture
- execution/worker.ts
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- app-conversation.ts
- worker-paypal.test.ts
- demo-flow.test.ts
- execution/worker.test.ts
- Backend delivery design (accepted specification with implementation status)
- mock.ts
- ref_node_url
- concurrency.test.ts
- canonicalize
- shopper.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- mandate-drafter.test.ts
- Devpost description draft
- shopper.test.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- execution/worker.ts
- ci.yml
- review.ts
- handleCommand
- createPayPalGateway
- saved-review.ts
- Delivered
- Setting up a new device
- paypal-provider.ts
- ClientNode
- client.mock.test.ts
- Unit 1 result
- dashboard-http-ui.test.ts
- handleCommand
- client.test.ts
- Review Focus
- main
- saved-review.test.ts
- saved-review-cli.test.ts
- paypal-provider.test.ts
- createSession
- mandate-drafter.ts
- review.test.ts
- Demo script
- client.mock.test.ts
- dashboard.ts
- application.ts
- src/store.test.ts
- Architecture
- Unit 1 result
- mandate-drafter.ts
- Saved shopper reviews
- dashboard.ts
- SandboxPaymentBackend
- app-page.test.ts
- cli/src/mandate.test.ts
- backend-session.ts
- createSession
- src/worker.test.ts
- app-page.test.ts
- tests/test-worker.ts
- catalog.ts
- LeaseLost

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
- `Authority and evidence` --references--> `BudgetSnapshot`  [INFERRED]
  docs/architecture.md → packages/contracts/src/index.ts
- `M0 — delivered by the scaffold` --references--> `BudgetSnapshot`  [INFERRED]
  docs/backend-delivery-review.md → packages/contracts/src/index.ts
- `PayPal gateway (unit-4 contract + unit-5 sandbox additions)` --references--> `GatewayInputError`  [INFERRED]
  docs/backend-api.md → services/checker/src/paypal/gateway.ts
- `Delivered` --references--> `GatewayUnknown`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/paypal/gateway.ts
- `The contract mock, and why accepting a mock result proves nothing` --references--> `createMockBackend()`  [INFERRED]
  docs/backend-api.md → packages/contracts/src/mock.ts

## Import Cycles
- None detected.

## Communities (108 total, 10 thin omitted)

### Community 0 - "authority.ts"
Cohesion: 0.14
Nodes (16): ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), DraftRevisionResult, loadPolicySnapshot(), MandateAuthority, MandateDraft, MandateDraftSchema (+8 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.11
Nodes (26): BUDGET, capture(), captureCart(), Cart, CART_A, CART_B, CART_C, checkCapture() (+18 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.08
Nodes (35): approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody(), authorizeInput, authorizeRoute(), capBodySGD5541(), capBodyUSD() (+27 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (24): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+16 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.10
Nodes (23): BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema, mandateVersion (+15 more)

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

### Community 10 - "anthropic.ts"
Cohesion: 0.09
Nodes (22): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+14 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

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
Cohesion: 0.22
Nodes (12): PayPalMoney, Authorization, BASE_URLS, Capture, CaptureParams, Order, PayPalClient, PayPalConfig (+4 more)

### Community 24 - "ledger/store.ts"
Cohesion: 0.09
Nodes (47): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, loadMandateAuthority(), openProviderDatabase(), seedBinding() (+39 more)

### Community 25 - "mandate-drafter.test.ts"
Cohesion: 0.18
Nodes (6): input, kit, policy, recording(), requestText, [scriptedCall]

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.12
Nodes (18): accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest(), root, runBackend() (+10 more)

### Community 27 - "shopper.test.ts"
Cohesion: 0.15
Nodes (12): createOfflineShoppingSession(), ShoppingToolErrorCode, build, catalog, code(), getCatalog(), line, mandate (+4 more)

### Community 28 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.12
Nodes (21): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Checks, Checks, Checks, Deviations, Deviations, Deviations, Goldfish review round 1 (2026-11-05) (+13 more)

### Community 29 - "dashboard-state.ts"
Cohesion: 0.09
Nodes (27): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, DashboardOperation, DashboardReader, DashboardStore, displayPath() (+19 more)

### Community 30 - "ref_node_path"
Cohesion: 0.15
Nodes (35): actionArea(), actions, ACTOR, atResult(), button(), conversationPanel(), el(), entryNode() (+27 more)

### Community 32 - "index.ts"
Cohesion: 0.09
Nodes (36): InputOptions, amount, BudgetSnapshot, BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, Check, currency (+28 more)

### Community 33 - "json"
Cohesion: 0.53
Nodes (6): authorizationReadRoute(), captureSucceededRoute(), holdCreateRoutes(), json(), minorToDecimal(), refundSucceededRoute()

### Community 34 - "app.js"
Cohesion: 0.25
Nodes (23): card(), chip(), date(), dateTime(), eventText(), h(), lookup(), money() (+15 more)

### Community 35 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.33
Nodes (6): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Private runtime folders, Provider selection and credentials (unit 5), Starting point: the operator CLI

### Community 36 - "review-output.ts"
Cohesion: 0.10
Nodes (51): ascii(), ASCII_FOLDS, bar(), barLine(), briefNextStepLines(), briefRefusalLine(), briefSummaryBody(), budgetHeading() (+43 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.18
Nodes (11): Dashboard, Demo flow, Fixture-store controls, Local app, Mandate draft and review, Purse Strings — CLI-first equipment purchasing, Run, Separate PayPal feasibility spike (+3 more)

### Community 39 - "shop.ts"
Cohesion: 0.16
Nodes (23): readLedgerFacts(), useColor(), readSavedReviewFile(), backendKind(), buildModel(), buildTransport(), displayPath(), DRAFT_EXIT_CODES (+15 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.22
Nodes (8): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Purse Strings purchasing agent, Sources of truth and personalization

### Community 41 - "dashboard.test.ts"
Cohesion: 0.11
Nodes (15): assertReadOnlyCommand(), commandAction(), CommandResult, DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), DashboardSource, ReadEntry, evidence (+7 more)

### Community 42 - "dashboard.test.ts"
Cohesion: 0.12
Nodes (25): ConversationEntry, AppAssets, AppState, createAppServer(), HttpRefusal, main(), parsePort(), POST_PATHS (+17 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "execution/worker.ts"
Cohesion: 0.22
Nodes (34): database(), Delivered, effectKey(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim(), createIntent() (+26 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.06
Nodes (34): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, AuthorizeOutcome, CaptureAuthorizationInput (+26 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.29
Nodes (7): Application path (exercised 2026-11-07, PR #17 tree + one live fix), Demo-flow sandbox rehearsal (2026-11-09), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "app-conversation.ts"
Cohesion: 0.16
Nodes (17): Actor, buildConversation(), clip(), DraftOrigin, operationEntry(), readDraft(), readTakeRecords(), readText() (+9 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.12
Nodes (15): authorizationCapturedRoute(), authorizationDeniedRoute(), capturedAmount(), captureReadRoute(), captureRoute(), ChildOperation, ChildResult, ExchangeLine (+7 more)

### Community 49 - "demo-flow.test.ts"
Cohesion: 0.11
Nodes (16): DEFAULT_MODE_STATEMENT, DEMO_SESSION_FILE, DemoPlan, DemoSession, EXECUTION_PROVIDER, SANDBOX_CREDENTIAL_PROBE_ID, STALE_HOURS, baseConfig (+8 more)

### Community 50 - "execution/worker.test.ts"
Cohesion: 0.13
Nodes (20): Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog, DATABASE_FILE_SUFFIXES, LoadedConfig, ParsedArgs, providerFacts() (+12 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.10
Nodes (20): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+12 more)

### Community 52 - "mock.ts"
Cohesion: 0.15
Nodes (20): BackendMethod, BackendMethodSchema, createMock(), canonicalCart(), canonicalize(), compareText(), correlationFields(), createMockBackend() (+12 more)

### Community 53 - "ref_node_url"
Cohesion: 0.11
Nodes (15): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+7 more)

### Community 54 - "concurrency.test.ts"
Cohesion: 0.17
Nodes (11): Approach: a web wrapper around `demo:flow`, Errors, Goal, Layout (laptop), Local web app that runs the demo flow — design, Out of scope, Ownership and agreement, Schedule (+3 more)

### Community 55 - "canonicalize"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.12
Nodes (19): BackendErrorCode, CartSubmission, BackendSessionError, CartEstimate, CatalogFacts, OfflineSessionInputSchema, OfflineSubmission, ProposalPort (+11 more)

### Community 57 - "agent/package.json"
Cohesion: 0.24
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery, mocked contracts and limited manual observations (incomplete), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.07
Nodes (34): PROVIDER_WORDING, built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview() (+26 more)

### Community 60 - "mandate-drafter.test.ts"
Cohesion: 0.22
Nodes (17): formatSgd(), DEMO_NOW, loadInput(), readJson(), main(), printResult(), bundled(), printable() (+9 more)

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (17): AI tools list, Checklist, Devpost description draft, Freeze and recording handoff, How AI is used, How it works, How PayPal is used, In the product (+9 more)

### Community 62 - "shopper.test.ts"
Cohesion: 0.11
Nodes (24): BUYER_NOT_APPROVED, Evidence, failureRecorder, formatMinor(), inert(), ledgerMayContainSandboxState(), MAX_REQUEST_CHARACTERS, mayContainSandboxState() (+16 more)

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
Cohesion: 0.08
Nodes (34): Team, ownership and branches, fitLine(), renderLiveEvent(), submissionText(), Operation, amount, BudgetView, CartBuildSchema (+26 more)

### Community 68 - "handleCommand"
Cohesion: 0.20
Nodes (8): Delivered, createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError, DENIED()

### Community 69 - "createPayPalGateway"
Cohesion: 0.29
Nodes (9): cart(), assertSupportedCurrency(), fromMinor(), paypalMoney(), SUPPORTED_CURRENCIES, toMinor(), createPayPalGateway(), assessAmount() (+1 more)

### Community 70 - "saved-review.ts"
Cohesion: 0.08
Nodes (30): canonical(), prepareSavedReviewFile(), present(), SavedReviewDestination, Task 4: Conversation entries, OUTCOME_SENTENCES, aggregateMinor, BudgetSchema (+22 more)

### Community 71 - "Delivered"
Cohesion: 0.17
Nodes (11): Answers for the teammate (issue #16), Checks, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations, Observations (records, no code), Original operation schema proposal (superseded by issue #16 follow-up) (+3 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.29
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "paypal-provider.ts"
Cohesion: 0.06
Nodes (55): loadSandboxCredentials(), readEnvFile(), Delivered, PaymentProvider, ApplicationBackendConfig, sha256CanonicalJson(), createFakeProviderGateway(), FakeProviderGateway (+47 more)

### Community 74 - "ClientNode"
Cohesion: 0.09
Nodes (9): client(), ClientDocument, ClientNode, descendants(), PostReply, Reply, reply(), state() (+1 more)

### Community 75 - "client.mock.test.ts"
Cohesion: 0.29
Nodes (6): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport()

### Community 76 - "Unit 1 result"
Cohesion: 0.23
Nodes (13): FIXTURE_SEEDS, fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog(), seedPath(), fixtureDirectory, seedPath (+5 more)

### Community 77 - "dashboard-http-ui.test.ts"
Cohesion: 0.15
Nodes (7): budgetCard(), ClientNode, descendants(), mandateCard(), renderClient(), loadDashboardAssets(), SECURITY_HEADERS

### Community 78 - "handleCommand"
Cohesion: 0.12
Nodes (32): assertDistinctDatabases(), assertPrivateWindowsDatabase(), assertPrivateWindowsDirectory(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, createPrivateRuntimeDirectory(), emit() (+24 more)

### Community 80 - "Review Focus"
Cohesion: 0.21
Nodes (7): FlowChild, claude, FakeChild, fakeSpawner(), session(), setup(), Task 3: Take manager (child process and Continue/Stop rules)

### Community 81 - "main"
Cohesion: 0.14
Nodes (24): checkSummary(), closingStatement(), demoBackendConfig(), DemoFailure, demoPlan(), dropEchoedRequest(), main(), addResult() (+16 more)

### Community 82 - "saved-review.test.ts"
Cohesion: 0.23
Nodes (18): fixture(), review(), shop(), BackendTransport, createBackendClient(), createBackendShoppingSession(), ResentCart, createScriptedModel() (+10 more)

### Community 83 - "saved-review-cli.test.ts"
Cohesion: 0.18
Nodes (6): catalogFile, entry, lines, mandateFile, mockArgs, root

### Community 84 - "paypal-provider.test.ts"
Cohesion: 0.06
Nodes (58): ledger(), confirmMandateRevision(), definePolicySnapshot(), draftMandateRevision(), reviewMandateRevision(), closeHarness(), createHarness(), Harness (+50 more)

### Community 85 - "createSession"
Cohesion: 0.08
Nodes (24): STARTUP_NOTE, assets, emptyState, policy, runBody, serve(), stubTakes(), ContinueInputSchema (+16 more)

### Community 86 - "mandate-drafter.ts"
Cohesion: 0.12
Nodes (20): compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DraftOrigin, DraftOriginSchema (+12 more)

### Community 87 - "review.test.ts"
Cohesion: 0.11
Nodes (13): BackendErrorCodeSchema, budgetView(), buildRunReview(), cartTrails(), MOCK_WARNING, SCRIPTED_PLACEHOLDER_SUMMARY, lines, mandate (+5 more)

### Community 88 - "Demo script"
Cohesion: 0.25
Nodes (8): Before you record, Demo script, Recording from the local app, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), Scripted takes, including a final recording, The script, What not to say, With the dashboard beside the terminal

### Community 89 - "client.mock.test.ts"
Cohesion: 0.16
Nodes (9): BackendRequest, BackendRequestSchema, BackendResponse, BackendProtocolError, cart, cartBase, catalog, mandate (+1 more)

### Community 90 - "dashboard.ts"
Cohesion: 0.22
Nodes (8): EvidenceSchema, MAX_AMOUNT_MINOR, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema, cart, seedPath

### Community 91 - "application.ts"
Cohesion: 0.14
Nodes (32): wireOperation(), authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend(), catalogList(), handleProposalSubmit() (+24 more)

### Community 92 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 93 - "Architecture"
Cohesion: 0.22
Nodes (9): awaitEnter(), childEnvironment(), promptForEnter(), Architecture, Changes to `demo:flow` (Role B file), Custom requests and the six scenes, HTTP surface, Identity and authority (+1 more)

### Community 94 - "Unit 1 result"
Cohesion: 0.25
Nodes (7): Delivered, Files and scope notes, Limitations, Unit 1 result, Unit 1 review follow-up, Verification, projectedTotal()

### Community 95 - "mandate-drafter.ts"
Cohesion: 0.17
Nodes (13): DRAFT_TOOL_NAME, draftMandateWithModel(), InputSchema, MandateDraftInput, MandateDraftOutcome, MandateDraftRun, ProposalSchema, { $schema: _dialect, ...proposalInputSchema } (+5 more)

### Community 96 - "Saved shopper reviews"
Cohesion: 0.40
Nodes (4): Acceptance, Interface, Output and authority, Saved shopper reviews

### Community 97 - "dashboard.ts"
Cohesion: 0.31
Nodes (12): createAppStateReader(), commandId(), createDashboardServer(), DashboardAssets, main(), parsePort(), root, sourceFromArgs() (+4 more)

### Community 99 - "app-page.test.ts"
Cohesion: 0.17
Nodes (7): root, entry, fixedClock, root, createFileSubmissionJournal(), digest(), root

### Community 100 - "cli/src/mandate.test.ts"
Cohesion: 0.50
Nodes (4): Drafting from plain English, Mandate planning, Mandate planning and the bounded shopper, Tests

### Community 101 - "backend-session.ts"
Cohesion: 0.21
Nodes (9): INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES, resendUnresolvedCarts(), SessionOptionsSchema, ProposalOutcome, ShoppingSession (+1 more)

### Community 102 - "createSession"
Cohesion: 0.30
Nodes (10): catalogFacts(), createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput(), createShoppingSession() (+2 more)

### Community 103 - "src/worker.test.ts"
Cohesion: 0.18
Nodes (6): build, laptops, mandate, monitors, noUsage, storeA

### Community 104 - "app-page.test.ts"
Cohesion: 0.24
Nodes (6): assets, dashboard(), POLICY, running(), state(), text()

### Community 105 - "tests/test-worker.ts"
Cohesion: 0.32
Nodes (6): raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig

### Community 106 - "catalog.ts"
Cohesion: 0.29
Nodes (5): CartCosts, CatalogSource, createFixtureCatalogSource(), FixtureCatalogsSchema, seed()

## Knowledge Gaps
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `paypal-provider.ts`, `paypal-provider.test.ts`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `authority.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1437908496732026 - nodes in this community are weakly interconnected._
- **Why does `runTransaction()` connect `paypal-provider.test.ts` to `authority.ts`, `index.ts`, `paypal-provider.ts`, `execution/worker.ts`, `README.md`, `worker-paypal.test.ts`, `canonicalize`, `ledger/store.ts`, `cli/src/backend.ts`, `application.ts`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11083743842364532 - nodes in this community are weakly interconnected._
- **Why does `Submission pack` connect `Devpost description draft` to `README.md`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08232118758434548 - nodes in this community are weakly interconnected._