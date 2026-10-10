# Lynxtron client architecture

How the Lynx client sits on top of upstream T3 Code. The layering was approved
on 2026-10-09; the current merge base is upstream `024d49520e`.

## Principles

1. **Upstream code stays upstream's.** The fork reads upstream files; it does
   not reshape them so they are easier to reuse. A merge should conflict only
   where the fork deliberately carries a product patch.
2. **Lynx is a client, like mobile.** It shares with Web through packages and by
   importing pure Web modules in place. Upstream's mobile app shares the same
   way. Web is the reference the Lynx client is compared against, not a second
   consumer of fork code.
3. **Run the upstream file; do not extract from it.** To share an upstream
   module, keep its shape and replace what it imports: a `.lynx` module of the
   same name and exports takes the place of the platform capability it uses.
   Extracting logic out of an upstream file is a permanent conflict. Replace a
   primitive or a hook before replacing the component that uses it.
4. **One exception: shell and logic in one file.** When nothing below a file
   can be replaced because it mixes the two, move the block to its own file
   without changing behavior, send that move upstream, and carry it as a
   listed patch until it lands.
5. **Every difference from upstream is named.** An edit to an upstream file is
   a listed patch with a reason. A fork file inside an upstream directory is
   recognizable by its name.
6. **Checks, not conventions.** Each invariant below is enforced by a script,
   a typecheck, or a test. A rule nothing checks is not an invariant.
7. **Looks and features change on purpose.** Structure can move without
   sign-off only when the Native battery and the frame set still match.
8. **Gates measure the product.** Typecheck, tests that run code, the build,
   the Native battery, and frames are the gates. Tests that assert on source
   text, reuse percentages, and per-screen scores are not; they were removed
   on 2026-10-09 because they failed on renames and passed on regressions.

## Layers

| Layer           | Paths                                                                                                   | Who changes it                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 0. Upstream     | `apps/web`, `apps/server`, `apps/desktop`, `apps/mobile`, `packages/*` except `lynx-logic`, root config | Upstream. The fork carries the patches in `upstream-patches.json`. |
| 1. Shared logic | Upstream packages, and upstream Web modules the Lynx bundle imports in place through the `~` alias      | Upstream. Lynx uses a module only if it compiles unmodified.       |
| 2. Lynx-owned   | `apps/lynxtron/**`, `packages/lynx-logic/**`, `*.lynx.ts(x)` files under `apps/web/src`                 | The fork. Nothing in layers 0 and 1 imports from here.             |

What lives where in layer 2:

- `apps/lynxtron/src/app`: the Lynx UI, its state, its stylesheet
  (`overrides.css`), routes, and platform capabilities.
- `apps/lynxtron/src/main`: the Lynxtron main process, its preload, and the
  connector that starts the server (see Client runtime).
- `packages/lynx-logic`: renderer-neutral logic the Lynx app and browser
  preview share: transcript, composer, sidebar and settings
  projections, keyboard resolution, thread dispatch, panel state.
- `apps/web/src/**/*.lynx.ts(x)`: modules the Lynx build resolves instead of
  the Web module of the same name, and Lynx-owned modules that sit next to the
  Web code they are composed with. The Web build and typecheck never see them.

## Client runtime

Upstream shares client state between Web and mobile through
`packages/client-runtime`. The Lynx client runs the same runtime in its own
thread, the way mobile does, and it is the only path between the app and the
server:

- `src/app/platform/connectionPlatform.ts` implements the runtime's ports for
  Lynx. The preload supplies a socket, fetch and UUIDs from Node; the main
  process supplies the address and bearer of the server. Cloud session, relay,
  DPoP, device identity and SSH report as unavailable.
- `src/app/state/upstream*.ts` read upstream's atoms and send commands through
  upstream's operations. Their values are applied to the client state in the
  shapes of `src/shared/connectorProtocol.ts`. While upstream is not
  connected a command fails, as it does in upstream's own clients.
- The main process keeps what only it can do
  (`src/main/desktop/connector.ts`, `mainConnectorHost.ts`): spawn the server
  or pair to an existing environment, exchange the bootstrap credential for
  the bearer, hand both to the renderer (`primaryConnection`), report its
  status, and restart the server on `reconnect`. It opens no connection to
  the server beyond those HTTP requests. Native dialogs, clipboard, menus,
  opening and resolving paths are the preload's.

A server the app owns and that has no project gets one for the launch
directory. The main process names the directory with the server's address
(`primaryConnection`), the renderer creates the project once upstream takes
commands (`src/app/state/startupProject.ts`), and the client is not ready
until that has finished or failed.

The status the client shows is resolved from the main process's status and
upstream's (`resolveClientStatus`). The main process is ready once the server
answers and it has the bearer; the client shows ready once upstream is
connected to that server, and until then shows what the main process last
said (starting, connecting). A failure the main process reports (the server
exited, reconnecting) is applied at once, never held behind upstream's
status: main knows first, and upstream's session can read as connected for
seconds after the server is gone. When upstream loses a server the main
process still has, the client shows reconnecting while upstream's supervisor
retries.

A reconnect starts a new server on another port with a new bearer. The main
process's ready status names that server's address; on it the platform port
emits the primary registration again and upstream's registry replaces the
connection.

The browser preview (`src/browser-preview`) does not run upstream's runtime.
Its connector hosts supply the client's state and take its commands over the
whole of `connectorProtocol.ts`, which is why the renderer still applies
host snapshots and events and can send every command to its host; the build
flag `__T3_LYNXTRON_WEB_PREVIEW__` chooses.

`T3_LYNXTRON_UPSTREAM_SHADOW=1` publishes a summary of upstream's connection
(phase, shell status, counts) on `globalThis.__T3_UPSTREAM_SHADOW__` for
DevTool and the gates.

## Invariants

| #   | Invariant                                                                                                            | Enforced by                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| I1  | An upstream file differs from the merge base only if `upstream-patches.json` lists it under `patches` with a reason. | `scripts/check-upstream-delta.mjs`                                            |
| I2  | A file the fork adds inside an upstream directory is named `*.lynx.ts(x)` or is listed under `additions`.            | `scripts/check-upstream-delta.mjs`                                            |
| I3  | The Web app typechecks and its tests pass without any fork file.                                                     | `apps/web` typecheck excludes `*.lynx.*`; Web tests match `*.test.ts(x)` only |
| I4  | Lynx typecheck, tests, and build resolve a module the same way: `.lynx` first, then the Web module.                  | `lynx.config.ts`, `src/app/tsconfig.json`, `vite.config.ts`                   |
| I5  | Lynx-owned tests under `apps/web` are named `*.test.lynx.ts` and run in the Lynx suite.                              | `apps/lynxtron/vite.config.ts` include list                                   |
| I6  | Tailwind for Lynx scans exactly what the Lynx bundle compiles.                                                       | `tailwind.config.mjs` content globs                                           |
| I7  | Nothing in `packages/client-runtime`, `contracts`, or `shared` is fork-only logic.                                   | I1 and I2: such a file would be an unlisted addition                          |

Known gap in I4: TypeScript tries `x.lynx.ts`, `x.ts`, `x.lynx.tsx`, `x.tsx`
in that order, so a Web `x.ts` beats a Lynx `x.lynx.tsx`. The bundler prefers
`.lynx` for both. A Lynx module must use the same extension as the Web module
it replaces.

## Carried patches

`apps/lynxtron/upstream-patches.json` lists 31 modified upstream files and 9
added files, each with its reason. They fall into four groups:

- **Server product fixes** that are not Lynx-specific (review roots, interrupt
  target, provider command reactor). They are marked "Upstream candidate";
  sending them upstream removes them from the list.
- **Lynx enablers** in packages: single-module exports, Schema-free constants
  so the Lynx bundle does not pull Effect Schema, the connection banner
  projection.
- **Harness hooks**: the `T3_TEST_*` hooks the Lynxtron capture scripts set.
- **Build configuration**: workspace settings, root scripts, and the two
  `apps/web` entries that let `.lynx` modules under `apps/web` resolve their
  dependencies and stay out of the Web typecheck.

A new patch needs a reason that names the problem it solves. "Makes reuse
easier" is not one.

The merge to `024d49520e` dropped the patches whose upstream file had been
rewritten or removed instead of porting them: the desktop local-environment
rendezvous and user-data override, the preview popup protocol restriction, the
CLI static-directory hook, and the provider fixes in `ProviderRuntimeIngestion`,
`ClaudeAdapter`, `ClaudeProvider` and `ProviderSessionReaper`. A fix that is
still needed comes back as a new patch with its own reason.

## What the Lynx bundle takes from `apps/web`

The Lynx bundle compiles 127 modules from `apps/web/src`: 112 `.lynx` modules
and 15 upstream modules imported in place. Eleven are logic
(`logicalProject.ts`, `worktreeCleanup.ts`, `lib/threadSort.ts`, and
`*.logic.ts` or helper modules); four are components compiled unmodified
(`chat/DiffStatLabel`, `ui/kbd`, `ui/separator`, `ui/label`; see "Frontend
shared layer"). Those 15 are the whole compile-time coupling to upstream Web
source. When upstream changes one, the Lynx build or typecheck fails and the fix
is on the Lynx side.

## Merging upstream

1. `git merge origin/main`. Conflicts are limited to the carried patches.
2. Install, then typecheck and build Lynx. Errors come from the packages and
   the in-place modules; fix the Lynx side.
3. Run `check-upstream-delta.mjs`, the Lynx tests, the Native battery, and the
   frame set against the pre-merge baseline.
4. List upstream Web files that changed and have a `.lynx` module of the same
   name. That list is the port backlog; it does not block the merge.
5. Before the PR merges, its description lists every dropped patch and every
   change a user would see, and the maintainer answers it. Open an issue for
   each dropped patch that might still be needed.

An upstream merge is one PR, merged with a merge commit. The steps between the
merge and a passing Lynx build cannot pass CI on their own, and a squash drops
the upstream parent: the next merge would then conflict on every file and the
recorded merge base would go stale. Everything else on this branch is
squash-merged.

### The merge of 2026-10-09

The fork merged upstream up to `024d49520e` (1,860 commits), the commit before
upstream's orchestrator rewrite. Conflicts were limited to the listed patches.
What the Lynx side had to follow:

- Settings that moved to the server: thread settle state
  (`settledOverride`), auto-settle days, and `responseStreamingMode`, which
  replaced the token-streaming switch.
- Defaults that changed: Cursor and Antigravity ship disabled, the new-thread
  mode inherits from the project (`null`, shown as Local), jump shortcuts need
  the `isDesktop` shortcut context.
- Toolchain: `apps/lynxtron` pins TypeScript 6 because Rspeedy needs the
  TypeScript JS API that TypeScript 7 no longer ships, and Tailwind 3 through
  scoped overrides. `scripts/lynx-regexp-loader.cjs` lowers Unicode property
  escapes, and `src/app/polyfills.ts` adds the ES2023+ built-ins the Lynx
  engine lacks; upstream packages use both.
- The Lynx transcript is derived by `packages/lynx-logic/src/transcript.ts`;
  the app uses only the minimap helpers from upstream's `session-logic.ts` and
  `MessagesTimeline.logic.ts`, which run in place. Upstream's versions model
  reasoning messages the Lynx transcript does not render; this client does not
  opt in to them, so the server sends them as system messages.
- Upstream's markdown parser decodes entities through the DOM in its browser
  build. `lynx.config.ts` points `decode-named-character-reference` at the
  table-based build; without that the window stays blank.

Not merged: `de34391427` and later (507 commits). That commit replaces
`packages/contracts/src/orchestration.ts` with `orchestrationV2.ts`, which the
Lynx client and connector are written against. Moving to it is a port, not a
merge.

A trial merge of `b707eeb052` (2,354 commits) on 2026-10-09, before this
restructuring, conflicted in 154 paths, 111 of them fork-edited Web files.
With Web restored, a typecheck of the merged tree left 389 errors on the Lynx
side, from three causes: the Effect 4.0.1 API, the orchestration contract
types the Lynx client and connector use, and the client-runtime platform
exports. That is the real size of the next merge. Upstream also removed the
server files that six of the product-fix patches touch.

## Why not shared composition

Plan 10 made `apps/web/src` the owner of product composition so both renderers
compiled the same component files. That required editing upstream files:

- The fork had modified 126 upstream Web files (9,046 changed lines), deleted
  22, and renamed 10. About 77% of those lines existed to share logic or
  markup with Lynx. Only 17 of the 126 were in the Lynx bundle at all.
- Plan 14 measured 3 to 7% module reuse on the main surfaces. In the last
  merge (Plan 15) upstream had rewritten the shared areas, Web went back to
  upstream's files, and the shared Surface components became Lynx-only.
- Upstream moves at about 1,600 commits a month.

## Frontend shared layer (pilot)

The layering keeps upstream files untouched. This is how Lynx takes
upstream UI changes without a hand port: compile upstream's component file for
Lynx and substitute below it.

| Kind of upstream Web file | Upstream at `b707eeb052`                      | Share of UI churn | How Lynx would get it                                   |
| ------------------------- | --------------------------------------------- | ----------------- | ------------------------------------------------------- |
| Pure logic                | 351 files, 41k lines                          | 16%               | Imported in place (today: 12 modules).                  |
| Composition components    | 181 files, 26k lines, plus part of 61 more    | 13 to 20%         | The upstream `.tsx` compiled unmodified.                |
| Seams                     | 46 `components/ui` primitives, platform hooks | 14%               | A `.lynx` module with the same exports (today's model). |
| Platform-native surfaces  | 149 files, 116k lines                         | 49%               | A Lynx implementation of the whole module.              |

A pilot on 2026-10-10 built the mechanism and switched four components to
upstream's file:

- `scripts/lynx-dom-jsx-loader.cjs` rewrites the DOM tags in an upstream
  `.tsx` to the components `src/app/platform/hostDom.tsx` exports. The exports
  are the tag map. An unmapped tag, an event prop other than `onClick`,
  `onKeyDown` and `onKeyUp`, or a DOM `ref` fails the build, and so does a DOM
  tag in a Lynx-owned file. A key handler is called with the Lynx key event's
  key and modifiers (`platform/hostDomEvents.ts`); `stopPropagation` throws.
- A DOM box that holds a string becomes a `<view>` around a `<text>`. The text
  takes colour, family, size and line height from the box through the engine,
  and font weight and white-space through `scripts/postcss-lynx-text-carry.mjs`
  and the `.lynx-box-text` rule, so a component's label needs no rule of its
  own and a consumer's semantic class on the box still wins. The box's classes
  are not copied onto the text: there a utility class would beat the semantic
  class that overrides it on the box.
- `src/app/host-dom-elements.d.ts` types those tags with the host components'
  props, so the upstream file is typechecked as it will run.
- A package the upstream file imports is replaced the same way as a module:
  `src/app/platform/base-ui/*` stands in for `@base-ui/react/*` through a
  bundler alias and a tsconfig path. `use-render` is where a tag named as a
  string (`defaultTagName: "label"`) reaches its host component.
- `src/app/platform/tanstack/react-router.tsx` stands in for
  `@tanstack/react-router` over the Lynx pathname router (`useNavigate`,
  `useLocation`, `useParams({ strict: false })`, `useRouter`, `Link`).
  `routePaths.ts` maps upstream route patterns to pathnames. Search params,
  hash, history state, relative routes, and routes the Lynx app has no screen
  for throw with the name of the API that asked.
- The upstream file joins the Tailwind content list. Lynx rules that selected
  the old copy by its own class select a class upstream's markup carries (a
  utility used as a marker, a class a Lynx primitive or the icon shim adds).
  An attribute selector (`[data-slot="…"]`, `[aria-label="…"]`) did not match
  in the running app when `sidebar/SidebarChrome` was switched; the earlier
  `[data-slot]` rules have not been checked on frames. DevTool selectors in
  gates do match attributes, unquoted.
- `scripts/component-share-candidates.mjs` lists the remaining `.lynx.tsx`
  copies of upstream components with what blocks each one.

Limits and open questions:

- Upstream keeps product composition and DOM code in the same file for its
  main surfaces: `ChatView.tsx` (12.1k lines), `ChatComposer.tsx` (7.7k),
  `MessagesTimeline.tsx` (5.8k), `Sidebar.tsx` (5.6k). Module substitution
  cannot reach inside them.
- A `.lynx` seam must export what the Web module exports. Nothing checks that
  yet; the Lynx `button` already lacks upstream's newer `InlineButton`.
- The loader sees tags, not behavior. A handler upstream typed for a DOM event
  and passed by reference typechecks and receives a Lynx event; a class from
  Tailwind 4's variant set (`not-[...]`, `text-base/4.5`, container queries)
  produces no rule under the Lynx Tailwind 3 pipeline and nothing reports it.
- Lynx CSS and battery gates select the copies by their own class names
  (`composer-approval-action--accept`, `settings-nav__item`). Switching such a
  component means re-keying both and comparing frames, as `sidebar/SidebarChrome`
  did; where upstream's content or controls differ it is a look change.
- `ui/badge` stays a Lynx copy. Upstream marks size and variant only by
  utility classes, the box would gain declarations the copy never had
  (`relative`, `gap-1`, `whitespace-nowrap`, `transition-shadow`), and the
  label would take its size from the box instead of its own rule, so the switch
  cannot be shown to leave the badge's look as it is without frames.
- `text-overflow` is not carried to a box's text: the DOM does not inherit it
  and a custom property cannot be stopped at one level. `text-transform` does
  not exist in the engine. Letter spacing and text decoration are left to the
  engine's inheritance and have not been checked on frames.
- Not measured: render cost of host components versus static Lynx templates,
  and the four switched components in a running app.

## Known debts

- Two carried patches are extractions, which principle 3 rules out:
  `packages/contracts/src/keybindings.ts` (constants moved to
  `keybindingConstants.ts`) and the quick-action additions in
  `packages/client-runtime/src/state/gitActions.ts`. Each should become a
  Lynx-owned module or an upstream change.
- Upstream features the Lynx client does not have yet: per-project settings
  and the project default model, per-thread auto-settle opt-out, reasoning
  messages, the Forgejo icon, and the upstream changes to the 65 Web modules
  that have a `.lynx` module of the same name (largest: `Sidebar.tsx`,
  `composerDraftStore.ts`, `MessagesTimeline.logic.ts`, `session-logic.ts`).
- Native-menu key packets are matched by `packages/lynx-logic/src/keyboard.ts`,
  a second copy of the matching loop in upstream's `keybindings.ts`. It lacks
  upstream's physical-key fallback for punctuation and its AltGraph guard.
- `packages/lynx-logic` has 20 type errors under `tsgo` (test fixture typing
  and Effect diagnostics for `Date`). They moved with the code from
  `packages/client-runtime`, which is clean now.
- `tailwind.config.mjs` blocks 36 classes that Lynx-owned source carries but
  that had no generated rule before content was widened. Each one is a class
  that does nothing today; unblocking it changes that surface.
- `.lynx` modules live inside `apps/web`, which costs the two `apps/web`
  config patches and means a fork-added path can collide with one upstream
  adds later (three did in the trial merge).
