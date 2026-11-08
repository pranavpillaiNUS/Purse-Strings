# Graph Report - Splittap-pay  (2026-11-08)

## Corpus Check
- 134 files · ~172,818 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1521 nodes · 3588 edges · 81 communities (73 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `149193ad`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- concurrency.test.ts
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
- src/worker.test.ts
- cli/src/backend.test.ts
- execution/worker.test.ts
- backend-transport.test.ts
- shopper.ts
- seeds.test.ts
- index.ts
- cli/src/backend.ts
- paypal/client.ts
- src/store.test.ts
- review-output.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- agent/src/mandate.ts
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
- Unit 3 result: durable simulated execution and the backend operator/RPC CLI
- Unit 2 result: trusted authority and SQLite atomic reservations
- handleCommand
- agent/package.json
- Acceptance evidence trail (offline, all reproducible below)
- review-output.test.ts
- Backend wire API (simulation) and the PayPal gateway contract
- Devpost description draft
- mock.ts
- Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation
- Confirmation and stock: integration status
- execution/test-worker.ts
- ref_node_assert
- review.ts
- client.test.ts
- paypal-provider.test.ts
- cli/src/mandate.test.ts
- Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen
- Setting up a new device
- ExecutionWorker
- client.mock.test.ts
- control.ts
- cli/src/mandate.ts
- inputs.ts
- runOperationCommand
- Detailed implementation decisions
- Demo script

## God Nodes (most connected - your core abstractions)
1. `openLedgerStore()` - 36 edges
2. `handleCommand()` - 31 edges
3. `confirmMandateRevision()` - 28 edges
4. `createFixtureSupplier()` - 26 edges
5. `CatalogSchema` - 24 edges
6. `createExecutionWorker()` - 24 edges
7. `main()` - 23 edges
8. `draftMandateRevision()` - 23 edges
9. `createApplicationBackend()` - 22 edges
10. `canonicalize()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `LoadedConfig` --references--> `Catalog`  [EXTRACTED]
  apps/cli/src/backend.ts → packages/contracts/src/index.ts
- `providerFacts()` --calls--> `loadPayPalBindingRow()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/ledger/store.ts
- `loadSnapshotSet()` --calls--> `canonicalize()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/checker/src/ledger/store.ts
- `ConfiguredCatalog` --references--> `Catalog`  [EXTRACTED]
  apps/cli/src/backend.ts → packages/contracts/src/index.ts
- `ConfiguredCatalog` --references--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/backend.ts → services/suppliers/src/fixture.ts

## Import Cycles
- None detected.

## Communities (81 total, 3 thin omitted)

### Community 0 - "concurrency.test.ts"
Cohesion: 0.11
Nodes (30): ledger(), createApplicationBackend(), definePolicySnapshot(), draftMandateRevision(), reviewMandateRevision(), createHarness(), Harness, setup() (+22 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.12
Nodes (25): BUDGET, capture(), captureCart(), CART_A, CART_B, CART_C, checkCapture(), describe() (+17 more)

### Community 2 - "gateway.test.ts"
Cohesion: 0.08
Nodes (37): CaptureAuthorizationInput, ExpectedMoney, GetCaptureInput, RefundCaptureInput, approveLink(), authorizationBody(), authorizationReadRoute(), authorizedOrderBody() (+29 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (25): description, devDependencies, @types/node, typescript, engines, node, license, name (+17 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.10
Nodes (25): BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, mandateVersion, OperationGetRequestSchema (+17 more)

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

### Community 10 - "mandate-drafter.test.ts"
Cohesion: 0.11
Nodes (18): DRAFT_TOOL_NAME, draftMandateWithModel(), InputSchema, MandateDraftInput, MandateDraftOutcome, MandateDraftRun, ProposalSchema, { $schema: _dialect, ...proposalInputSchema } (+10 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "The shopper"
Cohesion: 0.15
Nodes (13): Drafting from plain English, Live runs, Mandate planning, Mandate planning and the bounded shopper, Not established, Read-only status, Run it, Submission outcomes (+5 more)

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
Cohesion: 0.29
Nodes (6): Delivered, Files and scope notes, Limitations, Unit 1 result, Unit 1 review follow-up, Verification

### Community 24 - "authority.ts"
Cohesion: 0.15
Nodes (21): ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult, loadPolicySnapshot(), MandateAuthority, MandateDraft (+13 more)

### Community 25 - "src/worker.test.ts"
Cohesion: 0.07
Nodes (31): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+23 more)

### Community 26 - "cli/src/backend.test.ts"
Cohesion: 0.12
Nodes (16): createPrivateRuntimeDirectory(), accessFingerprint(), assertOwnerOnlyOnWindows(), BackendFixture, entry, makePrivateDirectory(), root, createWindowsPrivateDirectory() (+8 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.10
Nodes (23): closeHarness(), bindingState(), effectRow(), operationAndReservation(), auditDetailsFor(), ChildOperation, ChildResult, createHarness() (+15 more)

### Community 28 - "backend-transport.test.ts"
Cohesion: 0.33
Nodes (6): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport()

### Community 29 - "shopper.ts"
Cohesion: 0.05
Nodes (52): BackendErrorCode, BackendClient, CartSubmission, EligibilityResult, BackendSessionError, INDETERMINATE_CODES, proposalIdempotencyKey(), proposalOutcome() (+44 more)

### Community 30 - "seeds.test.ts"
Cohesion: 0.21
Nodes (16): integerOption(), runStore(), Catalog, FIXTURE_SEEDS, fixtureDirectory, isWithin(), loadFixtureCatalog(), resetFixtureCatalog() (+8 more)

### Community 32 - "index.ts"
Cohesion: 0.12
Nodes (19): amount, CatalogSchema, Check, currency, EvaluationInputSchema, Evidence, id, PolicySchema (+11 more)

### Community 33 - "cli/src/backend.ts"
Cohesion: 0.12
Nodes (23): assertDistinctDatabases(), Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog, DATABASE_FILE_SUFFIXES, expandPath(), LoadedConfig (+15 more)

### Community 34 - "paypal/client.ts"
Cohesion: 0.16
Nodes (16): cart(), assertSupportedCurrency(), paypalMoney, SUPPORTED_CURRENCIES, toMinor(), Authorization, BASE_URLS, Capture (+8 more)

### Community 35 - "src/store.test.ts"
Cohesion: 0.33
Nodes (8): check(), entry, expectFailure(), expectSuccess(), root, run(), seedPath, store()

### Community 36 - "review-output.ts"
Cohesion: 0.08
Nodes (54): formatSgd(), ascii(), ASCII_FOLDS, bar(), barLine(), briefNextStepLines(), briefRefusalLine(), briefSummaryBody() (+46 more)

### Community 37 - "shop.test.ts"
Cohesion: 0.10
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.22
Nodes (9): Demo flow, Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status (+1 more)

### Community 39 - "shop.ts"
Cohesion: 0.15
Nodes (28): readLedgerFacts(), useColor(), backendKind(), buildModel(), buildTransport(), displayPath(), DRAFT_EXIT_CODES, EXIT_CODES (+20 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.20
Nodes (9): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+1 more)

### Community 41 - "agent/src/mandate.ts"
Cohesion: 0.12
Nodes (19): compileProposal(), contentDigest(), digest, distinct(), DraftAssumptionSchema, DraftOrigin, DraftOriginSchema, DraftReviewCheck (+11 more)

### Community 42 - "tests/test-worker.ts"
Cohesion: 0.28
Nodes (8): ref_node_readline, ConfiguredSupplier, raw, readLine(), runSubmit(), runVerify(), SubmitConfig, VerifyConfig

### Community 43 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.15
Nodes (40): database(), authorityFailureResponse(), buildSnapshot(), buildWireOperation(), catalogList(), handleProposalSubmit(), handleValidRequest(), mandateAuthorityForRead() (+32 more)

### Community 45 - "paypal/gateway.ts"
Cohesion: 0.07
Nodes (30): PayPalExchange, AUTHORIZATION_STATUSES, AuthorizationStatus, AuthorizationStatusEvidence, AuthorizeEvidence, AuthorizeOrderInput, AuthorizeOutcome, CaptureEvidence (+22 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (6): Application path (exercised 2026-11-07, PR #17 tree + one live fix), One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "application.ts"
Cohesion: 0.14
Nodes (13): BackendMethod, BackendMethodSchema, BackendResponse, MandateGetResultSchema, Mandate, ApplicationBackend, ApplicationBackendConfig, correlationFields() (+5 more)

### Community 48 - "worker-paypal.test.ts"
Cohesion: 0.12
Nodes (14): authorizationCapturedRoute(), authorizationDeniedRoute(), capturedAmount(), captureReadRoute(), captureRoute(), ChildOperation, ChildResult, ExchangeLine (+6 more)

### Community 49 - "demo-flow.test.ts"
Cohesion: 0.08
Nodes (48): checkSummary(), childEnvironment(), demoBackendConfig(), DemoFailure, demoPlan, dropEchoedRequest(), Evidence, EXECUTION_PROVIDER (+40 more)

### Community 50 - "ledger/store.ts"
Cohesion: 0.09
Nodes (46): ref_node_sqlite, resolveIdentities(), loadMandateAuthority(), sha256CanonicalJson(), commercialTerms(), validateCaptureGate(), applyMigrations(), LedgerMigration (+38 more)

### Community 51 - "Backend delivery design (accepted specification with implementation status)"
Cohesion: 0.15
Nodes (13): Acceptance and remaining milestones, Alternatives and choice, Backend delivery design (accepted specification with implementation status), Current system and sources, Detailed implementation plan, Durable fake execution, Goals and exclusions, Implementation status (addendum, accurate as of unit 4, 2026-11-06) (+5 more)

### Community 52 - "execution/worker.ts"
Cohesion: 0.08
Nodes (27): Quote, FakeProviderGateway, loadProviderRow(), openProviderDatabase(), ProviderRow, RawRow, readString(), ApplyOutcome (+19 more)

### Community 53 - "ref_node_fs"
Cohesion: 0.11
Nodes (16): entry, fixedClock, root, calls, cliEntry, root, shopEntry, textFile (+8 more)

### Community 54 - "Unit 3 result: durable simulated execution and the backend operator/RPC CLI"
Cohesion: 0.08
Nodes (25): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Change (exact), Checks, Checks, Checks, Checks, Delivered, Deviations (+17 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.25
Nodes (7): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Review record (EGM goldfish, five-round cap reached), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "handleCommand"
Cohesion: 0.26
Nodes (15): assertPrivateWindowsDatabase(), assertPrivateWindowsDirectory(), checkPrivateRuntimeDirectory(), CliError, handleCommand(), loadConfig(), loadSnapshotSet(), loadWindowsVerdicts() (+7 more)

### Community 57 - "agent/package.json"
Cohesion: 0.20
Nodes (9): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, zod, description, zod, name, private (+1 more)

### Community 58 - "Acceptance evidence trail (offline, all reproducible below)"
Cohesion: 0.20
Nodes (10): Acceptance evidence trail (offline, all reproducible below), Backend delivery review: evidence trail and honest limits, M0 — delivered by the scaffold, M1 — authority SUBSET only, M2 — ledger and recovery slice on real-storage evidence, M3 — simulated recovery + mocked contract coverage ONLY (real feasibility unverified), Milestones M4/M5, Remaining work (no unit-5 property depends on it) (+2 more)

### Community 59 - "review-output.test.ts"
Cohesion: 0.10
Nodes (23): built(), call(), cart(), cartLines, COMPROMISED_CALLS, compromisedEvents, compromisedReview(), CSI_C1 (+15 more)

### Community 60 - "Backend wire API (simulation) and the PayPal gateway contract"
Cohesion: 0.20
Nodes (10): Backend wire API (simulation) and the PayPal gateway contract, Config and private runtime state, PayPal gateway (unit-4 contract + unit-5 sandbox additions), Private runtime folders, Provider selection and credentials (unit 5), Replay, cart identity and idempotency aliases, Starting point: the operator CLI, The contract mock, and why accepting a mock result proves nothing (+2 more)

### Community 61 - "Devpost description draft"
Cohesion: 0.10
Nodes (20): AI tools list, Checklist, Devpost description draft, How AI is used, How it works, How PayPal is used, In the product, Judge access: proposal (+12 more)

### Community 62 - "mock.ts"
Cohesion: 0.15
Nodes (21): OperationGetResultSchema, createMock(), MAX_AMOUNT_MINOR, canonicalCart(), canonicalize(), compareText(), correlationFields(), createMockBackend() (+13 more)

### Community 63 - "Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation"
Cohesion: 0.33
Nodes (5): Checks, Delivered, Deviations from the orchestrator's file list, Honest boundaries, Unit 4 result: sandbox PayPal gateway contracts and accurate delivery documentation

### Community 64 - "Confirmation and stock: integration status"
Cohesion: 0.33
Nodes (6): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence, Platforms

### Community 65 - "execution/test-worker.ts"
Cohesion: 0.14
Nodes (17): createFakeProviderGateway(), FakeProviderScenario, createExecutionProvider(), openLedgerReadConnection(), PaymentProviderSelection, PayPalProviderScenario, harnessFetch(), paypalAdapter() (+9 more)

### Community 67 - "review.ts"
Cohesion: 0.06
Nodes (47): BackendErrorCodeSchema, BudgetSnapshot, amount, BackendKind, BudgetView, buildRunReview(), CartBuildSchema, CartSubmitSchema (+39 more)

### Community 68 - "client.test.ts"
Cohesion: 0.21
Nodes (6): createPayPalClient(), accessToken(), call(), withTimeout(), PayPalApiError, PayPalTimeoutError

### Community 69 - "paypal-provider.test.ts"
Cohesion: 0.10
Nodes (43): AuthorizeHoldResult, authorizeOperationHold(), completeAuthorizationHold(), CompleteAuthorizationResult, CompositeProviderConfig, payPalApply(), payPalLookupCapture(), payPalLookupRefund() (+35 more)

### Community 70 - "cli/src/mandate.test.ts"
Cohesion: 0.24
Nodes (9): draft(), entry, invalid(), kitPath, policyPath, requestPath, root, run() (+1 more)

### Community 71 - "Unit 5 result: PayPal sandbox wired into durable execution (config opt-in), buyer-approval commands, provider on screen"
Cohesion: 0.14
Nodes (13): Answers for the teammate (issue #16), Applied, Checks, Delivered, Deviation (disclosed), Deviations, Exact output shapes, Honest limitations (+5 more)

### Community 72 - "Setting up a new device"
Cohesion: 0.25
Nodes (7): 1. Install the tools, 2. Get the code, 3. Add your API key, 4. Check it works, 5. What a clone doesn't include, 6. Start a new Claude session, Setting up a new device

### Community 74 - "client.mock.test.ts"
Cohesion: 0.17
Nodes (10): BackendRequest, BackendRequestSchema, BackendResponseSchema, BackendProtocolError, BackendTransport, cart, cartBase, catalog (+2 more)

### Community 75 - "control.ts"
Cohesion: 0.24
Nodes (7): EvidenceSchema, applyFixtureChanges(), controlSource(), FixtureChangesSchema, ProductChangesSchema, cart, seedPath

### Community 76 - "cli/src/mandate.ts"
Cohesion: 0.35
Nodes (11): bundled(), printable(), printableLine(), printOrigin(), printProposal(), readJson(), runMandate(), outputTarget() (+3 more)

### Community 77 - "inputs.ts"
Cohesion: 0.31
Nodes (9): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), EvaluationInput, fromMinor() (+1 more)

### Community 78 - "runOperationCommand"
Cohesion: 0.28
Nodes (9): buildSuppliers(), emit(), loadSandboxCredentials(), readEnvFile(), readStdinBounded(), rpcErrorResponse(), runOperationCommand(), runRpc() (+1 more)

### Community 79 - "Detailed implementation decisions"
Cohesion: 0.29
Nodes (7): CLI contract, Concrete storage, Detailed implementation decisions, Exact wire shapes, Lease and provider behavior, Readiness resolutions: imports and PayPal adapter, Review resolutions: cart identity and capture retries

### Community 80 - "Demo script"
Cohesion: 0.40
Nodes (5): Before you record, Demo script, Sandbox variant for scene 6 (`--sandbox-paypal`, opt-in), The script, What not to say

## Knowledge Gaps
- **560 isolated node(s):** `name`, `private`, `type`, `description`, `request` (+555 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 691 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Operation` connect `review-output.ts` to `cli/src/backend.ts`, `review.ts`, `contracts/src/backend.ts`, `shop.ts`, `application.ts`, `execution/worker.ts`, `review-output.test.ts`, `shopper.ts`, `mock.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `createMockBackend()` connect `mock.ts` to `review.ts`, `shop.test.ts`, `shop.ts`, `client.mock.test.ts`, `src/worker.test.ts`, `seeds.test.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `createExecutionWorker()` connect `createExecutionWorker` to `execution/test-worker.ts`, `cli/src/backend.ts`, `runOperationCommand`, `execution/worker.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _560 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `concurrency.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11033681765389082 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1225071225071225 - nodes in this community are weakly interconnected._
- **Should `gateway.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07560975609756097 - nodes in this community are weakly interconnected._