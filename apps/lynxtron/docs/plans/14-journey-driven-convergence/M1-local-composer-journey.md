# M1: Close the supported local Composer journey

- Status: `completed` (2026-09-29, Lynxtron 0.0.28)
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

## Outcome (2026-09-29)

One continuous journey on a single canonical snapshot now passes end to end
(`evidence/2026-09-29/M1/local-journey.json`). The gate is
`verify:packaged-readiness -- --verify-m1-local-journey`; its Web/Electron
authority counterpart is `scripts/verify-electron-m1-journey.mjs` and
`scripts/compare-m1-journey-reports.mjs` checks payload parity.

Product changes made during M1:

- Lynxtron family upgraded to 0.0.28; CEF helpers are staged from the
  package manifest.
- Command+V pastes a clipboard image into the focused Composer through the
  Edit menu, encoded like Web; otherwise the native text paste runs.
- Image acceptance rules and error text moved into
  `client-runtime/presentation/draft-thread`; Web and Lynx share them.
- Local draft threads persist, so a cold restart reopens the same draft id.
- Main disposes the owned server on SIGINT/SIGTERM instead of orphaning it.

| Requirement        | Status               | Evidence                                                                                                                                                                        | Remaining boundary                                                                                                                                                      |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product entry      | complete             | New-thread tap creates the project draft; after cold restart one tap reopens the same draft id                                                                                  | The New-thread control is inert until the first shell snapshot lists projects                                                                                           |
| Canonical state    | complete             | Text, pasted image, Terminal-panel context, `@` picked file, and element context held one canonical draft through remove/restore, route round-trip, cold restart, and reconnect | Element context enters through a probe; Native has no browser picker entry yet (M6)                                                                                     |
| Completion receipt | complete             | Exactly one created thread, one user message with one attachment, one turn, one authenticated OpenCode reply; inputs cleared after receipt                                      | none                                                                                                                                                                    |
| Failure/retry      | complete             | Injected send failure persisted no thread and kept every input; retry through the send control produced one canonical turn                                                      | none                                                                                                                                                                    |
| Reverse action     | complete             | File context removed by its chip and restored through the `@` picker                                                                                                            | Web has no undo either; restore is re-add                                                                                                                               |
| Web/Lynx parity    | complete             | Same snapshot SHA and provider; same attachment identity, prompt, and file mention; exactly-once on both                                                                        | Web inlines mentions while Lynx appends chips; Native re-encodes clipboard PNG bytes (566 B vs 232 B, same pixels); terminal/element blocks are Native-only in this run |
| Native interaction | pending-user-session | Paste runs the real main-process menu handler with a probe NativeImage; taps are DevTool touches                                                                                | Physical typing, physical Command+V with a system clipboard image, and exact-owned Computer Use correlation (access declined) carry to M7                               |
| Source reuse       | partial              | Image acceptance and draft persistence are shared; Native keeps only clipboard encoding, menu wiring, and the host bridge                                                       | Cross-surface reuse audit remains M4                                                                                                                                    |
| Cleanup            | complete             | Harness stops owned processes; signalled main no longer orphans its server                                                                                                      | Server-spawned thread-title processes of the deliberately SIGKILLed server exit on their own                                                                            |

Blockers after M1:

- File dialog `FiberSetAttribute`: not re-verified on 0.0.28 and no longer on
  the product path, because Web accepts images only by paste and drop.
- Drag-and-drop images: `GAP-013` (`blocked-runtime`).
- Command+A: `GAP-011`, carried into M2.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M1：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M1-local-composer-journey.md`，用一个 canonical local snapshot 和一个真实 authenticated provider 完成连续 Composer journey。覆盖 text、支持的 attachment、terminal/file/element context、remove/restore、route round-trip、cold restart、owned-server reconnect、一次受控 send failure、retry、唯一 canonical turn 和 assistant receipt。Electron/Web 是 authority；Browser-first 迭代，最终 exact-owned Native correlation。优先删除 renderer-local 产品决策；runtime-blocked picker/selection 不做虚假 workaround。每个 commit 后继续，直到 M1 exit gates 全部满足或正式 blocked。
