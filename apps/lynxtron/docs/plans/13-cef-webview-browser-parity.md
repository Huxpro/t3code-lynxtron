# Bring the builtin browser to Lynxtron parity

This plan replaces the current Lynxtron browser preview slice with a production-ready CEF-backed surface that preserves the current Electron browser contract. It is a PF6 sub-plan and does not declare the browser complete until the runtime, lifecycle, interaction, security, and automation gates below pass.

## Inputs and constraints

- Product authority: the current Electron implementation in `apps/web/src/components/preview`, `apps/web/src/browser`, `apps/desktop/src/preview`, and the preview schemas in `packages/contracts`.
- Lynxtron API baseline: the official Browser tutorial uses one `<webview>` per tab, `use-osr={true}`, `enable-debug={true}`, stable mounted WebViews with wrapper `z-index` switching, and ref `.invoke()` for navigation commands.
- Proven native reference: Synara's `BrowserDockPane.lynx.tsx`, `browserView.lynx.ts`, `browserViewProbe.ts`, native `browser-view-probe.mm`, and `browserTabsPersistence.lynx.ts`. Synara proves bounded host-owned view attachment, per-thread persistence, active-plus-one-warm budgeting, 30-second inactive-pane suspension, popup classification, protocol filtering, navigation state projection, and explicit teardown.
- Current T3 status: `@lynx-js/cef-webview` 0.0.18 is registered and staged, and `BrowserPanel.tsx` implements the first OSR slice. CEF remains opt-in because initialization blocks in `cef_extension.node -> CefInitialize`, the binding does not expose an isolated cache-root option, and the macOS initializer does not set `windowless_rendering_enabled` even though the T3 surface requests OSR. Packaged `.app` creation now succeeds with explicit Lynxtron branding and a pnpm patch that preserves framework-relative symlinks.
- Safety: never share the user's live browser/session directory. Runtime identity, cache paths, cookies, permissions, downloads, popups, and automation leases must be scoped to the owned environment and tab.

## Electron parity checklist

| Capability                     | Electron authority                                                                     | Current Lynxtron state                                                                     | Required exit evidence                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open/close browser surface     | `rightPanelStore`, `PreviewPanel`                                                      | Browser card and panel exist; unavailable state is honest                                  | Open, close, reopen on the same thread without losing canonical state                                                                                         |
| Tab lifecycle                  | server preview sessions plus `ElectronBrowserHost`                                     | Basic tab persistence exists, but one `BrowserPanel` instance is still the practical slice | Create, select, close active/background tabs; deterministic fallback tab; no orphan host views                                                                |
| Page-state preservation        | one mounted Electron `<webview>` per live tab                                          | Official Lynxtron strategy identified                                                      | Keep mounted `<x-webview>` instances and switch by wrapper `z-index`; prove no reload on tab switch                                                           |
| Address navigation             | `PreviewChromeRow`, `normalizePreviewUrl`                                              | HTTP(S) normalization and submit implemented                                               | Schemeless public host, localhost, query/fragment, invalid URL, and committed-location synchronization                                                        |
| Back/forward/reload            | `DesktopPreviewBridge` and `PreviewView`                                               | back/forward use `eval`, reload uses `invoke`                                              | Enablement follows real history; commands affect only the active tab; hard reload handled separately                                                          |
| Loading/error state            | `PreviewNavStatus` and desktop `Manager`                                               | `bindload`, `binderror`, and loading UI exist                                              | `Loading`, `Success`, `LoadFailed`, retry, aborted navigation, DNS, refused, timeout, TLS, and recovery evidence                                              |
| Popup/new-window policy        | desktop `Manager` denies the child window and loads its URL in the current preview tab | Lynx `bindopenwindow` also navigates the active tab                                        | Prove matching current-tab behavior and blocked-protocol handling; evaluate Synara's ordinary-tab/OAuth-popup split only as a separately approved enhancement |
| Persistent session identity    | Electron partition and `WebviewPreferences`                                            | CEF cache root cannot yet be isolated                                                      | Dedicated environment-owned profile/cache root, stable cookies across tab switches/restarts, no cross-environment leakage                                     |
| Local and remote targets       | environment-relative URL resolver and preview RPC                                      | direct HTTP(S) only                                                                        | Resolve environment ports through the owning environment; never silently browse localhost on the wrong host                                                   |
| Bounds and visibility          | `browserSurfaceStore`, desktop `Manager`                                               | panel computes an explicit WebView size                                                    | Header/tab chrome excluded from native bounds, stale bounds deduplicated, hide/show and resize proven at 1280x820 and 1440x900                                |
| Resource budget                | Electron inactive-runtime eviction                                                     | no equivalent proven                                                                       | Keep active plus at most one warm inactive tab; suspend the thread pane after 30 seconds; restore without losing URL/title/history                            |
| Theme/viewport/zoom            | device toolbar, color-scheme and zoom bridge                                           | fixed WebView dimensions only                                                              | Fill/freeform/preset viewports, DPR measurement, system/light/dark emulation, zoom in/out/reset                                                               |
| Capture and recording          | screenshot/screencast artifact APIs                                                    | missing                                                                                    | Screenshot, clipboard/save/reveal, recording start/stop and artifact lifecycle                                                                                |
| Element inspection             | preview annotation and picker preload                                                  | missing                                                                                    | Pick/cancel, selector and source payload where available, annotation overlay, and navigation cancellation                                                     |
| DevTools/CDP and agent browser | desktop automation bridge and browser-use host                                         | missing                                                                                    | DevTools attach, status/snapshot/click/type/press/scroll/evaluate/waitFor, bounded results, lease ownership, interruption, and disconnect cleanup             |
| Cookies/cache/privacy          | desktop preview session policy                                                         | missing                                                                                    | Clear cookies/cache, verify partition scope, deny Node integration, and allow only explicit external handoff                                                  |
| PiP/separate window            | mini-player and native preview window                                                  | missing                                                                                    | Open/close/reopen, bounds and ownership, tab replacement race, and cleanup                                                                                    |
| Copy/open actions              | copy link, open external, screenshot actions                                           | partial                                                                                    | Copy link feedback, external browser handoff, screenshot feedback, and disabled states on blank/error pages                                                   |

## Execution sequence

### CEF0 — Unblock and prove the runtime

- [x] Verify the repository-owned runtime staging path independently: `prepare:cef-runtime` copies the 0.0.18 CEF framework and all five helper apps into the devtool runtime, the framework's four standard relative symlinks resolve, and every expected executable exists. Do not replace these valid framework symlinks with flattened copies.
- [ ] Patch or upgrade the Lynxtron/CEF binding so JavaScript initialization options reach CEF, including an explicit run-owned cache root.
- [x] Repair packaged-app traversal of the already-valid relative CEF and Lynxtron framework symlinks. The T3 builder now uses explicit Lynxtron branding, packages one AutoLink addon without a duplicate 292 MB CEF framework, copies the framework and helpers through the lifecycle hook, and verifies all relative links in the emitted `.app`.
- [ ] Launch one exact-owned packaged process with an isolated `T3_LYNXTRON_BASE_DIR`; record PID, executable, bundle hash, cache root, viewport, and DevTool client identity.
- [ ] Load an HTTP page and retain `bindload` and `bindlocationchange` evidence. Repeat with one expected failure and prove recovery in the same tab.

Exit: three fresh cold starts reach semantic product readiness and one real page load without `CefInitialize` blocking, shared-cache warnings, renderer errors, or leaked processes.

### CEF1 — Canonical tab and navigation lifecycle

- [x] Add a versioned per-thread persistence schema for active tab, ordered tabs, favicon, and bounded recent history. The reader migrates the existing v1 tab arrays and rejects unsafe URLs, duplicate tab ids, invalid active ids, malformed JSON, and empty writes; the existing single-tab API remains compatible while UI multi-tab ownership is implemented.
- [x] Connect existing Browser panel mounts to that schema so only the visible surface updates `activeTabId`, while successful nonblank navigation maintains bounded, URL-deduplicated recent history.
- [x] Match Electron's aborted-navigation policy in the Lynx WebView event adapter: `errorCode === -3` does not create a visible failure, while real CEF error codes retain their runtime message.
- [x] Persist typed per-tab load failures and clear them on navigation or successful load; do not persist transient loading state across a cold start.
- [ ] Replace the single-tab practical limitation with durable per-thread tab state: active tab, ordered tabs, title, URL, favicon, history capabilities, loading, and last error.
- [x] Keep active and warm WebViews mounted and switch them with wrapper `z-index`, as required by the official Lynxtron pattern.
- [x] Port Synara's active-plus-one-warm budget and 30-second inactive-pane suspension; reactivation cancels the pending timer before it can unmount the tab. Native CEF lifecycle evidence remains gated by CEF0.
- [ ] Match Electron new/select/close fallback behavior and ensure thread switching cannot leak one thread's browser into another.
- [ ] Replace `history.back()` and `history.forward()` eval where the CEF element exposes direct methods; keep typed fallback behavior explicit if it does not.

Exit: create, navigate, switch, back, forward, reload, close, reopen, thread switch, and restart preserve the same observable state as Electron.

### CEF2 — Host policy, remote ownership, and failures

- [ ] Port the Electron session policy: isolated persistent storage, browser-compatible user agent/client hints, preferred languages, sandbox boundary, and no Node access in guest pages.
- [x] Share HTTP(S) URL normalization across address navigation and current-tab `window.open`; unsupported guest protocols are denied without replacing the committed page. Preserve T3 Electron's current-tab popup behavior for parity; track Synara's richer popup classification separately rather than silently changing product semantics.
- [x] Share load-error descriptions and match Electron's unreachable-page hierarchy in Lynxtron instead of exposing a raw CEF error string.
- [ ] Share copyable URL policy instead of duplicating renderer-specific rules.
- [ ] Resolve local-server targets relative to the owning environment, including remote/relay/tunnel environments.
- [ ] Match Electron's current-tab `window.open` handling, deny external schemes without losing the committed page, and offer an explicit system-browser action. If ordinary-tab/OAuth-popup routing is later adopted from Synara, land it on Electron and Lynxtron together with shared policy tests.
- [ ] Define permission, download, certificate, and authentication behavior before enabling arbitrary pages.

Exit: local and remote URL tests cannot cross environment boundaries; popup and protocol tests match Electron; cookies/cache and process state remain isolated.

### CEF3 — Desktop feature parity

- [ ] Port fixed viewport presets, freeform resize, fill mode, zoom, and color-scheme emulation.
- [ ] Port screenshot capture, clipboard/save/reveal, screencast recording, and PiP/separate-window lifecycle.
- [ ] Port DevTools and element picking, including selector/source metadata where the guest runtime supports it.
- [ ] Implement the preview automation contract: status, open, navigate, resize, color scheme, snapshot, click, type, press, scroll, evaluate, wait, recording, result-size limits, ownership leases, and interruption handling.
- [ ] Keep unsupported controls visibly disabled with a precise reason until their runtime-backed operation passes.

Exit: every `DesktopPreviewBridge` operation has a Lynxtron equivalent, an explicit unsupported decision, or a named upstream blocker. No visible control is decorative.

### CEF4 — Fidelity and release certification

- [ ] Use one canonical server snapshot and the same thread, tab URLs, active tab, theme, viewport, zoom, and visible browser state in Electron and Lynxtron.
- [ ] Capture empty, loading, success, failure, popup, multi-tab, fixed-viewport, annotation, recording, hidden, suspended, restored, and closed/reopened states.
- [ ] Run focused contracts, Lynx/Web typechecks, renderer audits, Browser and Native builds, three cold starts, and the full 1280x820 plus 1440x900 light/dark/system matrix.
- [ ] Verify actual guest viewport size, output image dimensions, bundle identity, console/network errors, cache isolation, cleanup, and the 100-image repository budget.
- [ ] Update the fidelity ledger without masks or exclusions and remove the placeholder only after Native acceptance passes.

Exit: the complete Electron builtin-browser journey can be performed in Lynxtron without returning to Electron, and every parity row above has retained evidence or an approved explicit exception.

## Current blocker boundary

CEF0 is `blocked(runtime-gap-cef-init)` until the upstream C API and N-API binding accept an isolated cache root and the macOS initializer reaches `CefInitialize` with OSR enabled without hanging. The packaged-app blocker is closed: the builder emits a structurally valid `.app` with one addon, one CEF framework, and resolved framework links. Work that does not require a running CEF process may continue: shared contract extraction, state-machine tests, policy tests, persistence tests, resource-budget tests, and Browser chrome fidelity. Do not claim Native WebView parity from Browser Preview, packaging, or compilation alone.
