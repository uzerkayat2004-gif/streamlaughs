import type { StreamStory } from './stories';

// Clearly-fake sample nights for the public /demo dashboard.
function wave(seed: number, n: number, peakAt: number[]) {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const noise = (s / 233280) * 4;
    const bumps = peakAt.reduce(
      (a, p, k) => a + (22 - k * 5) * Math.exp(-((i - p) ** 2) / 18),
      0,
    );
    out.push(Math.round(3 + noise + bumps));
  }
  return out;
}

function night(
  id: string,
  start: number,
  minutes: number,
  peaks: number[],
  words: string[],
  seed: number,
): StreamStory {
  const w = wave(seed, minutes / 2, peaks);
  const peak = Math.max(...w);
  const moments = peaks.map((p, k) => ({
    ts: start + p * 120000,
    laughingNow: w[p] ?? peak,
    words: words.slice(k, k + 2),
    minuteWords: false,
    test: true,
    vod: null,
  }));
  return {
    id,
    title: 'a night with your fans',
    start,
    end: start + minutes * 60000,
    approximate: true,
    test: true,
    peak,
    words,
    wave: w,
    moments: moments.sort((a, b) => b.laughingNow - a.laughingNow),
  };
}

const DAY = 86400000;
const base = Date.UTC(2026, 10, 1, 14, 30);
export const DEMO_STREAMS: StreamStory[] = [
  night(
    'tonight',
    base,
    132,
    [14, 38, 55],
    ['LMAO', 'no way', 'bro', 'clip it', 'KEKW'],
    7,
  ),
  night('sat', base - DAY, 96, [20, 31], ['lets go', 'bro', 'haha'], 11),
  night('fri', base - 2 * DAY, 158, [9, 44, 70], ['no way', 'LMAO', 'gg'], 23),
];
