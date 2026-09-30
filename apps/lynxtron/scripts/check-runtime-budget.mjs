#!/usr/bin/env node

// Checks a verify-packaged-readiness report against reports/budgets/runtime.json:
// every run's semantic-ready time and process-tree RSS, and the bundle size.

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function checkRuntimeBudget(report, budgets, notes = []) {
  const failures = [];
  for (const result of report.results ?? []) {
    const readyMs = result.timing?.semanticReadyMs;
    const rssKiB = result.memory?.processTreeRssKiBAtSemanticReady;
    // Startup timing is only comparable when the host is not saturated.
    const saturated =
      typeof result.host?.loadAverage1m === "number" &&
      typeof result.host?.cpuCount === "number" &&
      result.host.loadAverage1m > result.host.cpuCount;
    if (typeof readyMs !== "number") failures.push(`run ${result.index}: no semanticReadyMs`);
    else if (saturated)
      notes.push(`run ${result.index}: timing skipped at load ${result.host.loadAverage1m}`);
    else if (readyMs > budgets.semanticReadyMs)
      failures.push(
        `run ${result.index}: semantic ready ${readyMs}ms > ${budgets.semanticReadyMs}ms`,
      );
    if (typeof rssKiB !== "number") failures.push(`run ${result.index}: no process-tree RSS`);
    else if (rssKiB > budgets.processTreeRssKiBAtSemanticReady)
      failures.push(
        `run ${result.index}: RSS ${rssKiB} KiB > ${budgets.processTreeRssKiBAtSemanticReady} KiB`,
      );
  }
  const bundleBytes = report.bundle?.bytes;
  if (typeof bundleBytes !== "number") failures.push("report has no bundle size");
  else if (bundleBytes > budgets.bundleBytes)
    failures.push(`bundle ${bundleBytes} bytes > ${budgets.bundleBytes} bytes`);
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reportPath = process.argv[2];
  if (!reportPath) throw new Error("Usage: check-runtime-budget.mjs <readiness-report.json>");
  const report = JSON.parse(readFileSync(path.resolve(reportPath), "utf8"));
  const { budgets } = JSON.parse(
    readFileSync(path.join(appRoot, "reports/budgets/runtime.json"), "utf8"),
  );
  const notes = [];
  const failures = checkRuntimeBudget(report, budgets, notes);
  for (const note of notes) console.log(note);
  for (const failure of failures) console.error(failure);
  console.log(failures.length === 0 ? "runtime budget: pass" : "runtime budget: fail");
  if (failures.length > 0) process.exitCode = 1;
}
