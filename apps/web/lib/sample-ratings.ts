import {
  ratingSummary,
  type RatingResult,
  type RatingsReport,
} from '@laughline/shared';

// Made-up fans for /demo and the home illustration. Never sent to the Worker.
const histogram = [4, 8, 12, 20, 34, 80, 210, 462, 300, 74];
export const SAMPLE_FAN_RATING: RatingResult = {
  locked: false,
  count: 1204,
  average: 7.8,
  histogram,
  topReasons: [
    { id: 'funny', count: 850, percent: 71 },
    { id: 'chill_vibes', count: 650, percent: 54 },
    { id: 'hype_moments', count: 480, percent: 40 },
    { id: 'too_many_ads', count: 270, percent: 22 },
  ],
  summary: ratingSummary(1204, {
    funny: 850,
    chill_vibes: 650,
    hype_moments: 480,
    too_many_ads: 270,
  }),
};

const trend = [6.8, 7.2, null, 7.4, 7.1, 8.2, 7.6, 8.5, 8, 7.8].map(
  (average, i) => {
    const streamKey = new Date(Date.UTC(2026, 9, 23 + i, 14, 30)).toISOString();
    if (average === null)
      return { streamKey, rating: { locked: true as const, needed: 1 } };
    const bins = Array<number>(10).fill(0);
    const low = Math.floor(average);
    const upperCount = Math.round((average - low) * 100);
    bins[low - 1] = 100 - upperCount;
    if (upperCount) bins[low] = upperCount;
    return {
      streamKey,
      rating:
        i === 9
          ? SAMPLE_FAN_RATING
          : {
              locked: false as const,
              count: 100,
              average,
              histogram: bins,
              topReasons: [{ id: 'funny' as const, count: 70, percent: 70 }],
              summary: ratingSummary(100, { funny: 70 }),
            },
    };
  },
);
export const SAMPLE_FAN_REPORT: RatingsReport = {
  channel: 'pixelcamp',
  streams: [...trend].reverse(),
  trend,
};
