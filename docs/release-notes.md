# StreamLaughs v0.8.7

see who's laughing with you.

- Fan ratings: score eligible live streams 1 to 10 with up to three reason chips. Anonymous, owner-only averages unlock with five fans; change your rating for 24 hours. Saved in local history, with a settings toggle.
- Accuracy: laughs require classifier and rhythm agreement, a speech-score margin, calibrated raw levels and one count per episode. Words require decoder confidence and whole reaction words, with hallucinations rejected. Three-second calibration, strict/normal/sensitive control and not-me laugh undo. Twitch playback stays native; independent mic startup, interrupted-context recovery and the speech-job fix remain.
- Personal VOD/clip replay sessions, with automatic owner detection and a channel-name fallback; replay moments use playback time and never join the crowd server.
- Transparent SVG jelly smiley, global and per-tab toolbar cleanup, readable streamer hover/focus, and balanced sparse share cards. Word-state bounds and reaction matching are fixed; positive events are delivered immediately. Instant stop feedback retains its bounded final save. Saved-stream unread badges remain inside My streamers.
- Accurate short-session recap copy, first-stream history and approved-word timing for your funniest word. Comfortable story controls, a locally drawn 1080x1920 PNG with QR, and public stat-only recap links with social preview images.
- Store installs update automatically. Manual installs offer Switch and local history transfer; imports merge without duplicate sessions. The website is store-first with an advanced manual backup.
- Store submission ZIP contains one manifest.json, no manifest key and no downloads permission; all packages omit the downloads permission.
- Recaps and settings stay in your browser. Selectable real microphone, visible permission checks, classifier-plus-rhythm laugh checks, private diagnostics, optional local tab reference and throttled model workers. All local models remain bundled.
- Audio is processed on your PC and never saved or sent. Sharing is optional.

First install: add from the Chrome Web Store or Edge Add-ons, pin the smile, finish Welcome and start on Twitch. Store updates install automatically. Advanced manual testers: download the website ZIP, extract to a permanent folder and Load unpacked. To update a manual copy, replace files in the same folder, click Reload, then refresh Twitch. Never Remove just to update.

Fixed unpacked ID: fkocldgggcmhihelohiicoakcfomhepg. The manifest public key is sufficient; no private signing key is used or included. SHA256SUMS.txt verifies the ZIP downloads. Models, runtimes and third-party notices are included.

Store approval versions are tracked independently in product.config.json. This package is not submitted automatically. Microphone consent is requested locally. Physical Twitch audio, real OAuth and the manual acceptance checklist still require the release owner’s verification.
