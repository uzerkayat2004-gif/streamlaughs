'use client';
import { PRODUCT } from '@laughline/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoMark } from './brand';
import './extension-demo.css';

// Browser-independent adaptations of Popup.tsx, Overlay.tsx and all six
// Recap.tsx stories. All values below are explicitly simulated, never captured.
const steps = [
  [
    'your seat is saved.',
    `Click the yellow ${PRODUCT.name} icon beside the address bar.`,
    'open the extension',
  ],
  [
    'one click. you’re in.',
    'Press Start. The real extension asks for mic access in Welcome first.',
    'press start',
  ],
  [
    'wait for that moment…',
    'A laugh lights up the dot. Drag it, or tap it to open the live fan view.',
    'make a funny moment happen',
  ],
  [
    'your laugh. your choice.',
    'Switch sharing on or off. Your own reactions still stay in your private recap.',
    'end the demo stream',
  ],
  [
    'the good bits, kept.',
    'Explore every story in your personal recap. These are sample numbers.',
    'replay the demo',
  ],
] as const;
const storyNames = [
  'your laughs',
  'you + fans',
  'your word',
  'hardest laugh',
  'laugh style',
  'share card',
];
function ExtensionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 128 128" aria-hidden="true">
      <rect width="128" height="128" rx="32" fill="#15151d" />
      <path
        d="M30 68Q64 125 98 68"
        fill="none"
        stroke="#FFD23F"
        strokeWidth="12"
      />
    </svg>
  );
}
function ExtensionMark() {
  return (
    <div className="mark">
      <b>{PRODUCT.wordmark}</b>
      <svg width="54" height="7" viewBox="0 0 54 7" aria-hidden="true">
        <path
          d="M2 1.5c6 3.6 14 4.6 25 4.6s19-1 25-4.6"
          fill="none"
          stroke="#FFD23F"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
function ReactionBlob({ count = 0 }: { count?: number }) {
  return (
    <div className="replica-blob">
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <path d="M120 21C173 6 225 61 220 115C231 171 188 222 132 218C75 237 16 185 22 130C6 77 65 14 120 21Z" />
      </svg>
      {count ? (
        <>
          <strong>{count}</strong>
          <span>laughing now</span>
        </>
      ) : (
        <svg className="replica-face" viewBox="0 0 100 85" aria-hidden="true">
          <path d="M27 25v8m46-8v8M22 51q28 33 56 0" />
        </svg>
      )}
    </div>
  );
}

function RecapStories({
  story,
  go,
  session,
  selectSession,
}: {
  story: number;
  go: (n: number) => void;
  session: number;
  selectSession: (n: number) => void;
}) {
  const [message, setMessage] = useState('');
  const laughs = [76, 41, 18][session]!;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('copied · demo only');
    } catch {
      setMessage('copy unavailable · try again');
    }
  }
  return (
    <div className="replica-recap">
      <div className="x-card" data-tone={story < 2 ? 'light' : 'dark'}>
        <div className="x-bars" aria-hidden="true">
          {storyNames.map((name, i) => (
            <i key={name} className={i <= story ? 'is-done' : ''}>
              <b />
            </i>
          ))}
        </div>
        <div
          className={`x-st is-on ${['x-st--sun', 'x-st--sea', 'x-st--word', 'x-st--hard', 'x-st--style', 'x-st--share'][story]}`}
        >
          {story === 0 && (
            <>
              <p className="x-ln x-kick">you laughed</p>
              <p className="x-ln x-giant">{laughs}</p>
              <p className="x-ln x-sub">times with pixelcamp</p>
            </>
          )}
          {story === 1 && (
            <>
              <p className="x-ln x-kick">you vs fans</p>
              <p className="x-ln x-giant">36</p>
              <p className="x-ln x-sub">demo fans · peak laughing together</p>
              <p className="x-ln x-yours">
                you: {laughs} laughs · highest share laughing: 82% · up to 44
                sharing
              </p>
            </>
          )}
          {story === 2 && (
            <>
              <div className="x-float" aria-hidden="true">
                <span style={{ top: '12%', left: '10%' }}>no way</span>
                <span style={{ bottom: '16%', right: '10%' }}>haha</span>
              </div>
              <p className="x-ln x-kick">your word of the night</p>
              <p className="x-ln x-giant">“BRO”</p>
              <p className="x-ln x-sub">said 9 times</p>
              <p className="x-ln x-yours">
                3 masked swears · 4 hype shouts · 2 screams · 1 gasp
              </p>
            </>
          )}
          {story === 3 && (
            <>
              <p className="x-ln x-kick">your hardest laugh</p>
              <p className="x-ln x-giant">47:18</p>
              <p className="x-ln x-sub">24 fan reactions at that moment</p>
              <button
                className="x-ln x-pill x-pill--white"
                type="button"
                onClick={() => void copy('47:18 · demo moment')}
              >
                copy time
              </button>
            </>
          )}
          {story === 4 && (
            <>
              <svg className="x-sq" viewBox="0 0 400 200" aria-hidden="true">
                <path
                  d="M-10 130C40 20 95 20 120 100S205 185 240 95 330 10 410 80"
                  fill="none"
                  stroke="#FFD23F"
                  strokeWidth="16"
                  strokeLinecap="round"
                />
              </svg>
              <p className="x-ln x-kick">your laugh style</p>
              <p className="x-ln x-big">the delayed cackler</p>
              <p className="x-ln x-sub">about 1.2 sec after tab laughter</p>
            </>
          )}
          {story === 5 && (
            <>
              <p className="x-ln x-wm">{PRODUCT.wordmark}</p>
              <p className="x-ln x-giant">{laughs}</p>
              <p className="x-ln x-kick">laughs</p>
              <p className="x-ln x-sub">pixelcamp</p>
              <svg
                className="x-ln x-wave"
                viewBox="0 0 270 60"
                aria-hidden="true"
              >
                <path
                  d="M10 30Q35 6 60 30T110 30 160 30 210 30 260 30"
                  fill="none"
                  stroke="#FFD23F"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M10 30Q35 54 60 30T110 30 160 30 210 30 260 30"
                  fill="none"
                  stroke="#2EE6C5"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
              <div className="x-ln x-acts">
                <button
                  type="button"
                  className="x-pill x-pill--yellow"
                  onClick={() =>
                    void copy(
                      `demo · ${laughs} laughs with pixelcamp · ${PRODUCT.name}`,
                    )
                  }
                >
                  share
                </button>
                <button
                  type="button"
                  className="x-pill x-pill--line"
                  onClick={() => go(0)}
                >
                  replay
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="replica-story-nav">
        <button
          type="button"
          disabled={story === 0}
          onClick={() => go(story - 1)}
        >
          previous
        </button>
        <span>{story + 1} / 6</span>
        <button
          type="button"
          disabled={story === 5}
          onClick={() => go(story + 1)}
        >
          next
        </button>
      </div>
      <div className="replica-past">
        <span>past streams</span>
        {[76, 41, 18].map((count, i) => (
          <button
            key={count}
            type="button"
            aria-label={`demo session with ${count} laughs`}
            aria-pressed={session === i}
            onClick={() => {
              selectSession(i);
              go(0);
            }}
          >
            {count}
          </button>
        ))}
      </div>
      <p className="replica-note" role="status">
        {message || 'demo · stored nowhere'}
      </p>
    </div>
  );
}

export function ExtensionDemo() {
  const [motionReduced, setMotionReduced] = useState(false);
  const [step, setStep] = useState(0),
    [popup, setPopup] = useState(false),
    [sharing, setSharing] = useState(false),
    [settings, setSettings] = useState(false),
    [fanBox, setFanBox] = useState(false),
    [story, setStory] = useState(0),
    [session, setSession] = useState(0),
    [autoplay, setAutoplay] = useState(false),
    [playing, setPlaying] = useState(true);
  const shell = useRef<HTMLDivElement>(null),
    player = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    px: number;
    py: number;
    moved: boolean;
  } | null>(null);
  const [dot, setDot] = useState({ x: 88, y: 14 });
  const active = step >= 2 && step < 4,
    reacted = step >= 3;
  const go = useCallback((next: number) => {
    setStep(next);
    setPopup(next === 1);
    setSettings(false);
    setFanBox(next === 3);
    if (next === 4) setStory(0);
    shell.current?.parentElement?.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }, []);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setMotionReduced(preference.matches);
      if (preference.matches) setAutoplay(false);
    };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!shell.current) return;
    const observer = new ResizeObserver(([entry]) =>
      shell.current?.style.setProperty(
        '--demo-scale',
        String(entry!.contentRect.width / 1000),
      ),
    );
    observer.observe(shell.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!autoplay || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const timer = setTimeout(() => {
      if (document.hidden) {
        setAutoplay(false);
        return;
      }
      if (step === 4) {
        if (story < 5) setStory(story + 1);
        else setAutoplay(false);
      } else go(step + 1);
    }, 5500);
    return () => clearTimeout(timer);
  }, [autoplay, step, story, go]);
  const act = () => {
    setAutoplay(false);
    go(step === 4 ? 0 : step + 1);
  };
  return (
    <div className="demo-experience">
      <div className="demo-shell" ref={shell}>
        <div className="demo-monitor">
          <div className="demo-camera" />
          <div className="demo-browser extension-preview">
            <div className="browser-tabs-bar">
              <span>● ● ●</span>
              <span className="fake-tab">
                {step === 4
                  ? `${PRODUCT.name} · your recap`
                  : 'pixelcamp · live'}{' '}
                <span>×</span>
              </span>
              <span>＋</span>
            </div>
            <div className="browser-address">
              <span>←　→　↻</span>
              <span className="address-field">
                ⌑　{step === 4 ? 'your private recap' : 'twitch.tv/pixelcamp'}
              </span>
              <span>☆</span>
              <button
                type="button"
                className={`demo-toolbar ${step < 2 ? 'is-highlighted' : ''}`}
                aria-label={`open ${PRODUCT.name} popup`}
                onClick={() => {
                  setAutoplay(false);
                  if (step === 0) go(1);
                  else setPopup(!popup);
                }}
              >
                <ExtensionIcon />
              </button>
              <span>⋮</span>
            </div>
            {step === 4 ? (
              <div className="demo-recap-page">
                <RecapStories
                  story={story}
                  go={setStory}
                  session={session}
                  selectSession={setSession}
                />
              </div>
            ) : (
              <div className="fake-stream-page">
                <div className="fake-sidebar">
                  <div className="fake-side-logo">
                    LIVE<span>ROOM</span>
                  </div>
                  {['P', 'M', 'J', 'A', 'S'].map((letter, i) => (
                    <div key={letter} className={`fake-channel ch-${i}`}>
                      {letter}
                      <i />
                    </div>
                  ))}
                </div>
                <div className="fake-stream-main">
                  <div className="fake-stream-top">
                    <b>following</b>
                    <span>discover</span>
                    <span>search for a good time　⌕</span>
                  </div>
                  <div
                    className={`fake-player ${playing ? 'is-playing' : ''}`}
                    ref={player}
                  >
                    <div className="game-sky">
                      <span className="game-title">ONE. MORE. TRY.</span>
                      <svg
                        className="game-scene"
                        viewBox="0 0 650 370"
                        aria-label="animated demo game with a little jumping character"
                        role="img"
                      >
                        <circle cx="520" cy="75" r="33" fill="#FFD23F" />
                        <path
                          d="M0 280 120 175 208 251 325 133 477 279 590 190 650 260V370H0Z"
                          fill="#153d36"
                        />
                        <path
                          d="M0 315h145v-35h130v40h190v-58h185v108H0Z"
                          fill="#246f5e"
                        />
                        <path
                          d="M0 315h145m0-35h130m0 40h190m0-58h185"
                          stroke="#2EE6C5"
                          strokeWidth="4"
                        />
                        <g className="game-character">
                          <rect
                            x="180"
                            y="205"
                            width="46"
                            height="48"
                            rx="18"
                            fill="#FFD23F"
                          />
                          <circle cx="194" cy="224" r="3" fill="#090b10" />
                          <circle cx="211" cy="224" r="3" fill="#090b10" />
                          <path
                            d="M193 237q10 8 20 0"
                            fill="none"
                            stroke="#090b10"
                            strokeWidth="3"
                          />
                        </g>
                        <g fill="#FFD23F">
                          <circle cx="294" cy="220" r="9" />
                          <circle cx="337" cy="192" r="9" />
                          <circle cx="380" cy="220" r="9" />
                        </g>
                      </svg>
                      <div className="fake-facecam">
                        <div className="cam-person">
                          <span>◕ ◕</span>
                          <b>
                            {reacted
                              ? 'DID THAT JUST HAPPEN?'
                              : 'one more try?'}
                          </b>
                        </div>
                      </div>
                    </div>
                    <span className="fake-live">● LIVE · DEMO</span>
                    <div className="player-controls">
                      <button
                        type="button"
                        aria-label={
                          playing
                            ? 'pause demo animation'
                            : 'play demo animation'
                        }
                        onClick={() => setPlaying(!playing)}
                      >
                        {playing ? 'Ⅱ' : '▶'}
                      </button>
                      <span>◖　━━━━━━━━　　live</span>
                      <span>⚙　⛶</span>
                    </div>
                    {active && (
                      <>
                        <button
                          type="button"
                          className={`x-dot ${reacted ? 'dot-reacted' : ''}`}
                          style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
                          aria-label="reaction dot: drag to move or click for live fans"
                          aria-expanded={fanBox}
                          onPointerDown={(event) => {
                            const bounds =
                              player.current!.getBoundingClientRect();
                            drag.current = {
                              x: event.clientX,
                              y: event.clientY,
                              px: dot.x,
                              py: dot.y,
                              moved: false,
                            };
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                            if (!bounds.width) drag.current = null;
                          }}
                          onPointerMove={(event) => {
                            const d = drag.current;
                            if (!d) return;
                            const bounds =
                              player.current!.getBoundingClientRect();
                            d.moved ||=
                              Math.hypot(
                                event.clientX - d.x,
                                event.clientY - d.y,
                              ) > 4;
                            setDot({
                              x: Math.max(
                                2,
                                Math.min(
                                  94,
                                  d.px +
                                    ((event.clientX - d.x) / bounds.width) *
                                      100,
                                ),
                              ),
                              y: Math.max(
                                3,
                                Math.min(
                                  82,
                                  d.py +
                                    ((event.clientY - d.y) / bounds.height) *
                                      100,
                                ),
                              ),
                            });
                          }}
                          onPointerUp={(event) => {
                            event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );
                          }}
                          onPointerCancel={() => {
                            drag.current = null;
                          }}
                          onKeyDown={(event) => {
                            if (!event.key.startsWith('Arrow')) return;
                            event.preventDefault();
                            setDot({
                              x: Math.max(
                                2,
                                Math.min(
                                  94,
                                  dot.x +
                                    (event.key === 'ArrowRight'
                                      ? 3
                                      : event.key === 'ArrowLeft'
                                        ? -3
                                        : 0),
                                ),
                              ),
                              y: Math.max(
                                3,
                                Math.min(
                                  82,
                                  dot.y +
                                    (event.key === 'ArrowDown'
                                      ? 3
                                      : event.key === 'ArrowUp'
                                        ? -3
                                        : 0),
                                ),
                              ),
                            });
                          }}
                          onClick={() => {
                            if (!drag.current?.moved) setFanBox(!fanBox);
                            drag.current = null;
                          }}
                        />
                        {fanBox && (
                          <div className="replica-fanbox">
                            <button
                              className="replica-close"
                              type="button"
                              aria-label="close live fans"
                              onClick={() => setFanBox(false)}
                            >
                              ×
                            </button>
                            <ReactionBlob count={reacted ? 12 : 0} />
                            <span className="replica-top-word">
                              {reacted ? 'lmao' : 'a few here'}
                            </span>
                            <span className="you-pill">
                              ♫　you <b>{reacted ? 7 : 0}</b>
                            </span>
                            <div className="replica-live-controls">
                              <button
                                type="button"
                                onClick={() => {
                                  setAutoplay(false);
                                  go(2);
                                }}
                                aria-label="restart the demo moment"
                              >
                                Ⅱ
                              </button>
                              <button
                                type="button"
                                onClick={() => go(4)}
                                aria-label="stop demo session"
                              >
                                ■
                              </button>
                            </div>
                            <small>demo · simulated fans</small>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="fake-stream-info">
                    <div className="fake-avatar">P</div>
                    <div>
                      <b>
                        pixelcamp <span>✓</span>
                      </b>
                      <p>if I miss this jump again I’m retiring</p>
                      <small>just hanging out · English</small>
                    </div>
                    <span>● 214 watching · demo</span>
                  </div>
                </div>
                <aside className="fake-chat">
                  <h2>
                    stream chat <span>⌁</span>
                  </h2>
                  {[
                    ['sunny', 'one more try 😂'],
                    ['moss', 'you got this'],
                    ['jin', reacted ? 'LMAOOO' : 'surely this time'],
                    ['toast', reacted ? 'no way 💀' : 'the focus is real'],
                    ['ari', 'broooo'],
                    ['sunny', 'clip that'],
                  ].map(([name, text], i) => (
                    <p key={`${name}-${i}`}>
                      <b>{name}</b> {text}
                    </p>
                  ))}
                  <div>
                    send a message… <span>↗</span>
                  </div>
                </aside>
              </div>
            )}
            {popup && step !== 4 && (
              <div className="replica-popup">
                <header>
                  <ExtensionMark />
                  <button
                    type="button"
                    className="replica-gear"
                    aria-label="demo settings"
                    onClick={() => setSettings(!settings)}
                  >
                    ⚙
                  </button>
                </header>
                <div className="who">
                  <span className="av">P</span>
                  <p>pixelcamp</p>
                  {active && <span className="livepill">● live</span>}
                </div>
                {settings ? (
                  <div className="replica-settings">
                    <h3>settings</h3>
                    <div>
                      <span>listen for my laughs</span>
                      <span className="mini-toggle on" />
                    </div>
                    <button
                      type="button"
                      className="replica-toggle-row"
                      role="switch"
                      aria-checked={sharing}
                      onClick={() => setSharing(!sharing)}
                    >
                      <span>
                        share with the fans<small>anonymous</small>
                      </span>
                      <span className={`mini-toggle ${sharing ? 'on' : ''}`} />
                    </button>
                    <p>
                      Audio is processed on your PC and never saved or sent.
                    </p>
                    <button
                      type="button"
                      className="replica-text-button"
                      onClick={() => setSettings(false)}
                    >
                      back
                    </button>
                  </div>
                ) : (
                  <>
                    <ReactionBlob count={active && reacted ? 12 : 0} />
                    {!active ? (
                      <>
                        <h3>{PRODUCT.pitch}.</h3>
                        <p className="replica-sub">
                          your laughs. everyone’s reactions.
                        </p>
                        <button
                          type="button"
                          className="replica-start"
                          onClick={() => {
                            setAutoplay(false);
                            go(2);
                          }}
                        >
                          start <span>→</span>
                        </button>
                      </>
                    ) : (
                      <div className="replica-live-controls">
                        <span className="you-pill">
                          ♫　you <b>{reacted ? 7 : 0}</b>
                        </span>
                        <button
                          type="button"
                          onClick={() => go(4)}
                          aria-label="stop demo session"
                        >
                          ■ stop
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="monitor-chin">
            <LogoMark size={17} />
            <span>demo · all reactions are simulated</span>
          </div>
        </div>
      </div>
      <div className="walkthrough">
        <div className="walkthrough-top">
          <p className="eyebrow">
            {String(step + 1).padStart(2, '0')} / 05 ·{' '}
            {step === 4 ? 'YOUR PRIVATE RECAP' : 'THE VIEWER EXPERIENCE'}
          </p>
          <button
            type="button"
            className="text-link"
            aria-pressed={autoplay}
            disabled={motionReduced}
            onClick={() => setAutoplay(!autoplay)}
          >
            {motionReduced
              ? 'manual mode'
              : autoplay
                ? 'pause autoplay Ⅱ'
                : 'autoplay ▶'}
          </button>
        </div>
        <h2>{steps[step]![0]}</h2>
        <p aria-live="polite">{steps[step]![1]}</p>
        {step === 3 && (
          <button
            type="button"
            className="sharing-control"
            role="switch"
            aria-checked={sharing}
            onClick={() => {
              setAutoplay(false);
              setSharing(!sharing);
              setPopup(true);
              setSettings(true);
            }}
          >
            <span className={`mini-toggle ${sharing ? 'on' : ''}`} />
            share with the fans{' '}
            <small>{sharing ? 'on · anonymous' : 'off · just watching'}</small>
          </button>
        )}
        {step === 4 && (
          <fieldset className="recap-picker" aria-label="recap stories">
            {storyNames.map((name, i) => (
              <button
                type="button"
                key={name}
                aria-pressed={story === i}
                onClick={() => {
                  setAutoplay(false);
                  setStory(i);
                  shell.current?.scrollIntoView({
                    block: 'start',
                    behavior: matchMedia('(prefers-reduced-motion: reduce)')
                      .matches
                      ? 'instant'
                      : 'smooth',
                  });
                }}
              >
                {i + 1}. {name}
              </button>
            ))}
          </fieldset>
        )}
        <div className="walkthrough-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={step === 0}
            onClick={() => {
              setAutoplay(false);
              go(step - 1);
            }}
          >
            ← back
          </button>
          <fieldset className="walkthrough-dots" aria-label="walkthrough steps">
            {steps.map(([title], i) => (
              <button
                type="button"
                key={title}
                aria-label={`step ${i + 1}: ${title}`}
                aria-current={step === i ? 'step' : undefined}
                onClick={() => {
                  setAutoplay(false);
                  go(i);
                }}
              >
                <span />
              </button>
            ))}
          </fieldset>
          <button type="button" className="button yellow" onClick={act}>
            {steps[step]![2]} <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
