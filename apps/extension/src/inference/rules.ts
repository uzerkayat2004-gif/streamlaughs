import type {
  PersonalEvent,
  PrivacyClass,
  ReactionKind,
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
  'no way what lets go oh my god bro yo shot bruh wow lmao haha laugh laughs laughing funny hello amazing okay yes not good great really holy stream chat nice today love play playing wait'.split(
    ' ',
  ),
);
export const maskSwear = (word: string) =>
  word[0] + '*'.repeat(Math.max(2, word.length - 1));
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
export function extractWords(text: string): {
  phrases: Extract<PersonalEvent, { kind: 'words' }>['phrases'];
  hype: boolean;
} {
  const raw =
    text
      .replace(/[’‘]/g, "'")
      .match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)
      ?.slice(0, 128) ?? [];
  const tokens = raw.map((original) => {
    const word = original.toLowerCase().replace(/'/g, '');
    return { word, class: privacyClass(original, word) };
  });
  const phrases = new Map<
    string,
    { text: string; count: number; class: 'ok' | 'swear' }
  >();
  const add = (text: string, privacy: 'ok' | 'swear') => {
    if (text.length > 80) return;
    const key = `${privacy}:${text}`;
    const previous = phrases.get(key);
    if (previous) previous.count++;
    else if (phrases.size < 64)
      phrases.set(key, { text, count: 1, class: privacy });
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.class === 'swear') {
      add(maskSwear(token.word), 'swear');
      continue;
    }
    if (token.class !== 'ok' || stop.has(token.word)) continue;
    for (let length = 1; length <= 3 && i + length <= tokens.length; length++) {
      const group = tokens.slice(i, i + length);
      if (group.some((item) => item.class !== 'ok' || stop.has(item.word)))
        break;
      add(group.map((item) => item.word).join(' '), 'ok');
    }
  }
  const normalized = tokens
    .map((token) => (token.class === 'ok' ? token.word : ''))
    .join(' ');
  return {
    phrases: [...phrases.values()],
    hype: C.hypePhrases.some((phrase) =>
      ` ${normalized} `.includes(` ${phrase} `),
    ),
  };
}
export function redactDebugTranscript(text: string) {
  return text
    .slice(0, 1000)
    .replace(/[A-Za-z]+(?:['’][A-Za-z]+)?/g, (original) => {
      const normalized = original.toLowerCase().replace(/['’]/g, ''),
        privacy = privacyClass(original, normalized);
      return privacy === 'blocked' || privacy === 'possible-name'
        ? '[private]'
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
        scores[key] = Math.max(scores[key], category.score);
  return scores;
}
