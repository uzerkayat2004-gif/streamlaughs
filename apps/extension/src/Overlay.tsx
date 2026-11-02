import { PRODUCT, replayPage, sessionWord } from '@laughline/shared';
import { ChevronDown, GripHorizontal } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { command, connectSurface, surface } from './bridge';
import { crowdLabel } from './components';
import {
  boxPoint,
  clamp,
  dockPoint,
  isDrag,
  clampAnchor,
  normalizeAnchor,
  restoreAnchor,
  type Point,
  readDock,
  readPanel,
} from './geometry';
import {
  newLaugh,
  OVERLAY_FADE_MS,
  overlayOpacity,
  launcherOpacity,
} from './overlay-behavior';
import { FanPanel } from './FanPanel';
import { PipelineDebug } from './PipelinePanel';
import { AppIcon } from './AppIcon';
import { biggestMinute } from './recap-story';
import { stopWithPreview, type StopPreview } from './stop-preview';
import { StopSaved } from './StopSaved';
import { pageWatchContext } from './watch-context';
import { audioNotice, friendlyError } from './ui-status';
import { AUDIO_TIP, AUDIO_TIP_KEY } from './stutter';
import { labSurface, contentStutterMetrics } from './stutter-surface';

const ANCHOR_KEY = 'streamlaughs:overlay-anchor';
export function Overlay({
  getPlayer,
}: {
  getPlayer: () => HTMLElement | null;
}) {
  const [debugOpen, setDebugOpen] = useState(false);
  const [laughUndo, setLaughUndo] = useState<number | null>(null);
  useEffect(() => {
    if (!laughUndo) return;
    const t = setTimeout(() => setLaughUndo(null), 5000);
    return () => clearTimeout(t);
  }, [laughUndo]);
  const [lab, setLab] = useState(labSurface.get),
    [audioTip, setAudioTip] = useState(false);
  useEffect(() => labSurface.subscribe(() => setLab(labSurface.get())), []);
  useEffect(() => {
    contentStutterMetrics();
    const notice = (message: { type?: string }) => {
      if (message.type === 'STUTTER_NOTICE')
        void chrome.storage.local.get(AUDIO_TIP_KEY).then((v) => {
          if (!v[AUDIO_TIP_KEY]) setAudioTip(true);
        });
    };
    chrome.runtime.onMessage.addListener(notice);
    return () => chrome.runtime.onMessage.removeListener(notice);
  }, []);
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
  const [channel, setChannel] = useState(pageWatchContext().channel),
    [rect, setRect] = useState<DOMRect | null>(null);
  const [anchor, setAnchor] = useState<Point | null>(null),
    [launcher, setLauncher] = useState<Point | null>(null);
  const [open, setOpen] = useState(false),
    [hint, setHint] = useState(false),
    [toast, setToast] = useState<StopPreview | null>(null),
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
  const replayHere =
    !!snapshot.session?.replay &&
    snapshot.session.replay.url === replayPage(location.href)?.url;
  const sessionHere = snapshot.session?.channel === channel || replayHere,
    status = sessionHere ? snapshot.status : 'idle',
    room = sessionHere ? snapshot.crowd : null;
  const notice = sessionHere ? audioNotice(snapshot) : null,
    count = sessionHere ? (snapshot.session?.laughCount ?? 0) : 0;
  useEffect(() => {
    const disconnect = connectSurface(250);
    void chrome.storage.local
      .get(['laughline:dock', ANCHOR_KEY])
      .then((data) => {
        const p = readPanel(data[ANCHOR_KEY]);
        if (p) setAnchor(p);
        else {
          const d = readDock(data['laughline:dock']);
          const bounds = getPlayer()?.getBoundingClientRect();
          if (d && bounds)
            setAnchor(normalizeAnchor(dockPoint(d, bounds), bounds));
        }
      });
    return disconnect;
  }, []);
  useEffect(() => {
    let player: HTMLElement | null = null;
    const observer = new ResizeObserver(() => update());
    let lastRead = 0,
      scheduled: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (!labSurface.get().overlay) return;
      const remaining = 250 - (performance.now() - lastRead);
      if (remaining > 0) {
        scheduled ??= setTimeout(() => {
          scheduled = undefined;
          update();
        }, remaining);
        return;
      }
      lastRead = performance.now();
      const next = getPlayer();
      if (next !== player) {
        observer.disconnect();
        player = next;
        if (player) observer.observe(player);
      }
      const raw = player?.getBoundingClientRect();
      const bounds = raw
        ? new DOMRect(
            Math.max(0, raw.left),
            Math.max(0, raw.top),
            Math.max(
              0,
              Math.min(innerWidth, raw.right) - Math.max(0, raw.left),
            ),
            Math.max(
              0,
              Math.min(innerHeight, raw.bottom) - Math.max(0, raw.top),
            ),
          )
        : null;
      setRect((old) =>
        old?.x === bounds?.x &&
        old?.y === bounds?.y &&
        old?.width === bounds?.width &&
        old?.height === bounds?.height
          ? old
          : bounds,
      );
      setChannel((old) => {
        const nextChannel = pageWatchContext().channel;
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
      clearTimeout(scheduled);
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
      const last = snapshot.session?.laughEvents.at(-1);
      if (last)
        void chrome.runtime
          .sendMessage({
            type: 'PANEL_LATENCY',
            ms: Math.max(0, Date.now() - last.at),
          })
          .catch(() => {});
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
      setToast((old) => (old?.id === snapshot.session?.id ? old : null));
    } else if (
      previousSession.current &&
      snapshot.lastRecapId === previousSession.current
    ) {
      setOpen(false);
      const saved = snapshot.lastSaved;
      if (saved?.id === previousSession.current) setToast(saved);
      previousSession.current = null;
    }
  }, [sessionHere, snapshot.session, snapshot.lastRecapId]);
  useEffect(() => {
    if (!replayHere || !snapshot.session?.replay) return;
    const tick = () => {
      const context = pageWatchContext();
      const page = replayPage(location.href);
      if (page && context.seconds !== undefined)
        void chrome.runtime
          .sendMessage({
            type: 'REPLAY_POSITION',
            replay: {
              ...page,
              seconds: context.seconds,
              at: Date.now(),
              rate: context.rate ?? 1,
              paused: context.paused ?? false,
            },
          })
          .catch(() => {});
    };
    tick();
    const events = ['seeked', 'ratechange', 'pause', 'play'];
    for (const event of events) document.addEventListener(event, tick, true);
    const timer = setInterval(tick, 500);
    return () => {
      clearInterval(timer);
      for (const event of events)
        document.removeEventListener(event, tick, true);
    };
  }, [replayHere, snapshot.session?.id]);
  useEffect(() => {
    if (hovered) return;
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
    type: 'STOP' | 'PAUSE' | 'OPEN_RECAP' | 'RETRY_MIC' | 'OPEN_MIC_TEST',
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
  useEffect(() => {
    if (!sessionHere || !open || !lab.overlay) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sessionHere, open, lab.overlay]);
  function stopNow() {
    if (!snapshot.session) return;
    void stopWithPreview(
      snapshot.session,
      (preview) => {
        setToast(preview);
        setOpen(false);
      },
      () => act('STOP'),
    );
  }
  const resolvedChannel =
    channel || (replayHere ? snapshot.session?.channel : null);
  if (!resolvedChannel || !rect || rect.width < 50 || rect.height < 50)
    return null;
  const size = { width: rect.width, height: rect.height },
    local = clampAnchor(
      launcher ??
        (anchor
          ? restoreAnchor(anchor, size)
          : dockPoint({ edge: 'right', ratio: 1 }, size)),
      size,
    ),
    boxSize = {
      width: Math.min(286, rect.width - 16),
      height: Math.min(
        room?.state === 'live' && room.laughlineViewers >= 3 ? 464 : 328,
        Math.max(
          32,
          (local.y + 7 < rect.height / 2
            ? rect.height - local.y - 14
            : local.y) - 18,
        ),
      ),
    };
  const box = boxPoint(local, size, boxSize);
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
      origin: local,
      last: local,
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
    d.last = clampAnchor(next, size);
    setLauncher(d.last);
    wake();
  }
  function finish(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    suppressClick.current = d.moved;
    if (d.moved) {
      const next = normalizeAnchor(d.last, size);
      setAnchor(next);
      setLauncher(null);
      void chrome.storage.local.set({ [ANCHOR_KEY]: next });
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
      p = local,
      next = {
        x:
          p.x +
          (event.key === 'ArrowRight' ? d : event.key === 'ArrowLeft' ? -d : 0),
        y:
          p.y +
          (event.key === 'ArrowDown' ? d : event.key === 'ArrowUp' ? -d : 0),
      };
    const stored = normalizeAnchor(next, size);
    setAnchor(stored);
    void chrome.storage.local.set({ [ANCHOR_KEY]: stored });
    wake();
  }
  const opacity = overlayOpacity(hovered, activeAt, clock);
  return (
    <div className={`overlay-shell ${lab.overlay ? '' : 'overlay-quiet'}`}>
      {debugOpen && <PipelineDebug close={() => setDebugOpen(false)} />}
      {audioTip && (
        <aside className="audio-smooth-tip" role="status">
          <p>{AUDIO_TIP}</p>
          <p>Windows: Sound settings &gt; Communications &gt; “Do nothing”.</p>
          <button
            type="button"
            onClick={() => {
              setAudioTip(false);
              void chrome.storage.local.set({ [AUDIO_TIP_KEY]: true });
            }}
          >
            got it
          </button>
        </aside>
      )}
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
        className={`x-dot calm-launcher ${status === 'idle' ? 'x-dot--off' : status === 'paused' ? 'x-dot--paused' : ''}`}
        style={{
          left: rect.left + local.x,
          top: rect.top + local.y,
          opacity: launcherOpacity(hovered, activeAt, clock),
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
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
        <span className="launcher-face">
          <AppIcon mono size={15} />
        </span>
        {bounce > 0 && (
          <i key={bounce} className="laugh-ripple" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div
          id="laughline-crowd-box"
          ref={boxElement}
          className="x-cbox x-glass is-open glass-panel"
          role="dialog"
          aria-label="fans box"
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
              height: boxSize.height,
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
                setLauncher(null);
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
          <FanPanel
            calibrationMs={snapshot.inference.calibrationRemainingMs}
            bleed={snapshot.inference.bleedLikely}
            onUndoLaugh={() => {
              void command({ type: 'UNDO_LAUGH' })
                .then(() => setLaughUndo(Date.now()))
                .catch((e) => setError(e.message));
            }}
            channel={snapshot.session?.displayName || resolvedChannel}
            replay={replayHere}
            elapsed={
              sessionHere && snapshot.session
                ? Math.max(0, (clock - snapshot.session.startedAt) / 1000)
                : 0
            }
            word={
              sessionHere && snapshot.session
                ? sessionWord(snapshot.session)?.word
                : undefined
            }
            lastLaughSeconds={
              sessionHere && snapshot.session?.laughEvents.length
                ? Math.max(
                    0,
                    (clock - snapshot.session.laughEvents.at(-1)!.at) / 1000,
                  )
                : undefined
            }
            bestMoment={
              sessionHere
                ? biggestMinute(snapshot.session ?? undefined)?.seconds
                : undefined
            }
            room={room}
            count={count}
            status={status}
            micLevel={sessionHere ? snapshot.capture.metrics.micLevel : 0}
            micProblem={
              sessionHere &&
              (snapshot.capture.micLost ||
                ['error', 'permissionRequired'].includes(
                  snapshot.capture.phase,
                ))
            }
            listen={snapshot.settings.listen}
            bounce={clock - activeAt < 1000 ? bounce : 0}
            onPause={() => void act('PAUSE')}
            onStop={stopNow}
            onMic={() => void act('OPEN_MIC_TEST')}
          />
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
      {sessionHere &&
        !open &&
        snapshot.inference.calibrationRemainingMs > 0 && (
          <div
            className="x-hint x-glass is-on"
            role="status"
            style={{
              left: rect.left + local.x - 220,
              top: rect.top + local.y - 44,
            }}
          >
            stay quiet for 3 sec
          </div>
        )}
      {!!laughUndo && (
        <div className="x-toast x-glass is-on" role="status">
          not me · laugh removed{' '}
          <button
            type="button"
            className="textbtn"
            onClick={() => {
              void command({ type: 'RESTORE_LAUGH' })
                .then(() => setLaughUndo(null))
                .catch((e) => setError(e.message));
            }}
          >
            undo
          </button>
        </div>
      )}
      {toast && (
        <div className="x-toast x-glass is-on recap-toast" role="status">
          <StopSaved
            id={toast.id}
            seconds={
              snapshot.lastSaved?.id === toast.id
                ? snapshot.lastSaved.durationSeconds
                : toast.durationSeconds
            }
            laughs={
              snapshot.lastSaved?.id === toast.id
                ? snapshot.lastSaved.laughs
                : toast.laughs
            }
            close={() => setToast(null)}
          />
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
