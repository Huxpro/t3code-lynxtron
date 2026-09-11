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
const expectedTaskCount = electron.fixture?.taskCount ?? electron.state?.taskCount;
const checks = {
  reportsPassed: electron.status === "pass" && native.status === "pass",
  head: electron.head === native.head,
  snapshot: electron.snapshotId === native.snapshotId,
  project: electron.fixture?.projectId === native.fixture?.projectId,
  file: electron.fixture?.relativePath === native.fixture?.relativePath,
  before: electron.fixture?.before === native.fixture?.before,
  after: electron.fixture?.after === native.fixture?.after,
  viewport:
    electron.state?.viewport?.width === native.state?.viewport?.width &&
    electron.state?.viewport?.height === native.state?.viewport?.height,
  theme: electron.state?.theme === native.state?.theme && electron.state?.theme === "dark",
  taskCount:
    Number.isInteger(expectedTaskCount) &&
    electron.state?.taskCount === expectedTaskCount &&
    native.state?.taskCount === expectedTaskCount,
  checked:
    electron.state?.checked?.length === expectedTaskCount &&
    native.state?.checked?.length === expectedTaskCount &&
    electron.state.checked.every((checked) => checked === true) &&
    native.state.checked.every((checked) => checked === true),
  fileHash: electron.state?.fileSha256 === native.state?.fileSha256,
  cleanSaves:
    electron.state?.saveError === false &&
    native.state?.saveStatus === "saved" &&
    native.state?.saveError === null,
  semanticOnly:
    electron.evidenceKind === "semantic-only" && native.evidenceKind === "semantic-only",
  backendBehavior:
    electron.fixture?.backendBehaviorClaimed === true &&
    native.fixture?.backendBehaviorClaimed === true,
  nativeTransport: native.state?.transport?.kind === "main",
  nativeRendererClean: native.state?.rendererErrors === 0,
  nativeCleanup: native.isolatedStateDisposed === true,
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
    projectId: electron.fixture?.projectId,
    relativePath: electron.fixture?.relativePath,
    viewport: electron.state?.viewport,
    theme: electron.state?.theme,
  },
  mutation: {
    before: electron.fixture?.before,
    after: electron.fixture?.after,
    fileSha256: electron.state?.fileSha256,
  },
  limitation:
    "Same-snapshot Electron semantic source-of-truth and exact-owned Native physical mutation correlation; no paired pixels or keyboard checkbox activation is claimed.",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
