# Lynxtron client

The Lynx desktop client for T3 Code, built on Lynxtron. It is a fork-owned
client on top of upstream code; read `docs/architecture.md` before moving files
across the boundary.

## Boundaries

- Upstream files stay as upstream wrote them. To use an upstream module on
  Lynx, make that file run on Lynx by replacing what it imports with a `.lynx`
  module of the same name. Do not extract logic out of it.
- If a file mixes shell and logic so that nothing below it can be replaced,
  move the block to its own file unchanged, send that move upstream, and list
  it in `upstream-patches.json` until it lands.
- `node scripts/check-upstream-delta.mjs` must pass. Every edit to an upstream
  file needs an entry with a reason that names the problem it solves.

## How to know a change works

These are the gates. Nothing else blocks a change.

1. `pnpm run typecheck` and `pnpm run test` in `apps/lynxtron`.
2. `pnpm --filter t3 build:bundle && pnpm build:lynxtron`.
3. `node scripts/prepare-native-battery.mjs <dir>` then
   `node scripts/run-native-battery.mjs <dir>/plan.json <dir>/results`.
4. Frames of the screens you touched, through Lynx DevTool, compared with the
   same frames from before the change.

Rerun a failing gate once before treating it as a regression; then run it on a
build without the change before calling it pre-existing.

## Judgment over ritual

- Measure the whole product: battery pass count, frames that changed, upstream
  delta count, conflicts and type errors in a trial merge. Do not tune one
  screen's numbers while those stand still.
- Stop losses early. After two failed attempts at the same approach, stop,
  say what you learned, and try a different level: a different seam, a smaller
  goal, or a question to the maintainer.
- Do not write tests that assert on source text or on a script's own code.
  Test behavior by running it.
- A report, an evidence archive, or a fidelity score is optional. Write one
  only when someone will read it.
- Report the checks you ran, what failed, and what you left unverified. A
  build that compiles is not proof that it runs, and a harness failure is not
  a product regression until the same check passes without the change.

## Running the app

- Launch in the background with `T3_LYNXTRON_BACKGROUND=1` and an isolated
  `T3_LYNXTRON_BASE_DIR`. Never point it at `~/.t3/userdata`. Do not raise or
  focus the window unless asked.
- Record the Lynxtron PID at spawn and stop only that PID; confirm its server
  child exited.
- Readiness means `__T3_LYNXTRON_CONNECTOR_TRANSPORT__` reports `kind ===
"main"` with `lastSeq()` advancing. Read it right after launch: on a
  long-lived instance background-thread evaluate stops answering after about
  20 seconds, while DOM reads, frames, taps and the console keep working.
- Computer use is for what DevTool cannot inject: real keys, drag, selection.
  Use the host's background per-app tools on the owned window. They have no
  hover; report hover checks as pending.
