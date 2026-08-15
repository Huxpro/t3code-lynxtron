import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, describe, it } from "vite-plus/test";

import { resolveBrowserPreviewViewportContract } from "./viewportContract.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

describe("resolveBrowserPreviewViewportContract", () => {
  it("uses the live browser viewport and physical pixel ratio", () => {
    assert.deepEqual(
      resolveBrowserPreviewViewportContract({
        innerWidth: 1000,
        innerHeight: 760,
        pixelRatio: 2,
        requestedWidth: "1280",
        requestedHeight: "820",
      }),
      {
        cssWidth: 1000,
        cssHeight: 760,
        pixelRatio: 2,
        pixelWidth: 2000,
        pixelHeight: 1520,
      },
    );
  });

  it("uses explicit harness dimensions before layout is measurable", () => {
    assert.deepEqual(
      resolveBrowserPreviewViewportContract({
        innerWidth: 0,
        innerHeight: 0,
        pixelRatio: 1,
        requestedWidth: "760",
        requestedHeight: "820",
      }),
      {
        cssWidth: 760,
        cssHeight: 820,
        pixelRatio: 1,
        pixelWidth: 760,
        pixelHeight: 820,
      },
    );
  });

  it("falls back to the canonical viewport for invalid inputs", () => {
    assert.deepEqual(
      resolveBrowserPreviewViewportContract({
        innerWidth: Number.NaN,
        innerHeight: Number.NaN,
        pixelRatio: 0,
        requestedWidth: "invalid",
        requestedHeight: "-1",
      }),
      {
        cssWidth: 1280,
        cssHeight: 820,
        pixelRatio: 1,
        pixelWidth: 1280,
        pixelHeight: 820,
      },
    );
  });

  it("keeps the preview host sized by the live viewport", () => {
    const source = readFileSync(path.join(scriptDir, "index.ts"), "utf8");
    const styles = readFileSync(path.join(scriptDir, "probe.css"), "utf8");

    assert.match(source, /window\.addEventListener\("resize", handleViewportResize\)/);
    assert.notMatch(source, /const cssWidth = 1280/);
    assert.match(styles, /width: 100vw/);
    assert.match(styles, /height: 100vh/);
  });

  it("restores the vertical Review layout stripped from the browser proxy bundle", () => {
    const source = readFileSync(path.join(scriptDir, "index.ts"), "utf8");

    assert.include(source, '".right-panel{display:flex;flex-direction:column;}"');
    assert.include(
      source,
      '".right-panel__tabs{height:44px!important;min-height:44px!important;box-sizing:border-box;}"',
    );
    assert.include(
      source,
      '"display:flex;flex:1 1 0%;flex-direction:column;height:0;margin-left:1px;width:calc(100% - 1px);}"',
    );
    assert.include(
      source,
      '".diff-panel{display:flex;flex:1 1 0%;flex-direction:column;height:0;}"',
    );
    assert.include(source, '"flex:none;height:40px;min-height:40px;max-height:40px;');
    assert.include(
      source,
      '".diff-panel__inner{width:100%;padding:0!important;box-sizing:border-box;}"',
    );
    assert.include(source, '".diff-code-files,.diff-code-file,.diff-code-file__body{"');
  });
});
