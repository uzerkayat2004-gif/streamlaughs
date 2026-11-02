import { expect, it } from 'vitest';
import { InferencePipeline } from './pipeline';
import { zeroScores } from './config';
import { AcousticFloor } from './accuracy';

it('never counts speech-like syllable rhythm when the classifier says speech, not laughter', async () => {
  const events: { kind: string }[] = [];
  const floor = new AcousticFloor();
  floor.ingest(new Float32Array(320), -4000);
  floor.ingest(new Float32Array(320), 0);
  const pipeline = new InferencePipeline(
    {
      vad: async () => 0.9,
      sound: () => ({ ...zeroScores(), speech: 0.95, laugh: 0.01 }),
      words: async () => '',
    },
    (e) => events.push(e),
    false,
    undefined,
    () => {},
    floor,
  );
  for (let k = 0; k < 400; k++) {
    const f = Float32Array.from({ length: 320 }, (_, n) => {
      const t = (k * 320 + n) / 16000;
      return (
        Math.sin(t * 2 * Math.PI * 180) *
        0.1 *
        Math.max(0, Math.sin(t * 2 * Math.PI * 5)) ** 3
      );
    });
    pipeline.ingest('mic', f, 10000 + k * 20);
    while (pipeline.pendingWork) await pipeline.step();
  }
  expect(pipeline.diagnostics().stages.dspHits).toBeGreaterThan(0);
  expect(events.filter((e) => e.kind === 'laugh')).toHaveLength(0);
  expect(
    pipeline
      .diagnostics()
      .accuracyLog.some((e) => e.reason === 'laughter score too low'),
  ).toBe(true);
  pipeline.clear();
});
it('rejects confident ASR reaction text from a laughter-class segment', async () => {
  const events: { kind: string }[] = [],
    floor = new AcousticFloor();
  floor.ingest(new Float32Array(320), -4000);
  floor.ingest(new Float32Array(320), 0);
  const p = new InferencePipeline(
    {
      vad: async () => 0.9,
      sound: () => ({ ...zeroScores(), laugh: 0.7, speech: 0.02 }),
      words: async () => ({
        phrases: [{ text: 'bro', count: 1, class: 'ok' }],
        hype: false,
        avgLogprob: -0.1,
        noSpeechProbability: 0.01,
      }),
    },
    (e) => events.push(e),
    false,
    undefined,
    () => {},
    floor,
  );
  for (let i = 0; i < 90; i++) {
    p.ingest(
      'mic',
      Float32Array.from({ length: 320 }, (_, n) => Math.sin(n * 0.3) * 0.04),
      10000 + i * 20,
    );
    while (p.pendingWork) await p.step();
  }
  await p.finish();
  expect(p.diagnostics().stages.speechResults).toBeGreaterThan(0);
  expect(events.some((e) => e.kind === 'words')).toBe(false);
  expect(
    p
      .diagnostics()
      .accuracyLog.some((e) => e.reason === 'not a speech-class segment'),
  ).toBe(true);
  p.clear();
});
it('retains the original speech-class evidence while a valid slow ASR result outlives rolling history', async () => {
  let voice = true,
    complete!: (value: string) => void;
  const events: { kind: string }[] = [],
    floor = new AcousticFloor();
  floor.ingest(new Float32Array(320), -4000);
  floor.ingest(new Float32Array(320), 0);
  const p = new InferencePipeline(
    {
      vad: async () => (voice ? 0.9 : 0),
      sound: () => ({ ...zeroScores(), speech: voice ? 0.9 : 0 }),
      lastSpeechConfidence: { avgLogprob: -0.1, noSpeechProbability: 0.01 },
      words: () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
    },
    (e) => events.push(e),
    false,
    undefined,
    () => {},
    floor,
  );
  let index = 0;
  const feed = async () => {
    p.ingest(
      'mic',
      voice
        ? Float32Array.from({ length: 320 }, (_, n) => Math.sin(n * 0.3) * 0.04)
        : new Float32Array(320),
      10000 + index++ * 20,
    );
    while (p.pendingWork) await p.step();
  };
  for (let i = 0; i < 70; i++) await feed();
  voice = false;
  for (let i = 0; i < 1600; i++) await feed();
  expect(complete).toBeTypeOf('function');
  complete('bro');
  await Promise.resolve();
  await Promise.resolve();
  expect(events.some((e) => e.kind === 'words')).toBe(true);
  p.clear();
});

it('accepts quantized 0.199 laughter only with a clear speech margin and sustained mic rhythm', async () => {
  const events: { kind: string }[] = [],
    floor = new AcousticFloor();
  floor.ingest(new Float32Array(320), -4000);
  floor.ingest(new Float32Array(320), 0);
  const p = new InferencePipeline(
    {
      vad: async () => 0,
      sound: () => ({ ...zeroScores(), laugh: 0.19921875, speech: 0.08203125 }),
      words: async () => '',
    },
    (e) => events.push(e),
    false,
    undefined,
    () => {},
    floor,
  );
  for (let k = 0; k < 200; k++) {
    p.ingest(
      'mic',
      Float32Array.from({ length: 320 }, (_, n) => {
        const t = (k * 320 + n) / 16000;
        return (
          Math.sin(t * 2 * Math.PI * 180) *
          0.1 *
          Math.max(0, Math.sin(t * 2 * Math.PI * 5)) ** 3
        );
      }),
      10000 + k * 20,
    );
    while (p.pendingWork) await p.step();
  }
  expect(events.filter((e) => e.kind === 'laugh')).toHaveLength(1);
  p.clear();
});
