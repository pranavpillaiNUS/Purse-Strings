# Graph Report - Splittap-pay  (2026-11-06)

## Corpus Check
- 108 files · ~100,741 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 1010 nodes · 2534 edges · 64 communities (57 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 93 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `700079a3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- concurrency.test.ts
- paypal-spike.ts
- execution/worker.ts
- package.json
- contracts/src/backend.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- agent/src/mandate.ts
- checker/package.json
- suppliers/package.json
- README.md
- shopper.test.ts
- agent/src/mandate.ts
- CLAUDE.md
- Backend delivery run
- Delivery findings
- Unit 1 result
- authority.ts
- model.ts
- application.test.ts
- execution/worker.test.ts
- ref_node_fs
- shopper.ts
- seeds.test.ts
- index.ts
- agent/src/mandate.ts
- mock.ts
- ExecutionWorker
- shop-draft.test.ts
- shop.test.ts
- Splittap — CLI-first equipment purchasing
- shop.ts
- Splittap purchasing agent
- src/client.ts
- createFixtureSupplier
- CLI-first architecture
- createExecutionWorker
- backend-session.ts
- PayPal sandbox spike (build step 1)
- application.ts
- Confirmation and stock: proposed next integration
- seeds.test.ts
- tests/store.test.ts
- concurrency.test.ts
- ledger/store.ts
- The shopper
- openLedgerStore
- Unit 2 result: trusted authority and SQLite atomic reservations
- src/worker.test.ts
- agent/package.json
- createSession
- src/worker.ts
- CartSubmission
- canonicalize
- createMockBackend
- What we have to do

## God Nodes (most connected - your core abstractions)
1. `createExecutionWorker()` - 44 edges
2. `openLedgerStore()` - 30 edges
3. `createApplicationBackend()` - 29 edges
4. `handleCommand()` - 25 edges
5. `confirmMandateRevision()` - 24 edges
6. `CatalogSchema` - 24 edges
7. `createFixtureSupplier()` - 23 edges
8. `canonicalize()` - 21 edges
9. `draftMandateRevision()` - 20 edges
10. `CliError` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Orchestrator closeout (2026-11-05)` --references--> `openLedgerStore()`  [INFERRED]
  .audit/backend-delivery/unit3-result.md → services/checker/src/ledger/store.ts
- `Delivered` --references--> `runTransaction()`  [INFERRED]
  .audit/backend-delivery/unit2-result.md → services/checker/src/ledger/store.ts
- `Current implementation boundary` --references--> `store()`  [INFERRED]
  AGENTS.md → apps/cli/src/store.test.ts
- `Team, ownership and branches` --references--> `Operation`  [INFERRED]
  AGENTS.md → packages/contracts/src/backend.ts
- `Team, ownership and branches` --references--> `createBackendClient()`  [INFERRED]
  AGENTS.md → packages/contracts/src/client.ts

## Import Cycles
- None detected.

## Communities (64 total, 7 thin omitted)

### Community 0 - "concurrency.test.ts"
Cohesion: 0.19
Nodes (16): createHarness(), Harness, NarrowingCase, asConfirmedMandate(), countingAdapter(), fixtureAdapter(), makeTempDir(), RAW_CATALOG (+8 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.06
Nodes (52): DEMO_NOW, loadInput(), readJson(), main(), printResult(), BUDGET, capture(), captureCart() (+44 more)

### Community 2 - "execution/worker.ts"
Cohesion: 0.11
Nodes (18): FakeProviderGateway, loadProviderRow(), ProviderRow, RawRow, readString(), ApplyOutcome, ExecutionProvider, LookupOutcome (+10 more)

### Community 3 - "package.json"
Cohesion: 0.10
Nodes (21): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+13 more)

### Community 4 - "contracts/src/backend.ts"
Cohesion: 0.10
Nodes (22): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema, mandateVersion (+14 more)

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

### Community 10 - "agent/src/mandate.ts"
Cohesion: 0.08
Nodes (32): compileProposal(), contentDigest(), createMandateDraft(), digest, distinct(), DraftAssumptionSchema, DRAFT_TOOL_NAME, draftMandateWithModel() (+24 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 14 - "shopper.test.ts"
Cohesion: 0.15
Nodes (12): createOfflineShoppingSession(), ShoppingToolErrorCode, build, catalog, code(), getCatalog(), line, mandate (+4 more)

### Community 15 - "agent/src/mandate.ts"
Cohesion: 0.10
Nodes (19): Acceptance and remaining milestones, Alternatives and choice, CLI backend delivery specification, CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+11 more)

### Community 16 - "CLAUDE.md"
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
Cohesion: 0.15
Nodes (26): extractSupplierId(), loadActiveAuthority(), parseStoredPolicy(), AuthorityFailure, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult (+18 more)

### Community 25 - "model.ts"
Cohesion: 0.10
Nodes (18): AnthropicModelOptions, createAnthropicModel(), DEFAULT_SHOPPER_MODEL, describe(), prompt, DRAFT_MODEL_TOOLS, MANDATE_DRAFTER_SYSTEM_PROMPT, ModelCallError (+10 more)

### Community 26 - "application.test.ts"
Cohesion: 0.07
Nodes (53): assertDistinctDatabases(), buildSuppliers(), checkPrivateRuntimeDirectory(), CliError, Command, COMMAND_FLAGS, ConfigSchema, ConfiguredCatalog (+45 more)

### Community 27 - "execution/worker.test.ts"
Cohesion: 0.12
Nodes (10): ConfiguredSupplier, ExecutionSupplier, ChildOperation, ChildResult, EXEC_WORKER_PATH, Harness, submitOperation(), suppliersFor() (+2 more)

### Community 28 - "ref_node_fs"
Cohesion: 0.07
Nodes (27): BackendFixture, entry, root, entry, fixedClock, root, draft(), entry (+19 more)

### Community 29 - "shopper.ts"
Cohesion: 0.12
Nodes (17): Authority and evidence, Operation, BudgetSnapshot, Mandate, AcceptedSubmission, CartEstimate, CatalogFacts, OfflineSessionInputSchema (+9 more)

### Community 30 - "seeds.test.ts"
Cohesion: 0.19
Nodes (18): integerOption(), runStore(), EvidenceSchema, applyFixtureChanges(), controlSource(), FIXTURE_SEEDS, fixtureDirectory, isWithin() (+10 more)

### Community 32 - "index.ts"
Cohesion: 0.14
Nodes (20): InputOptions, amount, BudgetSnapshotSchema, CartSubmissionSchema, Check, currency, EligibilityResult, EvaluationInput (+12 more)

### Community 33 - "agent/src/mandate.ts"
Cohesion: 0.13
Nodes (12): BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendProtocolError, BackendTransport, cart, cartBase (+4 more)

### Community 34 - "mock.ts"
Cohesion: 0.21
Nodes (12): BackendMethod, BackendMethodSchema, CatalogListResultSchema, canonicalCart(), canonicalize(), compareText(), correlationFields(), MockBackend (+4 more)

### Community 36 - "shop-draft.test.ts"
Cohesion: 0.18
Nodes (7): calls, cliEntry, root, shopEntry, textFile, MandateDraftSchema, UnconfirmedMandateSchema

### Community 37 - "shop.test.ts"
Cohesion: 0.12
Nodes (11): fixture(), hostileB(), kit, mock, policy, practice, request, root (+3 more)

### Community 38 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.25
Nodes (8): Fixture-store controls, Mandate draft and review, Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status, The shopper

### Community 39 - "shop.ts"
Cohesion: 0.16
Nodes (26): bundled(), printable(), printOrigin(), printProposal(), readJson(), runMandate(), buildModel(), buildTransport() (+18 more)

### Community 40 - "Splittap purchasing agent"
Cohesion: 0.18
Nodes (11): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+3 more)

### Community 41 - "src/client.ts"
Cohesion: 0.33
Nodes (6): allowedChildEnv(), BackendCliTransportOptions, CHILD_ENV_ALLOWLIST, createBackendCliTransport(), request, transport()

### Community 42 - "createFixtureSupplier"
Cohesion: 0.17
Nodes (14): FakeProviderScenario, raw, readLine(), RunConfig, runExecution(), raw, readLine(), runSubmit() (+6 more)

### Community 43 - "CLI-first architecture"
Cohesion: 0.33
Nodes (6): CLI-first architecture, Ledger and recovery requirements, Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 44 - "createExecutionWorker"
Cohesion: 0.26
Nodes (28): Accepted P1 repair pass (2026-11-05, branch `unit3-durable-execution`), Minors, effectKey(), callBounded(), createExecutionWorker(), callProvider(), captureRequestPayload(), claim() (+20 more)

### Community 45 - "backend-session.ts"
Cohesion: 0.15
Nodes (9): INDETERMINATE_CODES, proposalIdempotencyKey(), REJECTION_CODES, SessionOptionsSchema, createShoppingSession(), ProposalOutcome, ProposalPort, ShoppingSession (+1 more)

### Community 46 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (5): One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 47 - "application.ts"
Cohesion: 0.16
Nodes (26): wireOperation(), ApplicationBackendConfig, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend(), catalogList() (+18 more)

### Community 48 - "Confirmation and stock: proposed next integration"
Cohesion: 0.40
Nodes (5): Confirmation and stock: integration status, Current review surface, Decisions for Pranav and Danny, From draft to shopping, Next milestone exit evidence

### Community 49 - "seeds.test.ts"
Cohesion: 0.21
Nodes (10): Catalog, CatalogSchema, MAX_AMOUNT_MINOR, CartCosts, cartCosts(), createFixtureCatalogSource(), FixtureCatalogsSchema, seed() (+2 more)

### Community 50 - "tests/store.test.ts"
Cohesion: 0.23
Nodes (11): resolveIdentities(), LedgerMigration, maxKnownMigrationVersion(), MIGRATIONS, SCHEMA_VERSION, bindIdempotencyAlias(), findOperationIdentities(), LedgerIdentityConflict (+3 more)

### Community 51 - "concurrency.test.ts"
Cohesion: 0.15
Nodes (13): ledger(), definePolicySnapshot(), draftMandateRevision(), seedConfirmedStore(), setup(), setup(), digestOf(), OpenChildRun (+5 more)

### Community 52 - "ledger/store.ts"
Cohesion: 0.13
Nodes (25): Delivered, ValidatedMandateRead, MandateAuthority, assertLeaseHeld(), claimLeaseRow(), ConfirmationRow, databasesInTransaction, IdempotencyConflictErrorOptions (+17 more)

### Community 53 - "The shopper"
Cohesion: 0.18
Nodes (11): BackendClient, Drafting from plain English, Mandate planning, Mandate planning and the bounded shopper, Not established, Run it, Submission outcomes, Tests (+3 more)

### Community 54 - "openLedgerStore"
Cohesion: 0.21
Nodes (14): Change (exact), Checks, LEDGER-R5-001 repair (2026-11-05): REPAIRED, not carried forward, Residuals disclosed, Root cause, with runtime evidence, openProviderDatabase(), auditDetailsFor(), effectRow() (+6 more)

### Community 55 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.29
Nodes (6): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 56 - "src/worker.test.ts"
Cohesion: 0.15
Nodes (9): recording(), createScriptedModel(), build, laptops, mandate, monitors, noUsage, run() (+1 more)

### Community 57 - "agent/package.json"
Cohesion: 0.24
Nodes (9): @anthropic-ai/sdk, zod, dependencies, @anthropic-ai/sdk@^1.6.0, zod@^4.0.0, description, name, private (+1 more)

### Community 58 - "createSession"
Cohesion: 0.44
Nodes (8): catalogFacts(), createSession(), handle(), loadCatalog(), requireRequirement(), requireSupplier(), submitOutput(), ShoppingToolError

### Community 59 - "src/worker.ts"
Cohesion: 0.19
Nodes (11): ShoppingModel, ShoppingProgress, ToolArgsSchemas, beforeDeadline(), contractNames, deriveOutcome(), LimitsSchema, runShoppingWorker() (+3 more)

### Community 60 - "CartSubmission"
Cohesion: 0.24
Nodes (8): BackendErrorCode, CartSubmission, Quote, BackendSessionError, OfflineSubmission, RefusedSubmission, RejectedSubmission, UnknownSubmission

### Community 61 - "canonicalize"
Cohesion: 0.21
Nodes (11): Review record (EGM goldfish, five-round cap reached), sha256CanonicalJson(), createFakeProviderGateway(), commercialTerms(), canonicalCartJson(), canonicalize(), compareText(), insertReservationOperation() (+3 more)

### Community 62 - "createMockBackend"
Cohesion: 0.48
Nodes (7): createMockBackend(), findMandate(), handleValidRequest(), submitProposal(), errorResponse(), identityKey(), mockTransport()

### Community 63 - "What we have to do"
Cohesion: 0.33
Nodes (6): Judging criteria, Prizes, Schedule, The rules, What to submit, What we have to do

## Knowledge Gaps
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runTransaction()` connect `application.ts` to `execution/worker.ts`, `createExecutionWorker`, `README.md`, `tests/store.test.ts`, `concurrency.test.ts`, `ledger/store.ts`, `Unit 2 result: trusted authority and SQLite atomic reservations`, `authority.ts`, `execution/worker.test.ts`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `openLedgerStore()` (e.g. with `Change (exact)` and `Minors`) actually correct?**
  _`openLedgerStore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06370543541788427 - nodes in this community are weakly interconnected._
- **Why does `Durable ledger (M2 slice — authority + reservations)` connect `README.md` to `application.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `execution/worker.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10591133004926108 - nodes in this community are weakly interconnected._
- **Why does `Team, ownership and branches` connect `Splittap purchasing agent` to `shop.ts`, `application.ts`, `CartSubmission`, `shopper.ts`, `createMockBackend`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09956709956709957 - nodes in this community are weakly interconnected._