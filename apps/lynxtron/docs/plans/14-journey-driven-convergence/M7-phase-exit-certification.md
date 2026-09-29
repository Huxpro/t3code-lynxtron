# M7: Certify the complete product journey

## Objective

Run the expensive phase-exit battery once against continuous canonical local and remote
journeys, then reconcile every release document and open exception.

## Entry conditions

- M0-M6 are complete or formally blocked with approved fallbacks.
- One canonical snapshot supports the complete local journey and a corresponding remote
  environment journey.
- Screenshot capacity has been freed or an explicit replacement plan preserves the
  repository limit of 100.

## Required matrix

- Clients: Web/Electron, Lynx-for-Web, Native Lynxtron.
- Viewports: 1280 x 820 and 1440 x 900.
- Themes: dark, light, and system where applicable.
- Lifecycle: ready, pending, intervention, failure, reconnecting, recovered, completed.
- Connection: local and one supported remote mode.
- Journey: project selection, compose/context/send, provider response, structured
  intervention, long transcript, review, reconnect, Settings, command palette, and
  accepted keybindings.

## Required reports

1. Exact build, executable, state, environment, project, thread, route, viewport, theme,
   and bundle identity.
2. Fidelity, content/state, interaction, source reuse, compatibility, bundle, startup,
   long-list, memory, renderer errors, and cleanup.
3. Web/desktop/mobile/provider/contract/connection-mode decisions for every changed
   cross-surface feature.
4. Final exception table with runtime gap, fallback, owner, impact, and removal condition.

## Exit gates

- Complete local and supported remote journeys require no return to Web.
- Every required action has entry, state, completion, failure, and reverse behavior.
- No retained frame has identity, state, dimension, bundle, console, or cleanup invalidity.
- Ordinary UI meets reuse and fidelity thresholds or has approved hard-island exceptions.
- `implementation-status.md`, `port-ledger.md`, `compat-matrix.md`, gap atlas, Plan 12,
  Plan 14, and evidence manifests agree.
- The handoff identifies exactly what is complete, blocked, and intentionally unsupported.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M7：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M7-phase-exit-certification.md`，只在 M0-M6 complete 或正式 blocked 后运行一次完整 phase-exit。使用连续 canonical local/remote journey，覆盖 Web/Electron、Lynx-for-Web、exact-owned Native，1280x820/1440x900，dark/light/system，以及 ready/pending/intervention/failure/reconnecting/recovered/completed。验证 fidelity、state、interaction、reuse、performance、runtime errors 和 cleanup；严格保持 retained screenshot <=100。最后统一所有 status/ledger/manifest，明确 complete、blocked、unsupported，不把局部 smoke 当完成。

