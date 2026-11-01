import { z } from 'zod';
export function replayPage(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return null;
    if (['www.twitch.tv', 'twitch.tv', 'm.twitch.tv'].includes(u.hostname)) {
      if (/^\/videos\/\d+\/?$/.test(u.pathname))
        return {
          kind: 'vod' as const,
          url: `https://www.twitch.tv${u.pathname.replace(/\/$/, '')}`,
        };
      if (
        /^\/[a-zA-Z0-9_]{1,25}\/clip\/[A-Za-z0-9_-]{1,120}\/?$/.test(u.pathname)
      )
        return {
          kind: 'clip' as const,
          url: `https://clips.twitch.tv/${u.pathname.split('/')[3]}`,
        };
    }
    if (
      u.hostname === 'clips.twitch.tv' &&
      u.pathname === '/embed' &&
      /^[A-Za-z0-9_-]{1,120}$/.test(u.searchParams.get('clip') ?? '')
    )
      return {
        kind: 'clip' as const,
        url: `https://clips.twitch.tv/${u.searchParams.get('clip')}`,
      };
    if (
      u.hostname === 'clips.twitch.tv' &&
      /^\/[A-Za-z0-9_-]{1,120}\/?$/.test(u.pathname) &&
      !['/embed', '/create'].includes(u.pathname)
    )
      return {
        kind: 'clip' as const,
        url: `https://clips.twitch.tv${u.pathname.replace(/\/$/, '')}`,
      };
  } catch {}
  return null;
}
export const ReplaySchema = z.object({
  kind: z.enum(['vod', 'clip']),
  url: z
    .string()
    .max(240)
    .refine((s) => !!replayPage(s)),
  seconds: z.number().finite().min(0).max(604800),
  at: z.number().finite().nonnegative(),
  rate: z.number().min(0.25).max(4),
  paused: z.boolean(),
});
export type Replay = z.infer<typeof ReplaySchema>;
export const replayPosition = (r: Replay, ts: number) =>
  Math.max(
    0,
    Math.min(
      604800,
      r.seconds + (r.paused ? 0 : ((ts - r.at) / 1000) * r.rate),
    ),
  );
export const cleanChannel = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 25);
