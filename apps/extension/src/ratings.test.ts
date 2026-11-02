import 'fake-indexeddb/auto';
import { createRecap, MySessionSchema, RATING_DAY } from '@laughline/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from './db';
import { groupHistory } from './history';
import { storyData } from './recap-story';
import { sendStreamRating } from './ratings';
let settings = { sendRatings: true };
let now = Date.UTC(2026, 10, 2, 12);
const session = () =>
  MySessionSchema.parse({
    id: 'rated-session',
    channel: 'fan_test',
    tabId: 1,
    live: true,
    streamKey: 'fan_test:2026-11-02',
    startedAt: now - 600000,
    endedAt: now,
    laughCount: 1,
    laughEvents: [],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: [],
    source: 'local',
  });
beforeEach(async () => {
  await Promise.all([
    db.sessions.clear(),
    db.recaps.clear(),
    db.ratings.clear(),
  ]);
  settings = { sendRatings: true };
  now = Date.UTC(2026, 10, 2, 12);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const saved: Record<string, string> = {};
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, fn: () => Promise<unknown>) => fn(),
    },
  });
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn(async () => ({ ok: true, state: { settings } })),
    },
    storage: {
      local: {
        get: vi.fn(async () => saved),
        set: vi.fn(async (value: Record<string, string>) =>
          Object.assign(saved, value),
        ),
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  await db.sessions.put(session());
  await db.recaps.put(createRecap(session(), now));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('adds the rating slide immediately before final only for eligible live sessions', () => {
  const s = session(),
    r = createRecap(s, now);
  expect(storyData(r, s).slides.slice(-2)).toEqual(['rating', 'final']);
  for (const edit of [
    { live: false },
    { replay: true },
    { durationSeconds: 599 },
  ])
    expect(storyData({ ...r, ...edit }, s).slides).not.toContain('rating');
  expect(storyData(r, s, undefined, false).slides).not.toContain('rating');
});
it('sends only the strict anonymous payload and stores the score in local history', async () => {
  const rating = await sendStreamRating(
    'rated-session',
    8,
    ['funny', 'chill_vibes'],
    'https://api.test',
  );
  const call = vi.mocked(fetch).mock.calls[0]!;
  expect(call[0]).toBe('https://api.test/v1/ratings');
  expect(JSON.parse(call[1]!.body as string)).toEqual({
    channel: 'fan_test',
    streamKey: 'fan_test:2026-11-02',
    score: 8,
    reasons: ['funny', 'chill_vibes'],
  });
  expect(await db.ratings.get(rating.id)).toMatchObject({ score: 8 });
  const s = (await db.sessions.get('rated-session'))!,
    r = (await db.recaps.get('rated-session'))!;
  expect(s.rating).toBe(8);
  expect(groupHistory([s], [r])[0]!.streams[0]!.recap.rating).toBe(8);
});
it('the settings toggle and VOD eligibility gate prevent all network writes', async () => {
  settings.sendRatings = false;
  await expect(
    sendStreamRating('rated-session', 8, [], 'https://api.test'),
  ).rejects.toThrow('ratings are off');
  settings.sendRatings = true;
  await db.recaps.update('rated-session', { replay: true });
  await expect(
    sendStreamRating('rated-session', 8, [], 'https://api.test'),
  ).rejects.toThrow('live streams');
  expect(fetch).not.toHaveBeenCalled();
});
it('replaces a local rating for 24 hours without moving its lock time', async () => {
  const first = await sendStreamRating(
    'rated-session',
    8,
    [],
    'https://api.test',
  );
  now += 3600000;
  const second = await sendStreamRating(
    'rated-session',
    7,
    ['too_many_ads'],
    'https://api.test',
  );
  expect(second.firstSubmittedAt).toBe(first.firstSubmittedAt);
  expect(await db.ratings.count()).toBe(1);
  now = first.firstSubmittedAt + RATING_DAY;
  await expect(
    sendStreamRating('rated-session', 9, [], 'https://api.test'),
  ).rejects.toThrow('locked');
  expect(fetch).toHaveBeenCalledTimes(2);
});
