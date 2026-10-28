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

The following remain unset until the owner completes streamer/backend setup:

- `TWITCH_CLIENT_ID`: Twitch application's client ID.
- `TWITCH_CLIENT_SECRET`: Twitch application's secret; server-only.
- `SESSION_SECRET`: independent random session-encryption secret of at least 32 bytes; server-only.
- `WORKER_API_URL`: the actual HTTPS crowd Worker origin.
- `WORKER_OWNER_KEY`: independent random owner-token HMAC key of at least 32 bytes, matching the Worker; server-only.

Register exactly `https://streamlaughs.vercel.app/auth/callback` in the Twitch console later. Public pages, `/for-streamers` (also available at `/streamers`), the labelled `/demo`, and `/version.json` need none of these five values. Streamer login stays disabled with a friendly setup message until all five are valid. `/auth/login` then redirects to that message without setting an auth cookie. Redeploy after filling in the missing values.

Both Chrome and Edge Install buttons point to https://github.com/uzerkayat2004-gif/streamlaughs/releases/latest. That destination becomes downloadable after the owner publishes a release; website deployment creates no tags or releases. Cloudflare provisioning and live crowd deployment remain separate.

Validation: eight website unit tests, website typecheck and optimized production build pass. The live deployment is checked separately for all six requested routes, the two browser download links, unconfigured login, demo moment cards and mobile layout.
