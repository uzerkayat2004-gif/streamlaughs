# Fixed unpacked extension identity

The Chrome and Edge unpacked ID is **fkocldgggcmhihelohiicoakcfomhepg**. Both use:

```text
chrome-extension://fkocldgggcmhihelohiicoakcfomhepg
```

`apps/extension/extension-identity.json` contains the public RSA SPKI key and expected ID. WXT writes its base64 public key to manifest `key` in every build. Chromium hashes that key to determine identity, instead of deriving it from a folder path. A browser test copies a complete build to a new folder and verifies the runtime ID; post-build checks verify Chrome, Edge and test manifests. [Chrome's key documentation](https://developer.chrome.com/docs/extensions/reference/manifest/key).

Worker `EXTENSION_ORIGINS` includes that ZIP origin and the confirmed Edge store origin `chrome-extension://fkdfjgnhifofdjpbenlkhpfhmmhglmkb`. Edge uses the same chrome-extension scheme. Users can extract the ZIP in different folders and still have the same ZIP product ID; their browser-local data remains separate in each profile/PC. The store artifact removes only the public key from its manifest; Microsoft supplies its separate identity when signing. [Store packaging and review status](edge-store-part13.md). A public key is not an authentication secret: anyone can copy it into an unpacked extension. Exact CORS/Origin checks do not replace anonymous token validation, floors or abuse limits.

## Private key and backups

The existing private key lives outside the repository at `C:\Users\Asus\Documents\StreamLaughs-keys\extension-private.pem`, selected by `EXTENSION_KEY_PATH`. It was moved there before the first GitHub push; the repository copy is absent. It remains restricted to the current Windows account and is **not included in source/build ZIPs or CI**. Keep `.secrets/` and `*.pem` ignored as defense in depth. Never upload a PEM, signing material or a password-manager export to GitHub, Vercel, Twitch, Cloudflare or a release asset.

```powershell
$env:EXTENSION_KEY_PATH = 'C:\Users\Asus\Documents\StreamLaughs-keys\extension-private.pem'
# Optional: remember this path (not the key contents) for later terminal sessions.
[Environment]::SetEnvironmentVariable('EXTENSION_KEY_PATH', $env:EXTENSION_KEY_PATH, 'User')
```

Ordinary builds and releases do not read this variable or need the private key. The one-time generation helper requires an absolute EXTENSION_KEY_PATH outside the repo and refuses to replace the existing public identity. Do not run it to update this app or to move the key.

Back it up yourself in an encrypted password manager or encrypted offline storage, with a second protected backup. Avoid unencrypted shared/cloud folders. The public JSON alone is sufficient to rebuild the fixed-ID unpacked extension; the private key is for any future self-signed CRX packaging. Do not regenerate the public identity to perform ordinary updates. `node tools/create-extension-key.mjs` deliberately refuses to replace an existing identity.

To verify builds from repo root:

```powershell
pnpm --filter extension build
pnpm --filter extension build:edge
node tools/check-extension-identity.mjs
```

The test suite also checks the built Chrome manifest. A missing production build is prepared by the extension pretest hook; a present manifest with a wrong key fails instead of silently repairing it.

## Existing Part 1–4 installs

Their folder-derived ID changes once on upgrading to this keyed build. Chrome/Edge treats that as a different extension origin. Mic permission, recaps and preferences cannot transparently move between origins. Finish the old session and view any old recaps before removing the old copy; keep it disabled if you need those historical records. Do not run both capture extensions together. Re-consent once in the new build. Subsequent keyed unpacked updates keep this ID and profile's data.

## Chrome Web Store / Edge Add-ons later

The store assigns an ID which may differ from this unpacked ID. Inspect the actual item ID/public key in its developer dashboard. Keep this key for unpacked ZIPs; prepare any store-specific public-key manifest separately during release work. Never upload the private key. Google's documented way to align development with a store ID is to use the store dashboard's public key; do not assume the generated unpacked key reserves that store listing.

During migration, allow both verified origins:

```toml
EXTENSION_ORIGINS = "chrome-extension://fkocldgggcmhihelohiicoakcfomhepg,chrome-extension://fkdfjgnhifofdjpbenlkhpfhmmhglmkb"
```

The known Edge store ID is included in website version/download CORS by default. `STORE_EXTENSION_IDS=ACTUAL_STORE_ID` remains available for additional verified future store IDs (comma-separated). Keep the fixed unpacked ID in place; no wildcard. Rebuild store artifacts and verify their actual runtime IDs before publication. No store upload or account creation occurred in Part 5; the owner submitted the Edge listing separately and it is in review.
