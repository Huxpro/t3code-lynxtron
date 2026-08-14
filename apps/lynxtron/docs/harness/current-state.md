# Current Lynxtron Harness state

Updated: 2026-08-12
Authority: archaeology branch `archaeology/final5-20260812`

This file is the concise authority for what the current checkout can prove.
Source, focused test output, and the current evidence manifest override older
Plan 11 prose and screenshots.

## Proven on the current stack

- The accumulated product work was split into 78 dependency-ordered commits
  after base `4604dd443`.
- Client-runtime verification passed 13 files / 122 tests plus its focused
  typecheck.
- Provider runtime ingestion passed 48 focused tests.
- Browser Preview passed 15 focused tests and its Web/Lynx builds.
- The complete Lynxtron harness suite passed 13 files / 48 tests.
- A detached audit worktree checked out all 76 original archaeology commits in
  order. Every commit passed its changed tests, affected package typechecks,
  `git diff --check`, and clean-worktree gate.
- A second detached worktree built all 66 commits that changed a package
  compiler boundary at their historical revisions: server bundle, Web
  production, Lynx production, and Browser Preview as applicable. The 12
  script/evidence/ignore/docs-only commits have no package compile target and
  are covered by focused tests, verifiers, and diff gates.
- Final server bundle, Web production, Lynxtron production, and Browser Preview
  builds passed. Two consecutive Lynxtron production builds left the worktree
  clean.
- The final product and Browser Preview builds passed. Their known warnings are
  unsupported Lynx CSS properties, Effect `import.meta`, and bundle-size
  warnings.
- Browser Preview compiles the real ReactLynx entry. Its live WebSocket
  transport is development-only; production Native keeps transport ownership
  in the main process.
- Evidence provenance, strict-manifest validation, exact-owned Native readiness,
  shared-workbench capture, and disposable-state ignores are committed.
- No Electron or Lynxtron app was launched, restarted, focused, or stopped
  during final archaeology verification.

## Current evidence state

- `evidence/manifests/main-shell.json` is a small planning matrix, not a
  certification archive.
- It contains 6 high-value states and 18 required Web/Lynx/Native cells.
- Planning verification passes with `0 errors / 18 incomplete`.
- Strict verification intentionally exits 2 because all 18 required cells are
  pending fresh final5 evidence.
- The archaeology commits add no screenshot or video evidence.
- `evidence/2026-08-04/H8/runtime-boundaries.json` preserves the R5/R10 runtime
  probe as structured historical negative evidence. Its source head and bundle
  predate final5, so it does not certify the current product.
- The previous 39-state, 78-entry Plan 11C matrix and H8 comparison remain
  historical working-tree artifacts. They are not committed as current
  authority because their pixels were captured from older bundles and one
  manifest-linked log was missing.
- `reports/fidelity-loss/index.html` reconstructs the historical port against a
  fixed 40-state denominator. Its conservative loss, observed product residual,
  evidence debt, and historical-best lines are generated from
  `scripts/fidelity-loss-{model,history}.json`.
- The same page links measured checkpoints to fourteen representative comparison
  frames hosted by the public `Huxpro/t3code-fidelity-assets` GitHub Pages site.
  No screenshot binary remains in the T3 fidelity-loss report directory.
- The reconstructed conservative loss fell from 98.30% at the first archived
  geometry milestone to a historical best of 68.74% after the Model Picker
  closeout. The final5 archaeology reset raised conservative loss to 91.97%
  because stale evidence was demoted; it does not claim that the product
  regressed.
- A fresh current-head Browser pair reduced conservative loss to 91.10% by
  measuring the docked Composer's Lynx-for-Web cells. A follow-up shared-source
  fix projects placeholder copy from the same session phase in Web and Lynx,
  closes the measured content residual, improves Composer/context SSIM from
  89.41% to 91.49%, and reduces current conservative loss again to 91.06%.
  Native and interaction cells remain unmeasured.
- Subsequent Sidebar interaction, Composer material, and lifecycle-reconnecting
  evidence reduce current conservative loss to 87.64%, observed residual to
  6.44%, and evidence debt to 86.79%. The corrected lifecycle harness waits for
  branch discovery before fault injection; the product fix removes a real 31px
  Lynx-only Hero offset while leaving Native recovery and reconnect interaction
  unmeasured.
- The current idle-thread checkpoint separates an empty-transcript readiness
  mismatch from the product. The Sidebar fix aligns both Browser row boxes
  exactly, while retaining the 15px card-wrapper and material residuals. A
  read-only Native DevTool gate independently proves all rows/cards stay inside
  the staged 256px rail. Current conservative loss is 87.08%, observed residual
  is 6.15%, and evidence debt is 86.24%.
- The next Composer pass measures actual Footer control leaves instead of
  semantic wrappers. Matching chevron, runtime, and interaction icon geometry
  improves both Hero and Sendable Footer SSIM while leaving text metrics and the
  context strip as the next open material contributors. Native verifies the
  staged icon boxes directly without claiming pixel parity. Current
  conservative loss is 87.07%, observed residual is 6.10%, and evidence debt is
  86.23%.
- Matching the shared 70% muted-label token then improves Hero and Sendable
  Footer SSIM by roughly 0.0082 each. Native resolves that token to the expected
  8-bit alpha and remains renderer-error free; Footer text widths and the
  context strip remain open.
- Replacing oversized external Context SVG wrappers with the shared 12px Icon
  primitive raises Context SSIM from 89.87% to about 91.82% and improves both
  Hero and Sendable Composer-region residuals. Native independently verifies
  the staged Context icon boxes without claiming pixel parity.
- Replacing stale Context-control translations and padding with the Web box
  model then raises Hero/Sendable Context SSIM to about 94.26%. Browser control
  width deltas fall below 0.15px without fixed widths. An exact-bundle Native
  run at `ff531cdbe` independently verifies four 12px icons, two 24px controls,
  main transport advancement, zero renderer errors, and isolated-state cleanup.
  Current conservative loss is 87.07%, observed residual is 6.08%, and evidence
  debt remains 86.23%.
- Localized Context accounting then identifies checkout-label rendering as
  68.8% of remaining strip absolute error. Removing stale synthetic
  stroke/scaling and matching Web's 70% color plus 16px line height raises
  Hero/Sendable Context SSIM to about 98.04% and reduces Context absolute error
  by 41.8%. Exact-bundle Native independently verifies both label geometries
  and typography without claiming pixel parity. Current conservative loss is
  87.07%, observed residual is 6.06%, and evidence debt remains 86.23%.
- The next Context hotspot was a real icon-pipeline fallback: stale GitBranch
  path data plus no matching muted raster caused a white 18px PNG to be scaled
  to 12px. Exact dark/light 12px rasters raise dark branch-icon SSIM to 97.41%
  and reduce Context absolute error another 10.3%; Native verifies the exact
  bundle's four 12px icons. A matched light Hero diagnostic now validates the
  muted icon path but also exposes broader light Context material as a separate
  open scope. Current conservative loss is 87.07%, observed residual is 6.06%,
  and evidence debt remains 86.23%.
- Matched light Hero evidence then localizes 64% of Context error to the top
  material ramp. A Browser-only gradient is rejected after Native pixel
  evidence proves it renders flat there; the final 16-band view ramp renders
  the same profile in Lynx-for-Web and Native, raises light Context SSIM to
  91.34%, and leaves dark frames byte-identical. Fresh light material evidence
  lowers conservative loss to 86.93% and evidence debt to 86.09%; observed
  residual rises slightly to 6.07% because the newly measured light cell is no
  longer hidden by missing evidence.
- Fresh 1440×900 dark/light Browser cells preserve the same responsive
  Composer geometry and residuals as 1280×820. Native initially exposes a
  late model-option insertion race that overlaps the runtime control; stable
  top-level toolbar keys fix the reconciliation identity. Two dark cold starts,
  one deterministic all-five-control run, and one light material run pass on
  the exact bundle with zero renderer errors. This scope closes without score
  movement because it duplicates existing residuals rather than hiding or
  reweighting them.
- Footer icon material then isolates a smaller real mismatch after geometry and
  label alpha were already aligned: Lynx used opaque `#a1a1aa` mode icons while
  Web composes muted `#818181` at 70% element alpha. Exact dark/light rasters
  plus `0.7` icon and chevron opacity improve Hero and Sendable Composer-region
  SSIM by `0.000573` each without geometry movement. Matched light Browser
  evidence and exact-theme dark/light Native runs corroborate the shared
  mapping; only the direct dark pairs update the ledger. Conservative loss is
  now 86.9312%, observed residual is 6.0727%, and evidence debt remains 86.0862%.
- The next high-weight transcript cell separates four capture mismatches before
  admitting product evidence: intentional atlases are not icons, a running
  thread cannot stand in for a missing completed fixture, Lynx recycled-row
  spacing belongs to the list-item wrapper, and Native theme identity uses the
  persisted `themePreference` key. The valid working-thread pair then exposes a
  32px transcript inset drift, a collapsed 24px working row, and
  `Current checkout` versus Web's locked `Local checkout`. Shared copy plus
  16px/40px list contracts raise transcript-viewport SSIM
  `0.957407 → 0.969803` and full-frame SSIM `0.912880 → 0.920077`.
  Exact-bundle Native verifies the same inset, row boxes, Stop state, dark
  theme, and main transport. Conservative loss is now 86.1490%, observed
  residual is 5.7882%, and evidence debt is 85.2980%.
- A real completed transcript is then created through the connector and admitted
  only when both `latestTurnState=completed` and the exact assistant response
  match. This rejects a missing Codex executable and a Claude OAuth error that
  had been persisted as a nominally completed turn. The valid OpenCode pair
  exposes settled-only geometry: Lynx starts 32px too high and drops the
  assistant's 16px outer spacing. Browser Preview now uses Web's 48px settled
  inset, while Native composes the same offset from a stable 16px list inset
  plus a real 32px spacer. Full-frame SSIM rises
  `0.924859 → 0.934639`, and transcript SSIM rises
  `0.970158 → 0.987917`. Exact-bundle Native verifies the canonical response,
  48px relative inset, 75px assistant wrapper, idle Composer, provider-shaped
  controls, and transport. Conservative loss is now 85.3655%, observed
  residual is 5.5244%, and evidence debt is 84.5097%.

## Not currently proven

- No current Web/Lynx/Native visual certification matrix exists.
- No current Web/Lynx/Native pixel certification matrix exists; the final5
  packaged Native Context geometry/readiness gate is not pixel parity.
- Native physical keyboard/focus, transcript wheel/drag/follow, light/system
  theme persistence, failed/approval/question populated transcripts, and full
  patch rendering are not certified.
- Browser/CDP evidence cannot satisfy Native-only input, list, window, or
  persistence requirements.
- Historical `PASS`, `functional`, and `completed` labels do not independently
  certify the current stack.
- Historical reuse and style percentages remain prioritization inputs only.
  Their large generated reports are intentionally not committed.

## Evidence policy

- Legacy structured reports remain readable history. Legacy pixels are not
  promoted without fresh manifest admission.
- `capture-valid`, `visual-certified`, and `native-certified` are independent.
- A harness mismatch is `invalid-harness`, not a product regression.
- Required cells remain `pending` until the current bundle, snapshot, route,
  viewport, state echo, console, and provenance all pass.
- Runtime blockers must include the exact tested build and structured
  assertions. A blocker never masquerades as a screenshot or product
  completion.

## Runtime policy

1. Use an isolated server and canonical snapshot. Never point a run at live
   `~/.t3/userdata`.
2. Keep real Web as product authority and Lynx-for-Web as the fast renderer
   loop.
3. Resolve Native DevTool identity from an exact owned PID and listening port.
4. Reuse one verified process for ordinary route/state interaction.
5. Restart only for a new bundle, explicit cold start, viewport change,
   exhausted screencast, or process exit.
6. After two identical startup failures, stop reopening the app and diagnose
   the runtime.
7. Use authorized Computer Use only for real keyboard, focus, wheel, drag, and
   selection evidence.

## Current execution order

1. `plans/00-execution-index.md`
2. this file
3. `harness/completion-audit.md`
4. `evidence/manifests/main-shell.json`
5. `gap-atlas.md`
6. `next-port-priorities.md`
7. `compat-matrix.md`

The archaeology and harness-source cleanup are complete. Product certification
is not. The next evidence run must start from the 18 pending cells without
reusing old pixels or repeatedly restarting a visible Electron app.
