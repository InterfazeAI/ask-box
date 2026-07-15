# `scripting`

## Paste into dashboard

The scripting permission is used together with activeTab for a single one-time check: when the user first clicks the extension icon, we inject a small function into the current tab that reads two theme-related CSS variables to detect whether the browser is Arc (which cannot display Chrome's side panel). Based on the result, the extension chooses side-panel or popup mode once, stores the choice, and never injects again. The injected function reads no page content, collects no data, and modifies nothing on the page. There are no content scripts declared and no access to any site beyond this user-invoked check.

## Where it's used in code

- `extension/src/detection.ts` — `chrome.scripting.executeScript({ target: { tabId }, func: pageHasArcPalette })`, called only from `maybeDetectDisplayMode()`, which is a no-op once a display mode is stored (or when the user has set one manually in Settings).
- The injected function (`pageHasArcPalette`) reads `--arc-palette-*` CSS custom properties via `getComputedStyle(document.documentElement)` and returns a boolean; nothing else is touched.
