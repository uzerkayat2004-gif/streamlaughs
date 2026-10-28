'use client';
import { PRODUCT } from '@laughline/shared';
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
            Windows: right-click the ZIP → <strong>Extract All</strong>. Keep
            the extracted folder somewhere permanent.
          </p>
          <p className="os-note">
            Mac: double-click the ZIP in Finder. Linux: use Extract here in your
            file manager.
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
            folder containing <code>manifest.json</code>.
          </p>
          <p className="folder-trap">
            folder inside a folder? open the inner one until you can see{' '}
            <code>manifest.json</code>, then pick that folder.
          </p>
        </article>
        <article className="install-step">
          <div className="step-art" aria-hidden="true">
            <div className="toolbar-illustration">
              <span>extensions</span>
              <svg
                className="setup-glyph"
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <path d="m25 8 28 28-8 3-11-11-9 9-2 12-8-8 12-2 9-9L25 19Z M23 41 10 54" />
              </svg>
              <small>pinned ✓</small>
            </div>
          </div>
          <p className="eyebrow">04 · keep us close</p>
          <h2>pin the icon.</h2>
          <p>
            Open your browser’s extensions menu (the puzzle piece). Pin{' '}
            {PRODUCT.name} so its icon stays beside the address bar.
          </p>
        </article>
        <article className="install-step">
          <div className="step-art" aria-hidden="true">
            <div className="permission-illustration">
              <svg
                className="setup-glyph"
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <rect x="24" y="8" width="16" height="30" rx="8" />
                <path d="M17 30v4a15 15 0 0 0 30 0v-4 M32 49v9 M23 58h18" />
              </svg>
              <span>allow mic ↗</span>
            </div>
          </div>
          <p className="eyebrow">05 · your laugh stays yours</p>
          <h2>say hello in Welcome.</h2>
          <p>
            Choose <strong>allow mic</strong> in Welcome, then allow the browser
            permission. Audio stays on your PC. Sharing with the crowd is a
            separate choice.
          </p>
        </article>
        <article className="install-step">
          <div className="step-art" aria-hidden="true">
            <div className="player-illustration">
              <span>● live</span>
              <svg
                className="setup-glyph"
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <path d="m25 17 24 15-24 15Z" />
              </svg>
              <small>your little crowd is here.</small>
            </div>
          </div>
          <p className="eyebrow">06 · find your people</p>
          <h2>open a live stream.</h2>
          <p>
            Open a live Twitch stream. Click the {PRODUCT.name} toolbar icon,
            then <strong>start</strong>. Give the local models a moment to warm
            up.
          </p>
        </article>
      </div>
      <aside
        className="update-note install-help"
        aria-labelledby="install-help-heading"
      >
        <span className="little-star">✳</span>
        <div>
          <h2 id="install-help-heading">stuck?</h2>
          <h3>manifest error?</h3>
          <p>
            pick the folder with <code>manifest.json</code> inside it, not the
            ZIP or its outer folder.
          </p>
          <h3>keep its little home.</h3>
          <p>
            don’t delete or move the extracted folder. your browser loads the
            extension from there.
          </p>
          <h3>time for an update?</h3>
          <p>
            download the new ZIP, replace the contents of the same folder, then
            click reload on the extensions page. refresh Twitch.
          </p>
        </div>
      </aside>
    </>
  );
}
