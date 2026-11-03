# StreamLaughs v0.9.3

see who's laughing with you.

- Reaction Engine v2: immediate listening, a continuous soft noise floor, smoothed laughter confidence and one count per episode. Normal speech reduces laugh confidence.
- Bundled Moonshine Tiny for short reaction words, with automatic local Whisper fallback on load failure. VAD segments wait in a bounded newest-three queue; spelling variants share one private vocabulary with the server.
- Automatic mic/context recovery, visible stage lights and the last ten local decisions. Top three personal/fan word tallies and honest empty recaps.
- Twitch plays natively; tab capture stays off by default. Audio stays in memory on your PC and is never saved or sent. Optional sharing sends only counts and approved canonical words, with a three-fan floor for each public word.
- Existing ratings, replay sessions, saved history and settings remain available. Store approval versions are unchanged; this release does not submit anything to stores.

Judges/manual installs: extract the ZIP to a permanent folder and Load unpacked. Update an existing manual copy by replacing files in the SAME folder, clicking Reload on chrome://extensions, and refreshing Twitch. Never Remove just to update.

Hold the popup settings version number to open diagnostics. Check the microphone, moving audio level, running AudioContext, worklet frames and model lights; then laugh naturally, say “bro”, “W” or “let’s go”, and leave a short pause. Detection and Count saved should light after a reaction. Real microphone accuracy still needs your own hardware check; this release uses short unit/build checks, without a long fixture or stress run.

Fixed unpacked ID: fkocldgggcmhihelohiicoakcfomhepg. Only its public key is included. Verify the ZIP with SHA256SUMS.txt. Bundled model/runtime licences are included.

Production service origins are configured at build time; no secrets or audio are included.
