import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const readProduct = () =>
  JSON.parse(
    readFileSync(new URL('../../product.config.json', import.meta.url), 'utf8'),
  );
export function validateVersion(value) {
  assert(
    typeof value === 'string' &&
      /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(value),
    'Use MAJOR.MINOR.PATCH without a v prefix',
  );
  assert(
    value.split('.').every((n) => Number(n) <= 65535) && value !== '0.0.0',
    'Version must fit the Chrome manifest limits',
  );
  return value;
}
export function slug(name) {
  assert(typeof name === 'string' && name.trim(), 'Product name is missing');
  const result = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  assert(
    result && result.length <= 64,
    'Product name needs a short filename-safe spelling',
  );
  return result;
}
export function releaseConfig(product, env = process.env, offline = false) {
  validateVersion(product.version);
  const result = {
    ...product,
    slug: slug(product.name),
    offline,
    site: offline ? '' : env.SITE_URL || product.siteUrl,
    api: offline ? '' : env.VITE_CROWD_API_URL || '',
    owner: env.RELEASE_REPO_OWNER || product.releaseRepoOwner,
    repo: env.RELEASE_REPO_NAME ?? product.releaseRepoName,
  };
  if (!offline) {
    for (const value of [result.site, result.api]) {
      const url = new URL(value);
      assert(
        url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === '/' &&
          !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
        'Production release needs HTTPS SITE_URL and VITE_CROWD_API_URL origins',
      );
    }
    assert(
      /^[A-Za-z0-9_-]+$/.test(result.owner) &&
        /^[A-Za-z0-9_.-]+$/.test(result.repo),
      'Configure RELEASE_REPO_OWNER and RELEASE_REPO_NAME',
    );
    if (env.GITHUB_REPOSITORY)
      assert.equal(
        `${result.owner}/${result.repo}`,
        env.GITHUB_REPOSITORY,
        'Release repository configuration must match this GitHub repository',
      );
  }
  if (env.GITHUB_REF_NAME)
    assert.equal(
      env.GITHUB_REF_NAME,
      `v${product.version}`,
      'Tag must match product.config.json',
    );
  return result;
}
export function notes(product, offline = false) {
  return `# ${product.name} v${product.version}${offline ? ' · offline preview' : ''}\n\n${product.pitch}.\n\n- Smile-only logo and a smaller frosted-glass Twitch panel, with drag memory and a four-second fade.\n- Calm popup, saved history grouped by streamer, and optional locally cached public profile photos.\n- Dark recap stories and a locally drawn 1080x1920 PNG share sheet: preview, download, copy and native file sharing where supported.\n- Store installs retain browser-managed updates; ZIP installs retain the popup update flow.\n- Store submission ZIP contains one manifest.json, no manifest key and no downloads permission; ZIP installs keep self-updates.\n- Recaps and settings stay in your browser. Microphone diagnostics and all local models remain bundled.\n- Audio is processed on your PC and never saved or sent. Sharing is optional.\n\nFirst install: download the universal ZIP from the website, extract it, enable Developer mode on your browser’s extensions page, then Load unpacked from the folder containing manifest.json. Pin the icon, finish Welcome and press start on a Twitch stream. Future updates: use the popup, copy the new files into the same existing folder, then press finish update. Installs older than v0.6.2 need one manual folder replacement and reload to receive this flow.\n\nFixed unpacked ID: fkocldgggcmhihelohiicoakcfomhepg. The manifest public key is sufficient; no private signing key is used or included. SHA256SUMS.txt verifies the ZIP downloads. Models, runtimes and third-party notices are included.\n\n${offline ? 'This preview has no production service URLs. Real live crowd and version checks need a rebuild with your configured public origins. Do not publish this preview as the connected release.' : 'Edge Add-ons submission is in review. The website lists ZIP installation until the owner provides the approved store URL. Microphone consent is requested locally. Physical Twitch audio, real OAuth and the manual acceptance checklist still require the release owner’s verification.'}\n`;
}
