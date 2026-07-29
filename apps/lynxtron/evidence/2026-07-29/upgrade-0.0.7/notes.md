# Lynxtron 0.0.5 → 0.0.7 upgrade and R-list re-probe

- Date: 2026-07-29
- Change: `@lynx-js/lynxtron` and `@lynx-js/lynxtron-dev-plugins` bumped
  0.0.5 → 0.0.7 (latest published; the `v0.0.1-alpha.*` releases after
  v0.0.7 are a separate channel).
- Build: Tailwind v3/Rspeedy renderer + Rspack host + connector all pass;
  renderer bundle 2,108.9 kB. Host and app typecheck unchanged (0 / 233
  pre-existing web-graph errors).
- Runtime sanity: `transcript-1280x820.jpg` — fresh 0.0.7 session over the
  same eight-prompt snapshot, zero DevTool renderer errors, 2560 × 1640
  physical (true 1280 × 820).

## What 0.0.7 changes (v0.0.5...v0.0.7, 22 commits)

- **New `lynxBridge` main-process API**: `lynxBridge.handle(method, handler)`
  answers renderer-side `bridge.call(method, args)` with replies — a typed
  renderer→main invoke channel.
- **Lynx `fetch` support in Lynxtron** (renderer networking): not adopted —
  our architecture deliberately keeps all transport in the Node connector.
- Stability/packaging fixes (V8 single-threading, libuv teardown, macOS
  frameworks/menu, logbox URL); `will-enter/leave-full-screen` events
  removed (unused by us).
- The upstream `file:` URL loader bugfix (routes file URLs through the local
  bundle loader) landed on main **after** v0.0.7 — potentially relevant to
  R11 but not in this release.

## Re-probe results on 0.0.7

| Gap                  | 0.0.5 result                                                                         | 0.0.7 result                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R3 push channel      | main→renderer `sendGlobalEvent` works; preload isolated realm                        | **unchanged** (probe re-run: `returned true`, renderer receipt logged, `mainPidMarker=undefined sharedWindowHandle=no`). `lynxBridge` adds renderer→main invoke but still no preload→UI emit. |
| R5 keyboard          | no window-level key events, no `globalShortcut`; Menu accelerators declared          | **unchanged** — no new keyboard API in 0.0.7.                                                                                                                                                 |
| R11 async bundle URL | `ERR_INVALID_URL` on relative async bundles                                          | **not empirically retested** (no lazy branch in the product); the post-0.0.7 file-URL loader fix may address it — asked upstream in the issue.                                                |
| R12 DevTool input    | taps only; drags/touch/wheel zero movement; `Input.dispatchKeyEvent` Not implemented | **unchanged** (drag probe: element top 430→430, no pill; wheel: no movement; `dispatchKeyEvent` still Not implemented).                                                                       |

## Consequences

- The upgrade is safe and adopted; no product behavior change observed.
- `lynxBridge` is the natural future home for typed renderer→host calls
  (today they ride `NativeModules.nodejs.exposed`); registered as an
  option, not adopted in this slice.
- R3, R5, R12 filed as upstream issues (URLs in `compat-matrix.md`), R11
  filed with a request to confirm against the pending file-URL loader fix.
