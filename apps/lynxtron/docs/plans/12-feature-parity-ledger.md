# Plan 12 feature-parity ledger

Frozen on 2026-09-08 from the current Web/Electron product and the Plan 11
certified Lynxtron shell. A visible control counts as supported only when its
action reaches canonical server state and the UI observes completion or failure.

Status vocabulary: `required(this-plan)`, `deferred(reason)`,
`unsupported(runtime-gap-R#)`, and `not-applicable(product-reason)`.

## Primary journey

| Capability                  | Canonical state / Web entry                          | Shared owner                                           | Lynx state                                                                   | Reverse or completion         | Classification                                  | Smallest proof                                                                                         |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Select project/thread       | orchestration shell; Sidebar and palette             | shell reducer, Sidebar/palette projections             | working shared hosts                                                         | select another target         | required(this-plan)                             | fixture plus real tap                                                                                  |
| Create thread               | `thread.create`; Sidebar, palette, keybinding        | command contract and shell                             | connector + Sidebar host                                                     | delete/archive                | required(this-plan)                             | receipt and shell upsert                                                                               |
| Model and traits            | `ModelSelection`; Composer                           | model-picker and Composer projections                  | working picker/pills; provider rail no longer closes overlay                 | restore prior selection       | required(this-plan)                             | real Codex tap plus canonical update passed                                                            |
| Runtime/interaction mode    | thread mode commands; Composer                       | Composer projections                                   | working pills                                                                | choose prior mode             | required(this-plan)                             | real tap plus shell update                                                                             |
| Text draft                  | route-scoped draft store                             | Composer send state                                    | native textarea; hero promotion and host-persisted route drafts work         | clear draft                   | required(this-plan)                             | projection tests plus cold restart correlation                                                         |
| Image attachment            | upload/message attachment records; paste/drop/picker | attachment contracts and draft state                   | native picker and connector DTO path wired; draft UI incomplete              | remove/retry                  | required(this-plan)                             | add/remove/fail/retry/send receipts                                                                    |
| File context                | project-scoped path; `@` picker                      | file/path projections                                  | Files read result adds a removable, persisted Composer chip and prompt block | remove chip                   | required(this-plan)                             | projection tests plus Files-panel tap                                                                  |
| Terminal context            | terminal target and selected text                    | terminal-context projection                            | honest unavailable until PF6 terminal surface exists                         | remove chip                   | deferred(PF6 originating surface)               | navigation/reconnect persistence after PF6                                                             |
| Element/review context      | preview/review state                                 | context models                                         | originating surface absent                                                   | remove chip                   | deferred(PF5/PF6 originating surface)           | no premature affordance                                                                                |
| Send/stop turn              | turn start/interrupt receipts and stream             | dispatch/session projections                           | working text send plus canonical stopped receipt                             | next turn                     | required(this-plan)                             | deterministic stop passed; real provider turn remains                                                  |
| Approval                    | activity-derived request and approval response       | pending projection and shared panel/action anatomy     | working readable four-action Composer panel with canonical resolution        | cancel/decline/accept/session | required(this-plan)                             | deterministic decisions plus real Codex accept passed                                                  |
| Structured user input       | activity-derived questions and response              | pending-input projection and shared question anatomy   | working option/custom/previous/next/submit flow                              | previous/next/edit/submit     | required(this-plan)                             | deterministic option submit passed; multi/custom plus provider run                                     |
| Proposed-plan response      | proposed-plan state and source reference             | proposed-plan projections and shared follow-up anatomy | working current-thread and new-thread implementation handoff                 | revise/implement/build        | required(this-plan)                             | both implementation handoffs passed                                                                    |
| Failure/retry/resume        | lifecycle, session, turn error                       | lifecycle/transcript projections                       | connector retry plus send failure/draft retention/resend work                | retry or edit/resend          | required(this-plan)                             | deterministic failure/recovery passed; provider resume remains                                         |
| Long transcript             | timeline and follow state                            | transcript projection                                  | native list/Markdown islands                                                 | detach/re-stick               | required(this-plan)                             | long fixture; R12 for gesture                                                                          |
| Transcript card order       | message/work/plan timestamps                         | shared transcript projection                           | shared row projection + Lynx leaves                                          | fold/expand where supported   | required(this-plan)                             | approval and questions remain Composer intervention surfaces; do not duplicate them as transcript rows |
| Links/copy                  | Markdown targets and clipboard                       | Markdown/path projections                              | working explicit actions                                                     | return to thread              | required(this-plan)                             | link/copy fixture; R8 for selection                                                                    |
| Checkpoint summary          | checkpoint projection                                | diff projection                                        | compact tree works                                                           | open/close review             | required(this-plan)                             | completed-turn fixture                                                                                 |
| Full diff                   | canonical turn diff                                  | diff models                                            | bounded fallback                                                             | close/back                    | unsupported(runtime-gap-R10)                    | honest fallback and totals                                                                             |
| Files                       | list/read/write RPC                                  | file tree/save state                                   | working panel                                                                | close/back/save receipt       | required(this-plan)                             | list/read/write/failure                                                                                |
| Revert checkpoint           | revert command and receipt                           | orchestration command                                  | action absent                                                                | cancel or restored state      | required(this-plan)                             | exact-target confirmation                                                                              |
| Source control              | VCS status/actions                                   | VCS contracts/projections                              | status present; mutations incomplete                                         | cancel/retry                  | required(this-plan)                             | changed-repo fixture                                                                                   |
| Local environment           | primary environment                                  | environment state                                      | bundled connector works                                                      | reconnect                     | required(this-plan)                             | full local journey                                                                                     |
| LAN/relay/tunnel            | environment catalog                                  | environment/relay state                                | catalog/selection absent                                                     | switch/reconnect              | required(this-plan)                             | supported remote journey                                                                               |
| Multi-environment ownership | scoped environment IDs                               | scoped refs                                            | assumes primary environment                                                  | switch/return                 | required(this-plan)                             | wrong-environment rejection                                                                            |
| Settings                    | settings routes and mutations                        | shared panels/projections                              | core sections present                                                        | Back                          | required(this-plan)                             | navigation plus mutation                                                                               |
| Command palette             | global palette                                       | palette projection                                     | bounded Quick Switch                                                         | close/select                  | required(this-plan)                             | actions/thread/project queries                                                                         |
| Keybindings                 | settings and global shortcuts                        | keybinding resolver                                    | native Menu packet subset                                                    | customize/remove              | unsupported(runtime-gap-R5) for physical matrix | packet tests and authorized pass                                                                       |
| Terminal                    | drawer/right panel                                   | terminal contracts/panel state                         | approved placeholder                                                         | close/reopen                  | deferred(PF6 runtime decision)                  | capability/lifecycle proof                                                                             |
| Built-in browser            | preview/right panel                                  | preview state/panel chrome                             | approved placeholder                                                         | close/reopen                  | deferred(PF6 CEF/WebView decision)              | capability/lifecycle proof                                                                             |

## Surface decisions

| Surface  | Decision                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Web      | Product source of truth and fast validation path. Shared changes must preserve its behavior.                         |
| Electron | Desktop visual and interaction reference, including current terminal/browser behavior.                               |
| Lynxtron | PF1-PF8 target. Renderer differences stay in bounded native primitives/capabilities.                                 |
| Mobile   | No Lynx UI work here; shared contracts/presentations must remain compatible and receive focused checks when changed. |

## Provider decisions

All five server adapters expose canonical approval and structured-input response
operations: Codex and Claude use their native runtimes; Cursor and Grok use ACP
permission/question handling; OpenCode uses permission/question replies. These
paths are `required(this-plan)`. PF1 must still expose pending state and commands
through the Lynx connector, render shared interactions, and prove one real
provider path. Unsupported native policy choices must stay visibly unavailable.

## Connection-mode decisions

Bundled local, LAN/direct remote, managed relay/T3 Connect, tunnel-backed
environments, and multiple-environment ownership are `required(this-plan)` where
the Web product supports them. Commands, attachments, files, and routes must keep
their environment ID. A missing account or external relay is an evidence blocker,
not permission to substitute localhost behavior.

## Entry-point inventory

- Chat: Composer, intervention panels, transcript cards, right-panel review,
  stop/retry, terminal, and browser controls.
- Sidebar: Search/Quick Switch, New thread, project scope, thread actions,
  Settings, archive, settle, and snooze where capabilities allow.
- Settings: General, Appearance, Providers, Connections, Keybindings, Source
  Control, Beta, Diagnostics, and Archive. Lynx lacks dedicated Appearance and
  Diagnostics routes; PF7 owns those gaps.
- Command palette: projects, threads, New thread, Settings, file/project search,
  model picker, diff, terminal, and editor/open actions. Lynx currently exposes
  a bounded subset and must not advertise unavailable commands.
- Keybindings/native Menu: New thread, Quick Switch, and Settings packets work;
  the full physical keyboard/focus matrix remains R5.

## First implementation boundary

PF1's deterministic intervention slice now covers approval resolution,
structured option input, current-thread and new-thread plan implementation, and
one failed send followed by a successful retry. The recovery proof retains the
draft, exposes an actionable error, suppresses an immediate duplicate click, and
advances canonical turn state on retry. One real supported-provider path remains
required; the current isolated Claude attempt is blocked by expired OAuth rather
than accepted as feature evidence.
