import { EvaluationInputSchema } from '../../../../packages/contracts/src/index.ts';
import type { Check, EligibilityResult, Evidence } from '../../../../packages/contracts/src/index.ts';

/**
 * Offline eligibility only. Inputs representing authority, quotes and commitments
 * must eventually be resolved by the trusted executor, never an agent or browser.
 * This pure function does not reserve funds and cannot prevent concurrent spending.
 */
export function evaluatePurchase(rawInput: unknown): EligibilityResult {
  const { policy, mandate, submission, quote, snapshot, now } = EvaluationInputSchema.parse(rawInput);
  const checks: Check[] = [];
  const currentTime = Date.parse(now);
  const maxEvidenceAge = policy.evidenceMaxAgeHours * 3_600_000;
  const record = (code: string, pass: boolean, message: string) => {
    checks.push({ code, status: pass ? 'pass' : 'fail', message });
  };
  const evidence = (code: string, item: Evidence) => {
    const age = currentTime - Date.parse(item.observedAt);
    const supported = item.status === 'supported' && age >= 0 && age <= maxEvidenceAge;
    checks.push({
      code,
      status: supported ? 'pass' : 'unknown',
      message: supported
        ? `Supported by ${item.source} observed ${item.observedAt}`
        : `Mandatory evidence is ${item.status}, stale or future-dated: ${item.source}`,
    });
  };

  record('POLICY_VERSION', mandate.policyId === policy.id && mandate.policyVersion === policy.version,
    'Mandate must reference the loaded company policy revision');
  record('MANDATE_IDENTITY', submission.mandateId === mandate.id && submission.mandateVersion === mandate.version,
    'Cart must reference this mandate revision');
  record('SNAPSHOT_IDENTITY', snapshot.mandateId === mandate.id && snapshot.mandateVersion === mandate.version,
    'Budget and quantity snapshot must belong to this mandate revision');
  record('POLICY_BUDGET', mandate.budgetMinor <= policy.maxBudgetMinor,
    'Mandate budget must not exceed company policy');
  record('POLICY_SUPPLIERS', mandate.allowedSuppliers.every((supplier) => policy.allowedSuppliers.includes(supplier)),
    'Mandate supplier list must narrow company policy');
  record('SUPPLIER', mandate.allowedSuppliers.includes(submission.supplierId)
    && policy.allowedSuppliers.includes(submission.supplierId), 'Supplier must be allowed by policy and mandate');
  record('MANDATE_TIMING', Date.parse(mandate.confirmedAt) <= currentTime
    && currentTime < Date.parse(mandate.purchaseBy)
    && Date.parse(mandate.confirmedAt) < Date.parse(mandate.purchaseBy)
    && Date.parse(mandate.purchaseBy) <= Date.parse(mandate.readyBy),
  'Mandate must be confirmed, within its purchase deadline and finish buying before readiness');

  for (const requirement of mandate.requirements) {
    const rule = policy.roles[requirement.role];
    record(`POLICY_REQUIREMENT:${requirement.id}`,
      requirement.allowedSkus.every((sku) => rule.allowedSkus.includes(sku))
        && requirement.maxUnitPriceMinor <= rule.maxUnitPriceMinor
        && requirement.minWarrantyMonths >= rule.minWarrantyMonths,
      'Requirement must narrow allowed SKUs, price ceiling and minimum warranty');
  }
  for (const role of ['laptop', 'monitor'] as const) {
    const requested = mandate.requirements.filter((item) => item.role === role)
      .reduce((sum, item) => sum + item.quantity, 0);
    record(`POLICY_UNITS:${role}`, requested <= policy.roles[role].maxUnits,
      `${requested} required ${role} units must fit policy limit ${policy.roles[role].maxUnits}`);
  }

  record('QUOTE_IDENTITY', quote.cartId === submission.id && quote.supplierId === submission.supplierId
    && quote.deliveryLocationId === mandate.deliveryLocationId,
  'Quote must bind this cart, supplier and approved destination');
  record('CURRENCY', quote.currency === mandate.currency && snapshot.currency === mandate.currency
    && policy.currency === mandate.currency, 'All amounts must use the mandate currency');
  record('QUOTE_TIMING', Date.parse(quote.createdAt) <= currentTime
    && currentTime - Date.parse(quote.createdAt) <= maxEvidenceAge
    && currentTime < Date.parse(quote.expiresAt)
    && Date.parse(quote.createdAt) < Date.parse(quote.expiresAt),
  'Quote must be current, not future-dated and unexpired');
  const quoteMatchesCart = quote.lines.length === submission.lines.length && submission.lines.every((line) =>
    quote.lines.some((item) => item.sku === line.sku && item.quantity === line.quantity));
  record('QUOTE_LINES', quoteMatchesCart, 'Quoted SKUs and quantities must exactly match the submitted cart');

  const calculatedTotal = quote.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0)
    + quote.shippingMinor + quote.taxMinor;
  record('QUOTE_TOTAL', calculatedTotal === quote.totalMinor,
    'Quoted total must equal items plus shipping and tax');
  const remainingBeforeMinor = mandate.budgetMinor - snapshot.committedMinor - snapshot.reservedMinor;
  record('BUDGET', quote.totalMinor <= remainingBeforeMinor,
    `Cart total ${quote.totalMinor}; remaining ${remainingBeforeMinor} minor units after commitments/reservations`);

  record('SNAPSHOT_REQUIREMENTS', snapshot.quantities.every((entry) =>
    mandate.requirements.some((item) => item.id === entry.requirementId)),
  'Prior quantity commitments must refer to known mandate requirements');
  for (const requirement of mandate.requirements) {
    const previous = snapshot.quantities.find((entry) => entry.requirementId === requirement.id);
    const proposed = submission.lines.filter((line) => line.requirementId === requirement.id)
      .reduce((sum, line) => sum + line.quantity, 0);
    const total = (previous?.committed ?? 0) + (previous?.reserved ?? 0) + proposed;
    record(`QUANTITY:${requirement.id}`, total <= requirement.quantity,
      `${total} committed/reserved/proposed units against ${requirement.quantity} required`);
  }

  for (const line of submission.lines) {
    const requirement = mandate.requirements.find((item) => item.id === line.requirementId);
    record(`REQUIREMENT:${line.sku}`, Boolean(requirement), 'Cart line must name a known requirement');
    if (!requirement) continue;
    const rule = policy.roles[requirement.role];
    record(`SKU:${line.sku}`, requirement.allowedSkus.includes(line.sku) && rule.allowedSkus.includes(line.sku),
      'Exact SKU must be vetted by policy and permitted by the mandate');
    const pricedLine = quote.lines.find((item) => item.sku === line.sku);
    if (!pricedLine) continue; // QUOTE_LINES already records a hard failure.
    record(`UNIT_PRICE:${line.sku}`, pricedLine.unitPriceMinor <= requirement.maxUnitPriceMinor
      && pricedLine.unitPriceMinor <= rule.maxUnitPriceMinor, 'Quoted unit price must fit both price ceilings');
    record(`WARRANTY:${line.sku}`, pricedLine.warrantyMonths >= requirement.minWarrantyMonths
      && pricedLine.warrantyMonths >= rule.minWarrantyMonths, 'Warranty must meet both minimums');
    record(`STOCK:${line.sku}`, pricedLine.availableUnits >= line.quantity,
      'Supplier must report enough units for the cart');
    evidence(`PRODUCT_EVIDENCE:${line.sku}`, pricedLine.productEvidence);
    evidence(`STOCK_EVIDENCE:${line.sku}`, pricedLine.stockEvidence);
  }

  record('DELIVERY', Date.parse(quote.delivery.by) <= Date.parse(mandate.readyBy)
    && Date.parse(quote.delivery.by) >= currentTime, 'Quoted delivery must be in the future and meet readiness');
  evidence('DELIVERY_EVIDENCE', quote.delivery.evidence);

  return {
    cartId: submission.id,
    quoteId: quote.id,
    evaluatedAt: now,
    decision: checks.some((check) => check.status === 'fail') ? 'blocked'
      : checks.some((check) => check.status === 'unknown') ? 'needs_review' : 'eligible',
    totalMinor: quote.totalMinor,
    remainingBeforeMinor,
    checks,
  };
}
