# Lynxtron client layering

Status: the layering rule was approved on 2026-10-09. The frontend shared layer
below is proposed and awaits a decision. Replaces the ownership model in
`plans/10-source-first-architecture-reset.md`.

## The rule

Upstream paths stay byte-identical to upstream. The Lynx client reads upstream
code; it never reshapes it.

| Layer           | Paths                                                                                       | Who changes it                                                          |
| --------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0. Upstream     | `apps/web`, `apps/server`, `apps/desktop`, `apps/mobile`, `packages/*` as upstream has them | Upstream only. The fork carries a short, listed set of patches (below). |
| 1. Shared logic | Upstream packages, and pure upstream Web modules imported in place through the `~` alias    | Upstream only. Lynx consumes a module only if it compiles unmodified.   |
| 2. Lynx-owned   | `apps/lynxtron/**`, `*.lynx.ts(x)` siblings, the fork's presentation projections            | The fork. Nothing in layers 0 and 1 imports from here.                  |

Consequences:

- Web is upstream's Web again. It is the reference the Lynx client is compared
  against, not a second consumer of fork code.
- Sharing happens the way upstream shares with its mobile app: through
  packages. Upstream's mobile app has no imports from `apps/web`. Lynx goes one
  step further and also reads pure Web modules (`*.logic.ts`, stores) in place,
  because that costs nothing until upstream changes one, and then the Lynx
  build fails loudly.
- When an upstream module cannot be used as is, Lynx gets its own copy in
  layer 2. The upstream file is not edited to make it reusable.
- UI and CSS are Lynx-owned. `overrides.css` is the Lynx stylesheet, not a list
  of temporary workarounds.

## Carried patches

A fork edit to an upstream path is allowed only when it is a product or
platform fix the Lynx client needs and that cannot live in layer 2. Each one is
listed in `docs/upstream-patches.md` with its reason, and is written so it
could be sent upstream. A check (`scripts/check-upstream-delta.mjs`) fails when
an upstream path differs from the merge base and is not on the list.

## What the Lynx bundle takes from `apps/web` (2026-10-09)

The Lynx bundle compiles 127 modules from `apps/web/src`: 115 fork-added files
(74 of them `.lynx` siblings) and 12 untouched upstream files. The 17 upstream
files it used to compile in fork-edited form now have `.lynx` siblings holding
that content, so Lynx no longer depends on any fork edit to an upstream Web
file. With all 123 other fork-edited Web files restored to upstream content,
the Lynx typecheck and build pass, the Native battery passes 19 of 19, and the
stable frames match the baseline.

Keeping siblings inside `apps/web` costs three carried build-config patches
(`apps/web/package.json`, `tsconfig.json`, `vite.config.ts`). Moving them to an
overlay directory under `apps/lynxtron` would remove those; that is not done.

## Why this replaces the shared-composition model

Plan 10 made `apps/web/src` the owner of product composition, with `.web` and
`.lynx` leaves, so both renderers would compile the same component files. That
requires editing upstream files. Measured on 2026-10-08 against upstream
`b707eeb052`:

- The fork modified 126 upstream Web files (9,046 changed lines), deleted 22
  and renamed 10. About 77% of those lines exist to share logic or markup with
  Lynx. 118 of the 126 files have since changed upstream.
- A dry-run merge of upstream (2,354 commits) conflicts in 154 paths: 111 in
  `apps/web`, every one an upstream file the fork edited. `apps/lynxtron` and
  the `.lynx` siblings conflict nowhere.
- The sharing did not hold. Plan 14 measured 3 to 7% module reuse on the main
  surfaces. In the last merge (Plan 15) upstream had rewritten the shared
  areas, the merge took upstream's files, and Web stopped rendering through the
  shared Surface components. They are now Lynx-only code living in `apps/web`.
- Upstream moves at about 1,600 commits a month and grew `apps/web/src` from
  846 to 1,443 files since the merge base.

## What a merge looks like under this model

1. `git merge origin/main`. Conflicts are limited to the carried patches.
2. Build Lynx. Compile errors are the layer 1 modules upstream changed; fix the
   Lynx side.
3. Run the Native battery and the frame set against the pre-merge baseline.
4. List the upstream Web files that changed and have a Lynx counterpart. That
   list is the port backlog. It does not block the merge.

## Frontend shared layer (proposed, spike-verified 2026-10-09)

The rule above keeps upstream files untouched. This section is how Lynx still
takes upstream UI changes without a hand port: the fork point moves from "a
Lynx copy of the component" down to the smallest module below it, and the
build does the substitution.

Each upstream Web file falls into one of four kinds:

| Kind                     | Upstream today (`b707eeb052`)                 | Share of upstream UI churn | How Lynx gets it                                                              |
| ------------------------ | --------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Pure logic               | 351 files, 41k lines                          | 16%                        | Imported in place.                                                            |
| Composition components   | 181 files, 26k lines (plus part of 61 more)   | 13% (up to 20%)            | The upstream `.tsx` compiled unmodified for Lynx.                             |
| Seams                    | 46 `components/ui` primitives, platform hooks | 14%                        | A `.lynx` module with the same exports replaces the Web module at build time. |
| Platform-native surfaces | 149 files, 116k lines                         | 49%                        | Lynx-owned implementation of the whole module, consuming the pure logic.      |

Compiling a composition component unmodified needs three build pieces:

1. A loader that maps the DOM tags the file writes (`div`, `span`, `p`,
   `button`, `img`, lists, headings) to Lynx host components before ReactLynx
   compiles it. The host components decide view versus text from the children.
2. Module substitution for the seams it imports (already how `.lynx` siblings
   resolve).
3. Tailwind output for the classes in the file, lowered to what Lynx CSS can
   express.

The spike compiled three unmodified upstream components (`WorkspaceBreadcrumb`,
`PermissionChecklist`, `UsageShareBar`) this way and they rendered correctly in
Lynxtron through the existing Lynx `Button` and `Tooltip`. The visible gaps
were CSS selectors Lynx lacks (`space-y-*`, `first:`/`last:`) and one icon the
Lynx icon shim does not map.

Rules:

- Default is "compile upstream's file". A Lynx implementation is added only
  when that fails the build or a gate, and at the lowest module that fixes it:
  a primitive or a hook before the component itself.
- A `.lynx` module must export what the Web module exports. A type check makes
  drift a build error after a merge (the Lynx `button` already lacks upstream's
  newer `InlineButton`).
- The platform-native surfaces are where upstream keeps product composition
  and DOM code in one file: `ChatView.tsx` (12.1k lines), `ChatComposer.tsx`
  (7.7k), `MessagesTimeline.tsx` (5.8k), `Sidebar.tsx` (5.6k). Module-level
  substitution cannot reach inside them. They stay hand ports unless upstream
  splits them.

Open questions the spike did not answer: render cost of host components versus
static Lynx templates, how much of Tailwind's variant set (hover, group, data
attributes, pseudo-elements, responsive) can be lowered mechanically, and
whether an existing hand-written Lynx surface can switch to the upstream file
without a visible change.

## What stays as it is

- `*.lynx.ts(x)` siblings stay next to the Web file they replace. They are
  additions and caused no conflicts. A check reports a sibling whose upstream
  file was renamed or removed.
- `overrides.css` is not restructured as part of this change. Any change to how
  the app looks is a separate decision.
