import { expect, it, vi } from 'vitest';
import { INFERENCE_CONFIG as C, zeroScores } from './config';
import { InferencePipeline } from './pipeline';
import { AcousticFloor } from './accuracy';
function createPipeline(
  ...args: ConstructorParameters<typeof InferencePipeline>
) {
  const [models, emit, debug, onSpeech, wake] = args;
  models.lastSpeechConfidence = { avgLogprob: -0.1, noSpeechProbability: 0.01 };
  const sound = models.sound;
  const speechFixture = (scores: ReturnType<typeof zeroScores>) => ({
    ...scores,
    speech: scores.laugh ? scores.speech : 0.9,
  });
  models.sound = (...samples) => {
    const scores = sound(...samples);
    return scores instanceof Promise
      ? scores.then(speechFixture)
      : speechFixture(scores);
  };
  const floor = new AcousticFloor();
  floor.ingest(new Float32Array(320), -4000);
  floor.ingest(new Float32Array(320), 0);
  return new InferencePipeline(models, emit, debug, onSpeech, wake, floor);
}
it('live lab gates stop model jobs, suppress disabled speech, and resume the same word rules', async () => {
  const words = vi.fn(async () => 'bro'),
    sound = vi.fn(zeroScores),
    events: { kind: string }[] = [];
  const pipeline = createPipeline({ vad: async () => 0.9, sound, words }, (e) =>
    events.push(e),
  );
  const feed = async (base: number) => {
    for (let i = 0; i < 70; i++) {
      pipeline.ingest(
        'mic',
        Float32Array.from({ length: 320 }, (_, j) => Math.sin(j * 0.3) * 0.04),
        base + i * 20,
      );
      while (pipeline.pendingWork) await pipeline.step();
    }
    await pipeline.finish();
  };
  pipeline.setModes({ laugh: false, speech: false });
  await feed(100000);
  expect(words).not.toHaveBeenCalled();
  expect(sound).not.toHaveBeenCalled();
  pipeline.setModes({ laugh: true, speech: false });
  await feed(200000);
  expect(words).not.toHaveBeenCalled();
  pipeline.setModes({ laugh: true, speech: true });
  await feed(300000);
  expect(words).toHaveBeenCalled();
  expect(events.some((e) => e.kind === 'words')).toBe(true);
  pipeline.clear();
});
it('flushes an open speech segment only on stop, preserving ordinary segmentation and approved word timestamps', async () => {
  const events: { kind: string }[] = [];
  const words = vi.fn(async () => ({
    avgLogprob: -0.1,
    noSpeechProbability: 0.01,
    phrases: [{ text: 'bro', class: 'ok' as const, count: 1 }],
    hype: false,
  }));
  const pipeline = createPipeline(
    { vad: async () => 0.9, sound: zeroScores, words },
    (e) => events.push(e),
  );
  for (let i = 0; i < 60; i++) {
    pipeline.ingest(
      'mic',
      Float32Array.from({ length: 320 }, (_, j) => Math.sin(j * 0.3) * 0.04),
      100000 + (i + 1) * 20,
    );
    while (pipeline.pendingWork) await pipeline.step();
  }
  expect(words).not.toHaveBeenCalled();
  await pipeline.finish();
  expect(words).toHaveBeenCalledOnce();
  expect(events.some((e) => e.kind === 'words')).toBe(true);
  pipeline.clear();
});

it('reports actual worker arrivals and zero FPS after frames stop even while status polling continues', () => {
  vi.useFakeTimers({ toFake: ['performance'] });
  const p = createPipeline(
    { vad: async () => 0, sound: zeroScores, words: async () => '' },
    () => {},
  );
  try {
    p.ingest('mic', new Float32Array(320), 10000);
    expect(p.diagnostics().micFps).toBe(1);
    vi.advanceTimersByTime(1200);
    expect(p.diagnostics().micFps).toBe(0);
    p.ingest('mic', new Float32Array(320), 10020);
    expect(p.diagnostics().micFps).toBe(1);
  } finally {
    p.clear();
    vi.useRealTimers();
  }
});
it('dispatches speech while the live VAD queue still has work instead of starving transcription', async () => {
  let calls = 0,
    frame = 0;
  const words = vi.fn(async () => 'lets go');
  const p = createPipeline(
    { vad: async () => (++calls <= 20 ? 0.99 : 0), sound: zeroScores, words },
    () => {},
  );
  const add = () =>
    p.ingest('mic', new Float32Array(320).fill(0.1), 10000 + ++frame * 20);
  add();
  add();
  add();
  add();
  for (let i = 0; i < 36; i++) {
    add();
    add();
    await p.step();
  }
  expect(p.pendingWork).toBeGreaterThan(0);
  expect(words).toHaveBeenCalled();
  p.clear();
});
it('catches up queued VAD before running another synchronous classifier window', async () => {
  const sound = vi.fn(zeroScores),
    vad = vi.fn(async () => 0);
  const p = createPipeline({ vad, sound, words: async () => '' }, () => {});
  for (let i = 0; i < 60; i++)
    p.ingest('mic', new Float32Array(320), 10000 + i * 20);
  await p.step();
  expect(vad).toHaveBeenCalledOnce();
  expect(sound).not.toHaveBeenCalled();
  while (p.pendingWork) await p.step();
  expect(sound).toHaveBeenCalled();
  p.clear();
});

it('rejects classifier-only laughter evidence without a real mic rhythm', async () => {
  let clock = 0;
  const events: { kind: string }[] = [];
  const p = createPipeline(
    {
      vad: async () => 0,
      words: async () => '',
      sound: () => ({
        ...zeroScores(),
        laugh: clock >= 1450 && clock <= 2050 ? 0.9 : 0,
      }),
    },
    (event) => events.push(event),
  );
  for (let i = 0; i < 130; i++) {
    clock = (i + 1) * 20;
    p.ingest('mic', new Float32Array(320), 10000 + clock);
    while (p.pendingWork) await p.step();
  }
  expect(events.filter((event) => event.kind === 'laugh')).toHaveLength(0);
  p.clear();
});

it('keeps independent mic speech when speaker audio has the same loud/quiet rhythm', async () => {
  const events: { kind: string }[] = [];
  const p = createPipeline(
    {
      vad: async () => 0,
      sound: () => ({ ...zeroScores(), laugh: 0.9 }),
      words: async () => '',
    },
    (event) => events.push(event),
  );
  for (let i = 0; i < 150; i++) {
    const amplitude =
      0.15 * Math.max(0, Math.sin(i * 0.02 * 2 * Math.PI * 5)) ** 3;
    p.ingest(
      'tab',
      Float32Array.from(
        { length: 320 },
        (_, n) =>
          amplitude * Math.sin(((i * 320 + n) * 2 * Math.PI * 220) / 16000),
      ),
      10000 + i * 20,
    );
    p.ingest(
      'mic',
      Float32Array.from(
        { length: 320 },
        (_, n) =>
          amplitude *
          0.3 *
          Math.sin(((i * 320 + n) * 2 * Math.PI * 730) / 16000),
      ),
      10000 + i * 20,
    );
    while (p.pendingWork) await p.step();
  }
  expect(events.some((event) => event.kind === 'laugh')).toBe(true);
  p.clear();
});

it('keeps reaction steps responsive while transcription is pending and discards late speech after stop', async () => {
  let voiced = true;
  let finish!: (text: string) => void;
  const words = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const events: { kind: string }[] = [];
  const p = createPipeline(
    {
      vad: async () => (voiced ? 0.99 : 0),
      sound: () => ({ ...zeroScores(), laugh: 0.9 }),
      words,
    },
    (event) => events.push(event),
  );
  let frameIndex = 0;
  async function frame() {
    const k = ++frameIndex;
    p.ingest(
      'mic',
      Float32Array.from(
        { length: 320 },
        (_, n) =>
          Math.sin(((k * 320 + n) / 16000) * 2 * Math.PI * 180) *
          0.1 *
          Math.max(0, Math.sin(((k * 320 + n) / 16000) * 2 * Math.PI * 5)) ** 3,
      ),
      10000 + k * 20,
    );
    while (p.pendingWork) {
      const completed = await Promise.race([
        p.step().then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 40)),
      ]);
      expect(
        completed,
        'speech decoding must not block the realtime frame scheduler',
      ).toBe(true);
    }
  }
  for (let i = 0; i < 30; i++) await frame();
  voiced = false;
  for (let i = 0; i < 20; i++) await frame();
  expect(words).toHaveBeenCalledOnce();
  for (let i = 0; i < 100; i++) await frame();
  expect(events.some((event) => event.kind === 'laugh')).toBe(true);
  p.clear();
  finish('no way');
  await Promise.resolve();
  await Promise.resolve();
  expect(events.some((event) => event.kind === 'words')).toBe(false);
});

it('discards an in-flight VAD result when a transport timestamp gap resets its audio epoch', async () => {
  let finish!: (value: number) => void;
  const models = {
    vad: () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    sound: zeroScores,
    words: async () => '',
    resetVad: vi.fn(),
  };
  const p = createPipeline(models, () => {});
  p.ingest('mic', new Float32Array(320), 1000);
  p.ingest('mic', new Float32Array(320), 1020);
  const pending = p.step();
  p.ingest('mic', new Float32Array(320), 2000);
  finish(0.99);
  await pending;
  expect(p.health.vadProbability).toBe(0);
  expect(models.resetVad).toHaveBeenCalledTimes(2);
  p.clear();
});

it('requires real classifier hops, produces no transcript without VAD and rejects matching speaker audio', async () => {
  const models = {
    vad: vi.fn(async () => 0),
    sound: () => ({ ...zeroScores(), laugh: 0.8 }),
    words: vi.fn(async () => 'private'),
  };
  const events: unknown[] = [],
    p = createPipeline(models, (e) => events.push(e));
  for (let i = 0; i < 120; i++) {
    p.ingest(
      'mic',
      Float32Array.from(
        { length: 320 },
        (_, n) =>
          Math.sin(((i * 320 + n) / 16000) * 2 * Math.PI * 180) *
          0.1 *
          Math.max(0, Math.sin(((i * 320 + n) / 16000) * 2 * Math.PI * 5)) ** 3,
      ),
      10000 + i * 20,
    );
    while (p.pendingWork) await p.step();
  }
  expect(events).toContainEqual(expect.objectContaining({ kind: 'laugh' }));
  expect(models.words).not.toHaveBeenCalled();
  p.clear();
  const rejected: unknown[] = [],
    speakers = createPipeline(models, (e) => rejected.push(e), true);
  for (let i = 0; i < 130; i++) {
    const frame = Float32Array.from(
      { length: 320 },
      (_, n) =>
        Math.sin(((i * 320 + n) / 16000) * 2 * Math.PI * 180) *
        0.1 *
        Math.max(0, Math.sin(((i * 320 + n) / 16000) * 2 * Math.PI * 5)) ** 3,
    );
    speakers.ingest('tab', frame, 10000 + i * 20);
    speakers.ingest('mic', frame, 10000 + i * 20);
    while (speakers.pendingWork) await speakers.step();
  }
  expect(rejected).toHaveLength(0);
  expect(
    speakers
      .diagnostics()
      .accuracyLog.some((r) => r.reason.includes('playback')),
  ).toBe(true);
  speakers.clear();
});
it('bounds queues during prolonged overload, clears stale PCM on gaps and clears all work on stop', async () => {
  const models = {
    vad: async () => 0,
    sound: zeroScores,
    words: async () => '',
    resetVad: vi.fn(),
  };
  const p = createPipeline(models, () => {});
  for (let i = 0; i < 10000; i++)
    p.ingest('mic', new Float32Array(320), 1000 + i * 20);
  expect(p.pendingWork).toBeLessThanOrEqual(C.maxVadJobs + 1);
  await p.step();
  expect(p.health.drops).toBeGreaterThan(1000);
  expect(p.health.lowPower).toBe(true);
  p.ingest('mic', new Float32Array(320), 300000);
  expect(models.resetVad).toHaveBeenCalledOnce();
  expect(p.pendingWork).toBe(0);
  p.clear();
  expect(p.pendingWork).toBe(0);
  expect(p.debugState().lastTranscript).toBe('');
});

it('caps classifier work to two half-second windows per stream per second while ingesting 50 FPS', async () => {
  const sound = vi.fn(zeroScores),
    p = createPipeline(
      { vad: async () => 0, sound, words: async () => '' },
      () => {},
    );
  for (let i = 0; i < 200; i++) {
    p.ingest('tab', new Float32Array(320), 10000 + i * 20);
    p.ingest('mic', new Float32Array(320), 10000 + i * 20);
    while (p.pendingWork) await p.step();
  }
  expect(sound.mock.calls.length).toBeLessThanOrEqual(16);
  expect(p.diagnostics().micFrames).toBe(200);
  p.clear();
});
