# Implementation status

> **Final5 authority notice (2026-08-12).** This document is a detailed
> implementation history, not the current Harness or fidelity authority.
> Read [`harness/current-state.md`](./harness/current-state.md) and
> [`harness/completion-audit.md`](./harness/completion-audit.md)
> first. Historical `complete`, `functional`, screenshot and `PASS` statements
> remain provenance only until admitted by the current strict manifest.
> Plan 11C is historical. Final5 keeps 18 required evidence cells pending and
> records the current verification boundary in the completion audit.

This app is the monorepo-native successor to the standalone
`t3code-lynxtron` prototype.

## Active follow-up plan (2026-08-01)

[Plan 11](./plans/11-outcome-driven-convergence.md) is the active execution
order after the Plan 10 AR6 review. A real packaged handoff found that the
child server could become ready while the renderer's one-shot bridge probe had
already failed; Page reload then connected with transport `kind: "main"` and
`lastSeq: 22`. The same session found five trust regressions: broken Sidebar
V2/project-scope layout, Settings flashing back to chat, lifecycle failure or
reconnect state not being consistently visible, weak Composer adaptation, and
missing Dev stage artwork. Plan 11 keeps the main-owned and shared-composition
architecture, fixes semantic cold-start readiness first, and requires those
five observable outcomes to pass before it can complete.

OC0 is complete. An owned isolated Electron run recorded the current Sidebar
V2 and Composer at 1280 × 820 with zero unexpected renderer errors. Computer
Use exercised Settings → Beta → Back and the project-scope popup; exact CDP
geometry pairs the Web reference with the durable Native failure measurements
in `reports/oc0-outcome-baseline.json`. The report keeps this historical
failure freeze distinct from OC7 same-snapshot certification.

Preparatory OC1 work fixes the cold-start ordering at both race boundaries:
main attaches the typed handlers before `loadFile`, and the renderer subscribes
to pushed events before its ready/snapshot request. A reusable packaged
readiness verifier now owns the exact child PID, isolated state, logs, bundle,
and DevTool session. Its three-run evidence advanced the renderer sequence
`2→3`, `2→3`, and `26→27` through a same-value bridge command, rendered the
known fixture thread and model, reported zero renderer errors, and stopped all
three owned processes. OC1 remains pending while the bounded Plan 11A
experiment runs at the newly reached atomic boundary.

Preparatory OC2 work removes the reachable TanStack memory-router writeback
from the Lynx renderer. One synchronous pathname Atom now owns Lynx navigation,
normalizes `/settings` to `/settings/general`, and projects the shared Settings
section intents onto explicit Lynx panels. The packaged verifier's optional
Settings proof uses measured semantic selectors and real DevTool taps: it
entered General, remained there across connector sequence `12→13`, verified
Providers, Connections, Source Control, Beta, and Archive route/content pairs,
then passed two Settings → Providers → Back cycles with zero renderer errors.
Evidence is under `evidence/2026-08-01/OC2/settings-navigation`; OC2 remains
pending to preserve the OC0 → OC1 → OC2 task order. A subsequent source audit
corrected the proof boundary: the visible Appearance and Keybindings entries
were not covered by that report, and Appearance incorrectly rendered General
content under `/settings/appearance`. The route projection now owns a distinct
Appearance panel, Web and Lynx compile the same `AppearanceSettingsSurface`
composition and search anchors, General no longer duplicates Appearance-owned
rows, and unsupported Lynx Appearance controls are labeled rather than made to
look functional. The same source audit restored Web's exact Background activity control,
text-generation provider/model/traits picker, live Diagnostics summary and
Link, and Electron/hosted About update state plus update-track selector through
platform host slots. Lynx keeps the shared General hierarchy and core controls
but now labels unsupported background, model-selection, and automatic-update
behavior instead of exposing no-op buttons. Web's source-of-truth information
architecture is therefore preserved without pulling DOM/Electron controls into
the Lynx graph. The now-unreachable second General panel and restore hook were
deleted, and the dedicated `.web` host stops General from pulling the complete
Provider/Archive/Appearance module. With the strict denominator unchanged, its
intermediate product graph drops from 312 to 243 eligible modules. The semantic
verifier now walks all eight visible sections;
the expanded packaged run remains pending the time-boxed DevTool `no-session`
blocker, so the earlier report is not treated as full-nav certification.

Preparatory OC3 work now gives Web and Lynx one renderer-neutral lifecycle
presentation for copy, severity, visibility, and recovery actions. The
main-owned connector reports an unexpected post-ready server exit, exposes an
allowlisted reconnect command, replaces the connector by generation, and
ignores stale exit events from the disposed generation. In the packaged proof,
the harness resolved server PID 16909 from owned app PID 16812 and port 59517,
sent `SIGKILL` only after verifying the parent and isolated base directory,
observed a visible error with Reconnect/Connections, tapped the measured
Reconnect control, observed reconnecting, advanced the renderer sequence
`12→18`, resolved replacement PID 17174 on port 59929, and ended ready with no
banner or renderer errors. Evidence is under
`evidence/2026-08-01/OC3/lifecycle-recovery`; OC3 remains pending until the
earlier tasks close in order.

Preparatory OC4 work moves project-scope overlay geometry into the Lynx menu
leaf while preserving the shared Sidebar V2 composition. A valid packaged
attempt proved that the popup stayed inside the 256 px rail, opened below its
trigger, and shifted the thread list by at most 1 px. That attempt also exposed
the dismiss layer intercepting selection, so the layer now begins outside the
canonical `--sidebar-width`. Two later PID-owned DevTool attempts published no
session, so the post-fix real-tap proof remains pending rather than being
reported as a product failure. Focused Sidebar tests, Web/Lynx typechecks, and
the ReactLynx scanner pass; details are under
`evidence/2026-08-01/OC4/sidebar-scope`.

Preparatory OC5 work removes the Lynx-only Composer pill anatomy and moves
toolbar-control density, truncation, primary-action states, and context-strip
geometry into the shared Composer composition. The Lynx textarea remains the
bounded native editor leaf. Disabled transport now disables both input and
send/stop dispatch. Focused Composer tests, Web/Lynx typechecks, the scanner,
and both production builds pass; packaged visual measurement remains pending a
stable DevTool session. Details are under
`evidence/2026-08-01/OC5/composer-convergence`.

Preparatory OC6 work gives packaged Lynxtron one testable branding resolver.
Local monorepo builds now resolve the Dev stage independently of `NODE_ENV`,
while an explicit `T3_LYNXTRON_APP_STAGE_LABEL` still selects Dev, Nightly,
Alpha, or Latest. The shared backdrop exposes its resolved variant for semantic runtime
measurement. Focused branding/backdrop tests, Web/Lynx typechecks, the scanner,
and both production builds pass; visible packaged artwork proof remains
pending a stable DevTool session. Details are under
`evidence/2026-08-01/OC6/stage-branding`.

OC7 now has a reusable semantic aggregation mode rather than another bespoke
launch sequence. `verify:plan11-semantics` requires three fresh readiness runs
and exercises the five independent semantic outcomes only on the third owned
process. Sidebar Search and deterministic thread rows plus Composer controls
have stable semantic selectors, and the report keeps Sidebar, Settings,
Composer, Dev branding, and lifecycle results separate. It
explicitly records matched Web/Lynx visual comparison as pending and therefore
cannot mark OC7 certification complete by itself. The mode has passed syntax,
focused tests, Web/Lynx typechecks, the scanner, the Lynx build, and audits, but
has not been launched after the repeated DevTool no-session condition. Its
Composer proof now requires an isolated real-transcript fixture, verifies the
existing-thread overlay first, creates a new thread through the product UI, and
then verifies the hero state. It measures footer/control/context geometry and
requires independent sequence advances for reasoning/model option, model,
runtime, and interaction commands. Bounded product-affordance cleanup between
outcomes prevents a failed overlay/route from contaminating the next result.
The generated OC0 empty-thread fixture cannot stand in for both outcomes.

[Plan 12](./plans/12-feature-parity-by-product-value.md) is queued after Plan 11. It closes the remaining Web/Electron feature gap by product value: the
complete agent intervention and input loop, transcript interaction, remote and
multi-environment operation, change review, secondary work surfaces, and then
platform performance, theme, and polish. It must not start by bypassing an
unfinished Plan 11 outcome.

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

## P3-S2 discrete keyboard commands (complete; core real-key acceptance recorded)

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
Because R12 prevents DevTool key injection, physical accelerator acceptance
uses authorized Computer Use. An exact-owned 0.0.21 run pinned PID `2931` and
window `88438` before every action: real `Command+K` opened Quick Switch,
`Escape` closed it, `Command+,` opened Settings General, and `Command+N` opened
New Thread. Main transport remained ready and advanced from sequence 13 to 14,
with no keyboard-delivery or runtime errors. This closes the bounded core menu
shortcut acceptance, not general renderer keyboard support: text selection,
focus traversal, non-Sidebar drag, and thread/model jump acceptance remain open. A second
exact-owned run pinned PID `50651`, window `89189`: real `Command+P` opened the
File Picker with repository results, `Escape` dismissed it, and `Command+B` hid
then restored Sidebar. Main transport remained ready at sequence 15, no keyboard
or runtime warnings appeared, and cleanup stopped only the captured PID.
An additional exact-owned run pinned PID `60545`, window `89233` and used a
real Computer Use drag on the current-frame Sidebar divider. The visible edge
moved by roughly 80 px; DevTool resolved from the owned PID then measured
`data-sidebar-width="341"` and matching 341 px gap/container geometry. The
error console stayed empty and the canonical main transport remained ready at
sequence 15.

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

## Architecture reset (plan 10) execution

### AR0 baseline (2026-07-31, merge commit `1c8205d73`)

The branch merged `origin/main` `4029b858e` (35 upstream commits; conflicts in
`SidebarV2.tsx`, `Sidebar.logic.ts`, `ChatComposer.tsx`, two keybinding
registries, and `pnpm-lock.yaml`). Conflict resolution kept the shared
`SidebarV2RowSurface` composition and shared runtime-mode presentations, and
ported upstream's terminal-status icon, title-regeneration busy state, and
settle-click pointer fix into the shared surface; both keybinding registries
took the union. Merged typechecks (Web, Lynxtron app/main, client-runtime,
contracts, shared) are zero-error and 141 focused tests pass.

Recorded baseline after the merge:

| Measure                                                                      | Value                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Production Lynx bundle (`main.lynx.bundle`)                                  | 2,081.1 kB                                                        |
| `src/app/overrides.css`                                                      | 3,947 lines                                                       |
| Reachable Lynx-owned product components (`src/app/components/`)              | 20 modules                                                        |
| Strict product-surface reuse (app-shell-sidebar)                             | 22/329 modules (6.7%), 3,369/70,611 lines (4.8%)                  |
| Strict product-surface reuse (new-thread-empty / existing-thread-transcript) | 32/464 modules (6.9%), 7,148/103,220 lines (6.9%)                 |
| Strict product-surface reuse (composer)                                      | 17/430 modules (4%), 4,947/92,705 lines (5.3%)                    |
| Strict product-surface reuse (model-picker)                                  | 5/272 modules (1.8%), 1,394/57,300 lines (2.4%)                   |
| Strict product-surface reuse (settings-general feature panel / route)        | 3/4 modules (75%); 10/15 modules (66.7%), 1,260/1,799 lines (70%) |
| Strict product-surface reuse (settings-providers)                            | 11/291 modules (3.8%), 1,730/61,496 lines (2.8%)                  |
| Web API audit                                                                | 59 APIs                                                           |
| CSS audit                                                                    | 1,471 distinct static utilities                                   |

Both production builds and the API/CSS audits pass. A fresh explicitly sized
1280 × 820 Lynx DevTool capture over an isolated empty base dir
(`reports/screenshots/ar0-baseline-1280x820.jpg`) reports zero renderer
errors; its measurement-spec anchors were not collectible against the empty
sidebar, which matches the unseeded state. The denominator growth versus the
pre-merge report comes from upstream surface additions (file picker, project
search, bulk title regeneration); no exclusion, mask, or root changed
(boundary hash `67f5a53f…`).

### AR1 main-owned connector spike (2026-07-31, complete)

`T3_LYNXTRON_MAIN_CONNECTOR=1` now starts a main-owned connector host behind a
flag; the preload polling path remains the default. One typed protocol
(`src/shared/connectorProtocol.ts`) carries the renderer-ready exchange, one
serializable snapshot, allowlisted command requests, sequenced
status/config/access/shell/thread/log envelopes, a resync request, and a
dispose path. Main instantiates the prebuilt connector bundle, delivers events
with `LynxWindow.sendGlobalEvent`, and serves requests through
`lynxBridge.handle`; the renderer probes the typed path once and falls back to
polling when it does not answer. Payloads stay serializable DTOs — no Effect
values, functions, or credentials (the connector's credential-stripped access
projection is unchanged).

Runtime evidence: with the flag on, the renderer logged
`[main-transport] push transport active` and the DevTool hook reported
`kind: "main"` with `lastSeq` advancing (30 events). A real
`NativeModules.bridge.call` round trip through the hook's `invoke` created and
selected a thread (`createThread` returned a canonical `threadId`), and the
pushed shell event rendered the new thread in the sidebar with zero renderer
errors (`reports/screenshots/ar1-main-connector-1280x820.jpg`, 2560 × 1640
physical). The default run without the flag reported `kind: "polling"` with
zero errors. `scripts/main-connector-smoke.mjs` drove the host class plus the
production connector through real server bootstrap, ready snapshot, thread
create/select, a real prompt, 19 strictly monotonic streamed events across all
six kinds, interruption, resync, and shutdown. SIGTERM released the
connector-owned server process and port; notably the polling path leaked its
server child under the same SIGTERM (pre-existing preload behavior the AR2
cut-over retires). 21 focused tests cover sequencing, gap/resync, command
allowlisting, snapshot mirroring, and disposal; the ReactLynx scanner,
typechecks, audits, reuse report, and build all pass. The stale measurement
spec selectors (`.sidebar__title`, `.project-row__name`) were updated to the
current V2 sidebar classes after the AR0 merge made V2 the default.

### AR2 preload-polling cut-over (2026-07-31, complete)

The main-owned connector is now authoritative. `main.ts` always starts the
connector host; the renderer bootstraps with one ready-and-snapshot exchange,
consumes sequenced push events, and routes every connector command through
the typed `t3:connector.command` handler. Removed: the reachable 400 ms
polling interval, the preload `LatestState` snapshot buffers, and all
preload connector command methods (`preload.js` shrank 8,453 → 4,847 bytes).
Preload keeps only proven preload-resident capabilities: app branding, JSON
preference storage, clipboard, and native/external navigation; it owns no
product state. Connectivity now reads a standalone `connectionStatusAtom`
instead of the deleted preload `getStatus`. A failed transport probe surfaces
an honest error state rather than a timer-based fallback.

Verification: a flagless launch reports `kind: "main"`; a hook-driven
`createThread` returned a canonical id and the pushed shell event rendered it
(`reports/screenshots/ar2-cutover-1280x820.jpg`, zero renderer errors).
Startup, resync, renderer reload, and shutdown have focused tests (65 total
across the app); SIGTERM now releases the connector-owned server on the
default path, retiring the polling-path leak. Current credential-redaction
tests pass; the integration smoke still drives 18 monotonic events across all
six kinds through a real server bootstrap, prompt, interruption, and
shutdown. R3 is closed for the T3 architecture; the upstream issue stays
open for the missing general capability. Renderer bundle is 2,084.3 kB
(-0.5 kB); event payloads are unchanged DTO shapes now delivered per change
instead of per 400 ms poll cycle.

### AR3 transcript composition convergence (2026-07-31, complete)

Web and Lynx now compile the same physical transcript composition:
`apps/web/src/components/chat/TranscriptRowSurface.tsx` owns user/system/
assistant message row anatomy, collapsed work and tool summary rows, turn
folds, working rows, proposed-plan and checkpoint card placement, typography,
and semantic class names, fed by the existing shared `MessagesTimelineRow`
projection. Platform islands enter through the `TranscriptRowElements`
contract: Web injects `ChatMarkdown`, copy/timestamp/revert meta rows, image
and context strips, tooltip work status, and lucide SVG chevrons/icons; Lynx
injects its Markdown renderer, compact turn-diff and plan cards, raster work
icons (nine new pre-rasterized lucide PNGs, R1), glyph work status, and text
disclosure chevrons. Work-row presentation helpers
(`transcriptRowPresentation.ts`) moved verbatim out of Web's
`MessagesTimeline.tsx`; hover/focus affordances stay in Web's CSS layer
(semantic hooks, R6) and the working-dot pulse in `index.css`.

Deletions in the same slice: Web's private `UserTimelineRow`,
`AssistantTimelineRow`, `TurnFoldTimelineRow`, `WorkGroupSection`,
`SimpleWorkEntryRow`, `WorkGroupToggleTimelineRow`, `ProposedPlanTimelineRow`,
`WorkingTimelineRow`, and their private helpers (`MessagesTimeline.tsx`
2,081 → 1,730 lines); the Lynx clean-room row components and their CSS
(`MessagesTimeline.tsx` 508 → 431 lines as a pure list host; `overrides.css`
3,947 → 3,792 lines, −155 clean-room transcript rules). Only the new
composition remains reachable.

Focused evidence: 11 surface anatomy tests plus 7 presentation tests cover
empty, short, failed, collapsed/expanded, plan, checkpoint-placement, and
working fixtures; the existing 139 Web chat tests, 65 Lynxtron tests, and 19
shared transcript/follow/stable-key tests pass unchanged. The CSS audit
introduces zero new unsupported utilities and retires two
(`focus-visible:ring-ring/70`, `hover:bg-accent/20`). Strict reuse keeps the
unchanged denominator (boundary hash `67f5a53f…`): the transcript route
reports 35/466 shared modules (7.5%) and 7,822/103,537 shared lines (7.6%),
up from 32/464 and 7,148/103,220. A real two-prompt fixture rendered through
the production app at 1280 × 820 reports zero renderer errors
(`reports/screenshots/ar3-transcript-1280x820.jpg`); measurement metadata for
checkpoint anchors was not collectible because the provider's credit-limited
turns produced no checkpoint card, and real scroll-gesture acceptance stays
deferred to a user session under R12. Renderer bundle is 2,252.3 kB
(+168.0 kB; ≈78 kB traced to the new raster icon set).

### AR4 Composer composition convergence (2026-07-31, complete)

Web and Lynx now compile the same physical Composer chrome:
`apps/web/src/components/chat/ComposerSurface.tsx` owns the framed surface,
editor area, footer toolbar row with separator anatomy, the shell width
(`COMPOSER_SHELL_CLASS`, now applied by Web's `<form>` and the Lynx shell
view), the context-strip ordering, and the hero headline copy. The editor
kernel, toolbar controls, and primary actions are platform islands through
`ComposerSurfaceElements`: Web keeps its Lexical editor, ProviderModelPicker,
traits/mode controls, and primary-action stack with banners, attachment
strips, stash, and command menus in the named slots; Lynx keeps its native
`<textarea>` kernel, control pills, gradient send/stop button, and static
context items as islands. The canonical footer order (model → option/traits →
runtime mode → interaction mode → plan) is documented on the surface contract
and holds in both footers. Web's `DraftHeroHeadline` renders the same
`ComposerHeroHeadline` (h1 preserved).

Deletions: the Lynx clean-room card/toolbar/separator markup and its CSS
(`overrides.css` 3,792 → 3,734 lines); the Lynx `Composer.tsx` is now an
editor host and event adapter with control islands (238 lines). No fake
labels: model, runtime/interaction modes, checkout, and branch all read
canonical projections (`projectComposerContext`, mode presentations, config
model). New `overrides.css` rules are token passthroughs with
surface/R7/remove-when comments (context strip tuck, card surface color,
hero slot).

Focused evidence: 10 `ComposerSurface` tests cover draft, populated,
disabled, banner/error, interruptible-stop, collapsed, strip-order, and hero
fixtures; 167 Web chat tests and 65 Lynxtron tests pass; the
composer-controls smoke still toggles runtime/interaction modes against a
real server. A real prompt through the docked Composer rendered the busy
stop state and interruption at 1280 × 820 with zero renderer errors
(`reports/screenshots/ar4-composer-1280x820.jpg`); measurement metadata is
blocked by the same checkpoint-less fixture as AR3. Strict reuse on the
Composer route reports 21/433 modules (4.8%) and 5,812/93,202 lines (6.2%),
up from 20/432 and 5,621/93,022, boundary hash unchanged; zero new
unsupported CSS utilities. Renderer bundle is 2,258.2 kB (+5.9 kB). Physical
key acceptance stays `pending-user-session`; no Tab/Escape/arrow emulation
was added.

### AR5.1 Model Picker and Quick Switch composition (2026-07-31, complete)

Both overlays now consume shared physical compositions.
`apps/web/src/components/chat/ModelPickerSurface.tsx` owns the model row,
provider rail item/column, search row, new-badge, and empty anatomy; Web's
`ModelListRow` and `ModelPickerContent` render the same row content and empty
state inside their combobox/popover behavior hosts.
`apps/web/src/components/CommandPaletteSurface.tsx` owns palette section
labels, result rows (icon → title → description → trailing → timestamp →
shortcut → chevron), and the empty state; Web's `CommandPaletteResults`
renders them inside its autocomplete items. The Lynx `ModelPicker.tsx` and
`QuickSwitch.tsx` are now behavior hosts (search/favorites/query state plus
shared projections) feeding the same surfaces.

Two product fixes ride with the slice: the Lynx model picker overlay is now
mounted in `RootOverlays` — the Composer model pill's `openModelPicker` atom
previously had no renderer, a pre-existing dead path — and the picker's
⌘1–⌘9 row hints are removed because keyboard acceptance is still
`pending-user-session` (fixed constraint; R5). Deletions: 203 lines of
clean-room picker/palette CSS (`overrides.css` 3,734 → 3,531); new rules are
glyph-leaf passthroughs with surface/R1/remove-when comments.

Runtime evidence (tap-driven DevTool, real app, isolated seeded state): Quick
Switch opens from the sidebar search, lists Actions with the shared rows, and
backdrop-closes; the model picker opens from the Composer pill, paints the
provider rail, search, and selectable model rows (Claude Fable 5 selected),
and a row tap dispatches canonical `setModelSelection` through the main
bridge and closes. Captures at 1280 × 820 report zero renderer errors
(`reports/screenshots/ar51-quick-switch-1280x820.jpg`,
`ar51-model-picker-1280x820.jpg`). Nine focused surface tests plus existing
palette logic tests pass; strict reuse on the model-picker route reports
8/275 modules (2.9%) and 1,774/57,714 lines (3.1%), up from 5/272 and
1,394/57,300, boundary hash unchanged; zero new unsupported CSS utilities.
Renderer bundle is 2,256.3 kB (-2.0 kB).

### AR5.2 Settings surfaces (2026-08-01, complete)

Providers, Connections, Source Control, Beta, and Archive settings now compile
one physical composition per panel from
`apps/web/src/components/settings/SettingsSurfaces.tsx`. The module owns the
archived-thread group/row anatomy (`ArchivedThreadsSurface`), the Beta feature
row (`BetaSettingsSurface`), the source-control mark and discovery row
(`StatusDotSurface`, `SourceControlMarkSurface`,
`SourceControlItemRowSurface`), the access-inventory row
(`AccessListRowSurface`), and the provider instance card header
(`ProviderInstanceCardSurface`). Web's `ArchivedThreadsPanel`,
`BetaSettingsPanel`, `SourceControlSettings`, `ProviderInstanceCard`, and
`ConnectionsSettings` (pairing-link and client-session rows) render the same
surfaces as the Lynx `ProviderSettings` and `OtherSettings` panels; behavior
hosts keep their authority (unarchive, settings writes, rescan, revoke,
enable toggles, provider config forms) and platform controls enter as nodes.
The Lynx provider card's expanded model list stays a registered island; the
Web card keeps its Collapsible, version-advisory popover, and settings form in
the body slot. Keybindings stays an honest Lynx placeholder under R5 — no
keyboard hints without runtime acceptance.

Converged Lynx divergences, all toward the Web product: the provider card
drops its Lynx-only "Active" badge and header model count (selection lives in
the Composer pill), the source-control rows drop the Lynx-only status text
control and move Rescan into the section `headerAction` (Web anatomy), the
archive row description now reads `archivedAt ?? createdAt`/`createdAt` (was
`updatedAt`), and the Beta row shows the canonical copy with an honest-gap
status note ("The Lynx Sidebar v2 renderer has not moved yet…") in the shared
`status` slot instead of divergent description text.

Deletions: the clean-room provider-card header CSS and the source-control
status/rescan rules (`overrides.css` 3,531 → 3,455 lines). New rules are the
access-row device chip token passthrough with surface/gap/remove-when
comments; Web hover affordances for the two card classes and the chevron live
in `apps/web/src/index.css` (R6). Eleven focused `SettingsSurfaces` tests
cover the empty/group archive fixtures, Beta status and auto-settle slots,
mark tones, item-row ordering and muted state, access-row anatomy, and the
provider card header with its accessible expand button; 64 Web settings tests
and 65 Lynxtron tests pass. Strict reuse on the settings-providers product
surface reports 13/294 modules (4.4%) and 2,077/62,015 lines (3.3%), up from
11/293 and 1,730/61,695, boundary hash unchanged (`67f5a53f…`); three new
`:hover` occurrences are the Web-layer rules above. Renderer bundle is
2,280.1 kB (+23.8 kB: shared badge/switch/button leaves and the settings
surfaces). Runtime evidence: fresh 1280 × 820 captures of all five panels
against isolated seeded state report zero renderer errors
(`reports/screenshots/ar52-settings-{providers,connections,source-control,beta,archive}-1280x820.jpg`);
the providers card renders the real Claude instance summary, the connections
row renders the live "This device" session, and the source-control row renders
the detected Git integration through the shared surfaces.

### AR5.3 Plan and right-panel chrome (2026-08-01, partial: chrome and plan)

The plan panel and the right-panel chrome now compile shared physical
compositions. `apps/web/src/components/PlanSurface.tsx` owns the plan
explanation paragraph, the Steps section label and status rows (status colors
and completed strikethrough included), the proposed-plan disclosure section,
and the empty state; `apps/web/src/components/RightPanelSurface.tsx` owns the
tab row anatomy (icon, truncated title, active/pending treatments, close
affordance) and the empty-state card grid with its canonical copy. Web's
`PlanSidebar` content and `RightPanelTabs` tabs and empty state render the
same surfaces as the Lynx `PlanPanel` and `RightPanel`. Web keeps its
behavior hosts: tab context menus, middle-click close, full-title tooltips,
disabled-card reason tooltips, and the plan action menu. The proposed-plan
markdown body stays a platform renderer island (Web ChatMarkdown; Lynx now
MarkdownRenderer instead of raw text). Because hover selectors never fire on
Lynx (R6), the tab surface takes a `closeVisible` prop so the close
affordance stays visible without hover.

Converged Lynx divergences, both toward the Web product: the right-panel add
catalog is now the Web four-entry set with Browser and Terminal as disabled
registered placeholders carrying honest reasons, and Plan no longer appears
in the add menu or empty state — it opens through the proposed-plan product
flow, as on Web. Deletions: the clean-room tab, empty-state, and plan-panel
CSS (`overrides.css` 3,455 → 3,282 lines); new rules are glyph-leaf
passthroughs and the disabled-menu-row treatment with
surface/gap/remove-when comments. Thirteen focused surface tests cover tab
anatomy, pending and hoverless close states, empty-grid disabled cards, plan
step treatments, and the proposed-plan disclosure; 65 Lynxtron tests pass.
Strict reuse on the existing-thread-transcript route reports 39/521 modules
(7.5%) and 8,561/114,426 lines (7.5%), up from 37/519 and 8,273/114,227,
boundary hash unchanged (`67f5a53f…`). Renderer bundle is 2,280.9 kB (+0.8
kB). Runtime evidence: tap-driven DevTool captures at 1280 × 820 against
isolated seeded state report zero renderer errors for the converged empty
state (four cards with disabled placeholders) and the open Diff tab
(`reports/screenshots/ar53-right-panel-{empty,diff}-1280x820.jpg`). The plan
surface's markdown island is build- and audit-verified through the registered
transcript island; an active-plan fixture remains follow-up evidence. The
changed-files tree, diff chrome, and files panel stay in AR5.3's remaining
scope.

### AR5.3 File trees and diff rows (2026-08-01, complete)

The changed-files and workspace tree rows now compile one physical
composition. `apps/web/src/components/chat/FileTreeSurface.tsx` owns the tree
row anatomy (8 + depth × 14 indentation rhythm, directory rows with rotating
chevron, folder icon, name, and trailing stats; file rows with leading
spacer, icon, name, stats, and selected treatment), and `DiffStatLabel` moved
onto host elements so both renderers compile it. Web's `ChangedFilesTree`
(transcript card and expanded tree) keeps its expansion state machine,
scroll-anchor ignore, and PierreEntry/lucide leaves while rendering the same
rows as the Lynx `DiffPanel` and `FilesPanel`. The Lynx diff tree gains the
Web's directory collapse interaction (was always-expanded) and the shared
stat label (was Lynx-only addition/deletion text); the Lynx files tree keeps
its host expansion and selection state on the shared rows. The Lynx diff
panel's scope strip, checkpoint summary, and R10 runtime note stay honest
host chrome around the registered full-patch-renderer gap; the Web
`DiffPanel` git-source workspace and `FileBrowserPanel` virtualizer remain
Web-only adoption targets for a later slice.

Deletions: the clean-room diff/files tree CSS (`overrides.css` 3,282 → 3,187
lines); the only new rule is the tree chevron glyph leaf with
surface/R1/remove-when comments. Seven focused `FileTreeSurface` tests cover
row anatomy, indentation rhythm, rotation, selected and spacer treatments,
and the non-interactive row case; 38 Web chat tests (including
ChangedFilesTree and MessagesTimeline) and 65 Lynxtron tests pass. Strict
reuse on the existing-thread-transcript product surface reports 40/471
modules (8.5%) and 8,489/104,230 lines (8.1%), up from 38/470 and
8,298/104,090, boundary hash unchanged (`67f5a53f…`). Renderer bundle is
2,282.1 kB (+1.2 kB). Runtime evidence: a tap-driven 1280 × 820 capture opens
the Files tab through the converged empty-state grid and renders the real
16,340-file workspace tree through the shared rows with zero renderer errors
(`reports/screenshots/ar53-files-panel-1280x820.jpg`).

### AR5.5 Root route composition and overlay ownership (2026-08-01, complete)

The chat route's outer anatomy is now one physical composition.
`apps/web/src/components/ChatRouteSurface.tsx` owns the root surface, the
main column (header slot, banner slot, body row with the relative chat
column), the column's maximized-away collapse, and the full-height right
panel as a root-level sibling. Web's `ChatView` consumes it with its
workspace topbar, thread error banner, terminal drawers, inline/sheet right
panel modes, and expanded-image overlay in the named slots; the Lynx
`ChatView` consumes it with its chat topbar, timeline island, and Composer.
The Lynx right panel moves from a prototype position below the header to the
Web anatomy — full height beside the column; measured runtime geometry
confirms the header spans exactly the chat column (684 px) and the panel
runs 340 × 820 beside it. Overlay ownership was already correct on Lynx
(root-mounted, state-driven `RootOverlays` for QuickSwitch and the model
picker, with copy and ordering converged in AR5.1), so it is unchanged.

Deletions: the prototype `main-pane`, `chat-body`, and `chat-body-row`
chrome (`overrides.css` 3,187 → 3,162 lines). Three focused
`ChatRouteSurface` tests cover anatomy ordering, the default flexible
column, and the maximized collapse; 45 Web chat tests (ChatView.logic and
MessagesTimeline) and 65 Lynxtron tests pass; the Web production build is
clean. Strict reuse on the existing-thread-transcript route reports 42/522
modules (8.0%) and 8,817/114,566 lines (7.7%), up from 41/521 and
8,752/114,426, boundary hash unchanged (`67f5a53f…`). Renderer bundle is
2,277.6 kB (+0.3 kB). Runtime evidence: a tap-driven 1280 × 820 capture
opens the right panel on the chat route with zero renderer errors
(`reports/screenshots/ar55-chat-route-right-panel-1280x820.jpg`).

AR5 exit review: no ordinary clean-room screen remains reachable from Lynx
navigation — chat route, transcript, Composer, model picker, quick switch,
all settings panels, and the right panel consume shared physical
compositions. Every remaining Lynx-exclusive component is a root adapter
(`index.tsx` RootSwitch, `ChatView` host), a capability (`Icon`/`iconData`,
`clientCapabilities`), a primitive (`SettingsControls`), or a registered
hard island (native list host, Markdown island, Composer editor kernel, R5
keybindings placeholder). Settings mutations keep their client/server
authority; both panel stacks run the shared `panelSurfaces` state machine;
`overrides.css` carries only chrome and commented leaf/island rules.

## AR6 certification (2026-08-01)

### Evidence battery

All captures ran against the packaged `dist/desktop` artifact (the same
binary `pnpm run start` ships), so every row doubles as packaged-application
smoke; each reports zero renderer errors at capture time.

| Viewport | State                             | Evidence                                                                                                 |
| -------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1280×820 | empty (new-thread hero)           | `ar0-baseline-1280x820.jpg` (AR0), re-verified through AR5 captures                                      |
| 1440×900 | empty (new-thread hero)           | `ar6-new-thread-1440x900.jpg`                                                                            |
| 1280×820 | populated (settings, real data)   | `ar52-settings-{providers,connections,source-control,beta,archive}-1280x820.jpg` (AR5.2)                 |
| 1440×900 | populated (settings providers)    | `ar6-settings-providers-1440x900.jpg`                                                                    |
| 1280×820 | populated (files, 16,340 entries) | `ar53-files-panel-1280x820.jpg` (AR5.3)                                                                  |
| 1280×820 | populated (right panel, tabs)     | `ar53-right-panel-{empty,diff}-1280x820.jpg` (AR5.3), `ar55-chat-route-right-panel-1280x820.jpg` (AR5.5) |
| 1280×820 | loading (source-control scan)     | `ar6-settings-loading-1280x820.jpg`                                                                      |
| 1280×820 | streaming + interrupted           | `ar3-transcript-1280x820.jpg`, `ar4-composer-1280x820.jpg` (AR3/AR4, surfaces unchanged by AR5)          |
| 1280×820 | reconnecting (server killed)      | `ar6-chat-reconnecting-1280x820.jpg`; see finding below                                                  |
| 1280×820 | destructive confirmation          | `ar6-settings-restore-confirmation-1280x820.jpg` ("Restore default settings? This will reset: …")        |
| light    | any                               | **not capturable — R13** (dark-only token pipeline, registered in AR6)                                   |

Same-snapshot content checks: every capture's measurement sidecar pairs the
Web and Lynx selectors per anchor and records the live text (provider card
with the real Claude instance summary, access row with the live "This
device" session, workspace tree with real entries, restore dialog copy), so
content parity is inspectable per anchor rather than asserted.

Reconnecting finding: killing the embedded server (`[srv] exited code=130`)
leaves the renderer alive with zero errors; the main-owned connector
attempts recovery and logs `connect failed: t3 server process exited before
becoming ready`, and the Composer stays disabled while the status is not
`ready`. Unlike Web, the Lynx chat header has no visible connection-state
label — `connectionStatus` is plumbed but unrendered. Registered as a
product-gap follow-up; it does not change the classification.

### Final reuse and deletion report

Strict denominator unchanged for the whole AR series (boundary hash
`67f5a53f…`). Product-surface reuse, AR0 baseline → AR6:

| Screen                     | AR0                        | AR6                        |
| -------------------------- | -------------------------- | -------------------------- |
| app-shell-sidebar          | 22/329 (6.7%), 3,369 lines | 22/329 (6.7%), 3,369 lines |
| new-thread-empty           | 32/464 (6.9%), 7,148 lines | 41/472 (8.7%), 8,554 lines |
| existing-thread-transcript | 32/464 (6.9%), 7,148 lines | 41/472 (8.7%), 8,554 lines |
| composer                   | 17/430 (4.0%), 4,947 lines | 26/438 (5.9%), 6,353 lines |
| model-picker               | 5/272 (1.8%), 1,394 lines  | 8/275 (2.9%), 1,774 lines  |
| settings-providers         | 11/291 (3.8%), 1,730 lines | 13/294 (4.4%), 2,077 lines |

Prototype deletion, AR0 → AR6: `overrides.css` 3,947 → 3,162 lines (-785,
≈20% retired); `preload.js` 8,453 → 4,847 bytes (AR2); reachable Lynx-owned
product modules in `src/app/components/` 20 → 19, with every remaining
module reclassified as root adapter, capability, primitive, or registered
hard island (AR5 exit review). Deleted clean-room compositions by owner:
provider-card header CSS (AR5.2), source-control status/rescan (AR5.2),
right-panel tabs/empty state (AR5.3a), plan-panel rows (AR5.3a), diff/files
trees (AR5.3b), SidebarBrand (AR5.4), main-pane/chat-body chrome (AR5.5).
Physically shared composition modules added: SettingsSurfaces, PlanSurface,
RightPanelSurface, FileTreeSurface, ChatRouteSurface (plus ModelPickerSurface
and CommandPaletteSurface in AR5.1). Renderer bundle 2,081.1 → 2,277.6 kB
(+196.5 kB across the whole AR series; ≈78 kB traced to the raster icon set
in AR3, the rest is shared product composition now compiled into the Lynx
bundle — the price of deleting the second implementation).

### Release classification

**`chat-first-preview`**. Evidence: chat, transcript, Composer, settings,
and navigation all work on shared compositions over the main-owned push
transport (AR1/AR2 proved and cut over), so the port is not an
`experimental-host`. It is not an `electron-replacement-candidate`: R5
(renderer keyboard; bounded native-menu shortcuts pass physical acceptance,
but selection and the remaining focus/shortcut matrix stay open), R11
(async bundle URLs rejected upstream; the eager main bundle is the current
mitigation), and the new R13 (light theme) remain open, and real
focus/drag/selection acceptance still requires an authorized user session
(R5/R12).

Open runtime gaps and removal conditions are tracked per ID in
`compat-matrix.md` (R1–R13; R3 closed for the T3 architecture in AR2).

## Session handoff (2026-08-01, after AR6)

- Plan 10 is complete: AR0–AR6 all `completed`. Branch `lynxtron-port`,
  pushed to `lynxtron/lynxtron-port`. This session: AR5.2 (`6cd7b0fe7`),
  AR5.3 (`07356b977`, `26103dc9c`), AR5.4 (`6cf72ad39`), AR5.5 (`66946da90`),
  AR6 (this commit).
- Release classification: `chat-first-preview` (see the AR6 section for the
  evidence matrix and the deletion/reuse finals).
- Outstanding user-session work: the remaining keyboard/focus matrix (R5) and
  non-Sidebar drag/selection acceptance (R8/R12) stay `pending-user-session` and need an
  authorized interactive session; R11 needs the upstream bundle-URL fix;
  R13 (light theme) needs the two-theme CSS pipeline.
- Follow-ups worth scheduling: visible connection-state treatment in the
  Lynx chat header (Web parity); an active-plan fixture capture for the plan
  surface's markdown island.
- Processes/ports: none left running (all Lynxtron app instances from capture
  runs were stopped by tracked PID; the unrelated `synara` worktree instance
  was never touched).
- Temporary fixtures: `/tmp/t3code-ar52-settings.770L6Q` (seeded state,
  snapshot `ed69ad13…`), `/tmp/ar53-tap-point.mjs`, `/tmp/ar5*-capture*.sh`
  capture drivers. Repo-tracked capture specs live in
  `apps/lynxtron/scripts/visual-measurement-spec.*.json`.

### AR5.4 Sidebar state and behavior hosts (2026-08-01, complete)

The Sidebar composition was already physically shared before this slice:
`apps/web/src/components/AppSidebarLayout.lynx.tsx` is a 44-line host shell
that renders the full Web `Sidebar`/`SidebarV2` compositions, the
`ui/sidebar.lynx.tsx` and `sidebarPersistence.lynx.ts` leaves cover the
platform primitives, the Lynx `ChatHeader` consumes `ChatHeaderSurface`, and
both panel stacks run the same
`packages/client-runtime/src/state/panelSurfaces.ts` state machine
(`createEmptyPanelSurfaceState`) with its open/activate/close/fallback/hidden
tests. What remained duplicated was the prototype `SidebarBrand` header: the
Lynx settings nav rendered a Lynx-only brand backdrop that has no counterpart
in the Web settings nav. The settings route host now matches Web (no brand
header) and `SidebarBrand.tsx` (79 lines) plus its root CSS rule are deleted;
the converged `SidebarStageBackdrop` art still renders through the shared
`SidebarChrome` in the main shell. Renderer bundle is 2,277.3 kB (-4.8 kB).
Runtime evidence: a fresh 1280 × 820 capture of the settings route reports
zero renderer errors with the nav reading the canonical section list
(`reports/screenshots/ar54-settings-nav-1280x820.jpg`).

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
