# Lynx migration gaps: consolidated analysis for upstream filing

Date: 2026-08-17. Sources: `compat-matrix.md` (R1–R13), `upstream-issues-r1-r11.md`,
`port-ledger.md`, `implementation-status.md` (Plan 10/11 records, 0.0.7/0.0.8
re-probes), `reports/css-audit.json` (1,514 static utilities, 95 unsupported),
`reports/web-api-audit.json` (61 APIs, 700+ call sites), `src/app/overrides.css`
gap comments, and `lynx.config.ts` polyfill banners.

Purpose: one prioritized list of every platform gap the T3 Code → Lynx port hit,
scored by product impact (**P0–P2**) and estimated upstream effort
(**S** days / **M** weeks / **L** months / **XL** architectural), so we can file
the remaining issues against `lynx-family/lynx` and follow up on the four
already filed against `lynx-family/lynxtron` (#148–#151).

Environment for all findings: `@lynx-js/lynxtron` 0.0.8, `@lynx-js/react`
0.120.0, rspeedy 0.14.x, macOS, Node ≥ 22.

## Summary table (sorted by filing priority)

| #   | Gap                                                                  | Area          | Repo     | Priority | Effort | Low-hanging? | Status            |
| --- | -------------------------------------------------------------------- | ------------- | -------- | -------- | ------ | ------------ | ----------------- |
| G1  | PrimJS/QuickJS missing ES2021+ builtins (`replaceAll`, `toSorted`, `findLast`, negative `at`) | JS API        | lynx     | P0       | S      | **Yes**      | unfiled           |
| G2  | Web Encoding API (`TextEncoder`/`TextDecoder`) and `URLSearchParams` absent from runtime | JS API        | lynx     | P1       | S      | **Yes**      | unfiled           |
| G3  | Async/lazy bundle URL rejected (`ERR_INVALID_URL`) — no code splitting (R11) | Bundler/shell | lynxtron | P0       | S–M    | **Yes**      | filed [#148]      |
| G4  | Custom fonts silently fail: `@font-face` and `lynx.addFont` no-op without error (R2) | UI/text       | lynx     | P1       | S (diagnostics) / M (fix) | **Yes** (error surfacing) | unfiled |
| G5  | No renderer keyboard events, no `globalShortcut` (R5)                | Events/shell  | lynxtron | P0       | M      | No           | filed [#149]      |
| G6  | SVG (inline and data-URI) rasterizes blank (R1)                      | UI element    | lynx     | P0       | M–L    | No           | unfiled           |
| G7  | `:hover` / `:focus-visible` / `group-hover` pseudo-classes unsupported (R6) | CSS           | lynx     | P1       | M      | Partially    | **re-probe first** — Lynx 3.8 documents full mouse events (see below) |
| G8  | `oklch()` / `color-mix()` rejected by CSS parser (R9)                | CSS           | lynx     | P1       | M      | Partially    | unfiled           |
| G9  | `position: fixed` / `sticky` / overflow semantics diverge (R7)       | CSS layout    | lynx     | P0       | L      | No           | unfiled           |
| G10 | DevTool input emulation tap-only; `Input.dispatchKeyEvent` unimplemented; screencast wedges (R12) | Tooling       | lynxtron | P1       | M      | Partially    | filed [#151]      |
| G11 | No preload→UI push channel; preload is an isolated realm (R3)        | IPC/shell     | lynxtron | P1       | M      | No           | filed [#150]      |
| G12 | TanStack `RouterProvider` async transition remount crashes BackgroundSnapshot (R4) | ReactLynx     | lynx     | P1       | M      | No           | unfiled           |
| G13 | Selection API absent — no text selection or copy (R8)                | UI element    | lynx     | P1       | L      | No           | unfiled           |
| G14 | No runtime theme switching / `prefers-color-scheme`; dark-only pipeline (R13) | CSS           | lynx     | P1       | M      | **Maybe**    | **re-probe first** — runtime CSS-variable switching is the documented theming path |
| G15 | `display: grid` unsupported (55 sites)                               | CSS layout    | lynx     | P2       | XL     | **Maybe**    | **re-probe first** — `display: grid` is documented and typed in Lynx 3.8 |
| G16 | `backdrop-filter` unsupported (16 sites)                             | CSS           | lynx     | P2       | L      | No           | unfiled           |
| G17 | No DOM/Worker environment for rendering islands (diff renderer) (R10) | Capability    | lynx     | P2       | XL     | No           | unfiled (frame as question) |
| G18 | `::view-transition` / `@custom-variant` (Tailwind v4 syntax) dropped | CSS           | lynx     | P2       | —      | —            | not worth filing  |

[#148]: https://github.com/lynx-family/lynxtron/issues/148
[#149]: https://github.com/lynx-family/lynxtron/issues/149
[#150]: https://github.com/lynx-family/lynxtron/issues/150
[#151]: https://github.com/lynx-family/lynxtron/issues/151

## Low-hanging fruit (file first)

These are small, well-scoped engine changes with outsized product value, and
each one currently fails **silently**, which is the worst failure mode:

- **G1 — missing ES builtins.** Shared presentation modules crashed at runtime
  on the main thread until we audited every `replaceAll`, `toSorted`,
  `findLast`, and negative-index `at` call out of renderer-reachable code
  (`implementation-status.md`, "Completed foundation"). This is a pure PrimJS
  library addition; ES2021–ES2023 methods are spec-stable. Silent divergence
  from every other JS runtime makes shared Web/Lynx code actively dangerous —
  the exact code-sharing story Lynx markets.
- **G2 — Encoding API / URLSearchParams.** `@effect/atom-react` dev builds
  require `TextEncoder`; we ship a hand-rolled UTF-8 polyfill in a Rspeedy
  banner (`lynx.config.ts:53`) and `url-search-params-polyfill`. Both are
  ubiquitous library dependencies; bundling them into the runtime is small.
- **G3 (#148) — async bundle URL.** `/async/./…bundle` fails URL normalization
  in the local file loader. Path-resolution bug, not architecture. Until fixed,
  **zero code splitting is possible**: the 794.6 kB Sidebar V2 experiment had
  to be folded back into an eager 2.3 MB main bundle. Re-verified failing on
  0.0.8 even after the upstream file-URL loader fix.
- **G4 — silent font failure.** Both CSS `@font-face` and the imperative
  `lynx.addFont` accept DM Sans without error, then render the system font.
  Even before real font loading is fixed, surfacing a load error would convert
  a debugging session into a known limitation.

## High-impact but harder (file with evidence, expect longer horizon)

- **G5 (#149) — renderer keyboard.** 41 product shortcuts (⌘K, Escape, arrows,
  Tab focus) are unimplementable. 0.0.8 still declares no window-level key
  events and no `globalShortcut`; `bindkeydown` types exist with an empty
  `BaseKeyEvent` detail. Our partial workaround (native `Menu` accelerators →
  `sendGlobalEvent` packets → shared keybinding resolver) covers exactly three
  discrete commands and cannot express Escape/arrows/Tab. A desktop-class app
  is not shippable without this; it gates our `electron-replacement-candidate`
  classification.
- **G6 — SVG.** Every icon (lucide ecosystem) paints blank. Workaround is a
  build-time PNG rasterization pipeline (`build-icons.mjs`) that added ~78 kB
  to the bundle in AR3 alone, loses vector fidelity on scale, and forecloses
  runtime theming of icon strokes. Filing ask: any of (a) SVG rendering,
  (b) documented image-format matrix, (c) a first-party icon-font path.
- **G9 — fixed/sticky/overflow conformance.** Not just missing features:
  **divergent semantics caused a real correctness bug** — a sidebar overlay
  menu collapsed three rows into one zero-height box so tapping "Rename"
  dispatched "Delete" (evidence `2026-07-28/T6-C1/sidebar/actions-runtime/`).
  Realistic ask is a published layout-conformance suite we can run per
  release, rather than full parity at once.
- **G7 — hover/focus pseudo-classes.** 95 unsupported utilities in the audit
  are dominated by hover/focus variants (52× `hover:text-foreground`, 35×
  focus-visible rings, `group-hover`). Workaround is JS state-driven styles
  per component, which forks the shared Tailwind styling layer. `:hover` on a
  desktop runtime is table stakes; `:focus-visible` depends on G5's focus
  model, so file them together but expect staged delivery.
- **G8 — modern color functions.** ~110 Web theme tokens use
  `oklch()`/`color-mix()` (57 `color-mix` sites). We run a deterministic
  build-time resolver (`generate:css`) so tokens can never be consumed
  verbatim, and every upstream theme change requires regeneration. Color
  parsing/interpolation is contained in the CSS value parser — medium, not
  architectural.
- **G12 — RouterProvider crash.** Mounting TanStack `RouterProvider` and doing
  an async transition remounts the tree and crashes with a BackgroundSnapshot
  error. We carry a permanent custom router (`router.ts` pathname switch) as
  divergence. Likely a ReactLynx reconciler bug (background-thread snapshot
  invalidation on remount), so it deserves a minimal repro filed against the
  engine repo.
- **G13 — Selection API.** No transcript text selection; per-block copy
  buttons are a partial substitute and line-selection annotations in the
  Files surface stay gated. Engine-level text selection is genuinely large;
  file it as a roadmap request with the copy-button workaround documented.
- **G14 — theming.** No `prefers-color-scheme`, no runtime token switching;
  our pipeline ships dark-only (R13) while Web supports light/dark/system.
  Partially self-inflicted (we resolve variables at build time because of G8),
  but a supported runtime CSS-variable/theme-switch story would remove the
  whole class of build-time forking.

## Deprioritized / not worth filing as-is

- **G15 grid (XL):** flex rewrites are tolerable indefinitely; a grid engine
  is a multi-quarter ask. Register interest, don't block on it.
- **G16 backdrop-filter (L):** flattened opaque surfaces are an acceptable
  visual compromise; compositor work is expensive.
- **G17 DOM/Worker islands (XL):** the honest framing is a capability
  question ("what is the supported path for worker-backed rendering
  islands?"), not a bug report. File last, as a discussion.
- **G18 view-transition/custom-variant:** progressive enhancement; dropping
  them costs nothing measurable.
- **G11 (#150) preload push:** closed for our architecture by the main-owned
  connector (AR2); keep the upstream issue open for other embedders but stop
  investing.

## Cross-cutting observations worth stating in every issue

1. **Silent failure is the dominant tax.** Fonts (G4), SVG (G6), missing
   builtins (G1), and pseudo-classes (G7) all fail without any warning. Even
   where the fix is far off, a diagnostic (parse warning, load error, missing
   API log) would have saved the majority of our probe time. Cheap for
   upstream, huge for adopters.
2. **Headless verifiability gates certification.** R12 (#151) means keyboard,
   focus, wheel, drag, and selection behavior can only be certified in a live
   user session. DevTool input parity (key dispatch + drag/wheel scroll +
   re-armable screencast) multiplies the value of every other fix because it
   makes them CI-provable.
3. **Every gap row should carry its remove-when condition** (as
   `compat-matrix.md` already does), so upstream fixes can be adopted and the
   adapter deleted mechanically.

## 2026-08-17 addendum: pageConfig switches and classification corrections

A review of engine `pageConfig` flags and current lynxjs.org docs shows several
of our `runtime-gap`/`rewrite` classifications were recorded against defaults
or stale support tables, not against the engine's actual ceiling. Before filing
G4/G7/G14/G15 upstream, run the probes below — filing a gap the engine already
covers burns credibility for the asks that are real.

Current build state: `lynx.config.ts` passes only
`pluginReactLynx({ enableCSSInheritance: true })`. No other pageConfig flag is
set anywhere in the repo. `@lynx-js/react-rsbuild-plugin` 0.16.3 typings expose:
`customCSSInheritanceList`, `defaultDisplayLinear`, `enableAccessibilityElement`,
`enableCSSInheritance`, `enableCSSInvalidation`, `enableCSSSelector`,
`enableNewGesture`, `enableRemoveCSSScope`, `enableSSR`,
`removeDescendantSelectorScope`, `targetSdkVersion`.

| Switch | Verified? | Bears on | Verdict |
| --- | --- | --- | --- |
| `enableCSSInheritance` | already enabled by us | theming, text styles | No change; consider `customCSSInheritanceList` for remaining explicit-inheritance overrides. |
| `alignMouseEventWithW3C` | yes — documented, Lynx 3.8+, set via `pluginReactLynx` pageConfig | G7 (hover) | The flag itself only aligns `button`/`buttons` semantics. The larger find is the page documenting it: Lynx 3.8 supports `mousedown/up/move/enter/leave/over`. Our hover adapters assumed tap-only input. **Probe whether Lynxtron desktop dispatches mouse events**; if yes, a single shared `bindmouseenter/leave` hover adapter replaces per-component state hacks, and the upstream ask narrows to CSS `:hover` sugar. Not in 0.16.3 plugin typings — may need a plugin upgrade or untyped passthrough. |
| `enableCSSInlineVariables` | referenced in official Vue-Lynx docs (`--*` in inline styles / `:style` runtime variable sets) | G14/R13 (theme) | Runtime CSS-variable switching (`setProperty`, class-based token swap) is the **documented** Lynx theming path. R13 is therefore likely our pipeline's gap, not the engine's: emit both token sets as variables (still build-resolving oklch/color-mix per G8) and flip a root class at runtime. Probe on Lynxtron desktop; if variables re-resolve, close R13 ourselves and drop G14 from the filing list. |
| `enableCSSRule` | **not found** in public lynxjs.org docs or 0.16.3 typings (reported as SDK 4.0+, default false, gating `@media`/`@supports`/`@keyframes`/`@font-face`/`@layer` unified parsing) | G4 (fonts), theming | Cannot confirm from public sources at our SDK level (types 3.8.0). Note `@font-face` **is** documented as supported in stable docs (with no `font-style`/`font-weight`/`font-variant` descriptors), which strengthens the case that R2's silent failure is a Lynxtron-desktop bug rather than a missing engine feature — but any R2 issue must state which SDK and whether this flag existed/was set, or the report risks being closed as misconfiguration. Re-probe after any SDK 4.0 upgrade. |
| `enableNewTransformOrigin` | flag not found in public docs/typings; `transform-origin` itself is a documented supported property | (new) | The port ledger has **no recorded transform-origin failure** — if the top-left-origin symptom came from the standalone prototype, reproduce it on the current stack and confirm which algorithm path desktop takes before drafting anything. |

Corrections to the gap list:

- **G15 (grid) is likely not an engine gap.** `display: grid` is documented,
  `@lynx-js/types` 3.8.0 types the full property set (`grid-template-columns/rows`,
  `grid-auto-*`, `grid-*-span/start/end`, gaps, `grid-auto-flow`), and
  `@lynx-js/tailwind-preset` ships grid utilities. Our audit counted 55 `grid`
  sites as unsupported from a static support table, and the flex rewrites were
  done without a recorded runtime probe. Action: runtime-probe grid on Lynxtron
  desktop (including the audit's arbitrary-value templates using `minmax()`/`fr`);
  update the audit's support table; the residual upstream ask, if any, is
  "document/complete the grid value subset (`minmax`, `fr`, `auto-fill`,
  `grid-template-areas`)", effort M, not XL.
- **G14 (theme) downgrades to probe-first** per `enableCSSInlineVariables` above.
  `prefers-color-scheme` remains unverified — the stable at-rules page lists
  only `@font-face`/`@import`/`@keyframes` — but on desktop the OS theme can
  be delivered by the main process anyway, so the media query is a
  nice-to-have, not the blocker.
- **G7 (hover) narrows.** With mouse events available the product-side cost of
  the state-driven workaround drops sharply; keep the `:hover`/`:focus-visible`
  ask but re-frame it as ergonomics (CSS parity for shared Tailwind styles)
  rather than a hard capability gap. `:focus-visible` stays coupled to G5's
  focus model.
- **New probe checklist before the next filing round:** desktop mouse-event
  dispatch; CSS variables runtime re-resolution (+ inline `--*` with the flag);
  grid incl. `minmax()`/`fr`; transform-origin on desktop; `@font-face` with
  the SDK-4.0 rule path if/when available.

## Suggested filing order

1. G1, G2 (engine, S — likely quick accepts, immediate shared-code payoff)
2. Follow up on #148 (G3) with the 0.0.8 re-probe evidence already recorded
3. G4 (diagnostics ask first), G6, G9 (attach the Rename→Delete evidence)
4. G7 + G8 together (they share the "generated CSS adapter" story), G12 repro
5. G13, G14 as roadmap requests; follow up on #149/#151
6. G17 as a discussion thread; register G15/G16 interest without pressure
