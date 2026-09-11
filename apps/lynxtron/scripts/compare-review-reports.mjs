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
const nativeRun = native.results?.[0];
const nativeReview = nativeRun?.reviewDiffState;
const expectedLines = ["original review fixture", "updated by T3 review fixture"];
const checks = {
  reportsPassed: electron.status === "pass" && native.status === "pass",
  head: electron.head === native.head,
  snapshot: electron.snapshotId === native.fixture?.snapshotId,
  thread: electron.fixture?.threadId === nativeReview?.fixture?.threadId,
  turn:
    electron.fixture?.turnId === nativeReview?.fixture?.turnId &&
    electron.fixture?.turnId === nativeReview?.diffSurface?.selectedTurn,
  file: electron.fixture?.file?.path === nativeReview?.fixture?.file?.path,
  viewport:
    electron.state?.viewport?.width === native.viewport?.width &&
    electron.state?.viewport?.height === native.viewport?.height,
  theme: electron.state?.theme === native.expectedTheme && electron.state?.theme === "dark",
  checkpoint:
    electron.state?.selectedTurn === nativeReview?.diffSurface?.selectedTurn &&
    electron.state?.checkpointCount === "1" &&
    electron.state?.fileCount === "1",
  electronPatchReady: electron.state?.codeDiff === true,
  nativePatchContent: expectedLines.every((line) => nativeReview?.diffFile?.text?.includes(line)),
  noTransientState: electron.state?.loading === false && electron.state?.error === false,
  semanticOnly:
    electron.evidenceKind === "semantic-only" &&
    nativeReview?.evidenceKind === "semantic-only" &&
    nativeReview?.screenshot === undefined,
  projectionBoundary: electron.fixture?.backendBehaviorClaimed === false,
  nativeTransport: nativeRun?.transport?.kind === "main",
  cleanNativeRuntime: nativeRun?.rendererErrors === 0,
  nativeCleanup: nativeRun?.isolatedState?.disposed === true,
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
    threadId: electron.fixture?.threadId,
    turnId: electron.fixture?.turnId,
    file: electron.fixture?.file ?? null,
    viewport: electron.state?.viewport ?? null,
    theme: electron.state?.theme ?? null,
  },
  correlation: {
    expectedLines,
    electronSelectedTurn: electron.state?.selectedTurn ?? null,
    nativeSelectedTurn: nativeReview?.diffSurface?.selectedTurn ?? null,
    nativeGeometry: {
      checkpointCard: nativeReview?.checkpointCard?.rect ?? null,
      rightPanel: nativeReview?.rightPanel?.rect ?? null,
      diffSurface: nativeReview?.diffSurface?.rect ?? null,
      diffFile: nativeReview?.diffFile?.rect ?? null,
      composer: nativeReview?.composer?.rect ?? null,
    },
  },
  limitation:
    "Same-snapshot Electron checkpoint/file/renderer readiness and exact-bundle Native patch semantics with Native geometry only; Electron's closed diff render tree does not expose changed-line text to CDP, and no paired pixels, physical input, or backend behavior is claimed.",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
