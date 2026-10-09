#!/usr/bin/env node

// Reports where the fork differs from upstream outside the paths it owns.
//
//   node scripts/check-upstream-delta.mjs [--upstream origin/main] [--summary]
//
// Upstream paths are meant to stay byte-identical to upstream (see
// docs/architecture.md). A modified or deleted upstream file must be listed in
// upstream-patches.json with its reason; anything else fails the check. A file
// the fork adds inside an upstream directory must be named `*.lynx.*` or be
// listed under "additions".

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import NodeProcess from "node:process";
import * as NodeURL from "node:url";

const appRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const repoRoot = NodePath.resolve(appRoot, "../..");
const args = NodeProcess.argv.slice(2);
const upstream = args.includes("--upstream") ? args[args.indexOf("--upstream") + 1] : "origin/main";
const summaryOnly = args.includes("--summary");

function git(gitArgs) {
  return NodeChildProcess.execFileSync("git", ["-c", "color.ui=never", ...gitArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }).trim();
}

const FORK_OWNED = [/^apps\/lynxtron\//u, /^packages\/lynx-logic\//u, /^\.plans\//u, /^patches\//u];
// Derived from the manifests; it differs whenever they do.
const DERIVED = new Set(["pnpm-lock.yaml"]);
const isForkOwned = (file) => FORK_OWNED.some((pattern) => pattern.test(file));
const isLynxSibling = (file) => /\.lynx\.tsx?$/u.test(file);

const {
  mergeBase: recordedMergeBase,
  patches,
  additions,
} = JSON.parse(NodeFS.readFileSync(NodePath.join(appRoot, "upstream-patches.json"), "utf8"));

// With the upstream remote present, the merge base is computed and must match
// the recorded one, so a merge cannot land without updating the list. Without
// it (CI on the fork), the recorded commit is used.
function resolveMergeBase() {
  try {
    return git(["merge-base", "HEAD", upstream]);
  } catch {
    return null;
  }
}
const computedMergeBase = resolveMergeBase();
const mergeBase = computedMergeBase ?? recordedMergeBase;
const mergeBaseIsStale = computedMergeBase !== null && computedMergeBase !== recordedMergeBase;
const changes = git(["diff", "--name-status", "--no-renames", mergeBase])
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, file] = line.split("\t");
    return { status, file };
  })
  .filter((change) => !isForkOwned(change.file) && !DERIVED.has(change.file));

const edited = changes.filter((change) => change.status !== "A");
const listed = edited.filter((change) => change.file in patches);
const unlisted = edited.filter((change) => !(change.file in patches));
const added = changes.filter((change) => change.status === "A");
const siblings = added.filter((change) => isLynxSibling(change.file));
const otherAdded = added.filter((change) => !isLynxSibling(change.file));
const unlistedAdded = otherAdded.filter((change) => !(change.file in additions));
const stale = [
  ...Object.keys(patches).filter((file) => !edited.some((change) => change.file === file)),
  ...Object.keys(additions).filter((file) => !otherAdded.some((change) => change.file === file)),
];

console.log(
  `merge base ${mergeBase.slice(0, 10)} (${computedMergeBase ? upstream : "recorded in upstream-patches.json"})`,
);
if (mergeBaseIsStale) {
  console.log(
    `recorded mergeBase ${recordedMergeBase.slice(0, 10)} is stale; update upstream-patches.json`,
  );
}
console.log(`upstream files modified or deleted: ${edited.length}`);
console.log(`  listed in upstream-patches.json: ${listed.length}`);
console.log(`  not listed: ${unlisted.length}`);
console.log(`files added inside upstream directories: ${added.length}`);
console.log(`  *.lynx.* modules: ${siblings.length}`);
console.log(`  listed in upstream-patches.json: ${otherAdded.length - unlistedAdded.length}`);
console.log(`  not listed: ${unlistedAdded.length}`);
if (!summaryOnly) {
  for (const change of [...unlisted, ...unlistedAdded]) {
    console.log(`unlisted ${change.status} ${change.file}`);
  }
  for (const file of stale) console.log(`stale patch entry ${file}`);
}
if (unlisted.length > 0 || unlistedAdded.length > 0 || stale.length > 0 || mergeBaseIsStale) {
  NodeProcess.exitCode = 1;
}
