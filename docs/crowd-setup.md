# Crowd setup and first deployment

**Part 5 supersedes the historical timeline-secret/deployment instructions below. Use [deploy-part5.md](deploy-part5.md) for current setup, Twitch owner auth and deployment. TIMELINE_READ_KEY is retired.** The fixed Chrome/Edge unpacked ID is `fkocldgggcmhihelohiicoakcfomhepg`; current EXTENSION_ORIGINS uses `chrome-extension://fkocldgggcmhihelohiicoakcfomhepg`, not a different ID per folder. Extra verified store origins are comma-separated; [migration/key storage](extension-identity.md).

No login, account creation, secret upload or deploy was run by Codex. All verification used local Miniflare/Wrangler. Production is disabled in the checked-in config.

## Local development (PowerShell, from repo root)

```powershell
pnpm i
$env:VITE_CROWD_API_URL = 'http://127.0.0.1:8787'
pnpm --filter extension build
Copy-Item workers/api/.dev.vars.example workers/api/.dev.vars.dev
```

Load `.output/chrome-mv3`, copy its ID from chrome://extensions, and edit **only the ignored** `workers/api/.dev.vars.dev`: set `EXTENSION_ORIGINS="chrome-extension://YOUR_32_CHARACTER_ID"`. Edge also uses the chrome-extension scheme. Multiple exact origins are comma-separated; no wildcard. Example keys are public local fixtures; never use them outside localhost. Then:

```powershell
pnpm --filter api dev
# In another terminal:
pnpm --filter crowd-sim start --channel yourchannel --viewers 25 --script funny --origin chrome-extension://YOUR_ID
```

Press Start on the same Twitch channel. Below three sharing contributors the complete server packet is `{"state":"few"}`; watch-only connections do not count. Simulator clients are simulated people using the real backend; UI says **live · test traffic**, and stored minutes carry that flag. This does not demonstrate human detection accuracy. An unconfigured API stays offline; no fake fallback.

The CLI defaults to localhost:8787, runs 120 seconds, accepts `--duration 2..7200`, caps viewers at 200 and stops on Ctrl+C. Remote dev requires HTTPS, an explicit `CROWD_SIM_DEV_ORIGIN` matching the origin, and `--api`. Other remote origins need `--allow-prod`; the server must also allow test traffic. Production `ALLOW_TEST_TRAFFIC=false` rejects simulator sessions even with that override.

Reconnects reuse the RAM token within a watch session; expiry, a new watch or a background restart obtains a new random ID. Only the latest pending packet is kept, never more than ten seconds; reconnect discards it. Share-off/pause immediately clears counts and reconnects receive-only. Live rooms publish about once/second. Sparse server keepalives keep Chromium connected without client pings. HTTP/connect timeouts and a 35-second valid-packet timeout recover a dead transport.

## Reproduce verification

```powershell
pnpm -r typecheck
pnpm -r test
Remove-Item Env:VITE_CROWD_API_URL -ErrorAction SilentlyContinue
pnpm --filter extension build
pnpm --filter extension build:debug
pnpm --filter extension build:edge
pnpm --filter extension build:test-ui
$env:VITE_CROWD_API_URL = 'http://127.0.0.1:8787'
pnpm --filter extension build:test-crowd
Remove-Item Env:VITE_CROWD_API_URL
pnpm exec playwright install chromium
$env:LAUGHLINE_TEST_WAV = 'C:\path\to\local-laugh-16k-mono.wav'
pnpm exec playwright test --trace off
```

The crowd browser test starts its own local Wrangler and real simulator processes, passes the exact loaded extension origin, and closes its processes afterward. Leave ports 8787 and 4179 free. It observes the actual background WebSocket send method, keeping only a numeric frame counter, and asserts zero watch-only sends and no sends after opt-out. Native protocol handshakes/close frames are outside that application-message assertion. Crowd responses are not mocked. Original UI regression uses the explicit ui-test fake build; audio/model tests use actual local models. Without the positive WAV, the existing positive model test explicitly skips. The README has the public-domain reproduction fixture and manual hardware limitations. No browser traces/audio recordings are created.

## Secrets and settings

| Setting                                                           | Purpose                                                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `HMAC_KEY` (secret, random ≥32 bytes; use 64 hex characters)      | Sign anonymous two-hour channel tokens. Rotation expires sessions. Never put it in extension env or TOML.                         |
| `TIMELINE_READ_KEY` (optional independent secret, ≥32 characters) | Operator-only aggregate reads until Part 5 owner OAuth. Unset denies all reads. Never bundle in browser JavaScript.               |
| `EXTENSION_ORIGINS`                                               | Exact installed extension origins, comma-separated. CORS does not stop non-browser bots.                                          |
| `CROWD_ENABLED`                                                   | Kill switch; production defaults false. New requests fail closed; existing sockets close on their next event/alarm after rollout. |
| `ALLOW_TEST_TRAFFIC`                                              | Production false; local dev true. Simulator sessions are marked.                                                                  |
| `VITE_CROWD_API_URL` (build env)                                  | One HTTPS API origin; HTTP only for localhost. Adds that origin and its WS counterpart to CSP, no host permissions.               |

## Your first deploy — commands for you to run

1. Create/sign into your Cloudflare account yourself and select Workers Free. Confirm the README's linked current limits. Choose a workers.dev subdomain in your account.
2. In root `[vars]` of `workers/api/wrangler.toml`, set exact production extension origins. Keep `CROWD_ENABLED="false"` and `ALLOW_TEST_TRAFFIC="false"` for the first disabled deployment. Keep observability disabled and avoid payload/header logging or tail sessions. The `v1` migration creates SQLite storage; no separate D1 database is needed.
3. Run these **yourself**, from `workers/api`. With no `--env` they target root production Worker `streamlaughs-crowd`, not `env.dev`:

```powershell
pnpm exec wrangler login
pnpm exec wrangler deploy
pnpm exec wrangler secret put HMAC_KEY
# Same independent owner key as Vercel WORKER_OWNER_KEY, for the dashboard:
pnpm exec wrangler secret put WORKER_OWNER_KEY
```

Paste independent strong secrets at the prompts, preferably generated/stored by your password manager. Never use the documented local keys. No secret values go into source, command arguments or archives.

4. Set root `CROWD_ENABLED="true"`, then run `pnpm exec wrangler deploy` again. Inspect `/health`. Copy the HTTPS URL Wrangler gives you. Keep the CHANNELS binding/class/migration stable on later deployments.
5. From repo root, build and reload the extension with that URL:

```powershell
$env:VITE_CROWD_API_URL = 'https://streamlaughs-crowd.YOUR_SUBDOMAIN.workers.dev'
pnpm --filter extension build
pnpm --filter extension build:edge
Remove-Item Env:VITE_CROWD_API_URL
```

Confirm extension IDs after loading/repackaging; update server origins and redeploy if they differ. Use the manual checklist before inviting viewers. To disable, set root `CROWD_ENABLED="false"` and redeploy; rollout has delay. Live 1 Hz rooms consume duration: keep the pilot within the free account budget and inspect aggregate usage metrics without request-body/token logs.
