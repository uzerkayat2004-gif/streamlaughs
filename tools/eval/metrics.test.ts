import { expect, it } from 'vitest';
import { evaluate } from './metrics.mjs';
import { decodeWav, encodeWav } from './wav.mjs';

it('matches each ground truth interval once and counts speaker false positives', () => {
  const result = evaluate(
    [
      { label: 'laugh', start: 0, end: 2 },
      { label: 'stream-through-speakers', start: 3, end: 5 },
    ],
    [
      { kind: 'laugh', ts: 101000 },
      { kind: 'laugh', ts: 104000 },
    ],
  );
  expect(result.laugh).toEqual({
    tp: 1,
    fp: 1,
    fn: 0,
    precision: 0.5,
    recall: 1,
  });
  expect(result['stream-through-speakers'].falsePositives).toBe(1);
  expect(result.scream.recall).toBeNull();
});
it('reads PCM16 without recording browser audio and rejects incompatible WAVs', () => {
  const samples = Float32Array.from([0, 0.5, -0.5]);
  const decoded = decodeWav(encodeWav(samples));
  expect(decoded[1]).toBeCloseTo(0.5, 4);
  expect(() => decodeWav(Buffer.from('no audio'))).toThrow();
});
