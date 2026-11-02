import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RatingsReportSchema, ratingColor } from '@laughline/shared';
import { FanRatings } from '../components/fan-ratings';
import { RatingsPreview } from '../components/ratings-preview';
import { SAMPLE_FAN_RATING, SAMPLE_FAN_REPORT } from './sample-ratings';

it('keeps sample totals, histogram and average consistent', () => {
  expect(RatingsReportSchema.parse(SAMPLE_FAN_REPORT)).toEqual(
    SAMPLE_FAN_REPORT,
  );
  for (const { rating } of SAMPLE_FAN_REPORT.streams) {
    if (rating.locked) continue;
    expect(rating.histogram.reduce((a, b) => a + b, 0)).toBe(rating.count);
    const mean =
      rating.histogram.reduce((sum, n, i) => sum + n * (i + 1), 0) /
      rating.count;
    expect(Number(mean.toFixed(1))).toBe(rating.average);
  }
  expect(SAMPLE_FAN_REPORT.trend).toHaveLength(10);
});
it('uses score boundaries consistently, including the fractional averages', () => {
  expect([4.9, 5, 7.8, 8, 10].map(ratingColor)).toEqual([
    '#FF5C5C',
    '#FFD23F',
    '#FFD23F',
    '#2EE6C5',
    '#2EE6C5',
  ]);
});
it('shows sample, the server summary, percentages and a selectable trend', () => {
  if (SAMPLE_FAN_RATING.locked) throw new Error('sample should be unlocked');
  const html = renderToStaticMarkup(
    createElement(FanRatings, {
      initial: SAMPLE_FAN_REPORT,
      channel: 'pixelcamp',
      sample: true,
    }),
  );
  expect(html).toContain('sample');
  expect(html).toContain(SAMPLE_FAN_RATING.summary);
  expect(html).toContain('71%');
  expect(html).toContain('tap a night');
  expect(html).toContain('rating locked');
  expect(html).toContain('7.8');
});
it('keeps the under-five state free of numeric aggregates or summary', () => {
  const html = renderToStaticMarkup(
    createElement(FanRatings, {
      initial: {
        channel: 'test',
        streams: [
          { streamKey: 'test:2026-11-02', rating: { locked: true, needed: 1 } },
        ],
        trend: [],
      },
      channel: 'test',
    }),
  );
  expect(html).toContain('1 more fan');
  expect(html).not.toContain('rating-ring');
  expect(html).not.toContain('rating-summary');
});
it('labels the marketing illustration as a sample with ten score buttons', () => {
  const html = renderToStaticMarkup(createElement(RatingsPreview));
  expect(html).toContain('sample recap');
  expect(html).toContain('only the streamer sees it');
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(10);
});
