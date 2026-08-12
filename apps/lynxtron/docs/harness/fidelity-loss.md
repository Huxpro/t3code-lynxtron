# Fidelity loss accounting

The fidelity-loss system reconstructs the T3 Code Web → Lynx-for-Web →
Lynxtron Native port as a weighted, fixed-denominator time series.

## Why a fixed denominator

Counting only captured screens makes sparse evidence look artificially good.
The denominator is therefore fixed at:

- 39 product states from the historical Plan 11C matrix;
- each state's required target clients, Lynx-for-Web and/or Native;
- six independently weighted dimensions:
  content, geometry, typography, material/pixels, interaction, and runtime.

Every state has a frequency/salience weight. Native carries more weight than
Lynx-for-Web because Browser evidence cannot certify Native-only behavior.

## Formula

For every state/client/dimension cell:

```text
cell weight = state weight × client weight × dimension weight

conservative cell loss =
  confidence × measured residual
  + (1 - confidence) × unknown residual

total loss =
  Σ(cell weight × conservative cell loss)
  / Σ(cell weight)
```

Version 1 sets unknown residual to `1`. Missing evidence cannot lower the
score.

The report also exposes:

- **Observed product residual**: weighted residual over observed cells only.
- **Evidence debt**: `1 - weighted confidence`.
- **Conservative loss**: observed residual plus maximum loss for unknown mass.
- **Historical best**: the monotonic minimum conservative loss reached so far.

This distinction matters at the archaeology reset. Old pixels were correctly
demoted because they did not certify the final5 bundle. Evidence debt rises,
but the historical observed product residual is not rewritten as a regression.

## Evidence mapping

The history ledger contains dated observations, not invented per-commit
interpolation:

1. first archived New Thread, Settings, and Sidebar geometry;
2. exact-owned Native readiness;
3. the seven-state Browser matrix;
4. the 39-state strict matrix;
5. first full-frame Web/Native pixel metrics;
6. masked pixel convergence;
7. the four-state Native review matrix;
8. the Model Picker Browser/Native closeout;
9. the final5 evidence archaeology reset.

Each point records:

- observation timestamp;
- code commit when known;
- source artifact path and SHA-256;
- raw anchor deltas, MAE/significant-pixel share, SSIM-derived residual, or
  strict gate outcome;
- confidence and measurement method.

Evidence timestamps and commits are separate because several historical
working-tree captures were never committed. The report does not manufacture a
Git association for them.

## Files

- Formula and denominator:
  `scripts/fidelity-loss-model.json`
- Historical facts:
  `scripts/fidelity-loss-history.json`
- Calculator and generator:
  `scripts/fidelity-loss.mjs`
- Focused invariants:
  `scripts/fidelity-loss.test.mjs`
- Machine-readable output:
  `reports/fidelity-loss/history.json`
- Spreadsheet-friendly output:
  `reports/fidelity-loss/history.csv`
- Interactive single-file visualization:
  `reports/fidelity-loss/index.html`

## Commands

Generate all artifacts:

```sh
node apps/lynxtron/scripts/fidelity-loss.mjs
```

Fail when committed artifacts are stale:

```sh
node apps/lynxtron/scripts/fidelity-loss.mjs --check
```

Run focused tests:

```sh
vp test run apps/lynxtron/scripts/fidelity-loss.test.mjs
```

## Interpretation

The reconstructed historical best is not a final current-head certification.
The current manifest still has 18 required pending cells. Future evidence
should append a new dated point to the history ledger, never modify an older
point to make the curve smoother.

## Prompt-to-artifact checklist

| Requested outcome                                        | Artifact                                                                                                                                  | Verification                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Define a weighted loss equation                          | `scripts/fidelity-loss-model.json`                                                                                                        | Client and dimension weights each sum to 1; focused tests reject invalid models                                                    |
| Include screens, states, and visual approximation        | Fixed 39-state registry plus content, geometry, typography, material, interaction, and runtime dimensions                                 | Generated `history.json` contains 39 per-state rows and six per-dimension summaries                                                |
| Reconstruct progress over time and commits               | `scripts/fidelity-loss-history.json`                                                                                                      | Nine chronological milestones; every commit anchor resolves in Git; every source has a path and hash                               |
| Base the reconstruction on existing screenshots and logs | Historical anchor metrics, strict manifest gates, MAE/significant-pixel reports, SSIM matrix, runtime readiness, and Model Picker outcome | Twelve source artifacts are recorded; backup artifacts are hash-checked when the backup worktree is available                      |
| Show that loss decreased                                 | `reports/fidelity-loss/{history.json,history.csv,index.html}`                                                                             | Conservative loss 98.30% → 67.89% historical best; historical-best line is monotonic                                               |
| Keep missing/stale evidence honest                       | Evidence confidence and archaeology confidence event                                                                                      | Archaeology raises debt to 91.13% while preserving both the 67.89% historical best and the 9.48% observed residual                 |
| Provide a usable visualization                           | Single-file interactive HTML                                                                                                              | Headless load: 9 points, 4 series, 6 group bars, 39 state rows, no horizontal overflow; filters, legend toggles, and tooltips work |
| Make the system repeatable                               | `report:fidelity-loss` and `report:fidelity-loss:check`                                                                                   | Generator and staleness gate pass; 6 focused invariants pass                                                                       |
