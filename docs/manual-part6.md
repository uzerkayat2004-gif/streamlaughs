# StreamLaughs final manual acceptance · one 30-minute pass

This is the canonical final checklist. It is a smoke/acceptance pass, not an accuracy benchmark or a two-hour soak. Mark only things you observe. Record date, Chrome/Edge versions, OS, build version, configured origins and result beside each item. No private audio, cookies, tokens or OAuth codes in evidence.

**Prepare before starting the timer:** complete provider/env setup, connected release rehearsal and model download; have headphones, speakers and a working mic; two clean browser profiles A/B; your own live Twitch test stream (or a cooperating streamer who logs into their own dashboard), ideally with an archive already available. Start local/dev Worker + website with real registered Twitch credentials. Build Chrome/Edge with those public URLs. Set ALLOW_TEST_TRAFFIC=true only locally/dev for the floor/word demonstration; production stays false. Have one older eligible aggregate stream if testing existing VOD links. Registration, model downloads, Twitch archive processing and deployment are outside this timed pass.

## 0:00–5:00 · ZIP and first run

- [ ] Click Download on the homepage: setup opens at /install?downloaded=1, the ZIP starts once, “your download started” and illustrated steps remain visible. Retry starts another attachment. Plain /install waits for its Download click. Switch Chrome/Edge/Brave tabs without another automatic download; check the inner-folder warning.

- [ ] Compare both ZIP hashes with SHA256SUMS.txt. Extract Chrome into a new permanent folder; it contains manifest.json directly, local models, LICENSE and notices, with no debug page or PEM/env files. Load unpacked in clean profile A; confirm **fkocldgggcmhihelohiicoakcfomhepg**.
- [ ] Welcome → allow mic → sharing default off → explicitly choose sharing → open Twitch → toolbar start. Once installed, the Welcome-to-ready steps take under one minute without guessing. No simulation/screen switcher/debug controls are visible. A missing/blocked mic offers a friendly retry or “watch without mic”.
- [ ] Load the Edge ZIP into clean profile B in physical Edge (or use a second Chrome profile for crowd and test Edge afterward within this slot). Confirm the same ID. Choose “watch without mic”; starting its crowd view opens neither audio input. If Edge is unavailable, mark it unverified rather than substituting Chromium results.

## 5:00–12:00 · real stream, headphones and speakers

- [ ] In A with headphones, start on the real Twitch player. Audio remains audible. Warming up settles; laugh naturally and observe a personal count when detected. Quiet speech/silence does not continuously inflate laughs. No promise that every laugh is detected.
- [ ] Open/move/dock the crowd box. Pause: player audio still plays, processing stops. Resume. Switch browser tabs: session continues. Close/change the watched channel: session stops and saves. Reopen and start a short session for the next checks.
- [ ] Switch to speakers at a sensible volume. Listen without reacting, then react yourself; note obvious stream-echo false counts. Return to headphones. If rejection is poor, stop acceptance and record the conditions; do not claim perfect AEC or tune a demo to hide it.
- [ ] Unplug/deny the mic while running: crowd and tab replay remain; one “mic lost · tap to retry” message. Reconnect and retry. The long/denied error paths give one clear action. If the OS mute only supplies silence, verify the documented limitation rather than expecting unplug detection.

## 12:00–18:00 · two profiles and the three-person floor

For the v0.6.1 microphone fix, include the [focused production retest](microphone-part11.md#update-and-check-your-microphone) in the preceding audio checks: green Welcome bar, hidden diagnostics, live/default-device input, ready models, near-50 inference frames/s, voiced words after a pause, independent laughs with headphones and speakers. Capture a report if a check fails; it contains no audio or transcripts.

- [ ] A/B watch the same channel with sharing on. With only these **two** contributors, both show “a few here”, without revealing counts/words. Dashboard/watch-only sockets do not count as sharing contributors.
- [ ] Add one explicitly labelled third test contributor on local/dev:

```powershell
pnpm --filter crowd-sim start --channel your_lowercase_login --viewers 1 --duration 90 --script funny --origin chrome-extension://fkocldgggcmhihelohiicoakcfomhepg
```

- [ ] At three, eligible live counts appear; test traffic is labelled. Stop the simulator and wait for its recent window to expire: return to few. Sharing off in A stops its outgoing contributions immediately. A/B are two profiles, not proof of unique humans.
- [ ] For an easily repeatable **word** floor, turn A/B sharing off, run the same command with `--viewers 3 --duration 180`, and observe independently floored approved words plus test labels. Leave it running through the next minute/dashboard check. No audio/transcripts or arbitrary labels are sent. Two simulation clients must not reveal a word; use `--viewers 2` if repeating that boundary.

## 18:00–24:00 · owner dashboard and history

- [ ] Log into the website with the real Twitch owner account. It opens only that owner’s channel. Live is receive-only, matches the eligible viewer crowd and shows test traffic. A different Twitch account cannot open that channel’s dashboard/history.
- [ ] After an eligible minute, open past streams: a glowing wave, real aggregate words/peak and up to three distinct moment cards. Test data remains marked. A matching existing archive opens at a nonnegative correct offset; if unavailable/off/expired, only time appears. No fake VOD ID or invented stream start. A live broadcast’s new archive may not be ready yet; the time-only fallback is the expected check until Twitch provides it.
- [ ] Logout removes the essential auth cookie. Public pages and /demo have no app cookies or analytics. /demo clearly says recorded test data. No secret/read key, viewer rows or personal transcript appears in page JSON.

## 24:00–30:00 · recap, motion, update and privacy

- [ ] Stop a session in A. Reach “see recap” with Tab/Enter and touch if your device supports it; it remains until dismissed. Escape returns focus from the crowd box to the dot. Past-stream bubbles show/select their own saved counts/channel, not repeated reference examples. Empty-word/no-laugh states and “copy time” stay honest.
- [ ] Enable OS/browser reduced motion and reload: blob/story/background motion stops; recap is still navigable by arrows and previous/next. Focus rings and labels are visible. Check popup states fit without clipped controls, including offline, few, warming, mic lost and low power when naturally present. Low power is not guaranteed on a fast machine; its deterministic layout/priority is covered by automated tests.
- [ ] For the update dot, use a separate fresh test profile. Copy the site-test build, change only that temporary manifest's version to `0.0.0.1`, and Load unpacked. Leave the real local /version.json endpoint unchanged. Its newer version must show a small dot linking directly to the configured /download endpoint. Repeated popup opens make no second daily fetch. Reload the normal current-version build afterward; a stale dot clears locally. Never publish the modified test manifest or alter production metadata for this check. The automated browser test covers this same real-endpoint flow. A profile that already checked will not fetch again within 24 hours.
- [ ] Replace the same installed folder with the next verified ZIP and reload; ID and that profile’s recap/preferences remain. Confirm listen/share off and “delete my data” end processing, stop tracks and delete local records. Audio is never stored/sent; completed anonymous server aggregates expire after 30 days and cannot be subtracted by viewer.

**Sign-off:** date ______ · browser/build ______ · passed / failed / unverified ______ · observed issues ______. Stop before publishing if required items fail. If hardware, real OAuth or a provider-dependent VOD case cannot be exercised, state that limit in the submission; an automated/mock result is not a substitute.
