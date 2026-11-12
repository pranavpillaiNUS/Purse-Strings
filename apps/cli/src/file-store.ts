import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Content-addressed storage for uploaded company files. Keys are sha256 hex digests. */
export interface FileStore {
  put(bytes: Buffer): string;
  get(key: string): Buffer | undefined;
}

const KEY = /^[0-9a-f]{64}$/;

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Local folder store (owner-only permissions). An S3 adapter can implement the same
 * interface later; nothing else should know where uploads live. */
export class LocalFileStore implements FileStore {
  readonly directory: string;
  constructor(directory: string) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') chmodSync(directory, 0o700);
  }
  put(bytes: Buffer): string {
    const key = sha256(bytes);
    const path = join(this.directory, key);
    if (!existsSync(path)) writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
    return key;
  }
  get(key: string): Buffer | undefined {
    if (!KEY.test(key)) return undefined;
    const path = join(this.directory, key);
    return existsSync(path) ? readFileSync(path) : undefined;
  }
}
