# `identity`

## Paste into dashboard

The identity permission is used solely to run the Box (box.com) OAuth sign-in flow via chrome.identity.launchWebAuthFlow. The user authorizes access to their own Box account on Box's official login page; the extension receives only the OAuth redirect. We never see or handle the user's Box password, and the resulting Box tokens are held by our backend, not the extension. This is the extension's only sign-in mechanism and is required for its core (and only) function: answering questions from the user's own Box files.

## Where it's used in code

- `extension/src/auth.ts` — `chrome.identity.launchWebAuthFlow` with a `https://<extension-id>.chromiumapp.org/` redirect URI; the authorization code + state are exchanged through our backend (`/api/box/oauth/ext-start`, `/api/box/oauth/ext-finish`).
- Redirect URIs are validated server-side to the chromiumapp.org pattern (`lib/box.ts:isValidExtensionRedirectUri`).
