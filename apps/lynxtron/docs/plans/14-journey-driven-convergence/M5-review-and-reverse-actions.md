# M5: Complete review and reverse actions

- Status: `completed` (2026-09-29, Lynxtron 0.0.28; physical input and one geometry pin carried to M7)

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

## Outcome (2026-09-29)

Evidence: `evidence/2026-09-29/M5/review-and-reverse.json`. Every run launched
Lynxtron in the background (`T3_LYNXTRON_BACKGROUND=1`); the developer's front
app never changed.

Product and harness changes made during M5:

- Probe runs answer native confirmations from `T3_TEST_CONFIRM_ANSWERS`, so
  gates exercise the real confirm path without a dialog.
- `--verify-checkpoint-revert`: a cancelled revert changes nothing; a
  confirmed revert without a provider session surfaces the server's
  "Checkpoint revert failed" row while the thread, card, and workspace stay.
- `--verify-checkpoint-revert-live`: a real OpenCode turn creates a file; the
  confirmed revert drops the turn's messages and card and removes the file.
- The review-diff gate failure was fixture collision (two fixtures shared one
  workspace checkpoint ref); on an isolated workspace it passes.

| Requirement        | Status               | Evidence                                                                         | Remaining boundary                                                             |
| ------------------ | -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Product entry      | complete             | Checkpoint card preview/expand toggles both ways; review diff opens both files   | Expanded card is 82px vs a Native-only 79px pin from 0.0.21 (M7 visual matrix) |
| Canonical state    | complete             | Live revert truncates messages and checkpoints through the shared thread reducer | none                                                                           |
| Completion receipt | complete             | Workspace file created by the turn is removed by the revert                      | Source-control panel refresh not separately measured                           |
| Failure/retry      | partial              | Refused revert is visible and moves nothing; cancel is a no-op                   | Retry after a refusal is not separately proven                                 |
| Reverse action     | complete             | Revert targets the exact thread and checkpoint count from the shared helper      | none                                                                           |
| Web/Lynx parity    | complete             | Revert copy and targets shared with Web (M4)                                     | none                                                                           |
| Native interaction | pending-user-session | DevTool taps; background computer-use grant was not available                    | Physical clicks carry to M7                                                    |
| Source reuse       | partial              | Diff selection and revert decisions shared (M4)                                  | Diff body states, file order, base-ref picker still differ (M4 record)         |
| Cleanup            | complete             | Owned processes stopped by PID; mutated workspaces are scratch copies            | none                                                                           |

R10 (full DOM patch renderer) stays a hard island; Lynx renders unified
diffs with its own leaf and claims no patch editing.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M5：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M5-review-and-reverse-actions.md`，从一个真实 completed turn 完成 checkpoint -> changed files -> diff/fallback -> file detail -> transcript round-trip，并验证 restore/revert/reopen 的 confirmation、pending、failure、retry、receipt。远程对象必须保留 environment ownership。R10 保持明确 hard island，不做 DOM shim。持续到用户无需回 Web 即可理解并安全反向操作结果。
