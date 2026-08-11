# Historical H5 source reuse and style coverage audit

Date: 2026-08-04

These percentages are a historical prioritization snapshot. The large
generated reuse/style reports are intentionally not committed in final5 and
must be regenerated before describing the values as current.

## Artifacts

- Reuse boundaries: `scripts/reuse-boundaries.json`
- Reviewed boundary hash:
  `40adb6b14ccb9d29e17e09acfd58c1a02214176f037bc29942aa43da1331661a`
- Production resolver fingerprint:
  `70d90b2c1f404afbba67f2116e6748e2983abbb78a044356b379aa66903f7579`
- Reuse report: `reports/reuse/plan11c.json`
- Style report: `reports/style/plan11c.json`

## Physical reuse findings

The audit uses the real Web and inspected Rspeedy production resolvers,
canonical realpaths, and three scopes per surface. Identical copied bytes do
not count as shared.

| Product surface | Shared modules | Shared LOC |
| --- | ---: | ---: |
| App shell / Sidebar | 6.2% | 4.7% |
| New Thread | 16.4% | 21.2% |
| Existing Thread / Transcript | 16.4% | 21.2% |
| Composer | 14.8% | 21.5% |
| Model Picker | 2.9% | 3.5% |
| General feature panel | 80.0% | 76.7% |
| Settings General route | 3.7% | 2.5% |
| Settings Providers | 3.8% | 3.5% |
| Quick Switch | 3.2% | 2.7% |
| Settings Appearance | 3.1% | 3.3% |
| Settings Connections | 3.4% | 3.5% |
| Settings Source Control | 4.0% | 4.6% |
| Settings Beta | 3.6% | 4.0% |
| Settings Archive | 3.8% | 4.1% |
| Review / Changed Files | 3.3% | 3.0% |

The one high-reuse result is a deliberately isolated feature panel. It must not
be generalized to the containing routes. The current source graph contradicts
historical prose that ordinary route composition is broadly shared.

The H7 correction replaced four false Lynx Settings roots (`SettingsPage`) with
the real implementation owner (`OtherSettings`). Their previous 0.1–0.5% LOC
figures were a Harness audit defect, not a product regression or sudden reuse
gain. App-shell movement reflects the shared `AppSidebarComposition`; the
larger New Thread, Existing Thread, and Composer movement reflects shared route
surfaces, pending-request anatomy, and client-runtime presentation projections.

## Weighted style findings

- Audited surfaces: 15
- Initial weighted coverage: **70.29%**
- Current unique tokens: 1,697
- Current weighted occurrences: 69,205
- Current covered occurrences: 53,158
- Current weighted coverage: **76.81%**
- Current unmapped: 902 tokens / 12,502 occurrences
- Current unsupported variants: 188 tokens / 2,837 occurrences
- Unsupported selectors: 57 tokens / 708 occurrences

Highest-frequency remaining risks include `cursor-pointer`,
`focus-visible:ring-ring`, `focus-visible:ring-2`, pseudo-element utilities,
`not-dark:bg-clip-padding`, and responsive/interaction variants. Every row in
the report contains screen and file provenance.

## Verification

- Production-resolver reuse report generated successfully for all 15 surfaces.
- Reuse auditor, style coverage and gap-atlas focused suites: 5/5 pass.
- Tailwind CSS was generated from the current `tailwind.config.mjs`; style
  coverage did not rely on a static supported-property guess.

## Decision

H6/H7 must prioritize shared route/composition owners and high-frequency style
contracts. More local Lynx-only screen work would increase the divergence
already measured here.
