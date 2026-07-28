# T5-F3 new-thread evidence — 1280 × 820

- Product reference: monorepo Electron/Web T3 Code
- Candidate: monorepo `@t3tools/lynxtron`
- Standalone Lynx repository: provenance only; not used as a baseline
- Route/theme: new-thread, dark
- Logical viewport: 1280 × 820
- Device scale factor: 2
- Image dimensions: 2560 × 1640
- Prepared snapshot:
  `f4b2fd37a9fce85b4efb8abf4c01543ea8655f64fc26bc0f9e4ca0bc7148b4a8`
- Prepared state: one `t3code` project at this worktree and zero threads
- Masks: none

`electron.png` was captured from the Electron product renderer with a native
1280 × 820 content window. The harness rejects DevTools pages, asserts the
native viewport, waits for fonts and connection stability, disables animation,
and excludes browser/window chrome. A narrowly classified draft-route thread
snapshot 404 is recorded in `electron.capture.json`; no other renderer error
was accepted.

`lynx.jpg` was captured with Lynx DevTool from a fresh Lynxtron process using
the same prepared state. Lynx DevTool reported zero console errors. The JPEG
extension reflects the bytes returned by the tool.

Measured results:

- Anchor geometry: 2/5 within 8 px
- Corresponding font sizes: 5/5 within 2 px
- Sidebar boundary delta: 1 px
- Workspace-header delta: 0 px
- Composer maximum delta: 11 px
- Checkout-bar maximum delta: 20 px
- Headline element bounds are not yet corresponding: Lynx exposes the
  768-px text container while Web exposes the wider centered heading block
- Exact copy is not yet certified; visible differences include model,
  reasoning, checkout/ref labels, `Commit` versus `Commit & push`, and the
  Lynx icon text included in DevTool outer HTML
- Computed colors are recorded but not yet certified because Web serializes
  authored OKLCH values while Lynx DevTool serializes RGB values

`metrics.json` is the structured record. The side-by-side and difference
images are diagnostics, not a whole-screen pass score. The prior partial
capture is preserved recoverably under `legacy-partial/`.
