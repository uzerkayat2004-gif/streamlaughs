# StreamLaughs v0.8.2

Detection already works on the owner’s hardware. This pass retains the microphone constraints, saved-device selection, DSP, VAD/laugh thresholds, model cadence, contamination guard and isolated audio replay. The only inference changes expose a stop-only trailing-segment flush and a 1.5-second deadline. Workers and tracks close after the recap save.

## Reactions and stopping

The 14px matte launcher is coral while recording and grey while idle/paused, with 60% resting opacity. Hover/focus expands it to 28px and reveals a white face. Laughs trigger one yellow ripple; reduced-motion mode disables motion. One normalized browser-local anchor moves both dot and panel. Top/bottom and left/right player halves select placement, with an 8px clamp and resize/fullscreen/theatre updates. The default stays above player controls.

The panel shows the channel, timer, mic test button, personal count, most-used approved word, time since the last laugh and busiest rolling minute. Fan details require the existing three-person floor. Open panels remain solid 94% near-black and fully opaque.

Stop publishes the in-memory summary immediately. The popup and overlay do not await the command before showing “stream saved”. A provisional local recap lets navigation open immediately. The requested recap never falls back to an unrelated old one; it shows a skeleton while waiting and allows sharing after finalization. The final approved word results are accepted through the trusted offscreen owner/session path, then saved, then audio resources close. Late results are ignored. Opening/marking a provisional recap seen updates only seenAt, preserving final counts.

## Recaps and links

Hourly extrapolation is limited to sessions of at least 15 minutes. A first stream shows a welcome-back message instead of a one-bar chart. Multiple streams show dates and highlight the selected one. Empty reaction lines are omitted. Approved word labels/counts/timestamps are bounded to 4,096 local records and used to find the most frequent label within an inclusive ±5 seconds of laughs; a label occurrence is counted once even near multiple laughs. Old recaps without those timestamps omit the funniest word.

The PNG is drawn locally at 1080×1920, including a filled initials circle or clipped cached photo, positive-only chips and a locally generated QR pointing to configured SITE_URL. qrcode-generator (MIT) supplies QR encoding; its notice is included in packaged dependency notices. jsQR is a test-only decoder and does not enter the extension.

Public `/r` links carry only bounded stats. Query fields: streamer, date, laughs, minutes, word, funniest, moment (seconds), hype, stream. Unknown/duplicate keys, arrays, HTML, unapproved words, invalid dates and invalid numeric syntax are rejected. Public words use the finite existing crowd phrase list; a local label outside that list is omitted from the link. The PNG may still show an approved local label. Channel login identifies the streamer, never the viewer. Link numbers are creator-provided, not authenticated server records.

`/r/image` draws a 1200×630 PNG with next/og. Canonical and image URLs use configured SITE_URL and cannot be overridden by request Host/Origin or a query URL. Neither route reads accounts, cookies, Worker data or a database. Responses request no storage/caching and no referrer; public links grant no credentialed CORS access. Providers and services receiving the URL may keep logs or preview copies. Shared links cannot be revoked by deleting a local recap.

## Owner check, on real hardware

- Download the new ZIP, extract it, copy **all contents into the same installed folder**, replace files, click **reload** on the extensions page, then **refresh Twitch**. Never click Remove; preserve recaps/settings and the unpacked ID `fkocldgggcmhihelohiicoakcfomhepg`.
- Verify grey idle/paused and coral recording dot, hover/focus face, one ripple per laugh, keyboard arrows and dragging from the dot and grip. Check top-right, bottom-left, theatre/fullscreen and a smaller window.
- With fewer than three sharing fans, verify the small floor notice and no fan words. Check mic hearing/silent/problem colors and the visible mic-test page.
- Laugh/say an approved phrase, then stop. The sheet should appear immediately; open the recap during the final save. Check final counts, actual duration and no hourly rate for a short stream.
- Open a first-stream recap, then a streamer with multiple saved sessions. Check dates, current bar, most-used and funniest words (new sessions only), positive chips, 44px arrows and 48px share pill.
- Preview/download the PNG, scan its QR, copy the share link and open it. Check the public stats, Install CTA and social preview. Missing facts should be absent. Check image copy/native sharing where the browser supports them.

Screenshots use explicitly labelled, realistic fixture data in an isolated browser profile. They are visual evidence, not a new real-microphone accuracy claim. No full suite or e2e runner is used in this pass. See verification-v082.txt for the exact checks and artifacts.
