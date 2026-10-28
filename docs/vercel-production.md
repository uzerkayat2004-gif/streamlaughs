# Public website deployment

Production URL: https://streamlaughs.vercel.app. Vercel project: `streamlaughs`, connected to `uzerkayat2004-gif/streamlaughs` with production branch `main`. Pushes to main deploy production; this does not run the tag-only GitHub release workflow.

Root Directory is `apps/web`, with source files outside that directory included. Framework is Next.js, Node is `24.x`, install is `pnpm install --frozen-lockfile`, build is `pnpm --filter web build`, and output is `.next`. Corepack uses the root packageManager pin. Analytics and production feedback/toolbar are disabled.

Production non-secret variables:

```text
SITE_URL=https://streamlaughs.vercel.app
RELEASE_REPO_OWNER=uzerkayat2004-gif
RELEASE_REPO_NAME=streamlaughs
ENABLE_EXPERIMENTAL_COREPACK=1
NEXT_TELEMETRY_DISABLED=1
```

Twitch sign-in requires these three production values. The owner supplied both Twitch values; SESSION_SECRET was generated from 64 cryptographically random bytes and stored as a production-only sensitive variable, without displaying or saving its value locally:

- `TWITCH_CLIENT_ID`: Twitch application's client ID.
- `TWITCH_CLIENT_SECRET`: Twitch application's secret; server-only.
- `SESSION_SECRET`: independent random session-encryption secret of at least 32 bytes; server-only.

These crowd/backend values are configured in production as of Part 7:

- `WORKER_API_URL`: `https://streamlaughs-crowd.streamlaughs.workers.dev`.
- `WORKER_OWNER_KEY`: independent 64-random-byte owner-token HMAC key, matching the Cloudflare secret; a sensitive server-only variable.

Register exactly `https://streamlaughs.vercel.app/auth/callback` in the Twitch console. Public pages, `/for-streamers` (also available at `/streamers`), the labelled `/demo`, and `/version.json` do not require credentials. Streamer login depends only on the three Twitch/session values. A signed-in owner can open their dashboard while the crowd backend is unconfigured; live and past views explain that crowd setup is pending and make no Worker requests. The owner-only history API returns a clean setup-pending 503, while another channel remains forbidden. Redeploy after changing production environment variables.

The Install page now downloads directly from `/download`, a CDN rewrite to the generated `/downloads/streamlaughs.zip` attachment. The same Vercel build creates its versioned copy and SHA-256; `/version.json` reports the exact deployed bytes. No user-facing download goes through GitHub, and no tag, release or manual upload is required. The footer's source-code link is the only GitHub link in the website user flow. [Part 8 build and limits](website-downloads-part8.md). [Part 7](production-part7.md) records the connected Cloudflare deployment and safe simulator instructions.

Validation: 23 website tests, recursive typecheck/tests and all production builds pass. Route tests preserve owner rejection and the unconfigured fallback. The owner confirmed real Twitch login in their own Chrome. After the Worker env redeploy, the authenticated dashboard showed live “a few here” and successfully loaded empty history. No cookies were read; no account sign-in browser was automated. [Verification](verification-part7.txt).
