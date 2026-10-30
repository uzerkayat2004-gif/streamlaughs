import { type CrowdState, PRODUCT, visibleWords } from '@laughline/shared';
import { X } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppIcon } from './AppIcon';

export function crowdLabel(crowd: CrowdState | null) {
  if (crowd?.source === 'fake') return 'test fans · 3+ people';
  if (crowd?.state === 'live')
    return crowd.testTraffic ? 'live · test traffic' : 'live';
  return crowd?.state === 'few' ? 'waiting for fans' : 'offline';
}

export function Mark() {
  return (
    <div className="mark">
      <AppIcon size={24} />
      <b className="text-wordmark">{PRODUCT.wordmark}</b>
    </div>
  );
}
export function Backdrop() {
  return (
    <div className="bg" aria-hidden="true">
      <div className="blobbg bg1" />
      <div className="blobbg bg2" />
      <div className="grain" />
    </div>
  );
}
export function Wave({ big = false }: { big?: boolean }) {
  return (
    <span className={big ? 'bigwave' : 'wave'} aria-hidden="true">
      {Array.from({ length: big ? 15 : 5 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 0.13}s` }} />
      ))}
    </span>
  );
}
export function RollingNumber({
  value,
  compact = false,
}: {
  value: number;
  compact?: boolean;
}) {
  const height = compact ? 52 : 78;
  return (
    <div
      className={compact ? 'x-croll' : 'roll'}
      role="img"
      aria-label={`${value} people laughing right now`}
    >
      {String(value)
        .split('')
        .map((digit, i) => (
          <div className={compact ? 'x-cdigit' : 'digit'} key={i}>
            <div
              className="dcol"
              style={{ transform: `translateY(-${Number(digit) * height}px)` }}
            >
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
function blobPath(time: number, amplitude: number) {
  const points = Array.from({ length: 9 }, (_, i) => {
    const angle = (i / 9) * Math.PI * 2;
    const r =
      92 * (1 + Math.sin(time * 1.6) * 0.035) +
      Math.sin(time * 1.3 + i * 1.7) * amplitude +
      Math.cos(time * 0.9 + i * 2.3) * amplitude * 0.6;
    return { x: 120 + Math.cos(angle) * r, y: 120 + Math.sin(angle) * r };
  });
  let d = `M${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < 9; i++) {
    const a = points[(i + 8) % 9]!,
      b = points[i]!,
      c = points[(i + 1) % 9]!,
      e = points[(i + 2) % 9]!;
    d += `C${b.x + (c.x - a.x) / 6},${b.y + (c.y - a.y) / 6} ${c.x - (e.x - b.x) / 6},${c.y - (e.y - b.y) / 6} ${c.x},${c.y}`;
  }
  return `${d}Z`;
}
export function Blob({
  count = 47,
  compact = false,
  decorative = false,
  paused = false,
  crowd,
}: {
  count?: number;
  compact?: boolean;
  decorative?: boolean;
  paused?: boolean;
  crowd?: CrowdState | null;
}) {
  const path = useRef<SVGPathElement>(null);
  const speed = count > 100 ? 2.4 : count < 3 ? 0.4 : 1;
  const amplitude = count > 100 ? 18 : 11;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      time = 0,
      last = performance.now();
    const tick = (now: number) => {
      time += (Math.min(50, now - last) / 1000) * speed;
      last = now;
      path.current?.setAttribute('d', blobPath(time, amplitude));
      if (!media.matches && !paused) frame = requestAnimationFrame(tick);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      tick(performance.now());
    };
    restart();
    media.addEventListener('change', restart);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', restart);
    };
  }, [speed, amplitude, paused]);
  return (
    <div
      className={`${compact ? 'x-cblob' : 'blobwrap'} ${paused ? 'is-paused' : ''}`}
      style={
        {
          '--blob-scale': count > 100 ? 1.08 : count < 3 ? 0.82 : 1,
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <path className="blobpath" ref={path} d={blobPath(0, 11)} />
      </svg>
      {!compact && (
        <div className="orbit" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${50 + Math.cos((i / 7) * Math.PI * 2) * 50}%`,
                top: `${50 + Math.sin((i / 7) * Math.PI * 2) * 50}%`,
              }}
            />
          ))}
        </div>
      )}
      {!decorative && (
        <div className="count">
          {crowd !== undefined &&
          crowd?.source !== 'fake' &&
          crowd?.state !== 'live' ? (
            <>
              <strong className="crowd-calm">
                {crowd?.state === 'few' ? 'a few here' : 'offline'}
              </strong>
              <p>
                {crowd?.state === 'few'
                  ? 'waiting for fans'
                  : 'reconnecting when available'}
              </p>
            </>
          ) : (
            <>
              <RollingNumber value={count} compact={compact} />
              <p>laughing right now</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
export function Words({
  crowd,
  compact = false,
}: {
  crowd: CrowdState | null;
  compact?: boolean;
}) {
  return (
    <section className={compact ? 'x-cwords' : 'words'} aria-label="fan words">
      {(crowd?.source === 'fake' || crowd?.state === 'live'
        ? visibleWords(crowd).filter(
            (w) => crowd?.source === 'fake' || w.word !== '—',
          )
        : []
      ).map(({ word, count }, i) => (
        <span
          className="word"
          key={word}
          style={{
            fontSize: Math.min(
              compact ? 26 : 38,
              13 + Math.sqrt(count) * (compact ? 1.5 : 2.6),
            ),
            animationDelay: `0s,${0.5 + i * 0.7}s`,
            ...(!compact
              ? [
                  { left: '1%', top: '8%' },
                  { right: '0%', top: '67%' },
                  { left: '2%', top: '72%' },
                ][i]
              : {}),
          }}
        >
          {word}
          <b>{count} people</b>
        </span>
      ))}
    </section>
  );
}
export function YouPill({
  count,
  paused = false,
}: {
  count: number;
  paused?: boolean;
}) {
  const previous = useRef(count),
    [pop, setPop] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (count > previous.current) {
      setPop(true);
      timer = setTimeout(() => setPop(false), 1400);
    }
    previous.current = count;
    return () => clearTimeout(timer);
  }, [count]);
  return (
    <div className={`youwrap ${paused ? 'is-paused' : ''}`}>
      <div className="you">
        <Wave />
        you · {count} laughs
      </div>
      {pop && (
        <span className="plusone" key={count}>
          +1
        </span>
      )}
    </div>
  );
}
export function Timer({ start }: { start: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="timer">
      {formatTime(Math.max(0, Math.floor((now - start) / 1000)))}
    </span>
  );
}
export function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  return `${h ? `${h}:` : ''}${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}
export function CountUp({
  value,
  format,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, now - start) / 240);
      setDisplay(Math.round(value * (1 - (1 - progress) ** 4)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <>{format ? format(display) : display.toLocaleString('en-US')}</>;
}
export function Sheet({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <>
      <button
        type="button"
        className="scrim"
        aria-label="close sheet"
        tabIndex={-1}
        onClick={close}
      />
      <div
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
          if (event.key === 'Tab') {
            const buttons = [
              ...sheet.current!.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled), a[href]',
              ),
            ];
            const first = buttons[0],
              last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h2>{title}</h2>
        <button
          type="button"
          className="iconbtn x"
          aria-label="close"
          onClick={close}
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </>
  );
}
export function Toggle({
  title,
  detail,
  on,
  click,
}: {
  title: string;
  detail?: string;
  on: boolean;
  click: () => void;
}) {
  return (
    <button type="button" className="toggle" aria-pressed={on} onClick={click}>
      <p>
        {title}
        {detail && <small>{detail}</small>}
      </p>
      <span className="sw" />
    </button>
  );
}
export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: ['var(--yellow)', 'var(--teal)', 'var(--ink)'][i % 3],
            animationDelay: `${(i % 8) * 0.07}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}
