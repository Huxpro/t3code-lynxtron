# T3 Code — Lynxtron

The Lynx-rendered desktop client for T3 Code. It runs a ReactLynx UI inside a
`LynxWindow` and connects to the same local `apps/server` backend through the
workspace contracts and Effect RPC protocol.

## Commands

From the monorepo root:

```bash
# Build the server binary consumed by the local connector.
pnpm --filter t3 build:bundle

# Typecheck, test, build, and launch the Lynxtron client.
pnpm --filter @t3tools/lynxtron typecheck
vp test run apps/lynxtron/src/main/desktop/serverPaths.test.ts
pnpm build:lynxtron
pnpm start:lynxtron

# With the production client running, capture through Lynx DevTool.
pnpm --dir apps/lynxtron run capture:lynx -- \
  --output reports/screenshots/lynx-new-thread.png \
  --snapshot <snapshot-id>
```

The connector finds `apps/server/dist/bin.mjs` relative to its built location.
`T3_SERVER_BIN` remains available for packaged or custom layouts. It invokes
`node` from `PATH` by default; packaged hosts can set `T3_NODE_BIN` to their
bundled Node runtime. The Lynxtron host executable itself is never reused as a
Node CLI.

## Native verification

The Native gates launch the built app in the background (`T3_LYNXTRON_BACKGROUND=1`)
against isolated fixtures, so they never take focus:

```bash
pnpm --filter t3 build:bundle && pnpm build:lynxtron
node apps/lynxtron/scripts/prepare-native-battery.mjs /tmp/t3-battery
node apps/lynxtron/scripts/run-native-battery.mjs /tmp/t3-battery/plan.json /tmp/t3-battery/results
```

`results/summary.json` lists each gate; a failing gate keeps its report and
process log in its own directory. Root `AGENTS.md` has the rules for evidence.

## Architecture

```text
src/app                     ReactLynx UI and .lynx platform adapters
  generated/lynx.css        generated from apps/web/src/index.css
  overrides.css             runtime-gap-only layout adapters
  state/                    renderer state fed by sequenced main-process events
src/main/desktop
  main.ts                   LynxWindow host
  mainConnectorHost.ts      main-owned connector and typed bridge handlers
  preload.ts                branding, preferences, clipboard, navigation
  connector.ts              server bootstrap, auth, Effect RPC
scripts
  audit-web-apis.mjs        DOM/BOM usage inventory
  audit-css.mjs             utility and unsupported syntax inventory
  generate-lynx-css.mjs     upstream-derived Lynx theme
  build-icons.mjs           temporary SVG-to-PNG adapter
```

The renderer cannot use browser DOM APIs. Shared behavior is expressed through
`@t3tools/client-runtime/platform`; `.web.ts` and `.lynx.ts` implementations
provide storage, clipboard, connectivity, keyboard, and media-query behavior.

Electron/Web is the visual and interaction baseline. The standalone Lynx
repository is used only for textual provenance and historical-behavior
discovery. See [the screenshot evidence policy](reports/screenshots/README.md)
for the repeatable DevTool capture and visual-diff workflow.

See [compat-matrix.md](docs/compat-matrix.md), [port-ledger.md](docs/port-ledger.md),
and [implementation-status.md](docs/implementation-status.md) for measured
coverage and explicit runtime-gated work.
