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
- **Commit attribution**: a low-confidence allocation of measured checkpoint
  deltas across commits that changed the affected surfaces.
- **Commit EMA**: a smoothed view over the attributed commit series. Measured
  checkpoint dots remain visible so smoothing never masquerades as direct
  measurement.

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

## Commit attribution

Most historical commits do not have an independent screenshot immediately
before and after the commit. The website therefore distinguishes:

- `estimated-from-checkpoint-delta`: the measured interval delta is allocated
  across commits by touched product surface and change size. Confidence is
  deliberately low.
- `evidence-session`: the loss changed inside one uncommitted evidence session.
  No product commit receives the delta.
- `measurement-refinement`: a stricter measurement raised loss without evidence
  of a product regression.
- `evidence-policy`: stale evidence was demoted. Product residual stays
  unchanged while evidence debt rises.
- `unmeasured-product-commit`: a commit exists, but no current-head measurement
  supports assigning it a loss delta.

Attribution is conservative and additive: rows in each measured interval sum
exactly to that checkpoint's loss delta. It is observability, not causal proof.

## Screenshot review

The website combines the loss timeline and representative comparison frames.
Each image is attached to a checkpoint with a SHA-256 and relationship:

- `direct`: the image belongs to the measurement or strict evidence point.
- `representative`: a nearby frame illustrates a metrics-only checkpoint but
  is not the direct measurement input.

Metrics-only checkpoints render an explicit empty slot. The website never
substitutes an unrelated image just to fill the gallery.

Screenshot binaries are not stored in the T3 checkout. They are hosted from the
public GitHub Pages repository:

```text
https://github.com/Huxpro/t3code-fidelity-assets
https://huangxuan.me/t3code-fidelity-assets/assets/
```

The history ledger pins the hosting repository commit and SHA-256 for every
asset. Seven remote images were loaded anonymously in a headless browser before
the local copies were removed.

Moving those seven files out of the checkout removed:

- 3,381,938 logical bytes;
- 3,395,584 allocated filesystem bytes.

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
- Per-commit attribution:
  `reports/fidelity-loss/commit-attribution.csv`
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

| Requested outcome                                        | Artifact                                                                                                                                  | Verification                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define a weighted loss equation                          | `scripts/fidelity-loss-model.json`                                                                                                        | Client and dimension weights each sum to 1; focused tests reject invalid models                                                                     |
| Include screens, states, and visual approximation        | Fixed 39-state registry plus content, geometry, typography, material, interaction, and runtime dimensions                                 | Generated `history.json` contains 39 per-state rows and six per-dimension summaries                                                                 |
| Reconstruct progress over time and commits               | `scripts/fidelity-loss-history.json`                                                                                                      | Nine chronological milestones; every commit anchor resolves in Git; every source has a path and hash                                                |
| Base the reconstruction on existing screenshots and logs | Historical anchor metrics, strict manifest gates, MAE/significant-pixel reports, SSIM matrix, runtime readiness, and Model Picker outcome | Twelve source artifacts are recorded; backup artifacts are hash-checked when the backup worktree is available                                       |
| Show that loss decreased                                 | `reports/fidelity-loss/{history.json,history.csv,index.html}`                                                                             | Conservative loss 98.30% → 67.89% historical best; historical-best line is monotonic                                                                |
| Keep missing/stale evidence honest                       | Evidence confidence and archaeology confidence event                                                                                      | Archaeology raises debt to 91.13% while preserving both the 67.89% historical best and the 9.48% observed residual                                  |
| Provide a usable visualization                           | Single-file interactive HTML                                                                                                              | Headless load: 9 points, 4 series, 6 group bars, 39 state rows, no horizontal overflow; filters, legend toggles, and tooltips work                  |
| Connect loss to screenshots                              | Checkpoint review in `index.html`                                                                                                         | Baseline, strict-matrix, and Model Picker checkpoints load 7 direct Web/Lynx/Native frames from GitHub Pages; metrics-only checkpoints remain empty |
| Explain every commit contribution                        | Attribution table, raw/EMA commit chart, and `commit-attribution.csv`                                                                     | Every measured interval balances exactly; 78 archaeology commits are explicitly unmeasured rather than blamed for evidence reset                    |
| Explain upward movement                                  | Attribution allocation types and cause text                                                                                               | Only two positive events remain: stricter pixel measurement and stale-evidence demotion                                                             |
| Make the system repeatable                               | `report:fidelity-loss` and `report:fidelity-loss:check`                                                                                   | Generator and staleness gate pass; 7 focused invariants pass                                                                                        |
