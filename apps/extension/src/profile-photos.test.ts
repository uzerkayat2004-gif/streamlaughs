import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./site', () => ({ SITE_URL: 'https://streamlaughs.vercel.app' }));
vi.mock('./db', () => ({
  db: {
    streamerProfiles: {
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => {}),
    },
  },
}));

import { db } from './db';
import { refreshProfilePhotos } from './profile-photos';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('makes no network request without the optional site grant', async () => {
  vi.stubGlobal('chrome', { permissions: { contains: async () => false } });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await refreshProfilePhotos(['grimm']);
  expect(fetcher).not.toHaveBeenCalled();
});
it('checks sign-in first, then sends only a login and caches the photo', async () => {
  vi.stubGlobal('chrome', { permissions: { contains: async () => true } });
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) =>
    options?.method === 'POST'
      ? Response.json({
          login: 'grimm',
          displayName: 'Grimm',
          avatarDataUrl: 'data:image/png;base64,iVBORw==',
        })
      : Response.json({ connected: true }),
  );
  vi.stubGlobal('fetch', fetcher);
  await refreshProfilePhotos(['grimm']);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({
    login: 'grimm',
  });
  expect(db.streamerProfiles.put).toHaveBeenCalledWith(
    expect.objectContaining({ login: 'grimm', displayName: 'Grimm' }),
  );
});
