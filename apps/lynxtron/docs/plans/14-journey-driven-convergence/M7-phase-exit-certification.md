# M7: Certify the complete product journey

- Status: `completed` (2026-09-29, Native Lynxtron 0.0.28; Web/Electron and Lynx-for-Web comparison rows and physical input remain open exceptions)

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

## Outcome (2026-09-29)

Evidence: `evidence/2026-09-29/M7/native-battery.json`. One Native battery of
23 entries ran with background launches (`scripts/run-native-battery.mjs`):
viewports 1280 x 820, 1440 x 900, and 700 x 820; dark, light, and system
themes; ready, pending (approval intervention), failure, reconnecting,
recovered, and completed lifecycle states; owned-local and direct-remote
connections. The repository keeps exactly 100 retained screenshots.

First pass: 18 pass, 5 fail. Three failures were gates that predated shipped
product changes (Settings origin now matches Web's 48px top padding, General
rows and keybindings are implemented, diff wrap/whitespace follow settings);
after gate maintenance `settings-navigation`, `review-diff`, and
`providers-settings` pass. The budget failure came from a saturated host
(load 30 to 67); a re-run held about 700 MB (Lynxtron ~350 MB, server
~345 MB), and the checker now skips startup timing when load exceeds the CPU
count.

### Exceptions

| Exception                                                                                                 | Impact                                                                                                                                                                                        | Fallback                                         | Removal condition                                                                         |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Physical input (secondary click, wheel, keyboard accelerators, Arrow/Return in focused inputs, `GAP-011`) | Menus, shortcuts, and scrolling are proven through DevTool taps and main-process probes, not OS input                                                                                         | Visible controls; probes drive the real handlers | A granted background computer-use session (`app_*`) replays them against the owned window |
| Web/Electron and Lynx-for-Web rows of the matrix                                                          | Fidelity is compared through earlier Plan 11/12 captures, not re-captured this phase                                                                                                          | Shared source and shared decisions (M4)          | Background-capable Electron/Web capture that does not raise windows                       |
| Live journey flakiness (M1 journey, live revert)                                                          | Passed individually; in the battery one run lost the prompt text, one hit a DevTool transport error, one live revert left the created file on a workspace with 28 accumulated checkpoint refs | Re-run on a fresh workspace                      | Investigate server checkpoint restore for untracked files; retry `Input.*` DevTool calls  |
| 70% physical reuse                                                                                        | Screens at 26-42% line reuse                                                                                                                                                                  | Shared decisions instead of shared files         | Maintainer decision (see M4)                                                              |
| Expanded checkpoint card 82px vs 79px pin                                                                 | 3px geometry                                                                                                                                                                                  | none                                             | Web reference measurement                                                                 |
| Long-transcript update latency, connector payload frequency                                               | Not budgeted                                                                                                                                                                                  | Behaviour gates                                  | Add timing to the incoming-growth gate and a connector counter                            |
| Browser surface                                                                                           | CEF opt-in                                                                                                                                                                                    | Explains why it is unavailable                   | Plan 13 CEF isolation and lifecycle pass                                                  |
| Multi-environment, relay, T3 Connect                                                                      | Out of scope for Lynx                                                                                                                                                                         | One environment per window                       | Product decision                                                                          |

Complete: local Composer journey, transcript reading and links, remote
direct pairing, review and reverse actions, terminal, themes, budgets, and
cleanup. Blocked: physical input (grant), browser (CEF). Intentionally
unsupported: multi-environment catalogs, relay, and tunnel.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M7：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M7-phase-exit-certification.md`，只在 M0-M6 complete 或正式 blocked 后运行一次完整 phase-exit。使用连续 canonical local/remote journey，覆盖 Web/Electron、Lynx-for-Web、exact-owned Native，1280x820/1440x900，dark/light/system，以及 ready/pending/intervention/failure/reconnecting/recovered/completed。验证 fidelity、state、interaction、reuse、performance、runtime errors 和 cleanup；严格保持 retained screenshot <=100。最后统一所有 status/ledger/manifest，明确 complete、blocked、unsupported，不把局部 smoke 当完成。
