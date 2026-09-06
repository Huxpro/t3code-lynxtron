import { access, cp, mkdir, readlink, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve("@lynx-js/cef-webview/package.json"));
const source = path.join(packageRoot, "dist", process.platform, process.arch, "frameworks");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function copyCefFrameworks(destination) {
  if (process.platform !== "darwin") return false;
  if (!(await exists(source))) {
    throw new Error(`CEF frameworks are missing at ${source}. Reinstall @lynx-js/cef-webview.`);
  }
  await mkdir(destination, { recursive: true });
  for (const entry of [
    "Chromium Embedded Framework.framework",
    "Lynxtron Helper.app",
    "Lynxtron Helper (Alerts).app",
    "Lynxtron Helper (GPU).app",
    "Lynxtron Helper (Plugin).app",
    "Lynxtron Helper (Renderer).app",
  ]) {
    const target = path.join(destination, entry);
    await rm(target, { recursive: true, force: true });
    await cp(path.join(source, entry), target, { recursive: true, verbatimSymlinks: true });
  }
  return true;
}

export async function afterExtract({ appOutDir, electronPlatformName }) {
  if (electronPlatformName !== "darwin") return;
  await copyCefFrameworks(path.join(appOutDir, "Lynxtron.app", "Contents", "Frameworks"));
}

export async function afterPack({ appOutDir, packager }) {
  if (process.platform !== "darwin") return;
  const productName = packager.appInfo.productFilename;
  const frameworks = path.join(appOutDir, `${productName}.app`, "Contents", "Frameworks");
  const framework = path.join(frameworks, "Chromium Embedded Framework.framework");
  const current = await readlink(path.join(framework, "Versions", "Current"));
  if (path.isAbsolute(current))
    throw new Error("CEF framework contains an absolute Current symlink");
}

async function main() {
  const nativePaths = require("@lynx-js/lynxtron/native-paths");
  for (const variant of ["devtool", "release"]) {
    const runtimeRoot = nativePaths.getRuntimeRoot(variant);
    const runtimeApp = path.join(runtimeRoot, "Lynxtron.app");
    if (!(await exists(runtimeApp))) continue;
    await copyCefFrameworks(path.join(runtimeApp, "Contents", "Frameworks"));
    console.log(`[cef-webview] synced frameworks into ${variant} runtime`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main();
}
