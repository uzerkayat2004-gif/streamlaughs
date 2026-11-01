import { afterEach, expect, it, vi } from 'vitest';
import { modelState } from '../diagnostics';
vi.mock('./local-assets', () => ({ installLocalAssetPolicy: () => [] }));
vi.mock('./models', () => ({
  LocalModels: class {
    status = { vad: modelState(), yamnet: modelState(), whisper: modelState() };
    topClass = { label: 'waiting', score: 0 };
    echo = { removed: false, inputRms: 0, outputRms: 0 };
    async loadVad() {
      this.status.vad.phase = 'loading';
      throw new Error('VAD could not load');
    }
    loadFailed() {
      this.status.vad = { phase: 'error', error: 'VAD could not load', ms: 0 };
    }
    resetVad() {}
    async close() {}
  },
}));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('keeps frame arrivals and DSP alive after the VAD model fails at startup', async () => {
  vi.useFakeTimers();
  const postMessage = vi.fn();
  const worker = {
    location: { origin: 'chrome-extension://test' },
    postMessage,
    onmessage: null as ((e: { data: unknown }) => Promise<void>) | null,
    close: vi.fn(),
  };
  vi.stubGlobal('self', worker);
  vi.stubGlobal('defineUnlistedScript', (fn: () => void) => fn());
  await import('../../entrypoints/inference-worker');
  await worker.onmessage!({
    data: {
      type: 'init',
      base: 'chrome-extension://test',
      externalSound: true,
    },
  });
  expect(
    postMessage.mock.calls.some(
      ([m]) =>
        m.type === 'status' &&
        m.health.phase === 'ready' &&
        m.diagnostics.models.vad.phase === 'error',
    ),
  ).toBe(true);
  await worker.onmessage!({
    data: {
      type: 'frame',
      source: 'mic',
      frame: new Float32Array(320).fill(0.01),
      ts: 10000,
      drops: 0,
    },
  });
  expect(postMessage).toHaveBeenCalledWith({ type: 'ack' });
  expect(postMessage.mock.calls.some(([m]) => m.type === 'error')).toBe(false);
  await worker.onmessage!({ data: { type: 'close' } });
});
