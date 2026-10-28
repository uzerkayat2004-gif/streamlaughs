import { CrowdMinuteSchema } from '@laughline/shared';
import { expect, it } from 'vitest';
import { durationSeconds, streamStories, vodLink } from './stories';

const start = Date.UTC(2026, 9, 27, 12),
  vod = {
    id: '123',
    created_at: new Date(start).toISOString(),
    duration: '2h3m4s',
    title: 'a good night',
  };
const row = (minute: number, testTraffic = false) =>
  CrowdMinuteSchema.parse({
    minute,
    contributors: 4,
    peakLaughingNow: 3,
    averageLaughPercent: 75,
    phrases: [{ text: 'bro', count: 3 }],
    hype: 1,
    testTraffic,
    moments: [
      {
        ts: minute + 1000,
        kind: 'peak',
        laughingNow: 3,
        phrases: [{ text: 'no way', count: 3 }],
      },
    ],
  });
it('matches exact positive offsets and excludes missing, expired or late-started VODs', () => {
  expect(durationSeconds('2h3m4s')).toBe(7384);
  expect(durationSeconds('bad')).toBe(0);
  expect(vodLink(start + 3723000, [vod])).toEqual({
    url: 'https://www.twitch.tv/videos/123?t=1h2m3s',
    seconds: 3723,
  });
  expect(vodLink(start, [])).toBeNull();
  expect(vodLink(start - 1, [vod])).toBeNull();
  expect(vodLink(start + 7384000, [vod])).toBeNull();
  const late = {
    ...vod,
    id: '456',
    created_at: new Date(start + 60000).toISOString(),
  };
  expect(vodLink(start, [late])).toBeNull();
  expect(vodLink(start + 60000, [vod, late])?.seconds).toBe(0);
  expect(vodLink(start + 60000, [late, vod])?.url).toContain('/456?');
});
it('groups by archive, separates no-VOD activity gaps and test data, and ignores below-floor rows', () => {
  const real = [row(start), row(start + 60000), row(start + 2 * 3600000)];
  expect(streamStories(real, [vod])).toHaveLength(1);
  expect(streamStories(real, [])).toHaveLength(2);
  expect(
    streamStories([...real, row(start + 3 * 60000, true)], [vod]),
  ).toHaveLength(2);
  expect(streamStories([{ ...row(start), contributors: 2 }], [])).toEqual([]);
  const story = streamStories(
    [row(start), row(start), row(start + 60000)],
    [],
  )[0]!;
  expect(story.moments).toHaveLength(2);
  expect(story.moments[0]?.words).toEqual(['no way']);
  expect(story.words).toEqual(['bro']);
  expect(story.approximate).toBe(true);
});
it('limits chart data and moment cards without claiming unique viewers across minutes', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => row(start + i * 60000));
  const story = streamStories(rows, [])[0]!;
  expect(story.wave.length).toBeLessThanOrEqual(240);
  expect(story.moments).toHaveLength(3);
  expect(story.peak).toBe(3);
});
