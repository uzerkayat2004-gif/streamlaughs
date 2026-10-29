import {
  type AudioReport,
  emptyAudioMetrics,
  emptyInferenceHealth,
  InferenceReportSchema,
  PersonalBatchSchema,
} from '@laughline/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { AUDIO_DEBUG } from '../audio/config';
import { AudioFrameHub } from '../audio/ring-buffer';
import { InferenceBridge } from './bridge';

class WorkerFake {
  static instances: WorkerFake[] = [];
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
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
it('isolates speech from realtime work, caps transport and terminates both on pause/mic loss; only safe events escape', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  });
  const hub = new AudioFrameHub(),
    send = vi.fn(),
    bridge = new InferenceBridge(hub, send);
  bridge.sync(report());
  bridge.sync(report());
  expect(WorkerFake.instances).toHaveLength(2);
  const worker = WorkerFake.instances[0]!;
  const speech = WorkerFake.instances[1]!;
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
  expect(speech.terminate).toHaveBeenCalledOnce();
  worker.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
  });
  bridge.sync(report());
  const second = WorkerFake.instances[2]!;
  worker.onerror?.({ message: 'simulated worker failure' });
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
it('unblocks the realtime scheduler if the speech worker crashes during a request', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  });
  const bridge = new InferenceBridge(new AudioFrameHub(), () => {});
  bridge.sync(report());
  const [worker, speech] = WorkerFake.instances;
  worker!.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'warming' },
    events: [],
  });
  expect(bridge.debugState()).toBeNull();
  worker!.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
    debug: { health: emptyInferenceHealth(), lastTranscript: '' },
  });
  speech!.deliver({
    type: 'speech_status',
    model: { phase: 'ready', ms: 1, error: '' },
  });
  worker!.deliver({
    type: 'speech_request',
    id: 7,
    samples: new Float32Array(16000),
  });
  expect(speech!.postMessage.mock.lastCall?.[0].id).toBe(7);
  speech!.onerror?.({ message: 'local WASM speech failure' });
  expect(
    worker!.postMessage.mock.calls.map(([message]) => message),
  ).toContainEqual({
    type: 'speech_result',
    id: 7,
    error: 'Error: local WASM speech failure',
  });
  expect(bridge.diagnostics().models.whisper.error).toContain('WASM');
  expect(worker!.terminate).not.toHaveBeenCalled();
  bridge.close();
});
it('keeps optional redacted development text out of production diagnostics and background messages', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  });
  const send = vi.fn(),
    bridge = new InferenceBridge(new AudioFrameHub(), send);
  bridge.sync(report());
  const [worker, speech] = WorkerFake.instances;
  worker!.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
    debug: { health: emptyInferenceHealth(), lastTranscript: '' },
  });
  speech!.deliver({
    type: 'speech_status',
    model: { phase: 'ready', ms: 1, error: '' },
  });
  worker!.deliver({
    type: 'speech_request',
    id: 1,
    samples: new Float32Array(16000),
  });
  speech!.deliver({
    type: 'speech_result',
    id: 1,
    result: { phrases: [], hype: false },
    debugTranscript: 'RAM-only redacted development text',
  });
  worker!.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
    debug: { lastTranscript: '' },
  });
  if (AUDIO_DEBUG)
    expect(bridge.debugState()).toMatchObject({
      lastTranscript: 'RAM-only redacted development text',
    });
  expect(JSON.stringify(bridge.diagnostics())).not.toContain('RAM-only');
  expect(JSON.stringify(send.mock.calls)).not.toContain('RAM-only');
  bridge.close();
  expect(bridge.debugState()).toBeNull();
});
it('does not spin on model-load failure and retries only after an explicit inactive transition', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  });
  const bridge = new InferenceBridge(new AudioFrameHub(), () => {});
  bridge.sync(report());
  WorkerFake.instances[0]!.onerror?.({ message: 'simulated worker failure' });
  for (let i = 0; i < 20; i++) bridge.sync(report());
  expect(WorkerFake.instances).toHaveLength(2);
  bridge.sync({ ...report(), phase: 'paused' });
  bridge.sync(report());
  expect(WorkerFake.instances).toHaveLength(4);
  bridge.close();
});
