# Transcript scroll machine + long-transcript interaction evidence

- Date: 2026-07-29
- Task: P2-S3 — follow/detach scroll state machine and long-transcript
  runtime interactions (slice-level tier)
- Candidate: in-monorepo Lynxtron production bundle (2,108.1 kB)
- Viewports: 1280 × 820 (captures 01/02, 2560 × 1640 physical) and
  1440 × 900 (capture 03, 2880 × 1800 physical), set via
  `T3_LYNXTRON_VIEWPORT_WIDTH/HEIGHT`; theme dark. CORRECTION 2026-07-29:
  the first pass of these captures ran at the 1180 × 748 default because the
  env vars were unset; all three captures were retaken at the labeled sizes
  from the same snapshot (01/02 re-asserted their tap interactions in fresh
  sessions before their screenshots).
- Fixture: `prepare-transcript-visual-state.mjs --prompt-count 8` — eight real
  prompts through the production connector (earlier ones interrupted after
  their user message persisted, the final one accumulated provider work);
  settled `latestTurn.state = "error"`, 9 messages, 19 activities.
  Snapshot hash in `01-initial-bottom.capture.json`.

## Shared state machine

`reduceTranscriptFollow` in `client-runtime/presentation/transcript`:
user-sourced scrolls attach/detach follow by distance-from-end; layout/diff
scrolls never detach; jump-to-latest and thread switches reset. Five focused
unit tests cover detach, reattach, reset, identity, and custom thresholds
(17 transcript tests total). The Lynx host maps `ListEventSource.SCROLL` to
"user" and DIFF/LAYOUT to "layout"; the timeline is remounted per thread
(`key={activeThreadId}`), so thread switches restore bottom-follow like Web.

## Captures (one screenshot per fresh session, taken after interactions)

1. `01-initial-bottom.jpg` — fresh session opens pinned to the transcript
   end of a content-overflowing thread (contexts 5–8 visible, 1–4 above the
   fold): `initial-scroll-index` bottom positioning works; folds
   ("Worked for 309ms" / "216ms"), error work rows, and the
   `+1 previous tool call` toggle render from canonical data. Zero DevTool
   renderer errors (capture gate).
2. `02-fold-and-group-expanded.jpg` — after a DevTool tap pass in a fresh
   session: the work-group toggle expanded (label asserted to flip to
   "Show less" via `DOM.getOuterHTML`), the last turn fold expanded
   (chevron ▾; its hidden rows — runtime error, commentary, `✓ Command run`
   with the real Bash command — now visible), and the list stayed pinned to
   the bottom through the layout shift, demonstrating that layout-sourced
   scroll offsets do not detach follow. Zero renderer errors.

3. `03-initial-bottom-1440x900.jpg` — fresh 1440 × 900 session over the same
   snapshot opens pinned to the transcript end with the same row set; zero
   renderer errors. Both standard viewports are now covered for the
   `<list>` transcript surface.

## Registered limitation (R12)

The user-scroll detach → "Jump to latest" pill → tap-to-reattach path could
not be exercised at runtime: Lynxtron 0.0.5 DevTool input emulation delivers
taps only — mouse-drag sequences (with/without `buttons`), touch-event
sequences, and `mouseWheel` all produce zero list movement (element box
models verified unchanged), and OS-level input was declined for this
session. Registered as R12 in `compat-matrix.md` with an upstream issue
draft; the contract itself is unit-tested and the pill/tap wiring uses the
same `bindtap` path proven working in capture 2. Runtime scroll passes
(streaming follow, detach/reattach, 1/100/1,000-row recycling) remain
phase-exit work gated on R12 or an approved OS-input session.

## Verification

- client-runtime transcript tests: 17 passed.
- Web typecheck: clean; lynxtron app typecheck: unchanged 233 pre-existing.
- Lynx production build: pass (2,108.1 kB).
- All three captures: zero DevTool renderer errors.
- `verify-transcript-scroll.mjs` documents the intended headless pass; it
  currently fails at the drag step because of R12, not a product defect.
