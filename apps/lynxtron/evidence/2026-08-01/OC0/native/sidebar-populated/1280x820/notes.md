# OC0 native Sidebar/Composer diagnostic baseline

- Product HEAD: `73a4ba4bf7de4145117c1fedf9477040de572a95` (the staged product bundle was built at `8c5d5873f8c8868cfadcab37a637a08b4f28cedb`; the intervening commit changes only `AGENTS.md`).
- Snapshot: `45b082090447423fe12ca080fdcc54d246aaadfb426aa397b19af1be6e58ee37`.
- Isolated base directory: `/tmp/t3code-oc0.7qrI9Z` (disposed after the run).
- Explicit project: `/Users/bytedance/github/t3code`.
- Explicit logical viewport: 1280 x 820; retained JPEG: 2560 x 1640 at device pixel ratio 2.
- Retained-capture Lynxtron PID: 47112; interaction-diagnostic PID: 25344; DevTool client `localhost:8903`; session 1 in both fresh processes.
- Session bundle: `file:///Users/bytedance/github/t3code/apps/lynxtron/dist/desktop/main.lynx.bundle`.
- Bundle SHA-256: `568c3ec605250380c7b6f1930fbc4354dfddfa508b48f00fa447c463b2a715ec`.
- Server reached `T3 Code server is ready` on owned port 49215 for the retained capture and 57021 for the interaction diagnostic.
- Renderer transport was `main`; `lastSeq()` was 16 at capture and 22 after the Settings interaction.
- DevTool renderer console: zero errors and warnings.
- Cleanup: PIDs 47112 and 25344 exited; ports 8903, 49215, and 57021 were free. Synara on 8901 and Fiddle on 8902 were not touched.

This is diagnostic OC0 evidence, not a passing certification cell. The paired current Web baseline still requires an explicitly authorized browser/Electron capture.

## Frozen failure signatures

- O1: the project-scope trigger occupied x=7..217 (210 px), while its opened `.sidebar-v2-scope-popup` occupied x=139..217 (78 px). The popup is only 37% of its trigger width and repeats the selected `All projects` item over the Sidebar rows.
- O2: a real DevTool tap targeted `.sidebar-settings-row`. After connector sequence advanced from 16 to 22, `.settings-topbar__title` was absent and the chat/Sidebar tree was mounted again.
- O3: the Composer shell was 672 x 152 at x=432, y=360; its input was 649 x 70, footer controls were 14 px, and the context strip was 648 x 36. These are the native anchors to pair with the current Web Composer.
- O4: the unconfigured production preload resolves `Alpha`, so `.sidebar__brand-bg` is absent and the upper-left brand has no Dev backdrop.
- O5: this cold start connected successfully, disproving the assumption that every start currently races. The lifecycle visibility gap remains source-deterministic: `ChatHeader` receives `connectionStatus` and `statusDetail` but renders neither, while Composer disabled state carries the only chat-shell indication.
