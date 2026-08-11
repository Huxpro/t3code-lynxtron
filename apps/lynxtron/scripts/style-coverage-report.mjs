#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const repoRoot = path.resolve(appRoot, "../..");
const reusePath = path.resolve(
  process.argv[2] ?? path.join(appRoot, "reports/reuse/plan11c.json"),
);
const generatedCssPath = path.resolve(
  process.argv[3] ?? "/tmp/t3-plan11c-tailwind.css",
);
const outputPath = path.resolve(
  process.argv[4] ?? path.join(appRoot, "reports/style/plan11c.json"),
);
const compatPath = path.join(appRoot, "reports/tailwind-v3-compat.json");

const reuse = JSON.parse(await readFile(reusePath, "utf8"));
const generatedCss = await readFile(generatedCssPath, "utf8");
const patchedCss = await readFile(path.join(appRoot, "src/app/overrides.css"), "utf8");
const compat = JSON.parse(await readFile(compatPath, "utf8"));
const removedSelectors = new Set(compat.removedSelectors ?? []);

const provenance = new Map();
const tokenCounts = new Map();

function addToken(token, screen, file) {
  if (!token || token.includes("${") || token === "className") return;
  tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
  const entry = provenance.get(token) ?? { files: new Set(), screens: new Set() };
  entry.files.add(file);
  entry.screens.add(screen);
  provenance.set(token, entry);
}

function extractTokens(source) {
  const tokens = [];
  for (const match of source.matchAll(/className\s*=\s*["'`]([^"'`]+)["'`]/gu)) {
    tokens.push(...match[1].split(/\s+/u));
  }
  for (const match of source.matchAll(/["'`]([-\w:[\]/().,%#]+(?:\s+[-\w:[\]/().,%#]+)+)["'`]/gu)) {
    const value = match[1];
    if (!/(?:^|\s)(?:flex|grid|text-|bg-|border|p[trblxy]?[-[]|m[trblxy]?[-[]|gap-|size-|w-|h-|rounded|items-|justify-|overflow-|absolute|relative|fixed|opacity-|shadow)/u.test(value)) {
      continue;
    }
    tokens.push(...value.split(/\s+/u));
  }
  return tokens.filter(Boolean);
}

const modulesByScreen = new Map();
for (const screen of reuse.screens) {
  const modules = screen.graphs.productSurface.web.modules.map((row) => row.path);
  modulesByScreen.set(screen.id, modules);
  for (const file of modules) {
    const absolute = path.join(repoRoot, file);
    const source = await readFile(absolute, "utf8");
    for (const token of extractTokens(source)) addToken(token, screen.id, file);
  }
}

function escapedSelector(token) {
  return `.${token.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/gu, "\\$1")}`;
}

function classify(token) {
  const selector = escapedSelector(token);
  if (generatedCss.includes(selector)) return "GENERATED";
  if (patchedCss.includes(selector)) return "PATCHED";
  if ([...removedSelectors].some((removed) => removed.includes(selector))) return "REMOVED";
  if (/^(?:hover|focus|focus-visible|group-hover|data-|aria-|supports-|sm:|md:|lg:)/u.test(token)) {
    return "UNSUPPORTED_VARIANT";
  }
  if (token.startsWith("[") || token.includes("[&")) return "UNSUPPORTED_SELECTOR";
  return "UNMAPPED";
}

const rows = [...tokenCounts]
  .map(([token, occurrences]) => {
    const source = provenance.get(token);
    return {
      token,
      occurrences,
      classification: classify(token),
      screens: [...source.screens].sort(),
      files: [...source.files].sort(),
    };
  })
  .sort(
    (left, right) =>
      right.occurrences - left.occurrences || left.token.localeCompare(right.token),
  );

const totalOccurrences = rows.reduce((sum, row) => sum + row.occurrences, 0);
const coveredOccurrences = rows
  .filter((row) => ["GENERATED", "PATCHED"].includes(row.classification))
  .reduce((sum, row) => sum + row.occurrences, 0);
const classifications = Object.fromEntries(
  [...new Set(rows.map((row) => row.classification))].sort().map((classification) => [
    classification,
    {
      tokens: rows.filter((row) => row.classification === classification).length,
      occurrences: rows
        .filter((row) => row.classification === classification)
        .reduce((sum, row) => sum + row.occurrences, 0),
    },
  ]),
);

const report = {
  schemaVersion: 1,
  reuseReport: path.relative(repoRoot, reusePath),
  generatedCss: path.relative(repoRoot, generatedCssPath),
  patchedCss: "apps/lynxtron/src/app/overrides.css",
  screens: [...modulesByScreen.keys()],
  summary: {
    uniqueTokens: rows.length,
    totalOccurrences,
    coveredOccurrences,
    weightedCoveragePercent:
      totalOccurrences === 0
        ? 0
        : Number(((coveredOccurrences / totalOccurrences) * 100).toFixed(2)),
    classifications,
  },
  highestRisk: rows
    .filter((row) => !["GENERATED", "PATCHED"].includes(row.classification))
    .slice(0, 100),
  tokens: rows,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      output: path.relative(repoRoot, outputPath),
      screens: report.screens.length,
      ...report.summary,
    },
    null,
    2,
  ),
);
