import { db } from './db';
import { z } from 'zod';
const PublicVods = z
  .array(
    z.object({
      id: z.string().regex(/^\d+$/),
      created_at: z.string().datetime(),
      duration: z.string().max(80),
    }),
  )
  .max(500);
import { safeAvatar } from './history';
import { SITE_URL } from './site';

const host = () => {
  const url = new URL(SITE_URL);
  return `${url.protocol}//${url.hostname}/*`;
};
export async function refreshProfilePhotos(logins: string[], refresh = false) {
  if (!SITE_URL) return 'profile photos are available in the connected build';
  if (!(await chrome.permissions.contains({ origins: [host()] })))
    return 'initials work without connecting an account';
  const missing: string[] = [];
  for (const login of [...new Set(logins)])
    if (
      /^[a-z0-9_]{1,25}$/.test(login) &&
      (refresh ||
        !(await db.streamerProfiles.get(login))?.avatarDataUrl ||
        !(await db.streamerProfiles.get(login))?.vods)
    )
      missing.push(login);
  if (!missing.length) return 'your profile photos are cached locally';
  const endpoint = `${SITE_URL}/api/extension-profile`;
  const status = await fetch(endpoint, {
    credentials: 'include',
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!status.ok) return 'sign in on our website, then connect photos again';
  let loaded = 0;
  for (const login of missing) {
    try {
      // A channel login only: no dates, statistics, words, session IDs or recordings.
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login }),
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const profile = await response.json();
      if (
        profile.login !== login ||
        typeof profile.displayName !== 'string' ||
        !safeAvatar(profile.avatarDataUrl)
      )
        continue;
      await db.streamerProfiles.put({
        login,
        displayName: profile.displayName.slice(0, 100),
        avatarDataUrl: profile.avatarDataUrl,
        fetchedAt: Date.now(),
        vods: PublicVods.safeParse(profile.vods).data ?? [],
      });
      loaded++;
    } catch {
      /* Keep the immediately available initials. */
    }
  }
  return loaded
    ? 'profile photos saved on this browser'
    : 'photos unavailable · initials are ready';
}
export async function connectProfilePhotos(logins: string[]) {
  if (!SITE_URL) return 'profile photos are available in the connected build';
  const granted = await chrome.permissions.request({ origins: [host()] });
  return granted
    ? refreshProfilePhotos(logins, true)
    : 'no problem · we’ll keep using initials';
}
