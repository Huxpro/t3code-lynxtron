# Next Port Priorities

Generated from: historical `reports/gap-atlas.json` ordering
Evidence reconciled: 2026-08-18
Status: prioritization input; parent gaps and final5 certification are not complete

This list excludes the closed residuals GAP-001, GAP-004, GAP-005, GAP-006, GAP-008, and GAP-009. A
bounded Browser or shared-surface slice is progress only. A row becomes
`completed` only when every success criterion below is proven by the strict
manifest, production-resolver audit, focused tests, and Native evidence where
required.

| Rank | Gap     | Surface                         | Score | Current status                                                                           |
| ---: | ------- | ------------------------------- | ----: | ---------------------------------------------------------------------------------------- |
|    1 | GAP-002 | Main shell / Sidebar / Composer |    66 | open                                                                                     |
|    2 | GAP-011 | Native keyboard/focus           |    52 | blocked-runtime(R5)                                                                      |
|    3 | GAP-007 | Quick Switch                    |    51 | open                                                                                     |
|    4 | GAP-010 | Review / Changed Files          |    50 | open; one-file patch renderer and Native tap proven, multi-file/tool interactions remain |
|    5 | GAP-003 | Settings sections               |    45 | open                                                                                     |
|    6 | GAP-012 | Settings Appearance             |    39 | open                                                                                     |

## Baselines

- Current planning manifest: 6 states, 18 required pending cells, no retained
  pixels, `0 errors / 18 incomplete` in planning mode. Strict mode exits 2.
- The 2026-08-04 Native bundle
  `5a99f46f41da810421bc047485f90d6ea9310fa878d683e11ed8cd751843906b`
  is a historical runtime baseline, not the current final5 bundle.
- Historical physical reuse:
  - app shell: 6.2% modules / 4.7% LOC;
  - New Thread and Existing Thread: 16.4% / 21.2%;
  - Composer: 14.8% / 21.5%;
  - Model Picker: 2.9% / 3.5%;
  - Quick Switch: 3.2% / 2.7%;
  - Review: 3.3% / 3.0%.
- Historical weighted style coverage: 76.81% of 69,205 occurrences.
- `evidence/2026-08-04/H8/runtime-boundaries.json` preserves R5/R10 as
  structured historical negative evidence. Fresh final5 Native correlation is
  still required.

## Development Loop

Use one isolated server and one canonical snapshot for both clients:

1. Run the real T3 Web app as product authority.
2. Keep `pnpm dev` running for Rspeedy HMR.
3. Resolve the project DevTool client from the owned Lynxtron PID and listening
   port; never select by list order.
4. Reuse the same HMR process for DOM, console, geometry, route, and ordinary
   pointer checks.
5. Fresh-launch Native only for a new production bundle, viewport change,
   retained frame, cold-start case, or exhausted screencast.
6. Use authorized Computer Use only for real keyboard, focus, wheel, drag, or
   selection evidence.

`lynx.config.ts` now installs `pluginRspeedyDevReady()`, so `pnpm dev` starts the
host after the first Rspeedy compile instead of stalling before Rspack.

## 1 — GAP-002 Shared Main-Shell Composition

- Goal: compile the ordinary route/product composition from physical shared
  source and keep only bounded platform leaves.
- Progress: shared sidebar composition, route surfaces, pending-request
  surfaces, client-runtime projections, and several product atoms are shared.
- Remaining: `RootSwitch`, main ChatView orchestration, settings route owners,
  and major shell assembly remain renderer-local.
- Success:
  - app-shell module and LOC reuse materially exceed 6.2% / 4.7%;
  - no copied JSX or generated duplicate counts as shared;
  - New Thread, Existing Thread, and Settings Browser pairs remain valid;
  - each coherent extraction gets one semantic-ready Native smoke;
  - no new P0/P1 residual is introduced.

## 2 — GAP-005 Composer

- Goal: share the ordinary Web Composer owner, leaving the editor/input kernel
  as an explicit platform leaf.
- Progress:
  - reuse is now 14.8% modules / 21.5% LOC;
  - hero, docked, disabled, sendable, and working Browser states are retained;
  - Native working state and real Stop causal chain pass with zero renderer
    errors;
  - approval/question anatomy and projections are physically shared.
- Success:
  - route-owner reuse increases materially from 14.8% / 21.5%;
  - control order and model/runtime/interaction state are exact;
  - Native textarea focus, input, send, and Stop use real input channels;
  - the editor remains a named, bounded Native leaf.
- Status: `completed`. Current product-surface reuse is 26% modules / 29.3%
  LOC; shared projections own sendability, controls, context payloads, and draft
  lifecycle while the Native textarea remains the explicit platform leaf. An
  exact-owned Computer Use run proves real focus, literal input, canonical
  scoped-draft synchronization, pointer Send, canonical thread creation, exact
  authenticated OpenCode response, and successful draft clearing. Physical
  Return and text selection remain tracked under GAP-011.

## Closed — GAP-009 Light Theme

- Closed by the generated `.theme-light` / `.theme-dark` token sets, the
  host-driven system theme, and runtime root-class switching.
- Exact-bundle light Native evidence and responsive light working-thread
  evidence are retained.
- The pageConfig probe shows generic color-variable re-resolution remains
  incomplete, but the product pipeline does not depend on it. R13 is closed.

## 3 — GAP-006 Model Picker

- Goal: share provider rail, search, model rows, selected state, and empty
  anatomy with bounded platform input/menu leaves.
- Progress: default, provider rail, query, empty, and selected Browser states
  are represented; catalog/ranking projections and several surfaces are shared.
  Provider availability/lock ordering, model filtering, favorites grouping,
  selected-key resolution, and jump-row ordering now come directly from one
  `client-runtime` projection in both Web and Native; the former Native-local
  projection module has been deleted. Fresh reuse measurement is 24.2% modules
  / 31.2% LOC, and an exact-owned Native smoke still opens the picker, selects
  Terra through a real click, persists it, and dismisses without renderer errors.
- Success:
  - reuse materially exceeds 2.9% modules / 3.5% LOC;
  - provider/model ordering and selected state are exact;
  - overlay geometry, query, empty, select, and dismiss pass;
  - Native open/select/dismiss uses real taps; keyboard claims require R5.
- Status: `completed`. The route-level React owners remain platform-specific,
  while catalog, provider availability/lock ordering, favorites/search rows,
  selected-key and jump ordering, and the rendered surface anatomy are shared.
  Current product-surface reuse is 24.2% modules / 31.2% LOC. Exact-owned Native
  real taps still open the picker, select Terra, persist the selection, and
  dismiss cleanly. Numeric keyboard jumps remain solely under GAP-011.

## 4 — GAP-008 Existing Thread / Transcript

- Goal: prove identical thread content across lifecycle states and real Native
  list behavior.
- Progress: idle, working, completed, failed, approval, and question Browser
  pairs exist; approval/question projection and anatomy are shared. A 240-row
  exact-owned Native run now proves real Computer Use wheel-away and Jump to
  latest behavior on one canonical thread. A real authenticated turn also grows
  that thread from 240 to 242 messages while the detached visible range stays at
  turns 105-108, then the real Jump action exposes the new tail. Paired
  Web/Native position correlation remains open.
- Success:
  - selected thread, model, messages, and lifecycle content match;
  - Native switching, follow-tail, scroll-away, and return-to-bottom are proven
    with authorized wheel/drag input;
  - native list recycling is measured;
  - Browser evidence never substitutes for Native list interaction.
- Status: `completed`. One 240-row canonical snapshot now has fresh Electron
  entry-asset identity, Web CDP wheel-away, exact-owned Native Computer Use
  wheel-away and Jump-to-latest, bounded Native recycling, detached authenticated
  incoming growth, and zero Native renderer errors. Keyboard, focus, drag, and
  selection remain tracked under GAP-011 rather than keeping GAP-008 open.

## 5 — GAP-011 Native Keyboard / Focus

- Goal: certify New Thread, Composer, Quick Switch, and Settings keyboard paths.
- Current blocker: fresh H8 runtime probe shows
  `Input.dispatchKeyEvent` is not implemented.
- Success:
  - authorized real OS input records focus pre-state, exact key sequence, and
    visible/state postcondition;
  - no tap-equivalent or renderer-state injection substitutes for keyboard;
  - either R5 closes or remains explicitly blocked by current runtime evidence.

## 6 — GAP-007 Quick Switch

- Goal: compile Command Palette composition with a Lynx platform primitive.
- Success:
  - reuse materially exceeds 3.2% modules / 2.7% LOC;
  - default, query, actions-only, and empty results/order/copy match;
  - visible open/select/dismiss and overlay geometry pass on Native;
  - keyboard behavior is claimed only after GAP-011 passes.

## 7 — GAP-010 Review / Changed Files

- Goal: share checkpoint, changed-file tree, empty state, and an explicit patch
  renderer boundary.
- Progress: checkpoint, tree, empty, and a real one-file patch are observable
  on both renderers. Exact-bundle Native opens the patch and verifies both
  changed lines.
- Runtime boundary: Native still lacks `Worker`, `OffscreenCanvas`, and `Blob`,
  so the Web renderer itself remains a hard island.
- Success:
  - checkpoint/tree/empty composition is physically shared;
  - full patch view uses the bounded Native renderer or a future host-backed
    implementation without importing the Web DOM/Worker renderer;
  - Native interaction and content claims are retained;
  - R10 closes or remains an approved hard island.

## 8 — GAP-003 Settings Sections

- Goal: share Connections, Source Control, Beta, and Archive route owners while
  keeping platform capabilities in named host slots.
- Progress: Browser route pairs exist; Source Control loading/error semantics
  use one typed contract on Web and Lynx.
- Success:
  - each route materially exceeds its current 3.5–4.6% LOC baseline;
  - default, loading, error, retry, and mutation states match;
  - Native route stability, Back, mutation, and persistence pass;
  - no control is a silent no-op; unsupported capabilities are explicit.

## 9 — GAP-012 Settings Appearance

- Goal: make theme and wrapping controls functional and persistent.
- Success:
  - Web, Lynx, and Native expose the same supported controls;
  - theme/wrap changes have visible postconditions;
  - restart persistence passes;
  - unsupported platform choices are explicit rather than disabled without
    explanation.

## Closed Residuals

- GAP-001: closed; the old New Thread model mismatch was a Harness selector
  false positive.
- GAP-004: closed as the initial high-frequency style-contract slice; weighted
  coverage is 76.81%. This does not imply pixel parity for every page.

## Completion Rule

All ten active rows must be `completed`, `blocked(runtime-gap-id)` with fresh
external runtime evidence, or `skipped(reason)` explicitly approved by the
user. A green script, Browser-only pair, bounded slice, or documentation-only
status change cannot close a parent row.
