import {
  PRODUCT,
  type Recap as RecapData,
  RecapSchema,
} from '@laughline/shared';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { connectSurface, surface } from './bridge';
import { CountUp, formatTime, Mark, useReducedMotion } from './components';
import { db } from './db';

export function Recap() {
  const lastRecapId = useStore(
    surface.store,
    (state) => state.snapshot.lastRecapId,
  );
  const reduce = useReducedMotion();
  useEffect(connectSurface, []);
  const [recaps, setRecaps] = useState<RecapData[]>([]),
    [selected, setSelected] = useState<string | null>(
      new URLSearchParams(location.search).get('session'),
    );
  const [requestedStory, setStory] = useState(0),
    [cycle, setCycle] = useState(0),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(true),
    [reverse, setReverse] = useState(false);
  const recap = recaps.find((item) => item.id === selected) ?? recaps[0];
  const hasCrowd = !!recap?.crowdSummary;
  const story = requestedStory === 1 && !hasCrowd ? 2 : requestedStory;
  const stories = hasCrowd ? [0, 1, 2, 3, 4, 5] : [0, 2, 3, 4, 5];
  const crowdDescription =
    recap?.crowdSummary?.source === 'fake'
      ? 'simulated crowd'
      : recap?.crowdSummary
        ? `live crowd${recap.crowdSummary.testTraffic ? ' · test traffic' : ''}`
        : 'no crowd data';
  const go = useCallback(
    (next: number) => {
      setReverse(next < story);
      const target = !hasCrowd && next === 1 ? (next < story ? 0 : 2) : next;
      setStory(Math.max(0, Math.min(5, target)));
      setCycle(cycle + 1);
    },
    [story, cycle, hasCrowd],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: Finalization and deletion invalidate this IndexedDB query.
  useEffect(() => {
    let alive = true;
    const load = () =>
      void db.recaps
        .orderBy('createdAt')
        .reverse()
        .toArray()
        .then((items) => {
          if (alive) {
            setRecaps(items.map((item) => RecapSchema.parse(item)));
            setLoading(false);
          }
        })
        .catch(() => {
          if (alive) {
            setMessage('recaps couldn’t load · reload this page to retry');
            setLoading(false);
          }
        });
    load();
    return () => {
      alive = false;
    };
  }, [lastRecapId]);
  useEffect(() => {
    if (!recap || story === 5 || reduce) return;
    const timer = setTimeout(() => go(story + 1), 5000);
    return () => clearTimeout(timer);
  }, [story, recap, go, reduce]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        go(story + (event.key === 'ArrowRight' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [story, go]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3500);
    return () => clearTimeout(timer);
  }, [message]);
  if (!recap)
    return (
      <main className="empty-recap">
        <Mark />
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
  return (
    <main className="x-rc" aria-label="Session recap">
      <div
        className="x-card"
        data-tone={story < 2 ? 'light' : 'dark'}
        data-dir={reverse ? 'back' : 'fwd'}
        tabIndex={0}
        role="group"
        aria-roledescription="story"
        aria-label={`your recap · story ${stories.indexOf(story) + 1} of ${stories.length} · click right for next, left for back, or use the arrow keys`}
        onClick={(event) => {
          if ((event.target as Element).closest('button,a')) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          go(story + (event.clientX - bounds.left < bounds.width / 2 ? -1 : 1));
        }}
      >
        <div
          className="x-bars"
          aria-hidden="true"
          key={`${recap.id}-${story}-${cycle}`}
        >
          {stories.map((n) => (
            <i
              key={n}
              className={n < story ? 'is-done' : n === story ? 'is-run' : ''}
            >
              <b />
            </i>
          ))}
        </div>
        <div
          key={`${story}-${recap.id}-${cycle}`}
          className={`x-st is-on ${['x-st--sun', 'x-st--sea', 'x-st--word', 'x-st--hard', 'x-st--style', 'x-st--share'][story]}`}
        >
          {story === 0 && (
            <>
              <p className="x-ln x-kick">you laughed</p>
              <p
                className="x-ln x-giant"
                style={{
                  fontSize: `${Math.min(36, 132 / recap.totalLaughs.toLocaleString('en-US').length)}cqw`,
                }}
              >
                <CountUp value={recap.totalLaughs} />
              </p>
              <p className="x-ln x-sub">times with {recap.channel}</p>
            </>
          )}
          {story === 1 && (
            <>
              <div className="x-rain" aria-hidden="true">
                {Array.from({ length: 26 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      left: `${(i * 41) % 100}%`,
                      width: 4 + (i % 7),
                      height: 4 + (i % 7),
                      opacity: 0.3 + (i % 4) * 0.15,
                      animationDuration: `${2.4 + (i % 5) * 0.5}s`,
                      animationDelay: `-${i % 6}s`,
                    }}
                  />
                ))}
              </div>
              <p className="x-ln x-kick">
                {recap.crowdSummary?.source === 'fake'
                  ? "you weren't alone"
                  : 'you vs crowd'}
              </p>
              <p
                className="x-ln x-giant"
                style={{
                  fontSize: `${Math.min(29, 132 / String(recap.crowdSummary?.peakLaughingNow ?? 0).length)}cqw`,
                }}
              >
                <CountUp value={recap.crowdSummary?.peakLaughingNow ?? 0} />
              </p>
              <p className="x-ln x-sub">
                {crowdDescription} · peak laughing together
              </p>
              <p className="x-ln x-yours">
                you: {recap.totalLaughs} laughs this session · highest share
                laughing: {recap.crowdSummary?.peakLaughPercent}% · up to{' '}
                {recap.crowdSummary?.peakSharing} sharing
              </p>
            </>
          )}
          {story === 2 && (
            <>
              <div className="x-float" aria-hidden="true">
                {[recap.topWord, ...recap.maskedSwears.map((w) => w.text)]
                  .filter((w) => w !== '—')
                  .slice(0, 6)
                  .map((word, i) => (
                    <span
                      key={word}
                      style={{
                        ...[
                          { top: '11%', left: '8%' },
                          { top: '15%', right: '9%' },
                          { top: '26%', left: '34%' },
                          { bottom: '18%', right: '8%' },
                          { bottom: '9%', left: '10%' },
                          { bottom: '12%', left: '44%' },
                        ][i],
                        animationDelay: `-${i * 0.8}s`,
                      }}
                    >
                      {word}
                    </span>
                  ))}
              </div>
              <p className="x-ln x-kick">your word of the night</p>
              <p className={`x-ln ${recap.wordCount ? 'x-giant' : 'x-big'}`}>
                {recap.wordCount
                  ? `“${recap.topWord.toUpperCase()}”`
                  : 'all laughs. no words yet.'}
              </p>
              <p className="x-ln x-sub">
                {recap.wordCount
                  ? `said ${recap.wordCount.toLocaleString('en-US')} times`
                  : 'a quiet mic can still be a good night.'}
              </p>
              <p className="x-ln x-yours">
                {recap.swears} masked swears · {recap.hype} hype shouts ·{' '}
                {recap.screams} screams · {recap.gasps} gasps
              </p>
            </>
          )}
          {story === 3 && (
            <>
              <p className="x-ln x-kick">your hardest laugh</p>
              <p className={`x-ln ${recap.totalLaughs ? 'x-giant' : 'x-big'}`}>
                {recap.totalLaughs ? (
                  <CountUp value={recap.hardestLaughAt} format={formatTime} />
                ) : (
                  'next time.'
                )}
              </p>
              <p className="x-ln x-sub">
                {!recap.totalLaughs
                  ? 'no laughs caught this session'
                  : recap.crowdSummary
                    ? `${recap.othersAtPeak} ${crowdDescription} reactions at that moment`
                    : 'your personal moment'}
              </p>
              {recap.totalLaughs > 0 && (
                <button
                  type="button"
                  className="x-ln x-pill x-pill--white"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        formatTime(recap.hardestLaughAt),
                      );
                      setMessage('time copied');
                    } catch {
                      setMessage('couldn’t copy · focus this tab and retry');
                    }
                  }}
                >
                  copy time
                </button>
              )}
            </>
          )}
          {story === 4 && (
            <>
              <svg className="x-sq" viewBox="0 0 400 200" aria-hidden="true">
                <path
                  d="M-10 130C40 20 95 20 120 100S205 185 240 95 330 10 410 80"
                  fill="none"
                  stroke="#FFD23F"
                  strokeWidth="16"
                  strokeLinecap="round"
                />
              </svg>
              <p className="x-ln x-kick">your laugh style</p>
              <p className="x-ln x-big">{recap.style}</p>
              <p className="x-ln x-sub">
                {recap.style === 'the delayed cackler'
                  ? `about ${recap.delaySeconds} sec after tab laughter`
                  : 'from your local reactions this session'}
              </p>
            </>
          )}
          {story === 5 && (
            <>
              <div className="x-glow share-glow-teal" />
              <div className="x-glow share-glow-yellow" />
              <p className="x-ln x-wm">{PRODUCT.wordmark}</p>
              <p className="x-ln x-giant">
                <CountUp value={recap.totalLaughs} />
              </p>
              <p className="x-ln x-kick">laughs</p>
              <p className="x-ln x-sub">{recap.channel}</p>
              <svg
                className="x-ln x-wave"
                viewBox="0 0 270 60"
                aria-hidden="true"
              >
                <path
                  d="M10 30Q35 6 60 30T110 30 160 30 210 30 260 30"
                  fill="none"
                  stroke="#FFD23F"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M10 30Q35 54 60 30T110 30 160 30 210 30 260 30"
                  fill="none"
                  stroke="#2EE6C5"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
              <div className="x-ln x-acts">
                <button
                  type="button"
                  className="x-pill x-pill--yellow"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${recap.totalLaughs} laughs with ${recap.channel} · ${PRODUCT.name} (personal: ${recap.source}; ${crowdDescription})`,
                      );
                      setMessage('card copied');
                    } catch {
                      setMessage('couldn’t copy · focus this tab and retry');
                    }
                  }}
                >
                  share
                </button>
                <button
                  type="button"
                  className="x-pill x-pill--line"
                  onClick={() => go(0)}
                >
                  replay
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="story-navigation">
        <button
          type="button"
          className="textbtn"
          disabled={story === 0}
          onClick={() => go(story - 1)}
        >
          previous
        </button>
        <span>
          {stories.indexOf(story) + 1} / {stories.length}
        </span>
        <button
          type="button"
          className="textbtn"
          disabled={story === 5}
          onClick={() => go(story + 1)}
        >
          next
        </button>
      </div>
      <div className="x-past">
        <p>past streams</p>
        <div>
          {recaps.map((item, i) => (
            <button
              type="button"
              className="x-pb"
              key={item.id}
              style={{
                background: ['var(--yellow)', 'var(--teal)', 'var(--coral)'][
                  i % 3
                ],
              }}
              data-session-id={item.sessionId}
              title={`${item.channel} · ${new Date(item.createdAt).toLocaleDateString()} · ${item.totalLaughs} laughs`}
              aria-pressed={recap.id === item.id}
              aria-label={`${item.channel}, ${item.totalLaughs} laughs`}
              onClick={() => {
                setSelected(item.id);
                history.replaceState(
                  null,
                  '',
                  `?session=${encodeURIComponent(item.id)}`,
                );
                go(0);
              }}
            >
              <b>{item.channel[0]?.toUpperCase()}</b>
              <small>{item.totalLaughs}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="preview-label">
        {recap.source === 'local'
          ? `real personal reactions · ${crowdDescription}`
          : 'legacy simulated session'}{' '}
        · stored on this browser
      </p>
      {message && (
        <div className="x-toast x-glass is-on" role="status">
          {message}
        </div>
      )}
    </main>
  );
}
