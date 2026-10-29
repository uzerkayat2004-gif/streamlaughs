# Microphone investigation · v0.6.1

## Confirmed failures and fixes

The baseline was the actual `/download` production ZIP, verified against its published SHA-256, not an audio-debug build. No confidence thresholds were reduced.

1. **Speech decoding blocked every reaction.** VAD, YAMNet and Whisper previously shared one worker and one awaited scheduler. On this Windows laptop, an actual bundled-model, live-paced 16 kHz fixture run spent about 16.9 seconds in inference, dropped 468 frames, reached a 32-job queue and produced zero laughs. The WebGPU speech backend was slower here than WASM. A red regression held transcription pending and demonstrated that `step()` could not finish within 40 ms. Whisper now uses a separate worker; bounded requests return only approved phrases and a hype flag. VAD/YAMNet continue accepting and acknowledging frames while speech runs. Pause/stop terminate both workers, and a crashed speech worker rejects its pending request without stopping reactions. Production selects WASM; a short utterance gets a bounded minimum decode allowance rather than its subsecond duration alone.

   A separate red regression confirmed that one dropped frame activated the 20-second words pause. Low-power now requires slow measured inference, sustained frame loss over a second, or a large lost batch. Isolated OS scheduling hitches remain visible in the drop counter and do not repeatedly disable words.

2. **The echo guard mistook matching loud/quiet rhythm for matching sound.** A red test used different 220/730 Hz waveforms with the same envelope; the old guard rejected the mic. Rejection now requires the existing timing/envelope/class evidence **and** a strong raw-waveform match over a bounded lag search. It rejects a candidate segment, never the mic stream. Matching playback is still rejected; independent input with the same rhythm is retained. The diagnostic decision describes the last candidate segment.

3. **First-use work and weak input were unhandled.** Model kernels now warm before live frame delivery begins, keeping compilation out of the live frame budget. Local model input receives DC removal, adaptive bounded gain (maximum 20×), a tracked noise floor and immediate peak headroom. Raw mic/tab capture buffers and echo comparison stay unamplified. Silence does not become signal, background gain is bounded, and normal laptop/headset input does not have to reach a fixed loudness by itself. Options live in `apps/extension/src/audio/config.ts`; browser `autoGainControl` stays explicitly configurable there and defaults off to avoid two competing gain controllers.

   The first gain prototype failed a recorded-laugh check: per-frame gain pumped up the gaps and damaged the envelope (measured peak top laughter score 0.414). A red gain-envelope regression caught the rebound from 1× to 14.7× in 200 ms; the fix holds a fast-attack, approximately one-second-release level envelope. The corrected production capture produced both laugh and word counts at unchanged confidence thresholds. Classification now samples every 250 ms rather than 500 ms, with the same two-hop confirmation and 750 ms maximum evidence gap. A red scheduler test demonstrated a 400 ms high-confidence bout falling between the old confirmation opportunities. The greater overlap fixes that temporal miss without relaxing confidence.

4. **Failures were invisible.** The production diagnostics page shows live mic/tab track state and device label, levels, actual inference frame rates, 16 kHz/320-sample format, all three model states/errors, VAD, top mic YAMNet class, gain/noise floor, playback decision and recent event kinds/counts. Load errors survive worker teardown in RAM. Startup capture errors are retained in background RAM, not the saved session. Changing the default audio device reopens the default input; stop cancels an asynchronous retry.

The complete baseline capture test did acquire live mic/tab tracks and eventually detected one laugh, but produced no words before that check ended and had entered low-power mode. This is evidence of conditional stalls and misses, not a claim that every baseline microphone failed. Welcome permission and the shipped model paths/CSP were checked; missing model files were not the cause reproduced here.

## Hidden diagnostics and privacy

Open the extension popup → gear → **hold Shift and click the version**. Ordinary clicks do nothing. This view ships in production; the development debug/simulation screens still do not.

“copy report” uses a strict schema that rejects audio arrays, transcripts, approved word text and unknown fields at every level. It contains device labels, error messages, model category labels and small numeric status only. The report is created in memory and copied only when requested. No automatic upload, log file, audio recording or diagnostic database is created. Full speech text remains inside the local speech worker and is discarded. The existing storage/network privacy assertions also cover the mic check, normalization and speech worker.

Welcome → allow mic now says **say something**, with a live bar and a green result. It stops its tracks before the sharing step. A quiet result offers one retry; closing Welcome aborts the check and releases its resources.

## Reproduce the production regression

```powershell
$env:SITE_URL='https://streamlaughs.vercel.app'
$env:VITE_CROWD_API_URL='https://streamlaughs-crowd.streamlaughs.workers.dev'
pnpm build
pnpm exec playwright test tests/production-audio.spec.ts --trace off
```

The tests extract the production ZIP into a fresh folder/profile. They use a real recorded human laugh and speech fixture, the real Welcome permission/level check, worklets, bundled models, event reducer and checkpoint. Both normal and maximum-volume Twitch-like video tab playback must produce actual laugh and word counts. A separate speech/silence-only case must produce words and zero laughs. No model scores, detections or audio APIs are stubbed. Clipboard interception checks report contents without touching the user's clipboard. Test recording/transcript traces stay off. Fixture sources/licenses/hashes are in `tests/fixtures/audio/README.md`; those recordings never ship in the ZIP. `PRODUCTION_TEST_ZIP` can point the same suite at a downloaded hosted ZIP.

The audio fixture closes Welcome after consent and opens its controlled stream explicitly. The complete final “open Twitch” onboarding action is covered by the existing polish test. An extension-created tab's first navigation can precede Playwright's route attachment; allowing the real Twitch directory to load introduced unrelated keyboard-permission errors and many third-party frames. Those external errors were isolated without filtering extension errors or replacing capture APIs.

One test uses the requested `--use-fake-ui-for-media-stream` and `--use-fake-device-for-media-stream` flags for Welcome. Chromium's fake-UI flag replaces tab-capture selection with a default device and causes `NotFoundError` in an isolated minimal extension too. The combined test therefore uses `--auto-accept-camera-and-microphone-capture`, the fake-device/file flags and browser-level test microphone permission. This matches [Chromium's documented switch distinction](https://chromium.googlesource.com/chromium/src/+/master/content/public/common/content_switches.cc). The test-only extension allowlist supplies the toolbar-invocation grant; production has no bypass. `getMediaStreamId` and offscreen tab `getUserMedia` remain real in the combined tests.

These tests establish the packaged capture/model/counting path. Fake input cannot establish physical Windows device behavior, room acoustics, actual speaker/AEC quality, or recognition recall across people. The existing [30-minute hardware checklist](manual-part6.md) remains necessary for those boundaries.

An additional artificial-noise stress probe mixed a constant 317 Hz tone at amplitude 0.04 into the mic recording. It failed: the models confused the mixture with other sounds and produced no voiced words/laugh events, despite live tracks, ready models, near-50 FPS and a **kept** guard decision. This is recorded as a remaining noise/AEC robustness limit, not presented as a successful physical speaker test. It can be reproduced explicitly with `AUDIO_SYNTHETIC_TONE=1` on the loud test; it is separate from varying actual tab playback volume with the requested unchanged recorded mic file. No confidence threshold was reduced to force that probe to pass.

## Update and check your microphone

1. Stop the current session. [Download the new ZIP](https://streamlaughs.vercel.app/download), unzip it, and replace the **contents of the same permanent extension folder**. Keep `manifest.json` at that folder's root.
2. Open `chrome://extensions`, click **reload** on StreamLaughs, and refresh Twitch. The version should be **0.6.1** and ID **fkocldgggcmhihelohiicoakcfomhepg**. Saved data, protocol identifiers and the public key stay unchanged.
3. Start a live stream with headphones. Open hidden diagnostics, say a sentence, then laugh naturally in a couple of separate bouts. Mic level should move; mic track should be live and not muted; models should become ready; inference should settle near 50 frames/s. Words need voiced segments and a short pause to finish.
4. Repeat at comfortable speaker volume. Your own independent reactions should count; playback alone should not. Change the system's default mic and verify it reconnects. For a failure, use “copy report”; it contains no audio or transcript. Never paste credentials or private recordings.

The patch version enables the existing daily version notice. No tag, GitHub Release, paid service or Cloudflare configuration change is required.
