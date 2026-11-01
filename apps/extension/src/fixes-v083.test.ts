import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { pageWatchContext } from './watch-context';
import { extractWords } from './inference/rules';
import {
  applyPersonalEvent,
  initialSnapshot,
  MySessionSchema,
  SnapshotSchema,
} from '@laughline/shared';
import {
  cleanChannel,
  replayPage,
  replayPosition,
  sessionWord,
} from '@laughline/shared';
import { clearToolbar } from './toolbar';
import { vi } from 'vitest';
it('clears global and every per-tab badge/icon override without setting a badge background', async () => {
  const badge = vi.fn(async (_p: { text: string; tabId?: number }) => {}),
    icon = vi.fn(async () => {});
  vi.stubGlobal('chrome', {
    action: { setBadgeText: badge, setIcon: icon },
    tabs: { query: async () => [{ id: 4 }, { id: 9 }] },
  });
  await clearToolbar();
  expect(badge.mock.calls.map(([p]) => p)).toEqual([
    { text: '' },
    { tabId: 4, text: '' },
    { tabId: 9, text: '' },
  ]);
  expect(icon).toHaveBeenCalledTimes(3);
  vi.unstubAllGlobals();
});
it('sanitizes fallback logins and identifies VODs/clips without trusting other origins', () => {
  expect(cleanChannel('  @VerNoFPS! ')).toBe('vernofps');
  expect(cleanChannel('a'.repeat(40))).toHaveLength(25);
  expect(replayPage('https://www.twitch.tv/videos/123')?.kind).toBe('vod');
  expect(replayPage('https://www.twitch.tv/vernofps/clip/GoodClip')?.url).toBe(
    'https://clips.twitch.tv/GoodClip',
  );
  expect(replayPage('https://clips.twitch.tv/embed?clip=GoodClip')?.url).toBe(
    'https://clips.twitch.tv/GoodClip',
  );
  expect(replayPage('https://twitch.tv.evil.test/videos/123')).toBeNull();
});
it('uses the whole session for repeated words, otherwise the latest word', () => {
  const s = {
    topWords: [
      { word: 'bro', count: 1 },
      { word: 'wow', count: 1 },
    ],
    wordEvents: [
      { word: 'wow', at: 1 },
      { word: 'bro', at: 2 },
    ],
  };
  expect(sessionWord(s)?.word).toBe('bro');
  s.topWords[1]!.count = 2;
  expect(sessionWord(s)?.word).toBe('wow');
});
it('records replay moment positions correctly after seeking, changing speed and pausing', () => {
  const replay = {
    kind: 'vod' as const,
    url: 'https://www.twitch.tv/videos/123',
    seconds: 600,
    at: 1000,
    rate: 2,
    paused: false,
  };
  expect(replayPosition(replay, 2000)).toBe(602);
  expect(replayPosition({ ...replay, paused: true }, 2000)).toBe(600);
  const session = MySessionSchema.parse({
    id: 'r',
    channel: 'vernofps',
    tabId: 1,
    startedAt: 1,
    endedAt: null,
    laughCount: 0,
    laughEvents: [],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: [],
    source: 'local',
    replay,
  });
  const next = applyPersonalEvent(
    session,
    { kind: 'laugh', ts: 2000, confidence: 0.9, intensity: 2 },
    0,
  );
  expect(next.laughEvents[0]?.mediaAt).toBe(602);
});
it('keeps panel updates valid when an approved ASR label exceeds the new timing-field length', () => {
  const session = MySessionSchema.parse({
    id: 's',
    channel: 'vernofps',
    tabId: 1,
    startedAt: 1,
    endedAt: null,
    laughCount: 0,
    laughEvents: [],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: [],
    source: 'local',
  });
  const word = 'unbelievably extraordinary uncontrollably';
  expect(word.length).toBeGreaterThan(40);
  const next = applyPersonalEvent(
    session,
    { kind: 'words', ts: 10, phrases: [{ text: word, count: 1, class: 'ok' }] },
    0,
  );
  expect(
    SnapshotSchema.safeParse({
      ...initialSnapshot(),
      session: next,
      status: 'recording',
    }).success,
  ).toBe(true);
});
it('resolves a replay owner from page metadata when current Twitch owner selectors are absent', () => {
  const doc = {
    querySelector: (selector: string) =>
      selector.includes('name="author"') ? { content: 'vernofps' } : null,
  };
  expect(
    pageWatchContext(
      'https://www.twitch.tv/videos/12345',
      doc as Pick<Document, 'querySelector'>,
    ),
  ).toMatchObject({ channel: 'vernofps', replay: true });
});
it('counts case, punctuation, repeated letters and common neutral Hinglish reactions', () => {
  const words = extractWords(
    'BROOOO! Bhai! bhaiya, arre kya yaar oye wah hahaha LOL LMAO no way OMG lets go sheeesh.',
  );
  for (const word of [
    'bro',
    'bhai',
    'bhaiya',
    'arre',
    'kya',
    'yaar',
    'oye',
    'wah',
    'haha',
    'lol',
    'lmao',
    'no way',
    'omg',
    'lets go',
    'sheesh',
  ])
    expect(words.phrases.some((p) => p.text === word)).toBe(true);
});
it('gives the popup jelly its own transform animation, separate from dot shadows', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  expect(names.filter((n) => n === 'calm-breath')).toHaveLength(1);
  expect(css).toContain('@keyframes jelly-idle');
  expect(css).toContain('.streamer-card:hover,');
});

it('counts complete reactions once, including phrases containing ordinary stopwords, and never turns private words into labels', () => {
  const result = extractWords(
    "Oh my god! no way. Let's go. broooo Alice account password",
  );
  expect(result.phrases.filter((p) => p.class === 'ok')).toEqual([
    { text: 'oh my god', count: 1, class: 'ok' },
    { text: 'no way', count: 1, class: 'ok' },
    { text: 'lets go', count: 1, class: 'ok' },
    { text: 'bro', count: 1, class: 'ok' },
  ]);
  expect(result.matched).toBe(4);
  expect(result.rejected).toBeGreaterThan(0);
  expect(extractWords('we are good').phrases).not.toContainEqual({
    text: 'arre',
    count: 1,
    class: 'ok',
  });
});
