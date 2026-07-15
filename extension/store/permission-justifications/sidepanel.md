# `sidePanel`

## Paste into dashboard

The sidePanel permission is used to display the extension's chat interface in the browser side panel, so users can keep the conversation with their Box documents open next to whatever they are working on. In browsers that do not support the side panel, the same interface opens as a toolbar popup instead. The side panel shows only our own UI (an extension page); it does not read or overlay web page content.

## Where it's used in code

- `manifest.json` — `side_panel.default_path: index.html`.
- `extension/src/displayMode.ts` — `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick })` toggles between side-panel and popup mode.
- `extension/src/background.ts` — applies the stored mode on install/startup and when it changes.
