import { useState } from 'react';
import type { DiagnosticsReport } from './diagnostics';
import { defaultLab, type LabSwitches } from './stutter';
import { contentStutterMetrics, labSurface } from './stutter-surface';
export function StutterLab({
  report: r,
}: {
  report: DiagnosticsReport | null;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const switches = r?.lab ?? defaultLab(),
    playback = r?.audio?.playback;
  const content = contentStutterMetrics();
  const change = async (key: keyof LabSwitches, value: boolean) => {
    setBusy(true);
    setError('');
    try {
      const next = { ...switches, [key]: value };
      const result = await chrome.runtime.sendMessage({
        type: 'STUTTER_LAB',
        switches: next,
      });
      if (!result?.ok)
        throw new Error(result?.error ?? 'couldn’t change the lab · try again');
      labSurface.accept(next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'couldn’t change the lab · try again',
      );
    } finally {
      setBusy(false);
    }
  };
  const tasks = [
    ['offscreen', r?.offscreenTasks],
    ...Object.entries(r?.inference?.workerTasks ?? {}),
    ['Twitch page (all scripts)', content.tasks],
  ] as const;
  return (
    <details className="stutter-lab">
      <summary>stutter lab · live isolation</summary>
      <p>
        switch one thing at a time. controls reset next session; nothing here
        uploads audio.
      </p>
      <fieldset disabled={busy || !r?.offscreenAlive}>
        <legend>apply without reloading</legend>
        {(
          [
            ['tabCapture', 'tab capture · opt-in speaker echo reference'],
            ['micCapture', 'microphone capture'],
            ['laughModel', 'laugh model + DSP'],
            ['speechModel', 'speech / word model'],
            ['overlay', 'panel updates + animations'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={switches[key]}
              onChange={(e) => void change(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <p>
        playback: {playback?.state ?? 'native'} · {playback?.sampleRate ?? 0} Hz
        <br />
        base / output latency: {Math.round((playback?.baseLatency ?? 0) * 1000)}{' '}
        / {Math.round((playback?.outputLatency ?? 0) * 1000)} ms
        <br />
        browser underruns: {playback?.underruns ?? 'unavailable'} · /minute:{' '}
        {playback?.underrunsPerMinute?.toFixed(2) ?? 'unavailable'}
        <br />
        output-clock gaps (estimate): {playback?.watchdogGaps ?? 0} · worst{' '}
        {Math.round(playback?.worstGapMs ?? 0)} ms
      </p>
      <p>
        {switches.tabCapture
          ? 'direct playback context; analysis is separate'
          : 'Twitch plays natively; no extension tab capture/passthrough'}
      </p>
      {(playback?.speechPaused || !!r?.inference?.speechCooldownMs) && (
        <p role="status">
          speech paused for smooth audio · laughs stay on; resumes after 30
          smooth seconds
        </p>
      )}
      <p>
        granted mic: {r?.audio?.mic.name ?? 'none'} ·{' '}
        {r?.audio?.mic.sampleRate ?? 0} Hz · {r?.audio?.mic.channelCount ?? 0}{' '}
        channels · {r?.audio?.mic.device ?? 'system default'}
        <br />
        EC / NS / AGC: {String(r?.audio?.mic.echoCancellation ?? false)} /{' '}
        {String(r?.audio?.mic.noiseSuppression ?? false)} /{' '}
        {String(r?.audio?.mic.autoGainControl ?? false)}
      </p>
      <p>
        model work ms/s (elapsed inference): VAD{' '}
        {Math.round(r?.inference?.vadCpuMsPerSecond ?? 0)} · laugh{' '}
        {Math.round(r?.inference?.soundCpuMsPerSecond ?? 0)} · words{' '}
        {Math.round(r?.inference?.speechCpuMsPerSecond ?? 0)}
      </p>
      <p>
        speech budget overruns: {r?.inference?.speechOverruns ?? 0} · retry in{' '}
        {Math.ceil((r?.inference?.speechCooldownMs ?? 0) / 1000)} s
      </p>
      {tasks.map(([name, t]) => (
        <p key={name}>
          {name}: long tasks{' '}
          {t?.supported
            ? `${t.count}, worst ${Math.round(t.worstMs)} ms`
            : 'unavailable'}{' '}
          · timer stalls {t?.stalls ?? 0}, worst{' '}
          {Math.round(t?.worstStallMs ?? 0)} ms
        </p>
      ))}
      <p>
        video dropped frames:{' '}
        {content.video
          ? `${content.video.droppedFrames} / ${content.video.totalFrames}`
          : 'unavailable (embedded player)'}{' '}
        · worker timer stalls are not audio underruns.
      </p>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard
            .writeText(JSON.stringify({ report: r, content }, null, 2))
            .then(
              () => setError('numeric lab report copied'),
              () => setError('couldn’t copy · focus this tab and retry'),
            )
        }
      >
        copy stutter report
      </button>
    </details>
  );
}
