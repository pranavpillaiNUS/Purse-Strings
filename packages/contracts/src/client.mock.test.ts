import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  BackendRequestSchema,
  BackendResponseSchema,
  type BackendRequest,
  type BackendResponse,
} from './backend.ts';
import { BackendProtocolError, createBackendClient } from './client.ts';
import { createMockBackend } from './mock.ts';
import { createFixtureSupplier } from '../../../services/suppliers/src/fixture.ts';
import {
  CatalogSchema,
  CartSubmissionSchema,
  MandateSchema,
} from './index.ts';

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
}

const mandate = MandateSchema.parse(load('examples/mandate.json'));
const catalog = CatalogSchema.parse(load('services/suppliers/fixtures/store-a.json'));
const cartBase = CartSubmissionSchema.parse(load('examples/cart.json'));
const cart = CartSubmissionSchema.parse({
  ...cartBase,
  lines: [
    { requirementId: 'engineering-laptops', sku: 'LAP-14-AIR', quantity: 2 },
    { requirementId: 'engineering-monitors', sku: 'MON-27-USBC', quantity: 1 },
  ],
});

function createMock() {
  return createMockBackend({ mandates: [mandate], catalogs: [catalog] });
}

function success(request: BackendRequest, result: unknown): BackendResponse {
  return BackendResponseSchema.parse({
    apiVersion: '1', requestId: request.requestId, method: request.method,
    simulation: true, ok: true, result,
  });
}

test('client validates requests, response schemas, and exact correlation', async () => {
  let sent: BackendRequest | undefined;
  const client = createBackendClient(async (request) => {
    sent = request;
    return success(request, {
      mandate,
      snapshot: {
        mandateId: mandate.id,
        mandateVersion: mandate.version,
        currency: 'SGD',
        committedMinor: 0,
        reservedMinor: 0,
        quantities: [],
      },
    });
  });
  const request = {
    apiVersion: '1', requestId: 'client-request-1', method: 'mandate.get',
    params: { mandateId: mandate.id },
  } satisfies BackendRequest;

  const response = await client.request(request);
  assert.equal(sent?.requestId, request.requestId);
  assert.equal(response.ok, true);

  const mismatchClient = createBackendClient(async (validRequest) => success({
    ...validRequest,
    requestId: 'another-request',
  }, {
    mandate,
    snapshot: {
      mandateId: mandate.id,
      mandateVersion: mandate.version,
      currency: 'SGD',
      committedMinor: 0,
      reservedMinor: 0,
      quantities: [],
    },
  }));
  await assert.rejects(mismatchClient.request(request), BackendProtocolError);

  const malformedClient = createBackendClient(async () => ({ ok: true, method: 'mandate.get' }));
  await assert.rejects(malformedClient.request(request));
});

test('mock serves discovery, submission, and owned operation reads through the client', async () => {
  const mock = createMock();
  const client = createBackendClient((request) => mock.handle(request));
  const mandateResponse = await client.request({
    apiVersion: '1', requestId: 'mandate-read', method: 'mandate.get',
    params: { mandateId: mandate.id },
  });
  assert.equal(mandateResponse.ok && mandateResponse.method === 'mandate.get' && mandateResponse.result.snapshot.reservedMinor, 0);

  const catalogResponse = await client.request({
    apiVersion: '1', requestId: 'catalog-read', method: 'catalog.list',
    params: { mandateId: mandate.id, mandateVersion: mandate.version, supplierId: catalog.supplierId },
  });
  assert.equal(catalogResponse.ok && catalogResponse.method === 'catalog.list' && catalogResponse.result.catalog.supplierId, catalog.supplierId);

  const submission = await client.request({
    apiVersion: '1', requestId: 'proposal-submit', method: 'proposal.submit',
    params: { idempotencyKey: 'proposal-key', cart },
  });
  assert.equal(submission.ok, true);
  if (!submission.ok || submission.method !== 'proposal.submit') assert.fail('Expected a proposal operation');
  assert.equal(submission.result.operation.status, 'reserved');
  assert.equal(submission.result.operation.readinessStatus, 'not_assessed');

  const read = await client.request({
    apiVersion: '1', requestId: 'operation-read', method: 'operation.get',
    params: {
      mandateId: mandate.id,
      mandateVersion: mandate.version,
      operationId: submission.result.operation.id,
    },
  });
  assert.equal(read.ok && read.method === 'operation.get' && read.result.operation.id, submission.result.operation.id);

  const wrongOwner = await client.request({
    apiVersion: '1', requestId: 'wrong-owner', method: 'operation.get',
    params: {
      mandateId: mandate.id,
      mandateVersion: mandate.version + 1,
      operationId: submission.result.operation.id,
    },
  });
  assert.equal(wrongOwner.ok, false);
  if (wrongOwner.ok) assert.fail('Expected ownership mismatch to fail');
  assert.equal(wrongOwner.error.code, 'NOT_FOUND');
});

test('mock projected total matches the fixture quote when shipping is taxable', async () => {
  const shippingCatalog = CatalogSchema.parse({ ...catalog, shippingMinor: 101 });
  const now = '2026-11-04T00:00:00.000Z';
  const quote = await createFixtureSupplier(shippingCatalog).quoteCart(cart, now);
  const mock = createMockBackend({ mandates: [mandate], catalogs: [shippingCatalog] });
  const response = await mock.handle({
    apiVersion: '1', requestId: 'shipping-tax', method: 'proposal.submit',
    params: { idempotencyKey: 'shipping-tax-key', cart },
  });

  assert.equal(response.ok, true);
  if (!response.ok || response.method !== 'proposal.submit') assert.fail('Expected proposal success');
  assert.equal(response.result.operation.totalMinor, quote.totalMinor);
});

test('cart identity and idempotency aliases replay canonically across line order', async () => {
  const mock = createMock();
  const first = await mock.handle({
    apiVersion: '1', requestId: 'first', method: 'proposal.submit',
    params: { idempotencyKey: 'alias-one', cart },
  });
  assert.equal(first.ok, true);
  if (!first.ok || first.method !== 'proposal.submit') assert.fail('Expected first proposal success');

  const reorderedCart = CartSubmissionSchema.parse({ ...cart, lines: [...cart.lines].reverse() });
  const differentAlias = await mock.handle({
    apiVersion: '1', requestId: 'second', method: 'proposal.submit',
    params: { idempotencyKey: 'alias-two', cart: reorderedCart },
  });
  assert.equal(differentAlias.ok, true);
  if (!differentAlias.ok || differentAlias.method !== 'proposal.submit') assert.fail('Expected alias replay');
  assert.equal(differentAlias.result.operation.id, first.result.operation.id);

  const aliasReplay = await mock.handle({
    apiVersion: '1', requestId: 'third', method: 'proposal.submit',
    params: { idempotencyKey: 'alias-two', cart },
  });
  assert.equal(aliasReplay.ok, true);
  if (!aliasReplay.ok || aliasReplay.method !== 'proposal.submit') assert.fail('Expected key replay');
  assert.equal(aliasReplay.result.operation.id, first.result.operation.id);
});

test('changed cart identity/version and key reuse conflict without binding a failed alias', async () => {
  const mock = createMock();
  const first = await mock.handle({
    apiVersion: '1', requestId: 'first', method: 'proposal.submit',
    params: { idempotencyKey: 'original-key', cart },
  });
  assert.equal(first.ok, true);

  const changedQuantity = CartSubmissionSchema.parse({
    ...cart,
    lines: cart.lines.map((line) => ({ ...line, quantity: line.quantity + 1 })),
  });
  const changedPayload = await mock.handle({
    apiVersion: '1', requestId: 'changed', method: 'proposal.submit',
    params: { idempotencyKey: 'unbound-key', cart: changedQuantity },
  });
  assert.equal(changedPayload.ok, false);
  if (changedPayload.ok) assert.fail('Expected changed cart conflict');
  assert.equal(changedPayload.error.code, 'IDEMPOTENCY_CONFLICT');

  const differentVersion = CartSubmissionSchema.parse({ ...cart, mandateVersion: cart.mandateVersion + 1 });
  const versionConflict = await mock.handle({
    apiVersion: '1', requestId: 'version', method: 'proposal.submit',
    params: { idempotencyKey: 'unused-version-key', cart: differentVersion },
  });
  assert.equal(versionConflict.ok, false);
  if (versionConflict.ok) assert.fail('Expected immutable cart version conflict');
  assert.equal(versionConflict.error.code, 'IDEMPOTENCY_CONFLICT');

  const newCart = CartSubmissionSchema.parse({ ...cart, id: 'different-cart' });
  const keyReuse = await mock.handle({
    apiVersion: '1', requestId: 'key-reuse', method: 'proposal.submit',
    params: { idempotencyKey: 'original-key', cart: newCart },
  });
  assert.equal(keyReuse.ok, false);
  if (keyReuse.ok) assert.fail('Expected idempotency key reuse conflict');
  assert.equal(keyReuse.error.code, 'IDEMPOTENCY_CONFLICT');

  const unboundKeyCanBeUsed = await mock.handle({
    apiVersion: '1', requestId: 'unbound-check', method: 'proposal.submit',
    params: { idempotencyKey: 'unbound-key', cart: newCart },
  });
  assert.equal(unboundKeyCanBeUsed.ok, true);
});

test('mock rejects invalid envelopes, unsupported versions, and extra authority or scenario fields', async () => {
  const mock = createMock();
  const cases: Array<{ request: unknown; code: string; method: string | null }> = [
    {
      request: { apiVersion: '2', requestId: 'version-check', method: 'mandate.get', params: { mandateId: mandate.id } },
      code: 'UNSUPPORTED_VERSION', method: 'mandate.get',
    },
    {
      request: { apiVersion: '1', requestId: 'method-check', method: 'operator.confirm', params: {} },
      code: 'INVALID_REQUEST', method: null,
    },
    {
      request: { apiVersion: '1', requestId: 'extra-authority', method: 'mandate.get', params: { mandateId: mandate.id }, approvedBy: 'someone' },
      code: 'INVALID_REQUEST', method: 'mandate.get',
    },
    {
      request: { apiVersion: '1', requestId: 'extra-clock', method: 'mandate.get', params: { mandateId: mandate.id, now: '2026-11-04T00:00:00.000Z' } },
      code: 'INVALID_REQUEST', method: 'mandate.get',
    },
    {
      request: { apiVersion: '1', requestId: 'extra-price', method: 'proposal.submit', params: { idempotencyKey: 'x', cart: { ...cart, priceMinor: 1 } } },
      code: 'INVALID_REQUEST', method: 'proposal.submit',
    },
  ];
  for (const { request, code, method } of cases) {
    const response = await mock.handle(request);
    assert.equal(response.ok, false);
    if (response.ok) assert.fail('Expected invalid request response');
    assert.equal(response.error.code, code);
    assert.equal(response.method, method);
  }
});

test('mock returns defensive copies and retains no caller-owned mutable references', async () => {
  const inputMandate = structuredClone(mandate);
  const inputCatalog = structuredClone(catalog);
  const mock = createMockBackend({ mandates: [inputMandate], catalogs: [inputCatalog] });
  inputMandate.allowedSuppliers.length = 0;
  inputCatalog.products[0]!.unitPriceMinor = 1;

  const mandateResponse = await mock.handle({
    apiVersion: '1', requestId: 'copy-mandate', method: 'mandate.get',
    params: { mandateId: mandate.id },
  });
  assert.equal(mandateResponse.ok && mandateResponse.method === 'mandate.get' && mandateResponse.result.mandate.allowedSuppliers.length, 1);

  const submitted = await mock.handle({
    apiVersion: '1', requestId: 'copy-proposal', method: 'proposal.submit',
    params: { idempotencyKey: 'copy-key', cart },
  });
  assert.equal(submitted.ok, true);
  if (!submitted.ok || submitted.method !== 'proposal.submit') assert.fail('Expected proposal success');
  const originalTotal = submitted.result.operation.totalMinor;
  submitted.result.operation.totalMinor = 0;
  submitted.result.operation.status = 'failed';

  const repeated = await mock.handle({
    apiVersion: '1', requestId: 'copy-replay', method: 'proposal.submit',
    params: { idempotencyKey: 'copy-key', cart },
  });
  assert.equal(repeated.ok && repeated.method === 'proposal.submit' && repeated.result.operation.totalMinor, originalTotal);
  assert.equal(repeated.ok && repeated.method === 'proposal.submit' && repeated.result.operation.status, 'reserved');
});

test('mock construction rejects duplicate fixture identities', () => {
  assert.throws(() => createMockBackend({ mandates: [mandate, mandate], catalogs: [catalog] }));
  assert.throws(() => createMockBackend({ mandates: [mandate], catalogs: [catalog, catalog] }));
});

test('client and mock entrypoints import and run first in fresh Node processes', () => {
  const clientUrl = new URL('./client.ts', import.meta.url).href;
  const mockUrl = new URL('./mock.ts', import.meta.url).href;
  const mandateJson = JSON.stringify(mandate);
  const catalogJson = JSON.stringify(catalog);
  const cartJson = JSON.stringify(cart);
  const scripts = [
    `
      import { createBackendClient } from ${JSON.stringify(clientUrl)};
      const client = createBackendClient(async (request) => ({
        apiVersion: '1', requestId: request.requestId, method: request.method,
        simulation: true, ok: true,
        result: { mandate: ${mandateJson}, snapshot: {
          mandateId: ${JSON.stringify(mandate.id)}, mandateVersion: ${mandate.version}, currency: 'SGD',
          committedMinor: 0, reservedMinor: 0, quantities: [],
        } },
      }));
      const response = await client.request({ apiVersion: '1', requestId: 'fresh-client', method: 'mandate.get', params: { mandateId: ${JSON.stringify(mandate.id)} } });
      if (!response.ok) process.exitCode = 1;
    `,
    `
      import { createMockBackend } from ${JSON.stringify(mockUrl)};
      const mock = createMockBackend({ mandates: [${mandateJson}], catalogs: [${catalogJson}] });
      const response = await mock.handle({ apiVersion: '1', requestId: 'fresh-mock', method: 'proposal.submit', params: { idempotencyKey: 'fresh-key', cart: ${cartJson} } });
      if (!response.ok) process.exitCode = 1;
    `,
  ];
  for (const source of scripts) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
  }
});

test('client rejects invalid requests before calling the transport', async () => {
  let called = false;
  const client = createBackendClient(async () => {
    called = true;
    return {};
  });
  const invalid = {
    apiVersion: '1', requestId: 'bad-client-input', method: 'mandate.get',
    params: { mandateId: mandate.id, now: '2026-11-04T00:00:00.000Z' },
  };
  assert.equal(BackendRequestSchema.safeParse(invalid).success, false);
  await assert.rejects(() => Reflect.apply(client.request, client, [invalid]));
  assert.equal(called, false);
});
