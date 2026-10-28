# Direct website downloads

Download: https://streamlaughs.vercel.app/download. Install help: https://streamlaughs.vercel.app/install. Neither download navigates to GitHub. Only the small footer source-code link does.

## Automatic build

Every successful GitHub main deployment runs `pnpm --filter web build` with root directory `apps/web` and sources outside that directory included. `tools/build-web.mjs` builds both production browser targets, checks the manifest public key/fixed ID and production URLs, packages the bundled models/licenses, and requires byte-identical Chrome and Edge ZIPs before publishing one universal ZIP. It then builds Next.js with the artifact's SHA-256 and byte count embedded in `/version.json`.

No native platform binaries are required: the extension uses JavaScript, WebAssembly, bundled models and browser APIs. The same archive is suitable for Windows, Mac and Linux Chromium browsers; testing on this laptop covers Windows only. The private extension key is neither needed nor included. Server credentials are removed from the extension build environment.

Generated and gitignored files:

```text
apps/web/public/downloads/streamlaughs.zip
apps/web/public/downloads/streamlaughs.zip.sha256
apps/web/public/downloads/streamlaughs-v0.6.0.zip
apps/web/public/downloads/streamlaughs-v0.6.0.zip.sha256
apps/web/public/downloads/manifest.json
```

Names and versions derive from `product.config.json`. The public site remains configurable with `SITE_URL`; the extension crowd origin uses `VITE_CROWD_API_URL`, falling back to Vercel's public `WORKER_API_URL`. Repository configuration is now used only for the source link/release tooling. Local builds must set the two public origins, as shown in README. No Twitch or session credentials are needed to build the ZIP.

`/download` rewrites to the static ZIP with `Content-Disposition: attachment` and `Content-Type: application/zip`. It is served by Vercel's CDN, not a Function, avoiding the Function response-body limit. Both the stable URL and metadata revalidate so a successful new main deployment replaces the download. A failed deployment leaves the previous production download available. Updating an unpacked installation still requires replacing its folder contents and pressing reload.

## Free-plan size check

The Windows production build produced a 40,029,312-byte archive (38.2 MiB). Two copies total 80,058,624 bytes; the full public directory is about 80.2 MB. No ZIP appears in any server-function trace. Packaging stops if both ZIP copies reach the conservative 100 MB budget or if browser packages differ. Different build hosts can produce different license-inventory bytes; use the checksum from the same deployed `/version.json`.

Vercel documents a 100 MB Hobby CLI source-upload limit, a 250 MB uncompressed Function limit and a 4.5 MB Function response-body limit. Git integration builds the generated assets after checkout; we do not upload the generated ZIPs as CLI source or return them through a Function. See [Vercel limits](https://vercel.com/docs/limits) and [Function limits](https://vercel.com/docs/functions/limitations). Free-tier transfer usage still applies. No paid upgrade or card was requested. Plan B was not enabled; no tag or release was created.

## Regression and browser checks

Run the deployed download regression from the repo root:

```powershell
$env:WEB_TEST_URL='https://streamlaughs.vercel.app'
pnpm exec playwright test --config playwright.download.config.ts
```

It checks attachment headers, follows the actual Download button, verifies the downloaded bytes/SHA against `/version.json`, checks the versioned checksum, unzips, then loads the result into a fresh Chromium profile and verifies `fkocldgggcmhihelohiicoakcfomhepg`. It does not use a signed-in account or record audio.

Brave and Perplexity Comet were tested in isolated Windows profiles. Both exposed Developer mode/Load unpacked, loaded the unpacked extension with the fixed ID, granted the real microphone permission and connected to the real Worker. Native folder-picker automation did not complete, so directory loading via Chromium's extension launch flag is recorded separately from a successful manual folder-picker test. Comet is not advertised on the Install page while its complete real-session checks remain unverified. Final results and any real Twitch capture limitations are recorded in `verification-part8.txt`; installation/API checks alone do not certify a complete audio session.
