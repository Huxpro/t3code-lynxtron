# T5-F3 new-thread evidence — 1440 × 900

- Product reference: monorepo Electron/Web T3 Code
- Candidate: monorepo `@t3tools/lynxtron`
- Standalone Lynx repository: provenance only; not used as a baseline
- Route/theme: new-thread, dark
- Logical viewport: 1440 × 900
- Device scale factor: 2
- Image dimensions: 2880 × 1800
- Prepared snapshot:
  `2b962e76d2c2d35680ae3c793888af14b0d7325b5150c1779fcd913746a9d3f6`
- Prepared state: one `t3code` project at this worktree and zero threads
- Masks: none

`electron.png` was captured from the Electron product renderer with a native
1440 × 900 content window and no browser/window chrome. `lynx.jpg` was
captured with Lynx DevTool from a fresh Lynxtron process using the same
prepared state. Lynx DevTool reported zero console errors.

Measured results:

- Anchor geometry: 2/5 within 8 px
- Corresponding font sizes: 5/5 within 2 px
- Sidebar boundary delta: 1 px
- Workspace-header delta: 0 px
- Composer maximum delta: 11 px
- Checkout-bar maximum delta: 20 px
- Headline element bounds are not yet corresponding: Lynx exposes the
  768-px text container while Web exposes the wider centered heading block
- Exact copy and computed colors remain uncertified for the same explicit
  differences and serialization limitation recorded in the 1280 × 820 notes

`metrics.json` is the structured record. The side-by-side and difference
images are diagnostics, not a whole-screen pass score.
