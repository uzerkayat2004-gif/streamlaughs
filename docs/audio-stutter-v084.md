# StreamLaughs v0.8.4 — native Twitch sound and a local stutter lab

## What the evidence establishes

The v0.8.3 Start path **always captured the watched tab**, muting its native output and replacing it with an extension AudioContext. Tab reference audio helps reject speaker spill, but the microphone detectors do not require it to detect an independent laugh or reaction. The fixture recognizes both with native video playback and mic-only capture. v0.8.4 therefore leaves Twitch playback native by default. This removes the extension passthrough and one stream of analysis work from the normal session. Tab capture remains an explicit, session-only lab opt-in for the speaker echo reference.

The severe continuous Windows stutter was **not reproduced on this test machine**. It would be false to identify a particular driver, Windows communications setting, Bluetooth profile or model as its proven cause. The mitigation removes the unnecessary rerouting path; the live controls let the owner isolate any remaining hardware cause without reloading.

The owner confirmed **Bluetooth headphones/headset** and asked to publish the update before trying the laptop-microphone comparison. That hardware comparison is pending, not passed. Microsoft documents the Classic Bluetooth microphone/profile behavior in [Bluetooth Classic Audio](https://learn.microsoft.com/en-us/windows-hardware/drivers/bluetooth/bluetooth-classic-audio). Bluetooth LE Audio can behave differently on supported hardware; the extension does not force an OS profile.

The isolated v0.8.3 baseline used the actual AudioEngine, AudioWorklet and production VAD/YAMNet/Whisper workers, a simulated tab video stream and Chrome's recorded-WAV microphone. Native playback, tab-only, capture-without-models, all models, and native playback with mic/models were compared. Captured contexts reported one initial ~10 ms underrun each, including with models off. No repeated output-clock gap or offscreen long task occurred in these short phases. The all-model phase measured 279.6 ms/s of elapsed model/realtime work; the native mic/model phase measured 235.5 ms/s. These are short, differently aligned fixture windows, not a guaranteed percentage improvement or OS CPU utilization. Worker timer stalls reached about 1.8 seconds during transcription; they were not offscreen long tasks or audio underruns.

See [verification-v084.txt](verification-v084.txt) for the final ten-minute measurements, setup tasks, real tab-capture switch check, WAV counts, targeted tests and builds. Setup and measurement windows are separate; startup tasks are retained in the report rather than silently discarded.

The first sustained fixture attempts found 85–98 ms offscreen long tasks under load. One controller left a full popup page open; a subsequent controller closed it as normal viewing does. Closing the popup did not eliminate every over-50-ms task. These are retained as failures of the strict timing target. They do not prove audio underruns: native HTML-video output has no accessible underrun counter. The release must not be described as zero-underrun/zero-long-task hardware acceptance.

The completed candidate soak produced **112 laughs and 18 matched words in 600.783 seconds**, with 12 new offscreen long tasks (worst 98 ms), 356 dropped video frames, no model errors, and a speech-worker timer stall reaching 44.9 seconds. Elapsed model work averaged 630.2 ms/s, with a completed job approaching 39.6 seconds; this is not actual OS CPU utilization. The short initial baseline is not an equal-length CPU comparison. A late in-flight job previously had no enforceable bridge deadline. The final build now uses the existing `whisperBudgetRtf` (2.5) to terminate over-budget speech work, with a minimum three-second job allowance and a thirty-second cooldown; laughs remain active. No detector threshold/word rule changes. That final guard is covered by targeted cancellation/recovery and real-model WAV checks; the strict ten-minute zero-long-task target is **not claimed passed**, and a second full soak after the late guard remains pending at the owner's request to publish now.

## The five suspects

1. **Tab passthrough:** mandatory in v0.8.3, unnecessary for independent microphone detection. Now off by default. Opt-in playback is a dedicated `latencyHint: 'playback'` context at the tab track's granted native rate, wired directly source → destination. Analysis remains in a different context/worklet. No ScriptProcessor or inference runs on the passthrough path.
2. **Model threads:** already dedicated Web Workers with ONNX/WASM `numThreads = 1`, a 500 ms sound cadence and a yielding realtime scheduler. Those settings and all detector thresholds/word rules are unchanged. Lab switches actually terminate disabled sound/speech workers; both off terminates inference, while capture can stay live. Speech restarts independently on recovery. Model work is reported as elapsed inference milliseconds per second, not an OS thread-CPU measurement. Workers report supported long tasks or explicitly “unavailable”, plus separately named event-loop stalls.
3. **Mic format:** capture already omitted forced sampleRate/channelCount and kept EC/NS/AGC false. This is preserved. The actual fixture mic granted 44.1 kHz stereo, while the analysis worklet produced 16 kHz mono. The lab shows granted settings and the device label; raw device IDs stay out of reports.
4. **Windows/Bluetooth:** a synthetic mic cannot switch a physical headset between A2DP and HFP or measure communications ducking. A Bluetooth-like input label or playback glitch warning offers a calm dismissible tip, including the Windows Communications setting. It does not claim to identify the active Windows endpoint/profile. Dismissal is a local preference.
5. **Overlay:** normal polling was 2 Hz, but resize/scroll handlers could read geometry repeatedly and status messages could repaint more often. The Twitch surface now coalesces snapshots and geometry reads to at most 4 Hz. Launcher/ripple keyframes use transform/opacity. The lab can freeze panel updates and animations while its own controls and metrics remain interactive. A fake-timer regression verifies the rate and latest-snapshot recovery.

## Use the hidden lab

Start a session, press **Alt+Shift+D**, then expand **stutter lab · live isolation**. Flip one switch, listen for 15–30 seconds, and restore it before testing another:

- Tab capture: normally **off**. On is an optional speaker echo reference; off stops its tracks and closes passthrough, restoring native tab audio. Browser invocation/permission rules still apply; no production bypass was added.
- Mic capture: releases/reacquires the selected input while preserving the session. This is the key device-profile/communications comparison.
- Laugh model + DSP and speech/word model: independently stop/restart actual work without changing thresholds or matching rules.
- Panel updates + animations: freezes the ordinary reaction UI. Lab controls and numeric diagnostics keep updating.

Metrics and copied reports stay local and contain no audio or transcripts. The existing debug-only transcript preview remains separate from the copied lab report. The Twitch long-task count includes all scripts on that page; it is not an attribution to this extension. Video dropped frames use `getVideoPlaybackQuality()` and are not audio underruns.

## Watchdog and safety pause

For opt-in tab playback, the lab feature-detects the browser's actual `AudioContext.playbackStats` underrun counters. Where absent, it says unavailable. A separate fallback compares consecutive `getOutputTimestamp()` values to identify estimated output-clock gaps. A delayed JS timer by itself is never counted as an audio underrun. Context suspend/resume resets timestamp comparison.

Three underruns/gaps within ten seconds pause **speech first**, terminate Whisper work, and retain laughs. After 30 seconds without another hit, speech can restart. Explicitly switching words off remains respected. In native mode there is no extension passthrough context to monitor; browser APIs do not expose a native HTML-video audio-underrun counter. Zero extension passthroughs is not a measured guarantee about physical speakers or Bluetooth.

The diagnostics follow the browser's supported APIs: [Web Audio output timestamps](https://www.w3.org/TR/webaudio/#dom-audiocontext-getoutputtimestamp) and [Long Tasks](https://www.w3.org/TR/longtasks/). Experimental playback statistics are feature-detected and never assumed available.

## Reproduce the automated checks

Build production with `SITE_URL=https://streamlaughs.vercel.app` and `VITE_CROWD_API_URL=https://streamlaughs-crowd.streamlaughs.workers.dev`, then run `pnpm test:reactions` and `pnpm test:stutter` **separately from builds and heavy work**. The stutter harness defaults to 600 real-time seconds, runs the real production offscreen document and all model workers, exercises live switches, and uses actual tabCapture with a test-only Chromium invocation grant. Native playback remains enabled for the ten-minute measurement. It blocks production crowd traffic and uses a labelled local video and recorded fake mic. No account, real viewer traffic or captured user audio is used. `AUDIO_PROBE_BUILD` can point to an extracted final ZIP; `STUTTER_REPORT` selects a numeric JSON report. A shorter `STUTTER_SECONDS` run is only a smoke check, never ten-minute acceptance.

## Owner check: wired, then Bluetooth

Update by replacing **all files in the same installed folder**, reload at `chrome://extensions`, and refresh Twitch. Confirm v0.8.4. **Never click Remove.** Recaps and settings stay in browser storage.

1. **Wired earphones, five minutes:** open one live Twitch stream. Leave tab capture off, start recording, and listen continuously. Laugh and say “let’s go” or “bro” a few times. Open Alt+Shift+D, check mic levels, word/laugh counts, model state and the stutter lab. Confirm “Twitch plays natively” and no extension playback context. Compare 15–30 seconds with speech off/on, then panel updates off/on, then mic off/on. Finish with defaults and save the recap.
2. **Bluetooth, five minutes if available:** use the same stream and repeat. Check the granted mic/device label. If sound degrades as soon as mic capture turns on and improves with it off, select the **laptop microphone** in test my mic and retry while keeping Bluetooth output. Also try Windows Sound settings → Communications → **Do nothing**. Note quality changes separately from choppy playback. The OS/browser controls Bluetooth profiles; the extension cannot force A2DP while using a headset's HFP mic.
3. If stutter persists with the mic off, toggle models and panel updates one at a time. If testing speaker echo rejection, briefly enable tab capture, listen, then turn it off again. Stop if this reintroduces chop. Copy the numeric stutter report for a failing and a smooth state; no transcript or audio is needed.

No Cloudflare deployment, store upload, tag or release is part of this pass.
