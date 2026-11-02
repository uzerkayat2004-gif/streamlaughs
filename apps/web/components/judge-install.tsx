import { PRODUCT } from '@laughline/shared';
import { Arrow } from './brand';

export function JudgeInstall() {
  return (
    <aside className="judge-install" aria-label="latest build for judges">
      <a className="button judge-download" href="/download/zip" download>
        For judges: download the latest build (v{PRODUCT.version} ZIP) <Arrow />
      </a>
      <ol>
        <li>Unzip it.</li>
        <li>
          Open <code>chrome://extensions</code> (or{' '}
          <code>edge://extensions</code>).
        </li>
        <li>Turn on Developer mode.</li>
        <li>Click “Load unpacked” and pick the unzipped folder.</li>
      </ol>
      <p>Then open any Twitch stream and tap the smiley.</p>
    </aside>
  );
}
