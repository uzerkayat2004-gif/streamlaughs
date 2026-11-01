import { parseChannel } from '@laughline/shared';
import { z } from 'zod';
export const WatchContextSchema = z.object({
  onTwitch: z.boolean(),
  channel: z
    .string()
    .regex(/^[a-z0-9_]{1,25}$/)
    .nullable(),
  isLive: z.boolean(),
  displayName: z.string().max(100).optional(),
});
export type WatchContext = z.infer<typeof WatchContextSchema>;
export function twitchPage(url: string) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      ['www.twitch.tv', 'twitch.tv', 'm.twitch.tv'].includes(u.hostname) &&
      (!!parseChannel(url) || /^\/videos\/\d+\/?$/.test(u.pathname))
    );
  } catch {
    return false;
  }
}
export function pageWatchContext(
  url = location.href,
  doc: Pick<Document, 'querySelector'> = document,
): WatchContext {
  const onTwitch = twitchPage(url);
  let channel = parseChannel(url);
  if (onTwitch && !channel) {
    const link = doc.querySelector<HTMLAnchorElement>(
      'a[data-a-target="video-info-user-name"], [data-a-target="video-info-header"] a[data-a-target="channel-header-link"], [data-test-selector="video-info-header"] a[data-a-target="video-info-user-name"]',
    );
    if (link?.href) channel = parseChannel(link.href);
  }
  const name = doc
    .querySelector(
      '[data-a-target="channel-header-display-name"],a[data-a-target="video-info-user-name"]',
    )
    ?.textContent?.trim()
    .slice(0, 100);
  return {
    onTwitch,
    channel,
    isLive:
      !!channel && !/\/videos\/\d+/.test(url) && !!doc.querySelector('video'),
    displayName: name || channel || undefined,
  };
}
export async function resolveWatchContext(
  tab: Pick<chrome.tabs.Tab, 'id' | 'url'>,
): Promise<WatchContext> {
  const fallback = {
    onTwitch: twitchPage(tab.url ?? ''),
    channel: parseChannel(tab.url ?? ''),
    isLive: false,
  };
  if (tab.id === undefined || (tab.url && !twitchPage(tab.url)))
    return fallback;
  const ask = async () =>
    WatchContextSchema.parse(
      await chrome.tabs.sendMessage(tab.id!, { type: 'GET_WATCH_CONTEXT' }),
    );
  try {
    return await ask();
  } catch {
    /* Pre-install/update tabs need a fresh receiver. */
  }
  if (tab.url && !twitchPage(tab.url)) return fallback;
  try {
    const files = (chrome.runtime.getManifest().content_scripts ?? []).flatMap(
      (s) => s.js ?? [],
    );
    if (!files.length) return fallback;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
    return await ask();
  } catch {
    return fallback;
  }
}
