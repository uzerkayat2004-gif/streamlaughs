import { z } from 'zod';
import { isApprovedPhrase } from './privacy';

export const CROWD_PHRASES = [
  'lmao',
  'lol',
  'haha',
  'bro',
  'bruh',
  'yo',
  'no way',
  'what',
  'lets go',
  'oh my god',
  'no shot',
  'wow',
  'clip that',
  'hype',
  'nice',
  'amazing',
  'funny',
  'good',
  'great',
  'wait',
  'yes',
  'not good',
  'love',
  'laugh',
  'laughs',
] as const;
const vocabulary = new Set<string>(CROWD_PHRASES);
export const isCrowdPhrase = (text: string) =>
  vocabulary.has(text) && isApprovedPhrase(text);
export const CrowdPhraseSchema = z.string().max(80).refine(isCrowdPhrase);
export const ChannelLoginSchema = z.string().regex(/^[a-z0-9_]{1,25}$/);
export const CROWD_LIMITS = {
  payloadBytes: 512,
  sockets: 200,
  identities: 1024,
  tokenMs: 2 * 60 * 60 * 1000,
  presenceMs: 6000,
  laughMs: 5000,
  phraseMs: 20000,
  rateMs: 1000,
  retentionMs: 30 * 24 * 60 * 60 * 1000,
  fewKeepaliveMs: 25000,
} as const;
const count = z.number().int().min(0).max(3);
export const CrowdContributionSchema = z
  .object({
    laughing: z.union([z.literal(0), z.literal(1)]),
    intensity: count,
    scream: count,
    gasp: count,
    hype: count,
    swears: count,
    phrases: z.array(z.string().max(80)).max(3),
  })
  .strict()
  .refine((data) => data.laughing === 1 || data.intensity === 0)
  .transform((data) => ({
    ...data,
    phrases: [...new Set(data.phrases.filter(isCrowdPhrase))],
  }));
export type CrowdContribution = z.infer<typeof CrowdContributionSchema>;
const bubble = z
  .object({ text: CrowdPhraseSchema, count: z.number().int().min(3).max(1024) })
  .strict();
export const CrowdPacketSchema = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('few') }).strict(),
    z
      .object({
        state: z.literal('live'),
        sharing: z.number().int().min(3).max(200),
        laughingNow: z.number().int().min(0).max(200),
        laughPercent: z.number().int().min(0).max(100),
        topWord: CrowdPhraseSchema.nullable(),
        bubbles: z.array(bubble).max(3),
        hype: z.number().int().min(0).max(3000),
        testTraffic: z.boolean(),
      })
      .strict(),
  ])
  .refine(
    (data) =>
      data.state === 'few' ||
      (data.laughingNow <= data.sharing &&
        data.laughPercent ===
          Math.round((data.laughingNow / data.sharing) * 100) &&
        data.topWord === (data.bubbles[0]?.text ?? null)),
  );
export type CrowdPacket = z.infer<typeof CrowdPacketSchema>;
export const SessionRequestSchema = z
  .object({
    channel: ChannelLoginSchema,
    testTraffic: z.boolean().default(false),
  })
  .strict();
export const SessionResponseSchema = z
  .object({
    token: z.string().min(30).max(1024),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export const AnonymousClaimsSchema = z
  .object({
    v: z.literal(1),
    id: z.string().uuid(),
    channel: ChannelLoginSchema,
    expiresAt: z.number().int().positive(),
    testTraffic: z.boolean(),
  })
  .strict();
export type AnonymousClaims = z.infer<typeof AnonymousClaimsSchema>;
export const CrowdMinuteSchema = z
  .object({
    minute: z.number().int().nonnegative(),
    contributors: z.number().int().min(3).max(1024),
    peakLaughingNow: z.number().int().min(0).max(200),
    averageLaughPercent: z.number().min(0).max(100),
    phrases: z.array(bubble).max(5),
    hype: z.number().int().nonnegative(),
    testTraffic: z.boolean(),
    moments: z
      .array(
        z
          .object({
            ts: z.number().int().nonnegative(),
            kind: z.enum(['peak', 'spike']),
            laughingNow: z.number().int().min(1).max(200),
            phrases: z.array(bubble).max(3).optional(),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();
export type CrowdMinute = z.infer<typeof CrowdMinuteSchema>;
export const TimelineRangeSchema = z
  .object({
    from: z.coerce.number().int().nonnegative(),
    to: z.coerce.number().int().positive(),
  })
  .strict()
  .refine((data) => data.to > data.from && data.to - data.from <= 86400000);
export const TimelineSchema = z
  .object({
    channel: ChannelLoginSchema,
    minutes: z.array(CrowdMinuteSchema).max(1440),
  })
  .strict();
