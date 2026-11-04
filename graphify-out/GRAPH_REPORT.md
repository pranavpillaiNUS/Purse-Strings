# Graph Report - Splittap-pay  (2026-11-04)

## Corpus Check
- 55 files · ~43,213 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 513 nodes · 1027 edges · 35 communities (27 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7887f54f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- paypal-spike.ts
- Splittap: instructions for coding agents
- package.json
- backend.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- main.test.ts
- checker/package.json
- suppliers/package.json
- agent/README.md
- ledger/README.md
- CLI backend delivery specification
- Team scope and framework assessment
- Backend delivery run
- Delivery findings
- Unit 1 result
- store.ts
- application.ts
- application.test.ts
- client.mock.test.ts
- mock.ts
- submitProposal
- CLI-first architecture
- README.md
- PayPal sandbox spike (build step 1)
- Splittap — CLI-first equipment purchasing
- BackendResponse

## God Nodes (most connected - your core abstractions)
1. `handleProposalSubmit()` - 18 edges
2. `confirmMandateRevision()` - 18 edges
3. `AuthorityFailure` - 15 edges
4. `Splittap: instructions for coding agents` - 15 edges
5. `holdAndCapture()` - 14 edges
6. `Hackathon project: an AI purchasing agent that can't overspend` - 14 edges
7. `draftMandateRevision()` - 13 edges
8. `readString()` - 13 edges
9. `openLedgerStore()` - 13 edges
10. `CLI backend delivery specification` - 13 edges

## Surprising Connections (you probably didn't know these)
- `printResult()` --calls--> `fromMinor()`  [EXTRACTED]
  apps/cli/src/main.ts → services/checker/src/money.ts
- `loadInput()` --calls--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/inputs.ts → services/suppliers/src/fixture.ts
- `main()` --calls--> `evaluatePurchase()`  [EXTRACTED]
  apps/cli/src/main.ts → services/checker/src/rules/evaluate.ts
- `LoadedAuthority` --references--> `Policy`  [EXTRACTED]
  services/checker/src/application.ts → packages/contracts/src/index.ts
- `LoadedAuthority` --references--> `Mandate`  [EXTRACTED]
  services/checker/src/application.ts → packages/contracts/src/index.ts

## Import Cycles
- None detected.

## Communities (35 total, 4 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.08
Nodes (44): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshot (+36 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.07
Nodes (47): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+39 more)

### Community 2 - "Splittap: instructions for coding agents"
Cohesion: 0.13
Nodes (15): Authority and isolation (hard edges), Check locally (verified 2026-11-04 on this checkout), Delivery sequence: one verifiable slice at a time, External effects and recovery, Implemented vs planned (verify in source; do assume otherwise), Knowledge graph, Ledger invariants (M2+ — these encode hard-won decisions), PayPal rules (verify current docs for the target account) (+7 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, @types/node, typescript, engines, node, license, name (+14 more)

### Community 4 - "backend.ts"
Cohesion: 0.10
Nodes (23): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema, MandateGetResultSchema (+15 more)

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
Nodes (7): dependencies, zod, description, name, private, type, zod

### Community 9 - "cli/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 10 - "main.test.ts"
Cohesion: 0.40
Nodes (3): entry, fixedClock, root

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

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

### Community 24 - "store.ts"
Cohesion: 0.08
Nodes (58): resolveIdentities(), ValidatedMandateRead, AuthorityFailureCode, checkPolicyNarrowing(), confirmMandateRevision(), DraftRevisionResult, loadMandateAuthority(), loadPolicySnapshot() (+50 more)

### Community 25 - "application.ts"
Cohesion: 0.12
Nodes (32): Mandate, Policy, ApplicationBackendConfig, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields(), createApplicationBackend() (+24 more)

### Community 26 - "application.test.ts"
Cohesion: 0.13
Nodes (27): definePolicySnapshot(), draftMandateRevision(), reviewMandateRevision(), openLedgerStore(), Harness, setup(), NarrowingCase, setup() (+19 more)

### Community 27 - "client.mock.test.ts"
Cohesion: 0.17
Nodes (11): BackendRequest, BackendRequestSchema, BackendResponseSchema, BackendClient, BackendProtocolError, BackendTransport, createBackendClient(), cart (+3 more)

### Community 28 - "mock.ts"
Cohesion: 0.17
Nodes (14): BackendErrorCode, BackendMethod, BackendMethodSchema, Operation, MAX_AMOUNT_MINOR, canonicalCart(), canonicalize(), compareText() (+6 more)

### Community 29 - "submitProposal"
Cohesion: 0.39
Nodes (8): createMock(), createMockBackend(), findMandate(), handleValidRequest(), submitProposal(), errorResponse(), identityKey(), projectedTotal()

### Community 30 - "CLI-first architecture"
Cohesion: 0.29
Nodes (7): Authority and evidence, CLI-first architecture, Ledger and recovery requirements (planned), Repository map, Stage-one boundaries, Technology decisions, Test strategy

### Community 32 - "PayPal sandbox spike (build step 1)"
Cohesion: 0.33
Nodes (5): One-time setup (about 15 minutes), PayPal sandbox spike (build step 1), Results, Run, What each check means

### Community 33 - "Splittap — CLI-first equipment purchasing"
Cohesion: 0.40
Nodes (5): Run, Separate PayPal feasibility spike, Splittap — CLI-first equipment purchasing, Start here, Status

## Knowledge Gaps
- **234 isolated node(s):** `name`, `private`, `type`, `description`, `InputOptions` (+229 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 262 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fromMinor()` connect `paypal-spike.ts` to `index.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `evaluatePurchase()` connect `index.ts` to `application.ts`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Hackathon project: an AI purchasing agent that can't overspend` connect `Hackathon project: an AI purchasing agent that can't overspend` to `README.md`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _234 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0783744557329463 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07184325108853411 - nodes in this community are weakly interconnected._
- **Should `Splittap: instructions for coding agents` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._