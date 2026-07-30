# Reset the Lynxtron port around the Web product source

This plan replaces the current helper-first sequence with two architecture pilots, then removes the remaining clean-room product compositions one surface at a time. Execute tasks in order, keep each task or AR5 slice in one commit, and stop at the stated decision gates.

## Plan metadata

- Content type: How-to
- Status: Ready
- Audience: Agents continuing the T3 Code Electron-to-Lynxtron port
- Goal: Replace preload polling and duplicated Lynx product composition with a main-owned event bridge and physically shared Web composition
- Scope: `apps/lynxtron`, `apps/web`, `packages/client-runtime`, and the minimum internal contracts needed by both Lynxtron processes
- Product source of truth: The current Web application in this checkout
- Runtime source of truth: The installed Lynxtron declarations and verified behavior, not assumed Electron parity
- Branch: `lynxtron-port` in `/Users/bytedance/github/t3code`
- Push target: `lynxtron/lynxtron-port` over SSH
- Updated: 2026-07-31

## What this plan changes

The existing plans correctly require physical source reuse, platform leaves, explicit runtime gaps, and measured fidelity. This plan changes the execution order and the per-slice release gate:

1. Move connector ownership from the isolated preload process to the main process before adding more product UI.
2. Use the transcript as the first deletion-driven composition pilot.
3. Continue with Composer, Settings, panels, and Sidebar behavior only after both pilots pass.
4. Keep strict reuse reports unchanged, but do not block an intermediate slice on a 70% full-product result.
5. Complete a slice only when it removes or retires the replaced clean-room product path.

This plan supersedes the task ordering in `06-core-surface-convergence.md` and the priority order in `09-long-range-goal.md`. It does not invalidate their evidence, compatibility entries, fidelity thresholds, or final phase gates.

## Why the sequence changed

The monorepo port imported 5,510 lines from the standalone prototype. Shared projections now cover substantial behavior, but `apps/lynxtron/src/app/index.tsx` still assembles Lynx-owned Chat, Composer, Settings, and overlay components.

The current architecture also places `T3Connector` in preload. Main can push events through `LynxWindow.sendGlobalEvent`, but preload cannot reach the window. The renderer therefore polls preload snapshots every 400 ms.

These two boundaries create separate problems:

- Product behavior can match while component composition remains duplicated
- Main owns native menu commands while preload owns connector commands
- Streaming state crosses a polling adapter before Effect Atom receives it
- Helper extraction can improve semantics without deleting the second product implementation
- The full-product reuse denominator can block a useful slice even when that slice removes duplication

The reset treats `apps/lynxtron` as a host and adapter package. It stops treating it as a second product source.

## Target ownership model

Use these ownership rules for every task:

| Layer               | Owner                                                     | Allowed responsibilities                                                                  |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Product logic       | `packages/client-runtime`                                 | Commands, reducers, projections, view models, renderer-neutral state machines             |
| Product composition | `apps/web/src`                                            | Shared component anatomy, ordering, copy, semantic class names, interaction intent        |
| Web leaves          | `apps/web/src/**/*.web.tsx` or current Web implementation | DOM elements, Base UI, browser events, browser storage                                    |
| Lynx leaves         | `apps/web/src/**/*.lynx.tsx`                              | Lynx elements, `bindtap`, Lynx measurement, host-specific primitive behavior              |
| Lynx application    | `apps/lynxtron/src/app`                                   | Root boot, native `<list>`, Markdown island, registered placeholders, capability adapters |
| Lynxtron main       | `apps/lynxtron/src/main/desktop`                          | Connector lifecycle, server lifecycle, native menu, typed invoke handlers, event delivery |
| Preload             | `apps/lynxtron/src/main/desktop/preload.ts`               | Only capabilities that cannot move to main; no product state ownership after AR2          |

Do not create a new shared UI package during this reset. First prove that Web and Lynx compile the same physical composition from `apps/web/src`. Reconsider package placement only after two product surfaces use the same stable pattern.

## Open decisions and evidence questions

Resolve these questions through the named task instead of guessing:

- **Bridge feasibility**: AR1 determines whether the installed `lynxBridge` can carry the required typed request path
- **Remote compatibility**: AR1 and AR2 determine whether main ownership preserves future local, remote, relay, and tunnel targets
- **Real input acceptance**: AR6 requires an authorized user session for keyboard, focus, wheel, drag, and selection evidence
- **Release classification**: AR6 classifies the result from evidence as an Electron replacement candidate, chat-first preview, or experimental host

No other product decision should interrupt AR0 through AR5. Choose the smallest reversible implementation that satisfies the fixed constraints.

## Fixed constraints

Apply these constraints throughout the plan:

- Preserve upstream Web behavior and all existing multi-surface contracts
- Keep mobile and remote-ready behavior unchanged
- Keep code/editor, terminal emulation, and embedded browser as registered placeholders
- Keep full patch rendering, Scalable Vector Graphics (SVG), custom fonts, and text selection in their existing runtime-gap entries
- Use Tailwind CSS v3 only in the Lynx build and leave Web Tailwind v4 unchanged
- Do not add generic Document Object Model (DOM) shims to make a Web subtree compile
- Do not copy Web JSX into `apps/lynxtron`
- Do not add renderer business rules to a `.lynx.tsx` leaf
- Do not expand reuse exclusions, masks, or hard-island scope
- Add `surface`, `R#`, and `remove-when` comments to every new `overrides.css` rule
- Keep the reachable main bundle eager while R11 remains open
- Do not display keyboard hints that lack runtime acceptance
- Do not modify `.repos/`

## Worktree and commit rules

At the start of each task:

1. Read the root `AGENTS.md`.
2. Read this plan, `implementation-status.md`, `compat-matrix.md`, and `port-ledger.md`.
3. Record `git status --short --branch` and the current commit.
4. Preserve all user-owned untracked evidence and unrelated changes.
5. Check whether `origin/main` has advanced.

If `origin/main` has advanced, merge it before the next architecture task. Use upstream behavior on conflicts, preserve `.lynx` leaves and shared composition, and stop if conflicts extend beyond the active surface.

Commit and push each completed task separately. Use conventional commit titles. Do not combine generated evidence, unrelated Web cleanup, or another task in the same commit.

## Task sequence

Execute only one task at a time:

| ID  | Task                                                | Depends on     | Status        | Primary result                                                          |
| --- | --------------------------------------------------- | -------------- | ------------- | ----------------------------------------------------------------------- |
| AR0 | Reconfirm the baseline and merge upstream if needed | Current branch | `completed`   | Reproducible starting point                                             |
| AR1 | Prove a main-owned connector                        | AR0            | `completed`   | Typed invoke and push work without changing product ownership           |
| AR2 | Cut over from preload polling                       | AR1            | `in_progress` | Reachable product state no longer polls every 400 ms                    |
| AR3 | Converge transcript composition                     | AR2            | `pending`     | Shared message composition replaces the Lynx clean-room path            |
| AR4 | Converge Composer composition                       | AR3            | `pending`     | Shared Composer chrome surrounds a bounded editor island                |
| AR5 | Remove remaining clean-room surfaces                | AR4            | `pending`     | Settings, panels, overlays, and Sidebar behavior use shared composition |
| AR6 | Certify the resulting product boundary              | AR5            | `pending`     | Honest release classification and final evidence                        |

Use only `pending`, `in_progress`, `completed`, `blocked(runtime-gap-id)`, or `skipped(reason)`. Keep only one row in progress.

## AR0: Reconfirm the baseline

AR0 prevents a later session from executing against stale assumptions.

### Steps

1. Fetch `origin` and `lynxtron`.
2. Confirm the checkout is `/Users/bytedance/github/t3code` on `lynxtron-port`.
3. Compare `HEAD` with `origin/main` and `lynxtron/lynxtron-port`.
4. Merge `origin/main` only when the current branch does not contain it.
5. Run the affected Lynxtron typecheck, focused tests, Web and Lynx builds, audits, and one 1280 × 820 zero-error capture.
6. Record current reuse, bundle size, `overrides.css` line count, and reachable Lynx-owned product components.
7. Update the implementation status only when a recorded fact changed.

### Exit criteria

- The branch contains the required upstream commit
- The baseline typecheck is zero-error
- The production Web and Lynx builds pass
- The baseline report records counts without changing exclusions
- A fresh 1280 × 820 Lynx capture reports zero renderer errors

If the merge has conflicts outside controllable Web/Lynx host leaves, stop and report the conflict list.

## AR1: Prove a main-owned connector

AR1 proves the replacement transport behind a flag. It must not remove the polling path.

### Required design

Implement one typed internal protocol shared by main and renderer:

- A renderer-ready request
- An initial serializable snapshot
- Typed command requests
- Sequenced shell, thread, config, access, status, and log events
- A resync request for a sequence gap
- A dispose path for window and connector shutdown

Inspect the installed `lynxBridge` declarations before choosing handler names or payload shapes. Do not assume Electron `ipcMain` compatibility.

Main must instantiate the existing connector bundle and own its lifecycle. Main must deliver updates with `LynxWindow.sendGlobalEvent`. Renderer requests must use `lynxBridge`.

Keep payloads serializable. Do not send Effect values, credentials, functions, class instances, or unrestricted server methods across the bridge.

### Safety properties

The spike must prove:

- Renderer readiness triggers one current snapshot
- Every event carries a monotonic sequence
- A detected gap requests a full resync
- Events emitted before renderer readiness remain represented in the initial snapshot
- Closing the window disposes connector and server resources
- Credential stripping remains in place
- Local bootstrap behavior remains unchanged
- The design does not prevent later remote, relay, or tunnel targets

### Verification

Use a capability flag so the existing preload path remains the default. Verify a real server bootstrap, shell snapshot, thread selection, prompt, streamed update, interruption, and shutdown.

### Exit criteria

- Renderer-to-main invoke works for at least one read and one mutation
- Main-to-renderer delivery updates the existing Effect Atom registry
- A real prompt produces sequenced thread events
- Gap recovery passes a focused test
- Disposal releases only processes and ports started by the spike
- The default polling product path still works
- Focused tests, affected typechecks, build, audits, scanner, and one zero-error capture pass

If `lynxBridge` cannot support the typed request path, record the declaration and runtime evidence, revert the product integration, and stop this plan as `blocked(runtime-gap-R3)`.

## AR2: Cut over from preload polling

AR2 makes the AR1 path authoritative and removes the obsolete product transport.

### Steps

1. Make the main-owned connector the default.
2. Bootstrap the renderer with one ready-and-snapshot exchange.
3. Feed sequenced events into the current Effect Atom host.
4. Route existing renderer commands through typed main handlers.
5. Remove the reachable 400 ms polling interval.
6. Remove preload snapshot buffers and command methods that main now owns.
7. Keep only proven preload-only capabilities.
8. Update R3 in the compatibility matrix with the new boundary and remaining limitations.

Do not replace the current polling loop with another timer-based transport.

### Exit criteria

- No reachable product code polls connector snapshots every 400 ms
- Shell, thread, config, and access updates arrive through pushed events
- Create, select, prompt, interrupt, rename, archive, delete, settings, file, source-control, and access commands keep their current behavior
- Startup, reconnect, resync, renderer reload, and shutdown have focused tests
- Current credential-redaction tests still pass
- Bundle size and event payload changes are recorded
- Focused tests, affected typechecks, both builds, audits, scanner, and one zero-error capture pass

Mark R3 closed for the T3 architecture only if the product no longer depends on preload-to-renderer push. Keep the upstream issue open until Lynxtron supplies the missing general capability.

## AR3: Converge transcript composition

AR3 is the first deletion-driven user-interface pilot. It tests whether the port can share product anatomy instead of only projections.

### Shared boundary

Start from the Web thread route and compiler-probe the largest transcript composition that can share:

- Empty, loading, offline, and error states
- Message row anatomy
- Role and status placement
- Collapsed work and tool summary rows
- Working and duration rows
- Proposed-plan and checkpoint card placement
- Markdown input and file-link intent
- Typography and semantic class names

Keep these Lynx islands:

- Native `<list>` ownership and recycling
- Lynx scroll callbacks and follow/detach mechanics
- Lynx Markdown element rendering
- Registered Selection and full patch-renderer gaps

Use a `Composition` plus platform `Elements` contract when the original Web subtree cannot compile directly. Keep state projection outside `Elements`.

### Required deletion

In the same task:

- Delete or reduce the old Lynx `MessagesTimeline` product composition to a list host
- Delete replaced clean-room row components
- Delete replaced transcript rules from `overrides.css`
- Remove temporary compiler probes

Do not complete AR3 when both old and new transcript compositions remain reachable.

### Exit criteria

- Web and Lynx import the same physical transcript composition
- Both clients consume the existing shared transcript projection
- The Lynx-only layer owns list and Markdown mechanics, not product row anatomy
- Empty, short, long, streaming, interrupted, failed, plan, and checkpoint fixtures pass focused tests
- Follow, detach, restick, prepend, and stable-key contracts pass
- Lynx-owned ordinary transcript lines and prototype CSS decrease
- `pnpm --filter @t3tools/lynxtron run report:reuse` records the unchanged strict denominator and the slice delta
- Affected typechecks, scanner, build, audits, and one 1280 × 820 zero-error capture pass

Defer real wheel or drag acceptance to an explicitly authorized user session while R12 remains open. Do not mark scroll interaction certified from unit tests alone.

## AR4: Converge Composer composition

AR4 moves Composer chrome and product state to a shared physical composition.

### Shared boundary

Share:

- Shell, editor frame, footer, and toolbar order
- Attachment and context-chip placement
- Provider, model, runtime mode, and interaction mode controls
- Send, stop, disabled, and error states
- Canonical checkout and branch context
- Shortcut labels that have verified runtime support

Keep the editor kernel as a Lynx island. The island may own native text input, selection limitations, and Lynx input events. It must not own toolbar order, model selection, sendability, or command dispatch.

### Required deletion

Delete or reduce the existing Lynx `Composer.tsx` to its editor host and event adapter. Remove replaced Composer CSS and duplicate labels.

### Exit criteria

- Web and Lynx import the same physical Composer composition
- Draft, populated, disabled, sending, interruptible, and error fixtures pass
- Commands target the selected thread and use canonical state
- No fake model, branch, permission, or interaction label remains
- Lynx-only ordinary Composer code and prototype CSS decrease
- Affected tests, typechecks, scanner, build, audits, and one zero-error capture pass

Keep physical-key acceptance as `pending-user-session`. Do not expand AR4 into Tab, Escape, or arrow-key emulation.

## AR5: Remove remaining clean-room surfaces

AR5 repeats the AR3 pattern across the remaining ordinary product surfaces.

Execute these slices in order:

1. Model Picker and Quick Switch composition
2. Settings Providers, Connections, Source Control, Keybindings, Beta, and Archive
3. Files, changes, plans, and right-panel chrome
4. Sidebar state and behavior hosts that remain duplicated after the maximum-composition slice
5. Root route composition and overlay ownership

For each slice:

1. Compile the Web entry before writing an adapter.
2. Select the largest blocked composition.
3. Add only the required platform leaves.
4. Make Web and Lynx consume the same physical composition.
5. Delete the replaced Lynx product composition and CSS.
6. Run slice-level acceptance.
7. Commit and push before starting the next slice.

Do not reopen code/editor, terminal-emulation, embedded-browser, full patch-renderer, SVG, font, or Selection scope.

### Exit criteria

- No ordinary clean-room screen remains reachable from Lynx navigation
- Every remaining Lynx-exclusive component is a root adapter, capability, primitive, or registered hard island
- Settings mutations use their current client or server authority
- Panel stacks preserve open, activate, close, fallback, and hidden semantics
- Overlay copy and ordering match Web
- Strict reuse and bundle reports exist for every completed slice
- `overrides.css` has no unowned product rules

## AR6: Certify the resulting product boundary

AR6 decides what the port can honestly ship.

### Required evidence

Run the full phase-exit battery:

- Both standard viewports: 1280 × 820 and 1440 × 900
- Required light and dark states
- Empty, loading, populated, streaming, interrupted, failed, reconnecting, and destructive-confirmation states where applicable
- Same-snapshot Web and Lynx content checks
- Final route, product-surface, and renderer-local reuse reports
- Final bundle and prototype-deletion report
- Packaged application smoke

Use a real user session for keyboard, focus, wheel, drag, and selection behavior that DevTool cannot inject. Ask before using computer control.

### Release classification

Classify the result as one of:

- `electron-replacement-candidate`: main-owned push works, required keyboard and focus matrix passes, bundle loading is sustainable, and all ordinary screens pass phase certification
- `chat-first-preview`: chat, transcript, Composer, settings, and navigation work, but R5, R11, or another required desktop capability remains open
- `experimental-host`: AR1 or AR2 cannot replace polling, or shared composition cannot retire the clean-room path

Do not describe a `chat-first-preview` or `experimental-host` as an Electron replacement.

### Exit criteria

- The final classification has evidence
- Every open runtime gap has an owner and removal condition
- The implementation status and compatibility matrix match the shipped boundary
- The final report lists deleted prototype lines and remaining Lynx-only lines by owner
- All tasks are committed and pushed

## Per-slice acceptance

Every intermediate user-interface slice must pass:

1. Focused tests for changed behavior
2. Affected Web and Lynx TypeScript programs
3. ReactLynx scanner for changed renderer files
4. Lynx API and CSS audits
5. Affected Web and Lynx production builds
6. `pnpm --filter @t3tools/lynxtron run report:reuse`
7. One fresh 1280 × 820 Lynx DevTool capture with zero renderer errors
8. `git diff --check`

Do not require dual-viewport pairs or a complete lifecycle matrix until AR6.

## Metrics that guide decisions

Keep the existing reuse calculation unchanged. Report it, but use these measures to decide whether a slice improved the architecture:

- Count of physically shared product composition modules
- Count of reachable Lynx-owned ordinary product components
- Lynx-only ordinary product lines added and deleted
- Prototype CSS lines added and deleted
- Duplicate business rules removed
- Production bundle delta
- Event payload and update-frequency delta

A slice fails the architecture goal when it adds a second product rule, leaves the replaced composition reachable, or increases unowned prototype CSS.

## Stop conditions

Stop and report the blocker when one condition applies:

- An upstream merge conflict extends beyond the active surface
- AR1 cannot prove renderer-to-main invoke and main-to-renderer push
- AR2 cannot preserve connector lifecycle or credential boundaries
- A shared Web composition requires broad DOM shims instead of bounded leaves
- The same task fails three times after decomposition
- Real keyboard, focus, wheel, drag, or selection acceptance requires a user session
- Git Large File Storage (LFS), signing, notarization, or another external decision is required

Do not mark the goal complete because the token budget is low or the work is difficult.

## Handoff requirements

Before ending any session, update the active task notes with:

- Current commit and branch
- Dirty files owned by the task
- Completed steps and verification results
- Exact next command
- Processes and ports started by the session
- Temporary fixtures that remain
- New compatibility gaps
- Commit and push status

## Prompt for the next session

Use this prompt to start or resume execution:

```text
Continue the T3 Code Electron-to-Lynxtron port in
/Users/bytedance/github/t3code on branch lynxtron-port.

Read the root AGENTS.md, then read these files in order:
1. apps/lynxtron/docs/plans/10-source-first-architecture-reset.md
2. apps/lynxtron/docs/implementation-status.md
3. apps/lynxtron/docs/compat-matrix.md
4. apps/lynxtron/docs/port-ledger.md
5. apps/lynxtron/docs/plans/00-execution-index.md

Treat plan 10 as the active execution order. Preserve all existing user work.
Resume the first non-completed AR task and keep only one task in progress.

Use the current Web product as the source of truth. Do not add ordinary product
composition to apps/lynxtron. Move product logic to packages/client-runtime,
share product composition from apps/web/src, and keep Lynx differences in typed
platform leaves or registered hard islands.

Each completed AR task must have focused verification, one commit, and a push to
lynxtron/lynxtron-port. Do not expand exclusions, masks, placeholders, or
overrides to improve metrics. Stop for uncontrolled merge conflicts, real-input
acceptance, LFS, signing, or the repeated-block conditions in the plan.
```
