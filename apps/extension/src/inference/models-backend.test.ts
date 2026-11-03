import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({ pipeline: vi.fn() }));
vi.mock('@huggingface/transformers', () => ({
  env: { backends: { onnx: { wasm: {} } } },
  pipeline: mocks.pipeline,
  StoppingCriteria: class {},
  StoppingCriteriaList: class extends Array {},
  LogitsProcessor: class {},
  LogitsProcessorList: class extends Array {},
  WhisperFeatureExtractor: class {},
  Tensor: class {},
}));
vi.mock('onnxruntime-web/webgpu', () => ({ env: { wasm: {} } }));
vi.mock('@mediapipe/tasks-audio', () => ({
  AudioClassifier: class {},
  FilesetResolver: {},
}));
import { LocalModels } from './models';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function recognizer() {
  return Object.assign(
    vi.fn(async () => ({ text: 'W' })),
    { processor: { feature_extractor: {} }, dispose: vi.fn(async () => {}) },
  );
}
it('loads WebGPU only when requested and available', async () => {
  vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({}) } });
  mocks.pipeline.mockResolvedValue(recognizer());
  const m = new LocalModels();
  await m.loadSpeech('chrome-extension://test', 'auto');
  expect(mocks.pipeline.mock.calls[0]?.[2]).toMatchObject({
    device: 'webgpu',
    local_files_only: true,
  });
  const features = JSON.parse(
    readFileSync(
      new URL(
        '../../public/models/whisper-base/preprocessor_config.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const model = JSON.parse(
    readFileSync(
      new URL(
        '../../public/models/whisper-base/config.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  expect(
    mocks.pipeline.mock.calls[0]?.[2].session_options.freeDimensionOverrides
      .encoder_sequence_length,
  ).toBe(features.nb_max_frames);
  expect(model.max_source_positions * 2).toBe(features.nb_max_frames);
  expect(features.n_samples).toBe(features.nb_max_frames * 160);
  expect(m.backend).toBe('mixed');
  expect(m.status.whisper.phase).toBe('ready');
  await m.close();
});
it('falls back to one-thread local WASM even when explicit WebGPU initialization fails', async () => {
  vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({}) } });
  mocks.pipeline
    .mockRejectedValueOnce(new Error('GPU unavailable'))
    .mockResolvedValueOnce(recognizer());
  const m = new LocalModels();
  await m.loadSpeech('chrome-extension://test', 'webgpu');
  expect(mocks.pipeline.mock.calls.map((c) => c[2].device)).toEqual([
    'webgpu',
    'wasm',
  ]);
  expect(m.backend).toBe('wasm');
  expect(m.status.whisper.phase).toBe('ready');
  await m.close();
});
it('uses WASM with no adapter and surfaces a WASM load failure', async () => {
  vi.stubGlobal('navigator', {});
  mocks.pipeline.mockRejectedValueOnce(new Error('missing bundled model'));
  const m = new LocalModels();
  await expect(m.loadSpeech('chrome-extension://test', 'auto')).rejects.toThrow(
    'missing bundled model',
  );
  m.loadFailed(new Error('missing bundled model'));
  expect(m.status.whisper.phase).toBe('error');
  expect(m.status.whisper.error).toContain('missing bundled model');
});
