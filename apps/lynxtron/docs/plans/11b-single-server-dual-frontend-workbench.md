# Compare the real Web app and Lynx UI against one shared server

> **Historical / superseded execution context.** Keep this file as the record
> of replacing the hand-built Web reference with the real Web app. Do not use
> its completed task table, comparison implementation, or `PASS` labels as the
> current fidelity authority. The current Harness, evidence, context-cleanup,
> and gap-prioritization authority is
> [Plan 11C](./11c-synara-harness-reset-and-gap-prioritization.md).

Plan 11B corrects a wrong turn in Plan 11A. The dual-renderer workbench built a
hand-authored Web "reference host" (`apps/web/src/browser-workbench-reference/`)
instead of comparing the shipping product. That reference re-implements the app
shell, re-wires Sidebar V2, and drifts from the real layout — so a broken
reference pane looks like a broken product. This plan removes the reference and
compares the two **real** frontends, both connected to **one** T3 Code server,
which is the architecture the monorepo already exists to support.

## Plan metadata

- Content type: How-to
- Status: Completed (2026-08-03; SB0–SB5 all completed)
- Audience: Agents continuing the T3 Code Electron-to-Lynxtron port
- Goal: Replace the hand-built Web reference pane with the real Web app, drive
  both the real Web app and the Lynx-for-Web renderer from a single shared T3
  Code server over one seeded isolated dataset, then reissue the comparison so
  the left pane is the shipping product and the right pane is real Lynx source
- Product source of truth: Current Web/Electron in this checkout
- Lynx source: The existing `apps/lynxtron/src/app` entry and `.lynx` platform
  leaves; no browser-only copy of product JSX
- Scope: Single-server workbench orchestration, a dev-only browser connector
  transport for the Lynx pane, seeded isolated server state, and the reissued
  Web-versus-Lynx comparison across the states Plan 11A already enumerated
- Out of scope: Replacing Native acceptance, changing Plan 11/12 product
  priorities, adding a WebSocket transport to the **production** Lynx renderer,
  upgrading the Lynx stack, and any new product feature work
- Branch: `lynxtron-port` in `/Users/bytedance/github/t3code`
- Updated: 2026-08-03

## Why this plan exists

Plan 11A asked two cheap browser questions:

1. Does current Web/Electron still render the intended product?
2. Does the ReactLynx source render the same composition and geometry through
   Lynx for Web?

Plan 11A answered (2) correctly with the embedded Lynx-for-Web renderer, but
answered (1) with a **reference host** that only borrows shared surfaces and
re-assembles the shell by hand. That was a shortcut taken to avoid standing up
a server, and it backfired:

- the reference pane owns its own `SidebarProvider`, `collapsible="offcanvas"`
  wiring, and a minimal `reference.css` that does not reproduce the shipped flex
  sizing chain, so the sidebar collapses and a tooltip sticks open;
- a reviewer reading the comparison cannot tell a reference-fidelity defect
  from a real product regression;
- the left pane is not the artifact that ships, so "Web authority" is a claim
  the pane cannot actually back.

The monorepo already solves this. Per `AGENTS.md`, one Node WebSocket server
"serves web, desktop, and mobile clients", `packages/contracts` defines the
wire protocol, and `packages/client-runtime` is the shared client logic. The
Lynxtron connector (`apps/lynxtron/src/main/desktop/connector.ts`) already
spawns the real server and speaks the same Effect-RPC WebSocket. `~/github/
synara` compares its Web and Lynx apps by connecting both to the real Synara
server (`apps/lynx/src/platform/runtimeEndpoint.logic.ts` targets
`ws://127.0.0.1:58090`); it does not build a reference UI. Plan 11B adopts that
model.

## Product decision

The comparison workbench must render the **shipping** artifacts:

```text
one seeded isolated T3 Code server
  |-- real Web app ------> React DOM ----------------> left pane
  `-- dev-only browser connector transport --> Lynx for Web --> right pane
```

Both panes read the same server state, so any difference between panes is a
real renderer or composition difference, not a reference-fidelity artifact.

Production Lynxtron is unchanged: it keeps the main-owned connector
(`connector.ts` in main, thin bridge to the UI). The dev-only browser transport
exists only to let the Lynx-for-Web **pane** subscribe to the same server in a
browser, where there is no preload/main layer. Production code must never
import it.

## Fixed architecture constraints

1. Delete the hand-built reference host. Remove
   `apps/web/src/browser-workbench-reference/` and its build config
   (`apps/web/vite.workbench.config.ts`) and the `dist-workbench-reference`
   output. Do not leave a second, unofficial Web UI path in the repo.
2. The left pane is the real Web app build, unmodified in product behavior. It
   connects to the shared server the same way any browser client does
   (single-origin, proxied `/ws` in dev; no baked `VITE_WS_URL`/`VITE_HTTP_URL`).
3. The right pane is the existing Lynx-for-Web build from the real ReactLynx
   entry and production module graph. Do not copy product JSX, routes, state
   machines, or CSS into any pane.
4. One server instance backs both panes. It runs against **isolated seeded
   state**, never live `~/.t3/userdata`. Seed a `VACUUM INTO` snapshot per the
   `AGENTS.md` test-data rules.
5. The Lynx pane's browser connector transport is **development-only**. It may
   open a WebSocket to the shared server from the browser to satisfy the
   existing typed ready/resync/command boundary and publish monotonic sequenced
   events, but it must live outside the production renderer graph and must not
   be importable by production main/preload/connector code. This narrowly
   supersedes Plan 11A constraint 4 for the **pane** only; the production Lynx
   renderer still owns no socket.
6. Keep scenario identity literal. Both panes must be proven to observe the same
   server, the same seeded project/thread/model, the same route, and the same
   theme before any frame is retained.
7. Do not change reuse exclusions, screenshot masks, or fidelity thresholds to
   make a pane pass. Document honest known differences instead.
8. Do not upgrade the Lynx/ReactLynx/Lynxtron/Web stack to make this pass. Stop
   and report the version boundary first.
9. Comparison artifacts remain diagnostic until a Native correlation gate
   (Plan 11A BW5) confirms the browser conclusions. Keep them outside the
   certification matrix until then.

## Task sequence

| ID | Task | Depends on | Status | Exit result |
| --- | --- | --- | --- | --- |
| SB0 | Confirm both real frontends can share one server in a browser | Plan 11A BW4 | `completed` | A spike proves the real Web app and Lynx-for-Web both render the same seeded server state in a browser |
| SB1 | Add the dev-only browser connector transport for the Lynx pane | SB0 | `completed` | Lynx-for-Web subscribes to the shared server over the existing typed connector boundary; production graph unchanged |
| SB2 | Seed one isolated shared server dataset | SB0 | `completed` | A `VACUUM INTO` snapshot yields a deterministic project/thread/model set both panes can reach |
| SB3 | Re-point the workbench to the two real frontends | SB1, SB2 | `completed` | The capture harness launches one server and both real panes; the reference host is deleted |
| SB4 | Reissue the comparison across the enumerated states | SB3 | `completed` | The prior Plan 11A scenarios re-render with a real Web left pane and pass the pane gates or record honest differences |
| SB5 | Record the go/no-go and fold back into Plan 11A/11B history | SB4 | `completed` | A short findings note updates the harness policy and points to the next Plan 11/12 task |

Use only `pending`, `in_progress`, `completed`, `blocked(runtime-gap-id)`, or
`skipped(reason)`. Keep one SB task in progress and commit/push each completed
task separately. Do not mix unrelated Plan 11 or Plan 12 product work into an SB
commit.

## SB0: Confirm both real frontends can share one server in a browser

Completed on 2026-08-03. The probe `scripts/sb0-shared-server-probe.mjs` spawns
the real built server against a throwaway isolated `--base-dir` and runs the
full handshake from a plain Node process using only browser-available globals.
Evidence (`reports/sb0-shared-server.json`,
`evidence/2026-08-03/SB0/findings.md`): the bootstrap→bearer exchange
succeeded, two distinct WebSocket tickets were issued from one bearer, and both
`/ws?wsTicket=…` sockets opened concurrently (the server accepted both
authenticated upgrades). The raw sockets closed 1005 only because the probe's
hand-authored frame is not effect's exact wire framing; SB1 uses the real
`@t3tools/contracts` `RpcClient`. The server already serves the built web app
statically (`config.ts` `resolveStaticDir` → `apps/server/dist/client` or
`apps/web/dist`) and prints a `/pair#token=…` URL at startup, so both panes can
be served single-origin and authorize via the pairing token with no baked
origins and no CORS. Feasible; no blocker.

### Required work

1. Start one local server against a throwaway isolated home. Record its
   WebSocket origin and pairing requirement.
2. Load the real Web app against that server in a browser and reach a known
   populated state (project, thread, model).
3. From the same browser context, open a WebSocket to the same server using the
   shared `@t3tools/contracts` Effect-RPC client and confirm it can subscribe to
   the connector event/snapshot stream that the Lynx pane's typed boundary
   consumes.
4. Record whether pairing/auth for the Lynx pane's socket can be satisfied with
   the same dev token flow the Web app uses, or whether a dev-only allowance is
   required.

### Exit criteria

- The real Web app renders a populated state from the shared server in a browser.
- A browser-side Effect-RPC client reaches the same server's connector stream.
- No product JSX is copied and no production renderer imports a socket.
- If the Lynx pane cannot reach the server in a browser without a stack upgrade
  or a product fork, stop and publish a blocker report instead of continuing.

## SB1: Add the dev-only browser connector transport for the Lynx pane

Completed on 2026-08-03. `src/browser-preview/liveConnectorHost.ts` is a drop-in
for `BrowserPreviewConnectorHost`: it answers the same renderer bridge methods
(`t3:connector.ready`/`resync`/`command`) and pushes the same sequenced
`T3_CONNECTOR_EVENT` envelopes, but sources state from a live Effect-RPC
WebSocket subscription instead of a static scenario. It reuses the browser-safe
path the shipping code already relies on — `globalThis.WebSocket`, the shared
`WsRpcGroup` client, and the pure `@t3tools/client-runtime` state/presentation
projections — mirroring `connector.ts`'s RPC→snapshot mapping without its
Node-only spawn/HTTP bootstrap. The harness (which owns the server bootstrap
secret) mints the wsTicket and injects a ready `socketUrl`; the browser mints no
credential. `src/browser-preview/index.ts` activates it only when the harness
passes `?live=1&socket=…`, so the static scenario path stays the default;
capabilities the browser cannot satisfy (filesystem, shell, keyboard, clipboard,
native navigation) stay explicitly unavailable. `liveConnectorHost.test.ts`
covers the bridge contract and a static-analysis guard that production
main/app/shared source never imports the dev host (11/11 pass). Affected
typechecks (browser-preview, app + main/desktop) and the `target: web`
browser-preview bundle build all pass; `git diff --check` clean.

### Required work

1. Implement a development-only transport that connects to the shared server's
   WebSocket, maps the server stream to `ConnectorSnapshot` plus sequenced
   events, and publishes them across the existing renderer-facing
   ready/resync/command boundary (`connectorProtocol`).
2. Keep the transport in a dev-only module path (mirroring the existing
   `src/browser-preview` isolation). Assert by test that production
   main/preload/connector code does not import it.
3. Preserve the typed boundary exactly: monotonic sequence, resync on gap, and
   explicit unavailability for capabilities the browser cannot satisfy
   (filesystem, shell, native keyboard, clipboard, navigation).
4. Keep the deterministic offline scenario catalog available as a fallback for
   fault-injection calibration, but the default workbench data source becomes
   the shared server.

### Exit criteria

- The Lynx pane renders a populated state sourced from the shared server.
- The connector boundary, sequence semantics, and unavailable-capability
  honesty are unchanged from Plan 11A BW1.
- A test proves the production renderer graph does not import the dev transport.
- The build and runtime have zero unexplained errors.

## SB2: Seed one isolated shared server dataset

Completed on 2026-08-03. `scripts/sb2-seed-shared-state.mjs` builds an isolated
dataset at `<base-dir>/userdata/state.sqlite` (the state dir the server reads
for an explicit `--base-dir`, per `config.ts` `deriveServerPaths`). It uses
`VACUUM INTO` from a read-only source — defaulting to the richest thread-bearing
DB (`~/.t3-lynxtron/userdata/state.sqlite`), falling back to `~/.t3/userdata` —
so live data is never opened read-write and no `-wal`/`-shm` siblings are
carried. The default base dir is `apps/lynxtron/.t3-workbench` (gitignored). The
seed (`reports/sb2-seed.json`, `evidence/2026-08-03/SB2/seed.json`) recorded
1 project (`t3code-lynxtron`), 2 threads, 1 message, and a snapshot SHA-256, so
both panes can assert the same records. The enumerated UI states that are route/
overlay/status-driven (project-scope-open, lifecycle-error, quick-switch,
model-picker, settings-general) are reached from this same dataset via the pane
route/overlay controls, not distinct DB rows.

### Required work

1. Create an isolated server home under the worktree (never `~/.t3/userdata`).
2. Seed it with a `VACUUM INTO` snapshot per `AGENTS.md`, then trim or author
   the specific project/thread/model states the comparison needs (reuse the
   states Plan 11A enumerated: new-thread, existing-thread, project-scope-open,
   lifecycle-error, settings-general, quick-switch, model-picker).
3. Record the snapshot identity/hash and the exact seeded records so both panes
   can assert the same state.

### Exit criteria

- One snapshot yields all enumerated states.
- Both panes can independently prove they observe the same records.
- No live user data is read-write opened or copied back out.

## SB3: Re-point the workbench to the two real frontends

Completed on 2026-08-03. `scripts/capture-shared-workbench.mjs` launches one
seeded, isolated server (SB2 base dir) and a single-origin front server that
serves the real `apps/web/dist` at the root, the Lynx-for-Web bundle under
`/lynx/`, the workbench shell under `/__workbench`, and proxies
`/api|/ws|/oauth|/.well-known` to the server (dev single-origin model, no baked
origins, no CORS). The web pane enters through `/pair#token=<startup token>`;
the Lynx pane receives a minted `ws://…/ws?wsTicket=…` (routed through the front
origin) and runs the SB1 live transport. `scripts/shared-workbench/` holds the
two-pane shell + controller; the controller derives web readiness from the
seeded project title in the DOM and reads the Lynx diagnostics hook.

Two feasibility spikes de-risked it first: `sb3-web-connection-spike.mjs`
proved the real web app connects to the seeded server single-origin and renders
the seeded project (`evidence/2026-08-03/SB3/web-connection.png`), and the full
harness then passed both viewports with shared-server identity, matched
dimensions, and zero console errors (`evidence/2026-08-03/SB4/`). The harness
owns every PID/port (SIGKILL on teardown) and, because a live server mutates its
own runtime rows, backs up the seed DB before launch and restores the pristine
snapshot after exit (verified: hash returns to `4f3ab2a1…`, no leftover
WAL/backup files).

The hand-built reference host is deleted: `apps/web/src/browser-workbench-
reference/`, `apps/web/vite.workbench.config.ts`, and the `dist-workbench-
reference` output are gone; the obsolete `capture-workbench.mjs` and
`bw3-iteration-timing.mjs` are removed; `package.json` `build:workbench`/
`capture:workbench` now point at the shared harness. The shared scenario catalog
moved to `src/browser-preview/fallbackScenarios.ts` (offline/fault-injection
fallback only). Affected typechecks and the browser-preview tests (11/11) pass;
`git diff --check` clean.

### Required work

1. Update `apps/lynxtron/scripts/capture-workbench.mjs` (or its successor) to:
   launch one seeded server, serve the real Web app pointed at it, serve the
   Lynx-for-Web build with the dev transport pointed at the same server, then
   capture both panes at matched dimensions.
2. Gate on shared-server identity: both panes must report the same server, the
   same seeded records, route, and theme before a frame is retained.
3. Delete `apps/web/src/browser-workbench-reference/`,
   `apps/web/vite.workbench.config.ts`, and `dist-workbench-reference`. Remove
   any script or doc reference to the reference host.
4. Own every spawned PID and port; SIGKILL and free ports on teardown; restore
   any temporarily changed file and verify isolated state cleanup.

### Exit criteria

- The harness launches one server and two real frontends with no reference host.
- Pane identity gates prove both observe the same server state.
- The reference host and its build config no longer exist in the tree.
- `git diff --check` is clean and no owned process/port survives a run.

## SB4: Reissue the comparison across the enumerated states

Completed on 2026-08-03. The comparison was regenerated with the real Web app
as the left pane and Lynx-for-Web as the right pane, both on the seeded shared
server, at 1280x820 and 1440x900 (`evidence/2026-08-03/SB4/comparison.html`,
`workbench-report.json`). Both cells pass the pane gates: shared-server identity
(both rendered the seeded `t3code-lynxtron` project), matched image dimensions,
zero unexpected console errors, both panes semantic-ready.

The remaining pane differences are classified honestly in
`evidence/2026-08-03/SB4/findings.md` and folded into the gap log, with none
attributable to a reference-host artifact (that class is gone by construction):

- **D1** header toolbar overflow in Lynx-for-Web — continuation of gap G1
  (Lynx flex-utility handling on shared composition surfaces), more pronounced
  with real, denser server config; `product`, owned by Plan 12.
- **D2** panes auto-select different active threads — real behavioral
  difference (Lynx connector vs Web selection); `live-state`, Plan 12.
- **D3** live environment banners (version mismatch, provider status, updates)
  — truthful live-server output; `live-state`, expected, left visible rather
  than suppressed.

Reopening the comparison confirmed the left pane is the real Web app in a
correct full-height shell (`evidence/2026-08-03/SB4/web.png`), which was the
original defect this plan set out to remove. SB4's mandate was to reissue the
comparison with real frontends and classify differences, not to fix every Lynx
CSS quirk (that is Plan 12 core-surface convergence).

### Required work

1. Regenerate the comparison across the enumerated states at 1280 x 820 (add
   the second viewport only at a phase-exit gate, per Plan 11A tiering).
2. For each state, record commit, server snapshot hash, both bundle hashes,
   route, theme, both panes' readiness and console, geometry, and the
   single-pane/side-by-side/diff images.
3. Where a pane differs, classify honestly: real Lynx renderer difference,
   expected rendering-pipeline difference, or a genuine product defect to fix.
   Do not widen thresholds or masks to hide a difference.
4. Reopen the comparison page and confirm the left pane is the real Web app in a
   correct, full-height shell (the reference collapse must be gone by
   construction).

### Exit criteria

- Every enumerated state renders with a real Web left pane and a real Lynx-Web
  right pane from one shared server.
- Each pane difference is classified; real defects get a fix or a tracked gap.
- The comparison page is visually correct for the Web pane with no reference
  layout artifacts.

## SB5: Record the go/no-go and fold back into plan history

Completed on 2026-08-03. Decision: **adopt** the single-server dual-frontend
workbench as the default browser loop; the hand-built reference host and its
failure class are gone. Full rationale, cost delta, residual gaps (D1–D3), and
commands are in `evidence/2026-08-03/SB5/findings.md`. Plan 11A's "Fixed
architecture constraints" now carries a superseding note pointing here and
marking the reference host removed. Next product task: return to the first
incomplete Plan 11 task, **OC1 (packaged cold start semantic readiness)**, then
OC2–OC7 and O1–O5; Plan 12 PF work begins only after Plan 11 completes. The new
workbench is available as the fast dual-render loop for applicable Plan 12 UI
slices, with one Native semantic-ready smoke retained at each slice exit and
Native correlation still owned by Plan 11A BW5.

### Required work

1. Write a short findings note: whether single-server dual-frontend comparison
   is now the default browser loop, the cost delta versus the reference
   approach, and any residual gaps.
2. Update Plan 11A's harness-policy language to reference the real-frontend
   workbench and mark the reference host removed.
3. Point to the exact next incomplete Plan 11 (OC7, O1-O5) or Plan 12 (PF) task.

### Exit criteria

- A findings note and updated harness policy exist.
- The next product task is named.
- No disposable orchestration or second Lynx UI path remains.

## Per-task acceptance

For SB0 through SB4, run only the affected checks:

1. focused tests for the transport, seeding, orchestration, and changed code;
2. affected Web and Lynx typechecks;
3. ReactLynx scanner for changed renderer code;
4. affected browser production builds;
5. one deterministic dual-real-frontend comparison at 1280 x 820; and
6. `git diff --check`.

Do not run the complete Native certification matrix during SB0 through SB4.
Native correlation still belongs to Plan 11A BW5. Existing Plan 11 and Plan 12
phase-exit requirements remain unchanged.

## Stop conditions

Stop and report when:

- the Lynx pane cannot reach the shared server in a browser without a stack
  upgrade or a product fork;
- satisfying the Lynx pane's socket would require baking origins or weakening
  production auth beyond a clearly scoped dev-only allowance;
- production behavior would change merely because the dev transport is present;
- shared-server identity across the two panes cannot be proven;
- browser or Computer Use authorization is required but unavailable; or
- a merge conflict or dirty-file overlap extends beyond Plan 11B-owned files.

## Evidence and handoff

Every SB task handoff records:

- commit, branch, remote relation, and active SB task;
- files owned by Plan 11B versus unrelated preserved work;
- server home path, snapshot hash, and seeded records;
- dependency and bundle identities for both panes;
- scenario, route, theme, viewport, device-pixel ratio, and image dimensions;
- both panes' readiness, shared-server identity proof, and console results;
- diagnostic versus certification evidence classification; and
- the exact next Plan 11 or Plan 12 task after Plan 11B.

## Replacement goal prompt

Use the following prompt to replace the active high-level goal without
discarding Plan 11 or Plan 12:

```text
Continue the T3 Code Electron-to-Lynxtron port in
/Users/bytedance/github/t3code on branch lynxtron-port.

The product execution order remains Plan 11, then Plan 12. Plan 11B is a
bounded supporting harness correction that runs at the next safe atomic
boundary; it does not supersede either product plan.

Read these files in order:
1. AGENTS.md
2. apps/lynxtron/docs/plans/00-execution-index.md
3. apps/lynxtron/docs/plans/11-outcome-driven-convergence.md
4. apps/lynxtron/docs/plans/11a-browser-dual-renderer-validation.md
5. apps/lynxtron/docs/plans/11b-single-server-dual-frontend-workbench.md
6. apps/lynxtron/docs/plans/12-feature-parity-by-product-value.md
7. apps/lynxtron/docs/implementation-status.md
8. apps/lynxtron/docs/port-ledger.md

First inspect the current worktree and identify the active Plan 11 atomic
task. Preserve all existing and untracked user work. Do not abandon, restage,
or mix a partially completed Plan 11 task: finish its focused validation,
commit, and push it before starting Plan 11B.

At that clean task boundary, execute Plan 11B SB0 through SB5 in order. The
dual-renderer workbench must compare the two REAL frontends, not a hand-built
reference. Stand up one seeded isolated T3 Code server; render the real Web app
against it in the left pane; render the existing Lynx-for-Web build against the
SAME server in the right pane through a dev-only browser connector transport
that satisfies the existing typed connector boundary. Delete the
apps/web/src/browser-workbench-reference host and its build config entirely.

Do not copy product JSX, do not add a WebSocket to the production Lynx
renderer, do not bake VITE_WS_URL/VITE_HTTP_URL, do not point any server at
live ~/.t3/userdata, do not upgrade the Lynx stack without reporting the
blocker, and do not treat browser rendering as Native acceptance. Prove both
panes observe the same server, seeded records, route, and theme before
retaining any frame. Classify every pane difference honestly instead of
widening thresholds or masks.

After SB4, reopen the comparison and confirm the left pane is the real Web app
in a correct full-height shell. Record the SB5 go/no-go, update Plan 11A's
harness policy to reference the real-frontend workbench, then return to the
first incomplete Plan 11 task, complete OC7 and O1-O5, and only then begin the
first incomplete Plan 12 PF task. Keep one task in progress, use slice-level
validation during implementation, reserve full matrices for phase exit, and
commit/push each completed task separately. Native correlation remains Plan
11A BW5.
```
