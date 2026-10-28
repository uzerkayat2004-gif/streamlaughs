import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { AUDIO_DEBUG } from './audio/config';
import { command, connectSurface, surface } from './bridge';
import { Mark } from './components';
import type { InferencePipeline } from './inference/pipeline';

type AiDebug = ReturnType<InferencePipeline['debugState']> & {
  loadMs: Record<string, number>;
  times: Record<string, number>;
  calls: Record<string, number>;
};

export function Debug() {
  const { snapshot } = useStore(surface.store),
    [error, setError] = useState('');
  useEffect(() => (AUDIO_DEBUG ? connectSurface() : undefined), []);
  const [ai, setAi] = useState<AiDebug | null>(null);
  useEffect(() => {
    if (!AUDIO_DEBUG) return;
    let alive = true;
    const poll = () => {
      void chrome.runtime.sendMessage({ type: 'AI_DEBUG' }).then(
        (value) => {
          if (alive) setAi(value);
        },
        () => {},
      );
    };
    const timer = setInterval(poll, 750);
    poll();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!AUDIO_DEBUG)
    return (
      <main className="empty-recap">
        <Mark />
        <p>Audio debug is disabled in this build.</p>
      </main>
    );
  const { capture } = snapshot,
    { metrics } = capture;
  const rows = [
    ['mic frames/s', metrics.micFps.toFixed(1)],
    ['tab frames/s', metrics.tabFps.toFixed(1)],
    ['mic frames', metrics.micFrames],
    ['tab frames', metrics.tabFrames],
    ['mic buffered samples', metrics.micSamples],
    ['tab buffered samples', metrics.tabSamples],
    ['dropped frames', metrics.droppedFrames],
    ['CPU ms / frame', metrics.cpuMsPerFrame.toFixed(3)],
    ['CPU ms / second', metrics.cpuMsPerSecond.toFixed(2)],
  ];
  async function act(type: 'DEBUG_MIC_START' | 'STOP' | 'PAUSE') {
    try {
      setError('');
      await command({ type });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Try again');
    }
  }
  return (
    <main className="audio-debug">
      <Mark />
      <h1>local audio</h1>
      <p>
        capture state:{' '}
        <strong data-testid="capture-phase">{capture.phase}</strong>
        {capture.micLost && ' · mic lost'}
      </p>
      {(['mic', 'tab'] as const).map((source) => (
        <label className="audio-meter" key={source}>
          {source} level{' '}
          <meter
            aria-label={`${source} level`}
            min={0}
            max={1}
            value={metrics[`${source}Level`]}
          />
          <span>{metrics[`${source}Level`].toFixed(4)}</span>
        </label>
      ))}
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd data-testid={String(label).replaceAll(' ', '-')}>{value}</dd>
          </div>
        ))}
      </dl>
      <h2>on-device detection</h2>
      <p data-testid="inference-phase">
        {snapshot.inference.phase} · {snapshot.inference.backend}{' '}
        {snapshot.inference.lowPower && '· low power: words paused'}
      </p>
      <dl>
        {Object.entries(snapshot.inference)
          .filter(([, value]) => typeof value === 'number')
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{typeof value === 'number' ? value.toFixed(3) : value}</dd>
            </div>
          ))}
      </dl>
      {ai && (
        <>
          <p>
            headphones likely:{' '}
            {ai.headphonesLikely === null
              ? 'unknown'
              : ai.headphonesLikely
                ? 'yes (heuristic)'
                : 'no (heuristic)'}{' '}
            · correlation: {ai.correlation.toFixed(3)}
          </p>
          <dl>
            {(['mic', 'tab'] as const).flatMap((source) =>
              Object.entries(ai.scores[source]).map(([kind, score]) => (
                <div key={`${source}-${kind}`}>
                  <dt>
                    {source} {kind}
                  </dt>
                  <dd>{score.toFixed(3)}</dd>
                </div>
              )),
            )}
          </dl>
          <dl>
            {Object.entries(ai.loadMs).map(([name, ms]) => (
              <div key={name}>
                <dt>{name} load ms / mean inference ms</dt>
                <dd>
                  {ms.toFixed(1)} /{' '}
                  {(
                    (ai.times[name] ?? 0) / Math.max(1, ai.calls[name] ?? 0)
                  ).toFixed(2)}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Inference elapsed ms/s ≈{' '}
            {(snapshot.inference.realTimeFactor * 1000).toFixed(1)}. GPU wait
            time is included; this is not OS CPU utilization.
          </p>
          <details>
            <summary>recent decisions (bounded to 40)</summary>
            <ul>
              {ai.reasons.map((reason, i) => (
                <li key={i}>
                  {reason.kind}: {reason.reason}
                </li>
              ))}
            </ul>
          </details>
          <label>
            Last transcript · debug RAM only
            <textarea readOnly value={ai.lastTranscript} />
          </label>
        </>
      )}
      <p className="sub">
        16 kHz mono · 320 samples / 20 ms · 30 seconds per source, in memory
        only. CPU is an elapsed processing-time estimate with the worklet
        clock’s resolution, not an OS profiler.
      </p>
      <p className="sub">
        When a live session is running these meters follow its offscreen owner.
        The microphone diagnostic below captures only the microphone, uses the
        same owner/worklet, and saves no session.
      </p>
      <a className="textbtn" href="/welcome.html?step=mic">
        allow mic
      </a>
      <button
        type="button"
        className="btn"
        disabled={!!snapshot.session || capture.phase !== 'idle'}
        onClick={() => void act('DEBUG_MIC_START')}
      >
        test microphone
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={capture.phase === 'idle'}
        onClick={() => void act('STOP')}
      >
        stop audio
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
