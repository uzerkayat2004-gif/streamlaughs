import type { Recap } from '@laughline/shared';
import { type CSSProperties, useEffect, useState } from 'react';
import { formatTime, Mark, Sheet } from './components';
import { deleteSavedStreams } from './db';
import {
  avatarColor,
  type StreamerHistory,
  type StreamerProfile,
  safeAvatar,
} from './history';
import { connectProfilePhotos, refreshProfilePhotos } from './profile-photos';
import { SITE_URL } from './site';
import { duration, sparkline } from './recap-story';
export function StreamerAvatar({
  login,
  name,
  profile,
  size = 48,
}: {
  login: string;
  name: string;
  profile?: StreamerProfile;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <span
      className="streamer-avatar"
      style={{ width: size, height: size, background: avatarColor(login) }}
    >
      {failedUrl !== profile?.avatarDataUrl &&
      safeAvatar(profile?.avatarDataUrl) ? (
        <img
          src={profile!.avatarDataUrl}
          width={size}
          height={size}
          alt=""
          onError={() => setFailedUrl(profile?.avatarDataUrl)}
        />
      ) : (
        <span>{name[0]?.toUpperCase() || 'S'}</span>
      )}
    </span>
  );
}
const watched = (at: number) =>
  new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
export function HistoryView({
  groups,
  onSelect,
  onLast,
}: {
  groups: StreamerHistory[];
  onSelect: (recap: Recap) => void;
  onLast: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(
      new URLSearchParams(location.search).get('channel'),
    ),
    [remove, setRemove] = useState<{
      ids: string[];
      channel: string;
      label: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const group = groups.find((g) => g.login === selected);
  const totalStreams = groups.reduce((n, g) => n + g.streams.length, 0);
  const funniest = [...groups]
    .filter(
      (g) => g.totalLaughs > 0 && g.streams.some((s) => s.durationSeconds > 0),
    )
    .sort(
      (a, b) =>
        b.totalLaughs /
          Math.max(
            1,
            b.streams.reduce((n, s) => n + s.durationSeconds, 0),
          ) -
        a.totalLaughs /
          Math.max(
            1,
            a.streams.reduce((n, s) => n + s.durationSeconds, 0),
          ),
    )[0];
  const logins = groups.map((g) => g.login).join(',');
  useEffect(() => {
    if (logins) void refreshProfilePhotos(logins.split(',')).catch(() => {});
  }, [logins]);
  return (
    <main className="history-page">
      <header className="history-heading">
        <Mark />
        <button type="button" className="textbtn" onClick={onLast}>
          last recap ↗
        </button>
      </header>
      <div className="history-intro">
        <p className="eyebrow">your people. your good moments.</p>
        <h1>my streamers</h1>
        <p className="sub">your watching history stays in this browser.</p>
      </div>
      <div className="history-summary">
        <span>
          <b>{groups.length}</b> streamers
        </span>
        <span>
          <b>{totalStreams}</b> streams
        </span>
        <span>
          <b>{groups.reduce((n, g) => n + g.totalLaughs, 0)}</b> laughs
        </span>
        {funniest && (
          <span>
            your funniest streamer <b>{funniest.displayName}</b>
            <small>most laughs per hour</small>
          </span>
        )}
      </div>
      {group ? (
        <>
          <button
            type="button"
            className="textbtn history-back"
            onClick={() => {
              setSelected(null);
              history.replaceState(null, '', '?view=streamers');
            }}
          >
            ← all streamers
          </button>
          <section
            className="streamer-detail-heading"
            style={{ background: avatarColor(group.login) }}
          >
            <StreamerAvatar
              login={group.login}
              name={group.displayName}
              profile={group.profile}
              size={64}
            />
            <div>
              <h2>{group.displayName}</h2>
              <p>
                {group.streams.length} streams watched · {group.totalLaughs}{' '}
                laughs
              </p>
            </div>
            <button
              type="button"
              className="textbtn delete-link"
              onClick={() =>
                setRemove({
                  ids: group.streams.map((s) => s.id),
                  channel: group.login,
                  label: `all ${group.streams.length} saved streams with ${group.displayName}`,
                })
              }
            >
              delete all for this streamer
            </button>
          </section>
          <div className="saved-streams-list">
            {group.streams.map((stream) => (
              <article key={stream.id} className="saved-stream-row">
                <button
                  type="button"
                  className="stream-open"
                  onClick={() => onSelect(stream.recap)}
                >
                  <span>
                    <b>{watched(stream.startedAt)}</b>
                    <small>{duration(stream.durationSeconds)} watched</small>
                  </span>
                  <span>
                    <b>{stream.laughs} laughs</b>
                    <small>
                      {stream.recap.wordCount
                        ? `“${stream.word}”`
                        : 'no words yet'}
                    </small>
                  </span>
                  <svg
                    className="laugh-sparkline"
                    viewBox="0 0 160 34"
                    role="img"
                    aria-label="laughs through this stream"
                  >
                    <polyline
                      points={sparkline(
                        stream.laughTimes,
                        stream.durationSeconds,
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {stream.recap.seenAt === null && (
                    <small className="new-recap">new recap</small>
                  )}
                  <span aria-hidden="true">↗</span>
                </button>
                <button
                  type="button"
                  className="textbtn delete-link"
                  aria-label={`delete stream from ${watched(stream.startedAt)}`}
                  onClick={() =>
                    setRemove({
                      ids: [stream.id],
                      channel: group.login,
                      label: `the stream from ${watched(stream.startedAt)}`,
                    })
                  }
                >
                  delete
                </button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="streamers-grid">
          {groups.map((g) => (
            <button
              type="button"
              key={g.login}
              className="streamer-card"
              style={
                { '--streamer-color': avatarColor(g.login) } as CSSProperties
              }
              onClick={() => {
                setSelected(g.login);
                history.replaceState(
                  null,
                  '',
                  `?view=streamers&channel=${encodeURIComponent(g.login)}`,
                );
              }}
            >
              <StreamerAvatar
                login={g.login}
                name={g.displayName}
                profile={g.profile}
                size={80}
              />
              <h2>{g.displayName}</h2>
              {g.streams.some((s) => s.recap.seenAt === null) && (
                <span className="new-recap">new recap</span>
              )}
              <p>
                {g.streams.length}{' '}
                {g.streams.length === 1 ? 'stream' : 'streams'} watched{' '}
                <span>·</span> {g.totalLaughs} laughs
              </p>
              <small>last watched {watched(g.lastWatched)}</small>
              <span className="streamer-card-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>
      )}
      {!groups.length && (
        <div className="history-empty">
          <h2>your next laugh starts here.</h2>
          <p className="sub">
            finish a Twitch session and your streamer will appear here.
          </p>
          <a
            className="btn"
            href="https://www.twitch.tv/directory"
            target="_blank"
            rel="noreferrer"
          >
            open Twitch
          </a>
        </div>
      )}
      <details className="history-photos">
        <summary>settings · photos & replays</summary>
        <button
          type="button"
          className="textbtn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage('connecting profile photos…');
            try {
              setMessage(
                await connectProfilePhotos(groups.map((g) => g.login)),
              );
            } catch {
              setMessage('photos unavailable · keep using initials');
            } finally {
              setBusy(false);
            }
          }}
        >
          connect Twitch photos ↗
        </button>
        {SITE_URL && (
          <a
            className="textbtn"
            href={`${SITE_URL}/streamers`}
            target="_blank"
            rel="noreferrer"
          >
            sign in on our website ↗
          </a>
        )}
        <p className="sub" role="status">
          {message ||
            'optional · sign in on our website first. initials always work offline.'}
        </p>
      </details>
      {remove && (
        <Sheet
          title="delete these saved moments?"
          close={() => !busy && setRemove(null)}
        >
          <p className="sub space-top">
            this removes {remove.label} from this browser. your other streamers
            and settings stay saved.
          </p>
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await deleteSavedStreams(remove.ids, remove.channel);
                setRemove(null);
              } catch {
                setMessage('couldn’t delete · try again');
              } finally {
                setBusy(false);
              }
            }}
          >
            delete saved streams
          </button>
          <button
            type="button"
            className="textbtn"
            onClick={() => setRemove(null)}
          >
            keep them
          </button>
        </Sheet>
      )}
    </main>
  );
}
