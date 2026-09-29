import "@lynx-js/web-core/client";

import type { LynxViewElement } from "@lynx-js/web-core/client";

import "./probe.css";
import { BrowserPreviewConnectorHost } from "./previewConnectorHost.ts";
import { createBrowserPreviewNativeModules } from "./previewNativeModules.ts";
import {
  BROWSER_PREVIEW_SCENARIOS,
  DEFAULT_BROWSER_PREVIEW_SCENARIO_ID,
  isBrowserPreviewScenarioId,
  type BrowserPreviewScenarioId,
} from "./previewScenarios.ts";

interface BrowserPreviewDiagnostics {
  readonly kind: "typed-browser-preview";
  readonly bundleUrl: string;
  readonly rendererErrors: Array<string>;
  readonly nativeModuleCalls: Array<{ moduleName: string; method: string; data: unknown }>;
  readonly connector: BrowserPreviewConnectorHost["diagnostics"];
  known: (typeof BROWSER_PREVIEW_SCENARIOS)[BrowserPreviewScenarioId]["known"];
  readonly unsupportedCapabilities: BrowserPreviewConnectorHost["diagnostics"]["unsupportedCapabilities"];
  semanticReady: boolean;
  rendered: boolean;
  advanceToReady(): number;
  emitSequenceGapForDiagnostic(): number;
  switchScenario(scenarioId: BrowserPreviewScenarioId): number;
}

declare global {
  interface Window {
    __T3_LYNX_WEB_PREVIEW__?: BrowserPreviewDiagnostics;
  }
}

const view = document.querySelector<LynxViewElement>("#t3-lynx-preview");
const status = document.querySelector<HTMLOutputElement>("#probe-status");

if (!view || !status) {
  throw new Error("Browser preview host is missing its lynx-view or status output.");
}

const bundleUrl = new URL("./lynx/main.web.bundle", window.location.href).href;
const requestedScenario = new URL(window.location.href).searchParams.get("scenario") ?? "";
const scenarioId = isBrowserPreviewScenarioId(requestedScenario)
  ? requestedScenario
  : DEFAULT_BROWSER_PREVIEW_SCENARIO_ID;
const scenario = BROWSER_PREVIEW_SCENARIOS[scenarioId];
const connectorHost = new BrowserPreviewConnectorHost(scenario, (eventName, params) => {
  view.sendGlobalEvent(eventName, params as never);
});
const nativeModules = createBrowserPreviewNativeModules(scenario);
const diagnostics: BrowserPreviewDiagnostics = {
  kind: "typed-browser-preview",
  bundleUrl,
  rendererErrors: [],
  nativeModuleCalls: [],
  connector: connectorHost.diagnostics,
  known: scenario.known,
  unsupportedCapabilities: connectorHost.diagnostics.unsupportedCapabilities,
  semanticReady: false,
  rendered: false,
  advanceToReady: () => connectorHost.emitStatus("ready"),
  emitSequenceGapForDiagnostic: () => connectorHost.emitSequenceGapForDiagnostic("connecting"),
  switchScenario: (nextScenarioId) => {
    const next = BROWSER_PREVIEW_SCENARIOS[nextScenarioId];
    diagnostics.known = next.known;
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", nextScenarioId);
    window.history.replaceState(null, "", url);
    return connectorHost.switchScenario(nextScenarioId);
  },
};
window.__T3_LYNX_WEB_PREVIEW__ = diagnostics;

const constrainImageContents = (shadowRoot: ShadowRoot): void => {
  for (const image of shadowRoot.querySelectorAll("x-image")) {
    const imageShadow = image.shadowRoot;
    if (!imageShadow || imageShadow.querySelector("#t3-browser-preview-image-compat")) continue;
    const style = document.createElement("style");
    style.id = "t3-browser-preview-image-compat";
    style.textContent =
      "img { display: block !important; width: 100% !important; height: 100% !important; object-fit: contain; }";
    imageShadow.append(style);
  }
};

const updateReadiness = () => {
  const shadowRoot = view.shadowRoot;
  if (!shadowRoot?.querySelector("x-view")) return false;
  if (!shadowRoot.querySelector("#t3-browser-preview-layout-compat")) {
    const style = document.createElement("style");
    style.id = "t3-browser-preview-layout-compat";
    style.textContent = `
      .chat-view-surface-reference { display: flex; flex: 1 1 0%; min-width: 0; min-height: 0; }
      .lynx-chat-route-column { display: flex; flex: 1 1 0%; flex-direction: column; min-width: 0; min-height: 0; }
      .lynx-chat-route-body, .lynx-chat-route-content { display: flex; flex: 1 1 0%; min-width: 0; min-height: 0; }
      .lynx-chat-route-content { flex-direction: column; }
      .topbar__content, .topbar__crumb { display: flex; flex: 1 1 0%; flex-direction: row; min-width: 0; width: auto; }
      .topbar__actions { display: flex; flex: 0 0 auto; flex-direction: row; }
      .topbar__thread { flex: 1 1 0%; min-width: 0; }
      .lynx-connector-lifecycle {
        display: flex; flex: 0 0 auto; flex-direction: row; align-items: flex-start;
        min-height: 52px; margin: 8px 12px 0; padding: 10px 12px;
      }
      .timeline-host { display: flex; flex: 1 1 0%; flex-direction: column; height: auto; min-height: 0; overflow: hidden; }
      .timeline-list { display: flex; flex: 1 1 0%; height: auto; min-height: 0; }
      .composer-overlay { display: flex; flex: 0 0 auto; flex-direction: column; width: 100%; }
      x-image { display: block !important; flex: 0 0 auto !important; overflow: hidden; }
    `;
    shadowRoot.append(style);
  }
  constrainImageContents(shadowRoot);
  diagnostics.rendered = true;
  status.value = "rendered";
  return true;
};
const waitForProductRender = (): void => {
  if (!updateReadiness() && diagnostics.rendererErrors.length === 0) {
    requestAnimationFrame(waitForProductRender);
  }
};

view.onNativeModulesCall = (method, data, moduleName) => {
  diagnostics.nativeModuleCalls.push({ moduleName, method, data });
  requestAnimationFrame(waitForProductRender);
  return connectorHost.handleNativeCall(method, data, moduleName);
};

view.addEventListener("error", (event) => {
  const detail = "detail" in event ? JSON.stringify(event.detail) : event.type;
  diagnostics.rendererErrors.push(detail);
  status.value = "error";
});

const observeProductRender = (): void => {
  const shadowRoot = view.shadowRoot;
  if (!shadowRoot) {
    requestAnimationFrame(observeProductRender);
    return;
  }
  const observer = new MutationObserver(() => {
    updateReadiness();
  });
  observer.observe(shadowRoot, { childList: true, subtree: true });
  updateReadiness();
};
observeProductRender();

view.browserConfig = {
  pixelRatio: window.devicePixelRatio,
  pixelWidth: 1280,
  pixelHeight: 820,
};
view.nativeModulesMap = nativeModules.map;
view.style.width = "1280px";
view.style.height = "820px";
view.url = bundleUrl;

window.addEventListener("beforeunload", () => nativeModules.dispose(), { once: true });
