import { app, clipboard, dialog, LynxWindow, Menu, lynxBridge } from "@lynx-js/lynxtron";
import cefWebview from "@lynx-js/cef-webview/lynxtron";
import path from "path";

import {
  DISCRETE_KEYBOARD_ACCELERATORS,
  T3_KEYBOARD_EVENT,
  createDiscreteKeyboardPacket,
  type DiscreteKeyboardAccelerator,
} from "./keyboardMenu.ts";
import { MainConnectorHost, settleMainConnectorHandler } from "./mainConnectorHost.ts";
import { resolveLynxtronViewport, resolveLynxtronWindowPosition } from "./windowViewport.ts";
import { startLynxtronViewportHost } from "./viewportHost.ts";
import { startLynxtronThemeHost } from "./themeHost.ts";
import { createSystemThemeSource } from "./systemThemeSource.ts";
import { createReloadMenuItem, reloadApplication } from "./reloadWindow.ts";
import { T3_RELOAD_FOR_TEST_METHOD } from "../../shared/viewportProtocol.ts";
import { startClipboardCapabilityHost, startConfirmCapabilityHost } from "./capabilityHost.ts";
import { startContextMenuCapabilityHost } from "./contextMenuHost.ts";
import { startTerminalKeyboardHost } from "./terminalKeyboardHost.ts";

// Note: `app` and `LynxWindow` are present on the ESM surface (verified via the
// counter showcase). Only extended APIs (Notification, BaseWindow,
// utilityProcess) require the CJS `require('lynxtron')` path per port field
// notes; the backend-wiring slice uses __non_webpack_require__ for Node deps.

// __non_webpack_require__ bypasses rspack's compile-time require.resolve so the
// prebuilt connector bundle is loaded at runtime from dist/desktop.
declare const __non_webpack_require__: (id: string) => any;

const configuredBundle = process.env.T3_LYNXTRON_BUNDLE_PATH?.trim();
const LYNX_BUNDLE_SOURCE =
  configuredBundle?.startsWith("http://") || configuredBundle?.startsWith("https://")
    ? configuredBundle
    : configuredBundle
      ? path.resolve(configuredBundle)
      : path.join(__dirname, "main.lynx.bundle");

interface ResizableWindow {
  getContentSize(): number[];
  setContentSize(width: number, height: number): void;
}

interface GlobalEventWindow extends ResizableWindow {
  loadFile(filePath: string): boolean;
  loadURL(url: string): boolean;
  sendGlobalEvent(eventName: string, ...args: unknown[]): boolean;
  on(event: "closed", listener: () => void): unknown;
}

function installDiscreteKeyboardMenu(win: GlobalEventWindow) {
  let sequence = 0;
  let terminalReturnEnabled = false;
  const dispatch = (accelerator: DiscreteKeyboardAccelerator) => {
    const keyDownDelivered = win.sendGlobalEvent(
      T3_KEYBOARD_EVENT,
      createDiscreteKeyboardPacket({
        accelerator,
        platform: process.platform,
        sequence: ++sequence,
      }),
    );
    const keyUpDelivered = win.sendGlobalEvent(
      T3_KEYBOARD_EVENT,
      createDiscreteKeyboardPacket({
        accelerator,
        platform: process.platform,
        sequence: ++sequence,
        type: "keyup",
      }),
    );
    if (!keyDownDelivered || !keyUpDelivered) {
      console.warn(`[keyboard] ${accelerator.id} was not delivered to the renderer`);
    }
  };
  const itemsFor = (menu: DiscreteKeyboardAccelerator["menu"]) =>
    DISCRETE_KEYBOARD_ACCELERATORS.filter((item) => item.menu === menu).map((item) => ({
      id: `t3-${item.id}`,
      label: item.label,
      accelerator: item.accelerator,
      visible: item.visible,
      acceleratorWorksWhenHidden: item.acceleratorWorksWhenHidden,
      enabled: item.id === "terminal-submit" ? terminalReturnEnabled : item.enabled,
      click: () => dispatch(item),
    }));
  const install = () =>
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "T3 Code",
          submenu: [
            ...itemsFor("app"),
            { type: "separator" },
            { role: process.platform === "darwin" ? "quit" : "close" },
          ],
        },
        {
          label: "File",
          submenu: itemsFor("file"),
        },
        {
          label: "View",
          submenu: [createReloadMenuItem(app), { type: "separator" }, ...itemsFor("view")],
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
      ]),
    );
  install();
  return {
    setTerminalReturnEnabled(enabled: boolean) {
      if (terminalReturnEnabled === enabled) return;
      terminalReturnEnabled = enabled;
      install();
    },
  };
}

// Framed LynxWindows mis-size their LynxView at creation; nudge once after
// load so the page fills the window (per lynxtron-examples window helper).
function nudgeFramedWindowViewport(win: ResizableWindow, delayMs = 600): void {
  setTimeout(() => {
    try {
      const [w = 1180, h = 748] = win.getContentSize();
      win.setContentSize(w + 1, h);
      win.setContentSize(w, h);
    } catch {
      /* window already closed */
    }
  }, delayMs);
}

/**
 * Main-owned connector (authoritative since AR2). Main instantiates the
 * prebuilt connector bundle, registers the typed lynxBridge handlers, and
 * pushes sequenced events with sendGlobalEvent. The renderer bootstraps with
 * one ready-and-snapshot exchange and then consumes pushed events; no
 * renderer-side polling remains.
 */
function startMainConnectorHost(win: GlobalEventWindow): MainConnectorHost {
  const connectorPath = path.join(__dirname, "connector.bundle.cjs");
  const { T3Connector } = __non_webpack_require__(connectorPath);
  const host = new MainConnectorHost({
    window: win,
    registerHandler: (method, handler) => {
      lynxBridge.handle(method, (_event, params) => settleMainConnectorHandler(handler, params));
    },
    removeHandler: (method) => lynxBridge.removeHandler(method),
    createConnector: (events) => new T3Connector(events),
    onLog: (line) => console.log(line),
    testSocketOpenErrorForThreadModelSelectionOnce:
      process.env.T3_TEST_MODEL_SELECTION_SOCKET_OPEN_ERROR_ONCE === "1",
    testSendPromptErrorOnce: process.env.T3_TEST_SEND_PROMPT_ERROR_ONCE === "1",
  });
  host.attach();
  win.on("closed", () => {
    host.dispose();
  });
  // Backstop: quitting the app without a window close must still release the
  // connector-owned server process and port. Dispose is idempotent.
  app.on("will-quit", () => {
    host.dispose();
  });
  process.on("exit", () => {
    host.dispose();
  });
  host.connect().catch((error: unknown) => {
    // The connector already surfaced the failure through its status events;
    // this catch only keeps an unhandled rejection out of main.
    console.log(
      `[main-connector] connect failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  console.log("[main-connector] main-owned connector host started");
  return host;
}

app.whenReady().then(() => {
  if (process.env.T3_LYNXTRON_CEF_WEBVIEW === "1") {
    const cefInitialized = cefWebview.initialize();
    console.log(`[cef-webview] initialize returned ${String(cefInitialized)}`);
  } else {
    console.log("[cef-webview] disabled; set T3_LYNXTRON_CEF_WEBVIEW=1 to enable");
  }
  const viewport = resolveLynxtronViewport();
  const windowPosition = resolveLynxtronWindowPosition();
  const win = new LynxWindow({
    width: viewport.width,
    height: viewport.height,
    ...windowPosition,
    useContentSize: true,
    title: "T3 Code",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 18 },
          disableAutoHideCursor: true,
        }
      : {
          titleBarStyle: "hidden" as const,
          autoHideMenuBar: true,
        }),
    lynxPreference: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.show();
  const viewportHost = startLynxtronViewportHost(
    win,
    {
      handle: (method, handler) => {
        lynxBridge.handle(method, (_event, params) => handler(params));
      },
      removeHandler: (method) => lynxBridge.removeHandler(method),
    },
    {
      allowTestResize: process.env.T3_LYNXTRON_VIEWPORT_PROBE === "1",
    },
  );
  app.on("will-quit", () => {
    viewportHost.dispose();
  });
  const themeHost = startLynxtronThemeHost(
    win,
    {
      handle: (method, handler) => {
        lynxBridge.handle(method, () => handler());
      },
      removeHandler: (method) => lynxBridge.removeHandler(method),
    },
    createSystemThemeSource(),
  );
  app.on("will-quit", () => {
    themeHost.dispose();
  });
  // The renderer probes the typed bridge during its first background-thread
  // bootstrap. Register handlers and start snapshot accumulation before
  // loadFile can execute that probe; events emitted before the renderer
  // listener exists remain represented by MainConnectorHost.syncReply().
  startMainConnectorHost(win);
  const clipboardCapabilityHost = startClipboardCapabilityHost(
    {
      handle: (method, handler) => {
        lynxBridge.handle(method, (_event, params) => handler(params));
      },
      removeHandler: (method) => lynxBridge.removeHandler(method),
    },
    (value) => clipboard.writeText(value),
  );
  win.on("closed", () => {
    clipboardCapabilityHost.dispose();
  });
  const confirmCapabilityHost = startConfirmCapabilityHost(
    {
      handle: (method, handler) => {
        lynxBridge.handle(method, (_event, params) => handler(params));
      },
      removeHandler: (method) => lynxBridge.removeHandler(method),
    },
    async ({ message, detail, confirmLabel }) => {
      const result = await dialog.showMessageBox(win as never, {
        type: "warning",
        title: "T3 Code",
        message,
        ...(detail ? { detail } : {}),
        buttons: [confirmLabel ?? "Confirm", "Cancel"],
        defaultId: 1,
        cancelId: 1,
      });
      return result.response === 0;
    },
  );
  win.on("closed", () => confirmCapabilityHost.dispose());
  const contextMenuCapabilityHost = startContextMenuCapabilityHost(
    {
      handle: (method, handler) => {
        lynxBridge.handle(method, (_event, params) => handler(params));
      },
      removeHandler: (method) => lynxBridge.removeHandler(method),
    },
    win,
    (template) => Menu.buildFromTemplate(template),
  );
  win.on("closed", () => contextMenuCapabilityHost.dispose());
  if (process.env.T3_LYNXTRON_VIEWPORT_PROBE === "1") {
    lynxBridge.handle(T3_RELOAD_FOR_TEST_METHOD, () => reloadApplication(app));
    win.on("closed", () => {
      lynxBridge.removeHandler(T3_RELOAD_FOR_TEST_METHOD);
    });
  }
  const keyboardMenu = installDiscreteKeyboardMenu(win);
  const terminalKeyboardHost = startTerminalKeyboardHost(
    {
      handle: (method, handler) => {
        lynxBridge.handle(method, (_event, params) => handler(params));
      },
      removeHandler: (method) => lynxBridge.removeHandler(method),
    },
    (enabled) => keyboardMenu.setTerminalReturnEnabled(enabled),
  );
  win.on("closed", () => terminalKeyboardHost.dispose());
  console.log(`[main] loading Lynx bundle from ${LYNX_BUNDLE_SOURCE}`);
  if (LYNX_BUNDLE_SOURCE.startsWith("http://") || LYNX_BUNDLE_SOURCE.startsWith("https://")) {
    win.loadURL(LYNX_BUNDLE_SOURCE);
  } else {
    win.loadFile(LYNX_BUNDLE_SOURCE);
  }
  nudgeFramedWindowViewport(win);

  // P3-S1 capability probe (R3/R5): prove at runtime whether the declared
  // LynxWindow.sendGlobalEvent delivers from main to the renderer. Only runs
  // when explicitly requested; the renderer's inert listener logs receipt to
  // the DevTool console. Remove when R3's push channel or R5's keyboard
  // capability supersedes probing.
  if (process.env.T3_LYNXTRON_CAPABILITY_PROBE === "1") {
    // Marker for the preload-side probe: if preload sees this global, main and
    // preload share one JS realm and the connector could reach the window
    // handle directly (candidate R3 polling replacement).
    (globalThis as Record<string, unknown>).__t3CapabilityProbeMainPid = process.pid;
    (globalThis as Record<string, unknown>).__t3CapabilityProbeWindow = win;
    setTimeout(() => {
      try {
        const sender = win as unknown as {
          sendGlobalEvent?: (eventName: string, ...args: unknown[]) => boolean;
        };
        if (typeof sender.sendGlobalEvent !== "function") {
          console.log("[capability-probe] sendGlobalEvent is not a function on LynxWindow");
          return;
        }
        const delivered = sender.sendGlobalEvent("t3-capability-probe", {
          from: "main",
          sentAt: new Date().toISOString(),
        });
        console.log(`[capability-probe] sendGlobalEvent returned ${String(delivered)}`);
      } catch (error) {
        console.log(`[capability-probe] sendGlobalEvent threw: ${String(error)}`);
      }
    }, 4_000);
  }
});
