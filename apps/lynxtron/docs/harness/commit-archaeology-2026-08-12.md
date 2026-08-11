# Commit archaeology — 2026-08-12

Repository: `/Users/bytedance/github/t3code`
Final archaeology branch: `archaeology/final5-20260812`
Archaeology base: `4604dd443f8f351402eb33bc7fefa3f548194545`

This document is the staging authority for converting the accumulated
Lynxtron worktree into reviewable commits. The checkout remains authoritative:
source work is preserved, generated debris is removed only when reproducible,
and every commit uses an explicit path whitelist.

## Post-cleanup snapshot

Captured after the two cleanup passes and before the first archaeology commit:

| Category | Count or size |
| --- | ---: |
| Tracked paths with content changes | 186 |
| Tracked evidence paths deleted | 98 |
| Untracked files | 3,828 |
| Total dirty file-level entries | 4,112 |
| Tracked authored diff | 29,713 insertions / 7,853 deletions |
| `apps/lynxtron/evidence` | 3,827 files / 248 MB |
| Untracked evidence files | 3,654 |
| Structured evidence (`json`, `md`, `txt`, `log`) | 3,374 |
| Retained image/video evidence | 71 |
| `apps/lynxtron/reports` | 42 MB |
| Deleted tracked screenshot bytes | 51.6 MiB |

The 98 tracked deletions are old screenshots under
`apps/lynxtron/evidence`. They are an evidence-cleanup slice, not product
changes, and must not enter a feature commit.

Cleanup already completed:

- removed 282 disposable `apps/lynxtron/.t3-*` state directories, containing
  4,388 files and approximately 989.9 MB;
- removed four unrelated Android module `.gradle` directories;
- removed root `midscene_run/` output and added a root ignore rule;
- removed the duplicate root `evidence/` tree;
- removed generated `*-diff.*` and `*-side-by-side.*` images;
- removed 2,414 unreferenced image/video files, approximately 1,219.1 MB;
- retained structured negative evidence and every path referenced by the
  strict manifest or fidelity outcome.

## Classification rules

Rules are first-match and conservative:

1. `packages/contracts/**` is a wire/schema dependency. Commit it before its
   server, shared-runtime, Web, or Lynxtron consumers.
2. `apps/server/**` is product behavior. Split unrelated orchestration,
   provider-ingestion, and source-control behavior.
3. `packages/client-runtime/**` is shared product logic. Split by exported
   presentation concern and keep each test beside its implementation.
4. `apps/web/**` is authoritative shared product composition. Neutral
   surfaces precede `.lynx` platform leaves and Lynxtron consumers.
5. `apps/lynxtron/src/shared/**` and `src/main/**` are Native protocol and host
   product code, not harness code.
6. `apps/lynxtron/src/app/**` is product UI. Split by user-visible concern and
   preserve the shared-source dependency direction.
7. `src/browser-preview/**`, capture scripts, workbench scripts, and verifier
   scripts are harness code. They follow the product slices they exercise.
8. `docs/**`, `reports/**`, and `evidence/**` never enter a product commit.
   Evidence is retained only when its provenance and semantic readiness are
   explicit.
9. Generated CSS, route trees, icon data, and reports travel with the source
   or generator that deterministically owns them, never as an unexplained
   miscellaneous commit.
10. Staging uses `git add -- <explicit paths>`. `git add -A`, directory-wide
    staging, and wildcard staging are forbidden for this archaeology.

## Dependency-ordered commit stack

The listed paths are maximum whitelists. A slice may be split further after
diff inspection, but unrelated rows must not be merged.

### C01 — Interrupt the active turn when the client omits `turnId`

Whitelist:

- `apps/server/src/orchestration/decider.ts`
- `apps/server/src/orchestration/decider.interrupt.test.ts`

Verification:

```sh
vp test run apps/server/src/orchestration/decider.interrupt.test.ts
```

### C02 — Type source-control discovery failures

Whitelist:

- `packages/contracts/src/sourceControl.ts`
- `packages/contracts/src/rpc.ts`
- `apps/server/src/sourceControl/SourceControlDiscovery.ts`
- directly affected source-control tests discovered during staging

Verification:

```sh
vp test run apps/server/src/sourceControl
vp run --filter @t3tools/contracts typecheck
vp run --filter t3 typecheck
```

### C03 — Expose the `Latest` branding stage

Whitelist:

- `packages/contracts/src/ipc.ts`
- `packages/contracts/src/ipc.test.ts`
- directly affected Lynxtron branding host files and tests

Verification:

```sh
vp test run packages/contracts/src/ipc.test.ts
vp test run apps/lynxtron/src/main/desktop/appBranding.test.ts
```

### C04 — Make portable model favorites explicit

Whitelist:

- `packages/contracts/src/settingsDefaults.ts`
- model-picker settings projections and their focused tests

Verification:

```sh
vp test run packages/client-runtime/src/presentation/modelPicker.test.ts
vp test run apps/lynxtron/src/app/state/modelSelection.logic.test.ts
```

### C05 — Ingest provider runtime events without duplicate dispatch

Whitelist:

- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts`

Verification:

```sh
vp test run apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts
```

### C06 — Shared client-runtime presentation primitives

Split into one commit per concern:

- connection lifecycle;
- Markdown blocks;
- transcript projection;
- source-control projection;
- pending requests;
- model picker;
- settings;
- file picker and search overlay;
- resizable, sidebar, and media-query layout state.

Each implementation is committed with its matching test and any required
`packages/client-runtime/package.json` export.

Verification:

```sh
vp test run packages/client-runtime/src
vp run --filter @t3tools/client-runtime typecheck
```

### C07 — Renderer-neutral Web surfaces

Split by product anatomy:

- connection lifecycle and pending-request surfaces;
- transcript and Markdown;
- Composer;
- model picker;
- changed-files and diff panel;
- Settings;
- Sidebar and command bus;
- route shell and right-panel layout.

Each neutral surface and focused test precedes its `.web` or `.lynx` host.

Verification:

```sh
vp test run <focused apps/web test files>
vp run --filter @t3tools/web typecheck
```

### C08 — Lynx host elements and platform leaves

Whitelist groups:

- `apps/web/src/components/ui/*.lynx.tsx`;
- `.lynx` Sidebar, Settings, command, capability, viewport, and media-query
  hosts;
- corresponding Web hosts where the neutral contract changed.

Verification:

```sh
vp test run <focused host contract tests>
vp run --filter @t3tools/web typecheck
vp run --filter @t3tools/lynxtron typecheck
```

### C09 — Lynxtron connector protocols and Native host

Split by protocol:

- connector sequencing and readiness;
- capabilities;
- viewport;
- theme;
- keyboard and reload;
- app branding.

Commit `src/shared` protocol definitions with their `src/main` host and focused
tests before app consumers.

Verification:

```sh
vp test run apps/lynxtron/src/shared apps/lynxtron/src/main/desktop
vp run --filter @t3tools/lynxtron typecheck
```

### C10 — Lynxtron product composition

Split by user-visible concern:

- transport and client state;
- viewport and resizable panels;
- Sidebar and project actions;
- transcript, Markdown, changed files, and diff;
- Composer and pending requests;
- Settings and appearance;
- model picker;
- routing and shell composition;
- generated CSS, icons, and route tree owned by those slices.

Verification:

```sh
vp test run <focused apps/lynxtron/src/app test files>
vp run --filter @t3tools/lynxtron typecheck
```

### C11 — Browser harness and shared workbench

Split by capability:

- Browser Preview connector and viewport contract;
- shared-server state seeding;
- Web/Lynx shared workbench;
- capture and geometry helpers.

Verification:

```sh
vp test run apps/lynxtron/src/browser-preview
node --test <focused harness tests>
```

### C12 — Evidence provenance and packaged readiness gates

Whitelist:

- `apps/lynxtron/scripts/evidence-provenance.mjs`
- `apps/lynxtron/scripts/evidence-provenance.test.mjs`
- `apps/lynxtron/scripts/verify-evidence-manifest.mjs`
- `apps/lynxtron/scripts/verify-evidence-manifest.test.mjs`
- `apps/lynxtron/scripts/verify-packaged-readiness.mjs`
- directly required manifest schema/config files

Verification:

```sh
node --test apps/lynxtron/scripts/evidence-provenance.test.mjs
node --test apps/lynxtron/scripts/verify-evidence-manifest.test.mjs
node apps/lynxtron/scripts/verify-evidence-manifest.mjs \
  apps/lynxtron/evidence/manifests/main-shell.json
```

### C13 — Ignore disposable verification state

Whitelist:

- `.gitignore`
- `apps/lynxtron/.gitignore`

Verification:

```sh
git check-ignore midscene_run/probe.png \
  apps/lynxtron/.t3-disposable/userdata/state.sqlite \
  apps/lynxtron/.tmp/probe.json
```

### C14 — Remove superseded generated visual artifacts

Whitelist:

- only the 98 tracked evidence screenshot deletions;
- any remaining untracked generated diff/side-by-side paths explicitly listed
  by the evidence cleanup manifest.

Verification:

```sh
node apps/lynxtron/scripts/verify-evidence-manifest.mjs \
  apps/lynxtron/evidence/manifests/main-shell.json
git diff --cached --name-only | grep -v '^apps/lynxtron/evidence/' && exit 1 || true
```

### C15 — Current docs, reports, and retained evidence

Split into:

1. harness authority and current-state docs;
2. generated reports with their generator/version recorded;
3. strict manifests and structured negative evidence;
4. the small retained Native fidelity frame and exact-owned report.

Do not commit stale diagnostic pixels as passing evidence. Reports must not
claim that Browser/CDP evidence is packaged Native acceptance.

Verification:

```sh
node apps/lynxtron/scripts/verify-evidence-manifest.mjs \
  apps/lynxtron/evidence/manifests/main-shell.json
pnpm --dir apps/lynxtron run format:check
```

## Per-commit procedure

For every row:

1. inspect the complete diff for the explicit whitelist;
2. run the focused test before staging;
3. stage only the whitelist and inspect `git diff --cached`;
4. verify the commit in a detached validation worktree; never stash/restore the
   active checkout because file churn wakes desktop watchers;
5. rerun the focused test and affected package typechecks in that clean
   worktree;
6. commit with a conventional title and the required TRAE trailer;
7. rerun the focused test at the new commit;
8. confirm the validation worktree is clean;
9. record the commit hash or range and validation result in this document.

Required trailer:

```text
Co-authored-by: TRAE CLI <noreply@bytedance.com>
```

## Commit ledger

| Slice | Commit | Isolated verification |
| --- | --- | --- |
| C01 interrupt fallback | `ec4395cf4` | 2/2 focused tests and server typecheck passed in isolation |
| C02 source-control errors | `0724b3be7` | 3/3 focused tests plus contracts/server typechecks passed in isolation and after commit |
| C03 branding stage | `1d3854c9e` | 3/3 IPC tests plus contracts typecheck passed in isolation and after commit |
| C04 portable favorites | `919f2aa68` | 32/32 settings tests plus contracts typecheck passed in isolation and after commit |
| C05a provider abort ingestion | `bb17948ff` | 46/46 ingestion tests plus server typecheck passed without reasoning changes |
| C05b provider reasoning ingestion | `0aab7c8f5` | 48/48 ingestion tests plus server typecheck passed in isolation and after commit |
| C06 shared runtime | `0f07e979c..53476eed4` | 13 files / 122 tests plus client-runtime and Web typechecks in a clean worktree |
| C07 neutral Web surfaces | `0ae7ec9f0..a8ed16ccb` | focused surface suites plus Web and Lynxtron typechecks after each dependency boundary |
| C08 platform leaves | `5ce703ec5`, `7ec7b6491` | media-query and viewport tests, clean Web/Lynxtron typechecks, and Browser Preview build |
| C09 Native protocols/host | `32d1247fb`, `cf6c949f0..9213f5e1d` | connector, host, viewport, theme, clipboard, keyboard, and branding suites plus Lynxtron typechecks |
| C10 Lynxtron product | `48ce4e9b2`, `6162ae01e..e5c81acec` | focused app/helper tests, clean Web/Lynxtron typechecks, deterministic icon/CSS generation, and Browser Preview build |
| C11 Browser harness | `579a1e48b`, `c480375c8`, `d17a526f8`, `88d64de31` | 15 Browser Preview tests, dual build, syntax checks, and Native verifier helper tests |
| C12 evidence gates | `885f6b0b3` | provenance and strict manifest suites passed |
| C13 ignore policy | `df563cd40` | all disposable-state paths confirmed ignored |
| C14 evidence cleanup | `49b805f3d` | 98 explicitly classified stale pixels removed; no source or structured evidence staged |
| C15 evidence baseline | `9479f08fd` | planning verifier `0 errors / 18 incomplete`; strict verifier exits 2 by design; verifier suite 14/14 |
| C15 historical plans | `a65114d87` | superseded Plan 11A/11B/11C context retained with current-authority notices |
| C15 runtime docs | `4fd817a49` | implementation, compatibility, upstream boundary, and exact-owned capture docs reconciled |
| C15 residual roadmap | `63de8900b` | historical gap ordering retained; current evidence counts reconciled |
| C15 final authority | this document's commit | current-state, completion audit, inventory, registry, and this ledger |

The complete ordered stack is reproducible with:

```sh
git log --reverse --format='%h %s' 4604dd443..HEAD
```

Final harness regression before the documentation commits:

```text
Test Files  13 passed (13)
Tests       48 passed (48)
```

The old 39-state archive was not promoted. Its retained images came from
pre-final5 bundles, and one manifest-linked Native log was absent from every
preserved worktree and backup archive. The current six-state manifest therefore
contains no retained pixels and requires fresh evidence for all 18 client
cells.
