# v0.8.0 · detection investigation

Phase 1 is kept separate from the UI redesign. Model confidence thresholds are unchanged.

## Reproduction and causes

The live v0.7.0 website ZIP had the root manifest version 0.7.0 and compiled glass launcher/panel, grouped history and PNG share code. Fresh-install browser checks rendered that UI. An old-looking installed tab therefore needs its installed folder/version checked and its Twitch page refreshed; extension reload does not replace an old page's content-script DOM. The popup and debug now display the running version, and an update injects a small glass refresh notice into existing Twitch tabs using the existing Twitch host access.

1. **Capture admission used an unreliable preflight.** With the browser-wide test permission override removed, Welcome successfully opened the fake-device microphone, while Permissions API queries returned prompt/denied. The old Start path stopped at permissionRequired, never attempting offscreen microphone capture. The previous test's global grant hid this path. After an explicit successful user grant, actual getUserMedia/track state is now authoritative; real capture denial still returns a visible error. A boolean receipt contains no audio or device identity.
2. **A transient source mute became permanent.** The old onmute handler stopped the live mic track immediately, and it could not recover on unmute. Brief mutes now retain the track; a sustained mute reports micLost and resumes when the source unmutes. Unplug/ended tracks still need the existing retry path.
3. **Scheduling could starve speech.** In a slower recorded-input run, mic and VAD counters advanced and four speech segments existed, but Whisper requests stayed at zero. Only eight unacknowledged frames covered 80 ms across both streams; synchronous classifier stalls could drop frames and reset audio buffers. Sound work also ran ahead of backlogged VAD, and speech dispatch waited until the VAD queue was empty. YAMNet now has its own local worker, separate from realtime VAD/frame ACKs and the existing Whisper worker. Transport has a bounded two-second / 256 KB allowance, VAD a bounded three-second allowance, VAD catches up first, and transcription dispatch no longer requires an empty VAD queue. Coalesced sound windows do not count as lost VAD PCM. Load accounting uses the elapsed live interval rather than charging all classifier work against one 32 ms VAD chunk, which had falsely reported 10–20× overload.
4. **Browser voice-call echo processing altered the laughter input.** In the one-variable comparison, the same loud recorded mixture failed with browser echoCancellation enabled and passed with it disabled. The shared detection constraint now disables browser echo processing (noise suppression and browser AGC remain disabled), leaving local playback matching in charge. This is a processing change, not a confidence-threshold change.

5. **Speaker-like spill biased the sound classifier.** The additive-reference stress fixture could keep words working while laughter scores fell below the unchanged confidence threshold. A stable, time-aligned component of known tab audio is subtracted as a complementary model view; original mic evidence is retained too, and confirmed playback is still rejected by the guard. Normalization never turns down an already audible independent voice, apart from peak headroom. It does not mute the microphone or discard a whole mixed segment. Existing matching-playback rejection remains.

## Local trace

User grant → offscreen alive → getUserMedia opened / live track / sample rate → worklet frames / RMS → inference arrivals → VAD chunks / speech segments → YAMNet calls / laugh score → Whisper ready / speech requests / completed results → validated events → matching live session → IndexedDB checkpoint → saved recap with the same session ID.

Alt+Shift+D shows these counters, track/model errors, guard decisions, version and the last approved phrase as a filtered transcript preview. Full transcripts are never saved or copied. The full diagnostics page can copy only its strict counter/status allowlist. Audio, raw transcripts, device IDs and model samples never enter those reports or the network.

## Proof and limits

Phase 1 completed with 63 targeted unit tests, extension typecheck and a production build. A separate packaged-YAMNet reference test passed: recorded human laughter peak 0.586, mixed input 0.668 and reference-aware view 0.668 (unchanged 0.5 threshold).

Headed production-ZIP proof, no Playwright-wide microphone grant override, recorded `laugh-lets-go.wav`:

- Normal background tab playback: **1 laugh, 6 approved word/phrase counts**, 50 mic frames/s, zero drops; session and saved recap IDs/counts matched. 21.4 s.
- Loud tab playback plus a generated reference spill in the fake mic: **1 laugh, 7 approved word/phrase counts**, 50 frames/s, zero drops; the recap read the same saved session. 25.2 s.
- Popup mic check: live level and **heard you!**, no watched session created, offscreen document closed on exit. 13.5 s.
- Exactly these three targeted headed cases passed in about one minute. The earlier red runs and AEC comparison were retained locally as investigation evidence; they were not presented as successful runs.

Commands: `pnpm --filter extension exec vitest run src/identity.test.ts src/inference/bridge.test.ts src/inference/pipeline.test.ts src/inference/reference-echo.test.ts src/inference/rules.test.ts src/audio/engine.test.ts src/audio/background.test.ts src/diagnostics.test.ts src/audio/privacy.test.ts src/updated-note.test.ts`; `pnpm --filter extension typecheck`; `pnpm --filter extension build`; `PRODUCTION_TEST_ZIP=.test-runtime/phase1.zip pnpm exec playwright test tests/production-audio.spec.ts --grep 'with normal tab playback|with loud tab playback|popup mic check detects' --headed`. Environment syntax differs on PowerShell; TEMP/TMP were redirected to the task's D-drive cache. No full test suite or general e2e suite is required. The recorded human “let’s go” / laughter fixture and its CC0/public-domain sources are documented in tests/fixtures/audio/README.md; no synthetic TTS is used. The loud case adds known spill to fake-microphone input while a real captured video tab plays audio. This is a reproducible smoke test, not a room/AEC accuracy guarantee.

Physical laptop/headset mics, Windows microphone privacy settings, speakers/headphones and browser device switching remain manual acceptance items. No test can establish every user's room acoustics or hardware configuration.
