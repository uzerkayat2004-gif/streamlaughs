'use client';
import {
  ratingColor,
  RATING_REASONS,
  RatingsReportSchema,
  type RatingsReport,
} from '@laughline/shared';
import { useEffect, useState, type CSSProperties } from 'react';
export function FanRatings({
  initial,
  channel,
  sample = false,
}: {
  initial: RatingsReport | null;
  channel: string;
  sample?: boolean;
}) {
  const [data, setData] = useState(initial),
    [selected, setSelected] = useState('');
  useEffect(() => {
    setData(initial);
  }, [initial]);
  useEffect(() => {
    if (sample) return;
    const abort = new AbortController();
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/ratings/${encodeURIComponent(channel)}`, {
          cache: 'no-store',
          signal: abort.signal,
        });
        if (r.ok) setData(RatingsReportSchema.parse(await r.json()));
      } catch {}
    };
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      clearInterval(timer);
      abort.abort();
    };
  }, [sample, channel]);
  const stream =
    data?.streams.find((s) => s.streamKey === selected) ?? data?.streams[0];
  const result = stream?.rating ?? { locked: true as const, needed: 5 };
  const max = result.locked ? 1 : Math.max(1, ...result.histogram);
  return (
    <section className="fan-ratings-card" aria-label="fan ratings">
      <header>
        <div>
          <h2>fan ratings</h2>
          <p>real reviews from your own fans, not random people.</p>
        </div>
        {sample && <span className="test-tag">sample</span>}
      </header>
      {!data ? (
        <p className="ratings-empty">
          ratings are taking a breather. try again shortly.
        </p>
      ) : result.locked ? (
        <div className="ratings-locked" role="status">
          <span className="padlock-face" aria-hidden="true">
            ⌑<i>◡</i>
          </span>
          <h3>
            {result.needed} more {result.needed === 1 ? 'fan' : 'fans'} to
            unlock tonight’s rating.
          </h3>
          <p>only you see the average. always anonymous.</p>
        </div>
      ) : (
        <div className="ratings-details">
          <div
            className="rating-ring"
            style={
              {
                '--rating-color': ratingColor(result.average),
                '--rating-turn': `${result.average * 10}%`,
              } as CSSProperties
            }
          >
            <div>
              <strong>{result.average.toFixed(1)}</strong>
              <span>out of 10</span>
            </div>
          </div>
          <div className="rating-breakdown">
            <p>
              <b>{result.count.toLocaleString()}</b> fans rated
            </p>
            <section
              className="rating-histogram"
              aria-label="rating distribution"
            >
              {result.histogram.map((n, i) => (
                <div key={i + 1} title={`${i + 1}: ${n} fans`}>
                  <span
                    style={{
                      height: `${Math.max(2, (n / max) * 76)}px`,
                      background: ratingColor(i + 1),
                    }}
                  />
                  <small>{i + 1}</small>
                  <span className="sr-only">{n} fans</span>
                </div>
              ))}
            </section>
            <div className="rating-top-reasons">
              {result.topReasons.slice(0, 3).map((r) => (
                <span key={r.id}>
                  {RATING_REASONS[r.id]} <b>{r.percent}%</b>
                </span>
              ))}
            </div>
            <p className="rating-summary">{result.summary}</p>
          </div>
        </div>
      )}
      {!!data?.trend.length && (
        <fieldset className="ratings-trend" aria-label="last ten rated streams">
          {data.trend.map((s, i) => (
            <button
              type="button"
              key={s.streamKey}
              aria-pressed={stream?.streamKey === s.streamKey}
              title={s.streamKey}
              onClick={() => setSelected(s.streamKey)}
              aria-label={`stream ${i + 1}, ${s.rating.locked ? 'rating locked' : `${s.rating.average.toFixed(1)} out of 10`}`}
            >
              <span
                style={{
                  height: `${s.rating.locked ? 10 : s.rating.average * 5}px`,
                  background: s.rating.locked
                    ? '#fff'
                    : ratingColor(s.rating.average),
                }}
              />
              <small>{i + 1}</small>
            </button>
          ))}
        </fieldset>
      )}
    </section>
  );
}
