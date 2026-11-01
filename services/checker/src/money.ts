// Amounts are integer minor units (cents) everywhere in our code. PayPal's decimal
// strings exist only at the API edge, so no float ever touches a budget calculation.

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

// Only currencies with exactly two decimal places; anything else needs different formatting.
const SUPPORTED_CURRENCIES = new Set(['SGD', 'USD']);

export function assertSupportedCurrency(currency: string): void {
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new Error(`Unsupported currency ${currency}; expected one of ${[...SUPPORTED_CURRENCIES].join(', ')}`);
  }
}

export function toMinor(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid amount "${value}": expected a non-negative decimal with at most 2 places`);
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount "${value}" is too large`);
  return minor;
}

export function fromMinor(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error(`Invalid minor amount ${minor}`);
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}

export function paypalMoney(currency: string, minor: number): PayPalMoney {
  assertSupportedCurrency(currency);
  return { currency_code: currency, value: fromMinor(minor) };
}
