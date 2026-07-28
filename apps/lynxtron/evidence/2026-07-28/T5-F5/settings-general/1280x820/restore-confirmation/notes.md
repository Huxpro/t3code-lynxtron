# Settings General — restore confirmation — 1280 × 820

- Worktree: detached `5719e8ac4020dda0e375ef61d044b61f55a0df8a`; Electron/Web and Lynx use the same dirty monorepo worktree.
- Server snapshot: `016f16874aaa6944d189eba0b1a267484dc6ffbd29344d2ecb6721a1f039862e`.
- Route/theme/viewport: `/settings/general`, `system`, 1280 × 820 logical pixels at 2×.
- Reuse: feature panel 3/4 modules (75%) and 760/1036 lines (73.4%); complete route 10/14 modules (71.4%) and 1240/1769 lines (70.1%).
- Measurements: 9/9 anchors pass (maximum 3.95 px), 7/7 font sizes pass (maximum 2 px), and 5/5 registered color comparisons are exact. Dialog rectangle and title geometry differ by 0 px.
- State: changed Project Grouping followed by the real restore interaction; exact title, description, Cancel, and Restore actions are visible.
- Registered renderer differences: compatibility-matrix R1 rasterized icons, R2 font fallback, and the registered Settings primitive adapters. Masks: none.
- Runtime result: 0 Electron renderer errors and 0 Lynx DevTool console errors.

Verification passed with the focused 31-test settings/measurement suite, Web and Lynx typechecks, Lynx API/CSS audits, and `pnpm --dir apps/lynxtron run report:reuse`. The Electron image was captured through CDP and the Lynx image through Lynx DevTool.
Exact commands and results are in the shared [`certification.md`](../../certification.md#verification).
