# Visual baseline and capture evidence

## Baseline policy

The Electron application rendered from `apps/web` is the product source of
truth for Lynxtron visuals, copy, interaction, and state presentation.
`packages/client-runtime` and `apps/web` are the architectural sources of
truth. The standalone `t3code-lynxtron` repository is provenance-only evidence:
it may identify migrated code or missing historical behavior, but its
screenshots do not define fidelity and must not be used in a product parity
score.

## Current exploratory pair

The first correctly targeted pair uses a 1,180 × 748 logical viewport at 2×
device scale:

- `electron-empty-composer-1180x748.png`: Electron/Web reference.
- `lynx-empty-composer-1180x748.png`: monorepo Lynx candidate captured with
  Lynx DevTool.
- `electron-vs-lynx-empty-side-by-side.png`: reference on the left, candidate
  on the right.
- `electron-vs-lynx-empty-diff.png`: pixel-difference diagnostic.
- `lynx-empty-composer-runtime-verified.png`: production candidate after
  removing the main-thread `replaceAll` failure and adding the Web Encoding
  host compatibility layer.
- `electron-vs-lynx-empty-runtime-verified-side-by-side.png` and
  `electron-vs-lynx-empty-runtime-verified-diff.png`: regenerated diagnostics
  for that zero-error candidate.

This pair is exploratory, not a T5 certification pair: the two clients used
different server state, model catalogs, thread inventories, checkout labels,
and branches. Those data differences must not be counted as visual errors.

Observed geometry is already close for sidebar width, header height, Composer
width, and horizontal anchors. The initial candidate placed the headline and
Composer roughly 34–45 logical pixels too low because Lynx centered the
headline and card as one block while Electron centers the card and absolutely
positions the headline above it. `lynx-empty-composer-layout-aligned.png` and
its `electron-vs-lynx-empty-layout-aligned-*` diagnostics verify the corrected
layout through Lynx DevTool. Remaining candidate differences are:

- Sidebar header texture/glow is absent.
- Font metrics, icon rasterization, radii, padding, and the send-button shape
  still differ.
- The Electron sidebar contains state that the isolated Lynx snapshot does not.

Do not turn these observations into a global fidelity percentage. Full parity
requires same-snapshot evidence for every surface listed in the port ledger.

## Repeatable Lynx DevTool capture

Build and launch a production client with an isolated state directory. Then run:

```bash
pnpm --dir apps/lynxtron run capture:lynx -- \
  --output reports/screenshots/lynx-new-thread.png \
  --route new-thread \
  --theme dark \
  --snapshot <snapshot-id>
```

The command refuses to write runtime-clean capture metadata when Lynx DevTool
reports renderer errors. It writes a sibling `.capture.json` containing the
dimensions, route, theme, snapshot label, and zero-error result. This runtime
gate is not a visual-fidelity certification. Override the installed DevTool
entry point with `LYNX_DEVTOOL_CLI=/absolute/path/to/index.mjs` when needed.

After capturing the same Electron/Web state and dimensions, generate diagnostic
images with:

```bash
pnpm --dir apps/lynxtron run visual:diff -- \
  --reference reports/screenshots/electron-new-thread.png \
  --candidate reports/screenshots/lynx-new-thread.png \
  --prefix electron-vs-lynx-new-thread
```

Pixel difference is diagnostic only. The pass gates remain the anchor,
typography, exact-state, and registered-difference rules in
`docs/plans/00-execution-index.md`.
