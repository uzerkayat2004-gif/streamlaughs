import { expect, it } from 'vitest';
import { AcousticFloor, LaughEpisodes } from './accuracy';
it('uses conditioned non-voice minimum statistics without blocking even the first frame', () => {
  const f = new AcousticFloor();
  expect(f.ingest(new Float32Array(320).fill(0.03), 0, true).calibrated).toBe(
    true,
  );
  expect(f.remainingMs()).toBe(0);
  f.ingest(new Float32Array(320).fill(0.002), 20, false);
  f.ingest(new Float32Array(320).fill(0.0002), 520, false);
  const before = f.floor;
  f.ingest(new Float32Array(320).fill(0.1), 540, true);
  expect(f.floor).toBe(before);
  expect(f.bleed).toBe(false);
  expect(f.window(0, 600, 0.005).rms).toBe(0.005);
  expect(f.window(0, 600, 0.005).aboveFloorDb).toBeCloseTo(
    20 * Math.log10(0.005 / 0.0002),
  );
});
it('expires old room minima after ten seconds and never closes an admission gate', () => {
  const f = new AcousticFloor();
  f.ingest(new Float32Array(320).fill(0.0002), 0);
  f.ingest(new Float32Array(320).fill(0.005), 11000);
  expect(f.floor).toBeCloseTo(0.005);
  expect(f.remainingMs()).toBe(0);
  expect(f.window(0, 11000).near).toBe(true);
});
it('uses two confidence hops or one strong hop, one count per episode and a 2s refractory', () => {
  const g = new LaughEpisodes();
  expect(g.consider(0.31, 0)).toBe(false);
  expect(g.consider(0.31, 250)).toBe(true);
  expect(g.consider(0.9, 500)).toBe(false);
  expect(g.consider(0.1, 750)).toBe(false);
  expect(g.consider(0.9, 1000)).toBe(false);
  g.consider(0.1, 1200);
  expect(g.consider(0.56, 2300)).toBe(true);
});
