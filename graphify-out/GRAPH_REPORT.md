# Graph Report - Splittap-pay  (2026-11-09)

## Corpus Check
- 145 files · ~198,822 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 1748 nodes · 4348 edges · 88 communities (82 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 147 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bffcf969`
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
- model.ts
- cli/src/backend.test.ts
- execution/worker.test.ts
- execution/worker.ts
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
- canonicalize
- cli/src/mandate.test.ts
- shopper.ts
- Unit 2 result: trusted authority and SQLite atomic reservations
- backend-session.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- Devpost description draft
- src/worker.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- fake.ts
- ci.yml
- review.ts
- mandate-drafter.ts
- Delivered
- saved-review.ts
- Delivered
- Setting up a new device
- anthropic.test.ts
- execution/test-worker.ts
- client.mock.test.ts
- Demo script
- dashboard-http-ui.test.ts
- What we have to do
- client.test.ts
- Mandate
- paypal/client.ts
- src/worker.test.ts
- ref_node_fs
- paypal-provider.test.ts
- application.ts
- tests/test-worker.ts
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
- `Observations (records, no code)` --references--> `authorizeOperationHold()`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/execution/paypal-provider.ts

## Import Cycles
- None detected.

## Communities (88 total, 6 thin omitted)

### Community 0 - "authority.ts"
Cohesion: 0.11
Nodes (42): ledger(), loadActiveAuthority(), parseStoredPolicy(), AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), definePolicySnapshot() (+34 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.09
Nodes (34): BUDGET, capture(), captureCart(), cart(), Cart, CART_A, CART_B, CART_C (+26 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.07
Nodes (39): CaptureAuthorizationInput, GatewayOutcome, GetCaptureInput, RefundCaptureInput, approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody() (+31 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (23): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+15 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.08
Nodes (34): BackendErrorResponseSchema, BackendMethod, BackendMethodSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema (+26 more)

### Community 5 - "Hackathon project: an AI purchasing agent that can't overspend"
Cohesion: 0.15
Nodes (13): Answers to likely judge questions, Architecture, Decision log, Demo script, Design rules (non-negotiable), Hackathon project: an AI purchasing agent that can't overspend, How it works, PayPal: what we rely on (+5 more)

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
Cohesion: 0.14
Nodes (9): DRAFT_TOOL_NAME, MandateDraftInput, input, kit, policy, recording(), requestText, [scriptedCall] (+1 more)

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
Nodes (16): Backend exclusions, Backend framework comparison, Contract operations to design first, Optional supplier simulator platforms, Order of implementation, Ownership in the current repository, PayPal adapter, Persistence (+8 more)

### Community 17 - "Backend delivery run"
Cohesion: 0.25
Nodes (7): Backend delivery run, Current phase, Evidence and constraints, Outcome and authority, Planned acceptance, Throughput checkpoint, Workflow

### Community 18 - "Delivery findings"
Cohesion: 0.50
Nodes (3): Delivery findings, design-critic-r1-1, design-critic-r1-2

### Community 23 - "Unit 1 result"
Cohesion: 0.17
Nodes (14): Delivered, Files and scope notes, Limitations, Unit 1 result, Unit 1 review follow-up, Verification, createMockBackend(), findMandate() (+6 more)

### Community 24 - "ledger/store.ts"
Cohesion: 0.07
Nodes (38): Root cause, with runtime evidence, ValidatedMandateRead, MandateAuthority, bindingState(), effectRow(), operationAndReservation(), auditDetailsFor(), effectRow() (+30 more)

### Community 25 - "model.ts"
Cohesion: 0.21
Nodes (8): AnthropicModelOptions, ModelConversation, ModelPrompt, ModelToolCall, ModelToolResult, ModelTurn, ScriptedCall, ShoppingModel

### Community 26 - "cli/src/backend.test.ts"
Cohesion: 0.12
Nodes (18): accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest(), root, runBackend() (+10 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.10
Nodes (12): CartSubmission, Quote, QuoteSchema, ExecutionSupplier, ChildOperation, ChildResult, EXEC_WORKER_PATH, Harness (+4 more)

### Community 28 - "execution/worker.ts"
Cohesion: 0.12
Nodes (15): PaymentProvider, ApplicationBackendConfig, ApplyOutcome, ExecutionProvider, LookupOutcome, PROVIDER_CALL_TIMEOUT_MS, ProviderAnswer, ClockSample (+7 more)

### Community 29 - "dashboard-state.ts"
Cohesion: 0.08
Nodes (30): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, DashboardOperation, DashboardReader, DashboardStore, DEMO_SESSION_FILE (+22 more)

### Community 30 - "ref_node_path"
Cohesion: 0.11
Nodes (28): DEMO_NOW, loadInput(), readJson(), main(), printResult(), integerOption(), runStore(), Catalog (+20 more)

### Community 32 - "index.ts"
Cohesion: 0.12
Nodes (24): InputOptions, amount, BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, Check, currency, EvaluationInputSchema (+16 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.12
Nodes (37): Delivered, AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, describeUnknown(), HoldCommandConfig (+29 more)

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
Cohesion: 0.20
Nodes (10): Dashboard, Demo flow, Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here (+2 more)

### Community 39 - "shop.ts"
Cohesion: 0.16
Nodes (30): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), readLedgerFacts() (+22 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "agent/src/mandate.ts"
Cohesion: 0.14
Nodes (17): compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DraftOrigin, DraftOriginSchema (+9 more)

### Community 42 - "dashboard.test.ts"
Cohesion: 0.11
Nodes (17): assertReadOnlyCommand(), commandAction(), CommandResult, CommandRunner, createProcessRunner(), DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), DashboardSource (+9 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.26
Nodes (29): database(), Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Minors, effectKey(), callBounded(), createExecutionWorker(), callProvider(), captureRequestPayload() (+21 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.07
Nodes (30): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, AuthorizeOutcome, CaptureEvidence (+22 more)

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
Nodes (61): awaitEnter(), checkSummary(), childEnvironment(), DEFAULT_MODE_STATEMENT, DEMO_SESSION_FILE, demoBackendConfig(), DemoFailure, DemoPlan (+53 more)

### Community 50 - "cli/src/backend.ts"
Cohesion: 0.09
Nodes (50): assertDistinctDatabases(), assertPrivateWindowsDatabase(), assertPrivateWindowsDirectory(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS (+42 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.10
Nodes (20): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+12 more)

### Community 52 - "canonicalize"
Cohesion: 0.16
Nodes (15): createFakeProviderGateway(), createExecutionProvider(), payPalApply(), payPalLookupCapture(), payPalLookupRefund(), isUsableIdentity(), openLedgerReadConnection(), parseCaptureRequest() (+7 more)

### Community 53 - "cli/src/mandate.test.ts"
Cohesion: 0.11
Nodes (15): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+7 more)

### Community 54 - "shopper.ts"
Cohesion: 0.06
Nodes (41): BackendErrorCode, EligibilityResult, Tests, CartEstimate, CatalogFacts, catalogFacts(), createOfflineShoppingSession(), createSession() (+33 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "backend-session.ts"
Cohesion: 0.21
Nodes (9): INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES, resendUnresolvedCarts(), SessionOptionsSchema, ProposalOutcome, ShoppingSession (+1 more)

### Community 57 - "agent/package.json"
Cohesion: 0.24
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery, mocked contracts and limited manual observations (incomplete), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.08
Nodes (29): built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview(), CSI_C1 (+21 more)

### Community 60 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.14
Nodes (13): Checks, Checks, Deviations, Deviations, Goldfish review round 1 (2026-11-05), Goldfish review round 2 (2026-11-05), Honest boundaries, Minors (+5 more)

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (16): AI tools list, Checklist, Devpost description draft, How AI is used, How it works, How PayPal is used, In the product, Judge access: proposal (+8 more)

### Community 62 - "src/worker.ts"
Cohesion: 0.17
Nodes (9): describe(), ModelCallError, ModelToolDefinition, ToolArgsSchemas, beforeDeadline(), contractNames, deriveOutcome(), LimitsSchema (+1 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation, ExpectedMoney

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "fake.ts"
Cohesion: 0.15
Nodes (11): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, FakeProviderGateway, loadProviderRow(), openProviderDatabase(), ProviderRow (+3 more)

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.06
Nodes (49): BackendErrorCodeSchema, Operation, amount, BackendKind, BudgetView, budgetView(), buildRunReview(), CartBuildSchema (+41 more)

### Community 68 - "mandate-drafter.ts"
Cohesion: 0.21
Nodes (10): draftMandateWithModel(), InputSchema, MandateDraftOutcome, MandateDraftRun, ProposalSchema, { $schema: _dialect, ...proposalInputSchema }, STATED_FIELDS, statedValues() (+2 more)

### Community 69 - "Delivered"
Cohesion: 0.29
Nodes (9): Delivered, assertLeaseHeld(), claimLeaseRow(), consumeReservationRow(), insertEffectIntentRow(), LeaseLost, loadLeaseRow(), releaseReservationRow() (+1 more)

### Community 70 - "saved-review.ts"
Cohesion: 0.08
Nodes (29): canonical(), prepareSavedReviewFile(), present(), SavedReviewDestination, OUTCOME_SENTENCES, aggregateMinor, BudgetSchema, CheckGroupSchema (+21 more)

### Community 71 - "Delivered"
Cohesion: 0.17
Nodes (11): Answers for the teammate (issue #16), Checks, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations, Observations (records, no code), Original operation schema proposal (superseded by issue #16 follow-up) (+3 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.25
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "anthropic.test.ts"
Cohesion: 0.20
Nodes (7): createAnthropicModel(), DEFAULT_SHOPPER_MODEL, prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, SHOPPER_SYSTEM_PROMPT, SHOPPING_MODEL_TOOLS

### Community 74 - "execution/test-worker.ts"
Cohesion: 0.31
Nodes (8): FakeProviderScenario, PaymentProviderSelection, PayPalProviderScenario, buildScriptedPayPalChild(), PayPalScript, raw, readLine(), RunConfig

### Community 75 - "client.mock.test.ts"
Cohesion: 0.10
Nodes (18): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendRequest, BackendRequestSchema (+10 more)

### Community 76 - "Demo script"
Cohesion: 0.33
Nodes (6): Before you record, Demo script, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), The script, What not to say, With the dashboard beside the terminal

### Community 77 - "dashboard-http-ui.test.ts"
Cohesion: 0.14
Nodes (5): budgetCard(), ClientNode, descendants(), renderClient(), SECURITY_HEADERS

### Community 78 - "What we have to do"
Cohesion: 0.33
Nodes (6): Judging criteria, Prizes, Schedule, The rules, What to submit, What we have to do

### Community 79 - "client.test.ts"
Cohesion: 0.20
Nodes (8): Delivered, createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError, DENIED()

### Community 80 - "Mandate"
Cohesion: 0.40
Nodes (5): BudgetSnapshot, Mandate, LedgerFacts, SessionConfig, LoadedAuthority

### Community 81 - "paypal/client.ts"
Cohesion: 0.22
Nodes (12): PayPalMoney, Authorization, BASE_URLS, Capture, CaptureParams, Order, PayPalClient, PayPalConfig (+4 more)

### Community 82 - "src/worker.test.ts"
Cohesion: 0.12
Nodes (24): fixture(), review(), shop(), createBackendClient(), BackendSessionError, createBackendShoppingSession(), ResentCart, createScriptedModel() (+16 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.07
Nodes (25): entry, fixedClock, root, catalogFile, entry, lines, mandateFile, mockArgs (+17 more)

### Community 84 - "paypal-provider.test.ts"
Cohesion: 0.12
Nodes (22): closeHarness(), createHarness(), Harness, NarrowingCase, OpenChildRun, SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH (+14 more)

### Community 89 - "application.ts"
Cohesion: 0.16
Nodes (27): wireOperation(), authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend(), catalogList(), handleProposalSubmit() (+19 more)

### Community 91 - "tests/test-worker.ts"
Cohesion: 0.24
Nodes (9): ConfiguredCatalog, ConfiguredSupplier, raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig (+1 more)

### Community 96 - "agent/README.md"
Cohesion: 0.22
Nodes (7): Drafting from plain English, Mandate planning, Mandate planning and the bounded shopper, Acceptance, Interface, Output and authority, Saved shopper reviews

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `paypal-provider.ts`, `execution/worker.ts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `authority.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10909090909090909 - nodes in this community are weakly interconnected._
- **Why does `runTransaction()` connect `paypal-provider.ts` to `authority.ts`, `createExecutionWorker`, `README.md`, `worker-paypal.test.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `ledger/store.ts`, `application.ts`, `cli/src/backend.test.ts`, `execution/worker.test.ts`, `execution/worker.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09446693657219973 - nodes in this community are weakly interconnected._
- **Why does `BudgetSnapshot` connect `Mandate` to `index.ts`, `review.ts`, `CLI-first architecture`, `shopper.ts`, `application.ts`, `Acceptance evidence trail (offline, all reproducible below)`, `execution/worker.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07198228128460686 - nodes in this community are weakly interconnected._