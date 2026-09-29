# Lynxtron runtime patches and 0.0.21 regression ledger

Last updated: 2026-09-10

This document separates changes made in T3 Code from confirmed Lynxtron runtime
regressions. A successful build, a visible window, or an attached DevTool
session is not treated as proof that the product transport works.

## Current version set

| Package                                       | Version                   | Reason                                                                                        |
| --------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `@lynx-js/lynxtron`                           | `0.0.28`                  | Latest upstream release (2026-09-29); the 0.0.21 findings below are not yet re-verified on it |
| `@lynx-js/lynxtron-dev-plugins`               | `0.0.28`                  | Match the runtime                                                                             |
| `@lynx-js/react`                              | `0.123.1`                 | Synara-compatible ReactLynx line                                                              |
| `@lynx-js/react-rsbuild-plugin`               | `0.18.1`                  | Synara-compatible build plugin                                                                |
| `@lynx-js/rspeedy`                            | `0.16.1`                  | Synara-compatible Rspeedy line                                                                |
| `@rsbuild/core`                               | `2.1.5` direct dependency | Explicit build-system compatibility pin; the resolved Rspeedy build reports Rsbuild `2.1.7`   |
| `@lynx-js/lynx-core`                          | `0.1.4`                   | Coordinated runtime build dependency                                                          |
| `@lynx-js/type-config` / `@lynx-js/types`     | `4.1.1` / `4.1.0`         | Coordinated type definitions                                                                  |
| `@lynx-js/web-core` / `@lynx-js/web-elements` | `0.23.0` / `0.12.7`       | Browser-preview compatibility                                                                 |

The repository does **not** currently carry a `pnpm patchedDependencies` patch
for `@lynx-js/lynxtron`. The changes below are T3-side adapters and
workarounds. Existing patches in the repository target other packages.

## T3-side patches and adapters made before 0.0.21

### Main-owned connector transport

T3 moved `T3Connector` ownership from preload to the desktop main process. The
main process registers typed `lynxBridge` handlers and sends sequenced state
envelopes through `LynxWindow.sendGlobalEvent`; the renderer validates sequence
numbers, applies snapshots, and requests a resync on gaps.

Relevant files:

- `src/main/desktop/mainConnectorHost.ts`
- `src/main/desktop/main.ts`
- `src/app/state/mainConnectorTransport.ts`
- `src/shared/connectorProtocol.ts`

This was an application architecture change, not a patch to the Lynxtron
package. It closed the old preload-to-renderer push limitation in the 0.0.8
architecture when tested at that time.

### Preload capability bridge

`contextBridge.exposeInLynxBTS` remains the adapter for small host capabilities:
app branding, viewport information, preferences, clipboard, and opening local
or external paths. Product state is intentionally not duplicated there.

### Native keyboard adapter

Because Lynxtron does not expose a complete renderer keyboard API, T3 maps a
small set of native menu accelerators to renderer-neutral keyboard packets and
feeds them through the shared keybinding resolver. Full physical-key coverage
remains pending.

### CSS and asset compatibility transforms

T3 generates a Lynx-compatible stylesheet at build time. The generator removes
unsupported selectors/declarations and resolves Web-only tokens. It also
rasterizes icons because SVG is not reliable in the native renderer.

The 0.0.21 upgrade exposed an invalid generated `webpack:` URL for DM Sans. T3
removed that `@font-face` request and now uses the documented system-sans
fallback. This removed the `Unsupported protocol: webpack:` runtime error, but
does not provide DM Sans metric parity.

### Routing and layout adapters

- The Lynx client uses a synchronous pathname adapter instead of the Web
  `RouterProvider`, whose async remount path crashes in Lynx.
- Fixed/sticky/overflow and hover/focus-visible differences are handled with
  explicit component state and generated CSS.
- Reachable optional surfaces stay in the main bundle because relative async
  Lynx bundle URLs have failed with `ERR_INVALID_URL`.
- Full DOM/Worker patch rendering remains a registered runtime gap; the native
  surface currently renders canonical checkpoint summaries instead.

## Confirmed regressions or blockers on 0.0.21

### R13 — `lynxBridge` callback never reaches the renderer

**Status:** confirmed, blocking packaged semantic readiness.

**Observed behavior:**

1. Renderer calls `NativeModules.bridge.call("t3:connector.subscribe", ...)`.
2. The main-process handler is entered immediately and returns immediately.
3. The snapshot at the boundary is small (264 bytes in the ready probe).
4. The renderer callback never fires.
5. At about 20 seconds the native window reports `JS call exceeded 20000ms` and
   logs `An error occurred when parse json: The data couldn’t be read because it
isn’t in the correct format.`

The failure also reproduces with:

- a direct `t3:connector.ready` response;
- a `lynxBridge.handle` handler returning immediately;
- an explicit `-lynx-invoke` listener calling `event.sendReply`;
- JSON-string and object responses;
- reduced snapshots without provider catalogs/keybindings;
- the callback-independent subscribe experiment, because the outstanding
  native call still blocks delivery in this runtime.

This isolates the defect below the T3 server, connector startup, handler
registration, and payload construction. The main server reaches ready state and
loads provider models while the renderer remains on `Connecting`.

### R14 — main-to-renderer global event reports success without delivery

**Status:** confirmed in the current 0.0.21 T3 packaged runtime.

`LynxWindow.sendGlobalEvent` returns `true`, but listeners registered through
`lynx.getJSModule("GlobalEventEmitter")` do not observe either the connector
snapshot or the small capability-probe event. This differs from the earlier
0.0.8 probe recorded in `upstream-issues-r1-r11.md`, where main-to-renderer
delivery was verified end to end.

The result means the existing main-owned push transport cannot bootstrap on
0.0.21 even when it avoids waiting for a callback.

### R15 — stale bundle identity can make an old UI appear

**Status:** confirmed harness/runtime behavior.

Multiple Lynxtron apps can coexist under the generic `com.lynxjs.Lynxtron`
identity, and repeated launches of the same `file://.../main.lynx.bundle` URL can
show a previously loaded renderer. A visible T3 window therefore does not prove
which build is running.

The reliable verification procedure is:

1. use the dedicated signed runtime bundle id `com.t3tools.lynxtron.dev`;
2. launch with an isolated `T3_LYNXTRON_BASE_DIR`;
3. copy the staged bundle to a SHA-named path and set
   `T3_LYNXTRON_BUNDLE_PATH`;
4. resolve the DevTool client from the owned PID/listening port;
5. verify the session URL contains that SHA-named bundle.

This explains why a window showing another project, an older terminal panel,
or older content can appear while a new build is also running.

### R16 — one reliable native screencast frame per fresh process

**Status:** previously confirmed and still applicable.

Repeated DevTool inspection/capture can exhaust or wedge the native screencast.
Retained native evidence therefore uses one fresh owned process per frame. This
is a harness limitation, not a visual product regression.

### R17 — runtime global-props updates do not reach the BTS snapshot

**Status:** confirmed in the current 0.0.21 T3 packaged runtime.

An initial `setGlobalProps` value supplied before renderer startup is visible
through `lynx.__globalProps`. Later updates attempted with both
`LynxWindow.setGlobalProps` and the documented
`updateMetaData(new LynxUpdateMeta({ globalProps: new LynxTemplateData(...) }))`
path do not update the value observed by the running background script. The
initial connector snapshot remained 225 bytes at sequence 0 while the main
connector advanced through server/config/shell events. The update path also
ended with the same native JSON parse error after about 20 seconds.

The global-props mailbox experiment was reverted because initial injection is
not evidence of a working live state channel.

## Existing runtime gaps still present after the upgrade

The 0.0.21 upgrade has not yet provided evidence that the following older gaps
are closed:

- custom font loading / exact DM Sans metrics;
- complete renderer keyboard events and headless key dispatch;
- native text selection;
- SVG rendering;
- Web CSS pseudo-classes and advanced color syntax;
- fixed/sticky/overflow conformance;
- relative async bundle loading;
- DOM/Worker-based full patch rendering;
- DevTool wheel/drag scrolling for native `<list>`.

Their detailed reproduction notes and remove-when conditions remain in
`upstream-issues-r1-r11.md`.

## Investigated and reverted approaches

These are not part of the retained product design:

- upgrading to the newest unconstrained ReactLynx/Rspeedy chain instead of the
  Synara-compatible matrix;
- changing the desktop host build from Rspack to Rsbuild ESM;
- returning JSON strings manually from `-lynx-invoke`;
- wrapping bridge replies in `{ ok, value }`;
- wrapping bridge replies in the lower-level `{ error, data }` shape;
- using `NativeModules.bridge.send` plus a pushed snapshot as the startup
  handshake;
- moving the connector back into preload and polling through contextBridge;
- repeatedly exposing mutable snapshot values through contextBridge.
- publishing live snapshots with `setGlobalProps` or `updateMetaData`.

Each experiment either reproduced the same 20-second callback/parse failure or
could not pass the process/bundle identity gate. None should be cited as a
working workaround.

## Current acceptance status

- Dependency installation: pass.
- Focused connector tests: pass.
- Lynx app and desktop-main typechecks: pass.
- Production build: pass.
- Dedicated 0.0.21 runtime launch: pass.
- Server startup and provider discovery: pass.
- Packaged renderer semantic readiness: **fail** (`transport=unavailable`,
  `lastSeq=-1`, visible `Starting / Connecting`).
- Paired Electron/Lynxtron fidelity certification: blocked until R13/R14 are
  fixed or a verified replacement transport exists.

## Evidence

- Machine-readable upgrade report: `../reports/lynxtron-0.0.21-upgrade.json`
- Current readiness report: `../reports/pf2-final-packaged-readiness.json`
- Historical runtime gaps: `upstream-issues-r1-r11.md`
- Source-first transport plan: `plans/10-source-first-architecture-reset.md`
