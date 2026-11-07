import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CartSubmissionSchema } from '../../../packages/contracts/src/index.ts';
import type { SubmissionJournal } from '../../../services/agent/src/shopper.ts';

// A cart is written here before it is sent, and removed once its outcome is known. What is
// left is a cart that may have reserved budget, or may still be on its way. The next run on
// that mandate resends it first, with the same key, so it cannot become a second reservation
// and its operation can be recovered. Reading the ledger cannot do this: an outstanding
// request is not in the ledger yet, and nothing looks up an operation by cart ID.

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Kept beside the backend database, so it lives and is deleted with the ledger it describes. */
export function createFileSubmissionJournal(databasePath: string, mandateId: string): SubmissionJournal {
  const directory = join(`${resolve(databasePath)}.shop-journal`, digest(mandateId));
  const fileFor = (cartId: string): string => join(directory, `${digest(cartId)}.json`);
  const unreadable = `A saved submission for this mandate could not be read, so nothing was sent. Check the ledger, then delete this folder: ${directory}`;

  return {
    pending() {
      let names: string[];
      try {
        names = readdirSync(directory).filter((name) => name.endsWith('.json')).sort();
      } catch (error) {
        // No folder is the usual first run: nothing has been saved for this mandate.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw new Error(unreadable);
      }
      return names.flatMap((name) => {
        let text: string;
        try {
          text = readFileSync(join(directory, name), 'utf8');
        } catch (error) {
          // Another run settled this cart a moment ago.
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw new Error(unreadable);
        }
        try {
          const cart = CartSubmissionSchema.parse(JSON.parse(text));
          if (cart.mandateId !== mandateId || name !== `${digest(cart.id)}.json`) throw new Error('Mismatched record');
          return [cart];
        } catch {
          throw new Error(unreadable);
        }
      });
    },
    save(cart) {
      mkdirSync(directory, { recursive: true });
      const target = fileFor(cart.id);
      const partial = `${target}.${process.pid}.tmp`;
      writeFileSync(partial, JSON.stringify(cart));
      renameSync(partial, target);
    },
    clear(cartId) {
      try {
        rmSync(fileFor(cartId), { force: true });
      } catch {
        // Leaving it is safe: the next run resends it, which can only return the same answer.
      }
    },
  };
}
