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

The verified live production archive is 40,506,651 bytes (about 38.6 MiB). Two copies total 81,013,302 bytes, below the conservative 100 MB budget. No ZIP appears in a local server-function trace. Packaging stops if both ZIP copies reach that budget or browser packages differ. Different build hosts can produce different license-inventory bytes; use the checksum from the same deployed `/version.json`.

Vercel documents a 100 MB Hobby CLI source-upload limit, a 250 MB uncompressed Function limit and a 4.5 MB Function response-body limit. Git integration builds the generated assets after checkout; we do not upload the generated ZIPs as CLI source or return them through a Function. See [Vercel limits](https://vercel.com/docs/limits) and [Function limits](https://vercel.com/docs/functions/limitations). Free-tier transfer usage still applies. No paid upgrade or card was requested. Plan B was not enabled; no tag or release was created.

## Regression and browser checks

Run the deployed download regression from the repo root:

```powershell
$env:WEB_TEST_URL='https://streamlaughs.vercel.app'
pnpm exec playwright test --config playwright.download.config.ts
```

It checks attachment headers, follows the actual Download button, verifies the downloaded bytes/SHA against `/version.json`, checks the versioned checksum, unzips, then loads the result into a fresh Chromium profile and verifies `fkocldgggcmhihelohiicoakcfomhepg`. It does not use a signed-in account or record audio.

The live ZIP also passed the native Developer mode → Load unpacked folder-picker flow in a fresh installed **Google Chrome** profile, preserving the fixed ID. This is separate from the automated Chromium launch-flag regression.

Brave's official signed portable build was used after its system installer returned 0x80040902. Comet was already installed, with a valid Perplexity signature, so no reinstall was needed. Both were tested in isolated Windows profiles, without account sign-in. Developer mode, unpacked directory loading, microphone permission and a real watch-only Worker connection passed. The test selected a channel that was live at the time; the initial Monstercat attempt was offline, and was not counted as an audio failure.

Brave's native folder picker also passed. Twitch video played with Shields left at its default settings; no Shield was disabled and no per-site exception was added. The full capture test remains **unverified**: native toolbar automation did not open a detectable real popup, and the fallback full-page popup hit `extension_not_invoked` in the browser's tab-capture guard. This does not establish a Shields block, and no speculative disable-Shields tip was added. Do not describe this as a fully verified Brave audio session.

Comet is deliberately absent from the public Install page until its complete real-session checks pass. Its extensions page is `chrome://extensions`; Developer mode and Load unpacked are present. Its native folder-picker installation passed too, but the full session stopped before capture with `Toolbar accessibility action unavailable`. Its complete mic/tab-audio session is still unverified because a real toolbar invocation could not be completed. Installation/API checks alone do not certify a complete audio session. See `verification-part8.txt` for exact observed results.

To finish the physical-browser acceptance check in Brave/Comet: keep Shields at defaults in Brave, open a currently live Twitch channel, finish Welcome, then **click the actual toolbar icon and start** (a popup opened as an ordinary browser tab does not substitute for that invocation). Confirm sound continues, the microphone/capture state becomes active, the crowd connects, pause/resume works, and stop releases capture. Do not disable privacy protections to make the test pass. Mac/Linux hardware sessions remain untested on this Windows laptop.
