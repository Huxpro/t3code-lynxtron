import { app, LynxWindow } from "@lynx-js/lynxtron";
import path from "path";

import { resolveLynxtronViewport } from "./windowViewport.ts";

// Note: `app` and `LynxWindow` are present on the ESM surface (verified via the
// counter showcase). Only extended APIs (Notification, BaseWindow,
// utilityProcess) require the CJS `require('lynxtron')` path per port field
// notes; the backend-wiring slice uses __non_webpack_require__ for Node deps.

const LYNX_BUNDLE_PATH = path.join(__dirname, "main.lynx.bundle");

interface ResizableWindow {
  getContentSize(): number[];
  setContentSize(width: number, height: number): void;
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
});
