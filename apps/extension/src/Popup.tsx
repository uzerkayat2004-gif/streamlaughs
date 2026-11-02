import {
  type Command,
  cleanChannel,
  type MySession,
  PRODUCT,
  replayPage,
} from '@laughline/shared';
import { ArrowRight, Pause, Play, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { AppIcon } from './AppIcon';
import { command, connectSurface, surface } from './bridge';
import { Backdrop, crowdLabel, Mark, Sheet, Timer, Toggle } from './components';
import { db } from './db';
import { HistoryTransfer } from './HistoryTransfer';
import { StreamerAvatar } from './HistoryView';
import type { StreamerProfile } from './history';
import {
  getInstallKind,
  type InstallKind,
  installPresentation,
} from './install-type';
import { MicDevicePicker } from './MicDevicePicker';
import { MicTest } from './MicTest';
import { StopSaved } from './StopSaved';
import { SITE_URL } from './site';

const STREAMER_PAGE = `${SITE_URL || PRODUCT.siteUrl}/dashboard?from=extension`;

import { stopWithPreview } from './stop-preview';
import { audioNotice, friendlyError } from './ui-status';
import { resolveWatchContext } from './watch-context';

export function Popup() {
  const [micTestOpen, setMicTestOpen] = useState(false);
  const { snapshot, ready } = useStore(surface.store);
  const [install, setInstall] = useState<InstallKind>('other');
  useEffect(() => {
    void getInstallKind().then(setInstall);
  }, []);
  const manual = installPresentation(install).switchBanner;
  const [replay, setReplay] = useState(false),
    [typedChannel, setTypedChannel] = useState('');
  const [contextLoading, setContextLoading] = useState(true);
  const [onTwitch, setOnTwitch] = useState(false),
    [contextName, setContextName] = useState('');
  const [channel, setChannel] = useState<string | null>(null),
    [tabId, setTabId] = useState<number>();
  const [settingsOpen, setSettingsOpen] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const [ended, setEnded] = useState<MySession | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const disconnect = connectSurface(250);
    let live = true;
    const refresh = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const context = await resolveWatchContext(tab ?? {});
        if (live) {
          setChannel(context.channel);
          setReplay(context.replay === true || !!replayPage(tab?.url ?? ''));
          setOnTwitch(context.onTwitch || context.unknown === true);
          setContextLoading(false);
          setContextName(context.displayName || '');
          setTabId(tab?.id);
        }
      } catch {
        if (live) {
          setContextLoading(false);
          setOnTwitch(true);
          setError('couldn’t read this tab · reopen the popup');
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 750);
    const updated = () => void refresh();
    chrome.tabs.onUpdated.addListener(updated);
    chrome.tabs.onActivated.addListener(updated);
    return () => {
      live = false;
      clearInterval(timer);
      disconnect();
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.tabs.onActivated.removeListener(updated);
    };
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
  async function openMigration() {
    await chrome.tabs.create({ url: chrome.runtime.getURL('/update.html') });
  }
  const [profile, setProfile] = useState<StreamerProfile>();
  useEffect(() => {
    if (activeChannel)
      void db.streamerProfiles.get(activeChannel).then(setProfile);
  }, [activeChannel]);
  async function primary() {
    if (busy || !ready || (contextLoading && !session)) return;
    if (session) {
      const current = session;
      await stopWithPreview(
        current,
        () => setEnded({ ...current, endedAt: Date.now() }),
        () => act({ type: 'STOP' }),
      );
    } else if (channel || (replay && cleanChannel(typedChannel)))
      await act({
        type: 'START',
        tabId,
        ...(replay && !channel ? { channel: cleanChannel(typedChannel) } : {}),
      });
    else if (onTwitch)
      setError(
        replay
          ? 'add the streamer’s channel name below'
          : 'finding the channel · refresh the Twitch tab and reopen',
      );
    else await chrome.tabs.create({ url: 'https://www.twitch.tv/directory' });
  }
  return (
    <main className="popup">
      <Backdrop />
      <section className="screen" aria-label="Live">
        <header className="top">
          <a
            className="popup-brand"
            href={SITE_URL || PRODUCT.siteUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${PRODUCT.name} website`}
          >
            <Mark />
          </a>
          <button
            type="button"
            className="iconbtn settings-gear"
            aria-label="settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} />
          </button>
        </header>
        {activeChannel && (
          <div className="who">
            <StreamerAvatar
              login={activeChannel}
              name={session?.displayName || contextName || activeChannel}
              profile={profile}
              size={36}
            />
            <p title={session?.displayName || contextName || activeChannel}>
              {session?.displayName || contextName || activeChannel}
            </p>
            {session && (
              <>
                <span
                  className={`livepill ${snapshot.status === 'paused' ? 'paused' : snapshot.crowd?.state !== 'live' ? 'calm' : ''}`}
                >
                  <i />
                  {snapshot.status === 'paused'
                    ? 'paused'
                    : session.replay
                      ? 'replay · personal only'
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
                <span className="smile-breath">
                  <AppIcon size={110} />
                </span>
              </button>
              <span
                role="img"
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
                    await stopWithPreview(
                      current,
                      () => setEnded({ ...current, endedAt: Date.now() }),
                      () => act({ type: 'STOP' }),
                    );
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
                aria-label={channel ? 'start session' : 'open Twitch'}
                disabled={busy || !ready || contextLoading}
                onClick={() => void primary()}
              >
                <span className="smile-breath">
                  <AppIcon size={manual ? 140 : 190} />
                </span>
              </button>
              <h1>
                {contextLoading
                  ? 'finding your Twitch tab…'
                  : channel
                    ? replay
                      ? 'ready for this replay?'
                      : 'ready for your next laugh?'
                    : onTwitch
                      ? replay
                        ? 'a replay, your reactions.'
                        : 'finding this stream’s channel'
                      : 'open any Twitch stream'}
              </h1>
              <p className="sub">
                {channel
                  ? replay
                    ? 'replay · your reactions stay personal.'
                    : 'your laughs. everyone’s reactions.'
                  : 'your people are one stream away.'}
              </p>
            </div>
            {manual && (
              <aside className="store-switch" aria-label="switch to the store">
                <p>
                  StreamLaughs is now on the Chrome Web Store with automatic
                  updates.
                </p>
                <button
                  className="textbtn"
                  type="button"
                  onClick={() => void openMigration()}
                >
                  Switch ↗
                </button>
              </aside>
            )}
            {channel ? (
              <button
                type="button"
                className="btn"
                disabled={busy || !ready || contextLoading}
                onClick={() => void primary()}
              >
                start <ArrowRight size={17} />
              </button>
            ) : contextLoading ? (
              <p className="sub" role="status">
                checking this tab…
              </p>
            ) : replay ? (
              <form
                className="replay-channel-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void primary();
                }}
              >
                <label htmlFor="replay-channel">who are you watching?</label>
                <input
                  id="replay-channel"
                  aria-label="streamer channel"
                  value={typedChannel}
                  maxLength={25}
                  autoComplete="off"
                  placeholder="channel name, e.g. vernofps"
                  onChange={(e) =>
                    setTypedChannel(cleanChannel(e.target.value))
                  }
                />
                <button
                  className="btn"
                  type="submit"
                  disabled={busy || !ready || !cleanChannel(typedChannel)}
                >
                  start replay <ArrowRight size={17} />
                </button>
                <p className="sub">
                  personal only · no fan reactions are shared
                </p>
              </form>
            ) : onTwitch ? (
              <p role="status" className="sub">
                refresh the Twitch tab, then reopen this popup
              </p>
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
            onClick={() =>
              void chrome.tabs.create({
                url: chrome.runtime.getURL('/mic-test.html'),
              })
            }
          >
            test my mic
          </button>
        </nav>
        <a
          className="streamer-link"
          href={STREAMER_PAGE}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            e.preventDefault();
            void chrome.tabs.create({ url: STREAMER_PAGE });
          }}
        >
          <AppIcon size={14} /> streamer? see your fans ↗
        </a>
        <small className="popup-version">
          v{chrome.runtime.getManifest().version}
        </small>
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
            onClick={() => void primary()}
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
              <MicDevicePicker
                changed={() => {
                  if (snapshot.session) void act({ type: 'RETRY_MIC' });
                }}
              />
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
              <label className="sub">
                reaction sensitivity{' '}
                <select
                  aria-label="reaction sensitivity"
                  value={snapshot.settings.sensitivity ?? 'normal'}
                  onChange={(e) =>
                    void act({
                      type: 'SETTINGS',
                      settings: {
                        sensitivity: e.target.value as
                          | 'strict'
                          | 'normal'
                          | 'sensitive',
                      },
                    })
                  }
                >
                  <option value="strict">strict</option>
                  <option value="normal">normal</option>
                  <option value="sensitive">sensitive</option>
                </select>
              </label>
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
              <div className="streamer-row">
                <strong>for streamers</strong>
                <p className="sub">
                  see how your fans laughed and rated your streams
                </p>
                <a
                  className="streamer-link"
                  href={STREAMER_PAGE}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    void chrome.tabs.create({ url: STREAMER_PAGE });
                  }}
                >
                  <AppIcon size={14} /> streamer? see your fans ↗
                </a>
              </div>
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
              <Toggle
                title="send stream ratings"
                detail="anonymous. streamers only see averages from 5+ fans."
                on={snapshot.settings.sendRatings !== false}
                click={() =>
                  void act({
                    type: 'SETTINGS',
                    settings: {
                      sendRatings: snapshot.settings.sendRatings === false,
                    },
                  })
                }
              />
              <HistoryTransfer save={manual} />
              {manual && (
                <button
                  type="button"
                  className="textbtn"
                  onClick={() => void openMigration()}
                >
                  Switch to the store ↗
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
              snapshot.lastSaved?.id === ended.id
                ? snapshot.lastSaved.durationSeconds
                : ((ended.endedAt ?? Date.now()) - ended.startedAt) / 1000
            }
            laughs={
              snapshot.lastSaved?.id === ended.id
                ? snapshot.lastSaved.laughs
                : ended.laughCount
            }
            close={() => setEnded(null)}
          />
        </Sheet>
      )}
    </main>
  );
}
