import "@lynx-js/web-core/client";

import type { LynxViewElement } from "@lynx-js/web-core/client";

import "./probe.css";

interface BrowserPreviewDiagnostics {
  readonly kind: "bw0-current-stack";
  readonly bundleUrl: string;
  readonly rendererErrors: Array<string>;
  readonly nativeModuleCalls: Array<{ moduleName: string; method: string }>;
  rendered: boolean;
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
const diagnostics: BrowserPreviewDiagnostics = {
  kind: "bw0-current-stack",
  bundleUrl,
  rendererErrors: [],
  nativeModuleCalls: [],
  rendered: false,
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

view.onNativeModulesCall = async (method, _data, moduleName) => {
  diagnostics.nativeModuleCalls.push({ moduleName, method });
  requestAnimationFrame(waitForProductRender);
  return undefined;
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
view.style.width = "1280px";
view.style.height = "820px";
view.url = bundleUrl;
