# M2: Close transcript and physical-input residuals

- Status: `completed` (2026-09-29, Lynxtron 0.0.28; physical-input checks pending a user session)

## Objective

Finish the supported reading and interaction loop for long transcripts, structured
content, links, menus, and discrete keyboard commands.

## Entry conditions

- M1 local Composer journey is complete or formally runtime-blocked.
- One canonical long-thread fixture contains Markdown, tools, plan, approval/question,
  checkpoint, links, images, errors, and incoming growth.

## Required work

1. Prove anchoring, follow-tail, detached reading, incoming growth, and explicit
   re-stick with Web CDP and exact-owned Native wheel/selection channels.
2. Close file-link and external-link context menus: open, copy, disabled/pending,
   failure feedback, and environment ownership.
3. Close supported Command Palette and Quick Switch navigation through the shared
   resolver and physical input.
4. Audit Archive destructive mutation and other high-residual button/menu paths for a
   shared input-primitive defect before adding local patches.
5. Revalidate recycled row expansion, Markdown task mutation, plan export/save,
   checkpoint navigation, copy actions, and retry state.
6. Keep Model Picker focused-input Arrow/Return and Composer Command+A under GAP-011
   unless a current upstream runtime proves otherwise.

## Exit gates

- Reading history is never stolen by incoming content.
- Link/context actions have physical input plus canonical postconditions.
- Supported accelerators reach one shared resolver with exact packet semantics.
- Every remaining input gap is either fixed at the shared primitive or formally
  blocked with upstream evidence and a usable visible fallback.
- PF3 leaves `in_progress`.

## Outcome (2026-09-29)

Evidence: `evidence/2026-09-29/M2/transcript-and-input.json`. The canonical
long thread is `prepare-long-transcript-projection-fixture --rich`: 120 turns,
255 timeline rows, with every tenth turn carrying workspace and external
links, code, a task list, a table, tool and error activity, proposed plans, and
a checkpoint. Images and pending approval/question keep their dedicated
fixtures because they need stored attachments or change the thread state.

Product and platform changes made during M2:

- Lynx core ships a partial `URL` (only `href`/`searchParams`); the pre-entry
  now installs core-js's WHATWG URL. Before this, external-link menus never
  opened and every shared helper reading `hostname`/`pathname` misread.
- `toast.lynx` was a silent stub; it now renders the shared toast manager.
- Transcript file and external link menus use the shared Web contracts,
  including copy and failure toasts.
- Probe-only main hooks: menu-item click by id, context-menu selection, and a
  clipboard sink, so headless gates exercise the real handlers.

| Requirement        | Status               | Evidence                                                                                                                    | Remaining boundary                                                                                                     |
| ------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Product entry      | complete             | Rich thread opens, recycles (node rebinding on 255 rows), follows the tail                                                  | none                                                                                                                   |
| Canonical state    | complete             | A reader parked at turn 60 keeps the same top row (offset 0) while a real OpenCode reply grows the thread 255→258 rows      | none                                                                                                                   |
| Completion receipt | complete             | Jump re-sticks to `following-end` after growth                                                                              | none                                                                                                                   |
| Failure/retry      | partial              | Transcript error rows render in the rich fixture; message cards, approval, review diff, and diff scope gates pass on 0.0.28 | Re-expanded checkpoint card is 82px vs pinned 79px on 0.0.28; the toggle itself works (M4 re-diagnosis, carried to M5) |
| Reverse action     | complete             | Detach → Jump, menu open → outside dismiss, runtime mode select                                                             | Corner outside-taps miss the runtime menu layer (`GAP-014`, M4)                                                        |
| Web/Lynx parity    | complete             | Link menus share items and toast text with Web; file picker footer matches Web's ProjectFilePicker                          | Web shows the external-link menu only with an integrated browser; Lynx always offers system browser + copy             |
| Native interaction | pending-user-session | Menu/context-menu probes drive the real main handlers; DevTool touches carry no mouse button                                | Physical wheel, secondary click, Command+K/Arrow/Return, and nested-label clicks on Delete confirm carry to M7         |
| Source reuse       | partial              | Link menus and toasts moved onto shared source                                                                              | Runtime menu should move to the shared Menu primitive (M4)                                                             |
| Cleanup            | complete             | Probe hooks are gated by `T3_LYNXTRON_VIEWPORT_PROBE`; the clipboard sink never touches the system clipboard                | none                                                                                                                   |

Exit gates: reading history is never stolen (proven headlessly); accelerators
reach the shared resolver (Command+K menu item → packet → resolver); remaining
input gaps are either fixed at a shared primitive (URL, toasts, link menus) or
recorded (`GAP-011` held upstream, `GAP-014` for M4, physical checks for M7).
PF3 leaves `in_progress`.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M2：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M2-transcript-and-input-closure.md`，用一个 canonical long-thread fixture 关闭 transcript 阅读和真实输入残余。覆盖 follow/detach/incoming growth/Jump、file/external link context menu、copy/open/failure、Command Palette/Quick Switch shared resolver，以及 Archive destructive mutation 的 shared primitive 审计。Web CDP 只证明 Browser，Native keyboard/wheel/menu 必须用 exact-owned Computer Use。GAP-011 不叠加本地 workaround。持续到 PF3 完成或所有剩余项正式 runtime-blocked。
