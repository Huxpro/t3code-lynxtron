import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  onEvent(listener) {
    this.listeners.add(listener);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ?? response.exceptionDetails.text,
    );
  }
  return response.result?.value;
}

const endpoint = argumentValue("--endpoint", "http://127.0.0.1:9353");
const outputDirectory = path.resolve(
  argumentValue("--output", "evidence/2026-08-02/BW1.5/web-route"),
);
const navigateUrl = argumentValue("--navigate", "");
const expectedProject = argumentValue("--project", "");
const expectedThread = argumentValue("--thread", "");
const expectedModel = argumentValue("--model", "");
const timeoutMs = Number(argumentValue("--timeout-ms", "15000"));
const width = Number(argumentValue("--viewport-width", "1280"));
const height = Number(argumentValue("--viewport-height", "820"));
const deviceScaleFactor = Number(argumentValue("--device-scale-factor", "1"));
const requireReady = process.argv.includes("--require-ready");

const [versionResponse, targetsResponse] = await Promise.all([
  fetch(new URL("/json/version", endpoint)),
  fetch(new URL("/json/list", endpoint)),
]);
const browser = await versionResponse.json();
const targets = await targetsResponse.json();
const target = targets.find(
  (candidate) => candidate.type === "page" && /^https?:/.test(candidate.url),
);
if (!target) throw new Error(`No HTTP page target found at ${endpoint}`);

const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
const consoleEvents = [];
await Promise.all([
  client.send("Runtime.enable"),
  client.send("Log.enable"),
  client.send("Page.enable"),
  client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: false,
  }),
]);
client.onEvent((message) => {
  if (message.method === "Runtime.consoleAPICalled") {
    consoleEvents.push({
      source: "console",
      level: message.params.type,
      text: message.params.args.map((argument) => argument.value ?? argument.description).join(" "),
    });
  } else if (message.method === "Runtime.exceptionThrown") {
    consoleEvents.push({
      source: "exception",
      level: "error",
      text:
        message.params.exceptionDetails.exception?.description ??
        message.params.exceptionDetails.text,
    });
  } else if (message.method === "Log.entryAdded") {
    consoleEvents.push({
      source: message.params.entry.source,
      level: message.params.entry.level,
      text: message.params.entry.text,
    });
  }
});

if (navigateUrl) {
  await client.send("Page.navigate", { url: navigateUrl });
}

const expectedText = [expectedProject, expectedThread, expectedModel].filter(Boolean);
let state = null;
const deadline = Date.now() + timeoutMs;
while (Date.now() < deadline) {
  state = await evaluate(
    client,
    `(() => {
      const text = document.body?.innerText ?? "";
      return {
        href: location.origin + location.pathname + location.search,
        pathname: location.pathname,
        readyState: document.readyState,
        title: document.title,
        text,
        hasRoot: Boolean(document.querySelector("#root")),
        hasSidebar: Boolean(document.querySelector("[data-app-sidebar]")),
        hasComposer: Boolean(document.querySelector(".composer-frame")),
      };
    })()`,
  ).catch(() => null);
  const knownVisible = expectedText.every((value) => state?.text?.includes(value));
  if (
    state?.readyState === "complete" &&
    state.hasSidebar &&
    state.hasComposer &&
    !state.pathname.startsWith("/pair") &&
    knownVisible
  ) {
    break;
  }
  await delay(100);
}

const page = await evaluate(
  client,
  `(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    const iconSelectors = [
      ".sidebar-v2-search svg",
      ".sidebar-v2-new-thread svg",
      ".sidebar-v2-project-scope-trigger svg",
      ".sidebar-v2-new-project svg",
    ];
    return {
      href: location.origin + location.pathname + location.search,
      pathname: location.pathname,
      title: document.title,
      readyState: document.readyState,
      text: document.body?.innerText ?? "",
      dimensions: {
        innerWidth,
        innerHeight,
        devicePixelRatio,
        visualViewport: visualViewport
          ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale }
          : null,
      },
      geometry: {
        root: rect("#root"),
        sidebar: rect("[data-app-sidebar]"),
        toolbar: rect("[data-chat-header]"),
        composer: rect(".composer-frame"),
        icons16: iconSelectors.map((selector) => ({ selector, rect: rect(selector) })),
      },
    };
  })()`,
);
const ready =
  page.readyState === "complete" &&
  !page.pathname.startsWith("/pair") &&
  page.geometry.sidebar !== null &&
  page.geometry.composer !== null &&
  expectedText.every((value) => page.text.includes(value));
const screenshot = await client.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
});
client.close();

const screenshotBuffer = Buffer.from(screenshot.data, "base64");
const unexplainedErrors = consoleEvents.filter((entry) => entry.level === "error");
const report = {
  schemaVersion: 1,
  task: "BW1.5",
  source: "real-t3-web-route",
  endpoint,
  browser: {
    product: browser.Browser,
    protocolVersion: browser["Protocol-Version"],
    targetId: target.id,
  },
  requestedViewport: { width, height, deviceScaleFactor },
  expected: { project: expectedProject, thread: expectedThread, model: expectedModel },
  readiness: { reached: ready, timeoutMs },
  page,
  console: consoleEvents,
  unexplainedErrors,
  screenshot: {
    width: screenshotBuffer.readUInt32BE(16),
    height: screenshotBuffer.readUInt32BE(20),
  },
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, "probe.json"), `${JSON.stringify(report, null, 2)}\n`),
  writeFile(path.join(outputDirectory, "browser.png"), screenshotBuffer),
]);

console.log(JSON.stringify(report, null, 2));
if ((requireReady && !ready) || unexplainedErrors.length > 0) process.exitCode = 1;
