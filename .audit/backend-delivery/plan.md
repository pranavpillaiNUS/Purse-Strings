# Backend delivery run

## Outcome and authority

The user authorized unattended implementation using the existing `/home/danny/agentic` workflow and OpenCode, with iterative review and feedback. Deliver reviewable CLI backend work and the teammate-facing contract. The shopping worker implementation stays with the teammate. No live or interactive sandbox transactions, websites, HTTP listeners, deployments, remote publication, new agent roles, or unrelated changes.

## Workflow

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame.
- [ ] Phase B: Design the workflow.
- [ ] Phase C: Run the loop.
- [ ] Phase D: Keep the audit trail.
- [ ] Phase E: Verify and hand back.

Design uses the existing System Architect role. Review uses existing Evidence Auditor and specialist roles. OpenCode exclusively edits implementation, tests, configuration, generated artifacts and product documentation. The orchestrator maintains this plan, bounded briefs and decision trail and runs verification.

## Evidence and constraints

- Existing baseline: 28 tests and typecheck pass, offline eligibility only.
- OpenCode v2.2.2 read-only preflight succeeded.
- Node v24.21.0 builtin SQLite 3.53.4 works.
- PostgreSQL CLI is absent. Docker reports WSL integration unavailable.
- Preserve untracked docs/team-split-and-technology-research.md and graphify metadata.
- Existing AGENTS.md explicitly requires terminal-only stage one and no shopping implementation in this workstream.

## Planned acceptance

A scripted shopper can consume a shared strict contract and mock without backend credentials. The real backend loads trusted authority and quotes, reserves money and units atomically, persists stable operations across restarts, rejects conflicting idempotency reuse, and retains uncertain external outcomes. Operator actions are separate from proposal input. CLI output stays parseable. Provider adapters are exercised with fake transport, never real money. Any incomplete business milestones are labelled explicitly.

## Throughput checkpoint

One OpenCode writer runs at a time. Read-only design and evidence review use independent contexts. Each bounded unit must pass direct checks before the next depends on it. No timing promise replaces acceptance evidence.

## Current phase

Design in progress. SQLite is the provisional delivery choice because it is already specified and can be tested here. PostgreSQL/Drizzle/DBOS remain candidates for a subsequent verified migration.
