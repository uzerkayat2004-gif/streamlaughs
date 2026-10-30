import { useEffect, useState } from 'react';
import {
  copyableReport,
  type DiagnosticsReport,
  DiagnosticsSchema,
} from './diagnostics';

export function usePipelineReport(enabled = true, preview = false) {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [phrase, setPhrase] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let alive = true,
      busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = DiagnosticsSchema.parse(
          await chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' }),
        );
        if (alive) setReport(next);
        if (preview) {
          const value = await chrome.runtime.sendMessage({
            type: 'GET_AUDIO_PREVIEW',
          });
          if (alive && typeof value === 'string') setPhrase(value.slice(0, 80));
        }
      } catch {
        /* A restarting background is retried on the next poll. */
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 500);
    return () => {
      alive = false;
      clearInterval(timer);
      setPhrase('');
    };
  }, [enabled, preview]);
  return { report, phrase };
}
export function micProblem(report: DiagnosticsReport | null) {
  if (!report) return 'connecting to the local audio owner…';
  if (!report.offscreenAlive)
    return report.error
      ? `no microphone capture · ${report.error}`
      : 'microphone is not running · start a mic check';
  if (report.audio?.error) return report.audio.error;
  const failed = Object.entries(report.inference?.models ?? {}).find(
    ([, model]) => model.phase === 'error' || model.error,
  );
  if (failed)
    return `${failed[0]} model failed to load or run · ${failed[1].error}`;
  if (report.inference?.error)
    return `model failed · ${report.inference.error}`;
  if (report.audio?.mic.state !== 'live')
    return 'no live microphone · allow microphone access and retry';
  if (report.audio.mic.muted || !report.audio.mic.enabled)
    return 'microphone is muted · unmute your input';
  if (report.audio.context !== 'running')
    return 'audio context is suspended · restart audio';
  if (
    report.audio.metrics.micFrames > 200 &&
    !report.inference?.stages.nonzeroFrames
  )
    return 'no audio from this microphone · check the selected Windows input';
  if (report.inference?.health.phase !== 'ready')
    return 'loading the local models…';
  if (
    Object.values(report.inference.models).some(
      (model) => model.phase !== 'ready',
    )
  )
    return 'loading the local models…';
  if (report.inference.health.lowPower)
    return 'low power · words are paused; laughs still run';
  return '';
}
export function PipelineDebug({ close }: { close: () => void }) {
  const { report: r, phrase } = usePipelineReport(true, true);
  const ai = r?.inference,
    audio = r?.audio;
  const [copied, setCopied] = useState(false);
  return (
    <section
      className="local-pipeline-debug"
      role="dialog"
      aria-label="local detection debug"
    >
      <header>
        <b>local detection debug</b>
        <button
          type="button"
          onClick={close}
          aria-label="close detection debug"
        >
          ×
        </button>
      </header>
      <p>
        v{r?.version ?? chrome.runtime.getManifest().version} · Alt+Shift+D ·
        audio stays on this PC
      </p>
      <meter
        aria-label="debug mic level"
        min="0"
        max="1"
        value={Math.min(1, (audio?.metrics.micLevel ?? 0) * 12)}
      />
      <p>
        mic: {audio?.mic.name ?? 'not opened'} · {audio?.mic.state ?? 'none'} ·
        muted {String(audio?.mic.muted ?? false)}
      </p>
      <p>
        permission / opened: {audio?.permission ?? 'unknown'} /{' '}
        {audio?.micOpened ?? 0} · offscreen:{' '}
        {r?.offscreenAlive ? 'alive' : 'closed'} · {audio?.inputSampleRate ?? 0}{' '}
        → 16000 Hz
      </p>
      <p>
        frames: {ai?.micFrames ?? 0} · {Math.round(ai?.micFps ?? 0)}/s ·
        nonzero: {ai?.stages.nonzeroFrames ?? 0}
      </p>
      <p>
        VAD: {(ai?.health.vadProbability ?? 0) >= 0.5 ? 'speech' : 'quiet'} ·
        chunks {ai?.stages.voicedChunks ?? 0} · segments{' '}
        {ai?.stages.segments ?? 0}
      </p>
      <p>
        laugh score: {(ai?.laughScore ?? 0).toFixed(3)} ·{' '}
        {ai?.topClass.label ?? 'waiting'}
      </p>
      <p>
        {(['vad', 'yamnet', 'whisper'] as const)
          .map((name) => `${name}: ${ai?.models[name].phase ?? 'idle'}`)
          .join(' · ')}
      </p>
      <p>
        transcriptions: {ai?.stages.speechResults ?? 0} · last transcript
        (filtered phrase): <b>{phrase || 'none yet'}</b>
      </p>
      <p>
        guard: {ai?.guard.reason ?? 'waiting'} · match{' '}
        {(ai?.guard.correlation ?? 0).toFixed(2)}
      </p>
      <p>
        events this session: {ai?.stages.acceptedEvents ?? 0} · shown{' '}
        {r?.sessionLaughs ?? 0} laughs / {r?.sessionWords ?? 0} words ·
        checkpoint {r?.savedLaughs ?? 0} / {r?.savedWords ?? 0} · session{' '}
        {r?.sessionMatches ? 'matched' : 'not matched'}
      </p>
      <p role="status">{micProblem(r) || 'pipeline running'}</p>
      <button
        type="button"
        disabled={!r}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(copyableReport(r));
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'report copied · no transcript' : 'copy counters only'}
      </button>
    </section>
  );
}
