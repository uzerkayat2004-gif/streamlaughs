# Fan ratings on the website

The extension/Worker feature shipped first in `88e7990`. This follow-up changes the website presentation without changing detection, audio, `/try` or `extension-demo.*`.

- Home: “never laugh / alone again.”, draggable orbiting jelly chips, pointer-following eyes, laugh-on-click and an animated sample rating recap. The sample streamer card uses a consistent 7.8 average from 1,204 made-up fans.
- Streamers: three short rating steps, free access and clear Twitch identity-only sign-in copy. Login remains a full-page anchor.
- Dashboard: real owner-only rating aggregates, a selectable ten-stream line/dot trend and the five-fan locked state. No owner token or read key reaches the browser.
- Demo: clearly marked sample data, including a locked stream. Marketing/demo samples never post to the Worker.
- Privacy: microphone processing stays on device, tab capture is off by default, shared words come from the approved list, and rating replacement records expire after 48 hours. Ratings require an explicit send, independently of live reaction sharing.
- Install/download: browser-specific store buttons, with the ZIP under “Latest build (for testers and developers)”. `/download/zip` remains the direct binary endpoint. No GitHub release page is needed.

Store versions are separate from the latest tester build. On November 2, 2026, Google's public update check reported Chrome **0.6.4**; Microsoft's public product-details endpoint reported Edge **0.6.1**. Update `chromeStoreVersion` / `edgeStoreVersion` in `product.config.json` only after approval (the reminder is in `apps/web/lib/download.ts`). The README says listings are live and updates are rolling out; the site does not claim an unsubmitted tester build is in store review.

The palette remains yellow `#FFD23F`, coral `#FF5C5C`, teal `#2EE6C5`, near-black and white. Motion pauses in a hidden tab and respects reduced motion. Buttons and trend points work with the keyboard.

See [verification-v087-web.txt](verification-v087-web.txt) for targeted checks and their limits. The production Worker version remains `2f997792-0bf6-440b-880f-2008295d1d5c`.
