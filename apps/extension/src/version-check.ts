import { z } from 'zod';

export const Version = z
  .string()
  .regex(/^\d{1,5}(?:\.\d{1,5}){2,3}$/)
  .refine((value) => value.split('.').every((n) => Number(n) <= 65535));
export const UPDATE_CACHE_MS = 60 * 60 * 1000;
export const PackageMetadata = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(100_000_000),
});
export const UpdateStatusSchema = z.object({
  checkedAt: z.number().nonnegative(),
  latest: Version.nullable(),
  available: z.boolean(),
  package: PackageMetadata.optional(),
});
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;
export function newerVersion(candidate: string, current: string) {
  if (
    !Version.safeParse(candidate).success ||
    !Version.safeParse(current).success
  )
    return false;
  const a = candidate.split('.').map(Number),
    b = current.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
export async function checkVersion(
  site: string,
  current: string,
  load: () => Promise<unknown>,
  save: (value: UpdateStatus) => Promise<void>,
  now = Date.now(),
  maxAge = UPDATE_CACHE_MS,
) {
  if (!site) return;
  const previous = UpdateStatusSchema.safeParse(await load());
  if (
    previous.success &&
    now >= previous.data.checkedAt &&
    now - previous.data.checkedAt < maxAge
  ) {
    const available =
      previous.data.latest !== null &&
      newerVersion(previous.data.latest, current);
    if (available !== previous.data.available)
      await save({ ...previous.data, available });
    return { ...previous.data, available };
  }
  const value: UpdateStatus = {
    checkedAt: now,
    latest: previous.success ? previous.data.latest : null,
    package: previous.success ? previous.data.package : undefined,
    available:
      previous.success &&
      previous.data.latest !== null &&
      newerVersion(previous.data.latest, current),
  };
  await save(value);
  try {
    const response = await fetch(`${new URL(site).origin}/version.json`, {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return value;
    const metadata = z
      .object({
        version: Version,
        sha256: PackageMetadata.shape.sha256.optional(),
        bytes: PackageMetadata.shape.bytes.optional(),
      })
      .parse(await response.json());
    const result: UpdateStatus = {
      ...value,
      latest: metadata.version,
      available: newerVersion(metadata.version, current),
      package:
        metadata.sha256 && metadata.bytes
          ? { sha256: metadata.sha256, bytes: metadata.bytes }
          : undefined,
    };
    await save(result);
    return result;
  } catch {
    /* Identifier-free checks, including failures, are cached for at most an hour. */
  }
  return value;
}
