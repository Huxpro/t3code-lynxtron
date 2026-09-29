#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReadableStream } from "node:stream/web";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(appRoot, "../..");
const connectorPath =
  process.env.LYNX_DEVTOOL_CONNECTOR ??
  path.join(process.env.HOME ?? "", ".agents/skills/lynx-devtool/scripts/connector.mjs");
const withholdBridge = process.argv.includes("--withhold-bridge");
function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const explicitStage = argumentValue("--stage");
const outputPath = argumentValue("--output");
const identificationMode = argumentValue("--identification-mode") ?? "artwork";
const readinessTimeoutMs = withholdBridge ? 6_000 : 30_000;

export function collectDescendantPids(rootPid, listChildren) {
  const result = [rootPid];
  for (let index = 0; index < result.length; index += 1) {
    for (const child of listChildren(result[index])) {
      if (!result.includes(child)) result.push(child);
    }
  }
  return result;
}

function childPids(parentPid) {
  try {
    return execFileSync("pgrep", ["-P", String(parentPid)], { encoding: "utf8" })
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter(Number.isSafeInteger);
  } catch {
    return [];
  }
}

export function parseListeningPorts(output) {
  return new Set(
    String(output)
      .split("\n")
      .map((line) => /^n.*:(\d+)$/.exec(line)?.[1])
      .filter(Boolean)
      .map(Number),
  );
}

function listeningPortsForPid(pid) {
  try {
    return parseListeningPorts(
      execFileSync("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], {
        encoding: "utf8",
      }),
    );
  } catch {
    return new Set();
  }
}

export function clientMatchesOwnedPorts(client, ports) {
  const serialized = JSON.stringify(client);
  return [...ports].some((port) =>
    new RegExp(`(?:localhost|127\.0\.0\.1):${port}\\b`).test(serialized),
  );
}

function unwrapEvaluation(response) {
  return response?.result?.result ?? response?.result ?? response;
}

async function evaluateTransport(connector, clientId, sessionId) {
  const response = await connector.sendCDPMessage(clientId, sessionId, "Runtime.evaluate", {
    expression:
      "JSON.stringify({kind:globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__?.kind,lastSeq:globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__?.lastSeq?.()})",
    returnByValue: true,
  });
  const value = unwrapEvaluation(response)?.value;
  return typeof value === "string" ? JSON.parse(value) : null;
}

async function collectConsoleProblems(connector, clientId, sessionId) {
  const stream = await connector.sendCDPStream(
    clientId,
    sessionId,
    ReadableStream.from([
      { method: "Page.enable" },
      { method: "Runtime.enable" },
      { method: "Runtime.enable", sessionId: "Main" },
    ]),
  );
  const reader = stream.getReader();
  const problems = [];
  try {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const next = await Promise.race([reader.read(), delay(250, { idle: true })]);
      if (next?.idle || next.done) break;
      if (
        next.value?.method === "Runtime.consoleAPICalled" &&
        ["warning", "error"].includes(next.value.params?.type)
      ) {
        problems.push({
          type: next.value.params.type,
          text: (next.value.params.args ?? [])
            .map((argument) => argument.value ?? argument.description ?? "")
            .join(" "),
        });
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return problems;
}

export function unwrapDocumentRoot(response) {
  return response?.root ?? response?.result?.root ?? response?.result?.result?.root ?? null;
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/gu, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/giu, (_match, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    );
}

export function renderedTextFromOuterHtml(outerHTML) {
  if (typeof outerHTML !== "string") return "";
  return [...outerHTML.matchAll(/\stext="([^"]*)"/gu)]
    .map((match) => decodeHtmlAttribute(match[1]))
    .filter(Boolean)
    .join(" ");
}

async function waitFor(read, label, timeoutMs = readinessTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `Timed out waiting for ${label}${lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ""}`,
  );
}

async function run() {
  const stateDir = mkdtempSync(path.join(tmpdir(), "t3code-oc1-readiness-"));
  writeFileSync(
    path.join(stateDir, "lynxtron-prefs.json"),
    `${JSON.stringify({ clientSettings: { environmentIdentificationMode: identificationMode } })}\n`,
  );
  const cliPath = path.join(appRoot, "node_modules/@lynx-js/lynxtron/cli.js");
  const child = spawn(process.execPath, [cliPath, "./dist/desktop"], {
    cwd: appRoot,
    env: {
      ...process.env,
      T3_LYNXTRON_BASE_DIR: stateDir,
      T3_LYNXTRON_PROJECT_CWD: workspaceRoot,
      T3_LYNXTRON_SERVER_STDIO: "inherit",
      T3_LYNXTRON_VIEWPORT_HEIGHT: "820",
      T3_LYNXTRON_VIEWPORT_WIDTH: "1280",
      ...(explicitStage ? { T3_LYNXTRON_APP_STAGE_LABEL: explicitStage } : {}),
      ...(withholdBridge ? { T3_LYNXTRON_WITHHOLD_CONNECTOR_BRIDGE: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });

  let connector;
  try {
    if (!withholdBridge) {
      await waitFor(() => logs.includes("T3 Code server is ready."), "server-ready signal");
    }
    const { createDefaultConnector } = await import(pathToFileURL(connectorPath).href);
    connector = createDefaultConnector();
    const owned = await waitFor(async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`packaged app exited early (${child.exitCode ?? child.signalCode})`);
      }
      const descendants = collectDescendantPids(child.pid, childPids);
      const ports = new Set(descendants.flatMap((pid) => [...listeningPortsForPid(pid)]));
      const clients = await connector.listClients();
      const matches = clients.filter((client) => clientMatchesOwnedPorts(client, ports));
      if (matches.length !== 1) return null;
      const sessions = (await connector.sendListSessionMessage(matches[0].id))
        .filter((session) => session.type === "lynx")
        .sort((left, right) => Number(left.session_id) - Number(right.session_id));
      const session = sessions.at(-1);
      return session ? { client: matches[0], descendants, ports: [...ports], session } : null;
    }, "one PID-owned Lynx DevTool session");

    const expectedBundle = path.join(appRoot, "dist/desktop/main.lynx.bundle");
    if (!owned.session.url.endsWith(expectedBundle)) {
      throw new Error(`owned session loaded unexpected bundle: ${owned.session.url}`);
    }
    const initialTransport = await waitFor(async () => {
      const parsed = await evaluateTransport(
        connector,
        owned.client.id,
        Number(owned.session.session_id),
      );
      return parsed?.kind === "main" && Number.isInteger(parsed.lastSeq) && parsed.lastSeq >= 0
        ? parsed
        : null;
    }, "main transport semantic readiness");

    await connector.sendCDPMessage(
      owned.client.id,
      Number(owned.session.session_id),
      "DOM.enable",
      {
        useCompression: false,
      },
    );
    const renderedOuterHtml = await waitFor(async () => {
      const documentResponse = await connector.sendCDPMessage(
        owned.client.id,
        Number(owned.session.session_id),
        "DOM.getDocument",
        { depth: -1 },
      );
      const root = unwrapDocumentRoot(documentResponse);
      const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
      if (!rootNodeId) return null;
      const outerHtmlResponse = await connector.sendCDPMessage(
        owned.client.id,
        Number(owned.session.session_id),
        "DOM.getOuterHTML",
        { nodeId: rootNodeId },
      );
      const current = renderedTextFromOuterHtml(unwrapEvaluation(outerHtmlResponse)?.outerHTML);
      const hasCanonicalState = ["t3code", "Claude Fable 5", "What should we build in"].every(
        (expected) => current.includes(expected),
      );
      return hasCanonicalState && !current.includes("Connecting")
        ? unwrapEvaluation(outerHtmlResponse)?.outerHTML
        : null;
    }, "canonical project/model UI without Connecting");
    const expectedStage = explicitStage ?? "Dev";
    const expectedVariant =
      expectedStage === "Dev" ? "dev" : expectedStage === "Nightly" ? "nightly" : null;
    const expectedBackdropClass = expectedVariant
      ? `sidebar-stage-backdrop--${expectedVariant}`
      : null;
    const hasBackdrop = renderedOuterHtml.includes("sidebar-stage-backdrop--");
    const hasPill = renderedOuterHtml.includes('data-environment-identification="pill"');
    if (identificationMode === "artwork") {
      if (
        expectedBackdropClass ? !renderedOuterHtml.includes(expectedBackdropClass) : hasBackdrop
      ) {
        throw new Error(`stage artwork mismatch for ${expectedStage}`);
      }
      if (hasPill) throw new Error("artwork mode unexpectedly rendered a stage pill");
    } else if (identificationMode === "pill") {
      const shouldRenderPill = expectedVariant !== null;
      if (hasBackdrop || hasPill !== shouldRenderPill) {
        throw new Error(`stage pill mismatch for ${expectedStage}`);
      }
    } else if (identificationMode === "none") {
      if (hasBackdrop || hasPill) throw new Error("none mode rendered stage identification");
    } else {
      throw new Error(`unsupported identification mode: ${identificationMode}`);
    }
    const finalTransport = await waitFor(async () => {
      const parsed = await evaluateTransport(
        connector,
        owned.client.id,
        Number(owned.session.session_id),
      );
      return parsed?.kind === "main" && parsed.lastSeq > initialTransport.lastSeq ? parsed : null;
    }, "advancing connector sequence");
    const consoleProblems = await collectConsoleProblems(
      connector,
      owned.client.id,
      Number(owned.session.session_id),
    );
    if (consoleProblems.length > 0) {
      throw new Error("renderer console problems: " + JSON.stringify(consoleProblems));
    }

    const report = {
      ok: true,
      rootPid: child.pid,
      descendantPids: owned.descendants,
      ownedPorts: owned.ports.sort((a, b) => a - b),
      clientId: owned.client.id,
      sessionId: Number(owned.session.session_id),
      bundleUrl: owned.session.url,
      stateDir,
      transport: { initial: initialTransport, final: finalTransport },
      canonicalUi: { project: "t3code", model: "Claude Fable 5", connecting: false },
      branding: {
        stage: expectedStage,
        identificationMode,
        backdrop: hasBackdrop ? expectedBackdropClass : null,
        pill: hasPill ? expectedStage : null,
      },
      rendererConsoleProblems: [],
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (outputPath) {
      writeFileSync(path.resolve(appRoot, outputPath), serialized);
    }
    process.stdout.write(serialized);
  } finally {
    await connector?.close?.().catch(() => undefined);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGINT");
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5_000)]);
    }
    rmSync(stateDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
