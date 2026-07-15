# `activeTab`

## Paste into dashboard

The activeTab permission grants temporary access to the current tab only when the user clicks the extension icon. We use that one grant for a single one-time browser-capability check (see the scripting justification): detecting whether the browser can show a side panel by reading two theme CSS variables from the page the user is on. This happens once per install; after a result is stored the extension never touches a tab again. Using activeTab instead of host permissions means the extension has no standing access to any website the user visits.

## Where it's used in code

- `extension/src/detection.ts` — `chrome.tabs.query({ active: true, lastFocusedWindow: true })` to find the clicked tab, then a single `chrome.scripting.executeScript` into it, permitted by the activeTab grant from the user's click.
- All failure paths (chrome:// pages, no result) leave the default popup mode in place and retry on a later click — never expanding access.
