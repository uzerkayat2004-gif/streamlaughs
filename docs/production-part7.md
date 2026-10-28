# Connected crowd deployment

Deployed on 2026-10-28 using the owner's Cloudflare authorization in their own Chrome. No paid upgrade, card, tag or GitHub Release was created.

- Website: https://streamlaughs.vercel.app
- Worker: https://streamlaughs-crowd.streamlaughs.workers.dev
- Worker name: `streamlaughs-crowd`
- Storage: SQLite-backed `ChannelCrowd`, binding `CHANNELS`, migration `v1` with `new_sqlite_classes`. No separate D1 database is needed. Keep these identifiers stable on updates.
- Fixed Chrome/Edge extension ID: `fkocldgggcmhihelohiicoakcfomhepg`.

## Production configuration

```text
EXTENSION_ORIGINS=chrome-extension://fkocldgggcmhihelohiicoakcfomhepg
SITE_ORIGINS=https://streamlaughs.vercel.app
CROWD_ENABLED=true
ALLOW_TEST_TRAFFIC=false
```

Cloudflare holds independent `HMAC_KEY` and `WORKER_OWNER_KEY` secrets, each generated from 64 random bytes. Vercel production holds the same owner key and `WORKER_API_URL=https://streamlaughs-crowd.streamlaughs.workers.dev`. The website was redeployed after setting both. Existing Twitch/session credentials were preserved. Only public origins are compiled into the extension.

The keys have a Windows-user-protected DPAPI backup at `C:\Users\Asus\Documents\StreamLaughs-keys\crowd-production.dpapi`, outside Git. It is encrypted for this Windows user and is not a portable password-manager backup. Keep the existing extension private key in that same external key directory; neither it nor these server keys are used for extension builds. Do not upload this directory, dump environment values or log bearer headers.

The checked-in Wrangler vars now enable production. Missing signing secrets still fail closed. Local development remains the separate `dev` environment. `pnpm --filter api build` remains a dry run; deployment is explicit:

```powershell
cd workers/api
npx wrangler whoami
npx wrangler deploy --env=
```

Cloudflare's [free plan supports SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/). Free limits stop operations when exceeded; they are not unlimited capacity. No paid subscription was created. Keep observability/request-payload logging disabled, monitor aggregate usage in Cloudflare, and stop if an operation requests a paid plan or card. To disable crowd requests, change root `CROWD_ENABLED` to `false` and deploy; rollout is not instantaneous.

## Connected ZIPs

Both production packages are in the ignored local directory `releases/production/`:

- `streamlaughs-chrome-v0.6.0.zip`
- `streamlaughs-edge-v0.6.0.zip`
- `SHA256SUMS.txt`

These are the connected builds. The separate `releases/offline-preview/` archives remain offline. Nothing has been published to GitHub Releases; the website's download link will become useful after a separately authorized release.

Rebuild from the repository root:

```powershell
$env:SITE_URL = 'https://streamlaughs.vercel.app'
$env:VITE_CROWD_API_URL = 'https://streamlaughs-crowd.streamlaughs.workers.dev'
pnpm --filter extension build
pnpm --filter extension build:edge
pnpm release:zip
```

The packager verifies the public key/ID, exact HTTPS/WSS origins, production-only contents, flat ZIP structure, bundled model notices and checksums. A fresh extracted Chrome ZIP also passed a headless browser installation, real extension-origin session request and watch-only WebSocket to the production Worker, without opening either audio input. Packaging never needs the private extension key. GitHub's public repository variables use these same site/Worker origins and the configured release owner/name; changing variables does not run the tag-only release workflow.

## Safe simulator demo

Keep production `ALLOW_TEST_TRAFFIC=false`. A simulator session is rejected there even with its `--allow-prod` client option. Do not remove its test marker, impersonate human viewers or mix simulated viewers into a real channel's production history.

For a live recording, use the separate local Worker:

```powershell
# From the repository root; copy once, without overwriting an existing file.
if (-not (Test-Path workers/api/.dev.vars.dev)) {
  Copy-Item workers/api/.dev.vars.example workers/api/.dev.vars.dev
}
pnpm --filter api dev

# In a second terminal:
pnpm --filter crowd-sim start --api http://127.0.0.1:8787 --channel your_lowercase_login --viewers 25 --duration 120 --origin chrome-extension://fkocldgggcmhihelohiicoakcfomhepg
```

This dev Worker binds to `127.0.0.1`; its separate dev configuration allows test traffic and uses only public local fixture keys. For an extension demo, build a separate local fixture with `VITE_CROWD_API_URL=http://127.0.0.1:8787` and `pnpm --filter extension build:test-crowd`, then load `.output/chrome-mv3-crowd-test`. Do not replace the connected production ZIP with this fixture. Label simulated viewers as **test viewers** on screen. Ctrl+C stops the simulator. Below three contributors, words remain hidden here too.

For judges, the public https://streamlaughs.vercel.app/demo already shows recorded crowd-sim aggregates clearly labelled test data, including past moments, without enabling production test traffic. A separately hosted live demo would need its own isolated Worker, secrets and access restrictions; it is not part of this deployment.

## Verification boundary

See [verification-part7.txt](verification-part7.txt). Live probes verified health, both allowed origins, random-origin rejection, production simulator rejection, watch-only WebSockets, the two-contributor word floor, signed timeline reads and wrong-channel denial. The bounded floor probe used exactly two protocol contributors in an isolated verification channel; it could never create an eligible aggregate, and its timeline was empty. It was not a simulated audience on a real stream.

The owner's existing authenticated Chrome dashboard showed live **a few here** and a successfully loaded empty past-stream history after the Vercel redeploy. No cookies were read. A populated production timeline still needs a minute with at least three real contributors; no audience or past stream was fabricated for the test. Physical Edge/audio and a multi-person Twitch session remain part of the [manual acceptance checklist](manual-part6.md).
