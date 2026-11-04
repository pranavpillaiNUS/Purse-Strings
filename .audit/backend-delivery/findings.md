# Delivery findings

## design-critic-r1-1

Severity: Major. Status: Design resolution pending.

The specification keyed operations only by mandate/idempotency key, allowing the same cart identity to create another operation under a new key. Existing scope says duplicate carts return the original operation. Require atomic cart-identity uniqueness, replay and conflicting-payload semantics independent of request key.

## design-critic-r1-2

Severity: Major. Status: Design resolution pending.

A definitive not_applied lookup could retry capture after authority or quote expiry because an effect intent already exists. Require renewed eligibility before a capture known not to have applied. Known success and uncertain outcomes still reconcile after expiry. Release only after definitive no-effect evidence.
