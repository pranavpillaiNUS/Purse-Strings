import { closeSync, constants, fstatSync, linkSync, lstatSync, openSync, readSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { MAX_SAVED_REVIEW_BYTES, parseSavedReview, type SavedReview } from '../../../services/agent/src/saved-review.ts';

/** Resolve existing ancestors too, so an alias cannot hide a protected journal. */
function canonical(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute).toLowerCase();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = dirname(absolute);
    if (parent === absolute) throw error;
    return join(canonical(parent), basename(absolute)).toLowerCase();
  }
}

function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export interface SavedReviewDestination {
  save(review: SavedReview): void;
  cancel(): void;
}

/** Validate and stage before any model or resend; publication never overwrites. */
export function prepareSavedReviewFile(path: string, protectedPaths: readonly string[], journalRoot?: string): SavedReviewDestination {
  const target = resolve(path);
  const name = basename(target);
  if (process.platform === 'win32' && (/[<>:"|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name))) {
    throw new Error('--review-out requires an ordinary filename, without reserved Windows names or alternate streams');
  }
  let directory: string;
  try {
    directory = realpathSync.native(dirname(target));
    if (!lstatSync(directory).isDirectory()) throw new Error('Not a directory');
  } catch {
    throw new Error('--review-out requires an existing output directory');
  }
  if (present(target)) throw new Error('--review-out refuses to overwrite an existing file');
  const targetKey = canonical(target);
  if (protectedPaths.some((input) => canonical(input) === targetKey)) {
    throw new Error('--review-out must differ from every input, trace and backend file');
  }
  if (journalRoot !== undefined) {
    const within = relative(canonical(journalRoot), targetKey);
    if (within === '' || (within !== '..' && !within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(within))) {
      throw new Error('--review-out cannot be inside the submission journal');
    }
  }

  const staged = join(directory, `.shop-review-${randomUUID()}.tmp`);
  const probe = `${staged}.link`;
  const cancel = (): void => {
    for (const temporary of [probe, staged]) {
      try { unlinkSync(temporary); } catch { /* Best effort: never mask a run result. */ }
    }
  };
  try {
    writeFileSync(staged, '', { flag: 'wx', mode: 0o600 });
    // Fail before shopping on filesystems without same-directory hard links.
    linkSync(staged, probe);
    unlinkSync(probe);
  } catch {
    cancel();
    throw new Error('--review-out could not create a safe new output file');
  }
  return {
    cancel,
    save(review) {
      try {
        const text = `${JSON.stringify(parseSavedReview(review), null, 2)}\n`;
        if (Buffer.byteLength(text, 'utf8') > MAX_SAVED_REVIEW_BYTES) throw new Error('Saved review exceeds the size limit');
        if (canonical(target) !== targetKey) throw new Error('Output directory changed');
        writeFileSync(staged, text, { encoding: 'utf8', flag: 'r+' });
        linkSync(staged, target);
      } finally {
        cancel();
      }
    },
  };
}

/** Read at most the size limit plus one byte, even if a file grows while read. */
export function readSavedReviewFile(path: string): SavedReview {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NONBLOCK)); }
  catch { throw new Error('Saved review could not be read'); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error('Saved review must be a regular file');
    if (stat.size > MAX_SAVED_REVIEW_BYTES) throw new Error('Saved review exceeds the size limit');
    const bytes = Buffer.alloc(MAX_SAVED_REVIEW_BYTES + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(fd, bytes, count, bytes.length - count, count);
      if (read === 0) break;
      count += read;
    }
    if (count > MAX_SAVED_REVIEW_BYTES) throw new Error('Saved review exceeds the size limit');
    let raw: unknown;
    try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count)).replace(/^\uFEFF/, '')); }
    catch { throw new Error('Saved review is not valid JSON'); }
    try { return parseSavedReview(raw); }
    catch { throw new Error('Saved review is invalid or uses an unsupported version'); }
  } finally {
    closeSync(fd);
  }
}
