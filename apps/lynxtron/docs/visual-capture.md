# Matched Electron and Lynx capture

Electron/Web is the product-fidelity reference. The standalone
`/Users/bytedance/github/t3code-lynxtron` repository is provenance only and
must not be used as a visual baseline.

Run commands with the workspace Node 24 runtime:

```sh
export PATH="/Applications/DimAgent.app/Contents/Resources/runtime/node/bin:$PWD/node_modules/.bin:$PATH"
```

For each logical viewport, prepare a new isolated state directory:

```sh
pnpm --filter @t3tools/lynxtron visual:prepare -- \
  --output-dir /tmp/t3code-f3-state \
  --project-cwd "$PWD" \
  --electron-window-width 1280 \
  --electron-window-height 820
```

Use the emitted state directory and snapshot ID for both renderers. Capture
Electron from its product renderer CDP target, never its DevTools target.
The capture script asserts the native renderer viewport and omits window
chrome.

Launch Lynxtron with the same state:

```sh
T3_LYNXTRON_BASE_DIR=/tmp/t3code-f3-state \
T3_LYNXTRON_PROJECT_CWD="$PWD" \
T3_LYNXTRON_VIEWPORT_WIDTH=1280 \
T3_LYNXTRON_VIEWPORT_HEIGHT=820 \
T3_LYNXTRON_SERVER_STDIO=ignore \
pnpm --dir apps/lynxtron run launch
```

Then capture through Lynx DevTool:

```sh
pnpm --dir apps/lynxtron capture:lynx -- \
  --client-name @t3tools/lynxtron \
  --route new-thread \
  --theme dark \
  --snapshot SNAPSHOT_ID \
  --output /tmp/t3code-f3-captures/1280x820/lynx.jpg
```

Lynx DevTool Desktop currently emits JPEG data, so the output must use a
`.jpg` or `.jpeg` extension. Start a fresh Lynxtron process for each capture;
the desktop client exposes one reliable screencast frame per process. Stop the
process after capture.

Run `visual:metrics` against the two measurement sidecars and `visual:diff`
against the images. The diff and side-by-side images are diagnostic only. The
acceptance gates are corresponding anchor deltas of at most 8 logical pixels,
font-size deltas of at most 2 pixels, exact required content, and reviewed
color/mask evidence.

## Reproduce the T5-F5 Settings General certification

Use one fresh state directory per viewport. The examples below use 1280 × 820;
repeat them with 1440 × 900.

```sh
STATE="$(mktemp -d /tmp/t3code-settings-general.XXXXXX)"
pnpm --dir apps/lynxtron run visual:prepare -- \
  --output "$STATE" \
  --workspace "$PWD" \
  --electron-window-width 1280 \
  --electron-window-height 820
SNAPSHOT="$(node -p 'require(process.argv[1]).snapshotId' "$STATE/visual-state.json")"
```

Start the product Electron renderer from that state with CDP enabled:

```sh
T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9333 \
pnpm exec vp run dev:desktop --home-dir "$STATE"
```

For each of `default`, `changed`, `restore-confirmation`, and `restored`, run:

```sh
STATE_NAME=default
SPEC=scripts/visual-measurement-spec.settings-general.json
# Use scripts/visual-measurement-spec.settings-general-confirmation.json for
# restore-confirmation.
pnpm --dir apps/lynxtron run capture:web -- \
  --endpoint http://127.0.0.1:9333 \
  --width 1280 \
  --height 820 \
  --device-scale-factor 2 \
  --pathname /settings/general \
  --interaction-state "$STATE_NAME" \
  --theme system \
  --snapshot "$SNAPSHOT" \
  --measurement-spec "$SPEC" \
  --output "evidence/<date>/T5-F5/settings-general/1280x820/$STATE_NAME/electron.png"
```

Stop Electron before starting Lynxtron. Launch a fresh Lynxtron process for
each state with the same state directory and viewport:

```sh
T3_LYNXTRON_BASE_DIR="$STATE" \
T3_LYNXTRON_PROJECT_CWD="$PWD" \
T3_LYNXTRON_VIEWPORT_WIDTH=1280 \
T3_LYNXTRON_VIEWPORT_HEIGHT=820 \
T3_LYNXTRON_SERVER_STDIO=ignore \
pnpm --dir apps/lynxtron run launch
```

Prepare the shared default or changed snapshot and navigate with Lynx DevTool:

```sh
DEVTOOL="$HOME/.agents/skills/lynx-devtool/scripts/index.mjs"
node "$DEVTOOL" cdp --client-name @t3tools/lynxtron \
  -m Runtime.evaluate \
  '{"expression":"globalThis.__T3_LYNXTRON_SETTINGS_TEST_STATE__(\"default\"); globalThis.__T3_LYNXTRON_NAVIGATE__(\"/settings/general\"); \"prepared\"","returnByValue":true}'
```

Use `changed` instead of `default` for the last three states. For
`restore-confirmation`, query `.settings-topbar__restore`, get its logical
center with `DOM.getBoxModel`, and send `mousePressed` plus `mouseReleased`
through `Input.emulateTouchFromMouseEvent`. For `restored`, touch
`.settings-restore-dialog__button--primary` the same way. This is a real Lynx
input path; do not call a component callback directly.

Capture only after the interaction:

```sh
pnpm --dir apps/lynxtron run capture:lynx -- \
  --client-name @t3tools/lynxtron \
  --route settings-general \
  --theme system \
  --snapshot "$SNAPSHOT" \
  --measurement-spec "$SPEC" \
  --output "evidence/<date>/T5-F5/settings-general/1280x820/$STATE_NAME/lynx.jpg"
```

Finally, run `visual:metrics` with the Web and Lynx measurement/capture
sidecars and `visual:diff` with the two images. The checked-in
`2026-07-28/T5-F5/settings-general` evidence demonstrates all eight
viewport/state pairs and records the exact commands and results in each
variant's `notes.md`.
