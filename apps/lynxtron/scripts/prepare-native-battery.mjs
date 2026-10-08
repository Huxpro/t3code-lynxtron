#!/usr/bin/env node

// Builds every fixture the Native battery needs and writes the plan that
// `run-native-battery.mjs` consumes, so a battery can start from a clean
// machine with two commands:
//
//   node scripts/prepare-native-battery.mjs <output-dir>
//   node scripts/run-native-battery.mjs <output-dir>/plan.json <output-dir>/results
//
// Fixtures are isolated state directories; nothing here reads live T3 data.
// Entries that need a real provider turn are left out; add them by hand.

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

const appRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const repoRoot = NodePath.resolve(appRoot, "../..");
const outputDir = NodePath.resolve(NodeProcess.argv[2] ?? "");
if (!NodeProcess.argv[2]) throw new Error("Usage: prepare-native-battery.mjs <output-dir>");
if (NodeFS.existsSync(outputDir) && NodeFS.readdirSync(outputDir).length > 0) {
  throw new Error(`Battery output must be new or empty; refusing to overwrite ${outputDir}`);
}
NodeFS.mkdirSync(outputDir, { recursive: true });

function script(name, args) {
  NodeChildProcess.execFileSync(
    NodeProcess.execPath,
    [NodePath.join(appRoot, "scripts", name), ...args],
    {
      cwd: appRoot,
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
}

function git(cwd, args) {
  NodeChildProcess.execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "inherit"] });
}

function writePrefs(fixture) {
  const prefsPath = NodePath.join(fixture, "lynxtron-prefs.json");
  if (NodeFS.existsSync(prefsPath)) return;
  const manifest = JSON.parse(
    NodeFS.readFileSync(NodePath.join(fixture, "visual-state.json"), "utf8"),
  );
  const prefs = {
    themePreference: "dark",
    clientSettings: {},
    modelSelection: manifest.project.defaultModelSelection,
  };
  NodeFS.writeFileSync(prefsPath, `${JSON.stringify(prefs, null, 2)}\n`);
}

const fixture = (name) => NodePath.join(outputDir, "fixtures", name);

// One empty state per workspace; projection fixtures refuse a seeded state, so
// each starts from a copy of the empty one.
script("prepare-visual-state.mjs", ["--output", fixture("empty"), "--workspace", repoRoot]);
for (const name of ["sidebar", "message-card", "long-transcript"]) {
  NodeFS.cpSync(fixture("empty"), fixture(name), { recursive: true });
}
script("prepare-sidebar-visual-state.mjs", ["--base-dir", fixture("sidebar")]);
for (const name of ["message-card", "long-transcript"]) {
  script(`prepare-${name}-projection-fixture.mjs`, ["--base-dir", fixture(name)]);
}

// The review fixture commits a checkpoint, so it gets its own Git workspace.
const reviewWorkspace = NodePath.join(outputDir, "workspaces", "review");
NodeFS.mkdirSync(reviewWorkspace, { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(reviewWorkspace, "review-fixture.txt"),
  "original review fixture\n",
);
NodeFS.writeFileSync(
  NodePath.join(reviewWorkspace, "review-secondary.ts"),
  "export const reviewState = 'before';\n",
);
git(reviewWorkspace, ["init", "-q"]);
git(reviewWorkspace, ["add", "."]);
git(reviewWorkspace, [
  "-c",
  "user.name=fixture",
  "-c",
  "user.email=fixture@example.invalid",
  "commit",
  "-qm",
  "Initial review fixture",
]);
script("prepare-visual-state.mjs", ["--output", fixture("review"), "--workspace", reviewWorkspace]);
script("prepare-review-projection-fixture.mjs", ["--base-dir", fixture("review")]);

for (const name of ["sidebar", "message-card", "long-transcript", "review"]) {
  writePrefs(fixture(name));
}

const sidebar = (name, flags, viewport = {}) => ({
  name,
  fixture: fixture("sidebar"),
  cwd: repoRoot,
  flags,
  ...viewport,
});
const review = (name, flags) => ({
  name,
  fixture: fixture("review"),
  cwd: reviewWorkspace,
  flags,
});

const plan = [
  sidebar("readiness-1280-dark", ["--runs", "3", "--expected-theme", "dark"]),
  sidebar(
    "journeys-1440-dark",
    ["--expected-theme", "dark", "--verify-runtime-menu-dismiss", "--verify-sidebar-scope"],
    { width: 1440, height: 900 },
  ),
  sidebar("quick-switch", ["--verify-quick-switch-default"]),
  sidebar("settings-navigation", ["--verify-settings-navigation"]),
  sidebar("providers-settings", ["--verify-providers-settings"]),
  sidebar("settings-appearance", ["--verify-settings-appearance"]),
  sidebar("project-settings-page", ["--verify-project-settings-page"]),
  sidebar("lifecycle-reconnect", ["--verify-lifecycle-recovery"]),
  sidebar("terminal", ["--verify-terminal-lifecycle"]),
  sidebar("right-panel-add-menu", ["--verify-right-panel-add-menu"]),
  sidebar("files-desktop", ["--verify-files-browser"]),
  sidebar("files-sheet-700", ["--verify-files-browser", "--verify-file-sheet-back"], {
    width: 700,
  }),
  sidebar("sidebar-thread-menu", ["--verify-sidebar-thread-menu"]),
  sidebar("header-thread-menu", ["--verify-header-thread-menu"]),
  review("review-diff", ["--verify-review-diff-state"]),
  review("diff-scope", ["--verify-diff-scope-menu"]),
  review("checkpoint-revert-refusal", ["--verify-checkpoint-revert"]),
  {
    name: "message-cards",
    fixture: fixture("message-card"),
    cwd: repoRoot,
    flags: ["--verify-message-card-state"],
  },
  {
    name: "transcript-recycling",
    script: "scripts/verify-long-transcript-recycling.mjs",
    args: ["--fixture-dir", fixture("long-transcript"), "--output", "{out}"],
  },
];

const planPath = NodePath.join(outputDir, "plan.json");
NodeFS.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(planPath);
