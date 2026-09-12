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
const relative = (child, parent) => ({ x: child.x - parent.x, y: child.y - parent.y });
const equalRectSize = (left, right) =>
  left?.width === right?.width && left?.height === right?.height;
const electronCardOrigin = relative(electron.state.card.rect, electron.state.attachmentList);
const nativeCardOrigin = relative(native.state.card.rect, native.state.attachmentList);
const electronPreviewOrigin = relative(electron.state.preview.rect, electron.state.card.rect);
const nativePreviewOrigin = relative(native.state.preview.rect, native.state.card.rect);
const electronRemoveInset = {
  top: electron.state.remove.rect.y - electron.state.card.rect.y,
  right:
    electron.state.card.rect.x +
    electron.state.card.rect.width -
    electron.state.remove.rect.x -
    electron.state.remove.rect.width,
};
const nativeRemoveInset = {
  top: native.state.remove.rect.y - native.state.card.rect.y,
  right:
    native.state.card.rect.x +
    native.state.card.rect.width -
    native.state.remove.rect.x -
    native.state.remove.rect.width,
};
const checks = {
  reportsPassed: electron.status === "pass" && native.status === "pass",
  head: electron.head === native.head,
  snapshot: electron.snapshotId === native.snapshotId,
  project: electron.fixture?.projectId === native.fixture?.projectId,
  attachment: electron.fixture?.attachment?.name === native.fixture?.attachment?.name,
  viewport:
    electron.state?.viewport?.width === native.state?.viewport?.width &&
    electron.state?.viewport?.height === native.state?.viewport?.height,
  theme: electron.state?.theme === native.state?.theme && electron.state?.theme === "dark",
  electronRendererIdentity:
    electron.rendererIdentity?.entryAssetUrl?.startsWith("t3code://app/assets/index-") === true &&
    /^[a-f0-9]{64}$/u.test(electron.rendererIdentity?.entryAssetSha256 ?? ""),
  frameWidth: electron.state.frame.width === native.state.frame.width,
  surface: equalRectSize(electron.state.surface, native.state.surface),
  attachmentListWidth: electron.state.attachmentList.width === native.state.attachmentList.width,
  cardSize: equalRectSize(electron.state.card.rect, native.state.card.rect),
  cardOrigin: JSON.stringify(electronCardOrigin) === JSON.stringify(nativeCardOrigin),
  cardRadius:
    electron.state.card.styles.borderRadius === "10px" &&
    native.state.card.styles.radius.every((value) => value === "10px"),
  previewSize: equalRectSize(electron.state.preview.rect, native.state.preview.rect),
  previewOrigin: JSON.stringify(electronPreviewOrigin) === JSON.stringify(nativePreviewOrigin),
  previewCover:
    electron.state.preview.styles.objectFit === "cover" &&
    native.state.preview.attributes.mode === "aspectFill",
  removeInset: JSON.stringify(electronRemoveInset) === JSON.stringify(nativeRemoveInset),
  removeSize: equalRectSize(electron.state.remove.rect, native.state.remove.rect),
  removed: electron.state.removed === true && native.state.removed === true,
  nativeTransport: native.state.transport?.kind === "main",
  nativeRendererClean: native.state.rendererErrors === 0,
  nativeCleanup: native.isolatedStateDisposed === true,
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
    frameWidth: electron.state.frame.width,
    surface: electron.state.surface,
    attachmentListWidth: electron.state.attachmentList.width,
    card: electron.state.card,
    preview: electron.state.preview,
    removeInset: electronRemoveInset,
  },
  limitation:
    "Same-snapshot attachment anatomy and removal behavior correlation without paired pixels. Native image selection remains blocked by the Lynxtron 0.0.21 file-dialog runtime failure.",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
