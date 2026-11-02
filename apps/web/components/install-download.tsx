import { PRODUCT } from '@laughline/shared';
import { Arrow } from './brand';
export function InstallDownload() {
  return (
    <a
      className="button outline install-download"
      href="/download/zip"
      download
    >
      Download {PRODUCT.name} ZIP <Arrow />
    </a>
  );
}
