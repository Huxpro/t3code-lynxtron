#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const mainThreadPath = path.resolve(
  appRoot,
  process.argv[2] ?? "output/bundle/lynx/.rspeedy/main/main-thread.js",
);
const productionBundlePath = path.resolve(appRoot, "output/bundle/lynx/main.lynx.bundle");

if (!existsSync(mainThreadPath)) {
  const bundle = readFileSync(productionBundlePath);
  const requiredStrings = [
    "main-thread:bindmousemove",
    "main-thread:bindtouchmove",
    "main-thread:bindmouseup",
    "main-thread:bindtouchend",
    "main-thread:bindtouchcancel",
    "handleRef",
    "hit-slop",
    "dragRef",
    "wheelStateRef",
  ];
  const forbiddenStrings = [
    "main-thread:global-bindmousemove",
    "main-thread:global-bindtouchmove",
    "main-thread:global-bindmouseup",
    "main-thread:global-bindtouchend",
    "main-thread:global-bindtouchcancel",
    "resolveMainThreadResizeWidth",
    "pointerClientX",
  ];
  const errors = [];
  for (const value of requiredStrings) {
    if (!bundle.includes(Buffer.from(value))) {
      errors.push(`production bundle is missing ${value}`);
    }
  }
  for (const value of forbiddenStrings) {
    if (bundle.includes(Buffer.from(value))) {
      errors.push(`production bundle contains forbidden ${value}`);
    }
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`[audit-main-thread-script] ${error}`);
    process.exit(1);
  }
  console.log("[audit-main-thread-script] PASS production bundle uses local resize capture events");
  process.exit(0);
}

const bundle = readFileSync(mainThreadPath, "utf8");
const forbiddenCaptures = new Set([
  "finish",
  "mainThreadPointerX",
  "resolveMainThreadResizeWidth",
  "setMainThreadResizeWidth",
]);
const productionContextMarkers = ["dragRef", "wheelStateRef"];
const contextPattern = /_c:\{([^}]*)\},_wkltId/gu;
const contexts = [...bundle.matchAll(contextPattern)]
  .map((match) => match[1])
  .filter((context) => productionContextMarkers.some((marker) => context.includes(marker)));

const errors = [];
if (contexts.length !== 5) {
  errors.push(`expected 5 production MTS contexts, received ${contexts.length}`);
}

for (const context of contexts) {
  const names = context
    .split(",")
    .map((entry) => entry.split(":")[0]?.trim())
    .filter(Boolean);
  for (const name of names) {
    if (forbiddenCaptures.has(name)) {
      errors.push(`forbidden function/worklet capture ${name} in context ${context}`);
    }
  }
}

const resizeContexts = contexts.filter((context) => context.includes("dragRef"));
const wheelContexts = contexts.filter((context) => context.includes("wheelStateRef"));
if (resizeContexts.length !== 4) {
  errors.push(`expected 4 resize MTS contexts, received ${resizeContexts.length}`);
}
if (wheelContexts.length !== 1) {
  errors.push(`expected 1 model-picker wheel MTS context, received ${wheelContexts.length}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[audit-main-thread-script] ${error}`);
  process.exit(1);
}

console.log(
  `[audit-main-thread-script] PASS ${contexts.length} production contexts: ` +
    `${resizeContexts.length} resize, ${wheelContexts.length} model-picker wheel`,
);
