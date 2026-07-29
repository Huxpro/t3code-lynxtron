# Implementation status

This app is the monorepo-native successor to the standalone
`t3code-lynxtron` prototype.

## Completed foundation

- Workspace app with `.lynx.ts(x)` and `.web.ts(x)` resolution.
- Lynx UI, Lynxtron main/preload, and self-contained Effect RPC connector.
- No sibling checkout, generated `node_modules` symlink, or absolute server
  path; the connector resolves the sibling `apps/server` build.
- Typecheck, focused tests, CSS/API audits, generated theme report, icon build,
  and complete app build scripts.
- Shared L1 capability contracts with web and Lynx storage, clipboard,
  connectivity, keyboard, media-query, and native/external navigation
  implementations.
- Canonical shell/thread contract types and shared reducers, sorting, relative
  time, and plan projection from `packages/client-runtime`.
- Proposed-plan title extraction, collapsed-preview shaping, follow-up prompt
  resolution, implementation-thread naming, and Markdown export naming/content
  are shared with Web. Lynx uses the same title projection in its Plan panel.
- Session phase/busy/settled derivation and sidebar status/priority are shared
  view-models consumed by Web and Lynx; each renderer now owns only its visual
  mapping.
- Composer prompt cleanup, valid terminal-context filtering, attachment
  sendability, runtime/interaction-mode copy and transitions, checkout/branch
  context, provider-option projection, and turn dispatch state are shared
  host-neutral projections. Lynx retains its native textarea and pill
  renderers, but every displayed control now reads or writes canonical thread
  state.
- Provider instance projection, status copy, settings-overlay semantics, and
  migrate-on-write patches are shared with Web. Lynx consumes canonical
  `ServerConfig.providers` / `ServerConfig.settings`, subscribes to the shared
  server-config reducer, and persists enable/disable through
  `server.updateSettings`.
- General Settings grouping and restore projections are shared with Web.
  Schema-free canonical defaults keep Effect Settings schemas out of the Lynx
  renderer; Lynx persists the portable `ClientSettings` subset locally and
  writes server-authoritative toggles through `server.updateSettings`.
- Model search ranking, favorite/provider ordering, model keys, canonical
  provider-to-model catalogs, and selected-model fallback semantics are shared
  with Web. Disabled or unavailable instances can no longer leak their model
  slug into a different provider. The connector no longer owns a parallel
  flattened model DTO.
- Markdown code-fence language/filename projection, list/task marker parsing,
  inline spans, and file-link normalization are shared with Web. Lynx code
  blocks display the same `title=` metadata and expose an explicit copy action;
  relative file links resolve against the active thread worktree and external
  or file activation crosses the typed platform-navigation boundary.
- Changed-file statistics, path normalization, compact directory trees,
  auto-expansion, scope summaries, and preview selection are shared with Web.
  The Lynx bridge now preserves canonical thread checkpoints instead of
  discarding them, and DiffPanel renders their real file/stat tree.
- Project-entry counts/tree paths, Markdown preview mutations, and file cache
  revisions are shared with Web. Lynx FilesPanel now calls canonical
  `projects.listEntries`, `projects.readFile`, and `projects.writeFile` RPCs
  through its Node host, with refresh, expandable directories, selection state,
  editable text previews, debounced autosave, and an explicit save action.
- File-save serialization is a shared host-neutral state machine. Web and Lynx
  inject their own clocks/timers while sharing debounce, in-flight write
  ordering, pending-state, retry, flush, and dispose semantics.
- Source-control discovery readiness, status tones, badges, and summary parts
  are shared with Web. Lynx now calls canonical
  `server.discoverSourceControl` through its Node host and renders the real VCS
  and provider inventory with an explicit rescan action.
- Authorized-client and pairing-link ordering, timestamp normalization, labels,
  device details, live state, and counts are shared with Web. The Lynx host
  subscribes to canonical `subscribeAuthAccess`, applies the existing shared
  stream reducer, and exposes a credential-free inventory to the renderer.
  Pairing creation, individual link/client revocation, and revoke-others call
  the existing auth HTTP contracts through the Node host.
- Command-palette query parsing and title-first/context-second ranking are
  shared with Web. Quick Switch now supports the same `>` actions-only mode and
  searches canonical project, thread-title, and branch context.
- Effect Atom is the live renderer state substrate; the standalone
  `useT3Connection` singleton has been retired. The R3 adapter is now limited to
  polling preload snapshots into that Atom.
- Model picker, quick switch, and right-panel interaction state use the same app
  `AtomRegistry`; their four standalone listener stores have been removed.
- Ordered right-panel surface state now uses the same generic open, activate,
  close, fallback, and visibility reducer as Web; renderer stores only own
  thread scoping and platform-specific surface payloads.
- Preferences and the R4 pathname adapter now publish through the same
  `AtomRegistry`; no module-level `Set` listener registry remains in the Lynx
  renderer.
- Real local server bootstrap, auth exchange, shell/thread subscriptions,
  thread creation, prompting, interruption, model selection, and thread
  management.
- Lynx's QuickJS host now supplies the Web Encoding globals required by
  `@effect/atom-react` development builds. Renderer-neutral presentation
  modules avoid unsupported `replaceAll`, `toSorted`, `findLast`, and negative
  `at` calls, so development and production bundles execute the same shared
  projections. A Lynx DevTool development trace located the former Composer
  main-thread failure precisely, and a fresh production capture completed with
  zero DevTool renderer errors.

## Visual baseline

Electron/Web is the product source of truth for visual, interaction, copy, and
state fidelity. `apps/web` and `packages/client-runtime` are the architectural
sources of truth. The standalone `t3code-lynxtron` repository is used only for
textual provenance and historical-behavior discovery; its screenshots are not
part of product fidelity scoring.

The first correctly targeted 1,180 × 748 logical-viewport pair is recorded in
`reports/screenshots/README.md`. It compares Electron/Web with monorepo Lynx and
includes side-by-side and pixel-difference diagnostics. It is intentionally
classified as exploratory because the two clients did not share one server
snapshot. The repeatable `capture:lynx` command now uses Lynx DevTool, rejects
renderer errors, and writes capture metadata; `visual:diff` verifies equal
dimensions before producing diagnostic images. Same-snapshot, two-viewport
certification remains T5 work.

## T5 execution

T5-F1 is complete. `docs/plans/worktree-baseline.md` protects the handoff at
detached HEAD `5719e8ac4020dda0e375ef61d044b61f55a0df8a`, classifies the
pre-document 243-path dirty manifest by owner and artifact type, names a
physical replacement for every deleted Web module, and separates formal
evidence from disposable build output. Its required Git status/diff and
provenance commands passed without staging or discarding user work.

T5-F2 is complete. `scripts/reuse-report.mjs` inspects the final Rspeedy
production resolver, canonicalizes realpaths, and emits route,
product-surface, and renderer-local graphs for all seven reference screens.
The source-controlled fixture proves `.web` / `.lynx` extension choice, exact
aliases, conditional package exports, copied-and-renamed exclusion, generated
CSS patching, and symlink identity. A reviewed boundary hash prevents roots or
exclusions from changing silently. The first honest product-surface baseline is
only 1.8%–4.0% by module and 2.2%–3.4% by line; this confirms that the current
Lynx screens remain independent compositions despite their shared
presentation helpers.

T5-F3 is complete. Matched Electron/Web and Lynx DevTool evidence now exists
for 1280 × 820 and 1440 × 900 with deterministic isolated state, native
viewport assertions, DOM/CSS measurements, zero-error Lynx captures, and
diagnostic diffs. The first honest measurement is 2/5 anchor bounds within
8 px and 5/5 corresponding font sizes within 2 px at both viewports; copy and
colors are not yet certified.

T5-F4 is complete. Ten Web import paths now have explicit `.web.tsx` and
`.lynx.tsx` primitive leaves for Settings layout, button, draft input, input,
label, scroll area, select, separator, switch, and textarea. A 37-token
Settings contract is owned by `apps/web/src/index.css` and copied without value
changes by the deterministic Lynx CSS generator. The production resolver and
reuse report classify the three currently reachable Settings leaves as
`SPLIT`, not shared; Settings General therefore remains honestly at 5/281
shared product-surface modules (1.8%) and 1,281/58,093 shared lines (2.2%).
Focused contract/reuse tests, both typechecks, API/CSS audits, and the full
Lynxtron production build pass. An isolated Web interaction verified render,
toggle persistence, inline reset, and zero console errors. The real Lynxtron
Settings General surface was navigated through its background DevTool hook and
captured by Lynx DevTool at 1280 × 820 with zero renderer errors; evidence is
under `evidence/2026-07-27/T5-F4/settings-general/`.

T5-F5 is complete. Settings General now renders one physical 17-row
composition through platform leaves and one shared route/restore state machine.
The feature panel reaches 3/4 shared modules (75%) and 760/1036 shared lines
(73.4%); the complete-route product surface reaches 10/14 shared modules
(71.4%) and 1240/1769 shared lines (70.1%). Matched Electron/Web and Lynx
DevTool evidence covers default, changed, restore-confirmation, and restored
states at 1280 × 820 and 1440 × 900. Every measured anchor and font-size gate
passes, registered colors are exact, the maximum anchor delta is 3.95 px, and
both renderers report zero errors. Canonical projections and real interactions
prove change, cancel, restore, disabled-restored, and reload persistence. The
four independent pass results, eight evidence variants, reproduction sequence,
and proposed patch series are linked from
`evidence/2026-07-28/T5-F5/settings-general/certification.md`.

T6-C1 App shell, header, and Sidebar is now the only active task.

The reachable Lynx product path now consumes the shared App Shell, Header, and
Sidebar surface composition. A real Lynx DevTool action pass found and fixed a
Sidebar overlay defect where all three thread menu rows collapsed to the same
zero-height box, making Rename dispatch Delete. The menu now uses explicit
non-shrinking 30 px rows and a sibling backdrop. Rename, Archive, Delete,
Create, project re-expansion, and long-title selection all reached canonical
commands and matched the SQLite projection; the fresh 1280 × 820 DevTool
capture reports zero renderer errors. Evidence is under
`evidence/2026-07-28/T6-C1/sidebar/actions-runtime/`.

T6-C1 is not complete. The unchanged, strict full product graph reports
88/317 shared modules (27.8%) and 24,194/66,459 shared lines (36.4%).
Surface-only roots can exceed 70%, but they are not substituted for the
declared product boundary.

A follow-up Sidebar V2 probe compiled the real 2,735-line Web composition.
Eager inclusion produced an Effect main-thread `onItem` failure followed by a
missing-snapshot error even while the canonical preference selected V1.
Adding the missing Lynx Popover host leaf removed the Base UI Popover
dependency but did not remove that failure. React lazy loading successfully
isolated Sidebar V2 into a 794.6 kB async bundle and restored a zero-error V1
capture; when the isolated fixture enabled V2, Lynxtron 0.0.5 rejected the
relative async bundle URL and the Sidebar disappeared. The lazy product branch
was removed, the strict graph returned to 27.5%/36.0%, and a final fresh V1
DevTool capture again reports zero renderer errors. The preload preference
store now follows `T3_LYNXTRON_BASE_DIR`, with a focused test proving fixture
isolation and unchanged default behavior. Evidence is under
`evidence/2026-07-29/T6-C1/sidebar/sidebar-v2-probe/`.

The follow-up accepted boundary keeps V2 in the main bundle but replaces the
monolithic Web state host with `SidebarV2.lynx.tsx`. Both renderers now compile
one `SidebarV2RowSurface` for card/slim row hierarchy and action placement;
the Lynx leaf supplies canonical Effect Atom data plus shared Web
sorting/status logic. Fresh populated 1280 × 820 and 1440 × 900 Lynx DevTool
captures use one three-thread snapshot, report zero renderer errors, and prove
the former eager snapshot failure is no longer on the product path. The reuse
increase is below one percentage point and the Web/Lynx top-control rows still
differ, so T6-C1 remains active and the next slice must share a larger
composition boundary. Evidence and explicit gaps are under
`evidence/2026-07-29/T6-C1/sidebar/sidebar-v2-host/`.

The 2026-07-30 maximum-composition slice removes that top-control fork.
`SidebarV2CompositionSurface` now owns one cross-renderer subtree spanning
Sidebar chrome, Search/New-thread, project scope/New-project, the list
container, and empty-state placement. Web and Lynx retain only state projection
and renderer-specific rich row actions outside it. Lynx project scope is real,
and unverified shortcut labels remain absent there. Explicit `Sidebar.lynx`,
`ui/sidebar.lynx`, desktop-update, badge, dialog, and router leaves cut the
legacy DOM Sidebar graph instead of type-bridging it. The post-merge app
typecheck baseline of 236 errors is now zero, both Lynxtron TypeScript programs
pass, and CI typecheck is required.

The strict reuse report now reads 22/325 shared modules (6.8%) and
3,332/68,944 shared lines (4.8%) for `app-shell-sidebar`. This is an honest
denominator correction: the previous report counted the unreachable
3,823-line Web legacy Sidebar and its DOM dependencies as Lynx-reachable
because no `.lynx` host leaf existed. No exclusion or mask changed. The maximum
structural boundary is shared, but state/behavior hosts and the Web legacy
fallback keep the declared full-product reuse gate open, so T6-C1 remains
active. Focused tests, Web/Lynx builds, API/CSS audits, and an 11-file
zero-issue ReactLynx scan pass. A fresh 1280 × 820 session was tapped to open
the real project-scope menu before capture; its 2× JPEG metadata reports zero
renderer errors.

## P2 native `<list>` transcript (first slice complete)

The chat transcript projection is now a shared production module:
`client-runtime/presentation/transcript` carries the complete Web pipeline —
`deriveWorkLogEntries` (payload sniffing, tool-lifecycle collapse, ordering),
`deriveTimelineEntries`, `deriveMessagesTimelineRows` (turn folds,
work grouping/toggle, working row, duration starts, stable row identity),
tool status affordances, and `formatDuration`/`formatElapsed` — with message
and proposed-plan payloads generic per renderer. Web `session-logic.ts` and
`MessagesTimeline.logic.ts` re-export web-typed wrappers; their 107 existing
tests pass unchanged against the shared implementation, and the shared module
adds 12 colocated tests. The module avoids `toSorted` and negative `at` for
QuickJS parity and uses a schema-free tool-lifecycle literal check: an
intermediate contracts value import grew the renderer bundle from 2,061.1 kB
to 2,448.9 kB and was removed; the final bundle is 2,107.2 kB.

The Lynx `MessagesTimeline` is now a native `<list>` host: one
`<list-item item-key>` per shared projection row (user/assistant/system
messages, turn folds, work rows with real command previews and
success/failure glyphs, `+N previous tool calls` toggles, proposed-plan rows,
live-elapsed working row), follow-at-end via `scrollToPosition`, detach on
user scroll, and a "Jump to latest" pill. The `<scroll-view>` +
full-`messages.map()` renderer and the clean-room activity-item CSS are
deleted. The bridge, connector, and Effect Atom now carry canonical
`latestTurn`, `proposedPlans`, and `activeTurnId`, which turn folds and the
working timer require. A deterministic populated fixture
(`scripts/prepare-transcript-visual-state.mjs`) drove a real provider turn
through the production connector; the fresh Lynx DevTool capture reports zero
renderer errors under `evidence/2026-07-29/P2/transcript/list-host/`
(originally mislabeled 1280 × 820; corrected to its true 1180 × 748 default
viewport — true 1280 × 820 and 1440 × 900 captures of the surface live under
`evidence/2026-07-29/P2/transcript/scroll-machine/`). The minimap, actionable
revert control, and the full scroll-state-machine battery remain registered
gaps for the phase exit.

The follow-up P2-S3 slice made the follow/detach contract a shared, tested
state machine (`reduceTranscriptFollow`: user scrolls attach/detach by
distance-from-end, layout/diff scrolls never detach, jump-to-latest and
thread switches reset; the Lynx timeline is remounted per thread). An
eight-prompt fixture driven through the production connector produced a
content-overflowing settled transcript; two fresh zero-error DevTool
sessions proved bottom-anchored initial positioning, tap-expansion of turn
folds and the work-group toggle (label asserted via DOM), and that
layout-shift scrolling keeps the list pinned. The user-scroll detach path is
runtime-blocked by new R12 — Lynxtron 0.0.5 DevTool input emulation delivers
taps only (no drag/touch/wheel scrolling) — registered in the compat matrix
with an upstream issue draft. Evidence:
`evidence/2026-07-29/P2/transcript/scroll-machine/`.

The 2026-07-30 P2 tail slice closes the remaining read-only transcript
presentation gaps. A renderer-neutral new-turn detector now distinguishes
initial history from a newly materialized user message; the Lynx native list
anchors that row at the viewport start with reserved end space instead of
following the streaming tail. User scrolling or “Jump to latest” exits the
anchor. Canonical checkpoint summaries now flow through the existing shared
timeline-row slot into compact, non-actionable turn-diff cards with shared
file selection and aggregate stats; Lynx does not claim the still-unavailable
revert operation. The shared Markdown projection gained GFM table parsing and
list nesting depth, while the Lynx host renders tables, nested quotes, and
nested lists without a DOM AST.

Focused Markdown/transcript tests pass (44), both Lynx TypeScript programs are
clean, the three affected ReactLynx components scan with zero findings, API/CSS
audits and the production build pass. A fresh explicitly sized 1280 × 820
session rendered a seeded canonical assistant message with a table, nested
quote/list, and checkpoint card; the capture is 2560 × 1640 physical and
reports zero renderer errors. The reusable measurement contract is
`scripts/visual-measurement-spec-transcript-p2.json`. R12 still prevents a
headless real-scroll gesture acceptance pass, so anchoring behavior remains
unit/host-wiring verified rather than falsely marked as DevTool-scroll proven.

## P3-S1 keyboard/push capability probe (complete)

Env-gated runtime probes (`T3_LYNXTRON_CAPABILITY_PROBE=1`) plus a
declaration inventory of Lynxtron 0.0.5 established, with DevTool console
evidence under `evidence/2026-07-29/P3-S1/keyboard-probe/`:

- main→renderer `LynxWindow.sendGlobalEvent` works end to end (verified in
  two fresh sessions) — the delivery leg of the P3-S3 keyboard bridge and of
  any R3 relay already exists;
- preload runs in an isolated JS realm (a `globalThis` marker planted by
  main is invisible to it) and 0.0.5 declares no preload→main channel, so
  the connector cannot relay through main — R3's polling adapter stands with
  a refined upstream ask;
- no window-level key events and no `globalShortcut` exist; `Menu`
  accelerators are declared but headlessly untestable; renderer
  `bindkeydown` props are declared with an empty event detail and their
  runtime behavior is unverifiable headlessly (CDP `Input.dispatchKeyEvent`
  is "Not implemented", extending R12).

R3 and R5 matrix rows and their upstream issue drafts now carry these probe
facts. `clientCapabilities.keyboard` remains `available: false`; no product
keyboard code was written in this slice.

## P3-S2 discrete keyboard commands (complete; real-key acceptance pending-user-session)

The first deliberately bounded R5 product path now uses Lynxtron's native
application `Menu` accelerators for New Thread, Quick Switch, and Settings.
The main process emits a renderer-neutral packet containing
`type/key/code/modifiers/repeat/source/sequence` through the already-proven
`LynxWindow.sendGlobalEvent` leg. The renderer validates and de-duplicates
that packet, then passes it through the same shared keybinding resolver and
canonical server keybinding config used by Web before dispatching the
product command.

This is not presented as general keyboard support. Tab, Escape, arrows,
overlay traversal, focus movement, and renderer text-key events remain
outside the slice and keep R5 open. Lynx no longer renders speculative
shortcut chips or Quick Switch keyboard-navigation hints; the native menu
is the only accelerator affordance. Packet construction, validation,
platform `mod` mapping, `when` evaluation, and all three command resolutions
have focused fixtures. App/main/Web/shared/contracts typechecks, builds,
scanner, and the slice capture are the automated certification boundary.
Because R12 prevents DevTool key injection and Menu accelerators cannot be
triggered headlessly, physical accelerator acceptance is explicitly
`pending-user-session`.

## Lynxtron 0.0.7 upgrade and upstream issues (2026-07-29)

`@lynx-js/lynxtron` and `@lynx-js/lynxtron-dev-plugins` are upgraded
0.0.5 → 0.0.7. Builds, both typecheck programs, and a fresh zero-error
1280 × 820 DevTool capture over the eight-prompt snapshot all pass
(`evidence/2026-07-29/upgrade-0.0.7/`). Re-probing on 0.0.7 changed nothing
for R3 (sendGlobalEvent works, preload still isolated), R5 (no new keyboard
API), or R12 (still tap-only, `Input.dispatchKeyEvent` still unimplemented);
R11 was not empirically retested — the upstream file-URL loader fix landed
after v0.0.7. New in 0.0.7: the `lynxBridge` renderer→main invoke API
(registered as a future option for typed host calls, not yet adopted) and
renderer `fetch` support (not adopted; transport stays in the connector).
The four Lynxtron-specific gaps are now filed upstream:
[#148](https://github.com/lynx-family/lynxtron/issues/148) (R11),
[#149](https://github.com/lynx-family/lynxtron/issues/149) (R5),
[#150](https://github.com/lynx-family/lynxtron/issues/150) (R3),
[#151](https://github.com/lynx-family/lynxtron/issues/151) (R12). The
remaining R-series drafts target the Lynx engine repo and stay unfiled.

## Lynxtron 0.0.8 follow-up (2026-07-30)

`@lynx-js/lynxtron` and `@lynx-js/lynxtron-dev-plugins` are upgraded
0.0.7 → 0.0.8. The release includes a V8 HandleScope crash fix, local file
URL loading, and Windows rebuild fixes. All four filed issues remain open with
no maintainer replies as of this check.

The release does not close the probed gaps. An isolated Rspeedy entry emits a
2.7 kB async child bundle and can be launched through the env-gated
`T3_LYNXTRON_BUNDLE_PATH` host override; activating it still fails with
`ERR_INVALID_URL` for `/async/./lazy-bundle-child.…bundle`, so R11 and #148
stay open. `T3_LYNXTRON_CAPABILITY_PROBE=1` again proves main→renderer
`sendGlobalEvent` delivery while preload reports
`mainPidMarker=undefined sharedWindowHandle=no`, leaving R3 unchanged. The
0.0.8 declarations still expose Menu accelerators but no window keyboard event
or `globalShortcut` API, leaving R5 unchanged. On an eight-message canonical
fixture, `scripts/verify-transcript-scroll.mjs --step scroll-up` still cannot
detach follow, and direct `Input.dispatchKeyEvent` returns “Not implemented,”
leaving R12 unchanged. The probe entry is retained under `src/app/probes/` so
future releases can be retested without modifying the product graph. Focused
host tests, both typecheck programs, scanner, API/CSS audits, and the production
build pass; a fresh explicitly sized 1280 × 820 transcript capture is 2560 ×
1640 physical with zero DevTool console errors.

## Provenance snapshot

The 2026-07-27 comparison against
`/Users/bytedance/github/t3code-lynxtron` counts physical lines in hand-written
`.ts`, `.tsx`, `.js`, `.mjs`, and `.css` files, excluding dependencies, build
output, reports, generated routes, generated CSS, and generated icon data.
`scripts/provenance-report.mjs` makes the file filters, two explicit renames,
and Git `--numstat` retained-line calculation repeatable.

| Measure                                                      |                                                                   Result |
| ------------------------------------------------------------ | -----------------------------------------------------------------------: |
| Current Lynxtron source/config                               |                                                 10,458 lines in 64 files |
| Lines still textually retained from the standalone prototype |                                                              5,510 lines |
| Retained share of the current app                            |                                                                    52.7% |
| Files paired for comparison                                  |                                                        44 (all modified) |
| Explicit renames included                                    |        `App.css` → `overrides.css`; `useT3Connection.ts` → `t3Client.ts` |
| Shared production modules now consumed from `client-runtime` |   77 functions across 25 modules, plus 1 state machine and 1 UI contract |
| Shared module source footprint used by both Web and Lynx     | 5,035 lines, plus a 39-line capability contract and 27 lines of defaults |

The 5,510-line number is conservative textual provenance, not a claim that the
standalone architecture is still intact. In particular, the 702-line standalone
connector is now 943 lines while adding monorepo server resolution, typed Effect
RPC, canonical server-config/auth-access streaming, provider settings writes,
project-file/source-control queries, host-backed access mutations, and canonical
Composer commands; its handwritten shell/thread/config reducers and model
flattening are gone. The 314-line `useT3Connection` singleton was replaced by a
571-line Effect Atom
host/action boundary that now carries shell, thread/checkpoint, canonical
provider/settings, derived model state, and typed
project-file/source-control/access-inventory host actions. Four listener-based
renderer stores were replaced by one tested Atom reducer/host. The 5,035-line
shared footprint counts the complete production modules directly imported by
both clients; it is deliberately not reported as “lines saved”, because
importing part of a module and eliminating duplicate local logic are different
measurements.

The new session/sidebar presentation slice is 174 production lines with six
exported functions. Web directly consumes five of them and Lynx consumes two;
`deriveSidebarThreadStatus` is the cross-client view-model used by both. On the
Lynx side this raises direct `client-runtime` reuse from six to eight production
functions: shell and thread reduction, sorting, active/proposed plans, relative
time, session busy state, and sidebar status.

The model-picker extraction is now a 356-line shared production module with ten
pure functions, including canonical provider/model catalog and selection
projection. Web directly imports six and Lynx imports five. It deletes Web's
local model-ordering and picker-search modules, removes the standalone Lynx
picker's fuzzy-search, favorite/provider-sort, and display-name parsing copies,
and replaces `t3Client`'s local model lookup/fallback pipeline. The Lynx picker
is now 260 lines versus 316 in the standalone prototype.

The Provider slice adds a 464-line renderer-neutral projection/status module and
a separately exported 79-line settings-mutation module. Keeping the mutation
entry point separate prevents settings schemas from entering the Lynx renderer
bundle: after the split, the production Lynx bundle is 1,208.0 kB instead of
1,660.7 kB. After the later command-palette and panel-state extractions, the
current production bundle is 1,212.1 kB. Web consumes the same
instance/status/patch semantics, while Lynx directly consumes six Provider
projection functions and one settings helper.

The current ChatMarkdown slice is a 598-line shared production module with
thirteen exported projection functions plus a 138-line shared path module.
Web now consumes canonical language, filename, task-offset, file-link,
normalization, and duplicate-basename projections; its former 213-line private
Markdown-link module and 129-line test are removed. Lynx consumes canonical
fence, list, inline-span, and file-link projections while retaining only
`<view>/<text>` rendering. Its host exposes clipboard plus native/external
navigation, so code blocks copy and links activate without renderer-side
Electron imports. The production Lynx bundle is 1,266.4 kB. Tables, nested
block structure, task mutation, and other full Markdown AST parity remain in
progress.

The changed-files extraction is a 233-line shared production module with six
pure functions. Web consumes all six for its checkpoint card/tree, while Lynx
consumes the canonical tree and aggregate-stat projections. Web's two private
projection modules and their duplicate tests were removed. Lynx DiffPanel no
longer presents inert branch/working-tree controls: the bridge carries
`OrchestrationCheckpointSummary[]`, and the panel displays real per-turn file
trees and totals. Full patch rendering remains explicitly gated by R10. The
production Lynx bundle is 1,223.3 kB after this extraction.

The file-browser extraction adds a 127-line shared production module. Web uses
the canonical entry summary for file counts and Pierre tree paths; Lynx uses the
same summary plus the normalized directory-first tree. Its previous static
69-line placeholder is now a 268-line host UI backed by the existing
`projects.listEntries` / `projects.readFile` RPCs. The production Lynx bundle is
1,238.6 kB after adding the real tree and preview.

The file-editing follow-up expands that presentation module to 159 lines and
adds a 100-line shared save state machine. Web deletes its four private
preview/revision/save modules and injects browser timing into the shared
coordinator. Lynx FilesPanel is now 358 lines and injects Lynx timing into the
same coordinator while its host uses the existing canonical
`projects.writeFile` contract. A real connector/backend run wrote and read a
nested file without truncation, rejected `../` traversal without leaking the
submitted contents, and released its server port on disposal. A separate
isolated Web interaction loaded the same editable surface and persisted an
editor deletion to disk through the shared 500 ms autosave path. Eighteen
focused tests, all affected TypeScript programs, both production builds,
API/CSS audits, and the ReactLynx scanner passed. The production Lynx bundle is
1,273.4 kB. Line-selection annotations remain a documented R8 gap rather than
being represented as parity.

The source-control extraction adds a 150-line shared production module. Web and
Lynx both consume the same discovery-item projection; Web additionally renders
structured code and redacted-account parts, while Lynx deliberately omits
sensitive account text from its plain summary. The former static Source Control
panel now uses canonical `server.discoverSourceControl` data and a real rescan
action. The production Lynx bundle is 1,246.4 kB after this extraction.

The first Connections extraction adds a 110-line shared presentation module and
reuses the existing 90-line auth-access state module in the Lynx host. Web and
Lynx now share client/link ordering, timestamp normalization, primary labels,
device details, live state, and aggregate counts. The connector consumes the
canonical access stream and shared reducer, while its bridge intentionally
strips pairing credentials before the renderer boundary. The production Lynx
bundle is 1,254.4 kB after adding host-backed create/revoke actions. The
remote-environment catalog and connection runtime remain in progress.

The command-palette extraction is a 58-line shared production module with three
pure functions. Web consumes normalization, query parsing, and ranking; Lynx
consumes parsing and ranking. Quick Switch is now 192 lines, with 130 retained
from the 175-line standalone component, while adding actions-only queries and
real project/branch context instead of the prototype's first-project and
`#main` placeholders.

The right-panel extraction adds a 133-line generic surface-stack state module.
Web consumes ten of its transitions/selectors and Lynx consumes seven. This
removes 74 lines from Web's right-panel store and 23 lines from Lynx's
renderer-state host while making surface activation, nearest-neighbor fallback,
close-all, and hidden-versus-cleared semantics identical.

The proposed-plan extraction adds a 113-line shared production module with
eight pure functions. Web's former 113-line private implementation is now a
thin DOM-only download adapter and its projection tests run directly against
`client-runtime`. Lynx removes its weaker local heading regex and uses the same
title projection in PlanPanel. Fourteen focused tests, all affected TypeScript
programs, the ReactLynx scanner, and both production builds passed; the current
Lynx bundle is 1,273.6 kB.

The General Settings extraction adds a 235-line shared presentation module with
five exported functions and a 27-line schema-free defaults module. Web supplies
its already-loaded unified defaults plus runtime-specific Duration/model
equality, while Lynx imports only plain values and erased settings types. This
recovered the Lynx production bundle from the accidental 1,459.2 kB
schema-bearing build to 1,283.3 kB, only 9.7 kB above the preceding baseline.
Lynx now stores a canonical portable `ClientSettings` projection, writes
assistant streaming, provider checks, and default thread mode through the
canonical server settings RPC, and restores exactly the General controls it
renders without resetting Sidebar V2. Twenty-five focused tests, four affected
TypeScript programs, Web and Lynx production builds, API/CSS audits, eight
ReactLynx scans, a real connector/server toggle-and-restore smoke, and an
authenticated isolated Web restore-defaults flow passed.

The Composer extraction is now a 226-line shared presentation module plus a
31-line turn-dispatch projection. Web reexports the send-state helper from its
compatibility module and consumes the same runtime/interaction copy. Lynx
replaced its weaker `trim()` gate, hard-coded `Low · Normal`, `Full access`,
`Build`, `main`, and fake context chevrons with canonical projections. Runtime
and interaction pills dispatch `thread.runtime-mode.set` and
`thread.interaction-mode.set`; a server-declared provider option appears only
when capabilities contain a real descriptor and persists through
`thread.meta.update`. Turn start reads the target thread's shell modes and a
thread-scoped pending model selection instead of hard-coding defaults or
leaking another thread's model.

Provider-option helpers were split from the mixed shared model module into a
149-line schema-free subpath. This recovered an intermediate 1,747.3 kB
renderer build to 1,295.3 kB. Twenty-seven focused shared tests, all affected
TypeScript programs, zero-issue ReactLynx scans, API/CSS audits, Web/Lynx/host
production builds, and a real connector/server mode toggle-and-restore smoke
passed. A fresh authenticated Web flow also switched Build to Plan and back,
selected Supervised and restored Full access using the same shared copy, with
no console errors.

## UI-first execution decision

The Electron/Web monorepo is the only fidelity target. The next implementation
slice finishes the reachable shared shell and Sidebar with a Lynx-specific
Tailwind CSS v3 PostCSS pipeline using `@lynx-js/tailwind-preset`; the Web
Tailwind v4 pipeline remains unchanged.

The code/editor surface, terminal, and embedded browser now have approved,
explicit placeholders. Their surrounding chrome, state, labels, commands, and
open/close behavior remain required. Complete native `<list>` chat behavior and
global keyboard support are high-priority deliverables rather than deferrable
runtime islands.

SVG, font loading, preload push, RouterProvider convergence, and full patch
rendering remain tied to R1–R10 in the compatibility matrix. Their current
fallback is explicit in the UI or ledger; none is silently treated as parity.
