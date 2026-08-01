# Establish a browser-first Web / Lynx UI loop

Plan 11A is a bounded harness experiment inserted between the active Plan 11
work and Plan 12 feature-parity execution. It does not replace either plan and
does not change their product ordering. Finish the current atomic Plan 11 task
before starting this plan; use the result to close Plan 11 visual outcomes,
complete OC7, and then continue with Plan 12.

## Plan metadata

- Content type: How-to
- Status: Ready
- Audience: Agents continuing the T3 Code Electron-to-Lynxtron port
- Goal: Prove that T3 Web and the existing ReactLynx product UI can run from
  the same checkout in a fast browser comparison loop, then use that loop to
  converge one real main-shell slice before one final Native correlation run
- Product source of truth: Current Web/Electron in this checkout
- Lynx source: The existing `apps/lynxtron/src/app` entry and `.lynx` platform
  leaves; no browser-only copy of product JSX
- Scope: Browser development harness, deterministic scenarios, main shell,
  Sidebar V2, Composer shell, lifecycle presentation, stage branding, and one
  final 1280 x 820 Lynxtron correlation capture
- Out of scope: Replacing Native acceptance, changing Plan 11/12 product
  priorities, renderer-side WebSocket transport, terminal/browser
  implementation, full patch rendering, and broad DOM emulation
- Branch: `lynxtron-port` in `/Users/bytedance/github/t3code`
- Updated: 2026-08-02

## Scheduling rule

Plan 11A is supporting work, not a new product phase.

1. Do not abandon or restage a partially completed Plan 11 task. Finish its
   focused checks, commit, and push first.
2. Run BW0 through BW5 at the next clean task boundary and before Plan 11 OC7
   is declared complete. If OC7 is already complete, run Plan 11A before Plan
   12 PF0.
3. Browser evidence may close visual-development and deterministic-state gaps,
   but it cannot close Plan 11 cold-start, bridge, real-input, or Native-only
   interaction requirements.
4. Return to the first incomplete Plan 11 task after BW5. Complete OC7 before
   beginning Plan 12.
5. If the experiment fails its adoption gate, preserve the report, remove
   disposable orchestration, and continue Plan 11 then Plan 12 with the
   existing tiered Native harness.

## Product decision

The normal UI loop should answer two questions cheaply in a browser:

1. Does current Web/Electron still render the intended product?
2. Does the ReactLynx source render the same composition, state, and primary
   geometry through Lynx for Web?

Native Lynxtron remains responsible for the third question:

3. Does that result survive the Lynx Engine, Lynxtron host, main/preload
   bridge, native input, and actual desktop interaction?

```text
shared product compositions
  |-- Web host ----------> React DOM ----------> browser reference
  `-- Lynx host ---------> ReactLynx
                            |-- Lynx for Web ---> browser development proxy
                            `-- Lynxtron -------> Native acceptance
```

The browser host must load the real compiled Lynx application. A parallel DOM
implementation of the Lynx UI would repeat the clean-room-port failure and is
not acceptable.

## Why the experiment is timely

The source architecture is now suitable for this test:

- the chat root, transcript rows, Composer, model picker, quick switch,
  Settings surfaces, right-panel chrome, and file-tree rows compile shared
  physical compositions;
- remaining Lynx-owned code is primarily a root host, capability/primitive
  leaves, or registered hard islands;
- Plan 11 OC4, OC5, and OC6 have source-level Sidebar, Composer, and branding
  convergence, while matched visual evidence remains expensive and vulnerable
  to DevTool session availability;
- Plan 12 contains many UI-heavy states that should not require a complete
  Native build-and-capture cycle after every spacing or composition change.

The experiment must measure whether the browser loop changes that cost. Merely
displaying a Lynx page in a browser is not a successful outcome.

## UI suitability

### Primary validation slice

| Surface | Suitability | Browser-loop responsibility |
| --- | --- | --- |
| App shell / `ChatRouteSurface` | highest | Sidebar, header, chat column, Composer, banner, and right-panel geometry |
| Sidebar V2 | highest | 256 px rail, top controls, project scope, thread cards, spacing, truncation, and selected states |
| Project-scope popup | high | anchor, overlay order, bounds, and no thread-list reflow |
| Composer shell | highest | hero/docked variants, width, density, footer order, context strip, and primary-action geometry |
| Stage branding | highest | Dev backdrop and the documented Nightly/plain variants |
| Lifecycle banner | high | starting, error, reconnecting, ready, and disabled-Composer presentation |
| Settings shell | high, follow-up | navigation anatomy, General/Appearance layout, and stable browser route projection |
| Quick Switch / Model Picker | high, follow-up | overlay bounds, row anatomy, search, empty state, and backdrop |

BW4 must cover the first six rows. Settings and overlays may be added only
after the primary slice passes; they do not block the experiment.

### Good Plan 12 follow-ups when the experiment passes

- PF1 intervention, approval, question, retry, and receipt card states;
- PF2 attachment/context anatomy and pending/failed Composer states;
- PF3 static transcript-card order, Markdown tables and nested blocks;
- PF5 checkpoint, diff-summary, changed-file, and Files chrome;
- PF7 theme matrices and ordinary visual polish.

### Native-only or Native-final boundaries

Browser rendering may help inspect the surrounding anatomy, but it must not
be accepted as final evidence for:

- packaged cold start, server ownership, `lynxBridge`, `sendGlobalEvent`, or
  connector sequence readiness;
- native textarea typing, focus, selection, paste, or IME behavior;
- Menu accelerators or physical keyboard input;
- `<list>` wheel/drag scrolling, scroll anchoring, and follow-tail behavior;
- clipboard, local-path navigation, or external navigation;
- exact Native font metrics, SVG, fixed/sticky/overflow, and raster behavior;
- full patch rendering under R10;
- terminal and embedded-browser runtime products;
- Settings stability across real connector/router updates.

R5/R12 checks remain `pending-user-session` unless an authorized Computer Use
or user session sends real OS input and records the visible result.

## Fixed architecture constraints

1. Build Lynx for Web from the existing ReactLynx entry and production module
   graph. Preserve `.lynx.tsx`, `.lynx.ts`, then ordinary extension priority.
2. Do not copy product JSX, product state machines, routes, or CSS into the
   comparison host.
3. The comparison host owns lifecycle, scenario selection, and identity. The
   embedded renderer owns product rendering only.
4. Preserve the main-owned connector model. Do not add a WebSocket or server
   process to the Lynx renderer to make previewing convenient.
5. The preview transport must satisfy the existing typed ready/resync/command
   boundary and publish monotonic sequenced events. Production transport must
   not import preview code.
6. Use isolated deterministic state. Never point a browser preview or server
   at live `~/.t3/userdata`.
7. Browser capability adapters must be explicit. Unsupported keyboard,
   selection, file-path, shell, or native actions must not silently become
   product claims.
8. Pin compatible Lynx Web dependencies directly. Do not rely on transitive
   packages or a CDN.
9. Do not upgrade the complete Lynx/ReactLynx/Lynxtron stack merely to make the
   spike pass. Stop and report the version boundary first.
10. Do not change reuse exclusions, screenshot masks, or fidelity thresholds.
11. Browser comparison artifacts are diagnostic until BW5 establishes Native
    correlation. Keep them outside the certification matrix before that gate.

## Task sequence

| ID | Task | Depends on | Status | Exit result |
| --- | --- | --- | --- | --- |
| BW0 | Prove current-stack Lynx Web compatibility | current Plan 11 boundary | `completed` | Existing ReactLynx entry renders in a browser without a product fork |
| BW1 | Add the typed browser preview host | BW0 | `pending` | Semantic state and commands cross the existing connector boundary |
| BW2 | Build the dual-renderer workbench | BW1 | `pending` | Web and Lynx Web render one identified scenario at matched dimensions |
| BW3 | Calibrate detection and iteration cost | BW2 | `pending` | Known geometry/style faults fail reliably and steady-state feedback is measured |
| BW4 | Converge the main-shell validation slice | BW3 | `pending` | Four deterministic product states meet the browser comparison gates |
| BW5 | Correlate once with Native Lynxtron | BW4 | `pending` | One real Native run confirms or rejects the browser proxy |
| BW6 | Adopt narrowly or remove the experiment | BW5 | `pending` | Plan 11/12 harness policy records a go/no-go decision |

Use only `pending`, `in_progress`, `completed`, `blocked(runtime-gap-id)`, or
`skipped(reason)`. Keep one BW task in progress and commit/push each completed
task separately. Do not mix unrelated Plan 11 or Plan 12 product work into a
BW commit.

## BW0: Prove current-stack Lynx Web compatibility

Completed on 2026-08-02. The current stack already contains the required
dual-target encoder: an Rspeedy environment named `web` makes
`@lynx-js/react-rsbuild-plugin` select `WebEncodePlugin`, while the existing
`lynx` environment continues to select the Native encoder. The new build uses
the same `src/app/index.tsx`, resolver order, and production module graph to
emit `main.web.bundle`; the browser host loads that artifact through
`@lynx-js/web-core/client` and `<lynx-view>`. A control attempt confirmed that
the Native `main.lynx.bundle` is not interchangeable (`Invalid Magic Header`).
The successful isolated Chrome probe rendered `ChatRouteSurface`,
`ComposerSurface`, and the `.lynx` sidebar/wordmark leaves with zero
unexplained runtime errors. Detailed versions, identities, hashes, console,
and the diagnostic screenshot are in `reports/bw0-browser-compatibility.json`
and `evidence/2026-08-02/BW0/current-stack/`. This is compatibility evidence,
not populated-state, interaction, or Native acceptance; typed scenarios begin
in BW1.

### Required work

1. Record the current ReactLynx, Rspeedy, Lynx types, Lynxtron, Web Platform,
   Rspack, and browser versions.
2. Verify the official Lynx Web runtime and build-plugin contract against the
   versions already used by `apps/lynxtron`.
3. Add only the direct development dependencies required by the spike, pinned
   to a compatible set.
4. Add a browser-target build that starts from the existing
   `src/app/index.tsx` and uses the production resolver order.
5. Load the result in `<lynx-view>` and record the actual generated bundle
   paths, hashes, and browser console.

### Exit criteria

- The rendered source includes a known current T3 shared surface and a Lynx
  platform leaf.
- No product component has been copied or rewritten for the browser.
- No broad `window`/`document` shim enters the ReactLynx product graph.
- The build and runtime have zero unexplained errors.
- If compatibility requires a stack-wide upgrade or product fork, stop and
  publish a blocker report instead of continuing to BW1.

## BW1: Add the typed browser preview host

### Required work

1. Implement a development-only host for the existing connector protocol.
2. Provide ready/snapshot, resync, command recording, and sequenced event
   delivery through the same renderer-facing types as Lynxtron main.
3. Load canonical `ConnectorSnapshot` scenarios for project, thread, model,
   lifecycle, access, shell, and branding state.
4. Provide isolated preview capabilities for preferences and safe diagnostic
   actions. Keep keyboard, real filesystem, shell, and unsupported native
   actions explicitly unavailable.
5. Expose a semantic readiness hook containing host kind, last sequence,
   scenario identity, route, and known visible project/thread/model.

### Exit criteria

- The embedded Lynx UI reaches a nonnegative advancing sequence and renders a
  known populated state.
- Refresh and scenario switching are deterministic.
- Commands are observable and cannot mutate real user data.
- Production Lynxtron main/preload/connector behavior is unchanged.

## BW2: Build the dual-renderer workbench

### Required work

1. Provide one browser workbench with Web and Lynx Web panes.
2. Synchronize scenario, route, theme, lifecycle state, and semantic viewport.
3. Support 1280 x 820 and 1440 x 900 cells without conflating cell size,
   device-pixel ratio, and exported image size.
4. Capture each pane, a side-by-side image, a diagnostic pixel diff, geometry,
   console errors/warnings, source commit, scenario hash, and bundle identity.
5. Add an ordinary development command and a deterministic capture command.
6. Use a named isolated browser session and close only that session.

### Exit criteria

- Both panes identify the same scenario, route, theme, and viewport.
- Exported images have matching declared dimensions.
- A clean scenario has no runtime errors.
- Updating an ordinary shared composition or generated Lynx style does not
  require a Lynxtron build or launch.

## BW3: Calibrate detection and iteration cost

The harness must prove that it can reject defects, not merely save images.

### Required work

1. Apply test-only calibration changes that temporarily:
   - shift Sidebar width or a top-control bound;
   - move the Composer footer/control row;
   - suppress the stage backdrop.
2. Verify that geometry assertions or visual comparison fail for each change.
3. Remove the calibration and verify the clean scenario passes.
4. Record five edit-to-both-panes-ready samples after initial build.
5. Keep calibration out of product bundles and committed visual baselines.

### Exit criteria

- All three deliberate faults are detected.
- The restored state passes without adding masks.
- Median steady-state edit-to-dual-render feedback is at most 10 seconds on
  the current machine, or the report identifies the dominant cost.
- Caret, timestamp, scrollbar, and animation noise do not dominate results.

## BW4: Converge the main-shell validation slice

Use the workbench for real product iteration. Do not make unrelated feature
changes merely because another unfinished surface is visible.

### Required scenarios

#### 1. New Thread

- Sidebar and all top controls remain inside the canonical rail.
- The Dev backdrop is visible behind the shared brand region.
- The hero Composer is centered within the chat column and does not collide
  with Sidebar or branding.
- Footer controls remain ordered, legible, and non-overlapping.

#### 2. Existing Thread

- Header, timeline, docked Composer, and optional right panel form the shared
  root anatomy.
- Composer density, frame, footer, context strip, and action placement converge
  with Web.
- Sidebar project grouping, thread card, time/status, selection, and truncation
  converge with Web.
- Opening the right panel shrinks only the intended main column.

#### 3. Project Scope Open

- The popup opens below its trigger and remains within intended bounds.
- The popup overlays rather than participating in Sidebar flow.
- Thread-list movement is no more than 1 px.
- Popup rows remain above the dismiss layer and visibly selectable.

#### 4. Lifecycle Error

- The canonical error/recovery presentation is visible.
- Composer disabled state is explicit and does not carry the entire error
  meaning by itself.
- Recovery actions do not break shell geometry.
- Returning to ready removes the banner and restores the intended layout.

### Exit criteria

- All four scenarios pass current content, geometry, and visual thresholds or
  register each remaining difference against an existing/new R# without
  changing masks or exclusions.
- At least one real current UI defect is found and fixed through this loop.
- The evidence records how many Native rebuilds and launches were avoided.
- Browser rendering is not used to claim cold-start, real tap, keyboard,
  scrolling, focus, selection, or connector recovery acceptance.

## BW5: Correlate once with Native Lynxtron

Ask for browser/Computer Use authorization before interactive capture. Use the
existing owned-process and evidence-validity rules from `AGENTS.md`.

### Required work

1. Build the affected production Lynx artifact once.
2. Start one fresh owned Lynxtron process with isolated realistic state and an
   explicit 1280 x 820 viewport.
3. Prove semantic readiness, process/bundle identity, and the known scenario.
4. Capture the primary main-shell state through Lynx DevTool with zero renderer
   errors.
5. Use one real tap for the project-scope popup when the session supports it;
   keep keyboard/wheel/focus work pending under R5/R12.
6. Compare Web, Lynx Web, and Native for anatomy, content, major geometry, and
   registered runtime differences.

### Exit criteria

- The browser-loop fixes are present in Native.
- Native has no main-shell regression that the browser result classified as a
  pass without explanation.
- Native-only differences are assigned to product defect, runtime gap,
  expected rendering-pipeline difference, or invalid harness evidence.
- Owned processes, ports, sessions, and isolated state are cleaned up.

## BW6: Adopt narrowly or remove the experiment

### Adopt when

- both panes use real production source rather than copied UI;
- all four deterministic scenarios are repeatable;
- the steady-state loop meets the 10-second target or materially improves on
  the recorded Native loop;
- at least one real defect was fixed through the workbench;
- the BW5 Native result confirms the main browser conclusions; and
- the slice required no more than one final Native evidence launch, excluding
  a clearly documented harness failure.

When adopted:

1. Add the browser workbench as the default development loop for applicable
   Plan 12 UI slices.
2. Keep one Native semantic-ready smoke at the relevant slice exit.
3. Reserve paired viewports, theme matrices, lifecycle matrices, remote
   journeys, and real-input sessions for their phase exits.
4. Update `AGENTS.md` and the Lynxtron verification docs with the exact evidence
   boundary and commands.

### Reject or narrow when

- Lynx Web needs a parallel product implementation or broad DOM emulation;
- current-stack compatibility requires an unapproved platform upgrade;
- scenario identity cannot be kept consistent across panes;
- repeated browser passes hide major Native shell regressions; or
- maintaining the workbench costs more than the Native iterations it removes.

On rejection, retain a concise findings report and any generally useful
compatibility probe, remove disposable compare orchestration, and resume Plan
11 then Plan 12. Do not leave a second unofficial Lynx UI path in the repo.

## Per-task acceptance

For BW0 through BW4, run only the affected checks:

1. focused tests for the host, scenarios, measurements, and changed surface;
2. affected Web and Lynx typechecks;
3. ReactLynx scanner for changed renderer code;
4. CSS/API audits only when the corresponding source boundary changes;
5. affected browser production builds;
6. `report:reuse` only when a shared product boundary changes;
7. one deterministic browser comparison at 1280 x 820; and
8. `git diff --check`.

Do not run the complete Native certification matrix during BW0 through BW4.
BW5 owns the one required Native correlation run. Existing Plan 11 and Plan 12
phase-exit requirements remain unchanged.

## Stop conditions

Stop and report when:

- the current Plan 11 task has uncommitted work that cannot safely reach an
  atomic boundary;
- the Web Platform build needs a stack-wide dependency upgrade;
- the implementation requires a browser-only product fork or renderer-side
  server transport;
- a production capability would behave differently merely because preview
  code is present;
- browser and Native scenario identity cannot be proven;
- browser or Computer Use authorization is required but unavailable; or
- a merge conflict or dirty-file overlap extends beyond Plan 11A-owned files.

## Evidence and handoff

Every BW task handoff records:

- commit, branch, remote relation, and active BW task;
- files owned by Plan 11A versus unrelated preserved work;
- dependency and bundle identities;
- scenario, route, theme, viewport, device-pixel ratio, and image dimensions;
- Web and Lynx Web readiness plus console results;
- edit-to-ready timings and Native-launch count;
- diagnostic versus certification evidence classification;
- Native correlation result when BW5 has run; and
- the exact next Plan 11 or Plan 12 task after Plan 11A.

## Replacement goal prompt

Use the following prompt to replace the active high-level goal without
discarding Plan 11 or Plan 12:

```text
Continue the T3 Code Electron-to-Lynxtron port in
/Users/bytedance/github/t3code on branch lynxtron-port.

The product execution order remains Plan 11, then Plan 12. Add Plan 11A as a
bounded supporting harness experiment at the next safe atomic boundary; it
does not supersede either product plan.

Read these files in order:
1. AGENTS.md
2. .impeccable.md
3. apps/lynxtron/docs/plans/00-execution-index.md
4. apps/lynxtron/docs/plans/11-outcome-driven-convergence.md
5. apps/lynxtron/docs/plans/11a-browser-dual-renderer-validation.md
6. apps/lynxtron/docs/plans/12-feature-parity-by-product-value.md
7. apps/lynxtron/docs/implementation-status.md
8. apps/lynxtron/docs/compat-matrix.md
9. apps/lynxtron/docs/port-ledger.md

First inspect the current worktree and identify the active Plan 11 atomic
task. Preserve all existing and untracked user work. Do not abandon, restage,
or mix a partially completed Plan 11 task: finish its focused validation,
commit, and push it before starting Plan 11A.

At that clean task boundary, execute Plan 11A BW0 through BW5 in order. Build
Lynx for Web from the existing ReactLynx production source, add a typed and
isolated browser preview host, and create a Web-versus-Lynx-Web comparison
workbench. Use it to converge the bounded main-shell slice: Sidebar V2,
project-scope overlay, Composer shell, lifecycle presentation, and stage
branding. Do not copy product JSX, add renderer-side WebSocket transport,
upgrade the full Lynx stack without reporting the blocker, or treat browser
rendering as Native acceptance.

Measure whether the browser loop detects real faults and provides steady-state
dual-render feedback within the Plan 11A target. After browser convergence,
run BW5's single fresh 1280 x 820 semantic-ready Lynxtron correlation pass.
Keep bridge lifecycle, physical keyboard/focus/selection, native textarea,
wheel/drag scrolling, filesystem/navigation, and OS menu evidence Native-only
or pending-user-session as documented.

After BW5, record the BW6 go/no-go decision. Then return to the first incomplete
Plan 11 task, complete OC7 and O1-O5, and only then begin the first incomplete
Plan 12 PF task. Keep one task in progress, use slice-level validation during
implementation, reserve full matrices for phase exit, and commit/push each
completed task separately.
```
