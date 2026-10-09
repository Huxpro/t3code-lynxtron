import { resolve } from "node:path";

import { assert, describe, it } from "vite-plus/test";

import {
  componentDefinitions,
  generateComponentInventory,
  stableJson,
} from "./component-lab-inventory.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

describe("Components Lab inventory", () => {
  it("discovers exported function components that return through helper calls", () => {
    const definitions = componentDefinitions(
      resolve(REPO_ROOT, "apps/web/src/components/ui/button.tsx"),
    );
    const button = definitions.find((definition) => definition.name === "Button");
    assert.equal(button?.exported, true);
    assert.isAbove(button?.line ?? 0, 0);
  });

  it("records platform pairs, use sites, and explicit story coverage", () => {
    const report = generateComponentInventory();
    const button = report.components.find((component) => component.id === "ui/button#Button");
    const switchComponent = report.components.find(
      (component) => component.id === "ui/switch#Switch",
    );

    assert.equal(button?.implementation, "platform-pair");
    assert.equal(button?.story.status, "covered");
    assert.isAbove(button?.reuse.webUseSiteCount ?? 0, 1);
    assert.equal(switchComponent?.story.status, "covered");
    assert.isAbove(report.counts.webOnly, 0);
    assert.equal(report.counts.stories, report.catalog.length);
  });

  it("is deterministic", () => {
    assert.equal(
      stableJson(generateComponentInventory()),
      stableJson(generateComponentInventory()),
    );
  });
});
