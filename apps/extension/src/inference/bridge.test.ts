import {
  type AudioReport,
  emptyAudioMetrics,
  emptyInferenceHealth,
  InferenceReportSchema,
  PersonalBatchSchema,
} from '@laughline/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { AudioFrameHub } from '../audio/ring-buffer';
import { InferenceBridge } from './bridge';

class WorkerFake {
  static instances: WorkerFake[] = [];
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    WorkerFake.instances.push(this);
  }
  deliver(data: unknown) {
    this.onmessage?.({ data });
  }
}
const report = (): AudioReport => ({
  type: 'AUDIO_REPORT',
  ownerId: 'owner',
  sessionId: 'session',
  phase: 'active',
  hasMic: true,
  hasTab: true,
  micLost: false,
  metrics: emptyAudioMetrics(),
});
afterEach(() => {
  vi.unstubAllGlobals();
  WorkerFake.instances = [];
});
it('has one worker, caps private transport and terminates on pause/mic loss; only safe events escape', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  });
  const hub = new AudioFrameHub(),
    send = vi.fn(),
    bridge = new InferenceBridge(hub, send);
  bridge.sync(report());
  bridge.sync(report());
  expect(WorkerFake.instances).toHaveLength(1);
  const worker = WorkerFake.instances[0]!;
  worker.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
  });
  for (let i = 0; i < 20; i++)
    hub.onFrame('mic', new Float32Array(320), i * 20);
  expect(worker.postMessage).toHaveBeenCalledTimes(9);
  worker.deliver({ type: 'ack' });
  hub.onFrame('mic', new Float32Array(320), 500);
  expect(worker.postMessage.mock.lastCall?.[0].drops).toBe(12);
  worker.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [
      {
        kind: 'laugh',
        ts: 1,
        intensity: 1,
        confidence: 0.8,
        transcript: 'private',
      },
    ],
  });
  bridge.sync({ ...report(), phase: 'paused' });
  expect(worker.terminate).toHaveBeenCalledOnce();
  worker.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
  });
  bridge.sync(report());
  const second = WorkerFake.instances[1]!;
  worker.onerror?.();
  expect(second.terminate).not.toHaveBeenCalled();
  bridge.sync({ ...report(), phase: 'micLost', micLost: true });
  expect(second.terminate).toHaveBeenCalledOnce();
  for (const [message] of send.mock.calls)
    expect(
      InferenceReportSchema.safeParse(message).success ||
        PersonalBatchSchema.safeParse(message).success,
    ).toBe(true);
  expect(JSON.stringify(send.mock.calls)).not.toMatch(
    /transcript|private|Float32Array/,
  );
});
it('does not spin on model-load failure and retries only after an explicit inactive transition', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  });
  const bridge = new InferenceBridge(new AudioFrameHub(), () => {});
  bridge.sync(report());
  WorkerFake.instances[0]!.onerror?.();
  for (let i = 0; i < 20; i++) bridge.sync(report());
  expect(WorkerFake.instances).toHaveLength(1);
  bridge.sync({ ...report(), phase: 'paused' });
  bridge.sync(report());
  expect(WorkerFake.instances).toHaveLength(2);
  bridge.close();
});
