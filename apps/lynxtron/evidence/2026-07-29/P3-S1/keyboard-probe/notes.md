# P3-S1 keyboard/push capability probe (Lynxtron 0.0.5)

- Date: 2026-07-29
- Task: P3-S1 runtime probe (R5, with R3-relevant findings). No product
  keyboard implementation in this slice; probes only.
- Method: declaration inventory of the installed `@lynx-js/lynxtron` 0.0.5
  package, plus env-gated runtime probes (`T3_LYNXTRON_CAPABILITY_PROBE=1`)
  in `src/main/desktop/main.ts` / `preload.ts` and an inert renderer listener
  (`src/app/state/capabilityProbe.ts`), verified through Lynx DevTool console
  output on the long-transcript fixture.

## Runtime-verified results

1. **`LynxWindow.sendGlobalEvent` main → renderer WORKS end to end.**
   Main logged `sendGlobalEvent returned true`; the renderer's
   `GlobalEventEmitter` listener logged
   `renderer received t3-capability-probe: [{"from":"main","sentAt":...}]`
   (reproduced in two fresh sessions). The delivery leg of the P3-S3
   priority path (main normalize → `sendGlobalEvent` → renderer resolver)
   is therefore proven.
2. **Preload does NOT share main's JS realm.** With main planting
   `globalThis.__t3CapabilityProbeMainPid` and the window handle, preload
   reported `mainPidMarker=undefined sharedWindowHandle=no` (and its
   `console.log` surfaces in the renderer background-thread console). One OS
   process, separate JS realms — the connector cannot reach the window
   handle directly, and 0.0.5 declares no preload→main IPC (no `ipcMain`/
   `ipcRenderer`; `contextBridge` only exposes preload APIs to the BTS).
   R3's polling adapter therefore stands; the refined upstream ask is a
   preload→main channel or a preload-visible `sendGlobalEvent`.
3. **CDP `Input.dispatchKeyEvent` is `Not implemented`** (DevTool daemon
   error). Headless key injection is impossible; this extends R12
   (input emulation = taps only, no keys, no scrolls).

## Declaration inventory (0.0.5; existence only, not behavior)

- `Menu` items: `accelerator` + `acceleratorWorksWhenHidden` — declared;
  activation cannot be triggered headlessly (needs real keys or menu click).
- `LynxWindow`/`BaseWindow` events: focus/blur/move/resize/swipe etc. —
  **no window-level key or before-input event exists**.
- No `globalShortcut` module.
- Renderer `@lynx-js/types`: `bindkeydown`/`bindkeyup` plus `global-`,
  `capture-`, `catch-` variants with a `KeyEvent` whose detail payload is
  `{}` in `BaseKeyEvent` — key identity fields are unclear from types alone.
  Runtime behavior unverifiable headlessly (R12); pending a real-input
  session.

## Consequences for P3

- The keyboard bridge's renderer delivery can use the proven
  `sendGlobalEvent` path once main can observe keys; today main has no
  declared key source except Menu accelerators.
- Accelerators + `sendGlobalEvent` could cover discrete app commands
  (new thread, quick switch) but not Tab/focus/Escape/arrow semantics —
  matching the strategy's warning that accelerators must not masquerade as
  full keyboard support.
- R5 remains open; the upstream issue draft now carries these probe facts.

## Probe hygiene

Both probes are env-gated (`T3_LYNXTRON_CAPABILITY_PROBE=1`) and the
renderer listener is inert without the event; nothing runs in normal
sessions. Remove-when: R3 push channel or R5 keyboard capability lands.
