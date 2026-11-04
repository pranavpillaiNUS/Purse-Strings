# Graph Report - Splittap-pay  (2026-11-05)

## Corpus Check
- 71 files · ~51,070 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .tsv 1, .example 1)

## Summary
- 609 nodes · 1297 edges · 30 communities (25 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `74366c01`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- paypal-spike.ts
- CatalogSchema
- package.json
- control-files.ts
- Hackathon project: an AI purchasing agent that can't overspend
- compilerOptions
- Project scope: CLI-first equipment procurement
- contracts/package.json
- cli/package.json
- control-files.ts
- checker/package.json
- suppliers/package.json
- agent/package.json
- Unit 2 result: trusted authority and SQLite atomic reservations
- agent/src/mandate.ts
- CLAUDE.md
- Backend delivery run
- Delivery findings
- Unit 1 result
- application.ts
- application.test.ts
- client.mock.test.ts
- mock.ts
- agent/src/mandate.ts

## God Nodes (most connected - your core abstractions)
1. `createApplicationBackend()` - 23 edges
2. `handleProposalSubmit()` - 18 edges
3. `confirmMandateRevision()` - 18 edges
4. `CatalogSchema` - 15 edges
5. `AuthorityFailure` - 15 edges
6. `Hackathon project: an AI purchasing agent that can't overspend` - 14 edges
7. `holdAndCapture()` - 14 edges
8. `draftMandateRevision()` - 13 edges
9. `readString()` - 13 edges
10. `openLedgerStore()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Delivered` --references--> `runTransaction()`  [INFERRED]
  .audit/backend-delivery/unit2-result.md → services/checker/src/ledger/store.ts
- `Mandate draft and review` --references--> `draft()`  [INFERRED]
  README.md → apps/cli/src/mandate.test.ts
- `Delivered planning slice` --references--> `draft()`  [INFERRED]
  services/agent/README.md → apps/cli/src/mandate.test.ts
- `Team, ownership and branches` --references--> `main()`  [INFERRED]
  AGENTS.md → apps/cli/src/main.ts
- `Team, ownership and branches` --references--> `CartSubmission`  [INFERRED]
  AGENTS.md → packages/contracts/src/index.ts

## Import Cycles
- None detected.

## Communities (30 total, 5 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.10
Nodes (27): Team, ownership and branches, DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), Contract operations to design first (+19 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.07
Nodes (46): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+38 more)

### Community 2 - "CatalogSchema"
Cohesion: 0.20
Nodes (11): BudgetSnapshotSchema, CartSubmissionSchema, CatalogSchema, MandateSchema, MAX_AMOUNT_MINOR, QuoteSchema, uniqueBy(), input() (+3 more)

### Community 3 - "package.json"
Cohesion: 0.11
Nodes (19): description, devDependencies, @types/node@^26.6.6, typescript@^7.0.2, engines, node, license, name (+11 more)

### Community 4 - "control-files.ts"
Cohesion: 0.09
Nodes (24): BackendErrorCodeSchema, BackendErrorResponseSchema, BackendMethodSchema, BackendSuccessResponseSchema, CatalogListRequestSchema, CatalogListResultSchema, EffectStatusSchema, MandateGetRequestSchema (+16 more)

### Community 5 - "Hackathon project: an AI purchasing agent that can't overspend"
Cohesion: 0.11
Nodes (19): Answers to likely judge questions, Architecture, Decision log, Demo script, Design rules (non-negotiable), Hackathon project: an AI purchasing agent that can't overspend, How it works, Judging criteria (+11 more)

### Community 6 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+5 more)

### Community 7 - "Project scope: CLI-first equipment procurement"
Cohesion: 0.05
Nodes (39): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+31 more)

### Community 8 - "contracts/package.json"
Cohesion: 0.29
Nodes (7): dependencies, zod@^4.0.0, description, zod, name, private, type

### Community 9 - "cli/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 10 - "control-files.ts"
Cohesion: 0.09
Nodes (29): entry, fixedClock, root, integerOption(), runStore(), check(), entry, expectFailure() (+21 more)

### Community 11 - "checker/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 12 - "suppliers/package.json"
Cohesion: 0.40
Nodes (4): description, name, private, type

### Community 13 - "agent/package.json"
Cohesion: 0.29
Nodes (7): dependencies, zod@^4.0.0, description, zod, name, private, type

### Community 14 - "Unit 2 result: trusted authority and SQLite atomic reservations"
Cohesion: 0.29
Nodes (6): Brief corrections and disclosures, Checks (run at delegation and again at orchestrator level), Delivered, Limitations (no capability claimed beyond tests), Suggested next steps, Unit 2 result: trusted authority and SQLite atomic reservations

### Community 15 - "agent/src/mandate.ts"
Cohesion: 0.10
Nodes (19): Acceptance and remaining milestones, Alternatives and choice, CLI backend delivery specification, CLI contract, Concrete storage, Current system and sources, Detailed implementation decisions, Detailed implementation plan (+11 more)

### Community 16 - "CLAUDE.md"
Cohesion: 0.14
Nodes (13): Backend exclusions, Backend framework comparison, Optional supplier simulator platforms, Order of implementation, Ownership in the current repository, PayPal adapter, Persistence, Recommendation (+5 more)

### Community 17 - "Backend delivery run"
Cohesion: 0.25
Nodes (7): Backend delivery run, Current phase, Evidence and constraints, Outcome and authority, Planned acceptance, Throughput checkpoint, Workflow

### Community 18 - "Delivery findings"
Cohesion: 0.50
Nodes (3): Delivery findings, design-critic-r1-1, design-critic-r1-2

### Community 23 - "Unit 1 result"
Cohesion: 0.33
Nodes (5): Delivered, Files and scope notes, Limitations, Unit 1 result, Verification

### Community 24 - "application.ts"
Cohesion: 0.06
Nodes (101): Review record (EGM goldfish, five-round cap reached), Mandate, Policy, ApplicationBackendConfig, authorityFailureResponse(), buildSnapshot(), buildWireOperation(), correlationFields() (+93 more)

### Community 26 - "application.test.ts"
Cohesion: 0.10
Nodes (27): ConfiguredSupplier, Harness, NarrowingCase, SubmitWorkerResult, VerifyWorkerResult, WorkerResult, asConfirmedMandate(), countingAdapter() (+19 more)

### Community 27 - "client.mock.test.ts"
Cohesion: 0.12
Nodes (13): BackendRequest, BackendRequestSchema, BackendResponse, BackendResponseSchema, BackendClient, BackendProtocolError, BackendTransport, createBackendClient() (+5 more)

### Community 28 - "mock.ts"
Cohesion: 0.14
Nodes (21): Unit 1 review follow-up, BackendErrorCode, BackendMethod, Operation, createMock(), canonicalCart(), canonicalize(), compareText() (+13 more)

### Community 33 - "agent/src/mandate.ts"
Cohesion: 0.06
Nodes (42): bundled(), printProposal(), readJson(), runMandate(), draft(), entry, invalid(), kitPath (+34 more)

## Knowledge Gaps
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Splittap purchasing agent` connect `Project scope: CLI-first equipment procurement` to `index.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10416666666666667 - nodes in this community are weakly interconnected._
- **Why does `Team, ownership and branches` connect `index.ts` to `Project scope: CLI-first equipment procurement`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07013574660633484 - nodes in this community are weakly interconnected._
- **Why does `BudgetSnapshot` connect `Project scope: CLI-first equipment procurement` to `index.ts`, `application.ts`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11052631578947368 - nodes in this community are weakly interconnected._
- **Should `control-files.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09116809116809117 - nodes in this community are weakly interconnected._