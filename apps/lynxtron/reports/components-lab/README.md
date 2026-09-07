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

The first paired dark baseline passes with eight story IDs, identical state lists, a 1280px root in both renderers, and zero renderer errors. The retained report is temporary at `/tmp/t3-components-lab-v1w/workbench-report.json`; screenshots are not checked in because the repository budget is 100/100. Whole-frame SSIM is 0.693142, which is intentionally not treated as parity: the Lab has already exposed substantial primitive-level layout and style work for the next loops.
