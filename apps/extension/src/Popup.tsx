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
import { Backdrop, crowdLabel, Mark, Sheet, Timer, Toggle } from './components';
import { MicTest } from './MicTest';
import { AppIcon } from './AppIcon';
import { StopSaved } from './StopSaved';
import { StreamerAvatar } from './HistoryView';
import { db } from './db';
import type { StreamerProfile } from './history';
import { SITE_URL, UPDATE_KEY } from './site';
import { audioNotice, friendlyError } from './ui-status';
import {
  isZipInstall,
  UPDATE_ATTEMPT_KEY,
  UPDATE_LATER_KEY,
  UpdateAttemptSchema,
  updateResult,
} from './update-flow';
import { type UpdateStatus, UpdateStatusSchema } from './version-check';

export function Popup() {
  const [micTestOpen, setMicTestOpen] = useState(false);
  const { snapshot, ready } = useStore(surface.store);
  const [update, setUpdate] = useState<UpdateStatus>();
  const [later, setLater] = useState(false);
  const [updateToast, setUpdateToast] = useState('');
  useEffect(() => {
    if (!isZipInstall(chrome.runtime.id)) return;
    const accept = (value: unknown) => {
      const parsed = UpdateStatusSchema.safeParse(value);
      setUpdate(parsed.success ? parsed.data : undefined);
    };
    void chrome.storage.session
      .get(UPDATE_LATER_KEY)
      .then((result) => setLater(result[UPDATE_LATER_KEY] === true));
    void chrome.storage.local.get(UPDATE_ATTEMPT_KEY).then((result) => {
      const attempt = UpdateAttemptSchema.safeParse(result[UPDATE_ATTEMPT_KEY]);
      if (attempt.success && attempt.data.phase === 'result')
        setUpdateToast(
          updateResult(
            chrome.runtime.getManifest().version,
            attempt.data.version,
          ),
        );
    });
    void chrome.storage.local
      .get(UPDATE_KEY)
      .then((result) => accept(result[UPDATE_KEY]));
    void chrome.runtime.sendMessage({ type: 'UPDATE_CHECK' }).catch(() => {});
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
  const updateAvailable =
    isZipInstall(chrome.runtime.id) && !!SITE_URL && update?.available === true;
  async function openUpdate() {
    setBusy(true);
    setError('');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'OPEN_UPDATE' });
      if (!result?.ok) throw new Error('update unavailable · try again');
    } catch {
      setError('update unavailable · try again');
    } finally {
      setBusy(false);
    }
  }
  const [profile, setProfile] = useState<StreamerProfile>();
  useEffect(() => {
    if (activeChannel)
      void db.streamerProfiles.get(activeChannel).then(setProfile);
  }, [activeChannel]);
  async function primary() {
    if (busy || !ready) return;
    if (session) {
      const current = session;
      if (await act({ type: 'STOP' })) setEnded(current);
    } else if (updateAvailable && !later) await openUpdate();
    else if (channel) await act({ type: 'START', tabId });
    else await chrome.tabs.create({ url: 'https://www.twitch.tv/directory' });
  }
  return (
    <main className="popup">
      <Backdrop />
      <section className="screen" aria-label="Live">
        <header className="top">
          <Mark />
          <button
            type="button"
            className="iconbtn settings-gear"
            aria-label="settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} />
            {updateAvailable && (
              <i
                className="gear-update-dot"
                role="img"
                aria-label="new version available"
              />
            )}
          </button>
        </header>
        {activeChannel && (
          <div className="who">
            <StreamerAvatar
              login={activeChannel}
              name={session?.displayName || activeChannel}
              profile={profile}
              size={36}
            />
            <p title={session?.displayName || activeChannel}>
              {session?.displayName || activeChannel}
            </p>
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
            <div className="popup-session-main">
              <button
                type="button"
                className="smile-trigger"
                aria-label="stop session"
                disabled={busy}
                onClick={() => void primary()}
              >
                <AppIcon size={110} />
              </button>
              <span
                className={`mic-level-dot ${snapshot.capture.metrics.micLevel > 0.005 ? 'heard' : ''}`}
                aria-label={
                  snapshot.capture.metrics.micLevel > 0.005
                    ? 'mic receiving sound'
                    : 'mic quiet'
                }
              />
              <strong>{session.laughCount}</strong>
              <p>laughs so far</p>
            </div>
            <div className="bottom">
              <span className="glass-laugh-chip">
                <AppIcon size={18} />
                {session.laughCount} laughs
              </span>
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
              <button
                type="button"
                className="smile-trigger"
                aria-label={
                  updateAvailable && !later
                    ? `update to v${update?.latest}`
                    : channel
                      ? 'start session'
                      : 'open Twitch'
                }
                disabled={busy || !ready}
                onClick={() => void primary()}
              >
                <span className="smile-breath">
                  <AppIcon size={190} />
                </span>
              </button>
              <h1>
                {channel ? `${PRODUCT.pitch}.` : 'open any Twitch stream'}
              </h1>
              <p className="sub">
                {channel
                  ? 'your laughs. everyone’s reactions.'
                  : 'your people are one stream away.'}
              </p>
            </div>
            {updateAvailable && !later ? (
              <div className="popup-update">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !ready}
                  onClick={() => void openUpdate()}
                >
                  update to v{update.latest} <ArrowRight size={17} />
                </button>
                <p className="sub">new version ready</p>
                <button
                  type="button"
                  className="textbtn"
                  onClick={() => {
                    setLater(true);
                    void chrome.storage.session.set({
                      [UPDATE_LATER_KEY]: true,
                    });
                  }}
                >
                  later
                </button>
              </div>
            ) : channel ? (
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
          </>
        )}
        <nav className="popup-history-links" aria-label="your saved streams">
          <button
            type="button"
            className="textbtn"
            disabled={!snapshot.lastRecapId}
            onClick={() => void act({ type: 'OPEN_RECAP' })}
          >
            last recap
          </button>
          <span>·</span>
          <button
            type="button"
            className="textbtn"
            onClick={() => void act({ type: 'OPEN_RECAP', view: 'streamers' })}
          >
            my streamers
          </button>
          <span>·</span>
          <button
            type="button"
            className="textbtn"
            onClick={() => setMicTestOpen(true)}
          >
            test my mic
          </button>
        </nav>
        <small className="popup-version">
          v{chrome.runtime.getManifest().version}
        </small>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {updateToast && !session && (
          <div className="update-result" role="status">
            <p>{updateToast}</p>
            <button
              type="button"
              className="textbtn"
              onClick={() => {
                setUpdateToast('');
                void chrome.storage.local.remove(UPDATE_ATTEMPT_KEY);
              }}
            >
              dismiss
            </button>
          </div>
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
      {micTestOpen && (
        <Sheet title="test my mic" close={() => setMicTestOpen(false)}>
          <MicTest />
        </Sheet>
      )}
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
                title="share with the fans"
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
              {updateAvailable && (
                <button
                  type="button"
                  className="textbtn"
                  disabled={busy}
                  onClick={() => void openUpdate()}
                >
                  update to v{update.latest}
                </button>
              )}
              <button
                type="button"
                className="danger"
                onClick={() => setConfirmDelete(true)}
              >
                delete my data
              </button>
              <button
                type="button"
                className="textbtn settings-version"
                onClick={(event) => {
                  if (event.shiftKey)
                    void chrome.tabs.create({
                      url: chrome.runtime.getURL('/diagnostics.html'),
                    });
                }}
              >
                version {chrome.runtime.getManifest().version}
              </button>
            </>
          )}
        </Sheet>
      )}
      {ended && (
        <Sheet title="saved for you" close={() => setEnded(null)}>
          <StopSaved
            id={ended.id}
            seconds={
              snapshot.lastSaved?.durationSeconds ??
              (Date.now() - ended.startedAt) / 1000
            }
            laughs={ended.laughCount}
            close={() => setEnded(null)}
          />
        </Sheet>
      )}
    </main>
  );
}
