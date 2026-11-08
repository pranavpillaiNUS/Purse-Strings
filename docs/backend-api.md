# Backend wire API (simulation) and the PayPal gateway contract

This documents the backend that is actually in the tree: the operator CLI
(`npm run backend`), the four shared RPC methods, the labelled contract mock, and the
PayPal sandbox gateway. Everything written here runs offline without API keys or
network by default: no money moves and no supplier is contacted, and no PayPal
request is sent unless the operator's backend config explicitly selects
`paymentProvider: "paypal-sandbox"` AND the invocation is one of the commands that
call PayPal (`operation-authorize`, `operation-complete-authorization`,
`operation-run`, `operation-reconcile`) with sandbox credentials available. Even
then, no PayPal behavior has been verified against a real sandbox account.
`simulation: true` on every response is a label, not decoration.

- Design background: [backend-delivery-design.md](backend-delivery-design.md)
- Acceptance evidence and limits: [backend-delivery-review.md](backend-delivery-review.md)
- Ledger internals: [services/checker/src/ledger/README.md](../services/checker/src/ledger/README.md)

## Starting point: the operator CLI

Root options are required on every invocation and are trusted operator inputs, never
shopper-supplied: they point at private runtime state and snapshot files on this
machine.

```sh
npm run backend -- --db .runtime/backend/app.db --config services/agent/fixtures/backend-demo-config.json COMMAND
```

| Command | Purpose | Prints | Exit |
| --- | --- | --- | --- |
| `mandate-draft --file PATH` | store an immutable mandate revision draft | `{simulation,mandateId,mandateVersion,digest}` | 0 ok, 2 operator/input, 1 internal |
| `mandate-review --id ID --revision N` | review the exact stored revision | `{simulation,mandateId,mandateVersion,digest,draft,policy}` | 0 ok |
| `mandate-confirm --id ID --revision N --digest DIGEST` | confirm digest against the stored revision; records the OS user and trusted time as metadata, which is local consent, not authentication | `{simulation,mandate,digest}` | 0 ok, 2 digest/authority conflict |
| `operation-authorize --id ID` | operator-only: create the sandbox PayPal hold for a reserved operation (requires config `paymentProvider:"paypal-sandbox"`) | `{simulation,paymentProvider,operationId,providerState:"order_created",currency,amountMinor,orderId,approvalUrl}` | 0 ok, 2 refusal/conflict, 1 internal |
| `operation-complete-authorization --id ID` | operator-only: finalize the hold after the sandbox buyer approves it on PayPal's hosted page | `{simulation,paymentProvider,operationId,providerState:"authorization_held",currency,amountMinor,orderId,authorizationId}` | 0 ok, 2 refusal (incl. buyer-not-approved), 1 internal |
| `operation-run --id ID` | execute a reserved operation against the configured providers (fake by default; sandbox capture needs an `authorization_held` binding) | `{simulation,paymentProvider,operation,providerIds?}` | 0 command ran; the business outcome lives in `operation.status` |
| `operation-reconcile --id ID` | resolve ambiguous provider outcomes only | `{simulation,paymentProvider,operation,providerIds?}` | 0 |
| `status --id ID` | print the current operation | `{simulation,paymentProvider,operation,providerIds?}` | 0 |
| `audit --id ID` | print the operation's audit events | `{simulation,paymentProvider,operationId,events:[{eventId,kind,createdAt,details}],providerIds?}` | 0 |
| `rpc` | one JSON request (≤1 MiB) on stdin → exactly one JSON response line | share-client envelope | 0 ok, 2 validation/business, 1 internal |

Errors print one sanitized JSON error envelope and exit `2`; `1` means an
uncategorized internal failure. Operator flag misuse (unknown flags, duplicates,
`--now`, empty values) exits `2` with empty stdout. Existing runtime directories
whose permissions are too open are refused, never chmoded; created runtime
directories are `0700` and database files `0600`. Windows has its own rules, in
[Private runtime folders](#private-runtime-folders).

Exit-code agreement (issue #14 decision, documented instead of changed):
`0` means **the command ran** — an operation's terminal business state lives in
its `operation.status` and `audit` output, so `operation-run` may exit `0` even
when the operation ends `failed` or `reconciliation_required`. `2` covers usage,
validation and business refusals; `1` is internal. Scripts that need the
operation's outcome must read `status`/`audit`, not the exit code.

Backend JSON file inputs (config, policy, catalog and mandate draft) accept one
leading UTF-8 BOM, including files saved by Windows PowerShell 5.1. Invalid JSON
and oversized files still fail with exit 2. The stdin RPC envelope remains strict JSON.

## Provider selection and credentials (unit 5)

Payment provider selection comes only from backend config: `"fake"` (default; absent
means fake) or `"paypal-sandbox"`. No command accepts a provider flag, and
shopper input can never select a provider. With `paypal-sandbox`, capture and
refund effects go through the sandbox gateway and the supplier order stays on
the fake provider store. New reservations bind this choice in their immutable
`operation_reserved` audit event, in the same transaction as budget and units.
Reads and idempotent replays retain that provider even if config changes.
Execution and hold commands refuse a different provider before any external
effect; use the original config to resume that operation. Config changes select
the provider for new operations only.

Sandbox credentials flow (containment rules):

| Rule | Behavior |
| --- | --- |
| Loader trigger | Only inside the same backend process, only when the config selects `paypal-sandbox` AND the command is `operation-authorize`, `operation-complete-authorization`, `operation-run` or `operation-reconcile` |
| Sources | `<invocation directory>/.env` first-class (tolerant `KEY=VALUE` parse: quotes stripped, `#` comments and blank lines ignored), overlaid by process env which takes precedence; process env values are never overwritten by the file |
| Names | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, optional `PAYPAL_ENV` (must be `"sandbox"`, or absent; a live value refuses the command) |
| Absent/unusable | Sanitized closed refusal: "Sandbox credentials are not configured…" — exit 2, empty stdout, no fetch |
| Visibility | Passed only into the gateway call path in the same process; never logged, echoed or included in any output or error message |
| `rpc` | NEVER loads `.env` or touches credentials — the shopper's child process path stays credential-free |
| Shape | The gateway is constructed sandbox-only regardless; production hosts cannot be reached |

Recommended `.env` (gitignored; `.env.example` lists the same names, plus the
shopper's and spike's names):

```sh
PAYPAL_CLIENT_ID=...      # from a sandbox REST app at developer.paypal.com
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENV=sandbox        # optional; any live value refuses the command
```

## Config and private runtime state

Config is strict JSON (schema in `apps/cli/src/backend.ts`), paths relative to the
config file's directory, each file ≤ 1 MiB:

```jsonc
{
  "version": 1,
  "policyFiles": ["../../../config/policies/hardware.example.json"],
  "catalogFiles": ["../../suppliers/state/store-a.json", "../../suppliers/state/store-b.json"],
  "fakeProviderDb": "../../../.runtime/backend/providers.db",
  "paymentProvider": "fake"            // optional; "paypal-sandbox" is the opt-in
}
```

The backend directory layout used by the demo fixtures:

```
.runtime/
  backend/          # created private by the backend, because .runtime/ may not be
    app.db          # application ledger: mandates, confirmations, operations,
                    # reservations, effects, leases, audit_events (WAL sidecars beside it)
    providers.db    # SEPARATE SQLite fake-provider database (see execution/fake.ts)
```

Rules that hold today: the application DB and the fake-provider DB must resolve to
distinct files, including spellings the filesystem treats as one name, such as a change of
case on Windows or macOS; duplicate identical snapshot files are allowed, conflicting
identities are rejected; catalogs are reloaded per invocation; no command accepts a
provider selector, URLs, credentials, clock overrides, scenario selectors or approval
metadata. A shopper never names these paths — only the operator's launch options do.

## Private runtime folders

Both databases must sit in folders only the operator can reach. The backend creates a missing
folder itself. An existing folder that fails the check is refused and never changed, so the fix is
to delete it and run the command again. `npm run demo:flow` creates `.runtime/` as an ordinary
folder, which is why the demo fixtures use `.runtime/backend/`.

**Linux and macOS:** the folder must belong to the current user, with no group or other access.

**Windows** has no such permission bits, and Node reports every folder as open, so the backend
reads the real owner and access list (`apps/cli/src/windows-acl.ts`). Node has no API for them, so
it uses the PowerShell that ships with Windows, which adds about half a second per backend command.

- **Owner:** the current user, SYSTEM or Administrators, including the built-in Administrator account.
- **Access:** allow entries for those accounts only, whether set directly or inherited from a
  parent. Deny entries don't count as too open, because they only take access away.
- **Refused:** any other allow entry, even read-only, and anything the backend can't read or parse.
  That includes a machine where PowerShell can't run or is locked to Constrained Language Mode,
  a drive with no access lists, and accounts Windows writes in a short form, such as Guest.
- **Deny entries naming the current user** are refused with their own message, because the backend
  couldn't work there. A deny through a group, such as Everyone, isn't detected: the command can
  still fail with "the command failed unexpectedly" (exit 1).
- **New files:** a folder must also have an allow entry that new files inherit. With none, Windows
  gives a new database the creating process's default access, which can reach further.
- **Links:** a junction or link is judged by the folder it reaches.
- **Database files:** an existing database or sidecar file must pass the same rules, because Windows
  lets an account open a file by its full path even when the folder blocks it.
- **New folders** get a locked access list as they are created, then are checked again, so they
  never exist with inherited access.

**What this guarantees:** at the moment of the check, on a machine with one operator, other ordinary
accounts have no access to the folder or, on Windows, to the databases in it. It does not check
parent folders, and nothing stops access changing after the check. Administrators and SYSTEM can
always reach the files. This is not production authentication or multi-user isolation.

**How it was checked:** `apps/cli/src/backend.test.ts` uses real Windows permissions for inherited
and direct access, folders that don't pass access on, deny entries naming the user, open database
files, junctions and an unreadable descriptor. A folder owned by another account is
covered only by a logic test in `apps/cli/src/windows-acl.test.ts`, because creating a real one needs
admin rights.

## The four shared methods (rpc)

Wire shape: one request object `{apiVersion:"1",requestId,method,params}` in, one
response out. Success: `{apiVersion, requestId, method, simulation:true, ok:true,
result}`. Failure: `{apiVersion, requestId|null, method|null, simulation:true,
ok:false, error:{code, message, details:{checkCodes}}}` — messages are sanitized:
never raw exceptions, paths, SQL, tokens or provider payloads. Unknown fields, extra
fields, unknown versions (`UNSUPPORTED_VERSION`) and unknown methods
(`INVALID_REQUEST`) fail closed. Request fields cannot inject policy, quotes,
prices, budget snapshots, clocks, operator identity or provider identifiers.

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `mandate.get` | `{mandateId}` | `{mandate, snapshot}` | active confirmed revision only; unconfirmed mandates are `MANDATE_NOT_CONFIRMED` |
| `catalog.list` | `{mandateId, mandateVersion, supplierId}` | `{mandateId, mandateVersion, catalog}` | checks active authority and the approved configured supplier |
| `proposal.submit` | `{idempotencyKey, cart}` | `{operation}` | price-free cart; the checker quotes, evaluates and reserves; returns the created or replayed operation |
| `operation.get` | `{mandateId, mandateVersion, operationId}` | `{operation}` | matches the immutable original ownership even when the revision is no longer active |

Closed error codes: `INVALID_REQUEST`, `UNSUPPORTED_VERSION`, `NOT_FOUND`,
`MANDATE_NOT_CONFIRMED`, `MANDATE_REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`,
`BUDGET_EXCEEDED`, `QUANTITY_EXCEEDED`, `QUOTE_EXPIRED`,
`MANDATORY_EVIDENCE_UNKNOWN`, `INELIGIBLE`, `SUPPLIER_UNAVAILABLE`, `BUSY`,
`INTERNAL_ERROR`.

`operation` fields: `id, mandateId, mandateVersion, cartId, supplierId, status
(reserved|running|reconciliation_required|ordered|failed|compensation_pending|
compensated), currency:"SGD", totalMinor, createdAt, updatedAt, reservationStatus
(active|consumed|released), paymentStatus, orderStatus, refundStatus
(not_started|intent|in_flight|unknown|succeeded|rejected), readinessStatus
("not_assessed"), paymentProvider?: ("fake"|"paypal-sandbox")`. There are no
public provider IDs, effect keys or leases in the shared operation.

`paymentProvider` is a backend-owned fact returned through both shared methods
that carry an operation: `proposal.submit` and `operation.get`. It names the
bound execution route, not proof that a payment happened; `paymentStatus` stays
separate. Shopper inputs cannot set it. The run review and `shop status` use it
to distinguish fake payment/refund from PayPal sandbox payment/refund, while
supplier orders remain fake. Sandbox reservations print the authorize, buyer
approval, complete-authorization and run steps in order.

For older operations, a stored PayPal binding establishes the sandbox provider;
an unbound legacy capture effect can only have dispatched to the fake provider.
Otherwise the field is absent until execution/authorization pins the route in a
`payment_provider_selected` audit event. Absence means **not recorded**, never
implicitly fake. Older wire responses and contract mocks may also omit it. No
database migration is needed; the existing append-only audit ledger holds the fact.

Operator `operation-run`, `operation-reconcile`, `status` and `audit` also carry
the same provider at top level (`null` when unrecorded). Audit returns original
stored event details without adding the current config's provider to history.
When sandbox identifiers exist in ledger facts, these outputs add sanitized
`providerIds: {orderId?, authorizationId?, captureId?, refundId?}`. The shopper receives
the provider name only; payment identifiers and credentials stay backend-side.

### The sandbox-authorization lifecycle (unit 5)

The hold belongs **after the cart is reserved and before `operation-run`**
(issue #16 answer): the hold amount must equal the operation's reserved all-in
total, and the capture gate revalidates against that reserved operation at
execution. Flow: `rpc proposal.submit` (reserved) → operator `operation-authorize`
→ the sandbox buyer approves on PayPal's hosted page → operator
`operation-complete-authorization` (binding becomes `authorization_held`) →
`operation-run`.

- `operation-authorize` requires an active reservation, uses
  `amountMinor = operation total` and `invoice_id = operationId`, and derives the
  stable `PayPal-Request-Id` from the binding identity (`<operationId>:hold`),
  so a replay cannot create a second order. It prints one sanitized JSON line
  with `approvalUrl` and nothing is ever a second candidate. A stored binding
  replays the existing order through the same request id and refuses a provider
  answer naming a different order.
- `operation-complete-authorization` requires an active reservation before it
  can mint a hold, and calls `authorizeOrder` with request id
  `<operationId>:authorize`; PayPal's documented `ORDER_NOT_APPROVED` failure
  maps to the closed message "The sandbox buyer has not approved this hold yet"
  (exit 2, never a raw payload). Success upgrades the binding row to
  `authorization_held` with the sandbox `authorizationId` and appends a
  `binding_upgraded` audit event.
- Binding facts live in the ledger's migration-3 `operation_paypal_bindings`
  table (STRICT, foreign key to the operation, immutable
  order/authorization/invoice/currency/amount columns, `provider_state`
  `order_created` → `authorization_held` are the only controlled changes); every
  write also appends `binding_created`/`binding_upgraded` audit events.
- `operation-run` refuses a new capture without an `authorization_held` binding
  before loading credentials or writing an intent. The operator gets exit 2 and
  the original reservation stays untouched. Ambiguous effects already dispatched
  remain subject to reconciliation; they are never silently reset.

Known sandbox lifecycle limits: a failed execution gate can release the local
reservation while the unused PayPal authorization remains held. The executor does
not automatically void that hold; local budget release is not provider hold
release. Review the original authorization in the sandbox and retain its ledger
until it is voided or expires. A lost refund response without a persisted refund
ID also remains unresolved. Retry after an early `ORDER_NOT_APPROVED` response
uses the original request ID and still needs a sandbox-account exercise; account
replay behavior is not proven by mocks. These limits do not mark M3 complete.

### Replay, cart identity and idempotency aliases

- Permanent identity: `(mandateId, cart.id)` — one operation per cart identity per
  mandate, plus alias identity `(mandateId, idempotencyKey)`.
- Same alias + canonically identical payload (all fields, sorted lines and keys,
  excluding `requestId` and `idempotencyKey`) resolves to the existing operation and
  a new `requestId` — replay wins before any quote/authority lookup, and survives
  quote expiry and failure of the supplier.
- Canonical payload changed (including `cart.version`/content) → `IDEMPOTENCY_CONFLICT`
  and the key is not bound. Aliases stay bound to their operation forever, even after
  release/failure, and cannot be reassigned to a new cart.
- New cart requires a new `cart.id` and/or a fresh, unused alias; racing carts recheck
  both identities inside the reservation transaction.

### The contract mock, and why accepting a mock result proves nothing

`createMockBackend` in `packages/contracts` implements the same strict envelopes,
replay/alias and conflict semantics in memory, and is how the shopper can be
exercised without the checker. It is labelled `simulation` on every response. **The
mock checks no policy, budget, stock, evidence or deadlines and executes nothing:**
`reserved` there is a deterministic simulated state, acceptance by the mock is not a
checker decision, and a mock-run outcome never equals a backend-run outcome. For a
meaningful result, rerun the same shopper commands against `npm run backend` (which
uses the real checker core and SQLite ledger) as the shopper README describes.

## PayPal gateway (unit-4 contract + unit-5 sandbox additions)

`services/checker/src/paypal/gateway.ts` is a sandbox-only adapter over the PayPal
REST client. It is separate from the execution provider seam
(`services/checker/src/execution/gateway.ts`) — its effect methods are unchanged;
the adapter now also declares its payment provider identity — and
is reachable only through `execution/paypal-provider.ts` when the backend config
selects it. It cannot resolve an authorization from an operation ID except
through the ledger binding the operator commands wrote, and it has no
lookup-by-request-id path. In the current tree **no behavior has been verified
against a real PayPal sandbox account** — every claim below is fetch-mocked.

```ts
const gateway = createPayPalGateway({ clientId, clientSecret, fetchFn?, timeoutMs?, onExchange? });
```

Caller inputs (validated locally, rejected before any fetch — `GatewayInputError`):

| Method | Input |
| --- | --- |
| `captureAuthorization` | `{authorizationId, requestId, invoiceId, finalCapture: boolean, expected}` |
| `getCapture` | `{captureId, authorizationId, invoiceId, expected}` |
| `refundCapture` | `{captureId, requestId, expected}` |
| `getRefund` | `{refundId, captureId, expected}` |
| `createAuthorizationOrder` *(unit 5)* | `{requestId, invoiceId, expected}` |
| `authorizeOrder` *(unit 5)* | `{orderId, requestId, expected}` |
| `getAuthorization` *(unit 5)* | `{authorizationId, expected}` |

- `expected` is `{currency:'SGD', amountMinor}` with `1 ≤ amountMinor ≤ 1,000,000,000`
  (integer). Minor-unit ⇄ decimal conversion happens only here at the PayPal edge;
  the rest of the application keeps integer minor units (the two-decimal money
  helpers covering SGD and USD stay for the spike).
- `requestId` (writes) is required, stable, nonempty, ≤127 printable characters, and
  forwarded unchanged as `PayPal-Request-Id`; the gateway generates no fallback IDs
  and performs no automatic write retries.
- Resource IDs are validated `^[A-Za-z0-9_-]{1,64}$`; invoice IDs
  `^[\x21-\x7E]{1,127}$`.
- OAuth and resource calls use the injected fetch with a finite timeout (default
  10 s, settable; test code always injects a fake).

Every method resolves to one of:

- `{state:'succeeded', resource}` — capture evidence `{authorizationId, captureId,
  invoiceId, currency:'SGD', amountMinor}` or refund evidence `{captureId, refundId,
  currency:'SGD', amountMinor}`.
- `{state:'unknown', reason, resourceId?}` — `resourceId` is only a reconciliation
  hint and only ever a validated ID from the response; provider IDs are never
  invented.

| reason | meaning |
| --- | --- |
| `transport` | no complete response: fetch rejection, OAuth/resource timeout, lost response body |
| `provider_error` | PayPal answered with a non-2xx status |
| `invalid_response` | 2xx but the body was not parseable or lacked an amount/status/ID/invoice field evidence requires |
| `unconfirmed_status` | resource parsed but status ≠ `COMPLETED` (pending, unrecognized); never safe-release evidence |
| `binding_unverified` | completed but the binding to the caller's persisted expectation could not be verified: a `COMPLETED` response whose amount/currency/invoice/ID conflicts with `expected`, a GET whose ID ≠ requested ID, a GET with missing read-side parent evidence, or any recognized response evidence contradicting the expected parent |

Binding rules: a write's parent is the authenticated request endpoint (the POST URL
the client sends); a read's binding must come from response evidence —
`supplementary_data.related_ids.authorization_id` (capture) or `.capture_id`
(refund), or at least one `rel:'up'` link whose origin is the sandbox API origin
and whose path is `/v2/payments/{authorizations|captures}/{encoded id}`, so long
as every recognized link agrees. Links are never followed; same-origin paths of
the wrong shape or foreign origins are not evidence, and neither are
pattern-invalid parent values: a `related_ids` field that fails the ID pattern is
treated as unrecognized, not as contradictory evidence. Statuses other than
`COMPLETED` are `unknown`, never succeeded.

These outcomes come from fetch-mocked contract tests only
(`services/checker/src/paypal/gateway.test.ts`, `client.test.ts`); they are not
sandbox-account evidence.

Unit-5 method semantics (same evidence discipline; new outcome shapes are
documented in the source), consuming the client's Orders v2 create/authorize and
the authorization read:

- `createAuthorizationOrder` posts `{intent:'AUTHORIZE', purchase_units:[
  {amount, invoice_id}]}` with the caller's request id. Success requires an
  order that parsed with status `CREATED`, an echoed `purchase_units[0]`
  matching the submitted amount (currency + value) and `invoice_id`, and
  exactly one extractable approval link: parseable `https`, on a sandbox
  buyer-consent host (`www.sandbox.paypal.com` or `*.sandbox.paypal.com`
  exactly) — links are never followed, and a production `paypal.com` checkout
  URL is refused. Returns `{orderId, approvalUrl}`; non-`CREATED` orders are
  `unconfirmed_status`; a malformed echo, a missing/non-sandbox approve link,
  or multiple validated approve links (PayPal documents one) are
  `invalid_response`.
- `authorizeOrder` posts to `/v2/checkout/orders/{orderId}/authorize` with the
  request id unchanged. Success requires the read-back to carry exactly one
  validated authorization whose amount matches `expected`, whose embedded
  status is in the documented authorization vocabulary (an unmapped or missing
  status is `invalid_response`), and whose status is the fresh mint `CREATED`:
  `DENIED|VOIDED|EXPIRED|PENDING` (and any other recognized state) refuse as
  `unconfirmed_status` — they never mint `authorization_held`
  (`binding_unverified`/`invalid_response` otherwise, order status gates
  apply). PayPal's documented `ORDER_NOT_APPROVED` failure is surfaced
  distinctly as `{state:'buyer_not_approved'}` because the receiver's next
  action (wait for the buyer) differs from every unknown reason — it is never
  treated as evidence about the money.
- `getAuthorization` GETs the authorization and succeeds when the read is
  verified: read-back id equals the requested id and the amount matches
  `expected`. `succeeded` here is a verified RESOURCE read, not a capture
  verdict: the resource carries its durable `status`
  (`CREATED|CAPTURED|DENIED|EXPIRED|PARTIALLY_CAPTURED|PENDING|VOIDED`). Its
  `rel:'capture'` link is a POST action, not a capture resource identifier.
- `getOrderCapture` reads the binding's persisted order ID with Orders v2 GET,
  validates the order ID, `AUTHORIZE` intent, purchase-unit invoice and all-in
  amount, and requires one completed capture candidate of the exact amount.
  Optional authorization history must agree with the stored authorization.
  It then calls `getCapture` to verify that candidate's amount, invoice and
  authorization parent independently. Missing, ambiguous or inconsistent history
  remains unknown; it never authorizes a retry, release or refund by absence.
  Sources: [PayPal authorization read](https://developer.paypal.com/api/payments/v2/authorizations-get),
  [Orders read](https://developer.paypal.com/api/orders/v2/orders-get) and its
  [payment-history schema](https://developer.paypal.com/api/orders/v2/schema.json).

The execution provider (`execution/paypal-provider.ts`) classifies those reads
for the durable worker: `CAPTURED` + verified order history and `getCapture` → capture succeeded;
`DENIED|VOIDED|EXPIRED` → durable non-application evidence the worker may safely
release on; `CREATED|PENDING` → `not_applied` (our capture never completed, so
the worker's existing same-key/revalidation retry discipline applies);
`PARTIALLY_CAPTURED` or any unverified read → unknown. Missing binding or
`order_created` → `not_applied` for lookup and conservative `unknown` (authority
retained) for apply-effect. A refund lookup verifies a persisted refund id via
`getRefund` and, by design, does NO refund discovery without one — a lost refund
response stays in reconciliation's compensation state.
