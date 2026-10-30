import { expect, it } from 'vitest';
import { removeReferenceEcho } from './reference-echo';

const wave = (n: number, hz: number, amplitude: number) =>
  Float32Array.from(
    { length: n },
    (_, i) => amplitude * Math.sin((i * 2 * Math.PI * hz) / 16000),
  );
const rms = (a: Float32Array) =>
  Math.sqrt(a.reduce((sum, value) => sum + value * value, 0) / a.length);
it('removes a stable tab component while retaining an independent human-frequency component', () => {
  const tab = wave(22000, 263, 0.12),
    personal = wave(15600, 733, 0.025),
    mix = personal.map((v, i) => v + 0.7 * tab[6400 + i]!);
  const result = removeReferenceEcho(mix, tab);
  const gain = 0.075 / rms(personal);
  const expected = personal.map((v) => v * gain);
  expect(rms(result.map((v, i) => v - expected[i]!))).toBeLessThan(0.008);
  expect(rms(result)).toBeGreaterThan(0.05);
});
it('leaves unrelated mic audio unchanged and does not amplify a pure matching echo into an event', () => {
  const mic = wave(15600, 751, 0.05),
    tab = wave(22000, 293, 0.1);
  expect(removeReferenceEcho(mic, tab)).toBe(mic);
  const echo = tab.slice(-15600).map((v) => v * 0.5);
  expect(rms(removeReferenceEcho(echo, tab))).toBeLessThan(0.0001);
});
it('does not turn down a clearly audible personal signal after subtracting playback', () => {
  const tab = wave(22000, 263, 0.12),
    personal = wave(15600, 733, 0.25);
  const mixed = personal.map((value, i) => value + 0.7 * tab[6400 + i]!);
  expect(rms(removeReferenceEcho(mixed, tab))).toBeGreaterThan(0.15);
});
