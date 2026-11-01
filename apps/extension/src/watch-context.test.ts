import { parseChannel } from '@laughline/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { resolveWatchContext, pageWatchContext } from './watch-context';
afterEach(() => vi.unstubAllGlobals());
it.each([
  ['https://www.twitch.tv/grimm', 'grimm'],
  ['https://twitch.tv/grimm', 'grimm'],
  ['https://m.twitch.tv/grimm', 'grimm'],
  ['https://www.twitch.tv/Grimm/?ref=home', 'grimm'],
  ['https://twitch.tv/grimm#chat', 'grimm'],
  ['https://m.twitch.tv/nightowl_tv', 'nightowl_tv'],
  ['https://www.twitch.tv/directory', null],
  ['https://www.twitch.tv/settings/profile', null],
  ['https://www.twitch.tv/search?term=grimm', null],
  ['https://www.twitch.tv/', null],
  ['https://evil.test/grimm', null],
  ['https://www.twitch.tv.evil.test/grimm', null],
  ['http://www.twitch.tv/grimm', null],
  ['https://www.twitch.tv/videos/1234', null],
])('matches the real channel URL %s', (url, channel) =>
  expect(parseChannel(url)).toBe(channel),
);
it('repairs a pre-install VOD tab by injecting then asking the content script for its channel', async () => {
  const sendMessage = vi
    .fn()
    .mockRejectedValueOnce(new Error('Receiving end does not exist'))
    .mockResolvedValue({ onTwitch: true, channel: 'grimm', isLive: false });
  const executeScript = vi.fn(async () => []);
  vi.stubGlobal('chrome', {
    tabs: { sendMessage },
    scripting: { executeScript },
    runtime: {
      getManifest: () => ({
        content_scripts: [{ js: ['content-scripts/twitch.js'] }],
      }),
    },
  });
  expect(
    await resolveWatchContext({
      id: 4,
      url: 'https://www.twitch.tv/videos/12345',
    }),
  ).toMatchObject({ onTwitch: true, channel: 'grimm', isLive: false });
  expect(executeScript).toHaveBeenCalledWith({
    target: { tabId: 4 },
    files: ['content-scripts/twitch.js'],
  });
  expect(sendMessage).toHaveBeenCalledTimes(2);
});
it('can resolve the content-script context even if tabs.query omits url', async () => {
  vi.stubGlobal('chrome', {
    tabs: {
      sendMessage: vi.fn(async () => ({
        onTwitch: true,
        channel: 'grimm',
        isLive: true,
      })),
    },
  });
  expect((await resolveWatchContext({ id: 4 })).channel).toBe('grimm');
});

it('reads a VOD owner only from the video owner header, not a recommendation', () => {
  const doc = {
    querySelector: (selector: string) =>
      selector.startsWith('a[data-a-target="video-info-user-name"]')
        ? { href: 'https://www.twitch.tv/grimm', textContent: 'Grimm' }
        : null,
  };
  expect(
    pageWatchContext(
      'https://www.twitch.tv/videos/12345',
      doc as Pick<Document, 'querySelector'>,
    ),
  ).toMatchObject({ onTwitch: true, channel: 'grimm', isLive: false });
});
it('keeps a missing tab URL and missing receiver as unknown instead of claiming non-Twitch', async () => {
  vi.stubGlobal('chrome', {
    tabs: {
      sendMessage: async () => {
        throw new Error('no receiver');
      },
    },
    runtime: { getManifest: () => ({}) },
  });
  expect(await resolveWatchContext({ id: 4 })).toMatchObject({
    unknown: true,
    channel: null,
  });
});
