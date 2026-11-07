import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createFileSubmissionJournal } from './submission-journal.ts';

const cart = (id: string, mandateId = 'mandate-a') => ({
  id, mandateId, mandateVersion: 1, supplierId: 'store-a',
  lines: [{ requirementId: 'laptops', sku: 'LAP-14-AIR', quantity: 1 }],
});

function database(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'splittap-journal-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'app.db');
}

test('a saved cart comes back whole until it is cleared, and an empty journal is simply empty', (t) => {
  const journal = createFileSubmissionJournal(database(t), 'mandate-a');
  assert.deepEqual(journal.pending(), []);
  journal.save(cart('run-cart-1'));
  journal.save(cart('run-cart-2'));
  assert.deepEqual(journal.pending().map(({ id }) => id).sort(), ['run-cart-1', 'run-cart-2']);
  assert.deepEqual(journal.pending().find(({ id }) => id === 'run-cart-1'), cart('run-cart-1'));
  journal.clear('run-cart-1');
  assert.deepEqual(journal.pending().map(({ id }) => id), ['run-cart-2']);
  journal.clear('never-saved');
});

test('any run on the mandate sees the cart, and other mandates and ledgers do not', (t) => {
  const path = database(t);
  createFileSubmissionJournal(path, 'mandate-a').save(cart('first-run-cart-1'));
  assert.equal(createFileSubmissionJournal(path, 'mandate-a').pending().length, 1, 'A different run ID must still find it');
  assert.deepEqual(createFileSubmissionJournal(path, 'mandate-b').pending(), []);
  assert.deepEqual(createFileSubmissionJournal(`${path}-other`, 'mandate-a').pending(), []);
});

test('a damaged or planted record stops the run instead of being guessed at', (t) => {
  const path = database(t);
  const journal = createFileSubmissionJournal(path, 'mandate-a');
  journal.save(cart('run-cart-1'));
  const folder = join(`${path}.shop-journal`, readdirSync(`${path}.shop-journal`)[0]!);
  const file = join(folder, readdirSync(folder)[0]!);
  for (const content of ['{ not json', JSON.stringify({ id: 'run-cart-1' }), JSON.stringify(cart('run-cart-1', 'mandate-b')), JSON.stringify(cart('another-cart'))]) {
    writeFileSync(file, content);
    assert.throws(() => journal.pending(), /could not be read, so nothing was sent/, content);
  }
});
