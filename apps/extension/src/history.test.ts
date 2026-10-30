import 'fake-indexeddb/auto';
import { createRecap, MySessionSchema } from '@laughline/shared';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { createDatabase, deleteSavedStreams } from './db';
import { channelIdentity, groupHistory } from './history';

const session = (id: string, channel: string, at = 1000, laughs = 3) =>
  MySessionSchema.parse({
    id,
    channel,
    tabId: 1,
    startedAt: at,
    endedAt: at + 60000,
    laughCount: laughs,
    laughEvents: [{ at: 1000, crowd: 0 }],
    peakCrowd: 0,
    crowdViewers: 0,
    topWords: [{ word: 'bro', count: 2 }],
    source: 'local',
  });
it('uses the recorded channel URL instead of a title and preserves display casing', () => {
  expect(
    channelIdentity({
      channel: 'misleading title',
      channelUrl: 'https://www.twitch.tv/Grimm',
      displayName: 'Grimm',
    }),
  ).toEqual({
    channel: 'grimm',
    channelUrl: 'https://www.twitch.tv/grimm',
    displayName: 'Grimm',
  });
  expect(channelIdentity({ channel: 'GRIMM' }).channel).toBe('grimm');
  expect(
    channelIdentity({
      channel: 'grimm',
      channelUrl: 'https://evil.example/other',
    }).channel,
  ).toBe('grimm');
});
it('groups by login, deduplicates sessions, sorts newest first and keeps orphan recaps visible', () => {
  const a = session('a', 'Grimm', 1000, 3),
    b = session('b', 'grimm', 3000, 7),
    c = session('c', 'another', 4000, 2);
  const orphan = createRecap(session('old', 'grimm', 500, 1), 60500);
  const groups = groupHistory(
    [a, b, c],
    [
      createRecap(a, 61000),
      createRecap(a, 61000),
      createRecap(b, 63000),
      createRecap(c, 64000),
      orphan,
    ],
    [{ login: 'grimm', displayName: 'Grimm' }],
  );
  expect(groups.map((g) => g.login)).toEqual(['another', 'grimm']);
  expect(groups[1]).toMatchObject({
    displayName: 'Grimm',
    totalLaughs: 11,
    lastWatched: 63000,
  });
  expect(groups[1]!.streams.map((s) => s.id)).toEqual(['b', 'a', 'old']);
  expect(groups[1]!.streams[0]!.durationSeconds).toBe(60);
});
it('upgrades an actual v1 IndexedDB database without dropping any sessions, recaps or statistics', async () => {
  const name = `history-migration-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(1).stores({
    sessions: 'id,channel,startedAt,endedAt',
    recaps: 'id,sessionId,channel,createdAt',
  });
  const a = session('a', 'GRIMM', 1000, 23),
    b = session('b', 'other', 2000, 0);
  const {
    channelUrl: _url,
    displayName: _name,
    startedAt: _start,
    durationSeconds: _duration,
    hasBestMoment: _best,
    ...original
  } = createRecap(a, 61000);
  await old.table('sessions').bulkPut([a, b]);
  await old.table('recaps').put(original);
  old.close();
  const upgraded = createDatabase(name);
  try {
    await upgraded.open();
    expect(await upgraded.sessions.count()).toBe(2);
    expect(await upgraded.recaps.count()).toBe(1);
    expect(await upgraded.sessions.get('a')).toMatchObject({
      id: 'a',
      channel: 'grimm',
      displayName: 'grimm',
      channelUrl: 'https://www.twitch.tv/grimm',
      laughCount: 23,
      laughEvents: a.laughEvents,
      topWords: a.topWords,
    });
    expect(await upgraded.recaps.get(original.id)).toMatchObject({
      ...original,
      seenAt: original.createdAt,
      channel: 'grimm',
      channelUrl: 'https://www.twitch.tv/grimm',
      displayName: 'grimm',
      startedAt: 1000,
      durationSeconds: 60,
    });
    expect((await upgraded.streamerProfiles.get('grimm'))?.displayName).toBe(
      'grimm',
    );
    expect(
      groupHistory(
        await upgraded.sessions.toArray(),
        await upgraded.recaps.toArray(),
      )
        .flatMap((g) => g.streams)
        .map((s) => s.id)
        .sort(),
    ).toEqual(['a', 'b']);
    upgraded.close();
    await upgraded.open();
    expect(await upgraded.recaps.count()).toBe(1);
  } finally {
    upgraded.close();
    await Dexie.delete(name);
  }
});

it('deletes only the selected saved streams and leaves live checkpoints and other channels intact', async () => {
  const name = `history-delete-${crypto.randomUUID()}`,
    db = createDatabase(name);
  const saved = session('saved', 'grimm'),
    other = session('other', 'other'),
    live = { ...session('live', 'grimm'), endedAt: null };
  try {
    await db.sessions.bulkPut([saved, other, live]);
    await db.recaps.bulkPut([
      createRecap(saved, 61000),
      createRecap(other, 61000),
    ]);
    await db.streamerProfiles.put({ login: 'grimm', displayName: 'Grimm' });
    await deleteSavedStreams(['saved', 'live'], 'grimm', db);
    expect((await db.sessions.toArray()).map((s) => s.id).sort()).toEqual([
      'live',
      'other',
    ]);
    expect((await db.recaps.toArray()).map((r) => r.sessionId)).toEqual([
      'other',
    ]);
    expect(await db.streamerProfiles.get('grimm')).toBeUndefined();
  } finally {
    db.close();
    await Dexie.delete(name);
  }
});

it('upgrades v2 recaps as already seen and preserves new unread recaps until opened', async () => {
  const name = `unread-${crypto.randomUUID()}`,
    old = new Dexie(name);
  old
    .version(2)
    .stores({
      sessions: 'id,channel,startedAt,endedAt',
      recaps: 'id,sessionId,channel,createdAt',
      streamerProfiles: 'login,fetchedAt',
    });
  const a = session('a', 'grimm'),
    legacy = createRecap(a, 61000);
  delete legacy.seenAt;
  await old.table('sessions').put(a);
  await old.table('recaps').put(legacy);
  old.close();
  const upgraded = createDatabase(name);
  try {
    expect((await upgraded.recaps.get('a'))?.seenAt).toBe(61000);
    const b = session('b', 'grimm');
    await upgraded.recaps.put(createRecap(b, 62000));
    expect(await upgraded.recaps.filter((r) => r.seenAt === null).count()).toBe(
      1,
    );
    await upgraded.recaps.update('b', { seenAt: 63000 });
    expect(await upgraded.recaps.filter((r) => r.seenAt === null).count()).toBe(
      0,
    );
    expect(await upgraded.sessions.count()).toBe(1);
  } finally {
    upgraded.close();
    await Dexie.delete(name);
  }
});
