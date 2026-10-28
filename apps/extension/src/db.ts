import type { MySession, Recap } from '@laughline/shared';
import Dexie, { type EntityTable } from 'dexie';
export const db = new Dexie('laughline') as Dexie & {
  sessions: EntityTable<MySession, 'id'>;
  recaps: EntityTable<Recap, 'id'>;
};
db.version(1).stores({
  sessions: 'id,channel,startedAt,endedAt',
  recaps: 'id,sessionId,channel,createdAt',
});
