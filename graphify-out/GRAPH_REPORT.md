# Graph Report - Splittap-pay  (2026-11-08)

## Corpus Check
- 135 files · ~177,779 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 1563 nodes · 3891 edges · 86 communities (80 shown, 6 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 144 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `18a2f7bc`
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
- shopper.ts
- seeds.test.ts
- index.ts
- paypal-provider.ts
- tests/store.test.ts
- src/store.test.ts
- review-output.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- cli/src/mandate.ts
- tests/test-worker.ts
- CLI-first architecture
- createExecutionWorker
- paypal/gateway.ts
- PayPal sandbox spike (build step 1)
- application.ts
- worker-paypal.test.ts
- demo-flow.test.ts
- ledger/store.ts
- Backend delivery design (accepted specification with implementation status)
- execution/worker.ts
- ref_node_fs
- evaluatePurchase
- Unit 2 result: trusted authority and SQLite atomic reservations
- backend-session.ts
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- Backend wire API (simulation) and the PayPal gateway contract
- Devpost description draft
- mock.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- execution/test-worker.ts
- ci.yml
- review.ts
- createMockBackend
- agent/src/mandate.ts
- cli/src/mandate.test.ts
- Delivered
- Setting up a new device
- concurrency.test.ts
- client.mock.test.ts
- cli/src/backend.test.ts
- CliError
- shopper.test.ts
- CatalogSchema
- client.test.ts
- handleCommand
- paypal/client.ts
- createSession
- shop-draft.test.ts
- Detailed implementation decisions
- money.ts

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 45 edges
2. `openLedgerStore()` - 41 edges
3. `createApplicationBackend()` - 33 edges
4. `handleCommand()` - 32 edges
5. `canonicalize()` - 29 edges
6. `confirmMandateRevision()` - 28 edges
7. `createFixtureSupplier()` - 27 edges
8. `runTransaction()` - 25 edges
9. `draftMandateRevision()` - 24 edges
10. `CatalogSchema` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Observations (records, no code)` --references--> `authorizeOperationHold()`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/execution/paypal-provider.ts
- `PayPal gateway (unit-4 contract + unit-5 sandbox additions)` --references--> `GatewayInputError`  [INFERRED]
  docs/backend-api.md → services/checker/src/paypal/gateway.ts
- `Delivered` --references--> `GatewayUnknown`  [INFERRED]
  .audit/backend-delivery/unit5-result.md → services/checker/src/paypal/gateway.ts
- `The contract mock, and why accepting a mock result proves nothing` --references--> `createMockBackend()`  [INFERRED]
  docs/backend-api.md → packages/contracts/src/mock.ts
- `Authority and evidence` --references--> `BudgetSnapshot`  [INFERRED]
  docs/architecture.md → packages/contracts/src/index.ts

## Import Cycles
- None detected.

## Communities (86 total, 6 thin omitted)

### Community 0 - "application.test.ts"
Cohesion: 0.19
Nodes (16): createHarness(), Harness, NarrowingCase, asConfirmedMandate(), countingAdapter(), fixtureAdapter(), makeTempDir(), RAW_CATALOG (+8 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.10
Nodes (27): Current implementation boundary, BUDGET, capture(), captureCart(), Cart, CART_A, CART_B, CART_C (+19 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.07
Nodes (39): CaptureAuthorizationInput, GatewayOutcome, GetCaptureInput, RefundCaptureInput, approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody() (+31 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+14 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.10
Nodes (22): BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema, mandateVersion (+14 more)

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
Cohesion: 0.10
Nodes (19): DRAFT_TOOL_NAME, draftMandateWithModel(), InputSchema, MandateDraftInput, MandateDraftOutcome, MandateDraftRun, ProposalSchema, { $schema: _dialect, ...proposalInputSchema } (+11 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "The shopper"
Cohesion: 0.29
Nodes (7): BackendClient, Live runs, Read-only status, Run it, Submission outcomes, The shopper, Tools

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

### Community 24 - "authority.ts"
Cohesion: 0.13
Nodes (28): ledger(), AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), definePolicySnapshot(), draftMandateRevision(), DraftRevisionResult, loadPolicySnapshot() (+20 more)

### Community 25 - "src/worker.ts"
Cohesion: 0.07
Nodes (31): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+23 more)

### Community 26 - "cli/src/backend.ts"
Cohesion: 0.13
Nodes (20): assertDistinctDatabases(), assertPrivateWindowsDatabase(), Command, COMMAND_FLAGS, ConfigSchema, DATABASE_FILE_SUFFIXES, expandPath(), LoadedConfig (+12 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.10
Nodes (13): ConfiguredCatalog, Catalog, Quote, ConfiguredSupplier, ExecutionSupplier, ChildOperation, ChildResult, EXEC_WORKER_PATH (+5 more)

### Community 28 - "backend-transport.test.ts"
Cohesion: 0.33
Nodes (6): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport()

### Community 29 - "shopper.ts"
Cohesion: 0.12
Nodes (21): BackendErrorCode, CartSubmission, EligibilityResult, Mandate, BackendSessionError, CartEstimate, CatalogFacts, OfflineSessionInputSchema (+13 more)

### Community 30 - "seeds.test.ts"
Cohesion: 0.19
Nodes (18): integerOption(), runStore(), EvidenceSchema, applyFixtureChanges(), controlSource(), FIXTURE_SEEDS, fixtureDirectory, isWithin() (+10 more)

### Community 32 - "index.ts"
Cohesion: 0.11
Nodes (25): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), Contract operations to design first, Shared interface and separation (+17 more)

### Community 33 - "paypal-provider.ts"
Cohesion: 0.10
Nodes (46): Delivered, AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, createExecutionProvider(), payPalApply() (+38 more)

### Community 34 - "tests/store.test.ts"
Cohesion: 0.14
Nodes (20): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, openProviderDatabase(), bindingState(), effectRow() (+12 more)

### Community 35 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 36 - "review-output.ts"
Cohesion: 0.08
Nodes (56): formatSgd(), ascii(), ASCII_FOLDS, bar(), barLine(), briefNextStepLines(), briefRefusalLine(), briefSummaryBody() (+48 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.15
Nodes (13): Demo flow, Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status (+5 more)

### Community 39 - "shop.ts"
Cohesion: 0.17
Nodes (26): readLedgerFacts(), useColor(), backendKind(), buildModel(), buildTransport(), displayPath(), DRAFT_EXIT_CODES, EXIT_CODES (+18 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.22
Nodes (8): Authority and trust, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent, Team, ownership and branches

### Community 41 - "cli/src/mandate.ts"
Cohesion: 0.35
Nodes (10): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), outputTarget() (+2 more)

### Community 42 - "tests/test-worker.ts"
Cohesion: 0.32
Nodes (6): raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.17
Nodes (39): database(), Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Delivered, Minors, effectKey(), callBounded(), commercialTerms(), createExecutionWorker() (+31 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.07
Nodes (30): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, AuthorizeOutcome, CaptureEvidence (+22 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.15
Nodes (11): Before you record, Demo script, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), The script, What not to say, Application path (exercised 2026-11-07, PR #17 tree + one live fix), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1) (+3 more)

### Community 47 - "application.ts"
Cohesion: 0.13
Nodes (35): wireOperation(), Review record (EGM goldfish, five-round cap reached), authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend(), catalogList() (+27 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.12
Nodes (15): authorizationCapturedRoute(), authorizationDeniedRoute(), capturedAmount(), captureReadRoute(), captureRoute(), ChildOperation, ChildResult, ExchangeLine (+7 more)

### Community 49 - "demo-flow.test.ts"
Cohesion: 0.07
Nodes (53): awaitEnter(), checkSummary(), childEnvironment(), demoBackendConfig(), DemoFailure, DemoPlan, demoPlan(), dropEchoedRequest() (+45 more)

### Community 50 - "ledger/store.ts"
Cohesion: 0.11
Nodes (31): resolveIdentities(), ValidatedMandateRead, MandateAuthority, bindIdempotencyAlias(), ConfirmationRow, databasesInTransaction, findOperationIdentities(), IdempotencyConflictErrorOptions (+23 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.15
Nodes (13): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), Current system and sources, Detailed implementation plan, Durable fake execution, Goals and exclusions, Implementation status (addendum, accurate as of unit 4, 2026-11-06) (+5 more)

### Community 52 - "execution/worker.ts"
Cohesion: 0.08
Nodes (22): PaymentProvider, ApplicationBackendConfig, FakeProviderGateway, loadProviderRow(), ProviderRow, RawRow, readString(), ApplyOutcome (+14 more)

### Community 53 - "ref_node_fs"
Cohesion: 0.13
Nodes (8): entry, fixedClock, root, createFileSubmissionJournal(), digest(), root, fixtureDirectory, seedPath

### Community 54 - "evaluatePurchase"
Cohesion: 0.14
Nodes (13): Checks, Checks, Deviations, Deviations, Goldfish review round 1 (2026-11-05), Goldfish review round 2 (2026-11-05), Honest boundaries, Minors (+5 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.29
Nodes (6): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "backend-session.ts"
Cohesion: 0.19
Nodes (9): INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome(), REJECTION_CODES, resendUnresolvedCarts(), ResentCart, SessionOptionsSchema, ProposalOutcome (+1 more)

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
Nodes (12): BackendMethod, BackendMethodSchema, OperationGetResultSchema, canonicalCart(), canonicalize(), compareText(), correlationFields(), MockBackend (+4 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation, ExpectedMoney

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "execution/test-worker.ts"
Cohesion: 0.19
Nodes (13): createFakeProviderGateway(), FakeProviderScenario, PaymentProviderSelection, PayPalProviderScenario, buildScriptedPayPalChild(), PayPalScript, raw, readLine() (+5 more)

### Community 66 - "ci.yml"
Cohesion: 0.07
Nodes (29): runs-on, steps, strategy, timeout-minutes, concurrency, cancel-in-progress, group, node-version (+21 more)

### Community 67 - "review.ts"
Cohesion: 0.06
Nodes (47): BackendErrorCodeSchema, BudgetSnapshot, amount, BackendKind, BudgetView, budgetView(), buildRunReview(), CartBuildSchema (+39 more)

### Community 68 - "createMockBackend"
Cohesion: 0.33
Nodes (9): createMock(), createMockBackend(), findMandate(), handleValidRequest(), submitProposal(), errorResponse(), identityKey(), transport() (+1 more)

### Community 69 - "agent/src/mandate.ts"
Cohesion: 0.12
Nodes (21): PolicySchema, compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DraftOrigin (+13 more)

### Community 70 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 71 - "Delivered"
Cohesion: 0.14
Nodes (14): providerFacts(), providerIdFilter(), Answers for the teammate (issue #16), Applied, Checks, Deviation (disclosed), Deviations, Exact output shapes (+6 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.25
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 73 - "concurrency.test.ts"
Cohesion: 0.15
Nodes (8): CartSubmissionSchema, OpenChildRun, SubmitWorkerResult, VerifyWorkerResult, WORKER_PATH, WorkerResult, input(), load()

### Community 74 - "client.mock.test.ts"
Cohesion: 0.14
Nodes (11): BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendProtocolError, BackendTransport, cart, cartBase (+3 more)

### Community 75 - "cli/src/backend.test.ts"
Cohesion: 0.12
Nodes (18): accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), reserveForTest(), root, runBackend() (+10 more)

### Community 76 - "CliError"
Cohesion: 0.23
Nodes (15): assertPrivateWindowsDirectory(), checkPrivateRuntimeDirectory(), CliError, createPrivateRuntimeDirectory(), loadConfig(), loadSnapshotSet(), operatorIdentity(), parseArgv() (+7 more)

### Community 77 - "shopper.test.ts"
Cohesion: 0.12
Nodes (14): Tests, createOfflineShoppingSession(), ShoppingToolErrorCode, build, catalog, code(), getCatalog(), line (+6 more)

### Community 78 - "CatalogSchema"
Cohesion: 0.22
Nodes (9): CatalogSchema, MAX_AMOUNT_MINOR, CartCosts, cartCosts(), createFixtureCatalogSource(), FixtureCatalogsSchema, seed(), cart (+1 more)

### Community 79 - "client.test.ts"
Cohesion: 0.20
Nodes (8): Delivered, createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError, DENIED()

### Community 80 - "handleCommand"
Cohesion: 0.26
Nodes (13): buildSuppliers(), emit(), handleCommand(), loadSandboxCredentials(), operationRow(), positiveRevision(), readEnvFile(), readStdinBounded() (+5 more)

### Community 81 - "paypal/client.ts"
Cohesion: 0.22
Nodes (12): PayPalMoney, Authorization, BASE_URLS, Capture, CaptureParams, Order, PayPalClient, PayPalConfig (+4 more)

### Community 82 - "createSession"
Cohesion: 0.33
Nodes (9): catalogFacts(), createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput(), createShoppingSession() (+1 more)

### Community 83 - "shop-draft.test.ts"
Cohesion: 0.20
Nodes (6): calls, cliEntry, root, shopEntry, textFile, UnconfirmedMandateSchema

### Community 84 - "Detailed implementation decisions"
Cohesion: 0.29
Nodes (7): CLI contract, Concrete storage, Detailed implementation decisions, Exact wire shapes, Lease and provider behavior, Readiness resolutions: imports and PayPal adapter, Review resolutions: cart identity and capture retries

### Community 87 - "money.ts"
Cohesion: 0.43
Nodes (6): cart(), assertSupportedCurrency(), fromMinor(), paypalMoney(), SUPPORTED_CURRENCIES, toMinor()

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runTransaction()` connect `paypal-provider.ts` to `tests/store.test.ts`, `cli/src/backend.test.ts`, `createExecutionWorker`, `README.md`, `application.ts`, `worker-paypal.test.ts`, `ledger/store.ts`, `execution/worker.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `authority.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1010752688172043 - nodes in this community are weakly interconnected._
- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `paypal-provider.ts`, `execution/worker.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07198228128460686 - nodes in this community are weakly interconnected._
- **Why does `Hackathon project: an AI purchasing agent that can't overspend` connect `Hackathon project: an AI purchasing agent that can't overspend` to `README.md`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09486166007905138 - nodes in this community are weakly interconnected._