import { useEffect, useRef, useState } from 'react';
import {
  verifyVisibleMicrophone,
  permissionHelp,
  bluetoothInput,
} from './audio/microphone';
import { MicDevicePicker } from './MicDevicePicker';
import { command } from './bridge';
import {
  micProblem,
  usePipelineReport,
  CopyDiagnostics,
} from './PipelinePanel';

export function MicTest() {
  const { report, phrase } = usePipelineReport(true, true);
  const [started, setStarted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const since = useRef(Infinity),
    owns = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    const stop = () => {
      if (owns.current)
        void chrome.runtime
          .sendMessage({ type: 'MIC_TEST_STOP' })
          .catch(() => {});
    };
    window.addEventListener('pagehide', stop);
    return () => {
      mounted.current = false;
      stop();
      window.removeEventListener('pagehide', stop);
    };
  }, []);
  const heard =
    started &&
    report?.inference?.events.some(
      (e) =>
        e.ts >= since.current && (e.kind === 'laugh' || e.kind === 'words'),
    );
  return (
    <div className="mic-test-step">
      <h2>laugh or say something</h2>
      <p className="sub">a real local check · nothing is saved or shared</p>
      <MicDevicePicker
        key={String(started)}
        changed={() => {
          setStarted(false);
          if (owns.current) void command({ type: 'MIC_TEST_STOP' });
          else void command({ type: 'RETRY_MIC' });
        }}
      />
      {bluetoothInput(report?.audio?.mic.name ?? '') && (
        <p className="mic-bluetooth-tip">
          Bluetooth headphones sound bad while the mic is on; use your laptop
          mic instead
        </p>
      )}
      <meter
        aria-label="mic check live level"
        min="0"
        max="1"
        value={Math.min(1, (report?.audio?.metrics.micLevel ?? 0) * 12)}
      />
      <p className="mic-check-result" role="status">
        {error ||
          (heard
            ? report?.inference?.events.some(
                (e) => e.ts >= since.current && e.kind === 'laugh',
              )
              ? 'heard a laugh!'
              : `heard: ${phrase || 'a word'}`
            : started
              ? micProblem(report) || 'listening for a laugh or a word…'
              : 'press start, then laugh or say “let’s go”')}
      </p>
      {started && (
        <p className="sub">
          {report?.audio?.mic.name ?? 'opening your default input'} ·{' '}
          {Math.round(report?.inference?.micFps ?? 0)} frames/s · test stops
          after 2 minutes
        </p>
      )}
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');

          try {
            const state = await command({ type: 'GET_STATE' });
            if (!state.session || state.capture.micLost) {
              await verifyVisibleMicrophone();
            }
            since.current = Date.now();
            const next = await command({
              type: state.session ? 'RETRY_MIC' : 'MIC_TEST_START',
            });
            owns.current =
              !next.session &&
              !!next.capture.sessionId?.startsWith('mic-test-');
            if (!mounted.current && owns.current)
              void chrome.runtime
                .sendMessage({ type: 'MIC_TEST_STOP' })
                .catch(() => {});
            if (mounted.current) setStarted(true);
          } catch (e) {
            if (mounted.current)
              setError(
                e instanceof DOMException && e.name === 'NotAllowedError'
                  ? permissionHelp
                  : e instanceof DOMException && e.name === 'NotFoundError'
                    ? 'no microphone found · connect an input and retry'
                    : e instanceof Error
                      ? e.message
                      : 'microphone could not start · retry',
              );
          } finally {
            if (mounted.current) setBusy(false);
          }
        }}
      >
        {busy
          ? 'opening your mic…'
          : started
            ? 'test again'
            : 'start mic check'}
      </button>
      <CopyDiagnostics report={report} phrase={phrase} visibleError={error} />
      <a
        className="textbtn"
        target="_blank"
        rel="noreferrer"
        href={chrome.runtime.getURL('/mic-test.html')}
      >
        open mic check in a full page ↗
      </a>
    </div>
  );
}
