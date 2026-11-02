import { PRODUCT } from '@laughline/shared';
import { useEffect, useState } from 'react';
import { Backdrop, Mark } from './components';
import { HistoryTransfer } from './HistoryTransfer';
import {
  browserStoreUrl,
  getInstallKind,
  type InstallKind,
} from './install-type';
export function UpdateView() {
  const [kind, setKind] = useState<InstallKind>('other');
  useEffect(() => {
    void getInstallKind().then(setKind);
  }, []);
  return (
    <main className="page">
      <Backdrop />
      <section className="screen migration-page">
        <Mark />
        {kind === 'development' ? (
          <>
            <h1>your laughs. automatic updates.</h1>
            <p className="sub">
              Switch to the store without losing your saved moments.
            </p>
            <ol className="migration-steps">
              <li>
                <strong>save your history.</strong>
                <p>
                  This stops and saves any recording, then creates a local JSON
                  file.
                </p>
                <HistoryTransfer save />
              </li>
              <li>
                <strong>add from the store.</strong>
                <p>
                  <a
                    className="btn"
                    href={browserStoreUrl()}
                    target="_blank"
                    rel="noreferrer"
                  >
                    add {PRODUCT.name} ↗
                  </a>
                </p>
              </li>
              <li>
                <strong>load it in the new one.</strong>
                <p>
                  Open the store extension’s gear → load history. Choose your
                  JSON file and check your recaps.
                </p>
              </li>
              <li>
                <strong>remove this manual copy.</strong>
                <p>
                  After checking your history in the store version, remove the
                  old ZIP install. Keep your backup until you’re sure.
                </p>
              </li>
            </ol>
            <p className="sub">
              Older manual versions: stop them before adding the store version.
              Refresh Twitch after switching.
            </p>
          </>
        ) : (
          <>
            <h1>you’re all set.</h1>
            <p>Updates install automatically through your browser’s store.</p>
            <HistoryTransfer />
          </>
        )}
      </section>
    </main>
  );
}
