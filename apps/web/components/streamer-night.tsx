'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { StreamStory } from '../lib/stories';
import {
  ratingTone,
  ratingWord,
  type StreamerRatings,
} from '../lib/streamer-ratings';
import './streamer-night.css';

const SITE = 'streamlaughs.vercel.app';

function day(ts: number) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(ts);
}
function clock(ts: number) {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(ts);
}
function hms(seconds: number) {
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
}
function length(stream: StreamStory) {
  const mins = Math.max(1, Math.round((stream.end - stream.start) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

/** Counts up once when it scrolls into view. */
function CountUp({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setV(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100);
        setV(to * (1 - (1 - k) ** 3));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);
  return (
    <span ref={ref}>
      {decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en')}
    </span>
  );
}

function Face({
  mood = 'laugh',
}: {
  mood?: 'laugh' | 'meh' | 'sad' | 'sleep';
}) {
  const mouth =
    mood === 'laugh'
      ? 'M28 58q22 26 44 0z'
      : mood === 'meh'
        ? 'M32 64h36'
        : mood === 'sad'
          ? 'M32 70q18-14 36 0'
          : 'M40 66q10 6 20 0';
  return (
    <svg viewBox="0 0 100 100" className="sn-face" aria-hidden="true">
      {mood === 'sleep' ? (
        <path d="M26 42q8 6 16 0M58 42q8 6 16 0" />
      ) : (
        <>
          <circle cx="34" cy="40" r="6" />
          <circle cx="66" cy="40" r="6" />
        </>
      )}
      <path d={mouth} className={mood === 'laugh' ? 'fill' : ''} />
    </svg>
  );
}

function Wave({ values }: { values: number[] }) {
  const levels = values.length === 1 ? [values[0]!, values[0]!] : values;
  const max = Math.max(1, ...levels);
  const pts = levels.map((n, i) => [
    (i / Math.max(1, levels.length - 1)) * 1000,
    190 - (n / max) * 160,
  ]);
  let d = pts[0] ? `M${pts[0][0]},${pts[0][1]}` : '';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!,
      mid = (a[0]! + b[0]!) / 2;
    d += ` C${mid},${a[1]} ${mid},${b[1]} ${b[0]},${b[1]}`;
  }
  return (
    <svg
      className="sn-wave"
      viewBox="0 0 1000 200"
      preserveAspectRatio="none"
      role="img"
      aria-label="how loud the laughs got across the stream"
    >
      <defs>
        <linearGradient id="sn-wave-line">
          <stop stopColor="#2EE6C5" />
          <stop offset=".55" stopColor="#FFD23F" />
          <stop offset="1" stopColor="#FF5C5C" />
        </linearGradient>
        <linearGradient id="sn-wave-fill" x2="0" y2="1">
          <stop stopColor="#FFD23F" stopOpacity=".28" />
          <stop offset="1" stopColor="#FFD23F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L1000 200 L0 200 Z`} fill="url(#sn-wave-fill)" />
      <path
        d={d}
        fill="none"
        stroke="url(#sn-wave-line)"
        strokeWidth="6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function RatingRing({ average }: { average: number }) {
  const tone = ratingTone(average);
  const r = 74,
    c = 2 * Math.PI * r;
  return (
    <div className={`sn-ring tone-${tone}`}>
      <svg viewBox="0 0 180 180" aria-hidden="true">
        <circle cx="90" cy="90" r={r} className="track" />
        <circle
          cx="90"
          cy="90"
          r={r}
          className="fill"
          strokeDasharray={c}
          style={{ '--off': c * (1 - average / 10) } as React.CSSProperties}
        />
      </svg>
      <div>
        <strong>
          <CountUp to={average} decimals={1} />
        </strong>
        <small>out of 10</small>
      </div>
    </div>
  );
}

function RatingTile({ ratings }: { ratings?: StreamerRatings | null }) {
  if (!ratings)
    return (
      <article className="sn-tile sn-rate is-empty">
        <p className="sn-kicker">fan rating</p>
        <Face mood="sleep" />
        <h3>ratings start next stream.</h3>
        <p>after a stream, your fans can rate it 1 to 10 in their recap.</p>
      </article>
    );
  if (ratings.locked)
    return (
      <article className="sn-tile sn-rate is-locked">
        <p className="sn-kicker">fan rating</p>
        <div className="sn-lock" aria-hidden="true">
          <Face mood="meh" />
        </div>
        <h3>
          {ratings.needed} more {ratings.needed === 1 ? 'fan' : 'fans'} to
          unlock tonight's rating.
        </h3>
        <p>we wait for 5+ fans so nobody can be singled out.</p>
      </article>
    );
  const max = Math.max(1, ...ratings.histogram);
  return (
    <article className={`sn-tile sn-rate tone-${ratingTone(ratings.average)}`}>
      <div className="sn-rate-top">
        <div>
          <p className="sn-kicker">your fans rated tonight</p>
          <h3>{ratingWord(ratings.average)}.</h3>
          <p className="sn-sub">
            <b>
              <CountUp to={ratings.count} />
            </b>{' '}
            fans rated · anonymous
          </p>
        </div>
        <RatingRing average={ratings.average} />
      </div>
      <div
        className="sn-hist"
        role="img"
        aria-label="how many fans gave each score"
      >
        {ratings.histogram.map((n, i) => (
          <div key={i} className={`bar tone-${ratingTone(i + 1)}`}>
            <i
              style={
                {
                  '--h': `${Math.max(4, (n / max) * 100)}%`,
                } as React.CSSProperties
              }
            />
            <span>{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="sn-reasons">
        {ratings.reasons.slice(0, 4).map((r) => (
          <span key={r.id}>
            {r.label} <b>{r.percent}%</b>
          </span>
        ))}
      </div>
      <p className="sn-summary">“{ratings.summary}”</p>
    </article>
  );
}

function TrendTile({ ratings }: { ratings: StreamerRatings }) {
  if (ratings.locked || ratings.trend.length < 2) return null;
  const t = ratings.trend,
    first = t[0]!.average,
    last = t.at(-1)!.average,
    diff = last - first;
  return (
    <article className="sn-tile sn-trend">
      <p className="sn-kicker">your last {t.length} streams</p>
      <h3>
        {diff >= 0 ? 'climbing' : 'dipping'}{' '}
        <span className={diff >= 0 ? 'up' : 'down'}>
          {diff >= 0 ? '+' : ''}
          {diff.toFixed(1)}
        </span>
      </h3>
      <div className="sn-dots">
        {t.map((p, i) => (
          <div key={p.label} className={i === t.length - 1 ? 'is-now' : ''}>
            <i
              className={`tone-${ratingTone(p.average)}`}
              style={
                {
                  '--py': `${(1 - (p.average - 4) / 6) * 100}%`,
                } as React.CSSProperties
              }
            >
              <b>{p.average.toFixed(1)}</b>
            </i>
            <span>{p.label}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

type CardData = {
  channel: string;
  date: string;
  peak: number;
  length: string;
  moment: string;
  word: string;
  rating: { average: number; count: number } | null;
  reason: string | null;
};

function drawCard(canvas: HTMLCanvasElement, d: CardData) {
  const W = 1080,
    H = 1350,
    ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;
  const font =
    getComputedStyle(document.querySelector('h1') ?? document.body)
      .fontFamily || 'sans-serif';
  const body = getComputedStyle(document.body).fontFamily || 'sans-serif';
  ctx.fillStyle = '#0b0c11';
  ctx.fillRect(0, 0, W, H);
  // colour blobs
  const blob = (x: number, y: number, r: number, c: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  blob(900, 160, 520, '#FFD23F55');
  blob(120, 1250, 560, '#2EE6C540');
  blob(1000, 1150, 380, '#FF5C5C38');
  // smiley icon
  const sq = (x: number, y: number, s: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, s, s, r);
  };
  sq(80, 80, 92, 26);
  ctx.fillStyle = '#FFD23F';
  ctx.fill();
  ctx.fillStyle = '#14141A';
  ctx.beginPath();
  ctx.arc(108, 118, 7, 0, Math.PI * 2);
  ctx.arc(144, 118, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(100, 136);
  ctx.quadraticCurveTo(126, 168, 152, 136);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#F4F2ED';
  ctx.font = `700 40px ${font}`;
  ctx.fillText('streamlaughs', 196, 128);
  ctx.fillStyle = '#A1A5AF';
  ctx.font = `500 26px ${body}`;
  ctx.fillText('laugh track', 198, 164);
  // title
  ctx.fillStyle = '#F4F2ED';
  ctx.font = `800 92px ${font}`;
  ctx.fillText(`${d.channel}'s`, 80, 330);
  ctx.fillText('night.', 80, 428);
  ctx.fillStyle = '#A1A5AF';
  ctx.font = `500 30px ${body}`;
  ctx.fillText(`${d.date} · ${d.length} live`, 84, 486);
  // hero tile
  const hero = d.rating
    ? {
        big: d.rating.average.toFixed(1),
        small: '/10',
        line: `${d.rating.count.toLocaleString('en')} fans rated the stream`,
        color: { coral: '#FF5C5C', yellow: '#FFD23F', teal: '#2EE6C5' }[
          ratingTone(d.rating.average)
        ],
      }
    : {
        big: String(d.peak),
        small: '',
        line: 'fans laughing at the same time',
        color: '#FFD23F',
      };
  ctx.beginPath();
  ctx.roundRect(80, 550, 920, 330, 48);
  ctx.fillStyle = hero.color;
  ctx.fill();
  ctx.fillStyle = '#14141A';
  ctx.font = `800 200px ${font}`;
  ctx.fillText(hero.big, 128, 770);
  const bw = ctx.measureText(hero.big).width;
  ctx.font = `800 64px ${font}`;
  ctx.fillText(hero.small, 140 + bw, 770);
  ctx.font = `600 34px ${body}`;
  ctx.fillText(hero.line, 132, 836);
  // stat chips
  const chips: [string, string, string][] = [
    [String(d.peak), 'laughing at once', '#2EE6C5'],
    [d.moment, 'funniest moment', '#FF5C5C'],
    [d.word, 'top fan word', '#FFD23F'],
  ];
  if (!d.rating) chips[0] = [d.length, 'of laughs', '#2EE6C5'];
  chips.forEach(([big, small, c], i) => {
    const x = 80 + i * 313,
      y = 920;
    ctx.beginPath();
    ctx.roundRect(x, y, 294, 200, 36);
    ctx.fillStyle = '#ffffff10';
    ctx.fill();
    ctx.strokeStyle = `${c}66`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = c;
    let size = 64;
    ctx.font = `800 ${size}px ${font}`;
    while (ctx.measureText(big).width > 250 && size > 30) {
      size -= 4;
      ctx.font = `800 ${size}px ${font}`;
    }
    ctx.fillText(big, x + 28, y + 104);
    ctx.fillStyle = '#C9CCD3';
    ctx.font = `500 26px ${body}`;
    ctx.fillText(small, x + 28, y + 158);
  });
  if (d.reason) {
    ctx.fillStyle = '#F4F2ED';
    ctx.font = `600 32px ${body}`;
    ctx.fillText(`fans said: ${d.reason}`, 84, 1196);
  }
  ctx.fillStyle = '#A1A5AF';
  ctx.font = `500 26px ${body}`;
  ctx.fillText(`anonymous fan reactions · ${SITE}`, 84, 1270);
}

function ShareCard({ data, onClose }: { data: CardData; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (ref.current) drawCard(ref.current, data);
  }, [data]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const caption = data.rating
    ? `my fans rated tonight's stream ${data.rating.average.toFixed(1)}/10 💛 ${data.peak} of you laughing at once. thanks for hanging out! via ${SITE}`
    : `${data.peak} of you laughing at the same time tonight 💛 top word: ${data.word}. via ${SITE}`;
  const download = () => {
    const a = document.createElement('a');
    a.download = `${data.channel}-streamlaughs.png`;
    a.href = ref.current?.toDataURL('image/png') ?? '';
    a.click();
  };
  return (
    <div
      className="sn-modal"
      role="dialog"
      aria-modal="true"
      aria-label="your share card"
    >
      <button
        type="button"
        className="sn-backdrop"
        aria-label="close"
        onClick={onClose}
      />
      <div className="sn-modal-box">
        <canvas ref={ref} width={1080} height={1350} />
        <div className="sn-modal-side">
          <p className="sn-kicker">share your night</p>
          <h3>show your fans how it went.</h3>
          <p>made on your computer. post it on X, Discord or your stories.</p>
          <button type="button" className="sn-pill yellow" onClick={download}>
            download image
          </button>
          <button
            type="button"
            className="sn-pill ghost"
            onClick={() => {
              navigator.clipboard?.writeText(caption);
              setCopied(true);
            }}
          >
            {copied ? 'caption copied ✓' : 'copy caption'}
          </button>
          <a
            className="sn-pill ghost"
            target="_blank"
            rel="noreferrer"
            href={`https://x.com/intent/post?text=${encodeURIComponent(caption)}`}
          >
            post on X ↗
          </a>
          <button
            type="button"
            className="sn-close"
            onClick={onClose}
            aria-label="close"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export function StreamerNight({
  streams,
  ratings,
  channel,
  demo = false,
}: {
  streams: StreamStory[];
  ratings?: StreamerRatings | null;
  channel: string;
  demo?: boolean;
}) {
  const [pick, setPick] = useState(0);
  const [sharing, setSharing] = useState(false);
  const stream = streams[pick];
  const card = useMemo<CardData | null>(() => {
    if (!stream) return null;
    const top = stream.moments[0];
    return {
      channel,
      date: day(stream.start),
      peak: stream.peak,
      length: length(stream),
      moment: top ? (top.vod ? hms(top.vod.seconds) : clock(top.ts)) : '—',
      word: stream.words[0] ?? 'haha',
      rating:
        pick === 0 && ratings && !ratings.locked
          ? { average: ratings.average, count: ratings.count }
          : null,
      reason:
        pick === 0 && ratings && !ratings.locked
          ? (ratings.reasons[0]?.label ?? null)
          : null,
    };
  }, [stream, channel, ratings, pick]);
  if (!stream || !card)
    return (
      <div className="sn-empty">
        <Face mood="sleep" />
        <h2>your next stream is a new story.</h2>
        <p>once 3+ fans laugh along, your night shows up here.</p>
      </div>
    );
  const top = stream.moments[0];
  return (
    <section className="sn" aria-label="your stream recap">
      {streams.length > 1 && (
        <div className="sn-picker" role="tablist" aria-label="pick a stream">
          {streams.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === pick}
              onClick={() => setPick(i)}
            >
              {i === 0 ? 'latest' : day(s.start)}
            </button>
          ))}
        </div>
      )}
      <header className="sn-head">
        <div>
          <p className="sn-kicker">
            {day(stream.start)} · {length(stream)} live
            {stream.test && (
              <span className="sn-tag">{demo ? 'sample' : 'test'}</span>
            )}
          </p>
          <h2>
            your night, <span>in laughs.</span>
          </h2>
        </div>
        <button
          type="button"
          className="sn-pill yellow"
          onClick={() => setSharing(true)}
        >
          share my night ↗
        </button>
      </header>

      <div className="sn-grid">
        <article className="sn-tile sn-peak">
          <p className="sn-kicker">at the peak</p>
          <strong>
            <CountUp to={stream.peak} />
          </strong>
          <h3>fans laughing at the same time.</h3>
          <Face />
        </article>

        <RatingTile ratings={pick === 0 ? ratings : null} />

        <article className="sn-tile sn-moment">
          <p className="sn-kicker">the moment that got everyone</p>
          <strong>
            {top ? (top.vod ? hms(top.vod.seconds) : clock(top.ts)) : '—'}
          </strong>
          <h3>
            {top
              ? `${top.laughingNow} fans cracked up at once.`
              : 'no big moment yet.'}
          </h3>
          {top?.vod ? (
            <a
              className="sn-pill dark"
              href={top.vod.url}
              target="_blank"
              rel="noreferrer"
            >
              watch it ↗
            </a>
          ) : (
            <span className="sn-note">
              clip link shows when your VOD is saved
            </span>
          )}
        </article>

        <article className="sn-tile sn-words">
          <p className="sn-kicker">what your fans kept saying</p>
          <div className="sn-jelly">
            {(stream.words.length ? stream.words : ['haha'])
              .slice(0, 5)
              .map((w, i) => (
                <span
                  key={w}
                  className={`j${i % 3}`}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  {w}
                </span>
              ))}
          </div>
        </article>

        <article className="sn-tile sn-wavetile">
          <div className="sn-wave-head">
            <p className="sn-kicker">the whole night</p>
            <span>
              {stream.moments.length} big laugh{' '}
              {stream.moments.length === 1 ? 'moment' : 'moments'}
            </span>
          </div>
          <Wave values={stream.wave} />
          <div className="sn-wave-foot">
            <span>{clock(stream.start)}</span>
            <span>{clock(stream.end)}</span>
          </div>
        </article>

        {pick === 0 && ratings && <TrendTile ratings={ratings} />}

        {stream.moments.length > 1 && (
          <article className="sn-tile sn-more">
            <p className="sn-kicker">more moments</p>
            <ol>
              {stream.moments.slice(1).map((m) => (
                <li key={m.ts}>
                  <b>{m.vod ? hms(m.vod.seconds) : clock(m.ts)}</b>
                  <span>{m.laughingNow} laughing</span>
                  {m.words[0] && <i>{m.words[0]}</i>}
                  {m.vod && (
                    <a href={m.vod.url} target="_blank" rel="noreferrer">
                      ↗
                    </a>
                  )}
                </li>
              ))}
            </ol>
          </article>
        )}
      </div>
      <p className="sn-privacy">
        only you see this. every number is anonymous and needs 3+ fans (5+ for
        ratings).
      </p>
      {sharing && <ShareCard data={card} onClose={() => setSharing(false)} />}
    </section>
  );
}
