import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromMinor, paypalMoney, toMinor } from './money.ts';

test('toMinor parses PayPal decimal strings', () => {
  assert.equal(toMinor('8000.00'), 800000);
  assert.equal(toMinor('0.5'), 50);
  assert.equal(toMinor('12'), 1200);
  assert.equal(toMinor('3593.73'), 359373);
});

test('toMinor rejects anything that is not a plain non-negative 2dp amount', () => {
  for (const bad of ['1.234', '-1.00', 'abc', '', '1,000.00', '1e3', ' 1.00']) {
    assert.throws(() => toMinor(bad), /Invalid amount/, bad);
  }
});

test('fromMinor formats with exactly two decimals', () => {
  assert.equal(fromMinor(750330), '7503.30');
  assert.equal(fromMinor(5), '0.05');
  assert.equal(fromMinor(0), '0.00');
  assert.throws(() => fromMinor(1.5));
  assert.throws(() => fromMinor(-1));
});

test('toMinor and fromMinor round-trip', () => {
  for (const value of ['0.00', '0.01', '99.99', '8000.00', '123456.78']) {
    assert.equal(fromMinor(toMinor(value)), value);
  }
});

test('paypalMoney only accepts 2-decimal currencies we support', () => {
  assert.deepEqual(paypalMoney('SGD', 12), { currency_code: 'SGD', value: '0.12' });
  assert.throws(() => paypalMoney('JPY', 100), /Unsupported currency/);
});
