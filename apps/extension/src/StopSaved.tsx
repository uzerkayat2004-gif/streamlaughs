import { useState } from 'react';
import { command } from './bridge';
import { duration } from './recap-story';
export function StopSaved({
  id,
  seconds,
  laughs,
  close,
}: {
  id: string;
  seconds: number;
  laughs: number;
  close: () => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="saved-flow">
      <p>
        {confirm
          ? 'discard this saved stream?'
          : `stream saved · ${duration(seconds)} · ${laughs} laughs`}
      </p>
      <div className="saved-flow-actions">
        <button
          type="button"
          onClick={async () => {
            try {
              await command(
                confirm
                  ? { type: 'DISCARD_RECAP', id }
                  : { type: 'OPEN_RECAP', id },
              );
              close();
            } catch {
              setError('couldn’t finish · try again');
            }
          }}
        >
          {confirm ? 'discard' : 'see recap'}
        </button>
        <button
          type="button"
          onClick={() => (confirm ? setConfirm(false) : close())}
        >
          {confirm ? 'keep it' : 'later'}
        </button>
      </div>
      {!confirm && (
        <button
          type="button"
          className="saved-discard"
          onClick={() => setConfirm(true)}
        >
          discard
        </button>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
