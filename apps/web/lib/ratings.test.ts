import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ratingColor, type RatingsReport } from '@laughline/shared';
import { FanRatings } from '../components/fan-ratings';
import { GET } from '../app/api/ratings/[channel]/route';
import { authenticated } from './auth';
import { fanRatings } from './ratings';
vi.mock('./auth', () => ({ authenticated: vi.fn() }));
vi.mock('./ratings', () => ({ fanRatings: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const report: RatingsReport = {
  channel: 'fan_test',
  streams: [
    { streamKey: 'fan_test:2026-11-02', rating: { locked: true, needed: 1 } },
  ],
  trend: [],
};
it('renders the locked floor without average, histogram or reason data', () => {
  const html = renderToStaticMarkup(
    createElement(FanRatings, { initial: report, channel: 'fan_test' }),
  );
  expect(html).toContain('1 more fan');
  expect(html).not.toContain('rating-ring');
  expect(html).not.toContain('rating-histogram');
});
it('uses the three score colours and renders the server summary as plain text', () => {
  expect([ratingColor(1), ratingColor(5), ratingColor(8)]).toEqual([
    '#FF5C5C',
    '#FFD23F',
    '#2EE6C5',
  ]);
  const data: RatingsReport = {
    ...report,
    streams: [
      {
        streamKey: 'x',
        rating: {
          locked: false,
          count: 5,
          average: 8,
          histogram: [0, 0, 0, 0, 0, 0, 0, 5, 0, 0],
          topReasons: [{ id: 'funny', count: 5, percent: 100 }],
          summary: 'Fans loved funny moments.',
        },
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(FanRatings, { initial: data, channel: 'fan_test' }),
  );
  expect(html).toContain('Fans loved funny moments.');
  expect(html).toContain('100%');
  expect(html).toContain('8.0');
});
it('never requests Worker ratings for a different Twitch owner', async () => {
  vi.mocked(authenticated).mockResolvedValue({
    login: 'fan_test',
    userId: '123',
  });
  const denied = await GET(new Request('https://site.test/api/ratings/other'), {
    params: Promise.resolve({ channel: 'other' }),
  });
  expect(denied.status).toBe(403);
  expect(fanRatings).not.toHaveBeenCalled();
});
