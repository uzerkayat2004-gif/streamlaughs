import type { DiagnosticsReport } from './diagnostics';

/** Status/levels only. No samples or transcripts cross this UI boundary. */
export function PipelineStages({
  report,
  word,
  error = '',
}: {
  report: DiagnosticsReport | null;
  word: string;
  error?: string;
}) {
  const audio = report?.audio,
    ai = report?.inference;
  const paused = report?.captureState === 'paused';
  const blocked = error
    ? `diagnostics disconnected: ${error}`
    : !report
      ? 'connecting to the extension…'
      : !report.listening
        ? 'microphone is off · press enable microphone below'
        : !report.offscreenAlive
          ? 'audio owner is not running · start or retry microphone'
          : !audio && report.error
            ? `audio owner did not respond: ${report.error}`
            : !report.sessionMatches
              ? 'audio owner does not match this session · retry microphone'
              : paused
                ? 'session paused · resume on Twitch'
                : '';
  const live =
    !!audio &&
    audio.mic.state === 'live' &&
    audio.mic.enabled &&
    !audio.mic.muted;
  const fresh =
    !!audio?.micWorklet.lastFrameAt &&
    Date.now() - audio.micWorklet.lastFrameAt < 2000;
  const level = audio?.metrics.micLevel ?? 0;
  const lastLaugh = ai?.accuracyLog.findLast((row) => row.kind === 'laugh');
  const lastWord = ai?.accuracyLog.findLast((row) => row.kind === 'words');
  const rawCount = (report?.sessionLaughs ?? 0) + (report?.sessionWords ?? 0);
  const savedCount = (report?.savedLaughs ?? 0) + (report?.savedWords ?? 0);
  const waiting = (reason: string) => blocked || reason;
  const model = (
    key: 'vad' | 'yamnet' | 'whisper',
    name: string,
    runtime: string,
  ) => {
    const state = ai?.models[key];
    const failure = state?.error || runtime;
    return {
      name,
      ok: !blocked && state?.phase === 'ready' && !failure,
      reason: waiting(
        failure
          ? `model failed to load/run: ${failure}`
          : state?.phase === 'ready'
            ? 'ready · bundled on this PC'
            : state?.phase === 'loading'
              ? 'loading local model…'
              : 'not started · retry microphone',
      ),
    };
  };
  const rows = [
    {
      name: 'Mic track live',
      ok: !blocked && live,
      reason: waiting(
        audio?.error ||
          (!audio
            ? 'microphone not opened'
            : audio.mic.muted
              ? 'input is muted · unmute it or choose another microphone'
              : audio.mic.state !== 'live'
                ? 'input ended or unavailable · retry microphone'
                : !audio.mic.enabled
                  ? 'input disabled · retry microphone'
                  : `${audio.mic.name} · ${audio.mic.sampleRate} Hz / ${audio.mic.channelCount} channels · EC/NS/AGC ${audio.mic.echoCancellation ? 'on' : 'off'}/${audio.mic.noiseSuppression ? 'on' : 'off'}/${audio.mic.autoGainControl ? 'on' : 'off'}`),
      ),
    },
    {
      name: 'Audio level',
      ok: !blocked && fresh && level > 0,
      reason: waiting(
        !fresh
          ? 'no fresh samples · check the rows below'
          : level > 0
            ? `input RMS ${level.toExponential(2)} · model gain ${(ai?.gain ?? 1).toFixed(1)}×`
            : 'input is silent · choose your actual microphone, then speak',
      ),
    },
    {
      name: 'AudioContext running',
      ok: !blocked && audio?.context === 'running',
      reason: waiting(
        audio?.context === 'running'
          ? `${audio.inputSampleRate} Hz native → 16000 Hz mono · Twitch plays natively`
          : `context ${audio?.context ?? 'not opened'} · retry microphone`,
      ),
    },
    {
      name: 'Worklet frames arriving',
      ok: !blocked && fresh,
      reason: waiting(
        fresh
          ? `${Math.round(audio?.metrics.micFps ?? 0)} frames/s captured · ${Math.round(ai?.micFps ?? 0)} frames/s at worker · input channel ${(audio?.micWorklet.selectedChannel ?? 0) + 1}/${audio?.micWorklet.inputChannels ?? 0}${ai?.inputGaps ? ` · ${ai.inputGaps} input gaps` : ''}`
          : 'no fresh 20 ms frames · retry microphone',
      ),
    },
    model('vad', 'VAD model loaded', ai?.vadError ?? ''),
    model('yamnet', 'Laugh model loaded', ai?.soundError ?? ''),
    model('whisper', 'Word model loaded', ai?.speechError ?? ''),
    {
      name: 'Voice detected',
      ok: !blocked && (ai?.stages.voicedChunks ?? 0) > 0,
      reason: waiting(
        ai?.vadError ||
          ((ai?.health.calibrationRemainingMs ?? 0) > 0
            ? 'room calibration · stay quiet for three seconds, then speak'
            : (ai?.stages.voicedChunks ?? 0) > 0
              ? `${ai?.stages.voicedChunks} voiced chunks · current probability ${(ai?.health.vadProbability ?? 0).toFixed(2)}`
              : 'not yet · say “W” near your selected microphone'),
      ),
    },
    {
      name: 'Laugh detected',
      ok: !blocked && (ai?.laughDetectors.both ?? 0) > 0,
      reason:
        waiting(
          ai?.soundError ||
            ((ai?.laughDetectors.both ?? 0) > 0
              ? `${ai?.laughDetectors.both} confirmed laughs`
              : lastLaugh?.reason ||
                'not yet · laugh naturally; normal talking should stay uncounted'),
        ) + ` · last laugh score ${(ai?.laughScore ?? 0).toFixed(3)}`,
    },
    {
      name: 'Word heard',
      ok: !blocked && (ai?.stages.wordEvents ?? 0) > 0,
      reason: waiting(
        ai?.speechError ||
          ((ai?.stages.wordEvents ?? 0) > 0
            ? `last heard word: ${word || 'approved reaction received'}`
            : ai?.health.lowPower
              ? 'words paused for CPU recovery · laughs remain on'
              : (ai?.stages.speechRequests ?? 0) >
                  (ai?.stages.speechResults ?? 0)
                ? `processing locally · CPU pacing waited ${((ai?.speechWaitedMs ?? 0) / 1000).toFixed(1)} sec`
                : lastWord?.reason ||
                  'not yet · say “W” or “let’s go”, then pause'),
      ),
    },
    {
      name: 'Count saved',
      ok:
        !blocked &&
        rawCount > 0 &&
        savedCount === rawCount &&
        !report?.delivery.error &&
        !report?.deliveryError,
      reason: waiting(
        (report?.sessionId?.startsWith('mic-test-')
          ? 'mic check only · start a Twitch session to save counts'
          : '') ||
          report?.delivery.error ||
          report?.deliveryError ||
          (rawCount > 0
            ? savedCount === rawCount
              ? `${report?.savedLaughs} laughs / ${report?.savedWords} words saved and published to the panel`
              : 'detected · waiting for the local save'
            : (report?.delivery.received ?? 0) > 0 && !report?.delivery.applied
              ? 'worker emitted a detection, but the session rejected it'
              : 'waiting for the first accepted laugh or word · mic checks do not save sessions'),
      ),
    },
  ];
  return (
    <ol className="pipeline-stages" aria-label="microphone detection stages">
      {rows.map((row) => (
        <li key={row.name} data-state={row.ok ? 'green' : 'red'}>
          <i className="stage-light" aria-hidden="true" />
          <div>
            <b>{row.name}</b>
            <small>{row.reason}</small>
            {row.name === 'Audio level' && (
              <meter
                aria-label="live microphone input level"
                min={0}
                max={1}
                value={
                  level > 0
                    ? Math.max(
                        0,
                        Math.min(1, (20 * Math.log10(level) + 90) / 60),
                      )
                    : 0
                }
              />
            )}
          </div>
          <span className="stage-result">{row.ok ? 'ok' : 'waiting'}</span>
        </li>
      ))}
    </ol>
  );
}
