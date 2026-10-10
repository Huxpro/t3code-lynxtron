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
process log in its own directory. `AGENTS.md` in this directory says when to run them.

The gates read the client, not a transport: `__T3_LYNXTRON_READINESS__()` reports
`ready` once the status the UI shows is ready and commands have a path to the
server, with a `revision` that grows whenever the client state changes, and
`__T3_LYNXTRON_COMMAND__(name, input)` sends a command through the bridge the UI
calls. `scripts/dev-instance.mjs ready` waits on the same signal.

## Architecture

How the client sits on top of upstream code, and the invariants that keep it
that way, are in [docs/architecture.md](docs/architecture.md).

```text
src/app                     ReactLynx UI, state, and platform capabilities
  generated/lynx.css        theme tokens generated from apps/web/src/index.css
  overrides.css             the Lynx stylesheet
  state/                    renderer state fed by upstream's client runtime
src/main/desktop
  main.ts                   LynxWindow host
  mainConnectorHost.ts      connector lifecycle, status events, typed bridge handlers
  preload.ts                branding, preferences, clipboard, navigation
  connector.ts              server spawn or pairing, bearer exchange
scripts
  audit-web-apis.mjs        DOM/BOM usage inventory
  audit-css.mjs             utility and unsupported syntax inventory
  generate-lynx-css.mjs     upstream-derived Lynx theme
  build-icons.mjs           temporary SVG-to-PNG adapter
```

The renderer cannot use browser DOM APIs. Where it uses an upstream Web module,
a `.lynx` module of the same name under `apps/web/src` replaces whatever that
module needs from the browser. Renderer-neutral logic the client owns lives in
`packages/lynx-logic`.

Runtime capabilities and workarounds are in [docs/compat-matrix.md](docs/compat-matrix.md).
