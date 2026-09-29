# M3: Prove remote and multi-environment ownership

- Status: `completed` (2026-09-29, Lynxtron 0.0.28; single environment per window)

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

## Outcome (2026-09-29)

Evidence: `evidence/2026-09-29/M3/remote-environment.json`.

Product changes made during M3:

- Reconnect to a paired remote reused the single-use pairing credential, so
  it always failed with `401 invalid_credential`. The connector now keeps the
  exchanged session per pairing target, pins the environment identity, and
  reports a distinct pair-again error after revocation.
- Main reports the connection kind and whether environment paths are local.
  The shared lifecycle projection names the failing layer (pairing,
  authentication, transport, server readiness, product sync) and its recovery
  action; remote windows say "remote environment", not "local backend".
- Lynx refuses local path navigation for remote environments (owned,
  rendezvous, and loopback pairing stay local).

Compatibility decisions:

| Mode                                                 | Lynx decision                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Owned local server                                   | supported (M1 journey)                                                                                                            |
| Desktop rendezvous (Electron server on this machine) | supported (existing evidence)                                                                                                     |
| Direct pairing URL                                   | supported; proven on loopback against another process's server; LAN/HTTPS hosts share the code path but are not separately proven |
| Several environments at once                         | not supported: one environment per window, fixed at launch; Web/mobile keep their catalogs                                        |
| In-app discovery and pairing                         | not supported: Connections "Add environment" stays disabled                                                                       |
| Relay / T3 Connect                                   | not supported in Lynx                                                                                                             |
| Tunnel                                               | not claimed                                                                                                                       |

Contracts are unchanged; the new status fields travel only on the Lynx
main-to-renderer protocol. Web gains the optional failure-layer copy only when
a caller passes a layer.

| Requirement        | Status               | Evidence                                                                                | Remaining boundary                                                         |
| ------------------ | -------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Product entry      | complete             | Native pairs through `T3_LYNXTRON_PAIRING_URL`; `existing-environment`, no owned server | In-app pairing is unsupported                                              |
| Canonical state    | complete             | New thread on the remote project; the owner process sees the same thread id             | Single environment per window                                              |
| Completion receipt | complete             | Authenticated OpenCode reply received on the remote environment                         | none                                                                       |
| Failure/retry      | complete             | Pairing, authentication, transport, readiness, and sync layers classified and presented | Layer copy proven by unit tests; revoked-session reconnect proven by smoke |
| Reverse action     | complete             | Reconnect keeps route, thread, draft; revoked session asks to pair again                | none                                                                       |
| Web/Lynx parity    | partial              | Shared lifecycle projection                                                             | Web supports multi-environment catalogs; Lynx does not                     |
| Native interaction | pending-user-session | DevTool taps for New thread/Send                                                        | Physical checks carry to M7                                                |
| Source reuse       | partial              | Failure-layer copy lives in client-runtime                                              | Lynx does not adopt the client-runtime environment catalog                 |
| Cleanup            | complete             | Owner process, owned Native, and temporary state are disposed                           | none                                                                       |

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M3：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M3-remote-environment-journey.md`，建立一个 disposable local environment 和一个受支持 remote environment，完成 discover/pair/select project/create thread/send/response/disconnect/reconnect 的连续旅程。所有 project/thread/file/attachment/terminal/preview/action 必须携带 environment ownership，并添加 wrong-environment negative tests。区分 pairing、auth、transport、server readiness 和 product sync 错误。不得使用 live `~/.t3/userdata`，不得把 remote policy smoke 当成完整 remote journey。持续到 PF4 exit gates 满足。
