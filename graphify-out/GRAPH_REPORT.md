# Graph Report - Splittap-pay  (2026-11-03)

## Corpus Check
- 31 files · ~14,114 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 238 nodes · 327 edges · 14 communities (12 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4f134ff0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- paypal-spike.ts
- Splittap purchasing agent
- package.json
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

## God Nodes (most connected - your core abstractions)
1. `holdAndCapture()` - 14 edges
2. `Hackathon project: an AI purchasing agent that can't overspend` - 14 edges
3. `paypalMoney` - 12 edges
4. `compilerOptions` - 12 edges
5. `Project scope: CLI-first equipment procurement` - 12 edges
6. `fromMinor()` - 8 edges
7. `Splittap purchasing agent` - 8 edges
8. `CLI-first architecture` - 7 edges
9. `scripts` - 6 edges
10. `uniqueBy()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `printResult()` --calls--> `fromMinor()`  [EXTRACTED]
  apps/cli/src/main.ts → services/checker/src/money.ts
- `loadInput()` --calls--> `createFixtureSupplier()`  [EXTRACTED]
  apps/cli/src/inputs.ts → services/suppliers/src/fixture.ts
- `main()` --calls--> `evaluatePurchase()`  [EXTRACTED]
  apps/cli/src/main.ts → services/checker/src/rules/evaluate.ts
- `cart()` --calls--> `toMinor()`  [EXTRACTED]
  services/checker/scripts/paypal-spike.ts → services/checker/src/money.ts
- `Authorization` --references--> `paypalMoney`  [EXTRACTED]
  services/checker/src/paypal/client.ts → services/checker/src/money.ts

## Import Cycles
- None detected.

## Communities (14 total, 2 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.09
Nodes (40): DEMO_NOW, InputOptions, loadInput(), readJson(), main(), printResult(), amount, BudgetSnapshot (+32 more)

### Community 1 - "paypal-spike.ts"
Cohesion: 0.07
Nodes (47): BUDGET, capture(), captureCart(), cart(), CART_A, CART_B, CART_C, checkCapture() (+39 more)

### Community 2 - "Splittap purchasing agent"
Cohesion: 0.07
Nodes (26): Authority and trust, Current implementation boundary, Implementation and verification, Knowledge graph, Purchasing invariants, Purpose and current scope, Sources of truth and personalization, Splittap purchasing agent (+18 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, @types/node, typescript, engines, node, license, name (+14 more)

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

## Knowledge Gaps
- **136 isolated node(s):** `name`, `private`, `type`, `description`, `InputOptions` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 141 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fromMinor()` connect `paypal-spike.ts` to `index.ts`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `Hackathon project: an AI purchasing agent that can't overspend` connect `Hackathon project: an AI purchasing agent that can't overspend` to `Splittap purchasing agent`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `Project scope: CLI-first equipment procurement` connect `Project scope: CLI-first equipment procurement` to `Splittap purchasing agent`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _136 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0851063829787234 - nodes in this community are weakly interconnected._
- **Should `paypal-spike.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07184325108853411 - nodes in this community are weakly interconnected._
- **Should `Splittap purchasing agent` be split into smaller, more focused modules?**
  _Cohesion score 0.06653225806451613 - nodes in this community are weakly interconnected._