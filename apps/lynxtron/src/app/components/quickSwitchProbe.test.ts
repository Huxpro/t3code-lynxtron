import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const source = readFileSync(path.resolve(import.meta.dirname, "QuickSwitch.tsx"), "utf8");

describe("Quick Switch visual-state probe", () => {
  it("focuses the native search input when the palette mounts", () => {
    expect(source).toContain("const searchInputRef = useRef<NodesRef>(null);");
    expect(source).toContain('id="quick-switch-search-input"');
    expect(source).toContain("ref={searchInputRef}");
    expect(source).toMatch(
      /searchInputRef\.current[\s\S]*?\.invoke\(\{[\s\S]*?method: \"focus\"[\s\S]*?\}\)[\s\S]*?\.exec\(\)/,
    );
    expect(source).toContain("[lynx-quick-switch] input focus failed");
  });

  it("is available only in isolated viewport-test runs", () => {
    expect(source).toContain("if (!viewport.testResize) return;");
    expect(source).toContain("__T3_LYNXTRON_QUICK_SWITCH_QUERY__");
    expect(source).toContain("__T3_LYNXTRON_QUICK_SWITCH_STATE__");
    expect(source).toContain("actionLabels: filteredActions.map");
    expect(source).toContain("filePaths: filteredFiles.map");
    expect(source).toContain("filePending: filePicker.pending");
    expect(source).toContain("mode,");
    expect(source).toContain("threadLabels: filteredThreads.map");
    expect(source).toContain("delete target.__T3_LYNXTRON_QUICK_SWITCH_QUERY__");
    expect(source).toContain("delete target.__T3_LYNXTRON_QUICK_SWITCH_STATE__");
  });
});
