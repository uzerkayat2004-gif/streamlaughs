// Fan ratings as the streamer dashboard shows them. The Worker returns these
// aggregates (never single ratings); anything under 5 raters stays locked.
import { SAMPLE_FAN_RATING, SAMPLE_FAN_REPORT } from './sample-ratings';

export type RatingReason = { id: string; label: string; percent: number };

export type StreamerRatings =
  | { locked: true; needed: number }
  | {
      locked: false;
      count: number;
      average: number;
      /** index 0 = how many fans gave 1, index 9 = how many gave 10 */
      histogram: number[];
      reasons: RatingReason[];
      summary: string;
      /** oldest first, the last entry is this stream */
      trend: { label: string; average: number }[];
    };

export const RATING_FLOOR = 5;

export const REASON_LABELS: Record<string, string> = {
  funny: 'funny',
  chill: 'chill vibes',
  gameplay: 'great gameplay',
  chat: 'good chat',
  hype: 'hype moments',
  learned: 'learned something',
  slow: 'too slow',
  ads: 'too many ads',
  audio: 'audio issues',
  short: 'ended too soon',
};

export const NEGATIVE_REASONS = new Set(['slow', 'ads', 'audio', 'short']);

export function ratingTone(score: number): 'coral' | 'yellow' | 'teal' {
  if (score < 5) return 'coral';
  if (score < 8) return 'yellow';
  return 'teal';
}

export function ratingWord(score: number) {
  if (score >= 9) return 'your fans loved it';
  if (score >= 7.5) return 'a really good night';
  if (score >= 6) return 'a solid night';
  if (score >= 4) return 'a mixed night';
  return 'a rough one';
}

/** Template summary from reason shares, used when the Worker sends none. */
export function ratingSummary(reasons: RatingReason[]) {
  const good = reasons.filter((r) => !NEGATIVE_REASONS.has(r.id)).slice(0, 2);
  const bad = reasons.find(
    (r) => NEGATIVE_REASONS.has(r.id) && r.percent >= 20,
  );
  const parts: string[] = [];
  if (good.length)
    parts.push(`Fans loved ${good.map((r) => r.label).join(' and ')}.`);
  if (bad) parts.push(`A few said ${bad.label}.`);
  return parts.join(' ') || 'Your fans rated the night.';
}

export const SAMPLE_RATINGS: StreamerRatings = SAMPLE_FAN_RATING.locked
  ? SAMPLE_FAN_RATING
  : {
      locked: false,
      count: 1204,
      average: SAMPLE_FAN_RATING.average,
      histogram: SAMPLE_FAN_RATING.histogram,
      reasons: [
        { id: 'funny', label: 'funny', percent: 71 },
        { id: 'chill', label: 'chill vibes', percent: 54 },
        { id: 'hype', label: 'hype moments', percent: 40 },
        { id: 'ads', label: 'too many ads', percent: 22 },
      ],
      summary: SAMPLE_FAN_RATING.summary,
      trend: SAMPLE_FAN_REPORT.trend.flatMap((s) =>
        s.rating.locked
          ? []
          : [{ label: s.streamKey.slice(5, 10), average: s.rating.average }],
      ),
    };
