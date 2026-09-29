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

## Progress (2026-09-29)

Evidence: `evidence/2026-09-29/M4/duplicate-decisions.json`. The committed
reuse report before M4 was stale (2026-08-01); the refreshed baseline is
Composer 26.3% modules / 29.7% lines, Model Picker 24.5% / 31.7%, App Shell
Sidebar 28% / 30%, Settings Providers 22.5% / 27.9%, Review 25.4% / 32.9%.

### Composer

- Runtime menu renders through the shared Lynx Menu; the local popup, dismiss
  layer, and CSS are deleted. Closes `GAP-014`.
- Shared Lynx Menu and Popover anchor top-side popups by `bottom`
  (`resolveFloatingFixedPosition`); Lynx sized fixed boxes by the space below
  their `top`, which clipped every top-side popup.
- Model-options menu renders through the shared Menu and lists provider traits
  only, like Web `TraitsMenuContent`. Its Lynx-only Mode ("Build"/"Plan" with
  invented descriptions) and Access sections are deleted.
- Both Lynx menus badge the provider default (`isDefault` in the shared
  traits projection) instead of the selected option.

Hard island: the Lynx Composer body (native editor bridge, cursor and
selection fixtures, attachment paste, wheel-driven menu scroll). Web's
Composer is built on a Lexical contenteditable editor Lynx cannot host. Owner:
`apps/lynxtron/src/app/components/Composer.tsx`. Removal condition: a Lynx
editor primitive that supports inline mention chips and selection ranges.

Carried: `--verify-compact-controls` fails at 900 x 820 with the Files panel
on the pre-M4 baseline too; at 700 x 820 the compact menu opens correctly.

### Model Picker

- Jump shortcuts: Lynx labelled them in catalog order but jumped in display
  order. Web `resolveModelPickerJumpTargets` pairs enabled rows in listed
  order with their command; both renderers' labels and actions read it, and
  the Lynx-only `projectModelPickerJumpRows` is deleted.

Open product decisions to settle in client-runtime before moving code (the
renderers disagree today): whether unavailable instances list as disabled
rows (Lynx) or are hidden (Web); which disabled reasons apply; the initial
rail tab; the Favorites empty copy; and Lynx-only "Unavailable" notice titles
and ★ markers. Row display names should move with `getDisplayModelName`
once `providerIconUtils` separates its DOM icons.

Carried: `--verify-model-picker-fidelity` times out on `.model-picker-content`
on the pre-slice commit too, although a direct probe finds it.

### App Shell / Sidebar

- Thread context menu: `buildSidebarV2ThreadContextMenuItems` is the one
  inventory. Lynx lost its extra Archive item, follows Web's order, disables
  Snooze when a thread cannot snooze, and toasts "Path unavailable" like Web.
- Delete honours `confirmThreadDelete` and uses the shared
  `projectThreadActionConfirmation` copy in both renderers.
- The unreachable Lynx in-row action list and its CSS are deleted; the Lynx
  leaf keeps the rename field and delete confirmation.

- Row prominence and status pills come from `resolveSidebarV2RowPresentation`
  and `isSidebarV2ThreadWoke`; Lynx gained Woke and Done and recedes
  in-flight rows like Web, on active and settled rows alike.

Next divergences, recorded from the audit: the auto-settle window ignoring
`sidebarAutoSettleAfterDays`, no snoozed shelf, project sort ignoring
`sidebarProjectSortOrder`, the new-thread target, a Lynx-only project row
menu, and "No matching threads" vs Web "No threads found".

### Settings Providers

- Driver labels, order, settings schemas, Early Access badges, the
  coming-soon list, accent swatches, and instance-id derive/validate live in
  Web `providerDriverCatalog.ts` and `AddProviderInstanceDialog.logic.ts`.
  Web attaches icons; Lynx deleted its copies and gained Web's 64-character
  instance-id rule.

Carried: `--verify-providers-settings` pins the panel top at y=88; the shell
places it at y=100 on the pre-slice commit too.

## Goal prompt

> 在 `/Users/bytedance/github/t3code-lynxtron-021-full` 执行 Plan 14 M4：读取 `apps/lynxtron/docs/plans/14-journey-driven-convergence/M4-shared-source-deletion.md`，按 Composer、Model Picker、Shell/Sidebar、Settings Providers、Transcript、Review 的顺序做 deletion-driven convergence。迁移并共享 labels、ordering、validation、capability decisions、action inventory、state/retry rules；只保留真实 input/list/menu/measurement/bridge/runtime platform leaves。每个 slice 必须删除冗余 Lynx product composition，验证 Web 不变，并让 duplicate-decision LOC 与 physical reuse 有量化改善。不得扩大 exclusions 或把 hard island 伪装成 shared。
