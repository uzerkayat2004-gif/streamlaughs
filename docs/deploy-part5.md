# Part 5 setup and deployment handoff

**Historical Part 5 handoff.** The owner subsequently authorized GitHub/Vercel publication and Part 7 Cloudflare deployment. Live services are now connected; use [current production instructions](production-part7.md) and [verification](verification-part7.txt). The sequence below remains useful for a fresh installation, not for regenerating the existing production secrets. Physical Twitch/audio and a multi-person session still need the manual checklist.

## Names and public configuration

Product name/version live in `product.config.json`; change the name there to update website/extension wordmarks, titles and visible branding. Internal package, storage, OAuth issuer and socket protocol names remain stable to preserve data compatibility.

| Value                | Local default / production template                                 |
| -------------------- | ------------------------------------------------------------------- |
| `SITE_URL`           | `http://localhost:3000` / `https://streamlaughs.vercel.app`         |
| `RELEASE_REPO_OWNER` | `uzerkayat2004-gif`                                                 |
| `RELEASE_REPO_NAME`  | `streamlaughs`                                                      |
| release page         | `https://github.com/uzerkayat2004-gif/streamlaughs/releases/latest` |
| extension origin     | `chrome-extension://fkocldgggcmhihelohiicoakcfomhepg`               |

`SITE_URL` is an origin, not a page path. It supplies OAuth redirects, site metadata, version responses and extension website links. HTTPS is required outside localhost. The website doesn't trust the incoming Host header to construct authentication redirects. Set the same SITE_URL when building the extension. Public environment changes require a rebuild/redeploy; never use NEXT_PUBLIC for secrets.

The chosen defaults are repository uzerkayat2004-gif/streamlaughs and site https://streamlaughs.vercel.app. They are configured destinations, not a claim that a repository, release or deployment exists. The install link opens Releases/latest once you publish. Overrides remain available; an explicitly empty RELEASE_REPO_NAME disables the link. Part 6 contains the prepared release workflow and handoff.

## Local website and real crowd

```powershell
pnpm install
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item workers/api/.dev.vars.example workers/api/.dev.vars.dev
# Edit those ignored files; keep real secrets out of source and shell arguments.
# For local OAuth, set SITE_URL=http://localhost:3000 in apps/web/.env.local.
pnpm --filter api dev
# Another terminal:
pnpm --filter web dev
```

Open http://localhost:3000. All public pages and `/demo` work without Twitch secrets. For real local login, register your own Twitch app as below and fill its local client ID/secret plus a strong SESSION_SECRET. Put the same strong WORKER_OWNER_KEY in both local files. The checked-in Worker example contains public local test keys only; never copy them into production. SITE_ORIGINS already lists localhost and 127.0.0.1 on port 3000; use exactly the SITE_URL hostname throughout login.

For anonymous viewer testing, build/load the extension with:

```powershell
$env:SITE_URL = 'http://localhost:3000'
$env:VITE_CROWD_API_URL = 'http://127.0.0.1:8787'
pnpm --filter extension build
pnpm --filter extension build:edge
Remove-Item Env:SITE_URL
Remove-Item Env:VITE_CROWD_API_URL
pnpm --filter crowd-sim start --channel YOUR_LOWERCASE_LOGIN --viewers 25 --script funny --origin chrome-extension://fkocldgggcmhihelohiicoakcfomhepg
```

Simulator viewers are test sessions, not people; the backend/UI mark them. Its wave script varies engagement across minutes. `/demo` uses the committed four-minute aggregate snapshot captured through actual local Wrangler and 25 crowd-sim clients; it never opens a live socket or claims real viewers. Regenerate locally with `pnpm --filter crowd-sim record-demo` (port 8788 must be free; takes about four minutes). It writes only eligible aggregate minutes and a public live packet, never audio, tokens or identities.

## Environment and secrets

| Name                                      | Where                                  | Purpose                                                                                                |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SITE_URL`                                | Vercel; extension build                | Canonical origin and exact callback base                                                               |
| `RELEASE_REPO_OWNER`, `RELEASE_REPO_NAME` | Vercel build/runtime                   | Public GitHub Release link                                                                             |
| `TWITCH_CLIENT_ID`                        | Vercel only                            | Twitch app ID; never needs email scope                                                                 |
| `TWITCH_CLIENT_SECRET`                    | Vercel secret                          | Authorization code exchange and app access token                                                       |
| `SESSION_SECRET`                          | Vercel secret                          | Encrypt/authenticate the one HttpOnly streamer cookie; strong random ≥32 bytes, e.g. 64 hex characters |
| `WORKER_API_URL`                          | Vercel                                 | HTTPS origin of the crowd Worker; public, passed to watch-only live view                               |
| `WORKER_OWNER_KEY`                        | Vercel secret**and** Cloudflare secret | Independent strong random ≥32-byte HMAC key for channel-bound, 60-second owner timeline tokens         |
| `HMAC_KEY`                                | Cloudflare secret only                 | Separate random key for anonymous viewer sessions                                                      |
| `EXTENSION_ORIGINS`                       | Cloudflare root vars                   | Fixed unpacked origin, plus any verified store origins later                                           |
| `SITE_ORIGINS`                            | Cloudflare root vars                   | Exact public website origin for anonymous watch sockets; no wildcard                                   |
| `CROWD_ENABLED`                           | Cloudflare root vars                   | Production starts false; enable only after secrets/origins are ready                                   |
| `ALLOW_TEST_TRAFFIC`                      | Cloudflare root vars                   | Keep false in production; true only for explicitly labelled demo environments                          |
| `STORE_EXTENSION_IDS`                     | Vercel, optional                       | Additional verified Chrome/Edge store IDs for version.json CORS                                        |
| `VITE_CROWD_API_URL`                      | Extension build only                   | Same public Worker origin; no secrets in extension env                                                 |

There is no browser read key. TIMELINE_READ_KEY from Part 4 is retired and no longer authorizes reads. Owner requests omit Origin and carry a signed short-lived token; Worker verifies its issuer, audience, subject shape, exact channel and expiry. The website first validates the Twitch user and exact login/channel equality. Anonymous viewer tokens cannot read history. Separate keys make viewer-token compromise independent of owner reads.

The session cookie contains encrypted streamer identity and access token, never readable by browser JavaScript. SameSite=Lax supports Twitch's callback; Secure/__Host prefix applies on HTTPS. One cookie serves pending OAuth state and the signed-in session; no extra tracker/state cookie. Twitch validation runs on every authenticated page/API request, meeting its startup/hourly validation requirement. Sessions end on invalidation/expiry; refresh tokens are discarded and the streamer logs in again (maximum eight hours, bounded by Twitch token expiry). App access tokens for archive lookup stay in server RAM.

## Exact Twitch redirect URLs

Enter these in your Twitch Developer Console app's OAuth Redirect URLs:

```text
http://localhost:3000/auth/callback
https://streamlaughs.vercel.app/auth/callback
```

The planned free Vercel subdomain is streamlaughs; no custom domain is configured. If you override SITE_URL, register the matching exact callback. If you use `SITE_URL=http://127.0.0.1:3000` locally, additionally register **http://127.0.0.1:3000/auth/callback** and browse that hostname consistently. No trailing slash. The local mock provider needs no Twitch app. Real auth requests an empty scope, without email/resource access.

## Your deployment sequence — do not run until ready

1. **Vercel:** create the selected `uzerkayat2004-gif/streamlaughs` repository and free `streamlaughs` Vercel project yourself (availability is not verified). Import the monorepo, select Next.js and set Root Directory to `apps/web`; enable access to source files outside that directory. The supplied `apps/web/vercel.json` uses `pnpm install --frozen-lockfile`, `pnpm --filter web build`, `.next`. Node 24 is the tested runtime. Set SITE_URL to the exact `https://streamlaughs.vercel.app`, `RELEASE_REPO_OWNER=uzerkayat2004-gif` and `RELEASE_REPO_NAME=streamlaughs`. Do not enable Vercel Analytics/Speed Insights or add tracker integrations. You may first deploy only public pages/demo while login env is absent; login fails closed with a setup message.
2. **Twitch:** register a server web application yourself, using the exact local and chosen production callback URLs above. Save its client ID and secret only in Vercel's server environment. Generate an independent SESSION_SECRET and WORKER_OWNER_KEY with your password manager. Add all values to Vercel production env; preview deployments must use a deliberately registered callback origin or leave login disabled. No wildcard callback or shared production cookie for arbitrary preview hosts.
3. **Cloudflare:** create/sign into your Free account yourself and choose its workers.dev subdomain. Edit root `[vars]` in workers/api/wrangler.toml: fixed EXTENSION_ORIGINS, SITE_ORIGINS equal to your SITE_URL, CROWD_ENABLED=false, ALLOW_TEST_TRAFFIC=false. Keep observability disabled. Then, from workers/api, run these yourself (no --env means the root production Worker):

```powershell
pnpm exec wrangler login
pnpm exec wrangler deploy
pnpm exec wrangler secret put HMAC_KEY
pnpm exec wrangler secret put WORKER_OWNER_KEY
```

The first deploy is intentionally disabled. Paste independent strong keys at the prompts; WORKER_OWNER_KEY must match Vercel's. Never use local fixture keys. Keep the SQLite `CHANNELS` binding/class and v1 migration; no separate D1 creation is needed. Set root CROWD_ENABLED=true, run `pnpm exec wrangler deploy` again, and inspect `/health`. This is the Part 4 deploy using the fixed ID.

4. Copy the actual HTTPS workers.dev URL to Vercel WORKER_API_URL. Redeploy the website after all production env is set. Test real Twitch login, ownership and VOD matching with the manual checklist. Do not share environment-file downloads, session cookies or authorization headers.
5. Build the distribution with both public URLs, keeping private signing material outside all release assets:

```powershell
$env:SITE_URL = 'https://streamlaughs.vercel.app'
$env:VITE_CROWD_API_URL = 'https://streamlaughs-crowd.YOUR_SUBDOMAIN.workers.dev'
pnpm --filter extension build
pnpm --filter extension build:edge
node tools/check-extension-identity.mjs
Remove-Item Env:SITE_URL
Remove-Item Env:VITE_CROWD_API_URL
```

All unpacked installs retain the fixed ID. Normal builds default to the chosen website origin; the Worker API URL must still be configured. `pnpm release:preview` rebuilds Chrome/Edge with OFFLINE_PREVIEW=true, explicitly suppressing both API/site connections before packaging. The preview files use the exact public naming convention in a clearly labelled offline-preview directory. [Private key/store migration](extension-identity.md).

## History, VOD and operating limits

The dashboard defaults to seven days, with a 30-day option. Reads split into at most 30 one-day Worker queries, four at a time; each query is capped at 1,440 minutes and retention still applies. Each wave is capped at 240 points. Helix archive lookup uses an app token, up to five pages/500 archives, stopping once older than the requested range. Real cloud latency/CPU/usage remain unmeasured until your deployment; use the README's Free budget, not a promise of unlimited scale.

Matched VOD IDs group minutes into streams. Without a matching VOD, gaps over 30 minutes split approximate activity groups; these are explicitly labelled, since the backend has no Twitch stream-start events. A VOD starting after a moment never produces a negative link. Multiple overlapping archives choose the latest containing start, deterministically. New markers retain eligible words seen at that server time; older rows show their minute-summary words with a label. Top three moments are at least a minute apart; a short session can have fewer. If VODs are unavailable/expired/off, timestamps remain and the watch button is absent. Provider timestamps cannot guarantee frame-perfect alignment with player encoding delays.

Public website visitors receive no app cookie. Twitch login is the only cookie flow; providers still see network metadata. The fixed public ID does not make CORS strong authentication. No Vercel/Cloudflare/Twitch production behavior or two-PC hardware soak is claimed tested here.
