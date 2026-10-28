import { z } from 'zod';
import { isApprovedPhrase } from './privacy';
export const PrivacyClassSchema = z.enum([
  'ok',
  'swear',
  'blocked',
  'possible-name',
]);
export type PrivacyClass = z.infer<typeof PrivacyClassSchema>;
export const SafePhraseSchema = z
  .object({
    text: z.string().min(1).max(80),
    count: z.number().int().min(1).max(1000000),
    class: z.enum(['ok', 'swear']),
  })
  .strict()
  .refine(
    (phrase) =>
      phrase.class === 'swear'
        ? /^[a-z]\*{2,}$/.test(phrase.text)
        : isApprovedPhrase(phrase.text),
    'Only approved phrases and masked swears may cross this boundary',
  );
export const PersonalEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.enum(['laugh', 'scream', 'gasp', 'hype']),
      ts: z.number().finite().nonnegative(),
      confidence: z.number().min(0).max(1),
      intensity: z.number().int().min(1).max(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal('words'),
      ts: z.number().finite().nonnegative(),
      phrases: z.array(SafePhraseSchema).max(64),
    })
    .strict(),
]);
export type PersonalEvent = z.infer<typeof PersonalEventSchema>;
export type ReactionKind = Exclude<PersonalEvent['kind'], 'words'>;
export const InferenceHealthSchema = z
  .object({
    phase: z.enum(['idle', 'warming', 'ready', 'error']),
    lowPower: z.boolean(),
    backend: z.enum(['wasm', 'webgpu', 'mixed']),
    vadProbability: z.number().min(0).max(1),
    drops: z.number().int().nonnegative(),
    frameQueue: z.number().int().nonnegative(),
    speechQueue: z.number().int().min(0).max(2),
    realTimeFactor: z.number().finite().nonnegative(),
    inferenceMs: z.number().finite().nonnegative(),
    tabLaughTs: z.number().finite().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  })
  .strict();
export type InferenceHealth = z.infer<typeof InferenceHealthSchema>;
export const emptyInferenceHealth = (): InferenceHealth => ({
  phase: 'idle',
  lowPower: false,
  backend: 'wasm',
  vadProbability: 0,
  drops: 0,
  frameQueue: 0,
  speechQueue: 0,
  realTimeFactor: 0,
  inferenceMs: 0,
  tabLaughTs: 0,
  accepted: 0,
  rejected: 0,
});
export const PersonalBatchSchema = z
  .object({
    type: z.literal('PERSONAL_EVENTS'),
    ownerId: z.string(),
    sessionId: z.string(),
    events: z.array(PersonalEventSchema).max(32),
    tabLaughTs: z.number().finite().nonnegative(),
  })
  .strict();
export const InferenceReportSchema = z
  .object({
    type: z.literal('INFERENCE_STATUS'),
    ownerId: z.string(),
    sessionId: z.string(),
    health: InferenceHealthSchema,
  })
  .strict();
