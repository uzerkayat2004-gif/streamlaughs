import {
  type MySession,
  MySessionSchema,
  type Recap,
  RecapSchema,
} from '@laughline/shared';
import { z } from 'zod';
import { db } from './db';

const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[\w:-]+$/);
const safeChannel = z.string().regex(/^[a-z0-9_]{1,25}$/i);
const safeUrl = z
  .string()
  .max(240)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        u.protocol === 'https:' &&
        /^(?:www\.|clips\.)?twitch\.tv$/.test(u.hostname) &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  });
// Preserve older locally saved word labels too; they used a broader vocabulary.
const words = MySessionSchema.shape.topWords.max(256);
const sessionSchema = MySessionSchema.extend({
  id,
  channel: safeChannel,
  channelUrl: safeUrl.optional(),
  endedAt: z.number().nonnegative(),
  laughEvents: MySessionSchema.shape.laughEvents.max(100_000),
  topWords: words,
  crowdTopWords: words.default([]),
});
const recapSchema = RecapSchema.extend({
  id,
  sessionId: id,
  channel: safeChannel,
  channelUrl: safeUrl.optional(),
  topWord: z.string().max(80),
  style: z.string().max(100),
});
// Object schemas strip unknown fields, including untrusted audio/transcript payloads.
const HistoryFile = z.object({
  format: z.literal('streamlaughs-history'),
  schemaVersion: z.literal(1),
  exportedAt: z.number().nonnegative(),
  sessions: z.array(sessionSchema).max(5000),
  recaps: z.array(recapSchema).max(5000),
});
export type SavedHistory = { sessions: MySession[]; recaps: Recap[] };
export const HISTORY_MAX_BYTES = 20 * 1024 * 1024;
export function parseHistory(text: string): SavedHistory {
  if (new TextEncoder().encode(text).length > HISTORY_MAX_BYTES)
    throw new Error('history file is too large · choose a smaller file');
  const parsed = HistoryFile.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new Error('not a StreamLaughs history file · choose your saved JSON');
  return { sessions: parsed.data.sessions, recaps: parsed.data.recaps };
}
export function exportHistory(history: SavedHistory, now = Date.now()) {
  const text = JSON.stringify({
    format: 'streamlaughs-history',
    schemaVersion: 1,
    exportedAt: now,
    ...history,
  });
  parseHistory(text);
  // Re-parse through the allowlisted schema before writing the file.
  return JSON.stringify(HistoryFile.parse(JSON.parse(text)), null, 2);
}
export function mergeHistory(
  current: SavedHistory,
  incoming: SavedHistory,
): SavedHistory {
  const sessions = new Map(current.sessions.map((s) => [s.id, s]));
  const recaps = new Map(current.recaps.map((r) => [r.sessionId, r]));
  const recapIds = new Set(current.recaps.map((r) => r.id));
  for (const s of incoming.sessions)
    if (!sessions.has(s.id)) sessions.set(s.id, s);
  for (const r of incoming.recaps)
    if (!recaps.has(r.sessionId) && !recapIds.has(r.id)) {
      recaps.set(r.sessionId, r);
      recapIds.add(r.id);
    }
  return { sessions: [...sessions.values()], recaps: [...recaps.values()] };
}
export async function importHistory(text: string, database = db) {
  const incoming = parseHistory(text);
  return database.transaction(
    'rw',
    database.sessions,
    database.recaps,
    async () => {
      const current = {
        sessions: await database.sessions.toArray(),
        recaps: await database.recaps.toArray(),
      };
      const merged = mergeHistory(current, incoming);
      await database.sessions.bulkPut(merged.sessions);
      await database.recaps.bulkPut(merged.recaps);
      return {
        sessions: merged.sessions.length - current.sessions.length,
        recaps: merged.recaps.length - current.recaps.length,
      };
    },
  );
}
export function downloadHistoryFile(text: string, doc = document) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const link = doc.createElement('a');
  link.href = url;
  link.download = 'streamlaughs-history.json';
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
