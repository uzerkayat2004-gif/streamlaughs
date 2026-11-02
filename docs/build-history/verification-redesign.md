# Website redesign verification — October 30, 2026

Scope: apps/web plus the empty chromeStoreUrl setting in product.config.json.
Extension sources, extension icons, version 0.6.4, Worker and Wrangler config are unchanged.

Passed:

- `pnpm --filter web typecheck`
- `pnpm exec biome check apps/web`
- `pnpm --filter web test`: 29 tests, 7 files.
- From apps/web: `node ../../tools/next-local.mjs build --webpack`.
  This checks the production Next.js build without rebuilding the extension.
- Lighthouse 13.6.0 against that local production server: mobile performance 97,
  accessibility 100; desktop performance 100, accessibility 100.

Visual browser previews and screenshot review covered 1920×1080, 1366×768 and
390×844 (mobile at 2× pixel density). Each home section measures exactly one
viewport at those sizes. The public pages have no horizontal overflow, visible
“crowd” copy or GitHub links. All six recap stories are available in the viewer
demo; the streamer preview remains separately labelled test data at /demo.
No browser page errors appeared during this preview pass. Reports/screenshots
are kept outside Git in the local generated cache.

Foreground browser inspection confirmed pointer capture, carrying a chip from
one section into the next with edge auto-scroll, an absolute document-position
drop, and reset returning it home. Windows occlusion throttling in the preview
initially paused animation frames; disabling that preview-only throttling
confirmed the page's animation loop and reset. Touch dragging is available with
reduced motion, and reduced motion disables both idle wobble and scroll snapping.

No full suite, extension tests, Worker tests or e2e suite was run.

OAuth unit coverage checks the empty scope, state/cookie round trip, token
exchange and identity verification, Secure/httpOnly/SameSite=Lax cookie, exact
identity-only session payload, rejection of legacy token-bearing sessions and
owner-only channel authorization. User access/refresh tokens are not retained;
the channel login is kept alongside Twitch ID/display name for ownership checks.
Existing users need one new sign-in. Twitch revocation does not immediately
invalidate the independent website session; logout clears it and it expires
within eight hours. No real-account login or credentials were used in previews.
