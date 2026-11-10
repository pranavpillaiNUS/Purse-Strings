# Graph Report - Splittap-pay  (2026-11-10)

## Corpus Check
- 157 files · ~225,046 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1937 nodes · 4550 edges · 99 communities (90 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d960c464`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authority.ts
- paypal-spike.ts
- gateway.test.ts
- scripts
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
- paypal/client.ts
- ledger/store.ts
- src/worker.test.ts
- cli/src/backend.test.ts
- execution/worker.test.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- dashboard-state.ts
- app/app.js
- index.ts
- paypal-provider.ts
- dashboard/app.js
- Backend wire API (simulation) and the PayPal gateway contract
- review-output.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- mandate-drafter.ts
- app-server.ts
- CLI-first architecture
- createExecutionWorker
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- app-conversation.ts
- worker-paypal.test.ts
- demo-flow.ts
- cli/src/backend.ts
- Backend delivery design (accepted specification with implementation status)
- paypal-provider.test.ts
- cli/src/mandate.test.ts
- Local web app that runs the demo flow — design
- Unit 2 result: trusted authority and SQLite atomic reservations
- shopper.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- cli/src/mandate.ts
- Devpost description draft
- Catalog
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- execution/worker.ts
- ci.yml
- review.ts
- client.test.ts
- createPayPalGateway
- saved-review.ts
- Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen
- Setting up a new device
- execution/test-worker.ts
- shop-draft.test.ts
- backend-transport.test.ts
- seeds.test.ts
- dashboard.ts
- json
- Node
- Review Focus
- saved-review.test.ts
- ref_node_fs
- concurrency.test.ts
- app-takes.ts
- agent/src/mandate.ts
- mandate-drafter.test.ts
- Before you record
- application.ts
- control.ts
- tests/test-worker.ts
- app-page.test.ts
- Frontend Design
- Unit 1 result
- GatewayInputError
- Saved shopper reviews
- Splittap
- ref_node_assert
- ref_node_timers

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

## Communities (99 total, 4 thin omitted)

### Community 0 - "authority.ts"
Cohesion: 0.12
Nodes (39): ledger(), loadActiveAuthority(), parseStoredPolicy(), AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), definePolicySnapshot() (+31 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.12
Nodes (25): BUDGET, capture(), captureCart(), CART_A, CART_B, CART_C, checkCapture(), describe() (+17 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.09
Nodes (25): CaptureAuthorizationInput, ExpectedMoney, GetCaptureInput, approveLink(), authorizationBody(), authorizedOrderBody(), authorizeInput, capBodySGD5541() (+17 more)

### Community 3 - "scripts"
Cohesion: 0.07
Nodes (27): description, devDependencies, @types/node, typescript, engines, node, license, name (+19 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.05
Nodes (50): BackendErrorResponseSchema, BackendMethod, BackendMethodSchema, BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendSuccessResponseSchema (+42 more)

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

### Community 10 - "anthropic.ts"
Cohesion: 0.13
Nodes (13): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+5 more)

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
Cohesion: 0.16
Nodes (16): cart(), assertSupportedCurrency(), paypalMoney, SUPPORTED_CURRENCIES, toMinor(), Authorization, BASE_URLS, Capture (+8 more)

### Community 24 - "ledger/store.ts"
Cohesion: 0.11
Nodes (33): ref_node_sqlite, resolveIdentities(), applyMigrations(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION, bindIdempotencyAlias() (+25 more)

### Community 25 - "src/worker.test.ts"
Cohesion: 0.10
Nodes (13): ModelConversation, ModelToolCall, ModelToolDefinition, ModelTurn, ScriptedCall, ScriptedStep, ShoppingModel, build (+5 more)

### Community 26 - "cli/src/backend.test.ts"
Cohesion: 0.12
Nodes (19): createPrivateRuntimeDirectory(), accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest(), root (+11 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.11
Nodes (17): auditDetailsFor(), ChildOperation, ChildResult, effectRow(), EXEC_WORKER_PATH, Harness, operationAndReservation(), providerEffectOutcomes() (+9 more)

### Community 28 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.08
Nodes (25): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Change (exact), Checks, Checks, Checks, Checks, Delivered, Deviations (+17 more)

### Community 29 - "dashboard-state.ts"
Cohesion: 0.05
Nodes (44): assertReadOnlyCommand(), AuditOutputSchema, BackendConfigSchema, buildDashboardState(), commandAction(), CommandIdSchema, CommandResult, CommandRunner (+36 more)

### Community 30 - "app/app.js"
Cohesion: 0.16
Nodes (30): actionArea(), actions, ACTOR, button(), conversationPanel(), el(), entryNode(), filesPanel() (+22 more)

### Community 32 - "index.ts"
Cohesion: 0.10
Nodes (28): DEMO_NOW, InputOptions, loadInput(), readJson(), amount, BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema (+20 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.15
Nodes (29): AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, payPalApply(), describeUnknown(), HoldCommandConfig (+21 more)

### Community 34 - "dashboard/app.js"
Cohesion: 0.25
Nodes (23): card(), chip(), date(), dateTime(), eventText(), h(), lookup(), money() (+15 more)

### Community 35 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.20
Nodes (10): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Private runtime folders, Provider selection and credentials (unit 5), Replay, cart identity and idempotency aliases, Starting point: the operator CLI, The contract mock, and why accepting a mock result proves nothing (+2 more)

### Community 36 - "review-output.ts"
Cohesion: 0.09
Nodes (57): formatSgd(), ascii(), ASCII_FOLDS, bar(), barLine(), briefNextStepLines(), briefRefusalLine(), briefSummaryBody() (+49 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.18
Nodes (11): Dashboard, Demo flow, Fixture-store controls, Local app, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing (+3 more)

### Community 39 - "shop.ts"
Cohesion: 0.12
Nodes (31): readLedgerFacts(), useColor(), canonical(), prepareSavedReviewFile(), present(), readSavedReviewFile(), SavedReviewDestination, backendKind() (+23 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "mandate-drafter.ts"
Cohesion: 0.19
Nodes (12): DRAFT_TOOL_NAME, draftMandateWithModel(), InputSchema, MandateDraftInput, MandateDraftOutcome, MandateDraftRun, ProposalSchema, { $schema: _dialect, ...proposalInputSchema } (+4 more)

### Community 42 - "app-server.ts"
Cohesion: 0.14
Nodes (24): ConversationEntry, root, AppAssets, AppState, createAppServer(), createAppStateReader(), HttpRefusal, loadAppAssets() (+16 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.24
Nodes (28): database(), effectKey(), callBounded(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim(), createIntent() (+20 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.07
Nodes (27): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, AuthorizeOutcome, CaptureEvidence (+19 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.29
Nodes (7): Application path (exercised 2026-11-07, PR #17 tree + one live fix), Demo-flow sandbox rehearsal (2026-11-09), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "app-conversation.ts"
Cohesion: 0.18
Nodes (16): Actor, buildConversation(), clip(), DraftOrigin, operationEntry(), readDraft(), readTakeRecords(), readText() (+8 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.09
Nodes (22): authorizationCapturedRoute(), authorizationDeniedRoute(), bindingState(), capturedAmount(), captureReadRoute(), captureRoute(), ChildOperation, ChildResult (+14 more)

### Community 49 - "demo-flow.ts"
Cohesion: 0.06
Nodes (62): awaitEnter(), BUYER_NOT_APPROVED, checkSummary(), childEnvironment(), closingStatement(), DEFAULT_MODE_STATEMENT, DEMO_SESSION_FILE, demoBackendConfig() (+54 more)

### Community 50 - "cli/src/backend.ts"
Cohesion: 0.11
Nodes (44): assertDistinctDatabases(), assertPrivateWindowsDatabase(), assertPrivateWindowsDirectory(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS (+36 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.10
Nodes (20): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+12 more)

### Community 52 - "paypal-provider.test.ts"
Cohesion: 0.15
Nodes (21): createExecutionProvider(), payPalLookupCapture(), payPalLookupRefund(), openLedgerReadConnection(), authorizationReadRoute(), captureSucceededRoute(), Harness, harnessFetch() (+13 more)

### Community 53 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 54 - "Local web app that runs the demo flow — design"
Cohesion: 0.11
Nodes (17): Approach: a web wrapper around `demo:flow`, Architecture, Changes to `demo:flow` (Role B file), Custom requests and the six scenes, Errors, Goal, HTTP surface, Identity and authority (+9 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.05
Nodes (55): BackendErrorCode, BackendClient, CartSubmission, BackendSessionError, INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES (+47 more)

### Community 57 - "agent/package.json"
Cohesion: 0.20
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, zod, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery, mocked contracts and limited manual observations (incomplete), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.10
Nodes (23): built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview(), CSI_C1 (+15 more)

### Community 60 - "cli/src/mandate.ts"
Cohesion: 0.25
Nodes (14): main(), printResult(), bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson() (+6 more)

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (16): AI tools list, Checklist, Devpost description draft, Freeze and recording handoff, How AI is used, How it works, How PayPal is used, In the product (+8 more)

### Community 62 - "Catalog"
Cohesion: 0.38
Nodes (5): Catalog, Quote, ConfiguredSupplier, ExecutionSupplier, SupplierAdapter

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Delivered, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "execution/worker.ts"
Cohesion: 0.11
Nodes (17): PaymentProvider, ApplicationBackendConfig, ApplyOutcome, ExecutionProvider, LookupOutcome, PROVIDER_CALL_TIMEOUT_MS, ProviderAnswer, ClockSample (+9 more)

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.06
Nodes (46): BackendErrorCodeSchema, Operation, BudgetSnapshot, amount, BackendKind, buildRunReview(), CartBuildSchema, CartSubmitSchema (+38 more)

### Community 68 - "client.test.ts"
Cohesion: 0.21
Nodes (6): createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError

### Community 69 - "createPayPalGateway"
Cohesion: 0.67
Nodes (3): createPayPalGateway(), assessAmount(), validIdHint()

### Community 70 - "saved-review.ts"
Cohesion: 0.10
Nodes (20): OUTCOME_SENTENCES, aggregateMinor, BudgetSchema, CheckGroupSchema, code, common, count, DecisionSchema (+12 more)

### Community 71 - "Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen"
Cohesion: 0.14
Nodes (13): Answers for the teammate (issue #16), Applied, Checks, Delivered, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations (+5 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.29
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "execution/test-worker.ts"
Cohesion: 0.12
Nodes (17): createFakeProviderGateway(), FakeProviderGateway, FakeProviderScenario, loadProviderRow(), openProviderDatabase(), ProviderRow, RawRow, readString() (+9 more)

### Community 74 - "shop-draft.test.ts"
Cohesion: 0.20
Nodes (6): calls, cliEntry, root, shopEntry, textFile, UnconfirmedMandateSchema

### Community 75 - "backend-transport.test.ts"
Cohesion: 0.29
Nodes (7): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendTransport

### Community 76 - "seeds.test.ts"
Cohesion: 0.31
Nodes (11): FIXTURE_SEEDS, fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog(), seedPath(), updateFixtureCatalog(), writableCatalogPath() (+3 more)

### Community 77 - "dashboard.ts"
Cohesion: 0.12
Nodes (19): commandId(), createDashboardServer(), DashboardAssets, DashboardServerOptions, budgetCard(), ClientNode, descendants(), mandateCard() (+11 more)

### Community 78 - "json"
Cohesion: 0.17
Nodes (13): authorizationReadRoute(), authorizeRoute(), captureProblemHarness(), captureReadRoute(), captureRoute(), harness(), json(), makeGateway() (+5 more)

### Community 80 - "Review Focus"
Cohesion: 0.17
Nodes (11): After the tasks (people, not code), Global Constraints, Local Web App Implementation Plan, Review Focus, Task 1: `demo:flow --request-file`, Task 2: Buyer re-wait and `approvalUrl` in the session, Task 3: Take manager (child process and Continue/Stop rules), Task 4: Conversation entries (+3 more)

### Community 82 - "saved-review.test.ts"
Cohesion: 0.15
Nodes (25): fixture(), review(), shop(), createBackendClient(), createMock(), createMockBackend(), createBackendShoppingSession(), ResentCart (+17 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.08
Nodes (28): entry, fixedClock, root, catalogFile, entry, lines, mandateFile, mockArgs (+20 more)

### Community 84 - "concurrency.test.ts"
Cohesion: 0.10
Nodes (24): ConfiguredCatalog, closeHarness(), createHarness(), Harness, NarrowingCase, OpenChildRun, SubmitWorkerResult, VerifyWorkerResult (+16 more)

### Community 85 - "app-takes.ts"
Cohesion: 0.07
Nodes (33): STARTUP_NOTE, assets, emptyState, policy, runBody, serve(), stubTakes(), ContinueInputSchema (+25 more)

### Community 86 - "agent/src/mandate.ts"
Cohesion: 0.13
Nodes (17): MandateSchema, PolicySchema, distinct(), DraftAssumptionSchema, DraftOrigin, DraftOriginSchema, DraftReviewCheck, Kit (+9 more)

### Community 87 - "mandate-drafter.test.ts"
Cohesion: 0.14
Nodes (11): compileProposal(), contentDigest(), createMandateDraft(), digest, input, kit, policy, recording() (+3 more)

### Community 88 - "Before you record"
Cohesion: 0.25
Nodes (8): Before you record, Demo script, Recording from the local app, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), Scripted takes, including a final recording, The script, What not to say, With the dashboard beside the terminal

### Community 89 - "application.ts"
Cohesion: 0.14
Nodes (26): Mandate, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend(), catalogList(), handleProposalSubmit() (+18 more)

### Community 90 - "control.ts"
Cohesion: 0.33
Nodes (6): EvidenceSchema, ref_node_crypto, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema

### Community 91 - "tests/test-worker.ts"
Cohesion: 0.32
Nodes (7): ref_node_readline, raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig

### Community 92 - "app-page.test.ts"
Cohesion: 0.24
Nodes (6): assets, dashboard(), POLICY, running(), state(), ref_node_vm

### Community 93 - "Frontend Design"
Cohesion: 0.29
Nodes (6): Design principles, Frontend Design, Ground your designs in the subject matter, More on writing in design, Process: plan, review against the brief, build, critique, Restraint and self-critique

### Community 94 - "Unit 1 result"
Cohesion: 0.29
Nodes (6): Delivered, Files and scope notes, Limitations, Unit 1 result, Unit 1 review follow-up, Verification

### Community 95 - "GatewayInputError"
Cohesion: 0.33
Nodes (5): GatewayInputError, validateExpected(), validateHeaderIdField(), validateIdField(), validateInputObject()

### Community 96 - "Saved shopper reviews"
Cohesion: 0.40
Nodes (4): Acceptance, Interface, Output and authority, Saved shopper reviews

### Community 97 - "Splittap"
Cohesion: 0.40
Nodes (5): Judging criteria map, Run the story, Splittap, What this does not prove, What this proves

## Knowledge Gaps
- **697 isolated node(s):** `name`, `private`, `type`, `description`, `draft` (+692 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 868 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createExecutionWorker()` connect `createExecutionWorker` to `execution/worker.ts`, `execution/test-worker.ts`, `worker-paypal.test.ts`, `cli/src/backend.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `Operation` connect `review.ts` to `execution/worker.ts`, `review-output.ts`, `contracts/src/backend.ts`, `shop.ts`, `cli/src/backend.ts`, `shopper.ts`, `application.ts`, `cli/src/backend.test.ts`, `review-output.test.ts`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `createMockBackend()` connect `saved-review.test.ts` to `review.ts`, `contracts/src/backend.ts`, `shop.test.ts`, `shop.ts`, `seeds.test.ts`, `src/worker.test.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _697 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authority.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12195121951219512 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1225071225071225 - nodes in this community are weakly interconnected._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09113300492610837 - nodes in this community are weakly interconnected._