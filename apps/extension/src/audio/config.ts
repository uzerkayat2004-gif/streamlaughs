// All microphone processing options live here; Welcome and the offscreen owner share them.
export const MICROPHONE_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: false,
} satisfies MediaTrackConstraints;
export const MICROPHONE_NORMALIZATION = {
  targetRms: 0.075,
  maximumGain: 20,
  peakHeadroom: 0.95,
  silenceFloor: 0.00003,
  maximumNoiseFloor: 0.003,
  minimumGainRms: 0.00375,
  highPassFeedback: 0.995,
  gainAttack: 0.4,
  gainRelease: 0.12,
  rmsRelease: 0.98,
} as const;
export const AUDIO_SAMPLE_RATE = 16000;
export const FRAME_SAMPLES = 320;
export const BUFFER_SECONDS = 30;
export const AUDIO_STATUS_MS = 250;
export const AUDIO_DEBUG =
  import.meta.env.DEV || import.meta.env.MODE === 'audio-debug';
