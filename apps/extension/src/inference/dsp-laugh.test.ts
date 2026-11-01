import { expect, it } from 'vitest';
import { DspLaughDetector } from './dsp-laugh';
function drive(kind: 'laugh' | 'tone' | 'noise') {
  const d = new DspLaughDetector(),
    hits: number[] = [];
  let seed = 1;
  for (let k = 0; k < 250; k++) {
    const f = new Float32Array(320);
    for (let n = 0; n < 320; n++) {
      const t = (k * 320 + n) / 16000;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      f[n] =
        kind === 'noise'
          ? (seed / 4294967296 - 0.5) * 0.02
          : Math.sin(t * 2 * Math.PI * 180) *
            0.1 *
            (kind === 'laugh' && t > 1
              ? Math.max(0, Math.sin((t - 1) * 2 * Math.PI * 5)) ** 3
              : kind === 'tone'
                ? 1
                : 0);
    }
    if (d.process(f, k * 20)) hits.push(k * 20);
  }
  return hits;
}
it('requires repeated voiced ha pulses, not a constant voiced tone or laptop noise', () => {
  expect(drive('laugh').length).toBeGreaterThan(0);
  expect(drive('tone')).toEqual([]);
  expect(drive('noise')).toEqual([]);
});
it('keeps DSP hits at least two seconds apart', () => {
  const hits = drive('laugh');
  expect(hits.every((t, i) => i === 0 || t - hits[i - 1]! >= 2000)).toBe(true);
});
