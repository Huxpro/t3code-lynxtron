# Lynxtron compatibility matrix

Generated evidence lives in `../reports/`. Run `pnpm run audit` after upstream UI
changes. Status values are intentionally finite:
`supported`, `runtime-gap`, `adapter`, `rewrite`, or `out-of-scope`.

## DOM and host APIs

| Capability                      |           Audit evidence | Status      | Owner / removal condition                                            |
| ------------------------------- | -----------------------: | ----------- | -------------------------------------------------------------------- |
| `window.desktopBridge`          |      50 sites / 27 files | adapter     | `host/preload` bridge; align more of `DesktopBridge` as screens move |
| window events and timers        |               157+ sites | adapter     | L1 `Keyboard` / lifecycle adapters; remove per consumer              |
| `document` and element creation |               100+ sites | rewrite     | L3 `.lynx.tsx` host views                                            |
| clipboard                       |       17 sites / 7 files | adapter     | `clientCapabilities.clipboard`                                       |
| external/file navigation        |  renderer use prohibited | adapter     | `clientCapabilities.navigation` via Lynxtron preload shell           |
| local/session storage           |     22+ sites / 13 files | adapter     | `clientCapabilities.storage`                                         |
| `matchMedia`                    |        9 sites / 4 files | adapter     | fixed desktop `MediaQuery` until responsive windows land             |
| measurement / observers         | see `web-api-audit.json` | adapter     | Lynx ref UI methods; probe before each overlay port                  |
| Selection API                   | see `web-api-audit.json` | runtime-gap | R8                                                                   |
| WebSocket / fetch               |   renderer use forbidden | adapter     | Node connector owns all transport                                    |

## CSS and interaction

The current audit sees 1,276 distinct static utilities. High-frequency gaps
include `hover:text-foreground` (50), `grid` (47), focus-visible rings (20+),
fixed positioning (5), and sticky positioning (4).

| Feature                                     | Status      | Workaround                                               |
| ------------------------------------------- | ----------- | -------------------------------------------------------- |
| flexbox, explicit dimensions, borders       | supported   | used directly                                            |
| `oklch`, `color-mix`, `@variant`, `--alpha` | adapter     | build-time token generation (R9)                         |
| `:hover`, `:focus-visible`                  | rewrite     | state-driven variants (R6)                               |
| grid                                        | rewrite     | explicit row/column flex layouts                         |
| fixed/sticky/overflow semantics             | runtime-gap | per-component probe and explicit overlay sizing (R7)     |
| production lazy bundle URL resolution       | runtime-gap | keep the reachable product path in the main bundle (R11) |
| backdrop filters                            | rewrite     | flattened opaque surface                                 |
| text selection                              | runtime-gap | copy buttons where possible (R8)                         |
| custom fonts                                | runtime-gap | bundled font retained; system fallback (R2)              |
| SVG                                         | runtime-gap | build-time PNG rasterization (R1)                        |

## Rendering and events

| Feature                      | Status      | Workaround                                                  |
| ---------------------------- | ----------- | ----------------------------------------------------------- |
| `div/span/button`            | rewrite     | `view/text` host layer                                      |
| click/input events           | rewrite     | `bindtap` / `bindinput`                                     |
| renderer keyboard events     | runtime-gap | visible controls; R5                                        |
| preload push channel         | runtime-gap | coalesced 400 ms polling; R3                                |
| TanStack `RouterProvider`    | runtime-gap | core router + synchronous pathname switch; R4               |
| effect-atom hooks            | supported   | live `t3ClientStateAtom` + `AtomRegistry` renderer state    |
| panel surface state          | supported   | shared generic reducer + host-specific surface payloads     |
| session/sidebar view-models  | supported   | shared `client-runtime` semantics + host-specific styles    |
| Sidebar V2 row composition   | supported   | shared card/slim hierarchy; bounded Web/Lynx state hosts    |
| composer send-state          | supported   | shared prompt/context/attachment sendability + host editor  |
| composer controls/dispatch   | supported   | shared mode/options/context projection + canonical commands |
| proposed-plan presentation   | supported   | shared title/preview/follow-up/export projection + host UI  |
| model-picker view-models     | supported   | shared catalog/selection fallback/search/order + host rows  |
| Markdown fence/list models   | supported   | shared fence metadata + ordered/task projection + host UI   |
| Markdown inline/file links   | supported   | shared spans/path projection + host navigation              |
| changed-files view-models    | supported   | shared checkpoint tree/stats/preview projection + host UI   |
| project-file list/read/write | supported   | shared entry/save state + Node-host canonical RPCs          |
| source-control discovery     | supported   | shared status projection + Node-host canonical RPC          |
| auth-access inventory        | supported   | shared stream reducer/projection + credential-free host DTO |
| command-palette view-models  | supported   | shared query parsing/ranking + host rows                    |
| provider view-models         | supported   | shared instances/status/settings overlay + host styles      |
| general-settings projection  | supported   | shared grouping/restore semantics + schema-free defaults    |
| Settings primitive contracts | adapter     | `.web`/`.lynx` leaves + generated tokens; R6/R7/R9          |
| server-config stream         | supported   | shared reducer in Node host; canonical config polled R3     |
| transcript rows and folds    | supported   | shared transcript projection + native `<list>` host leaf    |

## Runtime backlog

| ID  | Gap                                                                                                                                                                                                 | Current adapter                                                                                                   | Remove when                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | SVG rasterizes blank                                                                                                                                                                                | `build-icons.mjs` PNGs                                                                                            | SVG probe paints pixels                                                                                                                                                        |
| R2  | custom font ignored                                                                                                                                                                                 | system font                                                                                                       | bundled DM Sans affects metrics                                                                                                                                                |
| R3  | no preload-to-UI push (2026-07-29 probe: main→renderer `sendGlobalEvent` works; preload is an isolated realm, no declared preload→main channel)                                                     | 400 ms polling host adapter feeding Effect Atom                                                                   | preload can emit to UI, or a preload→main channel lets the connector relay via `sendGlobalEvent` — filed as [lynxtron#150](https://github.com/lynx-family/lynxtron/issues/150) |
| R4  | RouterProvider snapshot crash                                                                                                                                                                       | `router.ts` switch                                                                                                | navigation remount probe passes                                                                                                                                                |
| R5  | renderer keyboard API incomplete (2026-07-29 probe: no window-level key events; Menu accelerators declared only; renderer key props headlessly unverifiable; `sendGlobalEvent` delivery leg proven) | priority host/native global-key bridge; visible controls only as interim fallback                                 | required global shortcut and focus matrix passes                                                                                                                               |
| R6  | hover/focus selectors                                                                                                                                                                               | state styles                                                                                                      | selectors paint correctly                                                                                                                                                      |
| R7  | fixed/sticky/overflow differences                                                                                                                                                                   | scoped overrides; explicit non-shrinking overlay/menu rows                                                        | conformance probes pass                                                                                                                                                        |
| R8  | Selection API absent                                                                                                                                                                                | explicit copy action                                                                                              | renderer selection is available                                                                                                                                                |
| R9  | modern colors/functions                                                                                                                                                                             | generated resolved CSS                                                                                            | Lynx parser accepts source syntax                                                                                                                                              |
| R10 | DOM/Worker diff renderer absent                                                                                                                                                                     | canonical checkpoint file tree and totals                                                                         | native or host-backed patch renderer passes parity fixtures                                                                                                                    |
| R11 | relative async Lynx bundle URL rejected (repro on 0.0.5; not empirically retested on 0.0.7 — upstream file-URL loader fix is post-0.0.7)                                                            | no lazy product branch; keep reachable surfaces in the main bundle                                                | packaged/local resource loader resolves Rspeedy async bundle URLs without `ERR_INVALID_URL` — filed as [lynxtron#148](https://github.com/lynx-family/lynxtron/issues/148)      |
| R12 | DevTool input emulation delivers taps only (drag, touch sequences, and `mouseWheel` never scroll a `<list>`)                                                                                        | scroll contracts proven by shared `reduceTranscriptFollow` unit tests; runtime scroll interaction passes deferred | a CDP input probe scrolls a `<list>` (drag or wheel) on Lynxtron desktop — filed as [lynxtron#151](https://github.com/lynx-family/lynxtron/issues/151)                         |
