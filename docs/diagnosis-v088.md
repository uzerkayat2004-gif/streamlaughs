# v0.8.8: restoring microphone reactions

The owner's installed popup reported v0.8.5. Main was already v0.8.7, so the
judges package must visibly report **v0.8.8**. Disable the older store/ZIP copy
while testing. Store approval versions are deliberately unchanged.

## Reproduced causes

1. **Opening speech became the room floor.** On the unmodified production build
   at a07c0d4, the original recorded human laugh/“let's go” WAV, starting with
   speech immediately, produced **0 laughs and 0 words**. The mic delivered
   approximately 1,967 frames, all three models were ready, and the near-voice
   gate rejected every segment as below the calibrated floor. Adding a quiet
   prelude to the same audio produced 2 laughs and “lets go”. This isolates the
   startup calibration rather than mic permission or model loading.
2. **W was missing from the local reaction vocabulary.** Added standalone “w”
   and whole-utterance “double you”/“double u” aliases. A W mentioned inside an
   ordinary sentence is still rejected. Existing let's go, lets go, lol, lmao
   and haha matching is covered by targeted tests. The public fan-server word
   vocabulary is unchanged.
3. **A cold cached decoder could consume the first word's work allowance.**
   Both decoder branches are now warmed before the model is marked ready. The
   unchanged CPU safeguard can still delay words; this is not a real-time ASR
   guarantee. An optional 12-second encoder looked faster in two probes, but
   the final repeated control rejected a genuine bro at logprob -1.63. Rejected
   that optimization and retained the exact original 20-second encoder, decoder
   and confidence gates. Its nine-clip production ZIP control already passed.

## Fix boundaries

Calibration now uses actual quiet gaps when the opening window contains at
least 30 dB of foreground contrast. Continuous loud opening speech asks for a
quiet retry and recovers after one quiet second. The ordinary calibrated
speaker/room reference is retained; the speaker-bleed fixture has approximately
19 dB of contrast and keeps the conservative upper-quantile floor.

Normal laugh thresholds, speech margin, rhythm/evidence checks, episode merge,
cooldown, speech confidence, one-thread inference, single-flight/busy dropping
and the rolling work limit are unchanged. Twitch audio remains native: no tab
capture or speaker-connected extension AudioContext in the default session.
Explicit WebGPU initialization failure now falls back to local WASM. Browser
proof uses real bundled WASM models; WebGPU selection/failure is unit-tested,
not claimed as a real-device GPU benchmark.

Hold the popup version for about 0.7 seconds to see mic level/device, frames,
VAD/laugh/word model status and errors, last laugh score and last approved word.
The existing detailed local debug view remains available. No captured audio is
persisted or sent. Full recognition text stays in the existing local debug view;
the copyable report contains the approved word and numeric/status diagnostics.
If listening was previously disabled, the readout offers an explicit mic-enable
action rather than silently overriding that preference.

Settings now have one contained scrolling surface, keyboard focus containment,
the requested short controls, and local history save/load for ZIP and store
installs. The judge CTAs on home/install/try point directly to /download/zip.
The existing /try interactive demo source is unchanged.

## Reproduce the checks

Build the production website/extension, extract its download ZIP to a fresh
folder, and set AUDIO_PROBE_BUILD to that folder. Then run:

```powershell
pnpm test:accuracy
$env:STUTTER_SECONDS = '300'
pnpm test:stutter
```

These targeted recorded-input tools use Chromium's fake microphone flags and
the normal permission/start/offscreen/worklet/worker/panel path. They do not
inject samples directly into a model. Fixture receipts and attribution are in
tests/fixtures/audio/README.md. The W source is recorded human audio, CC BY-SA
3.0; the derived test-only WAV has the same attribution/license and is excluded
from the downloadable extension.

The original quiet-input test still expected the obsolete DSP-only fallback.
It now asserts that quiet below-floor input makes no laugh and starts no speech
job, while the separate DSP rhythm diagnostic remains active. Production gating
was not relaxed to satisfy that stale expectation.

These clips are regression controls, not a general accuracy dataset. A fake mic
does not prove Windows driver/Bluetooth behavior. Native video has no audio
underrun counter; measured model elapsed work is not an OS CPU measurement.
Final package results are recorded in verification-v088.txt.
