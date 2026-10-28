import { expect, it, vi } from 'vitest';
import { zeroScores } from './config';
import { InferencePipeline } from './pipeline';

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
  const p = new InferencePipeline(models, () => {});
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
    p = new InferencePipeline(models, (e) => events.push(e));
  for (let i = 0; i < 120; i++) {
    p.ingest(
      'mic',
      new Float32Array(320).fill(0.1 + Math.sin(i * 0.8) * 0.04),
      10000 + i * 20,
    );
    while (p.pendingWork) await p.step();
  }
  expect(events).toContainEqual(expect.objectContaining({ kind: 'laugh' }));
  expect(models.words).not.toHaveBeenCalled();
  p.clear();
  const rejected: unknown[] = [],
    speakers = new InferencePipeline(models, (e) => rejected.push(e), true);
  for (let i = 0; i < 130; i++) {
    const frame = new Float32Array(320).fill(
      0.1 + Math.sin(i * 0.8) * 0.04 + Math.cos(i * 0.31) * 0.01,
    );
    speakers.ingest('tab', frame, 10000 + i * 20);
    speakers.ingest('mic', frame, 10000 + i * 20);
    while (speakers.pendingWork) await speakers.step();
  }
  expect(rejected).toHaveLength(0);
  expect(
    speakers.debugState().reasons.some((r) => r.reason.includes('playback')),
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
  const p = new InferencePipeline(models, () => {});
  for (let i = 0; i < 10000; i++)
    p.ingest('mic', new Float32Array(320), 1000 + i * 20);
  expect(p.pendingWork).toBeLessThanOrEqual(33);
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
