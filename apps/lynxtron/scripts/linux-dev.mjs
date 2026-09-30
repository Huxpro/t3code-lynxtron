// Linux development host for the Lynxtron client.
//
// Linux Lynxtron only renders windowless, so this script launches the built
// app headlessly with a viewer page that shows its frames and forwards input.
//
// Lynxtron builds whose LynxWindow has `sendInputEvent` serve the viewer
// themselves (src/main/desktop/linuxViewerHost.ts). For stock builds this
// script serves it instead:
//
//   frames  the LynxView renders into Clay shared-memory backings; the viewer
//           reads them through /proc/<pid>/fd (no copy inside Lynxtron)
//   input   Lynx DevTool Input.emulateTouchFromMouseEvent / Input.insertText,
//           the same input path the visual-capture workflow uses
//
// Usage: node scripts/linux-dev.mjs [--port 7801] [--host 127.0.0.1]
//                                   [--scale 1] [--lynxtron <binary>]
//                                   [--no-launch --pid <pid>]

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeZlib from "node:zlib";

import { Connector } from "@lynx-js/devtool-connector";
import { DaemonTransport, DesktopTransport } from "@lynx-js/devtool-connector/transport";

const appRoot = NodePath.resolve(import.meta.dirname, "..");

function readArgument(name, fallback) {
  const index = NodeProcess.argv.indexOf(name);
  return index >= 0 ? NodeProcess.argv[index + 1] : fallback;
}

const port = Number(readArgument("--port", "7801"));
const host = readArgument("--host", "127.0.0.1");
const scale = Number(
  readArgument("--scale", NodeProcess.env.T3_LYNXTRON_DEVICE_SCALE_FACTOR ?? "1"),
);
const launch = !NodeProcess.argv.includes("--no-launch");
const viewport = {
  width: Number(NodeProcess.env.T3_LYNXTRON_VIEWPORT_WIDTH ?? 1180),
  height: Number(NodeProcess.env.T3_LYNXTRON_VIEWPORT_HEIGHT ?? 748),
};

if (NodeProcess.platform !== "linux") {
  throw new Error("linux-dev.mjs reads Clay shared memory through /proc and only runs on Linux.");
}

// --- Lynxtron process -------------------------------------------------------

let appPid = Number(readArgument("--pid", "0"));
let appChild;

// Resolves once the app says whether it serves the viewer in-process. Its
// viewer line precedes the connector's startup line.
function launchApp() {
  const binary =
    readArgument("--lynxtron", NodeProcess.env.LYNXTRON_BIN) ??
    NodePath.join(
      NodeFS.realpathSync(NodePath.join(appRoot, "node_modules/@lynx-js/lynxtron")),
      "dist/lynxtron",
    );
  appChild = NodeChildProcess.spawn(binary, ["./dist/desktop"], {
    cwd: appRoot,
    // Own process group so shutdown also reaches the connector's server child.
    detached: true,
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...NodeProcess.env,
      // No display server is needed: Mesa renders through its surfaceless
      // EGL platform (llvmpipe when there is no GPU).
      EGL_PLATFORM: NodeProcess.env.EGL_PLATFORM ?? "surfaceless",
      T3_LYNXTRON_DEVTOOL: "1",
      T3_LYNXTRON_DEVICE_SCALE_FACTOR: String(scale),
      T3_LYNXTRON_VIEWER_PORT: String(port),
      T3_LYNXTRON_VIEWER_HOST: host,
      // shell.openExternal / openPath reach the viewer instead of xdg-open.
      LYNXTRON_OPEN_COMMAND: NodePath.join(import.meta.dirname, "linux-open.mjs"),
      PATH: `${NodePath.dirname(NodeProcess.execPath)}:${NodeProcess.env.PATH ?? ""}`,
    },
  });
  appPid = appChild.pid;
  appChild.on("exit", (code, signal) => {
    console.log(`[linux-dev] lynxtron exited (${signal ?? code})`);
    NodeProcess.exit(code ?? 0);
  });
  return new Promise((resolve) => {
    let pending = "";
    appChild.stdout.on("data", (chunk) => {
      NodeProcess.stdout.write(chunk);
      pending += chunk;
      if (pending.includes("[linux-viewer] serving")) resolve("native");
      else if (pending.includes("[main-connector]")) resolve("devtool");
      pending = pending.slice(-256);
    });
  });
}

function shutdown() {
  if (appChild && appChild.exitCode === null) {
    try {
      NodeProcess.kill(-appChild.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  NodeProcess.exit(0);
}
NodeProcess.default.on("SIGINT", shutdown);
NodeProcess.default.on("SIGTERM", shutdown);

// --- Frames -----------------------------------------------------------------

// Clay double-buffers each LynxView through two RGBA shared-memory images
// (GL row order, bottom-up) and repaints a buffer fully for every frame. A
// buffer is published once it changed and then stayed stable for one poll,
// which avoids showing a half-written frame. A frame can repeat the pixels its
// buffer held two frames earlier (a toggle opening and closing), so after
// publishing, the viewer flips one sentinel byte in the buffer: the next
// repaint always restores it and is seen as a change.
class ShmFrameSource {
  #buffers = new Map();
  #waiters = new Set();
  frame = null;
  seq = 0;

  poll() {
    let entries;
    try {
      entries = NodeFS.readdirSync(`/proc/${appPid}/fd`);
    } catch {
      return;
    }
    const seen = new Set();
    for (const entry of entries) {
      let target;
      try {
        target = NodeFS.readlinkSync(`/proc/${appPid}/fd/${entry}`);
      } catch {
        continue;
      }
      if (!target.includes("clay_shared_image_backing")) continue;
      seen.add(target);
      let state = this.#buffers.get(target);
      if (!state) {
        try {
          const fd = NodeFS.openSync(`/proc/${appPid}/fd/${entry}`, "r+");
          const size = NodeFS.fstatSync(fd).size;
          const height = viewport.height * scale;
          const width = size / 4 / height;
          if (!Number.isInteger(width)) {
            NodeFS.closeSync(fd);
            continue;
          }
          state = {
            fd,
            width,
            height,
            data: Buffer.alloc(size),
            last: Buffer.alloc(size),
            dirty: false,
          };
          this.#buffers.set(target, state);
        } catch {
          continue;
        }
      }
      NodeFS.readSync(state.fd, state.data, 0, state.data.length, 0);
      if (!state.data.equals(state.last)) {
        state.data.copy(state.last);
        state.dirty = true;
      } else if (state.dirty) {
        state.dirty = false;
        this.#publish(state);
      }
    }
    for (const [target, state] of this.#buffers) {
      if (!seen.has(target)) {
        NodeFS.closeSync(state.fd);
        this.#buffers.delete(target);
      }
    }
  }

  #publish(state) {
    this.seq += 1;
    this.frame = {
      seq: this.seq,
      width: state.width,
      height: state.height,
      body: NodeZlib.deflateRawSync(state.last, { level: 1 }),
    };
    const sentinel = state.last.length - 1;
    state.last[sentinel] ^= 0x01;
    NodeFS.writeSync(state.fd, state.last, sentinel, 1, sentinel);
    for (const wake of this.#waiters) wake();
    this.#waiters.clear();
  }

  async next(after, timeoutMs) {
    if (this.frame && this.frame.seq > after) return this.frame;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.#waiters.add(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    return this.frame && this.frame.seq > after ? this.frame : null;
  }
}

// --- Input ------------------------------------------------------------------

const MAX_WHEEL_DRAG = 240;
const WHEEL_DRAG_STEPS = 6;

class DevToolInput {
  // The DebugRouter port serves one connection at a time; the connector
  // daemon multiplexes it so DevTool tooling keeps working beside the viewer.
  #connector = new Connector([new DaemonTransport(), new DesktopTransport()]);
  #controller = null;
  #connecting = null;

  async #connect() {
    const [client] = await this.#connector.listClients();
    if (!client) throw new Error("Lynxtron DevTool client is not up yet");
    const [session] = await this.#connector.sendListSessionMessage(client.id);
    if (!session) throw new Error("LynxView DevTool session is not up yet");
    let controller;
    const input = new ReadableStream({
      start(value) {
        controller = value;
      },
    });
    const output = await this.#connector.sendCDPStream(client.id, session.session_id, input);
    (async () => {
      try {
        for await (const message of output) {
          if (message?.error)
            console.log(`[linux-dev] input error: ${JSON.stringify(message.error)}`);
        }
      } catch {
        /* reconnect on next event */
      }
      this.#controller = null;
    })();
    this.#controller = controller;
  }

  async send(method, params) {
    if (!this.#controller) {
      this.#connecting ??= this.#connect().finally(() => {
        this.#connecting = null;
      });
      await this.#connecting;
    }
    this.#controller.enqueue({ method, params });
  }

  // Touch-shaped DevTool input has no wheel in current Linux builds, so a
  // wheel turn becomes a short drag that holds still before release (no
  // fling) and travels past the tap slop (no tap).
  async #scroll({ x, y, deltaX, deltaY }) {
    const clamp = (value) => Math.max(-MAX_WHEEL_DRAG, Math.min(MAX_WHEEL_DRAG, value));
    const dx = -clamp(deltaX);
    const dy = -clamp(deltaY);
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    const touch = (type, px, py) =>
      this.send("Input.emulateTouchFromMouseEvent", {
        type,
        x: Math.round(px),
        y: Math.round(py),
        button: "left",
        clickCount: 1,
        timestamp: Date.now(),
      });
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await touch("mousePressed", x, y);
    for (let step = 1; step <= WHEEL_DRAG_STEPS; step += 1) {
      await wait(16);
      await touch(
        "mouseMoved",
        x + (dx * step) / WHEEL_DRAG_STEPS,
        y + (dy * step) / WHEEL_DRAG_STEPS,
      );
    }
    await wait(80);
    await touch("mouseReleased", x + dx, y + dy);
  }

  dispatch(event) {
    switch (event.kind) {
      case "pointer":
        return this.send("Input.emulateTouchFromMouseEvent", {
          type: event.type,
          x: Math.round(event.x),
          y: Math.round(event.y),
          button: "left",
          clickCount: 1,
          timestamp: Date.now(),
        });
      case "wheel":
        return this.#scroll(event);
      case "text":
        return this.send("Input.insertText", { text: event.text });
      default:
        return undefined;
    }
  }
}

// --- Server -----------------------------------------------------------------

const backend = launch ? await launchApp() : "devtool";
if (!appPid) throw new Error("--no-launch needs --pid <lynxtron pid>");
if (backend === "native") {
  console.log(`[linux-dev] lynxtron pid ${appPid} serves the viewer in-process`);
} else {
  serveDevToolViewer();
}

function serveDevToolViewer() {
  const frames = new ShmFrameSource();
  setInterval(() => frames.poll(), 40);
  const input = new DevToolInput();
  const viewerHtml = NodeFS.readFileSync(NodePath.join(import.meta.dirname, "linux-viewer.html"));

  const server = NodeHttp.createServer(async (request, response) => {
    const url = new URL(request.url, "http://viewer");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(viewerHtml);
      return;
    }
    if (url.pathname === "/frame") {
      const frame = await frames.next(Number(url.searchParams.get("after") ?? 0), 10_000);
      if (!frame) {
        response.writeHead(204).end();
        return;
      }
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "x-seq": String(frame.seq),
        "x-width": String(frame.width),
        "x-height": String(frame.height),
        "x-scale": String(scale),
        "cache-control": "no-store",
      });
      response.end(frame.body);
      return;
    }
    if (url.pathname === "/input" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      try {
        for (const event of JSON.parse(body)) {
          await input.dispatch(event);
          // Give Lynx a frame to settle each synthetic key press.
          if (event.kind === "text") await new Promise((resolve) => setTimeout(resolve, 20));
        }
        response.writeHead(204).end();
      } catch (error) {
        response
          .writeHead(503, { "content-type": "text/plain" })
          .end(String(error?.message ?? error));
      }
      return;
    }
    response.writeHead(404).end();
  });

  server.listen(port, host, () => {
    console.log(`[linux-dev] lynxtron pid ${appPid}; viewer at http://${host}:${port}/`);
  });
}
