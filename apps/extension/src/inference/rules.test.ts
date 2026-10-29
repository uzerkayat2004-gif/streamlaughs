import { PersonalEventSchema } from '@laughline/shared';
import { describe, expect, it } from 'vitest';
import {
  BoundedQueue,
  crossCorrelation,
  EventGate,
  extractWords,
  isPlayback,
  LowPowerPolicy,
  maskSwear,
  privacyClass,
  VadSegmenter,
} from './rules';

describe('reaction decisions', () => {
  it('needs two consecutive threshold hops, resets on a miss and enforces cooldown', () => {
    const gate = new EventGate();
    expect(
      gate.consider('laugh', 0.5, 0.01, 1000, false).event,
    ).toBeUndefined();
    expect(gate.consider('laugh', 0.49, 0.01, 1500, false).reason).toBe(
      'below threshold',
    );
    expect(gate.consider('laugh', 0.8, 0.1, 2000, false).event).toBeUndefined();
    expect(gate.consider('laugh', 0.8, 0.1, 2500, false).event).toMatchObject({
      kind: 'laugh',
      intensity: 3,
    });
    expect(gate.consider('laugh', 0.8, 0.1, 3000, false).reason).toBe(
      'cooldown',
    );
    expect(gate.consider('laugh', 0.8, 0.1, 3500, false).reason).toBe(
      'cooldown',
    );
    expect(gate.consider('laugh', 0.8, 0.1, 4000, false).event).toBeDefined();
  });
  it.each(['scream', 'gasp', 'hype'] as const)(
    '%s has an independent cooldown and playback rejection',
    (kind) => {
      const gate = new EventGate();
      expect(gate.consider(kind, 1, 0.1, 1000, true).reason).toContain(
        'playback',
      );
      expect(gate.consider(kind, 1, 0.1, 1500, false).event?.kind).toBe(kind);
      expect(gate.consider(kind, 1, 0.1, 1600, false).reason).toBe('cooldown');
    },
  );
});
describe('speaker contamination', () => {
  it('finds a microphone envelope delayed by 140 ms', () => {
    const tab = Array.from(
      { length: 75 },
      (_, i) => 0.1 + Math.sin(i * 1.7) * 0.07 + Math.cos(i * 0.31) * 0.02,
    );
    const mic = Array.from({ length: 75 }, (_, i) =>
      i < 7 ? 0 : tab[i - 7]! * 0.4,
    );
    const result = crossCorrelation(mic, tab);
    expect(result.valid).toBe(true);
    expect(result.correlation).toBeCloseTo(1);
    expect(result.lagMs).toBe(140);
  });
  it('rejects only correlated matching classes with fresh similar tab scores', () => {
    expect(isPlayback(0.9, 0.7, 0.6)).toBe(true);
    expect(isPlayback(0.9, 0.7, 0.2)).toBe(false);
    expect(isPlayback(0.3, 0.7, 0.9)).toBe(false);
    expect(isPlayback(0.9, 0.7, 0.9, 1500)).toBe(false);
    expect(isPlayback(1, 0, 0)).toBe(false);
    expect(crossCorrelation(Array(75).fill(0), Array(75).fill(0)).valid).toBe(
      false,
    );
  });
});
describe('word privacy', () => {
  it('normalizes punctuation, counts 1–3 grams, removes stopwords and recognizes hype', () => {
    const result = extractWords(
      "Bro! no way, no way. Let's go! I am in the stream.",
    );
    expect(result.hype).toBe(true);
    expect(result.phrases).toContainEqual({
      text: 'no way',
      count: 2,
      class: 'ok',
    });
    expect(result.phrases).toContainEqual({
      text: 'lets go',
      count: 1,
      class: 'ok',
    });
    expect(result.phrases.some((p) => p.text === 'the' || p.text === 'i')).toBe(
      false,
    );
  });
  it('removes names and blocked terms before any phrase can span them', () => {
    expect(privacyClass('Alice')).toBe('possible-name');
    expect(privacyClass('Zurich')).toBe('possible-name');
    expect(privacyClass('ALICE')).toBe('possible-name');
    expect(privacyClass('idiot')).toBe('blocked');
    const result = extractWords('bro Alice nice idiot funny Zurich wow');
    expect(JSON.stringify(result)).not.toMatch(
      /alice|idiot|zurich|bro nice|nice funny/i,
    );
    for (const phrase of result.phrases)
      expect(
        PersonalEventSchema.safeParse({
          kind: 'words',
          ts: 1,
          phrases: [phrase],
        }).success,
      ).toBe(true);
  });
  it('keeps only masked swear labels and refuses raw text/audio payloads', () => {
    expect(maskSwear('fuck')).toBe('f***');
    expect(extractWords('fuck fuck shit').phrases).toEqual([
      { text: 'f***', count: 2, class: 'swear' },
      { text: 's***', count: 1, class: 'swear' },
    ]);
    for (const phrase of [
      { text: 'fuck', count: 1, class: 'swear' },
      { text: 'alice', count: 1, class: 'ok' },
      { text: 'idiot', count: 1, class: 'ok' },
      { text: 'secret', count: 1, class: 'possible-name' },
    ])
      expect(
        PersonalEventSchema.safeParse({
          kind: 'words',
          ts: 1,
          phrases: [phrase],
        }).success,
      ).toBe(false);
    expect(
      PersonalEventSchema.safeParse({
        kind: 'laugh',
        ts: 1,
        confidence: 0.8,
        intensity: 1,
        frame: new Float32Array(320),
        transcript: 'secret',
      }).success,
    ).toBe(false);
  });
});
describe('bounded scheduling and overload', () => {
  it('keeps words available after isolated frame loss but reacts to sustained backpressure', () => {
    const policy = new LowPowerPolicy();
    expect(policy.update(0.2, 1, 0)).toBe(false);
    expect(policy.update(0.2, 1, 2000)).toBe(false);
    expect(policy.update(0.2, 2, 3000)).toBe(false);
    expect(policy.update(0.2, 3, 3250)).toBe(false);
    expect(policy.update(0.2, 4, 4250)).toBe(true);
  });
  it('drops and wipes oldest pending speech, never exceeds two items', () => {
    const discarded: number[] = [],
      queue = new BoundedQueue<number>(2, (item) => discarded.push(item));
    for (let i = 0; i < 100; i++) queue.push(i);
    expect(queue.length).toBe(2);
    expect(queue.drops).toBe(98);
    expect(queue.shift()).toBe(98);
    queue.clear();
    expect(discarded.at(-1)).toBe(99);
  });
  it('pauses words on RTF or drops and recovers only after a healthy interval', () => {
    const policy = new LowPowerPolicy();
    expect(policy.update(1.1, 0, 0)).toBe(true);
    expect(policy.update(0.3, 0, 1000)).toBe(true);
    expect(policy.update(0.3, 0, 21000)).toBe(false);
    expect(policy.update(0.3, 1, 22000)).toBe(false);
  });
});
describe('Silero segment boundaries', () => {
  it('merges short gaps, drops short speech, closes long gaps and splits at eight seconds', () => {
    const segmenter = new VadSegmenter();
    expect(segmenter.update(0.9, 0, 200)).toEqual([]);
    expect(segmenter.update(0, 200, 500)).toEqual([]);
    segmenter.update(0.9, 1000, 1400);
    segmenter.update(0, 1400, 1600);
    segmenter.update(0.9, 1600, 1900);
    expect(segmenter.update(0, 1900, 2200)).toEqual([
      { start: 1000, end: 1900 },
    ]);
    segmenter.update(0.9, 3000, 4000);
    expect(segmenter.update(0.9, 4000, 11100)).toEqual([
      { start: 3000, end: 11000 },
    ]);
    segmenter.reset();
    expect(segmenter.update(0, 11100, 12000)).toEqual([]);
  });
});
