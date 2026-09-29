#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const appRoot = path.resolve(import.meta.dirname, "..");
const defaultExecutable = path.join(
  appRoot,
  "release/mac-arm64/T3 Code Lynxtron.app/Contents/MacOS/T3 Code Lynxtron",
);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactLog(value) {
  return value
    .replace(/Token: [^\n]+/gu, "Token: <redacted>")
    .replace(/Pairing URL: [^\n]+/gu, "Pairing URL: <redacted>");
}

async function stopOwnedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
    await wait(50);
  }
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

const fixtureDir = path.resolve(argumentValue("--fixture-dir") ?? "");
const projectCwd = path.resolve(argumentValue("--project-cwd") ?? "");
const output = path.resolve(argumentValue("--output") ?? "");
const executable = path.resolve(argumentValue("--executable") ?? defaultExecutable);
const bundle = path.join(appRoot, "dist/desktop/main.lynx.bundle");
const timeoutMs = Number(argumentValue("--timeout-ms") ?? 45_000);
for (const required of [fixtureDir, projectCwd, executable, bundle]) {
  if (!existsSync(required)) throw new Error(`Required CEF probe path is missing: ${required}`);
}
if (!output) throw new Error("--output is required.");

const runRoot = mkdtempSync(path.join(os.tmpdir(), "t3-cef-webview-probe-"));
const baseDir = path.join(runRoot, "state");
const receiptPath = path.join(runRoot, "browser-receipt.json");
cpSync(fixtureDir, baseDir, { recursive: true });
const prefsPath = path.join(baseDir, "lynxtron-prefs.json");
const prefs = existsSync(prefsPath) ? JSON.parse(readFileSync(prefsPath, "utf8")) : {};
writeFileSync(prefsPath, `${JSON.stringify({ ...prefs, initialOverlay: "browser" }, null, 2)}\n`);
const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>T3 CEF probe</title><h1 data-t3-cef-probe>ready</h1>");
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("CEF probe server has no port.");
const successUrl = `http://127.0.0.1:${address.port}/success`;
let log = "";
const child = spawn(executable, [path.join(appRoot, "dist/desktop")], {
  cwd: appRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    T3_LYNXTRON_BACKGROUND: process.env.T3_LYNXTRON_BACKGROUND ?? "1",
    T3_LYNXTRON_BASE_DIR: baseDir,
    T3_LYNXTRON_PROJECT_CWD: projectCwd,
    T3_LYNXTRON_VIEWPORT_WIDTH: "1280",
    T3_LYNXTRON_VIEWPORT_HEIGHT: "820",
    T3_LYNXTRON_CEF_WEBVIEW: "1",
    T3_LYNXTRON_BROWSER_PROBE_REPORT: receiptPath,
    T3_LYNXTRON_BROWSER_PROBE_SUCCESS_URL: successUrl,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout?.on("data", (chunk) => {
  log += String(chunk);
});
child.stderr?.on("data", (chunk) => {
  log += String(chunk);
});
const startedAt = new Date().toISOString();
let receipt = null;
try {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(receiptPath)) {
      receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (receipt?.status === "pass") break;
    }
    if (child.exitCode !== null || child.signalCode !== null) break;
    await wait(100);
  }
  const report = {
    schemaVersion: 1,
    status: receipt?.status === "pass" ? "pass" : "fail",
    startedAt,
    recordedAt: new Date().toISOString(),
    executable,
    processId: child.pid,
    isolatedState: baseDir,
    successUrl,
    bundle: { path: bundle, bytes: readFileSync(bundle).length, sha256: sha256(bundle) },
    initializeReturned: log.includes("[cef-webview] initialize returned true"),
    serverReady: log.includes("T3 Code server is ready."),
    cacheRootWarning: log.includes("Please customize CefSettings.root_cache_path"),
    duplicateClassWarning: log.includes("Class CrCoreCursor is implemented in both"),
    receipt,
    log: redactLog(log),
  };
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(path.dirname(output), { recursive: true }).then(() =>
      writeFile(output, `${JSON.stringify(report, null, 2)}\n`),
    ),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "pass") process.exitCode = 1;
} finally {
  await stopOwnedChild(child);
  await new Promise((resolve) => server.close(resolve));
  rmSync(runRoot, { recursive: true, force: true });
}
