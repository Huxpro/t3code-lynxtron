#!/usr/bin/env node

// Runs a Native certification battery sequentially from a plan file and writes
// one summary. Each plan entry is either a readiness gate run
// ({ name, fixture, cwd, width?, height?, flags }) or another script
// ({ name, script, args }). Fixture paths are machine-specific, so plans live
// outside the repository. Lynxtron launches in the background.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { checkRuntimeBudget } from "./check-runtime-budget.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [planPath, outputDir] = process.argv.slice(2);
if (!planPath || !outputDir) {
  throw new Error("Usage: run-native-battery.mjs <plan.json> <output-dir>");
}
const plan = JSON.parse(readFileSync(path.resolve(planPath), "utf8"));
const { budgets } = JSON.parse(
  readFileSync(path.join(appRoot, "reports/budgets/runtime.json"), "utf8"),
);
mkdirSync(outputDir, { recursive: true });

const entries = [];
for (const entry of plan) {
  const entryDir = path.join(outputDir, entry.name);
  mkdirSync(entryDir, { recursive: true });
  const reportPath = path.join(entryDir, "report.json");
  const args = entry.script
    ? [
        path.join(appRoot, entry.script),
        ...(entry.args ?? []).map((arg) => arg.replace("{out}", reportPath)),
      ]
    : [
        path.join(appRoot, "scripts/verify-packaged-readiness.mjs"),
        "--fixture-dir",
        entry.fixture,
        "--project-cwd",
        entry.cwd,
        "--output",
        reportPath,
        "--width",
        String(entry.width ?? 1280),
        "--height",
        String(entry.height ?? 820),
        "--timeout-ms",
        String(entry.timeoutMs ?? 60000),
        ...(entry.flags ?? []),
        ...((entry.flags ?? []).includes("--runs") ? [] : ["--runs", "1"]),
      ];
  const startedAt = Date.now();
  const run = spawnSync(process.execPath, args, {
    cwd: appRoot,
    encoding: "utf8",
    env: { ...process.env, T3_LYNXTRON_BACKGROUND: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(path.join(entryDir, "output.log"), `${run.stdout ?? ""}${run.stderr ?? ""}`);
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
  const results = report?.results ?? (report ? [report] : []);
  const failed = results.find((result) => result.status !== "pass");
  const budgetFailures =
    report?.results && !entry.script && entry.budget ? checkRuntimeBudget(report, budgets) : [];
  const status =
    run.status === 0 && results.length > 0 && !failed && budgetFailures.length === 0
      ? "pass"
      : "fail";
  entries.push({
    name: entry.name,
    status,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    viewport: entry.script ? null : `${entry.width ?? 1280}x${entry.height ?? 820}`,
    flags: entry.flags ?? entry.args ?? [],
    error:
      failed?.error?.slice(0, 400) ?? (run.status === 0 ? null : (run.stderr ?? "").slice(-400)),
    budgetFailures,
    timing: results.map((result) => result.timing).filter(Boolean),
  });
  console.log(`${status} ${entry.name}`);
}
const summary = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  passed: entries.filter((entry) => entry.status === "pass").length,
  failed: entries.filter((entry) => entry.status === "fail").length,
  entries,
};
writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
if (summary.failed > 0) process.exitCode = 1;
