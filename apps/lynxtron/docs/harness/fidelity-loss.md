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
- `working-tree-product-change`: an explicit before/after measurement isolates a
  real uncommitted product change without pretending it is an existing commit.
- `measured-product-change`: a committed product change has a direct,
  same-snapshot before/after measurement and receives that measured delta.
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
asset. Twenty remote images were loaded anonymously before the local copies
were removed.

Moving those seven files out of the checkout removed:

- 3,381,938 logical bytes;
- 3,395,584 allocated filesystem bytes.

The current-head docked Composer pair added two more remote-only images
(572,838 logical bytes). Its Browser-only score is intentionally not a blanket
pass:

- geometry residual `0`: Composer, editor, surface, editor area, footer, and
  context rectangles match exactly;
- content residual `0.111111`: eight of nine anchors match; placeholder copy
  differs;
- typography residual `0.007813`: font sizes match and editor line height
  differs by 0.25px on a 32px scale;
- material residual `0.105894`: the Composer plus context region has SSIM
  `0.894106`;
- runtime residual `0`: both Browser renderers are semantically ready with no
  renderer errors.

This point updates only Lynx-for-Web cells. It does not score Native behavior or
Composer interaction.

The follow-up working-tree fix moved the default placeholder decision into
`packages/client-runtime` and made Web and Lynx consume the same session-phase
projection. Its direct before/after evidence shows:

- content residual `0.111111 → 0`: the rendered Web `aria-placeholder` and Lynx
  placeholder text now match, bringing measured content anchors from 8/9 to
  9/9;
- material residual `0.105894 → 0.085089`: Composer/context SSIM improved from
  `0.894106` to `0.914911` without a screenshot-specific style override;
- `composer-docked` loss `71.2771% → 70.1904%`;
- total conservative loss `91.1014% → 91.0645%`.

The second remote-only pair adds 571,549 logical bytes without increasing the
local screenshot count.

The lifecycle-reconnecting checkpoint adds a corrected parent-commit before
frame plus matched current Web and Lynx-for-Web frames. The corrected harness
waits for Lynx `readProjectBranch` completion before terminating the owned
server, so missing model/placeholder/branch state from an early diagnostic is
classified as harness timing noise rather than product loss. The stable
before/after measurement shows:

- content residual `0`: lifecycle, model, model option, placeholder, controls,
  and checkout context match;
- geometry vertical delta `31px → 0px`, with all 24 retained Composer anatomy
  anchors at zero after the fix;
- full-frame SSIM `0.866145 → 0.914674`;
- runtime residual `0`: both clients enter the expected disconnected
  `connecting` lifecycle with matching identity and no unexpected errors;
- only Lynx-for-Web dimensions are updated; Native recovery and reconnect
  interaction remain unmeasured.

The idle-thread checkpoint similarly separates a harness mismatch from product
loss: the canonical idle fixture has zero messages, so the harness waits for Web
thread sync to finish and then requires both transcript row arrays to remain
empty. It does not require fake populated rows. On that valid sample:

- Browser Sidebar rows move from `x=9, width=255` to the Web authority's
  `x=8, width=239`, and both row y coordinates now match;
- measured geometry residual falls from `0.214844` to `0.058594`; the remaining
  15px card-wrapper height difference stays explicit;
- full-frame SSIM improves from `0.908539` to `0.909155`; the low Sidebar-region
  material score remains open;
- a fresh staged-bundle Native run proves three 225×82 rows and three 225×78
  cards stay within the 256px rail, with main transport sequence `2 → 3` and
  zero renderer errors. This is Native containment/readiness evidence, not a
  Native pixel-residual update.

The Footer icon checkpoint uses actual control leaves rather than the Web
model-option wrapper:

- Hero Footer SSIM improves `0.843611 → 0.845620`;
- Sendable Footer SSIM improves `0.840541 → 0.842550`;
- both 768×172 Composer-region residuals improve by `0.000185`;
- a fresh Native staged-bundle run measures three 14px chevrons, one 16px
  runtime icon, and one 18px Build icon with zero renderer errors;
- Footer text metrics and context-strip material remain open.

Evidence and report directories are capped at 100 screenshots:

```sh
node apps/lynxtron/scripts/check-screenshot-budget.mjs --limit 100
```

Fresh captures should be written under `/tmp`, uploaded to the static asset
repository, referenced by immutable commit and SHA-256, and then deleted.

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

| Requested outcome                                        | Artifact                                                                                                                                  | Verification                                                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define a weighted loss equation                          | `scripts/fidelity-loss-model.json`                                                                                                        | Client and dimension weights each sum to 1; focused tests reject invalid models                                                                                                                     |
| Include screens, states, and visual approximation        | Fixed 40-state registry plus content, geometry, typography, material, interaction, and runtime dimensions                                 | Generated `history.json` contains 40 per-state rows and six per-dimension summaries                                                                                                                 |
| Reconstruct progress over time and commits               | `scripts/fidelity-loss-history.json`                                                                                                      | Sixteen chronological milestones; every commit anchor resolves in Git; every source has a path and hash                                                                                             |
| Base the reconstruction on existing screenshots and logs | Historical anchor metrics, strict manifest gates, MAE/significant-pixel reports, SSIM matrix, runtime readiness, and Model Picker outcome | Twelve source artifacts are recorded; backup artifacts are hash-checked when the backup worktree is available                                                                                       |
| Show that loss decreased                                 | `reports/fidelity-loss/{history.json,history.csv,index.html}`                                                                             | Conservative loss 98.30% → 68.74% historical best; historical-best line is monotonic                                                                                                                |
| Keep missing/stale evidence honest                       | Evidence confidence and archaeology confidence event                                                                                      | Current loss is 87.07% with 86.23% evidence debt; the 68.74% historical best remains visible                                                                                                        |
| Provide a usable visualization                           | Single-file interactive HTML                                                                                                              | 19 points, 4 series, 6 group bars, 40 state rows, filters, legend toggles, and tooltips                                                                                                             |
| Connect loss to screenshots                              | Checkpoint review in `index.html`                                                                                                         | Baseline, strict-matrix, Model Picker, Composer, lifecycle, idle-thread, and Footer-icon checkpoints load 20 direct Web/Lynx/Native frames from GitHub Pages; metrics-only checkpoints remain empty |
| Explain every commit contribution                        | Attribution table, raw/EMA commit chart, and `commit-attribution.csv`                                                                     | Every measured interval balances exactly; 78 archaeology commits are explicitly unmeasured rather than blamed for evidence reset                                                                    |
| Explain upward movement                                  | Attribution allocation types and cause text                                                                                               | Only two positive events remain: stricter pixel measurement and stale-evidence demotion                                                                                                             |
| Make the system repeatable                               | `report:fidelity-loss`, `report:fidelity-loss:check`, and `evidence:screenshot-budget`                                                    | Generator, staleness gate, and 100-screenshot cap pass; focused invariants cover score, attribution, and budget behavior                                                                            |
