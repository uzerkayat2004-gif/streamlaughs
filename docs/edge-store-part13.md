# StreamLaughs · Edge Add-ons support

The owner submitted the listing; it is **in review**. Partner Center product ID: `0RDCKFR66N3X`. That product ID is not an extension origin.

| Installation           | Runtime ID                         | Update mechanism                                           |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Chrome/Edge/Brave ZIP  | `fkocldgggcmhihelohiicoakcfomhepg` | Popup ZIP download, same-folder replacement, finish update |
| Microsoft Edge Add-ons | `fkdfjgnhifofdjpbenlkhpfhmmhglmkb` | Edge's automatic store updates                             |

Both exact `chrome-extension://` origins are in production/development Worker vars. SQLite Durable Objects, migration v1, production `CROWD_ENABLED=true`, `ALLOW_TEST_TRAFFIC=false`, site origins and signing secrets stay unchanged. No wildcard. Watch-only production probes test authenticated sockets for both IDs and reject random origins; they submit no simulated contributions or audio.

## Packages

The existing Chrome/Edge/universal ZIPs keep the fixed public `key`. Model receipts are now `models/model-files.json`; build-time download/verification tools use that path. Model bytes, licenses and runtime model paths are unchanged. Packaging rejects a second manifest.json anywhere, including nested paths/case variants.

With production `SITE_URL` and `VITE_CROWD_API_URL`, build the normal Edge output, then:

```powershell
pnpm --filter extension build:edge
pnpm release:edge-store
```

The result is `releases/edge-store/streamlaughs-edge-store-vVERSION.zip` plus SHA256SUMS.txt. It uses the same verified Edge build and notices; only the root manifest's public `key` is removed. The input build remains keyed. No private key is read or needed. The store signs the package and supplies the store ID; loading this keyless ZIP unpacked locally does **not** reproduce the store ID.

Store ZIPs are ignored and stay outside releases/production, so website downloads and the existing tag-release ZIP glob cannot pick them up. The **Edge store package** workflow runs on main pushes (or manual dispatch), builds with public production configuration and uploads a seven-day GitHub Actions artifact. It creates no tag, release or store publication. The existing version-tag release workflow also builds/uploads this artifact, separately from its ordinary release assets. Standard public-repository GitHub-hosted runners are used; no paid runner, account creation or store API credentials are needed.

Download the Actions artifact, unzip its wrapper, and select the **inner** `streamlaughs-edge-store-vVERSION.zip` in Partner Center. Do not submit the Actions wrapper ZIP. Updating an existing store package requires an increased manifest version; product.config.json is the version source. This work prepares v0.6.3 but does not upload or publish it to Microsoft.

## Popup and website

Only the fixed ZIP runtime ID may check/download/finish ZIP updates. Store IDs show no update CTA, later link or gear update dot, even with stale cached version data. Directly opening update.html explains that the browser handles updates; background update commands cannot download or reload the store install. Recording, microphone consent, settings and recaps otherwise behave the same. ZIP/store origins have separate browser storage; existing ZIP recaps do not automatically migrate to a store install.

`product.config.json` contains `edgeStoreExtensionId` and an empty `edgeStoreUrl`. **Leave edgeStoreUrl empty until the owner supplies the approved listing URL.** Only the Install page conditionally renders “Get it on Edge”; no URL is guessed and no other page adds that link. Known Edge origins are included in public version/download CORS without requiring a new Vercel secret.

## Verification and remaining manual checks

Unit tests cover the ID gate/background command rejection, both Worker origin handshakes and random-origin rejection, hidden store link, Edge metadata CORS, keyless packaging and rejection of nested manifests. A headed popup regression emulates the known store runtime ID (the listing is not public yet) to test both idle states, recording/settings and direct update-page behavior. The separate ZIP regression still downloads, replaces the same folder, reloads and checks recaps/settings.

After approval and the owner-supplied URL: configure edgeStoreUrl, install from Edge Add-ons in a clean Edge profile, confirm the actual runtime ID, Welcome/mic + real Twitch audio/crowd, and absence of the ZIP update UI. Store delivery/automatic update timing and Microsoft review acceptance cannot be verified before the package is approved. Source/package checks do not claim store approval.

See verification-part13.txt for local commands and production Worker probe results. [Microsoft publication guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension), [updating an Edge listing](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/update-extension).
