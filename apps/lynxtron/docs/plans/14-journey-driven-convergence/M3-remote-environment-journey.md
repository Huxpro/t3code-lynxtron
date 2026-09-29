# M3: Prove remote and multi-environment ownership

## Objective

Make remote readiness a real product property by completing the essential agent
journey against one supported remote environment without cross-environment leakage.

## Entry conditions

- M1 and M2 supported local journeys are complete.
- One disposable local environment and one supported remote environment are available.
- Pairing credentials and state are isolated from the user's live data.

## Required journey

1. Discover and select local and remote environments through shared catalog state.
2. Pair/authenticate through one supported LAN, relay, tunnel, or T3 Connect path.
3. Select a remote project, create a thread, send supported context, complete a real
   provider turn, and inspect the resulting transcript.
4. Disconnect and reconnect while preserving environment, project, thread, route,
   draft, and canonical sequence.
5. Exercise pairing expiry, permission failure, transport failure, server readiness,
   and product synchronization as distinct states.
6. Add negative tests preventing local resolution of remote files, attachments,
   terminal commands, preview URLs, and project actions.
7. Record compatibility decisions for Web, desktop, mobile, providers, contracts,
   local, direct remote, relay, and tunnel.

## Exit gates

- One local and one supported remote journey complete a turn and reconnect.
- Every scoped resource carries its environment owner.
- Wrong-environment commands and file access fail safely in focused tests.
- Connections explains the exact failure layer and recovery action.
- PF4 is complete for the named supported connection modes; unsupported modes have
  explicit decisions rather than implied parity.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M3：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M3-remote-environment-journey.md`，建立一个 disposable local environment 和一个受支持 remote environment，完成 discover/pair/select project/create thread/send/response/disconnect/reconnect 的连续旅程。所有 project/thread/file/attachment/terminal/preview/action 必须携带 environment ownership，并添加 wrong-environment negative tests。区分 pairing、auth、transport、server readiness 和 product sync 错误。不得使用 live `~/.t3/userdata`，不得把 remote policy smoke 当成完整 remote journey。持续到 PF4 exit gates 满足。

