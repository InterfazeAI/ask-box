# Remote code

## Dashboard answer

**No, I am not using remote code.**

## Justification (if a text field is shown)

All JavaScript executes from the packaged extension bundle. The extension never loads, evaluates, or injects code from a server: no remote script tags, no eval of fetched strings, no CDN imports. Network requests to our backend (box-demo.interfaze.ai) exchange only data (JSON and streamed text for chat responses), which is rendered as text/markdown — never executed.

## Where this is verifiable in code

- `vite.config.ts` — everything is bundled into `dist/`; the manifest references only local files (`background.js`, `index.html`, `popup.html`).
- The only injected code is a function literal shipped inside the bundle (`extension/src/detection.ts`, serialized by `chrome.scripting.executeScript({ func })`) — not fetched from anywhere.
- Chat responses are rendered through react-markdown with raw HTML disabled (`components/Markdown.tsx`), so remote content cannot become executable.
