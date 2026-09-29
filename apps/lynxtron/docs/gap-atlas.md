# Plan 11C residual atlas

Generated: 2026-09-29T19:23:41.091Z

This atlas combines strict evidence, production-resolver physical reuse,
weighted style coverage, and registered Native runtime boundaries. Missing
three-client evidence lowers confidence; it does not silently pass a gap.

## Summary

- Gaps: 14
- P0: 1
- P1: 8
- P2: 3
- Incomplete required evidence cells: 0
- Blocked required evidence cells: 0

| ID      | Severity | Category           | Surface                                                | Score | Disposition     | Owner                                                         |
| ------- | -------- | ------------------ | ------------------------------------------------------ | ----: | --------------- | ------------------------------------------------------------- |
| GAP-002 | P0       | SOURCE_REUSE       | Main shell / Sidebar / Composer                        |    66 | closed          | Web route composition and Lynx platform leaves                |
| GAP-004 | P1       | MATERIAL           | All ordinary UI                                        |    61 | closed          | Tailwind v3 compatibility layer and shared tokens/primitives  |
| GAP-005 | P1       | SOURCE_REUSE       | Composer                                               |    58 | closed          | ChatComposer / Composer shared composition                    |
| GAP-009 | P1       | RUNTIME_CAPABILITY | Light theme                                            |    56 | closed          | generated Lynx tokens and runtime theme host                  |
| GAP-006 | P1       | SOURCE_REUSE       | Model Picker                                           |    55 | closed          | ProviderModelPicker / ModelPicker composition                 |
| GAP-008 | P1       | INTERACTION        | Existing thread / Transcript                           |    55 | closed          | MessagesTimeline shared rows and Native list host             |
| GAP-011 | P1       | RUNTIME_CAPABILITY | Native keyboard/focus                                  |    52 | blocked-runtime | Lynxtron host input and menu accelerator bridge               |
| GAP-007 | P1       | SOURCE_REUSE       | Quick Switch                                           |    51 | closed          | CommandPalette composition / QuickSwitch host                 |
| GAP-010 | P1       | RUNTIME_CAPABILITY | Review / Changed Files                                 |    50 | closed          | DiffPanel / changed-files composition and R10 renderer island |
| GAP-003 | P2       | SOURCE_REUSE       | Settings Connections / Source Control / Beta / Archive |    45 | closed          | Settings route panels and platform host slots                 |
| GAP-012 | P2       | INTERACTION        | Settings Appearance                                    |    39 | closed          | AppearanceSettingsSurface and runtime preferences             |
| GAP-014 | P3       | SHARED_PRIMITIVE   | Composer runtime menu                                  |    24 | open            | Composer runtime menu (local popup and dismiss layer)         |
| GAP-013 | P2       | RUNTIME_CAPABILITY | Composer image input                                   |    23 | blocked-runtime | Lynxtron host drag-and-drop bridge                            |
| GAP-001 | P3       | HARNESS_INVALID    | Main shell / New Thread                                |    21 | closed          | Plan 11C workbench state-echo selector                        |

## GAP-002 — Main shell / Sidebar / Composer

- Severity/category: `P0` / `SOURCE_REUSE`
- Priority score: 66
- User impact: Closed: the main shell, Sidebar V2 anatomy, Chat header, Composer surface, and product-state projections are shared; remaining code is renderer or transport hosting.
- Clients/states: web, lynx, native / all primary states
- Source owner: Web route composition and Lynx platform leaves
- Likely root cause: Closed by deletion-driven convergence onto shared composition and client-runtime presentation modules, with explicit platform leaves.
- Fix class: `shared composition`
- Physical reuse: 6.7% modules / 4.8% LOC
- Weighted style risk occurrences: 4769
- Native requirement: satisfied by per-slice Native interaction and runtime certification
- Disposition: `closed`
- Evidence:
  - `reports/reuse/current.json`
  - `docs/harness/h5-reuse-style-audit.md`
  - `evidence/2026-09-12/fidelity/main-shell-source-reuse-current.json`
  - `evidence/2026-09-12/fidelity/composer-real-input-current.json`
  - `evidence/2026-09-12/fidelity/model-picker-shared-projection-current.json`
  - `evidence/2026-09-12/fidelity/quick-switch-real-input-current.json`

## GAP-004 — All ordinary UI

- Severity/category: `P1` / `MATERIAL`
- Priority score: 61
- User impact: The initial weighted style contract exposed broad utility drift; the first high-frequency Native-safe slice is now patched.
- Clients/states: lynx, native / all
- Source owner: Tailwind v3 compatibility layer and shared tokens/primitives
- Likely root cause: The Lynx preset omits high-frequency Web utilities; reusable Native-safe mappings now live in the shared override layer.
- Fix class: `shared token`
- Physical reuse: 8.7% modules / 8.2% LOC
- Weighted style risk occurrences: 5258
- Native requirement: Native specimen batch after Browser calibration
- Disposition: `closed`
- Evidence:
  - `reports/gap-atlas.json`
  - `docs/harness/h5-reuse-style-audit.md`

## GAP-005 — Composer

- Severity/category: `P1` / `SOURCE_REUSE`
- Priority score: 58
- User impact: The primary input surface has only 5.9% module / 6.8% LOC reuse at product-surface scope.
- Clients/states: web, lynx, native / hero, docked, sendable, working, disabled
- Source owner: ChatComposer / Composer shared composition
- Likely root cause: Closed by shared Composer surfaces and projections with the Native textarea retained as an explicit platform leaf.
- Fix class: `shared composition`
- Physical reuse: 5.9% modules / 6.8% LOC
- Weighted style risk occurrences: 5258
- Native requirement: satisfied for focus, literal input, physical Return send, pointer send, and Stop; text selection remains GAP-011
- Disposition: `closed`
- Evidence:
  - `reports/reuse/current.json`
  - `evidence/2026-09-12/fidelity/composer-real-input-current.json`
  - `evidence/2026-09-12/fidelity/composer-element-context-paired-current.json`
  - `evidence/2026-09-12/fidelity/composer-attachment-paired-current.json`

## GAP-009 — Light theme

- Severity/category: `P1` / `RUNTIME_CAPABILITY`
- Priority score: 56
- User impact: Closed: Web and Lynx support light/dark/system through generated dual token sets and the host-driven root theme class.
- Clients/states: web, lynx, native / all primary surfaces
- Source owner: generated Lynx tokens and runtime theme host
- Likely root cause: The historical atlas predated the dual token generator, system-theme host, and exact-bundle light/dark evidence.
- Fix class: `product pipeline`
- Physical reuse: 8.7% modules / 8.2% LOC
- Weighted style risk occurrences: 5258
- Native requirement: completed exact-bundle light/dark Native evidence
- Disposition: `closed`
- Evidence:
  - `compat-matrix.md#R13`
  - `evidence/2026-08-15/fidelity/new-thread-hero-light-current-metrics.json`
  - `evidence/2026-08-16/fidelity/existing-thread-working-light-responsive-current-metrics.json`
  - `evidence/2026-08-18/fidelity/page-config-capabilities-current.json`

## GAP-006 — Model Picker

- Severity/category: `P1` / `SOURCE_REUSE`
- Priority score: 55
- User impact: Model selection is high-frequency and currently has 2.9% module / 3.1% LOC reuse.
- Clients/states: web, lynx, native / default, provider rail, query, empty, selected
- Source owner: ProviderModelPicker / ModelPicker composition
- Likely root cause: Closed by shared catalog, provider/row projection, and shared surface anatomy with platform-specific input leaves.
- Fix class: `shared composition`
- Physical reuse: 2.9% modules / 3.1% LOC
- Weighted style risk occurrences: 4557
- Native requirement: satisfied: real open/select/dismiss/focus/typing; focused-input Arrow, Return, and numeric shortcuts remain GAP-011
- Disposition: `closed`
- Evidence:
  - `reports/reuse/current.json`
  - `evidence/manifests/main-shell.json#model-picker-default`
  - `evidence/2026-08-24/fidelity/model-picker-native-interaction-repair.json`
  - `evidence/2026-08-27/fidelity/model-picker-native-input-focus.json`
  - `evidence/2026-09-11/fidelity/model-picker-focused-jump-runtime-boundary.json`

## GAP-008 — Existing thread / Transcript

- Severity/category: `P1` / `INTERACTION`
- Priority score: 55
- User impact: Closed: same-thread lifecycle, Native physical wheel/follow, detached incoming growth, and same-snapshot Web/Native tail-position semantics are verified.
- Clients/states: web, lynx, native / idle, working, completed, failed, approval, question
- Source owner: MessagesTimeline shared rows and Native list host
- Likely root cause: Closed by one canonical long-thread fixture plus Web CDP wheel and exact-owned Native Computer Use wheel/Jump evidence.
- Fix class: `platform primitive`
- Physical reuse: 8.7% modules / 8.2% LOC
- Weighted style risk occurrences: 5258
- Native requirement: satisfied: real list wheel/follow and state switching
- Disposition: `closed`
- Evidence:
  - `evidence/manifests/main-shell.json#existing-thread-idle`
  - `evidence/2026-09-10/fidelity/transcript-follow-state-current.json`
  - `compat-matrix.md#R12`

## GAP-011 — Native keyboard/focus

- Severity/category: `P1` / `RUNTIME_CAPABILITY`
- Priority score: 52
- User impact: Model Picker keyboard selection and Composer Command+A selection remain unavailable even though Quick Switch Arrow/Return, Composer Return, and Escape now pass physical input.
- Clients/states: native / Model Picker, Composer selection
- Source owner: Lynxtron host input and menu accelerator bridge
- Likely root cause: The focused Model Picker input does not propagate Arrow or Return to its container, while Lynxtron's macOS menu bridge cannot encode Arrow keys; focused Native text controls also do not receive Command+A selection.
- Fix class: `runtime capability`
- Physical reuse: not audited
- Weighted style risk occurrences: 3854
- Native requirement: physical Arrow/Return is satisfied for Quick Switch and Return for Composer; Model Picker keyboard selection and Composer Command+A selection require an upstream runtime change
- Disposition: `blocked-runtime`
- Evidence:
  - `compat-matrix.md#R5`
  - `evidence/2026-09-12/fidelity/native-return-bridge-current.json`

## GAP-007 — Quick Switch

- Severity/category: `P1` / `SOURCE_REUSE`
- Priority score: 51
- User impact: The global navigation overlay has unavailable reuse metrics; default evidence is retained while query/empty input states remain blocked by the Lynx-for-Web input path.
- Clients/states: web, lynx, native / default, query, actions-only, empty
- Source owner: CommandPalette composition / QuickSwitch host
- Likely root cause: Closed by shared search, thread presentation, and surface composition with platform-specific input leaves.
- Fix class: `shared composition`
- Physical reuse: not audited
- Weighted style risk occurrences: 3854
- Native requirement: satisfied for Command+K, focus, literal query, pointer and Return selection, Arrow navigation, and Escape
- Disposition: `closed`
- Evidence:
  - `reports/reuse/current.json`
  - `evidence/manifests/main-shell.json#quick-switch-default`
  - `evidence/2026-09-12/fidelity/quick-switch-real-input-current.json`
  - `evidence/2026-08-27/fidelity/quick-switch-native-filter-states.json`

## GAP-010 — Review / Changed Files

- Severity/category: `P1` / `RUNTIME_CAPABILITY`
- Priority score: 50
- User impact: Closed: checkpoint, tree, diff, empty, multi-file rendering, and visible diff tools are available through the Native fallback.
- Clients/states: web, lynx, native / checkpoint, tree, diff, empty
- Source owner: DiffPanel / changed-files composition and R10 renderer island
- Likely root cause: Closed by the Native diff renderer fallback plus repeatable multi-file semantic checks and exact-owned physical pointer evidence.
- Fix class: `hard island`
- Physical reuse: not audited
- Weighted style risk occurrences: 4085
- Native requirement: satisfied by explicit Native fallback and real multi-file tool interaction
- Disposition: `closed`
- Evidence:
  - `reports/reuse/current.json`
  - `compat-matrix.md#R10`
  - `evidence/2026-09-11/fidelity/review-diff-semantic-current.json`
  - `evidence/2026-09-12/fidelity/review-multi-file-real-input-current.json`

## GAP-003 — Settings Connections / Source Control / Beta / Archive

- Severity/category: `P2` / `SOURCE_REUSE`
- Priority score: 45
- User impact: Closed: shared Settings anatomy and platform capability hosts cover Connections, Source Control, Archive, and the intentional Beta-to-General consolidation.
- Clients/states: web, lynx, native / default, loading, error, mutation
- Source owner: Settings route panels and platform host slots
- Likely root cause: Closed after correcting the production roots, measuring 22.4%-35.6% product-surface reuse, and verifying platform mutations and reverse states.
- Fix class: `shared composition`
- Physical reuse: not audited
- Weighted style risk occurrences: 4335
- Native requirement: satisfied by loading, error/retry, mutation, reverse-state, and cold-restart checks
- Disposition: `closed`
- Evidence:
  - `reports/reuse/current.json`
  - `evidence/2026-09-12/fidelity/settings-platform-hosts-current.json`
  - `evidence/2026-09-03/fidelity/settings-beta-mutation-native.json`
  - `evidence/2026-08-16/fidelity/settings-archive-mutation-current-metrics.json`
  - `evidence/2026-09-03/fidelity/settings-connections-authorized-actions.json`
  - `evidence/2026-09-05/fidelity/settings-source-control-error-refresh.json`

## GAP-012 — Settings Appearance

- Severity/category: `P2` / `INTERACTION`
- Priority score: 39
- User impact: Closed: theme, glass opacity, environment identification, and word wrap have real persisted Native controls.
- Clients/states: web, lynx, native / General appearance, theme, wrap, identification
- Source owner: AppearanceSettingsSurface and runtime preferences
- Likely root cause: Closed by wiring the shared Appearance anatomy to canonical portable client settings and Native material/consumer hosts.
- Fix class: `host adapter`
- Physical reuse: not audited
- Weighted style risk occurrences: 4821
- Native requirement: satisfied by real pointer mutation, persistence, and cold restart
- Disposition: `closed`
- Evidence:
  - `reports/reuse/current.json`
  - `compat-matrix.md#R13`
  - `evidence/2026-09-12/fidelity/settings-appearance-real-controls-current.json`

## GAP-014 — Composer runtime menu

- Severity/category: `P3` / `SHARED_PRIMITIVE`
- Priority score: 24
- User impact: An outside tap near the window corner does not close the runtime (permission) menu on Lynxtron 0.0.28; taps elsewhere, Escape, and item selection still work.
- Clients/states: native / composer-runtime-menu
- Source owner: Composer runtime menu (local popup and dismiss layer)
- Likely root cause: The menu keeps an absolute popup and a z-index 0 fixed dismiss layer inside the Composer; raising the layer covers the popup items because Lynx does not order a fixed layer against an absolute sibling's stacking context.
- Fix class: `shared primitive`
- Physical reuse: 5.9% modules / 6.8% LOC
- Weighted style risk occurrences: 5258
- Native requirement: move the runtime menu onto the shared Lynx Menu primitive, whose popup and dismiss layer are both fixed (161/160)
- Disposition: `open`
- Evidence:
  - `evidence/2026-09-29/M2/transcript-and-input.json`

## GAP-013 — Composer image input

- Severity/category: `P2` / `RUNTIME_CAPABILITY`
- Priority score: 23
- User impact: Native accepts pasted clipboard images like Web, but dropping an image file on the Composer does nothing because Lynx exposes no file-drop event.
- Clients/states: native / composer-image-attachment
- Source owner: Lynxtron host drag-and-drop bridge
- Likely root cause: Lynxtron forwards no native drag/drop file events to the LynxView. Web has no picker either, so the 0.0.21 open-dialog FiberSetAttribute error is off the product path.
- Fix class: `runtime capability`
- Physical reuse: 5.9% modules / 6.8% LOC
- Weighted style risk occurrences: 5258
- Native requirement: Command+V image paste is satisfied through the Edit menu handler; file drop requires an upstream drag/drop event
- Disposition: `blocked-runtime`
- Evidence:
  - `docs/plans/14-journey-driven-convergence/M1-local-composer-journey.md`
  - `evidence/2026-09-29/M1/local-journey.json`

## GAP-001 — Main shell / New Thread

- Severity/category: `P3` / `HARNESS_INVALID`
- Priority score: 21
- User impact: The old Harness read the wrong Web selector and falsely reported a model-content gap.
- Clients/states: web, lynx / new-thread-hero
- Source owner: Plan 11C workbench state-echo selector
- Likely root cause: The Harness queried a Lynx-only composer class instead of Web's data-chat-provider-model-picker trigger.
- Fix class: `harness`
- Physical reuse: 8.7% modules / 8.2% LOC
- Weighted style risk occurrences: 5258
- Native requirement: none; Browser state echo now proves equal visible labels
- Disposition: `closed`
- Evidence:
  - `evidence/manifests/main-shell.json#new-thread-hero`
  - `evidence/2026-08-04/H3/main-shell/1280x820/web-assertions.json`
  - `evidence/2026-08-04/H3/main-shell/1280x820/lynx-assertions.json`
