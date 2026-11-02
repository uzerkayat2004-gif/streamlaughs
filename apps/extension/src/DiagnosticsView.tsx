import { PRODUCT } from '@laughline/shared';

import { useState } from 'react';

import { AccuracyLog, usePipelineReport } from './PipelinePanel';

import { copyableReport } from './diagnostics';

export function Diagnostics() {
  const { report, phrase } = usePipelineReport(true, true, true);

  const [message, setMessage] = useState('');

  const audio = report?.audio,
    ai = report?.inference;

  return (
    <main className="diagnostics-page">
      <h1>{PRODUCT.name} · local audio diagnostics</h1>
      <p>live on this PC. no audio or transcripts in this report.</p>
      <button
        type="button"
        className="btn"
        disabled={!report}
        onClick={async () => {
          if (!report) return;

          try {
            await navigator.clipboard.writeText(copyableReport(report));

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
            {name} ·{' '}
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
      <h2>last 20 speech decisions · this view only</h2>
      <p>transcripts below are temporary and excluded from copy report.</p>
      <pre>{phrase || 'say a reaction while this view is open'}</pre>
      <h2>report details</h2>
      <pre>{report ? copyableReport(report) : 'waiting for local state…'}</pre>
    </main>
  );
}
