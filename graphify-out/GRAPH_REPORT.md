# Graph Report - Splittap-pay  (2026-11-09)

## Corpus Check
- 145 files · ~198,730 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 1747 nodes · 4346 edges · 86 communities (80 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 147 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `17e917ca`
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
- cli/src/backend.test.ts
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
- createFixtureSupplier
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
- openLedgerStore
- ci.yml
- review.ts
- ref_node_child_process
- Detailed implementation decisions
- saved-review.ts
- Delivered
- Setting up a new device
- SandboxPaymentBackend
- client.mock.test.ts
- dashboard-http-ui.test.ts
- client.test.ts
- paypal/client.ts
- saved-review.test.ts
- ref_node_fs
- paypal-provider.test.ts
- createPayPalGateway
- application.ts
- tests/test-worker.ts
- submitProposal
- agent/README.md

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 45 edges
2. `openLedgerStore()` - 42 edges
3. `createApplicationBackend()` - 33 edges
4. `handleCommand()` - 32 edges
5. `canonicalize()` - 29 edges
6. `confirmMandateRevision()` - 28 edges
7. `createFixtureSupplier()` - 27 edges
8. `main()` - 27 edges
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

## Communities (86 total, 6 thin omitted)

### Community 0 - "contracts/src/backend.test.ts"
Cohesion: 0.17
Nodes (10): BackendErrorResponseSchema, CatalogListResultSchema, MandateGetResultSchema, OperationSchema, ProposalSubmitResultSchema, cart, catalog, mandate (+2 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.11
Nodes (26): BUDGET, capture(), captureCart(), Cart, CART_A, CART_B, CART_C, checkCapture() (+18 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.07
Nodes (39): CaptureAuthorizationInput, GatewayOutcome, GetCaptureInput, RefundCaptureInput, approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody() (+31 more)

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
Cohesion: 0.09
Nodes (22): distinct(), DRAFT_TOOL_NAME, draftMandateWithModel(), InputSchema, MandateDraftInput, MandateDraftOutcome, MandateDraftRun, ProposalSchema (+14 more)

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
Cohesion: 0.14
Nodes (13): Backend exclusions, Backend framework comparison, Optional supplier simulator platforms, Order of implementation, Ownership in the current repository, PayPal adapter, Persistence, Recommendation (+5 more)

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
Cohesion: 0.07
Nodes (51): Review record (EGM goldfish, five-round cap reached), ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult, loadPolicySnapshot(), MandateAuthority (+43 more)

### Community 25 - "src/worker.ts"
Cohesion: 0.07
Nodes (26): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+18 more)

### Community 26 - "cli/src/backend.test.ts"
Cohesion: 0.12
Nodes (18): accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest(), root, runBackend() (+10 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.06
Nodes (25): PaymentProvider, Quote, ApplicationBackendConfig, ConfiguredSupplier, FakeProviderGateway, FakeProviderScenario, loadProviderRow(), ProviderRow (+17 more)

### Community 28 - "backend-transport.test.ts"
Cohesion: 0.25
Nodes (8): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport(), BackendRequest, BackendTransport

### Community 29 - "dashboard-state.ts"
Cohesion: 0.08
Nodes (30): AuditOutputSchema, BackendConfigSchema, buildDashboardState(), CommandIdSchema, DashboardOperation, DashboardReader, DashboardStore, DEMO_SESSION_FILE (+22 more)

### Community 30 - "ref_node_path"
Cohesion: 0.19
Nodes (18): integerOption(), runStore(), Catalog, EvidenceSchema, applyFixtureChanges(), controlSource(), fixtureDirectory, isWithin() (+10 more)

### Community 32 - "index.ts"
Cohesion: 0.11
Nodes (25): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), Contract operations to design first, Shared interface and separation (+17 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.15
Nodes (30): Delivered, AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, payPalApply(), describeUnknown() (+22 more)

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
Cohesion: 0.17
Nodes (23): readLedgerFacts(), useColor(), backendKind(), buildModel(), buildTransport(), displayPath(), DRAFT_EXIT_CODES, EXIT_CODES (+15 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "agent/src/mandate.ts"
Cohesion: 0.11
Nodes (28): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), outputTarget() (+20 more)

### Community 42 - "dashboard.test.ts"
Cohesion: 0.11
Nodes (16): assertReadOnlyCommand(), commandAction(), CommandResult, CommandRunner, createProcessRunner(), DASHBOARD_READ_COMMANDS, dashboardChildEnvironment(), DashboardSource (+8 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "execution/worker.ts"
Cohesion: 0.07
Nodes (68): database(), Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Checks, Checks, Delivered, Deviations, Deviations, Goldfish review round 1 (2026-11-05) (+60 more)

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
Cohesion: 0.07
Nodes (59): awaitEnter(), checkSummary(), childEnvironment(), DEMO_SESSION_FILE, demoBackendConfig(), DemoFailure, DemoPlan, demoPlan() (+51 more)

### Community 50 - "cli/src/backend.ts"
Cohesion: 0.09
Nodes (52): assertDistinctDatabases(), assertPrivateWindowsDatabase(), assertPrivateWindowsDirectory(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS (+44 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.15
Nodes (13): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), Current system and sources, Detailed implementation plan, Durable fake execution, Goals and exclusions, Implementation status (addendum, accurate as of unit 4, 2026-11-06) (+5 more)

### Community 52 - "paypal-provider.test.ts"
Cohesion: 0.16
Nodes (21): createFakeProviderGateway(), createExecutionProvider(), payPalLookupCapture(), payPalLookupRefund(), openLedgerReadConnection(), authorizationReadRoute(), captureSucceededRoute(), Harness (+13 more)

### Community 53 - "createFixtureSupplier"
Cohesion: 0.17
Nodes (15): ConfiguredCatalog, CartSubmissionSchema, CatalogSchema, MAX_AMOUNT_MINOR, input(), load(), CartCosts, cartCosts() (+7 more)

### Community 54 - "shopper.test.ts"
Cohesion: 0.12
Nodes (22): Tests, catalogFacts(), createOfflineShoppingSession(), createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier() (+14 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.29
Nodes (6): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "shopper.ts"
Cohesion: 0.07
Nodes (33): BackendErrorCode, CartSubmission, EligibilityResult, Mandate, BackendSessionError, INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome() (+25 more)

### Community 57 - "agent/package.json"
Cohesion: 0.24
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery, mocked contracts and limited manual observations (incomplete), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.08
Nodes (30): PROVIDER_WORDING, built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview() (+22 more)

### Community 60 - "saved-review-cli.test.ts"
Cohesion: 0.17
Nodes (7): catalogFile, entry, lines, mandateFile, mockArgs, root, MAX_SAVED_REVIEW_BYTES

### Community 61 - "Devpost description draft"
Cohesion: 0.12
Nodes (16): AI tools list, Checklist, Devpost description draft, How AI is used, How it works, How PayPal is used, In the product, Judge access: proposal (+8 more)

### Community 62 - "mock.ts"
Cohesion: 0.21
Nodes (12): BackendMethod, BackendMethodSchema, OperationGetResultSchema, canonicalCart(), canonicalize(), compareText(), correlationFields(), MockBackend (+4 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation, ExpectedMoney

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "openLedgerStore"
Cohesion: 0.15
Nodes (18): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, openProviderDatabase(), bindingState(), effectRow() (+10 more)

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.05
Nodes (51): BackendErrorCodeSchema, Operation, BudgetSnapshot, amount, BackendKind, BudgetView, budgetView(), buildRunReview() (+43 more)

### Community 68 - "ref_node_child_process"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 69 - "Detailed implementation decisions"
Cohesion: 0.29
Nodes (7): CLI contract, Concrete storage, Detailed implementation decisions, Exact wire shapes, Lease and provider behavior, Readiness resolutions: imports and PayPal adapter, Review resolutions: cart identity and capture retries

### Community 70 - "saved-review.ts"
Cohesion: 0.08
Nodes (29): canonical(), prepareSavedReviewFile(), present(), readSavedReviewFile(), SavedReviewDestination, ResentCart, OUTCOME_SENTENCES, aggregateMinor (+21 more)

### Community 71 - "Delivered"
Cohesion: 0.17
Nodes (11): Answers for the teammate (issue #16), Checks, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations, Observations (records, no code), Original operation schema proposal (superseded by issue #16 follow-up) (+3 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.25
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 75 - "client.mock.test.ts"
Cohesion: 0.15
Nodes (10): BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendProtocolError, cart, cartBase, catalog, createMock() (+2 more)

### Community 77 - "dashboard-http-ui.test.ts"
Cohesion: 0.14
Nodes (5): budgetCard(), ClientNode, descendants(), renderClient(), SECURITY_HEADERS

### Community 79 - "client.test.ts"
Cohesion: 0.20
Nodes (8): Delivered, createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError, DENIED()

### Community 81 - "paypal/client.ts"
Cohesion: 0.22
Nodes (12): PayPalMoney, Authorization, BASE_URLS, Capture, CaptureParams, Order, PayPalClient, PayPalConfig (+4 more)

### Community 82 - "saved-review.test.ts"
Cohesion: 0.21
Nodes (17): fixture(), review(), shop(), createBackendClient(), createBackendShoppingSession(), createScriptedModel(), run(), cart (+9 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.08
Nodes (21): entry, fixedClock, root, draft(), entry, invalid(), kitPath, policyPath (+13 more)

### Community 84 - "paypal-provider.test.ts"
Cohesion: 0.10
Nodes (32): ledger(), definePolicySnapshot(), draftMandateRevision(), reviewMandateRevision(), closeHarness(), createHarness(), createHarness(), seedConfirmedStore() (+24 more)

### Community 87 - "createPayPalGateway"
Cohesion: 0.33
Nodes (8): assertSupportedCurrency(), fromMinor(), paypalMoney(), SUPPORTED_CURRENCIES, toMinor(), createPayPalGateway(), assessAmount(), validIdHint()

### Community 89 - "application.ts"
Cohesion: 0.15
Nodes (31): authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend(), catalogList(), handleProposalSubmit(), handleValidRequest() (+23 more)

### Community 91 - "tests/test-worker.ts"
Cohesion: 0.32
Nodes (6): raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig

### Community 93 - "submitProposal"
Cohesion: 0.39
Nodes (8): createMockBackend(), findMandate(), handleValidRequest(), submitProposal(), errorResponse(), identityKey(), transport(), mockTransport()

### Community 96 - "agent/README.md"
Cohesion: 0.22
Nodes (7): Drafting from plain English, Mandate planning, Mandate planning and the bounded shopper, Acceptance, Interface, Output and authority, Saved shopper reviews

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `paypal-provider.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11083743842364532 - nodes in this community are weakly interconnected._
- **Why does `runTransaction()` connect `paypal-provider.ts` to `execution/worker.ts`, `README.md`, `worker-paypal.test.ts`, `paypal-provider.test.ts`, `paypal-provider.test.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `ledger/store.ts`, `application.ts`, `cli/src/backend.test.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07198228128460686 - nodes in this community are weakly interconnected._
- **Why does `Team, ownership and branches` connect `Splittap purchasing agent` to `review.ts`, `execution/worker.ts`, `saved-review.test.ts`, `shopper.ts`, `submitProposal`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09057971014492754 - nodes in this community are weakly interconnected._