import { expect, it } from 'vitest';
import {
  applyPersonalEvent,
  createRecap,
  MySessionSchema,
  withLaughs,
  sessionWord,
} from './index';
it('undoes the last laugh in session and recap metrics without changing words, and can restore it around a newer event', () => {
  let s = MySessionSchema.parse({
    id: 'undo',
    channel: 'test',
    tabId: 1,
    startedAt: 1000,
    endedAt: null,
    laughCount: 0,
    laughEvents: [],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: [
      { word: 'bro', count: 2 },
      { word: 'no way', count: 1 },
    ],
    source: 'local',
  });
  s = applyPersonalEvent(
    s,
    { kind: 'laugh', ts: 5000, confidence: 0.8, intensity: 1 },
    3,
    4000,
  );
  s = applyPersonalEvent(
    s,
    { kind: 'laugh', ts: 10000, confidence: 0.95, intensity: 3 },
    4,
    9000,
  );
  const removed = s.laughEvents.at(-1)!;
  const undone = withLaughs(s, s.laughEvents.slice(0, -1));
  expect(undone.laughCount).toBe(1);
  expect(undone.personal.intensitySum).toBe(1);
  expect(undone.personal.hardest?.ts).toBe(5000);
  expect(createRecap(undone, 15000).totalLaughs).toBe(1);
  expect(sessionWord(undone)?.word).toBe('bro');
  expect(undone.topWords).toEqual(s.topWords);
  const newer = applyPersonalEvent(
    undone,
    { kind: 'laugh', ts: 14000, confidence: 0.8, intensity: 2 },
    4,
    13000,
  );
  const restored = withLaughs(
    newer,
    [...newer.laughEvents, removed].sort((a, b) => a.at - b.at),
  );
  expect(restored.laughCount).toBe(3);
  expect(restored.personal.intensitySum).toBe(6);
  expect(restored.personal.hardest?.ts).toBe(10000);
});
it('uses the latest word until one reaction has been used at least twice', () => {
  expect(
    sessionWord({
      topWords: [
        { word: 'bro', count: 1 },
        { word: 'no way', count: 1 },
      ],
      wordEvents: [
        { word: 'bro', at: 1 },
        { word: 'no way', at: 2 },
      ],
    }),
  ).toMatchObject({ word: 'no way' });
  expect(
    sessionWord({
      topWords: [
        { word: 'bro', count: 2 },
        { word: 'no way', count: 1 },
      ],
      wordEvents: [{ word: 'no way', at: 3 }],
    }),
  ).toMatchObject({ word: 'bro' });
});
