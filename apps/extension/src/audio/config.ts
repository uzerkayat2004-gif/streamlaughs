// All microphone processing options live here; Welcome and the offscreen owner share them.
export const MICROPHONE_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: false,
} satisfies MediaTrackConstraints;
export const AUDIO_SAMPLE_RATE = 16000;
export const FRAME_SAMPLES = 320;
export const BUFFER_SECONDS = 30;
export const AUDIO_STATUS_MS = 250;
export const AUDIO_DEBUG =
  import.meta.env.DEV || import.meta.env.MODE === 'audio-debug';
