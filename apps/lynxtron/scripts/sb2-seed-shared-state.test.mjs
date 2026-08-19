import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "sb2-seed-shared-state.mjs"), "utf8");

describe("shared-state snapshot seeding", () => {
  it("uses Node SQLite and verifies that VACUUM INTO created the destination", () => {
    assert.include(source, 'require("node:sqlite")');
    assert.include(source, "{ readOnly: true }");
    assert.include(source, "spawnSync(process.execPath");
    assert.include(source, "if (!existsSync(destPath))");
    assert.include(source, "VACUUM INTO did not create");
  });

  it("records the source workspace needed for disposable write fixtures", () => {
    assert.include(source, "workspace_root as workspaceRoot");
  });
});
