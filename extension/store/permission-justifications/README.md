# Chrome Web Store — permission justifications

One file per permission the extension requests, matching
`extension/public/manifest.json`. Each file has a **Paste into dashboard**
block (the text to submit in the CWS Privacy Practices tab) and a
**Where it's used in code** section for our own reference when a reviewer
asks follow-up questions.

Current manifest surface:

| Permission | File |
| --- | --- |
| `storage` | [storage.md](storage.md) |
| `identity` | [identity.md](identity.md) |
| `sidePanel` | [sidepanel.md](sidepanel.md) |
| `scripting` | [scripting.md](scripting.md) |
| `activeTab` | [activetab.md](activetab.md) |
| Host: `https://box-demo.interfaze.ai/*` | [host-box-demo-interfaze-ai.md](host-box-demo-interfaze-ai.md) |

Also included: [single-purpose.md](single-purpose.md) and
[remote-code.md](remote-code.md) for the other Privacy Practices fields.

If the manifest's permissions ever change, update this folder in the same
commit — these texts are what we've told the store, and they must stay true.
