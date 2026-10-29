import { PRODUCT } from '@laughline/shared';
import { Copy, FolderArchive, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Mark } from './components';
import { SITE_URL, UPDATE_KEY } from './site';
import {
  UPDATE_ATTEMPT_KEY,
  UpdateAttemptSchema,
  updateFilename,
  updateResult,
  verifiedArchive,
} from './update-flow';
import { checkVersion } from './version-check';

async function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  let downloadId: number | undefined;
  try {
    downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    await new Promise<void>((resolve, reject) => {
      const finish = (success: boolean) => {
        clearTimeout(timeout);
        chrome.downloads.onChanged.removeListener(changed);
        if (success) resolve();
        else reject(new Error('download stopped · try again'));
      };
      const changed = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id !== downloadId) return;
        if (delta.state?.current === 'complete') finish(true);
        else if (delta.state?.current === 'interrupted') finish(false);
      };
      const timeout = setTimeout(() => finish(false), 120000);
      chrome.downloads.onChanged.addListener(changed);
      void chrome.downloads.search({ id: downloadId }).then(
        ([item]) => {
          if (item?.state === 'complete') finish(true);
          else if (!item || item.state === 'interrupted') finish(false);
        },
        () => finish(false),
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function UpdateView() {
  const [version, setVersion] = useState('');
  const [message, setMessage] = useState('checking for your update…');
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState('');
  const current = chrome.runtime.getManifest().version;
  const download = useCallback(async () => {
    setBusy(true);
    setDownloaded(false);
    setError('');
    setMessage('checking the latest ZIP…');
    try {
      const metadata = await checkVersion(
        SITE_URL,
        current,
        async () => (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY],
        async (value) => {
          await chrome.storage.local.set({ [UPDATE_KEY]: value });
        },
        Date.now(),
        0,
      );
      if (!metadata?.latest)
        throw new Error('update details unavailable · try again');
      if (!metadata.available) {
        setMessage(`you're on v${current}`);
        return;
      }
      if (!metadata.package)
        throw new Error('update details unavailable · try again');
      setVersion(metadata.latest);
      setMessage('downloading and checking SHA-256…');
      const response = await fetch(`${SITE_URL}/download`, {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(90000),
      });
      const blob = await verifiedArchive(response, metadata.package);
      await saveDownload(blob, updateFilename(metadata.latest));
      const tab = await chrome.tabs.getCurrent();
      await chrome.storage.local.set({
        [UPDATE_ATTEMPT_KEY]: {
          version: metadata.latest,
          phase: 'downloaded',
          tabId: tab?.id,
        },
      });
      setMessage('your download is ready · checksum checked');
      setDownloaded(true);
    } catch (cause) {
      const safe =
        cause instanceof Error &&
        /^(download (unavailable|changed|incomplete|stopped)|update details unavailable) · try again$/.test(
          cause.message,
        );
      setError(safe ? cause.message : 'download unavailable · try again');
      setMessage('let’s try that download again');
    } finally {
      setBusy(false);
    }
  }, [current]);
  useEffect(() => {
    void (async () => {
      const attempt = UpdateAttemptSchema.safeParse(
        (await chrome.storage.local.get(UPDATE_ATTEMPT_KEY))[
          UPDATE_ATTEMPT_KEY
        ],
      );
      if (
        new URLSearchParams(location.search).has('download') ||
        !attempt.success
      ) {
        await download();
        return;
      }
      setVersion(attempt.data.version);
      setMessage(
        attempt.data.phase === 'result'
          ? updateResult(current, attempt.data.version)
          : 'your download is ready · checksum checked',
      );
      setDownloaded(current !== attempt.data.version);
    })();
  }, [current, download]);
  const success = message === `you're on v${current}`;
  return (
    <main className="update-page">
      <Mark />
      <p className="update-eyebrow">a little refresh</p>
      <h1>
        {success
          ? 'all caught up.'
          : `update ${PRODUCT.name}${version ? ` to v${version}` : ''}.`}
      </h1>
      <p className="update-status" role="status">
        {message}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message === 'files not replaced yet' && (
        <aside className="update-help">
          copy into the folder you originally loaded, replacing its files. open
          any nested folder until you see manifest.json. copy those contents,
          not the outer folder.
        </aside>
      )}
      {!success && (
        <>
          <div className="update-steps">
            <article>
              <div className="update-art" aria-hidden="true">
                <FolderArchive size={62} />
                <span>.zip → folder</span>
              </div>
              <p className="update-eyebrow">01 · unzip</p>
              <h2>open your download.</h2>
              <p>
                Windows: right-click → Extract All. Mac: double-click in Finder.
                Linux: Extract here.
              </p>
            </article>
            <article>
              <div className="update-art" aria-hidden="true">
                <Copy size={62} />
                <span>manifest.json + everything</span>
              </div>
              <p className="update-eyebrow">02 · same little home</p>
              <h2>replace the files inside.</h2>
              <p>
                Copy everything from the new folder into your existing{' '}
                {PRODUCT.name} folder. Windows: choose “Replace the files”. Mac:
                choose “Replace”. Keep the same folder. Don’t delete or move it.
              </p>
              <p>
                Pick the contents beside manifest.json, not a folder inside a
                folder. Your saved recaps and settings stay in your browser.
              </p>
            </article>
            <article>
              <div className="update-art" aria-hidden="true">
                <RefreshCw size={62} />
                <span>hello, new version.</span>
              </div>
              <p className="update-eyebrow">03 · come back here</p>
              <h2>finish your update.</h2>
              <p>
                After replacing the files, press finish update below. Any
                recording ends safely and saves a recap first. Refresh Twitch
                afterwards.
              </p>
            </article>
          </div>
          <div className="update-actions">
            <button
              type="button"
              className="btn"
              disabled={!downloaded || busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                setMessage('saving your session and reloading…');
                try {
                  const reply = await chrome.runtime.sendMessage({
                    type: 'FINISH_UPDATE',
                  });
                  if (!reply?.ok) throw new Error();
                } catch {
                  setError('update could not finish · try again');
                  setBusy(false);
                }
              }}
            >
              finish update
            </button>
            <button
              type="button"
              className="textbtn"
              disabled={busy}
              onClick={() => void download()}
            >
              download again
            </button>
          </div>
        </>
      )}
      {success && (
        <p>
          your recaps and settings are right where you left them. refresh
          Twitch, then open the toolbar icon.
        </p>
      )}
    </main>
  );
}
