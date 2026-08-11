# Upstream issue drafts: R1–R11 (2026-07-29)

Preparation for the 2026-07-29 assessment recommendation §4-3: every
`runtime-gap` in `compat-matrix.md` gets a ready-to-file issue draft for the
Lynx / Lynxtron teams. R3, R5, R11, and R12 were filed on 2026-07-29 against `lynx-family/lynxtron` (URLs below, re-verified on 0.0.7); the remaining drafts target the Lynx engine (`lynx-family/lynx`) and are still unfiled.

Shared environment block for every issue:

```text
Lynxtron: @lynx-js/lynxtron 0.0.5 (+ @lynx-js/lynxtron-dev-plugins 0.0.5)
ReactLynx: @lynx-js/react 0.120.0, rspeedy ^0.14.3
Host: macOS (darwin), Node >= 22
App: T3 Code Lynxtron port (t3code monorepo, apps/lynxtron, branch lynxtron-port)
```

## Filing order (by product impact)

| Priority | ID  | One-line title                                                                | Blocks                                        | Filed as                                                   |
| -------- | --- | ----------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| 1        | R11 | Lynxtron 0.0.5 rejects relative async Lynx bundle URLs (`ERR_INVALID_URL`)    | T6 Sidebar V2, any code-split product surface | [#148](https://github.com/lynx-family/lynxtron/issues/148) |
| 2        | R5  | No renderer-reachable keyboard event API (global shortcuts impossible)        | T7 keyboard/focus matrix, P3                  | [#149](https://github.com/lynx-family/lynxtron/issues/149) |
| 3        | R3  | No preload→UI push channel; `sendGlobalEvent` is main-process only            | streaming UX (400 ms polling)                 | [#150](https://github.com/lynx-family/lynxtron/issues/150) |
| 4        | R4  | TanStack `RouterProvider` async transition remount crashes BackgroundSnapshot | router architecture parity                    | —                                                          |
| 5        | R1  | Inline SVG content and SVG data-URIs rasterize blank                          | unconverted icons (lucide ecosystem)          | —                                                          |
| 6        | R2  | External custom-font URLs do not reach the Lynxtron resource loader           | pixel-level typography parity                 | —                                                          |
| 7        | R6  | `:hover` / `:focus-visible` selectors unsupported                             | hover/focus visual parity                     | —                                                          |
| 8        | R7  | `position: fixed` / `sticky` / overflow semantics diverge                     | overlay/menu geometry                         | —                                                          |
| 9        | R8  | Selection API absent (no text selection/copy)                                 | transcript copy UX                            | —                                                          |
| 10       | R9  | `oklch()` / `color-mix()` unsupported by CSS parser                           | direct token consumption                      | —                                                          |
| 11       | R10 | No DOM/Worker environment for diff patch rendering                            | full patch renderer                           | —                                                          |

R10 is arguably a capability request rather than a bug; file it last and frame
it as "what is the supported path for worker-backed rendering islands?".

## Issue drafts

### R11 — Relative async bundle URL rejected (`ERR_INVALID_URL`)

- **Repro**: build with a `React.lazy` boundary so Rspeedy emits an async
  bundle; launch via `lynxtron ./dist/desktop`; activating the lazy branch
  fails to resolve the relative async bundle URL and the subtree disappears.
  In our probe the isolated fixture enabling Sidebar V2 produced a 794.6 kB
  async chunk that Lynxtron 0.0.5 rejected with `ERR_INVALID_URL`.
- **Evidence**: `evidence/2026-07-29/T6-C1/sidebar/sidebar-v2-probe/`
  (notes + captures; `v2-lazy-enabled.jpg` shows the failure state).
- **Impact**: no code-splitting is possible for any reachable product surface;
  large optional surfaces must ship in the main bundle.
- **Ask**: packaged/local resource loader resolves Rspeedy async bundle URLs
  relative to the app bundle directory.

### R5 — No renderer keyboard event API

- **Repro**: no Lynx element or `LynxWindow` API delivers keydown/keyup with
  modifiers/repeat to the renderer; type declarations alone were not treated
  as support (strategy P3-S1 probe list).
- **Impact**: 41 product shortcuts (⌘K quick switch, Escape overlay dismissal,
  arrow navigation, Tab focus order) cannot be implemented; current fallback
  is visible-controls-only, which the port's own gates reject as final.
- **Probe results (2026-07-29, evidence
  `evidence/2026-07-29/P3-S1/keyboard-probe/`)**: 0.0.5 declares no
  window-level key/before-input events and no `globalShortcut`; `Menu`
  accelerators are declared but headlessly untestable; renderer
  `bindkeydown`/`global-bindkeydown` types exist with an empty `BaseKeyEvent`
  detail, so key identity fields are unclear; main→renderer
  `LynxWindow.sendGlobalEvent` was verified working end to end, so the
  delivery leg of a main-normalized bridge already exists.
- **Ask**: window-local key events (or main-process key capture that can feed
  `LynxWindow.sendGlobalEvent`) with key/code/modifiers/repeat, plus focus
  and Tab semantics.

### R3 — No preload→UI push channel

- **Repro**: `sendGlobalEvent` exists on the main-process side only; preload
  cannot emit to the Lynx UI thread. Our connector coalesces state into
  snapshots the renderer polls every 400 ms into an Effect Atom.
- **Probe results (2026-07-29, evidence
  `evidence/2026-07-29/P3-S1/keyboard-probe/`)**: main→renderer
  `LynxWindow.sendGlobalEvent` works end to end (verified twice); however
  preload runs in an isolated JS realm inside the same OS process — a
  `globalThis` marker planted by main is invisible to preload — and 0.0.5
  declares no preload→main IPC, so the connector cannot relay through main.
- **Impact**: streaming assistant output advances in 400 ms steps; every
  event-driven UX (busy indicators, incremental transcript updates) pays the
  polling latency and cost.
- **Ask**: expose `sendGlobalEvent` (or any emit channel) to preload, or
  provide a preload→main channel so the existing working main→renderer
  delivery can be used as a relay.

### R4 — `RouterProvider` async transition remount crash

- **Repro**: mounting TanStack `RouterProvider` and performing an async route
  transition remounts the tree and crashes with a BackgroundSnapshot error.
  Current adapter is a core-router + synchronous pathname switch
  (`src/app/lib` router adapter); remove-when is a passing navigation remount
  probe.
- **Impact**: routing architecture cannot converge with Web; the switch
  renderer is permanent carried divergence until fixed.

### R1 — Inline SVG and SVG data-URIs rasterize blank

- **Repro**: inline `<svg>` content and SVG data-URIs paint nothing on
  Lynxtron desktop. The original 0.0.5 evidence covered only those two paths.
- **0.0.8 re-probe (2026-08-06)**: a bundle-emitted, relative
  `<svg src="/static/svg/chevron-down.…svg">` loaded and painted after the
  leaf received explicit `width` and `height`. Without explicit dimensions the
  resource parsed, but the element correctly occupied `0 × 0`. The retained
  1280 × 820 production capture reports `kind: "main"`, `lastSeq: 18`, zero
  renderer errors, a measured `12 × 12` SVG box, and a better Web-aligned
  chevron SSIM than the PNG (`0.498901` versus `0.484356`). Evidence:
  `evidence/2026-08-06/pixel-calibration/native-final-v225-external-svg-sized/`.
- **Current adapter**: use bundle-relative external SVG assets with explicit
  dimensions for measured leaves. `scripts/build-icons.mjs` remains the
  fallback for the unconverted inventory because Lynx still lacks a drop-in
  inline/current-color equivalent for Lucide components.
- **Remaining impact**: the PNG pipeline adds build cost and loses vector
  fidelity on scale/theme changes, but external SVG migration can now proceed
  incrementally rather than being treated as runtime-blocked.

### R2 — External custom-font URLs do not reach the resource loader

- **Repro**: CSS `@font-face` and `lynx.addFont` accept relative, `file://`,
  and custom-scheme font URLs without error, but Lynxtron's `protocol` handler
  receives no font request and glyph metrics remain unchanged.
- **Validated seam**: `lynx.addFont` does apply Base64-encoded WOFF2 data URLs.
  Calibrated Lynx leaves use the Web authority's bundled DM Sans through that
  path; retained system-font leaves stay on the calibrated fallback where DM
  Sans regresses their pixel match.
- **Impact**: externally loaded custom fonts still require an inline data-URL
  adapter, increasing the renderer bundle and preventing normal cacheable font
  resources.

### R6 — `:hover` / `:focus-visible` unsupported

- **Repro**: audit finds 50 `hover:text-foreground` sites and 20+
  focus-visible ring utilities in the shared Tailwind set; none paint on
  Lynx. Adapter: state-driven style variants.
- **Ask**: CSS engine support for these pseudo-classes, or a documented
  official state-driven substitute.

### R7 — fixed/sticky/overflow semantics diverge

- **Repro**: per-component probes; one concrete production defect: a Sidebar
  overlay menu collapsed all three rows into one zero-height box, making
  "Rename" dispatch "Delete" (fixed with explicit non-shrinking 30 px rows +
  sibling backdrop). Evidence:
  `evidence/2026-07-28/T6-C1/sidebar/actions-runtime/`.
- **Ask**: documented layout conformance for fixed/sticky/overflow, or a
  conformance suite we can run per runtime release.

### R8 — Selection API absent

- **Repro**: no renderer text selection; markdown copy and message selection
  are impossible. Adapter: explicit per-block copy buttons.

### R9 — `oklch()` / `color-mix()` unsupported

- **Repro**: the Web theme's ~110 tokens use oklch/color-mix; the Lynx CSS
  parser rejects them. Adapter: deterministic build-time token resolution
  (`generate:css`) into resolved values.
- **Ask**: parser support so generated CSS can consume upstream tokens
  verbatim.

### R10 — No DOM/Worker patch-rendering environment

- **Repro/context**: the Web diff renderer (@pierre/diffs) requires
  DOM/Worker capabilities absent in Lynx. Adapter: canonical checkpoint file
  tree + aggregate stats only.
- **Ask**: guidance on the supported path for worker-backed rendering islands
  (or native rich-diff primitives).

### R12 — DevTool input emulation cannot scroll (filed as [lynxtron#151](https://github.com/lynx-family/lynxtron/issues/151))

- **Repro**: with a Lynxtron 0.0.5 desktop client attached to Lynx DevTool,
  `Input.emulateTouchFromMouseEvent` taps (pressed/released) work, but no
  variant scrolls a `<list>`: press + move sequences (with and without
  `buttons: 1`), `Input.dispatchTouchEvent` touchStart/Move/End, and
  `type: "mouseWheel"` all leave element box models unchanged.
- **Impact**: scroll-dependent interaction certification (chat transcript
  follow/detach, any scrollable surface) cannot be driven headlessly; only
  tap-based passes are automatable. Also relevant: repeated CDP DOM
  inspection wedges the single screencast frame, so at most one screenshot
  per fresh session is reliable.
- **Ask**: support drag or wheel scrolling in DevTool input emulation (and
  ideally re-armable screencast frames).

## Notes for the filer

- Every draft above states only what our probes recorded; attach the
  referenced evidence directory when filing.
- R5 and R11 should reference each other: both gate the same T6/T7 exits.
- After filing, update `compat-matrix.md` rows with the issue links so
  remove-when conditions become externally trackable.
