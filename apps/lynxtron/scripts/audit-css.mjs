#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "../..");
const webRoot = path.join(repoRoot, "apps/web/src");
const webCssPath = path.join(webRoot, "index.css");
const supportPath = path.join(appRoot, "scripts/lynx-css-support.json");
const outputPath = path.join(appRoot, "reports/css-audit.json");
const support = JSON.parse(await readFile(supportPath, "utf8"));

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(absolute)));
    else files.push(absolute);
  }
  return files;
}

const classCounts = new Map();
for (const file of await filesUnder(webRoot)) {
  if (!/\.[jt]sx?$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/className\s*=\s*["'`]([^"'`]+)["'`]/g)) {
    for (const utility of match[1].split(/\s+/).filter(Boolean)) {
      classCounts.set(utility, (classCounts.get(utility) ?? 0) + 1);
    }
  }
}

const css = await readFile(webCssPath, "utf8");
const syntax = Object.fromEntries(
  Object.entries(support.syntax).map(([feature, status]) => [
    feature,
    { status, occurrences: css.split(feature).length - 1 },
  ]),
);
const unsupportedUtilities = [...classCounts.entries()]
  .filter(([utility]) =>
    support.unsupportedUtilityPatterns.some((pattern) => new RegExp(pattern).test(utility)),
  )
  .map(([utility, occurrences]) => ({ utility, occurrences }))
  .sort((left, right) => right.occurrences - left.occurrences);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      scannedCss: path.relative(repoRoot, webCssPath),
      uniqueStaticUtilities: classCounts.size,
      syntax,
      unsupportedUtilities,
    },
    null,
    2,
  )}\n`,
);
console.log(`[audit-css] ${classCounts.size} utilities -> ${path.relative(repoRoot, outputPath)}`);
