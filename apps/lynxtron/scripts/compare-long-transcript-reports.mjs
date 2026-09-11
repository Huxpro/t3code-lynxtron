#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const electronPath = path.resolve(argumentValue("--electron") ?? "");
const nativePath = path.resolve(argumentValue("--native") ?? "");
const outputPath = path.resolve(argumentValue("--output") ?? "");
if (!argumentValue("--electron") || !argumentValue("--native") || !argumentValue("--output")) {
  throw new Error("--electron, --native, and --output are required.");
}
const electron = JSON.parse(readFileSync(electronPath, "utf8"));
const native = JSON.parse(readFileSync(nativePath, "utf8"));
const checks = {
  head: electron.head === native.head,
  snapshot: electron.snapshotId === native.fixture?.snapshotId,
  thread:
    electron.threadId === native.fixture?.threadId &&
    native.readiness?.activeThreadId === electron.threadId,
  viewport:
    electron.state?.viewport?.width === native.viewport?.width &&
    electron.state?.viewport?.height === native.viewport?.height,
  canonicalTurns:
    electron.state?.minimapItemCount === native.geometry?.minimapItemCount &&
    electron.state?.minimapItemCount * 2 === native.recycling?.canonicalRowCount,
  firstTurn:
    electron.state?.firstMinimapItemId === "fidelity-long-turn-001-user" &&
    native.recycling?.startRowIds?.includes("fidelity-long-turn-001-user"),
  lastTurn:
    electron.state?.lastMinimapItemId === "fidelity-long-turn-120-user" &&
    native.recycling?.endRowIds?.some((id) => id?.startsWith("fidelity-long-turn-120-")),
  nativeRecycling: native.recycling?.status === "pass",
  cleanRuntime: Array.isArray(native.rendererErrors) && native.rendererErrors.length === 0,
};
const report = {
  schemaVersion: 1,
  status: Object.values(checks).every(Boolean) ? "pass" : "fail",
  recordedAt: new Date().toISOString(),
  checks,
  source: { electron: electronPath, native: nativePath },
  identity: {
    head: electron.head,
    snapshotId: electron.snapshotId,
    threadId: electron.threadId,
    viewport: electron.state?.viewport ?? null,
  },
  correlation: {
    electronMinimapTurns: electron.state?.minimapItemCount ?? null,
    nativeMinimapTurns: native.geometry?.minimapItemCount ?? null,
    nativeCanonicalRows: native.recycling?.canonicalRowCount ?? null,
    electronMaterializedRows: electron.state?.materializedRowIds ?? [],
    nativeStartRows: native.recycling?.startRowIds ?? [],
    nativeEndRows: native.recycling?.endRowIds ?? [],
  },
  limitation:
    "Programmatic position correlation and native recycling evidence only; physical wheel, keyboard, focus, drag, and selection remain pending real OS input.",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
