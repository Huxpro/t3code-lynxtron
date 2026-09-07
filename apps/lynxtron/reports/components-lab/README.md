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
