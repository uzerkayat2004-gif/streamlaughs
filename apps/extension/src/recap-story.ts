import {
  isApprovedPhrase,
  type MySession,
  type Recap,
} from '@laughline/shared';
import type { StreamerHistory, StreamerProfile } from './history';
export const STORY_COLORS = [
  '#FFD23F',
  '#FF5C5C',
  '#2EE6C5',
  '#FFEAA0',
  '#FF9898',
  '#95F3E2',
  '#FFD23F',
];
export const duration = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : s >= 60
      ? `${Math.floor(s / 60)}m`
      : `${Math.floor(s)}s`;
export const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`;
/** Absolute event timestamps from the saved local session; never estimated from peaks. */
export function biggestMinute(session?: MySession) {
  if (!session?.laughEvents.length) return null;
  const times = session.laughEvents
    .map((e) => e.at)
    .filter((t) => t >= session.startedAt && t <= (session.endedAt ?? Infinity))
    .sort((a, b) => a - b);
  let left = 0,
    best = { seconds: 0, count: 0 };
  for (let right = 0; right < times.length; right++) {
    while (times[right]! - times[left]! >= 60000) left++;
    const count = right - left + 1;
    if (count > best.count)
      best = {
        seconds: Math.floor((times[left]! - session.startedAt) / 1000),
        count,
      };
  }
  return best.count ? best : null;
}
export function storyData(
  recap: Recap,
  session?: MySession,
  group?: StreamerHistory,
) {
  const words = (
    session?.topWords ?? [{ word: recap.topWord, count: recap.wordCount }]
  )
    .filter((w) => w.count > 0 && isApprovedPhrase(w.word))
    .sort((a, b) => b.count - a.count || b.word.length - a.word.length)
    .slice(0, 3);
  const chips = [
    [recap.hype, 'hype shouts'],
    [recap.gasps, 'gasps'],
    [recap.screams, 'screams'],
    [recap.swears, 'masked swears'],
  ].filter(([n]) => Number(n) > 0);
  const streams = (group?.streams ?? [])
    .filter((s) => s.startedAt <= (recap.startedAt ?? recap.createdAt))
    .sort((a, b) => a.startedAt - b.startedAt);
  const prior = streams.filter((s) => s.id !== recap.sessionId);
  const seconds =
    recap.durationSeconds ??
    (session
      ? ((session.endedAt ?? session.startedAt) - session.startedAt) / 1000
      : 0);
  const empty = !recap.totalLaughs && !words.length && !recap.swears;
  const moment = biggestMinute(session);
  // The server publishes concurrent snapshots, not unique fan totals or personal coincidence.
  // Those facts cannot be reconstructed from CrowdSummary peaks; skip that story.
  const slides = empty
    ? ['empty']
    : ([
        seconds > 0 && 'intro',
        recap.totalLaughs > 0 && 'laughs',
        moment && 'moment',
        (words.length || chips.length) && 'words',
        streams.length && 'history',
        'final',
      ].filter(Boolean) as string[]);
  return {
    words,
    chips,
    seconds,
    empty,
    moment,
    streams,
    slides,
    ordinal: streams.length ? ordinal(streams.length) : undefined,
    together: streams.reduce((n, s) => n + s.laughs, 0),
    perHour:
      seconds > 0
        ? Math.round((recap.totalLaughs * 3600) / seconds)
        : undefined,
    aboveUsual: prior.length
      ? Math.round(
          recap.totalLaughs -
            prior.reduce((n, s) => n + s.laughs, 0) / prior.length,
        )
      : undefined,
  };
}
export function momentLink(
  start: number,
  seconds: number,
  profile?: StreamerProfile,
) {
  const at = start + seconds * 1000;
  const parse = (s: string) => {
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
    return m && m[0]
      ? (+m[1]! || 0) * 3600 + (+m[2]! || 0) * 60 + (+m[3]! || 0)
      : 0;
  };
  const vod = profile?.vods
    ?.filter(
      (v) =>
        /^\d+$/.test(v.id) &&
        Date.parse(v.created_at) <= at &&
        Date.parse(v.created_at) + parse(v.duration) * 1000 > at,
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!vod) return null;
  const offset = Math.floor((at - Date.parse(vod.created_at)) / 1000);
  return `https://www.twitch.tv/videos/${vod.id}?t=${Math.floor(offset / 3600)}h${Math.floor((offset % 3600) / 60)}m${offset % 60}s`;
}
export function sparkline(times: number[], seconds: number, bins = 24) {
  const counts = Array.from({ length: bins }, () => 0);
  for (const at of times)
    if (at >= 0 && at <= seconds)
      counts[
        Math.min(bins - 1, Math.floor((at / Math.max(1, seconds)) * bins))
      ]!++;
  const peak = Math.max(1, ...counts);
  return counts
    .map((n, i) => `${(i / (bins - 1)) * 160},${30 - (n / peak) * 26}`)
    .join(' ');
}
