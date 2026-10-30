import {
  type MySession,
  PRODUCT,
  type Recap as RecapData,
  RecapSchema,
} from '@laughline/shared';
import { liveQuery } from 'dexie';
import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { CountUp, formatTime, Mark, useReducedMotion } from './components';
import { db } from './db';
import { HistoryView, StreamerAvatar } from './HistoryView';
import { completeRecaps, groupHistory, type StreamerProfile } from './history';
import { ShareSheet } from './ShareSheet';
import { AppIcon } from './AppIcon';
import { duration, momentLink, STORY_COLORS, storyData } from './recap-story';
export function Recap() {
  const reduce = useReducedMotion();
  const [view, setView] = useState(
    new URLSearchParams(location.search).get('view') === 'streamers'
      ? 'streamers'
      : 'story',
  );
  const [sessions, setSessions] = useState<MySession[]>([]),
    [profiles, setProfiles] = useState<StreamerProfile[]>([]),
    [recaps, setRecaps] = useState<RecapData[]>([]);
  const [selected, setSelected] = useState<string | null>(
    new URLSearchParams(location.search).get('session'),
  );
  const [index, setIndex] = useState(0),
    [cycle, setCycle] = useState(0),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(''),
    [sharing, setSharing] = useState(false);
  const recap = recaps.find((r) => r.id === selected) ?? recaps[0];
  const groups = groupHistory(sessions, recaps, profiles),
    group = groups.find((g) => g.login === recap?.channel);
  const session = sessions.find((s) => s.id === recap?.sessionId),
    profile = group?.profile;
  const data = recap ? storyData(recap, session, group) : null;
  const storyIndex = Math.min(index, (data?.slides.length ?? 1) - 1),
    slide = data?.slides[storyIndex];
  const color = STORY_COLORS[storyIndex % STORY_COLORS.length]!;
  const go = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min((data?.slides.length ?? 1) - 1, next)));
      setCycle((n) => n + 1);
    },
    [data?.slides.length],
  );
  const historyView = () => {
    setView('streamers');
    history.replaceState(null, '', '?view=streamers');
  };
  useEffect(() => {
    const sub = liveQuery(() =>
      Promise.all([
        db.sessions.toArray(),
        db.recaps.orderBy('createdAt').reverse().toArray(),
        db.streamerProfiles.toArray(),
      ]),
    ).subscribe({
      next: ([saved, items, people]) => {
        setSessions(saved);
        setRecaps(
          completeRecaps(
            saved,
            items.map((r) => RecapSchema.parse(r)),
          ).sort((a, b) => b.createdAt - a.createdAt),
        );
        setProfiles(people);
        setLoading(false);
      },
      error: () => {
        setMessage('recaps couldn’t load · reload to retry');
        setLoading(false);
      },
    });
    return () => sub.unsubscribe();
  }, []);
  useEffect(() => {
    if (view === 'story' && recap?.seenAt === null)
      void db.recaps.put({ ...recap, seenAt: Date.now() });
  }, [view, recap?.id, recap?.seenAt]);
  useEffect(() => {
    if (
      reduce ||
      view !== 'story' ||
      sharing ||
      slide === 'final' ||
      slide === 'empty'
    )
      return;
    const t = setTimeout(() => go(storyIndex + 1), 5000);
    return () => clearTimeout(t);
  }, [reduce, view, sharing, slide, storyIndex, go, cycle]);
  useEffect(() => {
    if (view !== 'story' || sharing) return;
    const key = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        go(storyIndex + (e.key === 'ArrowRight' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [view, sharing, storyIndex, go]);
  if (view === 'streamers')
    return (
      <HistoryView
        groups={groups}
        onSelect={(r) => {
          setSelected(r.id);
          setIndex(0);
          setView('story');
          history.replaceState(
            null,
            '',
            `?session=${encodeURIComponent(r.id)}`,
          );
        }}
        onLast={() => {
          setView('story');
          setIndex(0);
        }}
      />
    );
  if (!recap || !data)
    return (
      <main className="empty-recap">
        <Mark />
        <button type="button" className="textbtn" onClick={historyView}>
          my streamers
        </button>
        <h1>
          {loading ? 'one little moment…' : 'your next laugh starts a story.'}
        </h1>
        <p className="sub">
          {message || 'finish a session to find your recap here.'}
        </p>
        <a
          className="btn"
          href="https://www.twitch.tv/directory"
          target="_blank"
          rel="noreferrer"
        >
          open Twitch
        </a>
      </main>
    );
  const name = profile?.displayName || recap.displayName || recap.channel;
  const vod = data.moment
    ? momentLink(
        recap.startedAt ?? recap.createdAt,
        data.moment.seconds,
        profile,
      )
    : null;
  const micCheck = (
    <a
      className="x-pill"
      href={chrome.runtime.getURL('/mic-test.html')}
      target="_blank"
      rel="noreferrer"
    >
      test my mic
    </a>
  );
  return (
    <main
      className="x-rc colourful-recap"
      aria-label="Session recap"
      style={{ '--story-color': color } as CSSProperties}
    >
      <div className="recap-ambient" aria-hidden="true" />
      <header className="recap-topbar">
        <Mark />
        <button type="button" className="textbtn" onClick={historyView}>
          my streamers ↗
        </button>
      </header>
      <div
        className="x-card"
        data-tone="light"
        tabIndex={0}
        role="group"
        aria-roledescription="story"
        aria-label={`your recap · story ${storyIndex + 1} of ${data.slides.length} · arrow keys or tap either half`}
        onClick={(e) => {
          if ((e.target as Element).closest('button,a')) return;
          const b = e.currentTarget.getBoundingClientRect();
          go(storyIndex + (e.clientX - b.left < b.width / 2 ? -1 : 1));
        }}
      >
        <header className="recap-streamer">
          <StreamerAvatar
            login={recap.channel}
            name={name}
            profile={profile}
            size={38}
          />
          <div>
            <b>{name}</b>
            <small>
              {new Date(recap.startedAt ?? recap.createdAt).toLocaleDateString(
                undefined,
                { day: 'numeric', month: 'short', year: 'numeric' },
              )}
            </small>
          </div>
        </header>
        <div
          className="x-bars"
          aria-hidden="true"
          key={`${recap.id}-${storyIndex}-${cycle}`}
        >
          {data.slides.map((s, n) => (
            <i
              key={s}
              className={
                n < storyIndex ? 'is-done' : n === storyIndex ? 'is-run' : ''
              }
            >
              <b />
            </i>
          ))}
        </div>
        <section
          key={`${recap.id}-${slide}-${cycle}`}
          data-slide={slide}
          className="x-st is-on story-content"
        >
          {slide === 'empty' && (
            <>
              <AppIcon size={96} />
              <h1 className="x-ln story-title">
                we didn’t hear anything this time
              </h1>
              <p className="x-ln x-sub">
                let’s check your mic before the next stream.
              </p>
              <div className="x-ln">{micCheck}</div>
            </>
          )}
          {slide === 'intro' && (
            <>
              <StreamerAvatar
                login={recap.channel}
                name={name}
                profile={profile}
                size={92}
              />
              <p className="x-ln x-kick">you + {name}</p>
              <h1 className="x-ln story-title">
                you watched
                <br />
                <strong>{duration(data.seconds)}</strong>
              </h1>
              <p className="x-ln x-sub">
                a little time. a whole lot of moments.
              </p>
            </>
          )}
          {slide === 'laughs' && (
            <>
              <p className="x-ln x-kick">you laughed</p>
              <p className="x-ln story-number">
                <CountUp value={recap.totalLaughs} />
              </p>
              <h1 className="x-ln x-sub">times with {name}</h1>
              {data.perHour !== undefined && (
                <p className="x-ln story-note">about {data.perHour} an hour</p>
              )}
              {data.aboveUsual !== undefined && data.aboveUsual > 0 && (
                <p className="x-ln story-note">
                  {data.aboveUsual} more than usual with {name}
                </p>
              )}
            </>
          )}
          {slide === 'moment' && data.moment && (
            <>
              <p className="x-ln x-kick">your biggest minute</p>
              <p className="x-ln story-number moment-time">
                {formatTime(data.moment.seconds)}
              </p>
              <h1 className="x-ln story-title">
                you laughed {data.moment.count}{' '}
                {data.moment.count === 1 ? 'time' : 'times'} in a minute
              </h1>
              {vod ? (
                <a
                  className="x-ln x-pill"
                  href={vod}
                  target="_blank"
                  rel="noreferrer"
                >
                  open this moment ↗
                </a>
              ) : (
                <p className="x-ln story-note">
                  your local session time ·{' '}
                  {profile?.vods
                    ? 'no saved replay for this moment'
                    : 'connect Twitch photos to look for a replay'}
                </p>
              )}
            </>
          )}
          {slide === 'words' && (
            <>
              <p className="x-ln x-kick">your words of the night</p>
              <ol className="story-words">
                {data.words.map((w) => (
                  <li className="x-ln" key={w.word}>
                    <b>“{w.word}”</b>
                    <small>{w.count}×</small>
                  </li>
                ))}
              </ol>
              <div className="story-chips">
                {data.chips.map(([n, label]) => (
                  <span key={label}>
                    {n} {label}
                  </span>
                ))}
              </div>
            </>
          )}
          {slide === 'history' && (
            <>
              <p className="x-ln x-kick">you + {name}</p>
              <h1 className="x-ln story-title">
                your {data.ordinal} stream
                <br />
                with {name}
              </h1>
              <p className="x-ln story-number history-total">{data.together}</p>
              <p className="x-ln x-sub">laughs together</p>
              <div
                className="past-stream-bars"
                aria-label="laughs in your saved streams"
              >
                {data.streams.map((s, n) => (
                  <i
                    key={s.id}
                    style={{
                      height: Math.max(
                        4,
                        (s.laughs /
                          Math.max(1, ...data.streams.map((t) => t.laughs))) *
                          74,
                      ),
                    }}
                    title={`stream ${n + 1}: ${s.laughs} laughs`}
                  />
                ))}
              </div>
            </>
          )}
          {slide === 'final' && (
            <>
              <AppIcon size={96} />
              <h1 className="x-ln story-title">
                one stream.
                <br />
                your kind of people.
              </h1>
              <div className="x-ln x-acts">
                <button
                  type="button"
                  className="x-pill"
                  disabled={!recap.totalLaughs}
                  onClick={() => setSharing(true)}
                >
                  share
                </button>
                <button
                  type="button"
                  className="x-pill story-secondary"
                  onClick={historyView}
                >
                  see all my streamers
                </button>
              </div>
              {!recap.totalLaughs && <div className="x-ln">{micCheck}</div>}
              <button type="button" className="textbtn" onClick={() => go(0)}>
                replay
              </button>
            </>
          )}
        </section>
        <footer className="recap-card-brand">
          <AppIcon size={25} />
          <span className="text-wordmark">{PRODUCT.wordmark}</span>
        </footer>
      </div>
      <nav className="story-navigation" aria-label="recap navigation">
        <button
          type="button"
          className="textbtn"
          disabled={storyIndex === 0}
          onClick={() => go(storyIndex - 1)}
        >
          previous
        </button>
        <span>
          {storyIndex + 1} / {data.slides.length}
        </span>
        <button
          type="button"
          className="textbtn"
          disabled={storyIndex === data.slides.length - 1}
          onClick={() => go(storyIndex + 1)}
        >
          next
        </button>
      </nav>
      {!data.empty && (
        <button
          type="button"
          className="textbtn recap-share-link"
          disabled={!recap.totalLaughs}
          onClick={() => setSharing(true)}
        >
          share recap ↑
        </button>
      )}
      <p className="preview-label">
        {recap.source === 'local'
          ? 'real personal reactions'
          : 'demo · simulated stats'}{' '}
        · stored on this browser
      </p>
      {sharing && (
        <ShareSheet
          recap={recap}
          profile={profile}
          ordinal={data.ordinal}
          bestMoment={data.moment?.seconds}
          close={() => setSharing(false)}
        />
      )}
    </main>
  );
}
