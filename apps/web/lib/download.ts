import { PRODUCT } from '@laughline/shared';
import { siteUrl } from './config';

export function downloadMetadata() {
  const sha256 = process.env.EXTENSION_DOWNLOAD_SHA256;
  const bytes = Number(process.env.EXTENSION_DOWNLOAD_BYTES);
  const matches = process.env.EXTENSION_DOWNLOAD_VERSION === PRODUCT.version;
  return {
    version: PRODUCT.version,
    installUrl: `${siteUrl()}/install`,
    downloadUrl: `${siteUrl()}/download`,
    sha256: matches && /^[a-f0-9]{64}$/.test(sha256 ?? '') ? sha256 : null,
    bytes: matches && Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null,
  };
}
