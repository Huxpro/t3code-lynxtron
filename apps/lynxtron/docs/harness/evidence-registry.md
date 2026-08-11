# Historical legacy evidence and context registry

Updated: 2026-08-04
Historical authority: Plan 11C H1

This registry records the 2026-08-04 classification pass. Current admission is
controlled by `evidence/manifests/main-shell.json` and
`harness/current-state.md`.

No legacy artifact is automatically admitted into a Plan 11C strict manifest.

| Artifact/root | Classification | Current authority | Disposition |
| --- | --- | --- | --- |
| Plan 10 | architecture history | no | retain |
| Plan 11 | product outcome history/current implementation input | no for Harness | retain; reassess through H6 |
| Plan 11A | historical Browser experiment | no | retain with superseded banner |
| Plan 11B | historical real-Web correction | no | retain with superseded banner |
| `2026-07-27/T5-*` | historical fidelity/diagnostic evidence | no | retain; individual cells require manifest admission |
| `2026-07-28/T5-F5` | historical Settings certification | no under Plan 11C | retain; generated diffs are cleanup candidates |
| `2026-07-28/T6-C1` | historical shell/sidebar probes | no | retain; failed/probe frames diagnostic |
| `2026-07-29/*` | historical transcript/keyboard/runtime evidence | no | retain; Native-only claims require identity recheck |
| `2026-08-01/OC0` | historical failure freeze | diagnostic authority for old failure only | retain |
| `2026-08-01/OC1-OC7` | Plan 11 semantic reports | partial/diagnostic | retain; not visual certification |
| `2026-08-02/BW0-BW1` | current-stack/browser-host compatibility | diagnostic | retain |
| `2026-08-03/BW2` | hand-built reference-host matrix | superseded/invalid for product fidelity | exclude from new manifests |
| `2026-08-03/BW3/BW4/BW7` | old Harness calibration/findings | historical | retain |
| `2026-08-03/SB0/SB2/SB3` | shared-server feasibility/seed/connectivity | diagnostic | retain |
| `2026-08-03/SB4` | real-Web/Lynx captures | diagnostic pending strict state identity | exclude until admitted |
| `2026-08-03/SB4b/c/d/final` | interrupted iteration captures | invalid/superseded | exclude; H8 cleanup candidates |
| `2026-08-03/SB5` | historical go/no-go note | superseded | retain |
| `reports/screenshots/*-diff/side-by-side` | generated visual products | non-authoritative | reproducible cleanup candidates |
| `workbench-geometry-baseline.json` | old per-pane change baseline | superseded | never use as fidelity expected values |
| `diagnose-lynx-styles.mjs` | one-off diagnostic | non-authoritative | H8 cleanup candidate |
| Android `.gradle` dirs | accidental caches | none | H8 cleanup candidate |

## Admission rules

A legacy frame may be promoted only by a new manifest entry that proves:

- source file exists and has valid image bytes/dimensions;
- build/bundle identity;
- snapshot identity;
- semantic route and selected product state;
- theme, viewport and DPR;
- assertions and fresh console;
- required client tier;
- explicit residual disposition.

Otherwise it remains historical or diagnostic.
