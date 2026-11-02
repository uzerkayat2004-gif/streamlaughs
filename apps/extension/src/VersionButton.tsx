import { useEffect, useRef } from 'react';

/** A pointer or keyboard hold opens local diagnostics; a normal tap does nothing. */
export function VersionButton({ compact = false }: { compact?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const open = () =>
    void chrome.tabs.create({
      url: chrome.runtime.getURL('/diagnostics.html'),
    });
  const begin = () => {
    if (timer.current !== undefined) return;
    timer.current = setTimeout(open, 700);
  };
  const version = chrome.runtime.getManifest().version;
  return (
    <button
      type="button"
      className={`textbtn ${compact ? 'popup-version' : 'settings-version'}`}
      aria-label={`version ${version}; hold for microphone diagnostics`}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') begin();
      }}
      onKeyUp={cancel}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.shiftKey) open();
      }}
    >
      {compact ? 'v' : 'version '}
      {version}
    </button>
  );
}
