# Final5 archaeology completion audit

Date: 2026-08-12
Authority: branch `archaeology/final5-20260812`

## Result

The accumulated Lynxtron work was converted from one large dirty checkout into
76 dependency-ordered commits after `4604dd443`. Product source, harness source,
documentation, evidence cleanup, and the current planning manifest now have
separate ownership.

The archaeology is complete. Product certification is not complete.

## Requirement mapping

| Requirement | Result | Evidence |
| --- | --- | --- |
| Preserve authored product work | completed | contracts, server, client-runtime, Web, Native host, and Lynx product commits are dependency ordered |
| Avoid one giant commit | completed | 76 commits after the archaeology base; explicit path whitelists only |
| Keep intermediate commits buildable | completed | dependency boundaries were rewritten after clean-worktree typecheck/build failures |
| Separate product and harness | completed | Browser Preview, provenance, Native readiness, workbench, diagnostics, and ignores are separate commits |
| Remove generated debris | completed | disposable state and 2,414 unreferenced binaries removed; 98 superseded tracked screenshots removed in `49b805f3d` |
| Preserve negative evidence | completed | current tracked history remains structured; R5/R10 baseline is retained in `runtime-boundaries.json` |
| Avoid giant generated reports | completed | 36k-line style and 316k-line reuse reports are not committed |
| Verify focused behavior | completed | client-runtime 122 tests, provider ingestion 48 tests, Browser Preview 15 tests, harness 48 tests |
| Avoid Electron restart loops | completed | final archaeology validation used only the isolated worktree and did not launch or restart the app |
| State certification honestly | completed | current planning manifest reports 18 required pending cells; strict mode fails by design |

## Commit ledger

- Base: `4604dd443f8f351402eb33bc7fefa3f548194545`.
- Current evidence baseline: `9479f08fd`.
- Superseded visual cleanup: `49b805f3d`.
- Full ordered stack:
  `git log --reverse --format='%h %s' 4604dd443..HEAD`.
- Detailed slice mapping:
  `docs/harness/commit-archaeology-2026-08-12.md`.

## Verification summary

- Client runtime: 13 files / 122 tests; focused typecheck passed.
- Provider ingestion: 48 tests passed.
- Browser Preview: 15 tests passed; affected Web/Lynx builds passed.
- Harness: 13 files / 48 tests passed.
- Evidence verifier: 14 focused tests passed.
- Current manifest planning mode:
  `0 errors / 18 incomplete / archived 0 of 0`.
- Current manifest strict mode: exits 2 with one aggregate error because all
  18 required cells remain pending.
- Final product Browser Preview build passed with only known warnings.
- No repo-wide test or typecheck was run.

## Evidence disposition

- No new screenshot or video is committed as final5 evidence.
- The previous 39-state/78-entry Plan 11C matrix is historical and not current
  certification. Its images were captured from older product bundles.
- The old manifest also referenced one missing Native log, so its `0/0` result
  is not reproducible from the preserved source tree.
- `runtime-boundaries.json` preserves the 2026-08-04 R5/R10 result with its
  exact old head and bundle hash. It is useful negative evidence, not a final5
  pass.
- Historical reuse/style percentages remain roadmap inputs. Their generated
  reports can be regenerated and are intentionally excluded from Git.

## Remaining product gaps

The historical gap ordering remains useful, but every row needs fresh evidence:

1. shared main-shell composition;
2. Composer focus/input/send and route-owner reuse;
3. runtime light/dark/system theme and persistence;
4. Model Picker open/select/dismiss;
5. transcript wheel/drag/follow and recycling;
6. physical keyboard/focus;
7. Quick Switch visible and keyboard flows;
8. Review patch rendering or an approved Native fallback;
9. Settings route ownership, mutation, and persistence;
10. Appearance controls and restart persistence.

## Next exact task

Run one isolated evidence session for `new-thread-hero`:

1. build once and record `HEAD` plus staged bundle hashes;
2. seed one canonical snapshot;
3. capture real Web and Lynx-for-Web from that snapshot;
4. launch one exact-owned Native process only when the Browser pair is ready;
5. prove main transport, advancing sequence, route/state identity, viewport,
   bundle identity, and zero errors;
6. admit only the resulting current files into the manifest.

Do not reuse legacy pixels, operate a user-visible Electron app, or restart a
Native process repeatedly after identical failures.
