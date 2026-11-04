import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  BackendErrorResponseSchema,
  BackendRequestSchema,
  BackendResponseSchema,
  CatalogListResultSchema,
  MandateGetResultSchema,
  OperationGetResultSchema,
  OperationSchema,
  ProposalSubmitResultSchema,
} from './backend.ts';
import {
  BudgetSnapshotSchema,
  CatalogSchema,
  CartSubmissionSchema,
  MandateSchema,
} from './index.ts';

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
}

const mandate = MandateSchema.parse(load('examples/mandate.json'));
const snapshot = BudgetSnapshotSchema.parse(load('examples/budget-snapshot.json'));
const catalog = CatalogSchema.parse(load('services/suppliers/fixtures/store-a.json'));
const cart = CartSubmissionSchema.parse(load('examples/cart.json'));

const operation = {
  id: 'operation-1',
  mandateId: cart.mandateId,
  mandateVersion: cart.mandateVersion,
  cartId: cart.id,
  supplierId: cart.supplierId,
  status: 'reserved',
  currency: 'SGD',
  totalMinor: 359373,
  createdAt: '2026-11-04T09:00:00Z',
  updatedAt: '2026-11-04T09:00:00Z',
  reservationStatus: 'active',
  paymentStatus: 'not_started',
  orderStatus: 'not_started',
  refundStatus: 'not_started',
  readinessStatus: 'not_assessed',
};

test('accepts all four strict v1 shopping requests and their result shapes', () => {
  const requests = [
    { apiVersion: '1', requestId: 'req-1', method: 'mandate.get', params: { mandateId: mandate.id } },
    {
      apiVersion: '1', requestId: 'req-2', method: 'catalog.list',
      params: { mandateId: mandate.id, mandateVersion: mandate.version, supplierId: catalog.supplierId },
    },
    { apiVersion: '1', requestId: 'req-3', method: 'proposal.submit', params: { idempotencyKey: 'key-1', cart } },
    {
      apiVersion: '1', requestId: 'req-4', method: 'operation.get',
      params: { mandateId: mandate.id, mandateVersion: mandate.version, operationId: operation.id },
    },
  ];

  assert.deepEqual(requests.map((request) => BackendRequestSchema.parse(request).method), [
    'mandate.get', 'catalog.list', 'proposal.submit', 'operation.get',
  ]);
  assert.doesNotThrow(() => MandateGetResultSchema.parse({ mandate, snapshot }));
  assert.doesNotThrow(() => CatalogListResultSchema.parse({
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    catalog,
  }));
  assert.doesNotThrow(() => ProposalSubmitResultSchema.parse({ operation }));
  assert.doesNotThrow(() => OperationGetResultSchema.parse({ operation }));
});

test('rejects unsupported methods and API versions', () => {
  assert.equal(BackendRequestSchema.safeParse({
    apiVersion: '1', requestId: 'req-1', method: 'operator.confirm', params: {},
  }).success, false);
  assert.equal(BackendRequestSchema.safeParse({
    apiVersion: '2', requestId: 'req-1', method: 'mandate.get', params: { mandateId: mandate.id },
  }).success, false);
});

test('rejects extra authority, price, clock and unknown envelope fields', () => {
  const valid = {
    apiVersion: '1', requestId: 'req-1', method: 'proposal.submit',
    params: { idempotencyKey: 'key-1', cart },
  };
  const extraFields: unknown[] = [
    { ...valid, approvedBy: 'operator-1' },
    { ...valid, now: '2026-11-04T09:00:00Z' },
    { ...valid, params: { ...valid.params, budgetSnapshot: snapshot } },
    { ...valid, params: { ...valid.params, quote: { totalMinor: 100 } } },
    {
      ...valid,
      params: {
        ...valid.params,
        cart: { ...cart, lines: [{ ...cart.lines[0], priceMinor: 100 }] },
      },
    },
  ];

  for (const request of extraFields) {
    assert.equal(BackendRequestSchema.safeParse(request).success, false);
  }
});

test('operation wire schema has only documented public fields and statuses', () => {
  assert.deepEqual(OperationSchema.parse(operation), operation);
  assert.equal(OperationSchema.safeParse({ ...operation, providerId: 'private-provider-id' }).success, false);
  assert.equal(OperationSchema.safeParse({ ...operation, status: 'paid' }).success, false);
  assert.equal(OperationSchema.safeParse({ ...operation, paymentStatus: 'captured' }).success, false);
});

test('parses strict labelled success and bounded error envelopes', () => {
  assert.equal(BackendResponseSchema.parse({
    apiVersion: '1',
    requestId: 'req-1',
    method: 'proposal.submit',
    simulation: true,
    ok: true,
    result: { operation },
  }).ok, true);

  const error = {
    apiVersion: '1',
    requestId: null,
    method: null,
    simulation: true,
    ok: false,
    error: { code: 'INVALID_REQUEST', message: 'Request was invalid', details: { checkCodes: [] } },
  };
  assert.equal(BackendErrorResponseSchema.parse(error).ok, false);
  assert.equal(BackendErrorResponseSchema.safeParse({
    ...error,
    error: { ...error.error, message: 'x'.repeat(501) },
  }).success, false);
  assert.equal(BackendErrorResponseSchema.safeParse({
    ...error,
    error: { ...error.error, extra: 'not allowed' },
  }).success, false);
  assert.equal(BackendResponseSchema.safeParse({
    apiVersion: '1',
    requestId: 'req-1',
    method: 'proposal.submit',
    simulation: false,
    ok: true,
    result: { operation },
  }).success, false);
});

test('backend contract imports and validates in a fresh Node process', () => {
  const entrypoint = new URL('./backend.ts', import.meta.url).href;
  const source = `
    import { BackendRequestSchema } from ${JSON.stringify(entrypoint)};
    const result = BackendRequestSchema.safeParse({
      apiVersion: '1', requestId: 'fresh-process', method: 'mandate.get',
      params: { mandateId: 'mandate-1' },
    });
    if (!result.success) process.exitCode = 1;
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});
