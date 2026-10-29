import { PRODUCT } from '@laughline/shared';
import { z } from 'zod';
import { Version } from './version-check';

// Compatibility namespace; separate from saved preferences and Dexie recaps.
export const UPDATE_ATTEMPT_KEY = 'laughline:update-attempt';
export const UPDATE_LATER_KEY = 'laughline:update-later';
export const UpdateAttemptSchema = z.object({
  version: Version,
  phase: z.enum(['downloaded', 'reloading', 'result']),
  tabId: z.number().int().nonnegative().optional(),
});
export type UpdateAttempt = z.infer<typeof UpdateAttemptSchema>;
export function updateResult(current: string, target: string) {
  return current === target
    ? `you're on v${current}`
    : 'files not replaced yet';
}
export function updateFilename(version: string) {
  Version.parse(version);
  return `${PRODUCT.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-v${version}.zip`;
}
export async function verifiedArchive(
  response: Response,
  expected: { sha256: string; bytes: number },
) {
  if (!response.ok || !response.body || expected.bytes > 100_000_000)
    throw new Error('download unavailable · try again');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > expected.bytes)
        throw new Error('download changed · try again');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  if (size !== expected.bytes)
    throw new Error('download incomplete · try again');
  const blob = new Blob(chunks, { type: 'application/zip' });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await blob.arrayBuffer(),
  );
  const hash = [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== expected.sha256) throw new Error('download changed · try again');
  return blob;
}

/** Run inside the background's serialized lifecycle, before runtime.reload. */
export async function prepareUpdateReload(
  stopAndSave: () => Promise<void>,
  saveAttempt: () => Promise<void>,
  reload: () => void,
) {
  await stopAndSave();
  await saveAttempt();
  reload();
}
