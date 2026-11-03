import { PRODUCT } from '@laughline/shared';

import { useState } from 'react';

import { AccuracyLog, micProblem, usePipelineReport } from './PipelinePanel';

import { copyableReport } from './diagnostics';
import { verifyVisibleMicrophone } from './audio/microphone';
import { PipelineStages } from './PipelineStages';
import { MicDevicePicker } from './MicDevicePicker';
import { command } from './bridge';

export function Diagnostics() {
  const { report, phrase, word, pollError } = usePipelineReport(
    true,
    true,
    true,
  );

  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);

  const audio = report?.audio,
    ai = report?.inference;

  return (
    <main className="diagnostics-page">
      <h1>{PRODUCT.name} · local audio diagnostics</h1>
      <p>live on this PC. no audio or transcripts in this report.</p>
      <section
        className="quick-diagnostics"
        aria-label="quick microphone readout"
      >
        <h2>v{chrome.runtime.getManifest().version} · mic check</h2>
        <p>
          Green means this stage has worked. Detection lights turn green after
          you react.
        </p>
        <PipelineStages report={report} word={word} error={pollError} />
        <MicDevicePicker
          changed={() => {
            if (
              report?.listening &&
              report.sessionId &&
              !report.sessionId.startsWith('mic-test-')
            )
              void command({ type: 'RETRY_MIC' }).catch((error) =>
                setMessage(String(error)),
              );
          }}
        />
        <p role="status">
          {micProblem(report) || 'ready · laugh or say “W” or “let’s go”.'}
        </p>
        <button
          type="button"
          className="btn"
          disabled={checking}
          onClick={async () => {
            if (checking) return;
            setChecking(true);
            try {
              await verifyVisibleMicrophone();
              await command({ type: 'SETTINGS', settings: { listen: true } });
              await command({
                type:
                  report?.sessionId && !report.sessionId.startsWith('mic-test-')
                    ? 'RETRY_MIC'
                    : 'MIC_TEST_START',
              });
              setMessage('mic restarted · react as soon as the levels move');
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : 'mic could not start · allow permission and retry',
              );
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking
            ? 'opening microphone…'
            : report?.listening
              ? 'retry microphone and models'
              : 'enable microphone'}
        </button>
        {(ai?.stages.speechRequests ?? 0) > (ai?.stages.speechResults ?? 0) && (
          <p role="status">
            word model processing · keeping Twitch audio smooth
          </p>
        )}
        <a className="textbtn" href={chrome.runtime.getURL('/mic-test.html')}>
          choose input / test my mic ↗
        </a>
      </section>
      <button
        type="button"
        className="btn"
        disabled={!report}
        onClick={async () => {
          if (!report) return;

          try {
            await navigator.clipboard.writeText(copyableReport(report, word));

            setMessage('report copied');
          } catch {
            setMessage('couldn’t copy · try again');
          }
        }}
      >
        copy report
      </button>
      <p role="status">{message}</p>
      {(report?.error || audio?.error || ai?.error) && (
        <p role="alert">{report?.error || audio?.error || ai?.error}</p>
      )}
      <h2>
        capture ·{' '}
        <span data-testid="diagnostics-capture">
          {report?.captureState ?? 'waiting'}
        </span>
      </h2>
      <p>
        listening: {report?.listening ? 'on' : 'off'} · audio context:{' '}
        {audio?.context ?? 'closed'}
      </p>
      {(['mic', 'tab'] as const).map((source) => (
        <section key={source}>
          <h3>
            {source} · {audio?.[source].name ?? 'not opened'}
          </h3>
          <p>
            {audio?.[source].state ?? 'none'} · muted:{' '}
            {String(audio?.[source].muted ?? false)} · ended:{' '}
            {String(audio?.[source].state === 'ended')}
          </p>
          <meter
            aria-label={`${source} input level`}
            min="0"
            max="1"
            value={Math.min(
              1,

              (audio?.metrics[source === 'mic' ? 'micLevel' : 'tabLevel'] ??
                0) * 8,
            )}
          />
          <p>
            input RMS:{' '}
            {(
              audio?.metrics[source === 'mic' ? 'micLevel' : 'tabLevel'] ?? 0
            ).toFixed(5)}{' '}
            · input frames/s:{' '}
            {(
              audio?.metrics[source === 'mic' ? 'micFps' : 'tabFps'] ?? 0
            ).toFixed(1)}{' '}
            · inference frames/s:{' '}
            <span data-testid={`${source}-inference-fps`}>
              {(ai?.[source === 'mic' ? 'micFps' : 'tabFps'] ?? 0).toFixed(1)}
            </span>
          </p>
        </section>
      ))}
      <p>
        inference format: {ai?.sampleRate ?? 16000} Hz mono ·{' '}
        {ai?.frameSamples ?? 320} samples / 20 ms
      </p>
      <h2>
        models ·{' '}
        <span data-testid="diagnostics-inference">
          {ai?.health.phase ?? 'idle'}
        </span>
      </h2>
      {(['vad', 'yamnet', 'whisper'] as const).map((name) => (
        <section key={name}>
          <h3>
            {name === 'whisper'
              ? ai?.models.whisper.name || 'word model'
              : name}{' '}
            ·{' '}
            <span data-testid={`${name}-model-state`}>
              {ai?.models[name].phase ?? 'idle'}
            </span>
          </h3>
          <p>
            {ai?.models[name].error ||
              `${Math.round(ai?.models[name].ms ?? 0)} ms to load`}
          </p>
        </section>
      ))}
      <p>
        VAD speech: {(ai?.health.vadProbability ?? 0) >= 0.5 ? 'yes' : 'no'} ·
        probability: {(ai?.health.vadProbability ?? 0).toFixed(3)}
      </p>
      <p>
        top YAMNet class: {ai?.topClass.label ?? 'waiting'} ·{' '}
        {(ai?.topClass.score ?? 0).toFixed(3)}
      </p>
      <p>
        local mic gain: {(ai?.gain ?? 1).toFixed(1)}× · noise floor:{' '}
        {(ai?.noiseFloor ?? 0).toFixed(5)}
      </p>
      <p>
        mic {ai?.guard.kept ? 'kept' : 'suppressed'} ·{' '}
        {ai?.guard.reason ?? 'waiting for audio'} · match:{' '}
        {(ai?.guard.correlation ?? 0).toFixed(3)}
      </p>
      <p>
        capture recovery: {audio?.recoveryAttempts ?? 0}/3 ·{' '}
        {audio?.recoveryReason || 'no restart needed'}
      </p>
      {ai?.basicMode && (
        <p role="status">
          basic mode · YAMNet unavailable; local energy + rhythm fallback active
        </p>
      )}
      <p>laugh confidence: {(ai?.laughConfidence ?? 0).toFixed(3)}</p>
      <h2>last 10 decisions</h2>
      <ul>
        {ai?.accuracyLog.slice(-10).map((e, i) => (
          <li key={`${e.ts}-${i}`}>
            {new Date(e.ts).toLocaleTimeString()} · {e.kind} ·{' '}
            {e.kind === 'laugh'
              ? `confidence ${e.laughter.toFixed(3)}`
              : e.canonical || 'no canonical reaction'}{' '}
            · {e.accepted ? 'counted' : e.reason}
          </li>
        ))}
      </ul>
      <h2>last detection events</h2>
      <ul>
        {ai?.events.map((event, index) => (
          <li key={`${event.ts}-${index}`}>
            {new Date(event.ts).toLocaleTimeString()} · {event.kind} · count{' '}
            {event.count} · confidence {event.confidence.toFixed(3)}
          </li>
        ))}
      </ul>
      {!ai?.events.length && <p>none yet</p>}
      <AccuracyLog inference={ai} />
      <h2>last 10 speech decisions · this view only</h2>
      <p>transcripts below are temporary and excluded from copy report.</p>
      <pre>{phrase || 'say a reaction while this view is open'}</pre>
      <h2>report details</h2>
      <pre>{report ? copyableReport(report) : 'waiting for local state…'}</pre>
    </main>
  );
}
