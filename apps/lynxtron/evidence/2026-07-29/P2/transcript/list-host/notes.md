# Native `<list>` transcript host — slice-level acceptance evidence

- Date: 2026-07-29
- Task: P2 (strategy §5 P2-S1/P2-S2) — shared transcript projection + native
  `<list>` host replacing `<scroll-view>` + full `messages.map()`
- Tier: slice-level acceptance (typecheck + scanner + single-viewport
  zero-error capture) per the tiered certification in
  `docs/plans/00-execution-index.md`; the full dual-viewport battery is due at
  the T6/T7/T8 phase exits.
- Candidate: in-monorepo Lynxtron production bundle (2,107.2 kB main bundle)
- Viewport: **1180 × 748 logical** (2360 × 1496 physical). CORRECTION
  2026-07-29: this capture was originally mislabeled 1280 × 820 — the window
  size comes from `T3_LYNXTRON_VIEWPORT_WIDTH/HEIGHT` (default 1180 × 748),
  which this session did not set. Files renamed to `lynx-1180x748.*`; the
  correctly sized 1280 × 820 and 1440 × 900 captures of the same surface are
  under `../scroll-machine/`.
- Theme: dark
- Snapshot: see `lynx-1180x748.capture.json` (`snapshot` field); fixture
  manifest `transcriptFixture` records thread id, prompt, and turn state.

## Fixture

`scripts/prepare-transcript-visual-state.mjs` on top of `visual:prepare`:
one canonical project, one thread ("Native list transcript baseline"), one
real prompt dispatched through the production connector against the real
server. A real provider executed agentic work (tool calls) before the fixture
interrupted the turn; the interrupt had not settled in the projections when
the connector disposed, so on relaunch the thread resumes with
`latestTurn.state = "running"` — deliberately recorded rather than hidden.

## What the capture proves

`lynx-1180x748.jpg` (fresh session; screenshot taken before any other
inspection; zero DevTool renderer errors — the capture script fails otherwise):

- The transcript renders through the native `<list>` element with one
  `<list-item item-key>` per shared projection row (no `<scroll-view>`, no
  full-array map on the product path).
- Rows come from the shared `client-runtime/presentation/transcript`
  pipeline (`deriveWorkLogEntries` → `deriveTimelineEntries` →
  `deriveMessagesTimelineRows`) — the same functions Web now consumes:
  - user message bubble (right-aligned, canonical text);
  - assistant commentary message;
  - collapsed work group: one visible `✓ Command run` row with the real
    Bash command preview plus a `+2 previous tool calls` toggle row
    (MAX_VISIBLE_WORK_LOG_ENTRIES = 1, same as Web);
  - working indicator row with live elapsed label ("● Working… 2m 46s")
    driven by `deriveActiveWorkStartedAt` from the canonical latest turn.
- The Sidebar shows the same thread with the shared "Working" status
  view-model — timeline and sidebar agree on canonical state.

## Scroll behavior implemented (functional evidence at phase exit)

Follow-at-end via `scrollToPosition(alignTo: "bottom")` on tail growth;
detach when a user scroll (ListEventSource.SCROLL) leaves the bottom
threshold; re-attach at bottom; "↓ Jump to latest" pill when detached.
Full scroll-state-machine evidence (streaming follow, detach/reattach,
1/100/1,000-row recycling) is phase-exit work, not claimed here.

## Registered gaps (not silently dropped)

- Anchoring-new-turn mode, timeline minimap, revert/turn-diff cards, and
  checkpoint cards are Web-only for now (web keeps them; Lynx rows render
  without them).
- `initial-scroll-index` positions the first paint; restore-per-thread scroll
  position is not implemented (Web resets per thread as well).
- `overrides.css` gained a net ~+68 lines for the new list host chrome
  (annotated with surface + remove-when); the replaced clean-room
  `activity-item` / `timeline__activities` / `timeline__list` blocks were
  deleted.

## Verification results

- client-runtime transcript tests: 12 passed (new `transcript.test.ts`).
- Web behavior preservation: `session-logic.test.ts`,
  `MessagesTimeline.logic.test.ts`, `MessagesTimeline.test.tsx`,
  `timelineScrollAnchoring.test.tsx` — 107 passed against the shared module.
- Web typecheck (`tsgo --noEmit`): clean.
- client-runtime typecheck: clean.
- Lynxtron app typecheck: unchanged 233 pre-existing web-graph errors
  (`docs/typecheck-debt-2026-07-29.md`), zero new errors in changed files;
  host/desktop program clean.
- ReactLynx scanner on MessagesTimeline/ChatView/t3Client: zero findings.
- Web-API + CSS audits: pass (60 APIs, 1,388 utilities reported).
- Lynx production build: pass; renderer bundle 2,107.2 kB (baseline
  2,061.1 kB; an intermediate 2,448.9 kB schema regression from a contracts
  value import was caught and removed via a schema-free literal check).
