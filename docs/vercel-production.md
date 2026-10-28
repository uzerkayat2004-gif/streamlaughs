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

These crowd/backend values remain unset:

- `WORKER_API_URL`: the actual HTTPS crowd Worker origin.
- `WORKER_OWNER_KEY`: independent random owner-token HMAC key of at least 32 bytes, matching the Worker; server-only.

Register exactly `https://streamlaughs.vercel.app/auth/callback` in the Twitch console. Public pages, `/for-streamers` (also available at `/streamers`), the labelled `/demo`, and `/version.json` do not require credentials. Streamer login depends only on the three Twitch/session values. A signed-in owner can open their dashboard while the crowd backend is unconfigured; live and past views explain that crowd setup is pending and make no Worker requests. The owner-only history API returns a clean setup-pending 503, while another channel remains forbidden. Redeploy after changing production environment variables.

Both Chrome and Edge Install buttons point to https://github.com/uzerkayat2004-gif/streamlaughs/releases/latest. That destination becomes downloadable after the owner publishes a release; website deployment creates no tags or releases. Cloudflare provisioning and live crowd deployment remain separate.

Validation: ten website unit tests, website typecheck and optimized production build pass. Route tests preserve owner rejection and verify that an authenticated owner receives setup-pending status without calling a Worker. The live deployment is checked separately; real Twitch authorization requires the owner to sign in in the visible test browser, without sharing credentials in chat.
