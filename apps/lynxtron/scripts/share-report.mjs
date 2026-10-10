#!/usr/bin/env node

// Reports how much of the Lynx bundle is upstream source run as upstream wrote it.
//
//   node scripts/share-report.mjs [--json]
//
// Walks the static import graph from the Lynx entry, resolving a module the way
// the Lynx build does (`.lynx` first). Counts non-blank lines per owner. The
// numbers are a trend to watch, not a gate: upstream lines should go up and
// Lynx-owned lines down as copies give way to the upstream files.

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import NodeProcess from "node:process";
import * as NodeURL from "node:url";

const appRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const repoRoot = NodePath.resolve(appRoot, "../..");
const EXTENSIONS = [".lynx.tsx", ".lynx.ts", ".tsx", ".ts"];
const PACKAGES = {
  "@t3tools/client-runtime": "packages/client-runtime",
  "@t3tools/contracts": "packages/contracts",
  "@t3tools/lynx-logic": "packages/lynx-logic",
  "@t3tools/shared": "packages/shared",
};

const isFile = (path) => NodeFS.existsSync(path) && NodeFS.statSync(path).isFile();

function resolveFile(base) {
  if (isFile(base)) return base;
  for (const extension of EXTENSIONS) if (isFile(base + extension)) return base + extension;
  for (const extension of EXTENSIONS) {
    const index = NodePath.join(base, `index${extension}`);
    if (isFile(index)) return index;
  }
  return null;
}

function resolvePackage(specifier) {
  for (const [name, directory] of Object.entries(PACKAGES)) {
    if (specifier !== name && !specifier.startsWith(`${name}/`)) continue;
    const subpath = specifier.slice(name.length + 1);
    const root = NodePath.join(repoRoot, directory);
    const exportsMap = JSON.parse(
      NodeFS.readFileSync(NodePath.join(root, "package.json"), "utf8"),
    ).exports;
    const key = subpath ? `./${subpath}` : ".";
    const entry = exportsMap?.[key] ?? exportsMap?.["./*"];
    const target = typeof entry === "string" ? entry : (entry?.types ?? entry?.import);
    if (typeof target !== "string") return null;
    return resolveFile(NodePath.join(root, target.replace("*", subpath)).replace(/\.ts$/u, ""));
  }
  return null;
}

function resolveSpecifier(from, specifier) {
  if (specifier.startsWith("~/")) {
    return resolveFile(NodePath.join(repoRoot, "apps/web/src", specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return resolveFile(NodePath.resolve(NodePath.dirname(from), specifier.replace(/\.tsx?$/u, "")));
  }
  return resolvePackage(specifier);
}

const IMPORT_PATTERNS = [
  /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gmsu,
  /^\s*import\s+"([^"]+)"/gmu,
  /import\("([^"]+)"\)/gu,
];

const seen = new Set();
const pending = [NodePath.join(appRoot, "src/app/index.tsx")];
while (pending.length > 0) {
  const file = pending.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const source = NodeFS.readFileSync(file, "utf8");
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveSpecifier(file, match[1]);
      if (resolved && !seen.has(resolved)) pending.push(resolved);
    }
  }
}

function owner(relative) {
  if (relative.startsWith("apps/lynxtron/")) return "lynx: apps/lynxtron";
  if (relative.startsWith("packages/lynx-logic/")) return "lynx: packages/lynx-logic";
  if (/\.lynx\.tsx?$/u.test(relative)) return "lynx: .lynx modules in apps/web";
  if (relative.startsWith("apps/web/")) return "upstream: apps/web";
  return `upstream: ${relative.split("/").slice(0, 2).join("/")}`;
}

const totals = new Map();
for (const file of seen) {
  const key = owner(NodePath.relative(repoRoot, file));
  const lines = NodeFS.readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
  const entry = totals.get(key) ?? { modules: 0, lines: 0 };
  totals.set(key, { modules: entry.modules + 1, lines: entry.lines + lines });
}

const sum = (prefix) =>
  [...totals]
    .filter(([key]) => key.startsWith(prefix))
    .reduce((total, [, entry]) => total + entry.lines, 0);
const upstreamLines = sum("upstream:");
const lynxLines = sum("lynx:");
const report = {
  upstreamLines,
  lynxLines,
  upstreamShare: Number((upstreamLines / (upstreamLines + lynxLines)).toFixed(3)),
  owners: Object.fromEntries([...totals].sort(([left], [right]) => left.localeCompare(right))),
};

if (NodeProcess.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [key, entry] of Object.entries(report.owners)) {
    console.log(
      `${key.padEnd(34)} ${String(entry.modules).padStart(4)} modules ${String(entry.lines).padStart(7)} lines`,
    );
  }
  console.log(
    `upstream source run as-is: ${upstreamLines} lines; Lynx-owned: ${lynxLines} lines; share ${(report.upstreamShare * 100).toFixed(1)}%`,
  );
}
