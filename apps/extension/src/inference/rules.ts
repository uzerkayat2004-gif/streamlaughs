import type {
  PersonalEvent,
  PrivacyClass,
  ReactionKind,
} from '@laughline/shared';
import {
  canonicalize,
  normalizeReaction,
  REACTION_WORDS,
} from '@laughline/shared';
import { INFERENCE_CONFIG as C, type ClassScores } from './config';
export class BoundedQueue<T> {
  private items: T[] = [];
  drops = 0;
  constructor(
    readonly capacity: number,
    private discard: (item: T) => void = () => {},
  ) {
    if (capacity < 1) throw new RangeError('Queue capacity must be positive');
  }
  push(item: T) {
    if (this.items.length === this.capacity) {
      this.discard(this.items.shift()!);
      this.drops++;
    }
    this.items.push(item);
  }
  shift() {
    return this.items.shift();
  }
  get length() {
    return this.items.length;
  }
  clear() {
    for (const item of this.items) this.discard(item);
    this.items = [];
  }
}
export function crossCorrelation(
  mic: readonly number[],
  tab: readonly number[],
  maxLag = 20,
) {
  const length = Math.min(mic.length, tab.length);
  let best = 0,
    lag = 0,
    valid = false;
  for (let offset = 0; offset <= Math.min(maxLag, length - 20); offset++) {
    const n = length - offset;
    let sx = 0,
      sy = 0,
      xx = 0,
      yy = 0,
      xy = 0;
    for (let i = 0; i < n; i++) {
      const x = mic[i + offset]!,
        y = tab[i]!;
      sx += x;
      sy += y;
      xx += x * x;
      yy += y * y;
      xy += x * y;
    }
    const vx = n * xx - sx * sx,
      vy = n * yy - sy * sy;
    if (vx <= 1e-8 || vy <= 1e-8) continue;
    valid = true;
    const correlation = (n * xy - sx * sy) / Math.sqrt(vx * vy);
    if (correlation > best) {
      best = correlation;
      lag = offset * 20;
    }
  }
  return { correlation: Math.min(1, best), lagMs: lag, valid };
}
export function isPlayback(
  correlation: number,
  micScore: number,
  tabScore: number,
  scoreAgeMs = 0,
) {
  return (
    correlation >= C.correlationThreshold &&
    tabScore >=
      Math.max(C.minimumPlaybackScore, micScore * C.similarScoreRatio) &&
    scoreAgeMs <= 1000
  );
}
// Envelope timing alone cannot prove echo: independent viewers can react together.
export function waveformMatch(mic: Float32Array, tab: Float32Array) {
  const stride = 4,
    window = 2048;
  if (mic.length < window || tab.length < window)
    return { valid: false, correlation: 0, lagMs: 0 };
  const downsample = (samples: Float32Array) => {
    const result = new Float32Array(Math.floor(samples.length / stride));
    for (let i = 0; i < result.length; i++)
      for (let j = 0; j < stride; j++)
        result[i] = result[i]! + samples[i * stride + j]! / stride;
    return result;
  };
  const a = downsample(mic.subarray(mic.length - window)),
    b = downsample(tab);
  let sx = 0,
    xx = 0;
  for (const value of a) {
    sx += value;
    xx += value * value;
  }
  const vx = a.length * xx - sx * sx;
  if (vx < 1e-10) return { valid: false, correlation: 0, lagMs: 0 };
  let best = 0,
    lagMs = 0;
  const maxLag = Math.min(
    b.length - a.length,
    Math.floor((C.maximumLagMs * 16) / stride),
  );
  for (let lag = 0; lag <= maxLag; lag++) {
    const start = b.length - a.length - lag;
    let sy = 0,
      yy = 0,
      xy = 0;
    for (let i = 0; i < a.length; i++) {
      const value = b[start + i]!;
      sy += value;
      yy += value * value;
      xy += a[i]! * value;
    }
    const vy = a.length * yy - sy * sy;
    if (vy <= 1e-10) continue;
    const score = Math.abs((a.length * xy - sx * sy) / Math.sqrt(vx * vy));
    if (score > best) {
      best = score;
      lagMs = (lag * stride) / 16;
    }
  }
  a.fill(0);
  b.fill(0);
  return { valid: true, correlation: Math.min(1, best), lagMs };
}
export class EventGate {
  private consecutive = { laugh: 0, scream: 0, gasp: 0, hype: 0 };
  private last = {
    laugh: -Infinity,
    scream: -Infinity,
    gasp: -Infinity,
    hype: -Infinity,
  };
  private hop = {
    laugh: -Infinity,
    scream: -Infinity,
    gasp: -Infinity,
    hype: -Infinity,
  };
  consider(
    kind: ReactionKind,
    score: number,
    rms: number,
    ts: number,
    contaminated: boolean,
  ): { event?: PersonalEvent; reason: string } {
    if (ts - this.hop[kind] > C.maximumEvidenceGapMs)
      this.consecutive[kind] = 0;
    this.hop[kind] = ts;
    if (score < C.thresholds[kind]) {
      this.consecutive[kind] = 0;
      return { reason: 'below threshold' };
    }
    this.consecutive[kind]++;
    if (this.consecutive[kind] < C.consecutiveHops[kind])
      return { reason: 'waiting for consecutive hops' };
    if (contaminated) {
      this.consecutive[kind] = 0;
      return { reason: 'playback correlation and matching tab class' };
    }
    if (ts - this.last[kind] < C.cooldownMs[kind])
      return { reason: 'cooldown' };
    this.last[kind] = ts;
    return {
      reason: 'accepted',
      event: {
        kind,
        ts,
        confidence: score,
        intensity:
          score >= 0.8 && rms >= 0.08
            ? 3
            : score >= 0.65 || rms >= 0.04
              ? 2
              : 1,
      },
    };
  }
}
export class LowPowerPolicy {
  active = false;
  private lastDrops = 0;
  private healthySince: number | null = null;
  private droppingSince: number | null = null;
  private lastDropAt: number | null = null;
  update(rtf: number, drops: number, now: number) {
    const added = Math.max(0, drops - this.lastDrops);
    if (this.lastDropAt !== null && now - this.lastDropAt > C.sustainedDropMs)
      this.droppingSince = null;
    if (added) {
      this.droppingSince ??= now;
      this.lastDropAt = now;
    }
    // A scheduler hiccup is not sustained model overload. Keep words available
    // unless compute is too slow, loss persists, or a whole VAD queue is lost.
    const overloaded =
      rtf > C.lowPowerRtf ||
      added >= C.maxVadJobs ||
      (added > 0 &&
        this.droppingSince !== null &&
        now - this.droppingSince >= C.sustainedDropMs);
    this.lastDrops = drops;
    if (overloaded) {
      this.active = true;
      this.healthySince = null;
    } else if (this.active && rtf < C.recoverRtf) {
      this.healthySince ??= now;
      if (now - this.healthySince >= C.recoverAfterMs) this.active = false;
    } else this.healthySince = null;
    return this.active;
  }
}
const stop = new Set<string>(C.stopwords),
  names = new Set<string>(C.names),
  swears = new Set<string>(C.swears),
  blocked = new Set<string>(C.blocked);
const common = new Set(
  'no way what lets go oh my god bro yo shot bruh wow lmao haha laugh laughs laughing funny hello amazing okay yes not good great really holy stream chat nice today love play playing wait'
    .split(' ')
    .concat(REACTION_WORDS.flatMap((s) => s.split(' '))),
);
const standaloneReactions = new Set([
  'w',
  'what',
  'good',
  'great',
  'nice',
  'funny',
  'amazing',
  'love',
  'laugh',
  'laughs',
  'yes',
  'wait',
]);
export const maskSwear = (word: string) =>
  word[0] + '*'.repeat(Math.max(2, word.length - 1));
export function hallucinationReason(text: string) {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // English-only model: non-ASCII letters mean garbled decoder output.
  if (/[^ -~\s♪♫♬’‘“”…–—]/.test(text)) return 'garbled transcript';
  if (
    /[♪♫♬]/.test(text) ||
    /\b(thank you|thanks for watching|thank you for watching|subtitles|subscribe to)\b/.test(
      clean,
    ) ||
    ['you', 'bye', 'music', 'silence'].includes(clean)
  )
    return 'known ASR hallucination';
  const tokens = clean.split(' ');
  if (tokens.length >= 8 && new Set(tokens).size === 1)
    return 'repeated ASR loop';
  return '';
}
export function privacyClass(
  original: string,
  normalized = original.toLowerCase(),
): PrivacyClass {
  if (blocked.has(normalized)) return 'blocked';
  if (swears.has(normalized)) return 'swear';
  if (
    names.has(normalized) ||
    (/^[A-Z]/.test(original) && !common.has(normalized))
  )
    return 'possible-name';
  return 'ok';
}
export function extractWords(
  text: string,
  opts: { short?: boolean } = {},
): {
  phrases: Extract<PersonalEvent, { kind: 'words' }>['phrases'];
  hype: boolean;
  matched: number;
  rejected: number;
} {
  const empty = { phrases: [], hype: false, matched: 0, rejected: 1 };
  if (hallucinationReason(text)) return empty;
  const tokens = text
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 128);
  // A swear, name or blocked word is dropped on its own; the reactions around
  // it ("what the hell bro" -> bro) still count. Private words never leave here.
  const blockedAt = new Set(
    tokens.flatMap((w, i) => (privacyClass(w) !== 'ok' ? [i] : [])),
  );
  if (blockedAt.size === tokens.length) return empty;
  const words = new Map<string, number>();
  const whole = blockedAt.size ? null : canonicalize(text);
  // A short clip is one reaction. Moonshine tends to keep writing after it
  // ("bro, sorry it's not by the"), so read the reaction from its first words.
  const head = opts.short && !whole ? shortHead(tokens, blockedAt) : null;
  if (whole) words.set(whole, 1);
  else if (head) words.set(head.text, head.count);
  else
    for (let i = 0; i < tokens.length; i++) {
      for (const n of [3, 2, 1]) {
        if (i + n > tokens.length) continue;
        if (tokens.slice(i, i + n).some((_, k) => blockedAt.has(i + k)))
          continue;
        const candidate = tokens.slice(i, i + n).join(' '),
          canonical = canonicalize(candidate);
        // Fuzzy spelling repair belongs to a complete short utterance. Inside
        // sentences accept exact reactions/aliases, never arbitrary near-matches.
        // Everyday words (what, love, great, w) count only as a short
        // standalone reaction, never as filler inside a longer sentence.
        if (
          canonical &&
          standaloneReactions.has(canonical) &&
          tokens.length > 3
        )
          continue;
        if (
          canonical &&
          (normalizeReaction(candidate) === candidate ||
            (REACTION_WORDS as readonly string[]).includes(candidate) ||
            ['letsgo', 'noway', 'oh my god'].includes(candidate))
        ) {
          words.set(canonical, (words.get(canonical) ?? 0) + 1);
          i += n - 1;
          break;
        }
      }
    }
  const phrases = [...words].map(([text, count]) => ({
    text,
    count,
    class: 'ok' as const,
  }));
  return {
    phrases,
    hype: phrases.some((p) =>
      (C.hypePhrases as readonly string[]).includes(p.text),
    ),
    matched: phrases.reduce((n, p) => n + p.count, 0),
    rejected: phrases.length ? 0 : 1,
  };
}
function shortHead(tokens: string[], blockedAt: Set<number>) {
  const first: string[] = [];
  for (let i = 0; i < Math.min(3, tokens.length) && !blockedAt.has(i); i++)
    first.push(tokens[i]!);
  for (const n of [3, 2, 1]) {
    if (n > first.length) continue;
    const canonical = canonicalize(first.slice(0, n).join(' '));
    if (!canonical) continue;
    if (standaloneReactions.has(canonical) && tokens.length > 3) continue;
    // "bro bro bro" at the start counts each one.
    let count = 1;
    if (n === 1)
      while (count < first.length && canonicalize(first[count]!) === canonical)
        count++;
    return { text: canonical, count };
  }
  return null;
}
export function redactDebugTranscript(text: string) {
  return text
    .slice(0, 1000)
    .replace(/[A-Za-z]+(?:['’][A-Za-z]+)?/g, (original) => {
      const normalized = original.toLowerCase().replace(/['’]/g, ''),
        privacy = privacyClass(original, normalized);
      return privacy === 'blocked' || privacy === 'possible-name'
        ? `[${original[0]}·${original.length}]`
        : privacy === 'swear'
          ? maskSwear(normalized)
          : original;
    });
}
export class VadSegmenter {
  private start: number | null = null;
  private lastSpeech = 0;
  update(probability: number, startMs: number, endMs: number) {
    const segments: { start: number; end: number }[] = [];
    if (probability >= C.vadThreshold) {
      this.start ??= startMs;
      this.lastSpeech = endMs;
    }
    if (this.start !== null) {
      const maxed = endMs - this.start >= C.maximumSpeechMs;
      if (maxed || endMs - this.lastSpeech >= C.mergeGapMs) {
        const end = maxed ? this.start + C.maximumSpeechMs : this.lastSpeech;
        if (end - this.start >= C.minimumSpeechMs)
          segments.push({ start: this.start, end });
        this.start = maxed && probability >= C.vadThreshold ? end : null;
      }
    }
    return segments;
  }
  flush() {
    const segment =
      this.start !== null && this.lastSpeech - this.start >= C.minimumSpeechMs
        ? { start: this.start, end: this.lastSpeech }
        : null;
    this.reset();
    return segment;
  }
  reset() {
    this.start = null;
    this.lastSpeech = 0;
  }
}
export function mapSoundScores(
  categories: readonly { categoryName?: string; score: number }[],
  classes: Record<keyof ClassScores, string[]>,
): ClassScores {
  const scores: ClassScores = { laugh: 0, scream: 0, gasp: 0, speech: 0 };
  for (const category of categories)
    for (const key of Object.keys(scores) as (keyof ClassScores)[])
      if (classes[key].includes(category.categoryName ?? ''))
        scores[key] =
          key === 'laugh'
            ? Math.min(1, scores[key] + category.score)
            : Math.max(scores[key], category.score);
  return scores;
}
