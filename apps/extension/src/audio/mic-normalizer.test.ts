import { expect, it } from 'vitest';
import { MicNormalizer } from './mic-normalizer';

const rms = (samples: Float32Array) =>
  Math.sqrt(
    samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
  );
const tone = (amplitude: number, offset = 0) =>
  Float32Array.from(
    { length: 320 },
    (_, i) => amplitude * Math.sin(((i + offset) * Math.PI * 2 * 440) / 16000),
  );

it('lifts quiet speech input with bounded gain while preserving the original capture samples', () => {
  const normalizer = new MicNormalizer();
  let output = new Float32Array(320);
  for (let i = 0; i < 60; i++) {
    const input = tone(0.006, i * 320),
      original = input.slice();
    output = normalizer.process(input, true);
    expect(input).toEqual(original);
  }
  expect(rms(output)).toBeGreaterThan(0.045);
  expect(normalizer.gain).toBeLessThanOrEqual(20);
});
it('does not invent signal from silence or amplify stationary noise without a bound', () => {
  const normalizer = new MicNormalizer();
  for (let i = 0; i < 100; i++)
    expect(rms(normalizer.process(new Float32Array(320)))).toBe(0);
  for (let i = 0; i < 100; i++) {
    const output = normalizer.process(tone(0.002, i * 320));
    expect(rms(output)).toBeLessThan(0.035);
  }
  expect(normalizer.noiseFloor).toBeGreaterThan(0.0001);
  normalizer.reset();
  expect(normalizer.gain).toBe(1);
  expect(normalizer.noiseFloor).toBe(0.0001);
});
it('protects headroom immediately after quiet input and removes DC offset', () => {
  const normalizer = new MicNormalizer();
  for (let i = 0; i < 40; i++) normalizer.process(tone(0.004), true);
  const loud = normalizer.process(tone(0.9), true);
  expect(Math.max(...loud.map(Math.abs))).toBeLessThanOrEqual(0.951);
  let dc = new Float32Array(320);
  for (let i = 0; i < 100; i++)
    dc = normalizer.process(new Float32Array(320).fill(0.1));
  expect(rms(dc)).toBeLessThan(0.0001);
});
it('preserves syllable and laugh envelopes instead of pumping the gain during brief gaps', () => {
  const normalizer = new MicNormalizer();
  for (let i = 0; i < 50; i++) normalizer.process(tone(0.15, i * 320), true);
  const before = normalizer.gain;
  for (let i = 0; i < 10; i++)
    normalizer.process(tone(0.001, (50 + i) * 320), true);
  expect(normalizer.gain).toBeLessThan(before * 1.5);
});
