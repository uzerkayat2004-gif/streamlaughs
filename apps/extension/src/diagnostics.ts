import {
  AudioMetricsSchema,
  emptyInferenceHealth,
  InferenceHealthSchema,
  isApprovedPhrase,
  SafePhraseSchema,
} from '@laughline/shared';
import { z } from 'zod';
import {
  emptyTasks,
  LabSwitchesSchema,
  PlaybackStatsSchema,
  TaskStatsSchema,
} from './stutter';
export const SpeechResultSchema = z
  .object({
    phrases: z.array(SafePhraseSchema).max(64),
    hype: z.boolean(),
    matched: z.number().nonnegative().default(0),
    rejected: z.number().nonnegative().default(0),
    avgLogprob: z.number().finite().nullable().optional(),
    noSpeechProbability: z.number().min(0).max(1).nullable().optional(),
    rejection: z.string().max(200).optional(),
    heard: z.string().max(200).optional(),
    laughed: z.boolean().optional(),
    noWords: z.boolean().optional(),
  })
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

export const modelState = (): {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  error: string;
  ms: number;
  name?: string;
} => ({
  phase: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  error: '',
  ms: 0,
});
const model = z
  .object({
    phase: z.enum(['idle', 'loading', 'ready', 'error']),
    name: z.string().max(80).optional(),
    error: z.string().max(400),
    ms: z.number().nonnegative(),
  })
  .strict();
export const ModelStateSchema = model;
export const AccuracyRecordSchema = z
  .object({
    canonical: z.string().max(240).optional(),
    kind: z.enum(['laugh', 'words']),
    ts: z.number(),
    accepted: z.boolean(),
    detector: z.enum(['dsp', 'yamnet', 'both', 'whisper']),
    reason: z.string().max(200),
    laughter: z.number(),
    speech: z.number(),
    dsp: z.number(),
    durationMs: z.number(),
    aboveFloorDb: z.number().finite(),
    rms: z.number(),
    highFrequencyRatio: z.number(),
    avgLogprob: z.number().finite().nullable(),
    noSpeechProbability: z.number().nullable(),
    heard: z.string().max(200).optional(),
  })
  .strict();
export type AccuracyRecord = z.infer<typeof AccuracyRecordSchema>;
const track = z
  .object({
    name: z.string().max(256),
    state: z.enum(['none', 'live', 'ended']),
    muted: z.boolean(),
    enabled: z.boolean(),
    sampleRate: z.number().nonnegative(),
    channelCount: z.number().nonnegative().default(0),
    echoCancellation: z.boolean().default(false),
    noiseSuppression: z.boolean().default(false),
    autoGainControl: z.boolean().default(false),
    device: z.string().max(32).default('system default'),
  })
  .strict();
export const WorkerDiagnosticsSchema = z
  .object({
    vadError: z.string().max(400).default(''),
    soundError: z.string().max(400).default(''),
    speechError: z.string().max(400).default(''),
    inputGaps: z.number().nonnegative().default(0),
    accuracyLog: z.array(AccuracyRecordSchema).max(20).default([]),
    laughDetectors: z
      .object({ dsp: z.number(), yamnet: z.number(), both: z.number() })
      .default(() => ({ dsp: 0, yamnet: 0, both: 0 })),
    stages: z
      .object({
        nonzeroFrames: z.number().nonnegative(),
        vadCalls: z.number().nonnegative(),
        voicedChunks: z.number().nonnegative(),
        segments: z.number().nonnegative(),
        soundCalls: z.number().nonnegative(),
        dspHits: z.number().nonnegative().default(0),
        soundJobsSkipped: z.number().nonnegative().default(0),
        speechRequests: z.number().nonnegative(),
        speechResults: z.number().nonnegative(),
        wordsMatched: z.number().nonnegative().default(0),
        wordsRejected: z.number().nonnegative().default(0),
        wordEvents: z.number().nonnegative(),
        acceptedEvents: z.number().nonnegative(),
      })
      .strict()
      .default(() => emptyStages()),
    laughConfidence: z.number().min(0).max(1).default(0),
    basicMode: z.boolean().default(false),
    laughScore: z.number().min(0).max(1).default(0),
    soundCpuMsPerSecond: z.number().nonnegative().default(0),
    speechOverruns: z.number().nonnegative().default(0),
    speechCooldownMs: z.number().nonnegative().default(0),
    vadCpuMsPerSecond: z.number().nonnegative().default(0),
    tasks: TaskStatsSchema.default(emptyTasks),
    workerTasks: z
      .object({
        realtime: TaskStatsSchema,
        sound: TaskStatsSchema,
        speech: TaskStatsSchema,
      })
      .default(() => ({
        realtime: emptyTasks(),
        sound: emptyTasks(),
        speech: emptyTasks(),
      })),
    speechCpuMsPerSecond: z.number().nonnegative().default(0),
    modelWork10sMs: z.number().nonnegative().default(0),
    modelWorkTotalMs: z.number().nonnegative().default(0),
    vadWorkTotalMs: z.number().nonnegative().default(0),
    speechWork10sMs: z.number().nonnegative().default(0),
    speechBackoffMs: z.number().nonnegative().default(0),
    speechWaitedMs: z.number().nonnegative().default(0),
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
  dspHits: 0,
  soundJobsSkipped: 0,
  speechRequests: 0,
  speechResults: 0,
  wordsMatched: 0,
  wordsRejected: 0,
  wordEvents: 0,
  acceptedEvents: 0,
});
export const emptyWorkerDiagnostics = (): WorkerDiagnostics => ({
  vadError: '',
  soundError: '',
  speechError: '',
  inputGaps: 0,
  accuracyLog: [],
  laughDetectors: { dsp: 0, yamnet: 0, both: 0 },
  speechOverruns: 0,
  speechCooldownMs: 0,
  vadCpuMsPerSecond: 0,
  tasks: emptyTasks(),
  workerTasks: {
    realtime: emptyTasks(),
    sound: emptyTasks(),
    speech: emptyTasks(),
  },
  stages: emptyStages(),
  laughConfidence: 0,
  basicMode: false,
  laughScore: 0,
  soundCpuMsPerSecond: 0,
  speechCpuMsPerSecond: 0,
  modelWork10sMs: 0,
  modelWorkTotalMs: 0,
  vadWorkTotalMs: 0,
  speechWork10sMs: 0,
  speechBackoffMs: 0,
  speechWaitedMs: 0,
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
    recoveryAttempts: z.number().nonnegative().default(0),
    recoveryReason: z.string().max(400).default(''),
    micWorklet: z
      .object({
        lastFrameAt: z.number().nonnegative(),
        inputChannels: z.number().nonnegative(),
        selectedChannel: z.number().nonnegative(),
      })
      .default(() => ({
        lastFrameAt: 0,
        inputChannels: 0,
        selectedChannel: 0,
      })),
    permission: z.enum(['prompt', 'granted', 'denied']).default('prompt'),
    micAttempts: z.number().nonnegative().default(0),
    micOpened: z.number().nonnegative().default(0),
    echoCancellation: z.boolean().default(false),
    noiseSuppression: z.boolean().default(false),
    autoGainControl: z.boolean().default(false),
    errors: z.array(z.string().max(400)).max(10).default([]),
    phase: z.string().max(32),
    context: z.string().max(32),
    playbackContext: z.string().max(32).default('closed'),
    speakerConnections: z.number().nonnegative().default(0),
    tabCaptureTracks: z.number().nonnegative().default(0),
    playback: PlaybackStatsSchema.optional(),
    lab: LabSwitchesSchema.optional(),
    bluetooth: z.boolean().default(false),
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
    delivery: z
      .object({
        received: z.number().nonnegative(),
        applied: z.number().nonnegative(),
        error: z.string().max(400),
      })
      .default(() => ({ received: 0, applied: 0, error: '' })),
    deliveryError: z.string().max(400).default(''),
    sessionId: z.string().max(100).nullable().default(null),
    offscreenAlive: z.boolean().default(false),
    micConsent: z.boolean().default(false),
    sessionMatches: z.boolean().default(false),
    savedLaughs: z.number().nonnegative().default(0),
    savedWords: z.number().nonnegative().default(0),
    sessionLaughs: z.number().nonnegative().default(0),
    sessionWords: z.number().nonnegative().default(0),
    laughPanelLatencyMs: z.number().nonnegative().default(0),
    lab: LabSwitchesSchema.optional(),
    offscreenTasks: TaskStatsSchema.optional(),
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
/** Single console boundary for error text. Unknown values (including PCM) are
 * never serialized; safeError strips resource URLs and bounds the message. */
export function logAudioError(stage: string, error: unknown) {
  const message = safeError(error);
  console.error(`StreamLaughs: ${stage}`, message);
  return message;
}
// The clipboard boundary is deliberately an allowlist: never serialize a worker message.
const ClipboardReportSchema = DiagnosticsSchema.extend({
  visibleError: z.string().max(400).default(''),
  visiblePermissionQuery: z
    .enum(['unknown', 'prompt', 'granted', 'denied'])
    .default('unknown'),
  chosenDeviceLabel: z.string().max(256).default('not opened'),
  osBrowser: z.string().max(500),
  lastApprovedPhrase: z
    .string()
    .max(80)
    .refine((s) => s === '' || isApprovedPhrase(s)),
  recentErrors: z.array(z.string().max(400)).max(10),
});
export const copyableReport = (
  value: unknown,
  phrase = '',
  visible: {
    visibleError?: string;
    visiblePermissionQuery?: PermissionState | 'unknown';
    chosenDeviceLabel?: string;
  } = {},
) => {
  const report = DiagnosticsSchema.parse(value);
  const errors = [
    ...(report.audio?.errors ?? []),
    report.audio?.error,
    report.error,
    report.inference?.error,
    ...Object.values(report.inference?.models ?? {}).map((m) => m.error),
    visible.visibleError,
  ].filter((s): s is string => !!s);
  return JSON.stringify(
    ClipboardReportSchema.parse({
      ...report,
      ...visible,
      osBrowser:
        typeof navigator === 'undefined'
          ? 'unavailable'
          : navigator.userAgent.slice(0, 500),
      lastApprovedPhrase: phrase,
      recentErrors: errors.slice(-10),
    }),
    null,
    2,
  );
};
