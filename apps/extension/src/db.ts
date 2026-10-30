import type { MySession, Recap } from '@laughline/shared';
import Dexie, { type EntityTable } from 'dexie';
import { channelIdentity, type StreamerProfile } from './history';
export function createDatabase(name?: string) {
  const db = (name ? new Dexie(name) : new Dexie('laughline')) as Dexie & {
    sessions: EntityTable<MySession, 'id'>;
    recaps: EntityTable<Recap, 'id'>;
    streamerProfiles: EntityTable<StreamerProfile, 'login'>;
  };
  db.version(1).stores({
    sessions: 'id,channel,startedAt,endedAt',
    recaps: 'id,sessionId,channel,createdAt',
  });
  db.version(2)
    .stores({
      sessions: 'id,channel,startedAt,endedAt',
      recaps: 'id,sessionId,channel,createdAt',
      streamerProfiles: 'login,fetchedAt',
    })
    .upgrade(async (transaction) => {
      await transaction
        .table('sessions')
        .toCollection()
        .modify((session: MySession) =>
          Object.assign(session, channelIdentity(session)),
        );
      const sessions: MySession[] = await transaction
        .table('sessions')
        .toArray();
      const byId = new Map(sessions.map((s) => [s.id, s]));
      await transaction
        .table('recaps')
        .toCollection()
        .modify((recap: Recap) => {
          const session = byId.get(recap.sessionId);
          Object.assign(recap, channelIdentity(session ?? recap));
          recap.startedAt ??= session?.startedAt ?? recap.createdAt;
          recap.hasBestMoment ??= session
            ? !!session.personal?.hardest
            : recap.hardestLaughAt > 0;
          if (session?.endedAt !== null && session?.endedAt !== undefined)
            recap.durationSeconds ??= Math.max(
              0,
              (session.endedAt - session.startedAt) / 1000,
            );
        });
      const profiles = new Map(
        sessions.map((s) => {
          const p = channelIdentity(s);
          return [p.channel, { login: p.channel, displayName: p.displayName }];
        }),
      );
      if (profiles.size)
        await transaction
          .table('streamerProfiles')
          .bulkPut([...profiles.values()]);
    });
  db.version(3)
    .stores({
      sessions: 'id,channel,startedAt,endedAt',
      recaps: 'id,sessionId,channel,createdAt',
      streamerProfiles: 'login,fetchedAt',
    })
    .upgrade(async (tx) => {
      await tx
        .table('recaps')
        .toCollection()
        .modify((r: Recap) => {
          r.seenAt ??= r.createdAt;
        });
    });
  return db;
}
export const db = createDatabase();

export async function deleteSavedStreams(
  ids: string[],
  profileLogin?: string,
  database = db,
) {
  const db = database;
  await db.transaction(
    'rw',
    db.sessions,
    db.recaps,
    db.streamerProfiles,
    async () => {
      const removable = await db.sessions
        .where('id')
        .anyOf(ids)
        .filter((s) => s.endedAt !== null)
        .primaryKeys();
      // An orphan recap remains deletable, while a live session is never deleted under its recorder.
      const present = new Set(
        (await db.sessions.bulkGet(ids)).filter(Boolean).map((s) => s!.id),
      );
      const safeIds = [...removable, ...ids.filter((id) => !present.has(id))];
      await db.recaps.where('sessionId').anyOf(safeIds).delete();
      await db.sessions.bulkDelete(safeIds);
      if (
        profileLogin &&
        !(await db.recaps.where('channel').equals(profileLogin).count())
      )
        await db.streamerProfiles.delete(profileLogin);
    },
  );
}
