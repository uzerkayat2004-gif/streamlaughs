import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  LogitsProcessorList,
  pipeline,
  StoppingCriteria,
  StoppingCriteriaList,
  WhisperFeatureExtractor,
} from '@huggingface/transformers';
import { AudioClassifier, FilesetResolver } from '@mediapipe/tasks-audio';
import * as ort from 'onnxruntime-web/webgpu';
import { modelState, safeError, logAudioError } from '../diagnostics';
import type { SpeechConfidence } from './accuracy';
import {
  INFERENCE_CONFIG as C,
  type ClassScores,
  SOUND_CLASSES,
} from './config';

import { mapSoundScores } from './rules';
import type { SpeechBudget } from './speech-budget';
import { WhisperConfidence } from './whisper-confidence';
import { compactWhisperFeatures } from './whisper-features';

const makeWhisper = (device: 'wasm' | 'webgpu') =>
  pipeline<'automatic-speech-recognition'>(
    'automatic-speech-recognition',
    'whisper-tiny.en',
    {
      device,
      dtype: 'q8',
      local_files_only: true,
      // Fix known encoder dimensions so ONNX can optimize the quantized graph.
      // Decoder cache/sequence dimensions remain dynamic.
      session_options: {
        graphOptimizationLevel: 'all',
        freeDimensionOverrides: {
          batch_size: 1,
          feature_size: 80,
          encoder_sequence_length: 2000,
        },
      },
    },
  );

export type SpeechResult = {
  phrases: Extract<
    import('@laughline/shared').PersonalEvent,
    { kind: 'words' }
  >['phrases'];
  hype: boolean;
  matched?: number;
  rejected?: number;
  avgLogprob?: number | null;
  noSpeechProbability?: number | null;
  rejection?: string;
};
export interface ModelRunner {
  soundStatus?: string;
  topClass?: { label: string; score: number };
  echo?: { removed: boolean; inputRms: number; outputRms: number };
  vad(samples: Float32Array): Promise<number>;
  sound(
    samples: Float32Array,
    reference?: Float32Array,
  ): ClassScores | Promise<ClassScores>;
  words(samples: Float32Array): Promise<string | SpeechResult>;
  resetVad?(): void;
  lastSpeechConfidence?: SpeechConfidence;
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
  private speechModel: 'moonshine' | 'whisper' = 'moonshine';
  private speechFallbackReason = '';
  private currentSpeechBudget?: SpeechBudget;
  private compactSpeech() {
    const extractor = this.whisper.processor.feature_extractor;
    if (extractor instanceof WhisperFeatureExtractor)
      compactWhisperFeatures(extractor, () => this.currentSpeechBudget);
  }
  lastSpeechConfidence: SpeechConfidence = {
    avgLogprob: null,
    noSpeechProbability: null,
  };
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
    const load = async (device: 'wasm' | 'webgpu') => {
      this.whisper =
        this.speechModel === 'moonshine'
          ? await pipeline<'automatic-speech-recognition'>(
              'automatic-speech-recognition',
              'moonshine-tiny',
              { device, dtype: 'q8', local_files_only: true },
            )
          : await makeWhisper(device);
      if (this.speechModel === 'whisper') this.compactSpeech();
      await this.whisper(new Float32Array(16000), { max_new_tokens: 2 });
      this.backend = device === 'webgpu' ? 'mixed' : 'wasm';
    };
    this.speechModel = 'moonshine';
    try {
      if (gpu) {
        try {
          await load('webgpu');
        } catch {
          await this.whisper?.dispose().catch(() => {});
          await load('wasm');
        }
      } else await load('wasm');
    } catch (error) {
      this.speechFallbackReason = `Moonshine failed: ${safeError(error)} · using bundled Whisper`;
      logAudioError('Moonshine load · using bundled Whisper', error);
      await this.whisper?.dispose().catch(() => {});
      this.speechModel = 'whisper';
      await load('wasm');
    }
    this.loadMs.whisper = performance.now() - start;
    this.status.whisper = {
      phase: 'ready',
      name:
        this.speechModel === 'moonshine'
          ? 'Moonshine Tiny'
          : 'Whisper fallback',
      error: this.speechFallbackReason,
      ms: this.loadMs.whisper,
    };
  }
  loadFailed(error: unknown) {
    logAudioError('local model failed to load', error);
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
    const clean = samples;
    this.echo = { removed: false, inputRms: 0, outputRms: 0 };
    const result = this.yamnet.classify(clean, 16000);
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
    this.times.yamnet += performance.now() - start;
    this.calls.yamnet++;
    return scores;
  }
  lastWordWorkMs = 0;
  async words(
    samples: Float32Array,
    enforceBudget = true,
    budget?: SpeechBudget,
  ) {
    const start = performance.now(),
      waitedBefore = budget?.waitedMs ?? 0;
    const deadline = new Deadline(
      enforceBudget
        ? start + Math.max(12000, (samples.length / 16) * C.whisperBudgetRtf * 3)
        : Infinity,
    );
    const stopping = new StoppingCriteriaList();
    stopping.push(deadline);
    // Transformers forwards generation options to model.generate; its ASR convenience type omits stopping_criteria.
    const options = {
      max_new_tokens: Math.max(6, Math.ceil((samples.length / 16000) * 6) + 4),
      return_timestamps: false,
      stopping_criteria: stopping,
    };
    const transcribe = async () => {
      this.currentSpeechBudget = budget;
      const confidence = new WhisperConfidence(),
        processors = new LogitsProcessorList();
      processors.push(confidence);
      const model = this.whisper.model,
        forward = model.forward;
      const restore: (() => void)[] = [];
      if (budget)
        for (const [name, session] of Object.entries(model.sessions)) {
          const original = session.run;
          session.run = ((...args: Parameters<typeof original>) =>
            budget.run(
              () => original.apply(session, args),
              `${name}:${Reflect.get(args[0] ?? {}, 'use_cache_branch')?.data?.[0] ? 'cached' : 'initial'}`,
            )) as typeof original;
          restore.push(() => {
            session.run = original;
          });
        }
      if (this.speechModel === 'whisper')
        model.forward = async function (inputs) {
          const output = await forward.call(this, inputs);
          if (output.logits) confidence.capture(output.logits);
          return output;
        };
      const generationOptions =
        this.speechModel === 'whisper'
          ? { ...options, logits_processor: processors }
          : options;
      try {
        return await this.whisper(samples, generationOptions);
      } finally {
        model.forward = forward;
        this.currentSpeechBudget = undefined;
        for (const reset of restore) reset();
        this.lastSpeechConfidence = confidence.result();
        confidence.clear();
      }
    };
    let result: { text: string } | { text: string }[];
    try {
      result = await transcribe();
    } catch (error) {
      if (this.backend !== 'mixed') throw error;
      await this.whisper.dispose().catch(() => {});
      this.whisper =
        this.speechModel === 'moonshine'
          ? await pipeline<'automatic-speech-recognition'>(
              'automatic-speech-recognition',
              'moonshine-tiny',
              { device: 'wasm', dtype: 'q8', local_files_only: true },
            )
          : await makeWhisper('wasm');
      if (this.speechModel === 'whisper') this.compactSpeech();
      this.backend = 'wasm';
      result = await transcribe();
    }
    this.lastWordWorkMs = Math.max(
      0,
      performance.now() - start - ((budget?.waitedMs ?? 0) - waitedBefore),
    );
    this.times.whisper += this.lastWordWorkMs;
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
