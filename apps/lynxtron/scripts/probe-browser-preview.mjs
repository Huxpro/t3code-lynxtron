import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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

async function hashFile(filePath) {
  const contents = await readFile(filePath);
  return {
    path: path.relative(process.cwd(), filePath),
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const endpoint = argumentValue("--endpoint", "http://127.0.0.1:9351");
const expectedUrl = argumentValue("--url", "http://127.0.0.1:41983/");
const outputDirectory = path.resolve(
  argumentValue("--output", "evidence/2026-08-02/BW0/current-stack"),
);
const timeoutMs = Number(argumentValue("--timeout-ms", "15000"));
const task = argumentValue("--task", "BW0");
const source = argumentValue("--source", "current-stack-browser-preview");
const shouldReload = !process.argv.includes("--no-reload");
const exerciseTypedHost = process.argv.includes("--exercise-typed-host");
const requireTypedHost = exerciseTypedHost || process.argv.includes("--require-typed-host");

const [versionResponse, targetsResponse] = await Promise.all([
  fetch(new URL("/json/version", endpoint)),
  fetch(new URL("/json/list", endpoint)),
]);
const browser = await versionResponse.json();
const targets = await targetsResponse.json();
const target = targets.find(
  (candidate) => candidate.type === "page" && candidate.url === expectedUrl,
);
if (!target) throw new Error(`No page target matched ${expectedUrl}`);

const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
const consoleEvents = [];
await Promise.all([
  client.send("Runtime.enable"),
  client.send("Log.enable"),
  client.send("Page.enable"),
]);
await Promise.all([client.send("Runtime.discardConsoleEntries"), client.send("Log.clear")]);
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
if (shouldReload) await client.send("Page.reload", { ignoreCache: true });

const deadline = Date.now() + timeoutMs;
let semanticState;
while (Date.now() < deadline) {
  semanticState = await evaluate(
    client,
    `(() => {
      const diagnostics = globalThis.__T3_LYNX_WEB_PREVIEW__;
      if (diagnostics?.rendererErrors?.length) return diagnostics;
      if (!diagnostics?.rendered) return null;
      if (!${requireTypedHost}) return diagnostics;
      const text = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]')?.textContent ?? "";
      const known = diagnostics.known;
      const knownVisible = known
        ? [known.project, known.thread, known.model].every((value) => text.includes(value))
        : false;
      return diagnostics.connector?.nativeModuleReady === true &&
        diagnostics.connector?.readyCalls > 0 &&
        knownVisible
        ? diagnostics
        : null;
    })()`,
  ).catch(() => null);
  if (semanticState) break;
  await delay(100);
}

async function waitForPageState(expression, predicate) {
  const stateDeadline = Date.now() + timeoutMs;
  while (Date.now() < stateDeadline) {
    const value = await evaluate(client, expression).catch(() => null);
    if (predicate(value)) return value;
    await delay(100);
  }
  return null;
}

let typedHostExercise = null;
if (exerciseTypedHost && semanticState?.rendered) {
  const productTextExpression = `(() => {
    const view = document.querySelector("lynx-view");
    const root = view?.shadowRoot?.querySelector('[part="page"]');
    return root?.textContent ?? "";
  })()`;
  const initialText = await evaluate(client, productTextExpression);
  const initial = await evaluate(
    client,
    `(() => {
      const diagnostics = globalThis.__T3_LYNX_WEB_PREVIEW__;
      return {
        moduleReady: diagnostics?.connector?.nativeModuleReady === true,
        readyCalls: diagnostics?.connector?.readyCalls ?? 0,
        lastSequence: diagnostics?.connector?.lastSequence ?? -1,
      };
    })()`,
  );

  await evaluate(client, `globalThis.__T3_LYNX_WEB_PREVIEW__.advanceToReady()`);
  const afterReadyText = await waitForPageState(
    productTextExpression,
    (text) => typeof text === "string" && !text.includes("T3 Code: Connecting..."),
  );
  const afterReady = await evaluate(
    client,
    `(() => ({ ...globalThis.__T3_LYNX_WEB_PREVIEW__.connector }))()`,
  );

  await evaluate(client, `globalThis.__T3_LYNX_WEB_PREVIEW__.emitSequenceGapForDiagnostic()`);
  const afterGap = await evaluate(
    client,
    `(() => ({ ...globalThis.__T3_LYNX_WEB_PREVIEW__.connector }))()`,
  );
  const resynced = await waitForPageState(
    `(() => {
      const diagnostics = globalThis.__T3_LYNX_WEB_PREVIEW__;
      const text = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]')?.textContent ?? "";
      return {
        resyncCalls: diagnostics?.connector?.resyncCalls ?? 0,
        lastSequence: diagnostics?.connector?.lastSequence ?? -1,
        connectingVisible: text.includes("T3 Code: Connecting..."),
      };
    })()`,
    (value) => Boolean(value?.resyncCalls > 0 && value?.connectingVisible),
  );

  await evaluate(client, `globalThis.__T3_LYNX_WEB_PREVIEW__.switchScenario("populated-ready")`);
  const finalState = await waitForPageState(
    `(() => {
      const diagnostics = globalThis.__T3_LYNX_WEB_PREVIEW__;
      const text = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]')?.textContent ?? "";
      const known = diagnostics?.known;
      const knownVisible = known
        ? [known.project, known.thread, known.model].every((value) => text.includes(value))
        : false;
      return {
        scenarioId: diagnostics?.connector?.scenarioId ?? null,
        lastSequence: diagnostics?.connector?.lastSequence ?? -1,
        resyncCalls: diagnostics?.connector?.resyncCalls ?? 0,
        knownVisible,
        connectingVisible: text.includes("T3 Code: Connecting..."),
      };
    })()`,
    (value) =>
      Boolean(
        value?.scenarioId === "populated-ready" &&
        value?.lastSequence >= 8 &&
        value?.resyncCalls > 0 &&
        value?.knownVisible &&
        !value?.connectingVisible,
      ),
  );
  if (finalState) {
    await evaluate(client, `globalThis.__T3_LYNX_WEB_PREVIEW__.semanticReady = true`);
  }
  typedHostExercise = {
    initial,
    initialKnownVisible:
      typeof initialText === "string" &&
      ["T3 Code Browser Lab", "Validate the dual renderer workbench", "GPT-5.6 Sol"].every(
        (value) => initialText.includes(value),
      ),
    afterReady,
    afterReadyVisible: Boolean(afterReadyText),
    afterGap,
    resynced,
    finalState,
  };
}

const pageState = await evaluate(
  client,
  `(() => {
    const view = document.querySelector("lynx-view");
    const rect = view?.getBoundingClientRect();
    const shadow = view?.shadowRoot;
    const productRoot = shadow
      ? Array.from(shadow.children).find((element) =>
          !["IFRAME", "LINK", "STYLE"].includes(element.tagName),
        )
      : null;
    return {
      diagnostics: globalThis.__T3_LYNX_WEB_PREVIEW__ ?? null,
      status: document.querySelector("#probe-status")?.value ?? null,
      dimensions: {
        innerWidth,
        innerHeight,
        visualViewport: visualViewport
          ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale }
          : null,
        devicePixelRatio,
      },
      viewRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      shadow: shadow
        ? {
            childElementCount: shadow.childElementCount,
            productRootTag: productRoot?.tagName.toLowerCase() ?? null,
            productTags: productRoot
              ? Array.from(productRoot.querySelectorAll("*")).map((element) =>
                  element.tagName.toLowerCase(),
                )
              : [],
            productText: productRoot?.textContent ?? "",
            productHtmlPrefix: productRoot?.outerHTML.slice(0, 1200) ?? "",
          }
        : null,
    };
  })()`,
);

const screenshot = await client.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
});
client.close();

await mkdir(outputDirectory, { recursive: true });
const browserOutput = path.resolve("output/browser-preview");
const emittedFiles = await listFiles(browserOutput);
const packagePaths = {
  reactLynx: "node_modules/@lynx-js/react/package.json",
  rspeedy: "node_modules/@lynx-js/rspeedy/package.json",
  lynxTypes: "node_modules/@lynx-js/types/package.json",
  lynxtron: "node_modules/@lynx-js/lynxtron/package.json",
  lynxCore: "node_modules/@lynx-js/lynx-core/package.json",
  webCore: "node_modules/@lynx-js/web-core/package.json",
  webElements: "node_modules/@lynx-js/web-elements/package.json",
  rspack: "node_modules/@rspack/core/package.json",
};
const packageVersions = Object.fromEntries(
  await Promise.all(
    Object.entries(packagePaths).map(async ([name, packagePath]) => {
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      return [name, packageJson.version];
    }),
  ),
);
const expectedRuntimeErrors = consoleEvents.filter(
  (entry) =>
    entry.level === "error" &&
    /^NYI: (profileStart|isProfileRecording|profileEnd)\. This is an issue of lynx-core\.$/.test(
      entry.text,
    ),
);
const unexplainedErrors = consoleEvents.filter(
  (entry) => entry.level === "error" && !expectedRuntimeErrors.includes(entry),
);
const report = {
  schemaVersion: 1,
  task,
  source,
  endpoint,
  expectedUrl,
  browser: {
    product: browser.Browser,
    protocolVersion: browser["Protocol-Version"],
    userAgent: browser["User-Agent"],
    targetId: target.id,
  },
  versions: packageVersions,
  readiness: {
    reached: exerciseTypedHost
      ? Boolean(typedHostExercise?.finalState)
      : requireTypedHost
        ? Boolean(
            semanticState?.connector?.nativeModuleReady && semanticState?.connector?.readyCalls > 0,
          )
        : Boolean(semanticState?.rendered),
    timeoutMs,
  },
  typedHostExercise,
  page: pageState,
  console: consoleEvents,
  expectedRuntimeErrors,
  unexplainedErrors,
  artifacts: {
    productionBundle: await hashFile(path.resolve("output/bundle/lynx/main.lynx.bundle")),
    webBundle: await hashFile(path.resolve("output/bundle/web/main.web.bundle")),
    browserBundle: await hashFile(path.resolve(browserOutput, "lynx/main.web.bundle")),
    emitted: await Promise.all(emittedFiles.map(hashFile)),
  },
};

await Promise.all([
  writeFile(path.join(outputDirectory, "probe.json"), `${JSON.stringify(report, null, 2)}\n`),
  writeFile(path.join(outputDirectory, "browser.png"), Buffer.from(screenshot.data, "base64")),
]);

console.log(JSON.stringify(report, null, 2));
if (
  !report.readiness.reached ||
  report.page.diagnostics?.rendererErrors?.length > 0 ||
  report.unexplainedErrors.length > 0
) {
  process.exitCode = 1;
}
