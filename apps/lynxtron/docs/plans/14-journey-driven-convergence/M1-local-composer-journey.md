# M1: Close the supported local Composer journey

- Status: `in_progress`
- Started from baseline: `67832da07c9991dc1b5badc7b0c8e31f8b0b6277`

## Objective

Prove one continuous authenticated local journey from draft creation through canonical
assistant response using every supported Composer input, including failure and retry.

## Entry conditions

- M0 is complete by user-directed skip. M1 audits only the status and evidence it
  changes; it does not reopen a separate governance phase.
- One canonical populated snapshot and one authenticated provider path are available.
- Runtime-blocked picker/selection paths are explicitly separated from supported input.

## Required journey

1. Select the canonical local project and create or reuse the intended draft.
2. Add text, one supported image/file attachment, terminal context, file context, and
   element context through truthful supported entry paths.
3. Remove and restore at least one input.
4. Navigate away and back, then cold restart; verify draft identity and content.
5. Interrupt the owned server and reconnect; verify route, draft, context, and target
   environment remain canonical.
6. Inject one bounded send failure, retry, create exactly one canonical thread/turn,
   receive one authenticated response, and clear inputs only after receipt.
7. Compare Web/Electron and Lynx using the same snapshot, scope, payload, theme, and
   viewport. Perform exact-owned Native correlation for supported physical input.

## Source convergence rules

- Shared source owns control order, labels, validation, sendability, context
  serialization, retry semantics, and clearing rules.
- Native owns only input, picker/clipboard capability, measurement, and host bridge.
- Remove renderer-local product decisions discovered during the journey.

## Exit gates

- Supported inputs serialize into one canonical user message.
- Failure and retry do not duplicate thread, turn, attachment, or context.
- Draft/context survive route, cold start, and reconnect.
- The supported local journey completes without returning to Web.
- File-dialog `FiberSetAttribute` and Command+A remain explicit blockers if current.
- PF2 is updated to `completed` or `blocked(runtime-gap-id)` with a bounded fallback;
  it must not remain indefinitely `in_progress`.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M1：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M1-local-composer-journey.md`，用一个 canonical local snapshot 和一个真实 authenticated provider 完成连续 Composer journey。覆盖 text、支持的 attachment、terminal/file/element context、remove/restore、route round-trip、cold restart、owned-server reconnect、一次受控 send failure、retry、唯一 canonical turn 和 assistant receipt。Electron/Web 是 authority；Browser-first 迭代，最终 exact-owned Native correlation。优先删除 renderer-local 产品决策；runtime-blocked picker/selection 不做虚假 workaround。每个 commit 后继续，直到 M1 exit gates 全部满足或正式 blocked。

