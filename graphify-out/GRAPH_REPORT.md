# Graph Report - purse-policy-integration  (2026-11-12)

## Corpus Check
- 160 files · ~234,038 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2042 nodes · 4806 edges · 95 communities (84 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `24cd9780`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- policy-upload.ts
- paypal-spike.ts
- gateway.test.ts
- scripts
- contracts/src/backend.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- src/worker.test.ts
- checker/package.json
- suppliers/package.json
- README.md
- The shopper
- CLI backend delivery specification
- Team scope and framework assessment
- Backend delivery run
- Delivery findings
- paypal/client.ts
- ledger/store.ts
- execution/worker.test.ts
- createExecutionWorker
- dashboard.test.ts
- paypal-provider.test.ts
- dashboard-state.ts
- app/app.js
- index.ts
- CatalogSchema
- dashboard/app.js
- Backend wire API (simulation) and the PayPal gateway contract
- review-output.ts
- shop.test.ts
- Purse Strings — CLI-first equipment purchasing
- shop.ts
- Purse Strings purchasing agent
- shop-draft.test.ts
- app-server.ts
- CLI-first architecture
- cli/src/mandate.test.ts
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- app-conversation.ts
- saved-review-cli.test.ts
- ClientNode
- application.ts
- Backend delivery design (accepted specification with implementation status)
- mock.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- Local web app that runs the demo flow — design
- Unit 2 result: trusted authority and SQLite atomic reservations
- shopper.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- createPayPalGateway
- Devpost description draft
- demo-flow.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- client.mock.test.ts
- ci.yml
- review.ts
- client.test.ts
- saved-review.ts
- Purse Strings
- Setting up a new device
- execution/worker.ts
- ClientNode
- backend-transport.test.ts
- seeds.test.ts
- dashboard.ts
- cli/src/backend.ts
- app-server.test.ts
- Review Focus
- ExecutionWorker
- saved-review.test.ts
- ref_node_assert
- authority.ts
- app-takes.ts
- agent/src/mandate.ts
- ref_node_timers
- Before you record
- Node
- Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen
- src/store.test.ts
- Unit 1 result
- app-page.test.ts
- Saved shopper reviews
- ref_node_fs

## God Nodes (most connected - your core abstractions)
1. `openLedgerStore()` - 38 edges
2. `handleCommand()` - 31 edges
3. `confirmMandateRevision()` - 28 edges
4. `main()` - 27 edges
5. `createFixtureSupplier()` - 26 edges
6. `renderRunReview()` - 25 edges
7. `CatalogSchema` - 24 edges
8. `createExecutionWorker()` - 24 edges
9. `main()` - 23 edges
10. `draftMandateRevision()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `handleProposalSubmit()` --indirect_call--> `database()`  [INFERRED]
  services/checker/src/application.ts → apps/cli/src/submission-journal.test.ts
- `handleValidRequest()` --indirect_call--> `database()`  [INFERRED]
  services/checker/src/application.ts → apps/cli/src/submission-journal.test.ts
- `mandateAuthorityForRead()` --indirect_call--> `database()`  [INFERRED]
  services/checker/src/application.ts → apps/cli/src/submission-journal.test.ts
- `operationGet()` --indirect_call--> `database()`  [INFERRED]
  services/checker/src/application.ts → apps/cli/src/submission-journal.test.ts
- `readTakeRecords()` --calls--> `parseSavedReview()`  [EXTRACTED]
  apps/cli/src/app-conversation.ts → services/agent/src/saved-review.ts

## Import Cycles
- None detected.

## Communities (95 total, 6 thin omitted)

### Community 0 - "policy-upload.ts"
Cohesion: 0.08
Nodes (25): LoadedConfig, FileStore, LocalFileStore, sha256(), CSV_HEADER, diffPolicies(), intField(), MAX_UPLOAD_BUDGET_MINOR (+17 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.12
Nodes (27): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+19 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.07
Nodes (39): CaptureAuthorizationInput, GatewayOutcome, GetCaptureInput, RefundCaptureInput, approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody() (+31 more)

### Community 3 - "scripts"
Cohesion: 0.07
Nodes (27): description, devDependencies, @types/node, typescript, engines, node, license, name (+19 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.10
Nodes (23): BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema, mandateVersion (+15 more)

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

### Community 10 - "src/worker.test.ts"
Cohesion: 0.07
Nodes (26): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+18 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "The shopper"
Cohesion: 0.14
Nodes (14): Drafting from plain English, Live runs, Mandate planning, Mandate planning and the bounded shopper, Not established, Read-only status, Run it, Save and replay a review (+6 more)

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

### Community 23 - "paypal/client.ts"
Cohesion: 0.18
Nodes (15): assertSupportedCurrency(), fromMinor(), paypalMoney, SUPPORTED_CURRENCIES, Authorization, BASE_URLS, Capture, CaptureParams (+7 more)

### Community 24 - "ledger/store.ts"
Cohesion: 0.09
Nodes (44): ref_node_sqlite, resolveIdentities(), loadMandateAuthority(), applyMigrations(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION (+36 more)

### Community 25 - "execution/worker.test.ts"
Cohesion: 0.05
Nodes (69): ledger(), createApplicationBackend(), confirmMandateRevision(), definePolicySnapshot(), draftMandateRevision(), createHarness(), authorizationCapturedRoute(), authorizationDeniedRoute() (+61 more)

### Community 26 - "createExecutionWorker"
Cohesion: 0.30
Nodes (24): database(), effectKey(), callBounded(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim(), createIntent() (+16 more)

### Community 27 - "dashboard.test.ts"
Cohesion: 0.11
Nodes (17): assertReadOnlyCommand(), commandAction(), CommandResult, createProcessRunner(), DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), ReadEntry, evidence (+9 more)

### Community 28 - "paypal-provider.test.ts"
Cohesion: 0.08
Nodes (50): createFakeProviderGateway(), AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, createExecutionProvider(), payPalApply() (+42 more)

### Community 29 - "dashboard-state.ts"
Cohesion: 0.10
Nodes (26): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, DashboardOperation, DashboardStore, displayPath(), EffectSchema (+18 more)

### Community 30 - "app/app.js"
Cohesion: 0.14
Nodes (39): actionArea(), actions, ACTOR, atResult(), button(), changeValue(), conversationPanel(), el() (+31 more)

### Community 32 - "index.ts"
Cohesion: 0.11
Nodes (27): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshotSchema (+19 more)

### Community 33 - "CatalogSchema"
Cohesion: 0.16
Nodes (12): Catalog, CatalogSchema, EvidenceSchema, MAX_AMOUNT_MINOR, createFixtureCatalogSource(), FixtureCatalogsSchema, applyFixtureChanges(), controlSource() (+4 more)

### Community 34 - "dashboard/app.js"
Cohesion: 0.25
Nodes (23): card(), chip(), date(), dateTime(), eventText(), h(), lookup(), money() (+15 more)

### Community 35 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.20
Nodes (10): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Private runtime folders, Provider selection and credentials (unit 5), Replay, cart identity and idempotency aliases, Starting point: the operator CLI, The contract mock, and why accepting a mock result proves nothing (+2 more)

### Community 36 - "review-output.ts"
Cohesion: 0.10
Nodes (53): formatSgd(), ascii(), ASCII_FOLDS, bar(), barLine(), briefNextStepLines(), briefRefusalLine(), briefSummaryBody() (+45 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Purse Strings — CLI-first equipment purchasing"
Cohesion: 0.17
Nodes (12): Dashboard, Demo flow, Fixture-store controls, Local app, Mandate draft and review, Purse Strings — CLI-first equipment purchasing, Run, Separate PayPal feasibility spike (+4 more)

### Community 39 - "shop.ts"
Cohesion: 0.15
Nodes (31): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), readLedgerFacts() (+23 more)

### Community 40 - "Purse Strings purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Purse Strings purchasing agent, Sources of truth and personalization (+1 more)

### Community 41 - "shop-draft.test.ts"
Cohesion: 0.20
Nodes (6): calls, cliEntry, root, shopEntry, textFile, UnconfirmedMandateSchema

### Community 42 - "app-server.ts"
Cohesion: 0.12
Nodes (20): ConversationEntry, ActivateInputSchema, AppAssets, AppState, createAppStateReader(), EmptyInputSchema, HttpRefusal, KNOWN_SUPPLIERS (+12 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.07
Nodes (28): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, AuthorizeOutcome, CaptureEvidence (+20 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.29
Nodes (7): Application path (exercised 2026-11-07, PR #17 tree + one live fix), Demo-flow sandbox rehearsal (2026-11-09), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "app-conversation.ts"
Cohesion: 0.19
Nodes (14): Actor, buildConversation(), clip(), DraftOrigin, readDraft(), readTakeRecords(), readText(), reviewEntries() (+6 more)

### Community 48 - "saved-review-cli.test.ts"
Cohesion: 0.18
Nodes (6): catalogFile, entry, lines, mandateFile, mockArgs, root

### Community 50 - "application.ts"
Cohesion: 0.14
Nodes (28): Mandate, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), catalogList(), handleProposalSubmit(), handleValidRequest() (+20 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.10
Nodes (20): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+12 more)

### Community 52 - "mock.ts"
Cohesion: 0.18
Nodes (17): BackendMethod, BackendMethodSchema, canonicalCart(), canonicalize(), compareText(), correlationFields(), findMandate(), handleValidRequest() (+9 more)

### Community 53 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.08
Nodes (25): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Change (exact), Checks, Checks, Checks, Checks, Delivered, Deviations (+17 more)

### Community 54 - "Local web app that runs the demo flow — design"
Cohesion: 0.11
Nodes (17): Approach: a web wrapper around `demo:flow`, Architecture, Changes to `demo:flow` (Role B file), Custom requests and the six scenes, Errors, Goal, HTTP surface, Identity and authority (+9 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.05
Nodes (54): BackendErrorCode, CartSubmission, EligibilityResult, BackendSessionError, INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES (+46 more)

### Community 57 - "agent/package.json"
Cohesion: 0.20
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, zod, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery, mocked contracts and limited manual observations (incomplete), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.09
Nodes (25): built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview(), CSI_C1 (+17 more)

### Community 60 - "createPayPalGateway"
Cohesion: 0.33
Nodes (6): createPayPalGateway(), assessAmount(), relayFailure(), validIdHint(), unknownFromError(), unknownOutcome()

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (16): AI tools list, Checklist, Devpost description draft, Freeze and recording handoff, How AI is used, How it works, How PayPal is used, In the product (+8 more)

### Community 62 - "demo-flow.ts"
Cohesion: 0.06
Nodes (64): operationEntry(), awaitEnter(), BUYER_NOT_APPROVED, checkSummary(), childEnvironment(), closingStatement(), DEFAULT_MODE_STATEMENT, DEMO_SESSION_FILE (+56 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Delivered, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "client.mock.test.ts"
Cohesion: 0.15
Nodes (10): BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendClient, BackendProtocolError, cart, cartBase, catalog (+2 more)

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.06
Nodes (47): BackendErrorCodeSchema, Operation, BudgetSnapshot, amount, BackendKind, BudgetView, CartBuildSchema, CartSubmitSchema (+39 more)

### Community 68 - "client.test.ts"
Cohesion: 0.21
Nodes (6): createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError

### Community 70 - "saved-review.ts"
Cohesion: 0.08
Nodes (30): canonical(), prepareSavedReviewFile(), present(), SavedReviewDestination, OUTCOME_SENTENCES, aggregateMinor, BudgetSchema, CheckGroupSchema (+22 more)

### Community 71 - "Purse Strings"
Cohesion: 0.40
Nodes (5): Judging criteria map, Purse Strings, Run the story, What this does not prove, What this proves

### Community 72 - "Setting up a new device"
Cohesion: 0.29
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "execution/worker.ts"
Cohesion: 0.05
Nodes (49): PaymentProvider, PolicySchema, Quote, ref_node_readline, ApplicationBackendConfig, ConfiguredSupplier, FakeProviderGateway, FakeProviderScenario (+41 more)

### Community 74 - "ClientNode"
Cohesion: 0.09
Nodes (10): client(), ClientDocument, ClientNode, currentPolicy, descendants(), PostReply, Reply, state() (+2 more)

### Community 75 - "backend-transport.test.ts"
Cohesion: 0.25
Nodes (8): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendRequest, BackendTransport

### Community 76 - "seeds.test.ts"
Cohesion: 0.28
Nodes (13): integerOption(), runStore(), FIXTURE_SEEDS, fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog(), seedPath() (+5 more)

### Community 77 - "dashboard.ts"
Cohesion: 0.14
Nodes (21): commandId(), createDashboardServer(), DashboardAssets, DashboardServerOptions, budgetCard(), descendants(), mandateCard(), renderClient() (+13 more)

### Community 78 - "cli/src/backend.ts"
Cohesion: 0.06
Nodes (62): assertDistinctDatabases(), assertPrivateWindowsDatabase(), assertPrivateWindowsDirectory(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS (+54 more)

### Community 79 - "app-server.test.ts"
Cohesion: 0.09
Nodes (16): STARTUP_NOTE, assets, binding, emptyState, HttpChild, policy, runBody, serve() (+8 more)

### Community 80 - "Review Focus"
Cohesion: 0.17
Nodes (11): After the tasks (people, not code), Global Constraints, Local Web App Implementation Plan, Review Focus, Task 1: `demo:flow --request-file`, Task 2: Buyer re-wait and `approvalUrl` in the session, Task 3: Take manager (child process and Continue/Stop rules), Task 4: Conversation entries (+3 more)

### Community 82 - "saved-review.test.ts"
Cohesion: 0.16
Nodes (24): fixture(), review(), shop(), createBackendClient(), createMock(), createMockBackend(), createBackendShoppingSession(), createScriptedModel() (+16 more)

### Community 84 - "authority.ts"
Cohesion: 0.12
Nodes (20): ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), DraftRevisionResult, loadPolicySnapshot(), MandateAuthority, MandateDraft, MandateDraftSchema (+12 more)

### Community 85 - "app-takes.ts"
Cohesion: 0.09
Nodes (30): createAppServer(), sameToken(), ContinueInput, ContinueInputSchema, createTakeManager(), pending(), defaultSpawn(), end() (+22 more)

### Community 86 - "agent/src/mandate.ts"
Cohesion: 0.07
Nodes (38): compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DRAFT_TOOL_NAME, draftMandateWithModel() (+30 more)

### Community 88 - "Before you record"
Cohesion: 0.25
Nodes (8): Before you record, Demo script, Recording from the local app, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), Scripted takes, including a final recording, The script, What not to say, With the dashboard beside the terminal

### Community 91 - "Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen"
Cohesion: 0.14
Nodes (13): Answers for the teammate (issue #16), Applied, Checks, Delivered, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations (+5 more)

### Community 92 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 94 - "Unit 1 result"
Cohesion: 0.29
Nodes (6): Delivered, Files and scope notes, Limitations, Unit 1 result, Unit 1 review follow-up, Verification

### Community 95 - "app-page.test.ts"
Cohesion: 0.22
Nodes (5): assets, dashboard(), POLICY, running(), state()

### Community 96 - "Saved shopper reviews"
Cohesion: 0.40
Nodes (4): Acceptance, Interface, Output and authority, Saved shopper reviews

### Community 99 - "ref_node_fs"
Cohesion: 0.14
Nodes (15): root, entry, fixedClock, root, root, ref_node_child_process, ref_node_crypto, ref_node_fs (+7 more)

## Knowledge Gaps
- **714 isolated node(s):** `name`, `private`, `type`, `description`, `PostReply` (+709 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 910 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Node` connect `Node` to `app-page.test.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `openLedgerStore()` connect `execution/worker.test.ts` to `shop.test.ts`, `execution/worker.ts`, `cli/src/backend.ts`, `application.ts`, `ledger/store.ts`, `createExecutionWorker`, `paypal-provider.test.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _714 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `policy-upload.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07764705882352942 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11822660098522167 - nodes in this community are weakly interconnected._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07198228128460686 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._