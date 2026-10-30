import { PRODUCT, parseChannel, visibleWords } from '@laughline/shared';
import { ChevronDown, GripHorizontal, Pause, Play } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { command, connectSurface, surface } from './bridge';
import { crowdLabel } from './components';
import {
  boxPoint,
  clamp,
  type Dock,
  dockPoint,
  isDrag,
  normalizePanel,
  type Point,
  panelPoint,
  readDock,
  readPanel,
  restorePanel,
  snap,
} from './geometry';
import { newLaugh, OVERLAY_FADE_MS, overlayOpacity } from './overlay-behavior';
import { PipelineDebug } from './PipelineDebug';
import { SmileLogo } from './SmileLogo';
import { audioNotice, friendlyError } from './ui-status';

const PANEL_KEY = 'streamlaughs:overlay-panel';
export function Overlay({
  getPlayer,
}: {
  getPlayer: () => HTMLElement | null;
}) {
  const [debugOpen, setDebugOpen] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        setDebugOpen((value) => !value);
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, []);
  const { snapshot } = useStore(surface.store);
  const [channel, setChannel] = useState(parseChannel(location.href)),
    [rect, setRect] = useState<DOMRect | null>(null);
  const [dock, setDock] = useState<Dock>({ edge: 'right', ratio: 1 }),
    [launcher, setLauncher] = useState<Point | null>(null),
    [savedPanel, setSavedPanel] = useState<Point | null>(null),
    [movingPanel, setMovingPanel] = useState<Point | null>(null);
  const [open, setOpen] = useState(false),
    [hint, setHint] = useState(false),
    [toast, setToast] = useState<string | null>(null),
    [error, setError] = useState(''),
    [hovered, setHovered] = useState(false),
    [activeAt, setActiveAt] = useState(Date.now()),
    [clock, setClock] = useState(Date.now()),
    [bounce, setBounce] = useState(0);
  const drag = useRef<{
      kind: 'launcher' | 'panel';
      start: Point;
      origin: Point;
      last: Point;
      moved: boolean;
    } | null>(null),
    suppressClick = useRef(false),
    previousSession = useRef<string | null>(null),
    lastLaugh = useRef({ session: null as string | null, count: 0 });
  const dotButton = useRef<HTMLButtonElement>(null),
    boxElement = useRef<HTMLDivElement>(null),
    keyboardOpen = useRef(false);
  const sessionHere = snapshot.session?.channel === channel,
    status = sessionHere ? snapshot.status : 'idle',
    room = sessionHere ? snapshot.crowd : null;
  const notice = sessionHere ? audioNotice(snapshot) : null,
    count = sessionHere ? (snapshot.session?.laughCount ?? 0) : 0;
  useEffect(() => {
    const disconnect = connectSurface();
    void chrome.storage.local
      .get(['laughline:dock', PANEL_KEY])
      .then((data) => {
        const d = readDock(data['laughline:dock']),
          p = readPanel(data[PANEL_KEY]);
        if (d) setDock(d);
        if (p) setSavedPanel(p);
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
    const session = sessionHere ? (snapshot.session?.id ?? null) : null;
    if (
      newLaugh(
        lastLaugh.current.session,
        lastLaugh.current.count,
        session,
        count,
      )
    ) {
      setBounce((n) => n + 1);
      const now = Date.now();
      setActiveAt(now);
      setClock(now);
    }
    lastLaugh.current = { session, count };
  }, [sessionHere, snapshot.session?.id, count]);
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
    if (!open || hovered) return;
    const delay = Math.max(0, OVERLAY_FADE_MS - (Date.now() - activeAt));
    const timer = setTimeout(() => setClock(Date.now()), delay + 1);
    return () => clearTimeout(timer);
  }, [open, hovered, activeAt]);
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
    } catch (e) {
      setError(friendlyError(e));
      return false;
    }
  }
  if (!channel || !rect || rect.width < 50 || rect.height < 50) return null;
  const size = { width: rect.width, height: rect.height },
    local = launcher ?? dockPoint(dock, size),
    boxSize = {
      width: Math.min(210, rect.width - 16),
      height: Math.min(242, Math.max(64, rect.height - 80)),
    };
  const box =
    movingPanel ??
    (savedPanel
      ? restorePanel(savedPanel, size, boxSize)
      : boxPoint(local, size, boxSize));
  const wake = () => {
    const now = Date.now();
    setActiveAt(now);
    setClock(now);
  };
  function begin(
    event: React.PointerEvent<HTMLButtonElement>,
    kind: 'launcher' | 'panel',
  ) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind,
      start: { x: event.clientX, y: event.clientY },
      origin: kind === 'launcher' ? local : box,
      last: kind === 'launcher' ? local : box,
      moved: false,
    };
  }
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    d.moved ||= isDrag(d.start, { x: event.clientX, y: event.clientY });
    if (!d.moved) return;
    const next = {
      x: d.origin.x + event.clientX - d.start.x,
      y: d.origin.y + event.clientY - d.start.y,
    };
    d.last =
      d.kind === 'panel'
        ? panelPoint(next, size, boxSize)
        : {
            x: clamp(next.x, 0, size.width - 40),
            y: clamp(next.y, 0, size.height - 104),
          };
    if (d.kind === 'panel') setMovingPanel(d.last);
    else setLauncher(d.last);
    wake();
  }
  function finish(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    suppressClick.current = d.moved;
    if (d.moved) {
      if (d.kind === 'panel') {
        const p = normalizePanel(d.last, size, boxSize);
        setSavedPanel(p);
        setMovingPanel(null);
        void chrome.storage.local.set({ [PANEL_KEY]: p });
      } else {
        const next = snap(d.last, size);
        setDock(next);
        setLauncher(null);
        void chrome.storage.local.set({ 'laughline:dock': next });
      }
    }
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboardMove(
    event: React.KeyboardEvent<HTMLButtonElement>,
    kind: 'launcher' | 'panel',
  ) {
    if (
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return;
    event.preventDefault();
    const d = event.shiftKey ? 30 : 10,
      p = kind === 'panel' ? box : local,
      next = {
        x:
          p.x +
          (event.key === 'ArrowRight' ? d : event.key === 'ArrowLeft' ? -d : 0),
        y:
          p.y +
          (event.key === 'ArrowDown' ? d : event.key === 'ArrowUp' ? -d : 0),
      };
    if (kind === 'panel') {
      const stored = normalizePanel(next, size, boxSize);
      setSavedPanel(stored);
      void chrome.storage.local.set({ [PANEL_KEY]: stored });
    } else {
      const n = snap(next, size);
      setDock(n);
      void chrome.storage.local.set({ 'laughline:dock': n });
    }
    wake();
  }
  const opacity = overlayOpacity(hovered, activeAt, clock);
  return (
    <div className="overlay-shell">
      {debugOpen && <PipelineDebug close={() => setDebugOpen(false)} />}
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
          <p role="status" className="x-toast x-glass is-on">
            {notice.action === 'startAudio'
              ? 'open the toolbar · press start audio'
              : notice.text}
          </p>
        ))}
      <button
        ref={dotButton}
        type="button"
        className={`x-dot glass-launcher ${status === 'idle' ? 'x-dot--off' : status === 'paused' ? 'x-dot--paused' : ''}`}
        style={{ left: rect.left + local.x, top: rect.top + local.y }}
        aria-label={`${PRODUCT.name}, ${status}, ${status !== 'idle' ? `${crowdLabel(room)}, ` : ''}drag to move`}
        title={PRODUCT.name}
        aria-expanded={open}
        aria-controls="laughline-crowd-box"
        onPointerDown={(event) => begin(event, 'launcher')}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          drag.current = null;
          setLauncher(null);
        }}
        onKeyDown={(event) => keyboardMove(event, 'launcher')}
        onClick={(event) => {
          if (suppressClick.current && event.detail > 0) {
            suppressClick.current = false;
            return;
          }
          keyboardOpen.current = event.detail === 0;
          setOpen(!open);
          setHint(status === 'idle');
          wake();
        }}
      >
        <span key={bounce} className={bounce ? 'smile-bounce' : ''}>
          <SmileLogo size={24} />
        </span>
        {status === 'recording' && <i className="recording-dot" />}
      </button>
      {open && (
        <div
          id="laughline-crowd-box"
          ref={boxElement}
          className="x-cbox x-glass is-open glass-panel"
          role="dialog"
          aria-label="crowd box"
          onMouseEnter={() => {
            setHovered(true);
            wake();
          }}
          onMouseLeave={() => {
            setHovered(false);
            wake();
          }}
          style={
            {
              left: rect.left + box.x,
              top: rect.top + box.y,
              width: boxSize.width,
              maxHeight: boxSize.height,
              opacity,
            } as CSSProperties
          }
        >
          <div className="panel-top">
            <button
              type="button"
              className="panel-drag"
              aria-label="move reaction panel with arrow keys or drag"
              onPointerDown={(event) => begin(event, 'panel')}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={() => {
                drag.current = null;
                setMovingPanel(null);
              }}
              onKeyDown={(event) => keyboardMove(event, 'panel')}
            >
              <GripHorizontal size={17} />
            </button>
            <button
              type="button"
              className="panel-collapse"
              aria-label="collapse reaction panel"
              onClick={() => {
                setOpen(false);
                dotButton.current?.focus();
              }}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="panel-smile" key={bounce}>
            <SmileLogo size={40} className={bounce ? 'smile-bounce' : ''} />
          </div>
          <p className="panel-live-count">
            {status === 'idle' ? (
              'ready when you are'
            ) : status === 'paused' ? (
              'paused'
            ) : room?.state === 'live' ? (
              <>
                <b>{room.laughingNow}</b> laughing now
              </>
            ) : room?.state === 'few' ? (
              'a few here'
            ) : (
              'offline'
            )}
          </p>
          {status !== 'idle' && (
            <>
              <div className="panel-words">
                {visibleWords(room)
                  .filter((w) => w.word !== '—')
                  .slice(0, 1)
                  .map((w) => (
                    <span key={w.word}>{w.word}</span>
                  ))}
              </div>
              <span className="glass-laugh-chip">
                <SmileLogo size={17} />
                {count} {count === 1 ? 'laugh' : 'laughs'}
              </span>
              <div className="x-cfoot">
                <button
                  type="button"
                  className="x-cbtn"
                  aria-label={status === 'paused' ? 'resume' : 'pause'}
                  aria-pressed={status === 'paused'}
                  onClick={() => void act('PAUSE')}
                >
                  {status === 'paused' ? (
                    <Play size={13} />
                  ) : (
                    <Pause size={13} />
                  )}
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
            </>
          )}
          <p className="x-cnote">
            {status === 'idle'
              ? `click the ${PRODUCT.name} icon to start`
              : crowdLabel(room)}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
      )}
      {hint && !open && (
        <div
          role="status"
          className="x-hint x-glass is-on"
          style={{
            left: clamp(
              rect.left + local.x - 220,
              rect.left + 8,
              rect.right - 280,
            ),
            top: rect.top + local.y - 44,
          }}
        >
          click the {PRODUCT.name} icon to start
        </div>
      )}
      {toast && (
        <div className="x-toast x-glass is-on recap-toast" role="status">
          <button type="button" onClick={() => void act('OPEN_RECAP', toast)}>
            see recap
          </button>
          <button
            type="button"
            aria-label="dismiss recap toast"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
