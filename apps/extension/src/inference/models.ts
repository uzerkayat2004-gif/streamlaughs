import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  LogitsProcessorList,
  pipeline,
  StoppingCriteria,
  StoppingCriteriaList,
  Tensor,
  WhisperFeatureExtractor,
} from '@huggingface/transformers';
import { AudioClassifier, FilesetResolver } from '@mediapipe/tasks-audio';
import * as ort from 'onnxruntime-web/webgpu';
import { logAudioError, modelState, safeError } from '../diagnostics';
import type { SpeechConfidence } from './accuracy';
import {
  INFERENCE_CONFIG as C,
  type ClassScores,
  SOUND_CLASSES,
} from './config';
import {
  decideSpot,
  type SpotEntry,
  type SpotResult,
  spotEntries,
} from './keyword-spot';

import { mapSoundScores } from './rules';
import { loadSelfTestClip } from './selftest-fixture';
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

/**
 * Second opinion for short clips: multilingual Whisper base (20 s context).
 * English-only tiny/base models heard a real Indian-English "bro" as "No",
 * "Oh" or "The" (tiny.en 0/10, base.en 3/10); multilingual base wrote
 * "bro"/"Pro" for 8/10 of the same clips. Accents are why.
 */
const CHECK_OPTIONS = { language: 'english', task: 'transcribe' } as const;
const makeChecker = () =>
  pipeline<'automatic-speech-recognition'>(
    'automatic-speech-recognition',
    'whisper-base',
    {
      device: 'wasm',
      dtype: 'q8',
      local_files_only: true,
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
  heard?: string;
  laughed?: boolean;
  noWords?: boolean;
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
              // q4 runs float matmuls; the q8 int8 kernels printed garbage on a
              // Windows x86 Chrome (same text for every phrase).
              { device, dtype: 'q4', local_files_only: true },
            )
          : await makeWhisper(device);
      if (this.speechModel === 'whisper') this.compactSpeech();
      await this.whisper(new Float32Array(16000), { max_new_tokens: 2 });
      this.backend = device === 'webgpu' ? 'mixed' : 'wasm';
      await this.speechSelfTest(base);
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
  /**
   * Second opinion for short clips. On real "bro"s Moonshine Tiny hears
   * "Throw", "Brand", "Well"; multilingual Whisper base hears most of them.
   * Loaded after Moonshine and kept only if it passes the same self-test.
   */
  private checker?: AutomaticSpeechRecognitionPipeline;
  checkerState: 'off' | 'loading' | 'ready' | 'failed' = 'off';
  async loadChecker(base: string) {
    if (this.speechModel !== 'moonshine' || this.checkerState !== 'off') return;
    this.checkerState = 'loading';
    try {
      const checker = await makeChecker();
      const samples = await loadSelfTestClip(base);
      if (samples) {
        const out = await checker(samples, {
          ...CHECK_OPTIONS,
          max_new_tokens: 24,
        });
        const text = (Array.isArray(out) ? out[0]?.text : out.text) ?? '';
        if (!/\b(meet|tuesday|think)\b/i.test(text)) {
          await checker.dispose().catch(() => {});
          throw new Error(`checker self-test heard "${text.slice(0, 60)}"`);
        }
      }
      this.checker = checker;
      this.checkerState = 'ready';
    } catch (error) {
      this.checkerState = 'failed';
      logAudioError('short-word checker unavailable', error);
    }
  }
  async check(samples: Float32Array) {
    if (!this.checker) return null;
    const start = performance.now();
    let peak = 0;
    for (const v of samples) peak = Math.max(peak, Math.abs(v));
    const input = peak > 0 ? samples.map((v) => (v / peak) * 0.5) : samples;
    const out = await this.checker(input, {
      ...CHECK_OPTIONS,
      max_new_tokens: 8,
    });
    this.times.whisper += performance.now() - start;
    return ((Array.isArray(out) ? out[0]?.text : out.text) ?? '').trim();
  }
  speechSelfTestText = '';
  // Runs a known 3 s English clip through the loaded model. A model that runs
  // but prints the wrong words on this CPU is treated as a failed load.
  private async speechSelfTest(base: string) {
    const samples = await loadSelfTestClip(base);
    if (!samples) return;
    const out = await this.whisper(samples, { max_new_tokens: 24 });
    const text = (Array.isArray(out) ? out[0]?.text : out.text) ?? '';
    this.speechSelfTestText = text.slice(0, 120);
    if (!/\b(meet|tuesday|think)\b/i.test(text))
      throw new Error(`speech self-test failed · heard "${text.slice(0, 60)}"`);
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
        ? start +
            Math.max(12000, (samples.length / 16) * C.whisperBudgetRtf * 3)
        : Infinity,
    );
    const stopping = new StoppingCriteriaList();
    stopping.push(deadline);
    // Transformers forwards generation options to model.generate; its ASR convenience type omits stopping_criteria.
    const options = {
      // Fewer tokens for short clips: a 1 s reaction is 1 to 3 words, and the
      // extra room only filled with invented sentences.
      max_new_tokens: Math.max(5, Math.ceil((samples.length / 16000) * 4) + 2),
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
              { device: 'wasm', dtype: 'q4', local_files_only: true },
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
  private spotCache?: {
    entries: SpotEntry[];
    seqs: number[][];
    ids: Tensor;
    L: number;
  };
  /** Score every reaction (said alone) against a short clip. Moonshine only. */
  async spot(samples: Float32Array): Promise<SpotResult | null> {
    if (this.speechModel !== 'moonshine' || !this.whisper) return null;
    const start = performance.now();
    // biome-ignore lint/suspicious/noExplicitAny: raw transformers.js internals (encoder session, batched decoder)
    type Raw = any;
    const { model, tokenizer, processor } = this.whisper as unknown as {
      model: Raw;
      tokenizer: Raw;
      processor: Raw;
    };
    if (!this.spotCache) {
      const entries = spotEntries();
      const seqs = entries.map((e) => [
        1,
        ...(tokenizer.encode(e.text, {
          add_special_tokens: false,
        }) as number[]),
        2,
      ]);
      const L = Math.max(...seqs.map((q) => q.length)) - 1;
      const ids = new BigInt64Array(seqs.length * L);
      seqs.forEach((q, n) => {
        for (let i = 0; i < L; i++) ids[n * L + i] = BigInt(q[i] ?? 2);
      });
      this.spotCache = {
        entries,
        seqs,
        L,
        ids: new Tensor('int64', ids, [seqs.length, L]),
      };
    }
    const { entries, seqs, L, ids } = this.spotCache;
    const inputs = await processor(samples);
    const raw = Object.values(
      await model.sessions.model.run({ input_values: inputs.input_values }),
    )[0] as { data: Float32Array; dims: number[] };
    const [, T, D] = raw.dims as [number, number, number];
    const N = seqs.length,
      rep = new Float32Array(N * T * D);
    for (let n = 0; n < N; n++) rep.set(raw.data, n * T * D);
    if (!model.forward_params.includes('encoder_outputs'))
      model.forward_params = [...model.forward_params, 'encoder_outputs'];
    const out = await model({
      encoder_outputs: new Tensor('float32', rep, [N, T, D]),
      decoder_input_ids: ids,
    });
    const V = out.logits.dims[2] as number,
      d = out.logits.data as Float32Array;
    const scores = seqs.map((q, n) => {
      let lp = 0;
      for (let i = 0; i < q.length - 1; i++) {
        const row = d.subarray((n * L + i) * V, (n * L + i + 1) * V);
        let m = -Infinity;
        for (const v of row) m = Math.max(m, v);
        let z = 0;
        for (const v of row) z += Math.exp(v - m);
        lp += row[q[i + 1]!]! - m - Math.log(z);
      }
      return lp;
    });
    this.times.whisper += performance.now() - start;
    return decideSpot(entries, scores);
  }
  async close() {
    await this.checker?.dispose().catch(() => {});
    this.checker = undefined;
    this.context.fill(0);
    this.state.fill(0);
    this.yamnet?.close();
    await this.silero?.release();
    await this.whisper?.dispose();
  }
}
