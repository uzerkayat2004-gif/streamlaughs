# Store-first installs and local history

The website chooses Edge Add-ons for desktop Edge and the Chrome Web Store for other desktop Chromium browsers. Feature brands precede the legacy user agent. Unknown browsers see both buttons. Firefox, Safari and mobile devices see desktop guidance, both links and copy link, with no manual ZIP control. Detection is neither stored nor sent.

Both URLs and independently approved versions are in product.config.json. Approvals start at 0.6.4. Update each only after that store approves the new build. /version.json exposes these versions, the latest website build, its direct /download/zip URL, size and checksum. /download remains a store-first landing page for old links and QR codes. The advanced manual guide is collapsed on /install.

## Move saved moments

1. Stop the manual copy. Its gear offers save my history; export also stops and saves a running session first.
2. Add the store copy using Switch. Different extension IDs have separate storage.
3. Open the new copy’s gear, choose load history and select the JSON. Open My streamers to check your imported recaps.
4. Remove the manual copy only after checking the transfer. Keep the backup until sure. Settings and microphone permission do not transfer.

If an older manual copy has no save/load controls, first update it to v0.8.6 by replacing files in the same folder, Reload and refresh Twitch. Its stored history stays in place; then follow the migration steps. Never remove the old copy before saving/checking its history.

Export/import stays on your PC and makes no network request. The JSON includes watched channels, dates, reaction labels (including legacy word labels), sessions and recaps; keep it private. It never includes audio, raw transcripts, model buffers or authentication. Import accepts a bounded version-1 schema, strips unknown fields, rejects unsafe URLs and malformed records, and merges transactionally by session ID. Existing records and live sessions win. Reimporting a file creates no duplicates.

## Install type and permissions

management.getSelf().installType selects behavior: normal uses browser updates, development offers Switch and export, unknown fails closed. Import is available to all. [getSelf requires no management permission](https://developer.chrome.com/docs/extensions/reference/api/management). No permissions were added. The obsolete downloads API/permission is removed; JSON saves through a Blob link. tabCapture remains used by the optional local speaker-reference lab. Native Twitch playback is the default.

## Two copies on Twitch

Cooperating scripts mark the document root with install type and handoff readiness. Store wins over manual; equal types use stable ID ordering. The loser hides its overlay and stops/saves its session. Only after that completes does it acknowledge readiness. The winner refuses another mic on timeout or failed save. Manual Start/retry also checks reachable Twitch tabs. A one-time dismissible tip explains the redundant copy.

Older versions lack this protocol and cannot be forcibly disabled without more permissions. Stop an older manual version before adding the store copy, then remove it after backing up/checking history and refresh Twitch. Close old mic-check windows too. This cooperative guard is not a security boundary against page modifications.

## Manual backup

Testers can use /install#manual and /download/zip. Unzip to a permanent folder, enable Developer mode and Load unpacked from the folder holding manifest.json. Updates: replace all files in the same folder, Reload, refresh Twitch. Never Remove to update. The fixed ZIP ID remains fkocldgggcmhihelohiicoakcfomhepg. Store submission packages have one manifest.json, no key and no downloads permission.
