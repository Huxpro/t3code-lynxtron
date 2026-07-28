# Proposed T5 review series

This is a review plan for the current dirty worktree, not authorization to
stage or commit it. Preserve unrelated user changes and re-check each unit
against the worktree baseline before creating commits.

## 1. Worktree protection and reporting tools

- `docs/plans/worktree-baseline.md`
- `scripts/reuse-audit.mjs`, `reuse-report.mjs`, their focused tests, and the
  reviewed `reuse-boundaries.json` / baseline pair
- `reports/reuse/README.md` and the generated current report
- provenance reporting and the implementation/ledger documentation needed to
  interpret the numbers

## 2. Shared Web refactors

- Shared General Settings composition, projection, store, restore state, and
  navigation/route surfaces under `apps/web/src/components/settings/`
- Web host leaves and the `.web.tsx` split for the selected UI primitives
- Canonical portable settings defaults/projections in `packages/contracts` and
  `packages/client-runtime`
- Focused projection, state, and Web regression tests

Record the physical replacement path for every deleted unsuffixed Web module;
do not present a delete without its `.web.tsx` replacement.

## 3. Lynx primitives and adapters

- `.lynx.tsx` Settings and UI primitive leaves
- Lynx `SettingsPage`, General Settings sync/entry, preference host, router
  adapter, icons, and scoped authored rules in `overrides.css`
- Connector settings persistence and focused real-runtime smoke coverage
- Compatibility-matrix references R1, R2, R6, R7, and R9

## 4. Generated styles and baselines

- The Web-owned Settings token marker in `apps/web/src/index.css`
- `generate-lynx-css.mjs`, icon generation, and generated Lynx CSS/icon output
- Electron CDP and Lynx DevTool measurement/capture harnesses, measurement
  specs, and focused harness tests
- T5-F3/F4/F5 evidence, keeping generated diagnostic images separate from
  authored notes and certification reports

## 5. Reference-screen product integration

- Settings route wiring in both clients
- Shared restore action, confirmation, persistence, and state transitions
- T5-F5 two-viewport/four-state certification and reproduction guide
- Final reuse report, port-ledger update, and T5 phase status

Before any authorized commit, run the focused test/typecheck/audit/build/reuse
commands listed in the T5-F5 certification report. Do not combine unrelated
T6 surface work into this series.
