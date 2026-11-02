// Fan ratings as the streamer dashboard shows them. The Worker returns these
// aggregates (never single ratings); anything under 5 raters stays locked.
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
  if (score < 7.5) return 'yellow';
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
    parts.push(
      `Most fans loved the ${good.map((r) => r.label).join(' and the ')}.`,
    );
  if (bad) parts.push(`A few said ${bad.label}.`);
  return parts.join(' ') || 'Your fans rated the night.';
}

export const SAMPLE_RATINGS: StreamerRatings = {
  locked: false,
  count: 1204,
  average: 8.4,
  histogram: [6, 4, 9, 14, 31, 58, 121, 268, 341, 352],
  reasons: [
    { id: 'funny', label: 'funny', percent: 71 },
    { id: 'chill', label: 'chill vibes', percent: 44 },
    { id: 'chat', label: 'good chat', percent: 29 },
    { id: 'ads', label: 'too many ads', percent: 12 },
  ],
  summary:
    'Most fans loved the funny moments and the chill vibes. Ads barely came up.',
  trend: [
    { label: 'Oct 21', average: 7.1 },
    { label: 'Oct 22', average: 7.6 },
    { label: 'Oct 23', average: 6.8 },
    { label: 'Oct 24', average: 7.9 },
    { label: 'Oct 25', average: 8.1 },
    { label: 'Oct 26', average: 7.7 },
    { label: 'tonight', average: 8.4 },
  ],
};
