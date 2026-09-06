import "@lynx-js/web-core/client";
import "@lynx-js/web-elements/index.css";

import type { LynxViewElement } from "@lynx-js/web-core/client";
import dmSansUrl from "../app/assets/dm-sans.woff2";
import jetBrainsMonoUrl from "../app/assets/jetbrains-mono-400.woff2";
import {
  T3_VIEWPORT_EVENT,
  T3_VIEWPORT_READY_METHOD,
  T3_VIEWPORT_SET_FOR_TEST_METHOD,
} from "../shared/viewportProtocol.ts";

import "./probe.css";
import { BrowserPreviewConnectorHost } from "./previewConnectorHost.ts";
import { LiveConnectorHost } from "./liveConnectorHost.ts";
import { createBrowserPreviewNativeModules } from "./previewNativeModules.ts";
import { handleBrowserPreviewTerminalFocus } from "./terminalFocusBridge.ts";
import {
  BROWSER_PREVIEW_SCENARIOS,
  DEFAULT_BROWSER_PREVIEW_SCENARIO_ID,
  isBrowserPreviewScenarioId,
  type BrowserPreviewScenarioId,
} from "./previewScenarios.ts";
import {
  resolveBrowserPreviewViewportContract,
  type BrowserPreviewViewportContract,
} from "./viewportContract.ts";

interface BrowserPreviewDiagnostics {
  readonly kind: "typed-browser-preview";
  readonly bundleUrl: string;
  readonly dataSource: "scenario" | "live-server";
  readonly rendererErrors: Array<string>;
  readonly nativeModuleCalls: Array<{ moduleName: string; method: string; data: unknown }>;
  readonly connector: BrowserPreviewConnectorHost["diagnostics"] | LiveConnectorHost["diagnostics"];
  known: (typeof BROWSER_PREVIEW_SCENARIOS)[BrowserPreviewScenarioId]["known"];
  readonly unsupportedCapabilities: ReadonlyArray<
    "keyboard" | "filesystem" | "shell" | "clipboard" | "native-navigation"
  >;
  viewportContract: BrowserPreviewViewportContract;
  semanticReady: boolean;
  rendered: boolean;
  stageBackdropPresent: boolean;
  heroPresent: boolean;
  activeThreadTitle: string | null;
  measureGeometry(): BrowserPreviewGeometry;
  advanceToReady(): number;
  emitSequenceGapForDiagnostic(): number;
  switchScenario(scenarioId: BrowserPreviewScenarioId): number;
  dispatchKeyboardShortcut(shortcut: "command" | "files" | `thread-${number}`): boolean;
  dispatchModifierState(
    type: "keydown" | "keyup",
    modifiers: { meta: boolean; ctrl: boolean; shift: boolean; alt: boolean },
  ): boolean;
  openWorkspaceMenuForHarness(open: boolean): boolean;
  invokeTooltipForHarness(relationId: string, action: "hover" | "leave"): boolean;
  invokeMenuForHarness(relationId: string): boolean;
  invokeResizeForHarness(target: "sidebar" | "right-panel", startX: number, endX: number): boolean;
}

interface BrowserPreviewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface BrowserPreviewGeometry {
  readonly root: BrowserPreviewRect | null;
  readonly sidebar: BrowserPreviewRect | null;
  readonly toolbar: BrowserPreviewRect | null;
  readonly composer: BrowserPreviewRect | null;
  readonly icons16: ReadonlyArray<{
    readonly selector: string;
    readonly rect: BrowserPreviewRect | null;
  }>;
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
const previewUrl = new URL(window.location.href);
let viewportContract = resolveBrowserPreviewViewportContract({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  pixelRatio: window.devicePixelRatio,
  requestedWidth: previewUrl.searchParams.get("width"),
  requestedHeight: previewUrl.searchParams.get("height"),
});
const requestedScenario = new URL(window.location.href).searchParams.get("scenario") ?? "";
const scenarioId = isBrowserPreviewScenarioId(requestedScenario)
  ? requestedScenario
  : DEFAULT_BROWSER_PREVIEW_SCENARIO_ID;
const scenario = BROWSER_PREVIEW_SCENARIOS[scenarioId];
const requestedRoute = previewUrl.searchParams.get("route") ?? scenario.route;
const requestedTheme = previewUrl.searchParams.get("theme") === "light" ? "light" : "dark";
const requestedModelSelection = (() => {
  const value = previewUrl.searchParams.get("modelSelection");
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
})();
const requestedEnvironmentIdentificationMode =
  previewUrl.searchParams.get("environmentIdentificationMode") === "none" ? "none" : "artwork";
const requestedLegacySidebarEnabled = previewUrl.searchParams.get("legacySidebarEnabled");
const betaMutationEnabled = previewUrl.searchParams.get("betaMutationEnabled") === "true";
const requestedInitialOverlay = previewUrl.searchParams.get("initialOverlay");
const requestedSidebarWidthRaw = previewUrl.searchParams.get("sidebarWidth");
const requestedSidebarWidthValue =
  requestedSidebarWidthRaw === null ? Number.NaN : Number(requestedSidebarWidthRaw);
const requestedSidebarWidth =
  Number.isFinite(requestedSidebarWidthValue) && requestedSidebarWidthValue > 0
    ? requestedSidebarWidthValue
    : null;
const requestedRightPanelWidthRaw = previewUrl.searchParams.get("rightPanelWidth");
const requestedRightPanelWidthValue =
  requestedRightPanelWidthRaw === null ? Number.NaN : Number(requestedRightPanelWidthRaw);
const requestedRightPanelWidth =
  Number.isFinite(requestedRightPanelWidthValue) && requestedRightPanelWidthValue > 0
    ? requestedRightPanelWidthValue
    : null;
const scenarioClientSettings =
  (
    scenario.preferences as {
      readonly clientSettings?: Readonly<Record<string, unknown>>;
    }
  ).clientSettings ?? {};
const themedScenario = {
  ...scenario,
  preferences: {
    ...scenario.preferences,
    initialRoute: requestedRoute,
    ...(requestedInitialOverlay ? { initialOverlay: requestedInitialOverlay } : {}),
    themePreference: requestedTheme,
    ...(requestedModelSelection ? { modelSelection: requestedModelSelection } : {}),
    ...(requestedSidebarWidth !== null ? { chat_thread_sidebar_width: requestedSidebarWidth } : {}),
    ...(requestedRightPanelWidth !== null
      ? { "t3code:preview-panel-width": requestedRightPanelWidth }
      : {}),
    clientSettings: {
      ...scenarioClientSettings,
      ...(requestedLegacySidebarEnabled === null
        ? {}
        : { legacySidebarEnabled: requestedLegacySidebarEnabled === "true" }),
      ...(betaMutationEnabled ? { sidebarV2Enabled: true, sidebarAutoSettleAfterDays: 3 } : {}),
      environmentIdentificationMode: requestedEnvironmentIdentificationMode,
    },
  },
};

// SB1: when the harness injects a live socket URL (`?live=1&socket=…`), the Lynx
// pane subscribes to the SAME shared server the real Web app uses instead of
// replaying the static scenario snapshot. The harness owns the wsTicket; the
// browser only receives a ready socket URL. Everything downstream (readiness,
// emit envelopes, diagnostics) is identical, so the rest of this file is
// source-agnostic.
const liveRequested = previewUrl.searchParams.get("live") === "1";
const liveSocketUrl = previewUrl.searchParams.get("socket");
const useLive = liveRequested && Boolean(liveSocketUrl);

const emitGlobalEvent = (eventName: string, params: [unknown]) => {
  view.sendGlobalEvent(eventName, params as never);
};
let keyboardSequence = 0;

const liveHost = useLive
  ? new LiveConnectorHost(
      {
        socketUrl: liveSocketUrl as string,
        route: requestedRoute,
        overlay:
          requestedInitialOverlay ??
          (scenario.preferences as { initialOverlay?: string }).initialOverlay ??
          null,
        theme: requestedTheme,
      },
      emitGlobalEvent as never,
    )
  : null;
const connectorHost = liveHost
  ? null
  : new BrowserPreviewConnectorHost(scenario, emitGlobalEvent as never);
let viewportSequence = 0;
let themeSequence = 0;
const viewportSnapshot = () => ({
  width: viewportContract.cssWidth,
  height: viewportContract.cssHeight,
  pointer: "fine" as const,
  sequence: ++viewportSequence,
  testResize: true,
});
/** One handler seam regardless of the data source. */
const nativeCallHandler = (method: string, data: unknown, moduleName: string): unknown => {
  if (method === T3_VIEWPORT_READY_METHOD) {
    return viewportSnapshot();
  }
  if (method === "t3:theme.ready") {
    return {
      theme: requestedTheme,
      sequence: ++themeSequence,
    };
  }
  if (method === T3_VIEWPORT_SET_FOR_TEST_METHOD) {
    const value = data as { readonly width?: unknown; readonly height?: unknown } | null;
    if (typeof value?.width !== "number" || typeof value.height !== "number") return false;
    return true;
  }
  const terminalFocus = handleBrowserPreviewTerminalFocus(method, data);
  if (terminalFocus !== null) return terminalFocus;
  const result = liveHost
    ? liveHost.handleNativeCall(method, data, moduleName)
    : connectorHost!.handleNativeCall(method, data, moduleName);
  if (
    result !== null &&
    (typeof result === "object" || typeof result === "function") &&
    typeof (result as { then?: unknown }).then === "function"
  ) {
    return (result as Promise<unknown>).catch((error: unknown) => ({
      __t3BridgeError: error instanceof Error ? error.message : String(error),
    }));
  }
  return result;
};
const connectorDiagnostics = liveHost ? liveHost.diagnostics : connectorHost!.diagnostics;
const nativeModules = createBrowserPreviewNativeModules(themedScenario);
const diagnostics: BrowserPreviewDiagnostics = {
  kind: "typed-browser-preview",
  bundleUrl,
  dataSource: liveHost ? "live-server" : "scenario",
  rendererErrors: [],
  nativeModuleCalls: [],
  connector: connectorDiagnostics,
  known: scenario.known,
  unsupportedCapabilities: connectorDiagnostics.unsupportedCapabilities,
  viewportContract,
  semanticReady: false,
  rendered: false,
  stageBackdropPresent: false,
  heroPresent: false,
  activeThreadTitle: null,
  measureGeometry: () => measureGeometry(),
  // These diagnostic drivers are static-scenario controls; against a live
  // server the sequence is server-driven, so they are no-ops that return the
  // current sequence.
  advanceToReady: () =>
    connectorHost ? connectorHost.emitStatus("ready") : connectorDiagnostics.lastSequence,
  emitSequenceGapForDiagnostic: () =>
    connectorHost
      ? connectorHost.emitSequenceGapForDiagnostic("connecting")
      : connectorDiagnostics.lastSequence,
  switchScenario: (nextScenarioId) => {
    if (!connectorHost) return connectorDiagnostics.lastSequence;
    const next = BROWSER_PREVIEW_SCENARIOS[nextScenarioId];
    diagnostics.known = next.known;
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", nextScenarioId);
    window.history.replaceState(null, "", url);
    return connectorHost.switchScenario(nextScenarioId);
  },
  dispatchKeyboardShortcut: (shortcut) => {
    const threadIndex = shortcut.startsWith("thread-")
      ? Number(shortcut.slice("thread-".length))
      : null;
    const key = threadIndex === null ? (shortcut === "files" ? "p" : "k") : String(threadIndex);
    const code = threadIndex === null ? `Key${key.toUpperCase()}` : `Digit${threadIndex}`;
    emitGlobalEvent("t3:keyboard", [
      {
        type: "keydown",
        key,
        code,
        modifiers: { meta: true, ctrl: false, shift: false, alt: false },
        repeat: false,
        source: { kind: "lynxtron-menu", platform: "darwin" },
        sequence: ++keyboardSequence,
      },
    ]);
    return true;
  },
  dispatchModifierState: (type, modifiers) => {
    emitGlobalEvent("t3:keyboard", [
      {
        type: "keydown",
        key: "Meta",
        code: "MetaLeft",
        modifiers,
        repeat: false,
        source: { kind: "lynxtron-menu", platform: "darwin" },
        sequence: ++keyboardSequence,
      },
    ]);
    return type === "keydown" || type === "keyup";
  },
  openWorkspaceMenuForHarness: (open) => {
    emitGlobalEvent("t3:workspace-menu-test", [{ open }]);
    return true;
  },
  invokeTooltipForHarness: (relationId, action) => {
    emitGlobalEvent("t3:tooltip-test", [{ relationId, action }]);
    return true;
  },
  invokeMenuForHarness: (relationId) => {
    emitGlobalEvent("t3:menu-test", [{ relationId }]);
    return true;
  },
  invokeResizeForHarness: (target, startX, endX) => {
    emitGlobalEvent("t3:resize-test", [{ target, startX, endX }]);
    return true;
  },
};
window.__T3_LYNX_WEB_PREVIEW__ = diagnostics;

const applyViewportContract = (next: BrowserPreviewViewportContract): void => {
  viewportContract = next;
  diagnostics.viewportContract = next;
  view.browserConfig = {
    pixelRatio: next.pixelRatio,
    pixelWidth: next.pixelWidth,
    pixelHeight: next.pixelHeight,
  };
  view.style.width = `${next.cssWidth}px`;
  view.style.height = `${next.cssHeight}px`;
};

const handleViewportResize = (): void => {
  const next = resolveBrowserPreviewViewportContract({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
  });
  if (
    next.cssWidth === viewportContract.cssWidth &&
    next.cssHeight === viewportContract.cssHeight &&
    next.pixelRatio === viewportContract.pixelRatio
  ) {
    return;
  }
  applyViewportContract(next);
  emitGlobalEvent(T3_VIEWPORT_EVENT, [viewportSnapshot()]);
};

// The live renderer's first ready snapshot must already contain the server
// config. Load the Lynx bundle only after the one owned live connection has
// started; otherwise config can be emitted before the renderer subscribes.
const liveHostReady = liveHost ? liveHost.start() : Promise.resolve();

const toRect = (element: Element | null): BrowserPreviewRect | null => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
};

const iconSelectors = [
  ".sidebar-v2-search .size-4",
  ".sidebar-v2-new-thread .size-4",
  ".sidebar-v2-project-scope-trigger .size-4",
  ".sidebar-v2-new-project .size-4",
] as const;

const measureGeometry = (): BrowserPreviewGeometry => {
  const shadowRoot = view.shadowRoot;
  return {
    root: toRect(shadowRoot?.querySelector('[part="page"]') ?? null),
    sidebar: toRect(shadowRoot?.querySelector("[data-app-sidebar]") ?? null),
    toolbar: toRect(shadowRoot?.querySelector("[data-chat-header]") ?? null),
    composer: toRect(shadowRoot?.querySelector(".composer-frame") ?? null),
    icons16: iconSelectors.map((selector) => ({
      selector,
      rect: toRect(shadowRoot?.querySelector(selector) ?? null),
    })),
  };
};

const updateReadiness = () => {
  const shadowRoot = view.shadowRoot;
  const productRoot = shadowRoot?.querySelector('[part="page"]');
  if (!productRoot) return false;
  diagnostics.rendered = true;
  const productText = productRoot.textContent ?? "";
  diagnostics.stageBackdropPresent = Boolean(
    shadowRoot?.querySelector(
      ".sidebar__brand-bg, .sidebar-stage-backdrop, [data-stage-backdrop-variant]",
    ),
  );
  diagnostics.heroPresent = Boolean(shadowRoot?.querySelector(".hero__headline"));
  diagnostics.activeThreadTitle =
    shadowRoot?.querySelector("[data-chat-header]")?.textContent?.trim() ?? null;
  const notConnecting = !productText.includes("T3 Code: Connecting...");
  if (liveHost) {
    // Live-server mode: data is server-driven, so static scenario markers do
    // not apply. Readiness = the live connector connected, the product tree
    // rendered real content, and it is no longer showing the connecting
    // placeholder.
    diagnostics.semanticReady =
      connectorDiagnostics.nativeModuleReady &&
      liveHost.diagnostics.connected &&
      productText.trim().length > 0 &&
      notConnecting;
  } else {
    const readyMarkers = scenario.readyMarkers ?? Object.values(diagnostics.known);
    const knownVisible = readyMarkers.every((value) => productText.includes(value));
    diagnostics.semanticReady =
      connectorDiagnostics.nativeModuleReady &&
      connectorDiagnostics.readyCalls > 0 &&
      knownVisible &&
      notConnecting;
  }
  status.value = diagnostics.semanticReady ? "ready" : "rendered";
  return true;
};
const waitForProductRender = (): void => {
  updateReadiness();
  if (!diagnostics.semanticReady && diagnostics.rendererErrors.length === 0) {
    requestAnimationFrame(waitForProductRender);
  }
};

view.onNativeModulesCall = (method, data, moduleName) => {
  diagnostics.nativeModuleCalls.push({ moduleName, method, data });
  requestAnimationFrame(waitForProductRender);
  return nativeCallHandler(method, data, moduleName);
};

view.addEventListener("error", (event) => {
  const rawDetail = "detail" in event ? (event as { detail?: unknown }).detail : undefined;
  // Error instances do not JSON-serialize their message/stack, so extract them
  // explicitly; otherwise the recorded detail is an opaque `{"error":{}}`.
  const describeError = (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof value === "object") {
      const asString = String(value);
      const own: Record<string, unknown> = {};
      for (const key of Object.getOwnPropertyNames(value)) {
        try {
          own[key] = (value as Record<string, unknown>)[key];
        } catch {
          own[key] = "<unreadable>";
        }
      }
      return { asString, own };
    }
    return value;
  };
  const extract = (value: unknown): unknown => {
    if (value && typeof value === "object") {
      const clone: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        clone[key] = key === "error" ? describeError(entry) : entry;
      }
      return clone;
    }
    return describeError(value);
  };
  const detail = rawDetail === undefined ? event.type : JSON.stringify(extract(rawDetail));
  diagnostics.rendererErrors.push(detail);
  status.value = "error";
});

// Condition the Lynx-for-Web shadow root to Lynx's native layout results. The
// Lynx CSS pipeline strips `flex-direction:column`/`flex-grow` as
// native-redundant (even from `overrides.css` custom classes) and does not
// carry the `.flex-1/.flex-auto/.flex-none` shorthands to Lynx-for-Web, where
// `x-view` otherwise follows the CSS defaults (`row`, `flex-grow:0`). Bare
// `flex`/`.flex-row` (row) already compile correctly, so only the dropped
// column/grow utilities and explicit custom layout classes need re-supplying.
// Browser-proxy conditioning only, scoped to classes with known Native layout.
// Browser-proxy conditioning, not product code.
let injectedLynxLayoutDefaults = false;
function injectLynxLayoutDefaults(shadowRoot: ShadowRoot): void {
  if (injectedLynxLayoutDefaults) return;
  injectedLynxLayoutDefaults = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(
    `@font-face{font-family:"T3 DM Sans";src:url("${dmSansUrl}") format("woff2");font-weight:100 1000;}` +
      `@font-face{font-family:"T3 JetBrains Mono";src:url("${jetBrainsMonoUrl}") format("woff2");font-weight:400;}` +
      ".flex-col{flex-direction:column;}" +
      ".flex-col-reverse{flex-direction:column-reverse;}" +
      ".flex-1{flex:1 1 0%;}" +
      ".flex-auto{flex:1 1 auto;}" +
      ".flex-none{flex:none;}" +
      ".flex-initial{flex:0 1 auto;}" +
      ".settings-root{display:flex;flex:1 1 0%;flex-direction:row;width:100%;height:100%;min-width:0;}" +
      ".settings-nav{" +
      "display:flex;flex:none;flex-direction:column;width:232px;min-width:232px;height:100%;}" +
      ".settings-nav__items{display:flex;flex:1 1 0%;flex-direction:column;width:100%;}" +
      ".settings-nav__footer{display:flex;flex:none;flex-direction:column;width:100%;}" +
      ".settings-main{" +
      "display:flex;flex:1 1 0%;flex-direction:column;width:0;min-width:0;height:100%;}" +
      ".settings-content{" +
      "display:flex;flex:none;flex-direction:column;width:100%;min-width:0;box-sizing:border-box;}" +
      ".source-control-panel,.source-control-section{" +
      "display:flex;flex-direction:column;width:100%;min-width:0;}" +
      // overrides.css custom layout classes whose flex-direction/grow the Lynx
      // pipeline strips as native-redundant; re-supply for the browser proxy.
      ".hero{flex-direction:column;flex-grow:1;}" +
      ".hero__inner{flex-direction:column;}" +
      ".composer-overlay{flex-direction:column;width:100%;}" +
      ".composer-settled-banner__copy{display:flex;flex-direction:column;flex-grow:1;}" +
      ".composer-stack,.composer-shell,.composer-frame{" +
      "display:flex;flex-direction:column;width:100%;max-width:768px;min-width:0;box-sizing:border-box;}" +
      ".composer-surface,.composer-editor-area,.composer-footer{" +
      "width:100%;max-width:100%;min-width:0;box-sizing:border-box;}" +
      ".composer-surface{display:flex;flex-direction:column;}" +
      ".composer-pending-approval{" +
      "display:flex!important;flex-direction:column!important;width:100%;height:114px;padding:16px 20px;" +
      "box-sizing:border-box;flex:none;}" +
      ".composer-pending-approval__heading," +
      ".composer-pending-approval__detail{display:flex!important;flex-direction:row!important;}" +
      ".composer-context-strip{" +
      "align-self:center;width:calc(100% - 44px);max-width:724px;min-width:0;box-sizing:border-box;}" +
      ".composer-footer,.composer-toolbar-row,.composer-primary-actions{display:flex;flex-direction:row;}" +
      ".composer-compact-controls-menu,.composer-compact-controls-menu__scroll," +
      ".composer-compact-controls-menu__content,.composer-compact-controls-menu__section{" +
      "display:flex;flex-direction:column;}" +
      ".composer-compact-controls-menu__scroll{overflow-y:auto;}" +
      ".composer-compact-controls-menu__item{display:flex;flex-direction:row;width:100%;}" +
      ".composer-compact-controls-menu__label{display:block;flex:1 1 0%;min-width:0;}" +
      ".sidebar-v2-row-card__content{display:flex;flex-direction:column;}" +
      ".sidebar-v2-details-content,.sidebar-v2-details-rows{display:flex;flex-direction:column;}" +
      ".sidebar-v2-details-row{display:flex;flex-direction:row;}" +
      ".project-action-dialog,.project-action-dialog__header,.project-action-field{" +
      "display:flex;flex-direction:column;}" +
      ".project-action-dialog__body{display:block;flex:1 1 0%;width:100%;min-height:0;}" +
      ".project-action-dialog__footer{" +
      "display:flex;flex:none;flex-direction:row;width:100%;box-sizing:border-box;}" +
      ".composer__input{height:70px!important;}" +
      ".transcript-user-outer{padding-bottom:16px;box-sizing:border-box;}" +
      ".transcript-user-meta-spacer{height:40px!important;}" +
      ".transcript-assistant-group,[data-timeline-row-kind='work']{" +
      "padding-bottom:8px;box-sizing:border-box;}" +
      ".transcript-work-group__entries{width:calc(100% + 8px)!important;}" +
      ".timeline-row-root--turn-fold{height:45px!important;}" +
      ".transcript-assistant-row{display:flex;flex-direction:column;width:100%;box-sizing:border-box;}" +
      ".transcript-assistant-row>.inline-markdown-row{min-height:23px!important;margin-bottom:0!important;}" +
      ".transcript-assistant-meta-spacer{display:block;width:100%;height:24px;}" +
      ".transcript-assistant-meta-spacer--code{height:31px;}" +
      ".transcript-assistant-meta-spacer--checkpoint{height:26px;}" +
      ".right-panel{display:flex;flex-direction:column;}" +
      ".right-panel__tabs{height:44px!important;min-height:44px!important;box-sizing:border-box;}" +
      ".right-panel__tab-scroll{flex:none;width:max-content!important;max-width:calc(100% - 132px);}" +
      ".right-panel__tab-list>[data-active-tab]{min-width:100px;max-width:176px;box-sizing:border-box;}" +
      ".right-panel__add-menu{display:flex;flex-direction:column;width:128px;height:122px;}" +
      ".right-panel__add-item{display:flex;flex:none;flex-direction:row;width:118px;height:28px;}" +
      ".diff-panel-header__scope-menu,.diff-panel-header__scope-submenu{" +
      "display:flex;flex-direction:column;}" +
      ".diff-panel-header__scope-item{" +
      "display:flex;flex:none;flex-direction:row;width:230px;height:28px;}" +
      ".right-panel__content{" +
      "display:flex;flex:1 1 0%;flex-direction:column;height:0;margin-left:1px;width:calc(100% - 1px);}" +
      ".files-panel{" +
      "display:flex;flex:1 1 0%;flex-direction:column;width:100%;height:100%;min-height:0;}" +
      ".files-panel__toolbar{" +
      "display:flex;flex:none;flex-direction:row;width:100%;height:40px;box-sizing:border-box;}" +
      ".files-panel__refresh{width:24px!important;height:24px!important;}" +
      ".files-panel__browser{" +
      "display:flex;flex:1 1 0%;flex-direction:column;width:100%;height:0;min-height:0;}" +
      ".files-panel__inner{display:flex;flex-direction:column;width:100%;box-sizing:border-box;}" +
      ".files-panel__tree{" +
      "display:flex;flex-direction:column;width:100%;padding:0 16px!important;box-sizing:border-box;}" +
      ".files-panel .file-tree-children{row-gap:0!important;column-gap:0!important;}" +
      ".files-panel__search{" +
      "display:flex;flex:1 1 0%;flex-direction:row;width:0;height:28px;box-sizing:border-box;}" +
      ".file-panel{" +
      "display:flex;flex:1 1 0%;flex-direction:column;width:100%;height:100%;min-height:0;}" +
      ".file-panel__toolbar{" +
      "display:flex;flex:none;flex-direction:row;width:100%;height:40px;min-height:40px;" +
      "max-height:40px;box-sizing:border-box;}" +
      ".file-panel__breadcrumbs{display:flex;flex:1 1 0%;width:0;height:40px;min-height:40px;}" +
      ".file-panel__content{" +
      "display:flex;flex:1 1 0%;flex-direction:row;width:100%;height:0;min-height:0;}" +
      ".file-panel__editor-column{" +
      "display:flex;flex:1 1 0%;flex-direction:column;width:0;min-width:0;min-height:0;}" +
      ".file-panel__explorer{" +
      "display:flex;flex:none;flex-direction:column;width:256px;min-width:256px;height:100%;min-height:0;}" +
      ".file-panel__editor-surface{" +
      "display:flex;flex:1 1 0%;flex-direction:column;width:100%;height:0;min-height:0;}" +
      ".file-editor-preview{" +
      "display:flex;flex:1 1 0%;flex-direction:column;width:100%;height:0;min-height:0;}" +
      ".file-editor-preview__content{" +
      "display:flex;flex-direction:column;width:100%;box-sizing:border-box;}" +
      ".file-editor-line{" +
      "display:flex;flex:none;flex-direction:row;width:100%;min-height:20px;box-sizing:border-box;}" +
      ".file-editor-line__number{display:block;flex:none;width:48.8px;box-sizing:border-box;}" +
      ".file-editor-line__content{" +
      "display:block;flex:1 1 0%;width:auto!important;min-width:0;box-sizing:border-box;}" +
      ".theme-light .sidebar-settings-authority{" +
      "display:none!important;opacity:0!important;width:0!important;height:0!important;" +
      "pointer-events:none!important;}" +
      ".theme-light .sidebar-footer--authority .sidebar-settings-row>image," +
      ".theme-light .sidebar-footer--authority .sidebar-settings-row>text{" +
      "opacity:1!important;}" +
      ".files-panel__editor{" +
      "display:block;flex:1 1 0%;width:100%;height:0;min-height:0;box-sizing:border-box;}" +
      ".file-panel__statusbar{display:flex;flex:none;width:100%;min-height:28px;box-sizing:border-box;}" +
      ".diff-panel{display:flex;flex:1 1 0%;flex-direction:column;height:0;}" +
      ".diff-panel-subheader{" +
      "flex:none;height:40px;min-height:40px;max-height:40px;box-sizing:border-box;}" +
      ".diff-panel__inner{width:100%;padding:0!important;box-sizing:border-box;}" +
      ".diff-code-files,.diff-code-file,.diff-code-file__body{" +
      "display:flex;flex-direction:column;width:100%;box-sizing:border-box;}" +
      ".diff-code-file__header,.diff-code-line{width:100%;box-sizing:border-box;}" +
      ".turn-diff-card{display:flex;flex-direction:column;width:760px;box-sizing:border-box;}" +
      ".turn-diff-card__header{display:flex;flex-direction:row;width:100%;box-sizing:border-box;}" +
      ".turn-diff-card__preview,.lynx-changed-files-tree{" +
      "display:flex;flex-direction:column;width:100%;box-sizing:border-box;}" +
      ".turn-diff-card__preview-scopes,.turn-diff-card__preview-files{" +
      "display:flex;flex-direction:row;width:100%;box-sizing:border-box;}" +
      ".lynx-changed-files-tree .group.flex.w-full{" +
      "display:flex;flex-direction:row;width:100%;height:24px;min-height:24px;box-sizing:border-box;}" +
      ".lynx-changed-files-tree .flex.flex-col{" +
      "display:flex;flex-direction:column;width:100%;box-sizing:border-box;}" +
      ".transcript-work-group:has([data-transcript-work-state='expanded']){height:auto;}" +
      ".transcript-work-entry[data-transcript-work-state='expanded']{height:auto;}" +
      ".transcript-work-entry-body{display:block;box-sizing:border-box;width:100%;}" +
      ".transcript-work-entry-body .whitespace-pre-wrap{" +
      "display:block;" +
      "font-family:'SF Mono',SFMono-Regular,'T3 JetBrains Mono',Consolas,'Liberation Mono',Menlo,monospace;" +
      "font-size:11px!important;line-height:16px!important;white-space:pre-wrap;}" +
      ".transcript-work-entry-body .whitespace-pre-wrap::part(inner-box){" +
      "display:block;white-space:pre-wrap;}" +
      ".transcript-work-entry-body .whitespace-pre-wrap raw-text{" +
      "display:block!important;" +
      "font-family:'SF Mono',SFMono-Regular,'T3 JetBrains Mono',Consolas,'Liberation Mono',Menlo,monospace;" +
      "font-size:11px;line-height:16px;white-space:pre-wrap!important;" +
      "white-space-collapse:preserve!important;}" +
      ".inline-markdown-text{font-family:'T3 DM Sans','DM Sans',-apple-system,system-ui,sans-serif;}" +
      ".markdown-body{display:flex;flex-direction:column;width:100%;flex-shrink:0;}" +
      ".md-paragraph{display:block;width:100%;}" +
      ".md-paragraph::part(inner-box){display:block;}" +
      ".md-paragraph>.md-inline{display:inline;}" +
      ".md-paragraph>.md-inline::part(inner-box){display:contents!important;}" +
      ".md-paragraph>.md-inline-code{display:inline-flex;}" +
      ".file-editor-line__content>.file-editor-token," +
      ".file-editor-line__content>lynx-wrapper>.file-editor-token{display:inline!important;}" +
      ".file-editor-line__content>.file-editor-token::part(inner-box)," +
      ".file-editor-line__content>lynx-wrapper>.file-editor-token::part(inner-box){" +
      "display:contents!important;}" +
      ".md-code-block{display:flex;flex-direction:column;width:100%;box-sizing:border-box;}" +
      ".md-code-header{display:flex;flex-direction:row;width:100%;min-height:32px;box-sizing:border-box;}" +
      ".md-code-text{display:block;width:100%;box-sizing:border-box;}" +
      ".palette-panel,.qs-results,.palette-results,.qs-section{flex-direction:column;}" +
      ".palette-row:hover{background-color:var(--accent)!important;color:var(--accent-foreground)!important;}" +
      ".palette-section-label{display:block;}" +
      ".model-picker-content,.picker-list{flex-direction:column;}" +
      ".model-picker-content,.picker-list{flex-grow:1;}" +
      ".model-picker-rail,.model-picker-search,.model-picker-row{box-sizing:border-box;}" +
      ".model-picker-anchor{z-index:51;}" +
      ".model-picker-backdrop{z-index:0;}" +
      ".model-picker-panel{z-index:1;}" +
      ".model-picker-rail-item raw-text{width:18px!important;height:18px!important;}" +
      ".model-picker-rail-item{position:relative;}" +
      // Root overlays are absolute in Native Lynx. Lynx-for-Web's custom
      // elements retain them in flow unless the browser proxy supplies fixed
      // viewport positioning.
      ".palette-overlay,.model-picker-overlay{position:fixed;inset:0;}" +
      // Icon sizing (browser proxy). `Icon` renders `<image>` (web-core
      // `x-image`) with an inline px width/height box, but the Lynx CSS
      // pipeline drops the `size-*`/`w-*`/`h-*` utilities and web-elements
      // 0.12.3 lets the `x-image` host stretch to its flex container, so icons
      // render far larger than their intended box. Native Lynxtron sizes the
      // raster to the box; re-supply that here by making any inline-sized
      // `x-image` honor its own width/height and never flex-stretch. Scoped to
      // x-image, so nothing else is affected.
      // Icon sizing (browser proxy). `Icon` renders `<image>` (web-core
      // `x-image`) with an inline px width/height box. The Lynx CSS pipeline
      // drops the base `x-image{display:flex;contain:strict}` rule for some
      // instances, leaving them `display:inline` — on which `width` has no
      // effect, so the inner `<img>` (sized `width:100%`) paints at the PNG's
      // intrinsic size and overflows. Native Lynxtron sizes the raster to the
      // box; restore that here by forcing every `x-image` to be a
      // definite-size flex box. Scoped to x-image; nothing else is affected.
      "x-image{display:inline-flex!important;flex:none!important;align-items:center;justify-content:center;overflow:hidden;contain:strict;}" +
      "x-image::part(img){width:100%;height:100%;object-fit:contain;}" +
      // `@lynx-js/web-elements/index.css` is loaded by this document, but the
      // product custom elements live inside the LynxView shadow root. Re-supply
      // the official input/textarea host rules here so their own open shadow
      // roots receive a real inherited box instead of the template's hidden
      // zero-size form.
      "x-input{display:contents!important;font-size:14px;}" +
      "x-input::part(form),x-textarea::part(form){display:contents;}" +
      "x-input.qs-search__input::part(input){" +
      "flex:1 1 auto!important;width:auto!important;height:34px!important;margin-left:8px!important;" +
      "font-size:14px!important;line-height:34px!important;}" +
      "x-input.picker-search__input::part(input){" +
      "flex:1 1 auto!important;width:auto!important;height:26px!important;margin-left:8px!important;" +
      "font-size:14px!important;line-height:26px!important;}" +
      "x-input.sidebar-inline-search__input::part(input){" +
      "display:block!important;flex:1 1 auto!important;width:100%!important;height:30px!important;" +
      "border:0!important;padding:0!important;font-family:inherit!important;font-size:14px!important;" +
      "font-weight:inherit!important;line-height:20px!important;color:inherit!important;" +
      "-webkit-text-fill-color:currentColor!important;caret-color:currentColor!important;background:transparent!important;}" +
      "x-input.files-panel__search-input::part(input){" +
      "display:block!important;flex:1 1 auto!important;width:100%!important;height:28px!important;" +
      "border:0!important;padding:0!important;font-size:12px!important;line-height:28px!important;" +
      "background:transparent!important;}" +
      "x-textarea.composer__input::part(textarea){" +
      "display:block!important;width:100%!important;height:70px!important;border:0!important;" +
      "padding:0!important;resize:none!important;font-size:14px!important;line-height:23px!important;" +
      "background:transparent!important;}" +
      "x-textarea.files-panel__editor::part(textarea){" +
      "display:block!important;width:100%!important;height:100%!important;border:0!important;" +
      "padding:14px 16px 24px!important;font-family:inherit!important;font-size:13px!important;" +
      "line-height:20px!important;color:inherit!important;background:transparent!important;}" +
      "x-input::part(input),x-input::part(form),x-textarea::part(textarea),x-textarea::part(form){" +
      "box-sizing:inherit;width:inherit;height:inherit;border:inherit;border-radius:inherit;" +
      "align-self:inherit;justify-self:inherit;text-align:inherit;direction:inherit;" +
      "caret-color:inherit;font-family:inherit;font-size:inherit;font-weight:inherit;" +
      "letter-spacing:inherit;flex:inherit;background-color:inherit;z-index:inherit;" +
      "margin:inherit;padding:inherit;color:inherit;}",
  );
  shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
  shadowRoot.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement)) {
        return;
      }
      const composer = target.matches('[data-composer-editor="true"]');
      const fileEditor =
        target.matches(".files-panel__editor") ||
        (target.getRootNode() instanceof ShadowRoot &&
          (target.getRootNode() as ShadowRoot).host.matches("x-textarea.files-panel__editor"));
      if (!composer && !fileEditor) return;
      target.dispatchEvent(
        new CustomEvent("lynxinput", {
          bubbles: false,
          composed: false,
          cancelable: true,
          detail: {
            value: target.value,
            textLength: target.value.length,
            cursor: target.selectionStart,
            isComposing: event instanceof InputEvent ? event.isComposing : false,
            selectionStart: target.selectionStart,
            selectionEnd: target.selectionEnd,
          },
        }),
      );
    },
    true,
  );
}

const observeProductRender = (): void => {
  const shadowRoot = view.shadowRoot;
  if (!shadowRoot) {
    requestAnimationFrame(observeProductRender);
    return;
  }
  injectLynxLayoutDefaults(shadowRoot);
  const synchronizeTextareaValues = () => {
    for (const textarea of shadowRoot.querySelectorAll<HTMLElement & { value: string }>(
      "x-textarea.files-panel__editor, textarea.files-panel__editor",
    )) {
      const value = textarea.getAttribute("value");
      if (value !== null && textarea.value !== value) textarea.value = value;
    }
  };
  const observer = new MutationObserver(() => {
    synchronizeTextareaValues();
    updateReadiness();
  });
  observer.observe(shadowRoot, {
    attributes: true,
    attributeFilter: ["value"],
    childList: true,
    subtree: true,
  });
  synchronizeTextareaValues();
  updateReadiness();
};
observeProductRender();

applyViewportContract(viewportContract);
view.nativeModulesMap = nativeModules.map;
void liveHostReady.then(() => {
  if (liveHost?.diagnostics.error) {
    diagnostics.rendererErrors.push(liveHost.diagnostics.error);
    status.value = "error";
    return;
  }
  view.url = bundleUrl;
});
window.addEventListener("resize", handleViewportResize);

window.addEventListener(
  "beforeunload",
  () => {
    window.removeEventListener("resize", handleViewportResize);
    nativeModules.dispose();
    liveHost?.dispose();
  },
  { once: true },
);
