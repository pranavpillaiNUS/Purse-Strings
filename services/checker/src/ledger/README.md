# Planned durable ledger (M2)

No ledger is implemented yet. Supplied snapshots are for offline checks only.

Implement transactional budget and per-requirement quantity reservations, durable
purchase operations, independent payment/order statuses and an audit event history.
Persist idempotency keys before external effects. Unknown outcomes retain reservations
until reconciliation. Use real SQLite transactions and race/restart tests before
connecting automatic payment execution. See `docs/architecture.md` and scope M2/M3.
