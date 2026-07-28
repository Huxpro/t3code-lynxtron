# T5-F3 new-thread capture — 1280 × 820

Status: partial evidence. This closes the in-flight capture round without
claiming T5-F3 completion. The 1440 × 900 pair, deterministic state preparation,
automated anchor/typography extraction, and T5-F2 reuse report are still
required.

## Identity

- Worktree: `/Users/bytedance/.codex/worktrees/f409/t3code`
- HEAD: `5719e8ac4020dda0e375ef61d044b61f55a0df8a`
- Worktree state: dirty; captures include the uncommitted Lynxtron port and Web/shared refactors
- Product reference: the current worktree's Electron renderer built from
  `apps/web`
- Lynx client: the current worktree's production Lynx bundle and Lynxtron host
- Server snapshot path: `/tmp/t3code-visual-snapshot.n5qRKv`
- Snapshot SHA-256 after the sequential captures:
  `482f96c1ecb7957a56a4d75a0ac5b66c4de07ce0a710f188b4f909fadf0fd135`
- Project ID: `da5d65ea-6ec0-40af-8ac2-3e2ba7270e59`

## State

- Route: new-thread draft for project `t3code`
- Theme: dark
- Logical viewport: 1280 × 820
- Device pixel ratio: 2
- Snapshot content: one project, zero persisted threads
- Transient Electron provider-update notification: dismissed before capture
- Browser chrome: excluded; `web.png` contains the Electron renderer only
- Lynx renderer errors: zero according to Lynx DevTool

The clients intentionally retain their observed canonical selections. Web
showed `GPT-5.6-Sol`, `Low · Standard`, `Current checkout`, and `Select ref`.
Lynx showed `Claude Fable 5`, `Reasoning · High`, `Local checkout`, and
`No branch`. These are recorded content/state gaps, not masked differences.

## Reuse

The numerator and denominator are pending T5-F2. No source-reuse percentage is
claimed from this screenshot pair.

## Measurements

`metrics.json` records the verified image dimensions, capture hashes, token
evidence, and the measurement fields still missing. The current pair is
diagnostic only. It must not be used to claim the 8 px anchor or 2 px
typography thresholds.

The screenshot-driven Lynx change in this round:

- exposes an exact content viewport through
  `T3_LYNXTRON_VIEWPORT_WIDTH` / `T3_LYNXTRON_VIEWPORT_HEIGHT`;
- aligns the sidebar titlebar content with Electron's macOS titlebar inset;
- adds a Lynx host rendering of the Electron Dev blueprint grid, ruler, marks,
  glow, and fade.

## Interaction states exercised

- isolated Electron profile startup;
- server ready and renderer authenticated;
- dark-theme persistence;
- transient notification dismissal;
- Lynx server ready and renderer connection;
- Lynx DevTool screenshot and error-console inspection.

## Verification

Passed:

```text
vp test run apps/lynxtron/src/main/desktop/windowViewport.test.ts
vp exec tsc --noEmit -p apps/lynxtron/src/main/desktop/tsconfig.json
vp test run apps/desktop/src/app/DesktopEnvironment.test.ts apps/desktop/src/app/DesktopAppIdentity.test.ts apps/desktop/scripts/electron-launcher.test.mjs
vp exec tsgo --noEmit -p apps/desktop/tsconfig.json
vp pack                                      # apps/desktop
vp build                                     # apps/web
vp exec tsc --noEmit -p src/app/tsconfig.json
vp exec rspeedy build                        # apps/lynxtron
vp exec rspack build                         # apps/lynxtron
node scripts/capture-lynx-devtool.mjs ...
node scripts/visual-diff.mjs ...
```

The first app typecheck invocation used a root-relative path while already
inside `apps/lynxtron` and therefore reported TS5058. It was rerun with
`src/app/tsconfig.json` and passed.

## Remaining differences

- Composer model/reasoning and checkout/branch content are not exact.
- Font metrics and weight differ because R2 remains open.
- Composer control icon rasterization, card radii, and several spacings differ.
- Blueprint art is now present but still needs measured color/opacity tuning.
- No masks are registered.
