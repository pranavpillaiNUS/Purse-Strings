/**
 * Company policy upload. Guardrails:
 * - No model ever reads an uploaded file. Parsing is deterministic (strict JSON matching
 *   PolicySchema, or a fixed-column CSV), so text inside a file cannot instruct anything.
 * - An upload only creates a PENDING version. It becomes active only when the operator
 *   confirms the exact digest. Every version is kept, so a rollback is another confirm.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { z } from 'zod';
import { PolicySchema, type Policy } from '../../../packages/contracts/src/index.ts';
import { sha256, type FileStore } from './file-store.ts';

export const MAX_UPLOAD_BYTES = 256 * 1024;
/** Server-side ceiling: an uploaded file can never raise the budget above this. */
export const MAX_UPLOAD_BUDGET_MINOR = 10_000_000; // S$100,000
const SAFE_ID = /^[A-Za-z0-9-]{1,40}$/;

export class PolicyUploadError extends Error {
  readonly code: 'too_large' | 'bad_format' | 'invalid' | 'stale_digest' | 'not_found';
  constructor(code: PolicyUploadError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export type PolicyFormat = 'json' | 'csv';

/** CSV columns, in this exact order. One row per role; policy-wide fields repeat per row. */
export const CSV_HEADER = 'policy_id,currency,max_budget_minor,allowed_suppliers,evidence_max_age_hours,role,allowed_skus,max_unit_price_minor,min_warranty_months,max_units';

function intField(value: string, name: string): number {
  if (!/^\d{1,10}$/.test(value)) throw new PolicyUploadError('invalid', `${name} must be a whole number of minor units or units`);
  return Number(value);
}

function list(value: string): string[] {
  return value.split(';').map((item) => item.trim()).filter(Boolean);
}

function parseCsv(text: string): unknown {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== CSV_HEADER) throw new PolicyUploadError('bad_format', `CSV header must be exactly: ${CSV_HEADER}`);
  const roles: Record<string, unknown> = {};
  let head: string[] | undefined;
  for (const line of lines.slice(1)) {
    if (line.includes('"')) throw new PolicyUploadError('bad_format', 'Quoted CSV fields are not accepted; separate lists with ";"');
    const cells = line.split(',');
    if (cells.length !== 10) throw new PolicyUploadError('bad_format', 'Every CSV row needs exactly 10 columns');
    const [policyId, currency, budget, suppliers, evidence, role, skus, price, warranty, units] = cells as [string, string, string, string, string, string, string, string, string, string];
    const shared = [policyId, currency, budget, suppliers, evidence];
    if (head && shared.some((cell, i) => cell !== head![i])) throw new PolicyUploadError('invalid', 'Policy-wide columns must match on every row');
    head = shared;
    if (role in roles) throw new PolicyUploadError('invalid', `Role ${role} appears twice`);
    roles[role] = {
      allowedSkus: list(skus),
      maxUnitPriceMinor: intField(price, 'max_unit_price_minor'),
      minWarrantyMonths: intField(warranty, 'min_warranty_months'),
      maxUnits: intField(units, 'max_units'),
    };
  }
  if (!head) throw new PolicyUploadError('invalid', 'CSV has no role rows');
  const [id, currency, budget, suppliers, evidence] = head as [string, string, string, string, string];
  return {
    id, version: 1, currency,
    maxBudgetMinor: intField(budget, 'max_budget_minor'),
    allowedSuppliers: list(suppliers),
    evidenceMaxAgeHours: intField(evidence, 'evidence_max_age_hours'),
    roles,
  };
}

/** Parse and validate an uploaded policy. `version` is assigned by the store, not the file. */
export function parsePolicyUpload(bytes: Buffer, format: PolicyFormat, knownSuppliers: readonly string[]): Omit<Policy, 'version'> {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new PolicyUploadError('too_large', `Policy files are limited to ${MAX_UPLOAD_BYTES / 1024} KB`);
  const text = bytes.toString('utf8');
  if (text.includes('\u0000')) throw new PolicyUploadError('bad_format', 'Binary files are not accepted');
  let raw: unknown;
  if (format === 'json') {
    try { raw = JSON.parse(text); } catch { throw new PolicyUploadError('bad_format', 'File is not valid JSON'); }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) raw = { ...raw, version: 1 };
  } else {
    raw = parseCsv(text);
  }
  const parsed = PolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new PolicyUploadError('invalid', `Policy does not match the schema: ${z.prettifyError(parsed.error)}`);
  }
  const policy = parsed.data;
  const ids = [policy.id, ...policy.allowedSuppliers, ...policy.roles.laptop.allowedSkus, ...policy.roles.monitor.allowedSkus];
  const bad = ids.find((value) => !SAFE_ID.test(value));
  if (bad !== undefined) throw new PolicyUploadError('invalid', 'Ids may only use letters, digits and "-" (max 40 characters)');
  const unknown = policy.allowedSuppliers.find((supplier) => !knownSuppliers.includes(supplier));
  if (unknown) throw new PolicyUploadError('invalid', `Unknown supplier ${unknown}; only configured suppliers can be allowed`);
  if (policy.maxBudgetMinor > MAX_UPLOAD_BUDGET_MINOR) throw new PolicyUploadError('invalid', `Budget exceeds the ceiling of ${MAX_UPLOAD_BUDGET_MINOR} minor units`);
  const { version: _ignored, ...rest } = policy;
  return rest;
}

export type PolicyChange = { field: string; from: unknown; to: unknown; loosens: boolean };

/** What would change if `next` replaced `current`. `loosens` marks anything that widens authority. */
export function diffPolicies(current: Policy, next: Omit<Policy, 'version'>): PolicyChange[] {
  const changes: PolicyChange[] = [];
  const num = (field: string, from: number, to: number, higherLoosens = true) => {
    if (from !== to) changes.push({ field, from, to, loosens: higherLoosens ? to > from : to < from });
  };
  const set = (field: string, from: string[], to: string[]) => {
    const added = to.filter((item) => !from.includes(item));
    const removed = from.filter((item) => !to.includes(item));
    if (added.length) changes.push({ field: `${field} added`, from: null, to: added, loosens: true });
    if (removed.length) changes.push({ field: `${field} removed`, from: removed, to: null, loosens: false });
  };
  if (current.id !== next.id) changes.push({ field: 'id', from: current.id, to: next.id, loosens: false });
  num('maxBudgetMinor', current.maxBudgetMinor, next.maxBudgetMinor);
  set('allowedSuppliers', current.allowedSuppliers, next.allowedSuppliers);
  num('evidenceMaxAgeHours', current.evidenceMaxAgeHours, next.evidenceMaxAgeHours);
  for (const role of ['laptop', 'monitor'] as const) {
    const a = current.roles[role];
    const b = next.roles[role];
    set(`${role}.allowedSkus`, a.allowedSkus, b.allowedSkus);
    num(`${role}.maxUnitPriceMinor`, a.maxUnitPriceMinor, b.maxUnitPriceMinor);
    num(`${role}.minWarrantyMonths`, a.minWarrantyMonths, b.minWarrantyMonths, false);
    num(`${role}.maxUnits`, a.maxUnits, b.maxUnits);
  }
  return changes;
}

export function policyDigest(policy: Policy): string {
  // Hash in schema key order so the same policy always yields the same digest.
  return sha256(JSON.stringify(PolicySchema.parse(policy)));
}

type VersionRecord = { version: number; digest: string; fileKey: string; uploadedAt: string };
type Registry = {
  versions: VersionRecord[];
  pending?: number;
  active?: { version: number; digest: string; confirmedBy: string; confirmedAt: string };
};

export type PolicyView = { policy: Policy; digest: string };
export type PendingView = PolicyView & { changes: PolicyChange[] };

/** Versioned pending → active policy store. The bundled policy is the fallback when nothing is active. */
export class PolicyRegistry {
  private readonly directory: string;
  private readonly fallbackPath: string;
  private readonly files: FileStore;
  private readonly clock: () => Date;
  private readonly operator: () => string;

  constructor(options: { directory: string; fallbackPath: string; files: FileStore; clock?: () => Date; operator?: () => string }) {
    this.directory = options.directory;
    this.fallbackPath = options.fallbackPath;
    this.files = options.files;
    this.clock = options.clock ?? (() => new Date());
    this.operator = options.operator ?? (() => userInfo().username);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  private registryPath() { return join(this.directory, 'registry.json'); }
  private policyPath(version: number) { return join(this.directory, `v${version}.json`); }

  private read(): Registry {
    const path = this.registryPath();
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Registry : { versions: [] };
  }

  private write(registry: Registry): void {
    const tmp = `${this.registryPath()}.tmp`;
    writeFileSync(tmp, JSON.stringify(registry, null, 2), { mode: 0o600 });
    renameSync(tmp, this.registryPath());
  }

  private load(version: number): Policy {
    return PolicySchema.parse(JSON.parse(readFileSync(this.policyPath(version), 'utf8')));
  }

  private loadVerified(version: number, digest: string): Policy {
    const policy = this.load(version);
    if (policyDigest(policy) !== digest) {
      throw new PolicyUploadError('stale_digest', 'The stored policy changed; upload and review it again');
    }
    return policy;
  }

  /** The policy every command should use right now. */
  active(): PolicyView {
    const registry = this.read();
    const policy = registry.active ? this.loadVerified(registry.active.version, registry.active.digest) : PolicySchema.parse(JSON.parse(readFileSync(this.fallbackPath, 'utf8')));
    return { policy, digest: policyDigest(policy) };
  }

  /** Path to the active policy file, for commands that take `--policy FILE`. */
  activePath(): string {
    const registry = this.read();
    if (!registry.active) return this.fallbackPath;
    this.loadVerified(registry.active.version, registry.active.digest);
    return this.policyPath(registry.active.version);
  }

  pending(): PendingView | undefined {
    const registry = this.read();
    if (registry.pending === undefined) return undefined;
    const policy = this.load(registry.pending);
    const { version: _v, ...rest } = policy;
    return { policy, digest: policyDigest(policy), changes: diffPolicies(this.active().policy, rest) };
  }

  upload(bytes: Buffer, format: PolicyFormat, knownSuppliers: readonly string[]): PendingView {
    const parsed = parsePolicyUpload(bytes, format, knownSuppliers);
    const registry = this.read();
    const highest = Math.max(this.active().policy.version, ...registry.versions.map((record) => record.version));
    const policy: Policy = { ...parsed, version: highest + 1 };
    const fileKey = this.files.put(bytes);
    writeFileSync(this.policyPath(policy.version), JSON.stringify(policy, null, 2), { mode: 0o600 });
    const digest = policyDigest(policy);
    registry.versions.push({ version: policy.version, digest, fileKey, uploadedAt: this.clock().toISOString() });
    registry.pending = policy.version;
    this.write(registry);
    return this.pending()!;
  }

  /** Activate the pending version, only if the operator confirmed exactly this digest. */
  activate(digest: string): PolicyView {
    const registry = this.read();
    const record = registry.versions.find((entry) => entry.version === registry.pending);
    if (!record) throw new PolicyUploadError('not_found', 'There is no pending policy to confirm');
    if (record.digest !== digest) throw new PolicyUploadError('stale_digest', 'The pending policy changed; review it again before confirming');
    this.loadVerified(record.version, digest);
    registry.active = { version: record.version, digest, confirmedBy: this.operator(), confirmedAt: this.clock().toISOString() };
    delete registry.pending;
    this.write(registry);
    return this.active();
  }

  discardPending(): void {
    const registry = this.read();
    delete registry.pending;
    this.write(registry);
  }
}
