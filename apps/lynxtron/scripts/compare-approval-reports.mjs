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
const nativeApproval = nativeRun?.approvalTranscriptState;
const expectedActions = ["Cancel turn", "Decline", "Always allow this session", "Approve once"];
const checks = {
  reportsPassed: electron.status === "pass" && native.status === "pass",
  head: electron.head === native.head,
  snapshot: electron.snapshotId === native.fixture?.snapshotId,
  thread:
    electron.fixture?.threadId === native.fixture?.pendingRequest?.threadId &&
    electron.fixture?.threadId === nativeApproval?.fixture?.threadId,
  request:
    electron.fixture?.requestId === native.fixture?.pendingRequest?.requestId &&
    electron.fixture?.requestId === nativeApproval?.fixture?.requestId,
  turn:
    electron.fixture?.activeTurnId === native.fixture?.pendingRequest?.activeTurnId &&
    electron.fixture?.activeTurnId === nativeApproval?.fixture?.activeTurnId,
  viewport:
    electron.state?.viewport?.width === native.viewport?.width &&
    electron.state?.viewport?.height === native.viewport?.height,
  theme: electron.state?.theme === native.expectedTheme && electron.state?.theme === "dark",
  composerState:
    electron.state?.composerState === nativeApproval?.semanticState?.composerState &&
    electron.state?.composerState === "working",
  detail: electron.state?.detail === nativeApproval?.content?.detail,
  actions:
    JSON.stringify(electron.state?.actions) === JSON.stringify(expectedActions) &&
    JSON.stringify(nativeApproval?.content?.actions) === JSON.stringify(expectedActions),
  actionsEnabled: electron.state?.disabled?.every((disabled) => disabled === false) === true,
  semanticOnly:
    electron.evidenceKind === "semantic-only" &&
    nativeApproval?.evidenceKind === "semantic-only" &&
    nativeApproval?.screenshot === undefined,
  projectionBoundary: electron.fixture?.backendBehaviorClaimed === false,
  nativeTransport: nativeRun?.transport?.kind === "main",
  cleanNativeRuntime: nativeRun?.rendererErrors === 0,
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
    requestId: electron.fixture?.requestId,
    activeTurnId: electron.fixture?.activeTurnId,
    viewport: electron.state?.viewport ?? null,
    theme: electron.state?.theme ?? null,
  },
  correlation: {
    detail: electron.state?.detail ?? null,
    actions: electron.state?.actions ?? [],
    electronComposerState: electron.state?.composerState ?? null,
    nativeComposerState: nativeApproval?.semanticState?.composerState ?? null,
  },
  limitation:
    "Same-snapshot semantic and geometry-gated Native evidence only; no screenshot or approval mutation is claimed.",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
