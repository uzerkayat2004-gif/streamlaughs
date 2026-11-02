# StreamLaughs v0.8.5 — independent microphone detection, native Twitch sound

## Reproduced failure and fix

Pulled main and compared `f0fef02..6ac6a7d` across background Start, offscreen creation/messages, audio context/mic/worklet setup, model workers, mode defaults, safeguard and panel delivery. v0.8.4 still creates its offscreen owner with `USER_MEDIA` (no `AUDIO_PLAYBACK`, avoiding its silent-audio timeout); normal Start explicitly sends `nativePlayback: true`. Mic constraints/device selection and the 16 kHz worklet resampler were unchanged. Mic, laugh, speech and overlay switches default true; tab capture defaults false. No detection message was renamed. The panel throttle coalesces snapshots rather than dropping the latest state.

The new **fresh-Start** production fixture does not opt into tab capture or toggle any lab control. It uses Chromium's recorded-WAV fake microphone through `getUserMedia`, the production AudioEngine/worklet and all three real model workers, then checks the actual Twitch content-script panel. It does not inject audio into a model, set a global autoplay override, or use the e2e runner. Production crowd requests/sockets are blocked and sharing is off.

With the extracted v0.8.4 ZIP, that fixture failed after 93 seconds: **3,567 mic frames**, **3,540 inference frames**, 2,212 VAD calls, 98 voiced chunks, 12 DSP laugh hits, **12 laughs shown**, two speech requests, **zero speech results/words**, and two speech budget overruns. All detection switches were on. Thus the fixture reproduced the **word failure**, not the owner's complete zero-laugh hardware symptom. No hardware diagnostics were supplied with the request; the physical zero-laugh failure must not be presented as independently reproduced.

Changing **only** the v0.8.4 bridge timeout made that same fresh-Start fixture pass in 12.59 seconds: 521 mic frames, 483 inference frames, one successful speech result, one matched word, one stored laugh (two by the time the panel was read), and the approved word visible in the panel. The new three-second-or-audio-duration wall-clock deadline was killing valid cold/slower speech jobs, discarding the result and starting a thirty-second cooldown. Browser scheduling/cold inference time is not proof of audible output trouble. The bridge deadline is removed. The v0.8.3 bounded speech queue, local model token budget, independent worker and low-power controller remain unchanged.

## Mic startup and recovery

The comparison also exposed an implicit startup dependency: analysis was resumed **before** opening the microphone. v0.8.3 already had an active captured tab at that point; v0.8.4 native playback did not. [Chrome documents that active capture allows Web Audio autoplay](https://developer.chrome.com/blog/web-audio-autoplay). This was not reproduced as a failure in the fake-device browser run. A capture-gated context regression does fail on v0.8.4, and the sequence is now independent: acquire the selected mic first, create the analysis context/worklet, attach the mic, then resume. A retry also reacquires input before resuming. It creates no tab stream or passthrough context.

Analysis recovery also used to recognize only `suspended`, ignoring `interrupted` during device/platform changes. The [Web Audio state contract](https://www.w3.org/TR/webaudio/#dom-baseaudiocontext-state) includes interruption state. A targeted regression sets that state and demonstrates the missed resume. The owner now retries either state without capturing Twitch. A pending microphone acquisition that completes after Stop is still stopped and never attached.

These are reproducible startup/recovery contract failures, not proof of which Windows/Bluetooth event occurred on the owner's machine. If hardware still reports zero, the debug panel now distinguishes **mic frames in + RMS**, **frames reaching inference**, VAD, DSP/model candidates, speech segments/results, matched words, accepted events, and **snapshots delivered to this panel + shown counts**. All counters are numeric and RAM-only. No audio or transcripts enter copied reports.

## Safeguard and preserved behavior

- Native Twitch audio remains the default: no `tabCapture`, no extension playback context. The optional speaker reference remains separate direct playback.
- Only actual playback-watchdog trouble can automatically switch the speech worker off through the lab bridge. Laugh DSP/model work and mic transport stay enabled. Thirty smooth seconds re-enable speech; explicit user-off controls remain respected.
- All detection switches default on for each session. The tests exercise native mic frames while speech is paused, speech recovery, slow word results and mic frames without tab capture.
- v0.8.3 inference configuration, reaction thresholds, word matching/allowlist, mic constraints/normalizer and resampler are unchanged byte-for-byte. No new permissions. Public key and unpacked ID stay unchanged.

## Focused verification

Run `pnpm test:mic-session` after a production build, with `AUDIO_PROBE_BUILD` pointing to a freshly extracted final website ZIP. `MIC_SESSION_REPORT` chooses the numeric report destination. It fails if no mic frames reach inference, laughs/words remain zero, native Twitch playback is replaced, or the visible panel does not show the results/delivery counters. The fixture uses a fresh isolated browser profile; no account login or real viewer traffic.

See [verification-v085.txt](verification-v085.txt) for before/after evidence, the final extracted-ZIP result, targeted tests, typecheck, builds and preserved-file hashes. The previous stutter soak remains a historical failed timing target; this patch does not claim a new ten-minute physical hardware acceptance.

Update: stop recording, download `/download`, extract and replace **all files in the same existing installed folder**, Reload at `chrome://extensions`, then refresh Twitch. **Never Remove.** Confirm v0.8.5 and leave tab capture off. Laugh and say “let's go” or “bro”; check the panel and Alt+Shift+D counters. Keep Bluetooth output but choose the laptop mic if the headset input changes output quality. Recaps/settings remain in browser storage.

If Alt+Shift+D does nothing, use **popup → gear → hold Shift and click the version number** to open the separate diagnostics page and its copy-report button. Refresh Twitch after every extension reload; the old content script cannot update itself in an already loaded tab.
