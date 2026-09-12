# Plan 11C residual atlas

Generated: 2026-08-17T20:33:35.450Z

This atlas combines strict evidence, production-resolver physical reuse,
weighted style coverage, and registered Native runtime boundaries. Missing
three-client evidence lowers confidence; it does not silently pass a gap.

## Summary

- Gaps: 12
- P0: 1
- P1: 8
- P2: 2
- Incomplete required evidence cells: 18
- Blocked required evidence cells: 0

| ID      | Severity | Category           | Surface                                                | Score | Disposition     | Owner                                                         |
| ------- | -------- | ------------------ | ------------------------------------------------------ | ----: | --------------- | ------------------------------------------------------------- |
| GAP-002 | P0       | SOURCE_REUSE       | Main shell / Sidebar / Composer                        |    66 | open            | Web route composition and Lynx platform leaves                |
| GAP-004 | P1       | MATERIAL           | All ordinary UI                                        |    61 | closed          | Tailwind v3 compatibility layer and shared tokens/primitives  |
| GAP-005 | P1       | SOURCE_REUSE       | Composer                                               |    58 | open            | ChatComposer / Composer shared composition                    |
| GAP-009 | P1       | RUNTIME_CAPABILITY | Light theme                                            |    56 | closed          | generated Lynx tokens and runtime theme host                  |
| GAP-006 | P1       | SOURCE_REUSE       | Model Picker                                           |    55 | open            | ProviderModelPicker / ModelPicker composition                 |
| GAP-008 | P1       | INTERACTION        | Existing thread / Transcript                           |    55 | open            | MessagesTimeline shared rows and Native list host             |
| GAP-011 | P1       | RUNTIME_CAPABILITY | Native keyboard/focus                                  |    52 | blocked-runtime | Lynxtron host input and menu accelerator bridge               |
| GAP-007 | P1       | SOURCE_REUSE       | Quick Switch                                           |    51 | open            | CommandPalette composition / QuickSwitch host                 |
| GAP-010 | P1       | RUNTIME_CAPABILITY | Review / Changed Files                                 |    50 | open            | DiffPanel / changed-files composition and R10 renderer island |
| GAP-003 | P2       | SOURCE_REUSE       | Settings Connections / Source Control / Beta / Archive |    45 | open            | Settings route panels and platform host slots                 |
| GAP-012 | P2       | INTERACTION        | Settings Appearance                                    |    39 | open            | AppearanceSettingsSurface and runtime preferences             |
| GAP-001 | P3       | HARNESS_INVALID    | Main shell / New Thread                                |    21 | closed          | Plan 11C workbench state-echo selector                        |

## GAP-002 — Main shell / Sidebar / Composer

- Severity/category: `P0` / `SOURCE_REUSE`
- Priority score: 66
- User impact: 6.7% module / 4.8% LOC reuse keeps the most visible product surfaces on divergent implementations and makes every fidelity fix expensive.
- Clients/states: web, lynx, native / all primary states
- Source owner: Web route composition and Lynx platform leaves
- Likely root cause: Large route owners remain Web-only while Lynx assembles local hosts around a small set of shared surfaces.
- Fix class: `shared composition`
- Physical reuse: 6.7% modules / 4.8% LOC
- Weighted style risk occurrences: 4769
- Native requirement: Native smoke per extracted slice
- Disposition: `open`
- Evidence:
  - `reports/reuse/current.json`
  - `docs/harness/h5-reuse-style-audit.md`

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
- Likely root cause: The Web ChatComposer route owner and draft/store graph remain separate from the Lynx host.
- Fix class: `shared composition`
- Physical reuse: 5.9% modules / 6.8% LOC
- Weighted style risk occurrences: 5258
- Native requirement: Native textarea/input/focus remains a bounded hard leaf
- Disposition: `open`
- Evidence:
  - `reports/reuse/current.json`

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
- Likely root cause: Shared catalog/ranking exists but the route-level picker anatomy remains split.
- Fix class: `shared composition`
- Physical reuse: 2.9% modules / 3.1% LOC
- Weighted style risk occurrences: 4557
- Native requirement: Native overlay/tap/focus batch
- Disposition: `open`
- Evidence:
  - `reports/reuse/current.json`
  - `evidence/manifests/main-shell.json#model-picker-default`

## GAP-008 — Existing thread / Transcript

- Severity/category: `P1` / `INTERACTION`
- Priority score: 55
- User impact: Same-thread lifecycle evidence exists and Native physical wheel/follow is verified; streaming growth while detached and paired Web/Native position correlation remain open.
- Clients/states: web, lynx, native / idle, working, completed, failed, approval, question
- Source owner: MessagesTimeline shared rows and Native list host
- Likely root cause: Browser state identity and Native list interaction were historically tested in separate runs.
- Fix class: `platform primitive`
- Physical reuse: 8.7% modules / 8.2% LOC
- Weighted style risk occurrences: 5258
- Native requirement: required: real list wheel/drag/follow and state switching
- Disposition: `open`
- Evidence:
  - `evidence/manifests/main-shell.json#existing-thread-idle`
  - `compat-matrix.md#R12`

## GAP-011 — Native keyboard/focus

- Severity/category: `P1` / `RUNTIME_CAPABILITY`
- Priority score: 52
- User impact: Core keyboard workflows remain pending-user-session and cannot be certified headlessly.
- Clients/states: native / New Thread, Quick Switch, Settings, Composer
- Source owner: Lynxtron host input and menu accelerator bridge
- Likely root cause: Renderer global key API and DevTool key dispatch are incomplete.
- Fix class: `runtime capability`
- Physical reuse: not audited
- Weighted style risk occurrences: 3854
- Native requirement: required authorized real OS input session
- Disposition: `blocked-runtime`
- Evidence:
  - `compat-matrix.md#R5`

## GAP-007 — Quick Switch

- Severity/category: `P1` / `SOURCE_REUSE`
- Priority score: 51
- User impact: The global navigation overlay has unavailable reuse metrics; default evidence is retained while query/empty input states remain blocked by the Lynx-for-Web input path.
- Clients/states: web, lynx, native / default, query, actions-only, empty
- Source owner: CommandPalette composition / QuickSwitch host
- Likely root cause: Ranking semantics are shared but the Web palette composition is not compiled by Lynx.
- Fix class: `shared composition`
- Physical reuse: not audited
- Weighted style risk occurrences: 3854
- Native requirement: Native visible-control path and keyboard boundary
- Disposition: `open`
- Evidence:
  - `reports/reuse/current.json`
  - `evidence/manifests/main-shell.json#quick-switch-default`

## GAP-010 — Review / Changed Files

- Severity/category: `P1` / `RUNTIME_CAPABILITY`
- Priority score: 50
- User impact: Completed work cannot reach full patch review parity; current product-surface reuse is 3.3% / 3.0%.
- Clients/states: web, lynx, native / checkpoint, tree, diff, empty
- Source owner: DiffPanel / changed-files composition and R10 renderer island
- Likely root cause: DOM/Worker patch renderer is unavailable and surrounding review composition remains split.
- Fix class: `hard island`
- Physical reuse: not audited
- Weighted style risk occurrences: 4085
- Native requirement: required explicit fallback or host-backed patch renderer
- Disposition: `open`
- Evidence:
  - `reports/reuse/current.json`
  - `compat-matrix.md#R10`

## GAP-003 — Settings Connections / Source Control / Beta / Archive

- Severity/category: `P2` / `SOURCE_REUSE`
- Priority score: 45
- User impact: Corrected production roots report unavailable reuse metrics for Connections, unavailable reuse metrics for Source Control, unavailable reuse metrics for Beta, and unavailable reuse metrics for Archive; route owners remain split despite meaningful shared anatomy.
- Clients/states: web, lynx, native / default, loading, error, mutation
- Source owner: Settings route panels and platform host slots
- Likely root cause: The original audit pointed at SettingsPage instead of OtherSettings; after correcting that harness error, route owners and capability hosts still remain split.
- Fix class: `shared composition`
- Physical reuse: not audited
- Weighted style risk occurrences: 4335
- Native requirement: Native route/navigation/mutation batch
- Disposition: `open`
- Evidence:
  - `reports/reuse/current.json`

## GAP-012 — Settings Appearance

- Severity/category: `P2` / `INTERACTION`
- Priority score: 39
- User impact: Appearance composition exists but controls remain labeled unavailable and have no strict state matrix.
- Clients/states: web, lynx, native / General appearance, theme, wrap, identification
- Source owner: AppearanceSettingsSurface and runtime preferences
- Likely root cause: Shared anatomy landed before runtime theme/wrap capabilities.
- Fix class: `host adapter`
- Physical reuse: not audited
- Weighted style risk occurrences: 4821
- Native requirement: theme/wrap persistence and restart
- Disposition: `open`
- Evidence:
  - `reports/reuse/current.json`
  - `compat-matrix.md#R13`

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
