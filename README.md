# Splittap — CLI-first equipment purchasing

Help a small-company operations manager equip new hires on time, using approved
hardware, suppliers and an all-in budget. The AI proposes; independent rules and
human-confirmed authority govern execution. The name is provisional.

**Stage one is terminal input/output only.** Prove the purchasing core before building
a website. This scaffold implements offline eligibility checking, not payment execution.

## Start here

- [Project scope and acceptance gates](docs/project-scope.md)
- [Architecture and implementation status](docs/architecture.md)
- [Instructions for coding agents](AGENTS.md)
- [Original hackathon plan](docs/hackathon-plan.md) — historical, superseded by scope

## Run

Requires Node 24+ and npm. No API keys or network calls are used by the offline commands.

```sh
npm ci
npm test
npm run typecheck
npm run demo
npm run cli -- check --request examples/cart.json --now 2026-11-03T09:00:00Z
npm run --silent cli -- check --request examples/cart.json --now 2026-11-03T09:00:00Z --json
```

The demo uses a fixed clock and synthetic SGD data. It shows an eligible cart, a
shipping increase exceeding the remaining budget, cumulative over-purchasing and
unknown delivery. It never reserves money or places an order.

`check` loads the bundled policy, mandate, budget snapshot and fixture catalog by
default. Override them with `--policy`, `--mandate`, `--snapshot`, `--catalog`; all
paths resolve from the current working directory. `--request -` reads cart JSON
from stdin. Omit `--now` to use current time; dated fixtures may then expire.

Exit codes for `check`: `0` eligible, `2` blocked, `3` needs review (unknown mandatory
evidence), `1` malformed input or operational error. `demo` exits zero only when all
expected scenarios match. Use `--json` plus npm's `--silent` for clean JSON stdout;
errors go to stderr. Run `npm run cli -- --help` for usage.

## Status

**Implemented:** runtime contracts, company-policy/mandate examples, fixture supplier,
deterministic eligibility checks, CLI demo/check commands and behavior tests. The
original sandbox PayPal client, money helpers and spike remain intact.

**Planned:** local operator confirmation, stock assignment, transactional ledger,
bounded AI shopper, durable order/payment execution, exceptions, reconciliation and
equipment-readiness tracking. All will be tested through the CLI. No website scaffold
or frontend dependencies are included.

## Separate PayPal feasibility spike

Read [setup and results](docs/paypal-spike.md) before invoking:

```sh
cp .env.example .env
# Add sandbox credentials locally. Never commit .env.
npm run spike:paypal
```

The interactive spike creates sandbox authorizations/captures after buyer approval.
It is separate from offline checks and remains unverified by this scaffold. A PayPal
authorization is not the application's exact budget-enforcement layer.
