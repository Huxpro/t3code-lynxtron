# Prove the Lynxtron architecture through product outcomes

Plan 10 changed the direction of the port: connector ownership moved to main and ordinary product anatomy started moving back into shared Web compositions. This plan makes that architecture earn its keep. It closes five trust-breaking product regressions found in a real packaged session and adds the semantic launch harness that should have caught them before screenshots were accepted.

Execute tasks in order. Keep one task in progress, commit and push every completed task separately, and do not mark this plan complete while any of the five outcome checks still fails.

## Plan metadata

- Content type: How-to
- Status: Ready
- Audience: Agents continuing the T3 Code Electron-to-Lynxtron port
- Goal: Produce a trustworthy packaged Lynxtron build whose cold start, lifecycle status, Sidebar V2, Settings navigation, Composer, and stage branding visibly and behaviorally match the current Web product boundary
- Scope: `apps/lynxtron`, the physically shared compositions and Lynx leaves under `apps/web`, and renderer-neutral state only where both renderers consume it
- Product source of truth: Current Web/Electron in this checkout, not the standalone Lynx prototype
- Runtime source of truth: Packaged `dist/desktop` cold starts using an isolated realistic T3 state
- Branch: `lynxtron-port` in `/Users/bytedance/github/t3code`
- Push target: `lynxtron/lynxtron-port` over SSH
- Updated: 2026-08-01

## Why this plan exists

The AR6 report classified the port as a `chat-first-preview`, but a real handoff immediately exposed a false-positive verification path:

1. The window and DevTool session existed and the child server reached `T3 Code server is ready`.
2. The renderer diagnostic still reported connector transport `kind: "unavailable"` and remained on Connecting.
3. Reloading after main was ready made the renderer connect, proving a packaged cold-start race rather than a server failure.

The same session and AR6 reconnect evidence exposed five product regressions:

| ID  | User-visible failure                                                                                                                      | Required end result                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Sidebar controls, project scope, and thread card anatomy are broken; an opened project menu participates in layout and duplicates content | Sidebar V2 matches the current Web hierarchy, its popup overlays instead of reflowing, and all visible controls remain inside the 256 px rail                                |
| O2  | Clicking the lower-left Settings row flashes Settings and returns to chat                                                                 | One real tap enters `/settings/general`, stays there through connector/router updates, supports section navigation, and returns to chat only through an explicit Back action |
| O3  | The primary Composer is weakly adapted: density, contrast, spacing, controls, and context strip do not read as the Web product            | Shared Composer geometry and tokens match Web within fidelity thresholds; the native editor remains the only substantial Lynx island                                         |
| O4  | The stage artwork behind the upper-left T3 Code brand disappeared                                                                         | The local packaged preview resolves the intended Dev stage and renders the shared Dev backdrop; Nightly and non-artwork modes retain their documented behavior               |
| O5  | Connecting, failed, and reconnecting are not consistently visible; disabled Composer state is expected to carry too much meaning          | The chat shell renders canonical lifecycle status and recovery guidance, and never presents an unavailable transport as an inert ready-looking screen                        |

These outcomes are independent gates. A clean screenshot does not prove O2 or O5. A unit test does not prove O1, O3, or O4. A listening server does not prove a usable product.

## Current architectural findings

Treat these as hypotheses to confirm in OC0, not permission to skip diagnosis:

- `main.ts` currently calls `win.loadFile()` before `startMainConnectorHost(win)`. A fast renderer can exhaust its one readiness probe before `lynxBridge.handle` registrations exist.
- The renderer transport exposes `globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__`; this is the correct semantic launch probe. In the failed cold start it reported `kind: "unavailable"`; after reload it reported `kind: "main"` and `lastSeq: 22`.
- Lynx routing currently writes a local pathname Atom synchronously and then lets TanStack memory-router completion call `syncPathname()`. That is two writable authorities and can explain the Settings flash-back.
- `MenuPortal.lynx` is a fragment and `MenuPopup.lynx` is an ordinary `<view>`. An open popup therefore has no guaranteed anchored overlay geometry and can participate in Sidebar layout.
- `ComposerSurface` owns shared anatomy, but `apps/lynxtron/src/app/components/Composer.tsx` still owns pill markup, hard-coded colors, and much of the density contract. `overrides.css` supplies additional geometry.
- Packaged launch normally has no `NODE_ENV=development`; `preload.ts` therefore defaults the unconfigured stage to Alpha. Backdrop variants intentionally render only for Dev or Nightly, so the shared artwork is present but receives no eligible stage.

## Target architecture

```text
packaged main
  ├─ attach typed bridge handlers before renderer load
  ├─ own connector/server lifecycle
  └─ publish canonical branding + sequenced product state

shared product compositions
  ├─ Sidebar V2 anatomy and route intents
  ├─ Settings route/navigation surfaces
  ├─ Composer anatomy, layout variants, tokens, and control order
  └─ stage brand/backdrop selection

platform leaves
  ├─ Web DOM/editor/menu primitives
  └─ Lynx native input, anchored popup, list, measurement, and tap events
```

The architecture is successful only when the shared layer determines product behavior and the platform layer is both bounded and visibly correct.

## Fixed constraints

- Preserve current Web, desktop, mobile, local, remote, relay, and tunnel behavior.
- Do not copy Web JSX into `apps/lynxtron` or restore the standalone prototype.
- Do not add a second route, Sidebar, Composer, or branding state machine.
- Do not use reload, fixture injection, a fixed sleep, or a screenshot to hide a failed cold start.
- Do not make broad DOM shims. Keep Lynx differences in typed leaves or registered runtime gaps.
- Keep Tailwind v3 on the Lynx build and Tailwind v4 on Web.
- Every new `overrides.css` rule needs `surface`, `R#`, and `remove-when`; target a net reduction across OC4–OC6.
- Do not change reuse exclusions, screenshot masks, or fidelity thresholds.
- Keep editor, terminal, browser, full patch rendering, custom fonts, SVG, and Selection outside this plan except where existing registered fallbacks are rendered by the affected shared chrome.
- Do not claim physical keyboard, focus, wheel, drag, or selection acceptance from DevTool; keep R5/R12 `pending-user-session`.
- Preserve all user-owned untracked evidence and do not modify `.repos/`.

## Worktree and commit protocol

At the start of every task:

1. Read root `AGENTS.md`, `.impeccable.md`, this plan, `implementation-status.md`, `compat-matrix.md`, and `00-execution-index.md`.
2. Record `git status --short --branch`, `HEAD`, and the relation to `origin/main` and `lynxtron/lynxtron-port`.
3. Fetch `origin`; merge only before the active task when needed. Preserve upstream behavior and stop if conflicts leave the named surface.
4. Use a fresh isolated base directory and explicit 1280 x 820 viewport for slice runtime checks.
5. Commit and push one task at a time. Do not mix generated captures, unrelated Web cleanup, or the next task into the commit.

## Task sequence

| ID  | Task                                                 | Depends on     | Status      | Result                                                                            |
| --- | ---------------------------------------------------- | -------------- | ----------- | --------------------------------------------------------------------------------- |
| OC0 | Freeze the five failures and current Web baselines   | Current branch | `completed` | Durable outcome fixtures, measurements, and exact failure signatures              |
| OC1 | Make packaged cold start semantically ready          | OC0            | `completed` | Three fresh starts connect without reload and the harness rejects false readiness |
| OC2 | Give Lynx navigation one authority                   | OC1            | `completed` | Settings tap, section changes, and Back remain stable                             |
| OC3 | Make lifecycle state visible and actionable          | OC2            | `completed` | Starting, ready, failed, and reconnecting are truthful in the chat shell          |
| OC4 | Converge Sidebar layout and anchored overlays        | OC3            | `completed` | Sidebar V2 and project-scope popup match Web without reflow or duplication        |
| OC5 | Converge Composer layout and token contracts         | OC4            | `completed` | Composer geometry, density, contrast, and context strip meet the matched baseline |
| OC6 | Restore stage branding from canonical build metadata | OC5            | `completed` | Dev artwork is visible in the local packaged preview without prototype branding   |
| OC7 | Run the five-outcome product proof                   | OC6            | `completed` | One report proves O1–O5 on a real packaged cold start                             |

Use only `pending`, `in_progress`, `completed`, `blocked(runtime-gap-id)`, or `skipped(reason)`. Only one task may be `in_progress`.

## OC0: Freeze failures and baselines

The screenshots attached to the planning session live in temporary macOS paths and are not durable evidence. Reproduce their states from a fresh isolated base directory and record stable failure signatures before changing code.

The completed baseline is recorded in `reports/oc0-outcome-baseline.json`.
Native Sidebar/Composer and deterministic lifecycle-error failures are
durable. An owned isolated Electron process now supplies the current 1280 x
820 Sidebar V2 and Composer reference with zero unexpected renderer errors.
Computer Use exercised the real Settings/Beta/Back path to enable Sidebar V2
in the copied client state and opened the project-scope popup; CDP recorded the
closed/open trigger, popup, thread-list, and Composer geometry. The report
explicitly classifies this as historical-failure freezing against the current
Web product reference, not OC7 same-snapshot certification.

### Steps

1. Build the current Web and Lynx artifacts once and record the commit identity.
2. Prepare one populated project/thread snapshot that both renderers can consume.
3. Capture current Web/Electron Sidebar V2 and Composer at 1280 x 820 with the Sidebar open.
4. Launch packaged Lynxtron from the same logical state without reload and record:
   - server-ready output;
   - renderer transport `kind` and `lastSeq()`;
   - visible Connecting presence;
   - Sidebar closed/open project menu anatomy;
   - Settings tap route before and after the next route/connector update;
   - Composer anchors, typography, control order, and context strip;
   - resolved app stage, environment-identification mode, and backdrop presence.
5. Record `overrides.css` lines, renderer bundle size, `Composer.tsx` lines, `SidebarV2.lynx.tsx` lines, and route/product/renderer-local reuse without changing the denominator.

### Exit criteria

- Each O1–O5 failure has a deterministic state and a machine-readable or measured assertion.
- Web baselines use the current Sidebar V2 and current Composer, not historical Sidebar V1 captures.
- The report distinguishes compile, connection, route, visual, and interaction evidence.
- No production behavior changes in this task.

## OC1: Make packaged cold start semantically ready

Completed on 2026-09-08. Main now attaches the typed connector bridge before
the renderer bundle loads. The renderer subscribes before requesting its
initial snapshot and replays any buffered events in sequence afterward, which
closes both cold-start race windows without polling or reload. The exact-owned
packaged smoke in `scripts/verify-packaged-readiness.mjs` binds the process to
its DevTool listening port, verifies the current bundle URL, requires
`kind === "main"`, an advancing sequence, canonical project/model UI, no
visible Connecting state, and no renderer console problems. Three fresh
1280 x 820 runs passed; a withheld-bridge negative control failed as required.
Machine-readable results are in `reports/oc1-packaged-readiness.json`.

Fix the lifecycle before UI work. A renderer that cannot reach main invalidates every subsequent product capture.

### Required design

1. Refactor window boot so typed bridge handlers are attached before `loadFile` can execute renderer bootstrap.
2. Preserve the initial-snapshot guarantee for events emitted before renderer readiness.
3. Register the renderer event listener before or atomically with the ready/snapshot exchange so an event cannot fall between snapshot and subscription.
4. Keep the transport push-based. Do not restore the 400 ms preload path or add a retry polling loop.
5. Retain honest error state when bridge setup genuinely fails.

Add `scripts/verify-packaged-readiness.mjs` (or extend an existing semantic smoke) to:

- start packaged Lynxtron with an isolated base directory and explicit viewport;
- retain the exact child PID and logs;
- wait for the server-ready signal;
- resolve the exact `@t3tools/lynxtron` DevTool client/session;
- assert renderer transport `kind === "main"` and an advancing nonnegative sequence;
- assert a known project/model or equivalent canonical state and absence of visible Connecting;
- fail on `unavailable`, malformed state, premature process exit, or renderer errors;
- stop only the process it started.

A bounded deadline may fail the smoke. A fixed delay must not decide success.

### Exit criteria

- Three consecutive fresh packaged cold starts pass without Page reload or fixture injection.
- A focused test covers handler attachment versus renderer-load ordering.
- Ready/snapshot/event ordering and resync tests pass.
- Killing or withholding the bridge makes the smoke fail rather than produce a green screenshot.
- The old one-shot-race failure is recorded in `implementation-status.md` and the misleading polling-fallback comments are removed.

## OC2: Give Lynx navigation one authority

Completed on 2026-09-08. The Lynx pathname Atom is now the only writable
route authority; the unused TanStack memory-history load, navigation, and
subscription writeback path has been removed. Settings roots normalize
synchronously to `/settings/general`, supported sections are allowlisted, and
the read-only `globalThis.__T3_LYNXTRON_ROUTE__()` diagnostic exposes the
current route to the packaged harness. Two Computer Use passes exercised
Settings, Providers, Connections, Source Control, Beta, Archive, and Back.
A canonical provider update advanced the connector sequence from 24 to 34
while the route remained `/settings/providers`; the isolated setting was then
restored. Evidence is recorded in `reports/oc2-route-authority.json`.

The Lynx renderer cannot use `RouterProvider`, but it also must not maintain a local path and a second memory-router path that can overwrite each other.

### Required design

1. Keep Web on TanStack Router unchanged.
2. Make the Lynx pathname store the single writable authority for the supported Lynx routes.
3. Reuse `SettingsSectionPath` and the shared Settings navigation content for valid section intents.
4. Normalize `/settings` to `/settings/general` synchronously in the Lynx authority; do not depend on an asynchronous redirect to stabilize the screen.
5. Map shared `Link`, `useNavigate`, `useLocation`, and `useParams` Lynx leaves onto that authority.
6. Remove the reachable TanStack memory-router writeback when it no longer owns rendering. Do not replace it with another timer.
7. Expose a read-only route diagnostic for the packaged harness, or a stable `data-route` marker in the root surface.

### Required behavior proof

- Tap the actual lower-left Settings row once.
- Assert `/settings/general` and its canonical heading/content.
- Trigger a connector resync or wait for a subsequent sequenced connector update; assert the route is unchanged.
- Tap Providers, Connections, Source Control, Beta, and Archive in turn; assert exact route/content pairing.
- Tap Back; assert the route returns to chat once.
- Repeat Settings → section → Back twice to catch stale subscriptions and remount behavior.

### Exit criteria

- The flash-back regression is covered by a focused route-authority test and a real tap smoke.
- No competing pathname writer remains reachable in Lynx.
- Settings route and restore-state tests pass for both Web and Lynx hosts.
- No sleep or screenshot is used as the route-stability assertion.

## OC3: Make lifecycle state visible and actionable

The shared connector lifecycle projection and chat-route banner now cover
idle, server startup, connecting, error, and ready without animation or a
second state source. A packaged withheld-bridge run visibly rendered
`Connection unavailable` with the bridge failure detail. A second exact-owned
run terminated only its child server PID, rendered the terminal failure with
`Retry connection`, then launched a replacement server from that real button
and returned to ready on the same route with transport `main` and sequence 38.
Three normal fresh starts removed the banner only after semantic readiness.
Evidence is in `reports/oc3-lifecycle-status.json`.

Connection lifecycle is product state, not a styling side effect of disabled controls. Reuse the connector's canonical state and make it legible in the shell without adding another lifecycle authority.

### Required design

1. Project the existing `idle`, `starting-server`, `connecting`, `ready`, and `error` states, plus reconnecting when it is canonically distinguishable, into one renderer-neutral presentation contract.
2. Reuse the presentation contract in Web and Lynx where both surfaces expose the same state; keep only the rendered primitive in a platform leaf.
3. Show concise starting/connecting copy, actionable error detail, and recovery guidance in the chat shell. Clear transient status when the canonical state returns to ready.
4. Keep Composer availability derived from the same lifecycle state, but do not rely on a disabled Composer as the only indication that the product is unavailable.
5. Do not add a timer, polling loop, continuously repainting animation, or optimistic ready state. A failed transport must remain visibly failed and must fail the packaged readiness harness.

### Required behavior proof

- A fresh cold start visibly progresses through the applicable starting/connecting state and removes it only after semantic readiness.
- Interrupting the isolated child server produces a visible reconnecting or error state with useful recovery guidance.
- Recovery returns the shell to ready and clears stale failure copy without duplicating subscriptions or banners.
- Web and Lynx presentation tests cover every canonical lifecycle state even when a runtime cannot deterministically hold every transition for a screenshot.

### Exit criteria

- O5 passes in a fresh isolated packaged session.
- One shared projection owns lifecycle copy, severity, and available recovery action.
- The lifecycle indication is accessible in the normal chat shell and does not shift or obscure the primary controls.
- Focused state/projection tests pass, and the implementation adds no continuous animation.

## OC4: Converge Sidebar layout and anchored overlays

Completed on 2026-09-08 for the 1280 x 820 slice. Electron and Lynxtron
started from separate clones of snapshot `5686b023...abb3398` and rendered
thread `274e9e56...ba209`. After explicitly aligning the shared Sidebar width
preference to 256 px, Sidebar, workspace header, Search, and active-row
anchors all pass the 8 px threshold; all measured Sidebar typography passes
the 2 px threshold. The Lynx project-scope popup now uses an anchored absolute
surface with explicit item rows and an outside-tap backdrop. Its thread row
stays at y=173 before, during, and after the popup, closing the former 28 px
reflow. Evidence is under
`evidence/2026-09-08/OC4/sidebar-existing-thread/1280x820/`.

Keep the maximum shared Sidebar composition. Repair the platform primitive and layout contract instead of forking a Lynx Sidebar.

### Required design

1. Compare the same populated snapshot in current Web Sidebar V2 and Lynx.
2. Preserve `SidebarV2CompositionSurface`, `SidebarV2ControlsSurface`, and `SidebarV2RowSurface` as shared product owners.
3. Turn the Lynx project-scope popup into a bounded anchored-overlay primitive:
   - closed means no popup node;
   - open means the popup is out of normal Sidebar flow;
   - width follows the trigger/rail contract;
   - tap outside or item selection closes it;
   - selection changes exactly once;
   - no fixed screen-coordinate prototype offsets.
4. Fix Lynx host flex direction, min-width, shrink, truncation, row height, padding, and z-order only where the generated shared classes cannot express the runtime behavior.
5. Keep Search, New thread, project scope, New project, thread cards, timestamps/status, and Settings in the same hierarchy and order as Web.
6. Delete replaced Sidebar override rules and any obsolete menu workaround in the same task.

### Outcome checks

- Closed Sidebar: no duplicated All projects/project labels, clipped icons, escaped content, or unexpected horizontal row.
- Open scope menu: popup overlays the rail and does not move the thread list.
- Active thread card: project, time/status, title, and branch occupy the same visual hierarchy as Web.
- Search, New thread, project scope, thread selection, and Settings each respond to one real tap.
- 1280 x 820 and 1440 x 900 matched anchors differ by at most 8 px; corresponding font sizes differ by at most 2 px.

### Exit criteria

- O1 passes in a fresh packaged session that also passes OC1 readiness.
- Web and Lynx still import the same Sidebar product compositions.
- Lynx-only Sidebar code is a state/capability host plus primitives, not a second anatomy.
- Sidebar-related `overrides.css` has no unowned rule and records a net line delta.

## OC5: Converge Composer layout and token contracts

Completed on 2026-09-08. The matched 1280 x 820 and 1440 x 900 pairs pass
5/5 anchors, 3/3 typography checks, and 4/4 semantic color checks. Composer
geometry is exact in both pairs. The Web and Lynx renderers now share the
full traits label projection, while Lynx resolves the active branch through
the server VCS status contract and uses the canonical ready placeholder. Real
Computer Use taps opened the model picker and changed runtime, interaction,
and model-option state on a disposable exact-owned process. Evidence is under
`evidence/2026-09-08/OC5/` and `evidence/2026-09-08/OC7/`.

The shared Composer boundary must determine more than child order. Move geometry, density, and semantic color decisions into the shared contract; keep native text entry in Lynx.

### Required design

1. Measure Web and Lynx from the same new-thread and existing-thread snapshots.
2. Extend the shared Composer composition only where needed to own:
   - shell maximum width and centering;
   - editor minimum/maximum height and inner padding;
   - footer height, separator positions, and primary-action alignment;
   - regular versus compact control presentation;
   - context-strip overlap, bottom radius, checkout/branch allocation;
   - semantic foreground, muted, disabled, provider accent, and primary-action tokens.
3. If Lynx cannot evaluate the Web container query, share a pure layout-variant resolver and pass the resulting variant through the existing Elements contract. Do not duplicate breakpoint decisions in CSS and JSX.
4. Remove hard-coded product colors and duplicated pill anatomy from the Lynx host where shared classes/tokens can own them.
5. Keep only native textarea/input events, unavailable selection behavior, and proven control primitives in the Lynx island.
6. Preserve exact model/runtime/interaction state from canonical projections; do not shorten labels merely to make the screenshot fit.

### Outcome checks

- Placeholder, model, reasoning/model option, access/runtime, interaction mode, and send/stop appear in canonical order.
- No control overlaps, clips, wraps into an unintended second row, or becomes unreadably low contrast.
- Checkout and branch remain attached to the card without covering its footer.
- Empty, populated, disabled/connecting, sending, and interruptible fixtures retain one composition.
- Model and mode controls open from real taps. Physical typing/focus remains a separate R5 user-session check.
- At both standard viewports, Composer outer/editor/footer/context anchors differ from Web by at most 8 px and font sizes by at most 2 px.

### Exit criteria

- O3 passes in new-thread and existing-thread states.
- `Composer.tsx` shrinks or has every remaining block classified as a native island/capability adapter.
- Composer override rules have explicit owners and a net line delta; no copied Web product rule is introduced.
- Focused surface, projection, input-adapter, and tap tests pass.

## OC6: Restore stage branding from canonical build metadata

Completed on 2026-09-08. Lynxtron now resolves its stage through one tested
preload source, defaults an unadorned repository-built package to Dev, accepts
all four canonical stages, and gives Latest the canonical unadorned display
name. Web and Lynx consume one client-runtime projection for artwork, pill, and
none modes. Five fresh packaged runs proved default Dev artwork, Nightly
artwork, Dev pill, Latest none, and Alpha without invented artwork; every run
used the main transport, advanced its sequence, and reported zero renderer
warnings/errors. Evidence is in `reports/oc6-branding-*.json`.

Do not hard-code a blue rectangle into the Sidebar. Restore the product's stage-identification semantics.

### Required design

1. Define one build-stage source for local packaged preview, Dev, Nightly, Alpha, and Latest instead of inferring local packaged launch from a missing runtime `NODE_ENV`.
2. Keep `environmentIdentificationMode` authoritative:
   - `artwork` renders the eligible Dev/Nightly shared backdrop;
   - `pill` renders the shared label;
   - `none` renders neither.
3. Make the standard repository-built Lynxtron preview resolve to Dev unless an explicit release channel overrides it.
4. Continue using `SidebarChromeHeader` and `SidebarStageBackdrop.lynx`; do not restore the deleted prototype `SidebarBrand` component.
5. Verify wordmark contrast, global sidebar toggle contrast, clipping, and z-order over the backdrop.
6. Record Alpha/Latest behavior explicitly; this plan does not invent artwork for a stage where Web intentionally has none.

### Exit criteria

- O4 passes on a fresh unadorned local packaged launch without manually exporting a stage variable.
- Explicit Dev and Nightly resolve to their correct shared artwork.
- Artwork/pill/none preference tests pass.
- No duplicate branding component or unregistered color region is added.

## OC7: Five-outcome product proof

Completed on 2026-09-08 for the bounded Plan 11 scope. The final Lynx bundle
passed three fresh unadorned cold starts with main transport, advancing
sequence, canonical project/model UI, Dev artwork, and zero renderer problems.
O1-O5 are independently recorded as pass in
`reports/oc7-five-outcome-proof.json`. The release remains a
`chat-first-preview`: R5, R11, R12, and R13 remain explicit runtime gaps, and
no commit or push was created because the working tree includes pre-existing
user changes and this run was not authorized to publish them.

This is a bounded outcome certification, not a rerun of every historical AR6 screenshot.

### Required evidence

1. Build Web, server bundle, and Lynxtron once from the final commit.
2. Run three fresh packaged cold starts; all must pass the OC1 semantic harness without reload.
3. From the third ready process, use one isolated populated snapshot and real supported taps to exercise:
   - starting/connecting, ready, interrupted, and recovered lifecycle states;
   - Sidebar closed and project-scope-open states;
   - Settings entry, two section changes, route retention after a connector event, and Back;
   - new-thread and existing-thread Composer states plus model/mode activation;
   - Dev branded header.
4. Capture matched Web/Lynx evidence for only the affected visual states at 1280 x 820 and 1440 x 900, dark theme. R13 remains the owner of light-theme certification.
5. Run final route/product/renderer-local reuse, bundle, Lynx-owned-line, and `overrides.css` reports without changing classifications.
6. Record the five outcomes in a pass/fail table. Link the semantic logs and interaction assertions as well as images.

### Plan exit criteria

- O1–O5 are all `pass`; no result is inferred from another gate.
- Cold start succeeds 3/3 with `kind === "main"`, advancing sequence, canonical UI state, and zero renderer errors.
- Starting, failure/reconnecting, and recovery states remain visible and truthful throughout the lifecycle proof.
- Settings never returns to chat without explicit Back.
- Sidebar popup does not alter normal-flow anchors.
- Composer meets the defined anchor, typography, order, and content checks.
- Dev stage artwork is visible and owned by the shared branding path.
- Web behavior remains unchanged in focused integrated checks.
- Open R5, R11, R12, and R13 limitations remain explicit; the release stays `chat-first-preview` unless their separate gates close.
- `implementation-status.md`, `compat-matrix.md`, and this task table match the evidence.
- Every OC task has one focused commit pushed to `lynxtron/lynxtron-port`.

## Per-task acceptance

Use the smallest proof that matches the task:

1. Focused tests for changed behavior.
2. Affected Web and Lynx TypeScript programs.
3. ReactLynx scanner for changed renderer files.
4. Lynx API/CSS audits only when the renderer or CSS surface changed.
5. Affected production build.
6. `report:reuse` only for a shared-boundary change.
7. One fresh 1280 x 820 semantic-ready packaged smoke; for visual tasks, capture one affected state after the real tap.
8. `git diff --check`.

Do not run the full dual-viewport outcome proof until OC7. Do not call a zero-error capture a connected-product smoke unless the readiness assertions also pass.

## Measures of architectural improvement

Report these without turning them into vanity gates:

- Five observed regressions: target 5 → 0.
- Fresh packaged cold-start success: target 3/3 without reload.
- Writable Lynx route authorities: target 2 → 1.
- Sidebar popup normal-flow anchor delta when opened: target 0 px.
- Shared Sidebar/Composer compositions reachable from both builds: must remain one physical source.
- Lynx-owned Sidebar/Composer product lines: target decrease; any increase needs an explicit primitive/island owner.
- Sidebar/Composer prototype CSS: target net decrease across OC4–OC6.
- Renderer bundle delta: report and explain; do not add a second icon/art asset set.
- Event payload/update frequency: unchanged except for deliberate readiness diagnostics.

## Stop conditions

Stop and report when:

- an upstream conflict extends outside the active OC surface;
- bridge handlers cannot be attached before renderer execution with the installed Lynxtron API;
- Settings stability requires reintroducing RouterProvider and reproduces the known snapshot crash;
- the Sidebar or Composer shared subtree requires a broad DOM shim instead of a bounded leaf;
- a visual result can be obtained only by copying Web JSX or restoring prototype composition;
- the same task fails three times after decomposition;
- completion depends on physical keyboard, focus, wheel, drag, or selection evidence requiring a user session;
- LFS, signing, notarization, or another external decision is required.

Do not stop merely because a screenshot differs. Record the failing anchor or behavior and continue inside the active task.

## Session handoff requirements

Before ending a session, record:

- current commit, branch, and remote relation;
- active OC task and its exact remaining exit criteria;
- dirty files owned by the task and unrelated user-owned files preserved;
- focused commands and semantic/visual results;
- exact next command;
- processes, PIDs, ports, DevTool client/session, and temporary isolated state;
- new compatibility gaps;
- commit and push status.

## Prompt for the next session

```text
Continue the T3 Code Electron-to-Lynxtron outcome convergence in
/Users/bytedance/github/t3code on branch lynxtron-port.

Read these files in order:
1. AGENTS.md
2. .impeccable.md
3. apps/lynxtron/docs/plans/11-outcome-driven-convergence.md
4. apps/lynxtron/docs/implementation-status.md
5. apps/lynxtron/docs/compat-matrix.md
6. apps/lynxtron/docs/plans/00-execution-index.md

Plan 11 is the active execution order after Plan 10. Preserve all existing
user work. Resume the first non-completed OC task and keep only one task in
progress. Commit and push each completed task separately.

This is not a generic polish pass. Make the shared architecture prove five
product outcomes: correct Sidebar V2, stable Settings navigation, truthful
lifecycle status, adapted Composer, and restored Dev stage artwork. Fix
cold-start semantic readiness before accepting any UI evidence. A server-ready line, visible window,
DevTool session, zero-error console, reload, or screenshot alone is not a
passing product smoke.

Use current Web/Electron as the source of truth. Preserve shared product
composition and put only native input, list, anchored overlay, measurement,
and tap mechanics in Lynx leaves. Do not add polling, a second route owner,
copied JSX, unowned overrides, exclusions, masks, or prototype branding.
```
