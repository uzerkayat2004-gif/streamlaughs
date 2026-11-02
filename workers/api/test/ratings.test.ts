import {
  reset,
  runInDurableObject,
  runDurableObjectAlarm,
  SELF,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { issueOwnerToken, RATING_DAY } from '@laughline/shared';
import { afterEach, expect, it } from 'vitest';
import { ratingHash, RatingRateLimit } from '../src/ratings';
const origins = [
  'fkocldgggcmhihelohiicoakcfomhepg',
  'lofdkbfimkjjfglhhnpkiljocbikmkej',
  'fkdfjgnhifofdjpbenlkhpfhmmhglmkb',
].map((x) => `chrome-extension://${x}`);
let ip = 0;
afterEach(async () => {
  await reset();
});
const body = (channel = 'fan_test', extra = {}) => ({
  channel,
  streamKey: `${channel}:2026-11-02`,
  score: 8,
  reasons: ['funny', 'chill_vibes'],
  ...extra,
});
const post = (
  value = body(),
  install = crypto.randomUUID(),
  origin: string = origins[0]!,
) =>
  SELF.fetch('https://api.test/v1/ratings', {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: `Bearer ${install}`,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': `203.0.113.${++ip}`,
    },
    body: JSON.stringify(value),
  });
async function read(channel = 'fan_test') {
  const r = await SELF.fetch(
    `https://api.test/v1/channels/${channel}/ratings`,
    {
      headers: {
        Authorization: `Bearer ${await issueOwnerToken(env.WORKER_OWNER_KEY!, channel, '123')}`,
      },
    },
  );
  expect(r.status).toBe(200);
  return r.json<{
    streams: { streamKey: string; rating: Record<string, unknown> }[];
    trend: unknown[];
  }>();
}
it('accepts ZIP, Chrome and Edge origins and blocks strangers', async () => {
  for (const origin of origins)
    expect((await post(body(), crypto.randomUUID(), origin)).status).toBe(204);
  expect(
    (await post(body(), crypto.randomUUID(), 'https://stranger.test')).status,
  ).toBe(403);
  expect(
    (
      await SELF.fetch('https://api.test/v1/ratings', {
        method: 'POST',
        headers: { Origin: origins[0]! },
        body: '{}',
      })
    ).status,
  ).toBe(401);
});
it('rejects VODs, unapproved reasons, extra fields and invalid scores', async () => {
  for (const extra of [
    { score: 0 },
    { score: 11 },
    { score: 1.1 },
    { reasons: ['free text'] },
    { reasons: ['funny', 'funny'] },
    { replay: true },
    { streamKey: 'vod:123' },
  ])
    expect((await post(body('invalid', extra))).status).toBe(400);
});
it('four ratings reveal only the locked shape; replacement does not increase the count', async () => {
  const install = crypto.randomUUID();
  await post(body(), install);
  for (let i = 0; i < 3; i++) await post();
  expect((await read()).streams[0]!.rating).toEqual({
    locked: true,
    needed: 1,
  });
  await post(
    body('fan_test', { score: 4, reasons: ['too_many_ads'] }),
    install,
  );
  expect((await read()).streams[0]!.rating).toEqual({
    locked: true,
    needed: 1,
  });
  await post();
  const r = (await read()).streams[0]!.rating;
  expect(r.count).toBe(5);
  expect(r.average).toBe(7.2);
  expect(r.histogram).toEqual([0, 0, 0, 1, 0, 0, 0, 4, 0, 0]);
  expect(r.summary).toContain('too many ads');
  expect(JSON.stringify(r)).not.toContain(install);
});
it('requires a channel-specific signed owner token', async () => {
  expect(
    (await SELF.fetch('https://api.test/v1/channels/fan_test/ratings')).status,
  ).toBe(403);
  const token = await issueOwnerToken(env.WORKER_OWNER_KEY!, 'other', '123');
  expect(
    (
      await SELF.fetch('https://api.test/v1/channels/fan_test/ratings', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(403);
});
it('locks edits at 24h, deletes replacement hashes at 48h, and keeps only aggregates', async () => {
  const install = crypto.randomUUID();
  await post(body(), install);
  const stub = env.RATINGS.get(env.RATINGS.idFromName('fan_test'));
  await runInDurableObject(stub, async (_instance, state) => {
    const row = state.storage.sql
      .exec<{ data: string }>('SELECT data FROM rating_dedupe')
      .toArray()[0]!;
    const d = JSON.parse(row.data);
    d.first = Date.now() - RATING_DAY;
    state.storage.sql.exec(
      'UPDATE rating_dedupe SET data = ?',
      JSON.stringify(d),
    );
  });
  expect((await post(body('fan_test', { score: 2 }), install)).status).toBe(
    409,
  );
  await runInDurableObject(stub, async (_instance, state) => {
    const expires = Date.now() - 1;
    state.storage.sql.exec('UPDATE rating_dedupe SET expires = ?', expires);
    await state.storage.setAlarm(expires);
  });
  await runDurableObjectAlarm(stub);
  await runInDurableObject(stub, async (_instance, state) => {
    expect(
      state.storage.sql.exec('SELECT * FROM rating_dedupe').toArray(),
    ).toEqual([]);
    const rows = state.storage.sql
      .exec<{ data: string }>('SELECT data FROM rating_streams')
      .toArray();
    expect(JSON.parse(rows[0]!.data).count).toBe(1);
    expect(JSON.stringify(rows)).not.toContain(install);
    expect(JSON.stringify(rows)).not.toContain('203.0.113');
  });
  expect(await ratingHash(env.HMAC_KEY, install, 'a')).not.toBe(
    await ratingHash(env.HMAC_KEY, install, 'b'),
  );
});

it('limits anonymous installs and IP hashes in expiring memory only', () => {
  const rate = new RatingRateLimit();
  for (let i = 0; i < 12; i++)
    expect(rate.allow('install-hash', 12, 1000)).toBe(true);
  expect(rate.allow('install-hash', 12, 1000)).toBe(false);
  expect(rate.allow('install-hash', 12, 61000)).toBe(true);
});
it('retains the latest 30 streams and does not promote an old edited stream', async () => {
  const channel = 'retention';
  for (let i = 0; i < 32; i++)
    expect(
      (
        await post(
          body(channel, {
            streamKey: new Date(Date.UTC(2026, 10, 2, 0, i)).toISOString(),
          }),
        )
      ).status,
    ).toBe(204);
  const report = await read(channel);
  expect(report.streams).toHaveLength(30);
  expect(report.trend).toHaveLength(10);
  expect(report.streams[0]!.streamKey).toBe('2026-11-02T00:31:00.000Z');
  expect(report.streams.at(-1)!.streamKey).toBe('2026-11-02T00:02:00.000Z');
});
