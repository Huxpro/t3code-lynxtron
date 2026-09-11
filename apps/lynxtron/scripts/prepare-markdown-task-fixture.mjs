#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const MARKDOWN_TASK_BEFORE = "# Tasks\n\n- [ ] First task\n- [x] Second task\n";
export const MARKDOWN_TASK_AFTER = "# Tasks\n\n- [x] First task\n- [x] Second task\n";
export const MARKDOWN_NESTED_TASK_BEFORE =
  "# Nested tasks\n\n> - [ ] Quoted task\n\n<details open>\n<summary>More</summary>\n- [ ] Detailed task\n</details>\n";
export const MARKDOWN_NESTED_TASK_AFTER =
  "# Nested tasks\n\n> - [x] Quoted task\n\n<details open>\n<summary>More</summary>\n- [ ] Detailed task\n</details>\n";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function prepareMarkdownTaskFixture(baseDirectory, variant = "simple") {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Markdown task fixture requires a directory created by visual:prepare.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.threadCount !== 0 || manifest.route !== "new-thread") {
    throw new Error("Markdown task fixture refuses a non-empty visual state.");
  }
  const workspaceRoot = realpathSync(manifest.project?.workspaceRoot ?? "");
  const relativePath = "README.md";
  const filePath = path.join(workspaceRoot, relativePath);
  const before = variant === "nested" ? MARKDOWN_NESTED_TASK_BEFORE : MARKDOWN_TASK_BEFORE;
  const after = variant === "nested" ? MARKDOWN_NESTED_TASK_AFTER : MARKDOWN_TASK_AFTER;
  if (!existsSync(filePath) || readFileSync(filePath, "utf8") !== before) {
    throw new Error("Markdown task fixture requires the canonical README task list.");
  }
  const modelSelection = manifest.project.defaultModelSelection ?? {
    instanceId: "codex",
    model: "gpt-5.6-sol",
  };
  const nextManifest = {
    ...manifest,
    markdownTaskFixture: {
      variant,
      relativePath,
      before,
      after,
      taskCount: variant === "nested" ? 1 : 2,
    },
    preparation: {
      kind: "canonical-markdown-task-fixture",
      backendBehaviorClaimed: true,
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  writeFileSync(
    path.join(baseDir, "lynxtron-prefs.json"),
    `${JSON.stringify({ themePreference: "dark", clientSettings: {}, modelSelection }, null, 2)}\n`,
  );
  return nextManifest;
}

const baseDir = argumentValue("--base-dir");
if (!baseDir) throw new Error("--base-dir is required.");
const variant = argumentValue("--variant") ?? "simple";
if (variant !== "simple" && variant !== "nested") {
  throw new Error("--variant must be simple or nested.");
}
process.stdout.write(`${JSON.stringify(prepareMarkdownTaskFixture(baseDir, variant), null, 2)}\n`);
