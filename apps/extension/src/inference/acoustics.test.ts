import { expect, it } from 'vitest';
import { AcousticFloor, LaughEpisodes } from './accuracy';
import { MicNormalizer } from '../audio/mic-normalizer';
import { frameLevels } from '../audio/resampler';

it('checks the absolute level in the same gain domain as the models while preserving raw room SNR', () => {
  const floor = new AcousticFloor(),
    normalizer = new MicNormalizer();
  for (let t = 0; t <= 3000; t += 20)
    floor.ingest(new Float32Array(320).fill(0.00003), t);
  let modelRms = 0;
  for (let i = 0; i < 100; i++) {
    const frame = Float32Array.from(
      { length: 320 },
      (_, j) => Math.sin((i * 320 + j) * 0.2) * 0.0008,
    );
    floor.ingest(frame, 3020 + i * 20, true);
    modelRms = frameLevels(normalizer.process(frame, true)).rms;
  }
  expect(modelRms).toBeGreaterThan(0.004);
  expect(floor.window(4000, 5000, modelRms).near).toBe(true);
  // Gain cannot rescue audio that is actually at the calibrated room floor.
  const noisy = new AcousticFloor();
  for (let t = 0; t <= 3000; t += 20)
    noisy.ingest(new Float32Array(320).fill(0.005), t);
  expect(noisy.window(0, 3000, 0.1).near).toBe(false);
});

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
  for (const amplitude of [0.0008, 0.04]) {
    const f = new AcousticFloor();
    for (let t = 0; t <= 3000; t += 20)
      f.ingest(new Float32Array(320).fill(amplitude), t, true);
    expect(f.remainingMs()).toBeGreaterThan(0);
    for (let t = 3020; t <= 4220; t += 20)
      f.ingest(new Float32Array(320).fill(0.0003), t);
    expect(f.remainingMs()).toBe(0);
    expect(f.ingest(new Float32Array(320).fill(0.02), 4240, true).near).toBe(
      true,
    );
  }
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
