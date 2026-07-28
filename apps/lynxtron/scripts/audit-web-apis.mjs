#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "../..");
const webRoot = path.join(repoRoot, "apps/web/src");
const outputPath = path.join(appRoot, "reports/web-api-audit.json");
const roots = new Set([
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "ResizeObserver",
  "MutationObserver",
  "WebSocket",
  "fetch",
  "matchMedia",
  "getSelection",
  "queueMicrotask",
]);

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(absolute)));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.includes(".test."))
      files.push(absolute);
  }
  return files;
}

const hits = new Map();
for (const file of await sourceFiles(webRoot)) {
  const text = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    let api;
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const root = node.expression.text;
      if (roots.has(root)) api = `${root}.${node.name.text}`;
    } else if (ts.isIdentifier(node) && roots.has(node.text)) {
      const parent = node.parent;
      if (!ts.isPropertyAccessExpression(parent) || parent.expression !== node) api = node.text;
    }
    if (api) {
      const record = hits.get(api) ?? { calls: 0, files: new Set() };
      record.calls += 1;
      record.files.add(path.relative(repoRoot, file));
      hits.set(api, record);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const entries = [...hits.entries()]
  .map(([api, value]) => ({
    api,
    calls: value.calls,
    fileCount: value.files.size,
    files: [...value.files].sort(),
  }))
  .sort((left, right) => right.calls - left.calls || left.api.localeCompare(right.api));

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      scannedRoot: path.relative(repoRoot, webRoot),
      generatedAt: new Date().toISOString(),
      totalCallSites: entries.reduce((sum, entry) => sum + entry.calls, 0),
      entries,
    },
    null,
    2,
  )}\n`,
);
console.log(`[audit-web-apis] ${entries.length} APIs -> ${path.relative(repoRoot, outputPath)}`);
