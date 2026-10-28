import { type CrowdMinute, CrowdMinuteSchema } from '@laughline/shared';
import type { Vod } from './twitch';
export function durationSeconds(duration: string) {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(duration);
  if (!match?.slice(1).some(Boolean)) return 0;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}
export function vodAt(ts: number, vods: Vod[]) {
  return (
    vods
      .filter(
        (v) =>
          /^\d+$/.test(v.id) &&
          Date.parse(v.created_at) <= ts &&
          ts < Date.parse(v.created_at) + durationSeconds(v.duration) * 1000,
      )
      .sort(
        (a, b) =>
          Date.parse(b.created_at) - Date.parse(a.created_at) ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
export function vodLink(ts: number, vods: Vod[]) {
  const vod = vodAt(ts, vods);
  if (!vod) return null;
  const seconds = Math.floor((ts - Date.parse(vod.created_at)) / 1000);
  return {
    url: `https://www.twitch.tv/videos/${vod.id}?t=${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m${seconds % 60}s`,
    seconds,
  };
}
export type Moment = {
  ts: number;
  laughingNow: number;
  words: string[];
  minuteWords: boolean;
  test: boolean;
  vod: { url: string; seconds: number } | null;
};
export type StreamStory = {
  id: string;
  title: string;
  start: number;
  end: number;
  approximate: boolean;
  test: boolean;
  peak: number;
  words: string[];
  wave: number[];
  moments: Moment[];
};
export function streamStories(
  input: CrowdMinute[],
  vods: Vod[],
): StreamStory[] {
  const rows = [
    ...new Map(
      input
        .filter((r) => CrowdMinuteSchema.safeParse(r).success)
        .map((r) => [r.minute, r]),
    ).values(),
  ].sort((a, b) => a.minute - b.minute);
  const groups = new Map<string, CrowdMinute[]>();
  let unmatched = 0,
    last: CrowdMinute | undefined;
  for (const row of rows) {
    const vod = vodAt(row.minute, vods);
    if (
      !vod &&
      (!last ||
        row.minute - last.minute > 30 * 60000 ||
        last.testTraffic !== row.testTraffic ||
        vodAt(last.minute, vods))
    )
      unmatched++;
    const id = `${vod ? `vod-${vod.id}` : `activity-${unmatched}`}-${row.testTraffic ? 'test' : 'real'}`;
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
    last = row;
  }
  return [...groups]
    .map(([id, minutes]) => {
      const words = new Map<string, number>();
      for (const row of minutes)
        for (const p of row.phrases)
          words.set(p.text, (words.get(p.text) ?? 0) + p.count);
      const ranked = minutes
        .flatMap((row) =>
          row.moments.map((m) => ({
            ts: m.ts,
            laughingNow: m.laughingNow,
            words: (m.phrases ?? row.phrases).slice(0, 3).map((p) => p.text),
            minuteWords: m.phrases === undefined,
            test: row.testTraffic,
            vod: vodLink(m.ts, vods),
          })),
        )
        .sort((a, b) => b.laughingNow - a.laughingNow || a.ts - b.ts);
      const moments: Moment[] = [];
      for (const m of ranked)
        if (
          moments.length < 3 &&
          !moments.some((old) => Math.abs(old.ts - m.ts) < 60000)
        )
          moments.push(m);
      const wave: number[] = [];
      const bucket = Math.max(1, Math.ceil(minutes.length / 240));
      for (let i = 0; i < minutes.length; i += bucket)
        wave.push(
          Math.max(
            ...minutes.slice(i, i + bucket).map((r) => r.peakLaughingNow),
          ),
        );
      const vod = vodAt(minutes[0]!.minute, vods);
      return {
        id,
        title: vod?.title || 'a night with your crowd',
        start: minutes[0]!.minute,
        end: minutes.at(-1)!.minute + 60000,
        approximate: !vod,
        test: minutes.some((r) => r.testTraffic),
        peak: Math.max(...minutes.map((r) => r.peakLaughingNow)),
        words: [...words]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 8)
          .map(([word]) => word),
        wave,
        moments: moments.sort((a, b) => a.ts - b.ts),
      };
    })
    .sort((a, b) => b.start - a.start);
}
