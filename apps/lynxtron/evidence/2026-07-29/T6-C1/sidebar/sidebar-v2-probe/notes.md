# Rejected Sidebar V2 compilation probe

- Date: 2026-07-29
- Candidate: in-monorepo Lynxtron production bundle
- Snapshot: `50cc0d02d0a8698497a0c13b910f6e11cb3a55206ff88aefc0341698ada92192`
- Route label: `sidebar-v1-with-v2-compiled`
- Theme: dark
- Logical viewport: 1280 × 820
- Lynx DevTool client: `localhost:8903` (`@t3tools/lynxtron`)

The probe compiled the real Web `SidebarV2` composition into the Lynx route
graph while leaving the canonical preference disabled, so the visible branch
should still have rendered Sidebar V1. A fresh goal-owned process was started,
and the first DevTool screencast frame was captured.

The result is rejected. The renderer produced a blank frame and DevTool
reported both:

- `TypeError: not a function` from `onItem` in `main-thread.js`
- `Snapshot not found: __snapshot_fadda_2bac4_1`

The capture harness correctly exited with status 1 and did not write capture
metadata. `v1-default.jpg` is diagnostic failure evidence only and must not be
used as a fidelity screenshot.

The Sidebar V2 import, its temporary Lynx state adapters, and its temporary
icon aliases were removed after this probe. The verified Sidebar V1 product
path remains the reachable implementation while the unsupported composition is
decomposed into smaller host leaves.

## Restored baseline

After the rollback, the production build returned to the 2,039.4 kB Lynx
bundle and the strict App Shell graph returned to 87/316 shared modules
(27.5%) and 23,891/66,344 shared lines (36.0%). A second fresh process produced
`v1-restored.jpg` as its first DevTool frame. Its capture sidecar records zero
renderer errors and the expected 2560 × 1640 physical image for the 1280 × 820
logical viewport.

## Host-leaf and lazy-load probes

A missing Lynx `Popover` host leaf was implemented with the same root,
trigger, popup, close, title, and description API as Web. This removed the Web
Base UI Popover graph and reduced the experimental monolithic bundle from
3,226.6 kB to 2,993.4 kB, but `v1-with-popover-adapter.jpg` still reproduced
the same Effect `onItem` and snapshot failure. The Popover leaf was therefore
not the remaining crash source.

Loading `SidebarV2` through React `lazy()` isolated it into a 794.6 kB async
bundle. This proved that the default V1 product path can remain healthy while
the V2 module is not evaluated: `v1-lazy-v2.jpg` is a fresh 1280 × 820 capture
with zero renderer errors.

The enabled V2 path is still rejected. Lynxtron 0.0.5 tried to fetch
`/async/./SidebarV2.<hash>.bundle` as an absolute URL, reported
`ERR_INVALID_URL`, and the Lynx background runtime then reported
`Lazy bundle load failed`. `v2-lazy-enabled.jpg` consequently has no Sidebar
and is diagnostic-only. The lazy product branch was removed rather than
shipping a preference that can hide the Sidebar.

The preload preference path now honors `T3_LYNXTRON_BASE_DIR`, allowing future
V2 and settings fixtures to use isolated preferences without reading or
changing `~/.t3-lynxtron`. The established home-directory path remains the
default and is covered by a focused test.

`v1-final.jpg` is the authoritative post-probe result. It was captured as the
first DevTool frame from the final source state, reports zero renderer errors,
and retains the 2,039.4 kB production bundle plus the unchanged strict
27.5%/36.0% App Shell reuse baseline.
