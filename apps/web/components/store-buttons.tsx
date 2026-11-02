'use client';
import {
  type BrowserHints,
  PRODUCT,
  type StoreBrowser,
  storeBehind,
  storeBrowser,
  storeChoice,
} from '@laughline/shared';
import { useEffect, useState } from 'react';
import { Arrow } from './brand';

export function useStoreBrowser() {
  const [browser, setBrowser] = useState<StoreBrowser>('unknown');
  useEffect(() => setBrowser(storeBrowser(navigator as BrowserHints)), []);
  return browser;
}

export function StoreButtons({ compact = false }: { compact?: boolean }) {
  const browser = useStoreBrowser();
  const [latest, setLatest] = useState(PRODUCT.version);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (compact) return;
    const abort = new AbortController();
    void fetch('/version.json', { credentials: 'omit', signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (/^\d+(?:\.\d+){2,3}$/.test(v?.version ?? '')) setLatest(v.version);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [compact]);
  const choice = storeChoice(browser);
  const both = browser === 'unknown' || browser === 'unsupported';
  return (
    <div className={`store-actions${compact ? ' store-actions-compact' : ''}`}>
      {browser === 'unsupported' && (
        <p className="store-support">
          StreamLaughs works on desktop Chrome and Edge
        </p>
      )}
      <div className="store-buttons">
        <a className={compact ? 'nav-cta' : 'button yellow'} href={choice.url}>
          {choice.label} <Arrow />
        </a>
        {both && (
          <a
            className={compact ? 'nav-cta' : 'button outline'}
            href={PRODUCT.edgeStoreUrl}
          >
            Get it for Edge <Arrow />
          </a>
        )}
      </div>
      {!compact && browser === 'edge' && (
        <a
          className="text-link store-alternative"
          href={PRODUCT.chromeStoreUrl}
        >
          or use the Chrome Web Store
        </a>
      )}
      {!compact && browser === 'unsupported' && (
        <button
          className="text-link"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${location.origin}/install`);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'link copied' : 'copy link'}
        </button>
      )}
      {!compact &&
        browser !== 'unsupported' &&
        (both
          ? storeBehind(latest, PRODUCT.chromeStoreVersion) ||
            storeBehind(latest, PRODUCT.edgeStoreVersion)
          : storeBehind(latest, choice.version)) && (
          <p className="store-review">
            latest tester build: v{latest}.{' '}
            <a href="/install#manual">manual install ↗</a>
          </p>
        )}
    </div>
  );
}
