import { app, LynxWindow, Menu, lynxBridge } from "@lynx-js/lynxtron";
import path from "path";

import {
  DISCRETE_KEYBOARD_ACCELERATORS,
  T3_KEYBOARD_EVENT,
  createDiscreteKeyboardPacket,
  type DiscreteKeyboardAccelerator,
} from "./keyboardMenu.ts";
import { MainConnectorHost } from "./mainConnectorHost.ts";
import { resolveLynxtronViewport } from "./windowViewport.ts";

// Note: `app` and `LynxWindow` are present on the ESM surface (verified via the
// counter showcase). Only extended APIs (Notification, BaseWindow,
// utilityProcess) require the CJS `require('lynxtron')` path per port field
// notes; the backend-wiring slice uses __non_webpack_require__ for Node deps.

// __non_webpack_require__ bypasses rspack's compile-time require.resolve so the
// prebuilt connector bundle is loaded at runtime from dist/desktop.
declare const __non_webpack_require__: (id: string) => any;

const LYNX_BUNDLE_PATH = process.env.T3_LYNXTRON_BUNDLE_PATH
  ? path.resolve(process.env.T3_LYNXTRON_BUNDLE_PATH)
  : path.join(__dirname, "main.lynx.bundle");

interface ResizableWindow {
  getContentSize(): number[];
  setContentSize(width: number, height: number): void;
}

interface GlobalEventWindow extends ResizableWindow {
  sendGlobalEvent(eventName: string, ...args: unknown[]): boolean;
  on(event: "closed", listener: () => void): unknown;
}

function installDiscreteKeyboardMenu(win: GlobalEventWindow): void {
  let sequence = 0;
  const dispatch = (accelerator: DiscreteKeyboardAccelerator) => {
    sequence += 1;
    const delivered = win.sendGlobalEvent(
      T3_KEYBOARD_EVENT,
      createDiscreteKeyboardPacket({ accelerator, platform: process.platform, sequence }),
    );
    if (!delivered) {
      console.warn(`[keyboard] ${accelerator.id} was not delivered to the renderer`);
    }
  };
  const itemsFor = (menu: DiscreteKeyboardAccelerator["menu"]) =>
    DISCRETE_KEYBOARD_ACCELERATORS.filter((item) => item.menu === menu).map((item) => ({
      id: `t3-${item.id}`,
      label: item.label,
      accelerator: item.accelerator,
      click: () => dispatch(item),
    }));

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
        submenu: itemsFor("view"),
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
 * AR1 spike: main-owned connector behind T3_LYNXTRON_MAIN_CONNECTOR=1. Main
 * instantiates the prebuilt connector bundle, registers the typed lynxBridge
 * handlers, and pushes sequenced events with sendGlobalEvent. The preload
 * polling path remains the default when the flag is off; the renderer probes
 * the typed path once and falls back to polling when it does not answer.
 */
function startMainConnectorHost(win: GlobalEventWindow): MainConnectorHost | null {
  if (process.env.T3_LYNXTRON_MAIN_CONNECTOR !== "1") return null;
  const connectorPath = path.join(__dirname, "connector.bundle.cjs");
  const { T3Connector } = __non_webpack_require__(connectorPath);
  const host = new MainConnectorHost({
    window: win,
    registerHandler: (method, handler) => {
      lynxBridge.handle(method, (_event, params) => handler(params));
    },
    removeHandler: (method) => lynxBridge.removeHandler(method),
    createConnector: (events) => new T3Connector(events),
    onLog: (line) => console.log(line),
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
  console.log("[main-connector] main-owned connector host started (T3_LYNXTRON_MAIN_CONNECTOR=1)");
  return host;
}

app.whenReady().then(() => {
  const viewport = resolveLynxtronViewport();
  const win = new LynxWindow({
    width: viewport.width,
    height: viewport.height,
    useContentSize: true,
    title: "T3 Code",
    lynxPreference: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.show();
  win.loadFile(LYNX_BUNDLE_PATH);
  nudgeFramedWindowViewport(win);
  installDiscreteKeyboardMenu(win);
  startMainConnectorHost(win);

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
