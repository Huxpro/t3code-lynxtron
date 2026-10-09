import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const registry = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "floating-relation-registry.json"), "utf8"),
);

describe("floating relation registry", () => {
  it("keeps source-derived relation identities unique and structurally valid", () => {
    const ids = registry.relations.map((relation) => relation.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.isAtLeast(ids.length, 8);

    for (const relation of registry.relations) {
      assert.include(["top", "right", "bottom", "left"], relation.preferredPlacement.side);
      assert.include(["start", "center", "end"], relation.preferredPlacement.align);
      assert.isAtLeast(relation.preferredPlacement.sideOffset, 0);
      assert.isNotEmpty(relation.trigger.web);
      assert.isNotEmpty(relation.trigger.lynx);
      assert.isNotEmpty(relation.popup.web);
      assert.isNotEmpty(relation.popup.lynx);
      assert.isAtLeast(relation.source.length, 2);
      for (const source of relation.source) {
        assert.isTrue(existsSync(path.join(repoRoot, source)), `${relation.id}: ${source}`);
      }
    }
  });

  it("instruments every registered relation in the Lynx product sources", () => {
    const lynxSource = [
      "apps/web/src/components/SidebarV2.lynx.tsx",
      "apps/web/src/components/sidebar/SidebarV2ControlsSurface.lynx.tsx",
      "apps/lynxtron/src/app/components/Composer.tsx",
      "apps/lynxtron/src/app/components/ModelPicker.tsx",
      "apps/lynxtron/src/app/components/ChatHeader.tsx",
      "apps/lynxtron/src/app/components/OpenInPicker.tsx",
      "apps/lynxtron/src/app/components/RightPanel.tsx",
      "apps/lynxtron/src/app/components/DiffPanel.tsx",
    ]
      .map((source) => readFileSync(path.join(repoRoot, source), "utf8"))
      .join("\n");

    for (const relation of registry.relations) {
      assert.include(lynxSource, relation.id, `Lynx relation identity: ${relation.id}`);
    }
  });

  it("keeps fixed viewport coordinates out of the Sidebar relation sources", () => {
    const controls = readFileSync(
      path.join(repoRoot, "apps/web/src/components/sidebar/SidebarV2ControlsSurface.lynx.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      path.join(repoRoot, "apps/web/src/components/SidebarV2.lynx.tsx"),
      "utf8",
    );

    assert.notInclude(controls, 'top: "140px"');
    assert.notInclude(controls, 'left: "8px"');
    assert.notInclude(sidebar, 'top: "132px"');
    assert.notInclude(sidebar, 'left: "244px"');
  });
});
