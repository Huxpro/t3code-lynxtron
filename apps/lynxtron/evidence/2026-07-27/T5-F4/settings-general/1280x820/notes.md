# T5-F4 Settings General runtime evidence — 1280 × 820

- Product reference: current monorepo Electron/Web T3 Code
- Candidate: current monorepo `@t3tools/lynxtron`
- Standalone Lynx repository: provenance only; not a visual baseline
- Route/theme: Settings General, dark
- Logical viewport: 1280 × 820
- Image dimensions: 2560 × 1640
- Capture tool: Lynx DevTool `take-screenshot`
- DevTool renderer errors: zero

This evidence verifies the T5-F4 platform primitive and token contract in a
real Lynxtron renderer. The background-VM DevTool navigation hook writes only
the renderer pathname atom; normal startup and user navigation are unchanged.

The Web client was separately verified in an isolated `test-t3-app`
environment at `http://localhost:5735/settings/general`: the complete panel
rendered, Project Grouping persisted after a toggle, its inline reset restored
the default, Restore defaults returned to disabled, and browser console errors
remained zero.

This is not a T5-F5 fidelity certification. The screenshot still uses the
Lynx-local General composition and exposes visible differences in copy,
control density, row rhythm, and the lower-page content boundary. T5-F5 must
replace that composition with the shared Web feature panel and produce matched
Electron/Lynx pairs at both required viewports.

Failed diagnostic captures are retained under `failed-attempts/`. They record
an abandoned host initial-route experiment and a stale `dist/desktop` bundle;
neither path is part of the final runtime evidence.
