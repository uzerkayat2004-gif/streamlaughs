import {
  CROWD_LIMITS,
  CrowdContributionSchema,
  CrowdPacketSchema,
} from '@laughline/shared';
import { expect, it } from 'vitest';
import { ChannelAggregation, MemoryRateLimit } from './aggregation';

const packet = (extra = {}) =>
  CrowdContributionSchema.parse({
    laughing: 0,
    intensity: 0,
    scream: 0,
    gasp: 0,
    hype: 0,
    swears: 0,
    phrases: [],
    ...extra,
  });
it('enforces the exact few packet and distinct contributor/phrase windows', () => {
  const room = new ChannelAggregation();
  room.accept(
    'a',
    packet({ laughing: 1, intensity: 2, phrases: ['bro', 'unknown', 'alice'] }),
    1000,
  );
  room.accept('b', packet({ phrases: ['bro'] }), 1000);
  expect(room.tick(1000)).toEqual({ state: 'few' });
  room.accept('a', packet({ phrases: ['bro'] }), 2000);
  expect(room.tick(2000)).toEqual({ state: 'few' });
  room.accept('c', packet({ phrases: ['bro'] }), 2000);
  expect(room.tick(2000)).toMatchObject({
    state: 'live',
    sharing: 3,
    laughingNow: 1,
    bubbles: [{ text: 'bro', count: 3 }],
  });
  for (const id of ['a', 'b', 'c']) room.accept(id, packet(), 6000);
  expect(room.tick(6000)).toMatchObject({ state: 'live', laughingNow: 0 });
  for (const id of ['a', 'b', 'c']) room.accept(id, packet(), 22001);
  expect(room.tick(22001)).toMatchObject({ state: 'live', bubbles: [] });
  room.remove('c');
  expect(room.tick(22001)).toEqual({ state: 'few' });
});
it('stores eligible minute-only summaries with phrase floors and server markers', () => {
  const room = new ChannelAggregation();
  for (const id of ['a', 'b', 'c'])
    room.accept(
      id,
      packet({ laughing: 1, intensity: 3, phrases: ['no way'], hype: 1 }),
      1000,
    );
  expect(CrowdPacketSchema.safeParse(room.tick(1000)).success).toBe(true);
  room.tick(60000);
  const rows = room.takeMinutes();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    minute: 0,
    contributors: 3,
    peakLaughingNow: 3,
    phrases: [{ text: 'no way', count: 3 }],
    moments: [
      expect.objectContaining({ kind: 'peak', ts: 1000 }),
      expect.objectContaining({ kind: 'spike' }),
    ],
  });
  expect(JSON.stringify(rows)).not.toMatch(
    /"id"|"token"|"ip"|transcript|audio/,
  );
  const few = new ChannelAggregation();
  few.accept('one', packet(), 1000);
  few.tick(60000);
  expect(few.takeMinutes()).toEqual([]);
});
it('limits memory and enforces one message per second across reconnects using the same token', () => {
  const rate = new MemoryRateLimit();
  expect(rate.allow('token', 0)).toBe(true);
  expect(rate.allow('token', 999)).toBe(false);
  expect(rate.allow('token', 1000)).toBe(true);
  for (let i = 0; i < 2000; i++) rate.allow(`id${i}`, 1000);
  expect(rate.size).toBe(CROWD_LIMITS.identities);
  expect(rate.allow('fresh', 62000)).toBe(true);
  expect(rate.size).toBe(1);
});
