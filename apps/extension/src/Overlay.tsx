import { PRODUCT, parseChannel } from '@laughline/shared';
import { Pause, Play } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { command, connectSurface, surface } from './bridge';
import { Blob, crowdLabel, Words, YouPill } from './components';
import {
  boxPoint,
  clamp,
  type Dock,
  dockPoint,
  isDrag,
  type Point,
  snap,
} from './geometry';
import { audioNotice, friendlyError } from './ui-status';

export function Overlay({
  getPlayer,
}: {
  getPlayer: () => HTMLElement | null;
}) {
  const { snapshot } = useStore(surface.store);
  const [channel, setChannel] = useState(parseChannel(location.href)),
    [rect, setRect] = useState<DOMRect | null>(null);
  const [dock, setDock] = useState<Dock>({ edge: 'right', ratio: 0 }),
    [position, setPosition] = useState<Point | null>(null);
  const [open, setOpen] = useState(false),
    [hint, setHint] = useState(false),
    [toast, setToast] = useState<string | null>(null),
    [error, setError] = useState('');
  const drag = useRef<{ start: Point; origin: Point; moved: boolean } | null>(
      null,
    ),
    suppressClick = useRef(false),
    previousSession = useRef<string | null>(null);
  const dotButton = useRef<HTMLButtonElement>(null);
  const boxElement = useRef<HTMLDivElement>(null);
  const keyboardOpen = useRef(false);
  const sessionHere = snapshot.session?.channel === channel;
  const status = sessionHere ? snapshot.status : 'idle';
  const notice = sessionHere ? audioNotice(snapshot) : null;
  useEffect(() => {
    const disconnect = connectSurface();
    void chrome.storage.local.get('laughline:dock').then((data) => {
      const saved: unknown = data['laughline:dock'];
      if (
        saved &&
        typeof saved === 'object' &&
        'edge' in saved &&
        ['left', 'right', 'top', 'bottom'].includes(String(saved.edge)) &&
        'ratio' in saved &&
        typeof saved.ratio === 'number'
      )
        setDock(saved as Dock);
    });
    return disconnect;
  }, []);
  useEffect(() => {
    let player: HTMLElement | null = null;
    const observer = new ResizeObserver(() => update());
    const update = () => {
      const next = getPlayer();
      if (next !== player) {
        observer.disconnect();
        player = next;
        if (player) observer.observe(player);
      }
      const bounds = player?.getBoundingClientRect() ?? null;
      setRect((old) =>
        old?.x === bounds?.x &&
        old?.y === bounds?.y &&
        old?.width === bounds?.width &&
        old?.height === bounds?.height
          ? old
          : bounds,
      );
      setChannel((old) => {
        const nextChannel = parseChannel(location.href);
        if (old !== nextChannel) {
          setOpen(false);
          setHint(false);
          setToast(null);
          previousSession.current = null;
        }
        return nextChannel;
      });
    };
    update();
    const timer = setInterval(update, 500);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('popstate', update);
    return () => {
      clearInterval(timer);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('popstate', update);
    };
  }, [getPlayer]);
  useEffect(() => {
    if (sessionHere && snapshot.session) {
      previousSession.current = snapshot.session.id;
      setToast(null);
    } else if (
      previousSession.current &&
      snapshot.lastRecapId === previousSession.current
    ) {
      setOpen(false);
      setToast(previousSession.current);
      previousSession.current = null;
    }
  }, [sessionHere, snapshot.session, snapshot.lastRecapId]);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), 3000);
    return () => clearTimeout(timer);
  }, [hint]);
  useEffect(() => {
    if (!open) return;
    if (keyboardOpen.current)
      boxElement.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        dotButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  async function act(
    type: 'STOP' | 'PAUSE' | 'OPEN_RECAP' | 'RETRY_MIC',
    id?: string,
  ) {
    try {
      await command(type === 'OPEN_RECAP' ? { type, id } : { type });
      setError('');
      return true;
    } catch (error) {
      setError(friendlyError(error));
      return false;
    }
  }
  if (!channel || !rect || rect.width < 50 || rect.height < 50) return null;
  const size = { width: rect.width, height: rect.height },
    local = position ?? dockPoint(dock, size),
    point = { x: rect.left + local.x, y: rect.top + local.y };
  const boxSize = {
      width: Math.min(300, rect.width - 16),
      height: Math.min(350, rect.height - 16),
    },
    box = boxPoint(local, size, boxSize);
  return (
    <div className="overlay-shell">
      {notice &&
        (notice.action && notice.action !== 'startAudio' ? (
          <button
            type="button"
            className="x-toast x-glass is-on"
            onClick={async () => {
              if (notice.action === 'retryMic') await act('RETRY_MIC');
              else {
                if (snapshot.status === 'recording' && !(await act('PAUSE')))
                  return;
                await act('PAUSE');
              }
            }}
          >
            {notice.text}
          </button>
        ) : (
          <div className="x-toast x-glass is-on" role="status">
            {notice.action === 'startAudio'
              ? 'open the toolbar · press start audio'
              : notice.text}
          </div>
        ))}
      <button
        type="button"
        ref={dotButton}
        className={`x-dot ${status === 'idle' ? 'x-dot--off' : status === 'paused' ? 'x-dot--paused' : ''} ${drag.current?.moved ? 'is-drag' : 'is-snap'}`}
        style={
          {
            left: point.x,
            top: point.y,
            '--ripple-speed': `${clamp(3 - (snapshot.crowd?.laughingNow ?? 0) / 130, 0.8, 3)}s`,
            '--ripple-scale': clamp(
              1.5 + (snapshot.crowd?.laughingNow ?? 0) / 160,
              1.5,
              3,
            ),
          } as CSSProperties
        }
        aria-label={`${PRODUCT.name}, ${status}, ${status !== 'idle' ? `${crowdLabel(snapshot.crowd)}, ` : ''}drag to move`}
        title={
          status === 'idle'
            ? PRODUCT.name
            : snapshot.crowd?.state === 'few'
              ? 'a few here'
              : crowdLabel(snapshot.crowd)
        }
        aria-expanded={open}
        aria-controls="laughline-crowd-box"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = {
            start: { x: event.clientX, y: event.clientY },
            origin: local,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          current.moved ||= isDrag(current.start, {
            x: event.clientX,
            y: event.clientY,
          });
          if (current.moved)
            setPosition({
              x: clamp(
                current.origin.x + event.clientX - current.start.x,
                0,
                rect.width - 32,
              ),
              y: clamp(
                current.origin.y + event.clientY - current.start.y,
                0,
                rect.height - 32,
              ),
            });
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          if (!current) return;
          suppressClick.current = current.moved;
          if (current.moved) {
            const next = snap(position ?? local, size);
            setDock(next);
            setPosition(null);
            void chrome.storage.local.set({ 'laughline:dock': next });
          }
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          suppressClick.current = true;
          setPosition(null);
        }}
        onClick={(event) => {
          if (suppressClick.current && event.detail > 0) {
            suppressClick.current = false;
            return;
          }
          suppressClick.current = false;
          if (status === 'idle') {
            setHint(true);
          } else {
            keyboardOpen.current = event.detail === 0;
            setOpen(!open);
            setHint(false);
          }
        }}
      />
      {open && status !== 'idle' && (
        <div
          id="laughline-crowd-box"
          ref={boxElement}
          className={`x-cbox x-glass is-open ${status === 'paused' ? 'is-paused' : ''}`}
          role="dialog"
          aria-label="crowd box"
          style={{
            left: rect.left + box.x,
            top: rect.top + box.y,
            width: boxSize.width,
            maxHeight: Math.max(100, rect.height - 16),
            transformOrigin:
              point.x > rect.left + box.x ? 'top right' : 'top left',
          }}
        >
          <Blob
            crowd={snapshot.crowd}
            compact
            count={snapshot.crowd?.laughingNow ?? 0}
            paused={status === 'paused'}
          />
          <Words compact crowd={snapshot.crowd} />
          <YouPill
            count={snapshot.session?.laughCount ?? 0}
            paused={status === 'paused'}
          />
          <div className="x-cfoot">
            <button
              type="button"
              className="x-cbtn"
              aria-label={status === 'paused' ? 'resume' : 'pause'}
              aria-pressed={status === 'paused'}
              onClick={() => void act('PAUSE')}
            >
              {status === 'paused' ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              type="button"
              className="x-cbtn x-cbtn--stop"
              aria-label="stop session"
              onClick={() => void act('STOP')}
            >
              <i />
            </button>
          </div>
          <p className="x-cnote">{crowdLabel(snapshot.crowd)}</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      {hint && (
        <div
          role="status"
          className="x-hint x-glass is-on"
          style={{
            left: clamp(point.x - 220, rect.left + 8, rect.right - 280),
            top: clamp(point.y + 44, rect.top + 8, rect.bottom - 40),
          }}
        >
          click the {PRODUCT.name} icon to start
        </div>
      )}
      {toast && (
        <div className="x-toast x-glass is-on recap-toast">
          <span role="status">nice session</span>
          <button type="button" onClick={() => void act('OPEN_RECAP', toast)}>
            see recap
          </button>
          <button
            type="button"
            aria-label="dismiss recap notification"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
