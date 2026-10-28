import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
