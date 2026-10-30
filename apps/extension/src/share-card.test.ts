import { createRecap, MySessionSchema } from '@laughline/shared';
import { expect, it } from 'vitest';
import { SHARE_SIZE, shareCardData, shareText } from './share-card';

const recap = (laughs: number) =>
  createRecap(
    MySessionSchema.parse({
      id: 's',
      channel: 'grimm',
      displayName: 'Grimm',
      tabId: 1,
      startedAt: 1000,
      endedAt: 61000,
      laughCount: laughs,
      laughEvents: [],
      peakCrowd: 0,
      crowdViewers: 0,
      topWords: [{ word: 'bro', count: 2 }],
      source: 'local',
    }),
    61000,
  );
it('exports story dimensions and only explicitly selected safe summary fields', () => {
  const input = {
    ...recap(23),
    audio: 'private audio',
    transcript: 'private transcript',
  };
  const data = shareCardData(input);
  expect(SHARE_SIZE).toEqual({ width: 1080, height: 1920 });
  expect(data.laughs).toBe(23);
  expect(data.name).toBe('Grimm');
  expect(data.word).toBe('bro');
  expect(JSON.stringify(data)).not.toMatch(/private audio|private transcript/);
  expect(
    shareCardData({ ...recap(1), topWord: 'alice private name' }).word,
  ).toBeNull();
});
it('makes an all-zero session friendly, with no fictitious best moment or transcript', () => {
  const data = shareCardData(recap(0));
  expect(data.heading).toContain('a quiet laugh track');
  expect(data.bestMoment).toBeNull();
  expect(shareText(recap(0))).toContain('Some nights are just for watching.');
  expect(shareText(recap(0))).not.toContain('0 times');
});
