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
import { INFERENCE_CONFIG as C } from './config';

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  WorkerFake.instances = [];
});
// v0.9.4: the automatic speech safety pause was removed (it starved words).
it.skip('terminates the speech worker for the safety pause, keeps the laugh worker, and recreates speech on recovery', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://test${p}` },
  });
  const hub = new AudioFrameHub(),
    bridge = new InferenceBridge(hub, vi.fn());
  bridge.sync({ ...report(), hasTab: false });
  const [rt, speech, sound] = WorkerFake.instances;
  rt!.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
  });
  bridge.setLab({ laughModel: true, speechModel: true }, true);
  expect(speech!.terminate).toHaveBeenCalledOnce();
  expect(sound!.terminate).not.toHaveBeenCalled();
  expect(rt!.terminate).not.toHaveBeenCalled();
  hub.onFrame('mic', new Float32Array(320).fill(0.1), 1000);
  expect(rt!.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'frame', source: 'mic' }),
    expect.any(Array),
  );
  expect(rt!.postMessage).toHaveBeenCalledWith({
    type: 'modes',
    laugh: true,
    speech: false,
  });
  bridge.setLab({ laughModel: true, speechModel: true }, false);
  expect(WorkerFake.instances).toHaveLength(4);
  expect(rt!.postMessage).toHaveBeenCalledWith({
    type: 'modes',
    laugh: true,
    speech: true,
  });
  bridge.close();
});
it('lets a slow native-session speech result finish without pausing words or laughs', () => {
  vi.useFakeTimers({ toFake: ['performance'] });
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://test${p}` },
  });
  const bridge = new InferenceBridge(new AudioFrameHub(), vi.fn());
  const native = { ...report(), hasTab: false };
  bridge.sync(native);
  const [rt, speech, sound] = WorkerFake.instances;
  speech!.deliver({
    type: 'speech_status',
    model: { phase: 'ready', ms: 1, error: '' },
  });
  rt!.deliver({
    type: 'speech_request',
    id: 77,
    samples: new Float32Array(16000),
  });
  vi.advanceTimersByTime(3001);
  bridge.sync(native);
  expect(speech!.terminate).not.toHaveBeenCalled();
  expect(sound!.terminate).not.toHaveBeenCalled();
  expect(rt!.terminate).not.toHaveBeenCalled();
  expect(bridge.diagnostics()).toMatchObject({
    speechOverruns: 0,
    speechCooldownMs: 0,
  });
  speech!.deliver({
    type: 'speech_result',
    id: 77,
    result: { phrases: [{ text: 'bro', count: 1, class: 'ok' }], hype: false },
  });
  expect(rt!.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'speech_result', id: 77 }),
  );
  expect(WorkerFake.instances).toHaveLength(3);
  bridge.close();
});
it('feeds mic frames to inference when the watched tab is never captured', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://test${p}` },
  });
  const hub = new AudioFrameHub(),
    bridge = new InferenceBridge(hub, vi.fn());
  bridge.sync({ ...report(), hasTab: false });
  const realtime = WorkerFake.instances[0]!;
  realtime.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
  });
  hub.onFrame('mic', new Float32Array(320).fill(0.1), 1000);
  expect(realtime.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'frame', source: 'mic' }),
    expect.any(Array),
  );
  bridge.close();
});
it('caps stop drain at 1500ms, stops frame input and keeps tracks/workers alive for the final save', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://test${p}` },
  });
  const hub = new AudioFrameHub(),
    send = vi.fn(),
    bridge = new InferenceBridge(hub, send);
  bridge.sync(report());
  const worker = WorkerFake.instances[0]!;
  worker.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
  });
  let finished = false;
  const pending = bridge.finish().then(() => {
    finished = true;
  });
  expect(worker.postMessage.mock.lastCall?.[0]).toEqual({ type: 'finish' });
  const calls = worker.postMessage.mock.calls.length;
  hub.onFrame('mic', new Float32Array(320), 123);
  expect(worker.postMessage.mock.calls.length).toBe(calls);
  await vi.advanceTimersByTimeAsync(1499);
  expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(finished).toBe(true);
  for (const w of WorkerFake.instances)
    expect(w.terminate).not.toHaveBeenCalled();
  bridge.close();
  for (const w of WorkerFake.instances)
    expect(w.terminate).toHaveBeenCalledOnce();
});
it('forwards the last approved word batch before acknowledging a completed drain', async () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://test${p}` },
  });
  const send = vi.fn(),
    bridge = new InferenceBridge(new AudioFrameHub(), send);
  bridge.sync(report());
  const worker = WorkerFake.instances[0]!;
  const finishing = bridge.finish();
  worker.deliver({
    type: 'status',
    health: emptyInferenceHealth(),
    events: [
      {
        kind: 'words',
        ts: 10,
        phrases: [{ text: 'bro', count: 1, class: 'ok' }],
      },
    ],
  });
  worker.deliver({ type: 'finished' });
  await finishing;
  expect(
    send.mock.calls.map(([m]) => m).find((m) => m.type === 'PERSONAL_EVENTS')
      ?.events[0].phrases[0].text,
  ).toBe('bro');
  bridge.close();
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
  expect(WorkerFake.instances).toHaveLength(3);
  const worker = WorkerFake.instances[0]!;
  const speech = WorkerFake.instances[1]!;
  worker.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
  });
  for (let i = 0; i < C.maxTransportFrames + 12; i++)
    hub.onFrame('mic', new Float32Array(320), i * 20);
  expect(worker.postMessage).toHaveBeenCalledTimes(C.maxTransportFrames + 1);
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
  const second = WorkerFake.instances[3]!;
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
it('absorbs a 180 ms classifier stall without dropping either stream before the worker can ACK', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  });
  const hub = new AudioFrameHub(),
    bridge = new InferenceBridge(hub, () => {});
  bridge.sync(report());
  const worker = WorkerFake.instances[0]!;
  worker.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [],
  });
  for (let i = 0; i < 9; i++) {
    hub.onFrame('mic', new Float32Array(320), i * 20);
    hub.onFrame('tab', new Float32Array(320), i * 20);
  }
  expect(
    worker.postMessage.mock.calls.filter(([m]) => m.type === 'frame'),
  ).toHaveLength(18);
  bridge.close();
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
  expect(WorkerFake.instances).toHaveLength(3);
  bridge.sync({ ...report(), phase: 'paused' });
  bridge.sync(report());
  expect(WorkerFake.instances).toHaveLength(6);
  bridge.close();
});

it('publishes a recognized reaction before periodic health so the panel need not wait for a health storage write', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://test${p}` },
  });
  const send = vi.fn(),
    bridge = new InferenceBridge(new AudioFrameHub(), send);
  bridge.sync(report());
  send.mockClear();
  WorkerFake.instances[0]!.deliver({
    type: 'status',
    health: { ...emptyInferenceHealth(), phase: 'ready' },
    events: [{ kind: 'laugh', ts: 10, confidence: 0.9, intensity: 2 }],
  });
  expect(send.mock.calls[0]?.[0].type).toBe('PERSONAL_EVENTS');
  expect(send.mock.calls[1]?.[0].type).toBe('INFERENCE_STATUS');
  bridge.close();
});
it('keeps an explicitly requested transcript in expiring RAM only, outside all persistent event/status messages', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://test${p}` },
  });
  const send = vi.fn(),
    bridge = new InferenceBridge(new AudioFrameHub(), send);
  bridge.sync(report());
  const [rt, speech] = WorkerFake.instances;
  bridge.speechPreview();
  speech!.deliver({
    type: 'speech_status',
    model: { phase: 'ready', ms: 1, error: '' },
  });
  rt!.deliver({
    type: 'speech_request',
    id: 99,
    samples: new Float32Array(16000),
  });
  speech!.deliver({
    type: 'speech_result',
    id: 99,
    previewText: 'a private sentence for this fixture',
    result: {
      phrases: [{ text: 'bro', class: 'ok', count: 1 }],
      hype: false,
      matched: 1,
      rejected: 0,
    },
  });
  expect(bridge.speechPreview()).toBe('a private sentence for this fixture');
  expect(JSON.stringify(send.mock.calls)).not.toContain('private sentence');
  expect(JSON.stringify(rt!.postMessage.mock.calls)).not.toContain(
    'private sentence',
  );
  await vi.advanceTimersByTimeAsync(1201);
  expect(bridge.speechPreview()).toBe('');
  bridge.close();
});

it('drops a second speech request instead of queueing it and backoff never disables laughter', () => {
  vi.stubGlobal('Worker', WorkerFake);
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://test${p}` },
  });
  const bridge = new InferenceBridge(new AudioFrameHub(), vi.fn());
  bridge.sync({ ...report(), hasTab: false });
  const [rt, speech, sound] = WorkerFake.instances;
  speech!.deliver({
    type: 'speech_status',
    model: { phase: 'ready', error: '', ms: 1 },
  });
  rt!.deliver({
    type: 'speech_request',
    id: 1,
    samples: new Float32Array(16000),
  });
  const second = new Float32Array(16000).fill(0.1);
  rt!.deliver({ type: 'speech_request', id: 2, samples: second });
  expect(second.every((x) => x === 0)).toBe(true);
  expect(
    speech!.postMessage.mock.calls.filter(([v]) => v.type === 'speech'),
  ).toHaveLength(1);
  expect(rt!.postMessage).toHaveBeenCalledWith({
    type: 'speech_result',
    id: 2,
    error: 'speech busy; segment dropped',
  });
  bridge.backoffSpeech();
  expect(speech!.postMessage).toHaveBeenCalledWith({ type: 'backoff' });
  expect(sound!.terminate).not.toHaveBeenCalled();
  bridge.close();
});
