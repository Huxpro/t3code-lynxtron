# T5-F5 Settings General certification

Status: `passed`

Electron/Web in this monorepo worktree is the product reference. The candidate
is the Lynxtron renderer from the same worktree and server snapshot. The
standalone Lynx repository is provenance-only.

## Independent gates

| Gate              | Result | Evidence                                                                                                                                                                                                                             |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Style generation  | pass   | 37/37 Web-owned Settings tokens generate unchanged; the focused primitive-contract test covers all ten `.web`/`.lynx` leaves; API and CSS audits pass                                                                                |
| Visual fidelity   | pass   | At 1280 × 820 and 1440 × 900, all base states pass 6/6 anchors, 4/4 font sizes, and 3/3 colors; confirmation passes 9/9 anchors, 7/7 font sizes, and 5/5 colors; maximum anchor delta is 3.95 px and maximum font-size delta is 2 px |
| Content and state | pass   | One physical 17-row composition, canonical client/server projections, exact restore labels and confirmation copy, and shared default/changed fixtures; DevTool text fallback no longer treats `[object Object]` as content           |
| Interaction       | pass   | Web and real Lynxtron runs exercised default → changed → confirmation → cancel, confirmation → restore, disabled `Restored`, and persistence after reload; Electron and Lynx reported zero renderer errors                           |

## Reuse boundaries

- Feature panel: 3/4 modules (75%) and 760/1036 physical lines (73.4%).
- Complete route product surface: 10/14 modules (71.4%) and 1240/1769 physical lines (70.1%).
- Reviewed boundary SHA-256:
  `1a6b21408c97c40bc7132fa60cec306d7007a063853cb67d4aba24be278d05f3`.

The authoritative graph is
[`../../../../reports/reuse/current.json`](../../../../reports/reuse/current.json).

## Evidence matrix

| Viewport   | Default                          | Changed                          | Restore confirmation                                       | Restored                           |
| ---------- | -------------------------------- | -------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| 1280 × 820 | [`default`](./1280x820/default/) | [`changed`](./1280x820/changed/) | [`restore-confirmation`](./1280x820/restore-confirmation/) | [`restored`](./1280x820/restored/) |
| 1440 × 900 | [`default`](./1440x900/default/) | [`changed`](./1440x900/changed/) | [`restore-confirmation`](./1440x900/restore-confirmation/) | [`restored`](./1440x900/restored/) |

Every variant contains the Electron image, Lynx DevTool image, structured
measurements, capture metadata, `metrics.json`, diagnostic side-by-side/diff
images, and `notes.md`. No masks were used. Compatibility-matrix R1, R2, and
the registered Settings primitive adapters own the bounded renderer
differences.

## Verification

The following focused checks passed:

```sh
pnpm exec vp test run \
  apps/lynxtron/scripts/compare-visual-measurements.test.mjs \
  apps/lynxtron/scripts/devtool-measurements.test.mjs \
  apps/lynxtron/scripts/prepare-visual-state.test.mjs \
  apps/lynxtron/scripts/reuse-audit.test.mjs \
  apps/lynxtron/scripts/settings-primitive-contract.test.mjs \
  apps/web/src/components/settings/generalSettingsProjection.test.ts \
  apps/web/src/components/settings/SettingsPanels.logic.test.ts \
  apps/web/src/components/settings/settingsRouteState.test.ts \
  packages/client-runtime/src/presentation/settings.test.ts
pnpm --dir apps/web run typecheck
pnpm --dir apps/lynxtron run typecheck
pnpm --dir apps/lynxtron run audit
pnpm --dir apps/lynxtron run build
pnpm --dir apps/lynxtron run report:reuse
```

The test run passed 31/31 tests in 9 files. The complete capture sequence is
documented in [`../../../../docs/visual-capture.md`](../../../../docs/visual-capture.md).
