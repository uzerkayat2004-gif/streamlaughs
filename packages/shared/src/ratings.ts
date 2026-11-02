import { z } from 'zod';

export const RATING_REASONS = {
  funny: 'funny',
  chill_vibes: 'chill vibes',
  great_gameplay: 'great gameplay',
  good_chat: 'good chat',
  hype_moments: 'hype moments',
  learned_something: 'learned something',
  too_slow: 'too slow',
  too_many_ads: 'too many ads',
  audio_issues: 'audio issues',
  ended_too_soon: 'ended too soon',
} as const;
export const POSITIVE_REASONS = [
  'funny',
  'chill_vibes',
  'great_gameplay',
  'good_chat',
  'hype_moments',
  'learned_something',
] as const;
export const NEGATIVE_REASONS = [
  'too_slow',
  'too_many_ads',
  'audio_issues',
  'ended_too_soon',
] as const;
export const RatingReasonSchema = z.enum([
  ...POSITIVE_REASONS,
  ...NEGATIVE_REASONS,
]);
export type RatingReason = z.infer<typeof RatingReasonSchema>;
export const RATING_DAY = 86_400_000;
export const RatingRequestSchema = z
  .object({
    channel: z.string().regex(/^[a-z0-9_]{1,25}$/),
    streamKey: z
      .string()
      .max(80)
      .refine((s) => {
        const day = /^[a-z0-9_]{1,25}:(\d{4}-\d{2}-\d{2})$/.exec(s);
        return day
          ? Number.isFinite(Date.parse(`${day[1]}T00:00:00Z`)) &&
              new Date(`${day[1]}T00:00:00Z`).toISOString().slice(0, 10) ===
                day[1]
          : /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(s) &&
              Number.isFinite(Date.parse(s));
      })
      .transform((s) => (/^\d/.test(s) ? new Date(s).toISOString() : s)),
    score: z.number().int().min(1).max(10),
    reasons: z
      .array(RatingReasonSchema)
      .max(3)
      .refine((a) => new Set(a).size === a.length),
  })
  .strict()
  .refine(
    (r) =>
      !/^[a-z]/.test(r.streamKey) || r.streamKey.startsWith(`${r.channel}:`),
  );
export type RatingRequest = z.infer<typeof RatingRequestSchema>;
export const LocalRatingSchema = z.object({
  id: z.string().max(110),
  channel: z.string().regex(/^[a-z0-9_]{1,25}$/),
  streamKey: z.string().max(80),
  score: z.number().int().min(1).max(10),
  reasons: z.array(RatingReasonSchema).max(3),
  firstSubmittedAt: z.number().finite(),
  updatedAt: z.number().finite(),
});
export type LocalRating = z.infer<typeof LocalRatingSchema>;
export function ratingStreamKey(
  channel: string,
  start?: string,
  now = Date.now(),
) {
  return start && Number.isFinite(Date.parse(start))
    ? new Date(start).toISOString()
    : `${channel}:${new Date(now).toISOString().slice(0, 10)}`;
}
export const ratingId = (channel: string, streamKey: string) =>
  `${channel}|${streamKey}`;
export function canRateStream(r: {
  live?: boolean;
  replay?: unknown;
  durationSeconds?: number;
  saving?: boolean;
  source?: string;
}) {
  return (
    r.live === true &&
    !r.replay &&
    !r.saving &&
    r.source === 'local' &&
    (r.durationSeconds ?? 0) >= 600
  );
}
export const ratingLocked = (
  rating: Pick<LocalRating, 'firstSubmittedAt'>,
  now = Date.now(),
) => now >= rating.firstSubmittedAt + RATING_DAY;
export const ratingColor = (score: number) =>
  score < 5 ? '#FF5C5C' : score < 8 ? '#FFD23F' : '#2EE6C5';
export function orderedReasons(score: number): RatingReason[] {
  return score >= 7
    ? [...POSITIVE_REASONS, ...NEGATIVE_REASONS]
    : score <= 4
      ? [...NEGATIVE_REASONS, ...POSITIVE_REASONS]
      : [
          'funny',
          'too_slow',
          'chill_vibes',
          'too_many_ads',
          'great_gameplay',
          'audio_issues',
          'good_chat',
          'ended_too_soon',
          'hype_moments',
          'learned_something',
        ];
}
export function ratingSummary(
  count: number,
  reasons: Partial<Record<RatingReason, number>>,
) {
  const sort = (keys: readonly RatingReason[]) =>
    [...keys]
      .filter((k) => (reasons[k] ?? 0) > 0)
      .sort(
        (a, b) => (reasons[b] ?? 0) - (reasons[a] ?? 0) || a.localeCompare(b),
      );
  const good = sort(POSITIVE_REASONS)
    .slice(0, 2)
    .map((k) => RATING_REASONS[k]);
  const bad = sort(NEGATIVE_REASONS)
    .filter((k) => (reasons[k] ?? 0) / count >= 0.2)
    .slice(0, 2)
    .map((k) => RATING_REASONS[k]);
  return `${good.length ? `Fans loved ${good.join(' and ')}.` : 'Your fans shared how tonight felt.'}${bad.length ? ` Some fans mentioned ${bad.join(' and ')}.` : ''}`;
}
export const RatingResultSchema = z.discriminatedUnion('locked', [
  z
    .object({ locked: z.literal(true), needed: z.number().int().min(1).max(5) })
    .strict(),
  z
    .object({
      locked: z.literal(false),
      count: z.number().int().min(5),
      average: z.number().min(1).max(10),
      histogram: z.array(z.number().int().nonnegative()).length(10),
      topReasons: z
        .array(
          z.object({
            id: RatingReasonSchema,
            count: z.number().int().nonnegative(),
            percent: z.number().min(0).max(100),
          }),
        )
        .max(10),
      summary: z.string().max(500),
    })
    .strict(),
]);
export type RatingResult = z.infer<typeof RatingResultSchema>;
export const RatingsReportSchema = z.object({
  channel: z.string(),
  streams: z
    .array(z.object({ streamKey: z.string(), rating: RatingResultSchema }))
    .max(30),
  trend: z
    .array(z.object({ streamKey: z.string(), rating: RatingResultSchema }))
    .max(10),
});
export type RatingsReport = z.infer<typeof RatingsReportSchema>;
