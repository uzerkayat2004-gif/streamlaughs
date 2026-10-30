import { z } from 'zod';
import { CaptureStateSchema, initialCaptureState } from './capture';
import {
  emptyInferenceHealth,
  InferenceHealthSchema,
  type PersonalEvent,
  SafePhraseSchema,
} from './inference';

export * from './capture';
export * from './crowd';
export * from './inference';
export * from './owner-token';
export * from './privacy';
export * from './product';

export const WordSchema = z.object({
  word: z.string().max(80),
  count: z.number().int().nonnegative(),
});
export const CrowdStateSchema = z.object({
  channel: z.string(),
  laughingNow: z.number().int().nonnegative(),
  laughlineViewers: z.number().int().nonnegative(),
  topWords: z.array(WordSchema).max(3),
  updatedAt: z.number(),
  source: z.enum(['live', 'fake', 'offline']).optional(),
  state: z.enum(['live', 'few', 'offline']).optional(),
  laughPercent: z.number().min(0).max(100).optional(),
  testTraffic: z.boolean().optional(),
});
export type CrowdState = z.infer<typeof CrowdStateSchema>;
export const CrowdSummarySchema = z.object({
  source: z.enum(['live', 'fake']),
  peakSharing: z.number().int().nonnegative(),
  peakLaughingNow: z.number().int().nonnegative(),
  peakLaughPercent: z.number().min(0).max(100),
  samples: z.number().int().nonnegative(),
  testTraffic: z.boolean(),
});
export const MySessionSchema = z.object({
  id: z.string(),
  channel: z.string(),
  channelUrl: z.string().max(200).optional(),
  displayName: z.string().max(100).optional(),
  tabId: z.number().int(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  laughCount: z.number().int().nonnegative(),
  laughEvents: z.array(z.object({ at: z.number(), crowd: z.number() })),
  peakCrowd: z.number().int().nonnegative(),
  crowdViewers: z.number().int().nonnegative(),
  topWords: z.array(WordSchema),
  crowdTopWords: z.array(WordSchema).max(256).default([]),
  crowdSummary: CrowdSummarySchema.nullable().default(null),
  personal: z
    .object({
      swears: z.number().int().nonnegative(),
      hype: z.number().int().nonnegative(),
      screams: z.number().int().nonnegative(),
      gasps: z.number().int().nonnegative(),
      maskedSwears: z.array(SafePhraseSchema).max(64),
      intensitySum: z.number().nonnegative(),
      lagSum: z.number().nonnegative(),
      lagCount: z.number().int().nonnegative(),
      hardest: z
        .object({
          ts: z.number(),
          intensity: z.number(),
          confidence: z.number(),
          crowd: z.number(),
        })
        .nullable(),
    })
    .default(() => ({
      swears: 0,
      hype: 0,
      screams: 0,
      gasps: 0,
      maskedSwears: [],
      intensitySum: 0,
      lagSum: 0,
      lagCount: 0,
      hardest: null,
    })),
  source: z.enum(['fake', 'local']),
});
export type MySession = z.infer<typeof MySessionSchema>;
export const RecapSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  channel: z.string(),
  channelUrl: z.string().max(200).optional(),
  displayName: z.string().max(100).optional(),
  startedAt: z.number().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  createdAt: z.number(),
  totalLaughs: z.number().int().nonnegative(),
  crowdViewers: z.number().int().nonnegative(),
  topWord: z.string(),
  wordCount: z.number().int().nonnegative(),
  hardestLaughAt: z.number().nonnegative(),
  hasBestMoment: z.boolean().optional(),
  othersAtPeak: z.number().int().nonnegative(),
  style: z.string(),
  delaySeconds: z.number(),
  swears: z.number().int().nonnegative().default(0),
  hype: z.number().int().nonnegative().default(0),
  screams: z.number().int().nonnegative().default(0),
  gasps: z.number().int().nonnegative().default(0),
  maskedSwears: z.array(SafePhraseSchema).default([]),
  crowdSummary: CrowdSummarySchema.nullable().default(null),
  source: z.enum(['fake', 'local']),
});
export type Recap = z.infer<typeof RecapSchema>;
export const SettingsSchema = z.object({
  listen: z.boolean(),
  share: z.boolean(),
});
export const SnapshotSchema = z.object({
  revision: z.number().int(),
  status: z.enum(['idle', 'recording', 'paused']),
  session: MySessionSchema.nullable(),
  crowd: CrowdStateSchema.nullable(),
  settings: SettingsSchema,
  lastRecapId: z.string().nullable(),
  capture: CaptureStateSchema.default(initialCaptureState),
  inference: InferenceHealthSchema.default(emptyInferenceHealth),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GET_STATE') }),
  z.object({ type: z.literal('START'), tabId: z.number().int().optional() }),
  z.object({ type: z.literal('STOP') }),
  z.object({ type: z.literal('PAUSE') }),
  z.object({ type: z.literal('RETRY_MIC') }),
  z.object({
    type: z.literal('DEBUG_MIC_START'),
    tabId: z.number().int().optional(),
  }),
  z.object({ type: z.literal('SETTINGS'), settings: SettingsSchema.partial() }),
  z.object({ type: z.literal('DELETE_DATA') }),
  z.object({
    type: z.literal('OPEN_RECAP'),
    id: z.string().optional(),
    view: z.literal('streamers').optional(),
  }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type Reply =
  | { ok: true; state: Snapshot }
  | { ok: false; error: string };
export const STATE_KEY = 'laughline:state';
export const initialSnapshot = (): Snapshot => ({
  revision: 0,
  status: 'idle',
  session: null,
  crowd: null,
  settings: { listen: true, share: false },
  lastRecapId: null,
  capture: initialCaptureState(),
  inference: emptyInferenceHealth(),
});

const RESERVED = new Set([
  'directory',
  'settings',
  'downloads',
  'subscriptions',
  'inventory',
  'wallet',
  'search',
  'videos',
  'p',
  'jobs',
  'turbo',
  'login',
  'signup',
  'activate',
  'drops',
  'friends',
  'messages',
  'moderator',
  'dashboard',
  'popout',
  'embed',
  'collections',
  'products',
  'payments',
  'checkout',
  'store',
  'broadcast',
  'squad',
  'team',
  'teams',
  'prime',
  'bits',
  'passport',
  'legal',
]);
export function parseChannel(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname !== 'www.twitch.tv')
      return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const channel = parts[0]?.toLowerCase();
    if (
      parts.length !== 1 ||
      !channel ||
      RESERVED.has(channel) ||
      !/^[a-z0-9_]{1,25}$/.test(channel)
    )
      return null;
    return channel;
  } catch {
    return null;
  }
}

// Apply the floor to both the room and each word's contributor count.
export function visibleWords(crowd: CrowdState | null): CrowdState['topWords'] {
  if (
    !crowd ||
    crowd.laughlineViewers < 3 ||
    (crowd.source !== 'live' && crowd.laughingNow < 3)
  )
    return [{ word: '—', count: 0 }];
  const words = crowd.topWords.filter(({ count }) => count >= 3).slice(0, 3);
  return words.length ? words : [{ word: '—', count: 0 }];
}

export function createRecap(session: MySession, now: number): Recap {
  const peak = session.personal.hardest;
  const word = [...session.topWords].sort((a, b) => b.count - a.count)[0];
  return {
    id: session.id,
    sessionId: session.id,
    channel: session.channel,
    channelUrl: session.channelUrl,
    displayName: session.displayName,
    startedAt: session.startedAt,
    durationSeconds: Math.max(
      0,
      Math.floor(((session.endedAt ?? now) - session.startedAt) / 1000),
    ),
    createdAt: now,
    totalLaughs: session.laughCount,
    crowdViewers: session.crowdViewers,
    topWord: word?.word ?? '—',
    wordCount: word?.count ?? 0,
    hardestLaughAt: peak
      ? Math.max(0, Math.floor((peak.ts - session.startedAt) / 1000))
      : 0,
    hasBestMoment: !!peak && session.laughCount > 0,
    othersAtPeak: peak?.crowd ?? 0,
    style: laughStyle(session),
    delaySeconds: session.personal.lagCount
      ? Math.round(session.personal.lagSum / session.personal.lagCount / 100) /
        10
      : 0,
    swears: session.personal.swears,
    maskedSwears: session.personal.maskedSwears,
    hype: session.personal.hype,
    screams: session.personal.screams,
    gasps: session.personal.gasps,
    source: session.source,
    crowdSummary: session.crowdSummary,
  };
}
export function laughStyle(session: MySession) {
  const p = session.personal;
  if (p.hype + p.screams >= 3 && p.hype + p.screams > session.laughCount / 2)
    return 'the hype screamer';
  if (!session.laughCount) return 'the quiet observer';
  if (p.lagCount >= 2 && p.lagSum / p.lagCount > 1500)
    return 'the delayed cackler';
  if (p.intensitySum / session.laughCount < 1.5) return 'the quiet giggler';
  return 'the full body laugher';
}
export function applyPersonalEvent(
  session: MySession,
  event: PersonalEvent,
  crowd: number,
  tabLaughTs = 0,
): MySession {
  const p = {
    ...session.personal,
    maskedSwears: [...session.personal.maskedSwears],
  };
  const next = { ...session, personal: p };
  if (event.kind === 'words') {
    const words = new Map(session.topWords.map((w) => [w.word, { ...w }]));
    const swears = new Map(p.maskedSwears.map((w) => [w.text, { ...w }]));
    for (const phrase of event.phrases) {
      if (phrase.class === 'swear') {
        p.swears += phrase.count;
        const old = swears.get(phrase.text);
        if (old) old.count += phrase.count;
        else if (swears.size < 64) swears.set(phrase.text, { ...phrase });
      } else {
        const old = words.get(phrase.text);
        if (old) old.count += phrase.count;
        else if (words.size < 256)
          words.set(phrase.text, { word: phrase.text, count: phrase.count });
      }
    }
    next.topWords = [...words.values()];
    p.maskedSwears = [...swears.values()];
  } else if (event.kind === 'laugh') {
    next.laughCount++;
    next.laughEvents = [
      ...session.laughEvents.slice(-4095),
      { at: event.ts, crowd },
    ];
    p.intensitySum += event.intensity;
    const lag = event.ts - tabLaughTs;
    if (tabLaughTs && lag >= 0 && lag <= 6000) {
      p.lagSum += lag;
      p.lagCount++;
    }
    if (
      !p.hardest ||
      event.intensity > p.hardest.intensity ||
      (event.intensity === p.hardest.intensity &&
        event.confidence > p.hardest.confidence)
    )
      p.hardest = {
        ts: event.ts,
        intensity: event.intensity,
        confidence: event.confidence,
        crowd,
      };
  } else if (event.kind === 'hype') p.hype++;
  else if (event.kind === 'scream') p.screams++;
  else p.gasps++;
  return next;
}
