import { createRecap, MySessionSchema } from '@laughline/shared';
import jsQR from 'jsqr';
import { afterEach, expect, it, vi } from 'vitest';
import {
  SHARE_SIZE,
  shareCardData,
  shareText,
  renderShareCard,
  shareLink,
  shareQr,
} from './share-card';
afterEach(() => vi.unstubAllGlobals());

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
it('builds a stat-only link from current recap context and includes it in share text', () => {
  const r = {
    ...recap(16),
    startedAt: Date.parse('2026-11-01T12:00:00Z'),
    durationSeconds: 2820,
    funniestWord: 'no way',
    hype: 4,
  };
  const link = shareLink(r, { streamNumber: 2, bestMoment: 760 });
  const url = new URL(link);
  expect(url.pathname).toBe('/r');
  expect(url.searchParams.get('stream')).toBe('2');
  expect(url.searchParams.get('funniest')).toBe('no way');
  expect(
    shareText(r, undefined, { streamNumber: 2, bestMoment: 760 }),
  ).toContain(link);
  expect(link).not.toMatch(/audio|transcript|token|viewer/);
});
it('keeps legacy orphan recaps shareable without inventing an unknown duration', () => {
  const r = {
    ...recap(16),
    startedAt: Date.parse('2026-11-01T12:00:00Z'),
    durationSeconds: undefined,
    hasBestMoment: true,
    hardestLaughAt: 760,
  };
  const link = new URL(shareLink(r));
  expect(link.searchParams.has('minutes')).toBe(false);
  expect(link.searchParams.get('moment')).toBe('760');
});
it('generates a decodable QR locally for the configured website with a four-module quiet zone', () => {
  const site = 'https://streamlaughs.vercel.app',
    qr = shareQr(site),
    modules = qr.getModuleCount(),
    scale = 5,
    width = (modules + 8) * scale;
  const rgba = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < modules; y++)
    for (let x = 0; x < modules; x++)
      if (qr.isDark(y, x)) {
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i =
              (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
          }
      }
  expect(jsQR(rgba, width, width)?.data).toBe(site);
});
it('draws the 1080x1920 card with a filled initials circle, white letter, four labelled chips and local QR', async () => {
  const text: { value: string; color: string }[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    font: '',
    textAlign: '',
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    roundRect: vi.fn(),
    fill() {},
    stroke() {},
    arc: vi.fn(),
    clip() {},
    fillRect: vi.fn(),
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    measureText: (s: string) => ({ width: s.length * 20 }),
    strokeText() {},
    fillText(value: string) {
      text.push({ value, color: this.fillStyle });
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob) => void) =>
      cb(new Blob(['image'], { type: 'image/png' })),
  };
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => canvas,
  });
  vi.stubGlobal('Path2D', class {});
  const r = { ...recap(16), hype: 4, funniestWord: 'no way' };
  const image = await renderShareCard(r, undefined, {
    ordinal: '1st',
    bestMoment: 12,
  });
  expect(image.type).toBe('image/png');
  expect(canvas).toMatchObject({ width: 1080, height: 1920 });
  expect(text).toContainEqual({ value: 'G', color: '#FFFFFF' });
  for (const label of [
    'most used word',
    'funniest word',
    'biggest minute',
    'hype shouts',
    'get your recap',
  ])
    expect(text.some((t) => t.value === label)).toBe(true);
  expect(ctx.roundRect.mock.calls.filter((c) => c[3] === 168)).toHaveLength(4);
  expect(ctx.fillRect.mock.calls.length).toBeGreaterThan(100); // Actual QR modules, not an external image.
});
it('disables zero-laugh PNG exports before any canvas or model can be read', async () => {
  const data = shareCardData(recap(0));
  expect(data.canShare).toBe(false);
  await expect(renderShareCard(recap(0))).rejects.toThrow('no laughs to share');
  expect(data.bestMoment).toBeNull();
  expect(shareText(recap(0))).toContain('Some nights are just for watching.');
  expect(shareText(recap(0))).not.toContain('0 times');
});
