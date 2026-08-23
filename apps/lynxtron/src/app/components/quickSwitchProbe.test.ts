import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const source = readFileSync(path.resolve(import.meta.dirname, "QuickSwitch.tsx"), "utf8");

describe("Quick Switch visual-state probe", () => {
  it("is available only in isolated viewport-test runs", () => {
    expect(source).toContain("if (!viewport.testResize) return;");
    expect(source).toContain("__T3_LYNXTRON_QUICK_SWITCH_QUERY__");
    expect(source).toContain("__T3_LYNXTRON_QUICK_SWITCH_STATE__");
    expect(source).toContain("actionLabels: filteredActions.map");
    expect(source).toContain("threadLabels: filteredThreads.map");
    expect(source).toContain("delete target.__T3_LYNXTRON_QUICK_SWITCH_QUERY__");
    expect(source).toContain("delete target.__T3_LYNXTRON_QUICK_SWITCH_STATE__");
  });
});
