import { z } from 'zod';

const Version = z.string().regex(/^\d{1,5}(?:\.\d{1,5}){2,3}$/);
const Status = z.object({
  checkedAt: z.number().nonnegative(),
  latest: Version.nullable(),
  available: z.boolean(),
});
export type UpdateStatus = z.infer<typeof Status>;
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
) {
  if (!site) return;
  const previous = Status.safeParse(await load());
  if (previous.success && now - previous.data.checkedAt < 86400000) {
    const available =
      previous.data.latest !== null &&
      newerVersion(previous.data.latest, current);
    if (available !== previous.data.available)
      await save({ ...previous.data, available });
    return;
  }
  const value: UpdateStatus = {
    checkedAt: now,
    latest: previous.success ? previous.data.latest : null,
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
    if (!response.ok) return;
    const metadata = z
      .object({ version: Version })
      .parse(await response.json());
    await save({
      ...value,
      latest: metadata.version,
      available: newerVersion(metadata.version, current),
    });
  } catch {
    /* One failed public metadata check is retried on the next eligible day. */
  }
}
