import { afterEach, expect, it, vi } from 'vitest';
import { checkVersion, newerVersion } from './version-check';

afterEach(() => vi.unstubAllGlobals());
it('compares Chrome versions numerically and rejects arbitrary update strings', () => {
  expect(newerVersion('0.10.0', '0.9.9')).toBe(true);
  expect(newerVersion('0.5.0', '0.5.0.0')).toBe(false);
  expect(newerVersion('url', '0.5.0')).toBe(false);
});
it('makes one identifier-free check per day, including failures', async () => {
  let stored: unknown;
  const load = async () => stored,
    save = async (value: unknown) => {
      stored = value;
    };
  const fetcher = vi.fn(async () =>
    Response.json({ version: '0.6.0', installUrl: 'https://untrusted.test' }),
  );
  vi.stubGlobal('fetch', fetcher);
  await checkVersion('https://app.vercel.app', '0.5.0', load, save, 1000);
  await checkVersion('https://app.vercel.app', '0.5.0', load, save, 2000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    'https://app.vercel.app/version.json',
    expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
  );
  expect(stored).toMatchObject({ available: true, latest: '0.6.0' });
  fetcher.mockRejectedValue(new Error('offline'));
  await checkVersion('https://app.vercel.app', '0.5.0', load, save, 86401000);
  await checkVersion('https://app.vercel.app', '0.5.0', load, save, 86402000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('clears a cached update dot after an upgrade without another network request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const saved = vi.fn(async () => {});
  await checkVersion(
    'https://app.vercel.app',
    '0.6.0',
    async () => ({ checkedAt: 1000, latest: '0.6.0', available: true }),
    saved,
    2000,
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(saved).toHaveBeenCalledWith({
    checkedAt: 1000,
    latest: '0.6.0',
    available: false,
  });
});
