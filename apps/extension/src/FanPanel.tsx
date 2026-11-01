import { visibleWords, type CrowdState } from '@laughline/shared';
import { Pause, Play } from 'lucide-react';
import { AppIcon } from './AppIcon';
export function FanPanel({
  room,
  count,
  status,
  micLevel,
  micProblem,
  listen,
  onPause,
  onStop,
  onMic,
  bounce = 0,
}: {
  room: CrowdState | null;
  count: number;
  status: 'idle' | 'paused' | 'recording';
  micLevel: number;
  micProblem: boolean;
  listen: boolean;
  onPause: () => void;
  onStop: () => void;
  onMic: () => void;
  bounce?: number;
}) {
  const live = room?.state === 'live' && room.laughlineViewers >= 3;
  const words = visibleWords(room).filter((w) => w.word !== '—');
  const active = micLevel > 0.003 || bounce > 0;
  return (
    <div className="fan-panel-content">
      {live ? (
        <div className="fans-count">
          <span>fans laughing now</span>
          <strong>{room.laughingNow}</strong>
        </div>
      ) : (
        <p className="fans-early">
          {status === 'idle'
            ? 'open the toolbar to start'
            : status === 'paused'
              ? 'paused'
              : room?.state === 'few' || (room && room.laughlineViewers < 3)
                ? "you're one of the first fans here"
                : 'fans are offline'}
        </p>
      )}
      <div className="laugh-meter" aria-label="live laugh meter">
        {[0, 1, 2, 3, 4].map((n) => (
          <i
            key={n}
            className={
              status === 'recording' &&
              (active || (live && room.laughingNow > n * 2))
                ? 'lit'
                : ''
            }
          />
        ))}
      </div>
      {words[0] && (
        <div className="fan-word">
          <span>top word from fans</span>
          <b>{words[0].word}</b>
        </div>
      )}
      <div className="personal-mic-row">
        <span className="glass-laugh-chip">
          <AppIcon mono size={18} />
          you: {count} {count === 1 ? 'laugh' : 'laughs'}
        </span>
        <button
          type="button"
          className={`panel-mic ${micProblem ? 'problem' : listen && micLevel > 0.003 ? 'hearing' : 'silent'}`}
          onClick={onMic}
          aria-label={
            micProblem
              ? 'microphone problem · test my mic'
              : listen && micLevel > 0.003
                ? 'microphone hearing you · test my mic'
                : 'microphone quiet · test my mic'
          }
          title="test my mic"
        >
          <i />
          <span>mic</span>
        </button>
      </div>
      {status !== 'idle' && (
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
      )}
      {(room?.source === 'fake' || room?.testTraffic) && (
        <p className="fans-test-label">test fans · simulated traffic</p>
      )}
    </div>
  );
}
