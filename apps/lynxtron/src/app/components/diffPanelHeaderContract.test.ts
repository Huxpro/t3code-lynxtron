import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const source = readFileSync(path.resolve(import.meta.dirname, "DiffPanel.tsx"), "utf8");
const styles = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

describe("diff panel header contract", () => {
  it("renders the aggregate stat as a Lynx-native horizontal row", () => {
    expect(source).not.toContain("import { DiffStatLabel }");
    expect(source.split("<LynxDiffStatLabel additions={total.additions}")).toHaveLength(3);
    expect(styles).toContain(".lynx-diff-stat {\n  display: flex;\n  flex-direction: row;");
    expect(styles).toContain("justify-content: center;\n  flex-shrink: 0;\n  height: 24px;");
    expect(styles).toContain(".lynx-diff-stat__additions,\n.lynx-diff-stat__deletions");
  });

  it("keeps every ready checkpoint in the turn scope menu", () => {
    expect(source).toContain('.filter((checkpoint) => checkpoint.status === "ready")');
    expect(source).not.toContain('checkpoint.status === "ready" && checkpoint.files.length > 0');
  });
});
