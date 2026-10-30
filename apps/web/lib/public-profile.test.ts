import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({
  callbackUrl: () => 'https://example.test/auth/callback',
  twitchOrigin: () => 'https://id.twitch.tv',
  helixOrigin: () => 'https://api.twitch.tv',
  secret: () => 'test-placeholder',
}));
beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mockProfile(login: string, url: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) =>
      input.includes('/oauth2/token')
        ? Response.json({ access_token: 'fake-app-token', expires_in: 3600 })
        : Response.json({
            data: [{ login, display_name: 'Grimm', profile_image_url: url }],
          }),
    ),
  );
}
it('retrieves only the requested public profile through the app token', async () => {
  mockProfile('grimm', 'https://static-cdn.jtvnw.net/avatar.png');
  const { getPublicProfile } = await import('./twitch');
  expect(await getPublicProfile('grimm')).toEqual({
    login: 'grimm',
    displayName: 'Grimm',
    avatarUrl: 'https://static-cdn.jtvnw.net/avatar.png',
  });
  expect(fetch).toHaveBeenLastCalledWith(
    'https://api.twitch.tv/helix/users?login=grimm',
    expect.anything(),
  );
});
it.each([
  ['other', 'https://static-cdn.jtvnw.net/avatar.png'],
  ['grimm', 'https://example.test/avatar.png'],
  ['grimm', 'http://static-cdn.jtvnw.net/avatar.png'],
  ['grimm', 'https://user:pass@static-cdn.jtvnw.net/avatar.png'],
])(
  'rejects an unrelated identity or unapproved avatar URL (%s, %s)',
  async (login, url) => {
    mockProfile(login, url);
    const { getPublicProfile } = await import('./twitch');
    await expect(getPublicProfile('grimm')).rejects.toThrow(
      'profile unavailable',
    );
  },
);
