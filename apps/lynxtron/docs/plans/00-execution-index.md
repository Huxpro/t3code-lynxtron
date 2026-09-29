# Execute the high-fidelity monorepo port

This index routes active work to Plan 14 and preserves the earlier certification model as historical context. Use it to select one task at a time, preserve evidence, and stop a goal only at a defined phase exit.

## Plan metadata

- Content type: How-to
- Audience: Agents continuing the T3 Code Lynxtron port
- Goal: Complete the ordinary T3 Code user interface with shared source, measurable visual fidelity, and explicit runtime exceptions
- Scope: `apps/lynxtron`, shared client packages, and the minimum Web refactors needed for physical source reuse
- Source of truth: The current Web application in the same worktree

## Active execution override

[Drive Lynxtron convergence through complete product journeys](./14-journey-driven-shared-source-convergence.md)
is the active master plan after Final5. It reconciles the stale Plan 11/12 task
states, closes the supported local Composer and transcript journeys, elevates remote
and multi-environment operation to the main product gate, applies deletion-driven
physical source convergence, completes review and bounded secondary surfaces, and
runs one final local/remote phase-exit matrix. Use the copyable goal prompt in the
master plan or one phase prompt under
[`14-journey-driven-convergence/`](./14-journey-driven-convergence/). Plan 11, Plan
12, and Plan 13 remain required technical inputs, but Plan 14 owns active ordering
and completion status.

[Prove the Lynxtron architecture through product outcomes](./11-outcome-driven-convergence.md) is the historical trust-recovery plan. Use its outcome definitions, main-owned connector decisions, and semantic-readiness rules as Plan 14 inputs. Do not use its stale task table to choose the active phase.

[Establish a browser-first Web / Lynx UI loop](./11a-browser-dual-renderer-validation.md) is the historical browser-loop experiment. Plan 14 retains its Browser-first iteration and exact-owned Native correlation rules.

[Borrow Synara's harness discipline, reset stale context, and prioritize the next port phase](./11c-synara-harness-reset-and-gap-prioritization.md) is the historical Plan 11C design and prioritization record. The current authority is [the final5 state](../harness/current-state.md) and [archaeology completion audit](../harness/completion-audit.md). The current manifest is a planning matrix with required cells pending, not the old 39-state phase-exit certification. Plan 11A and [Plan 11B](./11b-single-server-dual-frontend-workbench.md) remain historical records of the browser-loop experiment and its real-Web correction; their `PASS` labels, evidence directories, and comparison implementations are not visual certification inputs.

[Complete Lynxtron feature parity by product value](./12-feature-parity-by-product-value.md) defines the product capability requirements consumed by Plan 14. Plan 14 owns their active order and completion status.

[Bring the builtin browser to Lynxtron parity](./13-cef-webview-browser-parity.md) is the executable PF6 browser sub-plan. It maps the official Lynxtron `<webview>` contract, Synara's proven native lifecycle, and every current Electron preview capability to explicit implementation and acceptance gates. CEF0 remains blocked by the documented 0.0.18 initialization and packaging gaps, while shared contract, policy, persistence, and Browser-chrome work may continue independently.

Plan 14 supersedes the active task order in Plans 11 and 12. Keep Plans 10 and 11 as architectural and harness history. Keep Plan 12 as the product-requirement inventory and Plan 13 as the PF6 browser sub-plan. Preserve the certification tiers, compatibility ledger, strict reuse calculation, fidelity thresholds, and existing evidence defined in this index.

## Current baseline

The monorepo port already has a working host, connector, canonical RPC data, Effect Atom state, generated theme CSS, API and CSS audits, shared presentation modules, and an Electron-versus-Lynx exploratory capture harness. The current implementation still retains 5,510 lines from the standalone prototype, or 52.7% of the current app.

The next phases must improve two independent measures:

- **Physical source reuse**: Web and Lynx build the same source module
- **Fidelity**: Web and Lynx render the same state within the defined visual thresholds

Do not report shared business semantics as visual parity. Do not report a matching screenshot as source reuse.

Every screen certification has four independent gates:

- **Style generation**: Required Web tokens and utilities have a generated or registered Lynx mapping
- **Visual fidelity**: Layout, typography, color, and component anatomy pass measured thresholds
- **Content and state**: The same snapshot produces the same labels, order, counts, and lifecycle state
- **Interaction**: The scoped pointer, keyboard, overlay, scroll, and mutation paths behave as documented

Passing one gate does not imply another. In particular, a high style-generation percentage does not certify a screen.

## Certification tiers

The four gate definitions above are unchanged. What changes is when the full
evidence battery is due (2026-07-29 assessment, §4-4):

- **Slice-level acceptance** — required for every intermediate slice:
  1. Affected typecheck passes.
  2. ReactLynx scanner passes.
  3. One fresh single-viewport (1280 × 820) Lynx DevTool capture with zero
     renderer errors, its path recorded in the slice notes.

  No dual-viewport pairs and no full state matrix are required at this tier.

- **Phase-exit certification** — required at the T6, T7, and T8 exits:
  the complete battery — all four gates, both standard viewports
  (1280 × 820 and 1440 × 900), and the full lifecycle-state set (for example,
  the eight-state set used for Settings General), with matched Electron/Web ↔
  Lynx DevTool evidence.

A slice that has only passed slice-level acceptance must not be reported as
`visual-certified` or `interaction-certified`; those states are granted only
by the phase-exit battery.

## Phase sequence

The T5-T8 sequence below is the historical certification model. Plan 14 M0-M7
owns the active execution sequence. Keep these exits as compatibility inputs when
Plan 14 reaches the corresponding product surface.

| Phase | Plan                                                                                       | Exit                                                                        |
| ----- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| T5    | [Establish the fidelity foundation](./05-fidelity-foundation.md)                           | One real screen passes reuse and fidelity gates                             |
| T6    | [Converge the core product surfaces](./06-core-surface-convergence.md)                     | Core screens replace clean-room renderers                                   |
| T7    | [Converge desktop interactions and system states](./07-desktop-interaction-convergence.md) | Pointer, keyboard, overlay, resize, theme, and failure states have evidence |
| T8    | [Certify and hand off the port](./08-certification-and-handoff.md)                         | Final matrix, packaged smoke, and completion report exist                   |

Use [Prove the Lynxtron architecture through product outcomes](./11-outcome-driven-convergence.md) for the active trust-recovery work, then [Complete Lynxtron feature parity by product value](./12-feature-parity-by-product-value.md) for the remaining product journey. Keep [Reset the Lynxtron port around the Web product source](./10-source-first-architecture-reset.md) and [Run the previous long-range port goal](./09-long-range-goal.md) as historical context for the superseded sequences.

## Task state

Use these exact states:

- `pending`
- `in_progress`
- `completed`
- `blocked(runtime-gap-id)`
- `skipped(reason)`

Only one task may be `in_progress`. A completed task must link its code, report, screenshot pair, and verification commands.

## Rules that apply to every phase

1. Read the repository `AGENTS.md`, this index, the active phase plan, `../implementation-status.md`, `../port-ledger.md`, and `../compat-matrix.md`.
2. Treat existing uncommitted changes as user work. Do not discard, reset, or rewrite unrelated files.
3. Use the Web component tree, copy, tokens, state, and interaction behavior as the product source of truth.
   Electron/Web screenshots are the visual reference. Standalone Lynx screenshots
   are provenance-only and cannot satisfy a fidelity gate.
4. Compile the Web entry or subtree before writing a Lynx replacement.
5. Count reuse only when Web and Lynx import the same physical production module. Generated CSS may count as `PATCHED`, not `SHARED`.
6. Keep platform differences in capabilities, same-API primitives, generated style adapters, or registered hard islands.
7. Add every accepted difference to `../compat-matrix.md` with evidence, impact, fallback, owner, and removal condition.
8. Verify Web refactors with focused tests and one isolated integrated Web flow.
9. Verify Lynx user-visible changes in a running Lynxtron client. Capture the screenshot after interactions because one screencast frame can wedge the session.
10. Do not expand exclusions or masks to improve a metric.
11. Prefer sharing a large Web composition subtree and splitting its unsupported leaves. Do not accumulate small shared components while the route entry remains a clean-room renderer.
12. At every phase exit, group the dirty worktree into proposed review units. Record replacements for deleted Web files and keep generated output separate from authored source.

## Shared evidence layout

Store fidelity evidence under:

```text
apps/lynxtron/evidence/<date>/<task>/<screen>/<variant>/
  web.png
  lynx.png
  metrics.json
  notes.md
```

Each `notes.md` must record:

- Web and Lynx commit or worktree identity
- Server and snapshot identity
- Route, theme, and viewport
- Reuse numerator and denominator
- Anchor and typography measurements
- Registered differences
- Interaction states exercised
- Verification commands and results

## Fidelity thresholds

Use these thresholds for ordinary product UI:

| Measure                                     |                   Threshold |
| ------------------------------------------- | --------------------------: |
| Eligible module reuse                       |                at least 70% |
| Eligible line reuse                         |                at least 70% |
| Layout anchor difference                    |                at most 8 px |
| Corresponding font-size difference          |                at most 2 px |
| Unregistered large color-region differences |                           0 |
| Content, ordering, labels, and counts       | exact for the same snapshot |

Both reuse percentages must pass. Runtime-drawn antialiasing, the caret, selection, and scrollbars may use small masks. Record every mask and its viewport percentage.

Report reuse at three scopes:

- **Route graph**: Everything reachable from the Web route entry
- **Product-surface graph**: The active shell and feature surfaces required for the certified state
- **Renderer-local graph**: The composition and host leaves that render the selected surface

Keep classification rules fixed in source control. The three scopes explain dependency weight but do not permit excluding difficult modules from the required product-surface gate.

## Hard islands

Track these separately from ordinary UI completion:

- Full DOM or Worker-based patch rendering
- SVG and custom fonts until runtime probes pass

A hard island may use an explicit fallback. It must not block ordinary shell, transcript, composer chrome, settings, files, or source-control fidelity.

## Approved placeholders and required runtime outcomes

The code/editor surface, terminal, and embedded browser use explicit product-quality
placeholders for this port. Their surrounding chrome, canonical state, commands,
and open/close behavior remain in scope; their editor, terminal-emulation, and web
runtime internals do not.

Native global keyboard support and the complete `<list>`-based chat experience are
required outcomes, not deferrable hard islands. R5 remains open only while that
keyboard work is actively being closed and cannot be used to certify T8 with
visible-controls-only behavior.
