import {
  AudioMetricsSchema,
  emptyInferenceHealth,
  InferenceHealthSchema,
  SafePhraseSchema,
} from '@laughline/shared';
import { z } from 'zod';
export const SpeechResultSchema = z
  .object({ phrases: z.array(SafePhraseSchema).max(64), hype: z.boolean() })
  .strict();
export const ClassScoresSchema = z
  .object({
    laugh: z.number().min(0).max(1),
    scream: z.number().min(0).max(1),
    gasp: z.number().min(0).max(1),
    speech: z.number().min(0).max(1),
  })
  .strict();
export const EchoStateSchema = z
  .object({
    removed: z.boolean(),
    inputRms: z.number().nonnegative(),
    outputRms: z.number().nonnegative(),
  })
  .strict();

export const modelState = () => ({
  phase: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  error: '',
  ms: 0,
});
const model = z
  .object({
    phase: z.enum(['idle', 'loading', 'ready', 'error']),
    error: z.string().max(400),
    ms: z.number().nonnegative(),
  })
  .strict();
export const ModelStateSchema = model;
const track = z
  .object({
    name: z.string().max(256),
    state: z.enum(['none', 'live', 'ended']),
    muted: z.boolean(),
    enabled: z.boolean(),
    sampleRate: z.number().nonnegative(),
  })
  .strict();
export const WorkerDiagnosticsSchema = z
  .object({
    stages: z
      .object({
        nonzeroFrames: z.number().nonnegative(),
        vadCalls: z.number().nonnegative(),
        voicedChunks: z.number().nonnegative(),
        segments: z.number().nonnegative(),
        soundCalls: z.number().nonnegative(),
        soundJobsSkipped: z.number().nonnegative().default(0),
        speechRequests: z.number().nonnegative(),
        speechResults: z.number().nonnegative(),
        wordEvents: z.number().nonnegative(),
        acceptedEvents: z.number().nonnegative(),
      })
      .strict()
      .default(() => emptyStages()),
    laughScore: z.number().min(0).max(1).default(0),
    echo: EchoStateSchema.default(() => ({
      removed: false,
      inputRms: 0,
      outputRms: 0,
    })),
    models: z.object({ vad: model, yamnet: model, whisper: model }).strict(),
    topClass: z
      .object({ label: z.string().max(120), score: z.number().min(0).max(1) })
      .strict(),
    health: InferenceHealthSchema,
    micFrames: z.number().nonnegative(),
    tabFrames: z.number().nonnegative(),
    micFps: z.number().nonnegative(),
    tabFps: z.number().nonnegative(),
    sampleRate: z.literal(16000),
    frameSamples: z.literal(320),
    guard: z
      .object({
        kept: z.boolean(),
        reason: z.string().max(160),
        correlation: z.number().min(0).max(1),
      })
      .strict(),
    events: z
      .array(
        z
          .object({
            kind: z.enum(['laugh', 'scream', 'gasp', 'hype', 'words']),
            ts: z.number(),
            confidence: z.number().min(0).max(1),
            count: z.number().nonnegative(),
          })
          .strict(),
      )
      .max(20),
    gain: z.number().nonnegative(),
    noiseFloor: z.number().nonnegative(),
    error: z.string().max(400),
  })
  .strict();
export type WorkerDiagnostics = z.infer<typeof WorkerDiagnosticsSchema>;
export const emptyStages = () => ({
  nonzeroFrames: 0,
  vadCalls: 0,
  voicedChunks: 0,
  segments: 0,
  soundCalls: 0,
  soundJobsSkipped: 0,
  speechRequests: 0,
  speechResults: 0,
  wordEvents: 0,
  acceptedEvents: 0,
});
export const emptyWorkerDiagnostics = (): WorkerDiagnostics => ({
  stages: emptyStages(),
  laughScore: 0,
  echo: { removed: false, inputRms: 0, outputRms: 0 },
  models: { vad: modelState(), yamnet: modelState(), whisper: modelState() },
  topClass: { label: 'waiting', score: 0 },
  health: emptyInferenceHealth(),
  micFrames: 0,
  tabFrames: 0,
  micFps: 0,
  tabFps: 0,
  sampleRate: 16000,
  frameSamples: 320,
  guard: { kept: true, reason: 'waiting for audio', correlation: 0 },
  events: [],
  gain: 1,
  noiseFloor: 0,
  error: '',
});
export const AudioDiagnosticsSchema = z
  .object({
    permission: z.enum(['prompt', 'granted', 'denied']).default('prompt'),
    micAttempts: z.number().nonnegative().default(0),
    micOpened: z.number().nonnegative().default(0),
    echoCancellation: z.boolean().default(false),
    phase: z.string().max(32),
    context: z.string().max(32),
    inputSampleRate: z.number().nonnegative(),
    sampleRate: z.literal(16000),
    frameSamples: z.literal(320),
    mic: track,
    tab: track,
    metrics: AudioMetricsSchema,
    error: z.string().max(400),
  })
  .strict();
export const DiagnosticsSchema = z
  .object({
    offscreenAlive: z.boolean().default(false),
    micConsent: z.boolean().default(false),
    sessionMatches: z.boolean().default(false),
    savedLaughs: z.number().nonnegative().default(0),
    savedWords: z.number().nonnegative().default(0),
    sessionLaughs: z.number().nonnegative().default(0),
    sessionWords: z.number().nonnegative().default(0),
    version: z.string().max(30),
    listening: z.boolean(),
    captureState: z.string().max(32),
    audio: AudioDiagnosticsSchema.nullable(),
    inference: WorkerDiagnosticsSchema.nullable(),
    error: z.string().max(400),
  })
  .strict();
export type DiagnosticsReport = z.infer<typeof DiagnosticsSchema>;
export function safeError(error: unknown) {
  return (
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : 'local audio processing failed'
  )
    .replace(
      /(?:https?:\/\/|chrome-extension:\/\/)[^\s)]+/g,
      '[local resource]',
    )
    .slice(0, 400);
}
// The clipboard boundary is deliberately an allowlist: never serialize a worker message.
export const copyableReport = (value: unknown) =>
  JSON.stringify(DiagnosticsSchema.parse(value), null, 2);
