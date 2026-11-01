# StreamLaughs v0.8.1 urgent fixes

## Part 1: popup watch context

Confirmed regressions: the matcher only accepted www.twitch.tv, and the popup read only tabs.query URL metadata. It did not ask a content script or recover a receiver missing on a pre-install/update tab. The manifest already included tabs; missing tabs permission was not the identified defect. Targeted red command: `pnpm --dir apps/extension exec vitest run src/watch-context.test.ts` — six failures, ten passes before the fix.

Fixed HTTPS www/bare/mobile channel matching, content-script context replies computed from the current SPA URL, targeted reinjection and requery, and VOD owner resolution from the video owner header (never recommendations). A recognized replay without its owner ready asks for a refresh instead of falsely calling it a non-Twitch page. Host access is limited to the three Twitch hosts. Recording start/lifecycle and the overlay use the same context. Existing session/DB/protocol IDs remain unchanged. The exact failing real-user tab URL was not supplied; the new path covers the reproducible gaps rather than claiming every user environment was reproduced.

## Part 2: real-device capture, DSP and diagnostics

The visible mic-check permission probe remained live until after offscreen microphone capture began. It now verifies getUserMedia on the visible extension page, records the grant and releases all probe tracks first. Selected input preferences are local only; the background passes them through runtime messaging because offscreen documents support runtime, not storage APIs. Exact device selection falls back to default when unplugged. Welcome uses the same constraints. Echo cancellation, noise suppression and native AGC stay false; software normalization stays local.

Previously the realtime pipeline was created only after VAD loaded. Warmup frames were discarded and a VAD startup failure left no detector. It now accepts frames immediately and runs DSP without models. Bounded energy segmentation keeps speech jobs possible while VAD is unavailable; a model failure is reported without disabling laughs. DSP checks energy, voiced autocorrelation/pitch and four pulses at 3–7 Hz, with a shared two-second laugh cooldown and raw tab waveform rejection. Tone and noise controls stay negative. This is a heuristic fallback, not a universal laugh/speech accuracy claim. Speech has one active job and one pending replacement, with short VAD segments.

The quiet human-WAV regression failed with zero saved laughs before DSP. With the same fixture scaled to 1.5%, seeded laptop-style noise and known tab spill, the pipeline plus Dexie now saves at least one laugh while YAMNet and Whisper deliberately fail. No confidence thresholds were lowered. Audio stays in RAM. The 55 targeted mic/pipeline/lifecycle/privacy checks pass.

Mic check/settings include an input selector, actual label and level, permission instructions, and a Bluetooth/Hands-Free tip. Both mic check and Alt+Shift+D copy bounded local diagnostics: version/browser, permission, input label/rate/track/context, RMS/FPS, VAD/DSP stages, models/scores, local session ID/counts and recent errors. Only the last approved phrase may be copied; full transcripts and audio are excluded. Nothing is automatically uploaded.

USER_MEDIA is retained for document lifetime. Chrome documents that AUDIO_PLAYBACK adds a 30-second silent-audio timeout; other reasons do not. A surviving offscreen document is resynced on worker restart. If it disappeared, it is recreated and a fresh Start gesture is requested to restore tab capture; an old stream token is never silently reused. Suspended AudioContexts are resumed.

API references: [offscreen lifecycle](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [tab capture and user invocation](https://developer.chrome.com/docs/extensions/reference/api/tabCapture).


## Part 3: playback isolation and measured inference pressure

Confirmed architecture: captured tab replay shared the same interactive/low-latency AudioContext and render graph as the processing worklets. Replay now uses its own buffered playback context, with a separate balanced-latency processing context. Both live only in the offscreen document; pause and mic loss preserve replay, and stop closes both contexts. Native echo cancellation/noise suppression/AGC are confirmed false in constraints and reported actual track settings. No extension AudioContext runs on Twitch and the video element is never modified for audio.

YAMNet cadence was 250 ms per stream; it is now 500 ms, with unchanged confidence thresholds and overlapping one-second windows. Heavy sound/VAD/speech work stays in separate workers. Whisper already had one active job; Part 2 additionally limits pending work to one replacement and segments to 2.4 seconds. Diagnostics expose per-worker compute duration rather than hiding model cost inside a misleading VAD-only figure.

An isolated headed-Chromium microbenchmark used the same bundled recorded-human fixture, actual packaged YAMNet worker and two inputs, excluding initialization. Each cadence ran for six seconds: 48 jobs at 250 ms versus 24 at 500 ms. Chrome process CPU from CDP was 360.51 versus 187.77 ms per second (about 48% lower, or 36.1% versus 18.8% of one core). Worker service time was 204.55 versus 123.93 ms per audio second. These are measurements on this machine, not a whole-Twitch CPU benchmark or a hardware stutter reproduction. Local evidence is work/v081-cpu.json outside git. Bluetooth HFP switching and Windows device/driver behavior remain unconfirmed on the user's hardware; the input picker/tip makes that path actionable.
