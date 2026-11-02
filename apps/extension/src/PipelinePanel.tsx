import { useEffect, useState } from 'react';
import { selectedMicrophone } from './audio/microphone';
import { StutterLab } from './StutterLab';
import { labSurface } from './stutter-surface';
import { panelDeliveryStats } from './bridge';
import {
  copyableReport,
  type DiagnosticsReport,
  DiagnosticsSchema,
} from './diagnostics';

export function usePipelineReport(
  enabled = true,
  preview = false,
  speech = false,
) {
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
        if (alive) {
          setReport(next);
          if (next.lab) labSurface.accept(next.lab);
        }
        if (preview) {
          const value = await chrome.runtime.sendMessage({
            type: 'GET_AUDIO_PREVIEW',
            speech,
          });
          if (alive && typeof value === 'string')
            setPhrase(value.slice(0, speech ? 20000 : 80));
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
  }, [enabled, preview, speech]);
  return { report, phrase };
}
export function micProblem(report: DiagnosticsReport | null) {
  if (!report) return 'connecting to the local audio owner…';
  if (report.lab?.micCapture === false)
    return 'microphone paused in stutter lab';
  if (report.lab?.laughModel === false && report.lab?.speechModel === false)
    return 'models paused in stutter lab';
  const wanted = (name: string) =>
    name === 'vad' ||
    (name === 'yamnet'
      ? report.lab?.laughModel !== false
      : report.lab?.speechModel !== false &&
        !report.inference?.speechCooldownMs &&
        !report.audio?.playback?.speechPaused);
  if (!report.offscreenAlive)
    return report.error
      ? `no microphone capture · ${report.error}`
      : 'microphone is not running · start a mic check';
  if (report.audio?.error) return report.audio.error;
  const failed = Object.entries(report.inference?.models ?? {}).find(
    ([name, model]) => wanted(name) && (model.phase === 'error' || model.error),
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
  if (report.inference?.health.phase === 'ready') {
    if (!report.audio.metrics.micFrames)
      return 'microphone is live but no frames arrive · retry audio';
    if (!report.inference.micFrames)
      return 'mic frames aren’t reaching detection · restart audio';
  }
  if (
    report.audio.metrics.micFrames > 200 &&
    !report.inference?.stages.nonzeroFrames
  )
    return 'no audio from this microphone · check the selected Windows input';
  if (report.inference?.health.phase !== 'ready')
    return 'loading the local models…';
  if (
    Object.entries(report.inference.models).some(
      ([name, model]) => wanted(name) && model.phase !== 'ready',
    )
  )
    return 'loading the local models…';
  if (report.inference.health.lowPower)
    return 'low power · words are paused; laughs still run';
  return '';
}
export function PipelineDebug({ close }: { close: () => void }) {
  const { report: r, phrase } = usePipelineReport(true, true, true);
  const ai = r?.inference,
    audio = r?.audio,
    delivered = panelDeliveryStats();

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
        mic frames in: {audio?.metrics.micFrames ?? 0} · RMS{' '}
        {(audio?.metrics.micLevel ?? 0).toFixed(5)} · frames to worker:{' '}
        {ai?.micFrames ?? 0} · {Math.round(ai?.micFps ?? 0)}/s · nonzero:{' '}
        {ai?.stages.nonzeroFrames ?? 0}
      </p>
      <p>
        VAD: {(ai?.health.vadProbability ?? 0) >= 0.5 ? 'speech' : 'quiet'} ·
        chunks {ai?.stages.voicedChunks ?? 0} · segments{' '}
        {ai?.stages.segments ?? 0}
      </p>
      <p>
        DSP hits: {ai?.stages.dspHits ?? 0} · laugh score:{' '}
        {(ai?.laughScore ?? 0).toFixed(3)} · {ai?.topClass.label ?? 'waiting'}
      </p>
      <p>
        {(['vad', 'yamnet', 'whisper'] as const)
          .map((name) => `${name}: ${ai?.models[name].phase ?? 'idle'}`)
          .join(' · ')}
      </p>
      <p>
        segments sent: {ai?.stages.speechRequests ?? 0} · transcripts returned:{' '}
        {ai?.stages.speechResults ?? 0}
        <br />
        words matched: {ai?.stages.wordsMatched ?? 0} · rejected:{' '}
        {ai?.stages.wordsRejected ?? 0}
        <br />
        last 20 speech decisions (transcripts visible here only, never
        saved/copied):{' '}
        <pre style={{ whiteSpace: 'pre-wrap' }}>
          {phrase || 'say a reaction while this panel is open'}
        </pre>
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
      <p>
        panel updates delivered: {delivered.updates} · panel shows{' '}
        {delivered.laughs} laughs / {delivered.words} words
      </p>
      <p>
        laugh delivery latency: {Math.round(r?.laughPanelLatencyMs ?? 0)} ms ·
        recognized audio frame → panel (not first-sound onset)
      </p>
      <CopyDiagnostics report={r} />
      <AccuracyLog inference={ai} />
      <StutterLab report={r} />
    </section>
  );
}

export function CopyDiagnostics({
  report,
  phrase = '',
  visibleError = '',
}: {
  report: DiagnosticsReport | null;
  phrase?: string;
  visibleError?: string;
}) {
  const [message, setMessage] = useState('copy diagnostics');
  return (
    <button
      type="button"
      className="textbtn copy-diagnostics"
      disabled={!report}
      onClick={async () => {
        try {
          let permission: PermissionState | 'unknown' = 'unknown';
          let label = report?.audio?.mic.name ?? 'not opened';
          if (location.protocol === 'chrome-extension:') {
            try {
              permission = (
                await navigator.permissions.query({
                  name: 'microphone' as PermissionName,
                })
              ).state;
            } catch {
              /* Capture state stays separately visible. */
            }
            try {
              const id = await selectedMicrophone();
              const devices = await navigator.mediaDevices.enumerateDevices();
              label =
                devices.find(
                  (d) => d.kind === 'audioinput' && d.deviceId === id,
                )?.label ||
                (id === 'default'
                  ? 'system default'
                  : 'selected input (name unavailable)');
            } catch {
              /* Keep the actual captured label, if any. */
            }
          }
          await navigator.clipboard.writeText(
            copyableReport(report, phrase, {
              visibleError: visibleError.slice(0, 400),
              visiblePermissionQuery: permission,
              chosenDeviceLabel: label.slice(0, 256),
            }),
          );
          setMessage('diagnostics copied');
        } catch {
          setMessage('couldn’t copy · focus this tab and retry');
        }
      }}
    >
      {message}
    </button>
  );
}

export function AccuracyLog({
  inference,
}: {
  inference: import('./diagnostics').WorkerDiagnostics | null | undefined;
}) {
  return (
    <details>
      <summary>last 20 accuracy decisions · numeric only</summary>
      {inference?.accuracyLog.map((e, i) => (
        <p key={`${e.ts}-${i}`}>
          {e.kind} · {e.accepted ? 'counted' : 'rejected'} · {e.detector} ·{' '}
          {e.reason} · laughter {e.laughter.toFixed(3)} / speech{' '}
          {e.speech.toFixed(3)} · DSP {e.dsp.toFixed(2)} · +
          {e.aboveFloorDb.toFixed(1)} dB · {Math.round(e.durationMs)} ms · logp{' '}
          {e.avgLogprob?.toFixed(3) ?? '—'} · no-speech{' '}
          {e.noSpeechProbability?.toFixed(3) ?? '—'}
        </p>
      ))}
    </details>
  );
}
