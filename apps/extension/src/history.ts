import {
  createRecap,
  type MySession,
  MySessionSchema,
  type Recap,
} from '@laughline/shared';

export type StreamerProfile = {
  login: string;
  displayName: string;
  avatarDataUrl?: string;
  fetchedAt?: number;
  vods?: { id: string; created_at: string; duration: string }[];
};
export type SavedStream = {
  id: string;
  channel: string;
  displayName: string;
  startedAt: number;
  durationSeconds: number;
  laughs: number;
  word: string;
  recap: Recap;
  laughTimes: number[];
};
export type StreamerHistory = {
  login: string;
  displayName: string;
  streams: SavedStream[];
  totalLaughs: number;
  lastWatched: number;
  profile?: StreamerProfile;
};

export function channelIdentity(record: {
  channel?: string;
  channelUrl?: string;
  displayName?: string;
}) {
  let login: string | undefined;
  try {
    const url = new URL(record.channelUrl ?? '');
    if (
      url.protocol === 'https:' &&
      ['www.twitch.tv', 'twitch.tv'].includes(url.hostname)
    ) {
      const match = /^\/([a-z0-9_]{1,25})\/?$/i.exec(url.pathname);
      login = match?.[1]?.toLowerCase();
    }
  } catch {
    /* Legacy records already contain the login parsed from the watched tab URL. */
  }
  const stored = record.channel?.toLowerCase();
  login ??= stored && /^[a-z0-9_]{1,25}$/.test(stored) ? stored : undefined;
  return {
    channel: login ?? record.channel ?? 'unknown',
    channelUrl: login ? `https://www.twitch.tv/${login}` : record.channelUrl,
    displayName:
      record.displayName?.trim() ||
      login ||
      record.channel ||
      'unknown streamer',
  };
}

export function groupHistory(
  sessions: MySession[],
  recaps: Recap[],
  profiles: StreamerProfile[] = [],
): StreamerHistory[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const profileByLogin = new Map(profiles.map((p) => [p.login, p]));
  const groups = new Map<string, StreamerHistory>();
  for (const recap of completeRecaps(sessions, recaps)) {
    const session = byId.get(recap.sessionId);
    const identity = channelIdentity(session ?? recap);
    const profile = profileByLogin.get(identity.channel);
    const startedAt = session?.startedAt ?? recap.startedAt ?? recap.createdAt;
    const group = groups.get(identity.channel) ?? {
      login: identity.channel,
      displayName: profile?.displayName ?? identity.displayName,
      streams: [],
      totalLaughs: 0,
      lastWatched: 0,
      profile,
    };
    if (group.streams.some((s) => s.id === recap.sessionId)) continue;
    group.streams.push({
      id: recap.sessionId,
      channel: identity.channel,
      displayName: identity.displayName,
      startedAt,
      durationSeconds: session
        ? Math.max(0, ((session.endedAt ?? startedAt) - startedAt) / 1000)
        : (recap.durationSeconds ?? 0),
      laughs: recap.totalLaughs,
      word: recap.topWord,
      recap,
      laughTimes: (session?.laughEvents ?? []).map((e) =>
        Math.max(0, (e.at - startedAt) / 1000),
      ),
    });
    group.totalLaughs += recap.totalLaughs;
    group.lastWatched = Math.max(
      group.lastWatched,
      session?.endedAt ?? recap.createdAt,
    );
    groups.set(identity.channel, group);
  }
  for (const group of groups.values())
    group.streams.sort((a, b) => b.startedAt - a.startedAt);
  return [...groups.values()].sort((a, b) => b.lastWatched - a.lastWatched);
}
export function completeRecaps(
  sessions: MySession[],
  recaps: Recap[],
): Recap[] {
  const result = [...recaps],
    known = new Set(recaps.map((r) => r.sessionId));
  for (const session of sessions) {
    if (typeof session.endedAt !== 'number' || known.has(session.id)) continue;
    const parsed = MySessionSchema.safeParse(session);
    if (parsed.success) {
      result.push(createRecap(parsed.data, session.endedAt));
      known.add(session.id);
    }
  }
  return result;
}

export function avatarColor(login: string) {
  const hash = [...login].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  return ['#FFD23F', '#FF5C5C', '#2EE6C5'][hash % 3]!;
}
export const safeAvatar = (value?: string) =>
  !!value &&
  value.length < 400000 &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
