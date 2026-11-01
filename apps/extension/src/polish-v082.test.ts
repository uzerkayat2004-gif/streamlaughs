import {
  applyPersonalEvent,
  createRecap,
  funniestWord,
  MySessionSchema,
} from '@laughline/shared';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  boxPoint,
  clampAnchor,
  DOT_SIZE,
  normalizeAnchor,
  restoreAnchor,
} from './geometry';
import { groupHistory } from './history';
import { storyData } from './recap-story';
import { stopWithPreview } from './stop-preview';
import { StopSaved } from './StopSaved';
const session = MySessionSchema.parse({
  id: 'short',
  channel: 'vernofps',
  tabId: 1,
  startedAt: 100000,
  endedAt: 220000,
  laughCount: 16,
  laughEvents: [],
  peakCrowd: 0,
  crowdViewers: 0,
  topWords: [],
  source: 'local',
});
it('never extrapolates a short stream into an hourly rate; first stream has no chart', () => {
  const recap = createRecap(session, session.endedAt!);
  const data = storyData(recap, session, groupHistory([session], [recap])[0]);
  expect(data.perHour).toBeUndefined();
  expect(data.durationLine).toBe('in just 2 minutes');
  expect(data.showHistoryChart).toBe(false);
  expect(storyData({ ...recap, durationSeconds: 900 }, session).perHour).toBe(
    64,
  );
});
it('finds most used and funniest approved labels independently, within inclusive ±5 seconds, counting each label occurrence once', () => {
  let s = {
    ...session,
    laughEvents: [
      { at: 110000, crowd: 0 },
      { at: 111000, crowd: 0 },
    ],
  };
  for (const [ts, text, count] of [
    [105000, 'bro', 2],
    [115000, 'no way', 3],
    [160000, 'wow', 8],
    [116001, 'wow', 9],
  ] as const) {
    s = applyPersonalEvent(
      s,
      { kind: 'words', ts, phrases: [{ text, count, class: 'ok' }] },
      0,
    );
  }
  expect(createRecap(s, 220000).topWord).toBe('wow');
  expect(funniestWord(s)).toBe('no way');
  expect(createRecap(s, 220000).funniestWord).toBe('no way');
  expect(funniestWord({ ...s, wordEvents: [] })).toBeUndefined();
  expect(JSON.stringify(s.wordEvents)).not.toMatch(/transcript|audio|Float32/);
});
it('restores the single anchor at all sizes and clamps all panel corners inside the player', () => {
  const big = { width: 1000, height: 700 },
    small = { width: 500, height: 360 };
  const saved = normalizeAnchor({ x: 800, y: 550 }, big);
  expect(restoreAnchor(saved, big)).toEqual({ x: 800, y: 550 });
  const dot = restoreAnchor(saved, small);
  expect(dot.x).toBeGreaterThan(8);
  expect(dot.y).toBeLessThan(346);
  for (const p of [
    { x: -900, y: -900 },
    { x: 2000, y: 2000 },
    { x: 490, y: 10 },
    { x: 10, y: 340 },
  ]) {
    const a = clampAnchor(p, small),
      panel = boxPoint(a, small, { width: 270, height: 150 });
    expect(panel.x).toBeGreaterThanOrEqual(8);
    expect(panel.x + 270).toBeLessThanOrEqual(492);
    expect(panel.y).toBeGreaterThanOrEqual(8);
    expect(panel.y + 150).toBeLessThanOrEqual(352);
  }
});
it('never colors or populates the toolbar action badge; navigation bypasses stop finalization', () => {
  const source = readFileSync(
    new URL('../entrypoints/background.ts', import.meta.url),
    'utf8',
  );
  expect(source).not.toContain('setBadgeBackgroundColor');
  expect(source.match(/setBadgeText\([^)]*\)/g)).toEqual([
    "setBadgeText({ text: '' })",
  ]);
  expect(source).toContain("parsed.data.type === 'OPEN_RECAP' ||");
});
it('attaches below top-right and above bottom-left with an 8px margin', () => {
  expect(DOT_SIZE).toBe(14);
  expect(
    boxPoint(
      { x: 970, y: 20 },
      { width: 1000, height: 700 },
      { width: 270, height: 320 },
    ),
  ).toEqual({ x: 714, y: 44 });
  expect(
    boxPoint(
      { x: 20, y: 640 },
      { width: 1000, height: 700 },
      { width: 270, height: 320 },
    ),
  ).toEqual({ x: 20, y: 310 });
});
it('renders the real stop sheet before a slow final save, within 300ms', async () => {
  vi.useFakeTimers();
  let html = '',
    elapsed = Infinity;
  const start = performance.now();
  let finish!: () => void;
  const stopped = stopWithPreview(
    session,
    (preview) => {
      html = renderToStaticMarkup(
        createElement(StopSaved, {
          id: preview.id,
          seconds: preview.durationSeconds,
          laughs: preview.laughs,
          close: () => {},
        }),
      );
      elapsed = performance.now() - start;
    },
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    session.endedAt!,
  );
  await vi.advanceTimersByTimeAsync(250);
  expect(html).toContain('stream saved · 2m · 16 laughs');
  expect(html).toContain('see recap');
  expect(elapsed).toBeLessThan(300);
  finish();
  await stopped;
  vi.useRealTimers();
});
