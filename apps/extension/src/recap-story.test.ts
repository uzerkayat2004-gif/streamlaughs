import { createRecap, MySessionSchema } from '@laughline/shared';
import { expect, it } from 'vitest';
import { groupHistory } from './history';
import { biggestMinute, momentLink, sparkline, storyData } from './recap-story';
const saved = (laughs = 23) =>
  MySessionSchema.parse({
    id: 'now',
    channel: 'grimm',
    tabId: 1,
    startedAt: 100000,
    endedAt: 4420000,
    laughCount: laughs,
    laughEvents: laughs
      ? [2530000, 2536000, 2542000, 2554000, 2560000, 2588000, 2700000].map(
          (at) => ({ at, crowd: 0 }),
        )
      : [],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: [],
    source: 'local',
  });
it('finds the busiest rolling minute from actual timestamps, excluding the 60-second boundary', () => {
  expect(biggestMinute(saved())).toEqual({ seconds: 2430, count: 6 });
  const s = saved();
  s.laughEvents = [
    { at: 100000, crowd: 0 },
    { at: 160000, crowd: 0 },
  ];
  expect(biggestMinute(s)?.count).toBe(1);
  expect(biggestMinute()).toBeNull();
});
it('skips unavailable facts and never turns fan peaks into fan totals or coincidence', () => {
  const s = saved(),
    r = createRecap(s, s.endedAt!);
  r.crowdSummary = {
    source: 'live',
    samples: 50,
    peakSharing: 18,
    peakLaughingNow: 12,
    peakLaughPercent: 67,
    testTraffic: false,
  };
  const d = storyData(r, s, groupHistory([s], [r])[0]);
  expect(d.slides).toEqual(['intro', 'laughs', 'moment', 'history', 'final']);
  expect(d.perHour).toBe(19);
  expect(d.aboveUsual).toBeUndefined();
});
it('shows exactly one mic-check story for zero laughs and words', () => {
  const s = saved(0),
    r = createRecap(s, s.endedAt!);
  expect(storyData(r, s).slides).toEqual(['empty']);
});
it('shows only positive reaction chips, safe top three words and cumulative history up to this stream', () => {
  const s = saved();
  s.topWords = [
    { word: 'bro', count: 3 },
    { word: 'lets go', count: 6 },
    { word: 'wow', count: 2 },
    { word: 'alice private name', count: 90 },
  ];
  s.personal.hype = 2;
  const r = createRecap(s, s.endedAt!),
    old = { ...s, id: 'old', startedAt: 1, endedAt: 60001, laughCount: 18 },
    future = {
      ...s,
      id: 'future',
      startedAt: 9000000,
      endedAt: 9060000,
      laughCount: 99,
    };
  const d = storyData(
    r,
    s,
    groupHistory(
      [s, old, future],
      [r, createRecap(old, 60001), createRecap(future, 9060000)],
    )[0],
  );
  expect(d.words.map((w) => w.word)).toEqual(['lets go', 'bro', 'wow']);
  expect(d.chips).toEqual([[2, 'hype shouts']]);
  expect(d.ordinal).toBe('2nd');
  expect(d.together).toBe(41);
  expect(d.aboveUsual).toBe(5);
});
it('matches public VOD metadata locally and never invents a replay outside its actual duration', () => {
  const profile = {
    login: 'grimm',
    displayName: 'Grimm',
    vods: [
      { id: '123', created_at: '2026-10-30T10:00:00Z', duration: '1h2m3s' },
    ],
  };
  const start = Date.parse('2026-10-30T10:05:00Z');
  expect(momentLink(start, 60, profile)).toBe(
    'https://www.twitch.tv/videos/123?t=0h6m0s',
  );
  expect(momentLink(start, 4000, profile)).toBeNull();
  expect(momentLink(start, 60)).toBeNull();
  expect(momentLink(start - 600000, 10, profile)).toBeNull();
});
it('sparkline bins represent each saved stream’s own timestamps', () => {
  expect(sparkline([0, 1, 2], 60)).not.toBe(sparkline([45, 46, 47], 60));
  expect(sparkline([], 60)).toContain(',30');
});
