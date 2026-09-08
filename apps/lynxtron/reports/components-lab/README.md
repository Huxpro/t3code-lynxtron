# Components Lab

The Components Lab is the component-level fidelity contract between the Electron/Web renderer and Lynxtron. It renders real production components through one shared story surface and records the actual import/use-site topology so parity cannot be achieved with per-screen copies.

The initial route is `/components-lab` on both renderers. The shared story registry lives in `apps/web/src/components/components-lab/catalog.json`; both renderers mount `ComponentLabSurface.tsx`, while platform resolution selects the real `.web` or `.lynx` primitive implementation.

Generate the inventory after adding, removing, moving, or remapping a component:

```sh
pnpm --filter @t3tools/lynxtron report:components-lab
```

CI or a local fidelity loop can reject unreviewed inventory drift with:

```sh
pnpm --filter @t3tools/lynxtron report:components-lab:check
```

`inventory.json` distinguishes explicit platform pairs, modules shared by physical source identity, and Web-only components. Every component starts as `uncovered`; adding it to the shared story registry changes it to `covered`. Use-site counts and paths are part of the report so a component reused by multiple Web product surfaces can be required to keep the same shared identity in Lynxtron.

Current rollout order is primitives first, then composed controls, overlays, shell, Composer, transcript, settings, and hard runtime islands. A story is not parity evidence by itself: component screenshots still need matched theme, dimensions, state, interaction, and renderer-error gates.

## Loop contract

Every fidelity loop must check this Lab alongside the screen-level ledger:

1. Regenerate and review `inventory.json`; new components must not disappear into an untracked renderer-only implementation.
2. Select the next uncovered component by product reach and Web use-site count.
3. Add its states to the shared catalog and render the real production import in both renderers.
4. Capture the matching story in both renderers, then compare semantics, geometry, typography, material, interaction, and runtime independently.
5. Keep the same component identity at every equivalent product use-site. A copied lookalike is a failed reuse gate even when its pixels match.

The first paired dark baseline passes with eight story IDs, identical state lists, a 1280px root in both renderers, and zero renderer errors. The retained report is temporary at `/tmp/t3-components-lab-v1x/workbench-report.json`; screenshots are not checked in because the repository budget is 100/100. The first component-level loop uses byte-identical Web authority frames and the same snapshot to compare the real `Badge` platform pair: its fixed story ROI improves from 0.830999 to 0.833112 SSIM after the Lynx implementation gains the shared variants and sizes.

The second baseline at `/tmp/t3-components-lab-v2-final/workbench-report.json` adds the three highest-reuse host primitives (`HostView`, `HostText`, and `HostButton`) to the same catalog. Eleven story IDs and state lists match, both root surfaces are 1280px wide, renderer errors are zero, and full-frame SSIM is 0.713433. Remaining visible differences are intentionally retained as the next component backlog.

The third baseline at `/tmp/t3-components-lab-v3-fixed/workbench-report.json` adds the real `Tooltip`, `TooltipTrigger`, and `TooltipPopup` production imports. The paired capture opens both renderers through their real hover state machines and verifies `Shared tooltip` at the same 1280 x 820 viewport with zero renderer errors. This loop also fixed the shared Lynx `Button` primitive to forward cloned host attributes and main-thread handlers; without that reuse contract, a `TooltipTrigger` rendered through `Button` silently lost its floating anchor and hover behavior.

The fourth baseline at `/tmp/t3-components-lab-v4-menu-final/workbench-report.json` adds the real `Menu`, `MenuTrigger`, and `MenuPopup` imports and runs Tooltip then Menu as separate interaction states. Both renderers expose the same two menu items, and the retained Menu popup geometry is Web `128 x 66 @ (518, 655)` versus Lynx `128 x 66 @ (518.48, 655.5)`. The hard gate allows at most 2px per geometry field. The production Lynx menu now uses relation-based fixed positioning and a shared 28px `MenuItem` implementation instead of a full-width unstyled group alias.

The fifth baseline at `/tmp/t3-components-lab-v5-select-flex-util/workbench-report.json` adds the real compound `Select` story and executes an open, choose `Compact`, and reopen cycle through physical pointer input in both renderers. Web and Lynx retain the same selected value and item state with zero renderer errors. The final popup geometry is Web `711 x 66 @ (518, 271)` versus Lynx `710.31 x 66 @ (518.48, 270.5)`. Keeping the Lynx popup subtree mounted while closed avoids the ReactLynx dual-thread function-prop identity divergence caused by conditionally mounting the popup on tap; the list also uses the shared `flex flex-col` utility contract so both items occupy separate 28px rows.

The sixth baseline at `/tmp/t3-components-lab-v6-select-family/workbench-report.json` maps `SelectTrigger`, `SelectValue`, `SelectPopup`, and `SelectItem` into the catalog without duplicating their rendering. All four entries point back to the single production `Select` fixture whose physical open, select, and reopen sequence remains the hard interaction and geometry gate. The catalog now contains 22 stories with no covered story missing a Lynx use site.

The seventh baseline at `/tmp/t3-components-lab-v7-menu-item/workbench-report.json` maps the high-reuse `MenuItem` export to the existing production Menu fixture. The same two real items continue to drive popup content and geometry checks; no second menu implementation is introduced. The catalog now contains 23 stories with no covered story missing a Lynx use site.

The eighth baseline at `/tmp/t3-components-lab-v8-settings-section/workbench-report.json` adds the high-reuse `settings/settingsLayout#SettingsSection` platform pair with a real title, header action, and body composition. The shared catalog contains 24 stories, both renderers preserve the same story/canvas geometry contract, and renderer errors remain zero. The distinct lower-reuse `generalSettingsHost#SettingsSection` remains a separate uncovered component rather than being conflated by name.

The ninth baseline at `/tmp/t3-components-lab-v9-settings-row/workbench-report.json` maps `settings/settingsLayout#SettingsRow` into the same production Settings section fixture. Its default, status, control, and unavailable states are represented by two real rows, including the shared Switch control. The 25-story paired capture passes with zero renderer errors; the lower-reuse similarly named settings host components remain separate inventory entries.

The tenth baseline at `/tmp/t3-components-lab-v10-empty-family/workbench-report.json` adds one production empty-state composition and maps `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, and `EmptyContent` back to that single fixture. It includes icon media layers, title, supporting copy, and an action without introducing renderer-only lookalikes. The 31-story paired capture passes with zero renderer errors and no covered story missing a Lynx use site.

The eleventh baseline at `/tmp/t3-components-lab-v16-number-final/workbench-report.json` adds one controlled production `NumberField` composition and maps `NumberField`, `NumberFieldGroup`, `NumberFieldInput`, `NumberFieldIncrement`, and `NumberFieldDecrement` back to that shared fixture. Physical pointer input advances both renderers from `10` to `12` and restores them to `10`; the final root geometry is `128 x 32` in both renderers. The 36-story paired capture passes with zero renderer errors and no covered story missing a Lynx use site.

The twelfth baseline at `/tmp/t3-components-lab-v20-scroll/workbench-report.json` adds the real production `ScrollArea` platform pair with six shared rows in a `320 x 80` viewport over `192px` of content. Physical wheel input advances both renderers to `scrollTop = 48`; overflow, viewport geometry, content geometry, and zero renderer errors are hard gates. The fix restores vertical overflow on the shared `.lynx-scroll-area` primitive so every logical Lynx use site receives the same behavior instead of a Lab-only copy. The catalog now contains 37 stories with no covered story missing a Lynx use site.

The thirteenth baseline at `/tmp/t3-components-lab-v27-dialog-final/workbench-report.json` replaces the static Lynx dialog aliases with one production controlled/uncontrolled compound state machine and maps `Dialog`, `DialogPopup`, `DialogPanel`, `DialogHeader`, `DialogFooter`, `DialogTitle`, and `DialogDescription` back to one shared composition. Physical pointer input opens and closes both renderers; the retained open-state evidence matches the `448 x 214 @ (416, 303)` popup and the `446 x 64` panel/footer exactly. The long-page harness now scrolls both panes to each target before overlay interaction, so adding stories cannot silently invalidate popup geometry. The catalog contains 44 stories with zero renderer errors and no covered story missing a Lynx use site.

The fourteenth baseline at `/tmp/t3-components-lab-v29-popover-final/workbench-report.json` maps `Popover`, `PopoverTrigger`, and `PopoverPopup` back to one production compound fixture. The Lynx primitive now measures the real trigger on the main thread and positions the popup through the shared floating-relation contract instead of rendering an unanchored child. Physical pointer input opens and closes both renderers; the retained open-state popup is Web `255.59 x 65.90 @ (518.58, 429.49)` versus Lynx `256 x 66 @ (518.48, 430.5)`, inside the 2px hard gate. The catalog contains 47 stories with zero renderer errors and no covered story missing a Lynx use site.

The fifteenth baseline at `/tmp/t3-components-lab-v31-menu-structure-final/workbench-report.json` adds `MenuGroup` and `MenuSeparator` to the existing production Menu fixture without introducing another menu composition. Retained open-state evidence requires exactly one group, one separator, and two real items in both renderers. The popup is Web `128 x 75 @ (518, 315)` versus Lynx `128 x 75 @ (518.48, 313.5)`, inside the existing 2px geometry gate. The catalog contains 49 stories with zero renderer errors and no covered story missing a Lynx use site.

The sixteenth baseline at `/tmp/t3-components-lab-v32-project-favicon/workbench-report.json` adds the real `ProjectFavicon` platform pair against the isolated primary environment and `background-only` project cwd. Both asset resolvers independently select the production folder fallback path: Web renders the Lucide SVG and Lynx renders the rasterized native icon, each at `14 x 14 @ (518.48, 243.5)`. The hard gate requires matching asset/fallback mode and geometry rather than accepting renderer-specific fixture data. The catalog contains 50 stories with zero renderer errors and no covered story missing a Lynx use site.

The seventeenth baseline at `/tmp/t3-components-lab-v34-setting-reset-final/workbench-report.json` maps `SettingResetButton` into the existing production Settings section instead of creating a second settings fixture. Physical pointer input invokes the real callback in both renderers and advances the shared visible state from `Reset 0` to `Reset 1`. The production control geometry is `24 x 24` in both renderers after the Lynx icon-xs padding override is scoped correctly. The catalog contains 51 stories with zero renderer errors and no covered story missing a Lynx use site.

The eighteenth baseline at `/tmp/t3-components-lab-v35-dialog-structure/workbench-report.json` maps `DialogTrigger` and `DialogClose` into the existing production Dialog composition. The retained open-state evidence also asserts exactly one Backdrop and one Viewport in each renderer while keeping those internally composed exports outside catalog coverage until the inventory can attribute indirect ownership. The popup remains exactly `448 x 214 @ (416, 303)` after the longer 53-story page exercises synchronized target scrolling, open, and close with zero renderer errors.

The nineteenth baseline at `/tmp/t3-components-lab-v36-shared-structure/workbench-report.json` maps four already-shared structural primitives without creating parallel fixtures: `TooltipProvider` points to the production Tooltip interactions, `HostHeading` renders the story heading contract, and `ComponentLabStack` plus `ComponentLabColumn` remain the single cross-renderer layout implementation used by the Lab itself. All four have direct Web and Lynx use-site evidence. The 57-story paired capture passes every existing interaction gate with zero renderer errors and no covered story missing a Lynx use site.

The twentieth baseline at `/tmp/t3-components-lab-v37-sidebar-primitives/workbench-report.json` adds one compact production Sidebar composition and maps `SidebarProvider`, `SidebarGroup`, `SidebarMenu`, `SidebarMenuItem`, and `SidebarMenuButton` back to it. Physical pointer input advances the visible state from `Selected 0` to `Selected 1` in both renderers, and the menu button is exactly `200 x 32` in each. The catalog contains 62 stories with zero renderer errors and no covered story missing a Lynx use site.

The twenty-first baseline at `/tmp/t3-components-lab-v41-sidebar-trigger-final/workbench-report.json` extends that same production Sidebar composition with `SidebarContent` and `SidebarTrigger`. After the menu-button click remains visible as `Selected 1`, a second physical pointer input changes both provider states from `expanded` to `collapsed`; the trigger is `28 x 28` and the menu button remains `200 x 32` in both renderers. The catalog contains 64 stories with zero renderer errors and no covered story missing a Lynx use site.

The twenty-second baseline at `/tmp/t3-components-lab-v43-select-group-final/workbench-report.json` adds `SelectGroup` and `SelectGroupLabel` to the existing production Select fixture. The physical open, choose `Compact`, and reopen sequence retains one group, one label, and two items in each renderer. The final popup is Web `711 x 94 @ (518, 430)` versus Lynx `710.31 x 94 @ (518.48, 429.5)`, inside the 2px geometry gate. The catalog contains 66 stories with zero renderer errors and no covered story missing a Lynx use site.

The twenty-third baseline at `/tmp/t3-components-lab-v46-menu-label-shortcut-final/workbench-report.json` adds `MenuGroupLabel` and `MenuShortcut` to the existing production Menu fixture. The Lynx exports are no longer aliases of `MenuGroup`; each has its own text primitive and slot. Retained open-state evidence requires one group, one label, one separator, one shortcut, and two items in each renderer. The popup is Web `180 x 103 @ (518, 287)` versus Lynx `180 x 103 @ (518.48, 285.5)`, inside the 2px geometry gate. The catalog contains 68 stories with zero renderer errors and no covered story missing a Lynx use site.

The twenty-fourth baseline at `/tmp/t3-components-lab-v53-draft-input-final/workbench-report.json` adds the real `DraftInput` platform pair. The harness enters `beta` into each renderer separately, verifies the committed label remains `Committed alpha` during editing, then uses a real outside pointer click to blur and verifies `Committed beta`. Both shared control frames are `320 x 32`. The catalog contains 69 stories with zero renderer errors and no covered story missing a Lynx use site.
