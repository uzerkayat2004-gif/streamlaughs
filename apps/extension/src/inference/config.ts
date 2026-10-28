export const INFERENCE_CONFIG = {
  preferredBackend: 'auto' as 'auto' | 'wasm' | 'webgpu',
  sampleRate: 16000,
  frameSize: 320,
  vadWindow: 512,
  vadThreshold: 0.5,
  minimumSpeechMs: 250,
  mergeGapMs: 300,
  maximumSpeechMs: 8000,
  soundWindow: 15600,
  soundHopMs: 500,
  thresholds: { laugh: 0.5, scream: 0.55, gasp: 0.45, hype: 0.55 },
  cooldownMs: { laugh: 1500, scream: 2200, gasp: 2500, hype: 2000 },
  consecutiveHops: { laugh: 2, scream: 1, gasp: 1, hype: 1 },
  correlationThreshold: 0.82,
  similarScoreRatio: 0.8,
  minimumPlaybackScore: 0.1,
  maximumLagMs: 400,
  envelopeWindowMs: 1500,
  loudSpeechRms: 0.09,
  loudSpeechMaximumMs: 2000,
  maxTransportFrames: 8,
  maxVadJobs: 32,
  maxSpeechJobs: 2,
  maxPhrases: 256,
  maxDebugEvents: 40,
  lowPowerRtf: 1,
  recoverRtf: 0.65,
  recoverAfterMs: 20000,
  whisperBudgetRtf: 1,
  hypePhrases: [
    'no way',
    'what',
    'lets go',
    'oh my god',
    'bro',
    'yo',
    'no shot',
    'bruh',
  ],
  stopwords:
    'a an the i you he she it we they me my your our their am is are was were be been being have has had do does did to of for in on at with by from and or but so as that this these those its im ive youre uh um yeah'.split(
      ' ',
    ),
  names: PRIVATE_NAMES,
  swears: SWEARS,
  blocked: BLOCKED_WORDS,
} as const;
export const SOUND_CLASSES = {
  laugh: [
    'Laughter',
    'Giggle',
    'Belly laugh',
    'Chuckle, chortle',
    'Chuckle/chortle',
    'Snicker',
    'Baby laughter',
  ],
  scream: ['Screaming', 'Yell', 'Shout'],
  gasp: ['Gasp'],
  speech: ['Speech', 'Conversation', 'Narration, monologue'],
};
export type ClassScores = {
  laugh: number;
  scream: number;
  gasp: number;
  speech: number;
};
export const zeroScores = (): ClassScores => ({
  laugh: 0,
  scream: 0,
  gasp: 0,
  speech: 0,
});

import { BLOCKED_WORDS, PRIVATE_NAMES, SWEARS } from '@laughline/shared';
