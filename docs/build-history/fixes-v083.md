# StreamLaughs v0.8.3

## Causes and changes

**Popup box/flicker:** v0.8.2 introduced a second global `@keyframes calm-breath` for the on-stream dot. It overrode the popup animation and put a pulsing shadow on the smiley's rectangular wrapper. The dot now has its own animation name. The popup wrapper is transparent with no shadow/filter; the SVG uses separate transform-only jelly idle/jiggle and eye-blink animations, disabled for reduced motion.

**Toolbar square:** v0.8.2 cleared only the global badge default. Chrome supports tab-specific badge and icon overrides, which that call does not reset. Startup, install, update and worker reload now clear the global and every existing tab's badge and restore the clean toolbar icon. No badge-background setter remains. Dedicated transparent circular toolbar PNGs replace the rounded-square toolbar artwork; the main product icon remains unchanged. A seeded per-tab override regression checks the reset. This identifies and fixes the app-controlled paths; it does not claim to hide browser-owned privacy indicators.

**Words and delayed updates:** the requested comparison with `57786cd` showed unchanged mic constraints, worklet, VAD/DSP thresholds, model cadence and echo guard. It exposed an incompatible v0.8.2 addition: safe word events allow 80 characters, while the new word-timing and funniest-word fields allowed only 40. A valid longer label made `SnapshotSchema` reject the entire session update, including subsequent laugh updates. The regression reproduces this and the limits now agree. The baseline real-model WAV did recognize English speech, so a universal Whisper outage was not reproduced.

The matcher rejected some capitalized or stretched reactions as possible names and split phrases containing stopwords, such as “oh my god”. It now normalizes case, punctuation and known stretched spellings, matches complete reactions once, and includes a bounded local positive/neutral Hinglish vocabulary. Private names and slurs remain excluded; unknown words are rejected rather than converted into saved text. Masked-swear handling remains separate. Network crowd vocabulary is unchanged: these additions do not require or trigger a Worker deployment.

Positive events previously waited for the worker's 250ms status report and were sent behind a health update. They now flush immediately and arrive before periodic health. No detector confidence/energy thresholds, DSP pulse rules, model cadence or mic settings were lowered. The panel shows the latest word until a label has occurred twice, then the most frequent label over the whole session.

The Alt+Shift+D panel shows segments sent, transcripts returned, matched/rejected counts and measured confirmed-frame-to-panel latency. Full text is requested only while the debug panel is open, remains in expiring RAM, and is excluded from snapshots, event batches, copied reports and logs. Closing the panel expires the preview; audio is never saved or sent.

## Replays and clips

VOD and clip sessions are personal only. Owner links in the video/clip header are preferred, followed by author/creator metadata. The popup refreshes its context across SPA changes. If no owner is available, a bounded “who are you watching?” input offers Start. It trims/lowercases the login, removes unsupported characters and limits it to 25 characters. Working replay pages never need a “refresh Twitch” instruction.

No crowd source is started and no reactions are forwarded to the Worker for replays, even if sharing is enabled for live sessions. Replay media position/rate/pause samples remain local and give laughs their playback positions across seeking, speed changes and pause. Embedded clip players report numeric playback position from the same watched tab; other frames do not create another overlay. History shows a replay tag; recap/PNG/public share captions say “watched a replay”. The share URL's bounded replay flag distinguishes a replay moment from elapsed watch duration.

`https://clips.twitch.tv/*` host access is added solely for clip context and playback position. No new browser API permission is added. Saved database/internal IDs and the fixed ZIP extension ID stay unchanged.

## UI details

The streamer-card hover rule used to override the newer palette background with a dark fill, leaving dark text unreadable. Hover and keyboard focus retain the palette/content and add only lift/scale/shadow; focus has an explicit visible outline. Sparse share PNGs use a larger number and larger balanced chips. Avatar circles use the brand palette with a white outlined initial or cached clipped photo; olive/brown fills are removed.

## Verification and limits

Only targeted tests, typecheck, builds and isolated production UI captures are used. `pnpm test:reactions` runs the bundled recorded-human laugh/speech WAV through the actual local VAD, YAMNet and Whisper workers. It checks at least one laugh and one word, plus confirmed-frame delivery below 500ms and completed-speech-segment delivery below 3 seconds. It prints numeric results only. Run this timing check separately from builds/tests and other heavy CPU work.

These are delivery timings, not first-acoustic-onset guarantees: the unchanged DSP rule requires at least 500ms of evidence, and speech needs an utterance/segment plus local inference. One initial timing run exceeded the speech target; isolated verification results are in verification-v083.txt. Cold startup or a busy laptop can still exceed the targets. This release does not claim new real-hardware or Hinglish ASR accuracy beyond the fixture and matcher tests.

## Short owner check

1. Replace every file in the **same installed folder**, reload at `chrome://extensions`, then refresh Twitch. **Never Remove** the extension.
2. Open a VOD, then a clip. Check automatic owner detection. With missing owner metadata, enter the channel and Start. Seek to a known position, laugh, stop, and check that the moment uses replay time, with a replay tag and no fans row.
3. Say “bro”, “no way”, “oh my god” and your usual Hinglish reactions. Open Alt+Shift+D to distinguish no speech segments, slow/erroring Whisper, rejected words and delivered words. Full text appears there only while open. Check latest-word behavior, then repeat one label twice.
4. Check the transparent jelly smiley, blink and reduced-motion setting; hover/focus My Streamers cards; check a share PNG with one/two facts. The toolbar should show only the clean smiley. Browser-owned recording/privacy indicators remain controlled by the browser.

No Cloudflare deployment, store upload, tag or GitHub release is performed.
