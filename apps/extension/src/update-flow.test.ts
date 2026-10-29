import { expect, it, vi } from 'vitest';
import {
  isZipInstall,
  prepareUpdateReload,
  UpdateAttemptSchema,
  updateFilename,
  updateResult,
  verifiedArchive,
} from './update-flow';

it('offers ZIP updates only to the fixed ZIP ID, never Edge store or unknown store installs', () => {
  expect(isZipInstall('fkocldgggcmhihelohiicoakcfomhepg')).toBe(true);
  expect(isZipInstall('fkdfjgnhifofdjpbenlkhpfhmmhglmkb')).toBe(false);
  expect(isZipInstall('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
});

it('saves the session before persisting reload intent and reloading; a save failure prevents reload', async () => {
  const calls: string[] = [];
  const stop = vi.fn(async () => {
    calls.push('saved');
  });
  const intent = vi.fn(async () => {
    calls.push('intent');
  });
  const reload = vi.fn(() => {
    calls.push('reload');
  });
  await prepareUpdateReload(stop, intent, reload);
  expect(calls).toEqual(['saved', 'intent', 'reload']);
  const fail = vi.fn(async () => {
    throw new Error('disk full');
  });
  await expect(prepareUpdateReload(fail, intent, reload)).rejects.toThrow(
    'disk full',
  );
  expect(reload).toHaveBeenCalledOnce();
  expect(intent).toHaveBeenCalledOnce();
});
it('reports replaced versus unchanged files and validates update filenames and saved state', () => {
  expect(updateResult('0.6.2', '0.6.2')).toBe("you're on v0.6.2");
  expect(updateResult('0.6.1', '0.6.2')).toBe('files not replaced yet');
  expect(updateFilename('0.6.2')).toBe('streamlaughs-v0.6.2.zip');
  expect(() => updateFilename('../evil')).toThrow();
  expect(
    UpdateAttemptSchema.safeParse({
      version: '0.6.2',
      phase: 'reloading',
      tabId: 1,
    }).success,
  ).toBe(true);
  expect(
    UpdateAttemptSchema.safeParse({ version: '0.6.2', phase: 'unknown' })
      .success,
  ).toBe(false);
});
it('only saves the exact bytes covered by the checksum, rejecting partial, changed and oversized downloads', async () => {
  const bytes = new TextEncoder().encode('a test ZIP');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  const metadata = { bytes: bytes.length, sha256 };
  expect(
    await (await verifiedArchive(new Response(bytes), metadata)).text(),
  ).toBe('a test ZIP');
  await expect(
    verifiedArchive(new Response(bytes), {
      ...metadata,
      sha256: '0'.repeat(64),
    }),
  ).rejects.toThrow('download changed');
  await expect(
    verifiedArchive(new Response(bytes), {
      ...metadata,
      bytes: bytes.length + 1,
    }),
  ).rejects.toThrow('download incomplete');
  await expect(
    verifiedArchive(new Response(bytes), { ...metadata, bytes: 2 }),
  ).rejects.toThrow('download changed');
  await expect(
    verifiedArchive(new Response(bytes), { ...metadata, bytes: 100_000_001 }),
  ).rejects.toThrow('download unavailable');
});
