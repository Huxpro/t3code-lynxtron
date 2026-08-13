#!/usr/bin/env node

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const screenshotExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function parseArguments(argv) {
  const options = {
    limit: 100,
    roots: [path.join(appRoot, "evidence"), path.join(appRoot, "reports")],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--limit") {
      options.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument === "--root") {
      options.roots = [path.resolve(argv[index + 1] ?? "")];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 0) {
    throw new Error("--limit must be a non-negative integer");
  }
  return options;
}

export function collectScreenshotFiles(roots) {
  const files = [];
  const visit = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (
        entry.isFile() &&
        screenshotExtensions.has(path.extname(entry.name).toLowerCase())
      ) {
        files.push(entryPath);
      }
    }
  };
  for (const root of roots) visit(root);
  return files.sort();
}

export function summarizeScreenshotBudget(roots, limit) {
  const files = collectScreenshotFiles(roots);
  const bytes = files.reduce((sum, filePath) => sum + statSync(filePath).size, 0);
  return {
    bytes,
    count: files.length,
    files,
    limit,
    remaining: limit - files.length,
    valid: files.length <= limit,
  };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = summarizeScreenshotBudget(options.roots, options.limit);
  console.log(
    `${result.valid ? "PASS" : "FAIL"} screenshot budget ` +
      `count=${result.count} limit=${result.limit} remaining=${result.remaining} ` +
      `bytes=${result.bytes}`,
  );
  if (!result.valid) {
    for (const filePath of result.files.slice(options.limit)) {
      console.error(`- over budget: ${filePath}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
