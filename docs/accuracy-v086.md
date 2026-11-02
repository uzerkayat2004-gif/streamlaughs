# StreamLaughs v0.8.6 — speech is not laughter

## Diagnosis

The corrected report concerned the owner's ordinary talking and room sounds, not a laughing streamer. The previous DSP fallback could emit a laugh on its own. Its 3–7 Hz voiced pulse rhythm also describes normal syllables. A red pipeline regression generated **four false laughs in eight seconds** even while the classifier explicitly reported **speech 0.95, laughter 0.01**.

The independent recorded-input baseline used the extracted v0.8.5 ZIP, a fresh profile and the real microphone/worklet/worker path. **Sixty seconds of recorded human speech, with no laughter, produced 11 laughs and 11 DSP hits.** It also promoted “really” and “way” through a common-word fallback. This is controlled evidence for the DSP-only cause, not a claim that the owner's 54 individual events were retrospectively logged.

v0.8.6 removes independent DSP counting. Classifier-only laughter cannot count either. Both must agree on a near-mic candidate, and laughter must beat the classifier's speech score. Actual positive recording windows scored around 0.20–0.26, below the old standalone classifier threshold of 0.5. Final quantized positive windows included laughter 0.19921875 / speech 0.08203125, so the normal combined cutoff is 0.19 with a 0.10 speech margin; a targeted boundary regression keeps the rhythm requirement. The combined threshold is calibrated against positive and negative fixtures rather than keeping a threshold that suppresses all positives.

## Local gates

| profile | laughter score | laughter minus speech | raw level above floor | minimum raw RMS |
| --- | ---: | ---: | ---: | ---: |
| strict | 0.24 | 0.15 | 14 dB | 0.006 |
| normal (default) | 0.19 | 0.10 | 10 dB | 0.004 |
| sensitive | 0.18 | 0.10 | 8 dB | 0.002 |

Every counted laugh also requires sustained voiced pulse rhythm at roughly **3–8 Hz over at least 600 ms**. Qualified evidence within **2.5 seconds** belongs to the same episode; there is also a **3-second cooldown** after a count. Ongoing evidence does not produce repeated counts simply because a cooldown elapsed.

The first three seconds of incoming inference audio calibrate **raw, pre-AGC** room/speaker levels. The panel and a small launcher hint say “stay quiet for 3 sec.” The calibrated floor adapts slowly on quiet, non-voiced frames (roughly 200-second time constant) and never falls below 80% of its initial reference in that session. A final-ZIP fixture caught the earlier 20-second decay forgetting the speaker floor: about 0.0050 became 0.0028 and admitted one background laugh. This is fixed rather than raising laugh thresholds blindly. Background calibration at or above 0.004 raw RMS selects the strict acoustic level (the speaker fixture measured about 0.0055; its 10.1 dB background peak passes normal but fails strict’s 14 dB gate) for that session and displays the earphones tip. Automatic background protection tightens the level gate; the chosen classifier sensitivity is retained, so a valid close laugh is not penalized twice. Raw level and relative high-frequency energy act as a conservative near-source proxy; a strong level rise can retain a close voiced vowel with little high-frequency energy. This does **not** identify speakers, measure physical distance, prove a room's direct-to-reverberant ratio, or guarantee that a suddenly louder speaker cannot pass. The primary fix is speech-versus-laughter agreement. Bluetooth/Windows device behavior still needs hardware testing.

Words use VAD speech segments and the same raw-level/near-source gate. Default classifier evidence must also have speech ≥0.35 and speech minus laughter ≥0.1. That numeric evidence stays with pending speech jobs even when a slow result outlives rolling history. Explicit classifier-off lab comparisons can isolate VAD/Whisper. Short pre/post roll retains consonants clipped by VAD boundaries; the two synthetic “bro” controls were otherwise truncated or misrecognized. Whisper decoding reads the actual raw decoder logits before forced/suppressed-token processing. The first SOT-step posterior for the bundled English model's no-speech token supplies `noSpeechProbability`; the mean selected text-token plus end-of-text log probability supplies `avgLogprob` (excluding forced prompt/language tokens; EOS is included as in Whisper’s utterance average). The 20-second export’s real fake-mic bro boundary measured −0.826 with no-speech 0.00018; the −0.9 gate retains it while rejected short-context controls remained below −1.16. These are measured probabilities, not scores invented from text or RMS. Missing confidence fails closed; average logprob must be at least **−0.9**, and no-speech probability at most **0.5**.

Only normalized whole words/phrases on the reaction list count. The common-word fallback is removed. “what”, “good”, “great”, “nice”, “funny” and “amazing”, “love”, “laugh”, “laughs”, “yes” and “wait” must form the entire reaction or a repetition; a sentence containing filler “what” does not count it. Known hallucination phrases, music markers and repeated loops are dropped. Debug preview records rejected tokens and reasons. Existing behavior already chooses a most-used reaction only after two uses; otherwise it shows the latest. The final word fixture explicitly verifies bro twice, no way once, and bro in the panel.

## Diagnostics, privacy and correction

Alt+Shift+D opens the local panel. If the OS/player intercepts it, use **popup → gear → hold Shift and click the version number**. Both views show the latest 20 accuracy decisions: detector provenance, laughter/speech/DSP evidence, duration, raw level above floor, and word confidence/rejection data. The debug-only speech preview keeps at most 20 text records in RAM while the view is active and clears on expiry, pause/stop or model disable. Closing the view stops its keepalive. **Copied reports never include transcripts. Audio is never written, logged or uploaded.**

Tapping the laugh count removes the last laugh (“not me”). The five-second toast can restore it. Session checkpoints and the eventual recap use the corrected count, intensity/lag totals and best moment. Later reactions and words survive a correction. Expired restores are ignored. Optional numeric event metadata is backwards compatible; no database, storage, token issuer or socket ID is renamed.

Native Twitch playback, independent microphone startup, interrupted/suspended-context recovery, the v0.8.5 speech-job fix, device selection, mic constraints and the 16 kHz worklet remain. No new permission or automatic tab capture is introduced. The public key/fixed unpacked identity is unchanged.

## Release proof

`pnpm test:accuracy` runs only the requested recorded-input regressions, not the website/e2e runner. Set `AUDIO_PROBE_BUILD` to the extracted final website ZIP and `ACCURACY_REPORT_DIR` for its numeric evidence. Each case gets a fresh Chromium profile and a real `getUserMedia` fake microphone using the labelled WAV. It exercises the actual offscreen owner, worklet, all local workers and visible Twitch panel. No model/frame injection, lab toggles or autoplay bypass. Production crowd requests/sockets are blocked; sharing is off.

The gate covers 60 s ordinary human speech, 30 s keyboard/click/cough/sneeze/breath/creak noise, speech with exactly three laughs, 60 s speaker-like bleed, bleed with exactly three near laughs, bro ×2/no way ×1 with bro most-used, and the existing human laugh/“let's go” WAV. The mixed-speech case also tests click-to-remove, restoration during the toast, expiry after five seconds and a corrected Dexie recap. Negative cases require zero laughs and zero words. Every input has an eight-second calibration prelude and a quiet tail, including the existing WAV, whose original PCM remains intact inside a silence-padded wrapper. This models the required quiet calibration; the unpadded clip starts with voice and is retained as the source.

See [verification-v086.txt](verification-v086.txt) for exact results and [fixture sources, transformations and limits](../tests/fixtures/audio/accuracy/README.md). Recorded speech/laughter/cough/sneeze are attributed; bro/no way are synthetic controls and the remaining room noises are generated approximations. This is a regression set, not a general accuracy benchmark or physical Bluetooth acceptance.

## Owner update and hardware check

Stop recording, open `/install#manual` and download `/download/zip`, extract and replace **all files in the same installed folder**, click **Reload** at `chrome://extensions`, then **refresh Twitch**. **Never click Remove.** Confirm v0.8.6, normal sensitivity and tab capture off. Existing recaps/settings remain in browser storage.

1. **Speakers, silent viewer, five minutes:** leave the live stream at ordinary volume, stay quiet for calibration and then remain silent. Expect about zero personal laughs/words. A loud background may show the earphones tip and strict level.
2. **Ordinary talking, five minutes:** after quiet calibration, talk normally without laughing. Expect about zero laughs; only reaction words actually spoken should count. Check candidate rejection reasons if anything false counts.
3. **About five real laughs:** repeat with five deliberate, separated laugh episodes (leave roughly five seconds between episodes). Say bro twice and no way once. Confirm the panel reacts and chooses bro. Tap a false laugh to try “not me”; try Undo within five seconds, then save and inspect the recap.

If results differ, copy the numeric report and note speakers/headphones, selected input, sensitivity and whether calibration was quiet. Transcripts can be inspected locally without sharing them. No store submission, tag, release or Cloudflare deployment is part of this pass.
