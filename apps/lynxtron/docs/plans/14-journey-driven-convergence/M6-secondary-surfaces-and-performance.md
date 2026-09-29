# M6: Bound secondary surfaces and platform quality

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

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M6：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M6-secondary-surfaces-and-performance.md`。先完成 Terminal 支持范围内的真实生命周期和 remote ownership；Browser 严格遵循 Plan 13，CEF isolation/lifecycle 未通过前保持 opt-in 和诚实 unavailable 状态。建立 cold start、semantic readiness、long transcript update、connector payload、retained memory、bundle 的预算，完成 light/dark/system journey 验证，并只在 runtime probe 通过后删除 adapter。不得让 secondary surface 阻塞已完成的核心 agent journey。

