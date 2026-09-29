# M5: Complete review and reverse actions

## Objective

Let the user understand, inspect, and safely reverse completed work without leaving
Lynxtron.

## Entry conditions

- Local and remote agent journeys produce real completed turns and checkpoints.
- R10 fallback boundaries remain explicit.

## Required journey

1. Open a completed turn's checkpoint and changed-file summary.
2. Navigate through changed files, full diff or explicit R10 fallback, and file detail.
3. Return to the same transcript position and thread state.
4. Exercise restore/revert/reopen where Web supports them, including confirmation,
   pending, failure, retry, and canonical receipt.
5. Verify source-control state and timeline projection update together.
6. Preserve environment ownership for remote checkpoints and files.

## Exit gates

- A real completed turn can be inspected end to end.
- Reverse actions target exact checkpoint/thread/environment identities.
- Failure never leaves UI and canonical state disagreeing.
- No placeholder claims editing or patch capabilities it cannot perform.
- PF5 is complete with R10 explicitly accepted or still blocked.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M5：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M5-review-and-reverse-actions.md`，从一个真实 completed turn 完成 checkpoint -> changed files -> diff/fallback -> file detail -> transcript round-trip，并验证 restore/revert/reopen 的 confirmation、pending、failure、retry、receipt。远程对象必须保留 environment ownership。R10 保持明确 hard island，不做 DOM shim。持续到用户无需回 Web 即可理解并安全反向操作结果。

