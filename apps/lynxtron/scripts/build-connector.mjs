#!/usr/bin/env node
/**
 * Bundle the Node-side connector, which starts or finds the server and gets
 * its bearer, as CommonJS for the Lynxtron main process to load.
 */
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = path.join(appRoot, "dist/desktop/connector.bundle.cjs");

await mkdir(path.dirname(outputFile), { recursive: true });
await build({
  entryPoints: [path.join(appRoot, "src/main/desktop/connector.ts")],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["node:*"],
  resolveExtensions: [".ts", ".js", ".mjs", ".json"],
  logLevel: "warning",
  sourcemap: true,
});

console.log(`[build-connector] wrote ${outputFile}`);
