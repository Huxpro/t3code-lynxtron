# Run the long-range port goal

Use this prompt to continue the monorepo port across every reachable T5 through T8 task. The prompt preserves user work, enforces one active task, prioritizes Electron/Web UI fidelity, and requires evidence before completion.

## Plan metadata

- Content type: How-to
- Audience: The primary coding agent running a long-range goal
- Goal: Complete all reachable tasks in the T5 through T8 plans
- Prerequisite: An active goal created by the user

## Goal prompt

```text
Work in /Users/bytedance/.codex/worktrees/f409/t3code.

Read the root AGENTS.md and these files before changing code:
- apps/lynxtron/docs/plans/00-execution-index.md
- apps/lynxtron/docs/plans/05-fidelity-foundation.md
- apps/lynxtron/docs/plans/06-core-surface-convergence.md
- apps/lynxtron/docs/plans/07-desktop-interaction-convergence.md
- apps/lynxtron/docs/plans/08-certification-and-handoff.md
- apps/lynxtron/docs/plans/09-long-range-goal.md
- apps/lynxtron/docs/implementation-status.md
- apps/lynxtron/docs/port-ledger.md
- apps/lynxtron/docs/compat-matrix.md

Continue the existing long-range goal. Do not create a nested goal for each task.
Select the first pending task whose dependencies are complete. Keep only one task
in progress.

Treat the current Electron/Web monorepo application as the only visual,
interaction, content, and state source of truth. Treat the in-monorepo
apps/lynxtron application as the candidate. Use the standalone Lynx repository
only for provenance and implementation research; never use it as the fidelity
baseline.

Apply this UI-first priority order:
1. Finish T6-C1 by making the real shared Web shell and Sidebar visually converge
   in the reachable Lynxtron product path.
2. Complete T6-C3's full chat experience on a native Lynx `<list>`, including
   long, streaming, interrupted, failed, and proposed-plan transcripts and the
   required scroll-follow/user-detach behavior.
3. Close R5 as a high-priority capability track: implement and verify global
   keyboard events, focus traversal, Escape, Enter, arrow navigation, and product
   shortcuts. Visible buttons are only an interim fallback, not the desired exit.
4. Continue the remaining dependency-ready T6 surfaces, then finish T7 and T8.

For Lynx styling, use Tailwind CSS v3 only. Configure a Lynx-specific PostCSS
pipeline with `tailwindcss@^3` and `@lynx-js/tailwind-preset`. Do not run the Web
Tailwind v4 compiler, `@tailwindcss/postcss`, `@tailwindcss/vite`, or
`@tailwindcss/cli` in the Lynx build. Keep the Web v4 pipeline unchanged. Feed the
Lynx v3 content scan from the real shared Web/Lynx composition sources, preserve
the existing semantic token contract, and register any unsupported utility or
selector instead of silently dropping it. Generated Lynx v3 styles count as
PATCHED, not SHARED.

For each task:
1. Record its start and current worktree identity.
2. Preserve all existing user changes. Never reset, discard, or rewrite unrelated
   files.
3. Use the current Web component tree and behavior as the source of truth.
4. Compile the original Web entry or subtree before writing a Lynx host island.
5. Choose the largest Web composition subtree blocked by a small number of
   platform leaves. Split unsupported leaves instead of rebuilding the composition.
6. Prefer a shared refactor, same-API primitive, capability, or generated style
   transform. Register every split or exclusive island with evidence.
7. Recalculate route, product-surface, and renderer-local reuse after each slice.
   If product-surface reuse rises by less than one percentage point, reassess the
   boundary before extracting another small component.
8. Run focused tests and type checks for affected packages. Do not run the
   repository-wide suite.
9. Run one isolated integrated Web verification for a user-visible Web change.
10. Run one Lynxtron verification for a user-visible Lynx change.
11. Capture matched Electron/Web and Lynx evidence at the viewports required by
   the active phase. Capture Lynx screenshots with Lynx DevTool.
12. Update the task state, port ledger, compatibility matrix, evidence notes, and
    implementation status before selecting the next task.

Count source reuse only when Web and Lynx import the same physical production
module. Generated styles count as PATCHED. Copied JSX does not count as shared.
Both eligible module reuse and eligible line reuse must reach 70% for an ordinary
screen. Layout anchors may differ by at most 8 px and corresponding font sizes by
at most 2 px. The same snapshot must produce exact content, order, labels, and
counts.

The reuse auditor must match the production resolver: extension order, exact
aliases, package exports, conditions, symlinks, and realpaths. Report route,
product-surface, and renderer-local graphs. Keep the product-surface graph as the
required screen gate.

Keep style generation, visual fidelity, content and state, and interaction as four
independent results. A high generated-style coverage does not certify a screen.

For the T5 Settings General reference, first prove a shared feature panel, then
certify the complete Settings route. The complete route includes its shell,
navigation, header, scrolling, restore action, confirmation, and persistence. A
small feature-panel result cannot complete T5.

Use explicit, visually intentional placeholders for the code/editor surface,
terminal, and embedded browser. Their surrounding product chrome, state, labels,
tabs, open/close behavior, and canonical commands must still match Web; the
placeholder content itself is excluded from parity and reuse gates when registered.
Do not spend the current UI convergence phase implementing Lexical/Monaco-like
editing, xterm/canvas terminal rendering, or an embedded web runtime.

Keep full patch rendering, SVG, and custom fonts as separately registered runtime
islands. Do not let those islands block ordinary UI work. Global keyboard support
and complete `<list>`-based chat are not deferrable hard islands: they are
high-priority required outcomes and must have functional evidence before T8
completion.

Do not commit, publish, sign, notarize, install, or push unless the user explicitly
requests it. Do not stop or modify processes that this goal did not start.

Stop when one condition applies:
- All reachable T5 through T8 tasks are complete.
- Only tasks requiring a user product decision or unresolved runtime change remain.
- An external block has no safe workaround.
- The same task fails three times after decomposition and the failure evidence is
  recorded.

Before stopping, record the active task, completed steps, verification results,
exact next command, processes started by this goal, temporary files, and remaining
risks. At each phase exit, propose review units that separate shared Web refactors,
Lynx adapters, generated output, and product integration. Mark the goal complete
only when every reachable required task is complete.
Mark it blocked only after the product's repeated-block threshold is met.
```
