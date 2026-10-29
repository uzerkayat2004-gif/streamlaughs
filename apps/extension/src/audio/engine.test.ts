import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MICROPHONE_CONSTRAINTS } from './config';
import { AudioEngine } from './engine';

function track() {
  return {
    readyState: 'live',
    enabled: true,
    muted: false,
    onended: null as null | (() => void),
    onmute: null as null | (() => void),
    stop: vi.fn(function (this: { readyState: string }) {
      this.readyState = 'ended';
    }),
  };
}
function stream() {
  const item = track();
  return { item, getTracks: () => [item], getAudioTracks: () => [item] };
}
const connect = () => ({ connect: vi.fn(), disconnect: vi.fn() });
describe('offscreen audio ownership', () => {
  let mic: ReturnType<typeof stream>,
    tab: ReturnType<typeof stream>,
    context: {
      state: string;
      close: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
    },
    nodes: {
      port: {
        onmessage: ((event: { data: unknown }) => void) | null;
        postMessage: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
      };
      onprocessorerror: null | (() => void);
    }[];
  let engine: AudioEngine;
  beforeEach(() => {
    vi.useFakeTimers();
    mic = stream();
    tab = stream();
    nodes = [];
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn(async () => ({ state: 'granted', onchange: null })),
      },
      mediaDevices: {
        getUserMedia: vi.fn(async (constraints) =>
          constraints.audio.mandatory ? tab : mic,
        ),
      },
    });
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://local${path}` },
    });
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        destination = {};
        audioWorklet = { addModule: vi.fn(async () => {}) };
        createMediaStreamSource = vi.fn(connect);
        createGain = vi.fn(() => ({ ...connect(), gain: { value: 1 } }));
        resume = vi.fn(async () => {
          this.state = 'running';
        });
        close = vi.fn(async () => {
          this.state = 'closed';
        });
        constructor() {
          context = this;
        }
      },
    );
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        port = { onmessage: null, postMessage: vi.fn(), close: vi.fn() };
        onprocessorerror = null;
        connect = vi.fn();
        disconnect = vi.fn();
        constructor() {
          nodes.push(this);
        }
      },
    );
    engine = new AudioEngine(() => {});
  });
  afterEach(async () => {
    await engine.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('keeps both tracks and replay open during pause, then releases every resource on stop', async () => {
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    expect(engine.status()?.phase).toBe('active');
    expect(nodes).toHaveLength(2);
    engine.pause(true);
    expect(mic.item.stop).not.toHaveBeenCalled();
    expect(tab.item.stop).not.toHaveBeenCalled();
    expect(context.close).not.toHaveBeenCalled();
    expect(
      nodes.every(
        (node) => node.port.postMessage.mock.lastCall?.[0].enabled === false,
      ),
    ).toBe(true);
    engine.pause(false);
    expect(engine.status()?.phase).toBe('active');
    await engine.stop();
    expect(mic.item.stop).toHaveBeenCalledOnce();
    expect(tab.item.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.frames.size('mic')).toBe(0);
    expect(engine.status()).toBeNull();
  });
  it('turns mic loss into crowd-only processing while preserving tab playback, and retries', async () => {
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    mic.item.onended?.();
    expect(engine.status()).toMatchObject({
      phase: 'micLost',
      hasTab: true,
      hasMic: false,
    });
    expect(tab.item.stop).not.toHaveBeenCalled();
    mic = stream();
    await engine.retryMic();
    expect(engine.status()).toMatchObject({ phase: 'active', hasMic: true });
  });
  it('tab-ended notification stops all streams even before the worker replies', async () => {
    const emit = vi.fn();
    engine = new AudioEngine(emit);
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    tab.item.onended?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(emit).toHaveBeenCalledWith({
      type: 'AUDIO_TAB_ENDED',
      ownerId: expect.any(String),
      sessionId: 'one',
    });
    expect(engine.status()).toBeNull();
    expect(mic.item.stop).toHaveBeenCalledOnce();
  });
  it('starting another owner first closes the previous owner', async () => {
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    const previous = context;
    mic = stream();
    tab = stream();
    await engine.start({ sessionId: 'two', streamId: 'other' });
    expect(previous.close).toHaveBeenCalledOnce();
    expect(engine.status()?.sessionId).toBe('two');
  });
  it('does not retain frames delivered after pause', async () => {
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    engine.pause(true);
    nodes[1]?.port.onmessage?.({
      data: { type: 'frame', frame: new Float32Array(320), ts: 20 },
    });
    expect(engine.frames.size('mic')).toBe(0);
  });
  it('opens the default input with the shared constraints and reports its state without device IDs', async () => {
    Object.assign(mic.item, {
      label: 'default headset',
      getSettings: () => ({ sampleRate: 48000, deviceId: 'private-device-id' }),
    });
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: MICROPHONE_CONSTRAINTS,
      video: false,
    });
    expect(engine.diagnostics().mic).toMatchObject({
      name: 'default headset',
      state: 'live',
      muted: false,
      sampleRate: 48000,
    });
    expect(JSON.stringify(engine.diagnostics())).not.toContain(
      'private-device-id',
    );
  });
  it('reopens the default microphone on device change and removes the listener on stop', async () => {
    const devices = navigator.mediaDevices;
    let name = 'first';
    Object.assign(devices, {
      enumerateDevices: vi.fn(async () => [
        { kind: 'audioinput', deviceId: 'default', label: name },
      ]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    const previous = mic;
    const callback = vi.mocked(devices.addEventListener).mock
      .calls[0]![1] as () => void;
    mic = stream();
    name = 'second';
    callback();
    await vi.advanceTimersByTimeAsync(0);
    expect(previous.item.stop).toHaveBeenCalledOnce();
    expect(engine.status()).toMatchObject({ phase: 'active', hasMic: true });
    expect(tab.item.stop).not.toHaveBeenCalled();
    await engine.stop();
    expect(devices.removeEventListener).toHaveBeenCalledWith(
      'devicechange',
      callback,
    );
  });
  it('does not reopen a microphone after stop interrupts an async retry', async () => {
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    mic.item.onended?.();
    let resume!: () => void;
    context.resume.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resume = resolve;
        }),
    );
    const calls = vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls
      .length;
    const retry = engine.retryMic();
    await engine.stop();
    resume();
    await retry;
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(calls);
    expect(engine.status()).toBeNull();
  });
});
