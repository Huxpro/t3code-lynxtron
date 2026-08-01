# OC0 Web/Electron reference

- Product HEAD: `73a4ba4bf7de4145117c1fedf9477040de572a95`
- Owned Electron PID: `85010`
- Isolated state: `/tmp/t3code-oc0-electron.UDl8f2`
- Snapshot: `572115522f3dddcb5de14e6cf8c761d0511741138ad66dd28df71eb2dd9189b4`
- Product renderer: `T3 Code (Alpha)` at `t3code://app/`
- Backend: owned child on `127.0.0.1:3773`
- CDP: `127.0.0.1:9347`
- Viewport: 1280 × 820 logical, DPR 2, 2560 × 1640 exported PNG
- Theme: dark

The copied real-state fixture initially rendered Sidebar V1 because its client
preference predated the current Sidebar V2 opt-in. Computer Use opened
Settings through the real `Command+,` accelerator, navigated to Beta, enabled
Sidebar V2, and used Back to return to the draft. The retained `new-thread`
capture is therefore the current Sidebar V2 and Composer product reference;
the earlier V1 diagnostic was overwritten and is not evidence.

For the project-scope outcome, Computer Use opened the real project filter and
Escape closed it. A no-focus CDP query measured the trigger, popup, thread
list, first row, and Sidebar before and after the interaction. The popup shares
the trigger's x-coordinate and width, stays inside the 255 px measured rail,
and leaves both list anchors unchanged. `project-scope-open/geometry.json`
contains the exact assertions. Its 1199 × 768 Computer Use JPEG records the
visible real-input result only; it is not an exact-viewport certification
frame.

The generic Electron capture reports zero unexpected renderer errors. The
unpersisted draft lookup 404s are classified by the existing harness as
expected only for the exact `new-thread` draft route and remain listed in the
capture metadata.

An exact popup screenshot was time-boxed: the existing Electron capture
script's `Page.bringToFront` closes the transient menu before capture. The
failed attempts wrote no retained screenshot or measurement file. This is a
harness limitation, not a product result; the real-input frame plus exact CDP
postcondition are the retained OC0 evidence.

OC0 freezes historical Native failures against the current Web/Electron
product reference. It does not claim same-snapshot Native certification; OC7
owns the final matched two-viewport proof after the product fixes.
