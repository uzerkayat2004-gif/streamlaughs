import { describe, expect, it } from 'vitest';
import { ratingSummary, ratingTone, SAMPLE_RATINGS } from './streamer-ratings';

describe('streamer ratings', () => {
  it('colours scores coral, yellow, teal', () => {
    expect(ratingTone(3)).toBe('coral');
    expect(ratingTone(6)).toBe('yellow');
    expect(ratingTone(8.4)).toBe('teal');
  });
  it('mentions a negative reason only at 20%+', () => {
    const low = ratingSummary([
      { id: 'funny', label: 'funny moments', percent: 70 },
      { id: 'ads', label: 'too many ads', percent: 12 },
    ]);
    expect(low).not.toContain('ads');
    const high = ratingSummary([
      { id: 'funny', label: 'funny moments', percent: 70 },
      { id: 'ads', label: 'too many ads', percent: 25 },
    ]);
    expect(high).toContain('too many ads');
  });
  it('sample histogram covers 1 to 10', () => {
    if (SAMPLE_RATINGS.locked) throw new Error('sample must be unlocked');
    expect(SAMPLE_RATINGS.histogram).toHaveLength(10);
  });
});
