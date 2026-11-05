import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PolicySchema, MandateSchema, CartSubmissionSchema, BudgetSnapshotSchema, EvaluationInputSchema,
} from '../../../packages/contracts/src/index.ts';
import { createFixtureSupplier } from '../../../services/suppliers/src/fixture.ts';
import type { EvaluationInput } from '../../../packages/contracts/src/index.ts';

export const DEMO_NOW = '2026-11-03T09:00:00Z';
export interface InputOptions {
  policy?: string;
  mandate?: string;
  request?: string;
  snapshot?: string;
  catalog?: string;
  now?: string;
}

function readJson(override: string | undefined, bundledPath: string): unknown {
  const path = override ?? fileURLToPath(new URL(`../../../${bundledPath}`, import.meta.url));
  // Windows PowerShell's UTF-8 Set-Content may write a BOM; it is not part of JSON content.
  return JSON.parse(readFileSync(path === '-' ? 0 : path, 'utf8').replace(/^﻿/, ''));
}

/** Local offline experiments only: files do not establish real execution authority. */
export async function loadInput(options: InputOptions): Promise<EvaluationInput> {
  const now = EvaluationInputSchema.shape.now.parse(options.now ?? new Date().toISOString());
  const policy = PolicySchema.parse(readJson(options.policy, 'config/policies/hardware.example.json'));
  const mandate = MandateSchema.parse(readJson(options.mandate, 'examples/mandate.json'));
  const submission = CartSubmissionSchema.parse(readJson(options.request, 'examples/cart.json'));
  const snapshot = BudgetSnapshotSchema.parse(readJson(options.snapshot, 'examples/budget-snapshot.json'));
  const supplier = createFixtureSupplier(readJson(options.catalog, 'services/suppliers/fixtures/store-a.json'));
  return { policy, mandate, submission, snapshot, quote: await supplier.quoteCart(submission, now), now };
}
