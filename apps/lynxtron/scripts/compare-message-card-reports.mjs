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
const nativeCards = nativeRun?.messageCardState;
const normalized = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const semanticFragments = [
  "Keep the shared card semantics aligned.",
  "Tighten the card hierarchy.",
  "1 selected element.",
  "<CardBody> (src/card.tsx:5)",
];
const checks = {
  reportsPassed: electron.status === "pass" && native.status === "pass",
  head: electron.head === native.head,
  snapshot: electron.snapshotId === native.fixture?.snapshotId,
  thread: electron.fixture?.threadId === nativeCards?.fixture?.threadId,
  turn: electron.fixture?.turnId === nativeCards?.fixture?.turnId,
  message: electron.fixture?.userMessageId === nativeCards?.fixture?.userMessageId,
  viewport:
    electron.state?.viewport?.width === native.viewport?.width &&
    electron.state?.viewport?.height === native.viewport?.height,
  theme: electron.state?.theme === native.expectedTheme && electron.state?.theme === "dark",
  reviewIdentity:
    electron.state?.review?.filePath === nativeCards?.review?.filePath &&
    electron.state?.review?.rangeLabel === nativeCards?.review?.rangeLabel,
  previewIdentity: electron.state?.preview?.id === nativeCards?.preview?.id,
  elementIdentity: electron.state?.element?.kind === nativeCards?.element?.kind,
  visibleSemantics: semanticFragments.every(
    (fragment) =>
      normalized(electron.state?.visiblePageText).includes(fragment) &&
      normalized(
        `${nativeCards?.review?.text ?? ""} ${nativeCards?.preview?.text ?? ""} ${nativeCards?.element?.text ?? ""}`,
      ).includes(fragment),
  ),
  semanticOnly:
    electron.evidenceKind === "semantic-only" && nativeCards?.evidenceKind === "semantic-only",
  projectionBoundary: electron.fixture?.backendBehaviorClaimed === false,
  nativeProgrammaticNavigation: nativeCards?.navigation === "programmatic-list-probe",
  nativeTransport: nativeRun?.transport?.kind === "main",
  cleanNativeRuntime: nativeRun?.rendererErrors === 0,
  cleanedNativeState: nativeRun?.isolatedState?.disposed === true,
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
    userMessageId: electron.fixture?.userMessageId,
    viewport: electron.state?.viewport ?? null,
    theme: electron.state?.theme ?? null,
  },
  cards: {
    review: {
      filePath: electron.state?.review?.filePath,
      rangeLabel: electron.state?.review?.rangeLabel,
    },
    preview: { id: electron.state?.preview?.id },
    element: { kind: electron.state?.element?.kind },
    semanticFragments,
  },
  limitation:
    "Same-snapshot renderer-visible semantics only; Native navigation is programmatic and no paired pixels or interaction are claimed.",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
