# StreamLaughs v0.8.1 urgent fixes

## Part 1: popup watch context

Confirmed regressions: the matcher only accepted www.twitch.tv, and the popup read only tabs.query URL metadata. It did not ask a content script or recover a receiver missing on a pre-install/update tab. The manifest already included tabs; missing tabs permission was not the identified defect. Targeted red command: `pnpm --dir apps/extension exec vitest run src/watch-context.test.ts` — six failures, ten passes before the fix.

Fixed HTTPS www/bare/mobile channel matching, content-script context replies computed from the current SPA URL, targeted reinjection and requery, and VOD owner resolution from the video owner header (never recommendations). A recognized replay without its owner ready asks for a refresh instead of falsely calling it a non-Twitch page. Host access is limited to the three Twitch hosts. Recording start/lifecycle and the overlay use the same context. Existing session/DB/protocol IDs remain unchanged. The exact failing real-user tab URL was not supplied; the new path covers the reproducible gaps rather than claiming every user environment was reproduced.
