# Lynxtron client architecture

How the Lynx client sits on top of upstream T3 Code. The layering was approved
on 2026-10-09 and applied on the merge base `be7d35aaeb`; this document replaces
the ownership model in `plans/10-source-first-architecture-reset.md`.

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
- `apps/lynxtron/src/main`: the Lynxtron main process and connector.
- `packages/lynx-logic`: renderer-neutral logic the Lynx app, connector, and
  browser preview share: transcript, composer, sidebar and settings
  projections, keyboard resolution, thread dispatch, panel state.
- `apps/web/src/**/*.lynx.ts(x)`: modules the Lynx build resolves instead of
  the Web module of the same name, and Lynx-owned modules that sit next to the
  Web code they are composed with. The Web build and typecheck never see them.

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

`apps/lynxtron/upstream-patches.json` lists 57 modified upstream files and 11
added files, each with its reason. They fall into four groups:

- **Server and desktop product fixes** that are not Lynx-specific (provider
  authentication, session reaper, review roots, interrupt target, preview
  popups). They are marked "Upstream candidate"; sending them upstream removes
  them from the list.
- **Lynx enablers** in packages: single-module exports, Schema-free constants
  so the Lynx bundle does not pull Effect Schema, the connection banner
  projection.
- **Harness hooks**: environment variables the Lynxtron capture scripts set
  (`T3CODE_DESKTOP_USER_DATA_DIR`, `T3CODE_STATIC_DIR`, two `T3_TEST_*` hooks).
- **Build configuration**: workspace settings, root scripts, and the two
  `apps/web` entries that let `.lynx` modules under `apps/web` resolve their
  dependencies and stay out of the Web typecheck.

A new patch needs a reason that names the problem it solves. "Makes reuse
easier" is not one.

## What the Lynx bundle takes from `apps/web`

The Lynx bundle compiles 126 modules from `apps/web/src`: 114 `.lynx` modules
and 12 upstream modules imported in place (`session-logic.ts`,
`logicalProject.ts`, `worktreeCleanup.ts`, `lib/threadSort.ts`, and eight
`*.logic.ts` or helper modules). Those 12 are the whole compile-time coupling
to upstream Web source. When upstream changes one, the Lynx build or typecheck
fails and the fix is on the Lynx side.

## Merging upstream

1. `git merge origin/main`. Conflicts are limited to the carried patches.
2. Install, then typecheck and build Lynx. Errors come from the packages and
   the 12 in-place modules; fix the Lynx side.
3. Run `check-upstream-delta.mjs`, the Lynx tests, the Native battery, and the
   frame set against the pre-merge baseline.
4. List upstream Web files that changed and have a `.lynx` module of the same
   name. That list is the port backlog; it does not block the merge.

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

## Frontend shared layer (proposed, not built)

The layering keeps upstream files untouched. This is how Lynx could still take
upstream UI changes without a hand port: compile upstream's component file for
Lynx and substitute below it.

| Kind of upstream Web file | Upstream at `b707eeb052`                      | Share of UI churn | How Lynx would get it                                   |
| ------------------------- | --------------------------------------------- | ----------------- | ------------------------------------------------------- |
| Pure logic                | 351 files, 41k lines                          | 16%               | Imported in place (today: 12 modules).                  |
| Composition components    | 181 files, 26k lines, plus part of 61 more    | 13 to 20%         | The upstream `.tsx` compiled unmodified.                |
| Seams                     | 46 `components/ui` primitives, platform hooks | 14%               | A `.lynx` module with the same exports (today's model). |
| Platform-native surfaces  | 149 files, 116k lines                         | 49%               | A Lynx implementation of the whole module.              |

Compiling a composition component unmodified needs a loader that maps the DOM
tags it writes to Lynx host components, the seam substitution that already
exists, and Tailwind output for its classes. A spike on 2026-10-09 compiled
three unmodified upstream components this way and they rendered correctly in
Lynxtron. The gaps were CSS selectors Lynx lacks (`space-y-*`, `first:`,
`last:`) and one unmapped icon.

Limits and open questions:

- Upstream keeps product composition and DOM code in the same file for its
  main surfaces: `ChatView.tsx` (12.1k lines), `ChatComposer.tsx` (7.7k),
  `MessagesTimeline.tsx` (5.8k), `Sidebar.tsx` (5.6k). Module substitution
  cannot reach inside them.
- A `.lynx` seam must export what the Web module exports. Nothing checks that
  yet; the Lynx `button` already lacks upstream's newer `InlineButton`.
- Not measured: render cost of host components versus static Lynx templates,
  how much of Tailwind's variant set can be lowered mechanically, and whether
  an existing hand-written Lynx surface can switch to the upstream file
  without a visible change.

## Known debts

- Three carried patches are extractions, which principle 3 rules out:
  `packages/shared/src/model.ts` (helpers moved to `providerOptions.ts`),
  `packages/contracts/src/keybindings.ts` (constants moved to
  `keybindingConstants.ts`), and the quick-action additions in
  `packages/client-runtime/src/state/gitActions.ts`. Each should become a
  Lynx-owned module or an upstream change.
- `packages/lynx-logic` has 20 type errors under `tsgo` (test fixture typing
  and Effect diagnostics for `Date`). They moved with the code from
  `packages/client-runtime`, which is clean now.
- `tailwind.config.mjs` blocks 36 classes that Lynx-owned source carries but
  that had no generated rule before content was widened. Each one is a class
  that does nothing today; unblocking it changes that surface.
- Scripts that compare Lynx against a Web build read hooks the fork used to
  add to Web source (`__T3_WORKBENCH_*`, `data-*` identities). Web is upstream
  now, so those flows in `capture-shared-workbench.mjs` and the
  `verify-electron-*` scripts need retargeting before they are trusted again.
- `.lynx` modules live inside `apps/web`, which costs the two `apps/web`
  config patches and means a fork-added path can collide with one upstream
  adds later (three did in the trial merge).
