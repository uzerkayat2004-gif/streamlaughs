import { expect, it } from 'vitest';
import { AcousticFloor, LaughEpisodes } from './accuracy';

it('does not calibrate opening speech bursts as a permanent room floor', () => {
  const f = new AcousticFloor();
  for (let t = 0; t < 3000; t += 20)
    f.ingest(new Float32Array(320).fill(t % 1000 < 400 ? 0.04 : 0.0002), t);
  const laugh = f.ingest(new Float32Array(320).fill(0.02), 3000, true);
  expect(f.floor).toBeCloseTo(0.0002, 6);
  expect(laugh.near).toBe(true);
  expect(laugh.bleed).toBe(false);
});
it('asks for a quiet retry after continuous loud opening speech, then recovers', () => {
  const f = new AcousticFloor();
  for (let t = 0; t <= 3000; t += 20)
    f.ingest(new Float32Array(320).fill(0.04), t, true);
  expect(f.remainingMs()).toBeGreaterThan(0);
  for (let t = 3020; t <= 4220; t += 20)
    f.ingest(new Float32Array(320).fill(0.0002), t);
  expect(f.remainingMs()).toBe(0);
  expect(f.ingest(new Float32Array(320).fill(0.02), 4240, true).near).toBe(
    true,
  );
});

it('calibrates raw speaker/room level for three seconds, then requires a clear near-voice level step', () => {
  const f = new AcousticFloor();
  for (let k = 0; k < 150; k++)
    expect(f.ingest(new Float32Array(320).fill(0.01), k * 20).calibrated).toBe(
      false,
    );
  const bleed = f.ingest(new Float32Array(320).fill(0.01), 3000);
  expect(bleed.bleed).toBe(true);
  expect(bleed.near).toBe(false);
  const near = f.ingest(new Float32Array(320).fill(0.1), 3020, true);
  expect(near.near).toBe(true);
  expect(near.aboveFloorDb).toBeGreaterThan(19);
  expect(f.remainingMs()).toBe(0);
});
it('counts one episode through ongoing evidence and requires both the episode gap and cooldown', () => {
  const g = new LaughEpisodes();
  const counted = [];
  for (let ts = 0; ts < 10000; ts += 500)
    if (g.consider(true, ts)) counted.push(ts);
  expect(counted).toEqual([0]);
  expect(g.consider(true, 12500)).toBe(true);
  expect(g.consider(true, 15200)).toBe(false);
  expect(g.consider(false, 20000)).toBe(false);
  expect(g.consider(true, 21000)).toBe(true);
});

it('does not forget a calibrated room/speaker floor during a minute of quiet gaps', () => {
  const f = new AcousticFloor();
  for (let t = 0; t <= 3000; t += 20)
    f.ingest(new Float32Array(320).fill(0.005), t);
  for (let t = 3020; t < 63000; t += 20)
    f.ingest(new Float32Array(320).fill(0.0001), t);
  expect(f.floor).toBeCloseTo(0.004, 6);
  expect(f.ingest(new Float32Array(320).fill(0.0113), 63000, true).near).toBe(
    false,
  );
  expect(f.ingest(new Float32Array(320).fill(0.06), 63020, true).near).toBe(
    true,
  );
});

it('selects strict mode for the measured speaker calibration and keeps a close laugh', () => {
  const f = new AcousticFloor();
  for (let t = 0; t <= 3000; t += 20)
    f.ingest(new Float32Array(320).fill(0.0055), t);
  expect(f.bleed).toBe(true);
  expect(f.ingest(new Float32Array(320).fill(0.0176), 3020, true).near).toBe(
    false,
  );
  expect(f.ingest(new Float32Array(320).fill(0.065), 3040, true).near).toBe(
    true,
  );
});
