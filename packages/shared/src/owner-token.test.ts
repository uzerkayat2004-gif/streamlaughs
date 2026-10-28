import { expect, it } from 'vitest';
import { issueOwnerToken, verifyOwnerToken } from './owner-token';

const secret = 'local-test-only-owner-signing-key-0000000000000000';
it('binds owner reads to channel, audience, signature and a 60-second server expiry', async () => {
  const token = await issueOwnerToken(secret, 'streamer', '123', 1000);
  expect(await verifyOwnerToken(secret, token, 'streamer', 1000)).toMatchObject(
    { sub: '123', aud: 'crowd-timeline' },
  );
  for (const [key, value, channel, time] of [
    [secret, token, 'other', 1000],
    ['wrong', token, 'streamer', 1000],
    [secret, `${token}x`, 'streamer', 1000],
    [secret, token, 'streamer', 61000],
  ] as const)
    expect(await verifyOwnerToken(key, value, channel, time)).toBeNull();
  expect(await verifyOwnerToken(undefined, token, 'streamer', 1000)).toBeNull();
});
