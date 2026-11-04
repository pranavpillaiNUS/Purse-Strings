import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type BackendRequest,
  type BackendResponse,
} from '../../../../../packages/contracts/src/backend.ts';
import { createBackendClient } from '../../../../../packages/contracts/src/client.ts';
import {
  CartSubmissionSchema,
  type CartSubmission,
} from '../../../../../packages/contracts/src/index.ts';
import { createApplicationBackend } from '../../application.ts';
import {
  confirmMandateRevision,
  definePolicySnapshot,
  draftMandateRevision,
  reviewMandateRevision,
} from '../../authority.ts';
import { canonicalCartJson, openLedgerStore } from '../store.ts';
import {
  TEST_CART,
  TEST_CART_TOTAL_MINOR,
  TEST_CATALOG,
  TEST_CLOCK,
  TEST_MANDATE_DRAFT,
  TEST_POLICY,
  countingAdapter,
  fixtureAdapter,
  makeTempDir,
  removeTempDir,
  type SupplierCallCounter,
} from './fixtures.ts';
import type { ConfiguredSupplier } from '../../application.ts';

const APPROVER = 'fixture-ops-manager';

interface Harness {
  backend: ReturnType<typeof createApplicationBackend>;
  adapter: SupplierCallCounter;
  database: ReturnType<typeof openLedgerStore>;
  dir: string;
  close(): void;
}

function setup(dir: string, draftOverrides: Partial<typeof TEST_MANDATE_DRAFT> = {}, confirm = true): Harness {
  const database = openLedgerStore(`${dir}/ledger.db`);
  definePolicySnapshot(database, { ...TEST_POLICY }, TEST_CLOCK);
  const draft = { ...TEST_MANDATE_DRAFT, ...draftOverrides };
  draftMandateRevision(database, draft, TEST_CLOCK);
  if (confirm) {
    const review = reviewMandateRevision(database, draft.id, draft.version);
    confirmMandateRevision(database, draft.id, draft.version, review!.digest, APPROVER, TEST_CLOCK);
  }
  const adapter = countingAdapter();
  const suppliers: ConfiguredSupplier[] = [
    { supplierId: 'store-a', catalog: TEST_CATALOG, adapter },
  ];
  const backend = createApplicationBackend({
    databasePath: `${dir}/ledger.db`,
    suppliers,
    clock: () => TEST_CLOCK,
  });
  return {
    backend,
    adapter,
    database,
    dir,
    close() {
      backend.close();
      database.close();
    },
  };
}

async function submit(
  backend: Harness['backend'],
  idempotencyKey: string,
  cart: CartSubmission,
  requestId = 'submit-request',
): Promise<BackendResponse> {
  return backend.handle({
    apiVersion: '1', requestId, method: 'proposal.submit',
    params: { idempotencyKey, cart },
  } satisfies BackendRequest);
}

test('shared client scenario: discovery, submission and owned reads through the real dispatcher', async () => {
  const dir = makeTempDir('app-client');
  let harness: Harness | null = null;
  try {
    harness = setup(dir);
    const backend = harness.backend;
    const client = createBackendClient((request) => backend.handle(request));
    const mandateRead = await client.request({
      apiVersion: '1', requestId: 'mandate-read', method: 'mandate.get',
      params: { mandateId: TEST_MANDATE_DRAFT.id },
    });
    assert.equal(mandateRead.ok && mandateRead.method === 'mandate.get' && mandateRead.result.snapshot.reservedMinor, 0);

    const catalogRead = await client.request({
      apiVersion: '1', requestId: 'catalog-read', method: 'catalog.list',
      params: { mandateId: TEST_MANDATE_DRAFT.id, mandateVersion: 1, supplierId: 'store-a' },
    });
    assert.equal(catalogRead.ok && catalogRead.method === 'catalog.list' && catalogRead.result.catalog.supplierId, 'store-a');

    const submission = await client.request({
      apiVersion: '1', requestId: 'proposal-submit', method: 'proposal.submit',
      params: { idempotencyKey: 'client-key', cart: TEST_CART },
    });
    assert.equal(submission.ok, true);
    if (!submission.ok || submission.method !== 'proposal.submit') assert.fail('expected proposal success');
    assert.equal(submission.result.operation.status, 'reserved');
    assert.equal(submission.result.operation.readinessStatus, 'not_assessed');
    assert.equal(submission.result.operation.totalMinor, TEST_CART_TOTAL_MINOR);
    assert.equal(submission.result.operation.currency, 'SGD');
    const operationId = submission.result.operation.id;

    const read = await client.request({
      apiVersion: '1', requestId: 'operation-read', method: 'operation.get',
      params: { mandateId: TEST_MANDATE_DRAFT.id, mandateVersion: 1, operationId },
    });
    assert.equal(read.ok && read.method === 'operation.get' && read.result.operation.id, operationId);

    const wrongOwner = await client.request({
      apiVersion: '1', requestId: 'wrong-owner', method: 'operation.get',
      params: { mandateId: TEST_MANDATE_DRAFT.id, mandateVersion: 2, operationId },
    });
    assert.equal(wrongOwner.ok, false);
    if (!wrongOwner.ok) assert.equal(wrongOwner.error.code, 'NOT_FOUND');

    const mandateAfter = await client.request({
      apiVersion: '1', requestId: 'mandate-after', method: 'mandate.get',
      params: { mandateId: TEST_MANDATE_DRAFT.id },
    });
    if (mandateAfter.ok && mandateAfter.method === 'mandate.get') {
      assert.equal(mandateAfter.result.snapshot.reservedMinor, TEST_CART_TOTAL_MINOR);
      assert.deepEqual(
        mandateAfter.result.snapshot.quantities.find((entry) => entry.requirementId === 'engineering-laptops'),
        { requirementId: 'engineering-laptops', committed: 0, reserved: 3 },
      );
    } else {
      assert.fail('expected mandate snapshot after reservation');
    }
  } finally {
    try { harness?.close(); } catch { /* cleanup is best-effort */ }
    try { removeTempDir(dir); } catch { /* cleanup is best-effort */ }
  }
});

test('duplicate and conflict semantics match the shared mock contract', async () => {
  const dir = makeTempDir('app-idempotency');
  let harness: Harness | null = null;
  try {
    harness = setup(dir);
    // Two-line cart: canonical sorting means genuinely swapped input order is
    // the same cart identity, not a conflicting payload.
    const laptopLine = { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 3 };
    const monitorLine = { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 1 };
    const twoLineCart = CartSubmissionSchema.parse({ ...TEST_CART, lines: [laptopLine, monitorLine] });
    const swappedCart = CartSubmissionSchema.parse({ ...TEST_CART, lines: [monitorLine, laptopLine] });
    assert.equal(canonicalCartJson(twoLineCart), canonicalCartJson(swappedCart));

    const first = await submit(harness.backend, 'alias-one', twoLineCart, 'first');
    assert.equal(first.ok, true);
    if (!first.ok || first.method !== 'proposal.submit') assert.fail('expected first success');
    const operationId = first.result.operation.id;

    const aliasReplay = await submit(harness.backend, 'alias-two', swappedCart, 'second');
    assert.equal(aliasReplay.ok, true);
    if (!aliasReplay.ok || aliasReplay.method !== 'proposal.submit') assert.fail('expected alias replay');
    assert.equal(aliasReplay.result.operation.id, operationId);
    assert.equal(aliasReplay.result.operation.createdAt, first.result.operation.createdAt);

    const keyReplay = await submit(harness.backend, 'alias-two', twoLineCart, 'third');
    assert.equal(keyReplay.ok && keyReplay.method === 'proposal.submit' && keyReplay.result.operation.id, operationId);

    const changedQuantity = CartSubmissionSchema.parse({
      ...TEST_CART,
      lines: TEST_CART.lines.map((line) => ({ ...line, quantity: line.quantity + 1 })),
    });
    const changedPayload = await submit(harness.backend, 'unbound-key', changedQuantity, 'changed');
    assert.equal(changedPayload.ok, false);
    if (!changedPayload.ok) assert.equal(changedPayload.error.code, 'IDEMPOTENCY_CONFLICT');

    const changedVersion = CartSubmissionSchema.parse({ ...TEST_CART, mandateVersion: 2 });
    const versionConflict = await submit(harness.backend, 'another-unbound-key', changedVersion, 'version');
    assert.equal(versionConflict.ok, false);
    if (!versionConflict.ok) assert.equal(versionConflict.error.code, 'IDEMPOTENCY_CONFLICT');

    const keyReuse = await submit(harness.backend, 'alias-one', CartSubmissionSchema.parse({ ...TEST_CART, id: 'other-cart' }), 'reuse');
    assert.equal(keyReuse.ok, false);
    if (!keyReuse.ok) assert.equal(keyReuse.error.code, 'IDEMPOTENCY_CONFLICT');

    const unboundStillUsable = await submit(
      harness.backend,
      'unbound-key',
      CartSubmissionSchema.parse({
        ...TEST_CART,
        id: 'other-cart',
        lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 1 }],
      }),
      'unbound',
    );
    assert.equal(unboundStillUsable.ok, true);
  } finally {
    try { harness?.close(); } catch { /* cleanup is best-effort */ }
    try { removeTempDir(dir); } catch { /* cleanup is best-effort */ }
  }
});

test('replay never fetches quotes and returns the current operation even after supplier outage or failure', async () => {
  const dir = makeTempDir('app-replay');
  let harness: Harness | null = null;
  try {
    harness = setup(dir);
    const first = await submit(harness.backend, 'replay-key', TEST_CART, 'first');
    assert.equal(first.ok, true);
    assert.equal(harness.adapter.calls, 1);

    // Simulate a supplier outage: the replay must not touch the supplier at all.
    harness.adapter.failAfterCall = 1;
    const replay = await submit(harness.backend, 'replay-key', TEST_CART, 'second');
    assert.equal(replay.ok, true);
    assert.equal(harness.adapter.calls, 1);
    if (!replay.ok || replay.method !== 'proposal.submit') assert.fail('expected replay success');
    if (!first.ok || first.method !== 'proposal.submit') assert.fail('expected first success');
    assert.equal(replay.result.operation.id, first.result.operation.id);

    // Mutate to a terminal status out of band; replay still returns the current operation.
    harness.database.prepare("UPDATE operations SET status = 'failed', updated_at = ? WHERE operation_id = ?")
      .run(TEST_CLOCK, first.result.operation.id);
    const terminalReplay = await submit(harness.backend, 'replay-key', TEST_CART, 'third');
    assert.equal(terminalReplay.ok, true);
    if (!terminalReplay.ok || terminalReplay.method !== 'proposal.submit') assert.fail('expected terminal replay');
    assert.equal(terminalReplay.result.operation.status, 'failed');

    // A changed cart under the same cart id still conflicts after terminal state.
    const changed = CartSubmissionSchema.parse({ ...TEST_CART, lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 2 }] });
    const conflict = await submit(harness.backend, 'late-key', changed, 'late');
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.error.code, 'IDEMPOTENCY_CONFLICT');
  } finally {
    try { harness?.close(); } catch { /* cleanup is best-effort */ }
    try { removeTempDir(dir); } catch { /* cleanup is best-effort */ }
  }
});

test('draft mandates reject proposals and reads until confirmation', async () => {
  const dir = makeTempDir('app-unconfirmed');
  let harness: Harness | null = null;
  try {
    harness = setup(dir, {}, false);
    const mandateRead = await harness.backend.handle({
      apiVersion: '1', requestId: 'draft-read', method: 'mandate.get',
      params: { mandateId: TEST_MANDATE_DRAFT.id },
    });
    assert.equal(mandateRead.ok, false);
    if (!mandateRead.ok) assert.equal(mandateRead.error.code, 'MANDATE_NOT_CONFIRMED');

    const proposal = await submit(harness.backend, 'draft-key', TEST_CART, 'draft-submit');
    assert.equal(proposal.ok, false);
    if (!proposal.ok) assert.equal(proposal.error.code, 'MANDATE_NOT_CONFIRMED');

    const unknown = await harness.backend.handle({
      apiVersion: '1', requestId: 'ghost-read', method: 'mandate.get',
      params: { mandateId: 'ghost-mandate' },
    });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.error.code, 'NOT_FOUND');
  } finally {
    try { harness?.close(); } catch { /* cleanup is best-effort */ }
    try { removeTempDir(dir); } catch { /* cleanup is best-effort */ }
  }
});

test('catalog reads check active authority and approved configured suppliers', async () => {
  const dir = makeTempDir('app-catalog');
  let harness: Harness | null = null;
  try {
    harness = setup(dir);
    const staleVersion = await harness.backend.handle({
      apiVersion: '1', requestId: 'stale', method: 'catalog.list',
      params: { mandateId: TEST_MANDATE_DRAFT.id, mandateVersion: 2, supplierId: 'store-a' },
    });
    if (!staleVersion.ok) assert.equal(staleVersion.error.code, 'MANDATE_REVISION_CONFLICT');
    else assert.fail('expected revision conflict');

    const unapproved = await harness.backend.handle({
      apiVersion: '1', requestId: 'unapproved', method: 'catalog.list',
      params: { mandateId: TEST_MANDATE_DRAFT.id, mandateVersion: 1, supplierId: 'store-b' },
    });
    if (!unapproved.ok) assert.equal(unapproved.error.code, 'SUPPLIER_UNAVAILABLE');
    else assert.fail('expected supplier unavailability');

    const staleProposal = await submit(harness.backend, 'stale-key', CartSubmissionSchema.parse({ ...TEST_CART, mandateVersion: 2 }), 'stale-submit');
    if (!staleProposal.ok) assert.equal(staleProposal.error.code, 'MANDATE_REVISION_CONFLICT');
    else assert.fail('expected revision conflict');
  } finally {
    try { harness?.close(); } catch { /* cleanup is best-effort */ }
    try { removeTempDir(dir); } catch { /* cleanup is best-effort */ }
  }
});

test('request fields cannot supply authority, clock, policy or quote data', async () => {
  const dir = makeTempDir('app-hostile');
  let harness: Harness | null = null;
  try {
    harness = setup(dir);
    const hostileCases: Array<{
      request: unknown;
      requestId: string | null;
      method: string | null;
      expectedCode: string;
    }> = [
      { request: { apiVersion: '2', requestId: 'version', method: 'mandate.get', params: { mandateId: TEST_MANDATE_DRAFT.id } }, requestId: 'version', method: 'mandate.get', expectedCode: 'UNSUPPORTED_VERSION' },
      { request: { apiVersion: '1', requestId: 'method', method: 'operator.confirm', params: {} }, requestId: 'method', method: null, expectedCode: 'INVALID_REQUEST' },
      {
        request: {
          apiVersion: '1', requestId: 'authority', method: 'proposal.submit',
          params: { idempotencyKey: 'k', cart: TEST_CART }, approvedBy: 'attacker', confirmedAt: TEST_CLOCK, now: TEST_CLOCK,
        },
        requestId: 'authority', method: 'proposal.submit', expectedCode: 'INVALID_REQUEST',
      },
      {
        request: {
          apiVersion: '1', requestId: 'clock', method: 'proposal.submit',
          params: { idempotencyKey: 'k', cart: TEST_CART, now: '2020-01-01T00:00:00Z' },
        },
        requestId: 'clock', method: 'proposal.submit', expectedCode: 'INVALID_REQUEST',
      },
      {
        request: {
          apiVersion: '1', requestId: 'snapshot', method: 'proposal.submit',
          params: { idempotencyKey: 'k', cart: TEST_CART, budgetSnapshot: { committedMinor: 0 } },
        },
        requestId: 'snapshot', method: 'proposal.submit', expectedCode: 'INVALID_REQUEST',
      },
      {
        request: {
          apiVersion: '1', requestId: 'quote', method: 'proposal.submit',
          params: { idempotencyKey: 'k', cart: TEST_CART, quote: { totalMinor: 1 } },
        },
        requestId: 'quote', method: 'proposal.submit', expectedCode: 'INVALID_REQUEST',
      },
      {
        request: {
          apiVersion: '1', requestId: 'priced-line', method: 'proposal.submit',
          params: {
            idempotencyKey: 'k',
            cart: { ...TEST_CART, lines: [{ ...TEST_CART.lines[0], priceMinor: 1 }] },
          },
        },
        requestId: 'priced-line', method: 'proposal.submit', expectedCode: 'INVALID_REQUEST',
      },
      { request: { apiVersion: '1', requestId: 'x'.repeat(300), method: 'mandate.get', params: { mandateId: TEST_MANDATE_DRAFT.id } }, requestId: null, method: 'mandate.get', expectedCode: 'INVALID_REQUEST' },
      { request: { apiVersion: '1', requestId: 'unapproved-supplier', method: 'proposal.submit', params: { idempotencyKey: 'k', cart: { ...TEST_CART, supplierId: 'store-b' } } }, requestId: 'unapproved-supplier', method: 'proposal.submit', expectedCode: 'SUPPLIER_UNAVAILABLE' },
      { request: { apiVersion: '1', requestId: 'ghost-mandate', method: 'proposal.submit', params: { idempotencyKey: 'k', cart: { ...TEST_CART, mandateId: 'ghost-mandate' } } }, requestId: 'ghost-mandate', method: 'proposal.submit', expectedCode: 'NOT_FOUND' },
      {
        request: {
          apiVersion: '1', requestId: 'too-many-lines', method: 'proposal.submit',
          params: {
            idempotencyKey: 'k',
            cart: {
              ...TEST_CART,
              lines: Array.from({ length: 101 }, (_, index) => ({
                requirementId: `r-${index}`, sku: 'LAP-14-AIR', quantity: 1,
              })),
            },
          },
        },
        requestId: 'too-many-lines', method: 'proposal.submit', expectedCode: 'INVALID_REQUEST',
      },
      {
        request: {
          apiVersion: '1', requestId: 'bad-quantity', method: 'proposal.submit',
          params: {
            idempotencyKey: 'k',
            cart: { ...TEST_CART, lines: [{ ...TEST_CART.lines[0], quantity: 0 }] },
          },
        },
        requestId: 'bad-quantity', method: 'proposal.submit', expectedCode: 'INVALID_REQUEST',
      },
      {
        request: {
          apiVersion: '1', requestId: 'scenario-key', method: 'proposal.submit',
          params: { idempotencyKey: 'k', cart: TEST_CART, scenario: { overrideAuthority: true } },
        },
        requestId: 'scenario-key', method: 'proposal.submit', expectedCode: 'INVALID_REQUEST',
      },
    ];
    for (const { request, requestId, method, expectedCode } of hostileCases) {
      const response = await harness.backend.handle(request);
      assert.equal(response.ok, false, JSON.stringify(request));
      assert.equal(response.simulation, true, 'failure envelopes stay simulation-labelled');
      assert.equal(response.requestId, requestId);
      assert.equal(response.method, method);
      // Sanitized messages only: no raw schemas, SQL or paths.
      if (!response.ok) {
        assert.equal(response.error.code, expectedCode);
        assert.doesNotMatch(response.error.message, /SELECT|INSERT|\.ts|node:|ZodError/);
      }
    }
  } finally {
    try { harness?.close(); } catch { /* cleanup is best-effort */ }
    try { removeTempDir(dir); } catch { /* cleanup is best-effort */ }
  }
});

test('evaluator outcomes map to the closed error codes with non-pass check codes', async () => {
  const fixture = fixtureAdapter();
  const expiredAdapter: ConfiguredSupplier['adapter'] = {
    async quoteCart(cart, now) {
      const quote = await fixture.quoteCart(cart, now);
      return { ...quote, expiresAt: '2026-11-03T00:00:00Z' };
    },
  };

  // BUDGET_EXCEEDED: mandate budget below the cart total.
  await (async () => {
    const caseDir = makeTempDir('app-evaluator-budget');
    const harness = setup(caseDir, { budgetMinor: 100000 });
    try {
      const outcome = await submit(harness.backend, 'budget-key', TEST_CART, 'budget');
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.error.code, 'BUDGET_EXCEEDED');
        assert.ok(outcome.error.details.checkCodes.includes('BUDGET'));
      }
    } finally {
      try { harness.close(); } catch { /* cleanup is best-effort */ }
      try { removeTempDir(caseDir); } catch { /* cleanup is best-effort */ }
    }
  })();

  // QUANTITY_EXCEEDED: cart exceeds the required units.
  await (async () => {
    const caseDir = makeTempDir('app-evaluator-quantity');
    const harness = setup(caseDir);
    try {
      const bigCart = CartSubmissionSchema.parse({
        ...TEST_CART,
        lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 6 }],
      });
      const outcome = await submit(harness.backend, 'quantity-key', bigCart, 'quantity');
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.error.code, 'QUANTITY_EXCEEDED');
        assert.ok(outcome.error.details.checkCodes.includes('QUANTITY:engineering-laptops'));
      }
    } finally {
      try { harness.close(); } catch { /* cleanup is best-effort */ }
      try { removeTempDir(caseDir); } catch { /* cleanup is best-effort */ }
    }
  })();

  // INELIGIBLE: catalog-priced SKU that the mandate requirement does not vet.
  await (async () => {
    const caseDir = makeTempDir('app-evaluator-ineligible');
    const harness = setup(caseDir);
    try {
      const foreignSku = CartSubmissionSchema.parse({
        ...TEST_CART,
        lines: [{ requirementId: 'engineering-laptops', sku: 'MON-27-USBC', quantity: 1 }],
      });
      const outcome = await submit(harness.backend, 'ineligible-key', foreignSku, 'ineligible');
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.error.code, 'INELIGIBLE');
        assert.ok(outcome.error.details.checkCodes.some((code) => code.startsWith('SKU:')));
      }
    } finally {
      try { harness.close(); } catch { /* cleanup is best-effort */ }
      try { removeTempDir(caseDir); } catch { /* cleanup is best-effort */ }
    }
  })();

  // QUOTE_EXPIRED: an expired quote from the trusted adapter.
  await (async () => {
    const caseDir = makeTempDir('app-evaluator-expired');
    const harness = setup(caseDir);
    let caseBackend: ReturnType<typeof createApplicationBackend> | null = null;
    try {
      caseBackend = createApplicationBackend({
        databasePath: `${caseDir}/ledger.db`,
        suppliers: [{ supplierId: 'store-a', catalog: TEST_CATALOG, adapter: expiredAdapter }],
        clock: () => TEST_CLOCK,
      });
      const outcome = await submit(caseBackend, 'expired-key', TEST_CART, 'expired');
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.error.code, 'QUOTE_EXPIRED');
        assert.ok(outcome.error.details.checkCodes.includes('QUOTE_TIMING'));
      }
    } finally {
      try { caseBackend?.close(); } catch { /* cleanup is best-effort */ }
      try { harness.close(); } catch { /* cleanup is best-effort */ }
      try { removeTempDir(caseDir); } catch { /* cleanup is best-effort */ }
    }
  })();

  // Priority: an over-budget cart with an expired quote reports BUDGET_EXCEEDED,
  // not whichever mapped failure happened to be pushed first.
  await (async () => {
    const caseDir = makeTempDir('app-evaluator-budget-expired');
    const harness = setup(caseDir, { budgetMinor: 100000 });
    let caseBackend: ReturnType<typeof createApplicationBackend> | null = null;
    try {
      caseBackend = createApplicationBackend({
        databasePath: `${caseDir}/ledger.db`,
        suppliers: [{ supplierId: 'store-a', catalog: TEST_CATALOG, adapter: expiredAdapter }],
        clock: () => TEST_CLOCK,
      });
      const outcome = await submit(caseBackend, 'combined-budget-key', TEST_CART, 'combined-budget');
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.error.code, 'BUDGET_EXCEEDED');
        assert.ok(outcome.error.details.checkCodes.includes('BUDGET'));
        assert.ok(outcome.error.details.checkCodes.includes('QUOTE_TIMING'));
      }
    } finally {
      try { caseBackend?.close(); } catch { /* cleanup is best-effort */ }
      try { harness.close(); } catch { /* cleanup is best-effort */ }
      try { removeTempDir(caseDir); } catch { /* cleanup is best-effort */ }
    }
  })();

  // Priority: an over-quantity cart with an expired quote reports QUANTITY_EXCEEDED.
  await (async () => {
    const caseDir = makeTempDir('app-evaluator-quantity-expired');
    const harness = setup(caseDir);
    let caseBackend: ReturnType<typeof createApplicationBackend> | null = null;
    try {
      caseBackend = createApplicationBackend({
        databasePath: `${caseDir}/ledger.db`,
        suppliers: [{ supplierId: 'store-a', catalog: TEST_CATALOG, adapter: expiredAdapter }],
        clock: () => TEST_CLOCK,
      });
      const bigCart = CartSubmissionSchema.parse({
        ...TEST_CART,
        lines: [{ requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 6 }],
      });
      const outcome = await submit(caseBackend, 'combined-quantity-key', bigCart, 'combined-quantity');
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.error.code, 'QUANTITY_EXCEEDED');
        assert.ok(outcome.error.details.checkCodes.includes('QUANTITY:engineering-laptops'));
        assert.ok(outcome.error.details.checkCodes.includes('QUOTE_TIMING'));
      }
    } finally {
      try { caseBackend?.close(); } catch { /* cleanup is best-effort */ }
      try { harness.close(); } catch { /* cleanup is best-effort */ }
      try { removeTempDir(caseDir); } catch { /* cleanup is best-effort */ }
    }
  })();

  // MANDATORY_EVIDENCE_UNKNOWN: unknown product evidence, no hard failure.
  await (async () => {
    const caseDir = makeTempDir('app-evaluator-evidence');
    const harness = setup(caseDir);
    let caseBackend: ReturnType<typeof createApplicationBackend> | null = null;
    try {
      const unknownEvidenceAdapter: ConfiguredSupplier['adapter'] = {
        async quoteCart(cart, now) {
          const quote = await fixture.quoteCart(cart, now);
          return {
            ...quote,
            lines: quote.lines.map((line) => ({
              ...line,
              productEvidence: { ...line.productEvidence, status: 'unknown' as const },
            })),
          };
        },
      };
      caseBackend = createApplicationBackend({
        databasePath: `${caseDir}/ledger.db`,
        suppliers: [{ supplierId: 'store-a', catalog: TEST_CATALOG, adapter: unknownEvidenceAdapter }],
        clock: () => TEST_CLOCK,
      });
      const outcome = await submit(caseBackend, 'evidence-key', TEST_CART, 'evidence');
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.error.code, 'MANDATORY_EVIDENCE_UNKNOWN');
        assert.ok(outcome.error.details.checkCodes.some((code) => code.startsWith('PRODUCT_EVIDENCE:')));
      }
      const operations = (harness.database.prepare('SELECT COUNT(*) AS total FROM operations').get() as { total: number }).total;
      assert.equal(operations, 0);
    } finally {
      try { caseBackend?.close(); } catch { /* cleanup is best-effort */ }
      try { harness.close(); } catch { /* cleanup is best-effort */ }
      try { removeTempDir(caseDir); } catch { /* cleanup is best-effort */ }
    }
  })();
});

test('state reopens from the same database file with authority and reservations intact', async () => {
  const dir = makeTempDir('app-reopen');
  try {
    const harness = setup(dir);
    let operationId: string;
    try {
      const first = await submit(harness.backend, 'reopen-key', TEST_CART, 'reopen-first');
      assert.equal(first.ok, true);
      if (!first.ok || first.method !== 'proposal.submit') assert.fail('expected success');
      operationId = first.result.operation.id;
    } finally {
      harness.close();
    }

    const reopened = setup(dir);
    try {
      const mandateRead = await reopened.backend.handle({
        apiVersion: '1', requestId: 'reopened-mandate', method: 'mandate.get',
        params: { mandateId: TEST_MANDATE_DRAFT.id },
      });
      if (mandateRead.ok && mandateRead.method === 'mandate.get') {
        assert.equal(mandateRead.result.mandate.approvedBy, APPROVER);
        assert.equal(mandateRead.result.mandate.confirmedAt, TEST_CLOCK);
        assert.equal(mandateRead.result.snapshot.reservedMinor, TEST_CART_TOTAL_MINOR);
      } else {
        assert.fail('expected reopened mandate');
      }
      const replay = await submit(reopened.backend, 'reopen-key', TEST_CART, 'reopened-replay');
      assert.equal(replay.ok && replay.method === 'proposal.submit' && replay.result.operation.id, operationId);
    } finally {
      reopened.close();
    }
  } finally {
    removeTempDir(dir);
  }
});
