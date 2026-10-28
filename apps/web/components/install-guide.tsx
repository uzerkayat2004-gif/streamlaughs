'use client';
import { useState } from 'react';
export function InstallGuide() {
  const [browser, setBrowser] = useState<'chrome' | 'edge' | 'brave'>('chrome'),
    [copied, setCopied] = useState(false);
  const address = `${browser}://extensions`;
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
        <button
          type="button"
          role="tab"
          aria-selected={browser === 'brave'}
          onClick={() => {
            setBrowser('brave');
            setCopied(false);
          }}
        >
          Brave
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
          <p className="eyebrow">01 · give it a home</p>
          <h2>unzip the download.</h2>
          <p>
            Extract the ZIP into a folder you’ll keep. The same download works
            in every supported browser.
          </p>
          <p className="os-note">
            Mac: double-click in Finder. Linux: use Extract here in your file
            manager.
          </p>
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
          <h2>load unpacked.</h2>
          <p>
            Choose <strong>Load unpacked</strong>, then select the extracted{' '}
            folder containing <code>manifest.json</code>. Pin the icon and open
            a Twitch stream.
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
