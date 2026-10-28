import { describe, expect, it } from 'vitest';
import { frameLevels, MonoResampler } from './resampler';
import { AudioFrameHub, AudioRingBuffer } from './ring-buffer';

function resample(rate: number, frequency = 1000, channels = 1, block = 128) {
  const resampler = new MonoResampler(rate),
    output: number[] = [];
  for (let start = 0; start < rate; start += block) {
    const input = Float32Array.from(
      { length: Math.min(block, rate - start) },
      (_, i) => Math.sin((2 * Math.PI * frequency * (i + start)) / rate),
    );
    resampler.push(
      Array.from({ length: channels }, () => input),
      (sample) => output.push(sample),
    );
  }
  return Float32Array.from(output);
}
describe('streaming resampler', () => {
  it('also upsamples narrowband devices without changing pitch', () => {
    const output = resample(8000);
    expect(output.length).toBeGreaterThan(15960);
    expect(frameLevels(output.slice(320)).rms).toBeCloseTo(Math.SQRT1_2, 2);
  });
  it.each([16000, 44100, 48000, 96000])(
    'converts %i Hz to 16 kHz with bounded FIR latency',
    (rate) => {
      const output = resample(rate);
      expect(output.length).toBeGreaterThanOrEqual(15984);
      expect(output.length).toBeLessThanOrEqual(16000);
      expect(frameLevels(output.slice(320)).rms).toBeCloseTo(Math.SQRT1_2, 2);
    },
  );
  it('is independent of input block boundaries', () =>
    expect([...resample(44100, 1000, 1, 127)]).toEqual([
      ...resample(44100, 1000, 1, 256),
    ]));
  it('averages stereo rather than summing it', () =>
    expect([...resample(48000, 1000, 2)]).toEqual([...resample(48000)]));
  it('cancels opposite stereo channels', () => {
    const input = new Float32Array(480).fill(0.8),
      output: number[] = [];
    new MonoResampler(48000).push([input, input.map((n) => -n)], (n) =>
      output.push(n),
    );
    expect(output.every((n) => n === 0)).toBe(true);
  });
  it('attenuates frequencies above the output Nyquist limit', () =>
    expect(frameLevels(resample(48000, 12000).slice(320)).rms).toBeLessThan(
      0.02,
    ));
  it('resets filter history between processing segments', () => {
    const resampler = new MonoResampler(48000);
    resampler.push([new Float32Array(1000).fill(1)], () => {});
    resampler.reset();
    const output: number[] = [];
    resampler.push([new Float32Array(1000)], (n) => output.push(n));
    expect(output.every((n) => n === 0)).toBe(true);
  });
  it('computes RMS/peak including silence and negative samples', () => {
    expect(frameLevels(new Float32Array([-0.5, 0.5]))).toEqual({
      rms: 0.5,
      peak: 0.5,
    });
    expect(frameLevels(new Float32Array())).toEqual({ rms: 0, peak: 0 });
  });
});
describe('memory ring buffer and Part 3 frame interface', () => {
  it('wraps in chronological order and returns a defensive copy', () => {
    const ring = new AudioRingBuffer(4);
    ring.write(new Float32Array([1, 2, 3]));
    ring.write(new Float32Array([4, 5, 6]));
    const result = ring.read(10);
    expect([...result]).toEqual([3, 4, 5, 6]);
    result[0] = 99;
    expect([...ring.read(2)]).toEqual([5, 6]);
  });
  it('keeps only the end of an oversized write and clears', () => {
    const ring = new AudioRingBuffer(2);
    ring.write(new Float32Array([1, 2, 3, 4]));
    expect([...ring.read(2)]).toEqual([3, 4]);
    ring.clear();
    expect(ring.length).toBe(0);
    expect(ring.read(4).length).toBe(0);
  });
  it('caps each source at exactly thirty seconds and isolates them', () => {
    const hub = new AudioFrameHub();
    for (let i = 0; i < 1600; i++)
      hub.onFrame('mic', new Float32Array(320).fill(0.1), i * 20);
    expect(hub.getWindow('mic', 99999).length).toBe(480000);
    expect(hub.getWindow('mic', 20).length).toBe(320);
    expect(hub.getWindow('tab', 30000).length).toBe(0);
    hub.clear();
    expect(hub.size('mic')).toBe(0);
  });
  it('delivers exact frames and timestamps locally and unsubscribes', () => {
    const hub = new AudioFrameHub(),
      seen: number[] = [];
    const unsubscribe = hub.subscribe((source, frame, ts) => {
      expect(source).toBe('tab');
      expect(frame.length).toBe(320);
      seen.push(ts);
    });
    hub.onFrame('tab', new Float32Array(320), 100);
    unsubscribe();
    hub.onFrame('tab', new Float32Array(320), 120);
    expect(seen).toEqual([100]);
    expect(hub.getWindow('tab', -1).length).toBe(0);
  });
});
