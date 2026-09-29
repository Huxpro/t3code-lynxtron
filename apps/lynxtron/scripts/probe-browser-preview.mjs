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
const exerciseIntervention = process.argv.includes("--exercise-intervention");
const exerciseSendRecovery = process.argv.includes("--exercise-send-recovery");
const exerciseInterrupt = process.argv.includes("--exercise-interrupt");
const interventionAction = argumentValue("--intervention-action", "default");
const requireTypedHost =
  exerciseTypedHost ||
  exerciseIntervention ||
  exerciseSendRecovery ||
  exerciseInterrupt ||
  process.argv.includes("--require-typed-host");

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
if (exerciseIntervention || exerciseSendRecovery || exerciseInterrupt) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
}
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
      const expectedKnownValues = diagnostics?.connector?.scenarioId?.startsWith("pending-")
        ? [known?.project, known?.thread]
        : [known?.project, known?.thread, known?.model];
      const knownVisible = known
        ? expectedKnownValues.every((value) => typeof value === "string" && text.includes(value))
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

async function clickProductText(label) {
  const point = await evaluate(
    client,
    `(() => {
      const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
      const matches = Array.from(root?.querySelectorAll("x-view,x-text") ?? [])
        .filter((node) => node.textContent?.trim() === ${JSON.stringify(label)})
        .map((node) => {
          const actionable = node.closest("x-view[bindtap]") ?? node;
          const rect = actionable.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, area: rect.width * rect.height };
        })
        .filter((rect) => rect.area > 0)
        .sort((left, right) => left.area - right.area);
      return matches[0] ?? null;
    })()`,
  );
  if (!point) throw new Error(`Could not locate visible product text: ${label}`);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
}

async function clickProductSelector(selector) {
  const point = await evaluate(
    client,
    `(() => {
      const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
      const node = root?.querySelector(${JSON.stringify(selector)});
      const rect = node?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0
        ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        : null;
    })()`,
  );
  if (!point) throw new Error(`Could not locate visible product selector: ${selector}`);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
}

async function clickComposerInput() {
  const point = await evaluate(
    client,
    `(() => {
      const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
      const host = root?.querySelector("textarea");
      const input = host?.shadowRoot?.querySelector("#textarea") ?? host;
      const rect = input?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0
        ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        : null;
    })()`,
  );
  if (!point) throw new Error("Could not locate the editable composer textarea");
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
}

let interventionExercise = null;
if (exerciseIntervention && semanticState?.rendered) {
  const activeScenarioId = semanticState.connector?.scenarioId;
  const expected =
    activeScenarioId === "pending-approval"
      ? { pendingText: "PENDING APPROVAL", method: "respondToApproval" }
      : activeScenarioId === "pending-user-input"
        ? {
            pendingText: "Which renderer should this change target?",
            method: "respondToUserInput",
          }
        : activeScenarioId === "proposed-plan"
          ? {
              pendingText: "Plan Ready",
              method:
                interventionAction === "new-thread"
                  ? "implementProposedPlanInNewThread"
                  : "implementProposedPlan",
            }
          : null;
  if (!expected)
    throw new Error(`Scenario ${String(activeScenarioId)} cannot exercise intervention`);
  const productStateExpression = `(() => {
    const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
    return {
      text: root?.textContent ?? "",
      commands: globalThis.__T3_LYNX_WEB_PREVIEW__?.connector?.commands ?? [],
    };
  })()`;
  const initial = await evaluate(client, productStateExpression);
  if (!initial.text.includes(expected.pendingText)) {
    throw new Error(`Pending state not visible for ${String(activeScenarioId)}`);
  }
  if (activeScenarioId === "pending-approval") {
    await clickProductText("Approve once");
  } else if (activeScenarioId === "pending-user-input") {
    await clickProductText("Lynx");
    await waitForPageState(
      `(() => {
        const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
        return Array.from(root?.querySelectorAll("x-view[bindtap]") ?? []).some(
          (node) => node.textContent?.trim() === "Submit answer",
        );
      })()`,
      Boolean,
    );
    await clickProductText("Submit answer");
  } else {
    await clickProductText(interventionAction === "new-thread" ? "New thread" : "Implement");
  }
  const resolved = await waitForPageState(
    productStateExpression,
    (value) =>
      value?.commands?.filter((command) => command.method === expected.method).length === 1 &&
      !value?.text?.includes(expected.pendingText),
  );
  if (!resolved) throw new Error(`Intervention did not resolve for ${String(activeScenarioId)}`);
  const matchingCommands = resolved.commands.filter(
    (command) => command.method === expected.method,
  );
  interventionExercise = {
    scenarioId: activeScenarioId,
    initialPendingVisible: true,
    command: matchingCommands[0],
    commandCount: matchingCommands.length,
    pendingVisibleAfterResolution: false,
    ...(interventionAction === "new-thread"
      ? {
          destinationVisible: resolved.text.includes("New thread"),
          returnedThreadId:
            matchingCommands[0]?.method === "implementProposedPlanInNewThread"
              ? "browser-preview-implementation-thread"
              : null,
        }
      : {}),
  };
}

let sendRecoveryExercise = null;
if (exerciseSendRecovery && semanticState?.rendered) {
  if (semanticState.connector?.scenarioId !== "send-recovery") {
    throw new Error(
      `Scenario ${String(semanticState.connector?.scenarioId)} cannot exercise send recovery`,
    );
  }
  const draft = "Retry this turn after the transient failure";
  const recoveryStateExpression = `(() => {
    const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
    const textarea = root?.querySelector("textarea");
    const text = root?.textContent ?? "";
    const commands = globalThis.__T3_LYNX_WEB_PREVIEW__?.connector?.commands ?? [];
    return {
      text,
      draft: textarea?.value || textarea?.getAttribute("value") || "",
      errorVisible: text.includes("Connector command failed. Please try again."),
      sendCommands: commands.filter((command) => command.method === "sendPrompt"),
    };
  })()`;
  await evaluate(
    client,
    `(() => {
      const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
      const textarea = root?.querySelector("textarea");
      if (!textarea) return false;
      textarea.dispatchEvent(new CustomEvent("lynxinput", {
        bubbles: true, detail: { value: ${JSON.stringify(draft)} },
      }));
      return true;
    })()`,
  );
  const typed = await waitForPageState(recoveryStateExpression, (value) => value?.draft === draft);
  if (!typed) {
    const diagnostic = await evaluate(
      client,
      `(() => {
        const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
        const host = root?.querySelector("textarea");
        const input = host?.shadowRoot?.querySelector("#textarea") ?? host;
        return {
          state: ${recoveryStateExpression},
          hostTag: host?.tagName ?? null,
          hostOuterHtml: host?.outerHTML ?? null,
          hostShadow: Boolean(host?.shadowRoot),
          inputTag: input?.tagName ?? null,
          inputValue: input?.value ?? null,
          documentActiveTag: document.activeElement?.tagName ?? null,
          rootActiveTag: root?.getRootNode()?.activeElement?.tagName ?? null,
          hostActiveTag: host?.shadowRoot?.activeElement?.tagName ?? null,
        };
      })()`,
    );
    throw new Error(
      `Composer draft did not accept recovery fixture text: ${JSON.stringify(diagnostic)}`,
    );
  }

  await clickProductSelector(".composer__send");
  await clickProductSelector(".composer__send");
  const failed = await waitForPageState(
    recoveryStateExpression,
    (value) =>
      value?.sendCommands?.length === 1 && value?.draft === draft && value?.errorVisible === true,
  );
  if (!failed) {
    const diagnostic = await evaluate(client, recoveryStateExpression);
    throw new Error(
      `First send did not preserve the draft and expose one failure: ${JSON.stringify(diagnostic)}`,
    );
  }

  await clickProductSelector(".composer__send");
  const recovered = await waitForPageState(
    recoveryStateExpression,
    (value) =>
      value?.sendCommands?.length === 2 &&
      value?.draft === "" &&
      value?.errorVisible === false &&
      value?.text?.includes(draft),
  );
  if (!recovered) throw new Error("Retry did not clear the draft and advance canonical turn state");
  sendRecoveryExercise = {
    draft,
    draftRetainedAfterFailure: failed.draft === draft,
    errorVisibleAfterFailure: failed.errorVisible,
    duplicateSubmissionPrevented: failed.sendCommands.length === 1,
    commandCountAfterRetry: recovered.sendCommands.length,
    draftClearedAfterRetry: recovered.draft === "",
    errorClearedAfterRetry: recovered.errorVisible === false,
    canonicalTurnVisibleAfterRetry: recovered.text.includes(draft),
    commands: recovered.sendCommands,
  };
}

let interruptExercise = null;
if (exerciseInterrupt && semanticState?.rendered) {
  if (semanticState.connector?.scenarioId !== "running-turn") {
    throw new Error(
      `Scenario ${String(semanticState.connector?.scenarioId)} cannot exercise interrupt`,
    );
  }
  const stateExpression = `(() => {
    const root = document.querySelector("lynx-view")?.shadowRoot?.querySelector('[part="page"]');
    const commands = globalThis.__T3_LYNX_WEB_PREVIEW__?.connector?.commands ?? [];
    return {
      text: root?.textContent ?? "",
      stopVisible: Boolean(root?.querySelector(".composer__send--stop")),
      interruptCommands: commands.filter((command) => command.method === "interrupt"),
    };
  })()`;
  const initial = await evaluate(client, stateExpression);
  if (!initial.stopVisible) throw new Error("Running turn did not expose the stop action");
  await clickProductSelector(".composer__send--stop");
  const interrupted = await waitForPageState(
    stateExpression,
    (value) => value?.interruptCommands?.length === 1 && value?.stopVisible === false,
  );
  if (!interrupted) throw new Error("Stop did not publish canonical interrupted state");
  interruptExercise = {
    initialStopVisible: true,
    command: interrupted.interruptCommands[0],
    commandCount: interrupted.interruptCommands.length,
    stopVisibleAfterCanonicalInterrupt: interrupted.stopVisible,
    interruptedReceiptVisible: interrupted.text.includes("You stopped"),
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
      lifecycleLayout: shadow
        ? (() => {
            const header = shadow.querySelector("[data-chat-header]");
            const banner = shadow.querySelector("[data-connector-lifecycle]");
            const body = shadow.querySelector("[data-chat-route-body]");
            const chatSurface = shadow.querySelector(".chat-view-surface-reference");
            const projectText = shadow.textContent ?? "";
            const bounds = (element) => {
              const box = element?.getBoundingClientRect();
              return box
                ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom }
                : null;
            };
            const headerRect = bounds(header);
            const bannerRect = bounds(banner);
            const bodyRect = bounds(body);
            const chatSurfaceRect = bounds(chatSurface);
            const marker = banner?.querySelector(".lynx-connector-lifecycle__marker");
            const action = banner?.querySelector(".lynx-connector-lifecycle__action");
            const bannerStyle = banner ? getComputedStyle(banner) : null;
            const markerRect = bounds(marker);
            const actionRect = bounds(action);
            const composerPlaceholder = shadow.querySelector("textarea")?.getAttribute("placeholder") ?? null;
            return {
              chatSurfaceRect,
              headerRect,
              bannerRect,
              bodyRect,
              orderedWithoutOverlap: Boolean(
                headerRect && bannerRect && bodyRect &&
                headerRect.bottom <= bannerRect.y && bannerRect.bottom <= bodyRect.y
              ),
              errorCopyVisible:
                projectText.includes("Couldn’t connect to the local server") &&
                projectText.includes("The local server stopped before the workspace was ready.") &&
                projectText.includes("Retry"),
              composerPlaceholder,
              composerCopyMatchesStatus: composerPlaceholder === "Connection unavailable",
              fillsRemainingViewport: Boolean(
                chatSurfaceRect && rect &&
                Math.abs(chatSurfaceRect.width - (rect.width - chatSurfaceRect.x)) <= 1
              ),
              toneVisible: Boolean(
                bannerStyle && markerRect && actionRect &&
                bannerStyle.borderTopWidth !== "0px" &&
                bannerStyle.backgroundColor !== "rgba(0, 0, 0, 0)" &&
                markerRect.width >= 5 && markerRect.height >= 5 && actionRect.height >= 24
              ),
            };
          })()
        : null,
      imageLayout: shadow
        ? (() => {
            const samples = Array.from(shadow.querySelectorAll("x-image")).slice(0, 24).map((host) => {
              const hostRect = host.getBoundingClientRect();
              const image = host.shadowRoot?.querySelector("img");
              const imageRect = image?.getBoundingClientRect();
              return imageRect
                ? {
                    hostWidth: hostRect.width,
                    hostHeight: hostRect.height,
                    imageWidth: imageRect.width,
                    imageHeight: imageRect.height,
                  }
                : null;
            }).filter(Boolean);
            return {
              sampleCount: samples.length,
              contained: samples.every((sample) =>
                sample.imageWidth <= sample.hostWidth + 0.5 &&
                sample.imageHeight <= sample.hostHeight + 0.5
              ),
              samples,
            };
          })()
        : null,
      composerLayout: shadow
        ? (() => {
            const timeline = shadow.querySelector(".timeline-host");
            const composer = shadow.querySelector(".composer-overlay");
            const timelineRect = timeline?.getBoundingClientRect();
            const composerRect = composer?.getBoundingClientRect();
            return {
              timelineRect: timelineRect
                ? { y: timelineRect.y, height: timelineRect.height, bottom: timelineRect.bottom }
                : null,
              composerRect: composerRect
                ? { y: composerRect.y, height: composerRect.height, bottom: composerRect.bottom }
                : null,
              orderedWithoutOverlap: Boolean(
                timelineRect && composerRect &&
                timelineRect.height > 0 && timelineRect.bottom <= composerRect.y
              ),
            };
          })()
        : null,
      transcriptLayout: shadow
        ? (() => {
            const host = shadow.querySelector(".timeline-host");
            const list = shadow.querySelector("x-list");
            const scroller = list?.shadowRoot?.querySelector("#content") ?? list;
            const terminal = Array.from(shadow.querySelectorAll("raw-text")).find((node) =>
              (node.textContent ?? "").includes("Long transcript terminal marker"),
            );
            const listRect = list?.getBoundingClientRect();
            const terminalRect = terminal?.getBoundingClientRect();
            return {
              rowCount: Number(host?.getAttribute("data-transcript-row-count") ?? 0),
              following: host?.getAttribute("data-transcript-following") === "true",
              atEnd: host?.getAttribute("data-transcript-at-end") === "true",
              mountedItemCount: shadow.querySelectorAll("list-item").length,
              scrollTop: scroller?.scrollTop ?? null,
              scrollHeight: scroller?.scrollHeight ?? null,
              listHeight: scroller?.clientHeight ?? null,
              terminalMarkerVisible: Boolean(
                listRect && terminalRect &&
                terminalRect.bottom > listRect.y && terminalRect.y < listRect.bottom
              ),
              markdownSemanticsVisible: Boolean(
                shadow.querySelector(".md-table") &&
                shadow.querySelector(".md-list") &&
                shadow.querySelector(".md-code-block") &&
                shadow.querySelector(".md-link") &&
                shadow.querySelector(".md-image-fallback") &&
                (shadow.textContent ?? "").includes("Parity proof") &&
                (shadow.textContent ?? "").includes("./evidence/parity.png")
              ),
            };
          })()
        : null,
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
    (/^NYI: (profileStart|isProfileRecording|profileEnd)\. This is an issue of lynx-core\.$/.test(
      entry.text,
    ) ||
      (exerciseSendRecovery &&
        entry.text.startsWith("Error: Preview send failed; retry is available."))),
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
  interventionExercise,
  sendRecoveryExercise,
  interruptExercise,
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
  report.unexplainedErrors.length > 0 ||
  (report.page.diagnostics?.connector?.scenarioId === "connection-error" &&
    (!report.page.lifecycleLayout?.orderedWithoutOverlap ||
      !report.page.lifecycleLayout?.errorCopyVisible ||
      !report.page.lifecycleLayout?.fillsRemainingViewport ||
      !report.page.lifecycleLayout?.toneVisible ||
      !report.page.lifecycleLayout?.composerCopyMatchesStatus ||
      !report.page.imageLayout?.contained ||
      !report.page.composerLayout?.orderedWithoutOverlap)) ||
  (report.page.diagnostics?.connector?.scenarioId === "long-transcript" &&
    (report.page.transcriptLayout?.rowCount !== 80 ||
      !report.page.transcriptLayout?.following ||
      !report.page.transcriptLayout?.atEnd ||
      !report.page.shadow?.productText.includes("Long transcript terminal marker") ||
      !report.page.transcriptLayout?.markdownSemanticsVisible))
) {
  process.exitCode = 1;
}
