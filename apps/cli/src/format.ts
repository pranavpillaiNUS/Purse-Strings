/** S$7,510.10 from integer SGD cents. Digits are handled as text, so no float touches money. */
export function formatSgd(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError('formatSgd needs a safe integer amount in minor units');
  const digits = String(Math.abs(minor)).padStart(3, '0');
  const dollars = digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ',');
  return `${minor < 0 ? '-' : ''}S$${dollars}.${digits.slice(-2)}`;
}
