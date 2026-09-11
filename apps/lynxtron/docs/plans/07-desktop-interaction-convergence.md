# Converge desktop interactions and system states

Phase T7 proves that the port behaves like a desktop application across pointer, keyboard, overlays, resizing, themes, and failure states. Static screenshot parity alone does not complete this phase.

## Plan metadata

- Content type: How-to
- Audience: Agents closing interaction and state gaps
- Goal: Verify the shared product surfaces across desktop interactions and system states
- Depends on: T6 exit
- Exit: T7-I1 through T7-I5 are `completed`, with runtime gaps registered

## T7-I1: Pointer, active, and focus states

Status: `pending`

Inventory Web hover, active, focus-visible, disabled, and drag affordances for every T6 surface. Implement state-driven Lynx variants where events exist.

Exit criteria:

- Every primary and destructive action has visible default, active, disabled, and focus treatment
- Hover-only discovery has a visible or focusable Lynx alternative
- R6 entries name selectors that remain unavailable
- Pointer-state screenshots exist for the core action set
- Contrast does not depend on color alone

## T7-I2: Keyboard and command paths

Status: `pending`

Treat R5 closure as a high-priority required outcome. Probe the current runtime,
then implement a Lynxtron host/native bridge for global key events where the
renderer API is insufficient. Implement Tab, Enter, Space, Escape, arrow, and
product shortcut paths. Visible controls are an interim fallback, not the exit
state.

Progress (P3-S2, 2026-07-30): New Thread, Quick Switch, and Settings now use
native Menu accelerators → renderer-neutral keyboard packets →
`sendGlobalEvent` → the shared keybinding resolver. Automated packet and
command fixtures pass. Follow-up exact-owned Computer Use acceptance passes for
real `Command+K`, `Escape`, `Command+,`, and `Command+N` on the 0.0.21 runtime.
A second exact-owned run passes real `Command+P` for File Picker and both
directions of `Command+B` for Sidebar visibility. An isolated two-thread fixture
then pinned the order to Thread Two, Thread One. On exact-owned PID `81595`,
window `89329`, real `Command+2` selected Thread One and `Command+1` returned to
Thread Two; readiness ended on `fidelity-thread-two` at main sequence 20. This
accepts populated thread indices 1 and 2. Model-picker jumps, selection, and
general renderer keyboard/focus support remain open, so this item stays pending.
The model-picker variant was then tested separately. Exact-owned PID `28160`,
window `89449` showed the open picker with Sol/Terra/Luna at indices 1/2/3, but
real `Command+2` left Sol selected and the picker open. A probe-only background
dispatch snapshot remained `null` while the picker state and main transport were
healthy, proving that the focused picker search field prevented the native Menu
accelerator packet from reaching the renderer. No resolver or selection fix is
claimed; this remains an R5 runtime gap.
File Picker now also has real input-field coverage. On exact-owned PID `65032`,
window `89601`, `Command+P` opened the picker, a real click focused its search
field, and Computer Use typed `keyboardCommands.probe`; Accessibility exposed
the exact value and the visible results filtered to the matching probe test and
keyboard files. Real `Escape` dismissed the picker. `Command+A` followed by
Backspace removed only the trailing `e`, reproducing the same selection failure
already seen in Composer. Query focus/typing is accepted; selection remains an
R8 runtime gap across both text surfaces.
File-result keyboard execution now matches the Electron source of truth. The
first real ArrowDown/Enter run exposed two losses: Enter was inserted into the
query and the selected path was sent to external `navigation.openPath` twice,
leaving the picker open with two errors. Native now strips CR/LF from input,
handles Enter once through the panel, and calls the existing internal
`uiActions.openFileSurface(path)`. On exact-owned PID `75404`, window `89773`,
real query typing plus ArrowDown and Enter closed the picker and opened
`keyboardCommands.probe.test.ts` in the internal split Files surface. DevTool
verified preview mode, a saved content revision, no console errors, and main
sequence 13.
Quick Switch command-query navigation now has the same physical acceptance. A
first owned run lost its visible Computer Use window after typing and is retained
only as harness loss. A fresh exact-owned PID `11393`, window `89856` run opened
with `Command+K`, focused the search input, typed `open settings`, and exposed
the single canonical action. Real ArrowDown highlighted it and Enter navigated
to Settings General. DevTool confirmed the overlay closed, main sequence 15, and
an empty error console before captured-PID cleanup.

The same 1280 x 820 canonical-thread session also passes a real Sidebar resize
drag through Computer Use. The divider moved from approximately 239 px to 319 px;
an exact-owned DevTool session for PID `60545` then reported
`data-sidebar-width="341"` with 341 px Sidebar container and gap geometry. The
thread and Composer remained stable, the error console was empty, main transport
remained ready at sequence 15, and cleanup stopped only the captured PID. This
closes Sidebar-resize drag acceptance, not unrelated drag or selection paths.

Physical hover remains a runtime boundary. A two-active-thread run on exact-owned
PID `22479`, window `89689` moved the real pointer over Thread Two, but the
viewport-probe-only `hoveredThreadId` stayed `null`; both
`.sidebar-v2-row-actions` nodes retained computed opacity 0. Main transport was
healthy at sequence 16 and the error console was empty. This isolates the loss
to native `mouseenter` delivery before React state rather than CSS class
propagation. No programmatic hover substitute is counted as acceptance.

Exit criteria:

- The runtime probe records exact event support and version
- Global key events reach the active Lynx product surface through a documented host/runtime boundary
- Focus order follows visual order
- Escape dismisses the top eligible overlay where supported
- Model Picker, Quick Switch, menus, and dialogs document keyboard coverage
- New thread, command palette, quick switch, send/interrupt, and overlay shortcuts have functional fixtures
- No UI displays a working shortcut hint for an action not covered by the verified keyboard matrix

## T7-I3: Overlays and dismissal

Status: `pending`

Verify Dialog, Menu, Tooltip, picker, confirmation, and context-action geometry against Web.

Exit criteria:

- Anchor, viewport collision, z-order, modal blocking, outside dismissal, and nested-overlay behavior have fixtures
- Loading and disabled overlay actions prevent duplicate commands
- Resize or scroll does not orphan an open overlay
- Unsupported focus trapping is registered with impact and fallback

## T7-I4: Scroll, resize, density, theme, and motion

Status: `pending`

Exercise 1280 × 820 and 1440 × 900, then add the minimum supported narrower and wider sizes. Verify dark and light themes if the runtime can switch them.

Exit criteria:

- Sidebar, transcript, settings, file tree, and panel surfaces scroll independently where Web does
- Resizing does not overlap or hide a primary action
- Compact and default density use canonical tokens
- Dark and light semantic colors map to the same token names as Web
- Motion communicates state and respects the available reduced-motion capability
- Unsupported blur and native-font differences remain registered

## T7-I5: Loading, empty, error, offline, and streaming states

Status: `pending`

Create deterministic fixtures or isolated backend states for product lifecycle conditions.

Exit criteria:

- Startup, connecting, ready, reconnecting, offline, and fatal states have copy and recovery actions
- Empty projects, empty threads, empty search, and empty panels guide the next action
- Streaming, interrupting, interrupted, failed, and retry states match canonical session semantics
- Settings read and write failures preserve the last confirmed value
- File save failures preserve edits and expose retry
- No fixture or fake data enters a production path

## Phase exit

Publish an interaction matrix that links each state to Web evidence, Lynx evidence, result, and compatibility item. Every missing interaction must have a runtime gap or an approved product fallback.
