# Lynxtron typecheck debt (2026-07-29, resolved 2026-07-30)

This is the historical inventory for the **233 TypeScript errors** present on
2026-07-29. After the upstream merge the same clusters reproduced as 236
errors. The T6-C1 maximum-composition slice resolved the graph boundary and
reduced both Lynxtron TypeScript programs to **0 errors** on 2026-07-30.
`.github/workflows/lynxtron-ci.yml` now treats typecheck as a required step;
there is no `continue-on-error` escape hatch.

## Resolution

- `SidebarV2CompositionSurface` owns the renderer-neutral header/footer,
  Search/New-thread controls, project-scope/New-project controls, thread-list
  container, and empty-state placement for both Web and Lynx.
- `Sidebar.lynx.tsx` and `ui/sidebar.lynx.tsx` are explicit host leaves. The
  Lynx program no longer evaluates the DOM-heavy legacy Sidebar, Base UI
  sidebar, desktop update pill, or alert subtree.
- Small host leaves cover desktop-update, badge, dialog, router, icon, and
  build-environment differences instead of adding DOM intrinsics or broad
  ambient types to the Lynx program.
- Environment identification is part of the portable client-settings
  projection, so shared Sidebar chrome reads a real typed preference.
- Verification: Lynx app + desktop-host typecheck, Web/client-runtime/contracts
  typecheck, focused tests, an 11-file zero-issue ReactLynx scan, and a fresh
  interacted 1280 × 820 zero-renderer-error DevTool capture all pass.

## Historical snapshot identity

- Branch tip: `7146bf160` (lynxtron-port)
- Command: `tsc --noEmit -p src/app/tsconfig.json && tsc --noEmit -p src/main/desktop/tsconfig.json`
- Result: 233 errors, all from the `src/app` program; all in `apps/web/src/**`
  files pulled into the Lynx graph (no errors in `apps/lynxtron/src/**`)

## Historical errors by file

| File (relative to `apps/web/src/`)         | Errors |
| ------------------------------------------ | -----: |
| `components/Sidebar.tsx`                   |    116 |
| `components/ui/sidebar.tsx`                |     52 |
| `components/sidebar/SidebarUpdatePill.tsx` |     38 |
| `components/ui/alert.tsx`                  |     14 |
| `components/ui/dialog.lynx.tsx`            |      4 |
| `branding.lynx.ts`                         |      3 |
| `lib/router.lynx.tsx`                      |      2 |
| `env.ts`                                   |      2 |
| `state/desktopUpdate.ts`                   |      1 |
| `components/AppSidebarLayout.lynx.tsx`     |      1 |

## Historical errors by code

| Code                                       | Count | Meaning here                                                                                                                                             |
| ------------------------------------------ | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS2339                                     |   176 | Mostly DOM intrinsics (`div`, `span`, `li`, `button`, …) absent from the Lynx `JSX.IntrinsicElements`; plus `window.desktopBridge` and `import.meta.env` |
| TS7006                                     |    24 | Implicit `any` parameters (event handlers in the same DOM components)                                                                                    |
| TS2307                                     |    15 | `~/*` alias imports unresolved by the Lynx `src/app/tsconfig.json`                                                                                       |
| TS2322                                     |     9 | Type mismatches in the same files                                                                                                                        |
| TS2554 / TS2345 / TS7053 / TS2367 / TS2353 |     9 | Scattered follow-on errors                                                                                                                               |

## Historical root-cause clusters

1. **Web DOM compositions inside the Lynx type program (~206 errors).**
   `Sidebar.tsx`, `ui/sidebar.tsx`, `SidebarUpdatePill.tsx`, and `ui/alert.tsx`
   are browser-DOM components now reachable from the Lynx app graph (T6-C1
   shared-shell work). The Lynx JSX types have no `div`/`span`/etc., so every
   DOM element use errors, dragging implicit-any and mismatch errors with it.
   Resolution options (owner decision): give these subtrees `.lynx` platform
   leaves, cut them from the Lynx graph behind the sidebar variant boundary, or
   type-bridge DOM intrinsics — this is exactly the active T6-C1 boundary
   question, so it must be resolved by that work stream, not by CI cleanup.
2. **`~/*` alias resolution (15 errors).** The Lynx `src/app/tsconfig.json`
   does not map `~/*` for web-side files (`~/lib/utils`, `~/hooks/*`,
   `~/components/ui/*`). Likely a one-line `paths` addition, but it will
   surface further downstream errors currently hidden behind TS2307.
3. **Host/environment globals (7 errors).** `window.desktopBridge` (4) and
   `import.meta.env` (3) leak Electron/Vite ambient types into files compiled
   for Lynx; these want capability-boundary splits (compare R-series entries in
   `compat-matrix.md`).

## Historical full error list

See the CI artifact `lynxtron-typecheck-log` on any Lynxtron CI run for the
current full listing; the 2026-07-29 baseline list is reproduced below.

```text
../web/src/branding.lynx.ts(23,38): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
../web/src/branding.lynx.ts(33,16): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
../web/src/branding.lynx.ts(37,40): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
../web/src/components/AppSidebarLayout.lynx.tsx(24,16): error TS2353: Object literal may only specify known properties, and '"--sidebar-width"' does not exist in type 'Properties<string | number, string & {}>'.
../web/src/components/Sidebar.tsx(197,36): error TS2307: Cannot find module '~/hooks/useCopyToClipboard' or its corresponding type declarations.
../web/src/components/Sidebar.tsx(198,29): error TS2307: Cannot find module '~/hooks/useMediaQuery' or its corresponding type declarations.
../web/src/components/Sidebar.tsx(200,60): error TS2307: Cannot find module '~/hooks/useSettings' or its corresponding type declarations.
../web/src/components/Sidebar.tsx(238,24): error TS2554: Expected 0 arguments, but got 2.
../web/src/components/Sidebar.tsx(402,60): error TS2345: Argument of type '{ _tag: string; environmentId: string & Brand<"EnvironmentId">; label: string; }' is not assignable to parameter of type 'PrimaryConnectionTarget | BearerConnectionTarget | RelayConnectionTarget | SshConnectionTarget'.
../web/src/components/Sidebar.tsx(419,31): error TS2554: Expected 0 arguments, but got 1.
../web/src/components/Sidebar.tsx(435,13): error TS2367: This comparison appears to be unintentional because the types '"Failure"' and '"Success"' have no overlap.
../web/src/components/Sidebar.tsx(464,58): error TS2339: Property 'sourceControlProvider' does not exist on type 'never'.
../web/src/components/Sidebar.tsx(665,41): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(688,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(697,21): error TS2322: Type '(event: React.MouseEvent<HTMLButtonElement>) => void' is not assignable to type '(event: unknown) => void'.
../web/src/components/Sidebar.tsx(711,15): error TS2322: Type '(element: HTMLInputElement | null) => void' is not assignable to type 'Ref<NodesRef> | undefined'.
../web/src/components/Sidebar.tsx(724,19): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(729,19): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(737,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(738,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(747,21): error TS2322: Type '(event: React.MouseEvent<HTMLButtonElement>) => void' is not assignable to type '(event: unknown) => void'.
../web/src/components/Sidebar.tsx(764,19): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(778,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(792,17): error TS2322: Type '(event: React.MouseEvent<HTMLButtonElement>) => void' is not assignable to type '(event: unknown) => void'.
../web/src/components/Sidebar.tsx(798,17): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(806,21): error TS2322: Type '(event: React.MouseEvent<HTMLButtonElement>) => void' is not assignable to type '(event: unknown) => void'.
../web/src/components/Sidebar.tsx(810,17): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(815,23): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(823,27): error TS2322: Type '(event: React.MouseEvent<HTMLButtonElement>) => void' is not assignable to type '(event: unknown) => void'.
../web/src/components/Sidebar.tsx(827,23): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(834,13): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(835,15): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(840,25): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(855,25): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(866,19): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(876,19): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(878,15): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(879,13): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(880,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(881,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(984,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(988,13): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(988,33): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(989,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(1037,13): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(1039,15): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(1039,30): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(1040,13): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(1055,13): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(1055,28): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(1102,6): error TS7006: Parameter 'settings' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(1105,6): error TS7006: Parameter 'settings' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(1108,6): error TS7006: Parameter 'settings' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(1122,6): error TS7006: Parameter 'settings' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(1136,14): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(1143,15): error TS7006: Parameter 'error' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(1156,14): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(1163,15): error TS7006: Parameter 'error' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(1451,56): error TS2339: Property 'draftId' does not exist on type 'never'.
../web/src/components/Sidebar.tsx(1850,54): error TS2554: Expected 1 arguments, but got 2.
../web/src/components/Sidebar.tsx(2226,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2244,19): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2250,17): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2251,19): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2256,17): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2269,11): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2270,13): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2272,13): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2274,15): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2276,15): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2278,11): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2287,17): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2313,15): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2319,19): error TS2322: Type '(event: React.MouseEvent<HTMLButtonElement>) => void' is not assignable to type '(event: unknown) => void'.
../web/src/components/Sidebar.tsx(2323,15): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2330,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2371,24): error TS7006: Parameter 'open' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(2387,13): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2388,15): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2388,82): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2392,66): error TS2339: Property 'target' does not exist on type '{ currentTarget: { value: string; }; }'.
../web/src/components/Sidebar.tsx(2393,17): error TS2322: Type '{ "aria-label": string; value: string; onChange: (event: { currentTarget: { value: string; }; }) => void; onKeyDown: (event: any) => void; }' is not assignable to type 'IntrinsicAttributes & InputProps'.
../web/src/components/Sidebar.tsx(2393,29): error TS7006: Parameter 'event' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(2400,13): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2402,15): error TS2339: Property 'p' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2404,15): error TS2339: Property 'p' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2418,24): error TS7006: Parameter 'open' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(2434,13): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2435,15): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2435,82): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2452,48): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'Record<"repository" | "repository_path" | "separate", string>'.
../web/src/components/Sidebar.tsx(2471,13): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2472,13): error TS2339: Property 'p' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2476,13): error TS2339: Property 'p' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2513,40): error TS2345: Argument of type '{ _tag: string; environmentId: string & Brand<"EnvironmentId">; label: string; }' is not assignable to parameter of type 'PrimaryConnectionTarget | BearerConnectionTarget | RelayConnectionTarget | SshConnectionTarget'.
../web/src/components/Sidebar.tsx(2621,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2623,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2640,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2642,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2659,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2661,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2662,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2681,19): error TS2322: Type '{ "aria-label": string; className: string; inputMode: string; onKeyDownCapture: (event: any) => void; }' is not assignable to type 'IntrinsicAttributes & NumberFieldChildProps'.
../web/src/components/Sidebar.tsx(2682,38): error TS7006: Parameter 'event' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(2692,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2719,5): error TS2339: Property 'li' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2732,5): error TS2339: Property 'li' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2851,13): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(2871,13): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(3014,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(3016,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/Sidebar.tsx(3034,53): error TS7006: Parameter 's' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(3035,54): error TS7006: Parameter 's' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(3037,56): error TS7006: Parameter 's' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(3092,67): error TS2345: Argument of type '{ _tag: string; environmentId: string & Brand<"EnvironmentId">; label: string; }' is not assignable to parameter of type 'PrimaryConnectionTarget | BearerConnectionTarget | RelayConnectionTarget | SshConnectionTarget'.
../web/src/components/Sidebar.tsx(3630,27): error TS2339: Property 'desktopBridge' does not exist on type 'Window & typeof globalThis'.
../web/src/components/Sidebar.tsx(3637,16): error TS7006: Parameter 'result' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(3656,17): error TS7006: Parameter 'error' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(3675,16): error TS7006: Parameter 'result' implicitly has an 'any' type.
../web/src/components/Sidebar.tsx(3687,17): error TS7006: Parameter 'error' implicitly has an 'any' type.
../web/src/components/sidebar/SidebarUpdatePill.tsx(34,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(35,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(36,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(36,65): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(37,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(38,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(40,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(42,13): error TS2339: Property 'section' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(43,15): error TS2339: Property 'h3' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(45,15): error TS2339: Property 'h3' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(46,15): error TS2339: Property 'ul' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(48,19): error TS2339: Property 'li' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(50,19): error TS2339: Property 'li' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(52,15): error TS2339: Property 'ul' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(53,13): error TS2339: Property 'section' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(54,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(56,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(57,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(75,27): error TS2339: Property 'desktopBridge' does not exist on type 'Window & typeof globalThis'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(82,16): error TS7006: Parameter 'result' implicitly has an 'any' type.
../web/src/components/sidebar/SidebarUpdatePill.tsx(101,17): error TS7006: Parameter 'error' implicitly has an 'any' type.
../web/src/components/sidebar/SidebarUpdatePill.tsx(120,16): error TS7006: Parameter 'result' implicitly has an 'any' type.
../web/src/components/sidebar/SidebarUpdatePill.tsx(132,17): error TS7006: Parameter 'error' implicitly has an 'any' type.
../web/src/components/sidebar/SidebarUpdatePill.tsx(147,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(156,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(161,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(165,17): error TS2339: Property 'button' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(176,23): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(176,46): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(181,23): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(186,23): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(191,23): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(191,45): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(194,17): error TS2339: Property 'button' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(217,19): error TS2339: Property 'button' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(224,19): error TS2339: Property 'button' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(230,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/sidebar/SidebarUpdatePill.tsx(232,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(5,20): error TS2307: Cannot find module '~/lib/utils' or its corresponding type declarations.
../web/src/components/ui/alert.tsx(68,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(74,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(76,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(78,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(81,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(81,74): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(84,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(84,75): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(86,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(87,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(92,10): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(97,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/alert.tsx(106,10): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/dialog.lynx.tsx(17,10): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/dialog.lynx.tsx(17,36): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/dialog.lynx.tsx(31,3): error TS2339: Property 'button' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/dialog.lynx.tsx(31,32): error TS2339: Property 'button' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(1,39): error TS2307: Cannot find module '~/lib/baseUiRender' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(5,20): error TS2307: Cannot find module '~/lib/utils' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(6,24): error TS2307: Cannot find module '~/components/ui/button' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(7,23): error TS2307: Cannot find module '~/components/ui/input' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(8,28): error TS2307: Cannot find module '~/components/ui/scroll-area' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(9,27): error TS2307: Cannot find module '~/components/ui/separator' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(16,8): error TS2307: Cannot find module '~/components/ui/sheet' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(17,26): error TS2307: Cannot find module '~/components/ui/skeleton' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(18,55): error TS2307: Cannot find module '~/components/ui/tooltip' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(19,29): error TS2307: Cannot find module '~/hooks/useMediaQuery' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(20,58): error TS2307: Cannot find module '~/hooks/useLocalStorage' or its corresponding type declarations.
../web/src/components/ui/sidebar.tsx(156,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(174,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(216,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(225,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(254,13): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(261,13): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(270,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(283,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(296,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(313,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(319,11): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(320,9): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(321,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(339,17): error TS7006: Parameter 'event' implicitly has an 'any' type.
../web/src/components/ui/sidebar.tsx(348,7): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(348,47): error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(605,11): error TS2339: Property 'button' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(638,5): error TS2339: Property 'main' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(648,5): error TS2339: Property 'main' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(665,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(672,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(678,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(685,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(703,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(713,7): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(720,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(727,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(771,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(778,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(784,5): error TS2339: Property 'ul' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(791,5): error TS2339: Property 'ul' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(797,5): error TS2339: Property 'li' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(804,5): error TS2339: Property 'li' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(917,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(932,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(949,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(965,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(971,5): error TS2339: Property 'ul' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(982,5): error TS2339: Property 'ul' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(988,5): error TS2339: Property 'li' does not exist on type 'JSX.IntrinsicElements'.
../web/src/components/ui/sidebar.tsx(995,5): error TS2339: Property 'li' does not exist on type 'JSX.IntrinsicElements'.
../web/src/env.ts(8,11): error TS2339: Property 'desktopBridge' does not exist on type 'Window & typeof globalThis'.
../web/src/env.ts(8,49): error TS2339: Property 'nativeApi' does not exist on type 'Window & typeof globalThis'.
../web/src/lib/router.lynx.tsx(79,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/lib/router.lynx.tsx(87,5): error TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'.
../web/src/state/desktopUpdate.ts(27,61): error TS2339: Property 'desktopBridge' does not exist on type 'Window & typeof globalThis'.
```
