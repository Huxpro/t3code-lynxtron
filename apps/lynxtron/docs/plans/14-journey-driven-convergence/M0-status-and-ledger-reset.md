# M0: Reconcile plans and completion accounting

- Status: `completed`
- Completion decision: The user chose to skip this standalone governance phase and
  start M1. Later phases must keep their own status and evidence claims accurate.

## Objective

Make every planning and measurement source describe the same current product state
before more implementation begins. This phase changes status semantics, reports, and
fixtures; it must not claim product behavior without current evidence.

## Entry conditions

- Final5 six-state manifest passes strict archived verification.
- Fidelity history and reuse reports generate from the current HEAD.
- Worktree ownership and unrelated changes are known.

## Required work

1. Audit Plan 11 OC1-OC7 against Final5, current semantic evidence, and current code.
2. Audit Plan 12 PF0-PF8. Keep exactly one task `in_progress`; separate partial
   implementation from phase completion.
3. Reconcile `implementation-status.md`, `port-ledger.md`, `compat-matrix.md`,
   `gap-atlas.md`, Plan 11, Plan 12, and Plan 14.
4. Split source reuse into `shared-boundary-established` and
   `physical-source-convergence`. Do not call low physical reuse complete.
5. Add duplicate product-decision LOC and platform-leaf LOC to the reuse report, or
   document a deterministic implementation plan if the current resolver cannot yet
   compute them.
6. Classify high-loss states as product residual, evidence debt, runtime blocker, or
   stale/harness-invalid evidence.
7. Produce one authoritative current-status table and route all plan indexes to it.

## Exit gates

- Exactly one phase is `in_progress`.
- No completed label contradicts the current evidence boundary.
- Plan 11 historical statuses no longer override Final5/current evidence.
- SOURCE_REUSE completion has a measurable physical threshold or remains active.
- Every open item has an owner, smallest next proof, and blocker/removal condition.
- Documentation links and generated report checks pass.

## Do not

- Change product behavior.
- Lower reuse thresholds, alter masks, or expand exclusions.
- Regenerate the full screenshot matrix.
- Convert evidence debt into a product bug without direct evidence.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M0：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M0-status-and-ledger-reset.md`，审计 Plan 11、Plan 12、Final5、fidelity history、gap atlas 和 reuse report，使所有状态来源一致。只做状态、ledger、report schema 和文档治理，不改产品行为。保持现有阈值、mask、exclusion 和 100 张截图预算。必须把 shared boundary 与 physical source convergence 分开，并保证只有一个阶段为 in_progress。完成后运行所有相关 report/check，做 prompt-to-artifact completion audit；若还有安全可执行项则继续，不以 commit 为终点。

