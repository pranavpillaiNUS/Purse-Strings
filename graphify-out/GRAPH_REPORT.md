# Graph Report - Splittap-pay  (2026-11-10)

## Corpus Check
- 156 files · ~223,213 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 4, .css 2, .tsv 1)

## Summary
- 1925 nodes · 4780 edges · 101 communities (93 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 183 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5599f51c`
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
- paypal-provider.test.ts
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
- src/worker.test.ts
- cli/src/backend.ts
- shopper.test.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
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
- dashboard.test.ts
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
- canonicalize
- cli/src/mandate.test.ts
- concurrency.test.ts
- Unit 2 result: trusted authority and SQLite atomic reservations
- shopper.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- createSession
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
- confirmMandateRevision
- handleCommand
- client.mock.test.ts
- Unit 1 result
- dashboard-http-ui.test.ts
- CliError
- client.test.ts
- Majors
- main
- review.test.ts
- ref_node_fs
- execution/worker.test.ts
- createSession
- agent/src/mandate.ts
- Unit 1 result
- Demo script
- application.ts
- control.ts
- application.ts
- src/store.test.ts
- Architecture
- Unit 1 result
- formatMinor
- Saved shopper reviews
- run
- SandboxPaymentBackend
- ref_node_assert
- Mandate planning and the bounded shopper

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 45 edges
2. `openLedgerStore()` - 42 edges
3. `createApplicationBackend()` - 33 edges
4. `handleCommand()` - 32 edges
5. `canonicalize()` - 29 edges
6. `confirmMandateRevision()` - 28 edges
7. `main()` - 27 edges
8. `createFixtureSupplier()` - 27 edges
9. `runTransaction()` - 25 edges
10. `renderRunReview()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `PayPal gateway (unit-4 contract + unit-5 sandbox additions)` --references--> `GatewayInputError`  [INFERRED]
  docs/backend-api.md → services/checker/src/paypal/gateway.ts
- `Delivered` --references--> `GatewayUnknown`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/paypal/gateway.ts
- `Authority and evidence` --references--> `BudgetSnapshot`  [INFERRED]
  docs/architecture.md → packages/contracts/src/index.ts
- `M0 — delivered by the scaffold` --references--> `BudgetSnapshot`  [INFERRED]
  docs/backend-delivery-review.md → packages/contracts/src/index.ts
- `Milestones M4/M5` --references--> `createBackendClient()`  [INFERRED]
  docs/backend-delivery-review.md → packages/contracts/src/client.ts

## Import Cycles
- None detected.

## Communities (101 total, 8 thin omitted)

### Community 0 - "authority.ts"
Cohesion: 0.13
Nodes (22): extractSupplierId(), loadActiveAuthority(), parseStoredPolicy(), ValidatedMandateRead, AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision() (+14 more)

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
Cohesion: 0.08
Nodes (38): BackendErrorResponseSchema, BackendMethod, BackendMethodSchema, BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendSuccessResponseSchema (+30 more)

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

### Community 10 - "paypal-provider.test.ts"
Cohesion: 0.11
Nodes (17): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+9 more)

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
Cohesion: 0.10
Nodes (39): resolveIdentities(), loadMandateAuthority(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION, bindIdempotencyAlias(), bindOperationPaymentProvider() (+31 more)

### Community 25 - "src/worker.test.ts"
Cohesion: 0.08
Nodes (29): fixture(), review(), shop(), createBackendClient(), input, kit, policy, recording() (+21 more)

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.11
Nodes (21): assertPrivateWindowsDatabase(), loadWindowsVerdicts(), accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest() (+13 more)

### Community 27 - "shopper.test.ts"
Cohesion: 0.12
Nodes (22): catalogFacts(), createOfflineShoppingSession(), createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput() (+14 more)

### Community 28 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.14
Nodes (13): Checks, Checks, Deviations, Deviations, Goldfish review round 1 (2026-11-05), Goldfish review round 2 (2026-11-05), Honest boundaries, Minors (+5 more)

### Community 29 - "dashboard-state.ts"
Cohesion: 0.09
Nodes (28): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, CommandResult, DashboardOperation, DashboardReader, DashboardStore (+20 more)

### Community 30 - "ref_node_path"
Cohesion: 0.16
Nodes (31): actionArea(), actions, ACTOR, atResult(), button(), conversationPanel(), el(), entryNode() (+23 more)

### Community 32 - "index.ts"
Cohesion: 0.12
Nodes (26): InputOptions, amount, BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, Check, currency, EvaluationInput (+18 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.10
Nodes (46): Delivered, AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, createExecutionProvider(), payPalApply() (+38 more)

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
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.18
Nodes (11): Dashboard, Demo flow, Fixture-store controls, Local app, Mandate draft and review, Purse Strings — CLI-first equipment purchasing, Run, Separate PayPal feasibility spike (+3 more)

### Community 39 - "shop.ts"
Cohesion: 0.14
Nodes (27): readLedgerFacts(), useColor(), readSavedReviewFile(), backendKind(), buildModel(), buildTransport(), displayPath(), DRAFT_EXIT_CODES (+19 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Purse Strings purchasing agent, Sources of truth and personalization (+1 more)

### Community 41 - "dashboard.test.ts"
Cohesion: 0.11
Nodes (16): assertReadOnlyCommand(), commandAction(), createProcessRunner(), DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), DashboardSource, ReadEntry, evidence (+8 more)

### Community 42 - "dashboard.test.ts"
Cohesion: 0.12
Nodes (26): ConversationEntry, AppAssets, AppState, createAppServer(), HttpRefusal, loadAppAssets(), main(), parsePort() (+18 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "execution/worker.ts"
Cohesion: 0.15
Nodes (46): database(), Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Delivered, Majors, Minors, buildWireOperation(), effectKey(), callBounded() (+38 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.06
Nodes (34): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, AuthorizeOutcome, CaptureAuthorizationInput (+26 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.29
Nodes (7): Application path (exercised 2026-11-07, PR #17 tree + one live fix), Demo-flow sandbox rehearsal (2026-11-09), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "dashboard.ts"
Cohesion: 0.20
Nodes (14): Actor, buildConversation(), clip(), DraftOrigin, readDraft(), readTakeRecords(), readText(), reviewEntries() (+6 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.12
Nodes (15): authorizationCapturedRoute(), authorizationDeniedRoute(), capturedAmount(), captureReadRoute(), captureRoute(), ChildOperation, ChildResult, ExchangeLine (+7 more)

### Community 49 - "demo-flow.test.ts"
Cohesion: 0.11
Nodes (16): BUYER_NOT_APPROVED, DEFAULT_MODE_STATEMENT, DEMO_SESSION_FILE, SANDBOX_CREDENTIAL_PROBE_ID, STALE_HOURS, StoreView, baseConfig, CLOCKS (+8 more)

### Community 50 - "cli/src/backend.ts"
Cohesion: 0.14
Nodes (18): Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog, DATABASE_FILE_SUFFIXES, LoadedConfig, loadSandboxCredentials(), main() (+10 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.10
Nodes (20): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+12 more)

### Community 52 - "canonicalize"
Cohesion: 0.13
Nodes (16): Unit 1 review follow-up, BackendProtocolError, cart, cartBase, catalog, createMock(), mandate, createMockBackend() (+8 more)

### Community 53 - "cli/src/mandate.test.ts"
Cohesion: 0.11
Nodes (15): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+7 more)

### Community 54 - "concurrency.test.ts"
Cohesion: 0.17
Nodes (11): Approach: a web wrapper around `demo:flow`, Errors, Goal, Layout (laptop), Local web app that runs the demo flow — design, Out of scope, Ownership and agreement, Schedule (+3 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.29
Nodes (6): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.08
Nodes (32): BackendErrorCode, CartSubmission, EligibilityResult, BackendSessionError, INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES (+24 more)

### Community 57 - "agent/package.json"
Cohesion: 0.24
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery, mocked contracts and limited manual observations (incomplete), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.08
Nodes (29): built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview(), CSI_C1 (+21 more)

### Community 60 - "createSession"
Cohesion: 0.21
Nodes (16): DEMO_NOW, loadInput(), readJson(), main(), printResult(), bundled(), printable(), printableLine() (+8 more)

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (17): AI tools list, Checklist, Devpost description draft, Freeze and recording handoff, How AI is used, How it works, How PayPal is used, In the product (+9 more)

### Community 62 - "shopper.test.ts"
Cohesion: 0.13
Nodes (17): DemoPlan, Evidence, EXECUTION_PROVIDER, failureRecorder, ledgerMayContainSandboxState(), mayContainSandboxState(), restCell, root (+9 more)

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
Nodes (47): BackendErrorCodeSchema, Operation, amount, BackendKind, BudgetView, budgetView(), buildRunReview(), CartBuildSchema (+39 more)

### Community 68 - "handleCommand"
Cohesion: 0.20
Nodes (8): Delivered, createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError, DENIED()

### Community 69 - "createPayPalGateway"
Cohesion: 0.29
Nodes (9): cart(), assertSupportedCurrency(), fromMinor(), paypalMoney(), SUPPORTED_CURRENCIES, toMinor(), createPayPalGateway(), assessAmount() (+1 more)

### Community 70 - "saved-review.ts"
Cohesion: 0.10
Nodes (20): OUTCOME_SENTENCES, aggregateMinor, BudgetSchema, CheckGroupSchema, code, common, count, DecisionSchema (+12 more)

### Community 71 - "Delivered"
Cohesion: 0.17
Nodes (11): Answers for the teammate (issue #16), Checks, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations, Observations (records, no code), Original operation schema proposal (superseded by issue #16 follow-up) (+3 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.29
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "confirmMandateRevision"
Cohesion: 0.08
Nodes (31): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, createFakeProviderGateway(), FakeProviderGateway, FakeProviderScenario (+23 more)

### Community 74 - "handleCommand"
Cohesion: 0.18
Nodes (17): assertDistinctDatabases(), buildSuppliers(), emit(), expandPath(), handleCommand(), operationRow(), pathIdentity(), providerFacts() (+9 more)

### Community 75 - "client.mock.test.ts"
Cohesion: 0.29
Nodes (6): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport()

### Community 76 - "Unit 1 result"
Cohesion: 0.23
Nodes (13): FIXTURE_SEEDS, fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog(), seedPath(), fixtureDirectory, seedPath (+5 more)

### Community 77 - "dashboard-http-ui.test.ts"
Cohesion: 0.11
Nodes (19): commandId(), createDashboardServer(), DashboardAssets, DashboardServerOptions, budgetCard(), ClientNode, descendants(), mandateCard() (+11 more)

### Community 78 - "CliError"
Cohesion: 0.20
Nodes (16): assertPrivateWindowsDirectory(), checkPrivateRuntimeDirectory(), CliError, createPrivateRuntimeDirectory(), loadConfig(), loadSnapshotSet(), operatorIdentity(), parseArgv() (+8 more)

### Community 79 - "client.test.ts"
Cohesion: 0.11
Nodes (8): assets, dashboard(), Node, POLICY, render(), running(), state(), text()

### Community 80 - "Majors"
Cohesion: 0.13
Nodes (13): createTakeManager(), pending(), flowArguments(), FlowChild, lastTake(), readSessionIn(), SpawnFlow, claude (+5 more)

### Community 81 - "main"
Cohesion: 0.22
Nodes (16): closingStatement(), demoBackendConfig(), DemoFailure, dropEchoedRequest(), main(), addResult(), record(), scene() (+8 more)

### Community 82 - "review.test.ts"
Cohesion: 0.32
Nodes (7): BackendTransport, createBackendShoppingSession(), SavedReviewSchema, cart, fixture(), mandate, review()

### Community 83 - "ref_node_fs"
Cohesion: 0.12
Nodes (9): draft, recovery, catalogFile, directory(), entry, lines, mandateFile, mockArgs (+1 more)

### Community 84 - "execution/worker.test.ts"
Cohesion: 0.06
Nodes (52): ledger(), ConfiguredSupplier, definePolicySnapshot(), draftMandateRevision(), reviewMandateRevision(), sha256CanonicalJson(), createHarness(), bindingState() (+44 more)

### Community 85 - "createSession"
Cohesion: 0.11
Nodes (19): STARTUP_NOTE, assets, emptyState, policy, runBody, serve(), stubTakes(), ContinueInputSchema (+11 more)

### Community 86 - "agent/src/mandate.ts"
Cohesion: 0.08
Nodes (32): compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DRAFT_TOOL_NAME, draftMandateWithModel() (+24 more)

### Community 87 - "Unit 1 result"
Cohesion: 0.29
Nodes (7): canonical(), prepareSavedReviewFile(), present(), SavedReviewDestination, Task 4: Conversation entries, MAX_SAVED_REVIEW_BYTES, SavedReview

### Community 88 - "Demo script"
Cohesion: 0.25
Nodes (8): Before you record, Demo script, Recording from the local app, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), Scripted takes, including a final recording, The script, What not to say, With the dashboard beside the terminal

### Community 89 - "application.ts"
Cohesion: 0.11
Nodes (17): PaymentProvider, BudgetSnapshot, Mandate, Policy, Quote, LedgerFacts, SessionConfig, ApplicationBackend (+9 more)

### Community 90 - "control.ts"
Cohesion: 0.24
Nodes (7): EvidenceSchema, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema, cart, seedPath

### Community 91 - "application.ts"
Cohesion: 0.16
Nodes (22): Review record (EGM goldfish, five-round cap reached), buildSnapshot(), createApplicationBackend(), catalogList(), handleProposalSubmit(), handleValidRequest(), mandateAuthorityForRead(), operationGet() (+14 more)

### Community 92 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 93 - "Architecture"
Cohesion: 0.25
Nodes (8): awaitEnter(), childEnvironment(), Architecture, Changes to `demo:flow` (Role B file), Custom requests and the six scenes, HTTP surface, Identity and authority, New command: `npm run app`

### Community 94 - "Unit 1 result"
Cohesion: 0.33
Nodes (5): Delivered, Files and scope notes, Limitations, Unit 1 result, Verification

### Community 95 - "formatMinor"
Cohesion: 0.33
Nodes (7): operationEntry(), formatMinor(), inert(), recordsCell(), revisionSummary(), sandboxCredentialRefusal(), storeTable()

### Community 96 - "Saved shopper reviews"
Cohesion: 0.40
Nodes (4): Acceptance, Interface, Output and authority, Saved shopper reviews

### Community 97 - "run"
Cohesion: 0.29
Nodes (7): checkSummary(), backend(), run(), shopRun(), summarizeTrace(), wrapCommand(), wrapLine()

### Community 99 - "ref_node_assert"
Cohesion: 0.17
Nodes (6): root, entry, fixedClock, root, root, seed()

### Community 100 - "Mandate planning and the bounded shopper"
Cohesion: 0.50
Nodes (4): Drafting from plain English, Mandate planning, Mandate planning and the bounded shopper, Tests

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `confirmMandateRevision` to `paypal-provider.ts`, `README.md`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `authority.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `runTransaction()` connect `paypal-provider.ts` to `authority.ts`, `confirmMandateRevision`, `execution/worker.ts`, `worker-paypal.test.ts`, `execution/worker.test.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `ledger/store.ts`, `application.ts`, `cli/src/backend.ts`, `application.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11083743842364532 - nodes in this community are weakly interconnected._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08232118758434548 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08666666666666667 - nodes in this community are weakly interconnected._