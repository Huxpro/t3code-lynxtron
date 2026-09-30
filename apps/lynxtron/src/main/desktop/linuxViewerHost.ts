// In-process Linux viewer for Lynxtron builds whose windowless LynxWindow
// emits `paint` frames and accepts `sendInputEvent` (see
// docs/linux-development.md). It serves the same page as scripts/linux-dev.mjs
// but reads frames and delivers input through the window itself, so keys,
// hover, wheel, cursor shapes, and the clipboard work too.

import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeZlib from "node:zlib";

export interface LinuxViewerFrame {
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
  readonly data: Buffer;
}

export type LinuxViewerInputEvent =
  | {
      readonly type: "mouseDown" | "mouseUp" | "mouseMove" | "mouseLeave";
      readonly x: number;
      readonly y: number;
      readonly button?: "left" | "middle" | "right";
    }
  | {
      readonly type: "mouseWheel";
      readonly x: number;
      readonly y: number;
      readonly deltaX: number;
      readonly deltaY: number;
    }
  | {
      readonly type: "keyDown" | "keyUp";
      readonly key: string;
      readonly code: string;
      readonly text?: string;
      readonly repeat?: boolean;
      readonly ctrlKey?: boolean;
      readonly metaKey?: boolean;
      readonly altKey?: boolean;
      readonly shiftKey?: boolean;
    };

export type LinuxViewerKeyEvent = Extract<LinuxViewerInputEvent, { readonly key: string }>;

export interface LinuxViewerWindow {
  on(event: "paint", listener: (event: unknown, frame: LinuxViewerFrame) => void): unknown;
  on(event: "cursor-changed", listener: (event: unknown, cursor: string) => void): unknown;
  sendInputEvent(event: LinuxViewerInputEvent): boolean;
  setContentSize(width: number, height: number): void;
}

export interface LinuxViewerClipboard {
  readText(): string;
  writeText(text: string): void;
}

// Viewer requests: native input events plus a clipboard write that precedes
// a forwarded paste shortcut.
export type LinuxViewerRequest =
  | { readonly kind: "native"; readonly event: LinuxViewerInputEvent }
  | { readonly kind: "clipboard"; readonly text: string }
  | { readonly kind: "resize"; readonly width: number; readonly height: number };

export function supportsInProcessViewer(window: object): window is LinuxViewerWindow {
  return typeof (window as Partial<LinuxViewerWindow>).sendInputEvent === "function";
}

export function resolveViewerPort(
  env: Readonly<Record<string, string | undefined>>,
): number | null {
  const port = Number(env.T3_LYNXTRON_VIEWER_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

const MIN_VIEWPORT_EDGE = 320;

interface EncodedFrame {
  readonly seq: number;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
  readonly body: Buffer;
}

export function startLinuxViewerHost(options: {
  readonly window: LinuxViewerWindow;
  readonly clipboard: LinuxViewerClipboard;
  readonly port: number;
  readonly host: string;
  readonly viewerHtmlPath: string;
  // Returns true when the host consumed a key press (an app accelerator).
  readonly onKeyDown: (event: LinuxViewerKeyEvent) => boolean;
  readonly onLog: (line: string) => void;
}): { close(): void } {
  const { window, clipboard } = options;
  const consumedKeys = new Set<string>();
  const deliver = (event: LinuxViewerInputEvent) => {
    if (event.type === "keyDown" && options.onKeyDown(event)) {
      consumedKeys.add(event.code);
      return;
    }
    if (event.type === "keyUp" && consumedKeys.delete(event.code)) return;
    window.sendInputEvent(event);
  };
  let latest: { frame: LinuxViewerFrame; seq: number } | null = null;
  let encoded: EncodedFrame | null = null;
  const frameWaiters = new Set<() => void>();
  const eventStreams = new Set<NodeHttp.ServerResponse>();
  let cursor = "default";
  let clipboardText = clipboard.readText();

  const broadcast = (name: string, data: string) => {
    for (const stream of eventStreams) {
      stream.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  window.on("paint", (_event, frame) => {
    latest = { frame, seq: (latest?.seq ?? 0) + 1 };
    for (const wake of frameWaiters) wake();
    frameWaiters.clear();
  });
  window.on("cursor-changed", (_event, next) => {
    cursor = next;
    broadcast("cursor", next);
  });
  // The Lynx clipboard has no change notification; poll it for the viewer.
  const clipboardTimer = setInterval(() => {
    const text = clipboard.readText();
    if (text !== clipboardText) {
      clipboardText = text;
      broadcast("clipboard", text);
    }
  }, 500);

  const encode = (): EncodedFrame | null => {
    if (!latest) return null;
    if (encoded?.seq !== latest.seq) {
      const { frame, seq } = latest;
      encoded = {
        seq,
        width: frame.width,
        height: frame.height,
        scaleFactor: frame.scaleFactor,
        body: NodeZlib.deflateRawSync(frame.data, { level: 1 }),
      };
    }
    return encoded;
  };

  const nextFrame = async (after: number): Promise<EncodedFrame | null> => {
    if (!latest || latest.seq <= after) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 10_000);
        frameWaiters.add(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    return latest && latest.seq > after ? encode() : null;
  };

  const server = NodeHttp.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://viewer");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(NodeFS.readFileSync(options.viewerHtmlPath));
      return;
    }
    if (url.pathname === "/frame") {
      const frame = await nextFrame(Number(url.searchParams.get("after") ?? 0));
      if (!frame) {
        response.writeHead(204).end();
        return;
      }
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
        "x-seq": String(frame.seq),
        "x-width": String(frame.width),
        "x-height": String(frame.height),
        "x-scale": String(frame.scaleFactor),
        "x-row-order": "top-down",
        "x-input": "native",
      });
      response.end(frame.body);
      return;
    }
    if (url.pathname === "/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      });
      response.write(`event: cursor\ndata: ${JSON.stringify(cursor)}\n\n`);
      eventStreams.add(response);
      request.on("close", () => eventStreams.delete(response));
      return;
    }
    // scripts/linux-open.mjs forwards shell.openExternal / shell.openPath.
    if (url.pathname === "/open" && request.method === "POST") {
      let target = "";
      for await (const chunk of request) target += chunk;
      broadcast("open", target);
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/input" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      for (const item of JSON.parse(body) as LinuxViewerRequest[]) {
        if (item.kind === "clipboard") {
          clipboard.writeText(item.text);
          clipboardText = item.text;
        } else if (item.kind === "native") {
          deliver(item.event);
        } else if (item.kind === "resize") {
          const width = Math.round(item.width);
          const height = Math.round(item.height);
          if (width >= MIN_VIEWPORT_EDGE && height >= MIN_VIEWPORT_EDGE) {
            window.setContentSize(width, height);
          }
        }
      }
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404).end();
  });
  // scripts/linux-dev.mjs reads this line to leave the viewer to this host,
  // so it must print before the connector starts.
  options.onLog(`[linux-viewer] serving http://${options.host}:${options.port}/ in-process`);
  server.on("error", (error) => options.onLog(`[linux-viewer] ${error.message}`));
  server.listen(options.port, options.host);

  return {
    close() {
      clearInterval(clipboardTimer);
      for (const stream of eventStreams) stream.end();
      server.close();
    },
  };
}
