import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.resolve(import.meta.dirname, "../../web/src/components/SidebarV2.lynx.tsx"),
  "utf8",
);

describe("Sidebar hover state probe", () => {
  it("exposes existing hover state only in viewport-test runs and cleans it up", () => {
    assert.include(source, "if (!viewport.testResize) return");
    assert.include(source, "__T3_LYNXTRON_SIDEBAR_HOVER_STATE__");
    assert.include(source, "() => hoveredThreadId");
    assert.include(source, "delete (");
    assert.include(source, "[hoveredThreadId, viewport.testResize]");
  });
});
