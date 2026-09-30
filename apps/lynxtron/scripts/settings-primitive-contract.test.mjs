import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const webCssPath = path.join(repoRoot, "apps/web/src/index.css");
const generatedCssPath = path.join(repoRoot, "apps/lynxtron/src/app/generated/lynx.css");
const overridesPath = path.join(repoRoot, "apps/lynxtron/src/app/overrides.css");

function declarationsAfterMarker(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing marker ${marker}`);
  const open = source.indexOf("{", markerIndex);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) {
      return Object.fromEntries(
        [...source.slice(open + 1, index).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/gu)].map((match) => [
          match[1],
          match[2].trim(),
        ]),
      );
    }
  }
  assert.fail(`unclosed block after ${marker}`);
}

describe("Settings primitive contract", () => {
  it("generates every Web-owned Settings token without changing its value", () => {
    const webTokens = declarationsAfterMarker(
      readFileSync(webCssPath, "utf8"),
      "LYNX_SETTINGS_PRIMITIVE_CONTRACT",
    );
    const generatedTokens = declarationsAfterMarker(
      readFileSync(generatedCssPath, "utf8"),
      ":root",
    );

    assert.equal(Object.keys(webTokens).length, 37);
    for (const [name, value] of Object.entries(webTokens)) {
      assert.equal(generatedTokens[name], value, name);
    }
  });

  it("keeps all selected platform leaves at the Web import paths", () => {
    const expectedStems = [
      "apps/web/src/components/settings/settingsLayout",
      "apps/web/src/components/settings/generalSettingsHost",
      "apps/web/src/components/ui/button",
      "apps/web/src/components/ui/draft-input",
      "apps/web/src/components/ui/input",
      "apps/web/src/components/ui/label",
      "apps/web/src/components/ui/scroll-area",
      "apps/web/src/components/ui/select",
      "apps/web/src/components/ui/separator",
      "apps/web/src/components/ui/switch",
      "apps/web/src/components/ui/textarea",
    ];

    for (const stem of expectedStems) {
      for (const platform of ["web", "lynx"]) {
        const relativePath = `${stem}.${platform}.tsx`;
        const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
        assert.match(source, /export /u, relativePath);
      }
    }
  });

  it("renders both clients from one physical General Settings composition", () => {
    const compositionPath = "apps/web/src/components/settings/GeneralSettingsContent.tsx";
    const composition = readFileSync(path.join(repoRoot, compositionPath), "utf8");
    const webAdapter = readFileSync(
      path.join(repoRoot, "apps/web/src/components/settings/GeneralSettingsPanel.tsx"),
      "utf8",
    );
    const lynxAdapter = readFileSync(
      path.join(repoRoot, "apps/lynxtron/src/app/components/GeneralSettings.tsx"),
      "utf8",
    );

    assert.match(webAdapter, /from ["'].\/GeneralSettingsContent["']/u);
    assert.match(lynxAdapter, /web\/src\/components\/settings\/GeneralSettingsPanel["']/u);
    assert.equal([...composition.matchAll(/<SettingsRow\b/gu)].length, 15);
    for (const id of [
      "project-grouping",
      "time-format",
      "hide-whitespace-changes",
      "provider-update-checks",
      "new-threads",
      "start-from-origin",
      "add-project-starts-in",
      "archive-confirmation",
      "delete-confirmation",
      "text-generation-model",
      "diagnostics",
    ]) {
      assert.include(composition, `searchableSetting("${id}")`, id);
    }
    assert.match(composition, /title=\{`Version \$\{versionLabel\}`\}/u);
  });

  it("links Lynx-only styling to registered compatibility items", () => {
    const overrides = readFileSync(overridesPath, "utf8");
    const contractStart = overrides.indexOf("Settings primitive host contract");
    assert.notEqual(contractStart, -1);
    const contract = overrides.slice(contractStart, overrides.indexOf("/* Empty states */"));
    assert.match(contract, /R6/u);
    assert.match(contract, /R7/u);
    assert.match(contract, /R9/u);
    assert.match(overrides, /var\(--settings-row-radius\)/u);
    assert.match(overrides, /var\(--settings-control-height\)/u);
    assert.match(overrides, /var\(--settings-switch-width\)/u);
  });
});
