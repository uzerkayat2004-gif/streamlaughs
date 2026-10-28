# Internal identifiers retained after the StreamLaughs rename

Public name: **StreamLaughs**. Wordmark: **streamlaughs**, yellow arc unchanged. Tagline: **see who's laughing with you**. Defaults: public repository `uzerkayat2004-gif/streamlaughs`, site `https://streamlaughs.vercel.app`, OAuth callback `https://streamlaughs.vercel.app/auth/callback`, Worker `streamlaughs-crowd` (local/dev `streamlaughs-crowd-dev`). The repository was created with the owner's explicit authorization. The website/Worker remain configured destinations; no release or deployment has been created.

The fixed extension origin remains **chrome-extension://fkocldgggcmhihelohiicoakcfomhepg**. Keys are unchanged. Public defaults come from product.config.json and remain env-overridable. Offline-preview builds explicitly suppress public API/site connections.

These identifiers stay internal-only to preserve saved data, authentication, protocol compatibility and developer tooling:

| Identifier                                                                     | Reason                                                         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `laughline`                                                                    | Existing Dexie database; changing it would orphan local recaps |
| `laughline:state`, `laughline:update`, `laughline:dock`, `laughline:onboarded` | Existing chrome.storage keys                                   |
| `laughline.v1`                                                                 | WebSocket subprotocol                                          |
| `laughline-web`                                                                | Owner-token and encrypted-session issuer                       |
| `laughline-auth`, `__Host-laughline-auth`                                      | Essential auth-cookie names                                    |
| `laughline-frames`                                                             | AudioWorklet registration                                      |
| `laughlineViewers`                                                             | Shared internal crowd-state field                              |
| `X-Laughline-Timeline`                                                         | Internal Worker-to-Durable-Object header                       |
| `laughline-overlay`, `laughline-crowd-box`                                     | Custom element and ARIA linkage hooks                          |
| `@laughline/shared`, `@laughline/eval`, `laughline-monorepo`                   | Private workspace package names                                |
| `LAUGHLINE_TEST_WAV`                                                           | Existing local-only positive-audio test env variable           |

The checkout folder and historical verification transcripts retain original paths/provenance. The approved design remains reference material; current screenshots use the new public brand. Neither historical transcripts nor reference controls ship as runtime UI.

tools/release/branding-internals.json is the machine-readable allowlist. Source/build checks reject the previous brand outside these tokens and the database constructor. Manifest and release filename checks allow no old tokens. Browser tests separately reject old names in visible text, including accidental exposure of internal IDs. The allowlist is not permission to add old product copy.
