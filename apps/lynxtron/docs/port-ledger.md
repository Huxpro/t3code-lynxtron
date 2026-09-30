# Port ledger

> **Plan 14 authority notice (2026-09-29).** Current status lives in
> [Plan 14](./plans/14-journey-driven-shared-source-convergence.md) and its
> phase files; the M7 certification summary is the latest evidence boundary.
> Entries below are history unless Plan 14 restates them.

> **Plan 11C authority notice (2026-08-04).** This ledger records implemented
> layers and historical verification. It does not certify current visual or
> interaction fidelity. Current evidence policy and execution order live in
> [`harness/current-state.md`](./harness/current-state.md) and
> [`plans/11c-synara-harness-reset-and-gap-prioritization.md`](./plans/11c-synara-harness-reset-and-gap-prioritization.md).
> Plan 11C H5-H8 are complete. Current reuse, residual and bounded priority
> dispositions live in the historical generated `reports/reuse/plan11c.json`
> input (not committed in final5), `gap-atlas.md`,
> `next-port-priorities.md` and `harness/completion-audit.md`.

States: `unassessed`, `layered`, `in-progress`, `visual`, `functional`,
`placeholder-approved`, `blocked-runtime`. Every component keeps its upstream
name so this table can be diffed mechanically.

T5-F1 worktree protection completed on 2026-07-27. The exact detached HEAD,
dirty-manifest hash, ownership split, generated/disposable artifacts, existing
verification, and all deleted-Web-module replacements are recorded in
[`plans/worktree-baseline.md`](./plans/worktree-baseline.md). T5-F2 dependency
and reuse reporting is complete in [`reports/reuse/`](../reports/reuse/).
The strict product-surface baseline is currently 1.8%–4.0% by module and
2.2%–3.4% by line, so no 70% screen reuse gate is claimed. T5-F3 matched
Electron/Web ↔ Lynx DevTool capture automation is complete at 1280 × 820 and
1440 × 900. T5-F4 is complete with ten `.web`/`.lynx` Settings primitive
pairs, 37 generated Web-owned tokens, focused audits/tests, isolated Web
interaction, and a zero-error real Lynx DevTool Settings capture. T5-F5 is
complete: the shared General feature panel passes 75% module / 73.4% line
reuse, the complete route passes 71.4% module / 70.1% line reuse, and all eight
Electron/Web ↔ Lynx DevTool viewport/state variants pass the measured fidelity,
content/state, and interaction gates. The authoritative report is
[`certification.md`](../evidence/2026-07-28/T5-F5/settings-general/certification.md).
T6-C1 App shell, header, and Sidebar is active.

The current UI-first decision uses Tailwind CSS v3 plus
`@lynx-js/tailwind-preset` for Lynx while preserving Web's Tailwind v4 build.
Code/editor, terminal, and embedded-browser internals use approved placeholders.
Global keyboard support and the complete native `<list>` chat surface remain
required high-priority outcomes.

| Upstream surface               | Layer | State                | Lynx implementation / note                                                                                                                                                                                                                                                   |
| ------------------------------ | ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatView                       | L3    | functional           | canonical thread snapshots plus shared session busy view-model                                                                                                                                                                                                               |
| Sidebar                        | L3    | functional           | shared shell/chrome/projects composition; canonical create/rename/archive/delete/select verified through distinct Lynx DevTool hit regions and persisted projections                                                                                                         |
| ChatHeader                     | L3    | functional           | thread title and panel controls                                                                                                                                                                                                                                              |
| MessagesTimeline               | L3    | functional           | shared `TranscriptRowSurface` row anatomy + projection; native `<list>` host owns recycling/scroll/follow; real scroll-gesture acceptance deferred under R12                                                                                                                 |
| Composer                       | L3    | functional           | shared `ComposerSurface` chrome (shell/frame/footer/toolbar/strip/hero); native textarea kernel and control pills as Lynx islands; canonical modes/options/context/sendability                                                                                               |
| ModelPicker                    | L3    | functional           | shared catalog, selection fallback, search ranking, and ordering from canonical providers                                                                                                                                                                                    |
| QuickSwitch                    | L3    | functional           | canonical projects/threads plus shared query parsing, ranking, time labels, navigation                                                                                                                                                                                       |
| ChatMarkdown                   | L3    | in-progress          | shared fence/list/inline/file-link projection; host copy/navigation; full AST remains                                                                                                                                                                                        |
| settings/general               | L3    | functional           | T5-certified shared 17-row composition and route/restore state; canonical client/server persistence; two viewports and four lifecycle states pass                                                                                                                            |
| settings/providers             | L3    | functional           | canonical live status plus persisted instance enable/disable settings                                                                                                                                                                                                        |
| settings/keybindings           | L3    | in-progress          | visible inventory exists; R5 host/native global-key bridge and verified shortcut matrix are high priority                                                                                                                                                                    |
| settings/source-control        | L3    | functional           | canonical VCS/provider discovery, shared status projection, and real rescan                                                                                                                                                                                                  |
| settings/connections           | L3    | in-progress          | canonical access inventory + create/revoke actions; remote environment catalog remains                                                                                                                                                                                       |
| settings/beta                  | L3    | in-progress          | canonical Sidebar V2 preference persists; reachable V2 now uses a main-bundle `.lynx` state host plus shared row composition, avoiding the eager snapshot failure and R11 lazy loader; top controls, settlement actions, paired Electron evidence, and 70% reuse remain open |
| settings/archive               | L3    | functional           | restore/delete archived threads                                                                                                                                                                                                                                              |
| PlanSidebar / ProposedPlanCard | L3    | functional           | live plan snapshots plus shared title/follow-up/export presentation                                                                                                                                                                                                          |
| DiffPanel                      | L3    | in-progress          | canonical turn checkpoints + shared file tree/stats; full patch renderer is R10                                                                                                                                                                                              |
| FilesPanel                     | L3    | in-progress          | shared tree/save state + live list/read/write RPC; code/editor content uses the approved placeholder                                                                                                                                                                         |
| RightPanel                     | L3    | functional           | panel state and navigation                                                                                                                                                                                                                                                   |
| ThreadTerminalDrawer           | L3    | placeholder-approved | canonical tab/chrome/state with an explicit terminal placeholder; xterm/canvas internals are out of scope                                                                                                                                                                    |
| ComposerPromptEditor           | L3    | placeholder-approved | composer chrome/state/send semantics remain required; rich Lexical editing core uses an explicit placeholder                                                                                                                                                                 |
| preview/browser                | L3    | placeholder-approved | canonical tab/chrome/state with an explicit browser placeholder; embedded web runtime is out of scope                                                                                                                                                                        |
| cloud/auth                     | L3/L4 | unassessed           | excluded from initial local-client milestone                                                                                                                                                                                                                                 |

## Shared layers

| Area                         | State       | Evidence                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| contracts                    | functional  | bridge and connector expose canonical `@t3tools/contracts` shell/thread/message/activity types                                                                                                                                                                                                                                                               |
| Effect RPC                   | functional  | connector uses patched workspace Effect                                                                                                                                                                                                                                                                                                                      |
| effect-atom React hooks      | functional  | the live client state is an Effect `Atom` hosted by `AtomRegistry`; the former probe and `useT3Connection` singleton are removed                                                                                                                                                                                                                             |
| shell/thread reducers        | functional  | connector calls shared `applyShellStreamEvent` and `applyThreadDetailEvent`                                                                                                                                                                                                                                                                                  |
| thread sorting               | functional  | connector calls shared `sortThreads`                                                                                                                                                                                                                                                                                                                         |
| plan presentation            | functional  | Web and Lynx share active/proposed snapshots plus title, preview, follow-up, thread-title, and export projections                                                                                                                                                                                                                                            |
| time presentation            | functional  | web wrappers and three Lynx surfaces call shared deterministic formatters                                                                                                                                                                                                                                                                                    |
| session presentation         | functional  | web delegates phase/settled logic and Lynx delegates busy state to `presentation/session`                                                                                                                                                                                                                                                                    |
| composer presentation        | functional  | Web and Lynx share prompt cleanup, valid terminal-context filtering, attachment sendability, and expired-context counts                                                                                                                                                                                                                                      |
| sidebar presentation         | in-progress | web and Lynx share blocker/session/plan/completion status plus the complete Sidebar V2 card/slim row composition; the V2 top controls and host actions still differ                                                                                                                                                                                          |
| model-picker presentation    | functional  | Web and Lynx share model keys, catalogs, valid-instance/default fallback, fuzzy ranking, favorite grouping, and provider ordering                                                                                                                                                                                                                            |
| command-palette presentation | functional  | Web and Lynx share query parsing plus title-first/context-second ranking; Lynx supports `>` actions-only search                                                                                                                                                                                                                                              |
| markdown presentation        | in-progress | Web and Lynx share fence/list/task mutation/inline/file-link/path projection; tables and nesting remain host-specific                                                                                                                                                                                                                                        |
| diff presentation            | in-progress | Web and Lynx share checkpoint file stats, normalized compact trees, scope summaries, previews, and auto-expansion; full patch is R10                                                                                                                                                                                                                         |
| file-browser presentation    | functional  | Web and Lynx share entry counts/tree paths/cache revisions/task mutation; Lynx adds the normalized tree over canonical list/read RPCs                                                                                                                                                                                                                        |
| file-save state              | functional  | Web and Lynx share debounce, serialized writes, pending/confirmed state, flush, and dispose semantics over canonical write RPCs                                                                                                                                                                                                                              |
| source-control presentation  | functional  | Web and Lynx share VCS/provider readiness, badges, status tones, and summaries over canonical discovery                                                                                                                                                                                                                                                      |
| connections presentation     | functional  | Web and Lynx share access-inventory ordering, timestamps, client labels/device details, live state, and counts                                                                                                                                                                                                                                               |
| auth-access state            | functional  | both clients consume `subscribeAuthAccess` through the shared stream reducer; Lynx host emits credential-free projections                                                                                                                                                                                                                                    |
| provider presentation        | functional  | Web and Lynx share instance projection, settings overlay, status copy, sorting, and model derivation                                                                                                                                                                                                                                                         |
| provider settings            | functional  | shared migrate-on-write patch; Lynx calls `server.updateSettings`, then reconciles canonical config                                                                                                                                                                                                                                                          |
| settings presentation        | in-progress | Web and Lynx share the canonical General hierarchy, grouping/restore projections, core controls, and schema-free defaults; a dedicated Web host retains background activity, model picker, live diagnostics, and update controls without a second General implementation, while Lynx writes canonical server settings and labels those unsupported host gaps |
| settings appearance          | in-progress | Web and Lynx share the complete Appearance section/row composition and exact route/content pairing; Lynx labels theme, opacity, identification, and wrap controls unavailable until PF7 certifies their runtime behavior                                                                                                                                     |
| settings primitive contract  | functional  | ten `.web`/`.lynx` leaves share import/prop paths; 37 Web-owned tokens generate unchanged; R6/R7/R9 own host differences                                                                                                                                                                                                                                     |
| server config projection     | functional  | connector subscribes to `subscribeServerConfig` and applies shared `applyServerConfigProjection`                                                                                                                                                                                                                                                             |
| platform UI capabilities     | functional  | shared interfaces + `.web`/`.lynx` storage, clipboard, connectivity, keyboard, media-query, and navigation implementations                                                                                                                                                                                                                                   |
| client state host            | functional  | live Lynx server state uses Effect Atom fed by the main-owned sequenced push protocol (AR2); the 400 ms preload polling adapter is removed                                                                                                                                                                                                                   |
| renderer UI state            | functional  | model picker, quick switch, and right-panel state share the app `AtomRegistry`; four listener-based stores were removed                                                                                                                                                                                                                                      |
| panel surface state          | functional  | Web and Lynx share ordered open/activate/close/fallback/visibility transitions; hosts own surface payloads and persistence                                                                                                                                                                                                                                   |
| local preference state       | functional  | storage stays host-backed while renderer invalidation uses `AtomRegistry` instead of a listener singleton                                                                                                                                                                                                                                                    |
| route definitions            | functional  | TanStack core shared; thread and draft routes are parameterized                                                                                                                                                                                                                                                                                              |
| isolated preference fixtures | functional  | preload preference storage follows `T3_LYNXTRON_BASE_DIR`; default user storage remains unchanged and focused tests cover both paths                                                                                                                                                                                                                         |

## Runtime verification

On 2026-07-27 isolated Lynxtron runs created a thread, sent a prompt, received
the assistant response, and rendered the resulting work-log events. The sidebar
title and shared relative-time label updated from the same canonical shell
stream. A second run after the UI-state migration opened and closed the quick
switch, model picker, and right panel before completing another prompt. This
exercises the shared shell reducer, thread reducer, sorting, plan projection,
and app-wide Effect Atom host in the real renderer rather than through a
build-only probe. The session/sidebar presentation extraction retains those
checks as its integration gate. Its focused tests and Web integration pass
verified the new `Working` → ready transition. A fresh Lynxtron process and
backend also booted successfully. Lynx DevTool now captures the renderer
without macOS Screen Recording permission, closing the former tooling gate.
The status-specific `Working` → ready screenshot pair itself remains pending;
the green build is not being used as a substitute for that visual evidence.
The Provider/model extraction also passed an isolated Web run. The Providers
page rendered canonical installation, authentication, version, and error
states; enabling and restoring Cursor persisted through the settings command
and updated immediately. The typo query `fble` resolved only Claude Fable 5,
and a `codex` query crossed the selected Claude rail to return Codex models in
shared rank order. The current Lynx binary, server, and connector booted with
the canonical config subscription. A fresh production empty-Composer capture
has zero DevTool renderer errors, while a same-snapshot Provider-screen pair
remains pending.

The command-palette extraction passed a separate isolated Web interaction pass:
project-title search returned the canonical project row, `preferences` matched
the settings action, `>settings` restricted results to actions, and both thread
title and an explicit fixture branch matched the same canonical thread row. The
fixture lived only in the isolated test database.

The panel-state extraction passed its shared reducer, Web store, and Lynx host
tests together. A fresh Web production build and dev-module transform resolved
the new package export, and the Lynx production build completed at 1,210.4 kB.
The later preference/pathname Atom migration also passed the ReactLynx scanner
and both Lynx TypeScript programs.

The canonical model-selection projection passed a focused isolated Web
interaction on 2026-07-27. General settings initially selected
`GPT-5.6-Luna`; after disabling its Codex instance, the selection changed to
`Claude Fable 5` instead of carrying the old GPT slug into Claude. The shared
projection, Web adapter, and Lynx Atom host passed their focused tests and all
three affected TypeScript programs. Fresh Web and Lynx production builds also
passed; the Lynx bundle is now 1,212.1 kB.

The first Markdown presentation extraction passed seven focused projection
tests and a fresh isolated Web interaction. Both the authored and assistant
code fences rendered `shared-fence.ts` as their code-block title with the code
body intact, and no `chat-markdown` console error was reported. Web and Lynx
production builds passed; the Lynx bundle is 1,213.9 kB. The Lynx renderer
scanner reported zero issues. DevTool capture is now available; a
same-snapshot Markdown fixture pair remains pending.

The follow-up list extraction expanded the shared Markdown module to five pure
functions and thirteen focused tests. An isolated Web message rendered
`Alpha/Beta` as an ordered list and projected checked/unchecked task markers to
their exact source offsets, `19` and `32`, with no Markdown console error.
Lynx now renders ordered ordinals and `☑`/`☐` task state from the same parser.
Both production builds passed; the Lynx bundle is 1,213.8 kB.

The Markdown link/interaction extraction moved Web's complete 213-line private
file-link projection into `client-runtime`, lifted three path helpers into a
second shared module, and added renderer-neutral inline spans. Thirty-nine
focused Markdown/path/Web compatibility tests passed. In a fresh isolated Web
fixture, relative links became the correct absolute worktree targets, the
`shared-link.ts` fence title remained intact, code copy changed to `Copied`, and
activating `markdown.ts · L1` opened the internal file preview with the real
source. Lynx resolves the same link metadata from the active thread worktree,
opens files/external URLs through its preload shell adapter, and exposes code
copy through the shared clipboard capability. Both production builds, all
affected TypeScript programs, API/CSS audits, and the ReactLynx scanner passed;
the Lynx bundle is 1,266.4 kB. The isolated state was retained for repeatable
inspection while its browser tabs and dev server were stopped.

The changed-files extraction moved Web's tree/stat and compact-preview
projections into a six-function shared module with eight focused projection
tests. The existing Web tree interaction suite passed against the shared
module. In a fresh isolated Web run, a real completed turn projected one
checkpoint file with `+1/-0`; the compact card, `apps/lynxtron` directory, and
leaf `.t3-diff-view-model-check` all rendered and expanded correctly. No
changed-files console error occurred (the only warning was the pre-existing
Legend List recycling notice). The disposable marker, browser tab, server, and
test state were removed afterward. Web and Lynx production builds passed,
ReactLynx scanning reported zero issues, and the Lynx bundle is 1,223.3 kB.
Lynx now receives the same checkpoint array through its host bridge and renders
the shared tree; a same-snapshot changed-files fixture pair remains pending.

The file-browser extraction added three focused projection tests and retained
the Web project-query test. A self-contained connector run against a fresh
server/state directory listed 6,974 entries and read `package.json` through the
new host methods, returning the expected `@t3tools/monorepo` package without
truncation. A separate isolated Web interaction rendered 6,079 indexed files
and filtered the tree to sixteen visible `package.json` rows with no console
warnings or errors. Both temporary servers, browser state, and test directories
were removed afterward. Web/Lynx builds, all three TypeScript programs, CSS/API
audits, and the ReactLynx scanner passed; the Lynx bundle is 1,238.6 kB.

The file-editing follow-up moved Web's debounce/in-flight save coordinator,
Markdown task mutation, and cache-revision helpers into `client-runtime`.
Eighteen focused Files tests passed. A fresh connector/backend run used
`projects.writeFile` to create a nested file, read the exact contents back
without truncation, rejected a `../` escape without leaking submitted contents,
and released its port after disposal. In a separate isolated Web interaction,
the Files surface listed and opened `nested/editable.md`; deleting its contents
through the Pierre editor persisted the 0-byte revision through the shared
500 ms coordinator and canonical write command. The browser tab, dev server,
and disposable test state were stopped or removed afterward. Both production
builds, all affected TypeScript programs, API/CSS audits, and four ReactLynx
source scans passed with zero issues; the Lynx bundle is 1,273.4 kB. Lynx line
annotations remain explicitly gated by the R8 Selection API evidence.

The source-control extraction added four focused projection tests. A fresh
self-contained connector run reached `ready` and returned canonical Git,
Jujutsu, GitHub, GitLab, Azure DevOps, and Bitbucket discovery records through
the new host action. In a separate isolated Web run, the Source Control settings
page rendered those six rows with the expected available, coming-soon,
authenticated, missing, and unauthenticated states; the Rescan action completed
and preserved the canonical result. The connector and Web servers released
their ports afterward. All three TypeScript programs, CSS/API audits, the
ReactLynx scanner, and both production builds passed; the Lynx bundle is
1,246.4 kB. DevTool capture is now available; a same-snapshot Source Control
pair remains pending.

The first Connections extraction added three presentation tests and retained
the two shared auth-stream reducer tests. A fresh connector/backend run received
one current, connected `T3 Code Lynxtron` client with eight scopes from
`subscribeAuthAccess`; its projected renderer payload contained no pairing
credential. A follow-up mutation run created and revoked a pairing link,
consumed another link to create a second client, revoked that client
individually, created one more client, and revoked all other clients while
preserving the current session. All stream counts converged and no credential
entered the inventory projection. The connector released its ports afterward.
A separate isolated Web run rendered the loopback-only Connections page and
remote-environment section. That browser session correctly lacked
`access:write`, so the Web host did not render its authorized-client management
rail; the connector runs are the authoritative runtime evidence for the new
inventory and mutations. Both production builds, all three TypeScript programs,
CSS/API audits, and the ReactLynx scanner passed; the Lynx bundle is 1,254.4 kB.
Only the remote environment catalog/connection runtime remains explicitly in
progress on this settings surface.

The proposed-plan extraction moved Web's title, collapsed-preview, follow-up,
implementation-thread, filename, and export-content projections into an
eight-function shared module. Fourteen focused tests now exercise that module
directly. Web retains only the DOM download adapter, while Lynx PlanPanel uses
the same heading projection instead of a private regex. All affected TypeScript
programs, the ReactLynx scanner, and both production builds passed; the Lynx
bundle is 1,273.6 kB. This was a behavior-preserving Web re-export, so no new Web
interaction flow was introduced; a same-snapshot Plan surface pair remains
pending.

The General Settings extraction moved project-grouping and restore projection
into a five-function shared module and introduced schema-free canonical
defaults. An intermediate build proved that importing
`DEFAULT_CLIENT_SETTINGS` / `DEFAULT_SERVER_SETTINGS` into the Lynx renderer
pulled the complete Settings Schema graph into the bundle (1,459.2 kB). The
final renderer imports only plain defaults and erased contract types; its
production bundle is 1,283.3 kB. A real connector/backend smoke toggled and
restored `enableAssistantStreaming` through `server.updateSettings`, observing
eight config events. Twenty-five focused tests, four affected TypeScript
programs, both production builds, CSS/API audits, and eight ReactLynx scans
passed. In a fresh authenticated Web environment, Word wrap was disabled,
Restore defaults became enabled, the confirmation was accepted, and Word wrap
returned to checked while Restore defaults became disabled. Theme selection,
About/update actions, confirmation-dialog consumption, and Lynx Sidebar V2
rendering remain feature work; they are not mislabeled as runtime gaps.

The Composer extraction now shares sendability, runtime/interaction-mode
presentation and transitions, checkout/branch context, provider-option
projection, and turn dispatch state. Web consumes the same mode copy. Lynx
removed its invented effort label, hard-coded mode labels, `main` fallback, and
inert context chevrons. Its real controls dispatch canonical thread commands,
model options persist through `thread.meta.update`, and turn start uses the
target thread shell rather than `full-access/default` constants.

Twenty-seven focused tests, all affected TypeScript programs, CSS/API audits,
and zero-issue ReactLynx scans passed. An isolated connector/server run changed
the shell to `approval-required/plan` and restored
`full-access/default`. Splitting provider-option helpers into a schema-free
shared subpath recovered an accidental 1,747.3 kB renderer build to 1,295.3 kB.
A fresh authenticated Web pass switched Build to Plan and back, selected
Supervised, restored Full access, and reported no console errors using the same
shared presentation.
The first Electron-versus-Lynx empty-Composer pair is now captured through
Lynx DevTool. It exposed a roughly 34–45-pixel vertical offset caused by
centering the headline and card as one block. Lynx now mirrors Electron's
layout model by centering the card and absolutely positioning the headline
above it; a second zero-error DevTool pair verifies the correction. Font, icon,
radius, and texture differences remain. The pair used different server
snapshots, so the command smoke and exploratory images are not reported as T5
visual certification.
