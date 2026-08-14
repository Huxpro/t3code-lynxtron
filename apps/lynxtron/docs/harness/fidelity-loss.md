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
asset. Twenty-four remote images were loaded anonymously before the local copies
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

The follow-up label checkpoint applies the shared 70% muted foreground only to
Composer Footer controls:

- Hero Footer SSIM improves `0.845620 → 0.853794`;
- Sendable Footer SSIM improves `0.842550 → 0.850723`;
- both Composer-region residuals improve by `0.001408`;
- Native resolves the token to alpha `0.698039` (`178/255`), within one 8-bit
  quantization step of `0.7`, with zero renderer errors;
- text widths and context-strip material remain open.

The Context icon checkpoint removes two external SVG wrappers that rendered as
24×18 leaves despite requesting 12px:

- Hero Context SSIM improves `0.898714 → 0.918270`;
- Sendable Context SSIM improves `0.898714 → 0.918089`;
- both Composer-region residuals improve by about `0.004838`;
- Native measures three approximately 12px Context icons with zero renderer
  errors;
- lower-background and control-spacing material remain open.

The Context control checkpoint then replaces stale optical translations and
padding with the Web authority's intrinsic button box model:

- Hero Context SSIM improves `0.918270 → 0.942750`;
- Sendable Context SSIM improves `0.918089 → 0.942568`;
- checkout control width delta falls `7.016px → 0.016px`, and branch width
  delta falls `6.141px → 0.141px`, without fixed widths;
- Native independently verifies four 12px icons and two 24px controls on the
  exact staged bundle, with main transport advancement and zero renderer
  errors;
- text rasterization and background material remain open, and Native pixel
  parity is not claimed.

The Context label checkpoint localizes the next residual before changing
typography:

- checkout-label pixels contribute 68.8% of the remaining Context absolute
  error, while the central background contributes 6.7%;
- matching Web's 70% muted color and 16px line height, while removing stale
  synthetic stroke/scaling and half-pixel offsets, reduces total Context
  absolute error by 41.8%;
- Hero Context SSIM improves `0.942750 → 0.980469`;
- Sendable Context SSIM improves `0.942568 → 0.980288`;
- Native independently verifies both labels at `12px/500`, `16px` height and
  line height, and alpha `0.698039`, with main transport advancement and zero
  renderer errors;
- branch-icon rasterization is now the largest localized Context hotspot.

The exact Context icon checkpoint then traces that hotspot to the icon pipeline:

- `git-branch` had stale Lucide path data and no `#818181` raster at any
  selectable size, so it silently used the 18px white fallback at 12px;
- syncing to Lucide 0.564, generating exact 12px dark/light variants, and
  preferring exact-size assets improves branch-icon SSIM
  `0.684822 → 0.974066`;
- total dark Context absolute error falls another 10.3%;
- Hero Context SSIM improves `0.980469 → 0.983169`, and Sendable improves
  `0.980288 → 0.982988`;
- Native independently verifies four 12px Context icons on the exact bundle,
  with main transport advancement and zero renderer errors;
- a new matched light Hero diagnostic passes and confirms muted instead of
  white fallback, but its broader Context material remains separate and does
  not overwrite whole-state light evidence.

The light Context checkpoint promotes that diagnostic into matched material
evidence:

- 64% of the original light strip absolute error sits in the top 11px material
  ramp, with matching snapshot, state, theme, and viewport;
- a CSS gradient improves Browser Preview but renders flat on Native, so it is
  rejected as a cross-surface product gap rather than counted as a fix;
- a shared 16-band view ramp raises light Context SSIM
  `0.847811 → 0.913372` and Composer-region SSIM
  `0.908741 → 0.924627`;
- light Context absolute error falls 69.4%, while dark Web and Lynx frames stay
  byte-identical;
- exact-theme Native verifies all 16 band boxes, endpoint colors, the same
  retained pixel profile, transport advancement, and zero renderer errors;
- adding fresh measured confidence lowers conservative loss and evidence debt,
  while observed residual rises slightly because a previously unknown light
  material cell is now measured honestly.

The 1440×900 Composer checkpoint then validates the second standard viewport:

- dark and light Browser geometry remains exactly 768px/724px wide, shifted
  `+80px x / +40px y` from 1280×820;
- dark/light Context and Composer residuals match the 1280 cells to rounding,
  so no duplicate score update is applied;
- Native cold start reveals an unkeyed-sibling reconciliation race where late
  model-option insertion can reuse the runtime wrapper position;
- stable keys on model, model-option, runtime, and interaction islands fix the
  root cause without timing waits;
- two dark Native starts pass, a deterministic `High · 1M` fixture renders all
  five controls in canonical order, and light Native verifies the 16-band ramp;
- the checkpoint changes no loss value because it closes viewport and
  reconciliation scope rather than adding a new residual measurement.

The Footer icon material checkpoint then closes the remaining mode-icon alpha
and color mismatch:

- localized dark Hero error shows runtime and interaction icons were opaque
  `#a1a1aa` PNGs while Web composes muted `#818181` at 70% element alpha;
- exact dark/light rasters plus `0.7` icon and chevron opacity preserve all
  previously matched geometry;
- Hero Footer SSIM improves `0.853794 → 0.855352`, while Sendable improves
  `0.850723 → 0.852281`;
- both matched dark Composer-region SSIM values improve by `0.000573`, reducing
  Hero/Sendable material residuals to `0.053978` and `0.049278`;
- matched light Hero evidence corroborates the theme mapping without adding a
  duplicate ledger update;
- exact-theme dark and light Native runs resolve all five Footer icon leaves to
  opacity `0.7`, advance main transport, report zero renderer errors, and
  dispose isolated state without being promoted to Native pixel parity;
- conservative loss moves `0.869314 → 0.869312`, observed residual moves
  `0.060742 → 0.060727`, and evidence debt remains `0.860862`.

The working-thread checkpoint then opens the first populated transcript cell on
current Web, Lynx-for-Web, and Native:

- invalid capture paths are classified first: intentional large atlases are
  excluded from icon readiness, completed/failed states require actual
  matching fixtures, and Lynx row geometry is measured at the native
  list-item wrapper rather than a semantic child;
- one copied running-thread snapshot, route, model, theme, density, and
  1280×820 viewport pass the Browser identity and console gates;
- Lynx's first transcript row moves from `y=100` to Web's `y=68` by replacing
  the stale 48px list inset with the shared 16px contract;
- the working outer row moves from 24px to 40px while preserving its 24px
  visual row, matching Web within 0.5px;
- locked existing-thread Composer copy now projects `Local checkout` through
  shared client-runtime state instead of rendering Lynx-only
  `Current checkout`;
- full-frame SSIM improves `0.912880 → 0.920077`, transcript-viewport SSIM
  improves `0.957407 → 0.969803`, and the 768px transcript-column SSIM
  improves `0.943311 → 0.959686`;
- exact-bundle Native verifies dark identity, Stop state, 16px first-row
  inset, 40px working wrapper, 24px visual row, `Local checkout`, main
  transport `2 → 3`, zero renderer errors, and isolated-state cleanup;
- conservative loss moves `0.869312 → 0.861490`, observed residual moves
  `0.060727 → 0.057882`, and evidence debt moves
  `0.860862 → 0.852980`; completed/failed transcript fixtures and physical
  scrolling remain open.

The completed-thread checkpoint then creates and validates a real terminal
provider turn instead of mutating renderer state:

- Codex fails immediately because its CLI is absent; Claude produces an OAuth
  error despite a terminal completed state; both are rejected as fixture
  failures rather than product evidence;
- the accepted OpenCode fixture has exactly two messages, no activity noise,
  `latestTurnState=completed`, and assistant text `fidelity loop complete`;
- the matched Browser pair exposes a 32px settled-header shift and missing
  assistant outer spacing while content, model, Composer, route, theme, and
  snapshot identity already match;
- Browser Preview uses Web's 48px settled inset, while Native implements the
  same result as a stable 16px list inset plus a real 32px list spacer;
- a single Native wrapper owns the assistant's 16px outer spacing, avoiding
  double padding across the shared semantic row and list primitive;
- full-frame SSIM improves `0.924859 → 0.934639`,
  transcript-viewport SSIM improves `0.970158 → 0.987917`, and transcript
  column SSIM improves `0.960334 → 0.983870`;
- exact-bundle Native verifies the canonical response, 48px relative inset,
  75px assistant wrapper around a 59px visual row, idle Composer,
  provider-shaped controls, `Local checkout`, transport `2 → 3`, zero renderer
  errors, and isolated cleanup;
- conservative loss moves `0.861490 → 0.853655`, observed residual moves
  `0.057882 → 0.055244`, and evidence debt moves
  `0.852980 → 0.845097`; failed, approval, question, and physical scrolling
  states remain open.

The failed-thread checkpoint then creates a real provider failure:

- an invalid OpenCode model produces `latestTurnState=error`,
  `sessionStatus=error`, and persisted `Model not found` without renderer-only
  fixture mutation;
- Node SQLite replaces a silent Bun `VACUUM INTO` no-op and verifies that the
  copied snapshot file exists before capture;
- the baseline shows Web's canonical error banner and `Big Pickle` model
  fallback, while Lynx omits the banner and displays the invalid raw slug;
- both connector transports now carry canonical session errors into one shared
  banner anatomy, and active-thread model fallback resolves within the same
  provider even when connector events arrive in a different order;
- top-banner transcript rows use Web's 16px header instead of the 48px settled
  header, leaving row y deltas at 4px or less;
- full-frame SSIM improves `0.915270 → 0.922175`;
- exact-bundle Native verifies `Model not found: opencode/not-a-real-model.`,
  `Big Pickle`, the failed work status, idle Composer, `Local checkout`,
  top-banner spacing, transport `2 → 3`, zero renderer errors, and isolated
  cleanup;
- conservative loss moves `0.853655 → 0.847596`, observed residual moves
  `0.055244 → 0.054614`, and evidence debt moves
  `0.845097 → 0.838791`; retry/dismiss interaction and other failure classes
  remain open.

The approval checkpoint then creates a real pending command request through the
OpenCode connector in `approval-required` mode:

- admission binds the selected thread ID, `approval.requested` activity,
  request detail, running session, active turn, route, theme, viewport, and
  immutable snapshot;
- the old semantic gate's inability to project collapsed approval DOM, the
  server-generated thread title, and Browser-versus-Native box-model semantics
  are recorded as harness mismatches rather than product loss;
- the valid baseline exposes a redundant Lynx-only wrapper that lays the 90px
  editor and 40px footer out as adjacent columns, collapsing the editor to
  256px and moving the footer 256px right and 90px up;
- removing the wrapper lets the shared Composer surface own the vertical stack
  directly; the maximum retained box delta falls `510px → 0.3125px`;
- full-frame SSIM improves `0.893053 → 0.912805`;
- exact-bundle Native verifies the real approval identity, running/Stop
  semantics, pending copy, detail, all four action labels and boxes, transport
  `2 → 3`, zero renderer errors, and isolated cleanup;
- conservative loss moves `0.847596 → 0.840613`, observed residual moves
  `0.054614 → 0.053087`, and evidence debt moves
  `0.838791 → 0.831677`; action-response receipts, reverse states, file
  approvals, question state, and Native pixel parity remain open.

The question checkpoint then creates a real OpenCode `user-input.requested`
turn with Safe and Fast options:

- admission binds thread ID, request ID, active turn, running session, route,
  theme, viewport, and immutable snapshot;
- the valid baseline exposes a generic 255px Lynx Composer beneath the shared
  question panel, missing custom-answer/Submit semantics and a response
  command, plus an 82px request row that shifts the working row by 22px;
- pending-answer projection moves into `client-runtime`, Web keeps a
  compatibility re-export, and both Lynx connector hosts dispatch the canonical
  `thread.user-input.respond` command;
- Lynx now matches Web's 343.5px question Composer, model-only footer, placeholder,
  options, Submit semantics, and visible 60px request-row contract;
- full-frame SSIM improves `0.859553 → 0.884487`;
- exact-bundle Native selects Safe, enables Submit, advances connector sequence
  `14 → 16`, resolves `hasPendingUserInput`, records zero renderer errors, and
  cleans isolated state;
- conservative loss moves `0.840613 → 0.828830`, observed residual moves
  `0.053087 → 0.050526`, and evidence debt moves
  `0.831677 → 0.819721`; multi-select/multi-question navigation, typed custom
  answers, and Native pixel parity remain open.

The disabled Composer checkpoint then measures an existing matching state
instead of inventing a product fix:

- the 1280x820 dark Browser pair matches the 768x140 Composer, surface,
  editor, footer, placeholder, four controls, context labels, disabled frame,
  and disabled primary action;
- full-frame SSIM is 0.858996, and both renderers report zero errors;
- the first Native attempt is classified `invalid-harness` because the server
  was interrupted after its ready log but before the main connector reached
  ready;
- the corrected verifier waits for a cleared lifecycle banner and idle
  Composer before interrupting the exact owned server;
- exact-bundle Native then proves
  `idle → error/disabled → reconnecting → idle`, stable 768x140 Composer
  geometry, sequence `14 → 19`, zero renderer errors, and isolated cleanup;
- the milestone is allocated as `evidence-session`; Native material pixels are
  intentionally unscored;
- conservative loss moves `0.828830 → 0.811117`, observed residual moves
  `0.050526 → 0.047000`, and evidence debt moves
  `0.819721 → 0.801802`.

The review-diff checkpoint then creates a real one-file patch through the
OpenCode connector:

- the first valid Browser pair exposes a missing live-connector `getTurnDiff`
  path, a promise error, permanent loading state, 30px user-message drift, an
  8px duplicated changed-files gap, and non-compact controls in a 444px
  Composer;
- Browser Preview now forwards the real orchestration RPC, Lynx renders both
  changed lines, multi-word inline code stays in one natural-flow capsule, the
  checkpoint tree uses one shared gap, and measured center-panel width drives a
  functional compact controls menu;
- the old harness requirement for `runtimeBlocker=R10` is replaced by same
  turn/file, real code-diff, non-loading, and non-error postconditions;
- full-frame SSIM improves `0.462162 → 0.499074`; the remaining material
  residual stays explicit because Web and Lynx use different patch renderers;
- exact-bundle Native opens the same patch, verifies both changed lines, the
  540px right panel, 444px idle Composer, zero errors, and isolated cleanup;
- baseline, product fix, and Native certification are separate ledger points,
  so evidence coverage is not attributed as product delta;
- conservative loss moves `0.811117 → 0.786059`, observed residual moves
  `0.047000 → 0.038592`, and evidence debt moves
  `0.801802 → 0.777471`.

The current New Thread Hero checkpoint then replaces stale evidence without a
product change:

- an offline project fixture with unavailable `codex/gpt-5.6-sol` is rejected
  instead of scoring Web's retained project default against Lynx's ready
  fallback;
- a replacement empty project is created through the real connector and carries
  the available `claudeAgent/claude-fable-5` default;
- Web and Lynx match project/no-thread identity, Claude Fable 5, High · 1M,
  Full access, Build, placeholder, Current checkout/main, and all retained
  Composer geometry;
- full-frame SSIM is 0.938457 with zero Browser errors;
- the Native gate no longer borrows lifecycle recovery, because Hero
  intentionally hides that banner, and waits for the project-default model
  instead of reading the initial `Select model` frame;
- exact-bundle Native verifies the same controls, 768x140 Composer, dark theme,
  main transport, zero errors, and isolated cleanup;
- both milestones are `evidence-session`; no product delta or Native pixel
  parity is claimed;
- conservative loss moves `0.786059 → 0.770237`, observed residual moves
  `0.038592 → 0.034724`, and evidence debt moves
  `0.777471 → 0.761971`.

The current working Composer checkpoint then fills a distinct state from the
working transcript viewport:

- a real OpenCode turn is captured read-only while its session and latest turn
  are running; this frozen snapshot is used only for Browser renderer state;
- Web and Lynx match working/Stop semantics, Big Pickle, Build, Full access,
  placeholder, Local checkout/main, and the 768x140 Composer geometry;
- full-frame SSIM is 0.928664 with zero Browser errors;
- a fresh exact-bundle Native run creates a separate thread, sends a real
  `sleep 120` turn, reaches Stop, taps it, advances connector sequence
  `16 → 20 → 25 → 37`, and returns the primary action to disabled;
- OpenCode's omitted interaction toggle is treated as provider-shaped UI, while
  Stop, geometry, checkout, runtime, and cleanup remain required;
- both milestones are `evidence-session`; the Browser state does not duplicate
  the separately scored transcript viewport and Native pixels remain
  representative only;
- conservative loss moves `0.770237 → 0.754339`, observed residual moves
  `0.034724 → 0.033048`, and evidence debt moves
  `0.761971 → 0.745943`.

The current Settings General checkpoint then replaces stale route evidence:

- Web and Lynx match the eight navigation labels, twelve canonical row IDs,
  General/About sections, `/settings/general` route, theme, and loading/error
  state;
- full-frame SSIM is 0.833814, so the material residual remains explicit;
- exact-bundle Native records the full canonical copy, two sections, fourteen
  rows with 896px widths, and a retained General screenshot;
- Native then visits Appearance, Keybindings, Providers, Connections, Source
  Control, Beta, and Archive, returns to chat, repeats the Providers cycle
  twice, and preserves the route across connector resync `14 → 15`;
- both milestones are `evidence-session`; General control mutation and restart
  persistence remain separate scope;
- conservative loss moves `0.754339 → 0.738082`, observed residual moves
  `0.033048 → 0.031908`, and evidence debt moves
  `0.745943 → 0.729449`.

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

| Requested outcome                                        | Artifact                                                                                                                                  | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define a weighted loss equation                          | `scripts/fidelity-loss-model.json`                                                                                                        | Client and dimension weights each sum to 1; focused tests reject invalid models                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Include screens, states, and visual approximation        | Fixed 40-state registry plus content, geometry, typography, material, interaction, and runtime dimensions                                 | Generated `history.json` contains 40 per-state rows and six per-dimension summaries                                                                                                                                                                                                                                                                                                                                                                                                                |
| Reconstruct progress over time and commits               | `scripts/fidelity-loss-history.json`                                                                                                      | Forty-two chronological milestones; every commit anchor resolves in Git; every source has a path and hash                                                                                                                                                                                                                                                                                                                                                                                          |
| Base the reconstruction on existing screenshots and logs | Historical anchor metrics, strict manifest gates, MAE/significant-pixel reports, SSIM matrix, runtime readiness, and Model Picker outcome | Twenty-three source artifacts are recorded; backup artifacts are hash-checked when the backup worktree is available                                                                                                                                                                                                                                                                                                                                                                                |
| Show that loss decreased                                 | `reports/fidelity-loss/{history.json,history.csv,index.html}`                                                                             | Conservative loss 98.30% → 68.74% historical best; historical-best line is monotonic                                                                                                                                                                                                                                                                                                                                                                                                               |
| Keep missing/stale evidence honest                       | Evidence confidence and archaeology confidence event                                                                                      | Current loss is 73.8082% with 72.9449% evidence debt; the 68.74% historical best remains visible                                                                                                                                                                                                                                                                                                                                                                                                   |
| Provide a usable visualization                           | Single-file interactive HTML                                                                                                              | 42 points, 4 series, 6 group bars, 40 state rows, filters, legend toggles, and tooltips                                                                                                                                                                                                                                                                                                                                                                                                            |
| Connect loss to screenshots                              | Checkpoint review in `index.html`                                                                                                         | Baseline, strict-matrix, Model Picker, Composer, lifecycle, idle-thread, Footer-icon, Footer-alpha, Context-icon, Context-control, Context-label, exact-icon, light-Context, 1440-viewport, Footer-material, working-thread, completed-thread, failed-thread, approval, question, disabled, review-diff, current Hero, current working Composer, and Settings General checkpoints load 94 direct or representative Web/Lynx/Native frames from GitHub Pages; metrics-only checkpoints remain empty |
| Explain every commit contribution                        | Attribution table, raw/EMA commit chart, and `commit-attribution.csv`                                                                     | Every measured interval balances exactly; 78 archaeology commits are explicitly unmeasured rather than blamed for evidence reset                                                                                                                                                                                                                                                                                                                                                                   |
| Explain upward movement                                  | Attribution allocation types and cause text                                                                                               | Only two positive events remain: stricter pixel measurement and stale-evidence demotion                                                                                                                                                                                                                                                                                                                                                                                                            |
| Make the system repeatable                               | `report:fidelity-loss`, `report:fidelity-loss:check`, and `evidence:screenshot-budget`                                                    | Generator, staleness gate, and 100-screenshot cap pass; focused invariants cover score, attribution, and budget behavior                                                                                                                                                                                                                                                                                                                                                                           |
