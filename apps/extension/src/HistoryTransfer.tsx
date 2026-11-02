import { useRef, useState } from 'react';
import { command } from './bridge';
import { db } from './db';
import {
  downloadHistoryFile,
  exportHistory,
  HISTORY_MAX_BYTES,
  importHistory,
} from './history-transfer';

export function HistoryTransfer({ save = false }: { save?: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="history-transfer">
      {save && (
        <button
          type="button"
          className="textbtn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await command({ type: 'STOP' });
              downloadHistoryFile(
                exportHistory({
                  sessions: (await db.sessions.toArray()).filter(
                    (s) => s.endedAt !== null,
                  ),
                  recaps: await db.recaps.toArray(),
                }),
              );
              setStatus('history saved · keep this file private');
            } catch {
              setStatus('couldn’t save history · try again');
            } finally {
              setBusy(false);
            }
          }}
        >
          save my history
        </button>
      )}
      <button
        className="textbtn"
        type="button"
        disabled={busy}
        onClick={() => picker.current?.click()}
      >
        load history
      </button>
      <input
        ref={picker}
        type="file"
        accept=".json,application/json"
        aria-label="choose saved history JSON"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            if (file.size > HISTORY_MAX_BYTES) throw new Error('too large');
            const result = await importHistory(await file.text());
            setStatus(
              `history loaded · ${result.sessions} new sessions, ${result.recaps} new recaps`,
            );
          } catch {
            setStatus(
              'couldn’t read this history · choose a StreamLaughs JSON file',
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {status && (
        <p className="sub" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
