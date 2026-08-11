# Matched Electron and Lynx capture

> **Plan 11C authority notice (2026-08-04).** The commands below remain useful
> historical runbooks, but no frame is retained by path convention alone.
> Plan 11C strict manifests and verifier results decide evidence status. Read
> [`harness/current-state.md`](./harness/current-state.md) and
> [`plans/11c-synara-harness-reset-and-gap-prioritization.md`](./plans/11c-synara-harness-reset-and-gap-prioritization.md)
> before collecting new evidence.

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
  --output /tmp/t3code-f3-state \
  --workspace "$PWD" \
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
pnpm --dir apps/lynxtron run launch
```

Keep the launch terminal and record the owned Lynxtron PID and server-ready
output. Resolve the DevTool port from that PID with `lsof`; do not select a
client by list order or app name alone. Then capture through Lynx DevTool with
both identities:

```sh
pnpm --dir apps/lynxtron capture:lynx -- \
  --process-id OWNED_LYNXTRON_PID \
  --client localhost:OWNED_DEVTOOL_PORT \
  --client-name @t3tools/lynxtron \
  --route new-thread \
  --theme dark \
  --snapshot SNAPSHOT_ID \
  --output /tmp/t3code-f3-captures/1280x820/lynx.jpg
```

Lynx DevTool Desktop currently emits JPEG data, so the output must use a
`.jpg` or `.jpeg` extension. Start a fresh Lynxtron process for each capture;
the desktop client exposes one reliable screencast frame per process. Stop the
process after capture. The capture metadata records the PID-derived client,
session bundle URL, renderer transport kind and sequence, image dimensions,
and zero-error console result. A name-only ambiguous client selection fails.

Run `visual:metrics` against the two measurement sidecars and `visual:diff`
against the images. The diff and side-by-side images are diagnostic only. The
acceptance gates are corresponding anchor deltas of at most 8 logical pixels,
font-size deltas of at most 2 pixels, exact required content, and reviewed
color/mask evidence.

## Verify packaged semantic readiness

Reuse the populated OC0 fixture for bounded cold-start checks. The verifier
copies it into a fresh temporary base directory for every run, launches the
packaged application as a directly owned child, and selects the DevTool
client by that PID's listening port. It never stops or reads readiness from a
same-named process it did not start.

```sh
pnpm --dir apps/lynxtron run verify:packaged-readiness -- \
  --fixture-dir /tmp/t3code-oc0.7qrI9Z \
  --project-cwd "$PWD" \
  --output "$PWD/apps/lynxtron/evidence/2026-08-01/OC1/readiness/report.json" \
  --runs 3 \
  --width 1280 \
  --height 820
```

Success is semantic, not elapsed-time based. Each run waits for the real
server-ready log, requires `kind === "main"`, and sends the fixture's current
model selection back through the renderer-to-main command bridge without a
thread id. That same-value command changes no persisted thread state, while
the connector's resulting log event must advance the main-to-renderer
sequence. The known fixture thread title and a non-empty model label must then
be present in the current DOM, and the exact renderer session must have zero
console errors. A deadline can fail any wait; no fixed delay makes it pass.

The report records the executable, bundle hash, isolated state, PID, server
port, DevTool client/session, before/after sequence, canonical UI text, and
cleanup disposition. Per-run process logs are written beside the report.

For the semantic half of the Plan 11 exit proof, reuse the same arguments with
`verify:plan11-semantics`. It requires exactly three fresh runs. Runs one and
two stop after the readiness contract; run three uses measured semantic taps to
check Sidebar Search/thread selection/scope behavior, Settings retention and
Back, both Composer route states plus model/option/mode activation, visible Dev
branding, and lifecycle fault/recovery. The five checks are recorded
independently so one failure is not inferred from another:

Each interactive check has a bounded cleanup that uses the real outside-tap
or Settings Back affordance. The cleanup result is stored beside the outcome;
if cleanup fails, that outcome fails instead of leaving an overlay to create a
false failure in the next check.

Do not use the generated OC0 empty-thread fixture for this command. OC7 needs
an isolated snapshot whose selected thread contains a real transcript, plus the
same `visual-state.json` and `lynxtron-prefs.json` metadata used by readiness.
Create that snapshot by copying real state into the isolated fixture with the
read-only `VACUUM INTO` procedure in the root `AGENTS.md`; never point Lynxtron
at live `~/.t3/userdata`. The verifier first requires the existing-thread
Composer overlay with no hero, then creates a new thread and requires the
inverse state. One empty-thread view therefore cannot satisfy both checks.

```sh
pnpm --dir apps/lynxtron run verify:plan11-semantics -- \
  --fixture-dir /tmp/t3code-plan11-real.<id> \
  --project-cwd "$PWD" \
  --output "$PWD/apps/lynxtron/evidence/2026-08-01/OC7/semantic/report.json" \
  --runs 3 \
  --width 1280 \
  --height 820
```

This report deliberately sets `certification.complete` to `false`: it proves
the cold-start and interaction semantics, but OC7 still requires matched Web
and Lynx captures at both dark-theme viewports before O1–O5 can be certified.

## Reproduce the OC0 lifecycle-error fixture

This probe freezes the pre-OC3 failure without changing the production entry.
It renders the real chat product tree with `status: "error"` and a unique
detail string. Build it into a fresh temporary directory:

```sh
PROBE_OUTPUT="$(mktemp -d /tmp/t3code-oc0-lifecycle.XXXXXX)"
T3_LYNXTRON_PROBE_ENTRY="$PWD/apps/lynxtron/src/app/probes/lifecycle-error-runtime.tsx" \
T3_LYNXTRON_PROBE_OUTPUT="$PROBE_OUTPUT" \
pnpm --dir apps/lynxtron exec rspeedy build
```

Launch a fresh owned Lynxtron process with the normal isolated state and
explicit viewport, plus
`T3_LYNXTRON_BUNDLE_PATH="$PROBE_OUTPUT/main.lynx.bundle"`. Capture it with the
PID-derived client as above, adding:

```sh
--expected-bundle "$PROBE_OUTPUT/main.lynx.bundle" \
--measurement-spec scripts/visual-measurement-spec.lifecycle-error.json
```

Then assert the frozen failure signature:

```sh
pnpm --dir apps/lynxtron run visual:assert-lifecycle-error -- \
  "$PROBE_OUTPUT/lifecycle-error.lynx-measurements.json"
```

Passing here means the baseline failure was reproduced: the supplied error
detail is absent and the disabled Composer says only `Connecting to T3 Code…`.
It is not a product pass. The probe intentionally prevents connector bootstrap,
so its null transport diagnostic cannot be used as packaged-readiness evidence.

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
pnpm --dir apps/lynxtron run launch
```

Prepare the shared default or changed snapshot and navigate with Lynx DevTool:

```sh
DEVTOOL="$HOME/.agents/skills/devtool/scripts/index.mjs"
node "$DEVTOOL" cdp --client localhost:OWNED_DEVTOOL_PORT --session 1 \
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
  --process-id OWNED_LYNXTRON_PID \
  --client localhost:OWNED_DEVTOOL_PORT \
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
