# Sidebar V2 shared-row host evidence

- Date: 2026-07-29
- Candidate: in-monorepo Lynxtron production bundle
- Product baseline: Electron/Web monorepo only
- Snapshot: `36c926723342aed31536282d93ca8ef6d86cbf24c44b22c117f9f22aac76419d`
- Theme: dark
- Viewports: 1280 × 820 and 1440 × 900 logical pixels
- Fixture: one canonical project and three canonical threads

## Implemented boundary

The reachable `sidebarV2Enabled` product path no longer evaluates the
monolithic Web `SidebarV2` module in Lynx. Web and Lynx now compile one
renderer-neutral `SidebarV2RowSurface` for card/slim row hierarchy, selection
tones, status and timing placement, and action slots. A bounded
`SidebarV2.lynx.tsx` host supplies canonical Effect Atom projects/threads,
shared Web sorting/status logic, native tap navigation, and the shared
Sidebar chrome.

This main-bundle host leaf avoids both rejected probes:

- no eager Web Effect `onItem` / missing-snapshot failure;
- no relative async bundle URL, so R11 is not on the reachable V2 path.

The full Tailwind CSS v3/Rspeedy build succeeds. The compatibility pass still
reports the registered R6/R7/R9 removal of 40 unsupported selectors and 7
unsupported declarations. The final main Lynx bundle is 2,061.1 kB.

## Runtime evidence

The populated fixture was created through the canonical connector API using
the workspace Node 24 runtime. The shell's Node 23.8 runtime does not execute
the server bundle's `import.meta.main`; this is a fixture-launch constraint,
not a product data failure.

Both fresh Lynxtron sessions used Lynx DevTool and captured the screenshot
before console or DOM inspection:

- `v2-populated-1280x820.jpg`
- `v2-populated-1440x900.jpg`

Each capture has a `.capture.json` and `.lynx-measurements.json` sidecar,
reports zero DevTool renderer errors, and records the same snapshot hash.
Physical dimensions are respectively 2560 × 1640 and 2880 × 1800. The three
titles, order, active row, long-title truncation, project labels, and relative
times are stable at both viewports.

`v2-1280x820.jpg` is the earlier zero-error empty-state proof for the same
host boundary.

## Verification

- Web typecheck: passed.
- Focused shared row tests: 2 passed.
- Web production build: passed, 4,394 modules.
- ReactLynx scanner on the changed host/surface files: zero findings.
- Lynx Tailwind v3/Rspeedy build: passed.
- Lynxtron Rspack host and connector build: passed.

The current strict App Shell reuse report is 88/317 modules (27.8%) and
24,194/66,459 lines (36.4%). This is an honest increase from 27.5% / 36.0%,
but less than one percentage point and far below the 70% exit gates. Per the
T6-C1 plan, the next slice must choose a larger shared composition boundary
rather than continuing with small-row extraction.

## Open fidelity gaps

This evidence is not T6-C1 certification:

- Electron/Web V2 places Search + New Thread in one row and a second
  All-projects + New Project row. The current Lynx host instead renders the
  longer search label and a Threads/New header.
- Web exposes real settle/snooze controls when server capabilities allow;
  the Lynx host currently omits those controls rather than rendering inert UI.
- An existing empty persisted thread renders “Send a message to start the
  conversation.” in Web, while the current Lynx chat body still renders the
  new-thread headline. This belongs to the T6-C2/T6-C3 state convergence.
- A new same-snapshot Electron V2 capture was attempted in an isolated
  `test-t3-app` desktop environment. The product UI, V2 preference, three
  titles, selection, 1280 × 820 viewport, and zero-error navigation were
  verified through its product renderer. On this concurrent host,
  `Page.captureScreenshot` then stopped returning and the renderer target
  disappeared, so no Electron image or false paired metric was recorded.

The previous 2026-07-28 Electron Sidebar captures remain valid for their V1
snapshots but are not relabeled as V2 or same-snapshot evidence.
