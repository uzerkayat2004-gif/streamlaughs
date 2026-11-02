'use client';
import type { CrowdState, RatingsReport } from '@laughline/shared';
import { useEffect, useState } from 'react';
import { RealCrowdSource } from '../../extension/src/real-crowd-source';
import { CrowdArt } from './crowd-art';
import { FanRatings } from './fan-ratings';
export function LiveCrowd({
  api,
  channel,
  snapshot,
}: {
  api: string;
  channel: string;
  snapshot?: CrowdState;
}) {
  const [crowd, setCrowd] = useState<CrowdState | null>(snapshot ?? null);
  useEffect(() => {
    if (snapshot || !api) return;
    const source = new RealCrowdSource(api);
    source.setSharing(false);
    source.start(channel, setCrowd);
    return () => source.stop();
  }, [api, channel, snapshot]);
  const live = crowd?.state === 'live',
    few = crowd?.state === 'few',
    setupPending = !api && !snapshot;
  return (
    <section className="live-scene" aria-label="live fans">
      <div className="scene-label">
        <span className={`connection-dot ${live ? 'is-live' : ''}`} />
        {setupPending
          ? 'fan reactions setup pending'
          : snapshot
            ? 'live now · sample fans'
            : live
              ? `live${crowd.testTraffic ? ' · test traffic' : ''}`
              : few
                ? 'few people here yet'
                : 'offline'}
      </div>
      <CrowdArt calm={!live}>
        <strong
          className={live ? 'live-number' : 'calm-number'}
          aria-live="polite"
        >
          {setupPending
            ? 'soon'
            : live
              ? crowd.laughingNow
              : few
                ? 'a few'
                : 'zzz'}
        </strong>
        <span>
          {setupPending
            ? 'your fans will join after setup'
            : live
              ? crowd.laughingNow
                ? 'fans laughing right now'
                : 'waiting for the first laugh…'
              : few
                ? 'fans here, waiting for 3+'
                : 'go live and your fans show up here'}
        </span>
      </CrowdArt>
      <section className="live-words" aria-label="live fan words">
        {live &&
          crowd.topWords.map((p) => (
            <span key={p.word}>
              {p.word}
              <small>{p.count} people</small>
            </span>
          ))}
      </section>
      <p className="scene-footnote">
        {live
          ? `${crowd.laughlineViewers} fans watching with StreamLaughs · ${crowd.laughPercent}% laughing`
          : 'counts and words show up once 3+ fans are here'}
      </p>
    </section>
  );
}
export function Dashboard({
  channel,
  api,
  snapshot,
  children,
  initialTab = 'past',
  demo = false,
  ratings = null,
}: {
  channel: string;
  api: string;
  snapshot?: CrowdState;
  children: React.ReactNode;
  initialTab?: string;
  demo?: boolean;
  ratings?: RatingsReport | null;
}) {
  const [tab, setTab] = useState(initialTab === 'live' ? 'live' : 'past');
  return (
    <main className="dashboard-page streamer-home">
      <div className="dashboard-intro">
        <div>
          <h1>
            hey, <span>{channel}.</span>
          </h1>
          <p className="streamer-sub">
            {demo
              ? 'a sample streamer page with made-up fans. this is what you get after a stream.'
              : 'here’s how your fans felt. all anonymous, only you can see it.'}
          </p>
        </div>
        {demo ? (
          <span className="sn-tag">sample data</span>
        ) : (
          <form action="/auth/logout" method="post">
            <button type="submit" className="quiet-button">
              log out ↗
            </button>
          </form>
        )}
      </div>
      {!demo && !api && (
        <p className="soft-note" role="status">
          you’re signed in. fan reactions aren’t switched on yet.{' '}
          <a href="/demo">see the sample ↗</a>
        </p>
      )}
      <FanRatings initial={ratings} channel={channel} sample={demo} />
      <div
        className="dashboard-tabs"
        role="tablist"
        aria-label="dashboard view"
      >
        <button
          type="button"
          id="live-tab"
          role="tab"
          aria-selected={tab === 'live'}
          aria-controls="live-panel"
          onClick={() => setTab('live')}
        >
          live now <i />
        </button>
        <button
          type="button"
          id="past-tab"
          role="tab"
          aria-selected={tab === 'past'}
          aria-controls="past-panel"
          onClick={() => setTab('past')}
        >
          your nights
        </button>
      </div>
      {tab === 'live' ? (
        <div id="live-panel" role="tabpanel" aria-labelledby="live-tab">
          <LiveCrowd api={api} channel={channel} snapshot={snapshot} />
        </div>
      ) : (
        <div id="past-panel" role="tabpanel" aria-labelledby="past-tab">
          {children}
        </div>
      )}
      {demo && (
        <div className="download-invite">
          <p>want this for your own channel?</p>
          <a className="button yellow" href="/streamers">
            get your fan page →
          </a>
        </div>
      )}
    </main>
  );
}
