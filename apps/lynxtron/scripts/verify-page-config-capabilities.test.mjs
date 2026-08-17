import { readFileSync } from "node:fs";

import { assert, describe, it } from "vite-plus/test";

const config = readFileSync(new URL("../lynx.config.ts", import.meta.url), "utf8");
const support = JSON.parse(
  readFileSync(new URL("./lynx-css-support.json", import.meta.url), "utf8"),
);
const verifier = readFileSync(
  new URL("./verify-page-config-capabilities.mjs", import.meta.url),
  "utf8",
);

describe("pageConfig capability probe", () => {
  it("keeps raw pageConfig injection behind the probe entry", () => {
    assert.include(config, "T3_LYNXTRON_PROBE_PAGE_CONFIG");
    assert.include(config, "T3_LYNXTRON_PROBE_PAGE_CONFIG requires an env-gated probe entry.");
    assert.include(config, "pluginLynxConfig(parsedProbePageConfig");
  });

  it("covers baseline, typed, legacy, and untyped config variants", () => {
    for (const variant of [
      "baseline",
      "typed-flags",
      "legacy-transform-origin",
      "untyped-mouse-align",
      "untyped-css-rule",
    ]) {
      assert.include(verifier, `id: "${variant}"`);
    }
    assert.include(verifier, "Input.emulateTouchFromMouseEvent");
    assert.include(verifier, "pending-physical-mouse-session");
  });

  it("keeps runtime-proven grid utilities out of the unsupported audit set", () => {
    assert.equal(support.syntax["display: grid"], "supported");
    assert.isFalse(support.unsupportedUtilityPatterns.includes("^grid($|-)"));
  });
});
