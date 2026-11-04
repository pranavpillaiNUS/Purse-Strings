# Team scope and framework assessment

Research date: November 4, 2026. Status: proposed implementation plan, not installed
software. This report defines the requested team separation. No application code,
dependencies, database or network service was changed during this research.

## Recommendation

Two separately runnable components, one shared versioned contract:

- Backend owner: Node/TypeScript/Zod application core, purchasing policy, approvals,
  ledger, authoritative supplier integration and PayPal execution/reconciliation.
- Shopping-agent owner: Mastra worker for mandate drafting, discovery, product
  comparison, price-free proposals and responses to structured backend feedback.
- Shared contract: backend owns publication/versioning; both owners review changes.
  A backend-owned mock lets the teammate develop without payment credentials or DB access.

Keep human interaction and initial process integration in the terminal. The first
transport can be JSON requests/responses over stdin/stdout. OpenAPI describes the
later HTTP mapping; Fastify is the recommended adapter when an HTTP service is in scope.
No website is required. The prior project instructions prohibit a stage-one web
server, so this report does not silently introduce one.

Recommendation for durable execution: PostgreSQL + Drizzle + DBOS TypeScript. This
would revise the earlier SQLite plan; do not migrate storage as an incidental task.
SQLite remains adequate for an isolated earlier ledger experiment if DBOS is deferred.

These recommendations come from repository and documentation research, not local
installation, security certification or comparative benchmarks. Pin release versions
and validate the selected combination before building on it.

## Scope A: backend, API contract and PayPal

| Area | Backend deliverable | Acceptance evidence |
| --- | --- | --- |
| Mandates | Store draft/confirmed/revised mandates, policy version and operator identity; enforce policy narrowing | A draft or obsolete revision cannot execute; agent cannot grant authority |
| Stock and requirements | Role-specific kits, manual stock assignments and remaining quantities | No spare assigned twice; purchased/reserved quantities count across carts |
| Contract | Strict schemas, typed client, reason codes, mock responses, versioning and error semantics | Both components pass the same contract tests independently |
| Policy engine | Existing pure checks plus execution-time revalidation | Stale quotes, unknown mandatory evidence, incorrect SKUs and shipping changes stop execution |
| Ledger | Atomic amount/unit reservations; operation identity; migrations | Concurrent requests cannot overspend or overbuy; restart preserves commitments |
| Supplier execution | Authoritative quotes, expiry, stock reservation, order placement/status lookup | Unknown order outcome is reconciled before retry/refund |
| PayPal | OAuth, buyer authorization, partial captures, refunds, void/close-out feasibility, provider status reads | Sandbox outcomes recorded; duplicate requests cannot create duplicate local operations |
| Recovery | Durable execution, idempotency, pending/unknown states, reconciliation; verified webhook intake when a listener is introduced | Lost response and process crash do not lose authority, reservations or operation IDs |
| Operator CLI | Confirm/reject mandate, approve scoped exceptions, inspect status/audit, attest delivery/readiness | Terminal can exercise the entire backend without an LLM or website |
| Audit and access | Actor attribution, evidence snapshots, secrets isolation and output redaction | Agent cannot read/write ledger, policy, approval records or PayPal secrets |

Backend owns supplier CHECKOUT even though the agent owns SHOPPING. Discovery can
consume approved catalog data through a read-only backend client. A supplier page or
agent-submitted price is not authoritative payment evidence.

The PayPal buyer still approves through PayPal's hosted checkout, usually in a
browser. The CLI prints the approval URL and then observes approval status. CLI-first
means no custom application website; it does not remove PayPal's buyer-consent flow.

### Backend exclusions

Do not implement prompts, model selection, agent memory, ranking heuristics or the
shopping loop in this workstream. No browser shopping, live money, marketplace
onboarding, foreign exchange or application website. Backend tests use scripted
proposals rather than requiring the teammate's model to behave consistently.

## Scope B: teammate's shopping worker

Own mandate DRAFT extraction, catalog search, product inspection, evidence-aware
comparison, bounded tool execution, alternative-cart selection after rejection,
worker run persistence, model costs and tracing. Facts and recommendations remain
distinct. A draft mandate is never a confirmed purchasing authorization.

Input: mandate reference/revision, backend-issued shopping requirements, allowed
supplier identifiers and capability limits. Output: price-free cart proposal or a
structured outcome such as `needs_input`, `no_feasible_cart` or `failed`.

Tools: read approved mandate, search catalog, inspect product, submit proposal,
inspect operation result. No payment, approval, policy-write, unrestricted shell or
arbitrary URL-fetch tool. Model keys belong only to this process.

The worker must demonstrate a valid proposal, backend rejection followed by a valid
alternative, bounded failure when no cart is feasible, hostile catalog text handling
and replay of a submission without creating another backend operation. It does not
reserve money, order equipment, approve exceptions or mark readiness.

## Shared interface and separation

```text
Operator CLI -> backend core -> policy + ledger + supplier checkout + PayPal
Shopping CLI -> agent worker -> backend client -> shared operation contract
```

Prefer one repository with explicit package/process boundaries while the interface
is young. Separate repositories introduce package-release and coordinated-version
work without automatically improving runtime isolation. Revisit if access control
requires it. Neither monorepo boundaries nor CODEOWNERS replace process permissions.

### Contract operations to design first

| Operation | Caller | Result |
| --- | --- | --- |
| Read shopping task | Agent | Confirmed mandate revision and sanitized requirements |
| Search/read product | Agent | Approved catalog data with provenance; not a binding quote |
| Submit proposal | Agent | Operation ID and accepted-for-processing, blocked or needs-review result |
| Read operation | Agent/operator | Current status, reason codes and safe feedback |
| Confirm mandate/approve exception | Operator only | Persisted authority bound to exact revision and request |
| Execute/reconcile | Backend worker only | Durable supplier/payment status changes |

Accepted-for-processing is not paid, ordered or ready. Keep the current offline
`eligible` result distinct from a real reservation and execution permission.

Proposal envelope should add `contractVersion` and a stable submission/idempotency
key to the existing cart shape. Same key plus same normalized payload returns the
original operation; same key plus different payload is a conflict. Return stable
codes such as `BUDGET_EXCEEDED`, `QUOTE_EXPIRED`, `QUANTITY_EXCEEDED`,
`MANDATORY_EVIDENCE_UNKNOWN` and `MANDATE_REVISION_CONFLICT` with structured details.
These are proposed additions, not current contract fields or implemented endpoints.

Never expose `EvaluationInput` as an agent-facing execute API: it currently accepts
policy, quote, clock and budget snapshot for offline experiments. Real backend code
must load those independently. Agent requests carry neither prices nor approval IDs
that purport to grant authority. Agent credentials, when introduced, are scoped to
shopping tasks and proposals; operator confirmation is a different capability.

Freeze a first contract and examples before either implementation expands. Maintain
a backend-owned mock and consumer/provider tests. Keep shared code dependency-free
of both implementations except runtime schema dependencies.

## Backend framework comparison

| Candidate | Supplied capability | Setup and tradeoff | Recommendation |
| --- | --- | --- | --- |
| [Fastify](https://github.com/fastify/fastify), MIT | Runnable Node framework with plugins, validation, logging and request testing | Install package and register adapters; persistence and business rules remain yours | Best small future API adapter for this existing scaffold |
| [NestJS](https://github.com/nestjs/nest), MIT | CLI generators, modules, dependency injection and backend conventions | More structure; customary decorator/compiler configuration changes the current erasable-TS setup | Best if a comprehensive backend framework is the priority |
| [DBOS TypeScript](https://github.com/dbos-inc/dbos-transact-ts), MIT | Durable workflows, waits, queues and recovery backed by PostgreSQL | App plus PostgreSQL; no separate workflow server; ordinary function registration is available | Preferred execution framework at the durable-payment milestone |
| [Temporal TypeScript](https://github.com/temporalio/sdk-typescript), MIT | Durable workflows with worker/client architecture | Local dev server is available; operating a separate workflow service adds responsibility | Strong alternative when operational complexity is acceptable |
| [pg-boss](https://github.com/timgit/pg-boss), MIT | PostgreSQL job queue, retries and scheduling | Simpler queue; multi-step recovery and compensation still need application design | Choose instead of DBOS when a queue is sufficient |

Fastify's documented starter is small and ESM-compatible. Keep policy and ledger in
application modules, independent of HTTP handlers. Zod integration needs an explicit
adapter/schema mapping; it is not automatically Fastify's default validator.
[Fastify setup](https://fastify.dev/docs/latest/Guides/Getting-Started/)

Nest can also run a standalone application context without an HTTP listener. It is
a legitimate CLI-first alternative, not a requirement to build a website.
[Nest standalone applications](https://docs.nestjs.com/v9/standalone-applications)

DBOS TypeScript uses PostgreSQL. Its Drizzle datasource can coordinate application
transactions with workflow checkpoints. Use the documented integration instead of
assuming arbitrary DB transactions are atomic with workflow persistence. Neither
DBOS retries nor Temporal guarantees exactly-once remote PayPal charges. Retain
provider idempotency keys and reconcile uncertain outcomes.
[DBOS transactions](https://docs.dbos.dev/typescript/tutorials/transaction-tutorial),
[DBOS external steps](https://docs.dbos.dev/typescript/tutorials/step-tutorial),
[Temporal local server](https://docs.temporal.io/cli/command-reference/server)

### Persistence

Recommend [Drizzle](https://github.com/drizzle-team/drizzle-orm), Apache-2.0, with
PostgreSQL. It exposes transactions and keeps SQL operations explicit, useful when
reviewing reservation invariants. Constraints, locking and idempotency still require
our implementation. [Transaction documentation](https://orm.drizzle.team/docs/transactions)

[Prisma ORM](https://github.com/prisma/orm), Apache-2.0, is a credible alternative
with schema/client tooling. Do not adopt both ORMs. Prefer Drizzle here for the
explicit ledger queries and the documented DBOS datasource integration. This is a
fit judgment, not a performance claim.

### PayPal adapter

The official [PayPal TypeScript Server SDK](https://github.com/paypal/PayPal-TypeScript-Server-SDK)
provides Orders and Payments APIs, including authorization capture, void, reauthorize
and refunds. Its [Payments controller reference](https://github.com/paypal/PayPal-TypeScript-Server-SDK/blob/main/doc/controllers/payments.md)
was checked against current source. It uses a custom [PayPal SDK license](https://github.com/paypal/PayPal-TypeScript-Server-SDK/blob/main/LICENSE),
not MIT or Apache.

Preserve the existing small REST adapter initially. Compare it with the SDK behind
one backend-owned gateway before deciding to migrate. SDK adoption does not supply
the business ledger, approval policy, reconciliation or supplier settlement.

PayPal can allow overcapture; partial captures need account enablement. An authorized
budget is not an exact provider-enforced limit. Persist operation-specific
`PayPal-Request-Id` values, confirm final status and design separately for multiple
merchant settlement. [Authorization rules](https://developer.paypal.com/payment-methods/auth-honor/),
[idempotency](https://developer.paypal.com/api/rest/reference/idempotency/),
[multiparty products](https://developer.paypal.com/platforms/overview)

## Shopping-agent framework comparison

| Candidate | What comes ready | Work still required | Decision |
| --- | --- | --- | --- |
| [Mastra](https://github.com/mastra-ai/mastra) | TypeScript agents, typed tools, workflows and storage/observability integrations | Model credentials, catalog/backend tools, persistent adapter and domain behavior | Preferred integrated starting framework |
| [LangGraph.js](https://github.com/langchain-ai/langgraphjs), MIT | Explicit graph state, checkpoints and interrupts | Define state/nodes/routes and durable checkpointer | Best alternative for explicit branching/control |
| [AI SDK](https://github.com/vercel/ai), Apache-2.0 | Provider abstraction, typed tool calling and generation loops | More application-level persistence and orchestration | Good lightweight option; less complete framework |

Mastra core is Apache-2.0 with separately licensed `ee/` directories. Its docs show
direct `agent.generate()` invocation from a script, so the worker can run through
the existing Node CLI without Mastra's server or developer UI.
[Mastra agents](https://mastra.ai/docs/agents/overview),
[license](https://raw.githubusercontent.com/mastra-ai/mastra/main/LICENSE.md)

Mastra requires configured persistence for resume artifacts; in-memory defaults do
not survive exit. Suspension is not human purchasing authorization, and resume
snapshots are not a permanent financial audit log. The backend remains authoritative.
[Storage](https://mastra.ai/docs/storage),
[human-in-the-loop](https://mastra.ai/docs/agents/human-in-the-loop)

LangGraph's quickstart is a runnable tool-using script; persistent interrupts need
a checkpointer and stable thread identity. AI SDK tools supply schema-driven inputs
and execution hooks, not our purchase policy. Pick one worker framework and pin its
version rather than combining all three.
[LangGraph quickstart](https://docs.langchain.com/oss/javascript/langgraph/quickstart),
[interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts),
[AI SDK tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

## Software for managing and building the project

These are runnable applications/build systems, not agent skill collections.

| Project | Use | Setup/license | Fit |
| --- | --- | --- | --- |
| [Nx](https://github.com/nrwl/nx) | Project graph, generators, task execution and import boundaries | npm integration; MIT core | Useful if enforcing backend/agent separation in CI is the priority |
| [Turborepo](https://github.com/vercel/turborepo) | Dependency-aware task execution and caching over workspaces | npm package plus task config; MIT | Lighter choice if task coordination alone is needed |
| [Plane](https://github.com/makeplane/plane) | Work items, cycles and roadmap management | Runnable self-hosted application; AGPL-3.0 community edition; edition-specific features differ | Optional ready-made project manager; not a runtime dependency |
| [OpenHands](https://github.com/OpenHands/OpenHands) | AI-assisted software development application | MIT repository, npm/source or container launch; model/runtime setup required | Optional development tool, not the shopping runtime or trusted payment service |
| [Prism](https://github.com/stoplightio/prism) | Runnable mock API from an OpenAPI document | CLI; Apache-2.0 | Useful at the HTTP milestone so teammate need not wait for backend routes |
| [Langfuse](https://github.com/langfuse/langfuse) | LLM traces, evaluations and prompt management | Docker Compose or hosted service; MIT except enterprise directories | Add when model runs need shared debugging; not a financial audit ledger |

Nx's TypeScript ESLint boundary rule can block agent imports of backend internals.
It is a code-dependency check, not runtime security; the graph-wide Conformance
offering has different packaging. Turborepo builds on package-manager workspaces.
For this two-person project, existing npm scripts are sufficient initially. Choose
Nx only when using its boundary/generator capabilities; do not add both Nx and Turbo.
[Nx boundaries](https://nx.dev/docs/features/enforce-module-boundaries),
[Turborepo structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)

Plane has a documented self-hosted deployment, but its editions differ. Run it
separately if desired rather than embedding a project-management UI in Splittap.
[Plane community edition](https://plane.so/open-source),
[self-hosting](https://developers.plane.so/self-hosting/methods/docker-compose)

OpenHands can launch a local development stack through its documented npm/container
paths. It still needs model configuration and repository/test instructions. Keep
coding-tool credentials and sandboxes separate from the future purchasing runtime.
[OpenHands launch instructions](https://github.com/OpenHands/OpenHands/blob/main/README.md)

Langfuse self-hosting adds a separate service stack; use basic worker tracing first
if this overhead is unnecessary. Its enterprise features are separately licensed.
[Self-hosting](https://langfuse.com/self-hosting),
[open-source policy](https://langfuse.com/handbook/chapters/open-source)

No listed project supplies a complete buyer-side procurement application. They
remove framework/infrastructure work; our policy, authority and recovery semantics
remain application code. Starter success is not acceptance of financial behavior.

## Optional supplier simulator platforms

Keep the existing supplier fixtures for early contracts. If realistic controlled
store behavior is needed, [Medusa](https://github.com/medusajs/medusa) supplies
commerce modules and a runnable backend starter; its core is MIT with enterprise
exclusions. [Vendure](https://github.com/vendurehq/vendure) supplies a TypeScript
commerce backend and GraphQL APIs under GPLv3/commercial options. Both need our
quote/evidence/order adapter. They represent stores we operate, not automatic
integrations into unrelated retailers. Neither belongs in the agent's payment authority.

## Ownership in the current repository

| Path | Owner |
| --- | --- |
| `services/checker/**` | Backend |
| `services/suppliers/**` | Backend authoritative adapters and fixtures |
| `config/policies/**`, `examples/**` | Backend examples/policy, contract fixtures reviewed by both |
| `apps/cli/**` | Backend operator CLI |
| `services/agent/**` | Teammate; this session does not implement it |
| `packages/contracts/**` | Backend publishes; both review breaking changes |
| Proposed `packages/backend-client/**` | Backend publishes typed client/mock; teammate consumes |
| Root lockfile and build config | Backend integrates dependency changes; teammate requests them through PR |

Each owner tests without the other implementation. When adding CI, enforce both
provider and consumer contract suites plus end-to-end CLI scenarios using a scripted
shopper. CODEOWNERS can request reviews, but required-review enforcement depends on
repository plan/settings. [GitHub code ownership](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

## Order of implementation

1. Agree on schemas, reason codes, proposal identity and fixture responses.
2. Backend publishes mock client; teammate implements shopper against it independently.
3. Backend proves PayPal feasibility separately and implements ledger reservation tests.
4. Select DBOS/PostgreSQL at the durable-execution gate and test crash/timeout recovery.
5. Integrate real backend with scripted shopper, then teammate's worker through the same client.
6. Add HTTP/Fastify only when its transport is explicitly in scope; keep operator I/O CLI.
7. Consider a website only after CLI authority, concurrency and recovery acceptance passes.

The immediate backend next task is the shared client/contract plus mock, followed by
durable ledger work. Do not start by writing the teammate's agent or replacing the
existing PayPal client solely to adopt another framework.
