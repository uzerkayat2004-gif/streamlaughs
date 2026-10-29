# Technical guide · Parts 1–5 foundations

Current release preparation and canonical final acceptance: [Part 6 release guide](release-part6.md) and [30-minute checklist](manual-part6.md). The following preserves the implementation and privacy detail from Part 5.

# streamlaughs · Part 5

Chrome/Edge MV3 extension for Twitch. Personal reactions use **bundled local models**; the crowd uses **Hono + SQLite Durable Objects + hibernatable WebSockets**. Server-side floors, approved phrases, anonymous sessions and 30-day minute aggregates are implemented. The UI, stores, Dexie checkpoints and audio lifecycle remain. **Nothing has been deployed.** Prebuilt release extensions have no API URL and show offline until rebuilt with yours; they never substitute simulated numbers.

Part 5 adds the Night Crowd **Next.js App Router website**, Twitch-owner dashboard and fixed unpacked identity. Part 12 adds hourly version checks and in-extension ZIP update instructions. The unpacked Chrome/Edge ID is **`fkocldgggcmhihelohiicoakcfomhepg`**. Every build contains its public key; the private key stays outside the checkout in `C:\Users\Asus\Documents\StreamLaughs-keys` (configured with `EXTENSION_KEY_PATH`) and never enters a release archive. [Identity, backups and store migration](extension-identity.md).

Start with [Part 5 setup/deployment](deploy-part5.md), [manual acceptance](manual-part5.md), [plan](plan-part5.md) and [verification](verification-part5.txt). Product name/version have one source, `product.config.json`. Set `SITE_URL=https://streamlaughs.vercel.app`, `RELEASE_REPO_OWNER=uzerkayat2004-gif`, and `RELEASE_REPO_NAME=streamlaughs`. These are the selected defaults, not proof of publication. No repository, website domain, Twitch app or account has been created. Offline preview ZIPs explicitly disable service connections.

## Install and build

Node 22.12+ and pnpm 10.33.2; tested on Windows with Node 24.

```powershell
pnpm i
pnpm -r typecheck
pnpm -r test
pnpm --filter extension build
pnpm --filter extension build:debug
pnpm --filter web build
# Local website, including the public recorded /demo:
pnpm --filter web dev
```

Load `apps/extension/.output/chrome-mv3` through **chrome://extensions → Developer mode → Load unpacked**, then pin the icon. The release includes local models/runtimes. To restore missing model files, run `python tools/fetch-models.py` once at build time. Builds copy WASM from pinned npm packages and verify SHA-256 receipts; partial or changed downloads fail the build.

For Edge, `pnpm --filter extension build:edge`, then load `.output/edge-mv3` through `edge://extensions`. Disable other StreamLaughs copies and refresh Twitch after changing builds. Edge is build-checked; physical Edge audio/device behavior needs the manual checks.

Welcome's **allow mic** gets permission once and stops its temporary tracks. On a Twitch channel, press popup **start** or **Alt+Shift+L**. Missing permission opens Welcome at the mic step; return to Twitch and Start after allowing it. Models load lazily with **warming up…**. Saved simulated recaps stay labelled legacy; an active Part 2 session migrates to fresh personal counts so old fake laughs cannot become real data.

## Privacy

**Audio is processed on your PC and never saved or sent.** Audio, transcripts and model calls never go to a server. The extension records no audio files and has no MediaRecorder or analytics. Sharing is off for a fresh install; existing explicit preferences remain. Sharing sends one tiny count packet every two seconds: laughing/intensity, bounded scream/gasp/hype counts, one numeric masked-swear count and up to three phrases from an exact crowd allowlist. Personal phrase history is never uploaded. The server validates the same shared rules again.

**Watch only sends zero application WebSocket messages, but is not invisible:** the session POST and socket handshake tell the server “someone is viewing channel X from this connection.” Cloudflare necessarily sees source IPs, headers and timing. The crowd app does not read or persist IPs, install IDs or Twitch viewer identities, and does not log tokens or request bodies. Signed tokens are verified in RAM. Two-hour HMAC tokens use fresh random IDs for each watch session, live only in RAM and never appear in URLs. This avoids persistent application identifiers; it cannot promise network-level unlinkability or verified unique humans. Anonymous clients can mint multiple identities. [Full boundaries and abuse cases](crowd-threat-model.md).

Live windows and rate maps stay in server memory. Hibernation attachments retain only ephemeral connection metadata (ID/channel/mode/expiry/test flag), which Cloudflare may persist while the socket sleeps; never signed tokens or contributions. SQLite stores only minute aggregates with at least three contributors and independently floored approved phrases. Automatic alarms delete them after 30 days; reads also exclude expired rows. No per-viewer database rows exist. Deleting browser data removes local sessions/preferences; it cannot subtract a contribution from an already aggregated server minute.

Raw PCM moves only through private worklet/offscreen ports and local realtime/speech-worker messages. It never enters runtime messages, chrome.storage, Dexie or logs. Frame-hub rings retain at most 30 seconds per input in RAM. Worker audio windows/queues are bounded; Whisper text is counted in RAM and discarded. The optional dev transcript is redacted, bounded to 1,000 characters, held only in worker/offscreen/debug-page RAM, and cleared when inference ends.

Background receives strict zod-validated numeric health, reaction events and approved 1–3-word labels. It saves counts, timestamps, intensity/lag aggregates, masked swear labels and approved phrases. **Approved phrase labels are saved; complete transcripts are not.** Known names and blocked terms are removed, and swears are masked before crossing the worker boundary. This conservative local filter cannot recognize every possible name or abusive spelling. Vocabulary lives in `packages/shared/src/privacy.ts` and is also enforced by receiving schemas.

CSP adds only the configured HTTP(S)/WS(S) API origin and SITE_URL to `connect-src 'self'`; `worker-src 'self'` remains. Models, tokenizers, JS and WASM load from the installed extension only, enforced by a separate model-worker fetch guard even with those public origins configured. Transformers remote loading and browser/filesystem model caches are disabled. `'wasm-unsafe-eval'` is required to compile ONNX Runtime/MediaPipe WASM under MV3. JavaScript `'unsafe-eval'`, blob workers and CDNs remain disallowed. Python model downloads happen at build time, independently of the installed extension.

Tests prohibit processing-module persistence/network/logging sinks and reject PCM, transcript fields, unmasked swears, known names and blocked labels at runtime boundaries. A worker fetch guard permits only bundled model/runtime GETs, rejects bodies/remote hosts and keeps a bounded dev asset audit for browser verification. These controls describe application behavior, not OS paging/browser internals.

Parts 3–5 add no extension permissions or extra host permissions. Exact fixed-extension/site CORS and WebSocket Origin checks allow the configured public origins. The fixed public key identifies the product, not a personal install or trusted client. Part 2 added only:

| Permission   | Purpose                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `tabCapture` | Get an ephemeral watched-tab stream ID after toolbar/shortcut invocation; never save/log it.                                   |
| `offscreen`  | Keep one audio owner alive after popup closure and service-worker restarts. `USER_MEDIA` covers the live graph and tab replay. |

Existing storage, tabs and Twitch-only host permissions remain. Mic consent is ordinary getUserMedia permission on the extension origin; no desktop, debugger or extra host permission is requested.

Part 12 adds **downloads** to save and monitor the user-requested, checksum-verified update ZIP. Application code queries only that download ID. It adds no extra host permission. [Update lifecycle and privacy](popup-updates-part12.md).

## Website privacy and updates

The website has no analytics, trackers or microphone access; its fonts are local. Public visitors and `/demo` get no app cookie. Streamer login uses one encrypted HttpOnly, SameSite=Lax cookie for pending OAuth state/session, with Secure and a __Host prefix on HTTPS. Twitch access tokens/client secrets and Worker owner signing keys stay server-only; the browser receives only approved aggregate stories and a public watch endpoint. Identity is validated on every authenticated request and exact Twitch login must equal the requested channel. No email/resource scopes or viewer database are used. Vercel/Twitch/Cloudflare still see network metadata. [Auth and env details](deploy-part5.md).

The extension checks SITE_URL/version.json with credentials omitted on popup open/background wake, cached for at most one hour, including failed checks. It sends no channel, install identifier or version query. A newer version replaces the idle button; later dismisses for the browser session, while active recordings retain their controls and show only a gear dot. Clicking update opens the extension's own page, refreshes metadata and downloads/checks the same-site ZIP before saving via chrome.downloads. Users copy files into the existing folder; finish update saves/stops any session and reloads without deleting storage. The reloaded page and next popup report success or wrong-folder help. Without SITE_URL configured, no version request occurs. Runtime inference retains its separate model-only network guard.

## Models and pipeline

| Model              | Bundled source                                                                                                                        | License                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Silero VAD v5.1.2  | [official ONNX](https://github.com/snakers4/silero-vad/blob/v5.1.2/src/silero_vad/data/silero_vad.onnx)                               | [MIT](https://github.com/snakers4/silero-vad/blob/v5.1.2/LICENSE)                                                                                |
| YAMNet             | [Google MediaPipe float32/1 TFLite](https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite)  | [Apache 2.0](https://github.com/tensorflow/models/blob/master/LICENSE)                                                                           |
| Whisper tiny.en q8 | [pinned ONNX Community revision](https://huggingface.co/onnx-community/whisper-tiny.en/tree/2575352d61be1bf7225cf8f8b268a4678025fc58) | [base model Apache 2.0](https://huggingface.co/openai/whisper-tiny.en), [original code MIT](https://github.com/openai/whisper/blob/main/LICENSE) |

Sources, sizes and SHA-256 receipts are in `public/models/model-files.json`; full notices are in `models/licenses/`. The receipt filename leaves only the root extension manifest.json in packages, as required by Edge Add-ons. MediaPipe Tasks Audio works in the MV3 **classic worker**, using its local importScripts/WASM loader; no replacement model was needed.

The offscreen owner subscribes to `AudioFrameHub` and owns separate realtime (VAD/YAMNet) and speech (Whisper) workers, so decoding cannot block live frame acknowledgments. Worklets downmix/resample to 16 kHz mono, 320 samples/20 ms. Tab audio independently connects to speakers, including during pause/mic loss. The mic is never played aloud. Mic constraints live in `src/audio/config.ts`: echoCancellation true, noiseSuppression false, autoGainControl false.

- Silero consumes 512 new samples plus its required 64-sample context and recurrent state. Speech segments: minimum 250 ms, merge gaps under 300 ms, split at 8 s.
- YAMNet processes 15,600-sample windows every 250 ms on mic **and tab**. Laughs require ≥0.5 on two consecutive processed hops and a 1.5 s cooldown. A score miss or a gap over 750 ms resets consecutiveness. Screams, gasps and hype have independent gates.
- Mic events are rejected only when the last 1.5 s of RMS envelopes correlate strongly at a 0–400 ms positive mic lag **and** a fresh tab score matches the same class at similar/higher strength **and** the unamplified raw waveforms match strongly. Rejection applies to the candidate segment, never the entire mic input. Silence/constant envelopes are not evidence of correlation. Headphones-likely needs repeated low correlations and is only a heuristic.
- Whisper tiny.en q8 receives qualifying mic VAD segments only. One transcription runs at a time; at most two pending segments, oldest dropped/wiped. Correlated stream speech is rejected before transcription. Production uses WASM for Whisper, based on measured slow WebGPU decoding on the target Windows laptop. The evaluation harness can still compare WebGPU. Silero/YAMNet remain CPU/WASM, so WebGPU status reads `mixed`. Initial GPU kernel warmup is included in warming; a generation deadline can stop slow transcription between decoder tokens. A single backend kernel cannot be preempted except by terminating its worker.
- Normalization, stopwords, 1–3-grams, local hype phrases, short loud speech and masked swears produce typed events. No fake personal generator remains in production. Recaps use personal counts/phrases, strongest laugh and real style rules. Delayed-cackler style requires two valid lag observations. Production crowd data uses the real anonymous backend; simulator traffic and the recorded website demo remain explicitly labelled test.

All thresholds, cooldowns, bounds, preferred backend and correlation/loudness/low-power settings are centralized in **`src/inference/config.ts`**. Default `preferredBackend: 'wasm'` keeps production speech decoding predictable. A bounded speech decode failure is reported without blocking reactions. Mic DC removal, bounded gain, envelope release, noise floor and constraints live in `src/audio/config.ts`; raw capture/echo buffers stay unchanged. Model sessions are reused throughout an active processing epoch. Pause/micLost terminates both workers to cancel in-flight inference completely; resume/retry warms a new epoch. This releases models on pause instead of retaining uninterruptible computation.

## Lifecycle and memory

Only popup/shortcut gestures start real tab capture. Starting another channel saves/stops the first. Watched-tab close, channel change, leaving Twitch and tab-track end finalize once; switching active tabs does not. Mic loss preserves crowd and tab replay, shows **mic lost · tap to retry**, and reacquires only the mic. A hardware mute driver that supplies ordinary silence cannot reliably be distinguished from a quiet room.

Pause retains tracks/replay but stops processing/inference. Stop closes all tracks, AudioContext, models, both workers and offscreen document. Listening off opens neither input; toggling it off releases both inputs while keeping the crowd session. Re-enabling needs a fresh **start audio** click. Service-worker restart adopts the living offscreen owner and inference workers without another media grant/model load; owner nonces reject stale reports.

Bounds: private transport 8 frames; VAD 32 chunks; sound work one latest window per source; speech two pending eight-second segments. Drops are counted; timestamp gaps clear stale audio windows/VAD context. Worker rings cap at 10 s mic/2 s tab; frame-hub rings at 30 s each. Labels cap at 256, masked labels 64, laugh history 4,096, debug decisions 40; running totals cover the whole session. Model/backend allocations are larger than PCM buffers and need physical soak testing.

If inference time per processed audio second exceeds 1, loss persists over a second, or a large frame batch is lost, Whisper pauses first; VAD/sound classification continue. Isolated losses remain visible without disabling words. After 20 healthy seconds below 0.65 RTF, words may resume. A transcription error discards that segment without ending laughs/crowd. Popup shows **low power · words paused** when applicable; safe model/error details are also available in hidden production diagnostics.

## Debug, evaluation and verification

Build debug, load `.output/chrome-mv3-audio-debug`, then open `chrome-extension://YOUR_ID/debug.html`. Production keeps the development debug screen/commands disabled, but includes the safe hidden diagnostics view: popup gear → Shift-click version. Its copy report excludes audio/transcripts. See [the microphone investigation and retest](microphone-part11.md). Debug shows both audio meters/FPS, drops/worklet timing, VAD, live scores, bounded decision reasons, headphones estimate, load/inference times, queues, RTF/low-power and optional redacted transcript. No raw-audio endpoint exists.

**test microphone** uses real mic/worklet/models without saving a session. Playwright uses a debug-page-only `DEBUG_MIC_START` with a Twitch fixture tab ID to exercise actual personal counts/UI; it bypasses only tabCapture authorization, never models or event rules. Before Playwright, build the production/debug/ui-test/crowd-test fixtures using [these exact steps](crowd-setup.md#reproduce-verification); crowd-test needs the localhost API build value. Its test starts and stops Wrangler and crowd-sim automatically.

```powershell
pnpm exec playwright install chromium
node tools/eval/cli.mjs tools/eval/fixtures
node tools/eval/cli.mjs eval/local
node tools/eval/cli.mjs tools/eval/fixtures --benchmark
node tools/eval/cli.mjs tools/eval/fixtures --benchmark --webgpu
$env:LAUGHLINE_TEST_WAV = 'C:\path\to\local-laugh-16k-mono.wav'
pnpm exec playwright test --trace off
```

The Node/Vitest harness runs the same bundled worker/pipeline in local Chromium, with no HTTP audio server or Playwright recording/tracing. Input: mono 16 kHz PCM16/Float32 WAV. `clip.labels.json` contains intervals such as `[{"start":1,"end":3,"label":"laugh"}]`. Labels: laugh, speech, scream, silence, stream-through-speakers, keyboard. Optional synchronized `clip.tab.wav` supplies tab audio. Precision/recall match each labelled bout once, allowing 0.5 s early/1 s late; repeat predictions in one bout count as extras. Undefined rates print null. Negative labels report false positives and observed minutes. Tiny fixtures are smoke checks, not an accuracy benchmark.

Generated silence/keyboard fixtures and a small, licensed recorded human laugh/speech regression WAV are committed; the latter lives only in `tests/fixtures/audio`, outside release builds. **eval/local/** is gitignored and excluded from archives. Use [the ten-minute recording guide](recording-guide.md). Positive Playwright defaults to the committed human laugh/speech fixture; `LAUGHLINE_TEST_WAV` optionally selects another local WAV. A missing selected fixture fails rather than silently skipping. Verification used a temporary [public-domain laugh recording by ezwa](https://commons.wikimedia.org/wiki/File:Laughter.ogg), resampled locally, outside the repo/archive. Synthetic laugh-like tones did not meet the actual threshold and were not used to fake a pass.

Optional reproduction with that public-domain recording, if ffmpeg is installed (download/setup only; never part of the installed extension):

```powershell
New-Item -ItemType Directory -Force eval/local
Invoke-WebRequest 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Laughter.ogg' -OutFile eval/local/laugh.ogg
ffmpeg -i eval/local/laugh.ogg -ac 1 -ar 16000 -c:a pcm_s16le eval/local/laugh.wav
pnpm exec playwright test --trace off
```

Original Part 1/2 tests remain, with new gate, contamination, privacy/masking, queue, low-power, worker teardown/retry, VAD segment and recap tests. Fake-media Playwright verifies real mic permission/capture and YAMNet count updates in dot/popup. **Fake flags do not establish genuine tabCapture grants, audible replay, speaker/AEC accuracy, hardware unplug or physical Edge behavior.** See [precise manual checks](manual-part3.md). A two-hour physical memory/accuracy soak is also manual; unit tests exercise bounded histories/overload, not a completed two-hour hardware run.

Real machine timings/package size: [benchmark record](benchmark-part3.md), with raw JSON alongside it. Final command output: `docs/verification-part3.txt`.

## Free-plan sizing · checked 2026-10-27

| Account resource             | Current Free allowance          |
| ---------------------------- | ------------------------------- |
| Workers HTTP requests        | 100,000/day                     |
| Workers CPU / memory         | 10 ms per HTTP request / 128 MB |
| Durable Object request units | 100,000/day                     |
| Durable Object duration      | 13,000 GB-s/day                 |
| SQLite reads / writes        | 5,000,000 / 100,000 rows/day    |
| SQLite storage               | 5 GB total                      |

Sources: [official Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [official Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/). Free supports SQLite-backed objects. Incoming socket messages bill at 20:1; outgoing messages are free. Alarms count as requests; setting alarms and deleting rows count as writes. Eligible hibernation avoids duration charges, while these operations remain metered. Quotas reset at 00:00 UTC; exceeding a free resource fails further operations of that type.

Planning estimate: 25 contributors for two hours send 90,000 messages, about 4,500 DO request units plus handshakes/alarms, and about 922 GB-s while continuously active (128 MB billing). The duration allowance is roughly 28 active channel-hours/day across the account, before overhead. This is a small pilot, not unlimited free scale. Minute-only writes, indexed retention, 200 sockets/channel and bounded RAM help; public anonymous issuance cannot guarantee a global quota cap. Active rooms tick at 1 Hz, including small crowds with recent contributions. Once recent windows and the unfinished eligible minute expire, watch-only rooms sleep between sparse 25-second server keepalives; empty rooms sleep until retention cleanup. [Hibernation behavior](https://developers.cloudflare.com/durable-objects/best-practices/websockets/). Cloud CPU/latency/quota measurements remain to be checked after your deployment.

## Website, dashboard and proposed Part 6

`apps/web` contains Home, Install (Chrome/Edge), Privacy, For streamers, `/version.json`, owner-only dashboard and recorded `/demo`. The dashboard reuses RealCrowdSource in watch-only mode. History supports seven/30 days, archive-based grouping or labelled approximate activity groups, glowing minute-peak waves, approved words and up to three separated moment cards. VOD links use server-side Helix archive created_at + duration; missing VODs retain time without a button. Test traffic stays marked. New server markers retain eligible words at the moment; old minute-only rows are labelled accordingly.

The Part 4 TIMELINE_READ_KEY is retired. Next validates Twitch identity/ownership, then signs a channel-bound 60-second token with WORKER_OWNER_KEY. Worker rechecks issuer/audience/channel/expiry; viewer tokens and old read secrets cannot fetch history. No read key reaches browser code. [Current API](crowd-api.md) and [threat model](crowd-threat-model.md).

`src/audio/` owns capture/DSP; `src/inference/` local models; `packages/shared/` contracts/product/owner-token helpers; `workers/api/` aggregate storage; `tools/crowd-sim/` test clients and demo capture; `tools/eval/` local model evaluation. FakeCrowdSource remains explicit test/ui-test only. Source archives contain Chrome/debug/Edge builds and local models, excluding private keys, env files, runtime databases and test-only builds.

New browser coverage runs separately so its local Worker doesn't conflict with the original suite:

```powershell
$env:SITE_URL = 'http://127.0.0.1:3000'
pnpm --filter extension build:test-site
Remove-Item Env:SITE_URL
pnpm exec playwright test --config playwright.web.config.ts
```

That suite starts local Next.js, a **localhost-only mock Twitch provider** using the genuine code/state/cookie flow, real Wrangler and real crowd-sim. It checks responsive pages, empty public cookie jar, recorded demo, live zero-send, actual minute persistence, VOD cards, owner isolation, logout, fixed ID after copying a folder, and real version metadata/update dot. Production ignores test-provider configuration. Real OAuth consent, hosted deployment and physical Edge/audio still require the manual checklist. Next CLI telemetry is disabled by the local wrapper; no analytics integration is included.

**Part 6 proposal:** polish accessibility, motion and real-device performance; apply the selected StreamLaughs product/repository/project names; prepare separate Chrome/Edge GitHub Release ZIPs, checksums and update instructions; review store-specific IDs/origins; write a short demo video script and Devpost submission text. Use real local demo aggregates with visible test labels and a manual real-stream acceptance pass. Publishing/deployment remains a separate explicit action; never include signing keys or OAuth secrets in an asset.

Browser references: [tab capture/replay](https://developer.chrome.com/docs/extensions/reference/api/tabCapture), [offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [Edge API support](https://learn.microsoft.com/microsoft-edge/extensions/developer-guide/api-support).
