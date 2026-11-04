import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MandateSchema, PolicySchema } from '../../../packages/contracts/src/index.ts';
import { contentDigest, createMandateDraft, reviewMandateDraft } from './mandate.ts';

const now = '2026-11-04T09:00:00Z';
const policy = PolicySchema.parse(JSON.parse(readFileSync(
  new URL('../../../config/policies/hardware.example.json', import.meta.url), 'utf8',
)));
const request = JSON.parse(readFileSync(new URL('../fixtures/hire-request.json', import.meta.url), 'utf8'));
const kit = JSON.parse(readFileSync(new URL('../fixtures/engineering-kit.json', import.meta.url), 'utf8'));

test('five hires produce five exact-SKU kits with policy caps, stable provenance and no confirmation', () => {
  const original = structuredClone({ policy, request, kit });
  const draft = createMandateDraft(policy, request, kit, now);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.createdAt, now);
  assert.equal(draft.policyDigest, contentDigest(policy));
  assert.deepEqual(draft.request, request);
  assert.deepEqual(draft.kit, kit);
  assert.deepEqual(draft.proposal.requirements.map((line) => [line.role, line.quantity, line.allowedSkus]), [
    ['laptop', 5, ['LAP-14-AIR']], ['monitor', 5, ['MON-27-USBC']],
  ]);
  assert.equal(draft.proposal.requirements[0]!.maxUnitPriceMinor, policy.roles.laptop.maxUnitPriceMinor);
  assert.equal(draft.proposal.requirements[0]!.minWarrantyMonths, policy.roles.laptop.minWarrantyMonths);
  assert.equal(MandateSchema.safeParse(draft).success, false);
  assert.equal(MandateSchema.safeParse(draft.proposal).success, false);
  assert.equal('approvedBy' in draft.proposal, false);
  assert.equal('confirmedAt' in draft.proposal, false);
  assert.deepEqual(createMandateDraft(policy, request, kit, now), draft);
  assert.deepEqual({ policy, request, kit }, original);
  assert.equal(reviewMandateDraft(draft, policy, kit, now).decision, 'draft_valid');
});

test('kit limits may narrow policy and units per hire determine the requested quantity', () => {
  const narrowerKit = structuredClone(kit);
  narrowerKit.lines[0].maxUnitPriceMinor = 110000;
  narrowerKit.lines[0].minWarrantyMonths = 36;
  narrowerKit.lines[1].unitsPerHire = 2;
  const draft = createMandateDraft(policy, request, narrowerKit, now);
  assert.equal(draft.proposal.budgetMinor, 800000);
  assert.deepEqual(draft.proposal.allowedSuppliers, ['store-a']);
  assert.equal(draft.proposal.requirements[0]!.maxUnitPriceMinor, 110000);
  assert.equal(draft.proposal.requirements[0]!.minWarrantyMonths, 36);
  assert.equal(draft.proposal.requirements[1]!.quantity, 10);
});

test('requests cannot relax policy, invent authority or silently reuse unassigned stock', () => {
  for (const patch of [
    { budgetMinor: policy.maxBudgetMinor + 1 }, { allowedSuppliers: ['unapproved'] },
    { allowedSuppliers: ['store-a', 'store-a'] }, { hireCount: 0 }, { hireCount: 1.5 },
    { hireCount: 21 }, { kitId: 'unknown' }, { kitVersion: 2 }, { currency: 'USD' },
    { approvedBy: 'model' }, { confirmedAt: now }, { stockAssignments: ['spare-1'] },
    { readyBy: '2026-11-01T09:00:00Z' }, { purchaseBy: '2026-11-31T09:00:00Z' },
    { purchaseBy: '2026-11-04T08:59:59Z' },
  ]) {
    assert.throws(() => createMandateDraft(policy, { ...request, ...patch }, kit, now), JSON.stringify(patch));
  }
});

test('kit constraints and duplicate or split requirements cannot bypass role policy', () => {
  for (const patch of [
    { allowedSkus: ['UNVETTED'] }, { allowedSkus: ['MON-27-USBC'] },
    { allowedSkus: ['LAP-14-AIR', 'LAP-14-AIR'] },
    { maxUnitPriceMinor: policy.roles.laptop.maxUnitPriceMinor + 1 },
    { minWarrantyMonths: policy.roles.laptop.minWarrantyMonths - 1 },
    { unitsPerHire: 0 }, { unitsPerHire: 0.5 }, { unitsPerHire: 1000 },
    { paymentTool: 'bypass' },
  ]) {
    const changedKit = structuredClone(kit);
    Object.assign(changedKit.lines[0], patch);
    assert.throws(() => createMandateDraft(policy, request, changedKit, now), JSON.stringify(patch));
  }
  const duplicate = structuredClone(kit);
  duplicate.lines.push({ ...duplicate.lines[0] });
  assert.throws(() => createMandateDraft(policy, request, duplicate, now), /unique/);
  const split = structuredClone(kit);
  split.lines.push({ ...split.lines[0], requirementId: 'extra-laptops' });
  assert.throws(() => createMandateDraft(policy, { ...request, hireCount: 11 }, split, now), /across kit requirements/);
});

test('review detects policy content changes even if its ID and version remain the same', () => {
  const draft = createMandateDraft(policy, request, kit, now);
  for (const changedPolicy of [
    { ...policy, version: policy.version + 1 },
    { ...policy, maxBudgetMinor: policy.maxBudgetMinor + 1 },
    { ...policy, allowedSuppliers: ['store-b'] },
  ]) {
    const review = reviewMandateDraft(draft, changedPolicy, kit, now);
    assert.equal(review.decision, 'needs_revision');
    assert.equal(review.checks.find((check) => check.code === 'POLICY_BINDING')!.status, 'fail');
  }
});

test('a recalculated public digest cannot bless a modified proposal or weaker policy limits', () => {
  const original = createMandateDraft(policy, request, kit, now);
  const tampered = structuredClone(original);
  tampered.proposal.requirements[0]!.quantity = 1;
  assert.equal(reviewMandateDraft(tampered, policy, kit, now).checks.find((check) => check.code === 'DRAFT_DIGEST')!.status, 'fail');

  const { digest: ignored, ...content } = tampered;
  const resealed = { ...content, digest: contentDigest(content) };
  const review = reviewMandateDraft(resealed, policy, kit, now);
  assert.equal(review.checks.find((check) => check.code === 'DRAFT_DIGEST')!.status, 'pass');
  assert.equal(review.checks.find((check) => check.code === 'POLICY_AND_KIT')!.status, 'fail');
  assert.equal(review.decision, 'needs_revision');

  const weak = structuredClone(original);
  weak.kit.lines[0]!.minWarrantyMonths = 0;
  weak.proposal.requirements[0]!.minWarrantyMonths = 0;
  const { digest: oldDigest, ...weakContent } = weak;
  const weakReview = reviewMandateDraft({ ...weakContent, digest: contentDigest(weakContent) }, policy, kit, now);
  assert.equal(weakReview.decision, 'needs_revision');
  assert.equal(weakReview.checks.find((check) => check.code === 'POLICY_AND_KIT')!.status, 'fail');
});

test('review rejects future or expired drafts and malformed authority fields', () => {
  const draft = createMandateDraft(policy, request, kit, now);
  const future = reviewMandateDraft(draft, policy, kit, '2026-11-04T08:59:59Z');
  assert.equal(future.decision, 'needs_revision');
  assert.equal(future.checks.find((check) => check.code === 'DRAFT_TIME')!.status, 'fail');
  const expired = reviewMandateDraft(draft, policy, kit, '2026-11-05T10:00:01Z');
  assert.equal(expired.checks.find((check) => check.code === 'PURCHASE_DEADLINE')!.status, 'fail');
  assert.throws(() => reviewMandateDraft({ ...draft, status: 'confirmed' }, policy, kit, now));
  assert.throws(() => reviewMandateDraft({ ...draft, approvedBy: 'model' }, policy, kit, now));
  assert.throws(() => reviewMandateDraft({ ...draft, proposal: { ...draft.proposal, approvedBy: 'model' } }, policy, kit, now));
  assert.throws(() => createMandateDraft(policy, request, kit, 'invalid'));
  assert.throws(() => reviewMandateDraft(draft, policy, kit, 'invalid'));
});

test('creation and review require time strictly before the purchase deadline', () => {
  const deadline = Date.parse(request.purchaseBy);
  const justBefore = new Date(deadline - 1).toISOString();
  const draft = createMandateDraft(policy, request, kit, justBefore);
  assert.equal(reviewMandateDraft(draft, policy, kit, justBefore).decision, 'draft_valid');

  for (const clock of [request.purchaseBy, new Date(deadline + 1).toISOString()]) {
    assert.throws(() => createMandateDraft(policy, request, kit, clock), /Purchase deadline has passed/);
    const review = reviewMandateDraft(draft, policy, kit, clock);
    assert.equal(review.decision, 'needs_revision');
    assert.equal(review.checks.find((check) => check.code === 'PURCHASE_DEADLINE')!.status, 'fail');
  }
});

test('record identity ignores JSON object key order while preserving array order and values', () => {
  const draft = createMandateDraft(policy, request, kit, now);
  const reordered = Object.fromEntries(Object.entries(policy).reverse());
  assert.equal(reviewMandateDraft(draft, reordered, kit, now).decision, 'draft_valid');
  assert.notEqual(contentDigest(['store-a', 'store-b']), contentDigest(['store-b', 'store-a']));
});

test('review uses the current kit reference, including content changes under the same version', () => {
  const draft = createMandateDraft(policy, request, kit, now);
  for (const change of [
    { ...kit, version: 2 },
    { ...kit, lines: [kit.lines[0]] },
  ]) {
    const review = reviewMandateDraft(draft, policy, change, now);
    assert.equal(review.decision, 'needs_revision');
    assert.equal(review.checks.find((check) => check.code === 'KIT_BINDING')!.status, 'fail');
  }
  const { digest: previousDigest, ...content } = draft;
  content.kit.lines.pop();
  content.proposal.requirements.pop();
  const resealed = { ...content, digest: contentDigest(content) };
  const review = reviewMandateDraft(resealed, policy, kit, now);
  assert.equal(review.checks.find((check) => check.code === 'DRAFT_DIGEST')!.status, 'pass');
  assert.equal(review.checks.find((check) => check.code === 'KIT_BINDING')!.status, 'fail');
  assert.equal(review.checks.find((check) => check.code === 'POLICY_AND_KIT')!.status, 'fail');
});
