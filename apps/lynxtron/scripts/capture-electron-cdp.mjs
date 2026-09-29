import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { classifyElectronRendererErrors } from "./electron-cdp-errors.mjs";
import { selectElectronRendererTarget } from "./electron-cdp-target.mjs";

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
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
      this.socket.addEventListener(
        "error",
        () => reject(new Error(`Could not connect to Electron CDP at ${this.url}`)),
        { once: true },
      );
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error) {
          pending.reject(
            new Error(`${pending.method} failed: ${message.error.message ?? "unknown CDP error"}`),
          );
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} did not return within 15 seconds`));
      }, 15_000);
      this.pending.set(id, { method, resolve: resolvePromise, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${pending.method} was cancelled because the CDP client closed`));
    }
    this.pending.clear();
    this.socket?.close();
  }
}

async function discoverPage(endpoint) {
  const response = await fetch(new URL("/json/list", endpoint));
  if (!response.ok) {
    throw new Error(`Electron CDP target discovery failed with HTTP ${response.status}`);
  }
  const targets = await response.json();
  try {
    return selectElectronRendererTarget(targets);
  } catch (error) {
    throw new Error(`No T3 Code Electron renderer target found at ${endpoint}`, { cause: error });
  }
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `Electron Runtime.evaluate failed: ${result.exceptionDetails.text ?? "unknown exception"}`,
    );
  }
  return result.result?.value;
}

function measurementExpression(spec) {
  return `(() => {
    const spec = ${JSON.stringify(spec)};
    const measure = (entry) => {
      const element = document.querySelector(entry.web);
      if (!(element instanceof HTMLElement)) {
        throw new Error("Required visual selector did not match: " + entry.web);
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element, entry.webPseudo ?? null);
      return {
        selector: entry.web,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        text: element.innerText || element.getAttribute("aria-label") || "",
        style: {
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
        },
      };
    };
    const collect = (entries) =>
      Object.fromEntries(entries.map((entry) => [entry.id, measure(entry)]));
    return {
      schemaVersion: 1,
      source: "electron-cdp",
      route: spec.route,
      anchors: collect(spec.anchors),
      typography: collect(spec.typography),
      colors: collect(spec.colors),
    };
  })()`;
}

async function waitForVisualState(
  client,
  spec,
  { includeAfterInteraction = false, timeoutMs = 30_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const selectors = [...spec.anchors, ...spec.typography, ...spec.colors]
    .filter((entry) => includeAfterInteraction || entry.afterInteraction !== true)
    .map((entry) => entry.web);
  while (Date.now() < deadline) {
    const ready = await evaluate(
      client,
      `(() => {
        const selectors = ${JSON.stringify(selectors)};
        return document.readyState === "complete" &&
          selectors.every((selector) => document.querySelector(selector) !== null);
      })()`,
    ).catch(() => false);
    if (ready) return;
    await delay(200);
  }
  throw new Error(
    `Electron renderer did not reach the ${spec.route} visual state in ${timeoutMs}ms`,
  );
}

async function waitForAbsentText(client, texts, timeoutMs = 30_000) {
  if (!Array.isArray(texts) || texts.length === 0) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const absent = await evaluate(
      client,
      `(() => {
        const text = document.body?.innerText ?? "";
        return ${JSON.stringify(texts)}.every((value) => !text.includes(value));
      })()`,
    ).catch(() => false);
    if (absent) return;
    await delay(250);
  }
  throw new Error(`Electron renderer retained transient text: ${texts.join(", ")}`);
}

async function waitForExpression(client, expression, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matched = await evaluate(client, expression).catch(() => false);
    if (matched) return;
    await delay(100);
  }
  throw new Error(`Electron renderer did not reach state: ${description}`);
}

async function prepareSettingsGeneralInteractionState(client, interactionState) {
  if (interactionState === "none" || interactionState === "sidebar-collapsed") return;
  const supportedStates = new Set(["default", "changed", "restore-confirmation", "restored"]);
  if (!supportedStates.has(interactionState)) {
    throw new Error(`Unsupported Settings General interaction state: ${interactionState}`);
  }

  const switchSelector = '[role="switch"][aria-label="Project Grouping"]';
  const switchChecked = `document.querySelector(${JSON.stringify(
    switchSelector,
  )})?.getAttribute("aria-checked") === "true"`;
  const switchUnchecked = `document.querySelector(${JSON.stringify(
    switchSelector,
  )})?.getAttribute("aria-checked") === "false"`;
  const clickSwitch = `document.querySelector(${JSON.stringify(switchSelector)})?.click()`;
  const restoreButton = `Array.from(document.querySelectorAll(".settings-topbar button")).find(
    (button) => button.textContent?.trim() === "Restore defaults"
  )`;

  if (interactionState === "default") {
    if (!(await evaluate(client, switchChecked))) {
      await evaluate(client, clickSwitch);
    }
    await waitForExpression(client, switchChecked, "Project Grouping default");
    return;
  }

  if (!(await evaluate(client, switchUnchecked))) {
    await evaluate(client, clickSwitch);
  }
  await waitForExpression(client, switchUnchecked, "Project Grouping changed");
  if (interactionState === "changed") return;

  await evaluate(
    client,
    `(() => { const button = ${restoreButton}; button?.click(); return !!button; })()`,
  );
  await waitForExpression(
    client,
    `document.querySelector('[role="dialog"][aria-label="Restore default settings?"]') !== null`,
    "restore confirmation open",
  );
  if (interactionState === "restore-confirmation") return;

  await evaluate(
    client,
    `(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Restore default settings?"]');
      const button = Array.from(dialog?.querySelectorAll("button") ?? []).find(
        (candidate) => candidate.textContent?.trim() === "Restore"
      );
      button?.click();
      return !!button;
    })()`,
  );
  await waitForExpression(
    client,
    `${switchChecked} &&
      document.querySelector('[role="dialog"][aria-label="Restore default settings?"]') === null`,
    "settings restored",
  );
}

async function prepareSidebarInteractionState(client, interactionState) {
  if (interactionState !== "sidebar-collapsed") return;

  await evaluate(
    client,
    `(() => {
      const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
      if (!(wrapper instanceof HTMLElement)) {
        throw new Error("Sidebar wrapper is unavailable.");
      }
      if (wrapper.dataset.sidebarState === "collapsed") return true;
      const trigger = document.querySelector(".sidebar-global-toggle");
      if (!(trigger instanceof HTMLElement)) {
        throw new Error("Global Sidebar trigger is unavailable.");
      }
      trigger.click();
      return true;
    })()`,
  );
  await waitForExpression(
    client,
    `document.querySelector('[data-slot="sidebar-wrapper"]')?.getAttribute("data-sidebar-state") ===
      "collapsed"`,
    "collapsed Sidebar",
  );
}

function readPngDimensions(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Electron CDP screenshot is not PNG.");
  }
  return {
    format: "png",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

const endpoint = argumentValue("--endpoint", "http://127.0.0.1:9333");
const width = Number(argumentValue("--width", "1280"));
const height = Number(argumentValue("--height", "820"));
const deviceScaleFactor = Number(argumentValue("--device-scale-factor", "2"));
const output = resolve(argumentValue("--output", "reports/screenshots/electron-cdp.png"));
const snapshot = argumentValue("--snapshot", "unspecified");
const theme = argumentValue("--theme", "dark");
const pathname = argumentValue("--pathname");
const interactionState = argumentValue("--interaction-state", "none");
const clearComposerDrafts = process.argv.includes("--clear-composer-drafts");
const sidebarWidthArgument = argumentValue("--sidebar-width");
const sidebarWidth = sidebarWidthArgument === undefined ? null : Number(sidebarWidthArgument);
const specPath = resolve(
  argumentValue("--measurement-spec", "scripts/visual-measurement-spec.json"),
);
const spec = JSON.parse(readFileSync(specPath, "utf8"));

if (
  !Number.isInteger(width) ||
  !Number.isInteger(height) ||
  width <= 0 ||
  height <= 0 ||
  !Number.isFinite(deviceScaleFactor) ||
  deviceScaleFactor <= 0
) {
  throw new Error("Width, height, and device scale factor must be positive.");
}
if (sidebarWidth !== null && (!Number.isFinite(sidebarWidth) || sidebarWidth <= 0)) {
  throw new Error("Sidebar width must be a positive number.");
}

const page = await discoverPage(endpoint);
const client = new CdpClient(page.webSocketDebuggerUrl);
const errors = new Set();
await client.connect();
const stopEvents = client.onEvent((event) => {
  if (event.method === "Runtime.exceptionThrown") {
    errors.add(event.params?.exceptionDetails?.text ?? "Runtime exception");
  }
  if (event.method === "Runtime.consoleAPICalled" && event.params?.type === "error") {
    const message =
      event.params.args
        ?.map((argument) => argument.value ?? argument.description ?? "")
        .join(" ") ?? "console.error";
    // Chromium also reports resource failures through Log/Network with their
    // URL and status. Keep that actionable record instead of a duplicate
    // URL-less console message.
    if (
      message !== "Failed to load resource: the server responded with a status of 404 (Not Found)"
    ) {
      errors.add(message);
    }
  }
  if (event.method === "Log.entryAdded" && event.params?.entry?.level === "error") {
    const entry = event.params.entry;
    errors.add(
      [entry.source ? `[${entry.source}]` : "", entry.text ?? "Log error", entry.url ?? ""]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (event.method === "Network.responseReceived" && event.params?.response?.status >= 400) {
    const response = event.params.response;
    errors.add(`[network] ${response.status} ${response.statusText} ${response.url}`.trim());
  }
});

try {
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Network.enable");
  await client.send("Page.enable");
  await client.send("Page.bringToFront");
  if (clearComposerDrafts) {
    await evaluate(client, `localStorage.removeItem("t3code:composer-drafts:v1"); true`);
  }
  if (sidebarWidth !== null) {
    await evaluate(
      client,
      `localStorage.setItem("chat_thread_sidebar_width", ${JSON.stringify(
        String(sidebarWidth),
      )}); true`,
    );
  }
  if (pathname) {
    await evaluate(
      client,
      `(() => {
        const target = ${JSON.stringify(pathname)};
        const current =
          location.hash.startsWith("#/") ? location.hash.slice(1) : location.pathname;
        if (current === target) return true;
        if (location.protocol === "t3code:" || location.protocol === "t3code-dev:") {
          location.hash = "#" + target;
        } else {
          location.assign(target);
        }
        return false;
      })()`,
    );
    await waitForExpression(
      client,
      `(location.hash.startsWith("#/") ? location.hash.slice(1) : location.pathname) ===
        ${JSON.stringify(pathname)}`,
      `pathname ${pathname}`,
    );
    // Ignore failures emitted by the route we intentionally left. The target
    // route is reloaded below, so its complete load still remains monitored.
    errors.clear();
  }
  await evaluate(
    client,
    `localStorage.setItem("t3code:theme", ${JSON.stringify(theme)}); location.reload();`,
  );
  await waitForVisualState(client, spec);
  await prepareSidebarInteractionState(client, interactionState);
  await prepareSettingsGeneralInteractionState(client, interactionState);
  await waitForVisualState(client, spec, { includeAfterInteraction: true });
  const nativeViewport = await evaluate(
    client,
    `({
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio,
    })`,
  );
  if (
    nativeViewport.width !== width ||
    nativeViewport.height !== height ||
    nativeViewport.deviceScaleFactor !== deviceScaleFactor
  ) {
    throw new Error(
      `Electron native viewport ${nativeViewport.width}x${nativeViewport.height}@${nativeViewport.deviceScaleFactor} ` +
        `does not match ${width}x${height}@${deviceScaleFactor}; prepare and launch a matching native window.`,
    );
  }
  await evaluate(
    client,
    `(() => {
      document.documentElement.classList.add("no-transitions");
      const frozenStyle = document.createElement("style");
      frozenStyle.dataset.visualCapture = "frozen";
      frozenStyle.textContent =
        "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
      document.head.append(frozenStyle);
      document.querySelector('button[aria-label="Dismiss notification"]')?.click();
      document.querySelector('button[aria-label="Dismiss provider update notice"]')?.click();
      document.querySelector('button[aria-label="Dismiss update"]')?.click();
      return true;
    })()`,
  );
  await waitForAbsentText(client, spec.stability?.webAbsentText);
  await evaluate(
    client,
    `(async () => {
      await document.fonts?.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return true;
    })()`,
    true,
  );
  await delay(1_000);
  const rendererHref = await evaluate(client, "location.href");
  const measurements = await evaluate(client, measurementExpression(spec));
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(screenshot.data, "base64");
  const dimensions = readPngDimensions(bytes);
  const expectedWidth = width * deviceScaleFactor;
  const expectedHeight = height * deviceScaleFactor;
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(
      `Electron screenshot dimensions ${dimensions.width}x${dimensions.height} do not match ${expectedWidth}x${expectedHeight}`,
    );
  }
  const classifiedErrors = classifyElectronRendererErrors([...errors], {
    href: rendererHref,
    route: spec.route,
  });
  if (classifiedErrors.unexpected.length > 0) {
    throw new Error(
      `Electron renderer reported errors:\n${classifiedErrors.unexpected.join("\n")}`,
    );
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes);
  const measurementsPath = output.replace(/\.png$/u, ".web-measurements.json");
  const metadataPath = output.replace(/\.png$/u, ".capture.json");
  writeFileSync(measurementsPath, `${JSON.stringify(measurements, null, 2)}\n`);
  writeFileSync(
    metadataPath,
    `${JSON.stringify(
      {
        baseline: "electron-web",
        endpoint,
        target: {
          id: page.id,
          title: page.title,
          url: page.url,
        },
        route: spec.route,
        pathname,
        interactionState,
        clearComposerDrafts,
        sidebarWidth,
        rendererHref,
        theme,
        snapshot,
        viewport: {
          mode: "native-window",
          logicalWidth: width,
          logicalHeight: height,
          deviceScaleFactor,
        },
        screenshot: output,
        dimensions,
        measurements: measurementsPath,
        rendererErrors: classifiedErrors.unexpected.length,
        expectedRendererErrors: classifiedErrors.expected,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        screenshot: output,
        metadata: metadataPath,
        measurements: measurementsPath,
        dimensions,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  stopEvents();
  client.close();
}
