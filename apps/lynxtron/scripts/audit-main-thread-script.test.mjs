import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const productionSources = [
  "apps/lynxtron/src/app/hooks/useResizableWidth.ts",
  "apps/lynxtron/src/app/components/ModelPicker.tsx",
  "apps/lynxtron/src/app/components/RightPanel.tsx",
  "apps/web/src/components/ui/sidebar.lynx.tsx",
];
const tooltipSource = "apps/web/src/components/ui/tooltip.lynx.tsx";

describe("main-thread-script inventory", () => {
  it("keeps every production MTS surface in the audited inventory", () => {
    const source = productionSources
      .map((file) => readFileSync(path.join(repoRoot, file), "utf8"))
      .join("\n");
    assert.equal(source.match(/["']main thread["']/gu)?.length, 7);
    assert.equal(source.match(/main-thread:ref=/gu)?.length, 4);
    assert.equal(source.match(/main-thread:(?:global-)?bind(?:mouse|touch|wheel)/gu)?.length, 11);
    assert.equal(source.match(/main-thread:global-bind(?:mouse|touch)/gu)?.length ?? 0, 0);
    assert.equal(source.match(/main-thread:ref=\{resize\.handleRef\}/gu)?.length, 2);
    assert.include(source, "listWheelRef");
    assert.include(source, "main-thread:global-bindwheel={handleListWheel}");
  });

  it("allows the tooltip overlay's bounded global mouse lifecycle", () => {
    const source = readFileSync(path.join(repoRoot, tooltipSource), "utf8");
    assert.equal(source.match(/["']main thread["']/gu)?.length, 6);
    assert.equal(source.match(/main-thread:global-bindmousemove/gu)?.length, 1);
    assert.equal(source.match(/main-thread:global-bind(?:touch|mouseup)/gu)?.length ?? 0, 0);
    assert.include(source, "handleGlobalMouseMove");
  });

  it("keeps resize worklets self-contained", () => {
    const source = readFileSync(
      path.join(repoRoot, "apps/lynxtron/src/app/hooks/useResizableWidth.ts"),
      "utf8",
    );
    assert.notInclude(source, "mainThreadPointerX(");
    assert.notInclude(source, "setMainThreadResizeWidth(");
    assert.notInclude(source, 'lynx.querySelector(".sidebar-inner")');
    assert.equal(source.match(/lynx\.querySelector\("\.sidebar-gap"\)/gu)?.length, 1);
    assert.equal(source.match(/lynx\.querySelector\("\.sidebar-container"\)/gu)?.length, 1);
    assert.include(source, "sidebarTargetsRef.current");
    assert.include(source, 'handleRef.current?.setAttribute("hit-slop", "2000px")');
    assert.equal(source.match(/setStyleProperty\("transition-duration", "0ms"\)/gu)?.length, 2);
    assert.equal(source.match(/setStyleProperty\("transition-duration", "200ms"\)/gu)?.length, 4);
    assert.equal(
      source.match(/handleRef\.current\?\.setAttribute\("hit-slop", "0px"\)/gu)?.length,
      2,
    );
    assert.notMatch(source, /["']main thread["'][\s\S]{0,2000}\bfinish\(event\)/u);
    assert.include(
      source,
      'import { resolveMainThreadResizeWidth } from "./resizeFrame" with { runtime: "shared" };',
    );
    assert.include(
      source,
      'import { pointerClientX } from "./resizePointer" with { runtime: "shared" };',
    );
  });
});
