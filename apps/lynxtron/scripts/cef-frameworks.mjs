import { access, cp, lstat, mkdir, readFile, readlink, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve("@lynx-js/cef-webview/package.json"));

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the package-relative Framework and helper bundles that the CEF
 * package's AutoLink manifest declares for one macOS target. The manifest is
 * the same contract lynxtron-builder uses, so helper renames need no change here.
 */
export function selectCefMacBundles(manifest, platform, arch) {
  const target = manifest?.platforms?.lynxtron?.targets?.find(
    (candidate) => candidate.os === platform && candidate.arch === arch,
  );
  if (!target) throw new Error(`@lynx-js/cef-webview declares no ${platform}/${arch} target`);
  const bundles = [...(target.frameworks ?? []), ...(target.appBundles ?? [])];
  if (bundles.length === 0) {
    throw new Error(`@lynx-js/cef-webview declares no ${platform}/${arch} bundles`);
  }
  return bundles;
}

export async function copyCefFrameworks(destination) {
  if (process.platform !== "darwin") return false;
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "lynx.lib.json"), "utf8"));
  const bundles = selectCefMacBundles(manifest, process.platform, process.arch);
  await mkdir(destination, { recursive: true });
  for (const bundle of bundles) {
    const source = path.join(packageRoot, bundle);
    if (!(await exists(source))) {
      throw new Error(`CEF bundle is missing at ${source}. Reinstall @lynx-js/cef-webview.`);
    }
    const target = path.join(destination, path.basename(bundle));
    await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true, verbatimSymlinks: true });
  }
  return true;
}

async function requireRelativeResolvedLink(linkPath) {
  const target = await readlink(linkPath);
  if (path.isAbsolute(target)) {
    throw new Error(`Framework link must be relative: ${linkPath} -> ${target}`);
  }
  await access(path.resolve(path.dirname(linkPath), target));
  return target;
}

async function findFiles(root, filename) {
  const matches = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(target);
      else if (entry.name === filename) matches.push(target);
    }
  };
  await visit(root);
  return matches;
}

export async function verifyPackagedCefRuntime(appPath) {
  const frameworks = path.join(appPath, "Contents", "Frameworks");
  const resources = path.join(appPath, "Contents", "Resources");
  const links = {
    cefCurrent: await requireRelativeResolvedLink(
      path.join(frameworks, "Chromium Embedded Framework.framework", "Versions", "Current"),
    ),
    cefBinary: await requireRelativeResolvedLink(
      path.join(frameworks, "Chromium Embedded Framework.framework", "Chromium Embedded Framework"),
    ),
    lynxtronCurrent: await requireRelativeResolvedLink(
      path.join(frameworks, "Lynxtron Framework.framework", "Versions", "Current"),
    ),
    lynxtronBinary: await requireRelativeResolvedLink(
      path.join(frameworks, "Lynxtron Framework.framework", "Lynxtron Framework"),
    ),
  };
  const addons = await findFiles(resources, "cef_extension.node");
  if (addons.length !== 1) {
    throw new Error(`Packaged app must contain exactly one CEF addon; found ${addons.length}`);
  }
  const nestedFrameworks = [
    path.join(resources, "app", "node_modules", "@lynx-js", "cef-webview"),
    path.join(resources, "app", ".lynxtron", "native", "node_modules", "@lynx-js", "cef-webview"),
  ].map((packagePath) =>
    path.join(packagePath, "dist", process.platform, process.arch, "frameworks"),
  );
  if (
    (await Promise.all(nestedFrameworks.map((target) => lstat(target).catch(() => null)))).some(
      (entry) => entry !== null,
    )
  ) {
    throw new Error("Packaged CEF framework must not be duplicated under app resources");
  }
  return { addons, links };
}

export async function afterExtract({ appOutDir, electronPlatformName }) {
  if (electronPlatformName !== "darwin") return;
  await copyCefFrameworks(path.join(appOutDir, "Lynxtron.app", "Contents", "Frameworks"));
}

export async function afterPack({ appOutDir, packager }) {
  if (process.platform !== "darwin") return;
  const productName = packager.appInfo.productFilename;
  await verifyPackagedCefRuntime(path.join(appOutDir, `${productName}.app`));
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
