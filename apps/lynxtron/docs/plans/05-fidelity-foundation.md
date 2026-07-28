# Establish the fidelity foundation

Phase T5 converts the existing monorepo implementation into a measurable port. Complete one real reference screen before expanding feature coverage.

## Plan metadata

- Content type: How-to
- Audience: Agents establishing shared-source and visual gates
- Goal: Make one T3 Code screen pass repeatable source-reuse and visual-fidelity checks
- Depends on: Existing host, connector, generated CSS, audits, and presentation extractions
- Exit: T5-F1 through T5-F5 are `completed`

## Starting evidence

The current app already generates Lynx CSS from `apps/web/src/index.css`,
audits 1,258 static utilities, imports 25 shared presentation modules, and has
a repeatable Lynx DevTool capture plus equal-dimension visual-diff command. The
first Electron-versus-Lynx empty-Composer pair is exploratory because it does
not yet use one shared server snapshot. Per-screen eligible reuse reports and
matched same-snapshot pairs remain required.

## T5-F1: Protect and inventory the worktree

Status: `completed`

Evidence: [`worktree-baseline.md`](./worktree-baseline.md) records the detached
HEAD, the pre-document 243-path dirty manifest and hashes, ownership
classification, generated/disposable output, verification results, and named
replacements for all 19 deleted Web files.

Record the current detached commit, Git status, untracked files, build outputs, and existing verification results. Do not create a commit unless the user requests one.

Exit criteria:

- `docs/plans/worktree-baseline.md` records the exact HEAD and dirty-file summary
- The baseline separates port files, Web refactors, shared-package changes, generated files, and disposable output
- Every deleted Web module has a named replacement
- No existing user change is removed or overwritten

Verification:

```bash
git status --short
git diff --stat
pnpm --filter @t3tools/lynxtron report:provenance
```

## T5-F2: Define screen dependency and reuse reports

Status: `completed`

Evidence: [`../../reports/reuse/README.md`](../../reports/reuse/README.md)
documents the fixed denominator, the seven three-scope baselines, the largest
non-shared modules, the inspected production resolver contract, fixture
coverage, and verification. The complete deterministic graphs are in
[`../../reports/reuse/current.json`](../../reports/reuse/current.json).

Add a deterministic report for these reference entries:

- App shell and Sidebar
- New-thread empty state
- Existing thread and transcript
- Composer
- Model Picker
- Settings General
- Settings Providers

Classify eligible modules as `SHARED`, `PATCHED`, `SPLIT`, or `EXCLUSIVE`. Exclude tests, generated files, host process code, and registered hard islands. Keep the exclusion list in source control.

Generate three related graphs for each screen:

- Route graph
- Product-surface graph
- Renderer-local graph

The route graph exposes global dependency weight. The product-surface graph is the required screen gate. The renderer-local graph identifies the next composition or host leaf to share.

Exit criteria:

- Each screen reports eligible modules and physical lines
- Each screen reports reused modules and physical lines
- Reports identify the modules with the largest non-shared line counts
- Moving or renaming a file without sharing it cannot raise reuse
- A focused fixture proves copied files do not count as shared
- The auditor uses the same extension order, exact aliases, package exports, conditions, symlink resolution, and realpath behavior as the Lynx production build
- Fixtures cover `.tsx`, `.web.tsx`, `.lynx.tsx`, exact primitive aliases, package subpaths, copied files, generated CSS, and symlinked files
- Changes to exclusions or graph boundaries fail the check until the reviewed baseline updates

## T5-F3: Build a matched capture harness

Status: `completed`

The 2026-07-27 evidence under
`../../evidence/2026-07-27/T5-F3/new-thread/` contains matched 1280 × 820 and
1440 × 900 Electron/Web and Lynx DevTool captures. Both pairs use deterministic
isolated state, native logical viewport sizes, structured DOM/CSS
measurements, zero-error Lynx captures, and chrome-free Electron product
renderer images. `../visual-capture.md` documents the sequence. The diagnostic
results deliberately expose the current copy, anchor, and color gaps instead
of claiming visual certification.

Capture Web and Lynx from the same server snapshot, route, viewport, and theme. Use logical viewport sizes of 1280 × 820 and 1440 × 900.

Exit criteria:

- One command prepares the Web reference state
- One command or documented sequence prepares the Lynx state
- `metrics.json` records viewport, anchors, font sizes, colors, and mask bounds
- `notes.md` follows the evidence requirements in `00-execution-index.md`
- The harness does not include browser chrome in the Web image

Do not require a whole-screen pixel score as the pass condition. Use pixel or Structural Similarity Index Measure (SSIM) output only as diagnostic evidence.

## T5-F4: Stabilize the style and primitive contracts

Status: `completed`

Select the primitives required by Settings General: surface, section, label, button, input, textarea, select, switch, separator, and scroll container. Preserve the Web import and prop contract where Lynx can support it.

Exit criteria:

- The selected Web call sites do not contain Lynx branches
- Semantic color, spacing, radius, and typography values come from the Web source or a deterministic transform
- Lynx-specific rules live in `overrides.css` and reference a compatibility-matrix item
- The CSS audit rejects new unsupported utilities unless the change updates the allowlist with evidence
- The Web reference screen has no visual regression

## T5-F5: Certify Settings General as the reference screen

Status: `completed`

The 2026-07-28 certification under
[`../../evidence/2026-07-28/T5-F5/settings-general/`](../../evidence/2026-07-28/T5-F5/settings-general/)
uses Electron/Web as the product reference and Lynx DevTool for every Lynx
capture. Feature-panel reuse is 75% by module and 73.4% by line; complete-route
product-surface reuse is 71.4% by module and 70.1% by line. Both 1280 × 820 and
1440 × 900 pass all measured anchors, typography, and registered colors across
default, changed, restore-confirmation, and restored states. The maximum anchor
delta is 3.95 px and the maximum font-size delta is 2 px. The four independent
gate results and focused verification commands are recorded in
[`certification.md`](../../evidence/2026-07-28/T5-F5/settings-general/certification.md).

Use Settings General because it exercises navigation, groups, form controls, typography, scrolling, and persistence without a transcript or editor hard island.

Certify two nested boundaries:

1. Feature panel: Prove that shared composition, same-API primitives, and generated styles work.
2. Complete route: Include the Settings shell, navigation, header, scroll surface, restore action, confirmation, and persistence.

The feature-panel result may prove the method. It does not complete T5 or certify Settings until the complete route passes.

Exit criteria:

- Feature-panel module and line reuse are each at least 70%
- Complete-route product-surface module and line reuse are each at least 70%
- Anchors differ by at most 8 px at both viewports
- Corresponding font sizes differ by at most 2 px
- Labels, values, enabled states, and grouping match the same settings snapshot
- Default, changed, restore-confirmation, and restored states have evidence
- Web and Lynx persistence use canonical settings projections
- No unregistered large color-region difference remains
- Style generation, visual fidelity, content and state, and interaction have separate pass results

## Phase exit

Update `../port-ledger.md` with both reference boundaries. Link the reuse report and both viewport pairs. Start T6 only after another agent can reproduce the complete-route T5-F5 result from the written commands.

Before exit, write a proposed patch series that separates:

- Worktree protection and reporting tools
- Shared Web refactors
- Lynx primitives and adapters
- Generated styles and baselines
- Reference-screen product integration

Do not create commits without user authorization.

The proposed review units are recorded in
[`T5-proposed-patch-series.md`](./T5-proposed-patch-series.md). No commits were
created.
