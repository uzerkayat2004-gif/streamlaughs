'use client';
import { PRODUCT } from '@laughline/shared';
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AppIcon } from '../../extension/src/AppIcon';
import './extension-demo.css';

/*
 * A guided, fully simulated StreamLaughs session on a Twitch-style page.
 * Nothing here touches a microphone or the network: every number is scripted.
 * The extension pieces (popup, dot, fans panel, stop sheet, recap, share card)
 * mirror the real v0.8 extension UI.
 */

const W = 1280;
const H = 720;
const CHANNEL = 'pixelcamp';

type Step = {
  title: string;
  text: string;
  action: string;
  /** How long autoplay lingers before doing the action, in ms. */
  hold: number;
};
const STEPS: Step[] = [
  {
    title: 'open any Twitch stream.',
    text: 'StreamLaughs sits quietly in your toolbar. Click the smiley to begin.',
    action: 'click the smiley',
    hold: 2600,
  },
  {
    title: 'press start.',
    text: 'One tap. Your mic is listened to on your own PC, never recorded or sent.',
    action: 'press start',
    hold: 2400,
  },
  {
    title: 'laugh like you normally do.',
    text: 'A small dot on the player lights up each time you laugh. Try the laugh button.',
    action: 'open the fans panel',
    hold: 5200,
  },
  {
    title: 'the whole room laughs with you.',
    text: 'See how many fans are laughing right now and the word everyone’s saying.',
    action: 'say “let’s go”',
    hold: 5600,
  },
  {
    title: 'your words count too.',
    text: 'Short reactions like “let’s go” or “no way” are caught. Everything else is thrown away.',
    action: 'stop the session',
    hold: 4600,
  },
  {
    title: 'stop. your night is saved.',
    text: 'One tap on stop and your stream is saved in your browser. See it now, or later.',
    action: 'see recap',
    hold: 3400,
  },
  {
    title: 'your recap, story style.',
    text: 'Your laughs, your biggest minute, your words and your streak with this streamer.',
    action: 'share it',
    hold: 11000,
  },
  {
    title: 'share the night, if you want.',
    text: 'A share card is made on your device, only when you tap share.',
    action: 'watch again',
    hold: 6000,
  },
];

const NAMES: [string, string][] = [
  ['nightowl_ana', '#ff7ab6'],
  ['tofu_rider', '#2ee6c5'],
  ['mxrcus', '#ffb347'],
  ['bytebee', '#7aa7ff'],
  ['quietkid', '#b8f36b'],
  ['lunasol', '#ff5c5c'],
  ['dadjoke_dan', '#c58bff'],
  ['pebble', '#ffd23f'],
  ['kai_v', '#5fd3ff'],
  ['sora77', '#ff9e7a'],
];
const CALM = [
  'one more try?',
  'this level is evil',
  'you got this',
  'the timing on that jump',
  'chat stay calm',
  'hydrate check',
  'wait for it',
  'clip that if it works',
];
const FUNNY = [
  'LMAOOO',
  'NO WAY',
  'HAHAHA',
  'bro fell for it again',
  'LUL LUL LUL',
  'im crying',
  'the scream 💀',
  'KEKW',
  'that sound effect 😭',
  'chat is losing it',
];
const HYPE = ['LETS GOOO', 'lets go!!', 'HE DID IT', 'W', 'GG', 'clean'];

type Chat = { id: number; name: string; color: string; text: string };

function pick<T>(list: T[]) {
  return list[Math.floor(Math.random() * list.length)]!;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Scroll-driven zoom: the demo starts small under the title, grows to fill the
 * whole screen (site header slides away), holds, then shrinks as you scroll on.
 * Writes styles directly so scrolling never re-renders React.
 */
function useScrollZoom(
  track: RefObject<HTMLDivElement | null>,
  frame: RefObject<HTMLDivElement | null>,
  stage: RefObject<HTMLDivElement | null>,
  scaleRef: { current: number },
) {
  useLayoutEffect(() => {
    let raf = 0;
    let immersive = false;
    const apply = () => {
      raf = 0;
      const t = track.current,
        f = frame.current,
        st = stage.current;
      if (!t || !f || !st) return;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const r = t.getBoundingClientRect();
      const full = Math.min(vw / W, vh / H);
      const reduce = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      let z: number;
      if (reduce || vw < 760) z = Math.min(1, (vw - 24) / W / full);
      else {
        const a = clamp((vh - r.top) / vh);
        const b = clamp(-r.top / Math.max(1, r.height - vh));
        if (b <= 0) z = 0.58 + 0.17 * ease(a);
        else if (b < 0.3) z = 0.75 + 0.25 * ease(b / 0.3);
        else if (b < 0.68) z = 1;
        else z = 1 - 0.25 * ease((b - 0.68) / 0.32);
      }
      const s = full * z;
      scaleRef.current = s;
      f.style.width = `${W * s}px`;
      f.style.height = `${H * s}px`;
      const radius = 16 * clamp((1 - z) / 0.25 + 0.0001);
      f.style.borderRadius = `${radius}px`;
      st.style.transform = `scale(${s})`;
      st.style.setProperty('--td-r', `${radius / s}px`);
      const on = r.top <= 1 && r.bottom >= vh - 1 && !reduce && vw >= 760;
      if (on !== immersive) {
        immersive = on;
        document.documentElement.classList.toggle('demo-immersive', on);
      }
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      document.documentElement.classList.remove('demo-immersive');
    };
  }, [track, frame, stage, scaleRef]);
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
const I = {
  back: 'M15 18l-6-6 6-6',
  fwd: 'M9 18l6-6-6-6',
  reload: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  puzzle:
    'M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4z',
  dots: 'M12 5h.01M12 12h.01M12 19h.01',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  inbox:
    'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  play: 'M6 4l14 8-14 8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  volume: 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  full: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
  chev: 'M6 9l6 6 6-6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  stop: 'M6 6h12v12H6z',
  share: 'M4 12v8h16v-8M16 6l-4-4-4 4M12 2v13',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  check: 'M20 6L9 17l-5-5',
};

function Avatar({
  letter,
  color,
  size = 30,
  live = false,
}: {
  letter: string;
  color: string;
  size?: number;
  live?: boolean;
}) {
  return (
    <span
      className={`td-avatar ${live ? 'is-live' : ''}`}
      style={{ width: size, height: size, background: color } as CSSProperties}
    >
      {letter}
    </span>
  );
}

/* ------------------------------ extension UI ------------------------------ */

function Popup({
  onStart,
  startRef,
  glow,
}: {
  onStart: () => void;
  startRef: RefObject<HTMLButtonElement | null>;
  glow: boolean;
}) {
  return (
    <div className="td-popup" role="dialog" aria-label="StreamLaughs popup">
      <header>
        <span className="td-popup-brand">
          <AppIcon size={20} />
          <b>streamlaughs</b>
        </span>
        <span className="td-round">
          <Icon d={I.gear} size={13} />
        </span>
      </header>
      <div className="td-popup-channel">
        <Avatar letter="P" color="#2ee6c5" size={24} />
        <span>{CHANNEL}</span>
        <i>LIVE</i>
      </div>
      <div className="td-popup-face">
        <AppIcon size={92} />
      </div>
      <p className="td-popup-title">ready when you are</p>
      <p className="td-popup-sub">laugh along. it all stays on your PC.</p>
      <button
        ref={startRef}
        type="button"
        className={`td-start ${glow ? 'is-glowing' : ''}`}
        onClick={onStart}
      >
        start
      </button>
      <span className="td-popup-link">watch without mic</span>
      <div className="td-popup-pills">
        <span>last recap</span>
        <span>my streamers</span>
        <span>test my mic</span>
      </div>
      <small>v{PRODUCT.version}</small>
    </div>
  );
}

function Meter({ level }: { level: number }) {
  return (
    <span className="td-meter" aria-hidden="true">
      {[0.35, 0.6, 1, 0.7, 0.45].map((h, i) => (
        <i
          key={i}
          style={{
            height: `${Math.max(18, Math.min(100, level * 100 * h + 18))}%`,
            opacity: level * 5 > i ? 1 : 0.28,
          }}
        />
      ))}
    </span>
  );
}

function FansPanel({
  laughs,
  fans,
  word,
  fanWord,
  last,
  onStop,
  stopRef,
  onClose,
  bump,
}: {
  laughs: number;
  fans: number;
  word: string;
  fanWord: string;
  last: string;
  onStop: () => void;
  stopRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  bump: number;
}) {
  return (
    <div className="td-panel" role="dialog" aria-label="fans panel">
      <div className="td-panel-top">
        <Icon d={I.grip} size={14} />
        <button type="button" aria-label="collapse panel" onClick={onClose}>
          <Icon d={I.chev} size={14} />
        </button>
      </div>
      <div className="td-panel-head">
        <b>{CHANNEL}</b>
        <span>
          live <i className="td-rec" />
        </span>
      </div>
      <p className="td-label">YOU</p>
      <p className="td-big">
        <strong key={bump} className="td-pop">
          {laughs}
        </strong>{' '}
        laughs
      </p>
      <p className="td-line">
        your word: <b>{word || '…'}</b>
      </p>
      <p className="td-line">
        last laugh: <b>{last}</b>
      </p>
      <p className="td-line">
        funniest moment so far: <b>{laughs > 2 ? '0:42' : '—'}</b>
      </p>
      <hr />
      <p className="td-label">FANS</p>
      <p className="td-big teal">
        <strong>{fans}</strong> fans laughing now
      </p>
      <Meter level={Math.min(1, fans / 24)} />
      <p className="td-line td-fanword">
        top fan word {fanWord ? <em>{fanWord}</em> : <b>…</b>}
      </p>
      <div className="td-panel-actions">
        <span className="td-round big">
          <Icon d={I.pause} size={13} />
        </span>
        <button
          ref={stopRef}
          type="button"
          className="td-round big"
          aria-label="stop session"
          onClick={onStop}
        >
          <Icon d={I.stop} size={12} />
        </button>
      </div>
      <p className="td-panel-foot">demo · simulated fans</p>
    </div>
  );
}

function StopSheet({
  onRecap,
  recapRef,
  onLater,
}: {
  onRecap: () => void;
  recapRef: RefObject<HTMLButtonElement | null>;
  onLater: () => void;
}) {
  return (
    <div className="td-sheet" role="status">
      <p>stream saved · 1h 12m · 23 laughs</p>
      <div>
        <button ref={recapRef} type="button" onClick={onRecap}>
          see recap
        </button>
        <button type="button" onClick={onLater}>
          later
        </button>
      </div>
      <span>discard</span>
    </div>
  );
}

const STORIES = [
  { tone: 'coral', key: 'laughs' },
  { tone: 'teal', key: 'minute' },
  { tone: 'yellow', key: 'words' },
  { tone: 'pink', key: 'streak' },
] as const;

function StoryBody({ index }: { index: number }) {
  if (index === 0)
    return (
      <>
        <p className="td-s-kicker">you laughed</p>
        <p className="td-s-num">23</p>
        <p className="td-s-strong">times with {CHANNEL}</p>
        <p className="td-s-small">about 19 an hour</p>
        <p className="td-s-small">10 more than usual with {CHANNEL}</p>
      </>
    );
  if (index === 1)
    return (
      <>
        <p className="td-s-kicker">your biggest minute</p>
        <p className="td-s-num">42:10</p>
        <p className="td-s-strong">you laughed 6 times in a minute</p>
        <p className="td-s-small">open the VOD at this moment</p>
      </>
    );
  if (index === 2)
    return (
      <>
        <p className="td-s-kicker">your words</p>
        <p className="td-s-small">most used word</p>
        <p className="td-s-quote">“let’s go”</p>
        <p className="td-s-small">9 times</p>
        <div className="td-s-chips">
          <span>4 hype shouts</span>
          <span>1 gasp</span>
          <span>2 screams</span>
        </div>
      </>
    );
  return (
    <>
      <p className="td-s-kicker">you + {CHANNEL}</p>
      <p className="td-s-strong big">your 4th stream with {CHANNEL}</p>
      <p className="td-s-num">61</p>
      <p className="td-s-strong">laughs together</p>
      <div className="td-s-bars" aria-hidden="true">
        {[12, 18, 8, 23].map((v, i) => (
          <i key={i} style={{ height: `${(v / 23) * 100}%` }} />
        ))}
      </div>
      <p className="td-s-small">Oct 30 · Oct 31 · Nov 1 · Nov 2</p>
    </>
  );
}

function Recap({
  story,
  setStory,
  onClose,
}: {
  story: number;
  setStory: (n: number) => void;
  onClose: () => void;
}) {
  const s = STORIES[story]!;
  return (
    <div className="td-recap-backdrop">
      <div className="td-recap-tab">
        <span>
          <AppIcon size={16} /> your recap · {CHANNEL}
        </span>
        <button type="button" onClick={onClose} aria-label="close recap">
          ×
        </button>
      </div>
      <div className="td-recap-row">
        <button
          type="button"
          className="td-recap-nav"
          aria-label="previous story"
          onClick={() => setStory(Math.max(0, story - 1))}
          disabled={story === 0}
        >
          <Icon d={I.back} />
        </button>
        <div className={`td-story tone-${s.tone}`} key={story}>
          <div className="td-story-bars">
            {STORIES.map((x, i) => (
              <i
                key={x.key}
                className={i < story ? 'done' : i === story ? 'now' : ''}
              />
            ))}
          </div>
          <div className="td-story-head">
            <Avatar letter="P" color="#14141a" size={22} />
            <span>
              <b>{CHANNEL}</b>
              <small>Nov 2, 2026</small>
            </span>
          </div>
          <div className="td-story-body">
            <StoryBody index={story} />
          </div>
          <div className="td-story-foot">
            <AppIcon size={14} /> streamlaughs
          </div>
        </div>
        <button
          type="button"
          className="td-recap-nav"
          aria-label="next story"
          onClick={() => setStory(Math.min(STORIES.length - 1, story + 1))}
          disabled={story === STORIES.length - 1}
        >
          <Icon d={I.fwd} />
        </button>
      </div>
    </div>
  );
}

function QR() {
  // A decorative QR-style pattern. The real card draws a working QR locally.
  const cells: ReactNode[] = [];
  let seed = 7;
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      let on: boolean;
      if (finder) {
        const fx = x > 13 ? x - 14 : x,
          fy = y > 13 ? y - 14 : y;
        on =
          fx === 0 ||
          fx === 6 ||
          fy === 0 ||
          fy === 6 ||
          (fx > 1 && fx < 5 && fy > 1 && fy < 5);
      } else {
        seed = (seed * 9301 + 49297) % 233280;
        on = seed / 233280 > 0.52;
      }
      if (on)
        cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  return (
    <svg viewBox="0 0 21 21" className="td-qr" aria-hidden="true">
      {cells}
    </svg>
  );
}

function ShareCard({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="td-recap-backdrop">
      <div className="td-recap-tab">
        <span>
          <AppIcon size={16} /> share your night
        </span>
      </div>
      <div className="td-share">
        <div className="td-card">
          <div className="td-card-head">
            <AppIcon size={26} />
            <span>
              <b>my night with {CHANNEL}</b>
              <small>Nov 2, 2026 · 1h 12m</small>
            </span>
          </div>
          <p className="td-card-num">23</p>
          <p className="td-card-label">laughs</p>
          <div className="td-card-grid">
            <span>
              <small>biggest minute</small>
              <b>42:10</b>
            </span>
            <span>
              <small>my word</small>
              <b>“let’s go”</b>
            </span>
            <span>
              <small>fans laughing with me</small>
              <b>27</b>
            </span>
            <span>
              <small>streams together</small>
              <b>4</b>
            </span>
          </div>
          <div className="td-card-foot">
            <QR />
            <span>
              see who’s laughing with you
              <b>streamlaughs.vercel.app</b>
            </span>
          </div>
        </div>
        <div className="td-share-actions">
          <p>made on your device · only stats, no audio</p>
          <button type="button" className="td-share-btn yellow">
            <Icon d={I.download} size={15} /> save image
          </button>
          <button type="button" className="td-share-btn" onClick={onCopy}>
            <Icon d={copied ? I.check : I.link} size={15} />
            {copied ? 'link copied' : 'copy link'}
          </button>
          <button type="button" className="td-share-btn">
            <Icon d={I.share} size={15} /> post it
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- demo ---------------------------------- */

export function ExtensionDemo() {
  const track = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  useScrollZoom(track, frame, stage, scaleRef);

  const iconRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const dotRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const recapRef = useRef<HTMLButtonElement>(null);
  const laughRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);

  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const [popup, setPopup] = useState(false);
  const [recording, setRecording] = useState(false);
  const [panel, setPanel] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [recap, setRecap] = useState(false);
  const [share, setShare] = useState(false);
  const [story, setStory] = useState(0);
  const [laughs, setLaughs] = useState(0);
  const [bump, setBump] = useState(0);
  const [fans, setFans] = useState(0);
  const [word, setWord] = useState('');
  const [fanWord, setFanWord] = useState('');
  const [last, setLast] = useState('—');
  const [pops, setPops] = useState<{ id: number; text: string }[]>([]);
  const [chat, setChat] = useState<Chat[]>([]);
  const [mood, setMood] = useState<'calm' | 'funny' | 'hype'>('calm');
  const [cursor, setCursor] = useState({
    x: 1100,
    y: 140,
    click: 0,
    show: false,
  });
  const [copied, setCopied] = useState(false);
  const [skip, setSkip] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  // Start autoplay only once the demo is actually on screen.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setVisible(!!e?.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Live chat that reacts to the moment.
  useEffect(() => {
    let id = 0;
    const seedChat = Array.from({ length: 9 }, () => {
      const [name, color] = pick(NAMES);
      return { id: id++, name, color, text: pick(CALM) };
    });
    setChat(seedChat);
    const tick = setInterval(
      () => {
        setChat((list) => {
          const [name, color] = pick(NAMES);
          const pool = mood === 'funny' ? FUNNY : mood === 'hype' ? HYPE : CALM;
          return [
            ...list.slice(-16),
            { id: id++, name, color, text: pick(pool) },
          ];
        });
      },
      mood === 'calm' ? 1500 : 520,
    );
    return () => clearInterval(tick);
  }, [mood]);

  const pop = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setPops((p) => [...p, { id, text }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1400);
  }, []);

  const laugh = useCallback(() => {
    setLaughs((n) => n + 1);
    setBump((b) => b + 1);
    setLast('just now');
    pop('+1 laugh');
    setMood('funny');
  }, [pop]);

  const rel = (el: HTMLElement | null) => {
    const s = stage.current;
    if (!el || !s) return null;
    const a = el.getBoundingClientRect(),
      b = s.getBoundingClientRect();
    return {
      x: (a.left - b.left + a.width / 2) / scaleRef.current,
      y: (a.top - b.top + a.height / 2) / scaleRef.current,
    };
  };

  /** Autoplay: glide the fake cursor to an element, click it, then act. */
  const autoClick = (ref: RefObject<HTMLElement | null>, act: () => void) => {
    const p = rel(ref.current);
    if (!p) {
      act();
      return;
    }
    setCursor((c) => ({ ...c, x: p.x, y: p.y, show: true }));
    later(750, () => {
      setCursor((c) => ({ ...c, click: c.click + 1 }));
      later(180, act);
    });
  };

  const reset = () => {
    setPopup(false);
    setRecording(false);
    setPanel(false);
    setSheet(false);
    setRecap(false);
    setShare(false);
    setStory(0);
    setLaughs(0);
    setFans(0);
    setWord('');
    setFanWord('');
    setLast('—');
    setMood('calm');
    setCopied(false);
    setSkip(false);
  };

  // What each step looks like when you arrive at it.
  const enter = (n: number) => {
    clearTimers();
    if (n === 0) reset();
    if (n === 1) {
      setPopup(true);
    }
    if (n === 2) {
      setPopup(false);
      setRecording(true);
      setPanel(false);
      setFans(3);
      later(1300, laugh);
      later(2900, laugh);
      later(4100, laugh);
    }
    if (n === 3) {
      setRecording(true);
      setPanel(true);
      setMood('funny');
      setFanWord('LMAO');
      const ramp = [6, 11, 15, 19, 24, 27];
      ramp.forEach((v, i) => {
        later(450 + i * 520, () => setFans(v));
      });
      later(1600, laugh);
      later(3400, laugh);
      later(4600, () => setFans(22));
    }
    if (n === 4) {
      setPanel(true);
      setMood('hype');
      later(700, () => {
        setWord('let’s go');
        pop('“let’s go”');
      });
      later(1500, () => setFanWord('LETS GO'));
      later(2400, () => setFans(18));
    }
    if (n === 5) {
      setPanel(false);
      setRecording(false);
      setSkip(true);
      setLaughs(23);
      setWord('let’s go');
      setMood('calm');
      setSheet(true);
      later(1800, () => setSkip(false));
    }
    if (n === 6) {
      setSheet(false);
      setShare(false);
      setRecap(true);
      setStory(0);
      [1, 2, 3].forEach((s, i) => {
        later(2600 * (i + 1), () => setStory(s));
      });
    }
    if (n === 7) {
      setRecap(false);
      setShare(true);
    }
  };

  const go = (n: number) => {
    const next = (n + STEPS.length) % STEPS.length;
    setStep(next);
    enter(next);
  };

  // The action each step's main button performs.
  const act = (n: number) => {
    if (n === 0) go(1);
    else if (n === 1) go(2);
    else if (n === 2) go(3);
    else if (n === 3) go(4);
    else if (n === 4) go(5);
    else if (n === 5) go(6);
    else if (n === 6) go(7);
    else go(0);
  };

  // Autoplay drives the same clicks a person would make, with a visible cursor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-armed per step
  useEffect(() => {
    if (!auto || !visible) {
      setCursor((c) => ({ ...c, show: false }));
      return;
    }
    const hold = STEPS[step]!.hold;
    const target: Record<number, RefObject<HTMLElement | null> | null> = {
      0: iconRef,
      1: startRef,
      2: dotRef,
      3: mainRef,
      4: stopRef,
      5: recapRef,
      6: mainRef,
      7: mainRef,
    };
    const ref = target[step];
    const t = setTimeout(() => {
      if (ref) autoClick(ref, () => act(step));
      else act(step);
    }, hold);
    return () => clearTimeout(t);
  }, [step, auto, visible]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const manual = (fn: () => void) => () => {
    setAuto(false);
    fn();
  };

  const s = STEPS[step]!;
  return (
    <div className="td-wrap td-track" ref={track}>
      <div className="td-sticky">
        <div className="td-frame" ref={frame}>
          <div className="td-stage" ref={stage} style={{ width: W, height: H }}>
            {/* browser chrome */}
            <div className="td-tabs">
              <span className="td-lights">
                <i />
                <i />
                <i />
              </span>
              <span className="td-tab">
                <span className="td-tab-icon" />
                {CHANNEL} - live
                {recording && <i className="td-tab-rec" title="mic in use" />}
                <span className="td-x">×</span>
              </span>
              <span className="td-newtab">+</span>
            </div>
            <div className="td-bar">
              <span className="td-nav">
                <Icon d={I.back} size={16} />
                <Icon d={I.fwd} size={16} />
                <Icon d={I.reload} size={15} />
              </span>
              <span className="td-url">
                <Icon d={I.lock} size={12} />
                twitch.tv/<b>{CHANNEL}</b>
                <span className="td-url-right">
                  {recording && (
                    <span className="td-mic-chip">
                      <Icon d={I.mic} size={11} />
                    </span>
                  )}
                  <Icon d={I.star} size={14} />
                </span>
              </span>
              <span className="td-ext">
                <button
                  ref={iconRef}
                  type="button"
                  className={`td-ext-icon ${step === 0 ? 'is-hint' : ''} ${popup ? 'is-open' : ''}`}
                  aria-label="open StreamLaughs"
                  onClick={manual(() => (popup ? setPopup(false) : go(1)))}
                >
                  <AppIcon size={20} />
                  {recording && <i className="td-ext-rec" />}
                </button>
                <Icon d={I.puzzle} size={16} />
                <span className="td-me">U</span>
                <Icon d={I.dots} size={16} />
              </span>
            </div>

            {/* streaming site */}
            <div className="td-site">
              <div className="td-topnav">
                <span className="td-logo" aria-hidden="true" />
                <b>Following</b>
                <b>Browse</b>
                <Icon d={I.dots} size={16} />
                <span className="td-search">
                  <span>Search</span>
                  <i>
                    <Icon d={I.search} size={15} />
                  </i>
                </span>
                <span className="td-topnav-right">
                  <Icon d={I.inbox} size={18} />
                  <Icon d={I.bell} size={18} />
                  <span className="td-getbits">Get Bits</span>
                  <span className="td-me sm">U</span>
                </span>
              </div>
              <div className="td-body">
                <aside className="td-side">
                  <Icon d={I.heart} size={16} />
                  {[
                    ['P', '#2ee6c5', true],
                    ['M', '#ff5c5c', true],
                    ['L', '#ffd23f', true],
                    ['K', '#7aa7ff', true],
                    ['D', '#c58bff', false],
                    ['S', '#ff9e7a', false],
                  ].map(([l, c, live]) => (
                    <span
                      key={String(l)}
                      className={`td-side-item ${live ? '' : 'off'}`}
                    >
                      <Avatar letter={String(l)} color={String(c)} size={30} />
                      {live && <i />}
                    </span>
                  ))}
                </aside>

                <main className="td-main">
                  <div className="td-player">
                    <div className="td-video" />
                    <span className="td-live">LIVE</span>
                    {skip && <span className="td-skip">⏩ 1 hour later</span>}
                    <div className="td-controls">
                      <Icon d={I.pause} size={16} />
                      <Icon d={I.volume} size={16} />
                      <span className="td-controls-right">
                        <Icon d={I.gear} size={16} />
                        <Icon d={I.full} size={16} />
                      </span>
                    </div>

                    {(recording || sheet) && (
                      <button
                        ref={dotRef}
                        type="button"
                        className={`td-dot ${bump % 2 ? 'b1' : 'b2'} ${panel ? 'is-open' : ''}`}
                        aria-label="StreamLaughs dot"
                        onClick={manual(() =>
                          step === 2 ? go(3) : setPanel((p) => !p),
                        )}
                      >
                        <AppIcon size={18} mono />
                        {recording && <i className="td-rec" />}
                      </button>
                    )}
                    <div className="td-pops" aria-live="polite">
                      {pops.map((p) => (
                        <span key={p.id}>{p.text}</span>
                      ))}
                    </div>
                    {panel && (
                      <FansPanel
                        laughs={laughs}
                        fans={fans}
                        word={word}
                        fanWord={fanWord}
                        last={last}
                        bump={bump}
                        stopRef={stopRef}
                        onStop={manual(() => go(5))}
                        onClose={manual(() => setPanel(false))}
                      />
                    )}
                    {sheet && (
                      <StopSheet
                        recapRef={recapRef}
                        onRecap={manual(() => go(6))}
                        onLater={manual(() => setSheet(false))}
                      />
                    )}
                  </div>
                  <div className="td-info">
                    <Avatar letter="P" color="#2ee6c5" size={52} live />
                    <div className="td-info-text">
                      <b>
                        {CHANNEL} <span className="td-verified">✓</span>
                      </b>
                      <p>one more try. no rage. (this is a lie)</p>
                      <span className="td-tags">
                        <span className="td-cat">Neon Runner</span>
                        <i>English</i>
                        <i>Platformer</i>
                        <i>Chill</i>
                      </span>
                    </div>
                    <div className="td-info-right">
                      <span className="td-follow">
                        <Icon d={I.heart} size={14} /> Follow
                      </span>
                      <span className="td-sub">Subscribe</span>
                      <p>
                        <span className="td-viewers">
                          <Icon d={I.user} size={13} /> 4,812
                        </span>
                        <span>2:41:07</span>
                      </p>
                    </div>
                  </div>
                </main>

                <aside className="td-chat">
                  <header>
                    <span />
                    <b>STREAM CHAT</b>
                    <Icon d={I.user} size={15} />
                  </header>
                  <div className="td-chat-list">
                    {chat.map((m) => (
                      <p key={m.id}>
                        <b style={{ color: m.color }}>{m.name}</b>: {m.text}
                      </p>
                    ))}
                  </div>
                  <footer>
                    <span className="td-chat-input">Send a message</span>
                    <span className="td-chat-row">
                      <span className="td-points">◎ 2.4K</span>
                      <span className="td-chat-btn">Chat</span>
                    </span>
                  </footer>
                </aside>
              </div>
            </div>

            {popup && (
              <Popup
                startRef={startRef}
                glow={step === 1}
                onStart={manual(() => go(2))}
              />
            )}
            {recap && (
              <Recap
                story={story}
                setStory={(n) => {
                  setAuto(false);
                  clearTimers();
                  setStory(n);
                }}
                onClose={manual(() => go(7))}
              />
            )}
            {share && (
              <ShareCard
                copied={copied}
                onCopy={() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              />
            )}

            <span
              className={`td-cursor ${cursor.show ? 'show' : ''}`}
              style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
              aria-hidden="true"
            >
              <svg
                width="22"
                height="26"
                viewBox="0 0 22 26"
                aria-hidden="true"
              >
                <path
                  d="M2 2l17 10.5-7.6 1.4L15.6 23l-3.3 1.5-4.2-9.1L2.6 21z"
                  fill="#fff"
                  stroke="#14141a"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              <i key={cursor.click} className={cursor.click ? 'ring' : ''} />
            </span>
          </div>
        </div>

        {/* guide */}
        <div className="td-guide">
          <div className="td-progress" aria-hidden="true">
            {STEPS.map((x, i) => (
              <button
                key={x.title}
                type="button"
                tabIndex={-1}
                className={i < step ? 'done' : i === step ? 'now' : ''}
                onClick={manual(() => go(i))}
              >
                <i
                  style={
                    i === step && auto && visible
                      ? ({
                          animationDuration: `${STEPS[step]!.hold + 950}ms`,
                        } as CSSProperties)
                      : undefined
                  }
                  className={i === step && auto && visible ? 'run' : ''}
                  key={`${step}-${auto}`}
                />
              </button>
            ))}
          </div>
          <div className="td-guide-row">
            <div className="td-guide-copy" key={step}>
              <p className="td-guide-step">
                step {step + 1} of {STEPS.length}
              </p>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
            <div className="td-guide-actions">
              {(step === 2 || step === 3) && (
                <button
                  ref={laughRef}
                  type="button"
                  className="td-g-btn ghost"
                  onClick={() => {
                    setAuto(false);
                    laugh();
                    if (step === 3) setFans((f) => Math.min(31, f + 2));
                  }}
                >
                  😂 laugh
                </button>
              )}
              <button
                type="button"
                className="td-g-btn ghost icon"
                aria-label="back"
                onClick={manual(() => go(Math.max(0, step - 1)))}
                disabled={step === 0}
              >
                <Icon d={I.back} />
              </button>
              <button
                ref={mainRef}
                type="button"
                className="td-g-btn yellow"
                onClick={manual(() => act(step))}
              >
                {s.action}
                <Icon d={I.fwd} size={16} />
              </button>
              <button
                type="button"
                className="td-g-btn ghost icon"
                aria-label={auto ? 'pause autoplay' : 'play autoplay'}
                onClick={() => setAuto((a) => !a)}
              >
                <Icon d={auto ? I.pause : I.play} size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
