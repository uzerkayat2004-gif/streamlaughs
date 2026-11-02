# StreamLaughs — see who's laughing with you

StreamLaughs is the final name, centralized in product.config.json. This is a submission draft, not a claim that links, a video or a hosted deployment already exist.

## Inspiration

A stream can make thousands of people laugh at once, yet watching alone still feels quiet. Chat tells you what people type. We wanted a small, playful way to feel the room react, without asking people to upload their voices.

## What it does

A Chrome/Edge extension adds a little crowd blob to Twitch. Bundled local models detect personal laughs, screams and short approved words. Optional sharing combines anonymous counts and allowlisted words into a live crowd view, with a three-contributor floor. Stop for a Wrapped-style personal recap. Streamers get their own aggregate dashboard, glowing laugh waves and moment cards with matching archive links when available. A clearly labelled recorded test-data demo needs no login.

## How we built it

We used Codex as the coding collaborator across six scoped prompts:

1. Monorepo + approved Night Crowd extension UI, fake data first.
2. Real tab/mic capture, replay, worklets, RAM buffers and lifecycle recovery.
3. On-device VAD, sound classification and speech-to-words with local model assets.
4. Real anonymous crowd backend: Hono, hibernatable WebSockets and SQLite Durable Objects.
5. Fixed unpacked ID, Next.js website, Twitch owner auth and aggregate/VOD stories.
6. Accessibility, bug bash, validated release ZIPs, workflow and submission material.

Codex read the design, implemented the code, wrote unit/Worker/browser tests, ran checks and documented corrections. The owner supplied requirements, selected the final name and controls provider accounts and performs real-device/provider acceptance. Audio processing stays in an offscreen document and local inference worker; only strict count/approved-word schemas cross the network boundary. Zustand/Dexie keep the extension UI and local recap lifecycle consistent.

## Challenges

Capturing tab audio without silencing playback. Recovering after service-worker restarts. Avoiding stream audio being mistaken for the viewer’s reaction. Keeping words safe without uploading transcripts. Enforcing small-crowd floors server-side. Binding streamer history to the validated Twitch owner. Stabilizing a ZIP install’s origin and handling missing or late VODs honestly.

## Accomplishments

The real local model/mic path, session recovery, anonymous live backend, fixed-ID ZIPs and owner-isolated dashboard work in local automated verification. Browser tests exercise genuine fake-device mic permissions, real local Wrangler + crowd-sim traffic, saved aggregate minutes, keyboard/touch controls and extracted ZIP identity. The app has no analytics and does not save or send audio. Simulator data stays visibly marked test.

## What we learned

Privacy needs boundaries in code, not just reassuring copy. A crowd is calmer and more trustworthy when “a few here” is a deliberate state. Small implementation details—tab replay, origin stability, focus, timing and an honest empty state—matter as much as the blob.

## What’s next

Complete the real Twitch/Edge/hardware acceptance pass, verify the configured public URLs, publish the verified ZIPs, and record the demo. Gather consented local evaluation clips to improve thresholds and measure accuracy; investigate store distribution with its own verified IDs. No unmeasured accuracy, unlimited free scaling, completed long soak or hosted production success is claimed.

## Built with

Codex · TypeScript · React · WXT · Chrome/Edge MV3 · Web Audio · AudioWorklet · ONNX Runtime Web · Silero VAD · YAMNet · MediaPipe · Whisper · Transformers.js · WebGPU/WASM · Zustand · Dexie · Hono · Cloudflare Workers · Durable Objects · SQLite · WebSockets · Next.js · Tailwind CSS · Twitch OAuth/Helix · Vercel · pnpm · Vitest · Playwright

## Fill in yourself before submitting

- **Video:** [VIDEO_URL — upload the final under-three-minute recording]
- **Repository:** `https://github.com/uzerkayat2004-gif/streamlaughs`
- **Website/demo:** `https://streamlaughs.vercel.app` and `/demo` (SITE_URL)
- **Codex session ID:** [CODEX_SESSION_ID — copy the actual session ID; not inferred or invented]

Then attach current screenshots and recheck each accomplishment against docs/verification-part6.txt and the signed-off manual checklist. Provider registration, tagging, releases and deployment were deliberately left to the owner.
