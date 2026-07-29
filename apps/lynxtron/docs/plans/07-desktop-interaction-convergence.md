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
command fixtures pass; physical accelerator acceptance is
`pending-user-session`. General renderer keyboard/focus support remains open,
so this item stays pending.

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
