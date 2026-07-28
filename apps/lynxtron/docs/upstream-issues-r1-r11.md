# Upstream issue drafts: R1–R11 (2026-07-29)

Preparation for the 2026-07-29 assessment recommendation §4-3: every
`runtime-gap` in `compat-matrix.md` gets a ready-to-file issue draft for the
Lynx / Lynxtron teams. **None of these have been filed yet** — filing is an
external action for the project owner. When one is filed, record the issue URL
in the table below and in `compat-matrix.md`.

Shared environment block for every issue:

```text
Lynxtron: @lynx-js/lynxtron 0.0.5 (+ @lynx-js/lynxtron-dev-plugins 0.0.5)
ReactLynx: @lynx-js/react 0.120.0, rspeedy ^0.14.3
Host: macOS (darwin), Node >= 22
App: T3 Code Lynxtron port (t3code monorepo, apps/lynxtron, branch lynxtron-port)
```

## Filing order (by product impact)

| Priority | ID  | One-line title                                                                | Blocks                                        | Filed as |
| -------- | --- | ----------------------------------------------------------------------------- | --------------------------------------------- | -------- |
| 1        | R11 | Lynxtron 0.0.5 rejects relative async Lynx bundle URLs (`ERR_INVALID_URL`)    | T6 Sidebar V2, any code-split product surface | —        |
| 2        | R5  | No renderer-reachable keyboard event API (global shortcuts impossible)        | T7 keyboard/focus matrix, P3                  | —        |
| 3        | R3  | No preload→UI push channel; `sendGlobalEvent` is main-process only            | streaming UX (400 ms polling)                 | —        |
| 4        | R4  | TanStack `RouterProvider` async transition remount crashes BackgroundSnapshot | router architecture parity                    | —        |
| 5        | R1  | SVG content and SVG data-URIs rasterize blank                                 | all icons (lucide ecosystem)                  | —        |
| 6        | R2  | Custom font loading silently fails (`@font-face` and `lynx.addFont`)          | pixel-level typography parity                 | —        |
| 7        | R6  | `:hover` / `:focus-visible` selectors unsupported                             | hover/focus visual parity                     | —        |
| 8        | R7  | `position: fixed` / `sticky` / overflow semantics diverge                     | overlay/menu geometry                         | —        |
| 9        | R8  | Selection API absent (no text selection/copy)                                 | transcript copy UX                            | —        |
| 10       | R9  | `oklch()` / `color-mix()` unsupported by CSS parser                           | direct token consumption                      | —        |
| 11       | R10 | No DOM/Worker environment for diff patch rendering                            | full patch renderer                           | —        |

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
- **Ask**: window-local key events (or main-process normalize +
  `LynxWindow.sendGlobalEvent` into the renderer) with key/code/modifiers/
  repeat, plus focus and Tab semantics.

### R3 — No preload→UI push channel

- **Repro**: `sendGlobalEvent` exists on the main-process side only; preload
  cannot emit to the Lynx UI thread. Our connector coalesces state into
  snapshots the renderer polls every 400 ms into an Effect Atom.
- **Impact**: streaming assistant output advances in 400 ms steps; every
  event-driven UX (busy indicators, incremental transcript updates) pays the
  polling latency and cost.
- **Ask**: an event channel from preload (or main) into the renderer runtime.

### R4 — `RouterProvider` async transition remount crash

- **Repro**: mounting TanStack `RouterProvider` and performing an async route
  transition remounts the tree and crashes with a BackgroundSnapshot error.
  Current adapter is a core-router + synchronous pathname switch
  (`src/app/lib` router adapter); remove-when is a passing navigation remount
  probe.
- **Impact**: routing architecture cannot converge with Web; the switch
  renderer is permanent carried divergence until fixed.

### R1 — SVG rasterizes blank

- **Repro**: inline `<svg>` content and SVG data-URIs paint nothing on
  Lynxtron 0.0.5. Adapter: `scripts/build-icons.mjs` pre-rasterizes the
  lucide icon set to PNG at build time.
- **Impact**: every icon in the product; PNG pipeline adds build cost and
  loses vector fidelity on scale/theme changes.

### R2 — Custom fonts silently fail

- **Repro**: both CSS `@font-face` and the `lynx.addFont` API accept the
  bundled DM Sans without error, but text metrics show the system font is
  used. Remove-when: bundled DM Sans measurably affects glyph metrics.
- **Impact**: typography cannot reach pixel parity with the Electron client.

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

## Notes for the filer

- Every draft above states only what our probes recorded; attach the
  referenced evidence directory when filing.
- R5 and R11 should reference each other: both gate the same T6/T7 exits.
- After filing, update `compat-matrix.md` rows with the issue links so
  remove-when conditions become externally trackable.
