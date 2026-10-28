# Final release handoff

No tag, push, GitHub Release, account or deployment was created. The workflow is source code, not evidence of a hosted Actions run. Local command evidence is in verification-part6.txt. The prepared version is 0.6.0. A tag such as v0.1.0 is supported only if it exactly matches product.config.json; do not tag v0.1.0 against a 0.6.0 build.

## Configuration and versioning

`product.config.json` is the sole product name/version source. `pnpm release:version 0.7.0` validates Chrome-compatible numbers, refuses a downgrade, writes that JSON and regenerates docs/release-notes.md. Manifest versions, website metadata and ZIP names derive from the JSON. `pnpm release:version --notes` refreshes notes after a rename. Rebuild after configuration changes. Internal namespace/package/database names stay stable.

Set these GitHub **Actions repository variables** after choosing the names:

| Variable           | Value                             |
| ------------------ | --------------------------------- |
| SITE_URL           | `https://streamlaughs.vercel.app` |
| VITE_CROWD_API_URL | your actual HTTPS Worker origin   |
| RELEASE_REPO_OWNER | `uzerkayat2004-gif`               |
| RELEASE_REPO_NAME  | `streamlaughs`                    |

SITE_URL and VITE_CROWD_API_URL may instead be repository secrets; variables take precedence. These are public origins, not credentials. Preflight requires owner/repo to match the actual GitHub repository, HTTPS origins without paths/queries/credentials/localhost, and a matching tag. Missing configuration fails before publication. Twitch credentials, SESSION_SECRET, WORKER_OWNER_KEY and the private extension PEM are **never needed in CI**; keep them only in Vercel/Cloudflare. GitHub supplies its ephemeral GITHUB_TOKEN to the release command. No personal token or private signing key is required.

## Workflow and assets

`.github/workflows/release.yml` responds only to pushed `v*` tags. It validates tag/config, installs pinned pnpm/Node, verifies model receipts, runs recursive typechecks/tests, builds the optimized website, a local-only Worker dry-run bundle, Chrome and Edge. It verifies the fixed public key/ID, rejects debug/reference controls and private files, makes flat ZIPs, checks SHA-256, and creates a release with `gh release create --verify-tag` as the final step. It does not create a missing tag, overwrite an existing release, deploy services or sign a CRX.

Assets: `{product-slug}-chrome-v{version}.zip`, `{product-slug}-edge-v{version}.zip`, SHA256SUMS.txt. Each ZIP has `manifest.json` at its root, local models/runtimes, original MIT license, model/font/runtime notices and dependency inventory/license texts. The packager traverses only the built production tree, rejects symlinks/private/dev files, and fixes timestamps for reproducible packaging of the same build bytes.

`pnpm release:zip` requires public production configuration and matching compiled CSP origins. `pnpm release:preview` first rebuilds Chrome/Edge with OFFLINE_PREVIEW=true, which suppresses all API/site connections even though the normal website default is https://streamlaughs.vercel.app. It creates `releases/offline-preview/streamlaughs-chrome-v0.6.0.zip` and `streamlaughs-edge-v0.6.0.zip`, with explicit offline INSTALL notes. Do not publish these as connected builds. `releases/` is gitignored; neither command publishes anything.

The Chrome browser test extracts the actual ZIP into a new temporary folder, verifies its runtime ID, real fake-device mic grant, sharing choice, watch-only start and keyboard/touch recap controls. The packager checks Edge ZIP extraction/manifest; physical Edge/audio still needs manual acceptance.

The version-dot browser test separately copies the site-test build and changes only that temporary manifest to an older installed version. The real local /version.json response must populate update status and show the dot without manually writing an available flag. Release manifests always retain product.config.json's version; this temporary test copy is never packaged.

## Reproduce final verification

The normal site defaults to https://streamlaughs.vercel.app. The preview command explicitly overrides public connections; local browser fixtures set SITE_URL to localhost.

```powershell
pnpm install --frozen-lockfile
python tools/fetch-models.py
pnpm -r typecheck
pnpm -r test
pnpm build
pnpm --filter extension build:debug
pnpm --filter extension build:test-ui
$env:VITE_CROWD_API_URL = 'http://127.0.0.1:8787'
pnpm --filter extension build:test-crowd
Remove-Item Env:VITE_CROWD_API_URL
$env:SITE_URL = 'http://127.0.0.1:3000'
pnpm --filter extension build:test-site
Remove-Item Env:SITE_URL
pnpm release:preview
pnpm exec playwright install chromium
$env:LAUGHLINE_TEST_WAV = 'C:\path\to\local-laugh-16k-mono.wav'
pnpm test:e2e
pnpm test:e2e:web
pnpm check
```

Run the suites sequentially: both own Wrangler port 8787. Web also uses 3000/4191/4192; extension fixtures use 4179. Tests stop only their own processes. Traces remain off. Without the positive WAV the model-positive test explicitly skips; technical-guide.md contains the public-domain fixture recipe used during verification. Genuine Twitch tabCapture and audible replay are not established by fake-media flags.

## Exact steps for you — stopped here

1. The name is StreamLaughs in product.config.json and the repo is `uzerkayat2004-gif/streamlaughs`. Back up the private PEM from EXTENSION_KEY_PATH in encrypted storage; its local folder is `C:\Users\Asus\Documents\StreamLaughs-keys`, outside the repo. Verify no private key is in the tree or Git index; keep `.secrets/` and `*.pem` ignored. Push only reviewed source. Keep model receipts/notices. The build-time downloader restores models from ordinary source; configure LFS checkout only if explicitly approved.
2. Create the selected free Vercel project `streamlaughs` (availability is not verified), then follow deploy-part5.md: **Vercel → Twitch console → Cloudflare**. Redirects: `http://localhost:3000/auth/callback` and `https://streamlaughs.vercel.app/auth/callback`. Set fixed EXTENSION_ORIGINS and exact SITE_ORIGINS. Keep production simulator traffic disabled; use local/dev for test viewers.
3. Set the four GitHub repository variables above. For a connected rehearsal, set the same public env locally, run `pnpm release:check`, `pnpm build`, `pnpm release:zip`; compare `Get-FileHash releases/production/*.zip -Algorithm SHA256` with SHA256SUMS.txt. Complete manual-part6.md on fresh profiles before publishing.
4. Record the demo, fill Devpost’s four links/ID, choose/bump the version and refresh notes. Rebuild the website so `/version.json` matches that version. Run verification and inspect the ZIP. Commit the reviewed source yourself. Do not upload env files, `.secrets`, node_modules, runtime databases, test builds or private audio.
5. **Only when you decide to publish**, from a clean reviewed checkout:

```powershell
$releaseVersion = (Get-Content product.config.json -Raw | ConvertFrom-Json).version
git tag -a "v$releaseVersion" -m "Release v$releaseVersion"
git push origin "v$releaseVersion"
```

The tag push triggers publication. Watch Actions, inspect the two ZIPs/checksums, download fresh and verify the ID. Ensure Vercel’s endpoint matches the published version before announcing. Hosted deployment remains a separate explicit action. Implementation stopped before all external actions above.

Sources checked 2026-10-28: [GitHub tag filters](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [gh release create](https://cli.github.com/manual/gh_release_create), [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [WXT entrypoint hooks](https://wxt.dev/api/reference/wxt/interfaces/wxthooks). Actions use the verified full commit SHAs.
