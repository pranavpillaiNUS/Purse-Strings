# Unit 1 result

**Status:** complete. Unit 1 only; no commits, pushes, deployments, network calls, or transactions.

## Delivered

- Added `client.ts`: injected JSON transport, strict request/response validation, and exact method/requestId correlation checks.
- Added `mock.ts`: strict fixture setup and request validation, simulation-labelled responses, deterministic catalog projections, defensive copies, and permanent cart identities with idempotency-key aliases. Canonical replay sorts object keys and cart lines; changed payloads conflict.
- Added behavior tests for discovery/submission/read, invalid authority/price/clock fields, unsupported versions/methods, correlation and malformed responses, alias replay/conflicts, ownership, defensive copies, and fresh-process imports of all three backend entrypoints.
- Kept `index.ts` unchanged; clients and consumers use `backend.ts` directly. No later-unit services or execution behavior were added.

## Verification

- `npm test` — passed, 43 tests.
- `npm run typecheck` — passed.
- `npm run demo` — passed; all four offline scenarios produced expected outcomes.
- `graphify update .` — completed; graph rebuilt with 362 nodes and 513 edges.
- `git diff --check` — passed.
- `graphify update .` — completed; graph rebuilt with 355 nodes and 506 edges.

## Files and scope notes

Added: `packages/contracts/src/client.ts`, `packages/contracts/src/mock.ts`, `packages/contracts/src/client.mock.test.ts`, and this report.

Graphify refreshed `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html`, `graphify-out/graph.json`, and `graphify-out/manifest.json`. These graph files and other repository changes were already dirty or untracked before implementation; they were preserved, except for the requested graph refresh. The pre-existing `backend.ts`, `backend.test.ts`, `package.json` test-glob change, design notes, and research files were not edited in this unit. `index.ts` was not modified.

## Limitations

The mock is an in-memory simulation only. It does not enforce budget or stock, persist reservations, execute payment/orders, or provide production authority. Those behaviors remain outside Unit 1.

## Unit 1 review follow-up

- Added a regression test that sets nonzero shipping, obtains a quote from the fixture supplier, and compares its total with the mock proposal total. The fixture import is test-only; `mock.ts` remains independent of supplier implementation.
- On review, `projectedTotal` already included shipping in its taxable base and canonical sorting already used a deterministic text comparator; the regression test now protects the shipping-tax behavior. Removed the unused `BackendErrorCodeSchema` import from `mock.ts`.
- `node --test packages/contracts/src/client.mock.test.ts` — passed, 10 tests.
- `npm test` — passed, 44 tests.
- `npm run typecheck` — passed.
- `npm run demo` — passed; all four offline scenarios produced expected outcomes.
