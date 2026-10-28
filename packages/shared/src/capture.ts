import { z } from 'zod';

const nonnegative = z.number().finite().nonnegative();
export const AudioMetricsSchema = z
  .object({
    micLevel: nonnegative,
    tabLevel: nonnegative,
    micPeak: nonnegative,
    tabPeak: nonnegative,
    micFps: nonnegative,
    tabFps: nonnegative,
    droppedFrames: nonnegative.int(),
    cpuMsPerFrame: nonnegative,
    cpuMsPerSecond: nonnegative,
    micFrames: nonnegative.int(),
    tabFrames: nonnegative.int(),
    micSamples: nonnegative.int().max(480000),
    tabSamples: nonnegative.int().max(480000),
  })
  .strict();
export type AudioMetrics = z.infer<typeof AudioMetricsSchema>;
export const emptyAudioMetrics = (): AudioMetrics => ({
  micLevel: 0,
  tabLevel: 0,
  micPeak: 0,
  tabPeak: 0,
  micFps: 0,
  tabFps: 0,
  droppedFrames: 0,
  cpuMsPerFrame: 0,
  cpuMsPerSecond: 0,
  micFrames: 0,
  tabFrames: 0,
  micSamples: 0,
  tabSamples: 0,
});
export const CapturePhaseSchema = z.enum([
  'idle',
  'starting',
  'active',
  'paused',
  'micLost',
  'crowdOnly',
  'permissionRequired',
  'error',
]);
export const CaptureErrorSchema = z.enum([
  'none',
  'permission',
  'device',
  'capture',
  'audioContext',
  'restartRequired',
]);
export const CaptureStateSchema = z
  .object({
    phase: CapturePhaseSchema,
    sessionId: z.string().nullable(),
    micLost: z.boolean(),
    error: CaptureErrorSchema,
    metrics: AudioMetricsSchema,
  })
  .strict();
export type CaptureState = z.infer<typeof CaptureStateSchema>;
export const initialCaptureState = (): CaptureState => ({
  phase: 'idle',
  sessionId: null,
  micLost: false,
  error: 'none',
  metrics: emptyAudioMetrics(),
});
// No audio payload may enter runtime messaging, chrome.storage, or Dexie.
export const AudioReportSchema = z
  .object({
    type: z.literal('AUDIO_REPORT'),
    ownerId: z.string(),
    sessionId: z.string(),
    phase: z.enum(['starting', 'active', 'paused', 'micLost', 'idle']),
    micLost: z.boolean(),
    hasMic: z.boolean(),
    hasTab: z.boolean(),
    metrics: AudioMetricsSchema,
  })
  .strict();
export type AudioReport = z.infer<typeof AudioReportSchema>;
