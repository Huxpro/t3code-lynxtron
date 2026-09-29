# M4: Delete duplicated product decisions

- Status: `in_progress` (started 2026-09-29 after M3)

## Objective

Turn the established shared boundaries into physical source convergence by deleting
renderer-local product decisions from the journeys proven in M1-M3.

## Entry conditions

- M0 defines physical reuse, duplicate-decision LOC, and platform-leaf LOC.
- M1-M3 identify the actual reachable product paths and hard islands.

## Required work

Audit in this order: Composer, Model Picker, App Shell/Sidebar, Settings Providers,
Transcript rows, and Review. For each surface:

1. Identify renderer-specific labels, ordering, validation, capability decisions,
   state transitions, action inventory, and error/retry rules.
2. Move those decisions into shared composition or `packages/client-runtime`.
3. Keep input, native list, menu, measurement, bridge, and runtime integration as
   explicit platform leaves.
4. Delete obsolete Lynx-only composition and CSS when the shared path is proven.
5. Re-run production-root reuse reports without changing resolver rules or exclusions.
6. Record every hard island with owner, fallback, and removal condition.

## Exit gates

- Duplicate product-decision LOC decreases for every audited surface.
- Platform-leaf LOC is bounded and explainable.
- No product decision branches on renderer identity.
- Ordinary product UI reaches the existing 70% module and line reuse target, or each
  remaining miss is an approved hard island with a quantified denominator impact.
- Web behavior is unchanged by each extraction.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M4：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M4-shared-source-deletion.md`，按 Composer、Model Picker、Shell/Sidebar、Settings Providers、Transcript、Review 的顺序做 deletion-driven convergence。迁移并共享 labels、ordering、validation、capability decisions、action inventory、state/retry rules；只保留真实 input/list/menu/measurement/bridge/runtime platform leaves。每个 slice 必须删除冗余 Lynx product composition，验证 Web 不变，并让 duplicate-decision LOC 与 physical reuse 有量化改善。不得扩大 exclusions 或把 hard island 伪装成 shared。
