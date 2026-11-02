'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function Smile({
  tone = 'teal',
  expression = 'happy',
}: {
  tone?: string;
  expression?: string;
}) {
  const id = useId();
  const color =
    tone === 'yellow' ? '#FFD23F' : tone === 'coral' ? '#FF5C5C' : '#2EE6C5';
  const deep =
    tone === 'yellow' ? '#E8A90C' : tone === 'coral' ? '#D9343E' : '#13B597';
  const blush = tone === 'coral' ? '#FFB3BC' : '#FF8FA3';
  return (
    <svg
      className="smile-svg"
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id} cx=".32" cy=".2" r=".9">
          <stop stopColor="#ffffff" stopOpacity=".95" />
          <stop offset=".28" stopColor={color} stopOpacity=".98" />
          <stop offset=".78" stopColor={color} />
          <stop offset="1" stopColor={deep} />
        </radialGradient>
        <radialGradient id={`${id}-rim`} cx=".5" cy=".95" r=".6">
          <stop stopColor="#ffffff" stopOpacity=".35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <ellipse
        cx="120"
        cy="232"
        rx="78"
        ry="8"
        fill="#000"
        opacity=".35"
        filter={`url(#${id}-soft)`}
      />
      <path
        d="M120 14C174 8 224 55 226 111C235 169 190 223 132 226C77 236 20 198 14 139C4 77 54 17 120 14Z"
        fill={`url(#${id})`}
      />
      <path
        d="M120 14C174 8 224 55 226 111C235 169 190 223 132 226C77 236 20 198 14 139C4 77 54 17 120 14Z"
        fill={`url(#${id}-rim)`}
      />
      <ellipse
        cx="78"
        cy="52"
        rx="30"
        ry="15"
        fill="#fff"
        opacity=".55"
        transform="rotate(-28 78 52)"
        filter={`url(#${id}-soft)`}
      />
      <ellipse
        cx="66"
        cy="58"
        rx="9"
        ry="5"
        fill="#fff"
        opacity=".9"
        transform="rotate(-30 66 58)"
      />
      <g className="smile-cheeks" fill={blush} opacity=".7">
        <ellipse cx="60" cy="128" rx="16" ry="9" />
        <ellipse cx="180" cy="128" rx="16" ry="9" />
      </g>
      <g className="smile-eyes" fill="#090b10">
        {expression === 'squint' ? (
          <path
            d="M68 92Q80 80 92 92M148 92Q160 80 172 92"
            fill="none"
            stroke="#090b10"
            strokeWidth="9"
            strokeLinecap="round"
          />
        ) : (
          <>
            <ellipse cx="81" cy="92" rx="7" ry="11" />
            <ellipse cx="159" cy="92" rx="7" ry="11" />
          </>
        )}
      </g>
      <path
        className="smile-closed"
        d={
          expression === 'sad'
            ? 'M75 158Q120 116 165 158'
            : expression === 'meh'
              ? 'M78 150H162'
              : expression === 'cheeky'
                ? 'M74 139Q123 181 172 132'
                : 'M68 135Q120 194 172 135'
        }
        stroke="#090b10"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <g className="smile-open">
        <path
          d="M67 134Q120 150 173 134C170 193 75 197 67 134Z"
          fill="#090b10"
        />
        <path d="M90 174Q120 158 151 175Q123 191 90 174" fill="#FF5C5C" />
      </g>
    </svg>
  );
}
type Engine = {
  grab: (event: React.PointerEvent<HTMLButtonElement>) => void;
  key: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  reset: () => void;
};

function Plaything({
  label,
  kind = 'chip',
  tone = 'teal',
  expression,
  reset,
}: {
  label: string;
  kind?: 'chip' | 'face' | 'spark';
  tone?: string;
  expression?: string;
  reset: number;
}) {
  const home = useRef<HTMLDivElement>(null),
    item = useRef<HTMLButtonElement>(null);
  const engine = useRef<Engine | null>(null),
    moved = useRef(false);
  const [placed, setPlaced] = useState(false),
    [laughing, setLaughing] = useState(false);
  const laughTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const position = useRef({ x: 0, y: 0, width: 0, height: 0 });
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0,
      active = false,
      detached = false,
      returning = false,
      pointer = -1;
    let offsetX = 0,
      offsetY = 0,
      lastX = 0,
      lastY = 0,
      lastTime = 0,
      vx = 0,
      vy = 0;
    let sx = 1,
      sy = 1,
      svx = 0,
      svy = 0,
      tx = 1,
      ty = 1,
      eyeX = 0,
      eyeY = 0,
      width = 0,
      height = 0,
      previous = 0;
    const bound = (n: number, min: number, max: number) =>
      Math.max(min, Math.min(Math.max(min, max), n));
    const stopCapture = () => {
      if (pointer >= 0 && document.documentElement.hasPointerCapture(pointer))
        document.documentElement.releasePointerCapture(pointer);
      pointer = -1;
      delete document.documentElement.dataset.dragging;
    };
    const tick = (now: number) => {
      if (document.hidden) {
        raf = 0;
        previous = 0;
        return;
      }
      const dt = Math.min(2, (now - (previous || now - 16)) / 16.67);
      previous = now;
      const p = position.current;
      if (active) {
        const scroll =
          lastY < 85
            ? -(85 - lastY) / 5
            : lastY > innerHeight - 85
              ? (lastY - innerHeight + 85) / 5
              : 0;
        if (scroll) window.scrollBy({ top: scroll * dt, behavior: 'instant' });
        p.x = lastX + scrollX - offsetX;
        p.y = lastY + scrollY - offsetY;
      } else if (returning && home.current) {
        const bounds = home.current.getBoundingClientRect(),
          x = bounds.left + scrollX,
          y = bounds.top + scrollY;
        vx = (vx + (x - p.x) * 0.035 * dt) * 0.76;
        vy = (vy + (y - p.y) * 0.035 * dt) * 0.76;
        if (
          reduce.matches ||
          (Math.hypot(x - p.x, y - p.y) < 1 && Math.hypot(vx, vy) < 0.6)
        ) {
          returning = detached = false;
          setPlaced(false);
          vx = vy = 0;
        }
        p.x += vx * dt;
        p.y += vy * dt;
      } else if (detached) {
        p.x += vx * dt;
        p.y += vy * dt;
        vx *= 0.91 ** dt;
        vy *= 0.91 ** dt;
      }
      if (detached) {
        p.x = bound(p.x, 8, document.documentElement.clientWidth - width - 8);
        p.y = bound(p.y, 8, document.documentElement.scrollHeight - height - 8);
        item.current?.style.setProperty('--toy-x', `${p.x}px`);
        item.current?.style.setProperty('--toy-y', `${p.y}px`);
      }
      if (reduce.matches) {
        sx = sy = 1;
        svx = svy = 0;
      } else {
        svx = (svx + (tx - sx) * 0.16 * dt) * 0.72;
        svy = (svy + (ty - sy) * 0.16 * dt) * 0.72;
        sx += svx * dt;
        sy += svy * dt;
      }
      item.current?.style.setProperty('--squash-x', String(sx));
      item.current?.style.setProperty('--squash-y', String(sy));
      item.current?.style.setProperty(
        '--eye-x',
        `${reduce.matches ? 0 : eyeX}px`,
      );
      item.current?.style.setProperty(
        '--eye-y',
        `${reduce.matches ? 0 : eyeY}px`,
      );
      if (
        active ||
        returning ||
        Math.abs(vx) + Math.abs(vy) > 0.15 ||
        Math.abs(tx - sx) + Math.abs(ty - sy) + Math.abs(svx) + Math.abs(svy) >
          0.001
      )
        raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        previous = 0;
      }
    };
    const start = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const detach = () => {
      const rect = item.current!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (!detached) {
        position.current = {
          x: rect.left + scrollX,
          y: rect.top + scrollY,
          width,
          height,
        };
        detached = true;
        setPlaced(true);
      }
      returning = false;
      return rect;
    };
    const resetPosition = () => {
      if (detached) {
        active = false;
        stopCapture();
        returning = true;
        vx = vy = 0;
        start();
      }
    };
    engine.current = {
      grab(event) {
        if (event.button !== 0) return;
        event.preventDefault();
        const rect = detach();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        lastX = event.clientX;
        lastY = event.clientY;
        lastTime = performance.now();
        pointer = event.pointerId;
        active = true;
        moved.current = false;
        vx = vy = 0;
        document.documentElement.setPointerCapture(pointer);
        document.documentElement.dataset.dragging = 'true';
        start();
      },
      key(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          resetPosition();
          return;
        }
        if (
          !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        detach();
        const distance = event.shiftKey ? 100 : 20;
        position.current.x +=
          event.key === 'ArrowLeft'
            ? -distance
            : event.key === 'ArrowRight'
              ? distance
              : 0;
        position.current.y +=
          event.key === 'ArrowUp'
            ? -distance
            : event.key === 'ArrowDown'
              ? distance
              : 0;
        requestAnimationFrame(() =>
          item.current?.focus({ preventScroll: true }),
        );
        start();
      },
      reset: resetPosition,
    };
    const move = (event: PointerEvent) => {
      if (active && event.pointerId === pointer) {
        const elapsed = Math.max(8, performance.now() - lastTime);
        vx = reduce.matches ? 0 : ((event.clientX - lastX) / elapsed) * 14;
        vy = reduce.matches ? 0 : ((event.clientY - lastY) / elapsed) * 14;
        moved.current ||=
          Math.abs(event.clientX - lastX) + Math.abs(event.clientY - lastY) > 2;
        lastX = event.clientX;
        lastY = event.clientY;
        lastTime = performance.now();
      }
      if (kind !== 'face' || !item.current) return;
      const bounds = item.current.getBoundingClientRect(),
        dx = (event.clientX - bounds.left - bounds.width / 2) / bounds.width,
        dy = (event.clientY - bounds.top - bounds.height / 2) / bounds.height;
      const near = Math.abs(dx) < 0.9 && Math.abs(dy) < 0.9;
      tx = near ? 1 + dy * 0.12 : 1;
      ty = near ? 1 - dy * 0.12 : 1;
      eyeX = near ? bound(dx * 12, -7, 7) : 0;
      eyeY = near ? bound(dy * 10, -6, 6) : 0;
      if (near || Math.abs(sx - 1) + Math.abs(sy - 1) > 0.001) start();
    };
    const release = () => {
      if (!active) return;
      active = false;
      tx = ty = 1;
      if (performance.now() - lastTime > 100) vx = vy = 0;
      stopCapture();
      if (kind === 'face' && !moved.current) {
        setLaughing(true);
        svx = -0.09;
        svy = 0.13;
        laughTimer.current = setTimeout(() => setLaughing(false), 650);
      }
      start();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    const visibility = () => {
      if (document.hidden) release();
      else start();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(raf);
      stopCapture();
      if (laughTimer.current) clearTimeout(laughTimer.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [kind]);
  useEffect(() => {
    if (reset > 0) engine.current?.reset();
  }, [reset]);
  const toy = (
    <button
      ref={item}
      type="button"
      className={`plaything toy-${kind} tone-${tone} ${placed ? 'toy-detached' : ''} ${laughing ? 'is-laughing' : ''}`}
      style={
        placed
          ? ({
              '--toy-x': `${position.current.x}px`,
              '--toy-y': `${position.current.y}px`,
              width: position.current.width,
              height: position.current.height,
            } as React.CSSProperties)
          : undefined
      }
      aria-label={`${label}. Drag, or use arrow keys to move; Escape returns it home.`}
      onPointerDown={(event) => engine.current?.grab(event)}
      onKeyDown={(event) => engine.current?.key(event)}
      onClick={() => {
        if (kind === 'face' && !moved.current) {
          setLaughing(true);
          laughTimer.current = setTimeout(() => setLaughing(false), 650);
        }
      }}
    >
      {kind === 'face' ? (
        <>
          <Smile tone={tone} expression={expression} />
          {laughing && (
            <span className="haha-burst" aria-hidden="true">
              haha
            </span>
          )}
        </>
      ) : kind === 'spark' ? (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <path
            d="M40 3 47 27 70 13 56 36 79 43 54 50 68 72 45 58 38 79 31 54 9 68 22 45 1 38 26 31 12 9 35 23Z"
            fill="currentColor"
          />
        </svg>
      ) : (
        label
      )}
    </button>
  );
  return (
    <div ref={home} className={`toy-home home-${kind} home-${tone}`}>
      {!placed && toy}
      {placed && createPortal(toy, document.body)}
    </div>
  );
}

export function FansPlayground({
  group = false,
  orbit = false,
}: {
  group?: boolean;
  orbit?: boolean;
}) {
  const reset = 0;
  return (
    <div
      className={`fans-playground ${group ? 'playground-group' : ''} ${orbit ? 'playground-orbiting' : ''}`}
    >
      <div className="playground-orbit" aria-hidden="true" />
      <Plaything kind="face" label="teal smiley" reset={reset} />
      {group ? (
        <>
          <Plaything
            kind="face"
            label="yellow smiley"
            tone="yellow"
            expression="squint"
            reset={reset}
          />
          <Plaything
            kind="face"
            label="coral smiley"
            tone="coral"
            expression="cheeky"
            reset={reset}
          />
        </>
      ) : (
        <>
          <Plaything label="no way" reset={reset} />
          <Plaything label="LMAO" tone="yellow" reset={reset} />
          <Plaything label="brooo" tone="coral" reset={reset} />
        </>
      )}
    </div>
  );
}

export function HomeMotion() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('home-scroll');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.12 },
    );
    for (const element of document.querySelectorAll('[data-reveal]')) {
      observer.observe(element);
      element.classList.add('will-reveal');
    }
    return () => {
      observer.disconnect();
      html.classList.remove('home-scroll');
    };
  }, []);
  return null;
}

/** Pure decoration: floating sparkles, dots and little word bubbles. */
export function FunBits({
  words = [],
  variant = 'default',
}: {
  words?: string[];
  variant?: string;
}) {
  const sparks = [
    { x: 8, y: 18, s: 30, c: 'yellow', d: 0 },
    { x: 88, y: 14, s: 22, c: 'teal', d: -1.5 },
    { x: 92, y: 70, s: 34, c: 'coral', d: -3 },
    { x: 5, y: 78, s: 20, c: 'teal', d: -2.2 },
    { x: 50, y: 6, s: 16, c: 'coral', d: -0.8 },
  ];
  const dots = [
    { x: 18, y: 40, s: 10, c: 'coral' },
    { x: 80, y: 38, s: 8, c: 'yellow' },
    { x: 30, y: 88, s: 12, c: 'yellow' },
    { x: 70, y: 90, s: 9, c: 'teal' },
    { x: 60, y: 22, s: 7, c: 'teal' },
    { x: 14, y: 60, s: 6, c: 'yellow' },
  ];
  const spots = [
    { x: 12, y: 30 },
    { x: 78, y: 24 },
    { x: 84, y: 82 },
    { x: 16, y: 84 },
    { x: 46, y: 92 },
  ];
  return (
    <div className={`fun-bits fun-${variant}`} aria-hidden="true">
      {sparks.map((p, i) => (
        <svg
          key={`s${i}`}
          className={`fun-spark c-${p.c}`}
          aria-hidden="true"
          viewBox="0 0 40 40"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.s,
              height: p.s,
              animationDelay: `${p.d}s`,
            } as React.CSSProperties
          }
        >
          <path d="M20 0C21.5 12 28 18.5 40 20C28 21.5 21.5 28 20 40C18.5 28 12 21.5 0 20C12 18.5 18.5 12 20 0Z" />
        </svg>
      ))}
      {dots.map((p, i) => (
        <i
          key={`d${i}`}
          className={`fun-dot c-${p.c}`}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.s,
            height: p.s,
            animationDelay: `${-i * 0.9}s`,
          }}
        />
      ))}
      {words.map((w, i) => (
        <span
          key={w}
          className={`fun-word c-${['yellow', 'teal', 'coral'][i % 3]}`}
          style={{
            left: `${spots[i % spots.length]!.x}%`,
            top: `${spots[i % spots.length]!.y}%`,
            animationDelay: `${-i * 1.7}s`,
          }}
        >
          {w}
        </span>
      ))}
    </div>
  );
}
