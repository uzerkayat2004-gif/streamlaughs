import { canRateStream } from '@laughline/shared';
import { db } from './db';
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
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
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    const sub = liveQuery(async () => {
      const [r, reply] = await Promise.all([
        db.recaps.get(id),
        chrome.runtime.sendMessage({ type: 'GET_STATE' }),
      ]);
      return (
        !!r &&
        canRateStream(r) &&
        reply?.ok &&
        reply.state.settings.sendRatings !== false
      );
    }).subscribe({ next: setEligible, error: () => setEligible(false) });
    return () => sub.unsubscribe();
  }, [id]);
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
      {eligible && !confirm && (
        <button
          type="button"
          className="saved-rate"
          onClick={() => {
            void command({ type: 'OPEN_RECAP', id, rating: true })
              .then(close)
              .catch(() => setError('couldn’t open · try again'));
          }}
        >
          rate it
        </button>
      )}
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
