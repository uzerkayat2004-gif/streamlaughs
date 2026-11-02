'use client';
import { useEffect, useRef } from 'react';
import { InstallDownload } from './install-download';
import { InstallGuide } from './install-guide';
import { useStoreBrowser } from './store-buttons';

export function ManualInstall() {
  const browser = useStoreBrowser();
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const open = () => {
      if (location.hash === '#manual' && details.current)
        details.current.open = true;
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  if (browser === 'unsupported') return null;
  return (
    <details
      ref={details}
      className="manual-install manual-advanced"
      id="manual"
    >
      <summary>Advanced: manual install (for testers)</summary>
      <p>ZIP installs don’t update automatically.</p>
      <InstallDownload />
      <InstallGuide />
    </details>
  );
}
