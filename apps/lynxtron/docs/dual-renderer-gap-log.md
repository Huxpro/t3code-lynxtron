# Dual-renderer gap log (2026-08-03)

Source: the BW2 workbench comparison page
(`apps/lynxtron/evidence/2026-08-03/BW2/comparison.html`), comparing Web
authority vs Lynx-for-Web across the 7 key product states × 2 viewports.

Classification:

- **product** — a real shared-composition/CSS/leaf defect fixable in this repo.
- **proxy** — a Lynx-for-Web browser-proxy rendering characteristic that does
  NOT reproduce in Native Lynxtron (BW5 territory); documented, not masked.
- **reference-host** — a limitation of the Web reference pane wiring, not the
  product.

Every gate in the comparison page currently passes because the geometry
baseline records the _current_ per-pane render (so the gate detects change),
but the panes are visibly divergent. This log captures those visible
divergences for triage and fix.

## G1 — Lynx renderer lays the chat shell out horizontally (missing Tailwind flex-direction) [product, root cause found]

Symptom (all chat scenarios: new-thread, existing-thread, project-scope-open,
lifecycle-error): in the Lynx-for-Web pane the Sidebar rows, chat header, and
right-panel/composer controls render in a single horizontal row across the top
instead of the vertical rail + stacked column the Web pane shows. The composer
card is pushed to the far right (x≈880) instead of centered in the chat column.

Root cause: the Lynx Tailwind build (`apps/lynxtron/tailwind.config.mjs`) uses
an explicit per-file `content` allowlist that is **missing the key shared
composition surfaces** — `ChatRouteSurface`, `AppShellSurface`,
`SidebarV2CompositionSurface`, `SidebarV2ControlsSurface`, `SidebarV2RowSurface`,
`PlanSurface`, `RightPanelSurface`, `FileTreeSurface`, and the Settings surfaces
(`SettingsRouteSurface`, `SettingsSurfaces`, `GeneralSettingsContent`, etc.).
Tailwind JIT only emits utilities it finds in scanned content, so those
surfaces' classes — including `flex-col` (→ `flex-direction: column`) — are
never emitted into the Lynx CSS. The shipped bundle contains 0
`flex-direction:column` rules.

- On **Native** Lynxtron the implicit `<view>` column default partially masks
  the missing `flex-col`, but other utilities from these surfaces are also
  absent — a real fidelity gap in the shipped Lynx CSS.
- On **Lynx-for-Web** `x-view` defaults to the web `flex-direction: row`, so the
  missing `flex-col` is fully exposed as horizontal layout.

Classification: **product** + **proxy**. Two-part fix applied:

1. **Tailwind content (product)** — `apps/lynxtron/tailwind.config.mjs` now scans
   the reachable shared composition surfaces (`ChatRouteSurface`,
   `AppShellSurface`, `SidebarV2*Surface`, `PlanSurface`, `RightPanelSurface`,
   `FileTreeSurface`, the Settings surfaces, etc.) so their utilities are emitted
   into the Lynx CSS at all.
2. **flex-col proxy conditioning (proxy)** — investigation showed the Lynx CSS
   pipeline emits `.flex-row { flex-direction: row }` but drops
   `.flex-col { flex-direction: column }` (redundant on Lynx-native, whose
   `<view>` defaults to column; NOT redundant on Lynx-for-Web, whose `x-view`
   follows the CSS `row` default). The browser-preview host
   (`src/browser-preview/index.ts`) now injects the missing `.flex-col` /
   `.flex-col-reverse` utility into the `<lynx-view>` shadow root. Scoped to the
   explicit class, so `flex`/`flex-row` rows are untouched. This is browser-proxy
   conditioning to match Native's column default, not product code.

Result: the Lynx-for-Web sidebar now renders as a proper vertical rail (brand
backdrop, stacked thread cards, Settings footer) matching the Web pane, instead
of a horizontal row.

### G1a — chat main column overlap [resolved]

Root cause (extended from G1): the Lynx CSS pipeline also strips `flex-grow`
and does not carry the `.flex-1 / .flex-auto / .flex-none` shorthands to
Lynx-for-Web, and it strips `flex-direction`/`flex-grow` even from
`overrides.css` custom classes (`.hero`, `.hero__inner`, `.composer-overlay`).
So the chat column's body row did not fill (`flex-grow:0`) and the hero did not
stack/center, collapsing the header/composer to the top.

Fix: extend the `<lynx-view>` shadow-root conditioning
(`src/browser-preview/index.ts`) to re-supply the dropped utilities
(`.flex-1/.flex-auto/.flex-none/.flex-initial`) and the stripped custom-class
flex properties (`.hero{flex-direction:column;flex-grow:1}`,
`.hero__inner`, `.composer-overlay`). Bare `flex`/`.flex-row` compile correctly
and are untouched, so row surfaces (sidebar search row, header controls) stay
horizontal. Result: the Lynx-for-Web pane now renders the full shell — sidebar
rail, full-width header, vertically centered hero + centered composer, docked
transcript — matching the Web authority. All 14 workbench cells pass.

## G2 — Composer not centered in the Lynx pane [resolved by G1a]

The `COMPOSER_SHELL_CLASS` (`mx-auto max-w-3xl`) now measures `maxWidth:768px`,
`marginLeft:auto`, centered — resolved once the hero column/flex-1 fill was
restored (G1a).

## G3 — Reference-host chat Sidebar renders offcanvas in the iframe [reference-host, RESOLVED by deletion]

Recorded in BW7-BW8 findings: the Web reference pane's chat Sidebar used its
offcanvas layout in the workbench iframe because the shipped `Sidebar` in-flow
gap div was gated behind a CSS `md:` breakpoint that did not reserve width in
that iframe/emulation environment.

**Resolved in Plan 11B (SB3):** the hand-built Web reference host was deleted
entirely. The workbench left pane is now the **real Web app** connected to a
shared server (`scripts/capture-shared-workbench.mjs`), which renders a correct
full-height shell. This entire class of reference-fidelity defect is gone by
construction — see `evidence/2026-08-03/SB4/web.png`.

## Plan 11B addendum — differences now measured with two real frontends

Since SB3 the comparison uses two shipping frontends on one seeded shared
server, so a "reference-host" classification no longer exists. The SB4 findings
(`evidence/2026-08-03/SB4/findings.md`) reclassify the live differences:

- **D1** header toolbar overflow in Lynx-for-Web — continuation of **G1**
  (Lynx flex-utility handling on shared composition surfaces), more pronounced
  with real, denser server config. `product`, Plan 12.
- **D2** panes auto-select different active threads — real behavioral
  difference (Lynx connector vs Web selection), `live-state`, Plan 12.
- **D3** live environment banners (version mismatch, provider status, updates)
  — truthful live-server output, `live-state`, expected.

## D4 — Lynx-for-Web icons paint at intrinsic size, overflowing their box [proxy, RESOLVED]

Symptom (SB4, live shared-server homepage): the chat header actions, composer
toolbar controls, sidebar controls, and the "Working" status all rendered with
huge icons overflowing far past their layout boxes, making the pane look
totally unlike the Web homepage — even though `getBoundingClientRect` reported
the correct 14–16px boxes.

Root cause (two parts):

1. **Proxy — `x-image` collapses to `display:inline`.** `Icon`
   (`src/app/components/Icon.tsx`) renders lucide glyphs as pre-rasterized PNGs
   through Lynx's `<image>` (web-core `x-image`) with an inline px `width/height`
   box. The base web-elements CSS sizes it via `contain:strict` on a flex box,
   but the Lynx CSS pipeline dropped that rule for many instances, leaving the
   host `display:inline` — on which `width` has no effect. Its inner
   `<img part="img">` (`width:100%`) then painted at the PNG's intrinsic size
   and overflowed. Verified by CDP: `cssWidth:16px` but `getBoundingClientRect
width:48px`, `display:inline`, `contain:none`.
2. **Product — lucide SVG icons in the sidebar.** `SidebarV2.lynx.tsx` rendered
   the working/failed/settle/unsettle/unsnooze/woke status icons with
   lucide-react SVG components (`LoaderIcon`, `TriangleAlertIcon`, etc.) instead
   of the PNG `Icon`. Lynxtron does not paint SVG (per `Icon.tsx` field notes)
   and Lynx-for-Web renders them at intrinsic size, so the "Working" spinner was
   a huge glyph. Native impact too, not just proxy.

Also surfaced a harness bug: the capture screenshotted before Lynx-for-Web
finished applying styles/rasterizing icons, so even correct frames looked
broken. Fixed by gating the capture on a style-applied probe (every icon
`<image>`, excluding the legitimately-wide wordmark by height, must be within an
icon-sized box) plus a short commit delay, and by re-seeding pristine at run
start for determinism.

Fix:

- **Proxy** — `src/browser-preview/index.ts` `injectLynxLayoutDefaults` injects
  into the `<lynx-view>` shadow root:
  `x-image{display:inline-flex!important;flex:none!important;align-items:center;justify-content:center;overflow:hidden;contain:strict}`
  plus `x-image::part(img){width:100%;height:100%;object-fit:contain}`, forcing
  every icon `x-image` to be a definite-size flex box and scaling the inner img
  via its exposed part. Scoped to `x-image`; nothing else affected.
- **Product** — `SidebarV2.lynx.tsx` now renders those status/action icons via
  the PNG `Icon` component (`refresh-cw`, `triangle-alert`, `check`,
  `rotate-ccw`) with explicit sizes, matching the rest of the Lynx app.

Result: the SB4 homepage now aligns with the Web pane at 1280x820 and 1440x900
— sidebar, header actions, hero, composer toolbar, and the working-status
indicator all render at correct icon sizes. Evidence: `evidence/2026-08-03/SB4/`.

Remaining homepage deltas are live-state, not layout: the Web pane's live
environment banners (provider status, version mismatch, updates) and a differing
active thread / third header action (`Publish repository` vs `Commit`), tracked
as D2/D3 for Plan 12.

## D5 — Screenshot-reported error state renders incorrectly [product, RESOLVED]

The 2026-09-05 reference screenshot showed a visibly malformed Lynx failed-thread
state. A fresh isolated project now reproduces the state through the real
connector with `opencode/not-a-real-model`, retaining the persisted model-not-found
error and the same failed thread for both renderers. The current regression had
two causes: Lynx's dismiss wrapper was 40×26 instead of 24×24, making the alert
two pixels taller, and Lynx-for-Web retained a four-pixel excess top-banner list
inset. Matching the shared action/gap geometry and conditioning only the Browser
Preview inset restores both transcript row origins to Web's y=130/221. The
strict post-commit pair passes with identical error text and state, zero renderer
errors, and full-frame SSIM improving from 0.941184 to 0.951504.
