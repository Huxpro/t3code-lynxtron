import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APP_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const DEFAULT_REFERENCE = join(homedir(), "github", "t3code-lynxtron");
const SOURCE_EXTENSIONS = new Set([".css", ".js", ".mjs", ".ts", ".tsx"]);
const EXCLUDED_DIRECTORIES = new Set(["dist", "node_modules", "reports"]);
const EXCLUDED_FILES = new Set(["src/app/components/iconData.ts", "src/app/routeTree.gen.ts"]);
const RENAMES = new Map([
  ["src/app/overrides.css", "src/app/App.css"],
  ["src/app/state/t3Client.ts", "src/app/state/useT3Connection.ts"],
]);

function parseReferenceArgument(argv) {
  const index = argv.indexOf("--reference");
  return index >= 0 && argv[index + 1] ? resolve(argv[index + 1]) : DEFAULT_REFERENCE;
}

function extensionOf(file) {
  for (const extension of SOURCE_EXTENSIONS) {
    if (file.endsWith(extension)) return extension;
  }
  return "";
}

function listSourceFiles(directory, root = directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const relativePath = relative(root, absolute);
    if (statSync(absolute).isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry) || relativePath === "src/app/generated") {
        continue;
      }
      files.push(...listSourceFiles(absolute, root));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extensionOf(entry)) && !EXCLUDED_FILES.has(relativePath)) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function physicalLineCount(file) {
  const text = readFileSync(file, "utf8");
  if (text.length === 0) return 0;
  return text.split(/\r?\n/u).length - (text.endsWith("\n") ? 1 : 0);
}

function comparePair(referenceFile, currentFile) {
  const result = spawnSync(
    "git",
    ["diff", "--no-index", "--numstat", "--", referenceFile, currentFile],
    { encoding: "utf8" },
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `git diff failed for ${currentFile}`);
  }
  const row = result.stdout.trim().split("\n")[0];
  if (!row) {
    return { added: 0, deleted: 0, retained: physicalLineCount(currentFile) };
  }
  const [addedText, deletedText] = row.split("\t");
  const added = Number(addedText);
  const deleted = Number(deletedText);
  if (!Number.isFinite(added) || !Number.isFinite(deleted)) {
    throw new Error(`Unexpected numstat output for ${currentFile}: ${row}`);
  }
  return {
    added,
    deleted,
    retained: physicalLineCount(currentFile) - added,
  };
}

const referenceDirectory = parseReferenceArgument(process.argv.slice(2));
const currentFiles = listSourceFiles(APP_DIRECTORY);
const pairResults = [];

for (const currentFile of currentFiles) {
  const currentRelativePath = relative(APP_DIRECTORY, currentFile);
  const referenceRelativePath = RENAMES.get(currentRelativePath) ?? currentRelativePath;
  const referenceFile = join(referenceDirectory, referenceRelativePath);
  try {
    if (!statSync(referenceFile).isFile()) continue;
  } catch {
    continue;
  }
  pairResults.push({
    current: currentRelativePath,
    reference: referenceRelativePath,
    ...comparePair(referenceFile, currentFile),
  });
}

const currentLines = currentFiles.reduce((sum, file) => sum + physicalLineCount(file), 0);
const retainedLines = pairResults.reduce((sum, pair) => sum + pair.retained, 0);
const report = {
  referenceDirectory,
  currentFiles: currentFiles.length,
  currentLines,
  pairedFiles: pairResults.length,
  modifiedPairs: pairResults.filter((pair) => pair.added > 0 || pair.deleted > 0).length,
  retainedLines,
  retainedShare: Number(((retainedLines / currentLines) * 100).toFixed(1)),
  renames: Object.fromEntries(RENAMES),
};

console.log(JSON.stringify(report, null, 2));
