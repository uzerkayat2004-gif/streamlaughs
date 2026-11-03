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
    onunmute: null as null | (() => void),
    stop: vi.fn(function (this: { readyState: string }) {
      this.readyState = 'ended';
    }),
  };
}
function stream() {
  const item = track();
  return { item, getTracks: () => [item], getAudioTracks: () => [item] };
}
const connections: unknown[] = [];
const connect = () => ({
  connect: vi.fn((target: unknown) => connections.push(target)),
  disconnect: vi.fn(),
});
describe('offscreen audio ownership', () => {
  let contextRequests: AudioContextOptions[] = [];
  let requireActiveCapture = false;
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
    contextRequests = [];
    connections.length = 0;
    requireActiveCapture = false;
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
        destination = { speaker: true };
        audioWorklet = { addModule: vi.fn(async () => {}) };
        createMediaStreamSource = vi.fn(connect);
        createGain = vi.fn(() => ({ ...connect(), gain: { value: 1 } }));
        resume = vi.fn(async () => {
          if (
            requireActiveCapture &&
            !vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls.length
          )
            throw new Error('no active capture');
          this.state = 'running';
        });
        close = vi.fn(async () => {
          this.state = 'closed';
        });
        constructor(options: AudioContextOptions) {
          contextRequests.push(options);
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
  it('never connects the mic analysis graph to a speaker output or opens a tab stream in native mode', async () => {
    await engine.start({ sessionId: 'silent-analysis', nativePlayback: true });
    expect(
      connections.some(
        (target) =>
          !!target && typeof target === 'object' && 'speaker' in target,
      ),
    ).toBe(false);
    expect(engine.status()?.hasTab).toBe(false);
    expect(engine.diagnostics().playbackContext).toBe('closed');
  });
  it('bounds a silent microphone to three automatic retries without capturing or replaying Twitch', async () => {
    await engine.start({ sessionId: 'native', nativePlayback: true });
    expect(engine.status()).toMatchObject({
      phase: 'active',
      hasMic: true,
      hasTab: false,
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(engine.diagnostics().playbackContext).toBe('closed');
    expect(nodes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20001);
    expect(engine.diagnostics().recoveryAttempts).toBe(3);
    expect(engine.status()?.phase).toBe('micLost');
    expect(engine.diagnostics().speakerConnections).toBe(0);
    expect(engine.diagnostics().tabCaptureTracks).toBe(0);
  });
  it('opens the mic before resuming analysis and delivers frames with tab capture off', async () => {
    requireActiveCapture = true;
    await engine.start({ sessionId: 'capture-first', nativePlayback: true });
    const node = nodes[0]!;
    const processing = node.port.postMessage.mock.calls
      .map(([m]) => m)
      .findLast((m) => m.type === 'processing');
    node.port.onmessage?.({
      data: {
        type: 'frame',
        segment: processing.segment,
        frame: new Float32Array(320).fill(0.1),
        ts: 1000,
      },
    });
    node.port.onmessage?.({
      data: {
        type: 'metrics',
        segment: processing.segment,
        frames: 1,
        rms: 0.1,
        peak: 0.2,
        dropped: 0,
        cpuMs: 1,
        intervalMs: 250,
      },
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(engine.frames.size('mic')).toBe(320);
    expect(engine.status()).toMatchObject({
      hasMic: true,
      hasTab: false,
      metrics: { micFrames: 1 },
    });
    expect(engine.diagnostics().playbackContext).toBe('closed');
  });
  it('resumes analysis after an input/output device interruption without capturing the tab', async () => {
    await engine.start({ sessionId: 'interrupted', nativePlayback: true });
    context.state = 'interrupted';
    context.resume.mockClear();
    await vi.advanceTimersByTimeAsync(250);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.state).toBe('running');
    expect(engine.status()?.hasTab).toBe(false);
  });
  it('keeps a native session crowd-only on mic denial and resumes after retry', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException('denied', 'NotAllowedError'),
    );
    await engine.start({ sessionId: 'retry-native', nativePlayback: true });
    expect(engine.status()).toMatchObject({
      phase: 'micLost',
      hasMic: false,
      hasTab: false,
    });
    expect(context.resume).not.toHaveBeenCalled();
    await engine.retryMic();
    expect(engine.status()).toMatchObject({
      phase: 'active',
      hasMic: true,
      hasTab: false,
    });
    expect(context.resume).toHaveBeenCalledOnce();
  });
  it('switches tab and mic capture live without ending or replacing the saved session', async () => {
    await engine.start({ sessionId: 'live-switch', nativePlayback: true });
    const defaults = {
      tabCapture: false,
      micCapture: true,
      laughModel: true,
      speechModel: true,
      overlay: true,
    };
    await engine.setLab({ ...defaults, tabCapture: true }, 'gesture-stream-id');
    expect(engine.status()).toMatchObject({
      sessionId: 'live-switch',
      hasTab: true,
      hasMic: true,
    });
    await engine.setLab({ ...defaults, micCapture: false });
    expect(tab.item.stop).toHaveBeenCalledOnce();
    expect(mic.item.stop).toHaveBeenCalledOnce();
    expect(engine.status()).toMatchObject({
      phase: 'active',
      hasTab: false,
      hasMic: false,
      micLost: false,
    });
    mic = stream();
    await engine.setLab(defaults);
    expect(engine.status()).toMatchObject({
      sessionId: 'live-switch',
      hasMic: true,
      hasTab: false,
    });
  });
  it('keeps both tracks and replay open during pause, then releases every resource on stop', async () => {
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    expect(engine.status()?.phase).toBe('active');
    expect(nodes).toHaveLength(2);
    expect(contextRequests).toEqual([
      { latencyHint: 'playback' },
      { latencyHint: 'balanced' },
    ]);
    expect(engine.diagnostics().playbackContext).toBe('running');
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
  it.each(['prompt', 'denied'] as const)(
    'uses the actual getUserMedia result when the Permissions API says %s',
    async (state) => {
      vi.mocked(navigator.permissions.query).mockResolvedValue({
        state,
        onchange: null,
      } as unknown as PermissionStatus);
      await engine.start({ sessionId: 'one', streamId: 'opaque' });
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: MICROPHONE_CONSTRAINTS,
        video: false,
      });
      expect(engine.status()).toMatchObject({ phase: 'active', hasMic: true });
    },
  );
  it('does not permanently kill a live microphone during a short source mute', async () => {
    await engine.start({ sessionId: 'one', streamId: 'opaque' });
    mic.item.muted = true;
    mic.item.onmute?.();
    await vi.advanceTimersByTimeAsync(250);
    expect(mic.item.stop).not.toHaveBeenCalled();
    mic.item.muted = false;
    await vi.advanceTimersByTimeAsync(250);
    expect(engine.status()).toMatchObject({ phase: 'active', hasMic: true });
  });
  it('automatically replaces a long-muted input and reports the recovery reason', async () => {
    await engine.start({ sessionId: 'one', nativePlayback: true });
    const original = mic;
    mic = stream();
    original.item.muted = true;
    original.item.onmute?.();
    await vi.advanceTimersByTimeAsync(2001);
    expect(original.item.stop).toHaveBeenCalled();
    expect(engine.status()).toMatchObject({
      phase: 'active',
      hasMic: true,
      hasTab: false,
    });
    expect(engine.diagnostics()).toMatchObject({
      recoveryAttempts: 1,
      recoveryReason: 'microphone track muted',
    });
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
    const lateMic = stream();
    let acquired!: (value: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          acquired = resolve;
        }),
    );
    const calls = vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls
      .length;
    const retry = engine.retryMic();
    await vi.advanceTimersByTimeAsync(0);
    await engine.stop();
    acquired(lateMic as unknown as MediaStream);
    await retry;
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(
      calls + 1,
    );
    expect(lateMic.item.stop).toHaveBeenCalled();
    expect(engine.status()).toBeNull();
  });
});
