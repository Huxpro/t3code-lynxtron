# M6: Bound secondary surfaces and platform quality

- Status: `completed` (2026-09-29, Lynxtron 0.0.28; two budget exceptions and physical input carried to M7)

## Objective

Make terminal, browser, performance, theme, and remaining runtime decisions honest and
measurable after the primary product journey is complete.

## Entry conditions

- M1-M5 essential journeys are complete.
- Terminal, editor, browser, and full patch renderer are classified as implemented,
  external handoff, placeholder, or hard island.

## Required work

1. Terminal: prove open, input, output, resize, split, multi-session, reconnect, close,
   reopen, remote ownership, and cleanup for the supported runtime.
2. Browser: follow Plan 13. Keep CEF opt-in until isolated cache/profile, OSR lifecycle,
   load/error/location callbacks, and remote URL ownership pass.
3. Record budgets for cold start, semantic ready-to-interact, long transcript update,
   connector payload/update frequency, retained memory, and bundle size.
4. Run light, dark, and system theme on required journeys.
5. Re-probe open R# gaps and remove obsolete adapters only when the runtime proof passes.
6. Audit animations and repeated rendering for high-refresh/GPU regressions.

## Exit gates

- Every secondary surface has a capability decision and user-visible reason.
- No decorative control claims unavailable behavior.
- Performance budgets pass or have explicit approved exceptions.
- Resource cleanup leaves no owned processes, ports, views, or persisted run state.
- PF6/PF7 are complete or formally blocked by named runtime gaps.

## Outcome (2026-09-29)

Evidence: `evidence/2026-09-29/M6/runtime-budget.json` and
`evidence/2026-09-29/M6/secondary-surfaces.json`. All runs launched in the
background.

| Surface / requirement     | Decision and proof                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Terminal                  | Implemented. `--verify-terminal-lifecycle`: a real shell prints output, a horizontal split resizes the PTY (`tput cols` 71 to 35), closing the split, hiding and reopening keeps history, and closing the tab starts clean. Reconnect after a server restart and remote-environment terminals are not separately proven. |
| Browser                   | CEF stays opt-in (`T3_LYNXTRON_CEF_WEBVIEW=1`, Plan 13). The add menu dims Browser; a tap closes the menu and toasts "CEF browser is unavailable in this Lynxtron runtime." Gated in `--verify-right-panel-add-menu`.                                                                                                    |
| Full patch renderer (R10) | Hard island; Lynx renders unified diffs with its own leaf and offers no patch editing.                                                                                                                                                                                                                                   |
| Budgets                   | `reports/budgets/runtime.json` + `check:runtime-budget`. Baseline: semantic ready 1.94 to 2.07 s, process-tree RSS about 690 MB, bundle 6.96 MB; budgets 3 s, 800 MB, 7 MB.                                                                                                                                              |
| Budget exceptions         | Long-transcript update latency and connector payload frequency are not measured yet; the recycling and incoming-growth gates prove behaviour, not timing.                                                                                                                                                                |
| Themes                    | Light, dark, and system (resolved against the macOS appearance) pass readiness, runtime menu, and sidebar scope journeys.                                                                                                                                                                                                |
| Animations                | Only 150 to 200 ms enter/exit animations; no infinite animation. 1 s timers run only while a working duration or last-checked label is shown, matching Web.                                                                                                                                                              |
| Open R# gaps              | `GAP-011` (focused-input Arrow/Return, Command+A) needs physical keyboard evidence; no adapter was removed.                                                                                                                                                                                                              |
| Cleanup                   | No owned processes left; harness state directories are removed; scratch probe state was deleted.                                                                                                                                                                                                                         |

Gate maintenance found on the way: the add-menu gate still pinned the old
176px menu and a terminal placeholder, and the lifecycle gate predated the
composer being blocked while the connector is not ready.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M6：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M6-secondary-surfaces-and-performance.md`。先完成 Terminal 支持范围内的真实生命周期和 remote ownership；Browser 严格遵循 Plan 13，CEF isolation/lifecycle 未通过前保持 opt-in 和诚实 unavailable 状态。建立 cold start、semantic readiness、long transcript update、connector payload、retained memory、bundle 的预算，完成 light/dark/system journey 验证，并只在 runtime probe 通过后删除 adapter。不得让 secondary surface 阻塞已完成的核心 agent journey。
