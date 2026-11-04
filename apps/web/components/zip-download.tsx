import { PRODUCT } from '@laughline/shared';
import { Arrow } from './brand';

/** Secondary install path: the latest build as a ZIP (load unpacked). */
export function ZipDownload() {
  return (
    <a
      className="button outline zip-download"
      href="/download/zip"
      download
      title="Unzip, open chrome://extensions, turn on Developer mode, Load unpacked"
    >
      Download ZIP <span className="zip-version">v{PRODUCT.version}</span>{' '}
      <Arrow />
    </a>
  );
}
