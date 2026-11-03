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
  return `# ${product.name} v${product.version}${offline ? ' · offline preview' : ''}

${product.pitch}.

- Reaction Engine v2: immediate listening, a continuous soft noise floor, smoothed laughter confidence and one count per episode. Normal speech reduces laugh confidence.
- Bundled Moonshine Tiny for short reaction words, with automatic local Whisper fallback on load failure. VAD segments wait in a bounded newest-three queue; spelling variants share one private vocabulary with the server.
- Automatic mic/context recovery, visible stage lights and the last ten local decisions. Top three personal/fan word tallies and honest empty recaps.
- Twitch plays natively; tab capture stays off by default. Audio stays in memory on your PC and is never saved or sent. Optional sharing sends only counts and approved canonical words, with a three-fan floor for each public word.
- Existing ratings, replay sessions, saved history and settings remain available. Store approval versions are unchanged; this release does not submit anything to stores.

Judges/manual installs: extract the ZIP to a permanent folder and Load unpacked. Update an existing manual copy by replacing files in the SAME folder, clicking Reload on chrome://extensions, and refreshing Twitch. Never Remove just to update.

Hold the popup settings version number to open diagnostics. Check the microphone, moving audio level, running AudioContext, worklet frames and model lights; then laugh naturally, say “bro”, “W” or “let’s go”, and leave a short pause. Detection and Count saved should light after a reaction. Real microphone accuracy still needs your own hardware check; this release uses short unit/build checks, without a long fixture or stress run.

Fixed unpacked ID: fkocldgggcmhihelohiicoakcfomhepg. Only its public key is included. Verify the ZIP with SHA256SUMS.txt. Bundled model/runtime licences are included.

${offline ? 'Offline preview: live fan connections require a production-configured build.' : 'Production service origins are configured at build time; no secrets or audio are included.'}
`;
}
