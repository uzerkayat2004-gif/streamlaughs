'use client';
import {
  RATING_REASONS,
  type RatingsReport,
  RatingsReportSchema,
  ratingColor,
} from '@laughline/shared';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

function AnimatedAverage({
  value,
  animate,
}: {
  value: number;
  animate: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate) {
      setShown(value);
      return;
    }
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 750);
        setShown(value * (1 - (1 - t) ** 3));
        if (t < 1 && !document.hidden) frame = requestAnimationFrame(tick);
        else setShown(value);
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches)
        setShown(value);
      else frame = requestAnimationFrame(tick);
    });
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, animate]);
  return (
    <strong ref={root}>
      <span aria-hidden="true">{shown.toFixed(1)}</span>
      <span className="sr-only">{value.toFixed(1)}</span>
    </strong>
  );
}
export function FanRatings({
  initial,
  channel,
  sample = false,
  animate = false,
  compact = false,
}: {
  initial: RatingsReport | null;
  channel: string;
  sample?: boolean;
  animate?: boolean;
  compact?: boolean;
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
    <section
      className={`fan-ratings-card${compact ? ' ratings-compact' : ''}`}
      aria-label="fan ratings"
    >
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
            <svg
              viewBox="0 0 100 110"
              width="90"
              height="99"
              aria-hidden="true"
            >
              <path
                d="M28 44V29a22 22 0 0 1 44 0v15"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
              />
              <rect
                x="12"
                y="40"
                width="76"
                height="65"
                rx="24"
                fill="currentColor"
              />
              <g fill="#090b10" className="smile-eyes">
                <circle cx="36" cy="65" r="4" />
                <circle cx="64" cy="65" r="4" />
              </g>
              <path
                d="M34 81Q50 94 66 81"
                fill="none"
                stroke="#090b10"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
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
              <AnimatedAverage value={result.average} animate={animate} />
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
      {!compact && !!data?.trend.length && (
        <fieldset className="ratings-trend" aria-label="last ten rated streams">
          <legend>
            your last {data.trend.length} streams · tap a night · white dot =
            under 5 fans
          </legend>
          <svg
            viewBox="0 0 1000 110"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={data.trend
                .map((s, i) =>
                  s.rating.locked
                    ? ''
                    : `${i === 0 || data.trend[i - 1]?.rating.locked ? 'M' : 'L'}${((i + 0.5) * 1000) / data.trend.length},${20 + (10 - s.rating.average) * 6}`,
                )
                .join(' ')}
              fill="none"
              stroke="#2EE6C5"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {data.trend.map((s, i) => (
            <button
              type="button"
              key={s.streamKey}
              aria-pressed={stream?.streamKey === s.streamKey}
              title={`${s.streamKey.slice(0, 10)} · ${s.rating.locked ? 'locked' : s.rating.average.toFixed(1)}`}
              onClick={() => setSelected(s.streamKey)}
              aria-label={`stream ${i + 1}, ${s.rating.locked ? 'rating locked' : `${s.rating.average.toFixed(1)} out of 10`}`}
            >
              <span
                style={{
                  top: `${s.rating.locked ? 80 : 20 + (10 - s.rating.average) * 6}px`,
                  background: s.rating.locked
                    ? '#fff'
                    : ratingColor(s.rating.average),
                }}
              />
              <small>
                {s.streamKey.includes('T')
                  ? s.streamKey.slice(5, 10).replace('-', '/')
                  : i + 1}
              </small>
            </button>
          ))}
        </fieldset>
      )}
    </section>
  );
}
