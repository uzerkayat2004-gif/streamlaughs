import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET, OPTIONS, POST } from '../app/api/extension-profile/route';
import { authenticated } from './auth';
import { getPublicProfile } from './twitch';

vi.mock('./auth', () => ({ authenticated: vi.fn() }));
vi.mock('./twitch', () => ({ getPublicProfile: vi.fn() }));
const origin = 'chrome-extension://fkocldgggcmhihelohiicoakcfomhepg';
const request = (method = 'GET', body?: unknown, from = origin) =>
  new Request('https://streamlaughs.vercel.app/api/extension-profile', {
    method,
    headers: { Origin: from, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
beforeEach(() => {
  vi.mocked(authenticated).mockResolvedValue({ login: 'owner', userId: '123' });
  vi.mocked(getPublicProfile).mockResolvedValue({
    login: 'grimm',
    displayName: 'Grimm',
    avatarUrl: 'https://static-cdn.jtvnw.net/avatar.png',
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('accepts only the three known extension origins before checking the session', async () => {
  expect(
    (await GET(request('GET', undefined, 'https://random.example'))).status,
  ).toBe(403);
  expect(authenticated).not.toHaveBeenCalled();
  expect(
    OPTIONS(request('OPTIONS')).headers.get('Access-Control-Allow-Origin'),
  ).toBe(origin);
  expect(
    (await GET(request())).headers.get('Access-Control-Allow-Credentials'),
  ).toBe('true');
});
it('requires sign-in before any public-profile lookup', async () => {
  vi.mocked(authenticated).mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect((await POST(request('POST', { login: 'grimm' }))).status).toBe(401);
  expect(getPublicProfile).not.toHaveBeenCalled();
});
it('returns a locally cacheable image, never a Twitch token or viewer identity', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png' },
        }),
    ),
  );
  const response = await POST(request('POST', { login: 'grimm' }));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    login: 'grimm',
    displayName: 'Grimm',
    avatarDataUrl: 'data:image/png;base64,iVBORw==',
  });
});
it('rejects recap or audio fields rather than accepting them as a profile request', async () => {
  const response = await POST(
    request('POST', { login: 'grimm', audio: 'forbidden' }),
  );
  expect(response.status).toBe(400);
  expect(getPublicProfile).not.toHaveBeenCalled();
});
