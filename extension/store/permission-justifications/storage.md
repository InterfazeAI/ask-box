# `storage`

## Paste into dashboard

The storage permission is used to keep two small values in chrome.storage.local: (1) the user's session token for our backend, created after they sign in to their own Box account, so they stay logged in between browser sessions; and (2) a display-mode preference ("popup" or "side panel") so the extension opens the way the user's browser supports. No browsing data, page content, or history is ever stored.

## Where it's used in code

- `extension/src/storage.ts` — the only module that touches `chrome.storage.local`; stores `askbox_sid` (session token) and `askbox_display` (display mode).
- `extension/src/background.ts` — listens for `askbox_display` changes to apply popup vs side-panel mode.
- Session token is a signed opaque ID minted by our backend (`app/api/box/oauth/ext-finish/route.ts`); Box OAuth tokens themselves are never stored in the extension.
