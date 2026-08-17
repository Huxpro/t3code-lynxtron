# Lynx migration gaps: consolidated analysis for upstream filing

Date: 2026-08-18. Runtime evidence:
`evidence/2026-08-18/fidelity/page-config-capabilities-current.json`.

Environment: `@lynx-js/lynxtron` 0.0.8, `@lynx-js/react` 0.120.0,
`@lynx-js/react-rsbuild-plugin` 0.16.3, Rspeedy 0.14.5,
`@lynx-js/type-config` 3.6.0, `@lynx-js/types` 3.8.0, macOS.

This document supersedes the 2026-08-17 probe-first draft from PR #1. The
runtime probes use env-gated alternate entries, exact bundle identity, owned
Lynxtron processes, DevTool geometry/computed-style reads, and zero renderer
errors. Product code does not import the probes.

## Filing table

| #   | Gap                                                   | Area       | Repo     | Priority | Status                                                     |
| --- | ----------------------------------------------------- | ---------- | -------- | -------- | ---------------------------------------------------------- |
| G1  | PrimJS/QuickJS missing modern built-ins               | JS API     | lynx     | P0       | unfiled                                                    |
| G2  | Web Encoding API and `URLSearchParams` absent         | JS API     | lynx     | P1       | unfiled                                                    |
| G3  | Async bundle URL rejected (R11)                       | Bundler    | lynxtron | P0       | filed #148                                                 |
| G4  | External custom-font URLs never reach the loader (R2) | Text       | lynxtron | P1       | confirmed, ready to file                                   |
| G5  | Renderer keyboard/global shortcut gap (R5)            | Events     | lynxtron | P0       | filed #149                                                 |
| G6  | Inline/data-URI SVG gaps (R1)                         | UI         | lynx     | P0       | unfiled                                                    |
| G7  | CSS hover/focus selectors (R6)                        | CSS/events | lynx     | P1       | confirmed CSS gap; mouse dispatch pending physical session |
| G8  | `oklch()` / `color-mix()` parser gap (R9)             | CSS        | lynx     | P1       | unfiled                                                    |
| G9  | Fixed/sticky/overflow divergence (R7)                 | Layout     | lynx     | P0       | unfiled                                                    |
| G10 | DevTool key/wheel/native-list input gaps (R12)        | Tooling    | lynxtron | P1       | filed #151                                                 |
| G11 | Preload push channel (R3)                             | IPC        | lynxtron | P1       | filed #150; closed for T3                                  |
| G12 | `RouterProvider` transition crash (R4)                | ReactLynx  | lynx     | P1       | unfiled                                                    |
| G13 | Selection API absent (R8)                             | Text       | lynx     | P1       | unfiled                                                    |
| G14 | Runtime light/dark/system theme (R13)                 | CSS/host   | product  | P1       | **closed by product pipeline**                             |
| G15 | Grid layout                                           | CSS layout | product  | P2       | **closed; runtime supported**                              |
| G16 | `backdrop-filter` unsupported                         | CSS        | lynx     | P2       | unfiled                                                    |
| G17 | DOM/Worker rendering islands                          | Capability | lynx     | P2       | discussion only                                            |
| G18 | View-transition/custom-variant syntax                 | CSS        | product  | P2       | not worth filing                                           |
| G19 | `transform-origin` ignored on desktop                 | CSS layout | lynx     | P1       | filed [lynx#8663]                                          |

## Issue #2 results

### G7 — hover and mouse events

- Lynx documentation describes Clay mouse events, but the installed public
  3.8 event typings expose `mousedown`, `mouseup`, and `mousemove` only; the
  probe uses local untyped bindings for `mouseenter`, `mouseleave`, and
  `mouseover`.
- `alignMouseEventWithW3C` is absent from both the React Rsbuild plugin 0.16.3
  options and `@lynx-js/type-config` 3.6.0. The env-gated raw config injector
  proves the key reaches the bundle and the page loads with zero renderer
  errors.
- Lynx DevTool documents `Input.emulateTouchFromMouseEvent` as converting
  mouse input to touch input. It triggers none of the six mouse handlers with
  or without the raw flag, so this is tooling-inconclusive rather than an
  engine failure.
- Classification: the CSS `:hover` / `:focus-visible` shared-style gap remains
  confirmed. The proposed shared `bindmouseenter` adapter stays blocked on one
  authorized physical mouse session; do not claim it from DevTool touch input.

### G14 — runtime theming

- The 2026-08-17 draft was stale. `generate-lynx-css.mjs` already emits
  `.theme-dark` and `.theme-light`, `ThemedApp` applies `theme-${theme}`, and
  the main process delivers system-theme changes. Exact-bundle light and dark
  evidence has shipped since 2026-08-15.
- Class swaps and `lynx.getElementById().setProperty()` both re-resolve length
  variables (`90 → 150px`, `100 → 160px`) but keep the old color value on
  desktop. `enableCSSInlineVariables` is typed by `@lynx-js/type-config` 3.6.0
  and makes inline variable lengths resolve, but inline variable colors remain
  transparent.
- Classification: G14/R13 is closed by the generated dual-token pipeline and
  host-driven root class. Incomplete generic color-variable re-resolution is a
  narrower engine behavior, not a blocker for product theme switching.

### G15 — grid

The baseline and typed-flag probes pass all requested geometry:

- explicit columns and rows with independent row/column gaps;
- `grid-column-span`;
- `grid-auto-flow: column`;
- the audited arbitrary template
  `minmax(190px,1.1fr) minmax(220px,0.85fr) minmax(210px,1fr) 60px`.

`lynx-css-support.json` now marks grid supported, the CSS audit has no
`grid*` unsupported utilities, and Git Publish provider cards use a real
two-column grid as the representative product proof. G15 is closed and should
not be filed upstream.

### G19 — transform origin

An 80px box scaled to 160px produces identical x=60 geometry for
`transform-origin: left center` and `center center`. The expected center-origin
box starts at x=20. `enableNewTransformOrigin` is typed in
`@lynx-js/type-config` 3.6.0, but true, false, and absent all produce the same
incorrect desktop geometry. This is a confirmed desktop engine gap, already
filed as [lynx#8663](https://github.com/lynx-family/lynx/issues/8663).

### G4 — font-face caveat

Bundled relative WOFF2 `@font-face` works on the default 0.0.8 path: computed
family is `Issue2 Probe Font` and the probe text width differs from generic
sans (`219px` vs `207px`). G4/R2 must therefore be filed only for external
URLs that never reach the Lynxtron resource loader.

`enableCSSRule` is absent from the installed plugin and type-config. Raw
injection reaches the bundle but disables the probe stylesheet on this stack
(`display: auto`, zero-height grid cells, empty font family), so it is not a
valid 0.0.8 workaround and must be described as an SDK-4.0 re-probe caveat.

## Filing guidance

1. Follow up on [lynx#8663](https://github.com/lynx-family/lynx/issues/8663)
   with the 0.0.8 scale geometry if maintainers need a lower-stack control.
2. File G4 narrowly for external font URLs, attaching the working bundled
   relative control.
3. Keep G7's event-adapter conclusion pending a physical mouse session; file
   only the already-confirmed CSS pseudo-selector ergonomics gap meanwhile.
4. Remove G14 and G15 from upstream filing lists.
