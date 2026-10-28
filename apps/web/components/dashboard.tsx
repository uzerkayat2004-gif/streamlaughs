'use client';
import type { CrowdState } from '@laughline/shared';
import { useEffect, useState } from 'react';
import { RealCrowdSource } from '../../extension/src/real-crowd-source';
import { CrowdArt } from './crowd-art';
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
    if (snapshot) return;
    const source = new RealCrowdSource(api);
    source.setSharing(false);
    source.start(channel, setCrowd);
    return () => source.stop();
  }, [api, channel, snapshot]);
  const live = crowd?.state === 'live',
    few = crowd?.state === 'few';
  return (
    <section className="live-scene" aria-label="live crowd">
      <div className="scene-label">
        <span className={`connection-dot ${live ? 'is-live' : ''}`} />
        {snapshot
          ? 'recorded test snapshot'
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
          {live ? crowd.laughingNow : few ? 'a few here' : 'offline'}
        </strong>
        <span>
          {live
            ? 'laughing right now'
            : few
              ? 'a little room, for now'
              : 'we’ll reconnect when we can'}
        </span>
      </CrowdArt>
      <section className="live-words" aria-label="live crowd words">
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
          ? `${crowd.laughPercent}% of ${crowd.laughlineViewers} sharing · top word: ${crowd.topWords[0]?.word ?? '—'}`
          : 'counts and words appear with 3+ people sharing'}
      </p>
    </section>
  );
}
export function Dashboard({
  channel,
  api,
  snapshot,
  children,
  initialTab = 'live',
  demo = false,
}: {
  channel: string;
  api: string;
  snapshot?: CrowdState;
  children: React.ReactNode;
  initialTab?: string;
  demo?: boolean;
}) {
  const [tab, setTab] = useState(initialTab === 'past' ? 'past' : 'live');
  return (
    <main className="dashboard-page">
      <div className="dashboard-intro">
        <div>
          <p className="eyebrow">
            {demo
              ? 'a peek inside · simulated contributors'
              : 'your people. your little universe.'}
          </p>
          <h1>
            {demo ? (
              'a night with the crowd.'
            ) : (
              <>
                hey, <span>{channel}.</span>
              </>
            )}
          </h1>
        </div>
        {demo ? (
          <span className="test-tag">demo · test data</span>
        ) : (
          <form action="/auth/logout" method="post">
            <button type="submit" className="quiet-button">
              log out ↗
            </button>
          </form>
        )}
      </div>
      {demo && (
        <p className="soft-note">
          Recorded aggregates from real local crowd-sim API traffic. Simulated
          people, clearly marked. No Twitch login needed.
        </p>
      )}
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
          live <i />
        </button>
        <button
          type="button"
          id="past-tab"
          role="tab"
          aria-selected={tab === 'past'}
          aria-controls="past-panel"
          onClick={() => setTab('past')}
        >
          past streams
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
    </main>
  );
}
