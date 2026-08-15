# Final5 archaeology completion audit

Date: 2026-08-12
Authority: branch `archaeology/final5-20260812`

## Result

The accumulated Lynxtron work was converted from one large dirty checkout into
78 dependency-ordered commits after `4604dd443`. Product source, harness source,
documentation, evidence cleanup, and the current planning manifest now have
separate ownership.

The archaeology is complete. Product certification is not complete.

## Prompt-to-artifact checklist

| Objective                                                                                | Artifact boundary                                                                                                                                                                                                                                  | Verification command / gate                                                                                                                                                                                                                                                    | Evidence                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Classify user-owned, product, Harness, docs, valid evidence, and reproducible garbage | `worktree-inventory.md`, `evidence-registry.md`, `commit-archaeology-2026-08-12.md`; product under contracts/server/client-runtime/Web/Lynxtron source; Harness under Browser Preview/scripts; docs/evidence/reports isolated from product commits | classify every `git diff --name-only 4604dd443..HEAD` path; stop on an unmatched path                                                                                                                                                                                          | 439 changed paths classified; the two initially unmatched paths were the Lynxtron Rspack configs; original checkout and two dirty backup worktrees were preserved                                                                                                                           |
| 2. Remove worthless screenshots and local databases while preserving negative evidence   | `49b805f3d`; `.gitignore`; `evidence/2026-08-04/H8/runtime-boundaries.json`; `/tmp/t3-tail-remaining-*` backups                                                                                                                                    | search active worktree for `state.sqlite*`, `.t3-*`, `.gradle`, and `midscene_run`; count evidence additions/deletions; verify backup hashes                                                                                                                                   | no active SQLite/cache paths; 98 tracked screenshots removed; 0 binary evidence files added; R5/R10 structured negative evidence retained; tracked/untracked backups remain available                                                                                                       |
| 3. Run targeted tests per concern                                                        | changed tests under contracts, server, client-runtime, Web, and Lynxtron                                                                                                                                                                           | derive tests from `git diff --name-only 4604dd443..HEAD`; use Web's `--project unit`; run affected package typechecks                                                                                                                                                          | 70 changed test files passed: 35 + 53 + 122 + 68 + 172 tests; five focused typecheck scopes passed                                                                                                                                                                                          |
| 4. Split commits in dependency order                                                     | ordered range `4604dd443..HEAD`; detailed C01-C17 ledger in `commit-archaeology-2026-08-12.md`                                                                                                                                                     | `git log --reverse --format='%h %s' 4604dd443..HEAD`; detached sequential checkout                                                                                                                                                                                             | 78 commits in contracts → server → client-runtime → Web → Lynx host/product → Harness → cleanup/evidence/docs order                                                                                                                                                                         |
| 5. Keep every commit buildable/verifiable and avoid a 30k-line commit                    | detached test/typecheck and build-audit worktrees; generated atlas fix `a7aec9f74`                                                                                                                                                                 | for each of the 76 pre-audit commits: changed tests, affected typechecks, `git diff --check`, clean status; build all 66 commits with a package compiler boundary at their historical revisions; final server/Web/Lynxtron/Browser Preview builds; two production build passes | 76/76 historical commits passed verification; 66/66 build-relevant commits compiled; 12 script/evidence/ignore/docs-only commits had no package compile target; largest text change was 7,807 lines, none exceeded 10,000; final builds passed and remained clean after the idempotency fix |

## Requirement mapping

| Requirement                         | Result    | Evidence                                                                                                           |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| Preserve authored product work      | completed | contracts, server, client-runtime, Web, Native host, and Lynx product commits are dependency ordered               |
| Avoid one giant commit              | completed | 78 commits after the archaeology base; explicit path whitelists only                                               |
| Keep intermediate commits buildable | completed | dependency boundaries were rewritten after clean-worktree typecheck/build failures                                 |
| Separate product and harness        | completed | Browser Preview, provenance, Native readiness, workbench, diagnostics, and ignores are separate commits            |
| Remove generated debris             | completed | disposable state and 2,414 unreferenced binaries removed; 98 superseded tracked screenshots removed in `49b805f3d` |
| Preserve negative evidence          | completed | current tracked history remains structured; R5/R10 baseline is retained in `runtime-boundaries.json`               |
| Avoid giant generated reports       | completed | 36k-line style and 316k-line reuse reports are not committed                                                       |
| Verify focused behavior             | completed | client-runtime 122 tests, provider ingestion 48 tests, Browser Preview 15 tests, harness 48 tests                  |
| Avoid Electron restart loops        | completed | final archaeology validation used only the isolated worktree and did not launch or restart the app                 |
| State certification honestly        | completed | current planning manifest reports 18 required pending cells; strict mode fails by design                           |

## Commit ledger

- Base: `4604dd443f8f351402eb33bc7fefa3f548194545`.
- Current evidence baseline: `9479f08fd`.
- Superseded visual cleanup: `49b805f3d`.
- Generated icon-atlas idempotency: `a7aec9f74`.
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
- All 70 changed test files passed with their package-specific runners:
  contracts 35 tests, server 53 tests, client-runtime 122 tests, Web 68 tests,
  and Lynxtron 172 tests.
- Contracts, server, client-runtime, Web, and Lynxtron focused typechecks
  passed. Existing Effect diagnostics remained suggestions only.
- A detached audit worktree checked all 76 pre-audit commits individually with
  changed tests, affected package typechecks, `git diff --check`, and a clean
  status.
- A separate detached build audit compiled all 66 commits that touched a
  package compiler boundary. It selected server bundle, Web production, Lynx
  production, and Browser Preview builds from each commit's changed paths.
  Twelve script/evidence/ignore/docs-only commits had no package compile
  target; their focused tests, verifiers, and diff gates remained the relevant
  acceptance.
- Server bundle, Web production, Lynxtron production, and Browser Preview
  builds passed. Two consecutive Lynxtron production builds were clean.
- The first full-build audit found that `format:generated` reformatted the
  752-entry icon atlas. `a7aec9f74` commits that formatter output; a decoded
  key/value comparison proved no icon payload changed.
- Current manifest planning mode:
  `0 errors / 18 incomplete / archived 0 of 0`.
- Current manifest strict mode: exits 2 with one aggregate error because all
  18 required cells remain pending.
- Final product and Browser Preview builds passed with only known warnings.
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

1. choose a run-owned state file, then run
   `node apps/lynxtron/scripts/check-agent-browser-leaks.mjs --phase preflight --state-file <file>`;
   an orphaned process or one descended from this run blocks the loop and must
   report PID/PPID/command without pattern-killing anything; active processes
   owned by another live parent are reported as external and do not invalidate
   this run;
2. build once and record `HEAD` plus staged bundle hashes;
3. seed one canonical snapshot;
4. capture real Web and Lynx-for-Web from that snapshot;
5. launch one exact-owned Native process only when the Browser pair is ready;
6. prove main transport, advancing sequence, route/state identity, viewport,
   bundle identity, and zero errors;
7. stop only PIDs captured by this run and remove only its isolated state;
8. run
   `node apps/lynxtron/scripts/check-agent-browser-leaks.mjs --phase postflight --state-file <same-file>`
   plus the screenshot-budget gate before admitting evidence.

Do not reuse legacy pixels, operate a user-visible Electron app, or restart a
Native process repeatedly after identical failures. Fidelity loops do not use
the `agent-browser` CLI; the dual-renderer workbench owns its Chrome process
directly and must leave both preflight and postflight leak counts at zero.
