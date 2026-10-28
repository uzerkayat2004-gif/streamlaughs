import { afterEach, expect, it, vi } from 'vitest';
import { callbackUrl, releaseUrl, siteUrl, twitchOrigin } from './config';
import { ownsChannel, seal, unseal } from './session-crypto';

const secret = 'local-session-test-key-0000000000000000000000000000000';
afterEach(() => vi.unstubAllEnvs());
it('uses the selected public defaults while keeping site and repository configurable', () => {
  vi.stubEnv('SITE_URL', undefined);
  vi.stubEnv('RELEASE_REPO_OWNER', undefined);
  vi.stubEnv('RELEASE_REPO_NAME', undefined);
  expect(siteUrl()).toBe('https://streamlaughs.vercel.app');
  expect(callbackUrl()).toBe('https://streamlaughs.vercel.app/auth/callback');
  expect(releaseUrl()).toBe(
    'https://github.com/uzerkayat2004-gif/streamlaughs/releases/latest',
  );
  vi.stubEnv('SITE_URL', 'https://renamed.vercel.app');
  vi.stubEnv('RELEASE_REPO_OWNER', 'another-owner');
  vi.stubEnv('RELEASE_REPO_NAME', 'another-name');
  expect(callbackUrl()).toBe('https://renamed.vercel.app/auth/callback');
  expect(releaseUrl()).toBe(
    'https://github.com/another-owner/another-name/releases/latest',
  );
});
it('permits only the validated identity’s exact channel', () => {
  expect(ownsChannel({ login: 'mychannel' }, 'mychannel')).toBe(true);
  expect(ownsChannel({ login: 'other' }, 'mychannel')).toBe(false);
  expect(ownsChannel(null, 'mychannel')).toBe(false);
  expect(ownsChannel({ login: 'mychannel' }, 'MYCHANNEL')).toBe(false);
});
it('encrypts session tokens and rejects forged, expired and wrong-key cookies', async () => {
  const value = await seal(
    {
      kind: 'session',
      login: 'mychannel',
      userId: '123',
      accessToken: 'private-token',
    },
    secret,
    60,
  );
  expect(value).not.toContain('private-token');
  expect(await unseal(value, secret)).toMatchObject({
    login: 'mychannel',
    kind: 'session',
  });
  expect(await unseal(`${value}a`, secret)).toBeNull();
  expect(await unseal(value, `${secret}wrong`)).toBeNull();
  const expired = await seal(
    { kind: 'oauth', state: 'a'.repeat(64) },
    secret,
    -1,
  );
  expect(await unseal(expired, secret)).toBeNull();
});
it('never enables a mock provider in production, and builds configured release/callback URLs', () => {
  vi.stubEnv('SITE_URL', 'https://my-project.vercel.app');
  vi.stubEnv('AUTH_TEST_MODE', 'true');
  vi.stubEnv('TWITCH_TEST_ORIGIN', 'http://127.0.0.1:4191');
  vi.stubEnv('NODE_ENV', 'production');
  expect(twitchOrigin()).toBe('https://id.twitch.tv');
  expect(callbackUrl()).toBe('https://my-project.vercel.app/auth/callback');
  vi.stubEnv('RELEASE_REPO_NAME', 'my-future-app');
  expect(releaseUrl()).toBe(
    'https://github.com/uzerkayat2004-gif/my-future-app/releases/latest',
  );
  vi.stubEnv('RELEASE_REPO_NAME', '');
  expect(releaseUrl()).toBeNull();
});
