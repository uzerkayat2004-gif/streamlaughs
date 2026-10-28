import {
  type Command,
  type MySession,
  PRODUCT,
  parseChannel,
} from '@laughline/shared';
import { ArrowRight, Pause, Play, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { command, connectSurface, surface } from './bridge';
import {
  Backdrop,
  Blob,
  Confetti,
  crowdLabel,
  Mark,
  Sheet,
  Timer,
  Toggle,
  Words,
  YouPill,
} from './components';
import { SITE_URL, UPDATE_KEY } from './site';
import { audioNotice, friendlyError } from './ui-status';

export function Popup() {
  const { snapshot, ready } = useStore(surface.store);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    const accept = (value: unknown) =>
      setUpdateAvailable(
        !!value &&
          typeof value === 'object' &&
          'available' in value &&
          value.available === true,
      );
    void chrome.storage.local
      .get(UPDATE_KEY)
      .then((result) => accept(result[UPDATE_KEY]));
    const changed = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && changes[UPDATE_KEY])
        accept(changes[UPDATE_KEY].newValue);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);
  const [channel, setChannel] = useState<string | null>(null),
    [tabId, setTabId] = useState<number>();
  const [settingsOpen, setSettingsOpen] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const [ended, setEnded] = useState<MySession | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const disconnect = connectSurface();
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        setChannel(parseChannel(tab?.url ?? ''));
        setTabId(tab?.id);
      });
    return disconnect;
  }, []);
  async function act(message: Command) {
    setBusy(true);
    setError('');
    try {
      await command(message);
      return true;
    } catch (error) {
      setError(friendlyError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const session = snapshot.session,
    activeChannel = session?.channel ?? channel,
    notice = audioNotice(snapshot);
  return (
    <main className="popup">
      <Backdrop />
      <section className="screen" aria-label="Live">
        <header className="top">
          <Mark />
          {SITE_URL && updateAvailable && (
            <a
              className="update-dot"
              href={`${SITE_URL}/install`}
              target="_blank"
              rel="noreferrer"
              aria-label="new version available"
              title="new version"
            >
              <i />
            </a>
          )}
          <button
            type="button"
            className="iconbtn"
            aria-label="settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} />
          </button>
        </header>
        {activeChannel && (
          <div className="who">
            <span className="av">{activeChannel[0]?.toUpperCase()}</span>
            <p>{activeChannel}</p>
            {session && (
              <>
                <span
                  className={`livepill ${snapshot.status === 'paused' ? 'paused' : snapshot.crowd?.state !== 'live' ? 'calm' : ''}`}
                >
                  <i />
                  {snapshot.status === 'paused'
                    ? 'paused'
                    : crowdLabel(snapshot.crowd)}
                </span>
                <Timer start={session.startedAt} />
              </>
            )}
          </div>
        )}
        {session ? (
          <>
            <div
              className={`stagewrap ${snapshot.status === 'paused' ? 'is-paused' : ''}`}
            >
              <Words crowd={snapshot.crowd} />
              <Blob
                crowd={snapshot.crowd}
                count={snapshot.crowd?.laughingNow ?? 0}
                paused={snapshot.status === 'paused'}
              />
            </div>
            <div className="bottom">
              <YouPill
                count={session.laughCount}
                paused={snapshot.status === 'paused'}
              />
              <button
                type="button"
                className="iconbtn pause-mini"
                aria-label={snapshot.status === 'paused' ? 'resume' : 'pause'}
                disabled={busy}
                onClick={() => void act({ type: 'PAUSE' })}
              >
                {snapshot.status === 'paused' ? (
                  <Play size={15} />
                ) : (
                  <Pause size={15} />
                )}
              </button>
              <div className="stopwrap">
                <button
                  type="button"
                  className="stop"
                  aria-label="stop"
                  disabled={busy}
                  onClick={async () => {
                    const current = session;
                    if (await act({ type: 'STOP' })) setEnded(current);
                  }}
                >
                  <i />
                </button>
                <span>stop</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="idle-stage">
              <Blob decorative count={0} />
              <h1>
                {channel ? `${PRODUCT.pitch}.` : 'open any Twitch stream'}
              </h1>
              <p className="sub">
                {channel
                  ? 'your laughs. everyone’s reactions.'
                  : 'your people are one stream away.'}
              </p>
            </div>
            {channel ? (
              <button
                type="button"
                className="btn"
                disabled={busy || !ready}
                onClick={() => void act({ type: 'START', tabId })}
              >
                start <ArrowRight size={17} />
              </button>
            ) : (
              <a
                className="btn"
                href="https://www.twitch.tv/directory"
                target="_blank"
                rel="noreferrer"
              >
                open Twitch <ArrowRight size={17} />
              </a>
            )}
            {snapshot.lastRecapId && (
              <button
                type="button"
                className="textbtn"
                onClick={() => void act({ type: 'OPEN_RECAP' })}
              >
                see your last recap
              </button>
            )}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice &&
          (notice.action ? (
            <button
              type="button"
              className="audio-notice"
              disabled={busy}
              onClick={async () => {
                if (notice.action === 'retryMic')
                  await act({ type: 'RETRY_MIC' });
                else if (notice.action === 'startAudio')
                  await act({ type: 'START', tabId: session?.tabId ?? tabId });
                else {
                  if (
                    snapshot.status === 'recording' &&
                    !(await act({ type: 'PAUSE' }))
                  )
                    return;
                  await act({ type: 'PAUSE' });
                }
              }}
            >
              {notice.text}
            </button>
          ) : (
            <p className="audio-notice" role="status">
              {notice.text}
            </p>
          ))}
        {session && channel && tabId !== session.tabId && (
          <button
            type="button"
            className="textbtn"
            disabled={busy}
            onClick={() => void act({ type: 'START', tabId })}
          >
            start on {channel}
          </button>
        )}
      </section>
      {settingsOpen && (
        <Sheet
          title={confirmDelete ? 'delete your data?' : 'settings'}
          close={() => {
            setSettingsOpen(false);
            setConfirmDelete(false);
          }}
        >
          {confirmDelete ? (
            <>
              <p className="sub space-top">
                This ends your session and deletes your saved sessions, recaps
                and preferences from this browser.
              </p>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={async () => {
                  if (await act({ type: 'DELETE_DATA' })) {
                    setEnded(null);
                    setConfirmDelete(false);
                    setSettingsOpen(false);
                  }
                }}
              >
                delete my data
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirmDelete(false)}
              >
                keep my data
              </button>
            </>
          ) : (
            <>
              <Toggle
                title="listen for my laughs"
                on={snapshot.settings.listen}
                click={() =>
                  void act({
                    type: 'SETTINGS',
                    settings: { listen: !snapshot.settings.listen },
                  })
                }
              />
              <Toggle
                title="share with the crowd"
                detail="anonymous"
                on={snapshot.settings.share}
                click={() =>
                  void act({
                    type: 'SETTINGS',
                    settings: { share: !snapshot.settings.share },
                  })
                }
              />
              <p className="sub preview-note">
                Sharing sends counts and approved phrases. Watch only still
                reveals channel presence.
                <br />
                Audio is processed on your PC and never saved or sent.
              </p>
              {SITE_URL && (
                <a
                  className="textbtn"
                  href={`${SITE_URL}/privacy`}
                  target="_blank"
                  rel="noreferrer"
                >
                  privacy ↗
                </a>
              )}
              <button
                type="button"
                className="danger"
                onClick={() => setConfirmDelete(true)}
              >
                delete my data
              </button>
            </>
          )}
        </Sheet>
      )}
      {ended && (
        <>
          <Confetti />
          <Sheet title="nice session" close={() => setEnded(null)}>
            <p className="big">{ended.laughCount} laughs</p>
            <p className="sub">with {ended.channel}</p>
            <button
              type="button"
              className="btn"
              onClick={() => void act({ type: 'OPEN_RECAP', id: ended.id })}
            >
              see recap
            </button>
          </Sheet>
        </>
      )}
    </main>
  );
}
