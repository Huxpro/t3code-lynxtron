import { assert, describe, it } from "vite-plus/test";

import { createReloadMenuItem, reloadApplication } from "./reloadWindow.ts";

describe("reload LynxWindow", () => {
  it("exposes the Electron-compatible View menu item", () => {
    const calls: unknown[] = [];
    const app = {
      relaunch: (options?: { args?: string[] }) => calls.push(["relaunch", options]),
      exit: (code?: number) => calls.push(["exit", code]),
    };
    const item = createReloadMenuItem(app);
    assert.deepInclude(item, {
      id: "t3-reload",
      label: "Reload",
      accelerator: "CommandOrControl+R",
      registerAccelerator: true,
    });
    assert.isTrue(item.click());
    assert.deepEqual(calls, [
      ["relaunch", { args: process.argv.slice(1) }],
      ["exit", 0],
    ]);
  });

  it("relaunches with the original arguments before exiting", () => {
    const calls: unknown[] = [];
    const app = {
      relaunch: (options?: { args?: string[] }) => calls.push(["relaunch", options]),
      exit: (code?: number) => calls.push(["exit", code]),
    };
    assert.isTrue(reloadApplication(app, ["lynxtron", "/tmp/dist", "--flag"]));
    assert.deepEqual(calls, [
      ["relaunch", { args: ["/tmp/dist", "--flag"] }],
      ["exit", 0],
    ]);
  });
});
