import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
  StoppingCriteria,
  StoppingCriteriaList,
} from '@huggingface/transformers';
import { AudioClassifier, FilesetResolver } from '@mediapipe/tasks-audio';
import * as ort from 'onnxruntime-web/webgpu';
import { modelState, safeError } from '../diagnostics';
import {
  INFERENCE_CONFIG as C,
  type ClassScores,
  SOUND_CLASSES,
} from './config';
import { removeReferenceEcho } from './reference-echo';
import { mapSoundScores } from './rules';

const makeWhisper = (device: 'wasm' | 'webgpu') =>
  pipeline<'automatic-speech-recognition'>(
    'automatic-speech-recognition',
    'whisper-tiny.en',
    { device, dtype: 'q8', local_files_only: true },
  );

export type SpeechResult = {
  phrases: Extract<
    import('@laughline/shared').PersonalEvent,
    { kind: 'words' }
  >['phrases'];
  hype: boolean;
};
export interface ModelRunner {
  topClass?: { label: string; score: number };
  echo?: { removed: boolean; inputRms: number; outputRms: number };
  vad(samples: Float32Array): Promise<number>;
  sound(
    samples: Float32Array,
    reference?: Float32Array,
  ): ClassScores | Promise<ClassScores>;
  words(samples: Float32Array): Promise<string | SpeechResult>;
  resetVad?(): void;
}
class Deadline extends StoppingCriteria {
  exceeded = false;
  constructor(private until: number) {
    super();
  }
  override _call(ids: number[][]) {
    this.exceeded = performance.now() > this.until;
    return ids.map(() => this.exceeded);
  }
}
export class LocalModels implements ModelRunner {
  backend: 'wasm' | 'mixed' = 'wasm';
  loadMs = { vad: 0, yamnet: 0, whisper: 0 };
  times = { vad: 0, yamnet: 0, whisper: 0 };
  calls = { vad: 0, yamnet: 0, whisper: 0 };
  status = { vad: modelState(), yamnet: modelState(), whisper: modelState() };
  topClass = { label: 'waiting', score: 0 };
  echo = { removed: false, inputRms: 0, outputRms: 0 };
  private silero!: ort.InferenceSession;
  private yamnet!: AudioClassifier;
  private whisper!: AutomaticSpeechRecognitionPipeline;
  private state = new Float32Array(256);
  private context = new Float32Array(64);
  private slowGpu = false;
  resetVad() {
    this.state.fill(0);
    this.context.fill(0);
  }
  private configure(base: string) {
    ort.env.wasm.wasmPaths = `${base}/runtime/onnx/`;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.logLevel = 'error';
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = `${base}/models/`;
    env.useBrowserCache = false;
    env.useFSCache = false;
    env.backends.onnx.wasm!.wasmPaths = `${base}/runtime/onnx/`;
    env.backends.onnx.wasm!.numThreads = 1;
    env.backends.onnx.wasm!.proxy = false;
  }
  async load(base: string, preference: 'auto' | 'wasm' | 'webgpu' = 'auto') {
    await this.loadRealtime(base);
    await this.loadSpeech(base, preference);
  }
  async loadRealtime(base: string) {
    await this.loadVad(base);
    await this.loadSound(base);
  }
  async loadVad(base: string) {
    this.configure(base);
    const start = performance.now();
    this.status.vad.phase = 'loading';
    this.silero = await ort.InferenceSession.create(
      `${base}/models/silero-v5.onnx`,
      { executionProviders: ['wasm'] },
    );
    this.loadMs.vad = performance.now() - start;
    this.status.vad = { phase: 'ready', error: '', ms: this.loadMs.vad };
    await this.vad(new Float32Array(C.vadWindow));
    this.resetVad();
  }
  async loadSound(base: string) {
    this.configure(base);
    const start = performance.now();
    this.status.yamnet.phase = 'loading';
    this.yamnet = await AudioClassifier.createFromOptions(
      await FilesetResolver.forAudioTasks(`${base}/runtime/mediapipe`),
      {
        baseOptions: { modelAssetPath: `${base}/models/yamnet.tflite` },
        maxResults: 521,
      },
    );
    this.loadMs.yamnet = performance.now() - start;
    // Compile kernels before accepting live frames; first-call JIT must not trip overload recovery.
    this.sound(new Float32Array(C.soundWindow));
    this.topClass = { label: 'waiting', score: 0 };
    this.status.yamnet = { phase: 'ready', error: '', ms: this.loadMs.yamnet };
  }
  async loadSpeech(
    base: string,
    preference: 'auto' | 'wasm' | 'webgpu' = 'wasm',
  ) {
    this.configure(base);
    const start = performance.now();
    this.status.whisper.phase = 'loading';
    const gpu =
      preference !== 'wasm' &&
      !!(await (
        navigator as Navigator & {
          gpu?: { requestAdapter(): Promise<unknown> };
        }
      ).gpu
        ?.requestAdapter()
        .catch(() => null));
    if (gpu) {
      try {
        this.whisper = await makeWhisper('webgpu');
        await this.whisper(new Float32Array(16000), { max_new_tokens: 1 });
        this.backend = 'mixed';
      } catch {
        if (preference === 'webgpu')
          throw new Error('WebGPU initialization failed');
        await this.whisper?.dispose().catch(() => {});
        this.whisper = await makeWhisper('wasm');
      }
    } else this.whisper = await makeWhisper('wasm');
    this.loadMs.whisper = performance.now() - start;
    this.status.whisper = {
      phase: 'ready',
      error: '',
      ms: this.loadMs.whisper,
    };
  }
  loadFailed(error: unknown) {
    for (const state of Object.values(this.status))
      if (state.phase === 'loading') {
        state.phase = 'error';
        state.error = safeError(error);
      }
  }
  async vad(samples: Float32Array) {
    const start = performance.now();
    const input = new Float32Array(576);
    input.set(this.context);
    input.set(samples, 64);
    const feeds = {
      input: new ort.Tensor('float32', input, [1, 576]),
      state: new ort.Tensor('float32', this.state, [2, 1, 128]),
      sr: new ort.Tensor('int64', BigInt64Array.from([16000n]), []),
    };
    const out = await this.silero.run(feeds);
    const probability = Number(out.output!.data[0]);
    this.state.set(out.stateN!.data as Float32Array);
    this.context.set(samples.subarray(448));
    for (const tensor of [...Object.values(feeds), ...Object.values(out)])
      tensor.dispose();
    this.times.vad += performance.now() - start;
    this.calls.vad++;
    return probability;
  }
  sound(samples: Float32Array, reference?: Float32Array) {
    const start = performance.now();
    const clean = reference ? removeReferenceEcho(samples, reference) : samples;
    const rms = (values: Float32Array) =>
      Math.sqrt(
        values.reduce((sum, value) => sum + value * value, 0) /
          Math.max(1, values.length),
      );
    this.echo = {
      removed: clean !== samples,
      inputRms: rms(samples),
      outputRms: rms(clean),
    };
    const result = this.yamnet.classify(clean, 16000);
    if (clean !== samples) clean.fill(0);
    const top = result[0]?.classifications[0]?.categories?.toSorted(
      (a, b) => b.score - a.score,
    )[0];
    this.topClass = {
      label: (top?.categoryName ?? 'unknown').slice(0, 120),
      score: top?.score ?? 0,
    };
    const scores = mapSoundScores(
      result[0]?.classifications[0]?.categories ?? [],
      SOUND_CLASSES,
    );
    if (clean !== samples) {
      // Reference cleanup is a complementary view, never a replacement that can
      // erase evidence in the original mic. The raw-waveform guard still rejects
      // confirmed playback after classification.
      const original = this.yamnet.classify(samples, 16000);
      const raw = mapSoundScores(
        original[0]?.classifications[0]?.categories ?? [],
        SOUND_CLASSES,
      );
      for (const key of Object.keys(scores) as (keyof ClassScores)[])
        scores[key] = Math.max(scores[key], raw[key]);
      this.calls.yamnet++;
    }
    this.times.yamnet += performance.now() - start;
    this.calls.yamnet++;
    return scores;
  }
  async words(samples: Float32Array, enforceBudget = true) {
    if (this.slowGpu) {
      await this.whisper.dispose().catch(() => {});
      this.whisper = await makeWhisper('wasm');
      this.backend = 'wasm';
      this.slowGpu = false;
    }
    const start = performance.now();
    const deadline = new Deadline(
      enforceBudget
        ? start + Math.max(2500, (samples.length / 16) * C.whisperBudgetRtf)
        : Infinity,
    );
    const stopping = new StoppingCriteriaList();
    stopping.push(deadline);
    // Transformers forwards generation options to model.generate; its ASR convenience type omits stopping_criteria.
    const options = {
      max_new_tokens: 64,
      return_timestamps: false,
      stopping_criteria: stopping,
    };
    let result: { text: string } | { text: string }[];
    try {
      result = await this.whisper(samples, options);
    } catch {
      if (this.backend !== 'mixed')
        throw new Error('Local transcription unavailable');
      await this.whisper.dispose().catch(() => {});
      this.whisper = await makeWhisper('wasm');
      this.backend = 'wasm';
      result = await this.whisper(samples, options);
    }
    this.times.whisper += performance.now() - start;
    this.calls.whisper++;
    if (deadline.exceeded) {
      this.slowGpu = this.backend === 'mixed';
      throw new Error('Transcription budget exceeded');
    }
    return (Array.isArray(result) ? result[0]?.text : result.text) ?? '';
  }
  async close() {
    this.context.fill(0);
    this.state.fill(0);
    this.yamnet?.close();
    await this.silero?.release();
    await this.whisper?.dispose();
  }
}
