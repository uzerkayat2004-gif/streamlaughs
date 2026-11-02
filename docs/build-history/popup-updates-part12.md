# StreamLaughs popup updates · v0.6.2

Open the toolbar popup. Its identifier-free `SITE_URL/version.json` check is cached for at most one hour, including failures. Both idle states offer **update to v…** when a newer manifest version is available. **later** keeps the normal button for this browser session (until browser restart or extension reload). During any active/paused session only a small yellow gear dot appears; settings offers the update page if you want it.

The extension opens its own update page to keep the download alive after the popup closes. That page refreshes metadata, fetches only the configured site's `/download` with no credentials, bounds the archive to its advertised size (maximum 100 MB), and checks SHA-256. `chrome.downloads` saves exactly those verified bytes as `streamlaughs-vVERSION.zip`. A changed deployment, truncated download or checksum mismatch offers retry instead of saving unchecked bytes. The button becomes ready only when the browser reports the download complete. The site permits ZIP fetches from the fixed extension origin and configured store IDs; it adds no arbitrary website access permission.

1. **Unzip.** Windows: right-click → Extract All. Mac: double-click in Finder. Linux: Extract here.
2. **Copy the contents into the original loaded folder and replace files.** Keep the same folder; don't delete, move, or load a second folder. In a nested ZIP folder, open until you see `manifest.json`, then copy those contents. Windows: “Replace the files”; Mac: “Replace”.
3. **Come back and press finish update.** Any session stops through the normal saved-recap path, tracks/context close, then `chrome.runtime.reload()` reloads the extension. Refresh Twitch afterwards.

Chrome treats an unpacked reload as an update and fires `runtime.onInstalled` with reason `update`. The background reopens the existing update tab with a fresh extension context. It compares the actual manifest to the target version: **you're on v…**, or **files not replaced yet** with original-folder/nested-folder help. The next popup also shows the result, dismissible. Failed recap saving prevents reload. No update handler clears settings, local storage or Dexie.

The browser cannot replace an arbitrary unpacked folder for you: copying files remains a manual step, but future updates require no website or extensions-page visit. Versions before 0.6.2 don't contain this UI; install this update once by downloading from the website, replacing the original folder contents and reloading on your extensions page.

Keep Developer mode enabled from the first installation; you don't toggle it for updates. Chromium 156 disables unpacked extensions reloaded while that setting is off.

## Permission and privacy

New permission: **downloads** initiates and monitors the requested ZIP download, including completion/interruption. The application queries only its returned download ID. It does not upload files or inspect unrelated downloads. Existing `storage`, `tabs`, `tabCapture`, `offscreen`, Twitch host access and the fixed public key are unchanged. Site/Worker connections remain pinned in CSP. The checksum protects against mismatched/corrupt bytes, not a compromised website; source/build trust remains necessary.

Only public version/package metadata and a tiny update attempt record are added to browser storage. `laughline:update`, `laughline:update-attempt` and `laughline:update-later` are internal compatibility names. Audio is processed on your PC and never saved or sent. The ZIP/model download is incoming traffic, unrelated to microphone audio. No private signing key, token or account identifier is sent in update checks.

## Verification

Unit tests cover hourly caching/failures, numeric versions, pinned URLs, exact checksum/length, interrupted lifecycle ordering and failed-save protection. Headed Chromium coverage exercises both idle buttons, session-only later, the recording gear dot, a real downloads API call and checksum, a wrong-folder reload, then replacement from the actual generated production ZIP into the same loaded folder. The new manifest version and unchanged fixed ID, recaps and settings are asserted after `runtime.reload()`.

The test enables Developer mode in its isolated profile and installs via CDP `Extensions.loadUnpacked` rather than `--load-extension`, which is disabled on reload in this Chromium setup. It restores native download target selection because automation's download delegate substitutes blob UUID filenames. The production extension uses neither the test debugging flag nor Chrome's private setup API. Reload can close extension tabs: the regression follows the fresh result page opened by the new background instead of retaining an invalid document handle.

Manual Windows/Mac smoke test: use an older v0.6.2+ install when the next version is live, download from the popup, follow OS replacement prompts, finish, verify the success toast, open a saved recap, and refresh a live Twitch tab. Physical OS file-manager dialogs and native Edge/Brave behavior are not automated by the Chromium regression.

References: [Chrome unpacked reload lifecycle](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-reload), [downloads permission/API](https://developer.chrome.com/docs/extensions/reference/api/downloads).
