# Linux development

Lynxtron publishes Linux x64 builds from `v0.0.28`, but Linux has no native
window: a `LynxWindow` must be created with `windowless: true`, and Lynxtron
discards the rendered frames. `pnpm --dir apps/lynxtron dev:linux` bridges
that gap with a headless host plus a browser viewer.

## Setup

The pinned `@lynx-js/lynxtron@0.0.8` package predates the Linux builds, so
point its postinstall at the Linux DevTool build once:

```sh
npm_config_custom_lynxtron_binary_url=https://github.com/lynx-family/lynxtron/releases/download/v0.0.28/lynxtron-v0.0.28-linux-x64-devtool.zip \
  pnpm install
```

Mesa provides EGL for the headless renderer (llvmpipe when there is no GPU),
and the icon build rasterizes with `rsvg-convert`:

```sh
sudo apt-get install libegl1 libegl-mesa0 libgles2 libgl1-mesa-dri librsvg2-bin
```

## Run

```sh
pnpm --filter t3 build:bundle
pnpm build:lynxtron
T3_LYNXTRON_BASE_DIR="$PWD/.t3/lynxtron" \
T3_LYNXTRON_PROJECT_CWD="$PWD" \
  pnpm --dir apps/lynxtron dev:linux
```

Open the printed viewer URL (default `http://127.0.0.1:7801/`). Options:
`--port`, `--host`, `--scale` (device scale factor, default `1`), and
`--no-launch --pid <pid>` to attach to an already running Lynxtron.

## How it works

- `main.ts` creates the window with `windowless: true` on Linux
  (`windowlessHost.ts`) and enables Lynx DevTool when `T3_LYNXTRON_DEVTOOL=1`.
- `linux-dev.mjs` launches Lynxtron with `EGL_PLATFORM=surfaceless`, so no X
  or Wayland server is needed.
- Frames: Clay double-buffers the LynxView in two RGBA shared-memory images
  and repaints a buffer fully per frame. The viewer reads them through
  `/proc/<pid>/fd`, publishes a buffer once it stops changing, and flips GL
  row order in the page. After publishing, it flips one sentinel byte in that
  buffer so a repaint with identical pixels (a toggle opening and closing)
  still counts as a new frame.
- Input: pointer press, drag and release go through Lynx DevTool
  `Input.emulateTouchFromMouseEvent`; typed and pasted text uses
  `Input.insertText` (Enter inserts a newline). Current Linux builds ignore
  DevTool `mouseWheel`, so a wheel turn becomes a short drag that holds still
  before release. The viewer talks to DevTool through the connector daemon,
  so DevTool tooling can attach at the same time.

## Limits of the stock Linux build

The stock windowless renderer in Lynxtron does not bind platform callbacks, so
these need a Lynxtron change rather than viewer work:

- No key events besides inserted text: Backspace, Escape, arrows, and
  shortcuts do not reach Lynx.
- No hover or cursor shape: DevTool input is touch-shaped.
- `clipboard` reads back empty on Linux, and Lynx text inputs have no
  clipboard.

## Observed on Linux

- Tapping the sidebar Settings row does not navigate, although hit testing
  lands on its `bindtap` node and other taps work.
  `__T3_LYNXTRON_NAVIGATE__("/settings")` does navigate.
- With llvmpipe on 4 cores, a tap repaints in about 0.1–0.4 s; mounting
  Settings takes about 3.4 s and returning to the chat takes about 1.1 s.
