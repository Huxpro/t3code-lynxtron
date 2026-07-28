# T5-F1 worktree baseline

Captured on 2026-07-27 in
`/Users/bytedance/.codex/worktrees/f409/t3code`. This document inventories the
dirty handoff before T5 reporting work. It does not authorize staging,
committing, deleting, or resetting any listed file.

## Git identity

- HEAD: `5719e8ac4020dda0e375ef61d044b61f55a0df8a`
- Checkout state: detached worktree
- Tracked diff summary: 76 files changed, 5,078 insertions, 4,342 deletions
- Pre-document porcelain manifest: 243 paths
  - 57 tracked modifications
  - 19 tracked deletions
  - 167 untracked files
- SHA-256 of
  `git -c color.status=false status --porcelain=v1 -uall`:
  `6d3b8bd0bef8bc5604729ae84f0b55283ece203ecc52e788a5c92d3b5a0db102`
- SHA-256 of `git diff --binary`:
  `e606b9f846831d027915aa1c21240819ca3405660b6ec8c311d7850db9c1dd4a`

The manifest hash describes the state immediately before this baseline file
was added. Later task evidence must use a new identity rather than silently
reusing this hash.

## Dirty-file summary by ownership

| Area                      | Modified | Deleted | Untracked | Classification                                         |
| ------------------------- | -------: | ------: | --------: | ------------------------------------------------------ |
| `apps/desktop`            |        7 |       0 |         0 | T5 capture-harness isolation                           |
| `apps/web`                |       41 |      19 |         1 | Web refactors and Web capability host                  |
| `apps/lynxtron`           |        0 |       0 |       121 | Port app, plans, tools, generated output, and evidence |
| `packages/client-runtime` |        2 |       0 |        43 | Shared production state/presentation and focused tests |
| `packages/contracts`      |        2 |       0 |         1 | Shared schemas/default projection                      |
| `packages/shared`         |        2 |       0 |         1 | Shared model/provider options                          |
| workspace files           |        3 |       0 |         0 | workspace manifest and lockfile integration            |

### Port files

The untracked `apps/lynxtron` tree contains:

- 52 renderer files under `src/app`, including the Lynx route, host
  components, Atom-backed state, capability host, and generated renderer
  inputs;
- 8 desktop-host files under `src/main`, including the connector, preload,
  host entry, server-path tests, and viewport tests;
- 14 scripts for build, audits, smoke tests, provenance, capture, and
  diagnostic diffing;
- app/package/build configuration and the current documentation set.

The production port sources are user work. They must not be recreated from the
standalone repository or replaced wholesale.

### Web refactors

The Web changes replace local projections with physical imports from
`@t3tools/client-runtime`, add the Web capability host, and retain DOM-only
adapters where required. They span Chat/Sidebar, Composer, Model Picker,
Markdown, changed files, file editing, settings, provider state, command
palette, panels, paths, session state, and time formatting.

`apps/web/src/platform/clientCapabilities.web.ts` is the one untracked Web
file.

### Shared-package changes

- `packages/client-runtime`: 43 untracked presentation, operation, platform,
  state, and focused-test files plus package exports.
- `packages/contracts`: schema/default updates and
  `src/settingsDefaults.ts`.
- `packages/shared`: model changes and `src/providerOptions.ts`.

These files are the current physical-reuse foundation. Their presence does not
by itself prove a screen's T5-F2 reuse gate.

### Generated files and retained reports

Generated source inputs:

- `apps/lynxtron/src/app/generated/lynx.css`
- `apps/lynxtron/src/app/components/iconData.ts`
- `apps/lynxtron/src/app/routeTree.gen.ts`

Generated reports that are intended to remain reproducible:

- `apps/lynxtron/reports/css-audit.json`
- `apps/lynxtron/reports/css-generation.json`
- `apps/lynxtron/reports/web-api-audit.json`

Retained visual evidence:

- exploratory images and notes under `apps/lynxtron/reports/screenshots`
- the completed matched T5-F3 pairs under
  `apps/lynxtron/evidence/2026-07-27/T5-F3/new-thread/`

The formal T5-F3 directory contains Electron PNG and Lynx DevTool JPEG images,
capture and measurement sidecars, structured metrics, diagnostic
side-by-side/diff images, and notes for 1280 × 820 and 1440 × 900. The earlier
partial 1280 × 820 artifacts remain under `legacy-partial/`. This is evidence,
not disposable output.

### Disposable build output and temporary state

Do not stage these generated build products:

- `apps/lynxtron/output/bundle/lynx/main.lynx.bundle` (1,309,384 bytes)
- `apps/lynxtron/output/bundle/lynx/static/font/dm-sans.d1e9a726.ttf`
  (36,876 bytes)
- ignored `apps/lynxtron/dist`
- ignored `apps/web/dist`
- ignored `apps/desktop/dist-electron`

The completed T5-F3 preparation states remain temporarily at
`/tmp/t3code-f3-state-1280.HWJnZ9` and
`/tmp/t3code-f3-state-1440.Q4Fpv5` for reproduction. No verification process
started by this goal remains running.

## Deleted Web module replacements

Every tracked deletion has a named physical replacement:

| Deleted Web file                                   | Replacement                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `components/chat/changedFilesPresentation.ts`      | `packages/client-runtime/src/presentation/diff.ts`                                                                                  |
| `components/chat/changedFilesPresentation.test.ts` | `packages/client-runtime/src/presentation/diff.test.ts`                                                                             |
| `components/chat/modelPickerSearch.ts`             | `packages/client-runtime/src/presentation/modelPicker.ts`                                                                           |
| `components/chat/modelPickerSearch.test.ts`        | `packages/client-runtime/src/presentation/modelPicker.test.ts`                                                                      |
| `components/files/fileContentRevision.ts`          | `packages/client-runtime/src/presentation/files.ts`                                                                                 |
| `components/files/fileContentRevision.test.ts`     | `packages/client-runtime/src/presentation/files.test.ts`                                                                            |
| `components/files/filePreviewMode.ts`              | `packages/client-runtime/src/presentation/files.ts`                                                                                 |
| `components/files/fileSaveCoordinator.ts`          | `packages/client-runtime/src/state/fileSaveCoordinator.ts`                                                                          |
| `components/files/fileSaveCoordinator.test.ts`     | `packages/client-runtime/src/state/fileSaveCoordinator.test.ts`                                                                     |
| `components/settings/providerStatus.ts`            | `packages/client-runtime/src/presentation/provider.ts`                                                                              |
| `lib/turnDiffTree.ts`                              | `packages/client-runtime/src/presentation/diff.ts`                                                                                  |
| `lib/turnDiffTree.test.ts`                         | `packages/client-runtime/src/presentation/diff.test.ts`                                                                             |
| `markdown-links.ts`                                | `packages/client-runtime/src/presentation/markdown.ts` and `packages/client-runtime/src/presentation/paths.ts`                      |
| `markdown-links.test.ts`                           | `packages/client-runtime/src/presentation/markdown.test.ts` and `packages/client-runtime/src/presentation/paths.test.ts`            |
| `modelOrdering.ts`                                 | `packages/client-runtime/src/presentation/modelPicker.ts`                                                                           |
| `modelOrdering.test.ts`                            | `packages/client-runtime/src/presentation/modelPicker.test.ts`                                                                      |
| `proposedPlan.test.ts`                             | `packages/client-runtime/src/presentation/proposedPlan.test.ts`; `apps/web/src/proposedPlan.ts` remains the DOM download adapter    |
| `providerInstances.ts`                             | `packages/client-runtime/src/presentation/provider.ts` and `packages/client-runtime/src/presentation/providerSettings.ts`           |
| `providerInstances.test.ts`                        | `packages/client-runtime/src/presentation/provider.test.ts` and `packages/client-runtime/src/presentation/providerSettings.test.ts` |

## Existing verification at handoff

The current files record these successful focused checks:

- 80 shared presentation tests before the T5 takeover;
- Lynx renderer and host TypeScript checks;
- client-runtime and desktop TypeScript checks, with only pre-existing
  Effect-language-service suggestions;
- Web, desktop, Lynx renderer, host, and connector production builds;
- CSS/API audits and ReactLynx source scans;
- connector/server smoke tests for settings, Composer controls, files, source
  control, and access inventory;
- isolated Web interaction passes for the refactored user-visible surfaces;
- Lynx DevTool production captures with zero renderer errors.

The takeover additionally passed:

```text
vp test run apps/lynxtron/src/main/desktop/windowViewport.test.ts
vp exec tsc --noEmit -p apps/lynxtron/src/main/desktop/tsconfig.json
vp test run apps/desktop/src/app/DesktopEnvironment.test.ts apps/desktop/src/app/DesktopAppIdentity.test.ts apps/desktop/scripts/electron-launcher.test.mjs
vp exec tsgo --noEmit -p apps/desktop/tsconfig.json
vp exec tsc --noEmit -p src/app/tsconfig.json
vp exec rspeedy build
vp exec rspack build
pnpm --filter @t3tools/lynxtron report:provenance
```

The provenance report currently records 10,963 lines across 69 current
source/config files, 5,480 textually retained lines, and a 50.0% retained
share against `/Users/bytedance/github/t3code-lynxtron`. This is provenance,
not physical source reuse.

## Preservation statement

No destructive Git command was run. No existing user file was reset,
discarded, or overwritten as part of T5-F1. The only recoverable cleanup was
moving the goal-created isolated Electron profile to the Trash path recorded
above. The same-snapshot database and all capture artifacts remain available.
