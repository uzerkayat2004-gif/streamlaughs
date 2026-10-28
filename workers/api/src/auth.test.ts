import { expect, it } from 'vitest';
import { issueToken, verifyToken } from './auth';

const secret = 'local-development-test-key-000000000000000000000000000';
it('issues unlinkable random IDs and binds signed tokens to channel and two-hour expiry', async () => {
  const a = await issueToken(secret, 'demo', false, 1000),
    b = await issueToken(secret, 'demo', false, 1000);
  const claims = await verifyToken(secret, a.token, 'demo', 1000);
  expect(claims?.id).not.toBe(
    (await verifyToken(secret, b.token, 'demo', 1000))?.id,
  );
  expect(await verifyToken(secret, a.token, 'other', 1000)).toBeNull();
  expect(await verifyToken(secret, a.token, 'demo', a.expiresAt)).toBeNull();
  expect(
    await verifyToken(secret, `${a.token.slice(0, -5)}XXXXX`, 'demo', 1000),
  ).toBeNull();
  expect(await verifyToken('wrong', a.token, 'demo', 1000)).toBeNull();
  expect(await verifyToken(secret, `${a.token}.`, 'demo', 1000)).toBeNull();
  expect(Object.keys(claims!)).toEqual([
    'v',
    'id',
    'channel',
    'expiresAt',
    'testTraffic',
  ]);
});
