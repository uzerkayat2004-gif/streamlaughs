import { describe, expect, it } from 'vitest';
import { CrowdStateSchema, parseChannel, visibleWords } from './index';

describe('Twitch channel parsing', () => {
  it.each([
    'https://www.twitch.tv/nightowl_tv',
    'https://www.twitch.tv/NightOwl_TV/?ref=home',
  ])('reads %s', (url) => expect(parseChannel(url)).toBe('nightowl_tv'));
  it.each([
    'https://www.twitch.tv/',
    'https://www.twitch.tv/directory',
    'https://www.twitch.tv/settings/profile',
    'https://www.twitch.tv/search?term=hi',
    'https://www.twitch.tv/videos/123',
    'https://www.twitch.tv/user/videos',
    'https://evil.test/nightowl_tv',
    'http://www.twitch.tv/nightowl_tv',
    'not a url',
  ])('excludes %s', (url) => expect(parseChannel(url)).toBeNull());
});
describe('three-person privacy floor', () => {
  const crowd = {
    channel: 'test',
    laughingNow: 8,
    laughlineViewers: 10,
    topWords: [
      { word: 'LMAO', count: 4 },
      { word: 'secret', count: 2 },
    ],
    updatedAt: 1,
  };
  it('hides a room with fewer than three viewers', () =>
    expect(visibleWords({ ...crowd, laughlineViewers: 2 })).toEqual([
      { word: '—', count: 0 },
    ]));
  it('hides fewer than three simultaneous reactions', () =>
    expect(visibleWords({ ...crowd, laughingNow: 2 })).toEqual([
      { word: '—', count: 0 },
    ]));
  it('only shows words with at least three contributors', () =>
    expect(visibleWords(crowd)).toEqual([{ word: 'LMAO', count: 4 }]));
  it('handles the boundary and missing data', () => {
    expect(
      visibleWords({ ...crowd, laughingNow: 3, laughlineViewers: 3 }),
    ).toHaveLength(1);
    expect(visibleWords(null)[0]?.word).toBe('—');
  });
  it('validates incoming crowd payloads', () =>
    expect(
      CrowdStateSchema.safeParse({ ...crowd, laughingNow: -1 }).success,
    ).toBe(false));
});
