# Main Thread Script Contract

T3 Code uses ReactLynx Main Thread Script (MTS) only for interactions that must
update native UI without waiting for the background thread:

- Sidebar resize;
- Right Panel resize;
- Model Picker wheel scrolling.

## Root cause

The `main-thread.js exception: TypeError: not a function` reports were not a
missing Lynxtron DOM API. A Native runtime contract probe against Lynxtron
`0.0.8` and Lynx SDK `4.1` proved that all of these work in the main-thread VM:

- `String`;
- `MainThread.Element.setAttribute`;
- `MainThread.Element.querySelector`;
- `lynx.querySelector`;
- a nested MTS helper.

The failure reproduced only when an MTS function called an imported ordinary
function that was not declared as a cross-thread shared module. ReactLynx
requires that import to use an import attribute:

```ts
import { helper } from "./helper" with { runtime: "shared" };
```

Only directly imported identifiers retain this capability. Do not assign a
shared import to another variable before calling it from MTS.

## Rules

1. Keep event extraction and `MainThreadRef` access inside an MTS function.
2. Cross-module pure helpers called by MTS must use
   `with { runtime: "shared" }`.
3. Do not capture an options object when it contains callbacks or other
   background-only values. Capture primitives and refs explicitly.
4. Do not call one event worklet from another. Share a pure helper or duplicate
   the small event-finalization sequence.
5. `runOnBackground` receives a background JS function handle, not an arbitrary
   object method or closure hidden inside another object.
6. Guard lifecycle-sensitive refs and `event.currentTarget`. A MTS handler may
   outlive the element that originally registered it.
7. A TypeScript pass is not sufficient. Inspect the generated main-thread
   contexts and run the Native runtime contract.
8. Do not keep resize on `main-thread:global-bindmousemove` or
   `main-thread:global-bindtouchmove`. Every global move enters the page-event
   bridge and can trigger the `ContextProxy::DispatchEvent called too
frequently` monitor before handler-side throttling runs.
9. Desktop mouse events are hit-tested at the current pointer position. While
   dragging a narrow resize rail, set its native `hit-slop` to cover the
   viewport, then restore it on end or cancel. This keeps move/up on the local
   element MTS path without using the page-global event bridge.
10. Do not leave the Sidebar's `width 200ms linear` transition active while
    MTS writes a width for every pointer sample. Each update otherwise starts
    or redirects a 200ms animation, so the visible edge trails the cursor even
    when event delivery is timely. Set the gap and container transition
    duration to `0ms` at drag start and restore `200ms` at drag end or cancel.

## Verification

Build a debug Native bundle, then audit every production MTS context:

```sh
DEBUG='rspeedy,rsbuild' rspeedy build
node scripts/audit-main-thread-script.mjs
```

The audit expects five production contexts:

- four Sidebar / Right Panel resize handlers;
- one Model Picker wheel handler.

It rejects function/worklet captures that previously caused runtime failures,
rejects page-global mouse/touch resize bindings, and requires local resize
events plus the native `hit-slop` handle contract.
The source inventory test also fails when a new MTS binding is added without
updating the audited surface list:

```sh
vp test run scripts/audit-main-thread-script.test.mjs
```

Run the isolated Native contract probe:

```sh
node scripts/verify-mts-runtime-contract.mjs
```

This starts one owned Lynxtron process, invokes seven background-to-main
contracts through `runOnMainThread`, checks the main-thread result values and
console, then stops only that process. It covers the four platform APIs above,
a nested MTS helper, and a shared imported resize helper.

## Product acceptance

The final isolated product run used one owned PID and the staged production
bundle. The actual registered handlers produced these postconditions:

| Surface               | Before  | Wider   | Narrower |
| --------------------- | ------- | ------- | -------- |
| Sidebar physical drag | `256px` | `320px` | `256px`  |
| Right Panel drag      | `640px` | `720px` | `640px`  |

Each physical drag direction used 120 native mouse-move samples. The resize
handle reported `hit-slop="2000px"` after press and restored
`hit-slop="0px"` after release. The same run retained the programmatic MTS
contract checks:

The verifier also samples Native geometry after every 12 pointer moves. Both
Sidebar directions and both Right Panel directions had `0px` maximum absolute
error between the cursor-derived expected width and the measured panel width.

| Surface            | Before                | After                             |
| ------------------ | --------------------- | --------------------------------- |
| Sidebar contract   | gap/container `256px` | gap/container changed together    |
| Right Panel resize | `540px`               | `640px`, semantic attribute `640` |
| Model Picker wheel | no wheel offset       | `data-wheel-offset="120"`         |

The Model Picker test used the real `ChatView`, `Composer`, `ModelPicker`, and
registered wheel handler. A viewport-probe-only provider fixture supplied rows
through the normal `applyServerConfig` projection. Renderer error output was
empty after the successful run. The retained host log also contained no
`ContextProxy::DispatchEvent called too frequently` warning.

The physical resize proof uses DevTool `Input.emulateTouchFromMouseEvent` on
the measured Native rail geometry. It does not substitute a background
`runOnMainThread` call for the drag itself. Do not use AppleScript for this
workflow.
