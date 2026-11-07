# Backend wire API (simulation) and the PayPal gateway contract

This documents the backend that is actually in the tree: the operator CLI
(`npm run backend`), the four shared RPC methods, the labelled contract mock, and the
unit-4 PayPal gateway. Everything written here runs offline without API keys or
network. This is a **simulated backend**: no money moves, no supplier is contacted
and no PayPal request is ever sent by the commands below. `simulation: true` on every
response is a label, not decoration.

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
| `operation-run --id ID` | execute a reserved operation against the **fake** providers | `{simulation,operation}` | 0 command ran; the business outcome lives in `operation.status` |
| `operation-reconcile --id ID` | resolve ambiguous provider outcomes only | `{simulation,operation}` | 0 |
| `status --id ID` | print the current operation | `{simulation,operation}` | 0 |
| `audit --id ID` | print the operation's audit events | `{simulation,operationId,events:[{eventId,kind,createdAt,details}]}` | 0 |
| `rpc` | one JSON request (≤1 MiB) on stdin → exactly one JSON response line | share-client envelope | 0 ok, 2 validation/business, 1 internal |

Errors print one sanitized JSON error envelope and exit `2`; `1` means an
uncategorized internal failure. Operator flag misuse (unknown flags, duplicates,
`--now`, empty values) exits `2` with empty stdout. Existing runtime directories
whose permissions are too open are refused, never chmoded; created runtime
directories are `0700` and database files `0600`. Windows has its own rules, in
[Private runtime folders](#private-runtime-folders).

## Config and private runtime state

Config is strict JSON (schema in `apps/cli/src/backend.ts`), paths relative to the
config file's directory, each file ≤ 1 MiB:

```jsonc
{
  "version": 1,
  "policyFiles": ["../../../config/policies/hardware.example.json"],
  "catalogFiles": ["../../suppliers/state/store-a.json", "../../suppliers/state/store-b.json"],
  "fakeProviderDb": "../../../.runtime/backend/providers.db"
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
distinct files; duplicate identical snapshot files are allowed, conflicting
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
  parent. Deny entries are fine, because they only take access away.
- **Refused:** any other allow entry, even read-only, and anything the backend can't read or parse.
  That includes a machine where PowerShell can't run or is locked to Constrained Language Mode,
  a drive with no access lists, and accounts Windows writes in a short form, such as Guest.
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
and direct access, open database files, junctions and an unreadable descriptor. A folder owned by another account is
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
("not_assessed")`. There are no public provider IDs, effect keys or leases.

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

## Unit-4 PayPal gateway (contract only — not wired into execution)

`services/checker/src/paypal/gateway.ts` is a sandbox-only adapter over the PayPal
REST client. It is separate from the execution provider seam
(`services/checker/src/execution/gateway.ts`), is imported by no CLI and no worker,
cannot resolve an authorization/capture from an operation ID, and has no
lookup-by-request-id path. In the current tree **nothing calls it** except its own
tests; wiring it into the execution ledger is a later authorized step, and no real
sandbox or live request has been made to verify it.

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
