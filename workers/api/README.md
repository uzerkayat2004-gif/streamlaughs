# Crowd Worker

Hono edge routes + one SQLite Durable Object per validated lowercase Twitch channel. Local development needs no account/login. Follow [setup and first-deploy commands](../../docs/crowd-setup.md), [API](../../docs/crowd-api.md), [threat model](../../docs/crowd-threat-model.md) and [manual checks](../../docs/manual-part4.md).

`pnpm --filter api dev` runs local Wrangler; `pnpm --filter api test` runs actual Miniflare Workers/WebSocket/SQLite/hibernation tests. `pnpm --filter api build` is a local Wrangler dry-run bundle, not a deployment. Production defaults disabled, with test traffic disabled and the fixed unpacked extension origin configured; add your exact SITE_ORIGINS when chosen. Part 5 owner reads use short-lived channel-bound signatures, not the retired read secret. Follow [current setup](../../docs/deploy-part5.md). No cloud deployment has been performed.
