import { PRODUCT } from '@laughline/shared';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { MICROPHONE_CONSTRAINTS } from './audio/config';
import { command, connectSurface, surface } from './bridge';
import { Backdrop, Blob, Mark, Toggle, Wave } from './components';
import { friendlyError } from './ui-status';

export function Welcome() {
  const params = new URLSearchParams(location.search);
  const [slide, setSlide] = useState(params.get('step') === 'mic' ? 1 : 0),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  const { snapshot } = useStore(surface.store);
  useEffect(connectSurface, []);
  return (
    <main className="welcome-page">
      <div className="popup">
        <Backdrop />
        <section className="screen" aria-label="Welcome">
          <header className="top">
            <Mark />
          </header>
          <div
            className="slide"
            key={slide}
            aria-live="polite"
            aria-atomic="true"
          >
            {done ? (
              <>
                <Blob decorative />
                <h1>you’re ready.</h1>
                <p className="sub">
                  pin the icon · open a stream · press start
                </p>
              </>
            ) : (
              slide === 0 && (
                <>
                  <Blob decorative />
                  <h1>{PRODUCT.pitch}.</h1>
                </>
              )
            )}
            {!done && slide === 1 && (
              <>
                <Wave big />
                <h1>we listen for laughs.</h1>
                <p className="sub">
                  audio stays on your pc. never saved or sent.
                </p>
              </>
            )}
            {!done && slide === 2 && (
              <>
                <div className="wordsrow">
                  {['LMAO', 'no way', 'WHAT', 'bruh'].map((word, i) => (
                    <span
                      className="word"
                      key={word}
                      style={{
                        position: 'static',
                        fontSize: [20, 15, 24, 16][i],
                      }}
                    >
                      {word}
                    </span>
                  ))}
                </div>
                <h1>share with the crowd?</h1>
                <Toggle
                  title="share with the crowd"
                  detail="counts + approved phrases · shown with 3+ sharing"
                  on={snapshot.settings.share}
                  click={() =>
                    void command({
                      type: 'SETTINGS',
                      settings: { share: !snapshot.settings.share },
                    }).catch((error: Error) => setError(friendlyError(error)))
                  }
                />
                <p className="sub preview-note">
                  audio and transcripts stay on your pc. watch only still
                  reveals your channel connection to the server.
                </p>
              </>
            )}
          </div>
          <footer className="foot">
            <div
              className="dots"
              role="img"
              aria-label={`step ${slide + 1} of 3`}
            >
              {[0, 1, 2].map((n) => (
                <i key={n} className={n === slide ? 'on' : ''} />
              ))}
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                setError('');
                if (done) {
                  await chrome.tabs.create({
                    url: 'https://www.twitch.tv/directory',
                  });
                  return;
                }
                if (slide === 0) {
                  setSlide(1);
                  return;
                }
                if (slide === 1) {
                  setBusy(true);
                  let stream: MediaStream | undefined;
                  try {
                    stream = await navigator.mediaDevices.getUserMedia({
                      audio: MICROPHONE_CONSTRAINTS,
                      video: false,
                    });
                    // Permission belongs to this extension origin. Welcome never retains live tracks.
                    for (const track of stream.getTracks()) track.stop();
                    if (params.get('retry') === snapshot.session?.id)
                      await command({ type: 'RETRY_MIC' });
                    setSlide(2);
                  } catch {
                    setError(
                      'mic is blocked · allow it in extension settings, then retry',
                    );
                  } finally {
                    for (const track of stream?.getTracks() ?? []) track.stop();
                    setBusy(false);
                  }
                  return;
                }
                try {
                  await chrome.storage.local.set({
                    'laughline:onboarded': true,
                  });
                  setDone(true);
                  const returnTab = Number(params.get('returnTab'));
                  if (params.has('returnTab') && Number.isInteger(returnTab)) {
                    try {
                      await chrome.tabs.update(returnTab, { active: true });
                    } catch {
                      await chrome.tabs.create({
                        url: 'https://www.twitch.tv/directory',
                      });
                    }
                  } else
                    await chrome.tabs.create({
                      url: 'https://www.twitch.tv/directory',
                    });
                } catch (error) {
                  setError(friendlyError(error));
                }
              }}
            >
              {busy
                ? 'allowing mic…'
                : done
                  ? 'open twitch'
                  : ['let’s go', 'allow mic', 'open twitch'][slide]}
            </button>
            {!done && slide === 1 && (
              <button
                type="button"
                className="textbtn"
                disabled={busy}
                onClick={async () => {
                  try {
                    await command({
                      type: 'SETTINGS',
                      settings: { listen: false, share: false },
                    });
                    setError('');
                    setSlide(2);
                  } catch (error) {
                    setError(friendlyError(error));
                  }
                }}
              >
                watch without mic
              </button>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}
