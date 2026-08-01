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

const updateReadiness = () => {
  const shadowRoot = view.shadowRoot;
  if (!shadowRoot?.querySelector("x-view")) return false;
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
    if (updateReadiness()) observer.disconnect();
  });
  observer.observe(shadowRoot, { childList: true, subtree: true });
  if (updateReadiness()) observer.disconnect();
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
