# Lynxtron client

The Lynx desktop client for T3 Code, a fork-owned client on top of upstream
code. Layers, invariants and the merge procedure are in `docs/architecture.md`;
engine limits and workarounds are in `docs/compat-matrix.md`.

## Principles

- **Upstream files stay as upstream wrote them.** `node scripts/check-upstream-delta.mjs`
  must pass; an edit to an upstream file is a listed patch with a reason.
- **Share the file, not the idea.** To use upstream logic, state or a component
  on Lynx, run the upstream file and replace what it imports with a `.lynx`
  module of the same name. A Lynx copy of an upstream file is a fork that drifts
  silently. `node scripts/share-report.mjs` shows the trend: upstream lines up,
  Lynx-owned lines down.
- **Lynx-only code** lives in `apps/lynxtron`, `packages/lynx-logic`, and `.lynx`
  modules that stand in for a platform capability.
- **Looks and features are the maintainer's call.** List what a change drops or
  visibly alters and get an answer before it merges. An upstream merge is one
  PR merged with a merge commit.

## Verifying

| When                      | What                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| Every step                | `pnpm run typecheck`, format what you touched, the build, one readiness gate |
| A screen changed          | The battery gates for that screen                                            |
| Before a milestone merges | `pnpm run test`, the whole Native battery, one frame comparison              |

- `scripts/prepare-native-battery.mjs <dir>` writes fixtures and a plan;
  `scripts/run-native-battery.mjs <plan> <results>` runs it. The first plan entry
  is the readiness gate.
- Judge from the gates' text output. Compare frames once per milestone.
- A gate that fails once gets one rerun. A harness failure is not a product
  regression until the same check passes without the change.
- A gate checks that the product renders and behaves, not what upstream's data
  happens to be.
- If a step is not passing after about 90 minutes or two approaches, revert it
  and take another path.
- Report what you ran, what failed, and what is unverified. A build that
  compiles is not proof that it runs.

## Running the app

- Launch in the background (`T3_LYNXTRON_BACKGROUND=1`) with an isolated
  `T3_LYNXTRON_BASE_DIR`, never `~/.t3/userdata`. Do not raise the window unless
  asked. Stop only the PID you started and confirm its server child exited.
- Ready means `__T3_LYNXTRON_CONNECTOR_TRANSPORT__` reports `kind === "main"`
  with `lastSeq()` advancing. Read it right after launch: background-thread
  evaluate stops answering after about 20 seconds; DOM reads, frames and taps
  keep working.
- Computer use covers only what DevTool cannot inject: real keys, drag,
  selection. It has no hover; report hover checks as pending.
