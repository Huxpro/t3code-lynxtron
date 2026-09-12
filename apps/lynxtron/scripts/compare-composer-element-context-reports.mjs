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
  reportsPassed: electron.status === "pass" && native.status === "pass",
  head: electron.head === native.head,
  snapshot: electron.snapshotId === native.snapshotId,
  project: electron.fixture?.projectId === native.fixture?.projectId,
  viewport:
    electron.state?.viewport?.width === native.state?.viewport?.width &&
    electron.state?.viewport?.height === native.state?.viewport?.height,
  theme: electron.state?.theme === native.state?.theme && electron.state?.theme === "dark",
  label:
    electron.state?.label?.text === "<SubmitButton>" &&
    native.state?.label?.text === electron.state.label.text,
  source:
    electron.state?.source?.text === "Button.tsx:12" &&
    native.state?.source?.text === electron.state.source.text,
  duplicateRejected:
    electron.state?.duplicateRejected === true && native.state?.duplicateRejected === true,
  contextOnlySendable:
    electron.state?.primaryAction?.disabled === false &&
    native.state?.primaryAction?.state === "send",
  removed: electron.state?.removed === true && native.state?.removed === true,
  nativePhysicalRemove: native.state?.interactionChannel === "Computer Use physical click",
  nativeColdRestart: native.state?.coldRestart?.status === "pass",
  nativeFailureRestoration:
    native.state?.sendRetry?.firstAttemptPreserved === true &&
    native.state?.sendRetry?.serializedOnRetry === true &&
    native.state?.sendRetry?.clearedAfterSuccess === true,
  nativeTransport:
    native.state?.transport?.kind === "main" &&
    native.state.transport.after > native.state.transport.before,
  nativeRendererClean: native.state?.rendererErrors === 0,
  noPixelsRetained:
    electron.evidenceKind === "semantic-geometry-only" && native.screenshotsRetained === 0,
};
const report = {
  schemaVersion: 1,
  status: Object.values(checks).every(Boolean) ? "pass" : "fail",
  recordedAt: new Date().toISOString(),
  checks,
  identity: {
    head: electron.head,
    snapshotId: electron.snapshotId,
    projectId: electron.fixture?.projectId,
    viewport: electron.state.viewport,
    theme: electron.state.theme,
    electronRendererIdentity: electron.rendererIdentity,
    nativeBundleSha256: native.bundleSha256,
  },
  geometry: {
    electron: {
      chip: electron.state.chip.rect,
      label: electron.state.label.rect,
      source: electron.state.source.rect,
      remove: electron.state.remove.rect,
    },
    native: {
      chip: native.state.chip.rect,
      label: native.state.label.rect,
      source: native.state.source.rect,
      remove: native.state.remove.rect,
    },
  },
  limitation:
    "Same-snapshot semantic, lifecycle, and geometry correlation without paired pixels. The Preview picker entry path was not exercised.",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
