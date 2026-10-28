# Crowd API · v1

Written before implementation, 2026-10-27. Shared schemas live in packages/shared. See [threat model](crowd-threat-model.md) for privacy boundaries and anonymous-identity limitations.

## HTTP and authentication

The extension uses one build-time API origin, HTTPS/WSS outside localhost. CORS and WebSocket Origin checks allow exact EXTENSION_ORIGINS and SITE_ORIGINS only; no wildcard or credential cookies. The fixed unpacked origin is chrome-extension://fkocldgggcmhihelohiicoakcfomhepg; verified store origins can coexist. Non-browser tools can forge Origin, so this is not an anti-bot mechanism. All responses use no-store. No token appears in a URL.

- `GET /health`: status/config readiness only, no viewer data.
- `POST /v1/session`: strict JSON `{channel, testTraffic?: false}`. Channel is lowercase `[a-z0-9_]{1,25}`. A successful response is `{token, expiresAt}`; HMAC-SHA-256 signs version, random ID, channel, test flag and two-hour server expiry. Token is RAM-only. `testTraffic:true` requires the server's explicit demo setting. Missing secrets/disabled backend fail closed.
- `GET /v1/channels/:login/live?mode=watch|share`: WebSocket upgrade. Protocols are `laughline.v1` and `auth.<token>`; server selects only `laughline.v1`. Token channel must match the route. One active socket per token; a reconnect replaces its old socket without creating another contributor.
- `GET /v1/channels/:login/timeline?from=<epoch-ms>&to=<epoch-ms>`: Part 5 channel-bound owner bearer token, HMAC-SHA-256 signed by Next using WORKER_OWNER_KEY after Twitch validation and exact login/channel ownership. Claims: v=1, issuer laughline-web, audience crowd-timeline, numeric Twitch owner subject, channel, issuedAt and 60-second expiresAt. Worker verifies all fields and clock bounds. Server-to-server reads may omit Origin; that does not bypass authentication. Bounded to 24h/query, 1,440 retained rows; returns `{channel,minutes:[...]}`. Anonymous viewer tokens and retired TIMELINE_READ_KEY are denied. No owner key or signed owner token is returned to browser JavaScript.

Bad channel/body/range → 400; missing/invalid authentication → 401/403; unsupported/binary data → socket close; rate/capacity → 429 or policy close; disabled/unconfigured → 503. Errors never echo payloads or tokens. The edge session body and socket text are capped at 512 UTF-8 bytes. Clients send no timestamps or IDs in contributions.

## Watch-only and sharing

Watch-only sends **zero application WebSocket messages**, including zero application pings. The initial session POST and socket handshake still reveal channel presence. The server may send a sparse unchanged-few keepalive so a Chromium service worker can remain connected without client heartbeats.

Sharing sends at most one message per two seconds:

```json
{
  "laughing": 1,
  "intensity": 2,
  "scream": 0,
  "gasp": 0,
  "hype": 1,
  "swears": 0,
  "phrases": ["no way", "bro"]
}
```

`laughing` is 0/1; intensity is 0–3, zero when not laughing. Reaction/swear counts are integers 0–3 per message. Phrases: at most three strings, each ≤80 characters, deduplicated and filtered through the exact shared crowd allowlist/privacy rules. Unknown, name-like, blocked and swear labels are silently removed. The server counts each contributor once per phrase/window regardless of repeated packets. No raw text, arbitrary metadata, client timestamps, audio or extra fields are accepted.

The client keeps only the latest pending packet, drops old work and expires it after ten seconds. Reconnect sends fresh state rather than replaying a backlog. Share-off clears all pending/private-derived counters immediately and reconnects in watch mode. Enabling sharing does not upload reactions collected while sharing was off. Pause stops contribution sending; local audio consent remains independent of watching the crowd.

## Server broadcasts and windows

Below three fresh distinct sharing contributors, the complete packet is exactly:

```json
{ "state": "few" }
```

Eligible rooms receive approximately one packet per second:

```json
{
  "state": "live",
  "sharing": 25,
  "laughingNow": 8,
  "laughPercent": 32,
  "topWord": "no way",
  "bubbles": [{ "text": "no way", "count": 5 }],
  "hype": 3,
  "testTraffic": false
}
```

- Sharing presence needs a valid recent packet within six seconds and an open sharing connection.
- `laughingNow`: distinct sharing contributors who sent laughing=1 in the last five seconds. A subsequent zero does not erase a laugh still in that window.
- Labels/bubbles: at least three distinct contributors in the last 20 seconds, maximum three bubbles, sorted by contributor count then label. `topWord` is null without an eligible label. Server time defines all windows.
- Hype: bounded reaction totals within five seconds. No individual IDs or timestamps appear in broadcasts.
- Closing/opt-out removes that contributor's live state. Binary, oversized, extra-field and malformed packets never contribute. A token/connection may submit at most once per second; normal clients use two seconds.
- Defaults: 200 sockets/channel, 1,024 tracked identities/minute/rate table, one active socket/token, at most five stored phrases and four moment markers/minute. Caps fail closed.

Active rooms tick in RAM; no SQL is written each second. Small crowds with recent contributions also remain active. After recent windows and any unfinished eligible minute expire, empty/inactive rooms use the hibernation WebSocket API. Inactive watch-only/few keepalives use a sparse alarm. Hibernation attachments contain connection metadata only; live contribution/rate maps are not durable. Unexpected eviction resets partial live state to few until fresh packets re-establish the floor. Active once-per-second broadcasts consume duration; idle hibernation does not make active traffic or retention alarms free.

## Stored timeline

Each minute row contains server minute/time, contributors, peak laughingNow, average laughPercent, up to five approved phrases with distinct-contributor counts, hype total, testTraffic, and bounded `{ts,kind:peak|spike,laughingNow}` markers. It is saved only with at least three eligible contributors; labels need their own three-contributor floor. No per-viewer rows, signed tokens, IPs, transcripts or audio are stored. Automatic alarms delete rows after 30 days, and reads independently exclude expired data. In-progress minutes may be lost on an unexpected object restart; completed rows survive.

Part 5 markers may additionally contain up to three floored approved `phrases` visible at that server time. Older markers without this field remain valid; the website labels their fallback words as minute summaries. Retention and contributor floors are unchanged.

Demo clients use the same API and are marked testTraffic. The CLI targets localhost or an explicitly configured development origin by default; other origins need `--allow-prod`, and the server must still allow demo traffic. There is no deployment in this part's build/test workflow.
