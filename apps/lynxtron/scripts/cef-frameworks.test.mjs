import assert from "node:assert/strict";
import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, it } from "vitest";

import { selectCefMacBundles, verifyPackagedCefRuntime } from "./cef-frameworks.mjs";

describe("CEF bundle selection", () => {
  const manifest = {
    platforms: {
      lynxtron: {
        targets: [
          { os: "win32", arch: "x64", files: ["dist/win32/x64/cef_extension.node"] },
          {
            os: "darwin",
            arch: "arm64",
            files: ["dist/darwin/arm64/cef_extension.node"],
            frameworks: ["dist/darwin/arm64/frameworks/Chromium Embedded Framework.framework"],
            appBundles: ["dist/darwin/arm64/frameworks/LynxtronWebview Helper.app"],
          },
        ],
      },
    },
  };

  it("stages the declared framework and helper bundles for the matching target", () => {
    assert.deepEqual(selectCefMacBundles(manifest, "darwin", "arm64"), [
      "dist/darwin/arm64/frameworks/Chromium Embedded Framework.framework",
      "dist/darwin/arm64/frameworks/LynxtronWebview Helper.app",
    ]);
  });

  it("rejects a platform the package does not declare", () => {
    assert.throws(() => selectCefMacBundles(manifest, "darwin", "x64"), /darwin\/x64 target/);
  });
});

async function makeFramework(root, name, version) {
  const framework = path.join(root, `${name}.framework`);
  const versionRoot = path.join(framework, "Versions", version);
  await mkdir(path.join(versionRoot, "Resources"), { recursive: true });
  await writeFile(path.join(versionRoot, name), name);
  await symlink(version, path.join(framework, "Versions", "Current"));
  await symlink(`Versions/Current/${name}`, path.join(framework, name));
  await symlink("Versions/Current/Resources", path.join(framework, "Resources"));
}

describe("packaged CEF runtime", () => {
  it("accepts one addon and resolved relative framework links", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "t3-cef-package-"));
    const app = path.join(root, "T3 Code Lynxtron.app");
    const frameworks = path.join(app, "Contents", "Frameworks");
    const addon = path.join(
      app,
      "Contents",
      "Resources",
      "app",
      ".lynxtron",
      "native",
      "node_modules",
      "@lynx-js",
      "cef-webview",
      "dist",
      process.platform,
      process.arch,
      "cef_extension.node",
    );
    await Promise.all([
      makeFramework(frameworks, "Chromium Embedded Framework", "A"),
      makeFramework(frameworks, "Lynxtron Framework", "1.0"),
    ]);
    await mkdir(path.dirname(addon), { recursive: true });
    await writeFile(addon, "addon");

    const result = await verifyPackagedCefRuntime(app);

    assert.equal(result.addons.length, 1);
    assert.deepEqual(result.links, {
      cefCurrent: "A",
      cefBinary: "Versions/Current/Chromium Embedded Framework",
      lynxtronCurrent: "1.0",
      lynxtronBinary: "Versions/Current/Lynxtron Framework",
    });
  });

  it("rejects a duplicate framework inside app resources", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "t3-cef-package-"));
    const app = path.join(root, "T3 Code Lynxtron.app");
    const frameworks = path.join(app, "Contents", "Frameworks");
    const nativeRoot = path.join(
      app,
      "Contents",
      "Resources",
      "app",
      ".lynxtron",
      "native",
      "node_modules",
      "@lynx-js",
      "cef-webview",
      "dist",
      process.platform,
      process.arch,
    );
    await Promise.all([
      makeFramework(frameworks, "Chromium Embedded Framework", "A"),
      makeFramework(frameworks, "Lynxtron Framework", "1.0"),
    ]);
    await mkdir(nativeRoot, { recursive: true });
    await writeFile(path.join(nativeRoot, "cef_extension.node"), "addon");
    await cp(
      path.join(frameworks, "Chromium Embedded Framework.framework"),
      path.join(nativeRoot, "frameworks", "Chromium Embedded Framework.framework"),
      { recursive: true, verbatimSymlinks: true },
    );

    await assert.rejects(
      verifyPackagedCefRuntime(app),
      /must not be duplicated under app resources/,
    );
  });
});
