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
  return (
    <svg
      className="smile-svg"
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id} cx=".3" cy=".18" r=".85">
          <stop
            stopColor={
              tone === 'teal'
                ? '#a0ffe9'
                : tone === 'yellow'
                  ? '#fff1ac'
                  : '#ffb2ab'
            }
          />
          <stop offset=".53" stopColor={color} />
          <stop
            offset="1"
            stopColor={
              tone === 'teal'
                ? '#139d84'
                : tone === 'yellow'
                  ? '#c69514'
                  : '#bf343b'
            }
          />
        </radialGradient>
      </defs>
      <path
        d="M120 14C174 8 224 55 226 111C235 169 190 223 132 226C77 236 20 198 14 139C4 77 54 17 120 14Z"
        fill={`url(#${id})`}
        stroke={color}
        strokeWidth="1.5"
      />
      <path
        d="M48 65C67 33 102 25 132 29"
        stroke="white"
        strokeOpacity=".43"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <g className="smile-eyes" fill="#0b2521">
        {expression === 'squint' ? (
          <path
            d="M68 92Q80 80 92 92M148 92Q160 80 172 92"
            fill="none"
            stroke="#0b2521"
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
          expression === 'cheeky'
            ? 'M74 139Q123 181 172 132'
            : 'M68 135Q120 194 172 135'
        }
        stroke="#0b2521"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <g className="smile-open">
        <path
          d="M67 134Q120 150 173 134C170 193 75 197 67 134Z"
          fill="#0b2521"
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
      if (!raf) raf = requestAnimationFrame(tick);
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
    return () => {
      cancelAnimationFrame(raf);
      stopCapture();
      if (laughTimer.current) clearTimeout(laughTimer.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
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
        <Smile tone={tone} expression={expression} />
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

export function FansPlayground({ group = false }: { group?: boolean }) {
  const [reset, setReset] = useState(0);
  return (
    <div className={`fans-playground ${group ? 'playground-group' : ''}`}>
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
          <Plaything
            kind="spark"
            label="yellow sparkle"
            tone="yellow"
            reset={reset}
          />
        </>
      )}
      <div className="playground-help">
        <span>drag a little joy anywhere</span>
        <button type="button" onClick={() => setReset(reset + 1)}>
          reset ↺
        </button>
      </div>
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
