import { expect, it } from 'vitest';
import {
  canRateStream,
  orderedReasons,
  ratingColor,
  ratingLocked,
  RatingRequestSchema,
  ratingStreamKey,
  ratingSummary,
  RATING_DAY,
} from './ratings';
it('accepts only whole scores and at most three known, distinct reasons for a live stream key', () => {
  const value = {
    channel: 'fan_test',
    streamKey: 'fan_test:2026-11-02',
    score: 8,
    reasons: ['funny', 'chill_vibes'],
  };
  expect(RatingRequestSchema.safeParse(value).success).toBe(true);
  for (const edit of [
    { score: 0 },
    { score: 11 },
    { score: 8.5 },
    { score: '8' },
    { reasons: ['other'] },
    { reasons: ['funny', 'funny'] },
    { reasons: ['funny', 'chill_vibes', 'good_chat', 'too_slow'] },
    { replay: true },
    { streamKey: 'vod:123' },
    { streamKey: 'other:2026-11-02' },
  ])
    expect(RatingRequestSchema.safeParse({ ...value, ...edit }).success).toBe(
      false,
    );
});
it('offers ratings only for a completed live local stream with ten minutes watched', () => {
  const live = {
    live: true,
    replay: false,
    durationSeconds: 600,
    source: 'local',
  };
  expect(canRateStream(live)).toBe(true);
  for (const edit of [
    { live: false },
    { replay: true },
    { durationSeconds: 599 },
    { saving: true },
    { source: 'fake' },
  ])
    expect(canRateStream({ ...live, ...edit })).toBe(false);
});
it('locks at 24h and keeps channel/day fallbacks stable across sessions', () => {
  expect(ratingLocked({ firstSubmittedAt: 1000 }, 1000 + RATING_DAY - 1)).toBe(
    false,
  );
  expect(ratingLocked({ firstSubmittedAt: 1000 }, 1000 + RATING_DAY)).toBe(
    true,
  );
  expect(
    ratingStreamKey('fan_test', undefined, Date.parse('2026-11-02T23:00:00Z')),
  ).toBe('fan_test:2026-11-02');
  expect(ratingStreamKey('fan_test', '2026-11-02T12:00:00Z')).toBe(
    '2026-11-02T12:00:00.000Z',
  );
});
it('orders reasons by score and suppresses negatives below 20 percent', () => {
  expect(orderedReasons(8)[0]).toBe('funny');
  expect(orderedReasons(3)[0]).toBe('too_slow');
  expect(
    ratingSummary(10, { funny: 7, chill_vibes: 5, too_many_ads: 1 }),
  ).not.toContain('ads');
  expect(
    ratingSummary(10, { funny: 7, chill_vibes: 5, too_many_ads: 2 }),
  ).toContain('too many ads');
  expect(ratingColor(4)).toBe('#FF5C5C');
  expect(ratingColor(7.8)).toBe('#FFD23F');
  expect(ratingColor(8)).toBe('#2EE6C5');
});
