# Certify and hand off the port

Phase T8 removes obsolete scaffolding, executes the final evidence matrix, verifies the packaged application, and records what remains outside ordinary UI completion.

## Plan metadata

- Content type: How-to
- Audience: Agents certifying and handing off the port
- Goal: Produce reproducible evidence for the completed ordinary UI port
- Depends on: T7 exit
- Exit: T8-Q1 through T8-Q4 are `completed`

## T8-Q1: Remove obsolete prototype paths

Status: `pending`

Delete renderers, styles, stores, fixtures, diagnostic routes, and adapters that the shared implementation replaces. Preserve explicit runtime probes and development diagnostics outside product navigation.

Exit criteria:

- Product navigation cannot reach a superseded clean-room screen
- No duplicate listener store remains beside the canonical Atom or shared reducer
- `overrides.css` contains only compatibility-linked rules
- Generated files reproduce without a working-tree diff
- The provenance report explains every remaining prototype-retained file

## T8-Q2: Run the final certification matrix

Status: `pending`

Certify these screens:

- New-thread empty state
- Populated thread
- Streaming thread
- Composer with context
- Model Picker
- Quick Switch
- Settings General
- Settings Providers
- Files panel
- Changes and Plan panels

Run dark and light themes at 1280 × 820 and 1440 × 900 where the runtime supports both themes.

Exit criteria:

- Every matrix cell contains `web.png`, `lynx.png`, `metrics.json`, and `notes.md`
- Both reuse gates pass per ordinary screen
- Layout and typography thresholds pass
- No unregistered large color-region difference remains
- Interaction evidence links to the T7 matrix
- Masked regions and accepted differences include bounds and viewport percentages

## T8-Q3: Verify the packaged application

Status: `pending`

Build the production Lynx bundle, host, connector, and package. Verify the packaged artifact instead of relying on development servers.

Exit criteria:

- A clean production build succeeds from documented prerequisites
- The packaged app starts the bundled server and reaches ready state
- Project creation, thread creation, prompt send, stream or provider-start state, interrupt, settings persistence, and file read/write complete
- Global keyboard commands and complete `<list>` transcript behavior pass their T7 interaction fixtures
- Code/editor, terminal, and embedded browser show the approved placeholders with canonical surrounding chrome and state
- Menu, deep link, clipboard, external navigation, and window lifecycle smoke tests pass where supported
- The artifact identity, checksum, host architecture, and runtime version are recorded
- The test does not publish, sign, notarize, or update a user installation

## T8-Q4: Publish the completion report

Status: `pending`

Write `docs/port-completion-report.md` with four separate verdicts:

1. Source reuse
2. Visual fidelity
3. Functional coverage
4. Runtime and hard-island status

Exit criteria:

- The report lists per-screen module and line reuse
- The report summarizes anchor, typography, color, and interaction results
- The report names excluded and degraded capabilities
- Code/editor, terminal, and embedded-browser placeholders are reported as approved product decisions
- Full patch rendering, SVG, and fonts have independent runtime statuses
- Global keyboard support and complete `<list>` chat report passing functional evidence
- The report links reproduction commands and raw evidence
- The report does not use ordinary UI completion to claim hard-island completion

## Phase exit

The ordinary UI port is complete when T8-Q4 reports passing reuse, fidelity, and functional evidence with zero unregistered major differences. Hard islands may remain open with explicit owners and exit conditions.
