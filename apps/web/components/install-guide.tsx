'use client';
import { useState } from 'react';
import { Arrow } from './brand';
export function InstallGuide({ releaseUrl }: { releaseUrl: string | null }) {
  const [browser, setBrowser] = useState<'chrome' | 'edge'>('chrome'),
    [copied, setCopied] = useState(false);
  const address =
    browser === 'chrome' ? 'chrome://extensions' : 'edge://extensions';
  return (
    <>
      <div className="browser-tabs" role="tablist" aria-label="browser">
        <button
          type="button"
          role="tab"
          aria-selected={browser === 'chrome'}
          onClick={() => {
            setBrowser('chrome');
            setCopied(false);
          }}
        >
          Chrome
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={browser === 'edge'}
          onClick={() => {
            setBrowser('edge');
            setCopied(false);
          }}
        >
          Edge
        </button>
      </div>
      <div className="install-steps">
        <article className="install-step">
          <div className="step-art art-download" aria-hidden="true">
            <div className="zip-icon">
              .zip
              <svg viewBox="0 0 30 30" aria-hidden="true">
                <path d="M15 3v18m-7-7 7 7 7-7M5 25h20" />
              </svg>
            </div>
            <span>↙ yours to keep</span>
          </div>
          <p className="eyebrow">01 · get the little thing</p>
          <h2>download. unzip.</h2>
          <p>
            Grab the {browser === 'edge' ? 'Edge' : 'Chrome'} extension ZIP from
            GitHub Releases. Extract it somewhere you’ll keep it.
          </p>
          {releaseUrl ? (
            <a
              className="text-link"
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              download the ZIP <Arrow />
            </a>
          ) : (
            <p className="release-note">
              Release link coming soon. The repository hasn’t been chosen yet.
            </p>
          )}
        </article>
        <article className="install-step">
          <div className="step-art art-browser" aria-hidden="true">
            <div className="mini-browser">
              <i />
              <i />
              <i />
              <div>
                extensions <span className="mini-switch" />
              </div>
              <small>developer mode · on</small>
            </div>
          </div>
          <p className="eyebrow">02 · make a little room</p>
          <h2>open extensions.</h2>
          <p>
            Paste this address in your browser. Switch{' '}
            <strong>Developer mode</strong> on.
          </p>
          <button
            type="button"
            className="copy-address"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {address}
            <span>{copied ? 'copied ✓' : 'copy ↗'}</span>
          </button>
        </article>
        <article className="install-step">
          <div className="step-art art-folder" aria-hidden="true">
            <div className="folder-icon">♥</div>
            <span>hello, crowd.</span>
          </div>
          <p className="eyebrow">03 · let us in</p>
          <h2>load. pin. laugh.</h2>
          <p>
            Choose <strong>Load unpacked</strong>, then select the extracted{' '}
            {browser === 'edge' ? 'Edge' : 'Chrome'} folder containing{' '}
            <code>manifest.json</code>. Pin the icon and open a Twitch stream.
          </p>
        </article>
      </div>
      <aside className="update-note">
        <span className="little-star">✳</span>
        <div>
          <h3>new version? same little home.</h3>
          <p>
            Download the new ZIP, replace the contents of your existing
            extension folder, then press reload on the extensions page. Refresh
            Twitch. The fixed ID keeps your new-install preferences and recaps
            in the same browser profile.
          </p>
          <small>
            Coming from Parts 1–4? The ID changes once. Keep the old copy until
            you’ve finished viewing its recaps; browser data cannot cross
            extension origins.
          </small>
        </div>
      </aside>
    </>
  );
}
