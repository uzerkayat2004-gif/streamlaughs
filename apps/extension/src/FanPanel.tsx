import {
  isApprovedPhrase,
  visibleWords,
  type CrowdState,
} from '@laughline/shared';
import { Pause, Play } from 'lucide-react';
import { formatTime } from './components';
export function FanPanel({
  room,
  replay = false,
  count,
  status,
  micLevel,
  micProblem,
  listen,
  onPause,
  onStop,
  onMic,
  channel = 'stream',
  elapsed = 0,
  word,
  lastLaughSeconds,
  bestMoment,
}: {
  room: CrowdState | null;
  replay?: boolean;
  count: number;
  status: 'idle' | 'paused' | 'recording';
  micLevel: number;
  micProblem: boolean;
  listen: boolean;
  onPause: () => void;
  onStop: () => void;
  onMic: () => void;
  bounce?: number;
  channel?: string;
  elapsed?: number;
  word?: string;
  lastLaughSeconds?: number;
  bestMoment?: number;
}) {
  const live = room?.state === 'live' && room.laughlineViewers >= 3;
  const words = visibleWords(room).filter((w) => w.word !== '—');
  return (
    <div className="fan-panel-content">
      {replay && <small className="replay-tag">replay · personal only</small>}
      <header className="reaction-header">
        <b>{channel}</b>
        <span>{formatTime(elapsed)}</span>
        <button
          type="button"
          className={`panel-mic ${micProblem ? 'problem' : listen && micLevel > 0.003 ? 'hearing' : 'silent'}`}
          onClick={onMic}
          aria-label={`${micProblem ? 'microphone problem' : listen && micLevel > 0.003 ? 'microphone hearing you' : 'microphone quiet'} · test my mic`}
          title="test my mic"
        >
          <i />
        </button>
      </header>
      <section className="reaction-you" aria-label="your reactions">
        <small>YOU</small>
        <p>
          <strong>{count}</strong> laughs
        </p>
        {word && isApprovedPhrase(word) && (
          <div>
            your word: <b>{word}</b>
          </div>
        )}
        {lastLaughSeconds !== undefined && (
          <div>
            last laugh:{' '}
            {lastLaughSeconds < 60
              ? 'just now'
              : `${Math.floor(lastLaughSeconds / 60)}m ago`}
          </div>
        )}
        {bestMoment !== undefined && (
          <div className="personal-best">
            funniest moment so far: <b>{formatTime(bestMoment)}</b>
          </div>
        )}
      </section>
      {!replay &&
        (live ? (
          <section className="reaction-fans" aria-label="fan reactions">
            <small>FANS</small>
            <div className="fans-count">
              <strong>{room.laughingNow}</strong>
              <span>fans laughing now</span>
            </div>
            <div className="laugh-meter" aria-label="live laugh meter">
              {[0, 1, 2, 3, 4].map((n) => (
                <i
                  key={n}
                  className={
                    status === 'recording' &&
                    room.laughingNow >
                      n * Math.max(1, room.laughlineViewers / 5)
                      ? 'lit'
                      : ''
                  }
                />
              ))}
            </div>
            {words[0] && (
              <div className="fan-word">
                <span>top fan word</span>
                <b>{words[0].word}</b>
              </div>
            )}
          </section>
        ) : (
          <p className="fans-floor">
            {room?.state === 'offline'
              ? 'fans are offline · reconnecting'
              : 'fan reactions show when 3+ fans are here'}
          </p>
        ))}
      {status !== 'idle' ? (
        <div className="x-cfoot">
          <button
            type="button"
            className="x-cbtn"
            aria-label={status === 'paused' ? 'resume' : 'pause'}
            onClick={onPause}
          >
            {status === 'paused' ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            type="button"
            className="x-cbtn x-cbtn--stop"
            aria-label="stop session"
            onClick={onStop}
          >
            <i />
          </button>
        </div>
      ) : (
        <p className="fans-floor">open the toolbar to start</p>
      )}
      {!replay && (room?.source === 'fake' || room?.testTraffic) && (
        <p className="fans-test-label">test fans · simulated traffic</p>
      )}
    </div>
  );
}
