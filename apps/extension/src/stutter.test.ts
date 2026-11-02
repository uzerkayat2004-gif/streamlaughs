import { expect, it, vi } from 'vitest';
import { PlaybackWatchdog, bluetoothHint, defaultLab } from './stutter';
it('leaves native tab playback on by default with both detectors enabled', () => {
  expect(defaultLab()).toEqual({
    tabCapture: false,
    micCapture: true,
    laughModel: true,
    speechModel: true,
    overlay: true,
  });
});
it('distinguishes a delayed main-thread poll from an output gap and reports unavailable counters honestly', () => {
  const watch = new PlaybackWatchdog();
  let ts = { contextTime: 1, performanceTime: 1000 };
  const context = {
    state: 'running' as const,
    sampleRate: 48000,
    baseLatency: 0.01,
    outputLatency: 0.02,
    getOutputTimestamp: () => ts,
  };
  watch.sample(context, 1000);
  ts = { contextTime: 3, performanceTime: 3000 };
  expect(watch.sample(context, 3000)).toMatchObject({
    watchdogGaps: 0,
    underruns: null,
  });
  ts = { contextTime: 3.1, performanceTime: 3500 };
  expect(watch.sample(context, 3500).watchdogGaps).toBe(1);
});
it('pauses only speech after repeated actual underruns and recovers after 30 smooth seconds', () => {
  const watch = new PlaybackWatchdog();
  const context = {
    state: 'running' as const,
    sampleRate: 48000,
    baseLatency: 0.01,
    outputLatency: 0.02,
    getOutputTimestamp: () => ({}),
    playbackStats: { underrunEvents: 3, underrunDuration: 0.1 },
  };
  expect(watch.sample(context, 1000).speechPaused).toBe(true);
  expect(watch.sample(context, 30999).speechPaused).toBe(true);
  expect(watch.sample(context, 31000).speechPaused).toBe(false);
  expect(bluetoothHint('Headphones (WH-1000XM5)')).toBe(true);
  expect(bluetoothHint('Laptop microphone')).toBe(false);
});
