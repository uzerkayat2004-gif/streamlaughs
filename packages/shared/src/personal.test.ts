import { expect, it } from 'vitest';
import {
  applyPersonalEvent,
  createRecap,
  laughStyle,
  MySessionSchema,
} from './index';

const session = () =>
  MySessionSchema.parse({
    id: 'a',
    channel: 'test',
    tabId: 1,
    startedAt: 1000,
    endedAt: null,
    laughCount: 0,
    laughEvents: [],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: [],
    source: 'local',
  });
it('computes real styles and chooses strongest laugh rather than biggest fake crowd', () => {
  let s = session();
  expect(laughStyle(s)).toBe('the quiet observer');
  s = applyPersonalEvent(
    s,
    { kind: 'laugh', ts: 5000, confidence: 0.6, intensity: 1 },
    900,
    3000,
  );
  expect(laughStyle(s)).toBe('the quiet giggler');
  s = applyPersonalEvent(
    s,
    { kind: 'laugh', ts: 9000, confidence: 0.9, intensity: 3 },
    3,
    6500,
  );
  expect(laughStyle(s)).toBe('the delayed cackler');
  const recap = createRecap(s, 12000);
  expect(recap.hardestLaughAt).toBe(8);
  expect(recap.othersAtPeak).toBe(3);
  expect(recap.delaySeconds).toBe(2.3);
  for (let i = 0; i < 3; i++)
    s = applyPersonalEvent(
      s,
      { kind: 'hype', ts: 10000 + i, confidence: 0.9, intensity: 2 },
      0,
    );
  expect(laughStyle(s)).toBe('the hype screamer');
});
it('bounds event history over a two-hour equivalent while preserving aggregates', () => {
  let s = session();
  for (let i = 0; i < 4800; i++)
    s = applyPersonalEvent(
      s,
      { kind: 'laugh', ts: 1000 + i * 1500, confidence: 0.8, intensity: 2 },
      0,
    );
  expect(s.laughCount).toBe(4800);
  expect(s.laughEvents).toHaveLength(4096);
  expect(s.personal.intensitySum).toBe(9600);
  const event = {
    kind: 'words' as const,
    ts: 1,
    phrases: [
      { text: 'f***', count: 2, class: 'swear' as const },
      { text: 'no way', count: 3, class: 'ok' as const },
    ],
  };
  s = applyPersonalEvent(s, event, 0);
  expect(s.personal.swears).toBe(2);
  expect(s.topWords).toEqual([{ word: 'no way', count: 3 }]);
  expect(JSON.stringify(s)).not.toContain('transcript');
});
