# Complete Lynxtron feature parity by product value

Plan 11 makes the existing Lynxtron shell trustworthy. This plan starts only after that proof passes and closes the remaining gap to the current Web/Electron product in the order users experience value: finish an agent turn, intervene safely, work remotely, review the result, and only then expand secondary work surfaces and platform polish.

Execute tasks in order unless a task explicitly allows independent runtime work. Keep one task in progress, commit and push each completed task separately, and preserve an explicit fallback for every open Lynxtron capability gap.

## Plan metadata

- Content type: How-to
- Status: Queued after Plan 11
- Audience: Agents continuing the T3 Code Electron-to-Lynxtron port
- Goal: Let a user complete and review a real local or remote coding-agent turn in Lynxtron without returning to Web for any required step
- Scope: `apps/lynxtron`, physically shared Web compositions, `packages/client-runtime`, `packages/contracts`, and the minimum desktop/server boundaries needed by a cross-surface feature
- Product source of truth: Current Web/Electron behavior in the same checkout
- Entry condition: Plan 11 OC7 is complete with O1–O5 passing
- Release target: Advance beyond `chat-first-preview` only when the required product journey and phase-exit gates in this plan pass
- Branch: `lynxtron-port` in `/Users/bytedance/github/t3code`
- Push target: `lynxtron/lynxtron-port` over SSH
- Created: 2026-08-01

## Product decision

Feature parity is not a count of visible controls. A feature counts only when the user can enter it, understand its state, complete or reverse its action, and see the result through canonical server state.

Use this value order:

1. **Complete the agent loop.** A user can send context, answer the agent, approve or reject work, recover from failure, and finish the turn.
2. **Preserve remote readiness.** The same essential loop works across local, LAN, relay, tunnel, and multiple environments where Web supports them.
3. **Review what changed.** A user can understand checkpoints, diffs, files, and source-control state before trusting the result.
4. **Expand desktop work surfaces.** Terminal and browser follow the complete chat-and-review journey; they do not delay it.
5. **Close platform quality gaps.** Performance, theme, input, fonts, SVG, and selection are certified after they support the higher-value flows.

This order intentionally puts agent intervention and remote use above editor, terminal, browser, and decorative fidelity. Those later surfaces remain honest product-quality placeholders until their own task closes.

## Entry baseline from Plan 11

Do not start PF work by reopening Plan 11 outcomes. Treat these as required invariants:

- three fresh packaged starts reach semantic readiness without reload;
- one navigation authority keeps Settings stable;
- lifecycle status is visible and truthful;
- Sidebar V2, Composer shell, and stage branding pass their product checks;
- shared product compositions remain the owners and Lynx files remain bounded platform leaves;
- slice verification follows the tiered harness and does not substitute screenshots for connector or input evidence.

If an invariant regresses, fix it inside the active PF task and add a focused regression test. Do not create a parallel cleanup phase.

## Priority and task sequence

| Priority | ID  | Product capability                                    | Depends on | Status      | User-visible exit                                                                       |
| -------- | --- | ----------------------------------------------------- | ---------- | ----------- | --------------------------------------------------------------------------------------- |
| P0       | PF0 | Rebaseline the complete Web feature journey           | Plan 11    | `completed` | One fixed parity ledger identifies required, deferred, unsupported, and blocked paths   |
| P1       | PF1 | Complete agent intervention and recovery              | PF0        | `completed` | Approval, user input, plan response, failure, retry, stop, and resume work end to end   |
| P1       | PF2 | Complete Composer input and context                   | PF1        | `completed` | Attachments, images, file/terminal context, draft, pending, and send states are usable  |
| P1       | PF3 | Complete transcript navigation and interaction        | PF2        | `completed` | Long turns, Markdown, follow mode, discrete commands, and real input behave predictably |
| P1       | PF4 | Complete remote and multi-environment operation       | PF3        | `pending`   | A user can find, connect to, diagnose, and operate supported remote environments        |
| P2       | PF5 | Complete change review, checkpoints, and files        | PF4        | `pending`   | A user can inspect the result and its source-control implications without Web           |
| P2       | PF6 | Expand terminal and browser work surfaces             | PF5        | `pending`   | Approved placeholder surfaces are replaced only where the runtime can support them      |
| P2       | PF7 | Close performance, theme, and remaining platform gaps | PF6        | `pending`   | Long sessions remain fast and required theme/input/runtime gates have evidence          |
| P3       | PF8 | Certify the end-to-end Lynxtron product journey       | PF7        | `pending`   | Local and remote journeys pass the complete phase-exit evidence matrix                  |

Use only `pending`, `in_progress`, `completed`, `blocked(runtime-gap-id)`, or `skipped(reason)`. Only one task may be `in_progress`.

## PF0: Rebaseline the complete Web feature journey

Freeze the actual product boundary before implementing more controls. Use a populated, realistic snapshot and trace one current Web/Electron journey from project selection through completed work and review.

### Required work

1. Inventory every user-reachable state in the selected journey across chat, Settings, command palette, and keybindings.
2. Record decisions for Web, desktop, mobile, each provider adapter, contracts, and local/remote connection modes where the feature applies.
3. Classify each Web capability as:
   - `required(this-plan)`;
   - `deferred(reason)`;
   - `unsupported(runtime-gap-R#)`;
   - `not-applicable(product-reason)`.
4. Map each required capability to its canonical state, shared composition owner, Lynx primitive or island, reverse action, and smallest acceptance proof.
5. Update the compatibility ledger for every previously implicit difference. Do not change reuse exclusions or screenshot masks.

### Exit criteria

- The ledger covers the whole selected user journey rather than only currently rendered Lynx controls.
- Every visible Lynx affordance maps to working behavior or an explicit unavailable presentation.
- No task below depends on an unnamed product or runtime decision.
- This task changes documentation and fixtures only; production behavior remains unchanged.

## PF1: Complete agent intervention and recovery

The primary product is directing an agent, not merely reading its transcript. Close all server-driven moments that require a user decision before adding secondary desktop surfaces.

### Required capability set

- approval requests, including approve, reject, and policy choices supported by the provider;
- pending user input and follow-up questions;
- proposed-plan review, acceptance, revision/follow-up, and implementation handoff;
- stop/interrupt, resume, retry, and actionable turn failure;
- provider-authentication or unavailable-provider states that block the turn;
- visible pending and settled receipts so an action cannot appear successful before canonical confirmation.

### Architecture rules

1. Consume the existing contracts and shared projections; change `packages/contracts` only when the wire truly lacks required state.
2. Complexity belongs in provider and platform adapters. Shared orchestration and presentation must not branch on renderer identity.
3. Each action needs entry, cancellation or reverse behavior where valid, disabled/pending feedback, failure feedback, and canonical completion.
4. Do not model an intervention as transcript text when Web treats it as structured state.
5. Decide support explicitly for Codex, Claude, Cursor, Grok, and OpenCode.

### Exit criteria

- A fixture and at least one real supported provider path cover every required intervention state.
- A user can complete a turn that pauses for input or approval without opening Web.
- Duplicate taps cannot submit the same decision twice.
- Failure and retry preserve the thread and explain the recovery path.

## PF2: Complete Composer input and context

Plan 11 certifies the Composer shell. This task makes it a complete input surface.

### Required capability set

- image and file attachments, including preview, removal, upload failure, and resend behavior;
- file, terminal, and other supported context chips from canonical context state;
- persisted draft and restoration across route changes or reconnects where Web preserves it;
- pending, sending, disabled, interruptible, failed, and retry states;
- model, reasoning, access/runtime, interaction mode, checkout, and branch behavior equivalent to Web;
- paste/drop/select entry points only where the Lynxtron runtime can prove them.

### Architecture rules

1. Keep shared control order, labels, layout variants, validation, and context projection in the shared Composer composition.
2. Keep native input, picker, clipboard, focus, and selection mechanics in capability leaves.
3. Do not display a shortcut, drop hint, or attachment affordance whose real input path has not passed acceptance.
4. Remote file references must identify their owning environment and must not be resolved against the local host accidentally.

### Exit criteria

- The same draft with text, image, file, and context fixtures projects equivalently in Web and Lynx.
- Add/remove/fail/retry/send behavior is proven through canonical receipts.
- Draft and context survive the scoped navigation and reconnect paths defined by Web.
- R5-dependent typing, focus, paste, or selection checks remain `pending-user-session` until one authorized real-input pass is recorded.

### Current progress

- Native Composer text now has a thread-scoped owner instead of component-local
  state. A 1280 x 820 exact-bundle run proves a local draft can leave for a
  canonical thread and return with the same draft ID, text, send state, and no
  placeholder while preserving the canonical thread set.
- The native textarea synchronizes restored controlled state through its
  capability leaf without taking focus or selection on ordinary keystroke
  renders.
- Draft text uses stable canonical-thread or local-project scope keys, is
  debounced into isolated preferences, strictly decoded, and survives an owned
  cold restart into a second exact-bundle process.
- Connector reconnect restoration now preserves the same local route, draft
  text, terminal context, and element context across a real owned-server
  `SIGKILL` and replacement-server reconnect. The Composer is disabled during
  the failure and returns to sendable only after the main sequence advances.
  This checkpoint does not satisfy the remaining PF2 real-input criteria by
  itself.
- Attachment upload DTOs now cross the shared command builder, Browser live
  connector, Native main bridge, and server normalizer. Native draft state can
  render and remove the same 64 px image-card anatomy and preserves attachments
  after a failed send, clearing them only on success. The user-visible native
  picker remains hidden because Lynxtron 0.0.21 `dialog.showOpenDialog` triggers
  `FiberSetAttribute param 0 should be RefCounted` in three independent real
  window trials; no broken affordance is shipped. Strictly decoded attachment
  state now survives an owned cold restart together with draft text and context
  chips. A one-shot main-bridge failure gate now proves the first send leaves
  the local draft unpersisted and preserves its text, image preview, terminal
  chip, and file chip. Retrying the same Composer action creates one canonical
  thread, persists a provider-decodable image plus both context forms, receives
  the expected authenticated OpenCode reply, and clears all four draft inputs
  only after success.
- Web and Native now share terminal-context normalization, labeling, block
  serialization, and prompt append behavior. The Native terminal surface can
  add its latest 50 history lines to the scoped Composer, where a context-only
  draft is sendable and the chip can be removed. One exact-bundle gate proves
  the `Terminal 1 lines 2-3` fixture, measured removal, main transport, zero
  renderer errors, attachment regression coverage, route restoration, and an
  owned cold restart. Terminal contexts are strictly decoded by stable scope and
  now survive an owned cold restart as well. A real authenticated OpenCode turn
  proves the canonical user message keeps the serialized context and receives
  an exact assistant reply. The same Codex path reached canonical persistence
  but its assistant run was externally blocked by the account usage limit. PF2
  stays `in_progress` for final real-input closure and matched Web/Lynx
  attachment evidence.
- Web and Native now also share element-context normalization, identity dedupe,
  labels, source labels, scoped restoration, removal, and prompt serialization.
  A same-snapshot 1280 x 820 dark gate proves the guarded real Web draft action,
  Native context-only sendability and physical Computer Use removal, strict
  persistence across an owned cold restart, failed-send preservation, and
  serialization into the canonical user message on retry. The successful retry
  clears the context only after the canonical turn is created. The user-facing
  Preview picker entry and paired pixels remain explicit residuals.
- Native file mentions now use the Web authority's canonical Markdown-link
  serializer while rendering as scoped Composer chips. The Composer `@` picker
  creates a chip, removal restores the disabled empty state, and strict
  persistence restores the same file context after a cold restart. Files-panel
  Add to chat targets the same scoped action. Drag/drop remains unsupported,
  and PF2 remains `in_progress` for final real-input acceptance and matched
  Web/Lynx attachment evidence.
- A fresh same-snapshot attachment gate now drives Electron through the real
  ClipboardEvent paste path and Native through its existing scoped attachment
  fixture, then removes the card through each real surface. On snapshot
  `713c57c55ffbdff7156d8df4defb4ea3e825fc0b6d4f007baf5f144a98da1e16`,
  both dark 1280 x 820 renderers use a 768 px Composer frame, 766 px surface,
  734 px attachment strip, 64 px card, 62 px cover preview, 10 px card corners,
  and a 24 px Remove target with a 5 px top/right inset. Native now uses explicit column flow instead
  of splitting attachment and editor children horizontally, and layers Remove
  above the aspect-fill image. All 23 scoped checks pass, including the complete
  frame/surface size; only the file-dialog runtime blocker and paired pixels
  remain explicit boundaries.
- A real owned-server `SIGKILL` and Reconnect cycle now proves the same local
  draft ID, chat route, draft text, and terminal context survive both the
  connection-error state and the replacement server. Submission is disabled
  while disconnected and returns to sendable after the main sequence advances
  on the recovered server. PF2 remains open for final real-input closure and
  matched Web/Lynx attachment evidence.
- Two fresh exact-owned Computer Use runs reached the expected add-project and
  new-thread postconditions through real macOS clicks, but Lynxtron 0.0.21 raised
  `FiberSetAttribute param 0 should be RefCounted` immediately after each tap.
  Those frames are invalid acceptance evidence, so final real-input closure is
  runtime-blocked rather than silently counted as passing.
- Native Un-settle now scopes pending and failure feedback to the target thread,
  disables duplicate requests, exposes retryable errors in the settled banner,
  and rejects a missing bridge instead of silently reporting success.

### PF2 closure (Plan 14 M1, 2026-09-29)

PF2 is `completed` for supported inputs. The Plan 14 M1 journey
(`evidence/2026-09-29/M1/local-journey.json`) carries a pasted image, a
Terminal-panel context, a picked file mention, an element context, and text
through remove/restore, a route round-trip, a cold restart, a reconnect, and a
failed then retried send into exactly one canonical turn, with Web/Electron
payload parity on the same snapshot. Bounded residuals: Command+A selection
(`GAP-011`, Plan 14 M2), image drag-and-drop (`GAP-013`), the Native element
picker entry (Plan 14 M6), and physical-input correlation
(`pending-user-session`, Plan 14 M7).

## PF3: Complete transcript navigation and interaction

A working agent loop must remain usable across long output, structured Markdown, and new content arriving while the user reads history.

### Required capability set

- anchoring-new-turn, follow-tail, detached-reading, and explicit re-stick scroll modes;
- Markdown tables, nested lists/blocks, code blocks, links, images, and registered fallbacks;
- checkpoint, turn-diff, tool, reasoning, plan, question, approval, error, and retry cards in canonical order;
- selection/copy fallback, link opening, collapsed/expanded state, and supported card actions;
- renderer-neutral discrete keyboard packets and commands for new thread, quick switch, Settings, and other proven accelerators;
- physical Tab, Escape, arrows, focus traversal, wheel, drag, and selection only after a real user-session acceptance.

### Architecture rules

1. Preserve one transcript projection and one scroll-mode state machine. Do not create Lynx-only meanings for canonical events.
2. Use `sendGlobalEvent` and the shared keybinding resolver for discrete Menu accelerators; do not claim full keyboard injection.
3. Keep R5 and R12 boundaries explicit. Headless taps and screenshots cannot certify keyboard, focus, wheel, drag, or selection.
4. Long transcripts must use bounded rendering and must not re-render the whole timeline for an unrelated connector update.

### Exit criteria

- Long-turn fixtures preserve order, card anatomy, and Markdown meaning without clipped or inaccessible content.
- Incoming content follows only in the correct scroll mode; reading history is not stolen.
- Discrete accelerators reach the shared resolver with exact packet semantics.
- Real-input checks are either passed in one authorized user session or remain visibly blocked by their runtime gap.

### Current progress

- Web's three-state scroll-mode vocabulary and anchored-turn geometry are now
  owned by `client-runtime/presentation/transcript` instead of a Web-private
  module. Web consumes the shared source directly, while Lynx already consumes
  the same module for follow/detach and new-turn anchoring. The original six
  LegendList geometry cases now run with the shared transcript tests. A shared
  three-state reducer now owns begin-turn anchoring, explicit user detach,
  re-stick, and thread-reset transitions; Web routes each mode change through
  it, and Lynx now stores the shared three-state mode directly. An exact-bundle
  gate proves `following-end -> free-scrolling ->
following-end` with the jump affordance visible only while detached. That gate
  also caught and fixed an asynchronous-hydration bug where empty startup state
  followed by canonical history was misclassified as a new turn. Same-snapshot
  position correlation and the real wheel-away/return-to-end and incoming-growth
  paths are now covered below. A fresh 240-row
  exact-owned Native run uses Computer Use wheel input to move the visible tail
  from turns 119-120 to 105-108, enters `free-scrolling`, and exposes Jump to
  latest. A real click on that control returns to turns 118-120, restores
  `following-end`, hides the affordance, and leaves the renderer console clean.
  While physically detached on the same 240-message thread, an authenticated
  OpenCode turn grows the projection to 242 messages and 243 rows without
  moving the visible 105-108 range or leaving `free-scrolling`; a second real
  Jump to latest click exposes the new turn and restores `following-end`.
  The matching Electron gate loads the fresh `t3code:` entry asset and moves
  from `scrollTop=21662` to `19862`, leaving turn 120 for turns 110-113 while
  exposing its Jump affordance. Native leaves turn 120 for turns 105-108 under
  real OS wheel input; exact offsets intentionally remain renderer-specific.
  The standalone transcript-scroll verifier is now diagnostic-only: it requires
  an explicit owned DevTool client/session and injects renderer probes without
  claiming physical wheel or pointer acceptance.
  Native now also consumes the shared structural-row cache already used by Web:
  when a streaming tail changes, unchanged historical row objects retain their
  identity so connector updates do not force the whole timeline to re-render.
  Message and proposed-plan rows now compare value-equal connector payload clones
  structurally rather than requiring the same object reference, while real field
  changes still invalidate only the affected row.
  Copy feedback state now lives inside the selected message's copy control, so a
  pending/success/failure transition no longer rebuilds the parent row-elements
  contract and invalidates every visible transcript row; recycled controls also
  cancel their reset timer on unmount.
  The Native minimap now tracks hover/preview state by stable user-message ID
  instead of array index, so inserted, folded, or replaced rows cannot silently
  redirect the preview to a different turn. Selecting a minimap turn now also
  clears the hover preview and detaches follow mode before scrolling, so incoming
  streaming content cannot steal the chosen history position.
  Expanding or collapsing a historical turn/work group uses the same manual-
  navigation detach path, preserving the reader's position instead of letting a
  subsequent streaming update snap back to the live edge.
  Minimap user previews now use a shared visible-message projection that strips
  trailing terminal/element context payloads while preserving the canonical raw
  text for copy and provider history. Web's detailed context parser delegates its
  visible/copy boundary to the same helper.
  Native user bubbles now use that visible projection too: canonical context
  payloads remain available to copy/provider history, while the transcript shows
  a compact terminal/element-context summary instead of raw XML blocks.
  Context-only or attachment-only messages no longer allocate an empty Markdown
  body below those extras.
  User-bubble width estimation also uses visible text, so hidden context payloads
  cannot stretch a short authored message to the maximum bubble width.
  Web and Native now share the same long-message collapse threshold (more than
  600 characters or eight lines). Native resets expansion by message identity
  and detaches follow before Show full/Show less changes the row height.
  Review-comment parsing and fence formatting now live in
  `client-runtime/presentation/review-comment` instead of the Web renderer. Web
  retains only its schema, serialization, and Pierre diff integration, while
  Native renders the same provider payload as a structured path/range/comment/
  context card instead of exposing raw `<review_comment>` tags. The shared row
  semantic text hook now records renderer-visible content for user messages, so
  hidden element/review wrappers no longer leak through transcript attributes.
  Paired same-thread semantic runtime evidence is now recorded below; paired
  pixels and card interactions remain open.
  Preview-annotation presentation parsing is shared as well: both renderers peel
  one or more trailing annotation payloads from authored text in the same order.
  Native now pairs `preview-annotation-*` attachments with compact annotation
  cards, keeps unrelated attachments in their normal list, and no longer exposes
  the raw annotation or nested element-context payload in the visible message.
  Paired annotated-preview semantics are now recorded below; image/lightbox
  interaction and paired pixels remain open.
  The renderer-neutral user-message semantic projection now applies the same
  context, preview-annotation, and review-comment pipeline to transcript row
  attributes and minimap previews. Long-thread navigation therefore shows
  authored text and readable review summaries instead of raw provider wrappers.
  Terminal and element context parsing is now shared at that same boundary.
  Native renders the real terminal range or element/component header for each
  attached context, with its body retained as accessible semantics, instead of
  collapsing all context into a generic type/count label.
  Web and Native cache this full user-message presentation by stable message
  object, and the minimap accepts the cached semantic-text projector. Large
  context/review payloads are therefore parsed once per stable row instead of
  once for bubble sizing, extras, body, metadata, and navigation preview. This
  was initially implementation coverage and is now backed by the exact-owned
  long-thread runtime measurement below.
  The shared block parser now also retains absolute source offsets for task-list
  markers whose source prefixes are intact. Lynx Files adds the same explicit
  Source/Rendered choice as Web for `.md`/`.mdx`, and rendered task markers use
  the existing shared `setMarkdownTaskChecked` mutation plus the existing file
  save coordinator. On exact-owned PID `15807`, window `90160`, physical
  ArrowDown/Enter opened an isolated `README.md`, pointer input selected
  Rendered and checked `First task`, and the file changed only from `[ ]` to
  `[x]` at that marker. Native reported `saved`, no save error, main sequence
  17, and zero renderer errors before cleanup. Transcript task markers remain
  read-only. The shared parser now propagates exact original line offsets through
  blockquote prefixes and multiline details bodies, so those nested file-preview
  tasks are mutable as well. On exact-owned PID `42621`, window `90511`, physical
  pointer input checked one blockquote task and one open-details task; both exact
  markers persisted, save status returned to `saved`, main transport reached
  sequence 14, and renderer errors stayed empty. Single-line inline-details tasks
  remain read-only because their body is still an inline substring without an
  absolute source range.
  The subsequent Electron source-of-truth pass corrected that boundary: Electron
  exposes one interactive checkbox for the blockquote task but renders the
  multiline-details task as literal Markdown. Native therefore retains only the
  blockquote mutation and reverts the technically possible details mutation. On
  snapshot `c2307357b08682e368d891a4a798847373e69f2225448655baadfe70334245c5`,
  both 1280 x 820 dark surfaces changed only `> - [ ] Quoted task` to checked,
  preserved `- [ ] Detailed task`, and produced the same SHA-256
  `b6292aa2765e06688ff2b70b98abc0c4df9fc431d697f50572719c3175fe0d52`.
  The Electron runner now binds `apps/web/dist` explicitly instead of accepting
  the server's older staged client fallback. It proves entry asset
  `index-BxbOs3Ye.js` at SHA-256
  `2bcc4c2ab79d2546c2f18e990e2da416fbd828557410067d43bc2e723cdb5a90`;
  both surfaces expose one open disclosure, zero task inputs inside it, and the
  same literal body. All 20 paired checks pass.
  Web's existing `MarkdownDetails` component had also been unreachable because
  the sanitizer omitted `details`, `summary`, and `open`. The allowlist now
  preserves that disclosure. Its raw HTML body remains literal by CommonMark
  semantics, and Native now matches that boundary instead of recursively parsing
  an extra task checkbox.
  A reproducible same-snapshot comparator now adds the Electron source of truth.
  Snapshot `517167c56a14503a347fff3010a4cdbe4b2881e77566d6ee9dfa4dc249cd5e59`
  pins project `c6766ca3-4586-4812-b2ec-a50f324cae7e`, `README.md`, 1280 x
  820, and dark theme. Electron's CDP behavior runner and exact-owned Native
  physical input both rendered two tasks, changed only `First task` from `[ ]`
  to `[x]`, and persisted identical final bytes with SHA-256
  `dc41af264092142dd5c4880c769fc2ce078ef43cdb610a7f019998a64674226a`.
  The strict comparator passed all 18 identity, mutation, backend, transport,
  error, evidence-kind, and cleanup checks. This is paired semantic behavior,
  not paired pixels or physical Electron input.
  A dedicated single-user-message fixture now drives the Web and Native renderers
  from snapshot `64dba57750d7eec265a7676fa8bdd32bdca600ce8fe27141c56337a6babdf7bd`
  at 1280 x 820 in dark theme and runtime evidence HEAD `fb1b06fd9`. The paired
  semantic comparator passed all 18
  checks for HEAD, snapshot, thread/turn/message identity, viewport/theme, review
  file and range, preview id, element kind, and the renderer-visible review,
  preview, target, and element text. Native used main transport sequence 3 -> 4,
  had zero renderer errors, disposed its isolated state, and used the explicit
  programmatic list probe to materialize the user row. Both owned processes
  exited. This closes review-comment, preview-annotation, and element-context
  semantic correlation; it does not claim paired pixels or physical navigation.
  The explicit transcript verifier now has a strict recycling step: it rejects
  fixtures below 100 canonical rows, requires the materialized DOM row set to
  stay smaller than canonical history, scrolls first-to-last through the owned
  list probe, and requires one native node ID to rebind to a different row ID.
  The gate was then run against an exact-owned long-thread session as recorded
  below.
  A deterministic projection fixture and no-capture exact-owned runner now make
  that gate reproducible without provider availability or retained screenshots.
  The fixture records full thread/message/turn/session projections and labels
  its direct-projection boundary so it cannot be mistaken for backend-ingestion
  evidence; the runner pins bundle URL, main transport, active thread, viewport,
  renderer errors, and owned-process cleanup before accepting node reuse.
  The committed runner passed at `2b4ea49cc` on the isolated snapshot
  `144cae82467d354991f778facdffb39133630d2892d5a1795d5261faf317cc5d`
  and production bundle
  `7285762784e43c3dd024f98ada7a3cbc02c324f8a18936d9f0054aa6643af6a5`:
  240 canonical rows produced eight materialized nodes at both ends, and native
  node `747` rebound from `fidelity-long-turn-118-assistant` to
  `fidelity-long-turn-120-assistant`. The exact-owned app used main transport
  sequence 12, the canonical thread was active, renderer errors were empty, and
  pre/postflight found zero leaked processes. Later runs below add physical wheel
  acceptance and paired Electron/Native position correlation.
  Programmatic paired correlation subsequently passed at `cf11365ae` with the
  same snapshot, thread, dark theme, and 1280 × 820 viewport on both renderers.
  Electron exposed all 120 turn identities through its minimap and materialized
  the tail around turns 114–120; Native exposed the same 120 minimap turns and
  240 canonical rows while keeping eight native rows materialized. The paired
  report passed exact HEAD, snapshot, active-thread, viewport, first-turn,
  last-turn, canonical-count, recycling, and zero-error checks. This closes the
  programmatic same-thread position-correlation slice; physical keyboard
  shortcuts, drag, and selection remained pending real OS input at that point.
  A fresh exact-owned Native run then exercised the wheel path through Computer
  Use against PID `77681`, window `87307`, the same 120-turn fixture, and a main
  transport readiness receipt. Four real OS wheel pages moved the viewport from
  turn 118 to turns 104–106 and exposed `Scroll to end`. This first exposed a
  product race: smooth jump frames were reported with the user-scroll source and
  immediately detached the just-restored follow mode. A pure scroll-update
  decision now holds `following-end` while a jump is in flight and completes the
  jump only when the list reaches the end. On the rebuilt bundle
  `a42d9f4c81b76ad06fc15a4be4c12242d02cb187c15263d01e019f94e1320805`,
  the same real wheel path moved to turns 104–106, a real OS click returned to
  turns 119–120, the pill disappeared and remained absent after 800 ms, and the
  diagnostic postcondition confirmed follow restored. Composer focus and literal
  typing are covered below; keyboard shortcuts and selection remain pending. A
  later exact-owned PID `52163`, window `89524` run also used a real Computer
  Use drag in the transcript viewport: visible rows moved from turns 119–120 to
  turns 113–115 and exposed `Scroll to end`. A real click returned to turns
  119–120 and removed the affordance. Owned DevTool confirmed 240 canonical
  rows, main transport sequence 16, and an empty error console before cleanup.
  This closes transcript drag/follow acceptance, not unrelated drag or selection.
  The visible runtime warning
  `FiberSetAttribute param 0 should be RefCounted` remains a separate platform
  loss and is not counted as a zero-warning acceptance.
  That warning was subsequently traced to high-frequency main-thread hover and
  focus handlers calling `setAttribute` on the transient event
  `currentTarget`. Lynx's `MainThread.Element.setAttribute(name, value)` API is
  valid, while a matching Lynx OnCall class-setter incident attributes the Fiber
  error family to FFI parameter-type mismatches. Generated Native CSS had no
  consumer for the shared `data-lynx-focus` writes and only the Sidebar resize
  rail consumed `data-lynx-hover`; the redundant shared writes were deleted and
  the resize rail now writes through its retained `useMainThreadRef` element. On
  bundle `0cd9d159646abe7d4a5b79317738ca9f1a2c4e293a5f821622f18b9c7c50c2f0`,
  exact-owned Native recycling still passed with zero console errors, and a
  fresh visible Computer Use run remained free of LogBox warnings through real
  wheel-away, return-to-end, Un-settle, and Composer focus.
  A separate fresh exact-owned Computer Use session proved Composer focus and
  literal typing: after a real OS click, Accessibility exposed the focused
  textarea and `focus selection probe` appeared as both its value and visible
  text. Real `Command+A` selection did not work: typing `X` afterward produced
  `focus selection probeX` in two fresh runs. A textarea-local keydown plus the
  documented Lynx `setSelectionRange(0, length)` UI method passed source tests,
  typecheck, build, and MTS audit but still failed the real OS postcondition, so
  commit `f799e6ead` was explicitly reverted by `d6feb98e0`. Selection remains
  an honest runtime gap; no tap-equivalent or programmatic value replacement is
  counted as acceptance.
  A subsequent physical `Command+K` attempt is not retained as Native evidence:
  immediately before the key event, Computer Use ignored the explicitly pinned
  owned PID/window and returned historical PID `18465`, window `80843`, instead
  of owned PID `37549`, window `88026`. The shortcut opened Quick Switch in that
  historical window, proving only that the key reached a different process. The
  owned process was stopped by its captured session and the keyboard gate remains
  `pending-user-session` after this harness identity loss.
  The retained launcher then moved from the removed pre-0.0.21 executable path
  to `@lynx-js/lynxtron/native-paths`, allowing a new shell-owned run to resolve
  the devtool runtime before creating disposable state. Computer Use listed two
  same-bundle T3 windows, but a fresh state check pinned the new process to PID
  `2931`, window `88438`; the screenshot and readiness report both showed the
  dark 1280 x 820 `Long transcript 120 turns` fixture, main transport, and
  `fidelity-long-transcript`. Real OS `Command+K` opened Quick Switch in that
  exact window and real `Escape` closed it. From the same owned process,
  `Command+,` opened Settings General and `Command+N` opened New Thread. The
  readiness sequence advanced from 13 to 14, the final log scan found no
  keyboard-delivery or runtime errors, and cleanup stopped only PID `2931`.
  This closes physical acceptance for the bounded native-menu shortcuts; it
  does not close renderer text-key events, focus traversal, drag, or the failed
  `Command+A` selection path. The run regenerated the deterministic fixture as
  snapshot `9b22607bc8619d78af1f86458de93e7ed2bb207396adbcd5c560ee1c3111ac8e`;
  it is not presented as a new paired Electron/Native visual snapshot.
- The renderer-neutral block parser and block-routing predicate have moved out
  of the Lynx app into `client-runtime/presentation/markdown-blocks`. Lynx keeps
  only the native view mapping, while fenced code metadata, headings, nested
  quotes, GFM lists/tasks/tables, images, details, rules, and paragraph ordering
  now have a shared ownership boundary that Web can consume without importing a
  renderer. AST-level convergence with Web's react-markdown pipeline remains
  open. Shared parser coverage now also preserves CommonMark setext headings
  and single-line HTML details blocks, which previously rendered with the wrong
  structure or leaked raw tags into transcript prose. Paragraph soft breaks now
  collapse to spaces like Web while double-space and backslash hard breaks remain
  visible in both paragraphs and list continuations. Parser tests now live with
  the shared implementation; the Lynx suite retains only platform clipboard
  behavior. Indented continuation lines now remain inside their owning list
  item while nested markers keep their own depth, preventing multi-line GFM
  bullets from being split into unrelated transcript paragraphs. Blockquotes
  now retain a recursive child-block projection, so quoted lists and fenced code
  render as their original structures instead of flattening into inline text.
  Native lists now render one stable row per item with explicit marker, nesting
  depth, and task state rather than flattening the list into a single text node;
  inline links remain interactive inside each item. The shared block projection
  normalizes both two-space and four-space indentation to structural nesting
  levels, so common Markdown styles do not over-indent Native rows.
  Stateful Markdown blocks now include their owning message or plan identity in
  their keys, preventing recycled details, image failures, wrap state, and copy
  feedback from leaking between equal-position blocks in different rows.
  Images embedded between paragraph text are projected in source order through
  the existing image/fallback renderer instead of leaking their Markdown syntax
  as ordinary prose. Single-line prose containing an embedded image now also
  routes through that block projection instead of the compact inline renderer.
  Escaped image syntax and image-like text inside code spans remain literal,
  matching Web instead of opening an unintended Native image surface. Image
  captions and fallbacks use the shared rendered alt text, so emphasis, code,
  escapes, and entities do not leak raw Markdown markers.
- Shared inline Markdown now matches GFM autolink meaning for bare
  `www.example.com` and email addresses, including canonical `https://` and
  `mailto:` targets and trailing-punctuation boundaries. Unmatched closing
  parentheses stay outside bare URL targets while balanced URL parentheses are
  preserved. Code spans, embedded `www` or HTTP text, and hostless email-like
  text remain literal.
- Shared GFM table parsing now renders escaped pipes as literal cell content and
  keeps pipes inside code spans in the same cell instead of splitting columns.
  Backslashes only escape pipe/backslash delimiters, so Windows-style or literal
  trailing slashes are not silently dropped from cell content.
- Shared block parsing now follows CommonMark ATX heading boundaries, including
  optional closing hashes and empty headings, without stripping literal hashes
  such as `C#` from the heading text. Setext underlines also no longer promote a
  preceding list or quote marker into a heading, preserving both block types in
  source order. Thematic breaks accept CommonMark's spaced marker forms instead
  of being misclassified as a list or prose.
- Shared inline Markdown now decodes the common named and numeric HTML entities
  used by Web/Mobile text rendering while preserving unknown, null, surrogate,
  and out-of-range entities literally. Code spans remain byte-for-byte authored
  text. Intraword underscores in identifiers remain literal while authored
  underscore emphasis continues to project into styled spans.
- Shared visible-text normalization now also matches Mobile/Web semantics for
  safe inline formatting tags (`kbd`, `mark`, `sub`, `sup`, `u`), `<br>` line
  breaks, and double-encoded entities. Unknown HTML remains literal rather than
  being treated as trusted markup.
- Mobile's native Markdown module now imports that shared visible-text
  normalization and deletes its local entity/tag decoder, leaving one tested
  semantic source for Mobile and Lynx instead of two implementations that can
  drift.
- Native proposed-plan timeline cards now open the existing full Plan panel
  instead of ending at a static two-line title. The card reuses canonical plan
  state and the existing panel route; its real OS tap remains covered by the
  documented Lynxtron 0.0.21 native-tap blocker rather than being marked as
  accepted from a source-level contract alone.
  The card now also renders a shared four-line Markdown preview with the title
  stripped, so the transcript preserves actual plan meaning before navigation
  instead of presenting only a static title. Opening the Native Plan panel now
  detaches transcript follow before the panel changes the timeline viewport.
- The Native Plan panel now copies the same normalized export Markdown as Web,
  with pending/copied/failed feedback scoped to the active plan and reset when
  plan identity changes. Copy and save completions use independent generation
  guards so concurrent actions cannot cancel one another and an old plan cannot
  overwrite the replacement panel's feedback. The full panel
  also passes workspace context into Markdown image resolution, matching its
  transcript preview, and resets disclosure state when a different plan becomes
  active. The identity includes thread, plan, and turn, so identical Markdown in
  another thread cannot inherit local action or disclosure state. Its displayed
  body now uses the same shared title/Summary stripping as Web while copy and save
  retain the complete original Markdown. Download and save-to-workspace remain
  separate host actions rather than being represented by inert buttons.
- Native can now save the normalized plan to the workspace using Web's shared
  default filename projection and the typed project-file writer. Missing
  workspace, pending, success, and failure states remain visible; Web's custom
  save-path dialog and browser download remain host-specific follow-up work.
- Native checkpoint cards now recompute their auto-expand default and reset
  user/directory expansion only when the checkpoint identity changes, preventing
  recycled list cells from leaking a previous diff card's state.
  User-driven checkpoint-card and directory expansion also detach follow mode
  before changing row height, including individual folder toggles inside the
  expanded tree, preserving the chosen history position while new output arrives.
  Ready checkpoints with zero additions and deletions now omit
  the empty stat label like Web instead of rendering `+0 −0` noise. Collapsed
  checkpoint previews also use the same path-aware file icon projection as the
  expanded tree instead of labeling every file as generic JSON. Opening a full
  diff from the header, preview, or expanded tree now detaches transcript follow
  first, so streaming output cannot move the history position behind the panel.
- Native now matches Web's safety boundary for message reverts: while an agent
  turn is working, the destructive "Revert to this message" action is visibly
  disabled and has no tap handler; idle checkpoint-backed messages retain the
  existing confirm-and-revert path. Confirmation and command failures now leave
  visible message-local feedback, pending disables duplicate taps, and recycled
  message cells reset that state when their checkpoint identity changes.
- Native message copy now has an explicit pending/success/failure state instead
  of an unhandled clipboard promise: pending disables duplicate taps, success
  shows the check state, and rejection exposes `Copy failed` before the feedback
  resets. Recycled controls reset by message identity and ignore stale clipboard
  completions, even when two messages have identical text. The shared Native
  hover host now reveals both opacity and visibility,
  so user and assistant metadata controls are no longer kept hidden by the
  transcript's initial visibility contract.
- Settled assistant messages with no visible text now use the same shared
  `(empty response)` fallback as Web instead of leaving an unexplained blank
  transcript row; streaming empty messages retain the `Thinking…` state.
- Discrete keyboard coverage now spans all three layers: native menu packet
  encoding, the shared keybinding resolver, and a dependency-injected product
  action dispatcher for New Thread, Quick Switch, File Picker, Settings, Sidebar,
  and thread/model jumps. The `Command+K`, `Escape`, `Command+,`, and `Command+N`
  paths now also have exact-owned physical keyboard acceptance. A second run on
  PID `50651`, window `89189` passed `Command+P` with visible repository results,
  `Escape` dismissal, and both hide/restore directions of `Command+B`; main
  transport stayed ready at sequence 15 and the log remained free of keyboard
  or runtime warnings. A deterministic two-active-thread fixture then fixed the
  visible order as Thread Two followed by Thread One. On PID `81595`, window
  `89329`, real `Command+2` selected Thread One and real `Command+1` returned to
  Thread Two; readiness ended on `fidelity-thread-two` with main sequence 20 and
  no runtime errors. Populated thread indices 1 and 2 therefore have physical
  acceptance; model-picker numeric jumps and general renderer keyboard behavior
  retain only command-path coverage.
  A separate exact-owned run opened the Model Picker on PID `28160`, window
  `89449`, with Sol/Terra/Luna visibly ordered as indices 1/2/3. Real
  `Command+2` left Sol selected and the picker open. A viewport-probe-only
  dispatch diagnostic remained `null` while the picker runtime state and main
  transport were healthy, showing that the focused picker search field prevented
  the native Menu accelerator packet from reaching the renderer. This is retained
  as a real R5 failure, not papered over with programmatic selection.
  A 2026-09-11 follow-up then proved that the focused input's own
  `main-thread:bindkeydown` does receive physical `Command+2`, but neither
  supported cross-thread path is usable on Lynxtron 0.0.21: a local
  `runOnBackground` wrapper and `instance.triggerEvent` both raised a visible
  LogBox raw error before the background model listener ran. Three exact-owned
  attempts on PIDs `25043`, `51308`, and `74927` kept Sol selected and the picker
  open; every attempted implementation was fully reverted and every owned process
  and isolated state was cleaned. The gap is therefore narrowed to focused-input
  main-to-background event bridging, not key detection or model ordering.
  File Picker input was then exercised on exact-owned PID `65032`, window
  `89601`. `Command+P` opened the picker, a real click focused search, and literal
  typing produced the exact Accessibility value `keyboardCommands.probe` while
  visibly filtering to matching repository files; `Escape` closed the overlay.
  `Command+A` plus Backspace removed only the final `e`, reproducing the earlier
  Composer select-all failure in a second Native textarea. This closes File
  Picker focus/query typing but strengthens the evidence that selection is a
  shared runtime gap. Main transport remained ready at sequence 16 and the owned
  PID was cleaned up.
  A follow-up ArrowDown/Enter pass then exposed a real Electron/Native behavior
  mismatch: Native inserted Enter into the query and called external
  `navigation.openPath` twice instead of opening T3's internal file surface. The
  implementation now strips CR/LF, handles Enter once, and uses
  `uiActions.openFileSurface(path)`. On exact-owned PID `75404`, window `89773`,
  literal query typing, ArrowDown, and Enter opened
  `keyboardCommands.probe.test.ts` inside the split Files panel. Owned DevTool
  confirmed preview mode, saved content revision, no console errors, and main
  sequence 13.
  Quick Switch command-query navigation was then accepted on exact-owned PID
  `11393`, window `89856`. `Command+K`, a real focus click, literal
  `open settings`, ArrowDown, and Enter highlighted and executed the single
  canonical action, landing on Settings General. DevTool confirmed overlay
  closure, main sequence 15, and no renderer errors. An earlier run that lost its
  Computer Use window after typing is retained only as harness loss, not product
  evidence.
  A separate exact-owned PID `60545`, window `89233` run then used Computer Use
  for a real Sidebar resize drag from the current-frame divider at about 239 px
  to 319 px. The visible Sidebar expanded, while owned DevTool client
  `localhost:8904`, session 1 measured `data-sidebar-width="341"` and matching
  341 px container/gap geometry. The canonical thread and Composer stayed stable,
  the DevTool error console was empty, main transport remained ready at sequence
  15, and cleanup stopped only PID `60545`. Other drag and selection paths remain
  open.
  A physical active-thread hover was also tested on exact-owned PID `22479`,
  window `89689`. Computer Use moved the real pointer over Thread Two, but a
  viewport-probe-only state read remained `hoveredThreadId: null` and both
  `.sidebar-v2-row-actions` nodes kept computed opacity 0. Main transport stayed
  healthy at sequence 16 and the console was clean. This identifies an R6 native
  `mouseenter` delivery gap before React state; no programmatic hover is counted
  as acceptance.
- Native code-block copy now follows the same pending/copied/failed contract,
  disables duplicate taps while the bridge write is in flight, and clears its
  feedback timer when a virtualized block unmounts.
  Its feedback also resets on block identity changes even when two recycled
  blocks contain identical code, and stale clipboard completions cannot write
  into the replacement block, so `Copied` never leaks into another message.
  Code blocks now also expose Web-equivalent Wrap/Unwrap controls initialized
  from the canonical word-wrap preference. Toggling wrap detaches transcript
  follow before changing row height and resets when a recycled block identity
  changes.
- Native Markdown details disclosures now reset to the newly authored `open`
  state when a virtualized block identity changes, preventing expansion state
  from leaking between recycled transcript rows. Timeline-hosted details,
  including nested disclosures, also detach follow before changing row height;
  the standalone Plan panel keeps its own scrolling semantics.
  Shared details parsing now accepts standard HTML boolean attribute forms such
  as `open=""` and `open="open"`, and translates common HTML emphasis in
  summaries into the existing inline Markdown projection instead of leaking raw
  tags. Details and summary elements may also retain ordinary HTML attributes;
  the presence of `open` follows HTML boolean semantics regardless of its value,
  and attributed disclosures start a new block even without a preceding blank
  line instead of being flattened into adjacent prose.
- Native Markdown tables now preserve readable minimum column widths behind a
  horizontal viewport and expose Web-equivalent Markdown/CSV copy formats. The
  renderer-neutral table projection owns visible-text normalization and
  serialization, while pending/success/failure feedback stays inside the table
  block so copying does not invalidate the parent transcript row. A local
  expand/collapse action follows the canonical word-wrap default, detaches
  transcript follow before changing row height, and resets when a virtualized
  table identity changes. Context-menu and clipboard completions are generation-
  guarded so a recycled table cannot inherit stale copy feedback.
- Shared work-entry disclosures now reset their local expansion state when a
  virtualized row receives a different activity identity. Both renderers also
  route the disclosure through their manual-navigation path before changing row
  height, so streaming output cannot steal the expanded tool/error body.
- Transcript rows no longer replace one fixture-specific user prompt and
  command-approval entry with calibration screenshots at the authority
  viewport. The shared semantic row anatomy now remains visible and operable in
  that real approval flow; unrelated shell/composer calibration assets remain a
  separate convergence concern.
- Pending-approval banners and the approval Composer no longer hide their real
  shared text behind fixture-specific screenshots at the authority viewport.
  Arbitrary command/file approval details now use the same semantic surface in
  dark, light, and responsive layouts; Header/button calibration remains a
  separate convergence slice.
- Native shared buttons no longer replace approval labels and button edges with
  five fixed screenshot fragments. The real button children remain visible and
  accessible across themes and viewports while the existing approval variants
  retain their layout and colors.
- Approval now has reproducible same-snapshot Electron/Native semantic evidence
  without consuming screenshot budget. The fixture pins dark theme and provider
  selection; Electron and Native both read snapshot
  `f2fff2b8b7341d600796aa607a259b508b119dca7c3f7e552e85c6893df5b264`
  at 1280 x 820 with thread `7bca730b-1006-4b21-8c0d-913838a53e5e`, request
  `approval-fixture-command-1`, and turn
  `f079fd25-2f9a-42eb-a93a-5e80710a982c`. The strict comparator passed report
  status, HEAD, snapshot, thread/request/turn identity, viewport, dark theme,
  working Composer state, `printf pending-approval`, all four enabled actions,
  semantic-only labeling, direct-projection boundary, main transport, and zero
  Native renderer errors. Native also retained its existing exact geometry gate
  and advanced main transport from sequence 3 to 5. Both owned processes exited
  and Native disposed its isolated state. This closes card-specific semantic
  correlation only: it does not claim paired pixels, provider ingestion, or an
  approve/decline mutation.
- Review Diff now has a no-capture same-snapshot Electron/Native semantic gate.
  Snapshot `3eeaf2b7f6e221ef35f71be417c755c8ae0d0a6f23d37e6a23e8b7e3ec7d7921`
  pins dark theme, 1280 x 820, thread `fidelity-review-thread`, turn
  `fidelity-review-turn-1`, and the one-file `review-fixture.txt` checkpoint.
  The strict comparator passed all 17 identity, readiness, content, transport,
  error, and cleanup checks. Electron opened the real non-loading/non-error Diff
  renderer with one checkpoint and one file; exact-bundle Native rendered both
  changed lines over main transport with zero renderer errors and measured the
  540 px right panel, 539 x 728 diff surface, and 444 x 140 idle Composer. The
  review fixture now writes deterministic Native theme/model preferences, and
  the Native verifier has an explicit semantic-only mode that captures no
  pixels. This evidence is direct-projection behavior/geometry correlation, not
  backend ingestion, physical input, or paired pixels. The three `review-diff`
  Final5 visual cells therefore remain pending.
- The shared Composer context strip no longer carries an unused authority-image
  injection slot or CSS that could hide its real checkout and branch controls.
- Shared Sidebar header/footer and search/project controls no longer expose dead
  authority-image slots or CSS branches. Both renderers now use the same real
  interactive composition without a hidden screenshot replacement path.
- The chat Header no longer swaps its complete shared surface for a fixed
  1024-pixel screenshot when the pending-approval fixture is selected. Project
  identity, Git actions, project scripts, and panel controls now remain the real
  interactive Header at every viewport.
- Compact single-line assistant replies now keep ordinary Markdown links
  tappable and expose the same external/file context actions as block-rendered
  paragraphs.
- Supported Markdown images now open a Native root-level preview overlay rather
  than ending at a static inline image. The preview data model is shared with
  Web, includes close/previous/next semantics, and is threaded through nested
  blockquotes/details. Native also resolves persisted attachment ids through
  the existing signed-asset command, projects successful URLs onto view-only
  messages, and opens the same multi-image viewer; failed resolutions keep the
  original file-card fallback without mutating canonical connector state.
  The Plan panel passes its Markdown images through the same root viewer instead
  of silently losing that interaction outside the transcript.
  Web now imports this preview model directly from `client-runtime`; its former
  renderer-local re-export has been deleted.
  Native attachment cards now match Web's image-first anatomy: a resolved image
  occupies the card without Native-only MIME/size copy, while missing or failed
  previews fall back to the attachment name. Failure state resets by attachment
  identity so recycled rows cannot blank a later image.
  Inline and expanded Native images now surface a visible load-failure fallback
  and reset that failure state when a virtualized block or selected image
  changes, rather than leaving a blank interactive frame.
  Relative workspace images resolve through the existing thread-scoped signed
  asset command, refresh before expiry, and retain explicit loading/failure
  states instead of resolving accidentally against the Lynx bundle origin.
- Native block and single-line Markdown now apply the shared bare inline-code
  file resolver used by Web. File-shaped code spans open the internal file
  surface and expose open/copy context actions, while commands, identifiers,
  hosts, and git refs remain ordinary code. Internal workspace-file navigation
  from block or compact links detaches transcript follow before opening the Files
  panel; external links remain unaffected. The file context
  menu's explicit Open in editor action now calls the system editor capability
  instead of silently routing back to the internal Files panel.

### PF3 closure (Plan 14 M2, 2026-09-29)

PF3 is `completed` for headless-provable behavior on Lynxtron 0.0.28
(`evidence/2026-09-29/M2/transcript-and-input.json`): rich long-thread
recycling, detached reading under real incoming growth, Jump re-stick,
shared link menus with toasts, and Command+K through the shared resolver.
Bounded residuals: `GAP-011`, `GAP-014`, the checkpoint card toggle (Plan 14
M5), and physical-input correlation (`pending-user-session`, Plan 14 M7).

## PF4: Complete remote and multi-environment operation

Remote readiness is a core product property. A Lynxtron desktop shell that works only against its bundled local server is not feature-parity.

### Required capability set

- discover and select local and remote environments;
- connect through supported LAN, relay, tunnel, and T3 Connect paths;
- pair/authenticate where required and present actionable expiry or permission errors;
- show environment ownership for projects, threads, files, attachments, terminal context, and commands;
- reconnect without changing route, draft, selected environment, or presenting stale local state as remote state;
- handle multiple environments and devices without cross-environment cache or command leakage;
- complete the Connections Settings catalog and status surface required by these flows.

### Architecture rules

1. Reuse the Web connection contracts and `packages/client-runtime` state. Lynxtron main may adapt transport but must not own a second product catalog.
2. Never bake localhost origins into the renderer bundle.
3. Connection state must identify the target environment and distinguish transport readiness from product snapshot readiness.
4. Test against isolated copied state, never live `~/.t3/userdata`.

### Exit criteria

- One local and one supported remote journey can select a project, complete a turn, reconnect, and retain canonical state.
- Wrong-environment file or command execution is covered by focused tests.
- Failure states explain whether the problem is pairing, authentication, transport, server readiness, or product synchronization.
- Relay/tunnel behavior remains compatible with Web and mobile clients.

## PF5: Complete change review, checkpoints, and files

After the agent finishes, the user must be able to understand the result before trusting or continuing it.

### Required capability set

- checkpoint and turn-diff summaries in the timeline;
- full diff/patch presentation when R10 is available, with an explicit bounded fallback while blocked;
- changed-file list, file preview, navigation to relevant changes, and source-control state;
- restore/revert/reopen flows supported by the product, including confirmation and receipt states;
- files/editor chrome and commands around the approved editor placeholder until a capable native or shared editor path exists.

### Architecture rules

1. Share diff models, file projections, command intents, and surrounding product anatomy.
2. Keep DOM/Worker patch rendering registered as a hard island; do not introduce a broad DOM shim to erase R10 on paper.
3. Destructive source-control actions require exact targets, confirmation where Web requires it, and canonical completion receipts.
4. A summary card does not count as full review parity when the underlying changes cannot be inspected.

### Exit criteria

- A completed real turn exposes its changed files, checkpoint, and inspectable diff or explicit R10 fallback.
- The user can navigate from transcript result to affected file state and back without losing the thread.
- Reverse actions update both source-control state and the projected timeline correctly.
- No placeholder claims editing or patch capabilities it cannot perform.

## PF6: Expand terminal and browser work surfaces

Replace approved placeholders only after chat, remote operation, and review are complete. Treat terminal emulation and embedded browsing as separate runtime products, not visual components.

### Browser follow-up (2026-09-06)

The detailed implementation and acceptance checklist now lives in [Plan 13: Bring the builtin browser to Lynxtron parity](./13-cef-webview-browser-parity.md). Keep this section as the compact status summary.

- [x] Read the Lynxtron Browser introduction and the `<x-webview>` API contract.
- [x] Audit Synara's successful WKWebView surface and its failed CEF 0.0.16 experiment.
- [x] Upgrade the Lynxtron host/dev plugin to 0.0.18, register `@lynx-js/cef-webview`, and stage its native package through AutoLink in development and production builds.
- [x] Replace the disabled Browser placeholder with the first functional OSR slice: HTTP(S) navigation, location synchronization, back, forward, reload, popup routing, loading, and error states.
- [x] Keep CEF opt-in after the 0.0.18 startup blocker and project the unavailable capability honestly in the default Browser card. A fresh 1280 x 820 owned run reached connector/server readiness and rendered the disabled reason without entering CEF.
- [ ] Prove a real CEF page load and retain `bindload` / `bindlocationchange` evidence. An authorized owned 0.0.18 run on 2026-09-06 loaded the framework but remained inside `cef_extension.node -> CefInitialize` for more than one minute before any `LynxWindow` was created; the process was sampled and stopped by its captured PID.
- [ ] Restore packaged `.app` output. `@lynx-js/lynxtron-builder@0.0.18` currently fails while copying the Lynxtron Framework's relative symlinks under pnpm; its bundled `app-builder-lib` patch is not applied by its postinstall in a pnpm workspace.
- [ ] Add durable per-thread multi-tab/history persistence, active-plus-one-warm view budgeting, and inactive-pane suspension using the bounded Synara policy.
- [x] Read checked-in `t3.json` actions through the typed project-file bridge, decode them with the shared schema, import them into canonical project state, and expose existing actions through the Header menu. Native import was verified against an isolated completed-thread snapshot.
- [ ] Complete physical Native verification of project-action execution. The open-terminal/write-command coordinator is covered by focused tests and production builds, but the latest Computer Use session returned an unrelated PID for the explicitly pinned owned process, so no physical click is claimed.
- [ ] Close Electron-only gaps: DevTools/CDP, screenshot and recording, element picking, PiP, zoom, cookie/cache clearing, and browser-use automation.

The CEF 0.0.18 binding ignores the JavaScript `initialize(options)` object and exposes no cache-root option. The reproduced startup emitted CEF's `root_cache_path` process-singleton warning immediately before blocking. Until upstream adds an isolation option and resolves startup, CEF must remain opt-in and must not be described as complete remote/multi-environment isolation.

### Required work

1. Re-evaluate Lynxtron runtime capabilities for terminal transport/input/rendering and embedded browser isolation/navigation.
2. For each surface, choose one bounded outcome:
   - implement the shared product chrome with a capable native runtime leaf;
   - launch an explicit external/system surface with honest handoff state;
   - remain `blocked(runtime-gap-R#)` with a product-quality placeholder and removal condition.
3. Preserve remote environment ownership, command permissions, lifecycle, close/reopen behavior, and resource cleanup.
4. Do not ship a decorative terminal or browser that cannot safely execute its primary workflow.

### Exit criteria

- Each surface has a documented capability decision and acceptance evidence.
- Implemented surfaces support open, active, failure, reconnect, close, and reopen states.
- Remote commands and URLs cannot silently execute against the wrong host.
- Blocked surfaces remain explicit and do not block the already complete agent journey.

## PF7: Close performance, theme, and remaining platform gaps

Close platform quality only against the now-complete journey so optimization and polish measure real workloads.

### Required capability set

- R11 asynchronous code splitting and lazy loading where the Lynxtron runtime supports it;
- bundle and startup budgets, long-transcript rendering cost, connector payload/update frequency, and memory stability;
- R13 light, dark, and system theme behavior across required surfaces;
- R8 selection/copy, R1 SVG, R2 custom fonts, and remaining compatibility entries when their probes pass;
- keyboard/focus/scroll gaps still open after PF3;
- removal of obsolete overrides, fallbacks, and local islands whose runtime gaps have closed.

### Performance rules

1. Capture a baseline before changing loading or rendering boundaries.
2. Do not trade repeated connector payloads or full-list rerenders for a smaller authored file.
3. Avoid continuously repainting animations and unbounded retained transcript state.
4. Report bundle and runtime deltas; do not improve a metric by changing exclusions, masks, or feature reachability.

### Exit criteria

- Startup, ready-to-interact, long-transcript update, memory, and bundle results meet recorded budgets or have an explicit approved exception.
- Required surfaces pass light, dark, and system-theme matrices.
- Closed R# entries have removal evidence; open entries retain honest fallbacks and owners.
- Route, product-surface, and renderer-local reuse reports improve or explain every regression.

## PF8: Certify the end-to-end Lynxtron product journey

Run the complete phase-exit evidence once. Do not repeat this battery after each earlier slice.

### Required journeys

1. Fresh local packaged start to semantic readiness.
2. Select a populated project and start a new thread.
3. Compose text plus supported attachments/context and send.
4. Complete a structured intervention such as approval, user input, or proposed-plan response.
5. Read a long/structured transcript without losing the chosen scroll mode.
6. Finish the turn and inspect its checkpoint, changed files, and diff/fallback.
7. Interrupt/reconnect and confirm route, environment, draft, and thread state remain canonical.
8. Repeat the supported essential journey against a remote environment.
9. Verify Settings, command palette, and accepted keybinding entry points for applicable features.

### Complete evidence matrix

- Web/Electron and Lynx at 1280 x 820 and 1440 x 900;
- light, dark, and system theme where R13 is closed;
- ready, pending, intervention, failure, reconnecting, recovered, and completed states;
- focused provider decisions and at least one real supported-provider execution;
- local and supported remote connection modes;
- physical keyboard/focus/wheel/drag/selection from an authorized user session where required;
- reuse, bundle, long-list performance, compatibility, and renderer-error reports.

### Plan exit criteria

- The complete local journey requires no return to Web.
- The supported remote journey preserves environment identity and canonical state.
- Every required feature has entry, state, completion, failure, and reverse behavior where applicable.
- No visual affordance claims an unavailable capability.
- Web, desktop, mobile, provider, contract, and connection-mode decisions are recorded for every changed cross-surface feature.
- Open runtime gaps are product-approved blockers with honest fallbacks, not hidden implementation omissions.
- `implementation-status.md`, `compat-matrix.md`, `port-ledger.md`, and the task table match the final evidence.

## Per-task acceptance

Use the smallest proof for PF0–PF7:

1. Focused tests for changed behavior and contracts.
2. Affected Web and Lynx TypeScript programs.
3. ReactLynx scanner for changed renderer files.
4. Lynx API/CSS audits only when that surface changed.
5. Affected production builds.
6. `report:reuse` only for a shared-boundary change.
7. One fresh 1280 x 820 semantic-ready packaged smoke and one affected state after supported real interaction.
8. `git diff --check`.

Run paired viewports, themes, lifecycle matrices, remote journeys, and the real-input session only at the relevant task exit or PF8. A screenshot proves rendering only. It does not prove connection, routing, keyboard, scrolling, focus, selection, drag, command execution, or receipts.

## Stop conditions

Stop and report when:

- Plan 11 OC7 or one of its five invariants is not complete;
- an upstream conflict extends outside the active PF surface;
- a required capability needs a new product decision across Web, desktop, mobile, or providers;
- the runtime lacks a required primitive and the fallback would change the product promise;
- completion depends on physical input evidence and no user session is authorized;
- a remote test would require writing to live user state or using unknown credentials;
- a feature can be made to look complete only through copied Web JSX, a broad DOM shim, fixture injection, or a false-ready harness;
- LFS, signing, notarization, external account action, or another user decision is required.

Do not stop merely because a secondary surface remains an approved placeholder. Record its runtime gap and continue with the higher-value journey.

## Session handoff requirements

Before ending a session, record:

- current commit, branch, and remote relation;
- active PF task and its remaining product exit criteria;
- dirty files owned by the task and unrelated user work preserved;
- exact focused commands, semantic results, and evidence paths;
- local versus remote state identity and any credentials or actions intentionally not used;
- process PIDs, ports, DevTool session, and isolated state that remain active;
- compatibility and provider decisions added;
- commit and push status.

## Prompt for the first Plan 12 session

```text
Continue the T3 Code Electron-to-Lynxtron feature-parity plan in
/Users/bytedance/github/t3code on branch lynxtron-port.

Read these files in order:
1. AGENTS.md
2. .impeccable.md
3. apps/lynxtron/docs/plans/11-outcome-driven-convergence.md
4. apps/lynxtron/docs/plans/12-feature-parity-by-product-value.md
5. apps/lynxtron/docs/implementation-status.md
6. apps/lynxtron/docs/compat-matrix.md
7. apps/lynxtron/docs/port-ledger.md
8. apps/lynxtron/docs/plans/00-execution-index.md

Plan 12 starts only if Plan 11 OC7 is complete and O1–O5 pass. Preserve all
user work. Resume the first non-completed PF task, keep only one task in
progress, and commit and push every completed task separately.

Prioritize the complete coding-agent journey: intervention and recovery,
Composer input/context, transcript interaction, remote environments, then
change review. Terminal/browser and platform polish follow that journey.
Current Web/Electron is the product source of truth. A visible control is not
feature parity unless its entry, state, failure, completion, and reverse path
work through canonical state. Use slice-level harnessing during implementation
and reserve the complete evidence matrix for PF8.
```
