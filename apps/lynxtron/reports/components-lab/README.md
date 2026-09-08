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
