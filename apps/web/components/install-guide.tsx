'use client';
import { PRODUCT } from '@laughline/shared';
import { useState } from 'react';

function InstallPicture({ step, address }: { step: number; address: string }) {
  return (
    <div className={`install-picture picture-${step}`} aria-hidden="true">
      <svg viewBox="0 0 400 220" fill="none" aria-hidden="true">
        {step === 1 ? (
          <>
            <rect
              x="60"
              y="32"
              width="112"
              height="150"
              rx="12"
              fill="#171b21"
              stroke="#667077"
            />
            <path
              d="M116 33v111m-6-98h12m-12 15h12m-12 15h12m-12 15h12m-12 15h12"
              stroke="#FFD23F"
              strokeWidth="5"
            />
            <path
              d="m211 104 24 0m-9-9 9 9-9 9"
              stroke="#2EE6C5"
              strokeWidth="3"
            />
            <path d="M263 75h39l10 13h43v83h-92Z" fill="#FFD23F" />
            <path d="M263 100h92" stroke="#b99728" strokeWidth="2" />
            <text x="78" y="165" fill="#f4f2ed" fontSize="16">
              .zip
            </text>
          </>
        ) : step === 2 ? (
          <>
            <rect
              x="30"
              y="27"
              width="340"
              height="166"
              rx="12"
              fill="#171b21"
              stroke="#59616b"
            />
            <path d="M30 62h340" stroke="#59616b" />
            <circle cx="47" cy="44" r="3" fill="#FF5C5C" />
            <circle cx="60" cy="44" r="3" fill="#FFD23F" />
            <text x="79" y="49" fill="#f4f2ed" fontSize="13">
              {address}
            </text>
            <text x="49" y="102" fill="#f4f2ed" fontSize="17">
              Extensions
            </text>
            <text x="233" y="99" fill="#bbc0c7" fontSize="11">
              Developer mode
            </text>
            <rect x="319" y="85" width="31" height="17" rx="9" fill="#2EE6C5" />
            <circle cx="341" cy="93.5" r="6" fill="#090b10" />
            <rect
              x="49"
              y="127"
              width="118"
              height="33"
              rx="5"
              stroke="#FFD23F"
            />
            <text x="59" y="149" fill="#FFD23F" fontSize="12">
              Load unpacked
            </text>
          </>
        ) : step === 3 ? (
          <>
            <rect
              x="46"
              y="28"
              width="308"
              height="165"
              rx="12"
              fill="#171b21"
              stroke="#59616b"
            />
            <path d="M46 64h308" stroke="#59616b" />
            <text x="64" y="51" fill="#bbc0c7" fontSize="12">
              Choose a folder
            </text>
            <path d="M67 82h22l6 8h36v28H67Z" fill="#FFD23F" />
            <text x="144" y="106" fill="#f4f2ed" fontSize="16">
              {PRODUCT.name}
            </text>
            <text x="80" y="145" fill="#2EE6C5" fontSize="13">
              ↳ manifest.json
            </text>
            <rect
              x="246"
              y="154"
              width="87"
              height="25"
              rx="5"
              fill="#2EE6C5"
            />
            <text x="259" y="171" fill="#090b10" fontSize="11">
              Select folder
            </text>
          </>
        ) : (
          <>
            <rect
              x="32"
              y="30"
              width="336"
              height="160"
              rx="12"
              fill="#171b21"
              stroke="#59616b"
            />
            <path d="M32 66h336" stroke="#59616b" />
            <text x="52" y="54" fill="#bbc0c7" fontSize="13">
              a live Twitch stream
            </text>
            <circle cx="341" cy="48" r="10" fill="#FFD23F" />
            <path d="M336 49q5 8 10 0" stroke="#090b10" strokeWidth="2" />
            <circle cx="338" cy="45" r="1" fill="#090b10" />
            <circle cx="344" cy="45" r="1" fill="#090b10" />
            <rect
              x="202"
              y="77"
              width="149"
              height="95"
              rx="9"
              fill="#090b10"
              stroke="#FFD23F"
            />
            <text x="216" y="100" fill="#f4f2ed" fontSize="13">
              {PRODUCT.wordmark}
            </text>
            <rect
              x="216"
              y="120"
              width="120"
              height="31"
              rx="16"
              fill="#FFD23F"
            />
            <text x="265" y="141" fill="#090b10" fontSize="14">
              start
            </text>
            <path d="m100 102 27 20-27 20Z" fill="#2EE6C5" />
          </>
        )}
      </svg>
    </div>
  );
}

export function InstallGuide() {
  const browsers = ['chrome', 'edge', 'brave'] as const;
  const [browser, setBrowser] = useState<(typeof browsers)[number]>('chrome'),
    [copied, setCopied] = useState(false);
  const address = `${browser}://extensions`;
  return (
    <>
      <div className="browser-tabs" role="tablist" aria-label="your browser">
        {browsers.map((name, index) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${name}-tab`}
            aria-selected={browser === name}
            aria-controls="manual-instructions"
            tabIndex={browser === name ? 0 : -1}
            onClick={() => {
              setBrowser(name);
              setCopied(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')
                return;
              event.preventDefault();
              const next = (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
              setBrowser(browsers[next]!);
              setCopied(false);
              const nextButton =
                event.currentTarget.parentElement?.children[next];
              if (nextButton instanceof HTMLButtonElement) nextButton.focus();
            }}
          >
            {name[0]!.toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>
      <div
        id="manual-instructions"
        role="tabpanel"
        aria-labelledby={`${browser}-tab`}
        className="install-steps"
      >
        <article className="install-step">
          <InstallPicture step={1} address={address} />
          <p className="eyebrow">01</p>
          <h2>unzip it.</h2>
          <p>
            Right-click the downloaded file → <strong>Extract All</strong>.
          </p>
          <small>Mac: double-click. Keep the folder.</small>
        </article>
        <article className="install-step">
          <InstallPicture step={2} address={address} />
          <p className="eyebrow">02</p>
          <h2>open extensions.</h2>
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
            aria-label={`copy ${address}`}
          >
            {address}
            <span aria-live="polite">{copied ? 'copied ✓' : 'copy ↗'}</span>
          </button>
          <p>
            Paste it in your address bar, then turn on{' '}
            <strong>Developer mode</strong> (top-right).
          </p>
        </article>
        <article className="install-step">
          <InstallPicture step={3} address={address} />
          <p className="eyebrow">03</p>
          <h2>load it.</h2>
          <p>
            Click <strong>Load unpacked</strong> and choose the {PRODUCT.name}{' '}
            folder.
          </p>
          <small>Pick the folder that has the files inside, not the ZIP.</small>
        </article>
        <article className="install-step">
          <InstallPicture step={4} address={address} />
          <p className="eyebrow">04</p>
          <h2>start laughing.</h2>
          <p>
            Pin the icon, open a live Twitch stream, click {PRODUCT.name} →{' '}
            <strong>Start</strong>.
          </p>
          <small>
            First time, say yes to the mic permission in Welcome. Your audio
            never leaves your PC.
          </small>
        </article>
      </div>
      <details className="install-help">
        <summary>
          something not working? <span>+</span>
        </summary>
        <div>
          <h3>“Manifest file is missing”</h3>
          <p>
            You picked the wrong folder. Open it until you see files like{' '}
            <code>manifest.json</code>, and choose that one.
          </p>
          <h3>{PRODUCT.name} disappeared</h3>
          <p>
            Don’t delete or move the unzipped folder. Your browser runs it from
            there.
          </p>
          <h3>how do I update?</h3>
          <p>
            Click the {PRODUCT.name} icon → update. Download, replace the files
            in the same folder, then press finish. Your recaps stay saved. Store
            installs update through your browser’s store.
          </p>
        </div>
      </details>
    </>
  );
}
