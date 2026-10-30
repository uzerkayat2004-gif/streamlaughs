import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seal, unseal } from './session-crypto';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (cookie.value ? { value: cookie.value } : undefined),
  }),
}));
const site = 'https://streamlaughs.vercel.app';
const sessionSecret = 'local-session-fixture-key-000000000000000000000000';
const state = 'a'.repeat(64);
const fetchMock = vi.fn<typeof fetch>();
let warnings: ReturnType<typeof vi.spyOn>;
let infos: ReturnType<typeof vi.spyOn>;
const reply = (data: unknown, status = 200) => Response.json(data, { status });

beforeEach(() => {
  vi.resetModules();
  cookie.value = undefined;
  vi.stubEnv('SITE_URL', site);
  vi.stubEnv('TWITCH_CLIENT_ID', 'local-client');
  vi.stubEnv('TWITCH_CLIENT_SECRET', 'local-client-secret');
  vi.stubEnv('SESSION_SECRET', sessionSecret);
  vi.stubEnv('AUTH_TEST_MODE', 'false');
  warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
  infos = vi.spyOn(console, 'info').mockImplementation(() => {});
  fetchMock.mockReset().mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/oauth2/token')
      return reply({ access_token: 'local-access-token', expires_in: 3600 });
    if (path === '/oauth2/validate') {
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'OAuth local-access-token',
      );
      return reply({
        client_id: 'local-client',
        login: 'mychannel',
        user_id: '123',
        expires_in: 3600,
      });
    }
    if (path === '/helix/users') {
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer local-access-token',
      );
      expect(new Headers(init?.headers).get('Client-Id')).toBe('local-client');
      return reply({
        data: [{ id: '123', login: 'mychannel', display_name: 'MyChannel' }],
      });
    }
    return reply({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  const logged = JSON.stringify([...warnings.mock.calls, ...infos.mock.calls]);
  for (const value of [
    'local-client-secret',
    sessionSecret,
    'local-access-token',
    state,
    'local-auth-code',
  ])
    expect(logged).not.toContain(value);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function callback(
  query: Record<string, string> = { code: 'local-auth-code', state },
) {
  const { GET } = await import('../app/auth/callback/route');
  return GET(
    new Request(`${site}/auth/callback?${new URLSearchParams(query)}`),
  );
}
async function pending(seconds = 600, value = state) {
  cookie.value = await seal(
    { kind: 'oauth', state: value },
    sessionSecret,
    seconds,
  );
}

it('runs login, state-cookie round trip, token exchange, validation and Helix before setting the owner session', async () => {
  const { GET } = await import('../app/auth/login/route');
  const login = await GET();
  const authorize = new URL(login.headers.get('Location')!);
  expect(authorize.origin).toBe('https://id.twitch.tv');
  expect(authorize.searchParams.get('redirect_uri')).toBe(
    `${site}/auth/callback`,
  );
  expect(authorize.searchParams.get('scope')).toBe('');
  cookie.value = login.cookies.get('__Host-laughline-auth')!.value;
  const response = await callback({
    code: 'local-auth-code',
    state: authorize.searchParams.get('state')!,
  });
  expect(response.headers.get('Location')).toBe(`${site}/dashboard/mychannel`);
  const session = response.cookies.get('__Host-laughline-auth')!;
  expect(session).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  expect(await unseal(session.value, sessionSecret)).toEqual({
    kind: 'session',
    login: 'mychannel',
    userId: '123',
    displayName: 'MyChannel',
  });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  cookie.value = session.value;
  fetchMock.mockClear();
  const { authenticated } = await import('./auth');
  expect(await authenticated()).toEqual({ login: 'mychannel', userId: '123' });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(warnings).not.toHaveBeenCalled();
});
it('rejects missing or expired state cookies without contacting Twitch', async () => {
  expect((await callback()).headers.get('Location')).toContain(
    'reason=state_missing',
  );
  await pending(-1);
  expect((await callback()).headers.get('Location')).toContain(
    'reason=state_invalid',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects a state overwritten by another login and clears the pending cookie', async () => {
  await pending(600, 'b'.repeat(64));
  const response = await callback();
  expect(response.headers.get('Location')).toContain('reason=state_mismatch');
  expect(response.cookies.get('__Host-laughline-auth')?.maxAge).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('detects credential whitespace without changing the value or contacting Twitch', async () => {
  vi.stubEnv('TWITCH_CLIENT_SECRET', ' local-client-secret\n');
  const { GET } = await import('../app/auth/login/route');
  expect((await GET()).headers.get('Location')).toContain(
    'reason=credentials_whitespace',
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect(process.env.TWITCH_CLIENT_SECRET).toBe(' local-client-secret\n');
});
it('reports a rejected client secret with only an allowlisted code and HTTP status', async () => {
  fetchMock.mockResolvedValue(reply({ message: 'invalid client secret' }, 400));
  const { GET } = await import('../app/auth/login/route');
  expect((await GET()).headers.get('Location')).toContain(
    'reason=credentials_rejected',
  );
  expect(JSON.stringify(warnings.mock.calls)).toContain(
    'invalid_client_secret',
  );
  expect(JSON.stringify(warnings.mock.calls)).toContain('400');
});
it('identifies token exchange failure after a valid state instead of hiding it in a generic retry', async () => {
  await pending();
  fetchMock.mockResolvedValue(
    reply({ message: 'invalid authorization code' }, 400),
  );
  const response = await callback();
  expect(response.headers.get('Location')).toContain('reason=token_exchange');
  expect(JSON.stringify(infos.mock.calls)).toContain('state_verified');
  expect(JSON.stringify(warnings.mock.calls)).toContain(
    'invalid_authorization_code',
  );
});
it('identifies Helix failure after successful exchange and token validation', async () => {
  await pending();
  fetchMock.mockImplementation(async (url) => {
    if (String(url).endsWith('/oauth2/token'))
      return reply({ access_token: 'local-access-token', expires_in: 3600 });
    if (String(url).endsWith('/oauth2/validate'))
      return reply({
        client_id: 'local-client',
        login: 'mychannel',
        user_id: '123',
        expires_in: 3600,
      });
    return reply({}, 401);
  });
  expect((await callback()).headers.get('Location')).toContain(
    'reason=user_lookup',
  );
});
it('never logs unknown Error contents or provider credentials', async () => {
  const { logOAuthFailure } = await import('./oauth-errors');
  const error = logOAuthFailure(
    new Error('local-client-secret local-access-token'),
  );
  expect(error.code).toBe('unexpected');
  expect(JSON.stringify(warnings.mock.calls)).toContain('unexpected');
});
