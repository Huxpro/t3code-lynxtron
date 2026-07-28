# Converge the core product surfaces

Phase T6 replaces clean-room product renderers with shared Web composition and bounded Lynx host islands. Complete tasks in dependency order.

## Plan metadata

- Content type: How-to
- Audience: Agents porting T3 Code product surfaces
- Goal: Replace standalone-prototype renderers for the core T3 Code workflow
- Depends on: T5 exit
- Exit: T6-C1 through T6-C7 are `completed`, or a task has an approved runtime block

## Task order

| ID    | Surface                                | Depends on   |
| ----- | -------------------------------------- | ------------ |
| T6-C1 | App shell, header, and Sidebar         | T5           |
| T6-C2 | New-thread empty state                 | T6-C1        |
| T6-C3 | Thread transcript and Markdown         | T6-C1        |
| T6-C4 | Composer chrome and dispatch           | T6-C2, T6-C3 |
| T6-C5 | Model Picker and Quick Switch          | T6-C1        |
| T6-C6 | Settings suite                         | T5, T6-C1    |
| T6-C7 | Files, changes, plans, and right panel | T6-C3        |

## Workflow for every surface

1. Add the Web route or component entry to the dependency report.
2. Compile the original subtree with the Lynx resolver.
3. Select the largest composition subtree blocked by a small number of platform leaves.
4. Record each compiler or runtime failure for that subtree.
5. Split or adapt only the unsupported leaves so the full composition remains physically shared.
6. Recalculate all three reuse scopes before extracting another component.
7. Remove the replaced Lynx-only projection or renderer.
8. Run focused shared tests and affected type checks.
9. Verify the Web behavior in one isolated integrated flow.
10. Verify the Lynx behavior against the same snapshot.
11. Generate reuse and fidelity evidence at both viewports.
12. Update the ledger before starting the next task.

Do not optimize reuse by extracting a sequence of small components while the Lynx route remains an independent composition. If product-surface reuse rises by less than one percentage point after a slice, reassess the route boundary and choose a larger compiler-first subtree.

## T6-C1: App shell, header, and Sidebar

Status: `in_progress`

Share shell composition, project and thread grouping, selection semantics, status projection, action placement, and semantic tokens. Keep Lynx host elements and runtime-specific window controls bounded.

Exit criteria:

- Project and thread order, titles, counts, selection, busy state, and archived state match Web
- Create, rename, archive, delete, and navigation actions use canonical commands
- Window chrome and traffic-light differences are registered
- Both reuse gates pass
- Default, populated, collapsed, and long-title states pass fidelity thresholds

Current evidence: the shared shell/header/sidebar composition is reachable in
both clients, and Lynx DevTool now proves distinct 30 px Rename, Archive, and
Delete hit regions plus canonical Create/Rename/Archive/Delete/select
projections. See
`evidence/2026-07-28/T6-C1/sidebar/actions-runtime/notes.md`. A 2026-07-29
compiler-first probe also established two distinct Sidebar V2 constraints:
eager inclusion reaches an Effect main-thread `onItem`/snapshot failure, while
lazy inclusion protects V1 but Lynxtron 0.0.5 cannot resolve the generated
relative async bundle URL. The rejected captures and the final zero-error V1
rollback are documented in
`evidence/2026-07-29/T6-C1/sidebar/sidebar-v2-probe/notes.md`. Fixture
preferences now honor `T3_LYNXTRON_BASE_DIR`. The task remains `in_progress`:
an accepted main-bundle `.lynx` state host now compiles the shared
`SidebarV2RowSurface` and passes fresh populated Lynx DevTool captures at both
viewports without the eager snapshot failure. The honest full app-shell
product graph is 27.8% shared modules and 36.4% shared lines, and the top
control rows still differ from Web, so neither reuse nor fidelity gate is
claimed. See
`evidence/2026-07-29/T6-C1/sidebar/sidebar-v2-host/notes.md`.

## T6-C2: New-thread empty state

Status: `pending`

Share the headline composition, checkout context, branch context, composer placement, toolbar ordering, and empty-state copy.

Exit criteria:

- Empty state uses the same canonical project and draft state as Web
- Headline, composer, checkout, and branch anchors pass at both viewports
- No fake branch, provider, model, permission, or interaction-mode label remains
- Both reuse gates pass

## T6-C3: Thread transcript and Markdown

Status: `pending`

Share thread composition, message grouping, plan cards, checkpoint presentation, status banners, and Markdown projections. Keep `<list>` and the Lynx Markdown renderer as bounded host leaves, but treat the complete `<list>`-based chat experience as a required high-priority product surface rather than a deferrable runtime island.

Exit criteria:

- Empty, short, long, streaming, interrupted, failed, and proposed-plan states have evidence
- Message order, role, timestamps, file links, code-fence metadata, and plan copy match Web
- Scroll-follow and user-scroll-detach behavior pass a focused interaction fixture
- Stable item keys, recycling, incremental streaming updates, prepend/restore position, and long-transcript memory behavior pass focused `<list>` fixtures
- The Markdown island lists unsupported syntax without claiming parity
- Both reuse gates pass after approved islands are excluded

## T6-C4: Composer chrome and dispatch

Status: `pending`

Share composer chrome, toolbar composition, attachment state, context chips, provider and model state, runtime mode, interaction mode, sendability, and command projection. Use an explicit editor placeholder for the unsupported rich editable core; do not implement Lexical/Monaco-like editing during this UI convergence phase.

Exit criteria:

- Draft, populated, disabled, sending, interruptible, and error states match Web
- Provider, model, permission, interaction, checkout, and branch controls persist canonical state
- Send and interrupt operate against the target thread
- The editor-island boundary contains no toolbar or product-state logic
- The editor placeholder is visually intentional, describes the limitation, and does not expose inert rich-editing controls
- Both reuse gates pass after the editor island is excluded

## T6-C5: Model Picker and Quick Switch

Status: `pending`

Share overlay composition, provider sections, search results, favorites, shortcut labels, action mode, and empty states.

Exit criteria:

- Search ranking and ordering match shared fixtures
- Overlay bounds, navigation rail, rows, separators, and selected states pass visual thresholds
- Open, search, select, dismiss, disabled-provider, and no-result states have evidence
- Keyboard-only behavior remains registered under R5 until runtime support exists
- Both reuse gates pass

## T6-C6: Settings suite

Status: `pending`

Extend the T5 reference contract to Providers, Connections, Source Control, Keybindings, Beta, and Archive. Do not display controls that cannot read or write canonical state.

Exit criteria:

- Navigation order and section structure match Web
- Every visible mutable control persists through the correct client or server authority
- Loading, unavailable, error, restore, and destructive-confirmation states have evidence
- Keybindings exposes the runtime limitation without presenting inert editable shortcuts
- Each settings route passes both reuse gates

## T6-C7: Files, changes, plans, and right panel

Status: `pending`

Share panel composition, surface-stack semantics, file tree projection, save state, checkpoint statistics, plan projection, and tab state. Keep full patch rendering registered under R10.

Exit criteria:

- Panel open, activate, close, fallback, resize, and hidden states match Web semantics
- File tree order, selected file, preview, dirty, saving, saved, and failed states have evidence
- Code/editor, terminal, and embedded-browser tabs retain canonical chrome and state while rendering their approved placeholders
- Changed-file totals and plan titles match canonical snapshots
- Full patch absence has an explicit R10 fallback
- Both reuse gates pass after the patch-renderer island is excluded

## Phase exit

Run the provenance report again. Report deleted prototype lines, remaining Lynx-only product UI, per-screen reuse, and all runtime islands. No replaced clean-room screen may remain reachable from product navigation.

Publish proposed review units for shell, transcript, composer, overlays, settings, and panels. Each unit must list the Web refactors, shared modules, Lynx leaves, tests, and evidence that belong together.
