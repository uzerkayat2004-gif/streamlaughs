import { parseChannel, replayPage, cleanChannel } from '@laughline/shared';
import { z } from 'zod';
export const WatchContextSchema = z.object({
  onTwitch: z.boolean(),
  channel: z
    .string()
    .regex(/^[a-z0-9_]{1,25}$/)
    .nullable(),
  isLive: z.boolean(),
  streamStartedAt: z.string().optional(),
  displayName: z.string().max(100).optional(),
  unknown: z.boolean().optional(),
  replay: z.boolean().optional(),
  seconds: z.number().finite().nonnegative().optional(),
  rate: z.number().min(0.25).max(4).optional(),
  paused: z.boolean().optional(),
});
export type WatchContext = z.infer<typeof WatchContextSchema>;
export function twitchPage(url: string) {
  return !!parseChannel(url) || !!replayPage(url);
}
export function pageWatchContext(
  url = location.href,
  doc: Pick<Document, 'querySelector'> = document,
): WatchContext {
  const replay = replayPage(url),
    onTwitch = twitchPage(url);
  let channel = parseChannel(url);
  if (replay) {
    for (const selector of [
      'a[data-a-target="video-info-user-name"]',
      '[data-a-target="video-info-header"] a[data-a-target="channel-header-link"]',
      '[data-test-selector="video-info-header"] a[data-a-target="video-info-user-name"]',
      '[data-a-target="video-info-header"] a[href]',
      '[data-test-selector="clip-info-card"] a[href]',
      'a[data-test-selector="clip-broadcaster"]',
      '.channel-info-content a[href]',
    ]) {
      const link = doc.querySelector<HTMLAnchorElement>(selector);
      const login = link?.href ? parseChannel(link.href) : null;
      if (login) {
        channel = login;
        break;
      }
    }
    if (!channel) {
      for (const selector of [
        'meta[name="author"]',
        'meta[property="video:actor"]',
      ]) {
        const value =
          doc.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? '';
        const login =
          parseChannel(value) ||
          (/^@?[A-Za-z0-9_]{1,25}$/.test(value) ? cleanChannel(value) : null);
        if (login) {
          channel = login;
          break;
        }
      }
    }
    if (!channel) {
      try {
        const raw =
          doc.querySelector('script[type="application/ld+json"]')
            ?.textContent ?? '';
        if (raw.length < 50000) {
          const parsed = JSON.parse(raw);
          const nodes = Array.isArray(parsed)
            ? parsed
            : (parsed['@graph'] ?? [parsed]);
          for (const node of nodes.slice(0, 32)) {
            const author = node.author ?? node.creator;
            const person = Array.isArray(author) ? author[0] : author;
            const candidate = person?.url ?? person?.name ?? '';
            if (typeof candidate === 'string') {
              const login =
                parseChannel(candidate) ||
                (/^@?[A-Za-z0-9_]{1,25}$/.test(candidate)
                  ? cleanChannel(candidate)
                  : null);
              if (login) {
                channel = login;
                break;
              }
            }
          }
        }
      } catch {}
    }
    if (!channel) {
      const description =
        doc.querySelector<HTMLMetaElement>('meta[property="og:description"]')
          ?.content ?? '';
      const match =
        /^Watch ([A-Za-z0-9_]{1,25})(?:'s|â€™s) (?:clip|video|stream)/i.exec(
          description,
        );
      if (match) channel = cleanChannel(match[1]!);
      const clip =
        /^https:\/\/www\.twitch\.tv\/([A-Za-z0-9_]{1,25})\/clip\//.exec(url);
      if (!channel && clip) channel = cleanChannel(clip[1]!);
    }
  }
  const name = doc
    .querySelector(
      '[data-a-target="channel-header-display-name"],a[data-a-target="video-info-user-name"]',
    )
    ?.textContent?.trim()
    .slice(0, 100);
  let streamStartedAt: string | undefined;
  if (!replay) {
    const meta = doc.querySelector<HTMLMetaElement>(
      'meta[property="video:release_date"]',
    )?.content;
    if (meta && Number.isFinite(Date.parse(meta)))
      streamStartedAt = new Date(meta).toISOString();
    if (!streamStartedAt)
      try {
        const raw =
          doc.querySelector('script[type="application/ld+json"]')
            ?.textContent ?? '';
        if (raw.length < 50000) {
          const parsed = JSON.parse(raw),
            nodes = Array.isArray(parsed)
              ? parsed
              : (parsed['@graph'] ?? [parsed]);
          for (const node of nodes.slice(0, 32)) {
            const publication = Array.isArray(node.publication)
              ? node.publication
              : [node.publication];
            for (const item of publication)
              if (
                item?.isLiveBroadcast === true &&
                typeof item.startDate === 'string' &&
                Number.isFinite(Date.parse(item.startDate))
              )
                streamStartedAt = new Date(item.startDate).toISOString();
          }
        }
      } catch {}
  }
  const video = doc.querySelector<HTMLVideoElement>('video');
  return {
    onTwitch,
    streamStartedAt,
    channel,
    isLive: !!channel && !replay && !!video,
    displayName: name || channel || undefined,
    replay: !!replay,
    ...(replay && video
      ? {
          seconds: Number.isFinite(video.currentTime) ? video.currentTime : 0,
          rate: Math.max(0.25, Math.min(4, video.playbackRate || 1)),
          paused: video.paused,
        }
      : {}),
  };
}
export async function resolveWatchContext(
  tab: Pick<chrome.tabs.Tab, 'id' | 'url'>,
): Promise<WatchContext> {
  const replay = !!replayPage(tab.url ?? '');
  const fallback = {
    onTwitch: twitchPage(tab.url ?? ''),
    channel: parseChannel(tab.url ?? ''),
    isLive: false,
    unknown: !tab.url,
    replay,
  };
  if (tab.id === undefined || (tab.url && !twitchPage(tab.url)))
    return fallback;
  const ask = async () =>
    WatchContextSchema.parse(
      await chrome.tabs.sendMessage(tab.id!, { type: 'GET_WATCH_CONTEXT' }),
    );
  try {
    return await ask();
  } catch {}
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
