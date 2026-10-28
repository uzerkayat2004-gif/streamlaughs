# Night Crowd website

Next.js App Router + TypeScript + Tailwind, with bundled local fonts. Run `pnpm --filter web dev` from repo root. Public pages and the recorded, clearly labelled `/demo` require no credentials. See [env and exact Twitch redirect URLs](../../docs/deploy-part5.md), [manual acceptance](../../docs/manual-part5.md) and [fixed identity](../../docs/extension-identity.md).

Defaults are SITE_URL=https://streamlaughs.vercel.app, RELEASE_REPO_OWNER=uzerkayat2004-gif and RELEASE_REPO_NAME=streamlaughs; all remain env-configurable. Public name, tagline, wordmark and metadata derive from product.config.json. For local OAuth, explicitly use SITE_URL=http://localhost:3000. The public-only Vercel configuration, GitHub auto-deploy settings and five intentionally missing streamer/backend values are in [the production handoff](../../docs/vercel-production.md). The first extension release is not published. No analytics or remote fonts are used.

Twitch code/state exchange and encrypted HttpOnly cookie handling are server-only. No email/resource scope is requested. Every owner page/API validates the Twitch identity and exact channel login before signing a short-lived Worker read token. Archive lookup uses server-side app credentials. The dashboard's live adapter is receive-only and preserves the server's three-contributor floor.

Deploy target: Vercel, Root Directory apps/web, with outside-root source access enabled. Config is in vercel.json; secrets remain in Vercel env, never NEXT_PUBLIC values. No account, app registration or deployment was created. Automated OAuth uses a separate localhost-only mock provider, which production ignores; real Twitch consent/VOD alignment remain manual.

The website browser suite starts its own Next dev server, mock Twitch provider and local Wrangler, and precompiles routes before reporting readiness. Ports 3000, 4191, 4192 and 8787 must be free. Use `pnpm test:e2e:web` after the site-test extension build described in the main README. Optional `WEB_TEST_DIAGNOSTICS=1` logs navigation paths and test clicks, with OAuth query values omitted. It never enables production mock authentication.
