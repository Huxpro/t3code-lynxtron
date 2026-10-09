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

## Gates, by how often they run

| Tier    | When                      | What                                                                                          | Budget       |
| ------- | ------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| Quick   | Every step                | `pnpm run typecheck`, format the files you touched, `pnpm build:lynxtron`, one readiness gate | Minutes      |
| Related | When you change a screen  | The battery gates for that screen                                                             | Under 10 min |
| Full    | Before a milestone merges | `pnpm run test`, the whole Native battery, the frame set against the milestone's baseline     | Half an hour |

- Frame and pixel comparison belongs to the full tier only. Between milestones,
  look at a frame when you need to see something; do not diff frames.
- A readiness gate is the first entry of the plan `scripts/prepare-native-battery.mjs <dir>`
  writes; run entries with `scripts/run-native-battery.mjs`.
- Between milestones a gate or a count may get worse. Treat them as a trend.
  Only the milestone merge has to be no worse than its baseline.
- A gate that fails once gets one rerun. If it passes, note it and move on.
  Diagnose only when the same failure shows twice in a full run.
- CI repeats typecheck, tests, formatting, and the upstream delta check. Let it;
  do not rerun locally what CI is about to run.

## Stop losses

- Each step has a time box. If a step has not passed the quick tier after about
  90 minutes, or two approaches to the same problem have failed, revert the
  step, write down why in the PR or the issue, and take the other path or the
  next milestone that does not depend on it.
- Do not fix what you were not asked to fix. A visual difference a refactor
  exposes goes on a list, not into the change, unless it fails the full tier.
- Measure the whole product: battery pass count, frames that changed, upstream
  delta count, conflicts and type errors in a trial merge. Do not tune one
  screen while those stand still.
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
