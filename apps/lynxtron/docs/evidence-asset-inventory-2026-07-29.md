# Evidence asset inventory (2026-07-29)

## Why this document exists

`apps/lynxtron/evidence/` and `apps/lynxtron/reports/` were previously
**untracked** files living only in the now-deleted codex worktree
`~/.codex/worktrees/f409/t3code`. The complete payload (300 files, 108.6 MB)
survives in the codex snapshot commit `8d2f45d9c` ("Codex worktree snapshot:
archive-cleanup", 2026-07-29), reachable via
`refs/codex/snapshots/c010785bbaca8bb0d000672035eca3a644f211f3`.

Because the total exceeds the ~50 MB guideline, this commit brings the
certification chain into version control **selectively**:

- **Committed (250 files, ~58 MB)**: every text artifact (all `notes.md`,
  `certification.md`, `metrics.json`, capture metadata, reuse reports, audits)
  plus every primary capture (`electron.png`, `lynx.jpg`, `web.png`, probe and
  runtime-action captures, and all iteration captures referenced by
  `metrics.json`). Nothing a committed document references by name is missing.
- **Not committed (50 files, 50.4 MB)**: two derivable/debug classes listed
  below. They remain on disk in this checkout and in the snapshot commit.

> The committed set is ~58 MB, slightly above the ~50 MB guideline. The
> alternative (also pruning superseded iteration captures) would have broken
> referential integrity with `metrics.json`. Flagging for review; see
> "Decisions needed" below.

## Excluded file classes

1. **Diagnostic composites** (`*-side-by-side.png`, `*-diff.png`,
   `comparison-*.png`): 44 files, 45.1 MB. Deterministically regenerable from
   the committed capture pairs with `pnpm run visual:diff`.
2. **`failed-attempts/` debug captures**: 6 files, 5.3 MB. Screenshots of
   crash states during T5-F4; the failures themselves are documented in the
   committed notes. Referenced by no `metrics.json` or `certification.md`.

## Excluded files (full list)

| Path (relative to `apps/lynxtron/`)                                                                    |   MB |
| ------------------------------------------------------------------------------------------------------ | ---: |
| `evidence/2026-07-27/T5-F3/new-thread/1280x820/electron-vs-lynx-diff.png`                              | 1.03 |
| `evidence/2026-07-27/T5-F3/new-thread/1280x820/electron-vs-lynx-side-by-side.png`                      | 1.14 |
| `evidence/2026-07-27/T5-F3/new-thread/1280x820/legacy-partial/electron-vs-lynx-diff.png`               | 1.04 |
| `evidence/2026-07-27/T5-F3/new-thread/1280x820/legacy-partial/electron-vs-lynx-side-by-side.png`       | 1.15 |
| `evidence/2026-07-27/T5-F3/new-thread/1440x900/electron-vs-lynx-diff.png`                              | 1.16 |
| `evidence/2026-07-27/T5-F3/new-thread/1440x900/electron-vs-lynx-side-by-side.png`                      | 1.28 |
| `evidence/2026-07-27/T5-F4/settings-general/1280x820/failed-attempts/failed-hook-router-reconcile.jpg` | 0.48 |
| `evidence/2026-07-27/T5-F4/settings-general/1280x820/failed-attempts/failed-main-thread-error.jpg`     | 0.96 |
| `evidence/2026-07-27/T5-F4/settings-general/1280x820/failed-attempts/failed-router-startswith.jpg`     | 0.95 |
| `evidence/2026-07-27/T5-F4/settings-general/1280x820/failed-attempts/failed-settings-main-thread.jpg`  | 0.95 |
| `evidence/2026-07-27/T5-F4/settings-general/1280x820/failed-attempts/failed-undefined-startswith.jpg`  | 0.96 |
| `evidence/2026-07-27/T5-F4/settings-general/1280x820/failed-attempts/failed-unguarded-pathname.jpg`    | 0.94 |
| `evidence/2026-07-28/T5-F5/settings-general/1280x820/changed/comparison-diff.png`                      | 1.31 |
| `evidence/2026-07-28/T5-F5/settings-general/1280x820/changed/comparison-side-by-side.png`              | 1.44 |
| `evidence/2026-07-28/T5-F5/settings-general/1280x820/default/comparison-diff.png`                      | 1.31 |
| `evidence/2026-07-28/T5-F5/settings-general/1280x820/default/comparison-side-by-side.png`              | 1.45 |
| `evidence/2026-07-28/T5-F5/settings-general/1280x820/restore-confirmation/comparison-diff.png`         | 1.17 |
| `evidence/2026-07-28/T5-F5/settings-general/1280x820/restore-confirmation/comparison-side-by-side.png` | 1.30 |
| `evidence/2026-07-28/T5-F5/settings-general/1280x820/restored/comparison-diff.png`                     | 1.30 |
| `evidence/2026-07-28/T5-F5/settings-general/1280x820/restored/comparison-side-by-side.png`             | 1.44 |
| `evidence/2026-07-28/T5-F5/settings-general/1440x900/changed/comparison-diff.png`                      | 1.50 |
| `evidence/2026-07-28/T5-F5/settings-general/1440x900/changed/comparison-side-by-side.png`              | 1.66 |
| `evidence/2026-07-28/T5-F5/settings-general/1440x900/default/comparison-diff.png`                      | 1.51 |
| `evidence/2026-07-28/T5-F5/settings-general/1440x900/default/comparison-side-by-side.png`              | 1.66 |
| `evidence/2026-07-28/T5-F5/settings-general/1440x900/restore-confirmation/comparison-diff.png`         | 1.34 |
| `evidence/2026-07-28/T5-F5/settings-general/1440x900/restore-confirmation/comparison-side-by-side.png` | 1.49 |
| `evidence/2026-07-28/T5-F5/settings-general/1440x900/restored/comparison-diff.png`                     | 1.49 |
| `evidence/2026-07-28/T5-F5/settings-general/1440x900/restored/comparison-side-by-side.png`             | 1.65 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/collapsed/certified-current-diff.png`                      | 0.47 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/collapsed/certified-current-side-by-side.png`              | 0.52 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/collapsed/certified-diff.png`                              | 0.47 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/collapsed/certified-final-diff.png`                        | 0.46 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/collapsed/certified-final-side-by-side.png`                | 0.51 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/collapsed/certified-side-by-side.png`                      | 0.52 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/populated/certified-diff.png`                              | 1.18 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/populated/certified-final-diff.png`                        | 1.16 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/populated/certified-final-side-by-side.png`                | 1.36 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/populated/certified-side-by-side.png`                      | 1.38 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/populated/final-diff.png`                                  | 1.14 |
| `evidence/2026-07-28/T6-C1/sidebar/1280x820/populated/final-side-by-side.png`                          | 1.35 |
| `evidence/2026-07-28/T6-C1/sidebar/1440x900/collapsed/certified-diff.png`                              | 0.52 |
| `evidence/2026-07-28/T6-C1/sidebar/1440x900/collapsed/certified-side-by-side.png`                      | 0.57 |
| `evidence/2026-07-28/T6-C1/sidebar/1440x900/populated/certified-diff.png`                              | 1.29 |
| `evidence/2026-07-28/T6-C1/sidebar/1440x900/populated/certified-side-by-side.png`                      | 1.48 |
| `reports/screenshots/electron-vs-lynx-empty-diff.png`                                                  | 0.96 |
| `reports/screenshots/electron-vs-lynx-empty-layout-aligned-diff.png`                                   | 0.98 |
| `reports/screenshots/electron-vs-lynx-empty-layout-aligned-side-by-side.png`                           | 1.02 |
| `reports/screenshots/electron-vs-lynx-empty-runtime-verified-diff.png`                                 | 0.99 |
| `reports/screenshots/electron-vs-lynx-empty-runtime-verified-side-by-side.png`                         | 1.03 |
| `reports/screenshots/electron-vs-lynx-empty-side-by-side.png`                                          | 1.03 |
| `reports/screenshots/original-vs-monorepo-diff.png`                                                    | 0.27 |
| `reports/screenshots/original-vs-monorepo-side-by-side.png`                                            | 0.30 |

Note: `reports/screenshots/README.md` references four of the
`electron-vs-lynx-empty-*` composites above; those four belong to the
2026-07-26 exploratory (pre-certification) baseline and are regenerable from
the committed `electron-empty-composer-1180x748.png` /
`lynx-empty-composer-*.png` sources.

## Recovery

Everything excluded is recoverable at any time:

```bash
# restore any excluded file from the snapshot commit
git restore --source=8d2f45d9c --worktree -- apps/lynxtron/evidence apps/lynxtron/reports
```

The snapshot ref is additionally pushed to the fork remote as
`refs/backup/lynxtron-evidence-2026-07-29` so the full payload is not
machine-local.

## Decisions needed (user)

1. Are the 50 excluded diagnostics/debug files acceptable to keep out of the
   branch permanently (recoverable via the backup ref), or should any class be
   committed as well?
2. If evidence keeps growing, do you want Git LFS for `evidence/**/*.png|jpg`
   before the next certification phase?
