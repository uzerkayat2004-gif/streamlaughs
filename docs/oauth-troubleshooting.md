# Twitch sign-in diagnostics

Start at https://streamlaughs.vercel.app/for-streamers. The login and retry controls are plain anchors, so the OAuth handler gets a full navigation without Next prefetching it.

Before starting authorization, the server checks that neither Twitch credential contains whitespace and uses the client-credentials grant to verify the Client ID/secret pair. Its short-lived app-token cache is reused by archive lookup. This check never returns an access token to the browser or logs its value. Credentials are checked as stored; whitespace is not silently removed and the production secret is never replaced by the app.

The callback checks the encrypted state cookie, exchanges the one-time code, validates the resulting user token, fetches `/helix/users`, and cross-checks the two identities before issuing the session cookie. The registered callback must be exactly `https://streamlaughs.vercel.app/auth/callback`.

Production logs use `[streamlaughs.auth]` and only allowlisted codes, HTTP status numbers and booleans. No secrets, codes, state values, cookie values, user tokens, provider response bodies or user IDs are logged. Safe success markers are `credentials_verified`, `state_verified` and `login_succeeded`.

```powershell
npx vercel logs --project streamlaughs --scope uzerkayats-projects --environment production --since 1h --query streamlaughs.auth --json --no-follow
```

- `credentials_whitespace`: a Twitch credential contains whitespace/newlines. The owner must correct the production value.
- `credentials_rejected`: Twitch rejected the app credential pair. A safe `invalid_client_secret` or `invalid_client_id` detail may be present. The owner should regenerate/update the secret in Twitch/Vercel, never paste it into chat, then redeploy.
- `state_missing`, `state_invalid`, `state_mismatch`: the callback lost the pending cookie, it expired, or another login replaced its state. Retry from one tab on the production hostname with cookies allowed.
- `token_exchange`: Twitch rejected the one-time authorization code or the request timed out; an allowlisted reason may identify a used/expired code or redirect mismatch.
- `identity_validation`, `identity_response`, `wrong_client`: token validation failed or returned an unexpected identity.
- `user_lookup`, `user_response`, `identity_mismatch`: the Helix user lookup failed or disagreed with token validation.

`/streamers?login=retry` renders a dedicated error screen with one clear retry action. `reason` is an allowlisted diagnostic category; arbitrary query text is never displayed. Worker settings remain independent of Twitch sign-in.
