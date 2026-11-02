import 'fake-indexeddb/auto';
import { createRecap, MySessionSchema } from '@laughline/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from './db';
import {
  downloadHistoryFile,
  exportHistory,
  importHistory,
  mergeHistory,
  parseHistory,
} from './history-transfer';

afterEach(() => vi.unstubAllGlobals());
const session = (id = 'a') =>
  MySessionSchema.parse({
    id,
    channel: 'test',
    tabId: 1,
    startedAt: 1000,
    endedAt: 61000,
    laughCount: 3,
    laughEvents: [],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: [{ word: 'bro', count: 2 }],
    source: 'local',
  });
const saved = () => {
  const s = session();
  return { sessions: [s], recaps: [createRecap(s, 61000)] };
};
it('round trips saved sessions and recaps, stripping unknown data including transcripts/audio', () => {
  const original = saved();
  const raw = JSON.parse(exportHistory(original));
  raw.sessions[0].transcript = 'private';
  raw.audio = [1, 2, 3];
  expect(parseHistory(JSON.stringify(raw))).toEqual(original);
  expect(exportHistory(parseHistory(JSON.stringify(raw)))).not.toContain(
    'transcript',
  );
});
it('merges by session ID, keeps newer local/active records, and deduplicates recaps with different recap IDs', () => {
  const current = saved(),
    incoming = saved();
  incoming.sessions[0]!.laughCount = 99;
  incoming.recaps[0]!.id = 'other-recap';
  incoming.sessions.push(session('b'));
  const merged = mergeHistory(current, incoming);
  expect(merged.sessions).toHaveLength(2);
  expect(merged.sessions[0]!.laughCount).toBe(3);
  expect(merged.recaps).toHaveLength(1);
  expect(mergeHistory(merged, incoming)).toEqual(merged);
});
it.each([
  '{}',
  'not json',
  JSON.stringify({ format: 'streamlaughs-history', schemaVersion: 2 }),
  exportHistory(saved()).replace('"laughCount": 3', '"laughCount": -1'),
  exportHistory(saved()).replace('"channel": "test"', '"channel": "<script>"'),
])('rejects malformed or incompatible files without writing', (text) =>
  expect(() => parseHistory(text)).toThrow(),
);
it('merges imports transactionally and repeated imports preserve current recording plus recaps', async () => {
  const database = createDatabase('history-transfer-' + Math.random());
  try {
    const active = session('live');
    active.endedAt = null;
    await database.sessions.put(active);
    expect(await importHistory(exportHistory(saved()), database)).toEqual({
      sessions: 1,
      recaps: 1,
    });
    expect(await importHistory(exportHistory(saved()), database)).toEqual({
      sessions: 0,
      recaps: 0,
    });
    expect((await database.sessions.get('live'))?.endedAt).toBeNull();
    expect(await database.recaps.count()).toBe(1);
    await expect(importHistory('{}', database)).rejects.toThrow();
    expect(await database.recaps.count()).toBe(1);
  } finally {
    await database.delete();
  }
});
it('saves JSON through a blob anchor without accessing chrome.downloads', () => {
  vi.useFakeTimers();
  const access = vi.fn(() => {
    throw new Error('no permission');
  });
  vi.stubGlobal('chrome', {
    get downloads() {
      return access();
    },
  });
  const link = {
    href: '',
    download: '',
    hidden: false,
    click: vi.fn(),
    remove: vi.fn(),
  };
  const doc = { createElement: vi.fn(() => link), body: { append: vi.fn() } };
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  downloadHistoryFile(exportHistory(saved()), doc as unknown as Document);
  expect(link.download).toBe('streamlaughs-history.json');
  expect(link.href).toMatch(/^blob:/);
  expect(link.click).toHaveBeenCalledOnce();
  expect(access).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalled();
  vi.useRealTimers();
});

it('preserves legacy word labels from older saved recaps instead of making the entire backup unexportable', () => {
  const data = saved();
  data.sessions[0]!.topWords = [{ word: 'really', count: 2 }];
  data.recaps[0]!.topWord = 'really';
  expect(parseHistory(exportHistory(data)).recaps[0]!.topWord).toBe('really');
});
