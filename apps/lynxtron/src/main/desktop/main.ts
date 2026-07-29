import { app, LynxWindow, Menu } from "@lynx-js/lynxtron";
import path from "path";

import {
  DISCRETE_KEYBOARD_ACCELERATORS,
  T3_KEYBOARD_EVENT,
  createDiscreteKeyboardPacket,
  type DiscreteKeyboardAccelerator,
} from "./keyboardMenu.ts";
import { resolveLynxtronViewport } from "./windowViewport.ts";

// Note: `app` and `LynxWindow` are present on the ESM surface (verified via the
// counter showcase). Only extended APIs (Notification, BaseWindow,
// utilityProcess) require the CJS `require('lynxtron')` path per port field
// notes; the backend-wiring slice uses __non_webpack_require__ for Node deps.

const LYNX_BUNDLE_PATH = process.env.T3_LYNXTRON_BUNDLE_PATH
  ? path.resolve(process.env.T3_LYNXTRON_BUNDLE_PATH)
  : path.join(__dirname, "main.lynx.bundle");

interface ResizableWindow {
  getContentSize(): number[];
  setContentSize(width: number, height: number): void;
}

interface GlobalEventWindow extends ResizableWindow {
  sendGlobalEvent(eventName: string, ...args: unknown[]): boolean;
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
