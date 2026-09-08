/**
 * SB3 single-server dual-frontend workbench capture.
 *
 * Replaces the hand-built Web reference pane with the REAL Web app. It:
 *   1. launches ONE seeded, isolated T3 Code server (SB2 dataset),
 *   2. serves both panes single-origin — the real `apps/web/dist` under
 *      `/web-app/`, the Lynx-for-Web bundle under `/lynx/` — and proxies
 *      `/api|/ws|/oauth|/.well-known` to the server (the dev single-origin
 *      model, so no baked origins and no CORS),
 *   3. mints ONE wsTicket per run for the Lynx pane's live connector transport,
 *      captures the web pane's pairing token from server startup output,
 *   4. for each viewport, waits for BOTH panes to render the same seeded record
 *      from the same server, then records identity, geometry, console, and the
 *      single/side-by-side/diff PNGs and a comparison.html.
 *
 * Both panes are the shipping artifacts, so a difference the harness surfaces is
 * a real Web-vs-Lynx-for-Web difference, not a reference-fidelity artifact.
 * Native Lynxtron correlation remains Plan 11A BW5; browser evidence is
 * diagnostic until then.
 *
 * Usage:
 *   node scripts/capture-shared-workbench.mjs \
 *     [--base-dir apps/lynxtron/.t3-workbench] [--viewport 1280x820] [--all-viewports] \
 *     [--output evidence/2026-08-03/SB4] [--keep-server]
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile, stat } from "node:fs/promises";
import { createServer, request as httpRequestRaw } from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  sourceControlErrorSettingsGeometryMatches,
  sourceControlLoadingSettingsGeometryMatches,
} from "./shared-workbench/settingsGates.mjs";
import { inferSemanticRoute } from "./shared-workbench/semanticRoute.mjs";
import componentLabCatalog from "../../web/src/components/components-lab/catalog.json" with { type: "json" };

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const lynxAppDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(lynxAppDir, "../..");
const WEB_DIST = path.join(repoRoot, "apps/web/dist");
const LYNX_BUILD_DIR = path.join(lynxAppDir, "output/browser-preview");
const WORKBENCH_ASSETS = path.join(scriptDir, "shared-workbench");
const SERVER_BIN = process.env.T3_SERVER_BIN ?? path.join(repoRoot, "apps/server/dist/bin.mjs");
const CHROME_BIN =
  process.env.T3_WORKBENCH_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HOST = "127.0.0.1";

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(name);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const baseDir = path.resolve(argValue("--base-dir", path.join(lynxAppDir, ".t3-workbench")));
const outputRoot = path.resolve(argValue("--output", "evidence/2026-08-03/SB4"));
const manifestPath = process.argv.includes("--manifest")
  ? path.resolve(argValue("--manifest", ""))
  : null;
const stateId = argValue("--state-id", "new-thread-hero");
const isComponentsLabState = stateId === "components-lab";
const nativeOnlyStateIds = new Set(["settings-archive-mutation"]);
if (nativeOnlyStateIds.has(stateId)) {
  throw new Error(`${stateId} is not implemented by the Browser paired-capture harness.`);
}
const inferredSemanticRoute = inferSemanticRoute(stateId);
if (!inferredSemanticRoute && !hasFlag("--semantic-route")) {
  throw new Error(`Cannot infer semantic route for ${stateId}; pass --semantic-route explicitly.`);
}
const semanticRoute = argValue("--semantic-route", inferredSemanticRoute);
const settingsWebRouteBySemanticRoute = {
  "settings-archive": "/settings/archived",
  "settings-beta": "/settings/general",
};
const requestedWebRoute = argValue(
  "--web-route",
  semanticRoute === "components-lab"
    ? "/components-lab"
    : semanticRoute.startsWith("settings-")
      ? (settingsWebRouteBySemanticRoute[semanticRoute] ??
        `/settings/${semanticRoute
          .replace(/^settings-/, "")
          .replace(/-(loading|error|mutation)$/, "")}`)
      : "/",
);
const theme =
  argValue("--theme", stateId.endsWith("-light") ? "light" : "dark") === "light" ? "light" : "dark";
const defaultOverlayByStateId = {
  "composer-compact-controls-light": "compact-controls",
  "composer-compact-controls-open": "compact-controls",
  "composer-compact-controls-inline-files-narrow": "compact-controls",
  "composer-compact-controls-inline-files-short": "compact-controls",
  "diff-scope-menu": "diff-scope-menu",
  "file-picker-default": "file-picker",
  "model-picker-default": "model-picker",
  "model-picker-provider-rail": "model-picker",
  "model-picker-query": "model-picker",
  "model-picker-empty": "model-picker",
  "model-picker-selected": "model-picker",
  "model-picker-interaction": "model-picker",
  "settings-model-picker": "model-picker",
  "project-action-dialog": "project-action-dialog",
  "right-panel-add-menu": "right-panel-add-menu",
  "workspace-menu-open": "workspace-menu",
  "quick-switch-default": "quick-switch",
  "quick-switch-query": "quick-switch",
  "quick-switch-query-light": "quick-switch",
  "quick-switch-actions-only": "quick-switch",
  "quick-switch-empty": "quick-switch",
  "command-palette-navigation": "quick-switch",
};
const defaultQueryByStateId = {
  "model-picker-query": "pickle",
  "model-picker-empty": "__t3_no_models__",
  "quick-switch-query": "settings",
  "quick-switch-query-light": "settings",
  "quick-switch-actions-only": ">",
  "quick-switch-empty": "zzzz-no-result",
};
const overlay = argValue("--overlay", defaultOverlayByStateId[stateId] ?? "");
const requiresShortcutInput =
  (overlay === "quick-switch" || overlay === "file-picker") &&
  stateId !== "add-project-sources" &&
  stateId !== "sidebar-v2-new-thread-projects";
const query = argValue("--query", defaultQueryByStateId[stateId] ?? "");
const defaultProviderIdByStateId = {
  "model-picker-provider-rail": "opencode",
};
const providerId = argValue("--provider-id", defaultProviderIdByStateId[stateId] ?? "");
const composerInput = argValue("--composer-input", "");
const sidebarQuery = argValue("--sidebar-query", "");
const keybindingsQuery = argValue("--keybindings-query", "");
const sidebarTargetState = argValue("--sidebar-state", "");
const projectSettingsExpectation = argValue("--project-settings-expect", "parity");
const legacySidebarEnabled =
  argValue("--legacy-sidebar", stateId === "sidebar-project-groups" ? "true" : "false") === "true";
const requestedSidebarWidthValue = Number(argValue("--sidebar-width", ""));
const requestedSidebarWidth =
  Number.isFinite(requestedSidebarWidthValue) && requestedSidebarWidthValue > 0
    ? requestedSidebarWidthValue
    : null;
const requestedRightPanelWidthValue = Number(argValue("--right-panel-width", ""));
const requestedRightPanelWidth =
  Number.isFinite(requestedRightPanelWidthValue) && requestedRightPanelWidthValue > 0
    ? requestedRightPanelWidthValue
    : null;
const explicitChangedFilesTargetState = argValue("--changed-files-state", "");
const expandTurnId = argValue("--expand-turn-id", "");
const filePath = argValue("--file-path", "docs/PORT_WORKFLOW.md");
const switchFilePath = argValue("--switch-file-path", "docs/PORTING_STRATEGY.md");
const fileEditSuffix = argValue("--file-edit-suffix", " T3_FILE_SAVE_FIDELITY_SENTINEL");
const fileEditClient = argValue("--file-edit-client", "");
const explicitExpectedThreadId = argValue("--expect-thread", "");
const explicitSeedSource = argValue("--seed-source", "");
const expandThinking = hasFlag("--expand-thinking");
const keepServer = hasFlag("--keep-server");
const terminalOnlyImages = hasFlag("--terminal-only-images");
const paneImagesOnly = hasFlag("--pane-images-only");
const providerDialogStopAt = argValue(
  "--provider-dialog-stop-at",
  stateId === "settings-providers-add-dialog-light" ? "driver" : "complete",
);
const timeoutMs = Number(argValue("--timeout-ms", "35000"));
const selectedModelFixture = {
  instanceId: "codex",
  model: "gpt-5.4-mini",
};

function webCredentialForState({ desktopBootstrapToken, startupToken, stateId: targetStateId }) {
  return targetStateId === "settings-connections" ||
    targetStateId === "settings-connections-mutation-browser"
    ? desktopBootstrapToken
    : startupToken;
}
if (sidebarTargetState && !["expanded", "collapsed"].includes(sidebarTargetState)) {
  throw new Error(`Unsupported --sidebar-state: ${sidebarTargetState}`);
}
if (!["missing", "parity"].includes(projectSettingsExpectation)) {
  throw new Error(`Unsupported --project-settings-expect: ${projectSettingsExpectation}`);
}
if (
  explicitChangedFilesTargetState &&
  !["expanded", "preview", "collapsed"].includes(explicitChangedFilesTargetState)
) {
  throw new Error(`Unsupported --changed-files-state: ${explicitChangedFilesTargetState}`);
}
if (stateId === "file-editor-editing-save" && !["web", "lynx"].includes(fileEditClient)) {
  throw new Error("--file-edit-client must be web or lynx for file-editor-editing-save.");
}
if (!["complete", "driver"].includes(providerDialogStopAt)) {
  throw new Error("--provider-dialog-stop-at must be complete or driver.");
}
const isLifecycleFaultState = stateId === "lifecycle-error" || stateId === "composer-disabled";
const requiresStableProviderFaultPreflight = isLifecycleFaultState;
const isEmptyTranscriptState = stateId === "existing-thread-idle";
const isNarrowComposerExpandState = stateId === "chat-input-narrow-expanded";
const isNarrowChatThreadState = stateId === "chat-thread-narrow" || isNarrowComposerExpandState;
const isChatOutlineState = stateId === "chat-outline";
const isMultiStepQuestionState = stateId === "existing-thread-question-multi-step";
const isGitPublishDialogState = stateId === "git-publish-dialog";
const isProjectActionDialogState = stateId === "project-action-dialog";
const isProjectSettingsState = stateId === "sidebar-project-settings";
const isBetaMutationState = stateId === "settings-beta-mutation";
const isBetaSettingsState = stateId === "settings-beta" || stateId === "settings-beta-light";
const isBackgroundActivityMutationState = stateId === "settings-background-activity-mutation";
const isSettingsModelMutationState = stateId === "settings-model-picker-mutation";
const isSourceControlDetailsState = stateId === "settings-source-control-details";
const isModelPickerInteractionState = stateId === "model-picker-interaction";
const isConnectionsMutationState = stateId === "settings-connections-mutation-browser";
const isAddProviderDialogState =
  stateId === "settings-providers-add-dialog" || stateId === "settings-providers-add-dialog-light";
const isProvidersSettingsState = stateId === "settings-providers" || isAddProviderDialogState;
const isFilesBrowserState =
  stateId === "files-browser" || stateId === "settled-banner-inline-files-narrow";
const isSettledBannerInlineFilesState = stateId === "settled-banner-inline-files-narrow";
const isFileEditingSaveState = stateId === "file-editor-editing-save";
const isOpenInMenuState = stateId === "file-editor-open-in-menu";
const isNarrowFileEditorState =
  stateId === "file-editor-detail-narrow-inline" || isFileEditingSaveState;
const isFileEditorState =
  stateId === "file-editor-detail" ||
  stateId === "file-editor-detail-light" ||
  stateId === "file-editor-detail-narrow-inline" ||
  isOpenInMenuState ||
  isFileEditingSaveState;
const isCompactControlsState =
  stateId === "composer-compact-controls-light" ||
  stateId === "composer-compact-controls-open" ||
  stateId === "composer-compact-controls-inline-files-narrow" ||
  stateId === "composer-compact-controls-inline-files-short";
const isShortCompactControlsState = stateId === "composer-compact-controls-inline-files-short";
const isRightPanelAddMenuState = stateId === "right-panel-add-menu";
const isRightPanelTerminalMultiSessionState = stateId === "right-panel-terminal-multi-session";
const isRightPanelTerminalSplitState = stateId === "right-panel-terminal-horizontal-split";
const isRightPanelTerminalVerticalSplitState = stateId === "right-panel-terminal-vertical-split";
const isRightPanelTerminalState =
  stateId === "right-panel-terminal" ||
  isRightPanelTerminalMultiSessionState ||
  isRightPanelTerminalSplitState ||
  isRightPanelTerminalVerticalSplitState;
const isDiffScopeMenuState = stateId === "diff-scope-menu";
const isComposerPlanModeState = stateId === "composer-plan-mode";
const isFlatSidebarLayoutState = new Set([
  "sidebar-flat-layout",
  "sidebar-v2-new-thread-hover",
  "sidebar-v2-new-project-hover",
  "sidebar-v2-new-thread-projects",
  "sidebar-thread-shortcuts",
  "add-project-sources",
  "command-palette-navigation",
]).has(stateId);
const isSidebarControlHoverState =
  stateId === "sidebar-v2-new-thread-hover" || stateId === "sidebar-v2-new-project-hover";
const isSidebarThreadHoverPreviewState = stateId === "sidebar-thread-hover-preview";
const isNewThreadHeroState = stateId === "new-thread-hero" || stateId === "new-thread-hero-light";
const isKeybindingsRemoveMutationState = stateId === "settings-keybindings-remove-mutation";
const isKeybindingsEditResetMutationState = stateId === "settings-keybindings-edit-reset-mutation";
const isKeybindingsMutationState =
  stateId === "settings-keybindings-mutation" ||
  isKeybindingsRemoveMutationState ||
  isKeybindingsEditResetMutationState;
const isFailedThreadState =
  stateId === "existing-thread-failed" || stateId === "existing-thread-failed-dismissed";
const isFailedThreadDismissedState = stateId === "existing-thread-failed-dismissed";
const isSidebarThreadShortcutState = stateId === "sidebar-thread-shortcuts";
const isFilesSurfaceState =
  isFilesBrowserState || isFileEditorState || isCompactControlsState || isRightPanelAddMenuState;
const composerExpectationByStateId = {
  "composer-hero": {
    layout: "hero",
    state: "idle",
    primaryState: "disabled",
    editorDisabled: false,
  },
  "composer-sendable": {
    layout: "hero",
    state: "sendable",
    primaryState: "send",
    editorDisabled: false,
  },
  "composer-docked": {
    layout: "docked",
    state: "idle",
    primaryState: "disabled",
    editorDisabled: false,
  },
  "composer-plan-mode": {
    layout: "docked",
    state: "idle",
    primaryState: "disabled",
    editorDisabled: false,
  },
  "composer-working": {
    layout: "docked",
    state: "working",
    primaryState: "stop",
    editorDisabled: false,
  },
  "composer-connecting": {
    layout: "docked",
    state: "disabled",
    primaryState: "disabled",
    editorDisabled: false,
  },
  "composer-disabled": {
    layout: "docked",
    state: "disabled",
    primaryState: "disabled",
    editorDisabled: false,
  },
};
const composerExpectation = composerExpectationByStateId[stateId] ?? null;
const isReviewState = stateId.startsWith("review-") || isDiffScopeMenuState;
const shouldClearWebNotification = true;
const reviewExpectation =
  stateId === "review-empty"
    ? "panel-empty"
    : stateId === "review-checkpoint"
      ? "checkpoint"
      : stateId === "review-tree"
        ? "tree"
        : stateId === "review-diff" || isDiffScopeMenuState
          ? "diff"
          : null;
const changedFilesTargetState =
  explicitChangedFilesTargetState ||
  (reviewExpectation === "checkpoint" ? "preview" : reviewExpectation === "tree" ? "expanded" : "");
const ALL_VIEWPORTS = ["1280x820", "1440x900"];
const viewports = (
  hasFlag("--all-viewports") ? ALL_VIEWPORTS : [argValue("--viewport", "1280x820")]
).map((cell) => {
  const [w, h] = cell.split("x").map(Number);
  return { width: w, height: h, label: cell };
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".bundle": "application/octet-stream",
};

function composerMetricsMatch(metrics, expectation) {
  return (
    metrics?.layout === expectation.layout &&
    metrics?.state === expectation.state &&
    metrics?.primaryState === expectation.primaryState &&
    metrics?.editor?.disabled === expectation.editorDisabled
  );
}

function pendingRequestSemantics(metrics) {
  if (!metrics) return null;
  const { geometry: _geometry, ...semantics } = metrics;
  return semantics;
}

function composerAnatomyMatches(webMetrics, lynxMetrics) {
  if (!webMetrics && !lynxMetrics) return true;
  if (!webMetrics || !lynxMetrics) return false;
  const webControls = (webMetrics.controls ?? []).map(({ id, label }) => ({ id, label }));
  const lynxControls = (lynxMetrics.controls ?? []).map(({ id, label }) => ({ id, label }));
  if (JSON.stringify(webControls) !== JSON.stringify(lynxControls)) return false;
  if ((webMetrics.placeholder ?? null) !== (lynxMetrics.placeholder ?? null)) return false;
  if (
    JSON.stringify(webMetrics.contextLabels ?? []) !==
    JSON.stringify(lynxMetrics.contextLabels ?? [])
  ) {
    return false;
  }
  const webStatus = webMetrics.anatomy?.statusBanner;
  const lynxStatus = lynxMetrics.anatomy?.statusBanner;
  if (Boolean(webStatus) !== Boolean(lynxStatus)) return false;
  if (webStatus && lynxStatus) {
    if (!rectDeltaWithin(webStatus, lynxStatus, 2)) return false;
    const lifecycleStatus =
      webStatus.attributes?.["data-variant"] !== undefined ||
      lynxStatus.attributes?.["data-connection-lifecycle-phase"] !== undefined;
    if (lifecycleStatus) {
      const webCopy = webMetrics.anatomy?.statusCopy?.rect;
      const lynxCopy = lynxMetrics.anatomy?.statusCopy?.rect;
      const webAction = webMetrics.anatomy?.statusAction?.rect;
      const lynxAction = lynxMetrics.anatomy?.statusAction?.rect;
      if (!webCopy || !lynxCopy || !webAction || !lynxAction) return false;
      if (Math.abs(webCopy.x - lynxCopy.x) > 2 || Math.abs(webCopy.y - lynxCopy.y) > 2) {
        return false;
      }
      if (Math.abs(webCopy.height - lynxCopy.height) > 2) return false;
      if (Math.abs(webAction.x + webAction.width - (lynxAction.x + lynxAction.width)) > 2) {
        return false;
      }
      return true;
    }
    for (const key of ["statusCopy", "statusAction"]) {
      const webLeaf = webMetrics.anatomy?.[key];
      const lynxLeaf = lynxMetrics.anatomy?.[key];
      if (webLeaf && lynxLeaf && !rectDeltaWithin(webLeaf, lynxLeaf, 2)) return false;
    }
  }
  return true;
}

function composerToolbarAllocationMatches(webMetrics, lynxMetrics) {
  const webAllocation = webMetrics?.anatomy?.toolbarAllocation;
  const lynxAllocation = lynxMetrics?.anatomy?.toolbarAllocation;
  if (!webAllocation && !lynxAllocation) return true;
  if (!webAllocation?.rect || !lynxAllocation?.rect) return false;
  return (
    rectDeltaWithin(webAllocation, lynxAllocation, 1) &&
    Math.abs(webAllocation.primaryActionsX - lynxAllocation.primaryActionsX) <= 1
  );
}

function composerPrimaryActionAndContextMatch(webMetrics, lynxMetrics) {
  const webAnatomy = webMetrics?.anatomy;
  const lynxAnatomy = lynxMetrics?.anatomy;
  const webPrimary = webAnatomy?.primaryAction;
  const lynxPrimary = lynxAnatomy?.primaryAction;
  const webContext = webAnatomy?.context;
  const lynxContext = lynxAnatomy?.context;
  const webBackdrop = webAnatomy?.contextBackdrop;
  const lynxBackdrop = lynxAnatomy?.contextBackdrop;
  if (
    !webPrimary?.rect ||
    !lynxPrimary?.rect ||
    !webContext?.rect ||
    !lynxContext?.rect ||
    !webBackdrop?.rect ||
    !lynxBackdrop?.rect
  ) {
    return false;
  }
  return (
    webPrimary.attributes?.["data-composer-primary-state"] ===
      lynxPrimary.attributes?.["data-composer-primary-state"] &&
    rectDeltaWithin(webPrimary, lynxPrimary, 1) &&
    rectDeltaWithin(webContext, lynxContext, 1) &&
    rectDeltaWithin(webBackdrop, lynxBackdrop, 1) &&
    webBackdrop.style?.borderBottomLeftRadius === lynxBackdrop.style?.borderBottomLeftRadius &&
    webBackdrop.style?.borderBottomRightRadius === lynxBackdrop.style?.borderBottomRightRadius
  );
}

function unpersistedHeroStateReady(state) {
  const web = state?.web;
  const lynx = state?.lynx;
  const isUnpersistedKind = (kind) => kind === "draft" || kind === "none";
  return (
    semanticRoute === "new-thread" &&
    web?.semanticReady === true &&
    lynx?.semanticReady === true &&
    web.heroPresent === true &&
    lynx.heroPresent === true &&
    web.productState?.selectedThread === null &&
    lynx.productState?.selectedThread === null &&
    isUnpersistedKind(web.productState?.activeThreadKind) &&
    isUnpersistedKind(lynx.productState?.activeThreadKind)
  );
}

function heroGeometryMatches(state) {
  if (semanticRoute !== "new-thread") return true;
  const webHeroPresent = state?.web?.heroPresent === true;
  const lynxHeroPresent = state?.lynx?.heroPresent === true;
  const selectedPersistedThread =
    state?.web?.productState?.selectedThread !== null &&
    state?.lynx?.productState?.selectedThread !== null;
  if (!webHeroPresent && !lynxHeroPresent && selectedPersistedThread) return true;
  if (webHeroPresent !== lynxHeroPresent) return false;
  const webHeadline = state?.web?.heroMetrics?.headline;
  const lynxHeadline = state?.lynx?.heroMetrics?.headline;
  const webCheckout = state?.web?.composerMetrics?.anatomy?.contextControls?.[0]?.box;
  const lynxCheckout = state?.lynx?.composerMetrics?.anatomy?.contextControls?.[0]?.box;
  if (!webHeadline?.rect || !lynxHeadline?.rect || !webCheckout?.rect || !lynxCheckout?.rect) {
    return false;
  }
  const centerX = (box) => box.rect.x + box.rect.width / 2;
  return (
    Math.abs(centerX(webHeadline) - centerX(lynxHeadline)) <= 1 &&
    Math.abs(webHeadline.rect.y - lynxHeadline.rect.y) <= 2 &&
    Math.abs(webHeadline.rect.height - lynxHeadline.rect.height) <= 2 &&
    webHeadline.style.fontSize === lynxHeadline.style.fontSize &&
    webHeadline.style.lineHeight === lynxHeadline.style.lineHeight &&
    webHeadline.style.letterSpacing === lynxHeadline.style.letterSpacing &&
    Math.abs(webCheckout.rect.width - lynxCheckout.rect.width) <= 2
  );
}

function providerStatusBannerMatches(state) {
  const web = state?.web?.providerStatusBannerMetrics;
  const lynx = state?.lynx?.providerStatusBannerMetrics;
  if (!web && !lynx) return true;
  const webTimelineTop = state?.web?.timelineMetrics?.anatomy?.rowRoot?.rect?.y ?? null;
  const lynxTimelineTop = state?.lynx?.timelineMetrics?.anatomy?.rowRoot?.rect?.y ?? null;
  const timelineDoesNotOverlap = (banner, timelineTop) =>
    timelineTop === null || timelineTop >= banner.alert.rect.y + banner.alert.rect.height;
  return (
    Boolean(web && lynx) &&
    web.text === lynx.text &&
    web.actionLabels.length === 1 &&
    lynx.actionLabels.length === 1 &&
    web.actionLabels[0]?.startsWith("Dismiss ") &&
    lynx.actionLabels[0]?.startsWith("Dismiss ") &&
    web.title?.style?.color !== web.message?.style?.color &&
    lynx.title?.style?.color !== lynx.message?.style?.color &&
    timelineDoesNotOverlap(web, webTimelineTop) &&
    timelineDoesNotOverlap(lynx, lynxTimelineTop) &&
    Math.abs(web.alert.rect.width - lynx.alert.rect.width) <= 24 &&
    Math.abs(web.alert.rect.height - lynx.alert.rect.height) <= 2 &&
    Math.abs(web.icon.rect.x - web.alert.rect.x - (lynx.icon.rect.x - lynx.alert.rect.x)) <= 2 &&
    Math.abs(web.icon.rect.y - web.alert.rect.y - (lynx.icon.rect.y - lynx.alert.rect.y)) <= 2 &&
    Math.abs(
      web.description.rect.x - web.alert.rect.x - (lynx.description.rect.x - lynx.alert.rect.x),
    ) <= 2 &&
    Math.abs(
      web.description.rect.y - web.alert.rect.y - (lynx.description.rect.y - lynx.alert.rect.y),
    ) <= 2 &&
    Math.abs(web.description.rect.height - lynx.description.rect.height) <= 2 &&
    Math.abs(
      web.alert.rect.x +
        web.alert.rect.width -
        web.dismiss.rect.x -
        (lynx.alert.rect.x + lynx.alert.rect.width - lynx.dismiss.rect.x),
    ) <= 2 &&
    Math.abs(web.dismiss.rect.y - web.alert.rect.y - (lynx.dismiss.rect.y - lynx.alert.rect.y)) <=
      2 &&
    Math.abs(web.dismiss.rect.width - lynx.dismiss.rect.width) <= 2 &&
    Math.abs(web.dismiss.rect.height - lynx.dismiss.rect.height) <= 2
  );
}

function quickSwitchAnatomyMatches(webMetrics, lynxMetrics) {
  if (!webMetrics?.anatomy || !lynxMetrics?.anatomy) return false;
  const webEmpty = webMetrics.emptyText !== null;
  const lynxEmpty = lynxMetrics.emptyText !== null;
  if (webEmpty !== lynxEmpty) return false;
  const keys = webEmpty
    ? ["panel", "search", "results", "footer", "empty"]
    : ["panel", "search", "results", "footer", "row"];
  return keys.every((key) => {
    if (key !== "results") {
      return rectDeltaWithin(webMetrics.anatomy[key], lynxMetrics.anatomy[key], 2);
    }
    const visibleResults = (metrics) => {
      const results = metrics.anatomy.results?.rect;
      const footer = metrics.anatomy.footer?.rect;
      if (!results || !footer) return null;
      return {
        rect: {
          x: results.x,
          y: results.y,
          width: results.width,
          height: Math.max(0, Math.min(results.y + results.height, footer.y) - results.y),
        },
      };
    };
    return rectDeltaWithin(visibleResults(webMetrics), visibleResults(lynxMetrics), 2);
  });
}

function sidebarProjectGroupsMatch(state) {
  if (stateId !== "sidebar-project-groups") return true;
  const webGroups = state?.web?.sidebarProjectGroups?.rows ?? [];
  const lynxGroups = state?.lynx?.sidebarProjectGroups?.rows ?? [];
  const titlesMatch =
    webGroups.length > 0 &&
    JSON.stringify(webGroups.map(({ title }) => title)) ===
      JSON.stringify(lynxGroups.map(({ title }) => title));
  const rowsAreVertical = (groups) =>
    groups.every((group, index) => {
      const rect = group.box?.rect;
      const priorRect = groups[index - 1]?.box?.rect;
      return (
        rect &&
        rect.x >= 0 &&
        rect.x + rect.width <= 256 &&
        (index === 0 || (priorRect && rect.y >= priorRect.y + priorRect.height))
      );
    });
  return (
    state?.web?.productState?.sidebarVersion === "legacy" &&
    state?.lynx?.productState?.sidebarVersion === "legacy" &&
    titlesMatch &&
    rowsAreVertical(webGroups) &&
    rowsAreVertical(lynxGroups)
  );
}

function flatSidebarLayoutMatches(state) {
  if (!isFlatSidebarLayoutState) return true;
  const web = state?.web?.sidebarDiagnostics;
  const lynx = state?.lynx?.sidebarDiagnostics;
  const webThreads = web?.threads ?? [];
  const lynxThreads = lynx?.threads ?? [];
  const threadRowsMatch =
    webThreads.length === lynxThreads.length &&
    webThreads.every((thread, index) => {
      const lynxThread = lynxThreads[index];
      return (
        thread.text === lynxThread?.text &&
        thread.rect?.width === lynxThread?.rect?.width &&
        thread.rect?.height === lynxThread?.rect?.height
      );
    });
  const controlsMatch =
    web?.chrome?.searchRow?.rect?.width === 239 &&
    lynx?.chrome?.searchRow?.rect?.width === 239 &&
    web?.chrome?.searchPrimary?.rect?.width === 203 &&
    lynx?.chrome?.searchPrimary?.rect?.width === 203 &&
    web?.chrome?.newThread?.rect?.width === 32 &&
    lynx?.chrome?.newThread?.rect?.width === 32 &&
    web?.chrome?.searchText?.includes("Search") &&
    lynx?.chrome?.searchText?.includes("Search") &&
    web.chrome.projectScope?.rect?.height === lynx.chrome.projectScope?.rect?.height &&
    web.chrome.newProject?.rect?.width === lynx.chrome.newProject?.rect?.width;
  if (stateId !== "sidebar-flat-layout") {
    return (
      state?.web?.productState?.sidebarVersion === "flat" &&
      state?.lynx?.productState?.sidebarVersion === "flat" &&
      web?.width === 256 &&
      lynx?.width === 256 &&
      controlsMatch
    );
  }
  return (
    state?.web?.productState?.sidebarVersion === "flat" &&
    state?.lynx?.productState?.sidebarVersion === "flat" &&
    web?.width === 256 &&
    lynx?.width === 256 &&
    threadRowsMatch &&
    controlsMatch
  );
}

function addProjectSourcesMatch(state) {
  if (stateId !== "add-project-sources") return true;
  const requiredRows = ["Local folder", "Git URL"];
  const webRows = state?.web?.overlayMetrics?.rowLabels ?? [];
  const lynxRows = state?.lynx?.overlayMetrics?.rowLabels ?? [];
  return (
    state?.web?.overlayMetrics?.paletteView === "submenu" &&
    state?.lynx?.overlayMetrics?.paletteView === "add-project-sources" &&
    requiredRows.every(
      (label) =>
        webRows.some((row) => row?.includes(label)) && lynxRows.some((row) => row?.includes(label)),
    ) &&
    !webRows.includes("Open settings") &&
    !lynxRows.includes("Open settings")
  );
}

function newThreadProjectsMatch(state) {
  if (stateId !== "sidebar-v2-new-thread-projects") return true;
  const webRows = (state?.web?.overlayMetrics?.rowLabels ?? []).filter(Boolean);
  const lynxRows = (state?.lynx?.overlayMetrics?.rowLabels ?? []).filter(Boolean);
  const normalizedWebRows = [...webRows].sort();
  const normalizedLynxRows = [...lynxRows].sort();
  return (
    state?.web?.overlayMetrics?.paletteView === "submenu" &&
    state?.lynx?.overlayMetrics?.paletteView === "new-thread-projects" &&
    webRows.length >= 2 &&
    JSON.stringify(normalizedWebRows) === JSON.stringify(normalizedLynxRows) &&
    state?.web?.overlayMetrics?.activeRowLabels?.length === 1 &&
    state?.lynx?.overlayMetrics?.activeRowLabels?.length === 1
  );
}

function modelPickerSemanticsMatch(webMetrics, lynxMetrics) {
  const selectedModelMatches = webMetrics?.selectedModelKey === lynxMetrics?.selectedModelKey;
  const selectedRowsMatch =
    JSON.stringify(webMetrics?.selectedRowKeys ?? []) ===
    JSON.stringify(lynxMetrics?.selectedRowKeys ?? []);
  const selectedStateReady =
    stateId !== "model-picker-selected" ||
    (typeof webMetrics?.selectedModelKey === "string" &&
      webMetrics.selectedModelKey.length > 0 &&
      webMetrics?.selectedRowKeys?.length === 1 &&
      lynxMetrics?.selectedRowKeys?.length === 1 &&
      webMetrics.selectedRowKeys[0] === webMetrics.selectedModelKey &&
      lynxMetrics.selectedRowKeys[0] === lynxMetrics.selectedModelKey);
  const emptyStateReady =
    stateId !== "model-picker-empty" ||
    (typeof webMetrics?.emptyText === "string" &&
      webMetrics.emptyText.length > 0 &&
      webMetrics.emptyText === lynxMetrics?.emptyText &&
      (webMetrics?.rowCount ?? 0) === 0 &&
      (lynxMetrics?.rowCount ?? 0) === 0);
  return (
    JSON.stringify(webMetrics?.semanticKeys ?? []) ===
      JSON.stringify(lynxMetrics?.semanticKeys ?? []) &&
    JSON.stringify(
      (webMetrics?.providerItems ?? []).map(({ id, active, disabled }) => ({
        id,
        active,
        disabled,
      })),
    ) ===
      JSON.stringify(
        (lynxMetrics?.providerItems ?? []).map(({ id, active, disabled }) => ({
          id,
          active,
          disabled,
        })),
      ) &&
    selectedModelMatches &&
    selectedRowsMatch &&
    webMetrics?.selectedProviderId === lynxMetrics?.selectedProviderId &&
    selectedStateReady &&
    emptyStateReady
  );
}

function workingTranscriptGeometryMatches(webMetrics, lynxMetrics) {
  if (stateId !== "existing-thread-working") return true;
  const webRows = webMetrics?.rowGeometry ?? [];
  const lynxRows = lynxMetrics?.rowGeometry ?? [];
  if (webRows.length !== 2 || lynxRows.length !== 2) return false;
  return webRows.every((webRow, index) => {
    const lynxRow = lynxRows[index];
    return (
      lynxRow?.id === webRow.id &&
      lynxRow.kind === webRow.kind &&
      ["x", "y", "width", "height"].every(
        (key) =>
          typeof webRow[key] === "number" &&
          typeof lynxRow[key] === "number" &&
          Math.abs(webRow[key] - lynxRow[key]) <= 1,
      )
    );
  });
}

function failedTranscriptGeometryMatches(webMetrics, lynxMetrics) {
  if (!isFailedThreadState) return true;
  const webRows = webMetrics?.rowGeometry ?? [];
  const lynxRows = lynxMetrics?.rowGeometry ?? [];
  if (webRows.length === 0 || webRows.length !== lynxRows.length) return false;
  return webRows.every((webRow, index) => {
    const lynxRow = lynxRows[index];
    return (
      lynxRow?.id === webRow.id &&
      lynxRow.kind === webRow.kind &&
      ["x", "y", "width"].every(
        (key) =>
          typeof webRow[key] === "number" &&
          typeof lynxRow[key] === "number" &&
          Math.abs(webRow[key] - lynxRow[key]) <= 1,
      )
    );
  });
}

function narrowChatResponsiveMatches(webMetrics, lynxMetrics) {
  if (!isNarrowChatThreadState) return true;
  const rowsMatch =
    JSON.stringify((webMetrics?.rows ?? []).map(({ id, kind, role }) => ({ id, kind, role }))) ===
    JSON.stringify((lynxMetrics?.rows ?? []).map(({ id, kind, role }) => ({ id, kind, role })));
  const contained = (metrics) => {
    const rows = metrics?.rowGeometry ?? [];
    const messageRows = rows.filter(({ kind }) => kind === "message");
    const userBubble = metrics?.anatomy?.userBubble;
    const assistant = metrics?.assistantGeometry?.body;
    const codeBlocks = metrics?.codeBlockGeometry ?? [];
    const changedFilesCard = metrics?.anatomy?.changedFilesCard;
    const changedFilesHeader = metrics?.anatomy?.changedFilesHeader;
    const changedFilesPreview = metrics?.anatomy?.changedFilesPreview;
    const changedFilesBody = metrics?.anatomy?.changedFilesBody;
    const changedFilesContent = changedFilesPreview ?? changedFilesBody;
    const userRow = rows.find(({ role }) => role === "user");
    const assistantRow = rows.find(({ role }) => role === "assistant");
    const within = (child, parent) =>
      child?.rect &&
      parent &&
      child.rect.x >= parent.x - 1 &&
      child.rect.x + child.rect.width <= parent.x + parent.width + 1;
    return (
      messageRows.length === 2 &&
      within(userBubble, userRow) &&
      within(assistant, assistantRow) &&
      codeBlocks.length === 1 &&
      within(codeBlocks[0]?.rect, assistantRow) &&
      within(changedFilesCard, assistantRow) &&
      within(changedFilesHeader, changedFilesCard?.rect) &&
      within(changedFilesContent, changedFilesCard?.rect) &&
      [userBubble, assistant, codeBlocks[0]?.rect, changedFilesCard, changedFilesContent].every(
        (box) => box?.scroll?.width <= box?.scroll?.clientWidth + 1,
      )
    );
  };
  return rowsMatch && contained(webMetrics) && contained(lynxMetrics);
}

function approvalComposerMatches(webMetrics, lynxMetrics) {
  if (stateId !== "existing-thread-approval") return true;
  for (const key of ["pending", "detail", "editorArea", "footer"]) {
    if (!rectDeltaWithin(webMetrics?.anatomy?.[key], lynxMetrics?.anatomy?.[key], 1)) {
      return false;
    }
  }
  const webActions = webMetrics?.anatomy?.actions ?? [];
  const lynxActions = lynxMetrics?.anatomy?.actions ?? [];
  if (
    webActions.length !== 4 ||
    lynxActions.length !== 4 ||
    !webActions.every((action, index) => rectDeltaWithin(action, lynxActions[index], 1))
  ) {
    return false;
  }
  if (theme !== "light") return true;
  return [lynxActions[1], lynxActions[2]].every(
    (action) =>
      action?.style?.backgroundColor === "rgb(255, 255, 255)" &&
      action.style.borderTopColor === "rgb(212, 212, 216)",
  );
}

function archiveSettingsGeometryMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-archive") return true;
  const webSection = webMetrics?.geometry?.sections?.[0]?.box?.rect;
  const lynxSection = lynxMetrics?.geometry?.sections?.[0]?.box?.rect;
  const lynxRows = lynxMetrics?.geometry?.sections?.[0]?.rows?.rect;
  const lynxEmptyRow = lynxMetrics?.geometry?.settingsRows?.[0];
  const lynxText = lynxEmptyRow?.children?.[0]?.box?.rect;
  return (
    webSection &&
    lynxSection &&
    lynxRows &&
    lynxEmptyRow?.title === "No archived threads" &&
    lynxEmptyRow.box?.rect &&
    lynxText &&
    Math.abs(webSection.x - lynxSection.x) <= 1 &&
    Math.abs(webSection.width - lynxSection.width) <= 1 &&
    Math.abs(webSection.x - lynxRows.x) <= 1 &&
    Math.abs(webSection.width - lynxRows.width) <= 1 &&
    Math.abs(webSection.x - lynxEmptyRow.box.rect.x) <= 1 &&
    Math.abs(webSection.width - lynxEmptyRow.box.rect.width) <= 1 &&
    lynxText.width > 0
  );
}

function betaSettingsGeometryMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-beta" && !isBetaMutationState) return true;
  if (isBetaMutationState) {
    const webRow = webMetrics?.betaMutation?.autoSettleRow?.rect;
    const lynxRow = lynxMetrics?.betaMutation?.autoSettleRow?.rect;
    const webControl = webMetrics?.betaMutation?.control?.rect;
    const lynxControl = lynxMetrics?.betaMutation?.control?.rect;
    return (
      webRow &&
      lynxRow &&
      webControl &&
      lynxControl &&
      Math.abs(webRow.x - lynxRow.x) <= 1 &&
      Math.abs(webRow.width - lynxRow.width) <= 1 &&
      Math.abs(webControl.x - lynxControl.x) <= 2 &&
      Math.abs(webControl.width - lynxControl.width) <= 2 &&
      Math.abs(webControl.height - lynxControl.height) <= 2 &&
      Math.abs(webControl.y - webRow.y - (lynxControl.y - lynxRow.y)) <= 2
    );
  }
  const webLegacy = webMetrics?.legacySidebar;
  const lynxLegacy = lynxMetrics?.legacySidebar;
  const rowGeometryMatches =
    webLegacy?.row?.rect &&
    lynxLegacy?.row?.rect &&
    Math.abs(webLegacy.row.rect.x - lynxLegacy.row.rect.x) <= 1 &&
    Math.abs(webLegacy.row.rect.width - lynxLegacy.row.rect.width) <= 1 &&
    Math.abs(webLegacy.row.rect.height - lynxLegacy.row.rect.height) <= 2;
  const triggerGeometryMatches =
    webLegacy?.trigger?.rect &&
    lynxLegacy?.trigger?.rect &&
    Math.abs(webLegacy.trigger.rect.x - lynxLegacy.trigger.rect.x) <= 1 &&
    Math.abs(webLegacy.trigger.rect.width - lynxLegacy.trigger.rect.width) <= 1 &&
    Math.abs(webLegacy.trigger.rect.height - lynxLegacy.trigger.rect.height) <= 1;
  return (
    webLegacy?.expanded === true &&
    lynxLegacy?.expanded === true &&
    triggerGeometryMatches &&
    rowGeometryMatches &&
    webLegacy.title === "Sidebar (legacy)" &&
    lynxLegacy.title === webLegacy.title &&
    lynxLegacy.description === webLegacy.description &&
    webLegacy.control?.rect?.width > 0 &&
    lynxLegacy.control?.rect?.width > 0
  );
}

function legacySidebarSettingsReady(state) {
  if (!isBetaSettingsState) return true;
  const web = state?.web?.settingsMetrics?.legacySidebar;
  const lynx = state?.lynx?.settingsMetrics?.legacySidebar;
  const webScrollTop = state?.web?.settingsMetrics?.scroll?.scrollTop;
  const lynxScrollTop = state?.lynx?.settingsMetrics?.scroll?.scrollTop;
  return (
    web?.expanded === true &&
    lynx?.expanded === true &&
    web.row?.rect?.width > 0 &&
    lynx.row?.rect?.width > 0 &&
    web.control?.rect?.width > 0 &&
    lynx.control?.rect?.width > 0 &&
    web.checked === "false" &&
    (lynx.checked === "false" || lynx.controlClass?.includes("ui-switch--unchecked")) &&
    typeof webScrollTop === "number" &&
    typeof lynxScrollTop === "number" &&
    Math.abs(webScrollTop) <= 1 &&
    Math.abs(lynxScrollTop) <= 1
  );
}

function betaMutationStateMatches(state, checked) {
  if (!isBetaMutationState) return true;
  return [state?.web, state?.lynx].every((client) => {
    const mutation = client?.settingsMetrics?.betaMutation;
    return (
      mutation?.checked === String(checked) &&
      (checked
        ? mutation.daysValue === "3"
        : mutation.daysInput === null && mutation.daysValue === null)
    );
  });
}

function backgroundActivityMutationStateMatches(state, label) {
  if (!isBackgroundActivityMutationState) return true;
  return [state?.web, state?.lynx].every((client) => {
    const row = client?.settingsMetrics?.rows?.find(
      (candidate) => candidate.id === "background-activity",
    );
    return row?.controlText?.startsWith(label) === true;
  });
}

function settingsModelMutationStateMatches(state, label) {
  if (!isSettingsModelMutationState) return true;
  return [state?.web, state?.lynx].every((client) => {
    const row = client?.settingsMetrics?.rows?.find(
      (candidate) => candidate.id === "text-generation-model",
    );
    return row?.controlText?.startsWith(label) === true;
  });
}

function sourceControlDetailsMatch(state) {
  if (!isSourceControlDetailsState) return true;
  const web = state?.web?.settingsMetrics?.sourceControlDetails;
  const lynx = state?.lynx?.settingsMetrics?.sourceControlDetails;
  return (
    web?.title === "Fetch interval" &&
    lynx?.title === web.title &&
    lynx?.description === web.description &&
    lynx?.value === web.value &&
    lynx?.unit === web.unit &&
    web?.numberField?.rect?.height === 28 &&
    lynx?.numberField?.rect?.height === 28 &&
    lynx?.numberField?.style?.flexDirection === "row"
  );
}

async function clickLynxSettingsModelTarget(cdp, sessionId, selector) {
  const point = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById('lynx-pane');
      const root = frame?.contentWindow?.document
        ?.getElementById('t3-lynx-preview')?.shadowRoot;
      const target = root?.querySelector(${JSON.stringify(selector)});
      if (!frame || !target) return null;
      target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
      };
    })()`,
  );
  if (!point) return false;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return true;
}

async function runSettingsModelMutationFlow(cdp, sessionId) {
  const timeline = [];
  let state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => settingsModelMutationStateMatches(next, "GPT-5.6-Luna"),
    5_000,
    "Text generation model initial selection",
  );
  timeline.push({ step: "initial", model: "GPT-5.6-Luna" });
  for (const target of [
    { key: "codex:gpt-5.4-mini", label: "GPT-5.4-Mini", step: "cheap-model" },
    { key: "codex:gpt-5.6-luna", label: "GPT-5.6-Luna", step: "restored" },
  ]) {
    if (
      !(await clickLynxSettingsModelTarget(
        cdp,
        sessionId,
        "#text-generation-model [data-settings-model-picker-trigger]",
      ))
    ) {
      throw new Error("Missing Lynx text generation model trigger");
    }
    await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => next?.lynx?.productState?.overlay === "model-picker",
      5_000,
      `Text generation model picker open for ${target.label}`,
    );
    if (
      !(await clickLynxSettingsModelTarget(
        cdp,
        sessionId,
        `[data-model-picker-key=${JSON.stringify(target.key)}]`,
      ))
    ) {
      throw new Error(`Missing Lynx model row ${target.key}`);
    }
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => settingsModelMutationStateMatches(next, target.label),
      5_000,
      `Text generation model ${target.label} projection`,
    );
    timeline.push({ step: target.step, model: target.label });
  }
  return { state, timeline };
}

async function runSourceControlDetailsFlow(cdp, sessionId) {
  const timeline = [];
  let state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) =>
      [next?.web, next?.lynx].every((client) =>
        client?.settingsMetrics?.sourceControlRows?.some((row) =>
          row?.startsWith("Gitgit version"),
        ),
      ),
    5_000,
    "Source Control Git row",
  );
  for (const client of ["web", "lynx"]) {
    if (!(await clickSidebarControl(cdp, sessionId, client, '[aria-label="Toggle Git details"]'))) {
      throw new Error(`Missing ${client} Git details trigger`);
    }
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => next?.[client]?.settingsMetrics?.sourceControlDetails?.title === "Fetch interval",
      5_000,
      `${client} Git details open`,
    );
    timeline.push({ client, step: "opened" });
  }
  return { state, timeline };
}

async function runBackgroundActivityMutationFlow(cdp, sessionId) {
  const timeline = [];
  let state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => backgroundActivityMutationStateMatches(next, "Balanced"),
    5_000,
    "Background activity initial profile",
  );
  timeline.push({ step: "initial", profile: "Balanced" });
  for (const profile of ["Performance", "Battery saver", "Balanced"]) {
    if (
      !(await clickSidebarControl(
        cdp,
        sessionId,
        "lynx",
        '[data-settings-select="Background activity profile"]',
      ))
    ) {
      throw new Error("Missing Lynx Background activity profile control");
    }
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => backgroundActivityMutationStateMatches(next, profile),
      5_000,
      `Background activity ${profile} projection`,
    );
    timeline.push({ step: profile.toLowerCase().replaceAll(" ", "-"), profile });
  }
  return { state, timeline };
}

function connectionsMutationStateMatches(state, pairingLinkCount) {
  if (!isConnectionsMutationState) return true;
  return [state?.web, state?.lynx].every((client) => {
    const mutation = client?.settingsMetrics?.connectionsMutation;
    return (
      mutation?.canCreate === true &&
      mutation.pairingLinkCount === pairingLinkCount &&
      mutation.revokeCount === pairingLinkCount
    );
  });
}

async function clickExactButtonText(cdp, sessionId, client, label, withinDialog = false) {
  const selector = withinDialog
    ? '[data-slot="dialog-popup"], [data-connections-create-dialog="true"]'
    : ".settings-connections-panel, .settings-page-scroll-fade";
  const point = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const scope = root?.querySelector(${JSON.stringify(selector)});
      const target = [...(scope?.querySelectorAll('button, [role="button"], .ui-button') ?? [])]
        .find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
    })()`,
  );
  if (!point) return false;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return true;
}

async function keybindingsControlPoint(cdp, sessionId, client, selector) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const target = root?.querySelector(${JSON.stringify(selector)});
      if (!frame || !target) return null;
      target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
    })()`,
  );
}

async function fillLynxKeybindingInput(cdp, sessionId, ariaLabel, value, { replace = false } = {}) {
  const focused = await focusRemoteElement(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById('lynx-pane');
      const root = frame?.contentWindow?.document
        ?.getElementById('t3-lynx-preview')?.shadowRoot;
      const host = root?.querySelector(${JSON.stringify(`[aria-label="${ariaLabel}"]`)});
      const input = host?.shadowRoot?.querySelector('input') ?? host ?? null;
      if (${replace}) input?.select?.();
      return input;
    })()`,
  );
  if (!focused) throw new Error(`Could not focus Lynx ${ariaLabel}`);
  await cdp.send("Input.insertText", { text: value }, sessionId);
}

async function fillKeybindingsSearchInput(cdp, sessionId, client, value) {
  const focused = await focusRemoteElement(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const host = root?.querySelector('input[aria-label="Search keybindings"]');
      return host?.shadowRoot?.querySelector('input') ?? host ?? null;
    })()`,
  );
  if (!focused) throw new Error(`Could not focus ${client} Keybindings search input`);
  await cdp.send("Input.insertText", { text: value }, sessionId);
}

async function readControlPoint(cdp, sessionId, client, selector) {
  return sidebarControlPoint(cdp, sessionId, client, selector);
}

async function runConnectionsMutationFlow(cdp, sessionId) {
  const timeline = [];
  let state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => connectionsMutationStateMatches(next, 0),
    5_000,
    "Connections mutation initial state",
  );
  timeline.push({ step: "initial", pairingLinkCount: 0 });

  if (!(await clickExactButtonText(cdp, sessionId, "lynx", "Create link"))) {
    throw new Error("Missing Lynx Create pairing link action");
  }
  timeline.push({
    step: "lynx-create-clicked",
    control: await readControlPoint(cdp, sessionId, "lynx", ".settings-connections-create-pairing"),
  });
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => connectionsMutationStateMatches(next, 1),
    5_000,
    "Lynx-created pairing link projection",
  );
  timeline.push({ step: "lynx-created", pairingLinkCount: 1 });
  if (
    !(await clickSidebarControl(
      cdp,
      sessionId,
      "lynx",
      '[class*="settings-connections-revoke-pairing--"]',
    ))
  ) {
    throw new Error("Missing Lynx pairing link Revoke action");
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => connectionsMutationStateMatches(next, 0),
    5_000,
    "Lynx-revoked pairing link projection",
  );
  timeline.push({ step: "lynx-revoked", pairingLinkCount: 0 });

  if (!(await clickExactButtonText(cdp, sessionId, "web", "Create link"))) {
    throw new Error("Missing Web Create link trigger");
  }
  await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => next?.web?.settingsMetrics?.connectionsMutation?.createDialogOpen === true,
    3_000,
    "Web Create pairing link dialog",
  );
  if (!(await clickExactButtonText(cdp, sessionId, "web", "Create link", true))) {
    throw new Error("Missing Web Create link confirmation");
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => connectionsMutationStateMatches(next, 1),
    5_000,
    "Web-created pairing link projection",
  );
  timeline.push({ step: "web-created", pairingLinkCount: 1 });
  if (
    !(await clickSidebarControl(
      cdp,
      sessionId,
      "web",
      '[class*="settings-connections-revoke-pairing--"]',
    ))
  ) {
    throw new Error("Missing Web pairing link Revoke action");
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => connectionsMutationStateMatches(next, 0),
    5_000,
    "Web-revoked pairing link projection",
  );
  timeline.push({ step: "web-revoked", pairingLinkCount: 0 });
  return { state, timeline };
}

async function runBetaMutationFlow(cdp, sessionId) {
  const timeline = [];
  let state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => betaMutationStateMatches(next, true),
    5_000,
    "Beta mutation initial state",
  );
  timeline.push({ step: "initial", value: 3 });
  for (const client of ["web", "lynx"]) {
    if (
      !(await clickSidebarControl(cdp, sessionId, client, '[data-setting-control="auto-settle"]'))
    ) {
      throw new Error(`Missing ${client} Auto-settle control`);
    }
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => betaMutationStateMatches(next, false),
    5_000,
    "Beta mutation disabled state",
  );
  timeline.push({ step: "disabled", value: null });
  for (const client of ["web", "lynx"]) {
    if (
      !(await clickSidebarControl(cdp, sessionId, client, '[data-setting-control="auto-settle"]'))
    ) {
      throw new Error(`Missing ${client} Auto-settle control for restore`);
    }
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => betaMutationStateMatches(next, true),
    5_000,
    "Beta mutation restored state",
  );
  timeline.push({ step: "restored", value: 3 });
  return { state, timeline };
}

function settingsNavigationStateMatches(state) {
  if (!semanticRoute.startsWith("settings-")) return true;
  const expectedLabel =
    semanticRoute === "settings-source-control-loading" ||
    semanticRoute === "settings-source-control-error"
      ? "Source Control"
      : {
          "settings-general": "General",
          "settings-appearance": "Appearance",
          "settings-keybindings": "Keybindings",
          "settings-providers": "Providers",
          "settings-connections": "Connections",
          "settings-source-control": "Source Control",
          "settings-beta": "General",
          "settings-archive": "Archive",
        }[semanticRoute];
  if (!expectedLabel) return true;
  return [state?.web, state?.lynx].every((client) => {
    const items = client?.settingsMetrics?.navigationItems ?? [];
    const activeItems = items.filter((item) => item.active);
    const visuallySelectedItems = items.filter((item) => item.visuallySelected);
    return (
      items.length === 7 &&
      items.every((item) => item.labelBox?.rect?.width > 0 && item.labelBox?.rect?.height > 0) &&
      client?.sidebarDiagnostics?.chrome?.settingsBackLabel?.rect?.width > 0 &&
      client?.sidebarDiagnostics?.chrome?.settingsBackLabel?.rect?.height > 0 &&
      activeItems.length === 1 &&
      activeItems[0]?.label === expectedLabel &&
      visuallySelectedItems.length === 1 &&
      visuallySelectedItems[0]?.label === expectedLabel
    );
  });
}

function settingsDesktopTopbarMatches(state) {
  if (!semanticRoute.startsWith("settings-")) return true;
  const web = state?.web?.settingsMetrics?.topbar;
  const lynx = state?.lynx?.settingsMetrics?.topbar;
  const restoreMatches =
    web?.restore === null && lynx?.restore === null
      ? true
      : rectDeltaWithin(web?.restore, lynx?.restore, 2);
  return (
    web?.desktopVisualHost === true &&
    web.titleText === "Settings" &&
    lynx?.titleText === "Settings" &&
    rectDeltaWithin(web.box, lynx.box, 0) &&
    rectDeltaWithin(web.title, lynx.title, 2) &&
    restoreMatches
  );
}

function generalSettingsContentMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-general" && stateId !== "settings-model-picker") return true;
  const webRowIds = webMetrics?.rowIds ?? [];
  const lynxRowIds = lynxMetrics?.rowIds ?? [];
  return (
    webRowIds.length > 0 &&
    JSON.stringify(webMetrics?.navigationLabels ?? []) ===
      JSON.stringify(lynxMetrics?.navigationLabels ?? []) &&
    JSON.stringify(webMetrics?.sectionTitles ?? []) ===
      JSON.stringify(lynxMetrics?.sectionTitles ?? []) &&
    JSON.stringify(webRowIds) === JSON.stringify(lynxRowIds) &&
    (webMetrics?.errorTexts?.length ?? 0) === 0 &&
    (lynxMetrics?.errorTexts?.length ?? 0) === 0
  );
}

function backgroundPolicyAccessoryMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-general" && !isBetaSettingsState) return true;
  const web = webMetrics?.rows?.find((row) => row.id === "background-activity");
  const lynx = lynxMetrics?.rows?.find((row) => row.id === "background-activity");
  return (
    web?.titleAccessoryBox?.rect?.width > 0 &&
    web?.titleAccessoryBox?.rect?.height > 0 &&
    lynx?.titleAccessoryBox?.rect?.width > 0 &&
    lynx?.titleAccessoryBox?.rect?.height > 0 &&
    rectDeltaWithin(web.titleAccessoryBox, lynx.titleAccessoryBox, 3)
  );
}

function appearanceSettingsContentMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-appearance") return true;
  const webRows = webMetrics?.rows ?? [];
  const lynxRows = lynxMetrics?.rows ?? [];
  if (
    webRows.length === 0 ||
    JSON.stringify(webMetrics?.navigationLabels ?? []) !==
      JSON.stringify(lynxMetrics?.navigationLabels ?? []) ||
    JSON.stringify(webMetrics?.sectionTitles ?? []) !==
      JSON.stringify(lynxMetrics?.sectionTitles ?? []) ||
    JSON.stringify(webRows.map((row) => row.id)) !== JSON.stringify(lynxRows.map((row) => row.id))
  ) {
    return false;
  }
  return webRows.every((webRow, index) => {
    const lynxRow = lynxRows[index];
    if (
      lynxRow?.id !== webRow.id ||
      lynxRow.title !== webRow.title ||
      lynxRow.description !== webRow.description
    ) {
      return false;
    }
    if (lynxRow.unavailable !== "true") {
      return lynxRow.ariaDisabled !== "true";
    }
    return (
      lynxRow.ariaDisabled === "true" &&
      (lynxRow.status === "Not yet available in Lynxtron." ||
        lynxRow.controlText === "Not yet available in Lynxtron.") &&
      lynxRow.box?.style?.opacity === "0.48"
    );
  });
}

function keybindingsSettingsContentMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-keybindings") return true;
  const webRows = webMetrics?.keybindings?.rows ?? [];
  const lynxRows = lynxMetrics?.keybindings?.rows ?? [];
  const canonical = (rows) =>
    rows.map(({ command, shortcut, when, source, conflicts, keycaps }) => ({
      command,
      shortcut,
      when,
      source,
      conflicts,
      keycaps: keycaps.map(({ text }) => text),
    }));
  return (
    webRows.length > 0 &&
    JSON.stringify(webMetrics?.navigationLabels ?? []) ===
      JSON.stringify(lynxMetrics?.navigationLabels ?? []) &&
    JSON.stringify(webMetrics?.sectionTitles ?? []) ===
      JSON.stringify(lynxMetrics?.sectionTitles ?? []) &&
    JSON.stringify(canonical(webRows)) === JSON.stringify(canonical(lynxRows)) &&
    (webMetrics?.errorTexts?.length ?? 0) === 0 &&
    (lynxMetrics?.errorTexts?.length ?? 0) === 0
  );
}

function keybindingsSettingsGeometryMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-keybindings") return true;
  const webHeader = webMetrics?.keybindings?.header;
  const lynxHeader = lynxMetrics?.keybindings?.header;
  const webRows = webMetrics?.keybindings?.rows ?? [];
  const lynxRows = lynxMetrics?.keybindings?.rows ?? [];
  if (
    !rectDeltaWithin(webHeader, lynxHeader, 2) ||
    webRows.length === 0 ||
    webRows.length !== lynxRows.length
  ) {
    return false;
  }
  return webRows.every((webRow, index) => {
    const lynxRow = lynxRows[index];
    if (
      !rectDeltaWithin(webRow.box, lynxRow?.box, 2) ||
      webRow.columns.length !== 4 ||
      lynxRow?.columns.length !== 4
    ) {
      return false;
    }
    return webRow.columns.every((webColumn, columnIndex) => {
      const lynxColumn = lynxRow.columns[columnIndex];
      // Status is intentionally an empty structural cell on non-conflicting
      // bindings. Neither renderer has visible status content to measure in
      // that case; conflict rows still require a measured icon below.
      if (columnIndex === 3 && webRow.conflicts.length === 0 && lynxRow.conflicts.length === 0) {
        const webHeaderRect = webMetrics?.keybindings?.headerColumns?.[3]?.box?.rect;
        const lynxHeaderRect = lynxMetrics?.keybindings?.headerColumns?.[3]?.box?.rect;
        const lynxStatusRect = lynxColumn?.box?.rect;
        return (
          Boolean(webHeaderRect && lynxHeaderRect && lynxStatusRect) &&
          Math.abs(webHeaderRect.x - lynxHeaderRect.x) <= 2 &&
          Math.abs(webHeaderRect.width - lynxHeaderRect.width) <= 2 &&
          Math.abs(lynxStatusRect.x - lynxHeaderRect.x) <= 2 &&
          Math.abs(lynxStatusRect.width - lynxHeaderRect.width) <= 2
        );
      }
      const webRect = webColumn.box?.rect;
      const lynxRect = lynxColumn?.box?.rect;
      if (!webRect || !lynxRect) return false;
      const sharedColumnGeometry =
        Math.abs(webRect.x - lynxRect.x) <= 2 && Math.abs(webRect.width - lynxRect.width) <= 2;
      if (!sharedColumnGeometry) return false;
      if (columnIndex !== 3) return true;
      return (
        Math.abs(webRect.y - lynxRect.y) <= 2 && Math.abs(webRect.height - lynxRect.height) <= 2
      );
    });
  });
}

function providerSettingsContentMatches(webMetrics, lynxMetrics) {
  if (!isProvidersSettingsState) return true;
  const webProviders = webMetrics?.providers;
  const lynxProviders = lynxMetrics?.providers;
  const canonicalCards = (providers) =>
    (providers?.cards ?? []).map(({ title, text }) => ({ title, text }));
  return (
    webProviders?.healthRow?.rect?.width > 0 &&
    lynxProviders?.healthRow?.rect?.width > 0 &&
    webProviders?.addTrigger?.rect?.width > 0 &&
    lynxProviders?.addTrigger?.rect?.width > 0 &&
    webProviders?.refreshTrigger?.rect?.width > 0 &&
    lynxProviders?.refreshTrigger?.rect?.width > 0 &&
    webProviders?.inlineCreate === null &&
    lynxProviders?.inlineCreate === null &&
    JSON.stringify(canonicalCards(webProviders)) === JSON.stringify(canonicalCards(lynxProviders))
  );
}

function providerSettingsGeometryMatches(webMetrics, lynxMetrics) {
  if (!isProvidersSettingsState || isAddProviderDialogState) return true;
  const webSection = webMetrics?.geometry?.sections?.[0]?.box?.rect;
  const lynxSection = lynxMetrics?.geometry?.sections?.[0]?.box?.rect;
  const webCards = webMetrics?.providers?.cards ?? [];
  const lynxCards = lynxMetrics?.providers?.cards ?? [];
  const healthControlDoesNotOverlap = (metrics) => {
    const group = metrics?.providers?.healthControl?.group?.rect;
    const decrement = metrics?.providers?.healthControl?.decrement?.rect;
    const increment = metrics?.providers?.healthControl?.increment?.rect;
    const unit = metrics?.providers?.healthControl?.unit?.rect;
    return (
      group &&
      decrement &&
      increment &&
      unit &&
      decrement.x + decrement.width <= increment.x &&
      decrement.x >= group.x &&
      increment.x + increment.width <= group.x + group.width &&
      unit.x >= group.x + group.width
    );
  };
  if (
    !webSection ||
    !lynxSection ||
    Math.abs(webSection.x - lynxSection.x) > 1 ||
    Math.abs(webSection.y - lynxSection.y) > 1 ||
    Math.abs(webSection.width - lynxSection.width) > 1 ||
    webCards.length === 0 ||
    webCards.length !== lynxCards.length ||
    !healthControlDoesNotOverlap(webMetrics) ||
    !healthControlDoesNotOverlap(lynxMetrics)
  ) {
    return false;
  }
  return webCards.every((webCard, index) => {
    const lynxCard = lynxCards[index];
    return (
      webCard.title === lynxCard?.title &&
      rectDeltaWithin(webCard.box, lynxCard?.box, 2) &&
      webCard.toggleExpanded?.rect?.width > 0 &&
      lynxCard.toggleExpanded?.rect?.width > 0 &&
      webCard.enabledControl?.rect?.width > 0 &&
      lynxCard.enabledControl?.rect?.width > 0
    );
  });
}

function addProviderDialogPairMatches(state, viewportWidth, viewportHeight, expectedStep = 0) {
  if (!isAddProviderDialogState) return true;
  const web = state?.web?.addProviderDialog;
  const lynx = state?.lynx?.addProviderDialog;
  const canonicalSteps = (dialog) =>
    (dialog?.steps ?? []).map(({ label, current }) => ({
      label: label.replace(/, step \d+.*$/u, ""),
      current,
    }));
  const enabledDriverLabels = (dialog) =>
    (dialog?.drivers ?? [])
      .filter((driver) => !driver.disabled)
      .map((driver) => driver.label.replace(/✓/gu, "").trim());
  const disabledDriverLabels = (dialog) =>
    (dialog?.drivers ?? [])
      .filter((driver) => driver.disabled)
      .map((driver) => driver.label.replace(/Coming Soon/gu, "").trim());
  const visibleIdentityFields = (dialog) =>
    (dialog?.identityFields ?? [])
      .filter((field) => field.box?.rect?.width > 0 && field.box?.rect?.height > 0)
      .map((field) => ({
        box: field.box,
        children: field.children ?? [],
        label: field.children?.[0]?.text?.trim() ?? "",
        helper: field.children?.at(-1)?.text?.trim() ?? "",
      }));
  const webIdentityFields = visibleIdentityFields(web);
  const lynxIdentityFields = visibleIdentityFields(lynx);
  const identityParity =
    expectedStep !== 1 ||
    (webIdentityFields.length === 3 &&
      lynxIdentityFields.length === 3 &&
      webIdentityFields.every((webField, index) => {
        const lynxField = lynxIdentityFields[index];
        return (
          webField.label === lynxField?.label &&
          webField.helper === lynxField?.helper &&
          rectDeltaWithin(webField.box, lynxField?.box, 2) &&
          webField.children.length === lynxField?.children.length &&
          webField.children.every((child, childIndex) =>
            rectDeltaWithin(child.box, lynxField.children[childIndex]?.box, 2),
          )
        );
      }) &&
      (web?.error?.trim() ?? "") === (lynx?.error?.trim() ?? ""));
  const geometryReady =
    rectDeltaWithin(web?.box, lynx?.box, 2) &&
    rectDeltaWithin(web?.header, lynx?.header, 2) &&
    rectDeltaWithin(web?.stepRail, lynx?.stepRail, 2) &&
    rectDeltaWithin(web?.body, lynx?.body, 2) &&
    rectDeltaWithin(web?.footer, lynx?.footer, 2) &&
    (web?.steps ?? []).every((step, index) =>
      rectDeltaWithin(step.box, lynx?.steps?.[index]?.box, 2),
    ) &&
    (expectedStep !== 0 ||
      (web?.drivers ?? []).every((driver, index) =>
        rectDeltaWithin(driver.box, lynx?.drivers?.[index]?.box, 2),
      ));
  const driverParity =
    expectedStep !== 0 ||
    (JSON.stringify(enabledDriverLabels(web)) === JSON.stringify(enabledDriverLabels(lynx)) &&
      JSON.stringify(disabledDriverLabels(web)) === JSON.stringify(disabledDriverLabels(lynx)));
  const animationSettled = web?.box?.style?.opacity === "1" && lynx?.box?.style?.opacity === "1";
  return (
    web?.present === true &&
    lynx?.present === true &&
    animationSettled &&
    web.activeStep === expectedStep &&
    lynx.activeStep === expectedStep &&
    geometryReady &&
    JSON.stringify(canonicalSteps(web)) === JSON.stringify(canonicalSteps(lynx)) &&
    driverParity &&
    identityParity &&
    web.backdrop?.rect?.x === 0 &&
    lynx.backdrop?.rect?.x === 0 &&
    web.backdrop?.rect?.y === 0 &&
    lynx.backdrop?.rect?.y === 0 &&
    web.backdrop?.rect?.width === viewportWidth &&
    lynx.backdrop?.rect?.width === viewportWidth &&
    web.backdrop?.rect?.height === viewportHeight &&
    lynx.backdrop?.rect?.height === viewportHeight
  );
}

function generalSettingsGeometryMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-general") return true;
  const webSections = webMetrics?.geometry?.sections ?? [];
  const lynxSections = lynxMetrics?.geometry?.sections ?? [];
  const lynxRows = lynxMetrics?.geometry?.settingsRows ?? [];
  if (webSections.length !== 2 || lynxSections.length !== 2 || lynxRows.length < 12) return false;
  return (
    webSections.every((webSection, index) => {
      const webRect = webSection.box?.rect;
      const lynxSection = lynxSections[index];
      const lynxRect = lynxSection?.box?.rect;
      const lynxRowsRect = lynxSection?.rows?.rect;
      return (
        webRect &&
        lynxRect &&
        lynxRowsRect &&
        webSection.title === lynxSection.title &&
        Math.abs(webRect.x - lynxRect.x) <= 1 &&
        Math.abs(webRect.width - lynxRect.width) <= 1 &&
        Math.abs(webRect.x - lynxRowsRect.x) <= 1 &&
        Math.abs(webRect.width - lynxRowsRect.width) <= 1
      );
    }) &&
    lynxRows.every((row) => {
      const rect = row.box?.rect;
      const text = row.children?.[0]?.box?.rect;
      return (
        rect &&
        text &&
        Math.abs(rect.x - 320) <= 1 &&
        Math.abs(rect.width - 896) <= 1 &&
        text.width > 0
      );
    })
  );
}

function connectionsSettingsContentMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-connections") return true;
  const requiredSections = ["This environment", "Remote environments"];
  return (
    JSON.stringify(webMetrics?.navigationLabels ?? []) ===
      JSON.stringify(lynxMetrics?.navigationLabels ?? []) &&
    requiredSections.every(
      (title) =>
        webMetrics?.sectionTitles?.includes(title) && lynxMetrics?.sectionTitles?.includes(title),
    ) &&
    webMetrics?.rowIds?.includes("remote-environments") &&
    lynxMetrics?.rowIds?.includes("remote-environments") &&
    webMetrics?.sourceControlEmptyTitles?.includes("No saved remote environments") &&
    lynxMetrics?.sourceControlEmptyTitles?.includes("No saved remote environments") &&
    webMetrics?.sectionTexts?.some(
      (text) =>
        text.includes("Remote environments") &&
        text.includes("Add environment") &&
        text.includes("Click “Add environment” to pair another environment."),
    ) &&
    lynxMetrics?.sectionTexts?.some(
      (text) =>
        text.includes("Remote environments") &&
        text.includes("Add environment") &&
        text.includes("Click “Add environment” to pair another environment."),
    ) &&
    (webMetrics?.errorTexts?.length ?? 0) === 0 &&
    (lynxMetrics?.errorTexts?.length ?? 0) === 0
  );
}

function connectionsSettingsGeometryMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-connections") return true;
  const webSections = webMetrics?.geometry?.sections ?? [];
  const lynxSections = lynxMetrics?.geometry?.sections ?? [];
  const webEmpty = webMetrics?.geometry?.sourceControlEmpty?.rect;
  const lynxEmpty = lynxMetrics?.geometry?.sourceControlEmpty?.rect;
  const webEmptyMedia = webMetrics?.geometry?.sourceControlEmptyMedia?.rect;
  const lynxEmptyMedia = lynxMetrics?.geometry?.sourceControlEmptyMedia?.rect;
  const webEmptyHeader = webMetrics?.geometry?.sourceControlEmptyHeader?.rect;
  const lynxEmptyHeader = lynxMetrics?.geometry?.sourceControlEmptyHeader?.rect;
  const webEmptyTitle = webMetrics?.geometry?.sourceControlEmptyTitle?.rect;
  const lynxEmptyTitle = lynxMetrics?.geometry?.sourceControlEmptyTitle?.rect;
  const webEmptyDescription = webMetrics?.geometry?.sourceControlEmptyDescription?.rect;
  const lynxEmptyDescription = lynxMetrics?.geometry?.sourceControlEmptyDescription?.rect;
  if (
    webSections.length !== lynxSections.length ||
    webSections.length < 2 ||
    !webEmpty ||
    !lynxEmpty ||
    !webEmptyMedia ||
    !lynxEmptyMedia ||
    !webEmptyHeader ||
    !lynxEmptyHeader ||
    !webEmptyTitle ||
    !lynxEmptyTitle ||
    !webEmptyDescription ||
    !lynxEmptyDescription ||
    Math.abs(webEmpty.height - lynxEmpty.height) > 1 ||
    Math.abs(webEmptyMedia.x - webEmpty.x - (lynxEmptyMedia.x - lynxEmpty.x)) > 1 ||
    Math.abs(webEmptyMedia.y - webEmpty.y - (lynxEmptyMedia.y - lynxEmpty.y)) > 1 ||
    Math.abs(webEmptyHeader.x - webEmpty.x - (lynxEmptyHeader.x - lynxEmpty.x)) > 1 ||
    Math.abs(webEmptyHeader.y - webEmpty.y - (lynxEmptyHeader.y - lynxEmpty.y)) > 1 ||
    Math.abs(webEmptyHeader.width - lynxEmptyHeader.width) > 1 ||
    lynxEmptyHeader.y < lynxEmptyMedia.y + lynxEmptyMedia.height ||
    lynxEmptyDescription.y < lynxEmptyTitle.y + lynxEmptyTitle.height
  ) {
    return false;
  }
  return lynxSections.every((section, index) => {
    const webSection = webSections[index];
    const webRect = webSection?.box?.rect;
    const webRows = webSection?.rows?.rect;
    const rect = section.box?.rect;
    const rows = section.rows?.rect;
    const previous = lynxSections[index - 1]?.box?.rect;
    return (
      webSection?.title === section.title &&
      webRect &&
      webRows &&
      rect &&
      rows &&
      Math.abs(rect.x - webRect.x) <= 1 &&
      Math.abs(rect.y - webRect.y) <= 3 &&
      Math.abs(rect.width - webRect.width) <= 1 &&
      Math.abs(rect.height - webRect.height) <= 3 &&
      Math.abs(rows.x - webRows.x) <= 1 &&
      Math.abs(rows.y - webRows.y) <= 3 &&
      Math.abs(rows.width - webRows.width) <= 1 &&
      Math.abs(rows.height - webRows.height) <= 3 &&
      (!previous || rect.y >= previous.y + previous.height)
    );
  });
}

function composerPairMatches(webMetrics, lynxMetrics, expectation, viewportHeight) {
  if (
    !composerMetricsMatch(webMetrics, expectation) ||
    !composerMetricsMatch(lynxMetrics, expectation)
  ) {
    return false;
  }
  if (!composerAnatomyMatches(webMetrics, lynxMetrics)) return false;
  if (!composerToolbarAllocationMatches(webMetrics, lynxMetrics)) return false;
  if (!composerPrimaryActionAndContextMatch(webMetrics, lynxMetrics)) return false;

  const webRect = webMetrics?.rect?.rect;
  const lynxRect = lynxMetrics?.rect?.rect;
  const webEditorRect = webMetrics?.editor?.rect?.rect;
  const lynxEditorRect = lynxMetrics?.editor?.rect?.rect;
  if (!webRect || !lynxRect || !webEditorRect || !lynxEditorRect) return false;
  const frameShapeMatches =
    Math.abs(webRect.x - lynxRect.x) <= 1 &&
    Math.abs(webRect.width - lynxRect.width) <= 1 &&
    Math.abs(webRect.height - lynxRect.height) <= 1;
  const editorShapeMatches =
    Math.abs(webEditorRect.x - lynxEditorRect.x) <= 1 &&
    Math.abs(webEditorRect.width - lynxEditorRect.width) <= 1 &&
    Math.abs(webEditorRect.height - lynxEditorRect.height) <= 1;
  if (!frameShapeMatches || !editorShapeMatches) return false;

  if (expectation.layout === "docked") {
    const webBottomInset = viewportHeight - (webRect.y + webRect.height);
    const lynxBottomInset = viewportHeight - (lynxRect.y + lynxRect.height);
    return Math.abs(webBottomInset - lynxBottomInset) <= 16;
  }
  return Math.abs(webRect.y - lynxRect.y) <= 16;
}

function isCompletedThreadState() {
  return stateId === "existing-thread-completed" || stateId === "existing-thread-completed-no-diff";
}

function completedComposerProviderStateMatches(state) {
  if (!isCompletedThreadState()) return true;
  const webLabel = state?.web?.productState?.visibleModelLabel?.trim() ?? "";
  const lynxLabel = state?.lynx?.productState?.visibleModelLabel?.trim() ?? "";
  const webComposer = state?.web?.composerMetrics;
  const lynxComposer = state?.lynx?.composerMetrics;
  return (
    webLabel.length > 0 &&
    webLabel === lynxLabel &&
    webComposer?.state === lynxComposer?.state &&
    webComposer?.placeholder === lynxComposer?.placeholder &&
    JSON.stringify((webComposer?.controls ?? []).map(({ id }) => id)) ===
      JSON.stringify((lynxComposer?.controls ?? []).map(({ id }) => id))
  );
}

function completedNoDiffStateMatches(state) {
  if (stateId !== "existing-thread-completed-no-diff") return true;
  const webRows = state?.web?.timelineMetrics?.rows ?? [];
  const lynxRows = state?.lynx?.timelineMetrics?.rows ?? [];
  const webAssistant = webRows.filter((row) => row.role === "assistant");
  const lynxAssistant = lynxRows.filter((row) => row.role === "assistant");
  return (
    JSON.stringify(webRows) === JSON.stringify(lynxRows) &&
    webAssistant.length > 0 &&
    JSON.stringify(webAssistant) === JSON.stringify(lynxAssistant) &&
    webAssistant.every((row) => row.text.trim().length > 0) &&
    (state?.web?.reviewMetrics?.checkpointCards?.length ?? 0) === 0 &&
    (state?.lynx?.reviewMetrics?.checkpointCards?.length ?? 0) === 0
  );
}

function completedNoDiffGeometryMatches(webMetrics, lynxMetrics) {
  if (stateId !== "existing-thread-completed-no-diff") return true;
  const webRows = webMetrics?.rowGeometry ?? [];
  const lynxRows = lynxMetrics?.rowGeometry ?? [];
  if (webRows.length !== 3 || lynxRows.length !== 3) return false;
  return webRows.every((webRow, index) => {
    const lynxRow = lynxRows[index];
    return (
      lynxRow?.id === webRow.id &&
      lynxRow.kind === webRow.kind &&
      lynxRow.role === webRow.role &&
      ["x", "y", "width", "height"].every(
        (key) =>
          typeof webRow[key] === "number" &&
          typeof lynxRow[key] === "number" &&
          Math.abs(webRow[key] - lynxRow[key]) <= 1,
      )
    );
  });
}

function completedProjectFaviconMatches(state) {
  if (stateId !== "existing-thread-completed-no-diff") return true;
  const webIcon = state?.web?.headerMetrics?.projectIcon;
  const lynxIcon = state?.lynx?.headerMetrics?.projectIcon;
  const webSrc = webIcon?.attributes?.src ?? "";
  const lynxSrc = lynxIcon?.attributes?.src ?? "";
  const assetIdentity = (src) => {
    try {
      return new URL(src).pathname;
    } catch {
      return src;
    }
  };
  return (
    webIcon?.tagName === "img" &&
    lynxIcon?.tagName === "x-image" &&
    webSrc.length > 0 &&
    assetIdentity(webSrc) === assetIdentity(lynxSrc) &&
    Math.abs(webIcon.rect.width - lynxIcon.rect.width) <= 1 &&
    Math.abs(webIcon.rect.height - lynxIcon.rect.height) <= 1
  );
}

function completedHeaderOpenActionMatches(state) {
  if (stateId !== "existing-thread-completed-no-diff") return true;
  const findOpen = (pane) => pane?.headerMetrics?.actionItems?.find((item) => item.id === "open");
  const webOpen = findOpen(state?.web);
  const lynxOpen = findOpen(state?.lynx);
  if (!webOpen?.box?.rect || !lynxOpen?.box?.rect || webOpen.text !== lynxOpen.text) return false;
  return ["x", "y", "width", "height"].every(
    (key) => Math.abs(webOpen.box.rect[key] - lynxOpen.box.rect[key]) <= 1,
  );
}

function readCompletedComposerProviderState(state) {
  return {
    match: completedComposerProviderStateMatches(state),
    web: {
      visibleModelLabel: state?.web?.productState?.visibleModelLabel ?? null,
      state: state?.web?.composerMetrics?.state ?? null,
      placeholder: state?.web?.composerMetrics?.placeholder ?? null,
      controlIds: (state?.web?.composerMetrics?.controls ?? []).map(({ id }) => id),
    },
    lynx: {
      visibleModelLabel: state?.lynx?.productState?.visibleModelLabel ?? null,
      state: state?.lynx?.composerMetrics?.state ?? null,
      placeholder: state?.lynx?.composerMetrics?.placeholder ?? null,
      controlIds: (state?.lynx?.composerMetrics?.controls ?? []).map(({ id }) => id),
    },
  };
}

function composerPlanModeMatches(state) {
  if (!isComposerPlanModeState) return true;
  const planControl = (client) =>
    client?.composerMetrics?.anatomy?.controlBoxes?.find(({ id }) => id === "interaction");
  const web = planControl(state?.web);
  const lynx = planControl(state?.lynx);
  const separatorMatches = (box) =>
    box?.rect && Math.abs(box.rect.width - 1) <= 0.5 && Math.abs(box.rect.height - 16) <= 0.5;
  const controlMatches = (control) => {
    const box = control?.box;
    const icon = control?.icons?.[0];
    const background = box?.style?.backgroundColor?.replaceAll(" ", "") ?? "";
    const foreground = box?.style?.color?.replaceAll(" ", "") ?? "";
    const backgroundMatch = /^rgba\(59,130,246,([0-9.]+)\)$/u.exec(background);
    const className = box?.attributes?.class ?? "";
    const materialMatches =
      box?.tagName === "button"
        ? className.includes("bg-blue-500/10") && className.includes("text-blue-400")
        : className.includes("composer-toolbar-control--interaction-plan") &&
          backgroundMatch !== null &&
          Math.abs(Number(backgroundMatch[1]) - 0.1) <= 1 / 255 &&
          foreground === "rgb(96,165,250)";
    return (
      box?.rect &&
      control?.textLeaves?.some(({ text }) => text === "Plan") &&
      Math.abs(box.rect.height - 28) <= 0.5 &&
      box.style.borderTopLeftRadius === "8px" &&
      materialMatches &&
      icon?.rect &&
      Math.abs(icon.rect.width - 16) <= 0.5 &&
      Math.abs(icon.rect.height - 16) <= 0.5 &&
      icon.style.opacity === "1"
    );
  };
  return (
    state?.web?.productState?.interactionMode === "plan" &&
    state?.lynx?.productState?.interactionMode === "plan" &&
    controlMatches(web) &&
    controlMatches(lynx) &&
    separatorMatches(state?.web?.composerMetrics?.anatomy?.interactionSeparator) &&
    separatorMatches(state?.lynx?.composerMetrics?.anatomy?.interactionSeparator) &&
    Math.abs(web.box.rect.width - lynx.box.rect.width) <= 2 &&
    Math.abs(web.box.rect.height - lynx.box.rect.height) <= 0.5
  );
}

function rectDeltaWithin(left, right, tolerance) {
  if (!left?.rect || !right?.rect) return false;
  return (
    Math.abs(left.rect.x - right.rect.x) <= tolerance &&
    Math.abs(left.rect.y - right.rect.y) <= tolerance &&
    Math.abs(left.rect.width - right.rect.width) <= tolerance &&
    Math.abs(left.rect.height - right.rect.height) <= tolerance
  );
}

function normalizedChangedFilesState(reviewMetrics) {
  const state = reviewMetrics?.checkpointCards?.find(
    (card) => card.status === "ready",
  )?.expandedState;
  return state === "expanded" || state === "preview" || state === "collapsed" ? state : null;
}

const EXPECTED_REVIEW_PATCH_LINES = ["original review fixture", "updated by T3 review fixture"];

function reviewDiffHasExpectedPatch(diff) {
  return (
    diff?.codeDiff === true &&
    diff.loading === false &&
    diff.error === false &&
    EXPECTED_REVIEW_PATCH_LINES.every((line) => diff.text.includes(line))
  );
}

function reviewCheckpointCardGeometryMatches(webMetrics, lynxMetrics, expectation) {
  if (expectation !== "checkpoint" && expectation !== "tree") {
    return true;
  }
  const webCard = webMetrics?.checkpointCards?.find((card) => card.status === "ready");
  const lynxCard = lynxMetrics?.checkpointCards?.find((card) => card.status === "ready");
  if (!webCard || !lynxCard) return false;
  const textLeafMatches = (webBox, lynxBox, size, lineHeight) =>
    webBox?.style?.fontSize === size &&
    lynxBox?.style?.fontSize === size &&
    webBox?.style?.lineHeight === lineHeight &&
    lynxBox?.style?.lineHeight === lineHeight &&
    Math.abs(webBox.rect.y - lynxBox.rect.y) <= 1 &&
    Math.abs(webBox.rect.height - lynxBox.rect.height) <= 1;
  const lightBorderReady =
    theme !== "light" || (lynxCard.rect?.style?.borderTopColor ?? "") !== "rgba(0, 0, 0, 0)";
  return (
    rectDeltaWithin(webCard.rect, lynxCard.rect, 1) &&
    rectDeltaWithin(webCard.headerRect, lynxCard.headerRect, 1) &&
    textLeafMatches(webCard.statusText, lynxCard.statusText, "12px", "16px") &&
    textLeafMatches(webCard.hintText, lynxCard.hintText, "11px", "16px") &&
    textLeafMatches(webCard.openLabel, lynxCard.openLabel, "12px", "16px") &&
    lightBorderReady
  );
}

function reviewDiffGeometryMatches(webMetrics, lynxMetrics, expectation) {
  if (expectation !== "diff") return true;
  const webDiff = webMetrics?.diff;
  const lynxDiff = lynxMetrics?.diff;
  const uniqueLineBands = (lines = []) =>
    [
      ...new Map(lines.map((line) => [`${line.rect.y}:${line.rect.height}`, line.rect])).values(),
    ].sort((left, right) => left.y - right.y);
  const webHeaders = webDiff?.composedCodeGeometry?.headers ?? [];
  const lynxHeaders = lynxDiff?.composedCodeGeometry?.headers ?? [];
  const webLines = uniqueLineBands(webDiff?.composedCodeGeometry?.lines);
  const lynxLines = uniqueLineBands(lynxDiff?.composedCodeGeometry?.lines);
  const webPanelMode = webMetrics?.panelRect?.attributes?.["data-preview-panel-mode"];
  const lynxPanelMode = lynxMetrics?.panelRect?.attributes?.["data-right-panel-mode"];
  const sheet = webPanelMode === "sheet" && lynxPanelMode === "sheet";
  const rectShapeMatches = (left, right, tolerance = 1) =>
    left &&
    right &&
    Math.abs(left.width - right.width) <= tolerance &&
    Math.abs(left.height - right.height) <= tolerance;
  const panelRectMatches = sheet
    ? webDiff?.surfaceRect?.rect &&
      lynxDiff?.surfaceRect?.rect &&
      Math.abs(webDiff.surfaceRect.rect.height - lynxDiff.surfaceRect.rect.height) <= 1 &&
      webDiff.surfaceRect.rect.width > 0 &&
      lynxDiff.surfaceRect.rect.width > 0
    : rectDeltaWithin(webDiff?.surfaceRect, lynxDiff?.surfaceRect, 1);
  const correspondingRectMatches = (left, right) =>
    sheet
      ? (left?.rect ?? left) &&
        (right?.rect ?? right) &&
        Math.abs((left.rect ?? left).y - (right.rect ?? right).y) <= 1 &&
        Math.abs((left.rect ?? left).height - (right.rect ?? right).height) <= 1
      : rectDeltaWithin(left, right, 1);
  return (
    panelRectMatches &&
    correspondingRectMatches(webDiff?.subheaderRect, lynxDiff?.subheaderRect) &&
    correspondingRectMatches(webDiff?.viewportRect, lynxDiff?.viewportRect) &&
    webHeaders.length === 1 &&
    lynxHeaders.length === 1 &&
    correspondingRectMatches(webHeaders[0], lynxHeaders[0]) &&
    webLines.length > 0 &&
    webLines.length === lynxLines.length &&
    webLines.every(
      (line, index) =>
        Math.abs(line.y - lynxLines[index].y) <= 1 &&
        Math.abs(line.height - lynxLines[index].height) <= 1,
    )
  );
}

function reviewSheetPreservesChatWidth(webState, lynxState, expectation, viewportWidth) {
  if (expectation !== "diff" || viewportWidth > 1023) return true;
  const mode = (metrics) =>
    metrics?.reviewMetrics?.panelRect?.attributes?.["data-preview-panel-mode"] ??
    metrics?.reviewMetrics?.panelRect?.attributes?.["data-right-panel-mode"];
  const webComposer = webState?.composerMetrics?.rect?.rect;
  const lynxComposer = lynxState?.composerMetrics?.rect?.rect;
  const webPanel = webState?.reviewMetrics?.panelRect?.rect;
  const lynxPanel = lynxState?.reviewMetrics?.panelRect?.rect;
  return (
    mode(webState) === "sheet" &&
    mode(lynxState) === "sheet" &&
    webComposer?.width === lynxComposer?.width &&
    webComposer?.width >= viewportWidth - 40 &&
    webPanel?.x > webComposer.x &&
    lynxPanel?.x > lynxComposer.x
  );
}

function checkpointCardTypographyMatches(webState, lynxState) {
  if (stateId !== "existing-thread-completed") return true;
  const webCard = webState?.reviewMetrics?.checkpointCards?.find((card) => card.status === "ready");
  const lynxCard = lynxState?.reviewMetrics?.checkpointCards?.find(
    (card) => card.status === "ready",
  );
  if (!webCard || !lynxCard) return false;
  const fontMatches = (webBox, lynxBox, expectedSize, expectedLineHeight) =>
    webBox?.style?.fontSize === expectedSize &&
    lynxBox?.style?.fontSize === expectedSize &&
    webBox?.style?.lineHeight === expectedLineHeight &&
    lynxBox?.style?.lineHeight === expectedLineHeight;
  return (
    fontMatches(webCard.statusText, lynxCard.statusText, "12px", "16px") &&
    fontMatches(webCard.hintText, lynxCard.hintText, "11px", "16px") &&
    fontMatches(webCard.openLabel, lynxCard.openLabel, "12px", "16px") &&
    webCard.fileNames?.length === lynxCard.fileNames?.length &&
    webCard.fileNames?.length > 0 &&
    webCard.fileNames.every((box, index) =>
      fontMatches(box, lynxCard.fileNames[index], "11px", "16px"),
    ) &&
    webCard.fileStats?.length === lynxCard.fileStats?.length &&
    webCard.fileStats?.length > 0 &&
    webCard.fileStats.every((box, index) =>
      fontMatches(box, lynxCard.fileStats[index], "10px", "16px"),
    )
  );
}

function coreGeometryMatches(webState, lynxState) {
  const webComposer = webState?.composerMetrics;
  const lynxComposer = lynxState?.composerMetrics;
  if (webComposer || lynxComposer) {
    if (!rectDeltaWithin(webComposer?.rect, lynxComposer?.rect, 2)) return false;
    for (const key of ["surface", "editorArea", "footer"]) {
      if (!rectDeltaWithin(webComposer?.anatomy?.[key], lynxComposer?.anatomy?.[key], 2)) {
        return false;
      }
    }
    if (!composerToolbarAllocationMatches(webComposer, lynxComposer)) return false;
  }

  const webEmptyTranscript = webState?.timelineMetrics?.empty;
  const lynxEmptyTranscript = lynxState?.timelineMetrics?.empty;
  if (webEmptyTranscript || lynxEmptyTranscript) {
    if (!rectDeltaWithin(webEmptyTranscript, lynxEmptyTranscript, 2)) return false;
  }

  const webRows = webState?.timelineMetrics?.rowGeometry ?? [];
  const lynxRows = lynxState?.timelineMetrics?.rowGeometry ?? [];
  if (webRows.length > 0 || lynxRows.length > 0) {
    if (webRows.length !== lynxRows.length) return false;
    for (const webRow of webRows) {
      const lynxRow = lynxRows.find((row) => row.id === webRow.id);
      const blockUserMessage =
        webRow.kind === "message" &&
        webRow.role === "user" &&
        (webRow.text.includes("\n") || webRow.text.includes("```"));
      if (blockUserMessage) continue;
      const compareOuterHeight = webRow.kind === "message" && webRow.role === "user";
      const compareClippedOuterHeight =
        webRow.kind === "work" && lynxRow?.className?.includes("timeline-row-root--user-input");
      const webHeight = compareOuterHeight
        ? webRow.height
        : compareClippedOuterHeight
          ? webRow.height
          : (webRow.contentHeight ?? webRow.height);
      const lynxHeight = compareOuterHeight
        ? lynxRow?.height
        : compareClippedOuterHeight
          ? lynxRow?.height
          : (lynxRow?.contentHeight ?? lynxRow?.height);
      if (!lynxRow || Math.abs(webHeight - lynxHeight) > 8) return false;
    }
  }

  const webCard = webState?.reviewMetrics?.checkpointCards?.find((card) => card.status === "ready");
  const lynxCard = lynxState?.reviewMetrics?.checkpointCards?.find(
    (card) => card.status === "ready",
  );
  if (webCard || lynxCard) {
    if (!rectDeltaWithin(webCard?.rect, lynxCard?.rect, 8)) return false;
  }

  if (expandThinking) {
    for (const key of ["workGroup", "workEntry", "workEntryBody"]) {
      const webRect = webState?.timelineMetrics?.anatomy?.[key]?.rect;
      const lynxRect = lynxState?.timelineMetrics?.anatomy?.[key]?.rect;
      if (!webRect || !lynxRect) return false;
      if (
        Math.abs(webRect.width - lynxRect.width) > 8 ||
        Math.abs(webRect.height - lynxRect.height) > 8
      ) {
        return false;
      }
    }
  }
  return true;
}

function threadReadyForReview(state, expectedThread) {
  return (
    state?.web?.semanticReady === true &&
    state?.lynx?.semanticReady === true &&
    (!expectedThread ||
      (state?.web?.productState?.selectedThread === expectedThread &&
        state?.lynx?.productState?.selectedThread === expectedThread))
  );
}

function sessionProjectionMatches(state, expectedThreadFixture) {
  const expectedStatus =
    stateId === "composer-working" || stateId === "existing-thread-working"
      ? "Working"
      : stateId === "composer-connecting"
        ? "Connecting"
        : null;
  if (expectedStatus === null) return true;
  const expectedThreadId = expectedThreadFixture?.id;
  const webThread = state?.web?.sidebarDiagnostics?.threads?.find(
    (thread) => thread.threadId === expectedThreadId,
  );
  const lynxThread = state?.lynx?.sidebarDiagnostics?.threads?.find(
    (thread) => thread.threadId === expectedThreadId,
  );
  const webWorkingRows = (state?.web?.timelineMetrics?.rows ?? []).filter(
    (row) => row.kind === "working",
  );
  const lynxWorkingRows = (state?.lynx?.timelineMetrics?.rows ?? []).filter(
    (row) => row.kind === "working",
  );
  const expectWorking = expectedStatus === "Working";
  return (
    expectedThreadFixture?.sessionStatus === (expectWorking ? "running" : "starting") &&
    webThread?.status === expectedStatus &&
    lynxThread?.status === expectedStatus &&
    webWorkingRows.length > 0 === expectWorking &&
    lynxWorkingRows.length > 0 === expectWorking &&
    state?.web?.composerMetrics?.state === (expectWorking ? "working" : "disabled") &&
    state?.lynx?.composerMetrics?.state === (expectWorking ? "working" : "disabled") &&
    state?.web?.composerMetrics?.primaryState === (expectWorking ? "stop" : "disabled") &&
    state?.lynx?.composerMetrics?.primaryState === (expectWorking ? "stop" : "disabled")
  );
}

function sidebarStageIdentityMatches(state) {
  return (
    JSON.stringify(state?.web?.sidebarDiagnostics?.stageIdentity ?? null) ===
    JSON.stringify(state?.lynx?.sidebarDiagnostics?.stageIdentity ?? null)
  );
}

function sidebarControlGeometryMatches(state) {
  if (requestedSidebarWidth === null) return true;
  const expectedScopeWidth = requestedSidebarWidth - 53;
  const measurements = [state?.web?.sidebarDiagnostics, state?.lynx?.sidebarDiagnostics];
  const geometry = measurements.map((diagnostics) => {
    const sidebar = diagnostics?.chrome?.sidebar?.rect;
    const row = diagnostics?.chrome?.projectScopeRow?.rect;
    const host = diagnostics?.chrome?.projectScopeHost?.rect;
    const trigger = diagnostics?.chrome?.projectScope?.rect;
    const newProject = diagnostics?.chrome?.newProject?.rect;
    if (!sidebar || !row || !host || !trigger || !newProject) return null;
    return {
      width: diagnostics?.width,
      scopeWidth: trigger.width,
      hostWidth: host.width,
      rowRightInset: sidebar.x + sidebar.width - (row.x + row.width),
      newProjectRightInset: sidebar.x + sidebar.width - (newProject.x + newProject.width),
      controlGap: newProject.x - (host.x + host.width),
    };
  });
  if (geometry.some((entry) => entry === null)) return false;
  return geometry.every(
    (entry) =>
      Math.abs(entry.width - requestedSidebarWidth) <= 1 &&
      Math.abs(entry.scopeWidth - expectedScopeWidth) <= 2 &&
      Math.abs(entry.hostWidth - expectedScopeWidth) <= 2 &&
      Math.abs(entry.rowRightInset - 8) <= 2 &&
      Math.abs(entry.newProjectRightInset - 8) <= 2 &&
      Math.abs(entry.controlGap - 4) <= 2,
  );
}

function sidebarFooterThemeMatches(state, viewportWidth, viewportHeight) {
  const web = state?.web?.sidebarDiagnostics?.chrome;
  const lynx = state?.lynx?.sidebarDiagnostics?.chrome;
  const authority = lynx?.settingsAuthority;
  const authorityHidden =
    authority === null ||
    authority?.style?.display === "none" ||
    authority?.style?.opacity === "0" ||
    (authority?.rect?.width === 0 && authority?.rect?.height === 0);
  if (!semanticRoute.startsWith("settings-")) {
    const realFooterReady = [web, lynx].every((chrome) => {
      const footer = chrome?.footer?.rect;
      const row = chrome?.settingsRow?.rect;
      return (
        footer?.height === 48 &&
        row?.height === 32 &&
        row.y >= footer.y &&
        row.y + row.height <= footer.y + footer.height
      );
    });
    if (!realFooterReady || !authorityHidden || lynx?.settingsRow?.style?.opacity !== "1") {
      return false;
    }
  }
  const responsiveViewport = viewportWidth !== 1280 || viewportHeight !== 820;
  if (responsiveViewport) {
    const responsiveFooterReady = [web, lynx].every((chrome) => {
      const footer = chrome?.footer?.rect;
      const row = chrome?.settingsRow?.rect;
      return (
        footer?.height === 48 &&
        row?.height === 32 &&
        row.y >= footer.y &&
        row.y + row.height <= footer.y + footer.height
      );
    });
    const responsiveAuthorityHidden =
      authority === null ||
      authority?.style?.display === "none" ||
      authority?.style?.opacity === "0" ||
      (authority?.rect?.width === 0 && authority?.rect?.height === 0);
    if (!responsiveFooterReady || !responsiveAuthorityHidden) return false;
  }
  if (theme !== "light") return true;
  const isNearBlack = (color) =>
    typeof color === "string" &&
    (color === "rgb(0, 0, 0)" ||
      color === "rgba(0, 0, 0, 1)" ||
      color === "#000" ||
      color === "#000000");
  if (semanticRoute.startsWith("settings-")) {
    return [web, lynx].every(
      (chrome) =>
        chrome?.settingsFooter?.rect?.height > 0 &&
        chrome?.settingsBack?.rect?.height > 0 &&
        !isNearBlack(chrome.settingsFooter.style?.backgroundColor) &&
        chrome.settingsBack.style?.opacity === "1",
    );
  }
  return (
    web?.footer?.rect?.height > 0 &&
    lynx?.footer?.rect?.height > 0 &&
    !isNearBlack(web.footer.style?.backgroundColor) &&
    !isNearBlack(lynx.footer.style?.backgroundColor) &&
    lynx.settingsRow?.style?.opacity === "1" &&
    authorityHidden
  );
}

function compactControlsEvidenceReady(state) {
  if (!isCompactControlsState) return true;
  const visibilityByClient = [state?.web, state?.lynx].map((client) => {
    const anatomy = client?.overlayMetrics?.anatomy;
    const scrollBottom = (anatomy?.scroll?.rect?.y ?? 0) + (anatomy?.scroll?.rect?.height ?? 0);
    const lastRowBottom =
      (anatomy?.lastRow?.rect?.y ?? Number.POSITIVE_INFINITY) +
      (anatomy?.lastRow?.rect?.height ?? 0);
    return { lastRowBottom, overflowed: lastRowBottom > scrollBottom + 1 };
  });
  const clientsReady = [state?.web, state?.lynx].every((client, index) => {
    const footer = client?.composerMetrics?.anatomy?.footer;
    const context = client?.composerMetrics?.anatomy?.context;
    const panel = client?.reviewMetrics?.panelRect;
    const overlayMetrics = client?.overlayMetrics;
    const anatomy = overlayMetrics?.anatomy;
    const initialVisibilityReady =
      visibilityByClient[0]?.overflowed === visibilityByClient[1]?.overflowed &&
      (!isShortCompactControlsState || visibilityByClient[index]?.overflowed === true);
    return (
      client?.productState?.overlay === "compact-controls" &&
      footer?.attributes?.["data-chat-composer-footer-compact"] === "true" &&
      context?.rect?.width > 0 &&
      panel?.rect?.width > 0 &&
      overlayMetrics?.triggerRect?.width > 0 &&
      anatomy?.panel?.rect?.width > 0 &&
      anatomy?.panel?.rect?.height > 0 &&
      anatomy?.scroll?.rect?.height > 0 &&
      anatomy?.content?.rect?.height > 0 &&
      anatomy?.row?.rect?.height > 0 &&
      anatomy?.lastRow?.rect?.height > 0 &&
      initialVisibilityReady &&
      overlayMetrics?.rowLabels
        ?.at(-1)
        ?.replace(/\s*Default\s*$/u, "")
        .trim() === "Full access" &&
      overlayMetrics?.rowCount > 0
    );
  });
  const containment = compactControlsContainment(state);
  const webPanel = state?.web?.overlayMetrics?.anatomy?.panel?.rect;
  const lynxPanel = state?.lynx?.overlayMetrics?.anatomy?.panel?.rect;
  const webTrigger = state?.web?.overlayMetrics?.triggerRect;
  const lynxTrigger = state?.lynx?.overlayMetrics?.triggerRect;
  const panelGeometryMatches =
    isShortCompactControlsState ||
    (webPanel &&
      lynxPanel &&
      webTrigger &&
      lynxTrigger &&
      Math.abs(webPanel.y - lynxPanel.y) <= 2 &&
      Math.abs(webPanel.width - lynxPanel.width) <= 2 &&
      Math.abs(webPanel.height - lynxPanel.height) <= 2 &&
      Math.abs(webPanel.x - webTrigger.x - (lynxPanel.x - lynxTrigger.x)) <= 2);
  return (
    clientsReady &&
    panelGeometryMatches &&
    containment.web?.contained === true &&
    containment.lynx?.contained === true
  );
}

function projectActionDialogReady(state) {
  if (!isProjectActionDialogState) return true;
  const expectedFieldLabels = ["Name", "Keybinding", "Command", "Preview URL (optional)"];
  const expectedOptionLabels = [
    "Run automatically on worktree creation",
    "Open preview automatically when this action runs",
  ];
  const expectedFooterButtons = ["Cancel", "Save action"];
  const expectedPlaceholders = {
    name: "Test",
    keybinding: "Press shortcut",
    command: "bun test",
    previewUrl: "http://localhost:5173",
  };
  return [state?.web, state?.lynx].every((client) => {
    const dialog = client?.overlayMetrics?.anatomy;
    return (
      client?.productState?.overlay === "project-action-dialog" &&
      dialog?.title === "Add Action" &&
      dialog?.description ===
        "Actions are project-scoped commands you can run from the top bar or keybindings." &&
      JSON.stringify(dialog?.fieldLabels ?? []) === JSON.stringify(expectedFieldLabels) &&
      JSON.stringify((dialog?.options ?? []).map(({ label }) => label)) ===
        JSON.stringify(expectedOptionLabels) &&
      dialog?.options?.[0]?.disabled === false &&
      dialog?.options?.[1]?.disabled === true &&
      JSON.stringify((dialog?.footerButtons ?? []).map(({ label }) => label)) ===
        JSON.stringify(expectedFooterButtons) &&
      Object.entries(expectedPlaceholders).every(
        ([field, placeholder]) => dialog?.fields?.[field]?.placeholder === placeholder,
      )
    );
  });
}

function projectSettingsReady(state, interaction) {
  if (!isProjectSettingsState) return true;
  const webDialog = state?.web?.overlayMetrics?.anatomy;
  const lynxDialog = state?.lynx?.overlayMetrics?.anatomy;
  const webReady =
    state?.web?.productState?.overlay === "project-settings-dialog" &&
    webDialog?.title === "Project settings" &&
    JSON.stringify(webDialog?.fieldLabels ?? []) ===
      JSON.stringify(["Project name", "Grouping rule"]) &&
    (webDialog?.controls?.projectNames?.length ?? 0) > 0 &&
    (webDialog?.controls?.groupingRules?.length ?? 0) > 0 &&
    (webDialog?.removeLabels ?? []).includes("Remove project") &&
    (webDialog?.footerButtons ?? []).some(({ label }) => label === "Close") &&
    interaction?.webScopeActionCount > 0 &&
    interaction?.webActionClicked === true;
  if (!webReady) return false;
  if (projectSettingsExpectation === "missing") {
    return (
      state?.lynx?.productState?.overlay === "project-scope" &&
      interaction?.lynxScopeOptionCount > 0 &&
      interaction?.lynxScopeActionCount === 0 &&
      lynxDialog === null
    );
  }
  return (
    state?.lynx?.productState?.overlay === "project-settings-dialog" &&
    lynxDialog?.title === "Project settings" &&
    JSON.stringify(lynxDialog?.fieldLabels ?? []) ===
      JSON.stringify(["Project name", "Grouping rule"]) &&
    (lynxDialog?.controls?.projectNames?.length ?? 0) > 0 &&
    (lynxDialog?.controls?.groupingRules?.length ?? 0) > 0 &&
    JSON.stringify(webDialog?.paths ?? []) === JSON.stringify(lynxDialog?.paths ?? []) &&
    JSON.stringify(webDialog?.environments ?? []) ===
      JSON.stringify(lynxDialog?.environments ?? []) &&
    webDialog?.summaryActions?.copyPath === true &&
    lynxDialog?.summaryActions?.copyPath === true &&
    webDialog?.summaryActions?.environmentIcon === true &&
    lynxDialog?.summaryActions?.environmentIcon === true &&
    (lynxDialog?.removeLabels ?? []).includes("Remove project") &&
    (lynxDialog?.footerButtons ?? []).some(({ label }) => label === "Close") &&
    interaction?.lynxScopeActionCount > 0 &&
    interaction?.lynxActionClicked === true
  );
}

function rightPanelAddMenuReady(state) {
  if (!isRightPanelAddMenuState) return true;
  const expectedLabels = ["Browser", "Terminal", "Files", "Diff"];
  const webRows = state?.web?.overlayMetrics?.anatomy?.rows ?? [];
  const lynxRows = state?.lynx?.overlayMetrics?.anatomy?.rows ?? [];
  return (
    state?.web?.productState?.overlay === "right-panel-add-menu" &&
    state?.lynx?.productState?.overlay === "right-panel-add-menu" &&
    JSON.stringify(webRows.map(({ label }) => label)) === JSON.stringify(expectedLabels) &&
    JSON.stringify(lynxRows.map(({ label }) => label)) === JSON.stringify(expectedLabels) &&
    JSON.stringify(webRows.map(({ disabled }) => disabled)) ===
      JSON.stringify(lynxRows.map(({ disabled }) => disabled)) &&
    webRows.every(({ rect }) => rect?.rect?.width > 0 && rect?.rect?.height > 0) &&
    lynxRows.every(({ rect }) => rect?.rect?.width > 0 && rect?.rect?.height > 0)
  );
}

function diffScopeMenuReady(state) {
  if (!isDiffScopeMenuState) return true;
  const webRows = state?.web?.overlayMetrics?.anatomy?.rows ?? [];
  const lynxRows = state?.lynx?.overlayMetrics?.anatomy?.rows ?? [];
  return (
    state?.web?.productState?.overlay === "diff-scope-menu" &&
    state?.lynx?.productState?.overlay === "diff-scope-menu" &&
    state?.web?.overlayMetrics?.triggerRect?.width > 0 &&
    state?.lynx?.overlayMetrics?.triggerRect?.width > 0 &&
    state?.web?.overlayMetrics?.triggerLabel === "Latest turn" &&
    state?.lynx?.overlayMetrics?.triggerLabel === "Latest turn" &&
    state?.web?.overlayMetrics?.rect?.width > 0 &&
    state?.lynx?.overlayMetrics?.rect?.width > 0 &&
    webRows.length > 0 &&
    lynxRows.length > 0 &&
    webRows.every(({ rect }) => rect?.rect?.width > 0 && rect?.rect?.height > 0) &&
    lynxRows.every(({ rect }) => rect?.rect?.width > 0 && rect?.rect?.height > 0)
  );
}

function rightPanelTerminalReady(state) {
  if (!isRightPanelTerminalState) return true;
  const webPanel = state?.web?.reviewMetrics?.panelRect;
  const lynxPanel = state?.lynx?.reviewMetrics?.panelRect;
  const webTerminal = state?.web?.reviewMetrics?.terminal;
  const lynxTerminal = state?.lynx?.reviewMetrics?.terminal;
  return (
    webTerminal?.sessionId === "term-1" &&
    lynxTerminal?.sessionId === "term-1" &&
    webTerminal?.root?.rect?.width > 0 &&
    webTerminal?.viewport?.rect?.height > 0 &&
    lynxTerminal?.root?.rect?.width > 0 &&
    lynxTerminal?.viewport?.rect?.height > 0 &&
    webTerminal.viewport.rect.width >= (webPanel?.rect?.width ?? 0) - 10 &&
    lynxTerminal.viewport.rect.width >= (lynxPanel?.rect?.width ?? 0) - 2 &&
    lynxTerminal.outputText?.includes("\n") === true &&
    Math.abs((webPanel?.rect?.width ?? 0) - (lynxPanel?.rect?.width ?? 0)) <= 1
  );
}

function compactControlsContainment(state) {
  const read = (client) => {
    const context = client?.composerMetrics?.anatomy?.context?.rect;
    const composer = client?.composerMetrics?.rect?.rect;
    const panel = client?.reviewMetrics?.panelRect?.rect;
    const overlay = client?.overlayMetrics?.rect;
    if (!context || !composer || !panel || !overlay) return null;
    const contextRight = context.x + context.width;
    const composerRight = composer.x + composer.width;
    const overlayRight = overlay.x + overlay.width;
    return {
      context,
      composer,
      overlay,
      panel,
      contextOverlap: Math.max(0, contextRight - panel.x),
      overlayOverlap: Math.max(0, overlayRight - panel.x),
      contained:
        context.x >= composer.x &&
        contextRight <= composerRight &&
        contextRight <= panel.x &&
        overlay.x >= composer.x &&
        overlayRight <= composerRight &&
        overlayRight <= panel.x,
    };
  };
  return {
    web: read(state?.web),
    lynx: read(state?.lynx),
  };
}

function sidebarWorkingGeometryMatches(state, expectedThreadFixture) {
  if (stateId !== "composer-working" && stateId !== "existing-thread-working") return true;
  const expectedThreadId = expectedThreadFixture?.id;
  const measurements = [state?.web?.sidebarDiagnostics, state?.lynx?.sidebarDiagnostics].map(
    (diagnostics) =>
      diagnostics?.threads?.find((thread) => thread.threadId === expectedThreadId) ?? null,
  );
  if (measurements.some((entry) => entry === null)) return false;
  return measurements.every((thread) => {
    const card = thread.child?.rect;
    const slot = thread.statusSlot?.rect;
    const status = thread.statusBox?.rect;
    const content = thread.statusContent?.rect;
    const duration = thread.workingDuration?.rect;
    if (!card || !slot || !status || !content || !duration) return false;
    const cardRight = card.x + card.width;
    return (
      thread.status === "Working" &&
      Math.abs(card.height - 78) <= 2 &&
      slot.y >= card.y &&
      slot.y + slot.height <= card.y + card.height &&
      slot.x + slot.width <= cardRight &&
      status.height <= 20 &&
      content.height <= 20 &&
      duration.height <= 20 &&
      Math.abs(duration.y - content.y) <= 2 &&
      duration.x >= content.x &&
      duration.x + duration.width <= content.x + content.width + 1 &&
      content.x + content.width <= cardRight &&
      Math.abs(cardRight - (content.x + content.width) - 10) <= 2
    );
  });
}

function headerGitActionMatches(state) {
  if (stateId === "sidebar-project-groups") return true;
  const webAction = state?.web?.headerMetrics?.actionItems?.find((item) => item.id === "commit");
  const lynxAction = state?.lynx?.headerMetrics?.actionItems?.find((item) => item.id === "commit");
  if (!webAction && !lynxAction) return true;
  const lynxReadStatus = state?.lynx?.connectorDiagnostics?.commands?.some(
    ({ method }) => method === "readVcsStatus",
  );
  return (
    Boolean(webAction && lynxAction && lynxReadStatus) &&
    webAction.gitQuickActionKind !== null &&
    webAction.gitQuickActionLabel !== null &&
    webAction.gitQuickActionKind === lynxAction.gitQuickActionKind &&
    webAction.gitQuickActionLabel === lynxAction.gitQuickActionLabel
  );
}

function gitPublishDialogMatches(state) {
  if (!isGitPublishDialogState) return true;
  const web = state?.web?.gitPublishDialog;
  const lynx = state?.lynx?.gitPublishDialog;
  return (
    web?.title === "Publish repository" &&
    lynx?.title === web.title &&
    lynx?.description === web.description &&
    JSON.stringify(web?.steps?.map(({ label, state: stepState }) => [label, stepState])) ===
      JSON.stringify(lynx?.steps?.map(({ label, state: stepState }) => [label, stepState])) &&
    JSON.stringify(web?.providers?.map(({ kind, ready }) => [kind, ready])) ===
      JSON.stringify(lynx?.providers?.map(({ kind, ready }) => [kind, ready])) &&
    web?.dismiss !== null &&
    lynx?.dismiss !== null
  );
}

function filesBrowserReady(state) {
  if (!isFilesBrowserState) return true;
  const web = state?.web?.filesBrowserMetrics;
  const lynx = state?.lynx?.filesBrowserMetrics;
  const comparableRows =
    (web?.rows ?? []).length > 0 &&
    (web?.rows ?? []).length === (lynx?.rows ?? []).length &&
    web.rows.every((row, index) => {
      const lynxRow = lynx.rows[index];
      const webTypography = row.name?.style ?? row.box?.style;
      const lynxTypography = lynxRow?.name?.style ?? lynxRow?.box?.style;
      return (
        row.text === lynxRow?.text &&
        rectDeltaWithin(row.box, lynxRow?.box, 1) &&
        [
          "borderTopLeftRadius",
          "borderTopRightRadius",
          "borderBottomRightRadius",
          "borderBottomLeftRadius",
        ].every((key) => row.box?.style?.[key] === "5px" && lynxRow?.box?.style?.[key] === "5px") &&
        row.name !== null &&
        lynxRow?.name !== null &&
        webTypography?.fontSize === "12px" &&
        lynxTypography?.fontSize === "12px" &&
        webTypography?.fontFamily?.includes("DM Sans") === true &&
        lynxTypography?.fontFamily?.includes("DM Sans") === true
      );
    });
  const expectedIconTone = (href) => {
    if (href?.includes("markdown")) return "markdown";
    if (href?.includes("image")) return "image";
    if (href?.includes("font")) return "default";
    if (href?.includes("typescript")) return "typescript";
    if (href?.includes("javascript")) return "javascript";
    if (href?.includes("npm")) return "npm";
    if (href?.includes("git")) return "git";
    if (href?.includes("yml") || href?.includes("yaml") || href?.includes("pnpm")) {
      return "yaml";
    }
    return null;
  };
  const iconMappingsMatch = (web?.rows ?? []).every((row, index) => {
    const lynxRow = lynx?.rows?.[index];
    const authorityTone = expectedIconTone(row.icon?.href);
    return authorityTone === null || lynxRow?.icon?.tone === authorityTone;
  });
  return (
    web?.present === true &&
    state?.lynx?.reviewMetrics?.activeKind === "files" &&
    lynx?.present === true &&
    web.rowCount > 0 &&
    web.rowCount === lynx.rowCount &&
    rectDeltaWithin(web.surface, lynx.surface, 1) &&
    rectDeltaWithin(web.toolbar, lynx.toolbar, 1) &&
    rectDeltaWithin(web.refresh, lynx.refresh, 1) &&
    rectDeltaWithin(web.search, lynx.search, 1) &&
    rectDeltaWithin(web.browser, lynx.browser, 1) &&
    web.toolbar?.rect?.height === 40 &&
    web.refresh?.rect?.width === 24 &&
    web.refresh?.rect?.height === 24 &&
    web.search?.rect?.height === 28 &&
    web.browser?.rect?.height === 736 &&
    comparableRows &&
    iconMappingsMatch
  );
}

function filesBrowserSemanticReady(state) {
  if (!isFilesSurfaceState) return true;
  if (isCompactControlsState) {
    return (
      state?.web?.reviewMetrics?.panelOpen === true &&
      state?.lynx?.reviewMetrics?.panelOpen === true &&
      state?.web?.filesBrowserMetrics?.present === true &&
      state?.lynx?.filesBrowserMetrics?.present === true
    );
  }
  if (isFileEditorState) {
    return (
      state?.web?.filesBrowserMetrics?.present === true &&
      state?.lynx?.reviewMetrics?.activeKind === "file" &&
      state?.lynx?.filesBrowserMetrics?.present === true &&
      (state?.web?.filesBrowserMetrics?.rowCount ?? 0) > 0 &&
      state?.web?.filesBrowserMetrics?.rowCount === state?.lynx?.filesBrowserMetrics?.rowCount
    );
  }
  return (
    state?.web?.filesBrowserMetrics?.present === true &&
    state?.lynx?.reviewMetrics?.activeKind === "files" &&
    state?.lynx?.filesBrowserMetrics?.present === true &&
    (state?.web?.filesBrowserMetrics?.rowCount ?? 0) > 0 &&
    state?.web?.filesBrowserMetrics?.rowCount === state?.lynx?.filesBrowserMetrics?.rowCount
  );
}

function settledBannerInlineFilesReady(state) {
  if (!isSettledBannerInlineFilesState) return true;
  const ready = (client) => {
    const anatomy = client?.composerMetrics?.anatomy;
    const panel = client?.reviewMetrics?.panelRect;
    const banner = anatomy?.statusBanner;
    const composer = client?.composerMetrics?.rect;
    return (
      anatomy?.statusBannerText?.includes("This thread is settled") === true &&
      anatomy?.statusTitleText === "This thread is settled" &&
      anatomy?.statusDescriptionText ===
        "Sending a message moves it back to Active in the sidebar." &&
      anatomy?.statusActionText === "Un-settle" &&
      panel?.attributes?.["data-preview-panel-mode"] !== "sheet" &&
      panel?.attributes?.["data-right-panel-mode"] !== "sheet" &&
      Math.abs(
        (banner?.rect?.y ?? 0) + (banner?.rect?.height ?? 0) - (composer?.rect?.y ?? 0) + 8,
      ) <= 1
    );
  };
  const webPanel = state?.web?.reviewMetrics?.panelRect;
  const lynxPanel = state?.lynx?.reviewMetrics?.panelRect;
  return (
    ready(state?.web) &&
    ready(state?.lynx) &&
    rectDeltaWithin(
      state?.web?.composerMetrics?.anatomy?.statusBanner,
      state?.lynx?.composerMetrics?.anatomy?.statusBanner,
      1,
    ) &&
    rectDeltaWithin(
      state?.web?.composerMetrics?.anatomy?.statusAction,
      state?.lynx?.composerMetrics?.anatomy?.statusAction,
      1,
    ) &&
    Math.abs((webPanel?.rect?.width ?? 0) - 360) <= 1 &&
    Math.abs((lynxPanel?.rect?.width ?? 0) - 360) <= 1 &&
    Math.abs((webPanel?.rect?.width ?? 0) - (lynxPanel?.rect?.width ?? 0)) <= 1
  );
}

function fileEditorReady(state) {
  if (!isFileEditorState) return true;
  const web = state?.web?.fileEditorMetrics;
  const lynx = state?.lynx?.fileEditorMetrics;
  const fileName = filePath.split("/").at(-1);
  const narrow = isNarrowFileEditorState;
  const webPanel = state?.web?.reviewMetrics?.panelRect;
  const lynxPanel = state?.lynx?.reviewMetrics?.panelRect;
  const webPanelMode = webPanel?.attributes?.["data-preview-panel-mode"];
  const lynxPanelMode = lynxPanel?.attributes?.["data-right-panel-mode"];
  const sheet = webPanelMode === "sheet" && lynxPanelMode === "sheet";
  const editorWidthsMatch =
    sheet || Math.abs(web?.editor?.rect?.width - lynx?.editor?.rect?.width) <= 1;
  const backReady =
    web?.back?.rect?.width === 28 &&
    web.back?.rect?.height === 28 &&
    lynx?.back?.rect?.width === 28 &&
    lynx.back?.rect?.height === 28;
  const editorTypographyReady = [web, lynx].every(
    (metrics) =>
      metrics?.firstLineContent?.style?.fontFamily?.includes("SF Mono") === true &&
      metrics.firstLineContent.style.fontSize === "13px" &&
      metrics.firstLineContent.style.lineHeight === "20px" &&
      metrics.gutterWidth >= 48 &&
      metrics.gutterWidth <= 50,
  );
  return (
    web?.present === true &&
    lynx?.present === true &&
    web.currentFile === fileName &&
    lynx.currentFile === fileName &&
    web.breadcrumbText.includes(fileName) &&
    lynx.breadcrumbText.includes(fileName) &&
    web.toolbar?.rect?.height === 40 &&
    lynx.toolbar?.rect?.height === 40 &&
    web.editor?.rect?.height > 0 &&
    lynx.editor?.rect?.height > 0 &&
    web.editorValueLength > 0 &&
    lynx.editorValueLength > 0 &&
    editorWidthsMatch &&
    Math.abs(web.editor.rect.height - lynx.editor.rect.height) <= 1 &&
    web.tabs.length === 1 &&
    lynx.tabs.length === 1 &&
    web.tabs.includes(fileName) &&
    lynx.tabs.includes(fileName) &&
    backReady &&
    editorTypographyReady &&
    (narrow
      ? web.editor?.rect?.width >= 319 &&
        lynx.editor?.rect?.width >= 320 &&
        web.explorer === null &&
        lynx.explorer === null &&
        (!sheet ||
          (Math.abs(web.editor.rect.width - webPanel.rect.width) <= 1 &&
            Math.abs(lynx.editor.rect.width - lynxPanel.rect.width) <= 2 &&
            webPanel.rect.x > 0 &&
            lynxPanel.rect.x > 0))
      : web.explorer?.rect?.width >= 255 &&
        lynx.explorer?.rect?.width >= 255 &&
        Math.abs(web.explorer.rect.width - lynx.explorer.rect.width) <= 1 &&
        !sheet) &&
    web.statusbar === null &&
    lynx.statusbar === null
  );
}

function fileEditorSemanticReady(state) {
  if (!isFileEditorState) return true;
  const fileName = filePath.split("/").at(-1);
  return (
    state?.web?.fileEditorMetrics?.currentFile === fileName &&
    state?.lynx?.fileEditorMetrics?.currentFile === fileName
  );
}

async function dispatchPointerClick(cdp, sessionId, point) {
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", ...point, button: "left", clickCount: 1, pointerType: "mouse" },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", ...point, button: "left", clickCount: 1, pointerType: "mouse" },
    sessionId,
  );
}

async function dispatchPointerClickWithMove(cdp, sessionId, point) {
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", ...point, button: "none", pointerType: "mouse" },
    sessionId,
  );
  await dispatchPointerClick(cdp, sessionId, point);
}

async function dismissWebProviderNotification(cdp, sessionId, timeout = 8_000) {
  const startedAt = Date.now();
  const deadline = Date.now() + timeout;
  let clickAttempts = 0;
  let nextClickAt = 0;
  let absentSince = null;
  while (Date.now() < deadline) {
    const notification = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pane = document.getElementById('web-pane');
        const doc = pane?.contentWindow?.document;
        if (!pane || !doc) return { present: false };
        const isVisible = (candidate) => {
          const rect = candidate.getBoundingClientRect();
          const style = doc.defaultView?.getComputedStyle(candidate);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style?.display !== 'none' &&
            style?.visibility !== 'hidden' &&
            Number(style?.opacity ?? 1) > 0
          );
        };
        const popup = Array.from(doc.querySelectorAll('[data-slot="toast-popup"]')).find(
          isVisible,
        );
        const dismiss = Array.from(
          doc.querySelectorAll('button[aria-label="Dismiss notification"]'),
        ).find(isVisible);
        if (!popup && !dismiss) return { present: false };
        if (!dismiss) return { present: true, point: null };
        const paneRect = pane.getBoundingClientRect();
        const rect = dismiss.getBoundingClientRect();
        const style = doc.defaultView?.getComputedStyle(dismiss);
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          style?.display === 'none' ||
          style?.visibility === 'hidden' ||
          style?.pointerEvents === 'none'
        ) {
          return { present: true, point: null };
        }
        return {
          present: true,
          point: {
            x: paneRect.x + rect.x + rect.width / 2,
            y: paneRect.y + rect.y + rect.height / 2,
          },
        };
      })()`,
    ).catch(() => null);
    if (notification?.present === false) {
      absentSince ??= Date.now();
      if (Date.now() - startedAt >= 1_500 && Date.now() - absentSince >= 500) return true;
    } else {
      absentSince = null;
    }
    if (notification?.point && clickAttempts < 3 && Date.now() >= nextClickAt) {
      await dispatchPointerClickWithMove(cdp, sessionId, notification.point);
      clickAttempts += 1;
      nextClickAt = Date.now() + 750;
    }
    await delay(50);
  }
  return false;
}

async function openWebSettingsFromSidebar(cdp, sessionId, useDomFallback) {
  if (useDomFallback) {
    const clicked = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const target = document.getElementById('web-pane')
          ?.contentWindow?.document?.querySelector('.sidebar-settings-row');
        target?.click();
        return Boolean(target);
      })()`,
    ).catch(() => false);
    return clicked ? "dom-click-fallback" : null;
  }
  const point = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById('web-pane');
        const doc = frame?.contentWindow?.document;
        const target = doc?.querySelector('.sidebar-settings-row');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const hit = doc.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
        target: {
          tagName: target.tagName,
          className: target.getAttribute('class'),
          ariaLabel: target.getAttribute('aria-label'),
          disabled: target.disabled === true || target.getAttribute('aria-disabled') === 'true',
          pointerEvents: getComputedStyle(target).pointerEvents,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        },
        hit: hit ? {
          tagName: hit.tagName,
          className: hit.getAttribute('class'),
          ariaLabel: hit.getAttribute('aria-label'),
        } : null,
      };
    })()`,
  ).catch(() => null);
  if (!point) return null;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return "cdp-pointer";
}

async function dispatchMouseWheel(cdp, sessionId, point, deltaY) {
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", ...point, button: "none" },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseWheel", ...point, deltaX: 0, deltaY },
    sessionId,
  );
}

async function dispatchOverlayOpeningPointerClick(cdp, sessionId, point) {
  const pressed = cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", ...point, button: "left", clickCount: 1 },
    sessionId,
  );
  const released = cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", ...point, button: "left", clickCount: 1 },
    sessionId,
  );
  await Promise.all([pressed, released]);
}

async function providerDialogControlPoint(cdp, sessionId, client, control) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const dialog = ${JSON.stringify(client)} === 'lynx'
        ? root?.querySelector('[data-provider-instance-dialog="true"]')
        : [...(root?.querySelectorAll('[data-slot="dialog-popup"]') ?? [])].find(
            (item) => item.querySelector('[data-slot="dialog-title"]')?.textContent?.trim() ===
              'Add provider instance'
          );
      let target = null;
      if (${JSON.stringify(control)} === 'add') {
        target = root?.querySelector('[aria-label="Add provider instance"]');
      } else if (${JSON.stringify(control)} === 'next') {
        target = [...(dialog?.querySelectorAll('button, .provider-instance-dialog__save') ?? [])]
          .find((item) => item.textContent?.trim() === 'Next');
      } else if (${JSON.stringify(control)} === 'config-step') {
        target = dialog?.querySelector('[aria-label^="Config, step 3"]');
      } else if (${JSON.stringify(control)} === 'add-instance') {
        target = [...(dialog?.querySelectorAll('button, .provider-instance-dialog__save') ?? [])]
          .find((item) => item.textContent?.trim() === 'Add instance');
      } else if (${JSON.stringify(control)} === 'backdrop') {
        target =
          root?.querySelector('.provider-instance-dialog-overlay') ??
          root?.querySelector('[data-slot="dialog-backdrop"]');
      }
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const x =
        ${JSON.stringify(control)} === 'backdrop'
          ? frameRect.x + Math.max(8, Math.min(48, rect.width / 8))
          : frameRect.x + rect.x + rect.width / 2;
      const y =
        ${JSON.stringify(control)} === 'backdrop'
          ? frameRect.y + Math.max(8, Math.min(48, rect.height / 8))
          : frameRect.y + rect.y + rect.height / 2;
      return { x, y };
    })()`,
  );
}

async function clickProviderDialogControl(cdp, sessionId, client, control) {
  const point = await providerDialogControlPoint(cdp, sessionId, client, control);
  if (!point) return null;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return point;
}

async function runAddProviderDialogFlow(cdp, sessionId, viewportWidth, viewportHeight) {
  const timeline = [];
  for (const client of ["web", "lynx"]) {
    if (!(await clickProviderDialogControl(cdp, sessionId, client, "add"))) {
      throw new Error(`Missing ${client} Add provider instance trigger`);
    }
  }
  let state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => addProviderDialogPairMatches(next, viewportWidth, viewportHeight, 0),
    3_000,
    "Add Provider Driver step",
  );
  timeline.push({
    step: "opened",
    web: state.web.addProviderDialog,
    lynx: state.lynx.addProviderDialog,
  });
  if (providerDialogStopAt === "driver") return { state, timeline };

  for (const client of ["web", "lynx"]) {
    if (!(await clickProviderDialogControl(cdp, sessionId, client, "next"))) {
      throw new Error(`Missing ${client} Add Provider Next control`);
    }
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => addProviderDialogPairMatches(next, viewportWidth, viewportHeight, 1),
    3_000,
    "Add Provider Identity step",
  );
  timeline.push({
    step: "identity",
    web: state.web.addProviderDialog,
    lynx: state.lynx.addProviderDialog,
  });

  for (const client of ["web", "lynx"]) {
    if (!(await clickProviderDialogControl(cdp, sessionId, client, "config-step"))) {
      throw new Error(`Missing ${client} Add Provider Config step control`);
    }
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) =>
      addProviderDialogPairMatches(next, viewportWidth, viewportHeight, 1) &&
      Boolean(next?.web?.addProviderDialog?.error) &&
      Boolean(next?.lynx?.addProviderDialog?.error),
    5_000,
    "Add Provider invalid Config skip",
  );
  timeline.push({
    step: "config-blocked",
    web: state.web.addProviderDialog,
    lynx: state.lynx.addProviderDialog,
  });

  for (const client of ["web", "lynx"]) {
    if (!(await clickProviderDialogControl(cdp, sessionId, client, "backdrop"))) {
      throw new Error(`Missing ${client} Add Provider backdrop`);
    }
  }
  const closeStartedAt = Date.now();
  const closing = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) =>
      (next?.web?.addProviderDialog === null ||
        next?.web?.addProviderDialog?.motion === "exiting") &&
      (next?.lynx?.addProviderDialog === null ||
        next?.lynx?.addProviderDialog?.motion === "exiting"),
    1_000,
    "Add Provider exit start",
  );
  const webClosing = closing?.web?.addProviderDialog ?? null;
  const lynxClosing = closing?.lynx?.addProviderDialog ?? null;
  if (webClosing !== null && !webClosing.transitionDuration.includes("0.2s")) {
    throw new Error(
      `Web Add Provider exit motion did not match the 200ms authority: ${JSON.stringify({
        web: webClosing,
        lynx: lynxClosing,
      })}`,
    );
  }
  if (
    lynxClosing !== null &&
    (lynxClosing.motion !== "exiting" || !lynxClosing.animationDuration.includes("0.2s"))
  ) {
    throw new Error(
      `Lynx Add Provider exit motion did not match the 200ms authority: ${JSON.stringify({
        web: webClosing,
        lynx: lynxClosing,
      })}`,
    );
  }
  timeline.push({
    step: "closing",
    sampled: webClosing !== null || lynxClosing !== null,
    web: webClosing,
    lynx: lynxClosing,
  });
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => next?.web?.addProviderDialog === null && next?.lynx?.addProviderDialog === null,
    3_000,
    "Add Provider backdrop dismissal",
  );
  const closeElapsedMs = Date.now() - closeStartedAt;
  if (closeElapsedMs > 1_000) {
    throw new Error(
      `Add Provider dismissal exceeded the bounded motion window: ${closeElapsedMs}ms`,
    );
  }
  timeline.push({ step: "dismissed", elapsedMs: closeElapsedMs });

  for (const client of ["web", "lynx"]) {
    if (!(await clickProviderDialogControl(cdp, sessionId, client, "add"))) {
      throw new Error(`Missing ${client} Add provider trigger after dismissal`);
    }
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => addProviderDialogPairMatches(next, viewportWidth, viewportHeight, 0),
    3_000,
    "Add Provider reset after reopen",
  );
  timeline.push({
    step: "reopened",
    web: state.web.addProviderDialog,
    lynx: state.lynx.addProviderDialog,
  });

  if (!(await clickProviderDialogControl(cdp, sessionId, "lynx", "next"))) {
    throw new Error("Missing Lynx Add Provider Next control after reopen");
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => next?.lynx?.addProviderDialog?.activeStep === 1,
    3_000,
    "Lynx Add Provider Identity mutation step",
  );
  const fillLynxInput = async (index, value, { replace = false } = {}) => {
    const focused = await focusRemoteElement(
      cdp,
      sessionId,
      `(() => {
        const frame = document.getElementById('lynx-pane');
        const root = frame?.contentWindow?.document
          ?.getElementById('t3-lynx-preview')?.shadowRoot;
        const host = root?.querySelectorAll('.provider-instance-dialog__input')?.[${index}];
        const input = host?.shadowRoot?.querySelector('input') ?? host ?? null;
        if (${replace}) input?.select?.();
        return input;
      })()`,
    );
    if (!focused) throw new Error(`Could not focus Lynx Add Provider input ${index}`);
    await cdp.send("Input.insertText", { text: value }, sessionId);
  };
  const instanceLabel = "Fidelity Codex";
  const instanceId = "codex_fidelity_browser";
  await fillLynxInput(0, instanceLabel);
  await fillLynxInput(1, instanceId, { replace: true });
  await delay(300);
  if (!(await clickProviderDialogControl(cdp, sessionId, "lynx", "next"))) {
    throw new Error("Missing Lynx Add Provider Config navigation control");
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => next?.lynx?.addProviderDialog?.activeStep === 2,
    3_000,
    "Lynx Add Provider Config step",
  );
  timeline.push({ step: "config", lynx: state.lynx.addProviderDialog });
  if (!(await clickProviderDialogControl(cdp, sessionId, "lynx", "add-instance"))) {
    throw new Error("Missing Lynx Add instance control");
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) =>
      next?.lynx?.addProviderDialog === null &&
      (next?.web?.settingsMetrics?.providers?.cards ?? []).some(
        (card) => card.title === instanceLabel,
      ) &&
      (next?.lynx?.settingsMetrics?.providers?.cards ?? []).some(
        (card) => card.title === instanceLabel,
      ),
    5_000,
    "shared Add Provider save",
  );
  timeline.push({
    step: "saved",
    instanceId,
    webCards: state.web.settingsMetrics?.providers?.cards?.map((card) => card.title) ?? [],
    lynxCards: state.lynx.settingsMetrics?.providers?.cards?.map((card) => card.title) ?? [],
  });
  const deletePoint = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById('lynx-pane');
      const root = frame?.contentWindow?.document
        ?.getElementById('t3-lynx-preview')?.shadowRoot;
      const card = [...(root?.querySelectorAll('.provider-instance-card') ?? [])].find(
        (candidate) => candidate.textContent?.includes(${JSON.stringify(instanceLabel)})
      );
      const target = card?.querySelector('.provider-instance-card__chevron');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
    })()`,
  );
  if (!deletePoint) throw new Error("Missing saved Lynx provider card expansion control");
  await dispatchPointerClickWithMove(cdp, sessionId, deletePoint);
  const expanded = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) =>
      next?.lynx?.settingsMetrics?.providers?.cards?.some(
        (card) => card.title === instanceLabel && card.text.includes("Delete instance"),
      ),
    3_000,
    "saved Lynx provider card expansion",
  );
  let stableDeleteSamples = 0;
  const deleteReversed = (next) => {
    const reversed =
      !(next?.web?.settingsMetrics?.providers?.cards ?? []).some(
        (card) => card.title === instanceLabel,
      ) &&
      !(next?.lynx?.settingsMetrics?.providers?.cards ?? []).some(
        (card) => card.title === instanceLabel,
      ) &&
      !(next?.lynx?.connectorDiagnostics?.providerInstanceIds ?? []).includes(instanceId);
    stableDeleteSamples = reversed ? stableDeleteSamples + 1 : 0;
    return stableDeleteSamples >= 3;
  };
  for (let attempt = 1; attempt <= 3 && stableDeleteSamples < 3; attempt += 1) {
    const removePoint = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const frame = document.getElementById('lynx-pane');
        const root = frame?.contentWindow?.document
          ?.getElementById('t3-lynx-preview')?.shadowRoot;
        const card = [...(root?.querySelectorAll('.provider-instance-card') ?? [])].find(
          (candidate) => candidate.textContent?.includes(${JSON.stringify(instanceLabel)})
        );
        const target = card?.querySelector('.provider-card__delete-instance');
        if (!frame || !target) return null;
        const frameRect = frame.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
      })()`,
    );
    if (!removePoint) {
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        deleteReversed,
        1_000,
        "stable shared Add Provider delete reversal after control removal",
      ).catch(() => state);
      if (stableDeleteSamples >= 3) break;
      throw new Error("Missing saved Lynx provider Delete instance control");
    }
    await dispatchPointerClickWithMove(cdp, sessionId, removePoint);
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      deleteReversed,
      attempt === 3 ? 5_000 : 1_000,
      `stable shared Add Provider delete reversal attempt ${attempt}`,
    ).catch(() => state);
  }
  if (stableDeleteSamples < 3) {
    throw new Error("Add Provider delete did not reach a stable shared reverse state");
  }
  timeline.push({
    step: "deleted",
    instanceId,
    expanded: Boolean(expanded),
    stableSamples: stableDeleteSamples,
  });
  if (!(await clickProviderDialogControl(cdp, sessionId, "web", "backdrop"))) {
    throw new Error("Missing Web Add Provider backdrop after shared delete");
  }
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => next?.web?.addProviderDialog === null && next?.lynx?.addProviderDialog === null,
    3_000,
    "Add Provider final shared dismissal",
  );
  timeline.push({ step: "final-dismissed" });
  return { state, timeline };
}

function reviewPairMatches(webMetrics, lynxMetrics, expectation) {
  if (expectation === null) return true;
  if (!webMetrics || !lynxMetrics) return false;
  if (expectation === "panel-empty") {
    return (
      webMetrics.panelOpen === true &&
      lynxMetrics.panelOpen === true &&
      webMetrics.panelEmpty === true &&
      lynxMetrics.panelEmpty === true &&
      JSON.stringify(webMetrics.actionKeys) === JSON.stringify(lynxMetrics.actionKeys)
    );
  }
  const webReadyCards = webMetrics.checkpointCards.filter((card) => card.status === "ready");
  const lynxReadyCards = lynxMetrics.checkpointCards.filter((card) => card.status === "ready");
  if (expectation === "checkpoint") {
    return (
      webReadyCards.length > 0 &&
      lynxReadyCards.length > 0 &&
      webReadyCards[0]?.fileCount === lynxReadyCards[0]?.fileCount &&
      webReadyCards[0]?.expandedState === "preview" &&
      lynxReadyCards[0]?.expandedState === "preview" &&
      webMetrics.treeCount === 0 &&
      lynxMetrics.treeCount === 0
    );
  }
  if (expectation === "tree") {
    return (
      webReadyCards.length > 0 &&
      lynxReadyCards.length > 0 &&
      webReadyCards[0]?.fileCount === lynxReadyCards[0]?.fileCount &&
      webReadyCards[0]?.expandedState === "expanded" &&
      lynxReadyCards[0]?.expandedState === "expanded" &&
      webMetrics.treeCount === 1 &&
      lynxMetrics.treeCount === 1 &&
      JSON.stringify(webMetrics.treeFileCounts) === JSON.stringify(lynxMetrics.treeFileCounts)
    );
  }
  const webFilePaths = [...(webMetrics.diff?.filePaths ?? [])].sort();
  const lynxFilePaths = [...(lynxMetrics.diff?.filePaths ?? [])].sort();
  const diffPairReady =
    webMetrics.panelOpen === true &&
    lynxMetrics.panelOpen === true &&
    webMetrics.activeKind === "diff" &&
    lynxMetrics.activeKind === "diff" &&
    webMetrics.diff !== null &&
    lynxMetrics.diff !== null;
  const lynxCodeFiles = lynxMetrics.diff?.codeFiles ?? [];
  const webGutters = webMetrics.diff?.composedCodeGeometry?.gutters ?? [];
  const webContents = webMetrics.diff?.composedCodeGeometry?.contents ?? [];
  const lynxNumbers = lynxMetrics.diff?.composedCodeGeometry?.lynxNumbers ?? [];
  const lynxMarkers = lynxMetrics.diff?.composedCodeGeometry?.lynxMarkers ?? [];
  const lynxContents = lynxMetrics.diff?.composedCodeGeometry?.lynxContents ?? [];
  const lynxFileHeaderAnatomyReady =
    expectation !== "diff" ||
    (lynxCodeFiles.length === lynxFilePaths.length &&
      lynxCodeFiles.every(
        (file) =>
          file.expanded === "true" &&
          file.chevronRect?.rect?.width === 14 &&
          file.chevronRect?.rect?.height === 14 &&
          file.changeIconRect?.rect?.width === 14 &&
          file.changeIconRect?.rect?.height === 14,
      ));
  const diffLineColumnsReady =
    expectation !== "diff" ||
    (webGutters.length === 2 &&
      webContents.length === 2 &&
      lynxNumbers.length === 2 &&
      lynxMarkers.length === 2 &&
      lynxContents.length === 2 &&
      lynxContents.every(
        (content, index) =>
          Math.abs(
            content.rect.x -
              (lynxNumbers[index].rect.x +
                lynxNumbers[index].rect.width +
                lynxMarkers[index].rect.width),
          ) <= 1 &&
          Math.abs(content.rect.x - webContents[index].rect.x) <= 1 &&
          content.style.fontSize === "13px" &&
          content.style.fontFamily.includes("SF Mono"),
      ));
  return (
    diffPairReady &&
    lynxFileHeaderAnatomyReady &&
    diffLineColumnsReady &&
    webMetrics.diff.selectedTurn === lynxMetrics.diff.selectedTurn &&
    webFilePaths.length > 0 &&
    JSON.stringify(webFilePaths) === JSON.stringify(lynxFilePaths) &&
    reviewDiffHasExpectedPatch(webMetrics.diff) &&
    reviewDiffHasExpectedPatch(lynxMetrics.diff)
  );
}

function sidebarDiffPairMatches(webDiagnostics, lynxDiagnostics, expectation) {
  if (expectation !== "checkpoint" && expectation !== "tree" && expectation !== "diff") {
    return true;
  }
  const webDiffs = webDiagnostics?.diffs ?? [];
  const lynxDiffs = lynxDiagnostics?.diffs ?? [];
  return JSON.stringify(webDiffs) === JSON.stringify(lynxDiffs);
}

function reviewReadinessBreakdown(webState, lynxState, expectation, viewportWidth) {
  return {
    semantics: reviewPairMatches(webState?.reviewMetrics, lynxState?.reviewMetrics, expectation),
    checkpointGeometry:
      (expectation === "diff" && viewportWidth <= 1023) ||
      reviewCheckpointCardGeometryMatches(
        webState?.reviewMetrics,
        lynxState?.reviewMetrics,
        expectation,
      ),
    diffGeometry: reviewDiffGeometryMatches(
      webState?.reviewMetrics,
      lynxState?.reviewMetrics,
      expectation,
    ),
    sheetPreservesChat: reviewSheetPreservesChatWidth(
      webState,
      lynxState,
      expectation,
      viewportWidth,
    ),
    typography: checkpointCardTypographyMatches(webState, lynxState),
    sidebar: sidebarDiffPairMatches(
      webState?.sidebarDiagnostics,
      lynxState?.sidebarDiagnostics,
      expectation,
    ),
  };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, HOST, () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function httpRequest(port, requestPath, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequestRaw(
      { host: HOST, port, path: requestPath, method, headers, timeout: 8000 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("http timeout")));
    if (body) req.write(body);
    req.end();
  });
}

function safeJoin(root, p) {
  const resolved = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  return resolved.startsWith(root) ? resolved : null;
}

const PROXY_PREFIXES = ["/api", "/ws", "/oauth", "/.well-known"];
const isProxied = (pathname) =>
  PROXY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"),
  );

/**
 * Single-origin front server. Routes:
 *   /__workbench              -> workbench shell (shared-workbench/workbench.html)
 *   /__workbench.js           -> controller
 *   /lynx/*                   -> Lynx-for-Web build
 *   /api|/ws|/oauth|/.well-known -> proxied to the shared server
 *   everything else           -> real apps/web/dist (SPA fallback to index.html)
 *
 * The real Web app is served at the ROOT origin so its absolute `/assets/*` and
 * router paths (`/pair`, `/`) resolve exactly as they do in production; the
 * harness top page and the Lynx bundle use reserved `/__workbench*` and `/lynx/`
 * prefixes that the web SPA never owns.
 */
function startFrontServer(serverPort) {
  const server = createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? "/", `http://${HOST}`);
      const pathname = decodeURIComponent(reqUrl.pathname);

      if (isProxied(pathname)) {
        const proxyReq = httpRequestRaw(
          { host: HOST, port: serverPort, path: req.url, method: req.method, headers: req.headers },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );
        proxyReq.on("error", () => res.writeHead(502).end("proxy error"));
        req.pipe(proxyReq);
        return;
      }

      let filePath = null;
      let spaFallback = null;
      if (pathname === "/__workbench" || pathname === "/__workbench/") {
        filePath = path.join(WORKBENCH_ASSETS, "workbench.html");
      } else if (pathname === "/__workbench.js") {
        filePath = path.join(WORKBENCH_ASSETS, "workbench.js");
      } else if (pathname.startsWith("/lynx/")) {
        filePath = safeJoin(LYNX_BUILD_DIR, pathname.slice("/lynx/".length));
      } else if (pathname.startsWith("/static/")) {
        filePath = safeJoin(LYNX_BUILD_DIR, pathname.slice(1));
      } else {
        // Real Web app at the root origin, SPA fallback to its index.html.
        filePath =
          pathname === "/" ? path.join(WEB_DIST, "index.html") : safeJoin(WEB_DIST, pathname);
        spaFallback = path.join(WEB_DIST, "index.html");
      }

      if (!filePath) return void res.writeHead(404).end("not found");
      let info = await stat(filePath).catch(() => null);
      if ((!info || !info.isFile()) && spaFallback) {
        filePath = spaFallback;
        info = await stat(filePath).catch(() => null);
      }
      if (!info || !info.isFile()) return void res.writeHead(404).end("not found");
      if (filePath === path.join(WEB_DIST, "index.html")) {
        const html = await readFile(filePath, "utf8");
        const desktopVisualMarker = "<script>window.__T3_WORKBENCH_DESKTOP_VISUAL__=true;</script>";
        res.writeHead(200, {
          "content-type": MIME[".html"],
          "cache-control": "no-store",
        });
        res.end(html.replace("<head>", `<head>${desktopVisualMarker}`));
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });
  // WS upgrade proxy (for /ws).
  server.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(serverPort, HOST, () => {
      const headerLines = [
        `${req.method} ${req.url} HTTP/1.1`,
        ...Object.entries(req.headers).map(
          ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`,
        ),
        "",
        "",
      ].join("\r\n");
      upstream.write(headerLines);
      if (head && head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return new Promise((resolve) => {
    server.listen(0, HOST, () => resolve({ server, port: server.address().port }));
  });
}

// --- minimal CDP -----------------------------------------------------------
class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }
  async connect() {
    this.socket = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (typeof msg.id === "number") {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result ?? {});
      } else {
        for (const l of this.listeners) l(msg);
      }
    });
  }
  onEvent(l) {
    this.listeners.add(l);
  }
  send(method, params = {}, sessionId) {
    const id = this.id++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }
  close() {
    try {
      this.socket.close();
    } catch {
      /* noop */
    }
  }
}

async function fetchJson(endpoint, pathname) {
  const res = await fetch(new URL(pathname, endpoint));
  return res.json();
}

function waitForDevtools(chrome) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += String(chunk);
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) resolve(m[1].replace(/^ws:\/\//, "http://").replace(/\/devtools\/browser\/.*$/, ""));
    };
    chrome.stderr.on("data", onData);
    chrome.stdout.on("data", onData);
    chrome.on("exit", (code) => reject(new Error(`chrome exited early (${code})`)));
    setTimeout(() => reject(new Error("timed out waiting for devtools")), 15000);
  });
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopOwnedChild(child, gracefulSignal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill(gracefulSignal);
  if (await waitForChildExit(child, 2_000)) return;
  child.kill("SIGKILL");
  await waitForChildExit(child, 2_000);
}

async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
}

async function focusRemoteElement(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: false },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  const objectId = result.result?.objectId;
  if (!objectId) return false;
  try {
    const focused = await cdp
      .send("DOM.focus", { objectId }, sessionId)
      .then(() => true)
      .catch(() => false);
    if (!focused) return false;
    return true;
  } finally {
    await cdp.send("Runtime.releaseObject", { objectId }, sessionId).catch(() => undefined);
  }
}

async function dispatchKeyToRemoteElement(
  cdp,
  sessionId,
  expression,
  key,
  code,
  keyCode,
  modifiers = 0,
) {
  const focused = await focusRemoteElement(cdp, sessionId, expression);
  if (!focused) return false;
  await cdp.send(
    "Input.dispatchKeyEvent",
    { type: "rawKeyDown", modifiers, key, code, windowsVirtualKeyCode: keyCode },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", modifiers, key, code, windowsVirtualKeyCode: keyCode },
    sessionId,
  );
  return true;
}

async function readWorkbenchState(cdp, sessionId) {
  return evaluate(cdp, sessionId, `(() => window.__T3_WORKBENCH__?.read() ?? null)()`).catch(
    () => null,
  );
}

async function waitForWorkbenchState(
  cdp,
  sessionId,
  predicate,
  timeoutMs = 3000,
  label = "unknown",
) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readWorkbenchState(cdp, sessionId);
    if (predicate(state)) return state;
    await delay(50);
  }
  throw new Error(
    `Workbench interaction postcondition timed out (${label}): ${JSON.stringify({
      web: {
        overlay: state?.web?.productState?.overlay ?? null,
        view: state?.web?.overlayMetrics?.paletteView ?? null,
        active: state?.web?.overlayMetrics?.activeRowLabels ?? [],
      },
      lynx: {
        overlay: state?.lynx?.productState?.overlay ?? null,
        view: state?.lynx?.overlayMetrics?.paletteView ?? null,
        active: state?.lynx?.overlayMetrics?.activeRowLabels ?? [],
      },
      addProviderDialog: {
        web: state?.web?.addProviderDialog ?? null,
        lynx: state?.lynx?.addProviderDialog ?? null,
      },
      betaMutation: {
        web: state?.web?.settingsMetrics?.betaMutation ?? null,
        lynx: state?.lynx?.settingsMetrics?.betaMutation ?? null,
      },
      connectionsMutation: {
        web: state?.web?.settingsMetrics?.connectionsMutation ?? null,
        lynx: state?.lynx?.settingsMetrics?.connectionsMutation ?? null,
      },
      sidebarThreadJumpLabels: {
        web: (state?.web?.sidebarDiagnostics?.threads ?? []).map((row) => row.jumpLabel),
        lynx: (state?.lynx?.sidebarDiagnostics?.threads ?? []).map((row) => row.jumpLabel),
      },
      productState: {
        web: state?.web?.productState ?? null,
        lynx: state?.lynx?.productState ?? null,
      },
      composer: Object.fromEntries(
        ["web", "lynx"].map((client) => [
          client,
          {
            layout: state?.[client]?.composerMetrics?.layout ?? null,
            state: state?.[client]?.composerMetrics?.state ?? null,
            primaryState: state?.[client]?.composerMetrics?.primaryState ?? null,
            placeholder: state?.[client]?.composerMetrics?.placeholder ?? null,
            controls: state?.[client]?.composerMetrics?.controls ?? [],
            contextLabels: state?.[client]?.composerMetrics?.contextLabels ?? [],
            statusBanner: state?.[client]?.composerMetrics?.anatomy?.statusBanner ?? null,
            toolbarAllocation: state?.[client]?.composerMetrics?.anatomy?.toolbarAllocation ?? null,
          },
        ]),
      ),
      keybindings: {
        web: state?.web?.settingsMetrics?.keybindings ?? null,
        lynx: state?.lynx?.settingsMetrics?.keybindings ?? null,
        lynxCommands: state?.lynx?.connectorDiagnostics?.commands ?? [],
        lynxLastResult: state?.lynx?.connectorDiagnostics?.lastCommandResult ?? null,
      },
    })}`,
  );
}

async function paletteRowPoint(cdp, sessionId, client, label) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const rows = [...(root?.querySelectorAll('[data-palette-row="true"]') ?? [])];
      const row = rows.find((item) => item.textContent?.includes(${JSON.stringify(label)}));
      if (!frame || !row) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
      };
    })()`,
  );
}

async function hoverPaletteRow(cdp, sessionId, client, label) {
  const point = await paletteRowPoint(cdp, sessionId, client, label);
  if (!point) return false;
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", ...point, button: "none", pointerType: "mouse" },
    sessionId,
  );
  return true;
}

async function setLynxPaletteActiveForHarness(cdp, sessionId, label) {
  const updated = await evaluate(
    cdp,
    sessionId,
    `document.getElementById('lynx-pane')?.contentWindow
      ?.__T3_LYNX_WEB_PREVIEW__?.setQuickSwitchActiveForHarness?.(${JSON.stringify(label)}) ?? false`,
  );
  if (updated !== true) {
    throw new Error(`Lynx Quick Switch active-row probe is unavailable for ${label}`);
  }
}

async function clickPaletteRow(cdp, sessionId, client, label) {
  const point = await paletteRowPoint(cdp, sessionId, client, label);
  if (!point) return false;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return true;
}

async function paletteRowHoverVisual(cdp, sessionId, client, label) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const rows = [...(root?.querySelectorAll('[data-palette-row="true"]') ?? [])];
      const row = rows.find((item) => item.textContent?.includes(${JSON.stringify(label)}));
      if (!row) return null;
      const style = getComputedStyle(row);
      return {
        hovered: row.matches(':hover'),
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    })()`,
  );
}

async function dispatchPaletteKey(cdp, sessionId, client, key, code, keyCode) {
  const expression =
    client === "web"
      ? `document.getElementById('web-pane')?.contentWindow?.document
          ?.querySelector('[data-command-palette="true"] [data-slot="autocomplete-input"]')`
      : `(() => {
          const frame = document.getElementById('lynx-pane');
          const root = frame?.contentWindow?.document
            ?.getElementById('t3-lynx-preview')?.shadowRoot;
          const host = root?.querySelector('.qs-search__input');
          return host?.shadowRoot?.querySelector('input') ?? host;
        })()`;
  return dispatchKeyToRemoteElement(cdp, sessionId, expression, key, code, keyCode);
}

async function clickSidebarSearch(cdp, sessionId, client) {
  const point = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const target =
        root?.querySelector('.sidebar-v2-search') ??
        root?.querySelector('[data-testid="command-palette-trigger"]');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
      };
    })()`,
  );
  if (!point) return false;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return true;
}

async function sidebarControlPoint(cdp, sessionId, client, selector) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const target =
        root?.querySelector(${JSON.stringify(selector)}) ??
        root?.querySelector(
          ${JSON.stringify(
            selector.includes("new-thread")
              ? '[data-testid="sidebar-v2-new-thread"]'
              : '[data-testid="sidebar-v2-new-project"]',
          )}
        );
      if (!frame || !target) {
        return {
          missing: true,
          sidebarVersion:
            root?.querySelector('[data-app-sidebar]')?.getAttribute('data-sidebar-version') ?? null,
          route: frame?.contentWindow?.location?.pathname ?? null,
          buttons: [...(root?.querySelectorAll('button, [role="button"], [data-sidebar="menu-button"]') ?? [])]
            .map((button) => ({
              ariaLabel: button.getAttribute('aria-label'),
              className: button.getAttribute('class'),
              testId: button.getAttribute('data-testid'),
            }))
            .filter((button) => button.ariaLabel || button.testId),
        };
      }
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
      };
    })()`,
  );
}

async function movePointerToSidebarControl(cdp, sessionId, client, selector) {
  const point = await sidebarControlPoint(cdp, sessionId, client, selector);
  if (!point || point.missing) return point;
  await cdp.send(
    "Input.dispatchMouseEvent",
    {
      type: "mouseMoved",
      x: Math.max(1, point.x - 48),
      y: point.y,
      button: "none",
      pointerType: "mouse",
    },
    sessionId,
  );
  await delay(50);
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", ...point, button: "none", pointerType: "mouse" },
    sessionId,
  );
  return { moved: true, point };
}

async function readSidebarControlHover(cdp, sessionId, client, selector) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const target = root?.querySelector(${JSON.stringify(selector)});
      if (!target) return null;
      return {
        hovered: target.matches(':hover'),
        disabled: target.disabled === true || target.getAttribute('aria-disabled') === 'true',
        attributes: Object.fromEntries(
          target.getAttributeNames().map((name) => [name, target.getAttribute(name)])
        ),
      };
    })()`,
  );
}

async function clickSidebarControl(cdp, sessionId, client, selector) {
  const point = await sidebarControlPoint(cdp, sessionId, client, selector);
  if (!point || point.missing) return false;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return true;
}

async function clickThreadErrorDismiss(cdp, sessionId, client) {
  const point = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const target =
        root?.querySelector('[aria-label="Dismiss error"]') ??
        root?.querySelector('.thread-error-dismiss');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const hit = doc.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
        target: {
          tagName: target.tagName,
          className: target.getAttribute('class'),
          ariaLabel: target.getAttribute('aria-label'),
          disabled: target.disabled === true || target.getAttribute('aria-disabled') === 'true',
          pointerEvents: getComputedStyle(target).pointerEvents,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        },
        hit: hit ? {
          tagName: hit.tagName,
          className: hit.getAttribute('class'),
          ariaLabel: hit.getAttribute('aria-label'),
        } : null,
      };
    })()`,
  );
  if (!point) return null;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return point;
}

async function clickPaletteBack(cdp, sessionId, client) {
  const point = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const target =
        root?.querySelector('.qs-search__back') ??
        root?.querySelector('[data-command-palette="true"] button[aria-label="Back"]');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
      };
    })()`,
  );
  if (!point) return false;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return true;
}

async function readSidebarTooltip(cdp, sessionId, client, relationId) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const popup = root?.querySelector(
        ${JSON.stringify(`[data-floating-popup="${relationId}"]`)}
      );
      if (!popup) return null;
      const readBox = (element) => {
        if (!element) return null;
        const elementRect = element.getBoundingClientRect();
        const elementStyle = getComputedStyle(element);
        return {
          tagName: element.tagName.toLowerCase(),
          className: element.getAttribute('class'),
          rect: {
            x: elementRect.x,
            y: elementRect.y,
            width: elementRect.width,
            height: elementRect.height,
          },
          style: {
            display: elementStyle.display,
            flexDirection: elementStyle.flexDirection,
            paddingTop: elementStyle.paddingTop,
            paddingRight: elementStyle.paddingRight,
            paddingBottom: elementStyle.paddingBottom,
            paddingLeft: elementStyle.paddingLeft,
            rowGap: elementStyle.rowGap,
            color: elementStyle.color,
            fontFamily: elementStyle.fontFamily,
            fontSize: elementStyle.fontSize,
            fontWeight: elementStyle.fontWeight,
            lineHeight: elementStyle.lineHeight,
          },
        };
      };
      const rect = popup.getBoundingClientRect();
      const style = getComputedStyle(popup);
      return {
        text: popup.textContent?.trim().replace(/\s+/g, ' ') ?? '',
        attributes: Object.fromEntries(
          popup.getAttributeNames().map((name) => [name, popup.getAttribute(name)])
        ),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        content: (() => {
          const content =
            popup.querySelector('.sidebar-v2-details-content') ??
            popup.querySelector('[data-slot="tooltip-viewport"] > *');
          return content ? {
            box: readBox(content),
            children: [...content.children].map((child) => ({
              text: child.textContent?.trim().replace(/\s+/g, ' ') ?? '',
              box: readBox(child),
              children: [...child.children].map((grandchild) => ({
                text: grandchild.textContent?.trim().replace(/\s+/g, ' ') ?? '',
                box: readBox(grandchild),
              })),
            })),
          } : null;
        })(),
        style: {
          opacity: style.opacity,
          transform: style.transform,
          transitionDuration: style.transitionDuration,
          transitionProperty: style.transitionProperty,
        },
      };
    })()`,
  );
}

async function sidebarThreadCardTarget(cdp, sessionId, client, index = 0) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const target = root?.querySelectorAll('[data-thread-item] [data-floating-anchor]')?.[${index}];
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        relationId: target.getAttribute('data-floating-anchor'),
        threadId: target.closest('[data-thread-id]')?.getAttribute('data-thread-id') ?? null,
        text: target.textContent?.trim().replace(/\\s+/g, ' ') ?? '',
        attributes: Object.fromEntries(
          target.getAttributeNames().map((name) => [name, target.getAttribute(name)])
        ),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        point: {
          x: frameRect.x + rect.x + rect.width / 2,
          y: frameRect.y + rect.y + rect.height / 2,
        },
        awayPoint: {
          x: frameRect.x + frameRect.width - 24,
          y: frameRect.y + frameRect.height / 2,
        },
      };
    })()`,
  );
}

async function readLynxSidebarTooltipDiagnostics(cdp, sessionId, relationId) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById('lynx-pane');
      const doc = frame?.contentWindow?.document;
      const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
      const anchor = [...(root?.querySelectorAll('[data-floating-anchor]') ?? [])]
        .find((candidate) => candidate.getAttribute('data-floating-anchor') === ${JSON.stringify(
          relationId,
        )});
      const popup = root?.querySelector(${JSON.stringify(`[data-floating-popup="${relationId}"]`)});
      const popupRect = popup?.getBoundingClientRect();
      const popupStyle = popup ? getComputedStyle(popup) : null;
      return {
        relationId: ${JSON.stringify(relationId)},
        pointerInside: anchor?.getAttribute('data-tooltip-pointer-inside') ?? null,
        anchorRectAttribute: anchor?.getAttribute('data-floating-anchor-rect') ?? null,
        anchorAttributes: anchor
          ? Object.fromEntries(
              anchor.getAttributeNames().map((name) => [name, anchor.getAttribute(name)])
            )
          : null,
        popupExists: Boolean(popup),
        popupOpacity: popupStyle?.opacity ?? null,
        popupRect: popupRect
          ? { x: popupRect.x, y: popupRect.y, width: popupRect.width, height: popupRect.height }
          : null,
      };
    })()`,
  );
}

async function readSidebarThreadDisclosure(cdp, sessionId, client, threadId) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const item = [...(root?.querySelectorAll('[data-thread-item]') ?? [])]
        .find((candidate) => candidate.getAttribute('data-thread-id') === ${JSON.stringify(threadId)});
      const status = item?.querySelector('.sidebar-v2-row-status');
      const actions = item?.querySelector('.sidebar-v2-row-actions');
      const statusStyle = status ? getComputedStyle(status) : null;
      const actionsStyle = actions ? getComputedStyle(actions) : null;
      return {
        statusOpacity: statusStyle?.opacity ?? null,
        actionsOpacity: actionsStyle?.opacity ?? null,
        actionsBackground: actionsStyle?.backgroundColor ?? null,
      };
    })()`,
  );
}

async function waitForSidebarThreadDisclosure(cdp, sessionId, client, threadId, predicate) {
  const deadline = Date.now() + 750;
  let disclosure = null;
  while (Date.now() < deadline) {
    disclosure = await readSidebarThreadDisclosure(cdp, sessionId, client, threadId);
    if (predicate(disclosure)) return disclosure;
    await delay(25);
  }
  return disclosure;
}

async function movePointer(cdp, sessionId, point) {
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", ...point, button: "none", pointerType: "mouse" },
    sessionId,
  );
}

async function invokeLynxTooltipProbe(cdp, sessionId, relationId, action) {
  const result = await evaluate(
    cdp,
    sessionId,
    `(() => globalThis.__T3_WORKBENCH__?.invokeLynxTooltip?.(
      ${JSON.stringify(relationId)},
      ${JSON.stringify(action)}
    ) ?? false)()`,
  );
  if (result !== true) {
    throw new Error(`Lynx tooltip ${action} probe is unavailable for ${relationId}`);
  }
}

function sidebarTooltipVisible(tooltip) {
  return (
    tooltip !== null &&
    Number(tooltip.style.opacity) > 0.01 &&
    tooltip.rect.width > 0 &&
    tooltip.rect.height > 0
  );
}

async function waitForSidebarTooltipDismissed(cdp, sessionId, client, relationId) {
  const startedAt = Date.now();
  const deadline = startedAt + 1_000;
  let tooltip = null;
  while (Date.now() < deadline) {
    tooltip = await readSidebarTooltip(cdp, sessionId, client, relationId);
    if (!sidebarTooltipVisible(tooltip)) {
      return { elapsedMs: Date.now() - startedAt, tooltip };
    }
    await delay(25);
  }
  return { elapsedMs: Date.now() - startedAt, tooltip };
}

async function runSidebarThreadHoverPreviewFlow(cdp, sessionId, viewport) {
  const timeline = [];
  const openedByClient = {};

  for (const client of ["web", "lynx"]) {
    const target = await sidebarThreadCardTarget(cdp, sessionId, client);
    if (!target?.relationId || !target.threadId) {
      throw new Error(
        `Missing ${client} Sidebar thread-card hover target: ${JSON.stringify(target)}`,
      );
    }
    if (client === "web") {
      await movePointer(cdp, sessionId, target.awayPoint);
    } else {
      await invokeLynxTooltipProbe(cdp, sessionId, target.relationId, "leave");
    }
    const initialDisclosure = await waitForSidebarThreadDisclosure(
      cdp,
      sessionId,
      client,
      target.threadId,
      (disclosure) =>
        Number(disclosure?.statusOpacity) >= 0.99 && Number(disclosure?.actionsOpacity) <= 0.01,
    );
    if (
      Number(initialDisclosure?.statusOpacity) < 0.99 ||
      Number(initialDisclosure?.actionsOpacity) > 0.01
    ) {
      throw new Error(
        `${client} Sidebar date/actions initial state did not match: ${JSON.stringify(initialDisclosure)}`,
      );
    }
    if (client === "web") {
      await movePointer(cdp, sessionId, target.awayPoint);
      await movePointer(cdp, sessionId, target.point);
      await movePointer(cdp, sessionId, target.awayPoint);
    } else {
      await invokeLynxTooltipProbe(cdp, sessionId, target.relationId, "hover");
      await invokeLynxTooltipProbe(cdp, sessionId, target.relationId, "leave");
    }
    await delay(250);
    const quickLeave = await readSidebarTooltip(cdp, sessionId, client, target.relationId);
    timeline.push({ client, step: "quick-leave", target, tooltip: quickLeave });
    if (sidebarTooltipVisible(quickLeave)) {
      throw new Error(`${client} Sidebar details opened after quick pointer leave`);
    }

    if (client === "web") {
      await movePointer(cdp, sessionId, target.point);
    } else {
      await invokeLynxTooltipProbe(cdp, sessionId, target.relationId, "hover");
    }
    const opened = await waitForSidebarTooltip(cdp, sessionId, client, target.relationId, "");
    if (!opened) {
      const diagnostics =
        client === "lynx"
          ? await readLynxSidebarTooltipDiagnostics(cdp, sessionId, target.relationId)
          : null;
      throw new Error(
        `${client} Sidebar details did not open at the expected relation: ${JSON.stringify({
          diagnostics,
          opened,
          target,
        })}`,
      );
    }
    const side = opened.attributes["data-floating-side"] ?? opened.attributes["data-side"] ?? null;
    const align =
      opened.attributes["data-floating-align"] ?? opened.attributes["data-align"] ?? null;
    if (side !== "right" || align !== "start") {
      throw new Error(
        `${client} Sidebar details declared an unexpected placement: ${JSON.stringify(opened)}`,
      );
    }
    const sideGap = opened.rect.x - (target.rect.x + target.rect.width);
    const alignDelta = opened.rect.y - target.rect.y;
    const contained =
      opened.rect.x >= -1 &&
      opened.rect.y >= -1 &&
      opened.rect.x + opened.rect.width <= viewport.width + 1 &&
      opened.rect.y + opened.rect.height <= viewport.height + 1;
    if (sideGap < 0 || Math.abs(alignDelta) > 1 || !contained) {
      throw new Error(
        `${client} Sidebar details relation drifted: ${JSON.stringify({
          alignDelta,
          contained,
          opened,
          sideGap,
          target,
        })}`,
      );
    }
    openedByClient[client] = { ...opened, align, alignDelta, contained, side, sideGap, target };
    const hoveredDisclosure = await readSidebarThreadDisclosure(
      cdp,
      sessionId,
      client,
      target.threadId,
    );
    if (
      Number(hoveredDisclosure?.statusOpacity) > 0.01 ||
      Number(hoveredDisclosure?.actionsOpacity) < 0.99 ||
      hoveredDisclosure?.actionsBackground !== "rgba(0, 0, 0, 0)"
    ) {
      throw new Error(
        `${client} Sidebar date/actions hover state did not match: ${JSON.stringify(hoveredDisclosure)}`,
      );
    }
    timeline.push({
      client,
      step: "opened",
      initialDisclosure,
      hoveredDisclosure,
      tooltip: openedByClient[client],
    });

    if (client === "web") {
      await movePointer(cdp, sessionId, target.awayPoint);
    } else {
      await invokeLynxTooltipProbe(cdp, sessionId, target.relationId, "leave");
    }
    const dismissed = await waitForSidebarTooltipDismissed(
      cdp,
      sessionId,
      client,
      target.relationId,
    );
    if (sidebarTooltipVisible(dismissed.tooltip)) {
      throw new Error(`${client} Sidebar details remained open after pointer leave`);
    }
    const restoredDisclosure = await waitForSidebarThreadDisclosure(
      cdp,
      sessionId,
      client,
      target.threadId,
      (disclosure) =>
        Number(disclosure?.statusOpacity) >= 0.99 && Number(disclosure?.actionsOpacity) <= 0.01,
    );
    if (
      Number(restoredDisclosure?.statusOpacity) < 0.99 ||
      Number(restoredDisclosure?.actionsOpacity) > 0.01
    ) {
      throw new Error(
        `${client} Sidebar date/actions did not restore: ${JSON.stringify(restoredDisclosure)}`,
      );
    }
    timeline.push({ client, step: "dismissed", restoredDisclosure, ...dismissed });

    const siblingTarget = await sidebarThreadCardTarget(cdp, sessionId, client, 1);
    if (siblingTarget?.relationId && siblingTarget.threadId) {
      if (siblingTarget.threadId === target.threadId) {
        throw new Error(`${client} Sidebar hover targets resolved to the same thread`);
      }
      if (client === "web") {
        await movePointer(cdp, sessionId, siblingTarget.point);
      } else {
        await invokeLynxTooltipProbe(cdp, sessionId, siblingTarget.relationId, "hover");
      }
      const siblingOpened = await waitForSidebarTooltip(
        cdp,
        sessionId,
        client,
        siblingTarget.relationId,
        "",
      );
      if (
        !siblingOpened ||
        (siblingOpened.attributes["data-floating-popup"] ?? null) !== siblingTarget.relationId
      ) {
        throw new Error(
          `${client} Sidebar sibling details did not match the hovered row: ${JSON.stringify({ siblingOpened, siblingTarget })}`,
        );
      }
      timeline.push({
        client,
        step: "sibling-opened",
        target: siblingTarget,
        tooltip: siblingOpened,
      });
      if (client === "web") {
        await movePointer(cdp, sessionId, siblingTarget.awayPoint);
      } else {
        await invokeLynxTooltipProbe(cdp, sessionId, siblingTarget.relationId, "leave");
      }
      const siblingDismissed = await waitForSidebarTooltipDismissed(
        cdp,
        sessionId,
        client,
        siblingTarget.relationId,
      );
      if (sidebarTooltipVisible(siblingDismissed.tooltip)) {
        throw new Error(`${client} Sidebar sibling details remained open after pointer leave`);
      }
      timeline.push({ client, step: "sibling-dismissed", ...siblingDismissed });
    }
  }
  if (
    Math.abs(openedByClient.web.sideGap - openedByClient.lynx.sideGap) > 3 ||
    Math.abs(openedByClient.web.alignDelta - openedByClient.lynx.alignDelta) > 2
  ) {
    throw new Error(
      `Sidebar details Browser relations diverged: ${JSON.stringify(openedByClient)}`,
    );
  }

  const webTarget = await sidebarThreadCardTarget(cdp, sessionId, "web");
  if (!webTarget?.relationId) {
    throw new Error("Could not find Web Sidebar thread card for the paired hover frame");
  }
  await movePointer(cdp, sessionId, webTarget.point);
  const finalWeb = await waitForSidebarTooltip(cdp, sessionId, "web", webTarget.relationId, "");
  const lynxTarget = await sidebarThreadCardTarget(cdp, sessionId, "lynx");
  if (!lynxTarget?.relationId) {
    throw new Error("Could not find Lynx Sidebar thread card for the paired hover frame");
  }
  await invokeLynxTooltipProbe(cdp, sessionId, lynxTarget.relationId, "hover");
  const finalLynx = await waitForSidebarTooltip(cdp, sessionId, "lynx", lynxTarget.relationId, "");
  const final = {
    web: finalWeb,
    lynx: finalLynx,
  };
  if (!final.web || !final.lynx) {
    throw new Error(`Could not retain paired Sidebar thread details: ${JSON.stringify(final)}`);
  }
  timeline.push({ step: "paired-final", ...final });
  return { final, openedByClient, timeline };
}

async function dispatchMetaDigit(cdp, sessionId, digit) {
  const code = `Digit${digit}`;
  const keyCode = 48 + digit;
  return dispatchKeyToRemoteElement(
    cdp,
    sessionId,
    `document.getElementById('web-pane')?.contentWindow?.document
      ?.querySelector('[data-thread-id] [role="button"]') ?? null`,
    String(digit),
    code,
    keyCode,
    4,
  );
}

async function dispatchWebModifierState(cdp, sessionId, type, metaKey) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const target = document.getElementById('web-pane')?.contentWindow;
      if (!target) return false;
      target.dispatchEvent(new target.KeyboardEvent(${JSON.stringify(type)}, {
        key: 'Meta',
        code: 'MetaLeft',
        metaKey: ${JSON.stringify(metaKey)},
        bubbles: true,
      }));
      return true;
    })()`,
  );
}

async function runSidebarThreadShortcutFlow(cdp, sessionId) {
  let state = await readWorkbenchState(cdp, sessionId);
  const webThreadIds = (state?.web?.sidebarDiagnostics?.threads ?? [])
    .map(({ threadId }) => threadId)
    .filter(Boolean);
  const lynxThreadIds = (state?.lynx?.sidebarDiagnostics?.threads ?? [])
    .map(({ threadId }) => threadId)
    .filter(Boolean);
  if (webThreadIds.length < 2 || JSON.stringify(webThreadIds) !== JSON.stringify(lynxThreadIds)) {
    throw new Error(
      `Sidebar shortcut fixture requires two matching ordered threads: ${JSON.stringify({ webThreadIds, lynxThreadIds })}`,
    );
  }
  const initialThreadId = state?.web?.productState?.selectedThread;
  const initialIndex = webThreadIds.indexOf(initialThreadId);
  const targetIndex = initialIndex === 0 ? 1 : 0;
  const targetThreadId = webThreadIds[targetIndex];
  const timeline = [{ step: "initial", threadId: initialThreadId, orderedThreadIds: webThreadIds }];
  const allRowsHaveJumpLabels = (client) => {
    const rows = client?.sidebarDiagnostics?.threads ?? [];
    return (
      rows.length >= 2 &&
      rows.every((row) => typeof row.jumpLabel === "string" && row.jumpLabel.length > 0)
    );
  };
  const allRowsHideJumpLabels = (client) =>
    (client?.sidebarDiagnostics?.threads ?? []).every((row) => row.jumpLabel === null);

  const webModifierDown = await dispatchWebModifierState(cdp, sessionId, "keydown", true);
  if (!webModifierDown) throw new Error("Web modifier-down event was not dispatched");
  const lynxModifierDown = await evaluate(
    cdp,
    sessionId,
    `document.getElementById('lynx-pane')?.contentWindow
      ?.__T3_LYNX_WEB_PREVIEW__?.dispatchModifierState(
        'keydown',
        { meta: true, ctrl: false, shift: false, alt: false }
      ) ?? false`,
  );
  if (!lynxModifierDown) throw new Error("Lynx modifier-down event was not dispatched");
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => allRowsHaveJumpLabels(next?.web) && allRowsHaveJumpLabels(next?.lynx),
    3_000,
    "Sidebar thread jump hints visible",
  );
  timeline.push({
    step: "modifier-down",
    webLabels: state.web.sidebarDiagnostics.threads.map((row) => row.jumpLabel),
    lynxLabels: state.lynx.sidebarDiagnostics.threads.map((row) => row.jumpLabel),
  });
  const webModifierUp = await dispatchWebModifierState(cdp, sessionId, "keyup", false);
  if (!webModifierUp) throw new Error("Web modifier-up event was not dispatched");
  const lynxModifierUp = await evaluate(
    cdp,
    sessionId,
    `document.getElementById('lynx-pane')?.contentWindow
      ?.__T3_LYNX_WEB_PREVIEW__?.dispatchModifierState(
        'keyup',
        { meta: false, ctrl: false, shift: false, alt: false }
      ) ?? false`,
  );
  if (!lynxModifierUp) throw new Error("Lynx modifier-up event was not dispatched");
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => allRowsHideJumpLabels(next?.web) && allRowsHideJumpLabels(next?.lynx),
    3_000,
    "Sidebar thread jump hints hidden",
  );
  timeline.push({ step: "modifier-up" });

  const webJumpDispatched = await dispatchMetaDigit(cdp, sessionId, targetIndex + 1);
  if (!webJumpDispatched) throw new Error("Web thread jump key was not dispatched");
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => next?.web?.productState?.selectedThread === targetThreadId,
    3_000,
    "Web thread jump shortcut",
  );
  timeline.push({ step: "web-jump", threadId: targetThreadId });

  const lynxDispatched = await evaluate(
    cdp,
    sessionId,
    `document.getElementById('lynx-pane')?.contentWindow
      ?.__T3_LYNX_WEB_PREVIEW__?.dispatchKeyboardShortcut(${JSON.stringify(`thread-${targetIndex + 1}`)}) ?? false`,
  );
  if (!lynxDispatched) throw new Error("Lynx thread jump packet was not dispatched");
  state = await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => next?.lynx?.productState?.selectedThread === targetThreadId,
    3_000,
    "Lynx thread jump shortcut",
  );
  timeline.push({ step: "lynx-jump", threadId: targetThreadId });

  if (initialIndex >= 0) {
    const webRestoreDispatched = await dispatchMetaDigit(cdp, sessionId, initialIndex + 1);
    if (!webRestoreDispatched) throw new Error("Web thread restore key was not dispatched");
    await evaluate(
      cdp,
      sessionId,
      `document.getElementById('lynx-pane')?.contentWindow
        ?.__T3_LYNX_WEB_PREVIEW__?.dispatchKeyboardShortcut(${JSON.stringify(`thread-${initialIndex + 1}`)}) ?? false`,
    );
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) =>
        next?.web?.productState?.selectedThread === initialThreadId &&
        next?.lynx?.productState?.selectedThread === initialThreadId,
      3_000,
      "Thread jump shortcut restore",
    );
    timeline.push({ step: "restored", threadId: initialThreadId });
  }
  return { state, timeline };
}

async function runChatOutlineFlow(cdp, sessionId) {
  const evidence = {};
  for (const client of ["web", "lynx"]) {
    const read = () =>
      evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
          const doc = frame?.contentWindow?.document;
          const root = ${JSON.stringify(client)} === 'lynx'
            ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
            : doc;
          const items = [...(root?.querySelectorAll('[data-timeline-minimap-item]') ?? [])];
          const first = items[0];
          const frameRect = frame?.getBoundingClientRect();
          const points = items.map((item) => {
            const itemRect = item.getBoundingClientRect();
            return frameRect ? {
              x: frameRect.x + itemRect.x + Math.min(12, itemRect.width / 2),
              y: frameRect.y + itemRect.y + Math.max(1, itemRect.height / 2),
            } : null;
          });
          const rowIndexes = items.map((item) =>
            Number(item.getAttribute('data-timeline-minimap-row-index')),
          );
          const interactive = first;
          const row = root?.querySelector('[data-timeline-row-id="fidelity-outline-earlier-user"]');
          const rect = first?.getBoundingClientRect();
          const interactiveRect = interactive?.getBoundingClientRect();
          return {
            count: items.length,
            activeIndex: root?.querySelector('[data-timeline-minimap]')
              ?.getAttribute('data-timeline-minimap-active') ?? null,
            preview: root?.querySelector('[data-timeline-minimap-preview]')?.textContent?.trim() ?? null,
            rowY: row?.getBoundingClientRect().y ?? null,
            points,
            rowIndexes,
            point: frameRect && rect && interactiveRect ? {
              x: frameRect.x + interactiveRect.x + Math.min(12, interactiveRect.width / 2),
              y: frameRect.y + interactiveRect.y + Math.max(1, interactiveRect.height / 2),
            } : null,
          };
        })()`,
      );
    const initial = await read();
    if (initial?.count !== 2 || !initial.point) {
      throw new Error(`Missing ${client} chat outline items: ${JSON.stringify(initial)}`);
    }
    let positionedAtTail = initial;
    if (client === "web" && initial.rowY !== null && initial.rowY > 0) {
      const lastPoint = initial.points?.[initial.points.length - 1];
      if (!lastPoint) {
        throw new Error(`Missing ${client} chat outline tail item: ${JSON.stringify(initial)}`);
      }
      await dispatchPointerClickWithMove(cdp, sessionId, lastPoint);
      await delay(100);
      positionedAtTail = await read();
      if (positionedAtTail?.rowY === null || Math.abs(positionedAtTail.rowY - initial.rowY) < 24) {
        throw new Error(
          `${client} chat outline tail jump did not scroll: ${JSON.stringify({ initial, positionedAtTail })}`,
        );
      }
    }
    const firstPoint = positionedAtTail.point;
    if (!firstPoint) {
      throw new Error(`Missing ${client} chat outline first target after tail jump.`);
    }
    await movePointer(cdp, sessionId, { x: firstPoint.x + 96, y: firstPoint.y + 96 });
    await movePointer(cdp, sessionId, firstPoint);
    await delay(400);
    const hovered = await read();
    if (!hovered?.preview?.includes("Inspect the responsive chat outline")) {
      throw new Error(`${client} chat outline preview did not match: ${JSON.stringify(hovered)}`);
    }
    await dispatchPointerClickWithMove(cdp, sessionId, firstPoint);
    if (client === "lynx") {
      await delay(100);
      const selected = await read();
      evidence[client] = { initial, positionedAtTail, hovered, selected };
      continue;
    }
    const jumpDeadline = Date.now() + 3_000;
    let selected = await read();
    while (Date.now() < jumpDeadline && (selected?.rowY === null || selected.rowY < 52)) {
      await delay(50);
      selected = await read();
    }
    if (selected?.rowY === null || selected.rowY < 52) {
      throw new Error(
        `${client} chat outline jump did not bring the target row into view: ${JSON.stringify({ hovered, selected })}`,
      );
    }
    evidence[client] = { initial, positionedAtTail, hovered, selected };
  }
  return evidence;
}

async function waitForSidebarTooltip(cdp, sessionId, client, relationId, expectedText) {
  const deadline = Date.now() + 1_500;
  let tooltip = null;
  while (Date.now() < deadline) {
    tooltip = await readSidebarTooltip(cdp, sessionId, client, relationId);
    if (
      tooltip?.text.includes(expectedText) &&
      Number(tooltip.style.opacity) >= 0.99 &&
      tooltip.rect.width > 0 &&
      tooltip.rect.height > 0
    ) {
      return tooltip;
    }
    await delay(50);
  }
  return tooltip;
}

async function waitForSidebarV2Controls(cdp, sessionId) {
  return waitForWorkbenchState(
    cdp,
    sessionId,
    (state) =>
      state?.web?.productState?.sidebarVersion === "flat" &&
      state?.lynx?.productState?.sidebarVersion === "flat" &&
      state?.web?.sidebarDiagnostics?.chrome?.newThread?.rect?.width === 32 &&
      state?.lynx?.sidebarDiagnostics?.chrome?.newThread?.rect?.width === 32 &&
      state?.web?.sidebarDiagnostics?.chrome?.newProject?.rect?.width === 32 &&
      state?.lynx?.sidebarDiagnostics?.chrome?.newProject?.rect?.width === 32,
    5_000,
    "stable Sidebar V2 controls",
  );
}

async function runSidebarControlHoverFlow(cdp, sessionId, kind) {
  const selector = kind === "thread" ? ".sidebar-v2-new-thread" : ".sidebar-v2-new-project";
  const relationId =
    kind === "thread" ? "sidebar-new-thread-tooltip" : "sidebar-new-project-tooltip";
  const expectedText = kind === "thread" ? "New thread" : "New project";
  const timeline = [];

  for (const client of ["web", "lynx"]) {
    const pointer = await movePointerToSidebarControl(cdp, sessionId, client, selector);
    if (!pointer?.moved) {
      throw new Error(`Missing ${client} ${selector} trigger: ${JSON.stringify(pointer)}`);
    }
    const hover = await readSidebarControlHover(cdp, sessionId, client, selector);
    if (hover?.hovered !== true || hover.disabled === true) {
      throw new Error(
        `${client} ${selector} did not enter enabled hover: ${JSON.stringify(hover)}`,
      );
    }
    await delay(250);
    const beforeDelay = await readSidebarTooltip(cdp, sessionId, client, relationId);
    timeline.push({ client, step: "before-delay", hover, tooltip: beforeDelay });
    if (beforeDelay !== null) {
      throw new Error(`${client} ${relationId} opened before the 600ms authority delay`);
    }
    let popupInput = "pointer-hover";
    let opened = await waitForSidebarTooltip(cdp, sessionId, client, relationId, expectedText);
    if (!opened && client === "web") {
      const focused = await focusRemoteElement(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          return frame?.contentWindow?.document?.querySelector(${JSON.stringify(selector)}) ?? null;
        })()`,
      );
      if (!focused) throw new Error(`Could not focus Web ${selector}`);
      popupInput = "focus-fallback-after-pointer-hover";
      opened = await waitForSidebarTooltip(cdp, sessionId, client, relationId, expectedText);
    }
    timeline.push({ client, step: "opened", popupInput, tooltip: opened });
    if (!opened?.text.includes(expectedText)) {
      const trigger = await readSidebarControlHover(cdp, sessionId, client, selector);
      throw new Error(
        `${client} ${relationId} did not open with ${expectedText}: ${JSON.stringify(trigger)}`,
      );
    }
    if (popupInput !== "pointer-hover") {
      await evaluate(
        cdp,
        sessionId,
        `document.getElementById('web-pane')?.contentWindow?.document
          ?.querySelector(${JSON.stringify(selector)})?.blur()`,
      ).catch(() => undefined);
    }
    const triggerPoint = pointer.point;
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseMoved",
        x: Math.max(1, triggerPoint.x - 150),
        y: triggerPoint.y + 100,
        button: "none",
        pointerType: "mouse",
      },
      sessionId,
    );
    const dismissal = await waitForSidebarTooltipDismissed(cdp, sessionId, client, relationId);
    timeline.push({ client, step: "dismissed", ...dismissal });
    if (sidebarTooltipVisible(dismissal.tooltip)) {
      throw new Error(
        `${client} ${relationId} remained open after pointer leave: ${JSON.stringify(dismissal)}`,
      );
    }
  }

  const finalWebPointer = await movePointerToSidebarControl(cdp, sessionId, "web", selector);
  if (!finalWebPointer?.moved) {
    throw new Error(`Could not hover Web ${selector} for the paired hover frame`);
  }
  const finalWeb = await waitForSidebarTooltip(cdp, sessionId, "web", relationId, expectedText);
  await invokeLynxTooltipProbe(cdp, sessionId, relationId, "hover");
  const finalLynx = await waitForSidebarTooltip(cdp, sessionId, "lynx", relationId, expectedText);
  const final = {
    web: finalWeb,
    lynx: finalLynx,
  };
  if (!final.web?.text.includes(expectedText) || !final.lynx?.text.includes(expectedText)) {
    throw new Error(`Could not retain paired ${relationId} hover frame: ${JSON.stringify(final)}`);
  }
  timeline.push({ step: "paired-final", ...final });
  return { timeline, final };
}

async function clickLynxPaletteBackdrop(cdp, sessionId) {
  const point = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById('lynx-pane');
      const root = frame?.contentWindow?.document
        ?.getElementById('t3-lynx-preview')?.shadowRoot;
      const target = root?.querySelector('.palette-backdrop');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        x: frameRect.x + Math.max(1, rect.x + 8),
        y: frameRect.y + Math.max(1, rect.y + 8),
      };
    })()`,
  );
  if (!point) return false;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return true;
}

async function runCommandPaletteNavigationFlow(cdp, sessionId) {
  const timeline = [];
  const active = (state, client) => state?.[client]?.overlayMetrics?.activeRowLabels?.[0] ?? "";
  const view = (state, client) => state?.[client]?.overlayMetrics?.paletteView ?? null;
  const overlay = (state, client) => state?.[client]?.productState?.overlay ?? null;

  let state = await readWorkbenchState(cdp, sessionId);
  if (view(state, "web") !== "root" || view(state, "lynx") !== "root") {
    await waitForSidebarV2Controls(cdp, sessionId);
    const webFocusPoint = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const frame = document.getElementById('web-pane');
        const target =
          frame?.contentWindow?.document?.querySelector('[data-chat-header]') ??
          frame?.contentWindow?.document?.querySelector('.composer-frame');
        if (!frame || !target) return null;
        const frameRect = frame.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        return {
          x: frameRect.x + rect.x + rect.width / 2,
          y: frameRect.y + rect.y + rect.height / 2,
        };
      })()`,
    );
    if (!webFocusPoint) throw new Error("Could not focus Web before opening Quick Switch.");
    await dispatchPointerClickWithMove(cdp, sessionId, webFocusPoint);
    await cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "rawKeyDown",
        modifiers: 4,
        key: "k",
        code: "KeyK",
        windowsVirtualKeyCode: 75,
      },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "keyUp",
        modifiers: 4,
        key: "k",
        code: "KeyK",
        windowsVirtualKeyCode: 75,
      },
      sessionId,
    );
    await evaluate(
      cdp,
      sessionId,
      `document.getElementById('lynx-pane')?.contentWindow
        ?.__T3_LYNX_WEB_PREVIEW__?.dispatchKeyboardShortcut('command') ?? false`,
    );
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => view(next, "web") === "root" && view(next, "lynx") === "root",
      3_000,
      "command palette root",
    );
    timeline.push({
      step: "open-root",
      webView: view(state, "web"),
      lynxView: view(state, "lynx"),
    });
  }

  await hoverPaletteRow(cdp, sessionId, "web", "Add project");
  state = await waitForWorkbenchState(cdp, sessionId, (next) =>
    active(next, "web").includes("Add project"),
  );
  timeline.push({ step: "hover-web", active: active(state, "web") });

  await hoverPaletteRow(cdp, sessionId, "lynx", "Add project");
  await setLynxPaletteActiveForHarness(cdp, sessionId, "Add project");
  state = await waitForWorkbenchState(cdp, sessionId, (next) =>
    active(next, "lynx").includes("Add project"),
  );
  await delay(100);
  const lynxHoverVisual = await paletteRowHoverVisual(cdp, sessionId, "lynx", "Add project");
  if (lynxHoverVisual?.hovered !== true) {
    throw new Error(
      `Lynx-for-Web Add project row did not enter :hover: ${JSON.stringify(lynxHoverVisual)}`,
    );
  }
  timeline.push({
    step: "hover-lynx",
    active: active(state, "lynx"),
    visual: lynxHoverVisual,
    stateBridge: "browser-preview-active-row-probe",
  });

  await dispatchPaletteKey(cdp, sessionId, "web", "ArrowDown", "ArrowDown", 40);
  state = await waitForWorkbenchState(cdp, sessionId, (next) =>
    active(next, "web").includes("Open settings"),
  );
  timeline.push({
    step: "web-arrow-down",
    webActive: active(state, "web"),
  });

  await dispatchPaletteKey(cdp, sessionId, "web", "ArrowUp", "ArrowUp", 38);
  state = await waitForWorkbenchState(cdp, sessionId, (next) =>
    active(next, "web").includes("Add project"),
  );
  timeline.push({
    step: "web-arrow-up",
    webActive: active(state, "web"),
  });

  await dispatchPaletteKey(cdp, sessionId, "web", "Enter", "Enter", 13);
  state = await waitForWorkbenchState(cdp, sessionId, (next) => view(next, "web") === "submenu");
  timeline.push({ step: "web-enter", webView: view(state, "web") });

  await dispatchPaletteKey(cdp, sessionId, "web", "Backspace", "Backspace", 8);
  state = await waitForWorkbenchState(cdp, sessionId, (next) => view(next, "web") === "root");
  timeline.push({
    step: "web-backspace",
    webView: view(state, "web"),
  });

  await dispatchPaletteKey(cdp, sessionId, "web", "Escape", "Escape", 27);
  state = await waitForWorkbenchState(cdp, sessionId, (next) => overlay(next, "web") === null);
  timeline.push({ step: "web-escape", webOverlay: null });

  await clickLynxPaletteBackdrop(cdp, sessionId);
  state = await waitForWorkbenchState(cdp, sessionId, (next) => overlay(next, "lynx") === null);
  timeline.push({ step: "lynx-pointer-dismiss", lynxOverlay: null });

  await evaluate(
    cdp,
    sessionId,
    `document.getElementById('lynx-pane')?.contentWindow
      ?.__T3_LYNX_WEB_PREVIEW__?.dispatchKeyboardShortcut('command') ?? false`,
  );
  await waitForWorkbenchState(cdp, sessionId, (next) => view(next, "lynx") === "root");
  const webFocusPoint = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById('web-pane');
      const target =
        frame?.contentWindow?.document?.querySelector('[data-chat-header]') ??
        frame?.contentWindow?.document?.querySelector('.composer-frame');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
      };
    })()`,
  );
  if (!webFocusPoint) throw new Error("Could not focus Web before reopening Quick Switch.");
  await dispatchPointerClickWithMove(cdp, sessionId, webFocusPoint);
  await cdp.send(
    "Input.dispatchKeyEvent",
    {
      type: "rawKeyDown",
      modifiers: 4,
      key: "k",
      code: "KeyK",
      windowsVirtualKeyCode: 75,
    },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      modifiers: 4,
      key: "k",
      code: "KeyK",
      windowsVirtualKeyCode: 75,
    },
    sessionId,
  );
  await waitForWorkbenchState(
    cdp,
    sessionId,
    (next) => view(next, "web") === "root" && view(next, "lynx") === "root",
  );
  await hoverPaletteRow(cdp, sessionId, "web", "Add project");
  await waitForWorkbenchState(cdp, sessionId, (next) =>
    active(next, "web").includes("Add project"),
  );
  await hoverPaletteRow(cdp, sessionId, "lynx", "Add project");
  await setLynxPaletteActiveForHarness(cdp, sessionId, "Add project");
  state = await waitForWorkbenchState(cdp, sessionId, (next) =>
    active(next, "lynx").includes("Add project"),
  );
  await delay(100);
  const finalLynxHoverVisual = await paletteRowHoverVisual(cdp, sessionId, "lynx", "Add project");
  if (finalLynxHoverVisual?.hovered !== true) {
    throw new Error(
      `Lynx-for-Web final Add project hover was not visible: ${JSON.stringify(finalLynxHoverVisual)}`,
    );
  }
  state = await readWorkbenchState(cdp, sessionId);
  timeline.push({
    step: "final-hover",
    webActive: active(state, "web"),
    lynxActive: active(state, "lynx"),
    lynxVisual: finalLynxHoverVisual,
  });
  if (active(state, "web") !== active(state, "lynx")) {
    throw new Error(
      `Command Palette final active rows diverged: ${JSON.stringify({
        web: active(state, "web"),
        lynx: active(state, "lynx"),
      })}`,
    );
  }
  return { state, timeline };
}

function cdpKeySequenceForCharacter(character) {
  if (character === " ") {
    return {
      keyDown: {
        type: "keyDown",
        key: " ",
        code: "Space",
        modifiers: 0,
        windowsVirtualKeyCode: 32,
        location: 0,
        isKeypad: false,
        text: " ",
        unmodifiedText: " ",
      },
      keyUp: {
        type: "keyUp",
        key: " ",
        code: "Space",
        modifiers: 0,
        windowsVirtualKeyCode: 32,
        location: 0,
        isKeypad: false,
      },
    };
  }
  if (/^[A-Za-z]$/.test(character)) {
    const upper = character.toUpperCase();
    const virtualKeyCode = upper.charCodeAt(0);
    return {
      keyDown: {
        type: "keyDown",
        key: character,
        code: `Key${upper}`,
        modifiers: 0,
        windowsVirtualKeyCode: virtualKeyCode,
        location: 0,
        isKeypad: false,
        text: character,
        unmodifiedText: character,
      },
      keyUp: {
        type: "keyUp",
        key: character,
        code: `Key${upper}`,
        modifiers: 0,
        windowsVirtualKeyCode: virtualKeyCode,
        location: 0,
        isKeypad: false,
      },
    };
  }
  const keyDefinition =
    character === "_"
      ? { code: "Minus", virtualKeyCode: 189 }
      : /^[0-9]$/.test(character)
        ? { code: `Digit${character}`, virtualKeyCode: character.charCodeAt(0) }
        : { code: "", virtualKeyCode: character.charCodeAt(0) };
  return {
    keyDown: {
      type: "keyDown",
      key: character,
      code: keyDefinition.code,
      modifiers: 0,
      windowsVirtualKeyCode: keyDefinition.virtualKeyCode,
      location: 0,
      isKeypad: false,
      text: character,
      unmodifiedText: character,
    },
    keyUp: {
      type: "keyUp",
      key: character,
      code: keyDefinition.code,
      modifiers: 0,
      windowsVirtualKeyCode: keyDefinition.virtualKeyCode,
      location: 0,
      isKeypad: false,
    },
  };
}

function pngDimensions(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    encoding: "utf8",
  });
  if (result.error?.code === "ENOENT") return { ok: false, reason: "ffmpeg not installed" };
  if (result.error) return { ok: false, reason: String(result.error) };
  if (result.status !== 0) return { ok: false, reason: result.stderr || `status ${result.status}` };
  return { ok: true };
}

async function capturePanePair({ cdp, sessionId, layout, cellDir, prefix }) {
  const clip = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    scale: 1,
  });
  const webShot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", clip: clip(layout.webPane), captureBeyondViewport: true },
    sessionId,
  );
  const lynxShot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", clip: clip(layout.lynxPane), captureBeyondViewport: true },
    sessionId,
  );
  const webPng = Buffer.from(webShot.data, "base64");
  const lynxPng = Buffer.from(lynxShot.data, "base64");
  const webPath = path.join(cellDir, `${prefix}-web.png`);
  const lynxPath = path.join(cellDir, `${prefix}-lynx.png`);
  await Promise.all([writeFile(webPath, webPng), writeFile(lynxPath, lynxPng)]);
  const result = {
    web: {
      path: path.relative(repoRoot, webPath),
      bytes: webPng.byteLength,
      sha256: createHash("sha256").update(webPng).digest("hex"),
      dimensions: pngDimensions(webPng),
    },
    lynx: {
      path: path.relative(repoRoot, lynxPath),
      bytes: lynxPng.byteLength,
      sha256: createHash("sha256").update(lynxPng).digest("hex"),
      dimensions: pngDimensions(lynxPng),
    },
  };
  if (
    !paneImagesOnly &&
    result.web.dimensions.width === result.lynx.dimensions.width &&
    result.web.dimensions.height === result.lynx.dimensions.height
  ) {
    const sideBySidePath = path.join(cellDir, `${prefix}-side-by-side.png`);
    const sideBySide = runFfmpeg([
      "-i",
      webPath,
      "-i",
      lynxPath,
      "-filter_complex",
      "hstack=inputs=2",
      sideBySidePath,
    ]);
    result.sideBySide = sideBySide.ok
      ? path.relative(repoRoot, sideBySidePath)
      : { error: sideBySide.reason };
  }
  return result;
}

async function runFileEditingSaveFlow({
  cdp,
  sessionId,
  cellDir,
  fixturePreparation,
  expectedThreadId,
}) {
  if (fixturePreparation?.kind !== "file-editing-disposable-workspace") {
    throw new Error("File editing save flow requires a disposable workspace fixture.");
  }
  const readState = () =>
    evaluate(
      cdp,
      sessionId,
      `(() => { const w = window.__T3_WORKBENCH__; return w ? w.read() : null; })()`,
    ).catch(() => null);
  const waitForState = async (predicate, label, timeout = 8_000) => {
    const deadline = Date.now() + timeout;
    let latest = null;
    while (Date.now() < deadline) {
      latest = await readState();
      if (predicate(latest)) return latest;
      await delay(50);
    }
    throw new Error(
      `Timed out waiting for ${label}: ${JSON.stringify({
        web: latest?.web?.fileEditorMetrics ?? null,
        lynx: latest?.lynx?.fileEditorMetrics ?? null,
      })}`,
    );
  };
  const waitForRemoteElement = async (expression, label, timeout = 8_000) => {
    const deadline = Date.now() + timeout;
    let latest = null;
    while (Date.now() < deadline) {
      const present = await evaluate(cdp, sessionId, `Boolean(${expression})`).catch(() => false);
      if (present) return;
      latest = await readState();
      await delay(50);
    }
    throw new Error(
      `Timed out waiting for ${label}: ${JSON.stringify({
        web: latest?.web?.fileEditorMetrics ?? null,
        lynx: latest?.lynx?.fileEditorMetrics ?? null,
      })}`,
    );
  };
  const webEditorExpression = `(() => {
    const root = document.getElementById('web-pane')?.contentWindow?.document;
    const surface = root?.querySelector('.file-preview-virtualizer');
    const candidates = [];
    const visit = (node) => {
      for (const child of node?.children ?? []) {
        candidates.push(child);
        visit(child);
        if (child.shadowRoot) visit(child.shadowRoot);
      }
    };
    visit(surface);
    return candidates.find((element) =>
      element.matches?.('[contenteditable="true"], [contenteditable="plaintext-only"]')
    ) ?? null;
  })()`;
  const lynxTextareaExpression = `(() => {
    const root = document.getElementById('lynx-pane')?.contentWindow?.document
      ?.getElementById('t3-lynx-preview')?.shadowRoot;
    const host = root?.querySelector('.files-panel__editor');
    return host?.shadowRoot?.querySelector('textarea') ?? host ?? null;
  })()`;
  const restoreFileEditorTarget = async () => {
    const deadline = Date.now() + 12_000;
    let latest = null;
    while (Date.now() < deadline) {
      latest = await readState();
      if (
        latest?.web?.productState?.selectedThread === expectedThreadId &&
        latest?.lynx?.productState?.selectedThread === expectedThreadId &&
        latest?.web?.fileEditorMetrics?.currentFile === filePath.split("/").at(-1) &&
        latest?.lynx?.fileEditorMetrics?.currentFile === filePath.split("/").at(-1)
      ) {
        return latest;
      }
      const targets = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const targetName = ${JSON.stringify(filePath.split("/").at(-1))};
          const targetPath = ${JSON.stringify(filePath)};
          const expectedThreadId = ${JSON.stringify(expectedThreadId)};
          const pointFor = (frameId, shadow, currentThread, currentFile) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            if (!frame || !root) return null;
            if (currentThread !== expectedThreadId) {
              const target =
                root.querySelector(
                  '[data-thread-id="' + CSS.escape(expectedThreadId) + '"] [role="button"]'
                ) ??
                root.querySelector(
                  '[data-thread-id="' + CSS.escape(expectedThreadId) + '"]'
                );
              if (!target) return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return null;
              return {
                action: 'select-thread',
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            }
            if (currentFile === targetName) return null;
            const surface = root.querySelector('[data-file-browser-panel], .files-panel');
            let target = null;
            let action = null;
            if (surface) {
              target = surface.querySelector?.(
                '[data-item-path="' + CSS.escape(targetPath) + '"]'
              );
              if (!target) {
                const candidates = [];
                const visit = (node) => {
                  for (const child of node?.children ?? []) {
                    candidates.push(child);
                    visit(child);
                    if (child.shadowRoot) visit(child.shadowRoot);
                  }
                };
                visit(surface);
                target = candidates.find((item) => {
                  const label = item.getAttribute?.('aria-label') ?? '';
                  const text = item.textContent?.trim().replace(/\\s+/g, ' ') ?? '';
                  return (
                    item.matches?.("button[data-type='item'], .file-tree-row--file") &&
                    (label === targetName ||
                      label.endsWith('/' + targetName) ||
                      text === targetName)
                  );
                }) ?? null;
              }
              action = 'open-file';
            } else {
              const panel = root.querySelector(
                '[data-right-panel-open="true"], [data-preview-panel-mode]'
              );
              target = panel
                ? root.querySelector('[data-right-panel-action="files"]')
                : root.querySelector('[aria-label="Toggle right panel"]');
              action = panel ? 'open-files' : 'open-panel';
            }
            if (!target || target.getAttribute?.('aria-disabled') === 'true') return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = target.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;
            return {
              action,
              x: frameRect.x + rect.x + rect.width / 2,
              y: frameRect.y + rect.y + rect.height / 2,
            };
          };
          return {
            web: pointFor(
              'web-pane',
              false,
              ${JSON.stringify(latest?.web?.productState?.selectedThread ?? null)},
              ${JSON.stringify(latest?.web?.fileEditorMetrics?.currentFile ?? null)}
            ),
            lynx: pointFor(
              'lynx-pane',
              true,
              ${JSON.stringify(latest?.lynx?.productState?.selectedThread ?? null)},
              ${JSON.stringify(latest?.lynx?.fileEditorMetrics?.currentFile ?? null)}
            ),
          };
        })()`,
      ).catch(() => null);
      let inputSent = false;
      if (targets?.web) {
        await dispatchPointerClickWithMove(cdp, sessionId, targets.web);
        inputSent = true;
      }
      if (targets?.lynx) {
        await dispatchPointerClickWithMove(cdp, sessionId, targets.lynx);
        inputSent = true;
      }
      await delay(inputSent ? 150 : 50);
    }
    throw new Error(
      `Timed out restoring the dual file editor target: ${JSON.stringify({
        web: latest?.web?.fileEditorMetrics ?? null,
        lynx: latest?.lynx?.fileEditorMetrics ?? null,
      })}`,
    );
  };

  await restoreFileEditorTarget();
  if (fileEditClient === "web") {
    await waitForRemoteElement(webEditorExpression, "Web file editor DOM");
    const inputTraceInstalled = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const editor = ${webEditorExpression};
        if (!editor) return false;
        const frameWindow = editor.ownerDocument?.defaultView;
        if (!frameWindow) return false;
        const trace = [];
        frameWindow.__T3_FILE_EDITOR_INPUT_TRACE__ = trace;
        const selectionSnapshot = () => {
          const root = editor.getRootNode();
          const selection = root.getSelection?.() ?? frameWindow.getSelection?.();
          const anchor =
            selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
              ? selection.anchorNode
              : selection?.anchorNode?.parentElement;
          return {
            active:
              root.activeElement === editor ||
              editor.ownerDocument.activeElement === editor,
            anchorLine:
              anchor?.closest?.('[data-line]')?.getAttribute('data-line') ?? null,
            anchorInside: Boolean(selection?.anchorNode && editor.contains(selection.anchorNode)),
            collapsed: selection?.isCollapsed ?? null,
          };
        };
        const record = (type, phase, event) => {
          const inputType =
            'inputType' in event && typeof event.inputType === 'string'
              ? event.inputType
              : null;
          const data =
            'data' in event && typeof event.data === 'string'
              ? event.data
              : null;
          const key =
            'key' in event && typeof event.key === 'string'
              ? event.key
              : null;
          const code =
            'code' in event && typeof event.code === 'string'
              ? event.code
              : null;
          trace.push({
            type,
            phase,
            data,
            inputType,
            key,
            code,
            defaultPrevented: event.defaultPrevented,
            isTrusted: event.isTrusted,
            targetInside: event.composedPath().some((node) => node === editor),
            selection: selectionSnapshot(),
          });
        };
        for (const type of ['pointerdown', 'pointerup', 'focus', 'keydown', 'beforeinput', 'input', 'keyup']) {
          editor.addEventListener(
            type,
            (event) => record(type, 'capture', event),
            true,
          );
          if (type === 'beforeinput') {
            editor.addEventListener(type, (event) => record(type, 'bubble', event));
          }
        }
        return true;
      })()`,
    );
    if (!inputTraceInstalled) throw new Error("Could not install the Web editor input trace.");
    await cdp.send("Page.bringToFront", {}, sessionId);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
    const webEditorPoint = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const frame = document.getElementById('web-pane');
        const editor = ${webEditorExpression};
        const visibleLines = [...(editor?.querySelectorAll('[data-line]') ?? [])].filter((line) => {
          const rect = line.getBoundingClientRect();
          return rect.height > 0 && rect.bottom > 84 && rect.top < 820;
        });
        const targetLine =
          visibleLines.find((line) => line.textContent?.trim()) ??
          visibleLines[0] ??
          editor;
        const visibleTokens = [...(targetLine?.querySelectorAll('span') ?? [])].filter((token) => {
          const rect = token.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const target = visibleTokens.at(-1) ?? targetLine;
        if (!frame || !target) return null;
        const frameRect = frame.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        return {
          x: frameRect.x + rect.x + Math.max(1, rect.width - 1),
          y: frameRect.y + rect.y + rect.height / 2,
        };
      })()`,
    );
    if (!webEditorPoint) throw new Error("Could not locate the Web file editor.");
    try {
      await dispatchPointerClickWithMove(cdp, sessionId, webEditorPoint);
      const webCaretReady = await evaluate(
        cdp,
        sessionId,
        `new Promise((resolve) => {
          const editor = ${webEditorExpression};
          const frameWindow = editor?.ownerDocument?.defaultView;
          frameWindow?.requestAnimationFrame?.(() => {
            frameWindow.requestAnimationFrame(() => {
              const root = editor.getRootNode();
              const selection = root.getSelection?.() ?? frameWindow.getSelection?.();
              const anchor =
                selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
                  ? selection.anchorNode
                  : selection?.anchorNode?.parentElement;
              resolve(Boolean(
                editor &&
                (root.activeElement === editor || editor.ownerDocument.activeElement === editor) &&
                selection?.anchorNode &&
                editor.contains(selection.anchorNode) &&
                anchor?.closest?.('[data-line]')
              ));
            });
          });
        })`,
      );
      if (!webCaretReady) {
        const pointerDiagnostics = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const editor = ${webEditorExpression};
            const frameWindow = editor?.ownerDocument?.defaultView;
            const trace = frameWindow?.__T3_FILE_EDITOR_INPUT_TRACE__ ?? [];
            const frame = document.getElementById('web-pane');
            const frameRect = frame?.getBoundingClientRect();
            const localX = ${JSON.stringify(webEditorPoint.x)} - (frameRect?.x ?? 0);
            const localY = ${JSON.stringify(webEditorPoint.y)} - (frameRect?.y ?? 0);
            const hit = editor?.ownerDocument?.elementFromPoint(localX, localY);
            return {
              point: ${JSON.stringify(webEditorPoint)},
              hit: hit
                ? {
                    tagName: hit.tagName,
                    className: hit.getAttribute('class') ?? '',
                    text: hit.textContent?.slice(0, 80) ?? '',
                    insideEditor: editor.contains(hit),
                  }
                : null,
              trace,
            };
          })()`,
        );
        throw new Error(
          `Pointer input did not place a Pierre editor caret: ${JSON.stringify(
            pointerDiagnostics,
          )}`,
        );
      }
      for (const character of fileEditSuffix) {
        const sequence = cdpKeySequenceForCharacter(character);
        await cdp.send("Input.dispatchKeyEvent", sequence.keyDown, sessionId);
        await cdp.send("Input.dispatchKeyEvent", sequence.keyUp, sessionId);
      }
    } finally {
      await cdp
        .send("Emulation.setFocusEmulationEnabled", { enabled: false }, sessionId)
        .catch(() => undefined);
    }
  }

  if (fileEditClient === "lynx") {
    const lynxPreviewPoint = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const frame = document.getElementById('lynx-pane');
        const root = frame?.contentWindow?.document
          ?.getElementById('t3-lynx-preview')?.shadowRoot;
        const preview = root?.querySelector('.file-editor-preview');
        if (!frame || !preview) return null;
        const frameRect = frame.getBoundingClientRect();
        const rect = preview.getBoundingClientRect();
        return {
          x: frameRect.x + rect.x + Math.min(80, rect.width / 2),
          y: frameRect.y + rect.y + Math.min(80, rect.height / 2),
        };
      })()`,
    );
    if (!lynxPreviewPoint) throw new Error("Could not locate the Lynx file preview.");
    await dispatchPointerClickWithMove(cdp, sessionId, lynxPreviewPoint);
    await waitForState(
      (candidate) => candidate?.lynx?.fileEditorMetrics?.editorMode === "editing",
      "Lynx textarea editing mode",
    );
    const lynxFocused = await focusRemoteElement(cdp, sessionId, lynxTextareaExpression);
    if (!lynxFocused) throw new Error("Could not focus the Lynx file editor.");
    const lynxCaretPlaced = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const editor = ${lynxTextareaExpression};
        if (!editor || typeof editor.value !== 'string') return false;
        editor.setSelectionRange?.(editor.value.length, editor.value.length);
        return true;
      })()`,
    );
    if (!lynxCaretPlaced) throw new Error("Could not place the Lynx file editor caret.");
    await cdp.send("Input.insertText", { text: fileEditSuffix }, sessionId);
  }
  const webInputTrace =
    fileEditClient === "web"
      ? await evaluate(
          cdp,
          sessionId,
          `new Promise((resolve) => {
            const editor = ${webEditorExpression};
            const frameWindow = editor?.ownerDocument?.defaultView;
            frameWindow?.requestAnimationFrame?.(() => {
              frameWindow.requestAnimationFrame(() => {
                const trace = frameWindow.__T3_FILE_EDITOR_INPUT_TRACE__ ?? [];
                resolve({
                  events: trace,
                  trustedBeforeInput: trace.filter(
                    (event) =>
                      event.type === 'beforeinput' &&
                      event.isTrusted === true &&
                      event.inputType === 'insertText'
                  ),
                });
              });
            });
          })`,
        )
      : null;
  if (
    fileEditClient === "web" &&
    (webInputTrace?.trustedBeforeInput?.length ?? 0) < fileEditSuffix.length
  ) {
    throw new Error(
      `Web file edit did not produce trusted beforeinput for every character: ${JSON.stringify(
        webInputTrace,
      )}`,
    );
  }
  const pendingState = await waitForState(
    (candidate) =>
      candidate?.[fileEditClient]?.fileEditorMetrics?.editorValueIncludesFidelitySentinel === true,
    `${fileEditClient} file editor changed contents`,
  );
  const preConfirmationContents = await readFile(fixturePreparation.disposableFile, "utf8");
  if (preConfirmationContents.includes("T3_FILE_SAVE_FIDELITY_SENTINEL")) {
    throw new Error("File write confirmed before the pending evidence frame.");
  }
  await rename(fixturePreparation.disposableWorkspace, fixturePreparation.failedWriteWorkspace);
  await writeFile(fixturePreparation.disposableWorkspace, "T3 file save failure blocker\n");
  fixturePreparation.writeFailureActive = true;
  let pendingEvidenceState = pendingState;
  const pendingDeadline = Date.now() + 3_000;
  while (Date.now() < pendingDeadline) {
    const candidate = await readState();
    if (!candidate) {
      await delay(50);
      continue;
    }
    pendingEvidenceState = candidate;
    const visible =
      fileEditClient === "web"
        ? candidate.web?.fileEditorMetrics?.pending === true
        : candidate.lynx?.fileEditorMetrics?.statusbarText?.includes("Unsaved changes") === true;
    if (visible) break;
    await delay(50);
  }
  const pendingVisible =
    fileEditClient === "web"
      ? pendingEvidenceState.web.fileEditorMetrics.pending === true
      : pendingEvidenceState.lynx.fileEditorMetrics.statusbarText.includes("Unsaved changes");
  const pendingContentRevision =
    pendingEvidenceState?.[fileEditClient]?.fileEditorMetrics?.contentRevision ?? null;
  if (!pendingContentRevision) {
    throw new Error(`${fileEditClient} pending file state did not expose a content revision.`);
  }
  const layout = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const web = document.getElementById('web-pane').getBoundingClientRect();
      const lynx = document.getElementById('lynx-pane').getBoundingClientRect();
      return {
        webPane: { x: web.x, y: web.y, width: web.width, height: web.height },
        lynxPane: { x: lynx.x, y: lynx.y, width: lynx.width, height: lynx.height },
      };
    })()`,
  );
  const pendingScreenshot = await capturePanePair({
    cdp,
    sessionId,
    layout,
    cellDir,
    prefix: "file-save-pending",
  });
  let failureEvidenceState = null;
  let failureScreenshot = null;
  let retryPoint = null;
  let recoveredState = null;
  let persistedContents = "";
  try {
    failureEvidenceState = await waitForState(
      (candidate) => {
        const metrics = candidate?.[fileEditClient]?.fileEditorMetrics;
        return Boolean(
          metrics?.saveError &&
          metrics?.saveErrorLabel?.rect?.width > 0 &&
          metrics?.saveErrorLabelText &&
          metrics?.saveRetry &&
          metrics?.saveRetryText === "Retry save",
        );
      },
      `${fileEditClient} inline file save failure`,
      12_000,
    );
    failureScreenshot = await capturePanePair({
      cdp,
      sessionId,
      layout,
      cellDir,
      prefix: "file-save-failure",
    });
    await rm(fixturePreparation.disposableWorkspace, { force: true });
    await rename(fixturePreparation.failedWriteWorkspace, fixturePreparation.disposableWorkspace);
    fixturePreparation.writeFailureActive = false;
    retryPoint = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const frameId = ${JSON.stringify(`${fileEditClient}-pane`)};
        const frame = document.getElementById(frameId);
        const doc = frame?.contentWindow?.document;
        const root =
          ${JSON.stringify(fileEditClient)} === 'lynx'
            ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
            : doc;
        const retry = root?.querySelector(
          '[data-file-save-retry]:not([data-file-save-retry="false"])'
        );
        if (!frame || !retry) return null;
        const frameRect = frame.getBoundingClientRect();
        const rect = retry.getBoundingClientRect();
        return {
          x: frameRect.x + rect.x + rect.width / 2,
          y: frameRect.y + rect.y + rect.height / 2,
        };
      })()`,
    );
    if (!retryPoint) {
      throw new Error(`Could not locate ${fileEditClient} file save retry control.`);
    }
    await dispatchPointerClickWithMove(cdp, sessionId, retryPoint);
    recoveredState = await waitForState(
      (candidate) => {
        const metrics = candidate?.[fileEditClient]?.fileEditorMetrics;
        return (
          metrics?.saveError === null &&
          metrics?.saveRetry === null &&
          (fileEditClient === "web" ? metrics?.pending === false : metrics?.statusbar === null)
        );
      },
      `${fileEditClient} file save recovery`,
      12_000,
    );
    const persistenceDeadline = Date.now() + 8_000;
    while (Date.now() < persistenceDeadline) {
      persistedContents = await readFile(fixturePreparation.disposableFile, "utf8");
      if (persistedContents.includes("T3_FILE_SAVE_FIDELITY_SENTINEL")) break;
      await delay(50);
    }
    if (!persistedContents.includes("T3_FILE_SAVE_FIDELITY_SENTINEL")) {
      throw new Error("Retried contents did not persist in the disposable workspace.");
    }
  } finally {
    if (fixturePreparation.writeFailureActive) {
      await rm(fixturePreparation.disposableWorkspace, { recursive: true, force: true });
      await rename(
        fixturePreparation.failedWriteWorkspace,
        fixturePreparation.disposableWorkspace,
      ).catch((error) => {
        if (!existsSync(fixturePreparation.disposableWorkspace)) throw error;
      });
      fixturePreparation.writeFailureActive = false;
    }
  }

  const backPoints = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const pointFor = (frameId, shadow) => {
        const frame = document.getElementById(frameId);
        const doc = frame?.contentWindow?.document;
        const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
        const back = root?.querySelector('[aria-label="Back to workspace files"]');
        if (!frame || !back) return null;
        const frameRect = frame.getBoundingClientRect();
        const rect = back.getBoundingClientRect();
        return {
          x: frameRect.x + rect.x + rect.width / 2,
          y: frameRect.y + rect.y + rect.height / 2,
        };
      };
      return {
        web: pointFor('web-pane', false),
        lynx: pointFor('lynx-pane', true),
      };
    })()`,
  );
  if (!backPoints?.web || !backPoints?.lynx) {
    throw new Error(`Could not locate both file Back controls: ${JSON.stringify(backPoints)}`);
  }
  await dispatchPointerClickWithMove(cdp, sessionId, backPoints.web);
  await dispatchPointerClickWithMove(cdp, sessionId, backPoints.lynx);
  await waitForState(
    (candidate) =>
      candidate?.web?.filesBrowserMetrics?.present === true &&
      candidate?.web?.fileEditorMetrics?.present === false &&
      candidate?.lynx?.reviewMetrics?.activeKind === "files" &&
      candidate?.lynx?.filesBrowserMetrics?.present === true &&
      candidate?.lynx?.fileEditorMetrics?.present === false,
    "dual Files return after retry confirmation",
  );
  const reopenPoints = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const pointFor = (frameId, shadow) => {
        const frame = document.getElementById(frameId);
        const doc = frame?.contentWindow?.document;
        const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
        const surface = root?.querySelector('[data-file-browser-panel], .files-panel');
        const candidates = [];
        const visit = (node) => {
          for (const child of node?.children ?? []) {
            candidates.push(child);
            visit(child);
            if (child.shadowRoot) visit(child.shadowRoot);
          }
        };
        visit(surface);
        const target = candidates.find((item) =>
          item.getAttribute?.('data-item-path') === ${JSON.stringify(filePath)} ||
          item.getAttribute?.('aria-label') === ${JSON.stringify(filePath.split("/").at(-1))} ||
          item.textContent?.trim() === ${JSON.stringify(filePath.split("/").at(-1))}
        );
        if (!frame || !target) return null;
        target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        const frameRect = frame.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        return {
          x: frameRect.x + rect.x + rect.width / 2,
          y: frameRect.y + rect.y + rect.height / 2,
        };
      };
      return {
        web: pointFor('web-pane', false),
        lynx: pointFor('lynx-pane', true),
      };
    })()`,
  );
  if (!reopenPoints?.web || !reopenPoints?.lynx) {
    throw new Error(`Could not locate both file rows for reopen: ${JSON.stringify(reopenPoints)}`);
  }
  await dispatchPointerClickWithMove(cdp, sessionId, reopenPoints.web);
  await dispatchPointerClickWithMove(cdp, sessionId, reopenPoints.lynx);
  const reopenedState = await waitForState(
    (candidate) =>
      candidate?.web?.fileEditorMetrics?.currentFile === filePath.split("/").at(-1) &&
      candidate?.lynx?.fileEditorMetrics?.currentFile === filePath.split("/").at(-1) &&
      candidate?.web?.fileEditorMetrics?.contentRevision === pendingContentRevision &&
      candidate?.lynx?.fileEditorMetrics?.contentRevision === pendingContentRevision &&
      candidate?.[fileEditClient]?.fileEditorMetrics?.pending === false &&
      candidate?.[fileEditClient]?.fileEditorMetrics?.statusbar === null,
    `${fileEditClient} file reopen with persisted contents`,
  );
  const lynxWriteObserved =
    reopenedState.lynx.connectorDiagnostics?.commandResults?.some(
      ({ method }) => method === "writeProjectFile",
    ) === true;
  return {
    state: reopenedState,
    evidence: {
      input: {
        client: fileEditClient,
        channel:
          fileEditClient === "web"
            ? "CDP pointer + Pierre caret + Playwright-style keyDown/keyUp + trusted beforeinput"
            : "DevTool-equivalent pointer + DOM.focus + CDP Input.insertText",
        webTrace: webInputTrace,
      },
      suffix: fileEditSuffix,
      pending: {
        visible: pendingVisible,
        web: pendingEvidenceState.web.fileEditorMetrics,
        lynx: pendingEvidenceState.lynx.fileEditorMetrics,
        screenshot: pendingScreenshot,
      },
      failure: {
        injectedBy: "temporarily renaming the disposable workspace during the delayed first write",
        workspaceRestored: fixturePreparation.writeFailureActive === false,
        web: failureEvidenceState.web.fileEditorMetrics,
        lynx: failureEvidenceState.lynx.fileEditorMetrics,
        screenshot: failureScreenshot,
      },
      retry: {
        client: fileEditClient,
        channel: "CDP pointer",
        point: retryPoint,
        web: recoveredState.web.fileEditorMetrics,
        lynx: recoveredState.lynx.fileEditorMetrics,
        errorCleared: true,
        pendingCleared: true,
      },
      back: {
        points: backPoints,
        afterRetryConfirmation: true,
      },
      persistence: {
        path: fixturePreparation.disposableFile,
        bytes: Buffer.byteLength(persistedContents),
        sha256: createHash("sha256").update(persistedContents).digest("hex"),
        includesSentinel: true,
        lynxWriteObserved,
      },
      reopen: {
        points: reopenPoints,
        contentRevision: pendingContentRevision,
        web: reopenedState.web.fileEditorMetrics,
        lynx: reopenedState.lynx.fileEditorMetrics,
      },
    },
  };
}

async function hashFile(filePath) {
  const contents = await readFile(filePath);
  return {
    path: path.relative(repoRoot, filePath),
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

async function prepareStateFixture({ seed, expectedThreadFixture }) {
  const requiresRunningRuntime =
    stateId === "composer-working" || stateId === "existing-thread-working";
  if (isNarrowChatThreadState || isChatOutlineState) {
    const threadId = expectedThreadFixture?.id;
    if (!threadId) throw new Error("Narrow chat fixture requires a seeded thread.");
    const databasePath = path.join(baseDir, "userdata", "state.sqlite");
    const database = new (await import("node:sqlite")).DatabaseSync(databasePath);
    const turnId = "fidelity-narrow-chat-turn";
    const userMessageId = "fidelity-narrow-chat-user";
    const assistantMessageId = "fidelity-narrow-chat-assistant";
    const earlierTurnId = "fidelity-outline-earlier-turn";
    const earlierUserMessageId = "fidelity-outline-earlier-user";
    const earlierAssistantMessageId = "fidelity-outline-earlier-assistant";
    const requestedAt = "2026-08-30T04:00:00.000Z";
    const completedAt = "2026-08-30T04:01:00.000Z";
    const userText =
      "Please keep this deliberately long request readable when the chat thread becomes very narrow, including `inline-code-that-must-wrap-safely` and the message hover controls.";
    const assistantText =
      'Implemented the responsive behavior while preserving the shared layout.\n\n- Router initialization\n- Navigation calls with target and current paths\n- Pathname changes from the core router\n- Navigation errors and warnings\n\n```ts title="src/responsive.ts"\nexport const responsiveLayout = (width: number) => width < 520 ? "compact" : "wide";\n```\n\nLong prose should wrap inside the available column without forcing horizontal overflow.' +
      (isChatOutlineState
        ? "\n\nThe outline fixture intentionally includes enough transcript content to require real scrolling.\n\n- Preserve readable wrapping at each responsive breakpoint.\n- Keep message hover controls within the transcript column.\n- Keep changed-file summaries contained by their card.\n- Keep expanded work logs readable in monospace.\n- Keep tool details aligned with their disclosure row.\n- Keep Markdown list markers small and optically centered.\n- Keep the diff sheet above the chat on compact windows.\n- Keep file headers visually attached to their code rows.\n- Keep line numbers aligned across additions and deletions.\n- Keep syntax colors sourced from the shared highlighter.\n- Keep outline previews attached to their owning marker.\n- Keep pointer movement between marker and preview stable.\n- Keep outline jumps deterministic in long conversations.\n- Keep the current thread unchanged while navigating turns.\n- Keep the composer available after transcript navigation.\n- Keep the shared Web and Lynx projection identical.\n\nThe final paragraphs make the first and second user turns occupy distinct scroll positions in both renderers.\n\nThis lets the interaction gate prove a causal jump instead of accepting a click that leaves an already-visible row unchanged."
        : "");
    const checkpointFiles = [
      {
        path: "apps/lynxtron/src/app/components/ResponsiveConversationTimeline.tsx",
        kind: "modified",
        additions: 28,
        deletions: 7,
      },
      {
        path: "packages/client-runtime/src/presentation/transcript-responsive-layout.ts",
        kind: "added",
        additions: 41,
        deletions: 0,
      },
      {
        path: "apps/web/src/components/chat/ChangedFilesCardSurface.tsx",
        kind: "modified",
        additions: 12,
        deletions: 3,
      },
    ];
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("DELETE FROM projection_thread_messages WHERE thread_id = ?").run(threadId);
      database
        .prepare("DELETE FROM projection_thread_activities WHERE thread_id = ?")
        .run(threadId);
      database.prepare("DELETE FROM projection_turns WHERE thread_id = ?").run(threadId);
      if (isChatOutlineState) {
        database
          .prepare(
            `INSERT INTO projection_thread_messages (
              message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at,
              attachments_json
            ) VALUES
              (?, ?, ?, 'user', 'Inspect the responsive chat outline and jump behavior.', 0, ?, ?, '[]'),
              (?, ?, ?, 'assistant', 'The outline should preview this completed response and jump back to it.', 0, ?, ?, '[]')`,
          )
          .run(
            earlierUserMessageId,
            threadId,
            earlierTurnId,
            "2026-08-30T03:58:00.000Z",
            "2026-08-30T03:58:00.000Z",
            earlierAssistantMessageId,
            threadId,
            earlierTurnId,
            "2026-08-30T03:58:20.000Z",
            "2026-08-30T03:58:20.000Z",
          );
        database
          .prepare(
            `INSERT INTO projection_turns (
              thread_id, turn_id, pending_message_id, assistant_message_id, state, requested_at,
              started_at, completed_at, checkpoint_turn_count, checkpoint_ref, checkpoint_status,
              checkpoint_files_json, source_proposed_plan_thread_id, source_proposed_plan_id
            ) VALUES (?, ?, NULL, ?, 'completed', ?, ?, ?, NULL, NULL, NULL, '[]', NULL, NULL)`,
          )
          .run(
            threadId,
            earlierTurnId,
            earlierAssistantMessageId,
            "2026-08-30T03:58:00.000Z",
            "2026-08-30T03:58:00.000Z",
            "2026-08-30T03:58:20.000Z",
          );
      }
      database
        .prepare(
          `INSERT INTO projection_thread_activities (
            activity_id, thread_id, turn_id, tone, kind, summary, payload_json, sequence, created_at
          ) VALUES
            (?, ?, ?, 'info', 'task.progress', 'Thinking', ?, 1, ?),
            (?, ?, ?, 'tool', 'tool.completed', 'Command run', ?, 2, ?),
            (?, ?, ?, 'tool', 'tool.completed', 'Tool call', ?, 3, ?)`,
        )
        .run(
          "fidelity-narrow-thinking",
          threadId,
          turnId,
          JSON.stringify({
            summary: "Thinking",
            detail:
              "The user is asking me to preserve every responsive chat state while matching the Electron source of truth.\n\nI should reuse the shared presentation contracts and verify each interaction.",
          }),
          "2026-08-30T04:00:10.000Z",
          "fidelity-narrow-command",
          threadId,
          turnId,
          JSON.stringify({
            status: "completed",
            command: "pnpm test transcript-responsive-layout",
            detail: "66 focused tests passed",
          }),
          "2026-08-30T04:00:20.000Z",
          "fidelity-narrow-tool",
          threadId,
          turnId,
          JSON.stringify({
            status: "completed",
            title: "Inspect responsive transcript",
            detail: "Compared Web and Lynx geometry at 360, 480, and 640 pixels.",
          }),
          "2026-08-30T04:00:30.000Z",
        );
      database
        .prepare(
          `INSERT INTO projection_thread_messages (
            message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at,
            attachments_json
          ) VALUES
            (?, ?, ?, 'user', ?, 0, ?, ?, '[]'),
            (?, ?, ?, 'assistant', ?, 0, ?, ?, '[]')`,
        )
        .run(
          userMessageId,
          threadId,
          turnId,
          userText,
          requestedAt,
          requestedAt,
          assistantMessageId,
          threadId,
          turnId,
          assistantText,
          completedAt,
          completedAt,
        );
      database
        .prepare(
          `INSERT INTO projection_turns (
            thread_id, turn_id, pending_message_id, assistant_message_id, state, requested_at,
            started_at, completed_at, checkpoint_turn_count, checkpoint_ref, checkpoint_status,
            checkpoint_files_json, source_proposed_plan_thread_id, source_proposed_plan_id
          ) VALUES (?, ?, NULL, ?, 'completed', ?, ?, ?, 1, ?, 'ready', ?, NULL, NULL)`,
        )
        .run(
          threadId,
          turnId,
          assistantMessageId,
          requestedAt,
          requestedAt,
          completedAt,
          `refs/t3/checkpoints/${turnId}`,
          JSON.stringify(checkpointFiles),
        );
      database
        .prepare(
          `UPDATE projection_threads
           SET latest_turn_id = ?, updated_at = ?, latest_user_message_at = ?,
               settled_override = NULL, settled_at = NULL
           WHERE thread_id = ?`,
        )
        .run(turnId, completedAt, requestedAt, threadId);
      database.exec("COMMIT");
      database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      database.close();
    }
    const prepared = await hashFile(databasePath);
    return {
      kind: isChatOutlineState ? "chat-outline" : "narrow-chat-transcript",
      sourceSha256: seed?.snapshotSha256 ?? null,
      preparedSha256: prepared.sha256,
      threadId,
      turnId,
      messageIds: [userMessageId, assistantMessageId],
      checkpointFiles,
    };
  }
  if (isFileEditingSaveState) {
    const project = seed?.dataset?.projects?.find(
      (candidate) => candidate.id === expectedThreadFixture?.projectId,
    );
    const sourceWorkspace = project?.workspaceRoot;
    if (!sourceWorkspace || !expectedThreadFixture?.projectId || !expectedThreadFixture?.id) {
      throw new Error("File editing fixture requires a seeded project workspace and thread.");
    }
    const sourceFile = path.resolve(sourceWorkspace, filePath);
    const sourceRelative = path.relative(sourceWorkspace, sourceFile);
    if (sourceRelative.startsWith("..") || path.isAbsolute(sourceRelative)) {
      throw new Error(`File editing source escapes its workspace: ${sourceFile}`);
    }
    const originalContents = await readFile(sourceFile, "utf8");
    if (originalContents.includes(fileEditSuffix)) {
      throw new Error("File editing source already contains the fidelity sentinel.");
    }

    const disposableWorkspace = path.join(
      process.env.TMPDIR ?? "/tmp",
      `t3-file-save-workspace-${process.pid}-${randomBytes(6).toString("hex")}`,
    );
    const failedWriteWorkspace = `${disposableWorkspace}-write-failure`;
    const allowedTemporaryRoots = ["/tmp/", "/var/folders/"];
    if (!allowedTemporaryRoots.some((root) => disposableWorkspace.startsWith(root))) {
      throw new Error(`Refusing non-temporary file editing workspace: ${disposableWorkspace}`);
    }
    const disposableFile = path.resolve(disposableWorkspace, filePath);
    const disposableRelative = path.relative(disposableWorkspace, disposableFile);
    if (disposableRelative.startsWith("..") || path.isAbsolute(disposableRelative)) {
      throw new Error(`File editing target escapes its workspace: ${disposableFile}`);
    }
    await mkdir(path.dirname(disposableFile), { recursive: true });
    await writeFile(disposableFile, originalContents);
    await rm(failedWriteWorkspace, { recursive: true, force: true });

    const sqliteStateScript = path.join(repoRoot, "apps/server/scripts/t3-sqlite-state.ts");
    const escapedProjectId = expectedThreadFixture.projectId.replaceAll("'", "''");
    const escapedWorkspace = disposableWorkspace.replaceAll("'", "''");
    const mutation = spawnSync(
      process.env.T3_NODE_BIN?.trim() || "node",
      [
        sqliteStateScript,
        "exec",
        "--base-dir",
        baseDir,
        "--sql",
        `UPDATE projection_projects
SET workspace_root = '${escapedWorkspace}'
WHERE project_id = '${escapedProjectId}';
UPDATE projection_threads
SET worktree_path = NULL
WHERE project_id = '${escapedProjectId}';`,
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    if (mutation.status !== 0) {
      await rm(disposableWorkspace, { recursive: true, force: true });
      throw new Error(
        `File editing fixture preparation failed: ${
          mutation.stderr || mutation.stdout || "unknown"
        }`,
      );
    }
    const mutationReport = JSON.parse(mutation.stdout);
    await rm(mutationReport.backup, { force: true });
    const prepared = await hashFile(path.join(baseDir, "userdata", "state.sqlite"));
    return {
      kind: "file-editing-disposable-workspace",
      sourceSha256: seed?.snapshotSha256 ?? null,
      preparedSha256: prepared.sha256,
      projectId: expectedThreadFixture.projectId,
      threadId: expectedThreadFixture.id,
      sourceWorkspace,
      disposableWorkspace,
      failedWriteWorkspace,
      disposableFile,
      originalSha256: createHash("sha256").update(originalContents).digest("hex"),
      originalBytes: Buffer.byteLength(originalContents),
      editSuffix: fileEditSuffix,
      backupRemoved: true,
    };
  }
  if (stateId === "composer-sendable") {
    const project = seed?.dataset?.projects?.find(
      (candidate) => candidate.title === "background-only",
    );
    if (!project?.id) {
      throw new Error("Composer sendable fixture requires the background-only project");
    }
    const databasePath = path.join(baseDir, "userdata", "state.sqlite");
    const escapedProjectId = project.id.replaceAll("'", "''");
    const sqliteStateScript = path.join(repoRoot, "apps/server/scripts/t3-sqlite-state.ts");
    const mutation = spawnSync(
      process.env.T3_NODE_BIN?.trim() || "node",
      [
        sqliteStateScript,
        "exec",
        "--base-dir",
        baseDir,
        "--sql",
        `UPDATE projection_projects
SET default_model_selection_json = json_object(
  'instanceId', '${selectedModelFixture.instanceId}',
  'model', '${selectedModelFixture.model}'
)
WHERE project_id = '${escapedProjectId}';`,
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    if (mutation.status !== 0) {
      throw new Error(
        `Composer sendable fixture preparation failed: ${
          mutation.stderr || mutation.stdout || "unknown"
        }`,
      );
    }
    const mutationReport = JSON.parse(mutation.stdout);
    try {
      const query = spawnSync(
        process.env.T3_NODE_BIN?.trim() || "node",
        [
          sqliteStateScript,
          "query",
          "--base-dir",
          baseDir,
          "--sql",
          `SELECT default_model_selection_json
FROM projection_projects
WHERE project_id = '${escapedProjectId}'`,
        ],
        { encoding: "utf8", cwd: repoRoot },
      );
      if (query.status !== 0) {
        throw new Error(
          `Composer sendable fixture verification failed: ${
            query.stderr || query.stdout || "unknown"
          }`,
        );
      }
      const queryReport = JSON.parse(query.stdout);
      if (
        queryReport.rows?.length !== 1 ||
        queryReport.rows[0]?.default_model_selection_json !== JSON.stringify(selectedModelFixture)
      ) {
        throw new Error(
          `Composer sendable fixture verification mismatch: ${JSON.stringify(queryReport.rows ?? [])}`,
        );
      }
      const prepared = await hashFile(databasePath);
      return {
        kind: "project-model-selection",
        sourceSha256: seed?.snapshotSha256 ?? null,
        preparedSha256: prepared.sha256,
        projectId: project.id,
        modelSelection: selectedModelFixture,
        backupRemoved: true,
      };
    } finally {
      await rm(mutationReport.backup, { force: true });
    }
  }
  if (isSettledBannerInlineFilesState) {
    const threadId = expectedThreadFixture?.id;
    if (!threadId) throw new Error("Settled banner fixture requires a seeded thread.");
    const databasePath = path.join(baseDir, "userdata", "state.sqlite");
    const escapedThreadId = threadId.replaceAll("'", "''");
    const settledAt = "2026-08-19T02:00:00.000Z";
    const sqliteStateScript = path.join(repoRoot, "apps/server/scripts/t3-sqlite-state.ts");
    const mutation = spawnSync(
      process.env.T3_NODE_BIN?.trim() || "node",
      [
        sqliteStateScript,
        "exec",
        "--base-dir",
        baseDir,
        "--sql",
        `UPDATE projection_thread_sessions SET status = 'stopped' WHERE thread_id = '${escapedThreadId}';
UPDATE projection_threads SET settled_override = 'settled', settled_at = '${settledAt}' WHERE thread_id = '${escapedThreadId}';`,
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    if (mutation.status !== 0) {
      throw new Error(
        `Settled banner fixture preparation failed: ${mutation.stderr || mutation.stdout || "unknown"}`,
      );
    }
    const mutationReport = JSON.parse(mutation.stdout);
    await rm(mutationReport.backup, { force: true });
    const prepared = await hashFile(databasePath);
    return {
      kind: "settled-thread",
      sourceSha256: seed?.snapshotSha256 ?? null,
      preparedSha256: prepared.sha256,
      threadId,
      activeTurnId: expectedThreadFixture.activeTurnId,
      sessionStatus: "stopped",
      settledOverride: "settled",
      settledAt,
      backupRemoved: true,
    };
  }
  if (!requiresRunningRuntime && !isComposerPlanModeState) {
    return {
      kind: "pristine-seed",
      sourceSha256: seed?.snapshotSha256 ?? null,
      preparedSha256: seed?.snapshotSha256 ?? null,
    };
  }

  const threadId = expectedThreadFixture?.id;
  if (!threadId) {
    throw new Error(`${stateId} fixture preparation requires a seeded thread`);
  }

  const databasePath = path.join(baseDir, "userdata", "state.sqlite");
  const escapedThreadId = threadId.replaceAll("'", "''");
  const sqliteStateScript = path.join(repoRoot, "apps/server/scripts/t3-sqlite-state.ts");
  const sql = isComposerPlanModeState
    ? `UPDATE projection_threads
SET interaction_mode = 'plan',
    settled_override = 'active',
    settled_at = NULL
WHERE thread_id = '${escapedThreadId}';`
    : requiresRunningRuntime
      ? (() => {
          const activeTurnId = expectedThreadFixture?.activeTurnId;
          if (!activeTurnId) {
            throw new Error(`${stateId} fixture requires an active turn id`);
          }
          const escapedActiveTurnId = activeTurnId.replaceAll("'", "''");
          const fixtureTimestamp = expectedThreadFixture.updatedAt.replaceAll("'", "''");
          return `UPDATE provider_session_runtime
SET status = 'running',
    last_seen_at = '${fixtureTimestamp}',
    runtime_payload_json = json_set(
      coalesce(runtime_payload_json, '{}'),
      '$.activeTurnId', '${escapedActiveTurnId}',
      '$.lastRuntimeEvent', 'fidelity.fixture.running',
      '$.lastRuntimeEventAt', '${fixtureTimestamp}'
    )
WHERE thread_id = '${escapedThreadId}';`;
        })()
      : "";
  const mutation = spawnSync(
    process.env.T3_NODE_BIN?.trim() || "node",
    [sqliteStateScript, "exec", "--base-dir", baseDir, "--sql", sql],
    { encoding: "utf8", cwd: repoRoot },
  );
  if (mutation.status !== 0) {
    throw new Error(
      `Selected-model fixture preparation failed: ${
        mutation.stderr || mutation.stdout || "unknown"
      }`,
    );
  }

  const mutationReport = JSON.parse(mutation.stdout);
  try {
    const verificationSql = isComposerPlanModeState
      ? `SELECT interaction_mode, settled_override, settled_at
FROM projection_threads
WHERE thread_id = '${escapedThreadId}'`
      : requiresRunningRuntime
        ? `SELECT status, json_extract(runtime_payload_json, '$.activeTurnId') AS active_turn_id
FROM provider_session_runtime
WHERE thread_id = '${escapedThreadId}'`
        : "";
    const query = spawnSync(
      process.env.T3_NODE_BIN?.trim() || "node",
      [sqliteStateScript, "query", "--base-dir", baseDir, "--sql", verificationSql],
      { encoding: "utf8", cwd: repoRoot },
    );
    if (query.status !== 0) {
      throw new Error(
        `${stateId} fixture verification failed: ${query.stderr || query.stdout || "unknown"}`,
      );
    }
    const queryReport = JSON.parse(query.stdout);
    const fixtureMatches = isComposerPlanModeState
      ? queryReport.rows?.length === 1 &&
        queryReport.rows[0]?.interaction_mode === "plan" &&
        queryReport.rows[0]?.settled_override === "active" &&
        queryReport.rows[0]?.settled_at === null
      : requiresRunningRuntime
        ? queryReport.rows?.length === 1 &&
          queryReport.rows[0]?.status === "running" &&
          queryReport.rows[0]?.active_turn_id === expectedThreadFixture.activeTurnId
        : false;
    if (!fixtureMatches) {
      throw new Error(
        `${stateId} fixture verification mismatch: ${JSON.stringify(queryReport.rows ?? [])}`,
      );
    }

    const prepared = await hashFile(databasePath);
    return isComposerPlanModeState
      ? {
          kind: "thread-interaction-mode",
          sourceSha256: seed?.snapshotSha256 ?? null,
          preparedSha256: prepared.sha256,
          threadId,
          interactionMode: "plan",
          settledOverride: "active",
          settledAt: null,
          backupRemoved: true,
        }
      : requiresRunningRuntime
        ? {
            kind: "provider-runtime-running",
            sourceSha256: seed?.snapshotSha256 ?? null,
            preparedSha256: prepared.sha256,
            threadId,
            activeTurnId: expectedThreadFixture.activeTurnId,
            runtimeStatus: "running",
            backupRemoved: true,
          }
        : null;
  } finally {
    await rm(mutationReport.backup, { force: true });
  }
}

async function webEntryBundlePath() {
  const indexPath = path.join(WEB_DIST, "index.html");
  const indexHtml = await readFile(indexPath, "utf8");
  const entrySource = indexHtml.match(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/,
  )?.[1];
  if (!entrySource) return indexPath;
  return path.join(WEB_DIST, entrySource.replace(/^\/+/, ""));
}

/** Mint a bearer + one wsTicket for the Lynx pane against the shared server. */
async function mintLynxSocketUrl(serverPort, bootstrapToken) {
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: bootstrapToken,
    subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    client_label: "T3 Code SB3 Lynx pane",
    client_device_type: "desktop",
  }).toString();
  const exchange = await httpRequest(
    serverPort,
    "/oauth/token",
    "POST",
    {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(form)),
    },
    form,
  );
  if (exchange.status !== 200) throw new Error(`token exchange failed (${exchange.status})`);
  const bearer = JSON.parse(exchange.body).access_token;
  const ticketRes = await httpRequest(
    serverPort,
    "/api/auth/websocket-ticket",
    "POST",
    {
      authorization: "Bearer " + bearer,
      "content-type": "application/json",
      "content-length": "2",
    },
    "{}",
  );
  if (ticketRes.status !== 200) throw new Error(`ws ticket failed (${ticketRes.status})`);
  const ticket = JSON.parse(ticketRes.body).ticket;
  return `ws://${HOST}:${serverPort}/ws?wsTicket=${encodeURIComponent(ticket)}`;
}

async function main() {
  for (const [label, target] of [
    ["server bin", SERVER_BIN],
    ["web build", path.join(WEB_DIST, "index.html")],
    ["lynx build", path.join(LYNX_BUILD_DIR, "lynx/main.web.bundle")],
  ]) {
    if (!existsSync(target)) {
      throw new Error(
        `Missing ${label} at ${target}. Build web (apps/web dist), lynx (pnpm run build:browser-preview), and seed (scripts/sb2-seed-shared-state.mjs) first.`,
      );
    }
  }

  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    cwd: repoRoot,
  }).stdout?.trim();

  // Deterministic isolated state: re-seed the base dir from the SB2 source
  // BEFORE launching, so every run starts from the same pristine snapshot even
  // if a prior run was interrupted mid-flight (the live server mutates its own
  // runtime/session rows, so a leftover DB would otherwise drift the fixture).
  // This replaces a fragile backup/restore-on-exit dance with an idempotent
  // pre-run seed.
  console.log("[shared-workbench] re-seeding pristine fixture…");
  const threadStateIds = new Set([
    "existing-thread-idle",
    "existing-thread-working",
    "existing-thread-completed",
    "existing-thread-completed-no-diff",
    "existing-thread-failed",
    "existing-thread-failed-dismissed",
    "existing-thread-approval",
    "existing-thread-question",
    "existing-thread-question-multi-step",
    "chat-thread-narrow",
    "chat-input-narrow-expanded",
    "chat-outline",
    "sidebar-resize",
    "file-picker-default",
    "files-browser",
    "settled-banner-inline-files-narrow",
    "file-editor-detail",
    "file-editor-detail-light",
    "file-editor-detail-narrow-inline",
    "file-editor-open-in-menu",
    "file-editor-editing-save",
    "git-publish-dialog",
    "project-action-dialog",
    "sidebar-project-settings",
    "composer-docked",
    "composer-plan-mode",
    "composer-working",
    "composer-compact-controls-open",
    "composer-compact-controls-inline-files-narrow",
    "composer-compact-controls-inline-files-short",
    "right-panel-add-menu",
    "right-panel-terminal",
    "right-panel-terminal-multi-session",
    "right-panel-terminal-horizontal-split",
    "right-panel-terminal-vertical-split",
    "diff-scope-menu",
    "composer-connecting",
    "composer-disabled",
    "workspace-menu-open",
    "review-checkpoint",
    "review-tree",
    "review-diff",
    "review-empty",
    "sidebar-inline-search",
    "model-picker-default",
    "model-picker-provider-rail",
    "model-picker-query",
    "model-picker-empty",
    "model-picker-selected",
    "model-picker-interaction",
    "quick-switch-default",
    "quick-switch-query",
    "quick-switch-query-light",
    "quick-switch-actions-only",
    "quick-switch-empty",
    "command-palette-navigation",
    "sidebar-v2-new-thread-hover",
    "sidebar-v2-new-project-hover",
    "sidebar-thread-hover-preview",
    "sidebar-thread-shortcuts",
    "sidebar-v2-new-thread-projects",
  ]);
  const seedSource =
    explicitSeedSource ||
    (process.env.T3_PLAN11C_SEED_SOURCE ??
      (threadStateIds.has(stateId)
        ? path.join(process.env.HOME ?? "", ".t3-lynxtron/userdata/state.sqlite")
        : path.join(process.env.HOME ?? "", ".t3/userdata/state.sqlite")));
  const seedReportPath = path.join(baseDir, "workbench-seed-report.json");
  const reseed = spawnSync(
    process.env.T3_NODE_BIN?.trim() || "node",
    [
      path.join(scriptDir, "sb2-seed-shared-state.mjs"),
      "--source",
      seedSource,
      "--base-dir",
      baseDir,
      "--output",
      seedReportPath,
    ],
    { encoding: "utf8", cwd: lynxAppDir },
  );
  if (reseed.status !== 0) {
    throw new Error(`re-seed failed: ${reseed.stderr || reseed.stdout || "unknown"}`);
  }

  const seed = JSON.parse(await readFile(seedReportPath, "utf8"));
  const expectedThreadFixture = explicitExpectedThreadId
    ? seed?.dataset?.threads?.find((thread) => thread.id === explicitExpectedThreadId)
    : stateId === "composer-connecting"
      ? seed?.dataset?.startingThread
      : stateId === "composer-working" ||
          stateId === "existing-thread-working" ||
          isSettledBannerInlineFilesState
        ? seed?.dataset?.workingThread
        : stateId === "composer-plan-mode"
          ? seed?.dataset?.canonicalThread
          : isCompletedThreadState()
            ? seed?.dataset?.completedThread
            : isFailedThreadState
              ? seed?.dataset?.failedThread
              : threadStateIds.has(stateId)
                ? (seed?.dataset?.idleThread ?? seed?.dataset?.canonicalThread)
                : null;
  const requiresThreadFixture =
    threadStateIds.has(stateId) && stateId !== "sidebar-v2-new-thread-projects";
  if (requiresThreadFixture && !expectedThreadFixture?.id) {
    throw new Error(
      `State ${stateId} requires a seeded thread fixture, but ${seedSource} has none`,
    );
  }
  if (stateId === "composer-working" && expectedThreadFixture?.sessionStatus !== "running") {
    throw new Error(
      `State ${stateId} requires a running thread fixture, but ${seedSource} has none`,
    );
  }
  if (stateId === "composer-connecting" && expectedThreadFixture?.sessionStatus !== "starting") {
    throw new Error(
      `State ${stateId} requires a starting thread fixture, but ${seedSource} has none`,
    );
  }
  if (isCompletedThreadState() && expectedThreadFixture?.latestTurnState !== "completed") {
    throw new Error(
      `State ${stateId} requires a populated completed-turn fixture, but ${seedSource} has none`,
    );
  }
  if (isFailedThreadState && expectedThreadFixture?.latestTurnState !== "error") {
    throw new Error(
      `State ${stateId} requires a populated failed-turn fixture, but ${seedSource} has none`,
    );
  }
  const fixturePreparation = await prepareStateFixture({ seed, expectedThreadFixture });
  if (isRightPanelTerminalState) {
    await rm(path.join(baseDir, "userdata", "logs", "terminals"), {
      recursive: true,
      force: true,
    });
  }
  if (isAddProviderDialogState) {
    const settingsPath = path.join(baseDir, "userdata", "settings.json");
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(await readFile(settingsPath, "utf8"));
      if (settings.providerInstances?.codex_fidelity_browser) {
        const { codex_fidelity_browser: _fixture, ...providerInstances } =
          settings.providerInstances;
        await writeFile(
          settingsPath,
          `${JSON.stringify({ ...settings, providerInstances }, null, 2)}\n`,
        );
      }
    }
  }
  seed.fixturePreparation = fixturePreparation;
  await writeFile(seedReportPath, `${JSON.stringify(seed, null, 2)}\n`);
  const expectProject = semanticRoute.startsWith("settings-")
    ? ""
    : (expectedThreadFixture?.projectTitle ?? seed?.dataset?.projects?.[0]?.title ?? "");
  const expectThread = expectedThreadFixture?.id ?? null;
  const expectedNewThreadModelSelection =
    stateId === "composer-sendable"
      ? selectedModelFixture
      : semanticRoute === "new-thread" && expectThread === null
        ? (seed?.dataset?.projects?.find((project) => project.title === expectProject)
            ?.defaultModelSelection ?? null)
        : null;
  let captureWebRoute = requestedWebRoute;
  const webBundle = await hashFile(await webEntryBundlePath());
  const lynxBundle = await hashFile(path.join(LYNX_BUILD_DIR, "lynx/main.web.bundle"));

  // --- launch the shared server ---
  const serverPort = await findFreePort();
  const bootstrapToken = randomBytes(24).toString("hex");
  const envelope = {
    mode: "desktop",
    noBrowser: true,
    port: serverPort,
    host: isConnectionsMutationState ? "0.0.0.0" : HOST,
    desktopBootstrapToken: bootstrapToken,
    tailscaleServeEnabled: false,
    tailscaleServePort: 3774,
  };
  console.log(`[shared-workbench] server on :${serverPort} baseDir=${baseDir}`);
  const child = spawn(
    process.env.T3_NODE_BIN?.trim() || "node",
    [SERVER_BIN, "serve", "--bootstrap-fd", "3", "--base-dir", baseDir],
    {
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        SHELL: "/bin/sh",
        ...(isFileEditingSaveState ? { T3_TEST_PROJECT_WRITE_DELAY_MS: "5000" } : {}),
        ...(stateId === "settings-source-control-loading"
          ? { T3_TEST_SOURCE_CONTROL_DISCOVERY_PENDING: "1" }
          : {}),
        ...(stateId === "settings-source-control-error"
          ? { T3_TEST_SOURCE_CONTROL_DISCOVERY_ERROR: "1" }
          : {}),
      },
    },
  );
  child.stdio[3].write(JSON.stringify(envelope) + "\n");
  child.stdio[3].end();
  let serverExited = false;
  let startupToken = null;
  const onServerOut = (chunk) => {
    const m = String(chunk).match(/Token:\s*([A-Z0-9]+)/);
    if (m && !startupToken) startupToken = m[1];
  };
  child.stdout.on("data", onServerOut);
  child.stderr.on("data", onServerOut);
  child.on("exit", () => (serverExited = true));

  let front = null;
  let chrome = null;
  let browserCdp = null;
  let userDataDir = null;
  let cleanupPromise = null;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      if (browserCdp) {
        await Promise.race([browserCdp.send("Browser.close").catch(() => undefined), delay(1_000)]);
        browserCdp.close();
      }
      await stopOwnedChild(chrome);
      if (front) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 2_000);
          front.server.close(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      if (!keepServer) await stopOwnedChild(child);
      if (userDataDir) {
        await rm(userDataDir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      }
      if (fixturePreparation.kind === "file-editing-disposable-workspace") {
        await rm(fixturePreparation.disposableWorkspace, { recursive: true, force: true });
        await rm(fixturePreparation.failedWriteWorkspace, { recursive: true, force: true });
        fixturePreparation.disposed = true;
      }
    })();
    return cleanupPromise;
  };
  const onSigint = () => void cleanup().finally(() => process.exit(130));
  const onSigterm = () => void cleanup().finally(() => process.exit(143));
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  const results = [];
  let failures = 0;
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (serverExited) throw new Error("server exited before ready");
      try {
        const r = await httpRequest(serverPort, "/.well-known/t3/environment", "GET", {});
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* not up */
      }
      await delay(500);
    }
    if (!ready) throw new Error("server not ready");
    for (let i = 0; i < 20 && !startupToken; i++) await delay(200);
    if (!startupToken) throw new Error("did not capture startup pairing token");
    if ((explicitExpectedThreadId || threadStateIds.has(stateId)) && expectThread) {
      const environmentId = (
        await readFile(path.join(baseDir, "userdata", "environment-id"), "utf8")
      ).trim();
      captureWebRoute = `/${encodeURIComponent(environmentId)}/${encodeURIComponent(expectThread)}`;
    }

    front = await startFrontServer(serverPort);
    const origin = `http://${HOST}:${front.port}`;
    const lynxSocketUrl = await mintLynxSocketUrl(serverPort, bootstrapToken);
    console.log(`[shared-workbench] front ${origin}; lynx socket direct to shared server /ws`);

    // Launch headless Chrome once; a page target per viewport.
    userDataDir = path.join(
      process.env.TMPDIR ?? "/tmp",
      `t3-shared-workbench-${process.pid}-${Date.now()}`,
    );
    chrome = spawn(
      CHROME_BIN,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--disable-gpu",
        "about:blank",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const endpoint = await waitForDevtools(chrome);
    const version = await fetchJson(endpoint, "/json/version");
    browserCdp = new Cdp(version.webSocketDebuggerUrl);
    await browserCdp.connect();

    for (const viewport of viewports) {
      const captured = await captureCell({
        browserCdp,
        origin,
        viewport,
        commit,
        webBundle,
        lynxBundle,
        serverPort,
        startupToken: webCredentialForState({
          desktopBootstrapToken: bootstrapToken,
          startupToken,
          stateId,
        }),
        lynxSocketUrl,
        expectProject,
        expectThread,
        expectedNewThreadModelSelection,
        expectedThreadFixture,
        fixturePreparation,
        seedHash: fixturePreparation.preparedSha256,
        stateId,
        semanticRoute,
        webRoute: captureWebRoute,
        theme,
        overlay,
        query,
        providerId,
        composerInput,
        sidebarQuery,
        requestedSidebarWidth,
        requestedRightPanelWidth,
        terminateOwnedServer: isLifecycleFaultState
          ? () => {
              if (!child.killed) child.kill("SIGTERM");
            }
          : null,
      });
      results.push(captured);
      if (!captured.pass) failures += 1;
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await cleanup();
    // The next run re-seeds pristine at startup, so no restore is needed here;
    // just leave the owned server killed by cleanup().
  }

  const summary = {
    schemaVersion: 1,
    task: "SB3",
    generatedAt: new Date().toISOString(),
    commit,
    server: {
      baseDir,
      seedHash: fixturePreparation.preparedSha256,
      sourceSeedHash: seed?.snapshotSha256 ?? null,
      fixturePreparation,
      expectProject,
    },
    bundles: { web: webBundle, lynx: lynxBundle },
    cells: results,
    pass: failures === 0,
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, "workbench-report.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(path.join(outputRoot, "comparison.html"), renderComparisonHtml(summary));
  if (manifestPath) {
    if (!results[0]?.pass) {
      throw new Error(
        `Refusing manifest admission: ${stateId} capture did not pass every hard gate`,
      );
    }
    await admitBrowserPairToManifest({
      manifestPath,
      outputRoot,
      stateId,
      result: results[0],
    });
  }
  console.log(
    JSON.stringify(
      { pass: summary.pass, cells: results.map((c) => ({ viewport: c.viewport, pass: c.pass })) },
      null,
      2,
    ),
  );
  process.exit(failures === 0 ? 0 : 1);
}

async function findFirst(dir, pattern) {
  const { readdir } = await import("node:fs/promises");
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (pattern.test(path.relative(dir, full))) {
        return full;
      }
    }
    return null;
  }
  return walk(dir);
}

async function captureCell({
  browserCdp,
  origin,
  viewport,
  commit,
  webBundle,
  lynxBundle,
  startupToken,
  lynxSocketUrl,
  expectProject,
  expectThread,
  expectedNewThreadModelSelection,
  expectedThreadFixture,
  fixturePreparation,
  seedHash,
  stateId,
  semanticRoute,
  webRoute,
  theme,
  overlay,
  query,
  providerId,
  composerInput,
  sidebarQuery,
  requestedSidebarWidth: expectedSidebarWidth,
  requestedRightPanelWidth: expectedRightPanelWidth,
  terminateOwnedServer,
}) {
  const { width, height } = viewport;
  const cellDir = path.join(outputRoot, viewport.label);
  await mkdir(cellDir, { recursive: true });

  const { targetId } = await browserCdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browserCdp.send("Target.attachToTarget", { targetId, flatten: true });
  const cdp = browserCdp;
  const console_ = [];
  await Promise.all([
    cdp.send("Runtime.enable", {}, sessionId),
    cdp.send("Log.enable", {}, sessionId),
    cdp.send("Page.enable", {}, sessionId),
    cdp.send("DOM.enable", {}, sessionId),
  ]);
  cdp.onEvent((m) => {
    if (m.sessionId && m.sessionId !== sessionId) return;
    if (m.method === "Runtime.consoleAPICalled")
      console_.push({
        level: m.params.type,
        text: (m.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" "),
      });
    else if (m.method === "Runtime.exceptionThrown")
      console_.push({
        level: "error",
        text: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text,
      });
    else if (m.method === "Log.entryAdded")
      console_.push({ level: m.params.entry.level, text: m.params.entry.text });
  });

  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: width * 2 + 1, height: height + 24, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );

  const scenarioByStateId = {
    "new-thread-hero": "new-thread",
    "new-thread-hero-light": "new-thread",
    "existing-thread-idle": "existing-thread",
    "sidebar-flat-layout": "existing-thread",
    "sidebar-v2-new-thread-hover": "existing-thread",
    "sidebar-v2-new-project-hover": "existing-thread",
    "sidebar-thread-hover-preview": "existing-thread",
    "sidebar-thread-shortcuts": "existing-thread",
    "sidebar-v2-new-thread-projects": "existing-thread",
    "existing-thread-working": "existing-thread",
    "git-publish-dialog": "existing-thread",
    "project-action-dialog": "existing-thread",
    "existing-thread-completed": "existing-thread",
    "existing-thread-completed-no-diff": "existing-thread",
    "existing-thread-failed": "existing-thread",
    "existing-thread-failed-dismissed": "existing-thread",
    "chat-thread-narrow": "existing-thread",
    "chat-input-narrow-expanded": "existing-thread",
    "chat-outline": "existing-thread",
    "existing-thread-question-multi-step": "existing-thread",
    "sidebar-resize": "existing-thread",
    "project-scope-open": "project-scope-open",
    "sidebar-project-settings": "existing-thread",
    "lifecycle-error": "lifecycle-error",
    "quick-switch-default": "existing-thread",
    "quick-switch-query": "existing-thread",
    "quick-switch-query-light": "existing-thread",
    "quick-switch-actions-only": "existing-thread",
    "quick-switch-empty": "existing-thread",
    "command-palette-navigation": "existing-thread",
    "file-picker-default": "existing-thread",
    "sidebar-inline-search": "existing-thread",
    "model-picker-default": "model-picker",
    "model-picker-provider-rail": "model-picker",
    "model-picker-query": "model-picker",
    "model-picker-empty": "model-picker",
    "model-picker-selected": "model-picker",
    "model-picker-interaction": "model-picker",
    "composer-hero": "new-thread",
    "composer-sendable": "new-thread",
    "composer-docked": "existing-thread",
    "composer-plan-mode": "existing-thread",
    "composer-working": "existing-thread",
    "composer-compact-controls-open": "existing-thread",
    "composer-compact-controls-inline-files-narrow": "existing-thread",
    "composer-compact-controls-inline-files-short": "existing-thread",
    "right-panel-add-menu": "existing-thread",
    "right-panel-terminal": "existing-thread",
    "right-panel-terminal-multi-session": "existing-thread",
    "right-panel-terminal-horizontal-split": "existing-thread",
    "right-panel-terminal-vertical-split": "existing-thread",
    "diff-scope-menu": "existing-thread",
    "settled-banner-inline-files-narrow": "existing-thread",
    "composer-disabled": "existing-thread",
    "workspace-menu-open": "existing-thread",
    "settings-general": "settings-general",
    "settings-model-picker": "settings-general",
    "settings-model-picker-mutation": "settings-general",
    "settings-appearance": "settings-general",
    "settings-keybindings": "settings-general",
    "settings-keybindings-mutation": "settings-general",
    "settings-providers": "settings-general",
    "settings-providers-add-dialog": "settings-general",
    "settings-providers-add-dialog-light": "settings-general",
    "settings-connections": "settings-general",
    "settings-connections-mutation-browser": "settings-general",
    "settings-source-control": "settings-general",
    "settings-source-control-loading": "settings-general",
    "settings-source-control-error": "settings-general",
    "settings-beta": "settings-general",
    "settings-beta-mutation": "settings-general",
    "settings-background-activity-mutation": "settings-general",
    "settings-archive": "settings-general",
    "review-checkpoint": "existing-thread",
    "review-tree": "existing-thread",
    "review-diff": "existing-thread",
    "review-empty": "existing-thread",
    "files-browser": "existing-thread",
    "file-editor-detail": "existing-thread",
    "file-editor-detail-light": "existing-thread",
    "file-editor-detail-narrow-inline": "existing-thread",
    "file-editor-open-in-menu": "existing-thread",
    "file-editor-editing-save": "existing-thread",
  };
  const scenario = scenarioByStateId[stateId] ?? "existing-thread";
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    pairingToken: startupToken,
    socket: lynxSocketUrl,
    scenario,
    semanticRoute,
    ...(isComponentsLabState ? { componentStoryCount: String(componentLabCatalog.length) } : {}),
    webRoute,
    theme,
    legacySidebarEnabled: String(legacySidebarEnabled),
    betaMutationEnabled: String(isBetaMutationState),
    ...(overlay ? { overlay } : {}),
    expectProject,
    ...(expectThread ? { expectThread } : {}),
    ...(expectedNewThreadModelSelection
      ? { modelSelection: JSON.stringify(expectedNewThreadModelSelection) }
      : {}),
    ...(expectedSidebarWidth === null ? {} : { sidebarWidth: String(expectedSidebarWidth) }),
    ...(expectedRightPanelWidth === null
      ? {}
      : { rightPanelWidth: String(expectedRightPanelWidth) }),
  });
  await cdp.send("Page.navigate", { url: `${origin}/__workbench?${params.toString()}` }, sessionId);

  const readyStart = Date.now();
  const deadline = readyStart + timeoutMs;
  let state = null;
  let webProjectMenuOpened = false;
  let webProjectMenuWaitPolls = 0;
  let webProjectInputSent = false;
  let webProjectSelectionStage = "waiting-for-trigger";
  let webSettingsOpenAttempts = 0;
  let webSettingsInputChannel = webRoute === "/settings/general" ? "pending" : "not-required";
  let webDraftLandingStablePolls = webRoute === "/settings/general" ? 0 : 3;
  let webOverlayInputSent = false;
  let webSettingsModelTriggerScrolled = stateId !== "settings-model-picker";
  let webSettingsModelTriggerDiagnostics = null;
  let webOverlayWaitPolls = 0;
  let webProjectActionMenuOpened = false;
  let webProjectActionTriggerDiagnostics = null;
  let webProviderNotificationCleared = false;
  let webProviderNotificationAbsentPolls = 0;
  let webQuickSwitchKeyboardSent = false;
  let webShortcutInputChannel = requiresShortcutInput ? "pending" : "not-required";
  let lynxOverlayInputSent = overlay.length === 0;
  let lynxOverlayWaitPolls = 0;
  let lynxShortcutInputChannel = requiresShortcutInput ? "pending" : "not-required";
  let webSidebarSearchInputSent = sidebarQuery.length === 0;
  let lynxSidebarSearchInputSent = sidebarQuery.length === 0;
  let sidebarSearchInputChannel = sidebarQuery.length === 0 ? "not-required" : "pending";
  let webThreadInputSent = expectThread === null;
  let lynxThreadInputSent = expectThread === null;
  let overlayQueryInputSent = query.length === 0;
  let overlayQueryInputChannel = query.length === 0 ? "not-required" : "pending";
  let providerInputSent = providerId.length === 0;
  let providerInputChannel = providerId.length === 0 ? "not-required" : "pending";
  let providerInputDiagnostics = null;
  const providerPostconditionTimeline = [];
  const providerPointerTimeline = [];
  let providerReadyPolls = providerId.length === 0 ? 3 : 0;
  let lastProviderTimelineKey = "";
  let modelPickerSemanticReadyPolls = overlay === "model-picker" ? 0 : 3;
  let commandPaletteNavigationStage =
    stateId === "command-palette-navigation" ? "waiting-root" : "not-required";
  const commandPaletteNavigationTimeline = [];
  let sidebarControlHoverStage = isSidebarControlHoverState ? "waiting-controls" : "not-required";
  const sidebarControlHoverTimeline = [];
  let sidebarThreadHoverPreviewStage = isSidebarThreadHoverPreviewState
    ? "waiting-thread"
    : "not-required";
  let sidebarThreadHoverPreview = null;
  let chatOutlineEvidence = null;
  let sidebarThreadShortcutStage = isSidebarThreadShortcutState
    ? "waiting-threads"
    : "not-required";
  const sidebarThreadShortcutTimeline = [];
  let newThreadProjectsStage =
    stateId === "sidebar-v2-new-thread-projects" ? "waiting-controls" : "not-required";
  const newThreadProjectsTimeline = [];
  let newThreadDraftLifecycle = null;
  let addProjectSourcesStage =
    stateId === "add-project-sources" ? "waiting-controls" : "not-required";
  const addProjectSourcesTimeline = [];
  let addProviderDialogStage = isAddProviderDialogState ? "waiting-settings" : "not-required";
  const addProviderDialogTimeline = [];
  let betaMutationStage = isBetaMutationState ? "waiting-settings" : "not-required";
  const betaMutationTimeline = [];
  let backgroundActivityMutationStage = isBackgroundActivityMutationState
    ? "waiting-settings"
    : "not-required";
  const backgroundActivityMutationTimeline = [];
  let settingsModelMutationStage = isSettingsModelMutationState
    ? "waiting-settings"
    : "not-required";
  const settingsModelMutationTimeline = [];
  let connectionsMutationStage = isConnectionsMutationState ? "waiting-settings" : "not-required";
  const connectionsMutationTimeline = [];
  let settingsAsyncReadyPolls =
    stateId === "settings-source-control" ||
    stateId === "settings-source-control-loading" ||
    stateId === "settings-source-control-error"
      ? 0
      : 10;
  let webLegacySettingsExpanded = !isBetaSettingsState;
  let lynxLegacySettingsExpanded = !isBetaSettingsState;
  const legacySettingsTimeline = [];
  let transcriptReadyPolls = stateId.startsWith("existing-thread-") ? 0 : 3;
  let pendingRequestReadyPolls =
    stateId === "existing-thread-approval" ||
    stateId === "existing-thread-question" ||
    isMultiStepQuestionState
      ? 0
      : 3;
  let multiStepQuestionStage = isMultiStepQuestionState ? "waiting-initial" : "not-required";
  const multiStepQuestionTimeline = [];
  let filesBrowserReadyPolls = isFilesSurfaceState ? 0 : 3;
  let fileEditorReadyPolls = isFileEditorState ? 0 : 3;
  let composerInputSent = composerInput.length === 0;
  let composerInputChannel = composerInput.length === 0 ? "not-required" : "pending";
  let composerInputDiagnostics = null;
  let webReviewPanelInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
    (reviewExpectation === "diff" && width <= 1023);
  let lynxReviewPanelInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
    (reviewExpectation === "diff" && width <= 1023) ||
    (reviewExpectation === "diff" && isDiffScopeMenuState);
  let webReviewDiffInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
    reviewExpectation === "panel-empty";
  let lynxReviewDiffInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
    reviewExpectation === "panel-empty";
  let webTurnFoldInputSent = expandTurnId.length === 0;
  let lynxTurnFoldInputSent = expandTurnId.length === 0;
  let webThinkingInputSent = !expandThinking;
  let lynxThinkingInputSent = !expandThinking;
  let webSidebarStateInputSent = sidebarTargetState.length === 0;
  let lynxSidebarStateInputSent = sidebarTargetState.length === 0;
  let webChangedFilesInputSent = changedFilesTargetState.length === 0;
  let lynxChangedFilesInputSent = changedFilesTargetState.length === 0;
  let webChangedFilesClickCount = 0;
  let lynxChangedFilesClickCount = 0;
  let webGitPublishInputSent = !isGitPublishDialogState;
  let lynxGitPublishInputSent = !isGitPublishDialogState;
  let webGitPublishOpenAttempts = 0;
  let lynxGitPublishOpenAttempts = 0;
  let gitPublishDismissed = !isGitPublishDialogState;
  let gitPublishThreadReadyPolls = isGitPublishDialogState ? 0 : 3;
  const gitPublishPostconditionTimeline = [];
  let lastGitPublishTimelineKey = "";
  const reviewInteractionTimeline = [];
  let lastReviewTimelineKey = "";
  let ownedServerTerminated = false;
  let lifecycleFaultPreflightStablePolls = requiresStableProviderFaultPreflight ? 0 : 3;
  let lastLifecycleFaultPreflightKey = "";
  const lifecycleFaultPreflightTimeline = [];
  let reachedTargetState = false;
  const newThreadHeroNavigationTimeline = [];
  const failedThreadDismissalTimeline = [];
  const keybindingsMutationTimeline = [];
  let webFilesBrowserInputSent = !isFilesSurfaceState;
  let lynxFilesBrowserInputSent = !isFilesSurfaceState;
  let webFileEditorInputSent = !isFileEditorState;
  let lynxFileEditorInputSent = !isFileEditorState;
  let webFileEditorOpenAttempts = 0;
  let lynxFileEditorOpenAttempts = 0;
  let webFileEditorDomFallbackUsed = false;
  let fileEditorSwitched = !isFileEditorState || isNarrowFileEditorState || isOpenInMenuState;
  let fileEditorReturnedToBrowser =
    !isFileEditorState || isFileEditingSaveState || isOpenInMenuState;
  let webFileEditorReturnedToBrowser =
    !isFileEditorState || isFileEditingSaveState || isOpenInMenuState;
  let lynxFileEditorReturnedToBrowser =
    !isFileEditorState || isFileEditingSaveState || isOpenInMenuState;
  let openInMenuEvidence = null;
  let narrowChatHoverEvidence = null;
  let modelPickerInteractionEvidence = null;
  let narrowComposerExpandEvidence = null;
  let rightPanelAddMenuDismissed = !isRightPanelAddMenuState && !isRightPanelTerminalState;
  let rightPanelAddMenuTerminalSelected = !isRightPanelAddMenuState && !isRightPanelTerminalState;
  let rightPanelTerminalScreenshot = null;
  let rightPanelTerminalCommand = null;
  let rightPanelTerminalMultiSession = null;
  let diffScopeMenuDismissed = !isDiffScopeMenuState;
  let diffScopeWorkingTreeSelected = !isDiffScopeMenuState;
  let shortCompactControlsScrolled = !isShortCompactControlsState;
  let shortCompactControlsDismissed = !isShortCompactControlsState;
  let shortCompactControlsScrollDiagnostics = null;
  const projectSettingsInteraction = {
    webScopeOpened: !isProjectSettingsState,
    lynxScopeOpened: !isProjectSettingsState,
    webScopeOptionCount: 0,
    lynxScopeOptionCount: 0,
    webScopeActionCount: 0,
    lynxScopeActionCount: 0,
    webScopeKeys: [],
    lynxScopeKeys: [],
    webScopeLabels: [],
    lynxScopeLabels: [],
    webActionClicked: false,
    lynxActionClicked: projectSettingsExpectation === "missing",
  };
  const projectSettingsTimeline = [];
  const fileEditorInteractionTimeline = [];
  const filesBrowserInteractionTimeline = [];
  let lastFilesBrowserTimelineKey = "";
  let componentLabTooltipOpened = false;
  let componentLabTooltipVerified = false;
  let componentLabMenuOpened = false;
  let componentLabMenuVerified = false;
  let componentLabSelectOpened = false;
  let componentLabSelectChanged = false;
  let componentLabSelectReopened = false;
  let componentLabNumberIncremented = false;
  let componentLabNumberDecremented = false;
  let componentLabScrollDispatched = false;
  let componentLabDialogOpened = false;
  let componentLabDialogVerified = false;
  let componentLabDialogClosed = false;
  let componentLabDialogGeometryVerified = false;
  let componentLabDialogEvidence = null;
  while (Date.now() < deadline) {
    state = await evaluate(
      cdp,
      sessionId,
      `(() => { const w = window.__T3_WORKBENCH__; return w ? w.read() : null; })()`,
    ).catch(() => null);
    if (isComponentsLabState) {
      const labReady =
        (state?.web?.componentLabMetrics?.stories?.length ?? 0) === componentLabCatalog.length &&
        JSON.stringify(
          state.web.componentLabMetrics.stories.map(({ id, states, title }) => ({
            id,
            states,
            title,
          })),
        ) ===
          JSON.stringify(
            state?.lynx?.componentLabMetrics?.stories?.map(({ id, states, title }) => ({
              id,
              states,
              title,
            })) ?? [],
          );
      if (labReady && !componentLabTooltipOpened) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenterVisible("web", '[data-component-lab-tooltip-trigger="default"]') ?? null,
              lynx: w?.elementCenterVisible("lynx", '[data-component-lab-tooltip-trigger="default"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web && points?.lynx) {
          await movePointer(cdp, sessionId, points.web);
          await invokeLynxTooltipProbe(cdp, sessionId, "component-lab-tooltip", "hover");
          componentLabTooltipOpened = true;
          await delay(100);
          continue;
        }
      }
      if (
        labReady &&
        componentLabTooltipOpened &&
        !componentLabTooltipVerified &&
        state?.web?.componentLabMetrics?.tooltip?.text === "Shared tooltip" &&
        state?.lynx?.componentLabMetrics?.tooltip?.text === "Shared tooltip"
      ) {
        componentLabTooltipVerified = true;
        await invokeLynxTooltipProbe(cdp, sessionId, "component-lab-tooltip", "leave");
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenterVisible("web", '[data-component-lab-menu-trigger="default"]') ?? null,
              lynx: w?.elementCenterVisible("lynx", '[data-component-lab-menu-trigger="default"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web && points?.lynx) {
          await dispatchPointerClickWithMove(cdp, sessionId, points.web);
          const invoked = await evaluate(
            cdp,
            sessionId,
            `globalThis.__T3_WORKBENCH__?.invokeLynxMenu?.("component-lab-menu") ?? false`,
          ).catch(() => false);
          if (!invoked) throw new Error("Lynx component lab menu probe is unavailable");
          componentLabMenuOpened = true;
        }
        await delay(100);
        continue;
      }
      if (
        labReady &&
        componentLabTooltipVerified &&
        componentLabMenuOpened &&
        !componentLabMenuVerified &&
        state?.web?.componentLabMetrics?.menu?.text?.includes("Open in editor") &&
        state?.lynx?.componentLabMetrics?.menu?.text?.includes("Open in editor") &&
        state.web.componentLabMetrics.menu.items.length === 2 &&
        state.lynx.componentLabMetrics.menu.items.length === 2 &&
        Math.abs(
          state.web.componentLabMetrics.menu.box.rect.x -
            state.lynx.componentLabMetrics.menu.box.rect.x,
        ) <= 2 &&
        Math.abs(
          state.web.componentLabMetrics.menu.box.rect.y -
            state.lynx.componentLabMetrics.menu.box.rect.y,
        ) <= 2 &&
        Math.abs(
          state.web.componentLabMetrics.menu.box.rect.width -
            state.lynx.componentLabMetrics.menu.box.rect.width,
        ) <= 2 &&
        Math.abs(
          state.web.componentLabMetrics.menu.box.rect.height -
            state.lynx.componentLabMetrics.menu.box.rect.height,
        ) <= 2
      ) {
        componentLabMenuVerified = true;
        const menuPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenter("web", '[data-component-lab-menu-trigger="default"]') ?? null,
              lynx: w?.elementCenter("lynx", '[data-component-lab-menu-trigger="default"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (menuPoints?.web) await dispatchPointerClickWithMove(cdp, sessionId, menuPoints.web);
        if (menuPoints?.lynx) {
          const invoked = await evaluate(
            cdp,
            sessionId,
            `globalThis.__T3_WORKBENCH__?.invokeLynxMenu?.("component-lab-menu") ?? false`,
          ).catch(() => false);
          if (!invoked) throw new Error("Lynx component lab menu close probe is unavailable");
        }
        await delay(100);
        continue;
      }
      if (
        labReady &&
        componentLabMenuVerified &&
        componentLabNumberDecremented &&
        componentLabScrollDispatched &&
        (state?.web?.componentLabMetrics?.scrollArea?.scrollTop ?? 0) > 0 &&
        (state?.lynx?.componentLabMetrics?.scrollArea?.scrollTop ?? 0) > 0 &&
        componentLabDialogClosed &&
        !componentLabSelectOpened
      ) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenterVisible("web", '[data-component-lab-select-trigger="default"]') ?? null,
              lynx: w?.elementCenterVisible("lynx", '[data-component-lab-select-trigger="default"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web) await dispatchPointerClickWithMove(cdp, sessionId, points.web);
        await delay(100);
        if (points?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
        componentLabSelectOpened = Boolean(points?.web && points?.lynx);
        await delay(100);
        continue;
      }
      if (
        labReady &&
        componentLabMenuVerified &&
        componentLabSelectOpened &&
        !componentLabSelectChanged &&
        state?.web?.componentLabMetrics?.select?.popup?.text === "Comfortable Compact" &&
        state?.lynx?.componentLabMetrics?.select?.popup?.text === "Comfortable Compact"
      ) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenter("web", '[data-component-lab-select-item="compact"]') ?? null,
              lynx: w?.elementCenter("lynx", '[data-component-lab-select-item="compact"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web) await dispatchPointerClickWithMove(cdp, sessionId, points.web);
        await delay(100);
        if (points?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
        componentLabSelectChanged = Boolean(points?.web && points?.lynx);
        await delay(100);
        continue;
      }
      if (
        componentLabSelectChanged &&
        !componentLabSelectReopened &&
        state?.web?.componentLabMetrics?.select?.value === "Compact" &&
        state?.lynx?.componentLabMetrics?.select?.value === "Compact"
      ) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenter("web", '[data-component-lab-select-trigger="default"]') ?? null,
              lynx: w?.elementCenter("lynx", '[data-component-lab-select-trigger="default"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web) await dispatchPointerClickWithMove(cdp, sessionId, points.web);
        await delay(100);
        if (points?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
        componentLabSelectReopened = Boolean(points?.web && points?.lynx);
        await delay(100);
        continue;
      }
      if (
        labReady &&
        componentLabMenuVerified &&
        !componentLabSelectOpened &&
        !componentLabNumberIncremented &&
        String(state?.web?.componentLabMetrics?.numberField?.value) === "10" &&
        String(state?.lynx?.componentLabMetrics?.numberField?.value) === "10"
      ) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenterVisible("web", '[data-component-lab-number-action="increment"]') ?? null,
              lynx: w?.elementCenterVisible("lynx", '[data-component-lab-number-action="increment"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web) await dispatchPointerClickWithMove(cdp, sessionId, points.web);
        await delay(100);
        if (points?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
        componentLabNumberIncremented = Boolean(points?.web && points?.lynx);
        await delay(100);
        continue;
      }
      if (
        componentLabNumberIncremented &&
        !componentLabNumberDecremented &&
        String(state?.web?.componentLabMetrics?.numberField?.value) === "12" &&
        String(state?.lynx?.componentLabMetrics?.numberField?.value) === "12"
      ) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenter("web", '[data-component-lab-number-action="decrement"]') ?? null,
              lynx: w?.elementCenter("lynx", '[data-component-lab-number-action="decrement"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web) await dispatchPointerClickWithMove(cdp, sessionId, points.web);
        await delay(100);
        if (points?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
        componentLabNumberDecremented = Boolean(points?.web && points?.lynx);
        await delay(100);
        continue;
      }
      if (
        labReady &&
        componentLabNumberDecremented &&
        !componentLabScrollDispatched &&
        String(state?.web?.componentLabMetrics?.numberField?.value) === "10" &&
        String(state?.lynx?.componentLabMetrics?.numberField?.value) === "10"
      ) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenterVisible("web", ".component-lab-scroll-area") ?? null,
              lynx: w?.elementCenterVisible("lynx", ".component-lab-scroll-area") ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web) await dispatchMouseWheel(cdp, sessionId, points.web, 48);
        if (points?.lynx) await dispatchMouseWheel(cdp, sessionId, points.lynx, 48);
        componentLabScrollDispatched = Boolean(points?.web && points?.lynx);
        await delay(100);
        continue;
      }
      if (
        labReady &&
        componentLabScrollDispatched &&
        !componentLabDialogOpened &&
        (state?.web?.componentLabMetrics?.scrollArea?.scrollTop ?? 0) > 0 &&
        (state?.lynx?.componentLabMetrics?.scrollArea?.scrollTop ?? 0) > 0
      ) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenterVisible("web", '[data-component-lab-dialog-trigger="default"]') ?? null,
              lynx: w?.elementCenterVisible("lynx", '[data-component-lab-dialog-trigger="default"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web) await dispatchPointerClickWithMove(cdp, sessionId, points.web);
        if (points?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
        componentLabDialogOpened = Boolean(points?.web && points?.lynx);
        await delay(100);
        continue;
      }
      if (
        componentLabDialogOpened &&
        !componentLabDialogVerified &&
        state?.web?.componentLabMetrics?.dialog?.title === "Add environment" &&
        state?.lynx?.componentLabMetrics?.dialog?.title === "Add environment" &&
        state?.web?.componentLabMetrics?.dialog?.description ===
          "Connect another machine to this T3 Code workspace." &&
        state?.lynx?.componentLabMetrics?.dialog?.description ===
          "Connect another machine to this T3 Code workspace." &&
        state?.web?.componentLabMetrics?.dialog?.popup?.rect &&
        state?.lynx?.componentLabMetrics?.dialog?.popup?.rect &&
        Math.abs(
          state.web.componentLabMetrics.dialog.popup.rect.width -
            state.lynx.componentLabMetrics.dialog.popup.rect.width,
        ) <= 2 &&
        Math.abs(
          state.web.componentLabMetrics.dialog.popup.rect.height -
            state.lynx.componentLabMetrics.dialog.popup.rect.height,
        ) <= 2 &&
        Math.abs(
          state.web.componentLabMetrics.dialog.panel.rect.x -
            state.lynx.componentLabMetrics.dialog.panel.rect.x,
        ) <= 2 &&
        Math.abs(
          state.web.componentLabMetrics.dialog.panel.rect.width -
            state.lynx.componentLabMetrics.dialog.panel.rect.width,
        ) <= 2 &&
        Math.abs(
          state.web.componentLabMetrics.dialog.footer.rect.x -
            state.lynx.componentLabMetrics.dialog.footer.rect.x,
        ) <= 2 &&
        Math.abs(
          state.web.componentLabMetrics.dialog.footer.rect.width -
            state.lynx.componentLabMetrics.dialog.footer.rect.width,
        ) <= 2
      ) {
        componentLabDialogVerified = true;
        componentLabDialogGeometryVerified = true;
        componentLabDialogEvidence = {
          inputChannel: "dual-cdp-pointer",
          web: state.web.componentLabMetrics.dialog,
          lynx: state.lynx.componentLabMetrics.dialog,
        };
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const w = globalThis.__T3_WORKBENCH__;
            return {
              web: w?.elementCenter("web", '[data-component-lab-dialog-close="default"]') ?? null,
              lynx: w?.elementCenter("lynx", '[data-component-lab-dialog-close="default"]') ?? null,
            };
          })()`,
        ).catch(() => null);
        if (points?.web) await dispatchPointerClickWithMove(cdp, sessionId, points.web);
        if (points?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
        await delay(100);
        continue;
      }
      if (
        componentLabDialogVerified &&
        !componentLabDialogClosed &&
        state?.web?.componentLabMetrics?.dialog === null &&
        state?.lynx?.componentLabMetrics?.dialog === null
      ) {
        componentLabDialogClosed = true;
        continue;
      }
      if (
        labReady &&
        componentLabSelectReopened &&
        componentLabScrollDispatched &&
        (state?.web?.componentLabMetrics?.scrollArea?.scrollTop ?? 0) > 0 &&
        (state?.lynx?.componentLabMetrics?.scrollArea?.scrollTop ?? 0) > 0
      )
        break;
      if (state?.web?.literalRoute !== webRoute) {
        await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            if (!frame?.contentWindow) return false;
            frame.contentWindow.location.assign(${JSON.stringify(webRoute)});
            return true;
          })()`,
        ).catch(() => false);
      }
      await delay(100);
      continue;
    }
    if (
      isNewThreadHeroState &&
      !unpersistedHeroStateReady(state) &&
      state?.web?.connected === true &&
      state?.lynx?.connected === true &&
      state?.web?.productState?.selectedProject === expectProject &&
      state?.lynx?.productState?.selectedProject === expectProject &&
      state?.web?.sidebarDiagnostics?.chrome?.newThread?.rect?.width === 32 &&
      state?.lynx?.sidebarDiagnostics?.chrome?.newThread?.rect?.width === 32
    ) {
      break;
    }
    if (webRoute === "/settings/general") {
      webDraftLandingStablePolls = state?.web?.literalRoute?.startsWith("/draft/")
        ? webDraftLandingStablePolls + 1
        : state?.web?.literalRoute === webRoute
          ? 3
          : 0;
    }
    if (
      webRoute === "/settings/general" &&
      webDraftLandingStablePolls >= 3 &&
      state?.web?.literalRoute !== webRoute
    ) {
      const channel = await openWebSettingsFromSidebar(
        cdp,
        sessionId,
        webSettingsOpenAttempts >= 2,
      );
      webSettingsOpenAttempts += channel ? 1 : 0;
      webSettingsInputChannel = channel ?? "settings-trigger-missing";
      await delay(100);
      continue;
    }
    if (isBetaSettingsState && state?.web?.settingsMetrics && state?.lynx?.settingsMetrics) {
      if (state.web.settingsMetrics.legacySidebar?.expanded === true) {
        webLegacySettingsExpanded = true;
      }
      if (state.lynx.settingsMetrics.legacySidebar?.expanded === true) {
        lynxLegacySettingsExpanded = true;
      }
      if (!webLegacySettingsExpanded || !lynxLegacySettingsExpanded) {
        const points = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector('.settings-legacy-section__trigger');
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
                visible:
                  rect.y >= 0 &&
                  rect.y + rect.height <= frameRect.height,
                scrollPoint: {
                  x: frameRect.x + frameRect.width / 2,
                  y: frameRect.y + frameRect.height / 2,
                },
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webLegacySettingsExpanded && points?.web) {
          await dispatchPointerClickWithMove(cdp, sessionId, points.web);
          legacySettingsTimeline.push({ client: "web", step: "expand", point: points.web });
          await delay(100);
          continue;
        }
        if (!lynxLegacySettingsExpanded && points?.lynx) {
          if (!points.lynx.visible) {
            await dispatchMouseWheel(cdp, sessionId, points.lynx.scrollPoint, 700);
            legacySettingsTimeline.push({
              client: "lynx",
              step: "scroll",
              point: points.lynx.scrollPoint,
            });
            await delay(100);
            continue;
          }
          await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
          legacySettingsTimeline.push({ client: "lynx", step: "expand", point: points.lynx });
          await delay(100);
          continue;
        }
      }
      if (webLegacySettingsExpanded && lynxLegacySettingsExpanded) {
        const scrollState = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const read = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const scroller = root?.querySelector('.settings-scroll, .settings-page-scroll-fade');
              if (!frame || !scroller) return null;
              const before = scroller.scrollTop;
              if (scroller.scrollTop > 1) scroller.scrollTop = 0;
              return {
                before,
                scrollTop: scroller.scrollTop,
              };
            };
            return { web: read('web-pane', false), lynx: read('lynx-pane', true) };
          })()`,
        ).catch(() => null);
        if ((scrollState?.web?.before ?? 0) > 1 || (scrollState?.lynx?.before ?? 0) > 1) {
          legacySettingsTimeline.push({
            client: "both",
            step: "restore-scroll",
            scrollState,
          });
          await delay(100);
          continue;
        }
      }
    }
    if (expectThread && state?.web?.productState?.selectedThread === expectThread) {
      webThreadInputSent = true;
    }
    if (expectThread && state?.lynx?.productState?.selectedThread === expectThread) {
      lynxThreadInputSent = true;
    }
    if (isGitPublishDialogState) {
      const selectThreadCommandCount =
        state?.lynx?.connectorDiagnostics?.commands?.filter(
          ({ method }) => method === "selectThread",
        ).length ?? 0;
      gitPublishThreadReadyPolls =
        threadReadyForReview(state, expectThread) && selectThreadCommandCount >= 2
          ? gitPublishThreadReadyPolls + 1
          : 0;
    }
    if (isGitPublishDialogState) {
      const timelineKey = JSON.stringify({
        webDialog: state?.web?.gitPublishDialog !== null,
        lynxDialog: state?.lynx?.gitPublishDialog !== null,
        lynxProviderCount: state?.lynx?.gitPublishDialog?.providers?.length ?? 0,
        lynxLastCommand: state?.lynx?.connectorDiagnostics?.lastCommandResult?.method ?? null,
      });
      if (timelineKey !== lastGitPublishTimelineKey) {
        gitPublishPostconditionTimeline.push({
          elapsedMs: Date.now() - readyStart,
          ...JSON.parse(timelineKey),
        });
        lastGitPublishTimelineKey = timelineKey;
      }
    }
    if (
      isGitPublishDialogState &&
      gitPublishThreadReadyPolls >= 3 &&
      headerGitActionMatches(state) &&
      state?.lynx?.connectorDiagnostics?.commandResults?.some(
        ({ method }) => method === "readVcsStatus",
      ) === true
    ) {
      const discoveryCompleted =
        state?.lynx?.connectorDiagnostics?.commandResults?.some(
          ({ method }) => method === "discoverSourceControl",
        ) === true;
      const shouldOpenWebGitPublish =
        !webGitPublishInputSent ||
        (discoveryCompleted &&
          state?.web?.gitPublishDialog === null &&
          webGitPublishOpenAttempts < 2);
      const shouldOpenLynxGitPublish =
        !lynxGitPublishInputSent ||
        (discoveryCompleted &&
          state?.lynx?.gitPublishDialog === null &&
          lynxGitPublishOpenAttempts < 2);
      if (!shouldOpenWebGitPublish && !shouldOpenLynxGitPublish) {
        // Both renderers are either open or have exhausted their one
        // discovery-complete reopen attempt.
      } else {
        const publishPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
          const pointFor = (frameId, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const target = root?.querySelector(
              '[data-git-quick-action-kind="open_publish"] [data-header-action-part="primary"], ' +
              '[data-git-quick-action-kind="open_publish"] button'
            );
            if (!frame || !target) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = target.getBoundingClientRect();
            return {
              x: frameRect.x + rect.x + rect.width / 2,
              y: frameRect.y + rect.y + rect.height / 2,
            };
          };
          return {
            web: pointFor('web-pane', false),
            lynx: pointFor('lynx-pane', true),
          };
        })()`,
        ).catch(() => null);
        if (shouldOpenWebGitPublish && publishPoints?.web) {
          await dispatchOverlayOpeningPointerClick(cdp, sessionId, publishPoints.web);
          webGitPublishInputSent = true;
          webGitPublishOpenAttempts += 1;
          await delay(100);
          continue;
        }
        if (shouldOpenLynxGitPublish && publishPoints?.lynx) {
          await dispatchOverlayOpeningPointerClick(cdp, sessionId, publishPoints.lynx);
          lynxGitPublishInputSent = true;
          lynxGitPublishOpenAttempts += 1;
          await delay(100);
          continue;
        }
      }
    }
    if (expandTurnId && threadReadyForReview(state, expectThread)) {
      const webTurnFold = state?.web?.timelineMetrics?.turnFolds?.find(
        (fold) => fold.turnId === expandTurnId,
      );
      const lynxTurnFold = state?.lynx?.timelineMetrics?.turnFolds?.find(
        (fold) => fold.turnId === expandTurnId,
      );
      if (webTurnFold?.state === "expanded") webTurnFoldInputSent = true;
      if (lynxTurnFold?.state === "expanded") lynxTurnFoldInputSent = true;
      if (!webTurnFoldInputSent || !lynxTurnFoldInputSent) {
        const foldPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector(
                ${JSON.stringify(
                  `[data-transcript-turn-fold="${expandTurnId}"] .transcript-turn-fold-button`,
                )}
              );
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              if (
                rect.y < 0 ||
                rect.y + rect.height > frameRect.height ||
                rect.x < 0 ||
                rect.x + rect.width > frameRect.width
              ) {
                if (shadow) {
                  const list = root?.querySelector('.timeline-list');
                  const scroller = list?.shadowRoot?.querySelector('[part="content"]');
                  if (scroller) {
                    scroller.scrollTop +=
                      rect.y - frame.contentWindow.innerHeight / 2;
                  }
                }
                return null;
              }
              return {
                // Hit the leading disclosure/label rather than the center of
                // the full-width row; native flex children can otherwise own
                // the center hit target without bubbling a tap to HostButton.
                x: frameRect.x + rect.x + Math.min(32, rect.width / 2),
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webTurnFoldInputSent && foldPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, foldPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxTurnFoldInputSent && foldPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, foldPoints.lynx);
          await delay(100);
          continue;
        }
      }
    }
    if (
      expandThinking &&
      webTurnFoldInputSent &&
      lynxTurnFoldInputSent &&
      threadReadyForReview(state, expectThread)
    ) {
      const webThinking = state?.web?.timelineMetrics?.workEntries?.find(
        (entry) => entry.tone === "thinking",
      );
      const lynxThinking = state?.lynx?.timelineMetrics?.workEntries?.find(
        (entry) => entry.tone === "thinking",
      );
      if (webThinking?.state === "expanded") webThinkingInputSent = true;
      if (lynxThinking?.state === "expanded") lynxThinkingInputSent = true;
      if (!webThinkingInputSent || !lynxThinkingInputSent) {
        const workTogglePoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector(
                '[data-timeline-row-kind="work-toggle"] .transcript-work-toggle[aria-expanded="false"]'
              );
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + Math.min(32, rect.width / 2),
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return { web: pointFor('web-pane', false), lynx: pointFor('lynx-pane', true) };
          })()`,
        ).catch(() => null);
        if (!webThinking && workTogglePoints?.web) {
          await dispatchPointerClickWithMove(cdp, sessionId, workTogglePoints.web);
          await delay(100);
          continue;
        }
        if (!lynxThinking && workTogglePoints?.lynx) {
          await dispatchPointerClickWithMove(cdp, sessionId, workTogglePoints.lynx);
          await delay(100);
          continue;
        }
        const thinkingPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector(
                '[data-transcript-work-tone="thinking"][data-transcript-work-state="collapsed"]'
              );
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webThinkingInputSent && thinkingPoints?.web) {
          await dispatchPointerClickWithMove(cdp, sessionId, thinkingPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxThinkingInputSent && thinkingPoints?.lynx) {
          await dispatchPointerClickWithMove(cdp, sessionId, thinkingPoints.lynx);
          await delay(100);
          continue;
        }
      }
    }
    if (providerId) {
      const timelineKey = JSON.stringify({
        web: state?.web?.overlayMetrics?.selectedProviderId ?? null,
        lynx: state?.lynx?.overlayMetrics?.selectedProviderId ?? null,
        webOverlay: state?.web?.productState?.overlay ?? null,
        lynxOverlay: state?.lynx?.productState?.overlay ?? null,
        lynxNavigation: state?.lynx?.overlayMetrics?.navigation ?? null,
      });
      if (timelineKey !== lastProviderTimelineKey) {
        providerPostconditionTimeline.push({
          elapsedMs: Date.now() - readyStart,
          ...JSON.parse(timelineKey),
        });
        lastProviderTimelineKey = timelineKey;
      }
    }
    if (
      isFilesSurfaceState &&
      webProviderNotificationCleared &&
      threadReadyForReview(state, expectThread)
    ) {
      const timelineKey = JSON.stringify({
        web: {
          activeKind: state?.web?.reviewMetrics?.activeKind ?? null,
          present: state?.web?.filesBrowserMetrics?.present ?? false,
          rowCount: state?.web?.filesBrowserMetrics?.rowCount ?? 0,
        },
        lynx: {
          activeKind: state?.lynx?.reviewMetrics?.activeKind ?? null,
          present: state?.lynx?.filesBrowserMetrics?.present ?? false,
          rowCount: state?.lynx?.filesBrowserMetrics?.rowCount ?? 0,
        },
      });
      if (timelineKey !== lastFilesBrowserTimelineKey) {
        filesBrowserInteractionTimeline.push({
          elapsedMs: Date.now() - readyStart,
          ...JSON.parse(timelineKey),
        });
        lastFilesBrowserTimelineKey = timelineKey;
      }
      if (state?.web?.filesBrowserMetrics?.present === true) webFilesBrowserInputSent = true;
      if (state?.lynx?.reviewMetrics?.activeKind === "files") lynxFilesBrowserInputSent = true;
      if (!webFilesBrowserInputSent || !lynxFilesBrowserInputSent) {
        const filesPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const panel = root?.querySelector(
                '[data-right-panel-open="true"], [data-preview-panel-mode]'
              );
              const target = panel
                ? root?.querySelector('[data-right-panel-action="files"]')
                : root?.querySelector('[aria-label="Toggle right panel"]');
              if (!frame || !target || target.getAttribute('aria-disabled') === 'true') return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webFilesBrowserInputSent && filesPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, filesPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxFilesBrowserInputSent && filesPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, filesPoints.lynx);
          await delay(100);
          continue;
        }
      }
      if (state?.web?.fileEditorMetrics?.currentFile === filePath.split("/").at(-1)) {
        webFileEditorInputSent = true;
      }
      if (state?.lynx?.fileEditorMetrics?.currentFile === filePath.split("/").at(-1)) {
        lynxFileEditorInputSent = true;
      }
      if (
        isFileEditorState &&
        state?.web?.filesBrowserMetrics?.present === true &&
        state?.lynx?.filesBrowserMetrics?.present === true &&
        (!webFileEditorInputSent || !lynxFileEditorInputSent)
      ) {
        const targetName = filePath.split("/").at(-1);
        const filePoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const surface = root?.querySelector('[data-file-browser-panel], .files-panel');
              const exactWebTarget = surface?.querySelector(
                ${JSON.stringify(`[data-item-path="${filePath}"]`)}
              );
              const candidates = [];
              const visit = (node) => {
                for (const child of node?.children ?? []) {
                  candidates.push(child);
                  visit(child);
                  if (child.shadowRoot) visit(child.shadowRoot);
                }
              };
              visit(surface);
              const target =
                exactWebTarget ??
                candidates.find((item) => {
                  const label = item.getAttribute?.('aria-label') ?? '';
                  const text = item.textContent?.trim().replace(/\s+/g, ' ') ?? '';
                  return (
                    item.matches?.("button[data-type='item'], .file-tree-row--file") &&
                    (label === ${JSON.stringify(targetName)} ||
                      label.endsWith('/' + ${JSON.stringify(targetName)}) ||
                      text === ${JSON.stringify(targetName)})
                  );
                });
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
                label: target.getAttribute('aria-label') ?? target.textContent?.trim() ?? '',
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        let clicked = false;
        if (!webFileEditorInputSent && webFileEditorOpenAttempts < 3 && filePoints?.web) {
          await dispatchPointerClickWithMove(cdp, sessionId, filePoints.web);
          webFileEditorOpenAttempts += 1;
          clicked = true;
        }
        if (!lynxFileEditorInputSent && lynxFileEditorOpenAttempts < 3 && filePoints?.lynx) {
          await dispatchPointerClickWithMove(cdp, sessionId, filePoints.lynx);
          lynxFileEditorOpenAttempts += 1;
          clicked = true;
        }
        if (
          !webFileEditorInputSent &&
          webFileEditorOpenAttempts >= 1 &&
          !webFileEditorDomFallbackUsed
        ) {
          webFileEditorDomFallbackUsed = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const doc = document.getElementById('web-pane')?.contentWindow?.document;
              const surface = doc?.querySelector('[data-file-browser-panel]');
              const candidates = [];
              const visit = (node) => {
                for (const child of node?.children ?? []) {
                  candidates.push(child);
                  visit(child);
                  if (child.shadowRoot) visit(child.shadowRoot);
                }
              };
              visit(surface);
              const target = candidates.find(
                (item) =>
                  item.getAttribute?.('data-item-path') === ${JSON.stringify(filePath)}
              );
              if (!target) return false;
              target.click();
              return true;
            })()`,
          ).catch(() => false);
          clicked = webFileEditorDomFallbackUsed || clicked;
        }
        if (clicked) {
          fileEditorInteractionTimeline.push({
            elapsedMs: Date.now() - readyStart,
            webCurrentFile: state?.web?.fileEditorMetrics?.currentFile ?? null,
            lynxCurrentFile: state?.lynx?.fileEditorMetrics?.currentFile ?? null,
            attempts: {
              web: webFileEditorOpenAttempts,
              lynx: lynxFileEditorOpenAttempts,
            },
            points: filePoints,
          });
          await delay(150);
          continue;
        }
      }
    }
    const lifecycleFaultPreflight = (() => {
      if (!requiresStableProviderFaultPreflight) return null;
      const webModel = state?.web?.productState?.visibleModelLabel?.trim() ?? "";
      const lynxModel = state?.lynx?.productState?.visibleModelLabel?.trim() ?? "";
      const webControls = (state?.web?.composerMetrics?.controls ?? []).map(({ id, label }) => ({
        id,
        label,
      }));
      const lynxControls = (state?.lynx?.composerMetrics?.controls ?? []).map(({ id, label }) => ({
        id,
        label,
      }));
      const key = JSON.stringify({
        webModel,
        lynxModel,
        webControls,
        lynxControls,
        webPlaceholder: state?.web?.composerMetrics?.placeholder ?? null,
        lynxPlaceholder: state?.lynx?.composerMetrics?.placeholder ?? null,
      });
      return {
        key,
        ready:
          webModel.length > 0 &&
          webModel === lynxModel &&
          JSON.stringify(webControls) === JSON.stringify(lynxControls) &&
          state?.web?.composerMetrics?.placeholder === state?.lynx?.composerMetrics?.placeholder,
      };
    })();
    if (lifecycleFaultPreflight?.ready) {
      lifecycleFaultPreflightStablePolls =
        lifecycleFaultPreflight.key === lastLifecycleFaultPreflightKey
          ? lifecycleFaultPreflightStablePolls + 1
          : 1;
      lastLifecycleFaultPreflightKey = lifecycleFaultPreflight.key;
    } else if (lifecycleFaultPreflight) {
      lifecycleFaultPreflightStablePolls = 0;
      lastLifecycleFaultPreflightKey = lifecycleFaultPreflight.key;
    }
    const preflightTimelineKey = lifecycleFaultPreflight
      ? `${lifecycleFaultPreflightStablePolls}:${lifecycleFaultPreflight.key}`
      : null;
    if (
      preflightTimelineKey &&
      preflightTimelineKey !== lifecycleFaultPreflightTimeline.at(-1)?.key
    ) {
      lifecycleFaultPreflightTimeline.push({
        key: preflightTimelineKey,
        elapsedMs: Date.now() - readyStart,
        ready: lifecycleFaultPreflight.ready,
        stablePolls: lifecycleFaultPreflightStablePolls,
        snapshot: JSON.parse(lifecycleFaultPreflight.key),
      });
    }
    if (
      terminateOwnedServer &&
      !ownedServerTerminated &&
      lifecycleFaultPreflightStablePolls >= 3 &&
      state?.web?.semanticReady === true &&
      state?.lynx?.semanticReady === true &&
      state?.web?.productState?.selectedProject === expectProject &&
      state?.lynx?.productState?.selectedProject === expectProject &&
      state?.lynx?.connectorDiagnostics?.commandResults?.some(
        ({ method }) => method === "readVcsStatus",
      ) === true &&
      (!expectThread ||
        (state?.web?.productState?.selectedThread === expectThread &&
          state?.lynx?.productState?.selectedThread === expectThread))
    ) {
      terminateOwnedServer();
      ownedServerTerminated = true;
      await delay(100);
      continue;
    }
    if (
      webRoute !== "/settings/general" &&
      (isComponentsLabState || state?.web?.connected === true) &&
      !(semanticRoute === "new-thread" && state?.web?.literalRoute?.startsWith("/draft/")) &&
      state?.web?.literalRoute !== webRoute
    ) {
      await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          if (!frame?.contentWindow) return false;
          frame.contentWindow.location.assign(${JSON.stringify(webRoute)});
          return true;
        })()`,
      );
      await delay(100);
      continue;
    }
    if (
      semanticRoute === "new-thread" &&
      !webProjectInputSent &&
      state?.web?.connected === true &&
      state?.web?.productState?.selectedProject !== expectProject
    ) {
      if (!webProjectMenuOpened) {
        const triggerPoint = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            const doc = frame && frame.contentWindow && frame.contentWindow.document;
            const target = doc && doc.querySelector('[aria-label="Change project"]');
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
          })()`,
        ).catch(() => null);
        if (!triggerPoint) {
          await delay(100);
          continue;
        }
        await cdp.send(
          "Input.dispatchMouseEvent",
          {
            type: "mousePressed",
            x: triggerPoint.x,
            y: triggerPoint.y,
            button: "left",
            clickCount: 1,
          },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          {
            type: "mouseReleased",
            x: triggerPoint.x,
            y: triggerPoint.y,
            button: "left",
            clickCount: 1,
          },
          sessionId,
        );
        webProjectMenuOpened = true;
        webProjectMenuWaitPolls = 0;
        webProjectSelectionStage = "waiting-for-project-item";
        await delay(100);
      }
      const projectPoint = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          const doc = frame && frame.contentWindow && frame.contentWindow.document;
          const target = [...(doc?.querySelectorAll('[data-slot="menu-radio-item"]') ?? [])]
            .find((item) => item.textContent?.trim() === ${JSON.stringify(expectProject)});
          if (!frame || !target) return null;
          const fr = frame.getBoundingClientRect();
          const r = target.getBoundingClientRect();
          return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
        })()`,
      ).catch(() => null);
      if (projectPoint) {
        await cdp.send(
          "Input.dispatchMouseEvent",
          {
            type: "mousePressed",
            x: projectPoint.x,
            y: projectPoint.y,
            button: "left",
            clickCount: 1,
          },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          {
            type: "mouseReleased",
            x: projectPoint.x,
            y: projectPoint.y,
            button: "left",
            clickCount: 1,
          },
          sessionId,
        );
        webProjectInputSent = true;
        webProjectSelectionStage = "project-item-clicked";
      } else {
        webProjectMenuWaitPolls += 1;
        if (webProjectMenuWaitPolls >= 10) {
          webProjectMenuOpened = false;
          webProjectSelectionStage = "retrying-project-trigger";
        }
      }
    }
    if (
      expectThread &&
      state?.web?.connected === true &&
      state?.web?.productState?.selectedThread !== expectThread
    ) {
      const point = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          const doc = frame && frame.contentWindow && frame.contentWindow.document;
          const target = doc?.querySelector(
            ${JSON.stringify(`[data-thread-id="${expectThread}"] [role="button"]`)},
          ) ?? doc?.querySelector(${JSON.stringify(`[data-thread-id="${expectThread}"]`)});
          if (!frame || !target) return null;
          const fr = frame.getBoundingClientRect();
          const r = target.getBoundingClientRect();
          return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
        })()`,
      ).catch(() => null);
      if (point) {
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", ...point, button: "left", clickCount: 1 },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", ...point, button: "left", clickCount: 1 },
          sessionId,
        );
        webThreadInputSent = true;
      }
    }
    if (
      expectThread &&
      state?.lynx?.connected === true &&
      state?.lynx?.productState?.selectedThread !== expectThread
    ) {
      const point = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('lynx-pane');
          const doc = frame && frame.contentWindow && frame.contentWindow.document;
          const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
          const target = root?.querySelector(
            ${JSON.stringify(`[data-thread-id="${expectThread}"] [role="button"]`)},
          ) ?? root?.querySelector(${JSON.stringify(`[data-thread-id="${expectThread}"]`)});
          if (!frame || !target) return null;
          const fr = frame.getBoundingClientRect();
          const r = target.getBoundingClientRect();
          return {
            x: fr.x + r.x + r.width / 2,
            y: fr.y + r.y + r.height / 2,
          };
        })()`,
      ).catch(() => null);
      if (point) {
        const { x, y } = point;
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", x, y, button: "left", clickCount: 1 },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", x, y, button: "left", clickCount: 1 },
          sessionId,
        );
        lynxThreadInputSent = true;
      }
    }
    if (
      sidebarQuery &&
      !webSidebarSearchInputSent &&
      state?.web?.semanticReady === true &&
      state?.web?.productState?.selectedProject === expectProject &&
      (!expectThread ||
        (state?.web?.productState?.selectedThread === expectThread &&
          state?.lynx?.productState?.selectedThread === expectThread))
    ) {
      const focused = await focusRemoteElement(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          return frame?.contentWindow?.document
            ?.querySelector('[aria-label="Search threads"]') ?? null;
        })()`,
      ).catch(() => false);
      if (focused) {
        for (const character of sidebarQuery) {
          await cdp.send(
            "Input.dispatchKeyEvent",
            { type: "char", text: character, unmodifiedText: character },
            sessionId,
          );
        }
        webSidebarSearchInputSent = true;
        await delay(100);
        continue;
      }
    }
    if (
      sidebarQuery &&
      webSidebarSearchInputSent &&
      !lynxSidebarSearchInputSent &&
      state?.lynx?.semanticReady === true &&
      state?.lynx?.productState?.selectedProject === expectProject &&
      (!expectThread ||
        (state?.web?.productState?.selectedThread === expectThread &&
          state?.lynx?.productState?.selectedThread === expectThread))
    ) {
      const typed = await focusRemoteElement(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('lynx-pane');
          const doc = frame?.contentWindow?.document;
          const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
          const host = root?.querySelector('[aria-label="Search threads"]');
          return host?.shadowRoot?.querySelector('input') ?? host ?? null;
        })()`,
      )
        .then(async (focused) => {
          if (!focused) return false;
          await cdp.send("Input.insertText", { text: sidebarQuery }, sessionId);
          const queryDeadline = Date.now() + 1000;
          while (Date.now() < queryDeadline) {
            const currentQuery = await evaluate(
              cdp,
              sessionId,
              `window.__T3_WORKBENCH__?.read()?.lynx?.sidebarDiagnostics?.search?.value ?? ""`,
            ).catch(() => "");
            if (currentQuery === sidebarQuery) return true;
            await delay(20);
          }
          return false;
        })
        .catch(() => false);
      if (typed) {
        lynxSidebarSearchInputSent = true;
        sidebarSearchInputChannel = "web-dom-focus+key-char|lynx-dom-focus+insert-text";
        await delay(100);
        continue;
      }
    }
    if (sidebarTargetState && threadReadyForReview(state, expectThread)) {
      if (state?.web?.sidebarDiagnostics?.state === sidebarTargetState) {
        webSidebarStateInputSent = true;
      }
      if (state?.lynx?.sidebarDiagnostics?.state === sidebarTargetState) {
        lynxSidebarStateInputSent = true;
      }
      if (!webSidebarStateInputSent || !lynxSidebarStateInputSent) {
        const sidebarPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow
                ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
                : doc;
              const target = root?.querySelector('[aria-label="Toggle main sidebar"]');
              if (!frame || !target) return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webSidebarStateInputSent && sidebarPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, sidebarPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxSidebarStateInputSent && sidebarPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, sidebarPoints.lynx);
          await delay(100);
          continue;
        }
      }
    }
    if (changedFilesTargetState && threadReadyForReview(state, expectThread)) {
      if (normalizedChangedFilesState(state?.web?.reviewMetrics) === changedFilesTargetState) {
        webChangedFilesInputSent = true;
      }
      if (normalizedChangedFilesState(state?.lynx?.reviewMetrics) === changedFilesTargetState) {
        lynxChangedFilesInputSent = true;
      }
      if (!webChangedFilesInputSent || !lynxChangedFilesInputSent) {
        const changedFilesPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow
                ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
                : doc;
              const card = root?.querySelector(
                '[data-review-checkpoint-card][data-review-checkpoint-status="ready"]'
              );
              const target =
                card?.querySelector('.turn-diff-card__toggle') ??
                card?.querySelector('button[aria-expanded]');
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webChangedFilesInputSent && webChangedFilesClickCount < 3 && changedFilesPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, changedFilesPoints.web);
          webChangedFilesClickCount += 1;
          await delay(100);
          continue;
        }
        if (
          !lynxChangedFilesInputSent &&
          lynxChangedFilesClickCount < 3 &&
          changedFilesPoints?.lynx
        ) {
          await dispatchPointerClick(cdp, sessionId, changedFilesPoints.lynx);
          lynxChangedFilesClickCount += 1;
          await delay(100);
          continue;
        }
      }
    }
    if (
      isReviewState &&
      (!shouldClearWebNotification || webProviderNotificationCleared) &&
      threadReadyForReview(state, expectThread)
    ) {
      const reviewTimelineKey = JSON.stringify({
        web: state?.web?.reviewMetrics ?? null,
        lynx: state?.lynx?.reviewMetrics ?? null,
      });
      if (reviewTimelineKey !== lastReviewTimelineKey) {
        reviewInteractionTimeline.push({
          elapsedMs: Date.now() - readyStart,
          ...JSON.parse(reviewTimelineKey),
        });
        lastReviewTimelineKey = reviewTimelineKey;
      }
      const panelPoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, selector, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const target = root?.querySelector(selector);
            if (!frame || !target) return null;
            target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
            const frameRect = frame.getBoundingClientRect();
            const rect = target.getBoundingClientRect();
            return {
              x: frameRect.x + rect.x + rect.width / 2,
              y: frameRect.y + rect.y + rect.height / 2,
            };
          };
          return {
            web: pointFor('web-pane', '[aria-label="Toggle right panel"]', false),
            lynx: pointFor('lynx-pane', '[aria-label="Toggle right panel"]', true),
          };
        })()`,
      ).catch(() => null);
      if (!webReviewPanelInputSent && !state?.web?.reviewMetrics?.panelOpen && panelPoints?.web) {
        await dispatchPointerClick(cdp, sessionId, panelPoints.web);
        webReviewPanelInputSent = true;
        await delay(100);
        continue;
      }
      if (
        !lynxReviewPanelInputSent &&
        !state?.lynx?.reviewMetrics?.panelOpen &&
        panelPoints?.lynx
      ) {
        await dispatchPointerClick(cdp, sessionId, panelPoints.lynx);
        lynxReviewPanelInputSent = true;
        await delay(100);
        continue;
      }
      const shouldOpenDiff = reviewExpectation === "diff";
      if (
        shouldOpenDiff &&
        ((!webReviewDiffInputSent &&
          !reviewDiffHasExpectedPatch(state?.web?.reviewMetrics?.diff)) ||
          (!lynxReviewDiffInputSent &&
            !reviewDiffHasExpectedPatch(state?.lynx?.reviewMetrics?.diff)))
      ) {
        const checkpointDiffPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector(
                '[data-review-checkpoint-card] [data-review-open-diff]'
              );
              if (!frame || !target) return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webReviewDiffInputSent && checkpointDiffPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, checkpointDiffPoints.web);
          webReviewDiffInputSent = true;
          await delay(100);
          continue;
        }
        if (!lynxReviewDiffInputSent && checkpointDiffPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, checkpointDiffPoints.lynx);
          lynxReviewDiffInputSent = true;
          await delay(100);
          continue;
        }
      }
    }
    if (
      shouldClearWebNotification &&
      !webProviderNotificationCleared &&
      state?.web?.connected === true &&
      state?.web?.productState?.overlay === null
    ) {
      const notificationPoint = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pane = document.getElementById('web-pane');
          const doc = pane?.contentWindow?.document;
          const dismiss = doc?.querySelector('button[aria-label="Dismiss notification"]');
          if (!pane || !dismiss) return { present: false };
          const paneRect = pane.getBoundingClientRect();
          const rect = dismiss.getBoundingClientRect();
          const style = doc.defaultView?.getComputedStyle(dismiss);
          if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            style?.display === 'none' ||
            style?.visibility === 'hidden' ||
            style?.pointerEvents === 'none' ||
            Number(style?.opacity ?? 1) <= 0
          ) {
            return { present: false };
          }
          return {
            present: true,
            point: {
              x: paneRect.x + rect.x + rect.width / 2,
              y: paneRect.y + rect.y + rect.height / 2,
            },
          };
        })()`,
      ).catch(() => null);
      if (notificationPoint?.present === false) {
        webProviderNotificationAbsentPolls += 1;
        webProviderNotificationCleared = webProviderNotificationAbsentPolls >= 30;
      } else if (notificationPoint?.point) {
        webProviderNotificationAbsentPolls = 0;
        await dispatchPointerClickWithMove(cdp, sessionId, notificationPoint.point);
        await delay(350);
        continue;
      }
    }
    if (isProjectSettingsState) {
      if (state?.web?.productState?.overlay === "project-scope") {
        projectSettingsInteraction.webScopeOpened = true;
      }
      if (state?.lynx?.productState?.overlay === "project-scope") {
        projectSettingsInteraction.lynxScopeOpened = true;
      }
      const webNeedsProjectScope =
        !projectSettingsInteraction.webActionClicked &&
        state?.web?.productState?.overlay !== "project-scope";
      const lynxNeedsProjectScope =
        !projectSettingsInteraction.lynxActionClicked &&
        state?.lynx?.productState?.overlay !== "project-scope";
      if (webNeedsProjectScope || lynxNeedsProjectScope) {
        const scopePoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]');
              if (!frame || !target) return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (webNeedsProjectScope && scopePoints?.web) {
          await dispatchPointerClickWithMove(cdp, sessionId, scopePoints.web);
        } else if (lynxNeedsProjectScope && scopePoints?.lynx) {
          const invoked = await evaluate(
            cdp,
            sessionId,
            `document.getElementById('lynx-pane')?.contentWindow
              ?.__T3_LYNX_WEB_PREVIEW__?.invokeMenuForHarness?.('sidebar-project-scope') ?? false`,
          ).catch(() => false);
          if (!invoked) await dispatchPointerClickWithMove(cdp, sessionId, scopePoints.lynx);
        }
        projectSettingsTimeline.push({
          elapsedMs: Date.now() - readyStart,
          stage: "scope-trigger",
          points: scopePoints,
        });
        await delay(100);
        continue;
      }
      if (
        !projectSettingsInteraction.webActionClicked ||
        !projectSettingsInteraction.lynxActionClicked
      ) {
        const actionState = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const read = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const options = [...(root?.querySelectorAll('[data-sidebar-project-scope-option]') ?? [])];
              const optionKeys = options.map(
                (option) => option.getAttribute('data-sidebar-project-scope-option') ?? ''
              );
              const optionLabels = options.map(
                (option) => option.textContent?.trim().replace(/\s+/g, ' ') ?? ''
              );
              const actions = options.flatMap((option) => [
                ...option.querySelectorAll(
                  '[data-sidebar-project-action], [aria-label^="Project actions for"]'
                ),
              ]);
              const target = actions[0] ?? null;
              if (!frame || !target) {
                return {
                  optionCount: options.length,
                  optionKeys,
                  optionLabels,
                  actionCount: actions.length,
                  point: null,
                };
              }
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                optionCount: options.length,
                optionKeys,
                optionLabels,
                actionCount: actions.length,
                point: {
                  x: frameRect.x + rect.x + rect.width / 2,
                  y: frameRect.y + rect.y + rect.height / 2,
                },
              };
            };
            return {
              web: read('web-pane', false),
              lynx: read('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if ((actionState?.web?.optionCount ?? 0) > 0) {
          projectSettingsInteraction.webScopeOptionCount = actionState.web.optionCount;
          projectSettingsInteraction.webScopeActionCount = actionState.web.actionCount;
          projectSettingsInteraction.webScopeKeys = actionState.web.optionKeys;
          projectSettingsInteraction.webScopeLabels = actionState.web.optionLabels;
        }
        if ((actionState?.lynx?.optionCount ?? 0) > 0) {
          projectSettingsInteraction.lynxScopeOptionCount = actionState.lynx.optionCount;
          projectSettingsInteraction.lynxScopeActionCount = actionState.lynx.actionCount;
          projectSettingsInteraction.lynxScopeKeys = actionState.lynx.optionKeys;
          projectSettingsInteraction.lynxScopeLabels = actionState.lynx.optionLabels;
        }
        if (!projectSettingsInteraction.webActionClicked && actionState?.web?.point) {
          await dispatchPointerClickWithMove(cdp, sessionId, actionState.web.point);
          projectSettingsInteraction.webActionClicked = true;
        } else if (!projectSettingsInteraction.lynxActionClicked && actionState?.lynx?.point) {
          await dispatchPointerClickWithMove(cdp, sessionId, actionState.lynx.point);
          projectSettingsInteraction.lynxActionClicked = true;
        }
        projectSettingsTimeline.push({
          elapsedMs: Date.now() - readyStart,
          stage: "project-action",
          actionState,
          interaction: { ...projectSettingsInteraction },
        });
        await delay(100);
        continue;
      }
    }
    if (
      overlay &&
      !webOverlayInputSent &&
      webProviderNotificationCleared &&
      state?.web?.connected === true &&
      (stateId === "settings-model-picker" ||
        state?.web?.productState?.selectedProject === expectProject) &&
      (!["workspace-menu", "compact-controls", "right-panel-add-menu", "diff-scope-menu"].includes(
        overlay,
      ) ||
        state?.lynx?.productState?.overlay === overlay) &&
      state?.web?.productState?.overlay !== overlay
    ) {
      if (stateId === "settings-model-picker" && !webSettingsModelTriggerScrolled) {
        const scrollState = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            const doc = frame?.contentWindow?.document;
            const target = doc?.querySelector(
              '#text-generation-model [data-chat-provider-model-picker="true"]'
            );
            if (!frame || !target) return { ready: false, reason: 'missing-target' };
            const viewportHeight = frame.contentWindow?.innerHeight ?? frame.clientHeight;
            const rect = target.getBoundingClientRect();
            const ready = rect.top >= 0 && rect.bottom <= viewportHeight;
            if (!ready) {
              const scroller = target.closest('.settings-page-scroll-fade');
              if (scroller) {
                const scrollerRect = scroller.getBoundingClientRect();
                const targetCenter = rect.top + rect.height / 2;
                const scrollerCenter = scrollerRect.top + scrollerRect.height / 2;
                scroller.scrollTop += targetCenter - scrollerCenter;
              } else {
                target.scrollIntoView?.({ behavior: 'instant', block: 'center', inline: 'nearest' });
              }
            }
            const nextRect = target.getBoundingClientRect();
            return {
              ready: nextRect.top >= 0 && nextRect.bottom <= viewportHeight,
              viewportHeight,
              rect: {
                x: nextRect.x,
                y: nextRect.y,
                width: nextRect.width,
                height: nextRect.height,
                bottom: nextRect.bottom,
              },
              scrollTop: target.closest('.settings-page-scroll-fade')?.scrollTop ?? null,
            };
          })()`,
        ).catch((error) => ({ ready: false, reason: String(error) }));
        webSettingsModelTriggerDiagnostics = scrollState;
        webSettingsModelTriggerScrolled = scrollState?.ready === true;
        await delay(50);
        continue;
      }
      if (overlay === "project-action-dialog") {
        webProjectActionTriggerDiagnostics = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            const doc = frame?.contentWindow?.document;
            const actions = doc?.querySelector('[data-chat-header-actions]');
            const host = actions?.firstElementChild;
            const describe = (element) => {
              if (!element) return null;
              const rect = element.getBoundingClientRect();
              return {
                tagName: element.tagName,
                text: element.textContent?.trim() ?? '',
                attributes: Object.fromEntries(
                  element.getAttributeNames().map((name) => [name, element.getAttribute(name)])
                ),
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              };
            };
            return {
              selectedProject: window.__T3_WORKBENCH__?.read()?.web?.productState?.selectedProject ?? null,
              actions: describe(actions),
              host: describe(host),
              buttons: [...(actions?.querySelectorAll('button') ?? [])].map(describe),
              menuItems: [...(doc?.querySelectorAll('[data-slot="menu-item"]') ?? [])].map(describe),
            };
          })()`,
        ).catch((error) => ({ error: String(error) }));
      }
      const triggerSelector =
        overlay === "quick-switch"
          ? stateId === "add-project-sources"
            ? '[data-testid="sidebar-add-project-trigger"], [aria-label="New project"]'
            : ""
          : overlay === "file-picker"
            ? ""
            : overlay === "project-scope"
              ? '[data-testid="sidebar-v2-project-scope-trigger"]'
              : overlay === "workspace-menu"
                ? '[data-floating-anchor="composer-workspace-menu"]'
                : overlay === "compact-controls"
                  ? '[data-floating-anchor="composer-compact-controls-menu"]'
                  : overlay === "right-panel-add-menu"
                    ? '[data-floating-anchor="right-panel-add-menu"]'
                    : overlay === "diff-scope-menu"
                      ? '[data-floating-anchor="diff-scope-menu"]'
                      : overlay === "project-action-dialog"
                        ? '[aria-label="Add action"]'
                        : stateId === "settings-model-picker"
                          ? '#text-generation-model [data-chat-provider-model-picker="true"]'
                          : '[data-composer-control="model"]';
      const point =
        overlay === "project-action-dialog"
          ? await evaluate(
              cdp,
              sessionId,
              `(() => {
                const frame = document.getElementById('web-pane');
                const doc = frame?.contentWindow?.document;
                const actionHost = doc?.querySelector('[data-chat-header-actions] > :first-child');
                const menuItem = [...(doc?.querySelectorAll('[data-slot="menu-item"]') ?? [])].find(
                  (item) => item.textContent?.trim() === 'Add action'
                );
                const direct = actionHost?.matches('button[aria-label="Add action"]')
                  ? actionHost
                  : actionHost?.querySelector('button[aria-label="Add action"]');
                const menuTrigger = actionHost?.matches(
                  'button[aria-label="Project actions"], button[aria-label="Script actions"]'
                )
                  ? actionHost
                  : actionHost?.querySelector(
                      'button[aria-label="Project actions"], button[aria-label="Script actions"]'
                    );
                const fallback = actionHost?.matches('button')
                  ? actionHost
                  : actionHost?.querySelector('button');
                const target = menuItem ?? direct ?? menuTrigger ?? fallback;
                if (!frame || !target) return null;
                const fr = frame.getBoundingClientRect();
                const r = target.getBoundingClientRect();
                return {
                  x: fr.x + r.x + r.width / 2,
                  y: fr.y + r.y + r.height / 2,
                  stage: menuItem
                    ? 'menu-item'
                    : direct
                      ? 'direct'
                      : menuTrigger
                        ? 'menu-trigger'
                        : 'host-fallback',
                };
              })()`,
            ).catch(() => null)
          : triggerSelector
            ? await evaluate(
                cdp,
                sessionId,
                `(() => {
          const frame = document.getElementById('web-pane');
          const doc = frame && frame.contentWindow && frame.contentWindow.document;
          const target = doc && doc.querySelector(${JSON.stringify(triggerSelector)});
          if (!frame || !target) return null;
          const fr = frame.getBoundingClientRect();
          const r = target.getBoundingClientRect();
          const viewportHeight = frame.contentWindow?.innerHeight ?? frame.clientHeight;
          if (r.top < 0 || r.bottom > viewportHeight) return null;
          return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
        })()`,
              ).catch(() => null)
            : null;
      if (point) {
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 },
          sessionId,
        );
        if (
          overlay === "project-action-dialog" &&
          (point.stage === "menu-trigger" || point.stage === "host-fallback")
        ) {
          webProjectActionMenuOpened = true;
        } else {
          webOverlayInputSent = true;
        }
        webOverlayWaitPolls = 0;
      } else if (
        (overlay === "quick-switch" || overlay === "file-picker") &&
        !webQuickSwitchKeyboardSent
      ) {
        const focusPoint = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            const doc = frame?.contentWindow?.document;
            const target =
              doc?.querySelector('[data-chat-header]') ??
              doc?.querySelector('.composer-frame') ??
              doc?.body;
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            return {
              x: fr.x + Math.min(Math.max(r.width / 2, 1), Math.max(r.width - 1, 1)),
              y: fr.y + Math.min(Math.max(r.height / 2, 1), Math.max(r.height - 1, 1)),
            };
          })()`,
        ).catch(() => null);
        if (focusPoint) {
          await cdp.send(
            "Input.dispatchMouseEvent",
            { type: "mousePressed", ...focusPoint, button: "left", clickCount: 1 },
            sessionId,
          );
          await cdp.send(
            "Input.dispatchMouseEvent",
            { type: "mouseReleased", ...focusPoint, button: "left", clickCount: 1 },
            sessionId,
          );
          const shortcutKey = overlay === "file-picker" ? "p" : "k";
          const shortcutCode = overlay === "file-picker" ? "KeyP" : "KeyK";
          const shortcutVirtualKeyCode = overlay === "file-picker" ? 80 : 75;
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: "rawKeyDown",
              modifiers: 4,
              key: shortcutKey,
              code: shortcutCode,
              windowsVirtualKeyCode: shortcutVirtualKeyCode,
            },
            sessionId,
          );
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: "keyUp",
              modifiers: 4,
              key: shortcutKey,
              code: shortcutCode,
              windowsVirtualKeyCode: shortcutVirtualKeyCode,
            },
            sessionId,
          );
          webQuickSwitchKeyboardSent = true;
          webOverlayInputSent = true;
          webShortcutInputChannel = `cdp-meta-${shortcutKey}`;
          webOverlayWaitPolls = 0;
        }
      }
    }
    if (overlay && webOverlayInputSent && state?.web?.productState?.overlay !== overlay) {
      webOverlayWaitPolls += 1;
      if (webOverlayWaitPolls >= 10) {
        webOverlayInputSent = false;
        webOverlayWaitPolls = 0;
        if (overlay === "quick-switch" || overlay === "file-picker") {
          webQuickSwitchKeyboardSent = false;
        }
      }
    }
    if (
      (overlay === "project-scope" ||
        overlay === "workspace-menu" ||
        overlay === "compact-controls" ||
        overlay === "right-panel-add-menu" ||
        overlay === "diff-scope-menu" ||
        overlay === "quick-switch" ||
        overlay === "file-picker" ||
        overlay === "model-picker" ||
        overlay === "project-action-dialog") &&
      !lynxOverlayInputSent &&
      webProviderNotificationCleared &&
      state?.lynx?.connected === true &&
      state?.lynx?.productState?.overlay !== overlay
    ) {
      if (
        (overlay === "quick-switch" || overlay === "file-picker") &&
        stateId !== "add-project-sources"
      ) {
        const dispatched = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('lynx-pane');
            return frame?.contentWindow?.__T3_LYNX_WEB_PREVIEW__?.dispatchKeyboardShortcut(
              ${JSON.stringify(overlay === "file-picker" ? "files" : "command")}
            ) ?? false;
          })()`,
        ).catch(() => false);
        if (dispatched) {
          lynxOverlayInputSent = true;
          lynxShortcutInputChannel =
            overlay === "file-picker"
              ? "lynx-host-keyboard-packet:meta-p"
              : "lynx-host-keyboard-packet:meta-k";
          lynxOverlayWaitPolls = 0;
        }
      } else {
        if (overlay === "workspace-menu") {
          const opened = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const frame = document.getElementById('lynx-pane');
              const probe = frame?.contentWindow?.__T3_LYNX_WEB_PREVIEW__?.openWorkspaceMenuForHarness;
              if (typeof probe !== 'function') return false;
              probe(true);
              return true;
            })()`,
          ).catch(() => false);
          if (opened) {
            lynxOverlayInputSent = true;
            lynxShortcutInputChannel = "lynx-workbench-probe:workspace-menu";
            lynxOverlayWaitPolls = 0;
            await delay(100);
            continue;
          }
        }
        const triggerSelector =
          stateId === "add-project-sources"
            ? '[aria-label="New project"]'
            : overlay === "project-scope"
              ? '[data-testid="sidebar-v2-project-scope-trigger"]'
              : overlay === "workspace-menu"
                ? '[aria-label="Workspace"]:not([data-composer-workspace-menu])'
                : overlay === "compact-controls"
                  ? ".composer-compact-controls-trigger"
                  : overlay === "right-panel-add-menu"
                    ? ".right-panel__add-btn"
                    : overlay === "diff-scope-menu"
                      ? '[data-floating-anchor="diff-scope-menu"]'
                      : overlay === "project-action-dialog"
                        ? '[aria-label="Add action"]'
                        : stateId === "settings-model-picker"
                          ? "[data-settings-model-picker-trigger]"
                          : '[data-composer-control="model"]';
        const point = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('lynx-pane');
            const doc = frame && frame.contentWindow && frame.contentWindow.document;
            const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
            const target = root?.querySelector(${JSON.stringify(triggerSelector)});
            if (!frame || !target || target.getAttribute('aria-disabled') === 'true') return null;
            target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
          })()`,
        ).catch(() => null);
        if (point) {
          await cdp.send(
            "Input.dispatchMouseEvent",
            { type: "mousePressed", ...point, button: "left", clickCount: 1 },
            sessionId,
          );
          await cdp.send(
            "Input.dispatchMouseEvent",
            { type: "mouseReleased", ...point, button: "left", clickCount: 1 },
            sessionId,
          );
          lynxOverlayInputSent = true;
        }
      }
    }
    if (
      stateId !== "add-project-sources" &&
      (overlay === "quick-switch" ||
        overlay === "file-picker" ||
        overlay === "model-picker" ||
        overlay === "workspace-menu" ||
        overlay === "compact-controls" ||
        overlay === "right-panel-add-menu" ||
        overlay === "diff-scope-menu" ||
        overlay === "project-action-dialog") &&
      lynxOverlayInputSent &&
      state?.lynx?.productState?.overlay !== overlay
    ) {
      lynxOverlayWaitPolls += 1;
      if (lynxOverlayWaitPolls >= 10) {
        lynxOverlayInputSent = false;
        lynxOverlayWaitPolls = 0;
      }
    }
    if (
      overlay &&
      query &&
      !overlayQueryInputSent &&
      state?.web?.productState?.overlay === overlay &&
      state?.lynx?.productState?.overlay === overlay
    ) {
      const selectors =
        overlay === "quick-switch" || overlay === "file-picker"
          ? {
              web: '[data-command-palette="true"] [data-slot="autocomplete-input"]',
              lynx: ".qs-search__input",
            }
          : {
              web: '[data-model-picker-content] [data-slot="combobox-input"]',
              lynx: ".picker-search__input",
            };
      const inputPoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, selector, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const host = root?.querySelector(selector);
            const target = shadow ? host?.shadowRoot?.querySelector('input') : host;
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
          };
          return {
            web: pointFor('web-pane', ${JSON.stringify(selectors.web)}, false),
            lynx: pointFor('lynx-pane', ${JSON.stringify(selectors.lynx)}, true),
          };
        })()`,
      ).catch(() => null);
      if (inputPoints?.web && inputPoints?.lynx) {
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", ...inputPoints.web, button: "left", clickCount: 1 },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", ...inputPoints.web, button: "left", clickCount: 1 },
          sessionId,
        );
        for (const character of query) {
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: "char",
              text: character,
              unmodifiedText: character,
            },
            sessionId,
          );
        }
        let lynxFocused = true;
        for (let index = 0; index < query.length; index += 1) {
          const character = query[index];
          const expectedPrefix = query.slice(0, index + 1);
          const focused = await focusRemoteElement(
            cdp,
            sessionId,
            `(() => {
              const frame = document.getElementById('lynx-pane');
              const innerDocument = frame?.contentWindow?.document;
              const root = innerDocument
                ?.getElementById('t3-lynx-preview')?.shadowRoot;
              const host = root?.querySelector(${JSON.stringify(selectors.lynx)});
              return host?.shadowRoot?.querySelector('input') ?? null;
            })()`,
          );
          if (!focused) {
            lynxFocused = false;
            break;
          }
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: "char",
              text: character,
              unmodifiedText: character,
            },
            sessionId,
          );
          const prefixDeadline = Date.now() + 1000;
          let prefixApplied = false;
          while (Date.now() < prefixDeadline) {
            const currentQuery = await evaluate(
              cdp,
              sessionId,
              `(() => window.__T3_WORKBENCH__?.read()?.lynx?.productState?.overlayQuery ?? "")()`,
            ).catch(() => "");
            if (currentQuery === expectedPrefix) {
              prefixApplied = true;
              break;
            }
            await delay(20);
          }
          if (!prefixApplied) {
            lynxFocused = false;
            break;
          }
        }
        overlayQueryInputSent = true;
        overlayQueryInputChannel = `web-cdp-pointer+key-char|lynx-dom-focus+key-char:${lynxFocused}`;
      }
    }
    if (
      overlay === "model-picker" &&
      providerId &&
      !providerInputSent &&
      modelPickerSemanticReadyPolls >= 3 &&
      state?.web?.productState?.overlay === overlay &&
      state?.lynx?.productState?.overlay === overlay
    ) {
      const providerPoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const semanticTarget = root?.querySelector(
              ${JSON.stringify(`[data-model-picker-provider="${providerId}"]`)},
            );
            const target =
              semanticTarget?.matches('button,[role="button"]')
                ? semanticTarget
                : semanticTarget?.querySelector('button,[role="button"]') ?? semanticTarget;
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            const localX = r.x + r.width / 2;
            const localY = r.y + r.height / 2;
            const documentHit = doc?.elementFromPoint(localX, localY);
            const shadowHit =
              shadow && root && "elementFromPoint" in root
                ? root.elementFromPoint(localX, localY)
                : null;
            return {
              x: fr.x + localX,
              y: fr.y + localY,
              target: {
                tagName: target.tagName,
                role: target.getAttribute('role'),
                rect: { x: r.x, y: r.y, width: r.width, height: r.height },
                documentHit: documentHit?.tagName ?? null,
                documentHitClass: documentHit?.getAttribute('class') ?? null,
                shadowHit: shadowHit?.tagName ?? null,
                shadowHitClass: shadowHit?.getAttribute('class') ?? null,
              },
            };
          };
          return {
            web: pointFor('web-pane', false),
            lynx: pointFor('lynx-pane', true),
          };
        })()`,
      ).catch(() => null);
      if (providerPoints?.web && providerPoints?.lynx) {
        providerInputDiagnostics = {
          web: providerPoints?.web?.target ?? null,
          lynx: providerPoints?.lynx?.target ?? null,
        };
        providerPointerTimeline.push({
          elapsedMs: Date.now() - readyStart,
          stage: "before-pointer",
          webProvider: state?.web?.overlayMetrics?.selectedProviderId ?? null,
          lynxProvider: state?.lynx?.overlayMetrics?.selectedProviderId ?? null,
          webOverlay: state?.web?.productState?.overlay ?? null,
          lynxOverlay: state?.lynx?.productState?.overlay ?? null,
        });
        await dispatchPointerClick(cdp, sessionId, providerPoints.web);
        await dispatchPointerClick(cdp, sessionId, providerPoints.lynx);
        providerInputSent = true;
        providerInputChannel = "web-cdp-pointer|lynx-cdp-pointer";
      }
    }
    if (
      composerInput &&
      !composerInputSent &&
      state?.web?.composerMetrics?.state === "idle" &&
      state?.lynx?.composerMetrics?.state === "idle" &&
      state?.web?.composerMetrics?.editor?.disabled !== true &&
      state?.lynx?.composerMetrics?.editor?.disabled !== true
    ) {
      composerInputDiagnostics = {
        branchEntered: true,
        webEditorDisabled: state?.web?.composerMetrics?.editor?.disabled ?? null,
        lynxEditorDisabled: state?.lynx?.composerMetrics?.editor?.disabled ?? null,
        webValue: state?.web?.composerMetrics?.editor?.value ?? null,
        lynxValue: state?.lynx?.composerMetrics?.editor?.value ?? null,
      };
      let webComposerEditorFocused = await focusRemoteElement(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          return frame?.contentWindow?.document?.querySelector('[data-composer-editor="true"]') ?? null;
        })()`,
      );
      composerInputDiagnostics.webDomFocus = webComposerEditorFocused;
      await cdp.send("Page.bringToFront", {}, sessionId);
      await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
      let webComposerInputChannel = "web-cdp-focus-emulation+pointer-raw-key";
      let webComposerFocusEmulationEnabled = true;
      {
        const webComposerEditorPoint = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            const editor = frame?.contentWindow?.document?.querySelector('[data-composer-editor="true"]');
            if (!frame || !editor) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = editor.getBoundingClientRect();
            return {
              x: frameRect.x + rect.x + Math.min(12, Math.max(1, rect.width / 2)),
              y: frameRect.y + rect.y + Math.min(12, Math.max(1, rect.height / 2)),
            };
          })()`,
        ).catch(() => null);
        composerInputDiagnostics.webPointerPoint = webComposerEditorPoint;
        if (webComposerEditorPoint) {
          await dispatchPointerClickWithMove(cdp, sessionId, webComposerEditorPoint);
          webComposerEditorFocused = true;
        }
      }
      let lynxComposerEditorFocused = true;
      if (webComposerEditorFocused) {
        for (let index = 0; index < composerInput.length; index += 1) {
          const character = composerInput[index];
          const expectedPrefix = composerInput.slice(0, index + 1);
          const sequence = cdpKeySequenceForCharacter(character);
          await cdp.send("Input.dispatchKeyEvent", sequence.keyDown, sessionId);
          await cdp.send("Input.dispatchKeyEvent", sequence.keyUp, sessionId);
          const prefixDeadline = Date.now() + 1_000;
          let prefixApplied = false;
          while (Date.now() < prefixDeadline) {
            const currentValue = await evaluate(
              cdp,
              sessionId,
              `(() => window.__T3_WORKBENCH__?.read()?.web?.composerMetrics?.editor?.value ?? "")()`,
            ).catch(() => "");
            if (currentValue === expectedPrefix) {
              prefixApplied = true;
              break;
            }
            await delay(20);
          }
          if (!prefixApplied) {
            composerInputDiagnostics.webFailedPrefix = expectedPrefix;
            webComposerEditorFocused = false;
            break;
          }
        }
        for (let index = 0; webComposerEditorFocused && index < composerInput.length; index += 1) {
          const character = composerInput[index];
          const expectedPrefix = composerInput.slice(0, index + 1);
          const focused = await focusRemoteElement(
            cdp,
            sessionId,
            `(() => {
              const frame = document.getElementById('lynx-pane');
              const doc = frame?.contentWindow?.document;
              const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
              const host = root?.querySelector('[data-composer-editor="true"]');
              return host?.shadowRoot?.querySelector('textarea') ?? host ?? null;
            })()`,
          );
          if (!focused) {
            lynxComposerEditorFocused = false;
            break;
          }
          await cdp.send("Input.insertText", { text: character }, sessionId);
          const prefixDeadline = Date.now() + 1000;
          let prefixApplied = false;
          while (Date.now() < prefixDeadline) {
            const currentValue = await evaluate(
              cdp,
              sessionId,
              `(() => window.__T3_WORKBENCH__?.read()?.lynx?.composerMetrics?.editor?.value ?? "")()`,
            ).catch(() => "");
            if (currentValue === expectedPrefix) {
              prefixApplied = true;
              break;
            }
            await delay(20);
          }
          if (!prefixApplied) {
            lynxComposerEditorFocused = false;
            break;
          }
        }
        composerInputSent = true;
        composerInputChannel = `${webComposerInputChannel}:${webComposerEditorFocused}|lynx-dom-focus+key-char:${lynxComposerEditorFocused}`;
        await cdp
          .send("Emulation.setFocusEmulationEnabled", { enabled: false }, sessionId)
          .catch(() => undefined);
        webComposerFocusEmulationEnabled = false;
      }
      composerInputDiagnostics.webInputAccepted = webComposerEditorFocused;
      composerInputDiagnostics.lynxInputAccepted = lynxComposerEditorFocused;
      if (webComposerFocusEmulationEnabled) {
        await cdp
          .send("Emulation.setFocusEmulationEnabled", { enabled: false }, sessionId)
          .catch(() => undefined);
      }
    }
    const overlayReady =
      !overlay ||
      (state?.web?.productState?.overlay === overlay &&
        state?.lynx?.productState?.overlay === overlay &&
        (overlay !== "quick-switch" ||
          stateId === "add-project-sources" ||
          quickSwitchAnatomyMatches(state?.web?.overlayMetrics, state?.lynx?.overlayMetrics)) &&
        (!query ||
          (state?.web?.productState?.overlayQuery === query &&
            state?.lynx?.productState?.overlayQuery === query)) &&
        (!providerId ||
          (state?.web?.overlayMetrics?.selectedProviderId === providerId &&
            state?.lynx?.overlayMetrics?.selectedProviderId === providerId)));
    const currentModelPickerSemanticMatch =
      overlay !== "model-picker" ||
      modelPickerSemanticsMatch(state?.web?.overlayMetrics, state?.lynx?.overlayMetrics);
    modelPickerSemanticReadyPolls = currentModelPickerSemanticMatch
      ? modelPickerSemanticReadyPolls + 1
      : 0;
    if (providerId) {
      providerReadyPolls = overlayReady ? providerReadyPolls + 1 : 0;
    }
    const threadReady =
      !expectThread ||
      (webThreadInputSent &&
        lynxThreadInputSent &&
        state?.web?.productState?.selectedThread === expectThread &&
        state?.lynx?.productState?.selectedThread === expectThread);
    const settingsAsyncReady =
      stateId === "settings-source-control-loading"
        ? state?.web?.settingsMetrics?.loading === true &&
          state?.lynx?.settingsMetrics?.loading === true
        : stateId === "settings-source-control-error"
          ? state?.web?.settingsMetrics?.loading === false &&
            state?.lynx?.settingsMetrics?.loading === false &&
            (state?.web?.settingsMetrics?.errorTexts ?? []).some((text) =>
              text?.includes("Source-control discovery is unavailable"),
            ) &&
            (state?.lynx?.settingsMetrics?.errorTexts ?? []).some((text) =>
              text?.includes("Source-control discovery is unavailable"),
            )
          : stateId !== "settings-source-control" ||
            ((state?.web?.settingsMetrics?.rowIds ?? []).includes("source-control") &&
              (state?.lynx?.settingsMetrics?.rowIds ?? []).includes("source-control"));
    const settingsGeometryReady =
      generalSettingsGeometryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
      connectionsSettingsGeometryMatches(
        state?.web?.settingsMetrics,
        state?.lynx?.settingsMetrics,
      ) &&
      archiveSettingsGeometryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
      betaSettingsGeometryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
      (stateId !== "settings-source-control-loading" ||
        sourceControlLoadingSettingsGeometryMatches(
          state?.web?.settingsMetrics,
          state?.lynx?.settingsMetrics,
        )) &&
      (stateId !== "settings-source-control-error" ||
        sourceControlErrorSettingsGeometryMatches(
          state?.web?.settingsMetrics,
          state?.lynx?.settingsMetrics,
        ));
    const settingsNavigationReady = settingsNavigationStateMatches(state);
    const settingsDesktopTopbarReady = settingsDesktopTopbarMatches(state);
    const legacySettingsReady = legacySidebarSettingsReady(state);
    settingsAsyncReadyPolls =
      settingsAsyncReady &&
      settingsGeometryReady &&
      settingsNavigationReady &&
      settingsDesktopTopbarReady &&
      legacySettingsReady
        ? settingsAsyncReadyPolls + 1
        : 0;
    const webTimelineRows = state?.web?.timelineMetrics?.rows ?? [];
    const lynxTimelineRows = state?.lynx?.timelineMetrics?.rows ?? [];
    const transcriptReady =
      (!stateId.startsWith("existing-thread-") && !isNarrowChatThreadState) ||
      (isEmptyTranscriptState
        ? state?.web?.timelineMetrics?.threadSyncLabel === null &&
          state?.web?.timelineMetrics?.empty?.text === state?.lynx?.timelineMetrics?.empty?.text &&
          webTimelineRows.length === 0 &&
          lynxTimelineRows.length === 0
        : webTimelineRows.length > 0 &&
          JSON.stringify(webTimelineRows) === JSON.stringify(lynxTimelineRows) &&
          workingTranscriptGeometryMatches(
            state?.web?.timelineMetrics,
            state?.lynx?.timelineMetrics,
          ) &&
          narrowChatResponsiveMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics));
    transcriptReadyPolls = transcriptReady ? transcriptReadyPolls + 1 : 0;
    const expectedPendingKind =
      stateId === "existing-thread-approval"
        ? "approval"
        : stateId === "existing-thread-question" || isMultiStepQuestionState
          ? "question"
          : null;
    const pendingRequestReady =
      expectedPendingKind === null ||
      (state?.web?.pendingRequestMetrics?.kind === expectedPendingKind &&
        state?.lynx?.pendingRequestMetrics?.kind === expectedPendingKind &&
        JSON.stringify(pendingRequestSemantics(state?.web?.pendingRequestMetrics)) ===
          JSON.stringify(pendingRequestSemantics(state?.lynx?.pendingRequestMetrics)) &&
        approvalComposerMatches(state?.web?.composerMetrics, state?.lynx?.composerMetrics));
    pendingRequestReadyPolls = pendingRequestReady ? pendingRequestReadyPolls + 1 : 0;
    const composerInputReady =
      !composerInput ||
      (state?.web?.composerMetrics?.editor?.value === composerInput &&
        state?.lynx?.composerMetrics?.editor?.value === composerInput);
    const composerStateReady =
      composerExpectation === null ||
      composerPairMatches(
        state?.web?.composerMetrics,
        state?.lynx?.composerMetrics,
        composerExpectation,
        height,
      );
    const composerReady =
      isFlatSidebarLayoutState ||
      isNarrowChatThreadState ||
      (isReviewState && width <= 1023) ||
      (composerInputReady &&
        composerStateReady &&
        composerAnatomyMatches(state?.web?.composerMetrics, state?.lynx?.composerMetrics) &&
        completedComposerProviderStateMatches(state) &&
        completedNoDiffStateMatches(state) &&
        completedProjectFaviconMatches(state) &&
        completedHeaderOpenActionMatches(state));
    const planModeReady = composerPlanModeMatches(state);
    const sessionProjectionReady = sessionProjectionMatches(state, expectedThreadFixture);
    const stageIdentityReady = sidebarStageIdentityMatches(state);
    const sidebarControlGeometryReady = sidebarControlGeometryMatches(state);
    const sidebarProjectGroupsReady = sidebarProjectGroupsMatch(state);
    const flatSidebarLayoutReady = flatSidebarLayoutMatches(state);
    const addProjectSourcesReady = addProjectSourcesMatch(state);
    const sidebarFooterThemeReady =
      isNarrowChatThreadState ||
      (isReviewState && width <= 1023) ||
      sidebarFooterThemeMatches(state, width, height);
    const compactControlsReady = compactControlsEvidenceReady(state);
    const projectActionReady = projectActionDialogReady(state);
    const projectSettingsStateReady = projectSettingsReady(state, projectSettingsInteraction);
    const rightPanelAddMenuStateReady = rightPanelAddMenuReady(state);
    const diffScopeMenuStateReady = diffScopeMenuReady(state);
    const sidebarWorkingGeometryReady = sidebarWorkingGeometryMatches(state, expectedThreadFixture);
    const headerGitActionReady = isFlatSidebarLayoutState || headerGitActionMatches(state);
    const gitPublishDialogReady = gitPublishDialogMatches(state);
    const filesBrowserStateReady = filesBrowserSemanticReady(state);
    const settledBannerInlineFilesStateReady = settledBannerInlineFilesReady(state);
    filesBrowserReadyPolls = filesBrowserStateReady
      ? filesBrowserReadyPolls + 1
      : isFileEditorState
        ? filesBrowserReadyPolls
        : 0;
    const fileEditorStateReady = fileEditorReady(state);
    fileEditorReadyPolls = fileEditorStateReady ? fileEditorReadyPolls + 1 : 0;
    const gitPublishDiscoveryReady =
      !isGitPublishDialogState ||
      state?.lynx?.connectorDiagnostics?.commandResults?.some(
        ({ method }) => method === "discoverSourceControl",
      ) === true;
    const shortcutInputReady =
      !requiresShortcutInput ||
      (webOverlayInputSent &&
        lynxOverlayInputSent &&
        webShortcutInputChannel !== "pending" &&
        lynxShortcutInputChannel !== "pending");
    const sidebarSearchReady =
      !sidebarQuery ||
      (webSidebarSearchInputSent &&
        lynxSidebarSearchInputSent &&
        state?.web?.sidebarDiagnostics?.search?.value === sidebarQuery &&
        state?.lynx?.sidebarDiagnostics?.search?.value === sidebarQuery &&
        rectDeltaWithin(
          state?.web?.sidebarDiagnostics?.search?.inputBox,
          state?.lynx?.sidebarDiagnostics?.search?.inputBox,
          1,
        ) &&
        (state?.web?.sidebarDiagnostics?.search?.resultTitles?.length ?? 0) > 0 &&
        JSON.stringify(state?.web?.sidebarDiagnostics?.search?.resultTitles ?? []) ===
          JSON.stringify(state?.lynx?.sidebarDiagnostics?.search?.resultTitles ?? []));
    const sidebarStateReady =
      !sidebarTargetState ||
      (webSidebarStateInputSent &&
        lynxSidebarStateInputSent &&
        state?.web?.sidebarDiagnostics?.state === sidebarTargetState &&
        state?.lynx?.sidebarDiagnostics?.state === sidebarTargetState);
    const changedFilesStateReady =
      !changedFilesTargetState ||
      (webChangedFilesInputSent &&
        lynxChangedFilesInputSent &&
        normalizedChangedFilesState(state?.web?.reviewMetrics) === changedFilesTargetState &&
        normalizedChangedFilesState(state?.lynx?.reviewMetrics) === changedFilesTargetState);
    const coreGeometryReady =
      isFlatSidebarLayoutState ||
      isSidebarThreadHoverPreviewState ||
      isNarrowChatThreadState ||
      completedNoDiffGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) ||
      (isReviewState && width <= 1023) ||
      coreGeometryMatches(state?.web, state?.lynx);
    const heroGeometryReady = heroGeometryMatches(state);
    const reviewReady = Object.values(
      reviewReadinessBreakdown(state?.web, state?.lynx, reviewExpectation, width),
    ).every(Boolean);
    const lifecycleReady =
      !isLifecycleFaultState ||
      (ownedServerTerminated &&
        state?.web?.connected === false &&
        state?.lynx?.connected === false &&
        state?.web?.productState?.lifecycle === "connecting" &&
        state?.lynx?.productState?.lifecycle === "connecting");
    const semanticStateReady = isLifecycleFaultState
      ? lifecycleReady
      : state?.web?.semanticReady === true && state?.lynx?.semanticReady === true;
    if (
      state &&
      semanticStateReady &&
      overlayReady &&
      providerReadyPolls >= 3 &&
      modelPickerSemanticReadyPolls >= 3 &&
      threadReady &&
      settingsAsyncReadyPolls >= (stateId === "settings-source-control-loading" ? 1 : 10) &&
      transcriptReadyPolls >= 1 &&
      pendingRequestReadyPolls >= 1 &&
      composerReady &&
      planModeReady &&
      sessionProjectionReady &&
      stageIdentityReady &&
      sidebarControlGeometryReady &&
      sidebarProjectGroupsReady &&
      flatSidebarLayoutReady &&
      sidebarFooterThemeReady &&
      compactControlsReady &&
      projectActionReady &&
      projectSettingsStateReady &&
      rightPanelAddMenuStateReady &&
      diffScopeMenuStateReady &&
      sidebarWorkingGeometryReady &&
      headerGitActionReady &&
      gitPublishDiscoveryReady &&
      gitPublishDialogReady &&
      filesBrowserReadyPolls >= (isFileEditorState ? 1 : 3) &&
      settledBannerInlineFilesStateReady &&
      fileEditorReadyPolls >= (isNarrowFileEditorState ? 1 : 3) &&
      shortcutInputReady &&
      sidebarSearchReady &&
      sidebarStateReady &&
      changedFilesStateReady &&
      coreGeometryReady &&
      heroGeometryReady &&
      reviewReady &&
      lifecycleReady
    ) {
      reachedTargetState = true;
      break;
    }
    await delay(100);
  }
  if (isFailedThreadDismissedState) {
    const initialFailureText = state?.web?.threadErrorBannerMetrics?.text ?? "";
    if (
      !initialFailureText ||
      !state?.web?.threadErrorBannerMetrics?.banner ||
      !state?.lynx?.threadErrorBannerMetrics?.banner
    ) {
      throw new Error("Failed-thread dismissal requires both initial error banners");
    }
    for (const client of ["lynx", "web"]) {
      const click = await clickThreadErrorDismiss(cdp, sessionId, client);
      if (!click) {
        throw new Error(`Missing ${client} failed-thread dismiss control`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) => next?.[client]?.threadErrorBannerMetrics?.text !== initialFailureText,
        3_000,
        `${client} dismissed failed-thread banner`,
      ).catch(async (cause) => {
        const latest = await readWorkbenchState(cdp, sessionId);
        throw new Error(
          `${cause instanceof Error ? cause.message : String(cause)}; click=${JSON.stringify(click)}; latest=${JSON.stringify(latest?.[client]?.threadErrorBannerMetrics)}`,
        );
      });
      failedThreadDismissalTimeline.push({
        client,
        step: "dismissed",
        replacementBanner: state?.[client]?.threadErrorBannerMetrics?.text ?? null,
      });
    }
    reachedTargetState = true;
  }
  if (isKeybindingsMutationState) {
    const command = "settings.open";
    const shortcut = "mod+shift+y";
    const beforeCount = state?.lynx?.settingsMetrics?.keybindings?.rows?.length ?? 0;
    const addPoint = await keybindingsControlPoint(
      cdp,
      sessionId,
      "lynx",
      '[aria-label="Add keybinding"]',
    );
    if (!addPoint) throw new Error("Missing Lynx Add keybinding control");
    await dispatchPointerClickWithMove(cdp, sessionId, addPoint);
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => next?.lynx?.settingsMetrics?.keybindings?.addRow !== null,
      3_000,
      "Lynx keybinding add row",
    );
    keybindingsMutationTimeline.push({ step: "opened", beforeCount });
    await fillLynxKeybindingInput(cdp, sessionId, "Keybinding command", command);
    await fillLynxKeybindingInput(cdp, sessionId, "Keybinding shortcut", shortcut);
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => {
        const addRow = next?.lynx?.settingsMetrics?.keybindings?.addRow;
        return (
          addRow?.values?.command === command &&
          addRow?.values?.shortcut === shortcut &&
          addRow?.saveDisabled === false
        );
      },
      3_000,
      "enabled Lynx keybinding save",
    );
    const savePoint = await keybindingsControlPoint(
      cdp,
      sessionId,
      "lynx",
      '[aria-label="Save keybinding"]',
    );
    if (!savePoint) throw new Error("Missing Lynx Save keybinding control");
    await dispatchPointerClickWithMove(cdp, sessionId, savePoint);
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => {
        const rowFor = (client) =>
          next?.[client]?.settingsMetrics?.keybindings?.rows?.find(
            (row) => row.command === command && row.shortcut.includes("Y"),
          ) ?? null;
        const upsertObserved =
          next?.lynx?.connectorDiagnostics?.commands?.some(
            ({ method }) => method === "upsertKeybinding",
          ) === true;
        const webRow = rowFor("web");
        const lynxRow = rowFor("lynx");
        return Boolean(webRow && lynxRow && webRow.shortcut === lynxRow.shortcut && upsertObserved);
      },
      5_000,
      "persisted keybinding in both renderers",
    );
    keybindingsMutationTimeline.push({
      step: "saved",
      command,
      shortcut,
      webCount: state?.web?.settingsMetrics?.keybindings?.rows?.length ?? 0,
      lynxCount: state?.lynx?.settingsMetrics?.keybindings?.rows?.length ?? 0,
    });
    if (isKeybindingsEditResetMutationState) {
      const label = "Settings: Open";
      const editedShortcut = "mod+shift+u";
      const editPoint = await keybindingsControlPoint(
        cdp,
        sessionId,
        "lynx",
        `[aria-label="Edit shortcut for ${label}"]`,
      );
      if (!editPoint) throw new Error(`Missing Lynx Edit shortcut for ${label} control`);
      await dispatchPointerClickWithMove(cdp, sessionId, editPoint);
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          next?.lynx?.settingsMetrics?.keybindings?.rows?.some(
            (row) => row.command === command && row.editing !== null,
          ) === true,
        3_000,
        "Lynx keybinding edit row",
      );
      await fillLynxKeybindingInput(cdp, sessionId, `Keybinding for ${label}`, editedShortcut, {
        replace: true,
      });
      const saveEditPoint = await keybindingsControlPoint(
        cdp,
        sessionId,
        "lynx",
        `[aria-label="Save ${label} keybinding"]`,
      );
      if (!saveEditPoint) throw new Error(`Missing Lynx Save ${label} keybinding control`);
      await dispatchPointerClickWithMove(cdp, sessionId, saveEditPoint);
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) => {
          const rowFor = (client) =>
            next?.[client]?.settingsMetrics?.keybindings?.rows?.find(
              (row) => row.command === command && row.shortcut.includes("U"),
            ) ?? null;
          return Boolean(rowFor("web") && rowFor("lynx"));
        },
        5_000,
        "edited keybinding in both renderers",
      );
      keybindingsMutationTimeline.push({ step: "edited", command, shortcut: editedShortcut });
      const resetPoint = await keybindingsControlPoint(
        cdp,
        sessionId,
        "lynx",
        `[aria-label="Reset ${label} to default"]`,
      );
      if (!resetPoint) throw new Error(`Missing Lynx Reset ${label} to default control`);
      await dispatchPointerClickWithMove(cdp, sessionId, resetPoint);
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) => {
          const matchingRows = (client) =>
            next?.[client]?.settingsMetrics?.keybindings?.rows?.filter(
              (row) => row.command === command,
            ) ?? [];
          return (
            matchingRows("web").some((row) => row.source === "Default") &&
            matchingRows("lynx").some((row) => row.source === "Default") &&
            !matchingRows("web").some((row) => row.shortcut.includes("U")) &&
            !matchingRows("lynx").some((row) => row.shortcut.includes("U"))
          );
        },
        5_000,
        "reset keybinding in both renderers",
      );
      keybindingsMutationTimeline.push({ step: "reset", command });
    }
    if (isKeybindingsRemoveMutationState) {
      const removePoint = await keybindingsControlPoint(
        cdp,
        sessionId,
        "lynx",
        '[aria-label="Remove Settings: Open keybinding"]',
      );
      if (!removePoint) throw new Error("Missing Lynx Remove Settings: Open keybinding control");
      await dispatchPointerClickWithMove(cdp, sessionId, removePoint);
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) => {
          const rowPresent = (client) =>
            next?.[client]?.settingsMetrics?.keybindings?.rows?.some(
              (row) => row.command === command && row.shortcut.includes("Y"),
            ) === true;
          const removeObserved =
            next?.lynx?.connectorDiagnostics?.commands?.some(
              ({ method }) => method === "removeKeybinding",
            ) === true;
          return !rowPresent("web") && !rowPresent("lynx") && removeObserved;
        },
        5_000,
        "removed keybinding from both renderers",
      );
      keybindingsMutationTimeline.push({
        step: "removed",
        command,
        webCount: state?.web?.settingsMetrics?.keybindings?.rows?.length ?? 0,
        lynxCount: state?.lynx?.settingsMetrics?.keybindings?.rows?.length ?? 0,
      });
    }
    reachedTargetState = true;
  }
  if (stateId === "settings-keybindings" && keybindingsQuery) {
    const beforeCounts = {
      web: state?.web?.settingsMetrics?.keybindings?.rows?.length ?? 0,
      lynx: state?.lynx?.settingsMetrics?.keybindings?.rows?.length ?? 0,
    };
    for (const client of ["lynx", "web"]) {
      const searchPoint = await keybindingsControlPoint(
        cdp,
        sessionId,
        client,
        '[aria-label="Search keybindings"]',
      );
      if (!searchPoint) throw new Error(`Missing ${client} Keybindings search control`);
      await dispatchPointerClickWithMove(cdp, sessionId, searchPoint);
      await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) => next?.[client]?.settingsMetrics?.keybindings?.search?.expanded === true,
        3_000,
        `${client} Keybindings search expansion`,
      );
      await fillKeybindingsSearchInput(cdp, sessionId, client, keybindingsQuery);
    }
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => {
        const web = next?.web?.settingsMetrics?.keybindings;
        const lynx = next?.lynx?.settingsMetrics?.keybindings;
        return (
          web?.search?.value === keybindingsQuery &&
          lynx?.search?.value === keybindingsQuery &&
          (web?.rows?.length ?? 0) > 0 &&
          (web?.rows?.length ?? 0) < beforeCounts.web &&
          JSON.stringify(
            web?.rows?.map(({ command, shortcut, when, source }) => ({
              command,
              shortcut,
              when,
              source,
            })) ?? [],
          ) ===
            JSON.stringify(
              lynx?.rows?.map(({ command, shortcut, when, source }) => ({
                command,
                shortcut,
                when,
                source,
              })) ?? [],
            )
        );
      },
      5_000,
      "paired Keybindings search result",
    );
    if (beforeCounts.web !== beforeCounts.lynx) {
      throw new Error(`Keybindings initial row counts differed: ${JSON.stringify(beforeCounts)}`);
    }
    reachedTargetState = true;
  }
  if (isNewThreadHeroState && !unpersistedHeroStateReady(state)) {
    state = await waitForSidebarV2Controls(cdp, sessionId);
    for (const client of ["web", "lynx"]) {
      if (
        state?.[client]?.heroPresent === true &&
        state?.[client]?.productState?.selectedThread === null &&
        ["draft", "none"].includes(state?.[client]?.productState?.activeThreadKind)
      ) {
        newThreadHeroNavigationTimeline.push({ client, step: "already-draft" });
        continue;
      }
      if (!(await clickSidebarControl(cdp, sessionId, client, ".sidebar-v2-new-thread"))) {
        throw new Error(`Missing ${client} New thread trigger for hero state`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          (next?.[client]?.heroPresent === true &&
            next?.[client]?.productState?.selectedThread === null &&
            ["draft", "none"].includes(next?.[client]?.productState?.activeThreadKind)) ||
          (client === "web"
            ? next?.web?.overlayMetrics?.paletteView === "submenu"
            : next?.lynx?.overlayMetrics?.paletteView === "new-thread-projects"),
        3_000,
        `${client} new thread navigation for hero state`,
      );
      if (
        state?.[client]?.heroPresent === true &&
        state?.[client]?.productState?.selectedThread === null &&
        ["draft", "none"].includes(state?.[client]?.productState?.activeThreadKind)
      ) {
        newThreadHeroNavigationTimeline.push({ client, step: "direct-draft" });
        continue;
      }
      const labels = state?.[client]?.overlayMetrics?.rowLabels ?? [];
      const projectLabel = labels.find((label) => label === expectProject) ?? labels[0] ?? "";
      if (!projectLabel || !(await clickPaletteRow(cdp, sessionId, client, projectLabel))) {
        throw new Error(`${client} new thread project picker had no selectable project`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          next?.[client]?.productState?.overlay === null &&
          next?.[client]?.heroPresent === true &&
          next?.[client]?.productState?.selectedThread === null &&
          ["draft", "none"].includes(next?.[client]?.productState?.activeThreadKind),
        3_000,
        `${client} local draft for hero state`,
      );
      newThreadHeroNavigationTimeline.push({ client, step: "selected-project", projectLabel });
    }
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) =>
        unpersistedHeroStateReady(next) &&
        composerAnatomyMatches(next?.web?.composerMetrics, next?.lynx?.composerMetrics) &&
        composerToolbarAllocationMatches(next?.web?.composerMetrics, next?.lynx?.composerMetrics),
      10_000,
      "paired stable local drafts for hero state",
    );
    await movePointer(cdp, sessionId, { x: width + width / 2, y: height / 2 });
    await invokeLynxTooltipProbe(cdp, sessionId, "sidebar-new-thread-tooltip", "leave");
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) =>
        next?.web?.sidebarDiagnostics?.chrome?.newThread?.attributes?.[
          "data-tooltip-pointer-inside"
        ] !== "true" &&
        next?.lynx?.sidebarDiagnostics?.chrome?.newThread?.attributes?.[
          "data-tooltip-pointer-inside"
        ] !== "true",
      3_000,
      "neutral pointer after paired hero navigation",
    );
    newThreadHeroNavigationTimeline.push({ client: "both", step: "pointer-neutral" });
    reachedTargetState = true;
  }
  if (stateId === "command-palette-navigation") {
    const navigation = await runCommandPaletteNavigationFlow(cdp, sessionId);
    state = navigation.state;
    commandPaletteNavigationTimeline.push(...navigation.timeline);
    commandPaletteNavigationStage = "complete";
    webShortcutInputChannel = "cdp-meta-k";
    lynxShortcutInputChannel = "lynx-host-keyboard-packet:meta-k";
    reachedTargetState = true;
  }
  if (isModelPickerInteractionState) {
    const readPair = () => readWorkbenchState(cdp, sessionId);
    const waitForOverlay = async (open, label) =>
      waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          (next?.web?.productState?.overlay === "model-picker") === open &&
          (next?.lynx?.productState?.overlay === "model-picker") === open,
        3_000,
        label,
      );
    const pointsFor = (selectors) =>
      evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, shadow, selector) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const target = root?.querySelector(selector);
            if (!frame || !target) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = target.getBoundingClientRect();
            return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
          };
          return {
            web: pointFor('web-pane', false, ${JSON.stringify(selectors.web)}),
            lynx: pointFor('lynx-pane', true, ${JSON.stringify(selectors.lynx)}),
          };
        })()`,
      );
    const clickPair = async (selectors, label) => {
      const points = await pointsFor(selectors);
      if (!points?.web || !points?.lynx) {
        throw new Error(`Missing model picker ${label}: ${JSON.stringify(points)}`);
      }
      await dispatchPointerClickWithMove(cdp, sessionId, points.web);
      await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
      return points;
    };
    const triggerSelectors = {
      web: '[data-composer-control="model"]',
      lynx: '[data-composer-control="model"]',
    };
    const timeline = [];
    state = await waitForOverlay(true, "model picker interaction initial open");
    timeline.push({ step: "opened" });
    await clickPair(
      { web: "[data-chat-header]", lynx: "[data-chat-header]" },
      "outside dismiss target",
    );
    state = await waitForOverlay(false, "model picker outside dismiss");
    timeline.push({ step: "outside-dismissed" });
    await clickPair(triggerSelectors, "reopen trigger");
    state = await waitForOverlay(true, "model picker reopen for close button");
    const closePoints = await pointsFor({
      web: '[data-composer-control="model"]',
      lynx: ".model-picker-close",
    });
    if (!closePoints?.web || !closePoints?.lynx) {
      throw new Error(`Missing model picker close targets: ${JSON.stringify(closePoints)}`);
    }
    await dispatchPointerClickWithMove(cdp, sessionId, closePoints.web);
    await dispatchPointerClickWithMove(cdp, sessionId, closePoints.lynx);
    state = await waitForOverlay(false, "model picker close button dismiss");
    timeline.push({ step: "close-dismissed" });
    await clickPair(triggerSelectors, "reopen trigger for scroll");
    state = await waitForOverlay(true, "model picker reopen for scroll");
    const beforeScroll = {
      web: state?.web?.overlayMetrics?.anatomy?.list?.scroll ?? null,
      lynx: state?.lynx?.overlayMetrics?.anatomy?.list?.scroll ?? null,
    };
    const targetKey = state?.web?.overlayMetrics?.semanticKeys?.find((key) => {
      const webRow = state?.web?.overlayMetrics?.modelPickerRows?.find((row) => row.key === key);
      const lynxRow = state?.lynx?.overlayMetrics?.modelPickerRows?.find((row) => row.key === key);
      return (
        key !== state?.web?.overlayMetrics?.selectedModelKey &&
        webRow?.disabled !== true &&
        lynxRow?.disabled !== true
      );
    });
    if (!targetKey || !state?.lynx?.overlayMetrics?.semanticKeys?.includes(targetKey)) {
      throw new Error(`No shared model-picker selection target: ${targetKey}`);
    }
    const selectionSelectors = {
      web: `[data-model-picker-key=${JSON.stringify(targetKey)}]`,
      lynx: `[data-model-picker-key=${JSON.stringify(targetKey)}]`,
    };
    const selectionPoints = await pointsFor(selectionSelectors);
    if (!selectionPoints?.web || !selectionPoints?.lynx) {
      throw new Error(`Missing model picker selection target: ${JSON.stringify(selectionPoints)}`);
    }
    timeline.push({
      step: "before-selection",
      targetKey,
      selectionPoints,
      webRow: state?.web?.overlayMetrics?.modelPickerRows?.find((row) => row.key === targetKey),
      lynxRow: state?.lynx?.overlayMetrics?.modelPickerRows?.find((row) => row.key === targetKey),
    });
    await dispatchPointerClick(cdp, sessionId, selectionPoints.lynx);
    await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => next?.lynx?.productState?.overlay !== "model-picker",
      3_000,
      "Lynx model picker selection dismiss",
    );
    await dispatchPointerClick(cdp, sessionId, selectionPoints.web);
    state = await waitForOverlay(false, "model picker selection dismiss");
    const expectedLabel = targetKey.split(":").at(-1);
    const selected =
      state?.web?.productState?.visibleModelLabel?.toLowerCase().includes(expectedLabel) === true &&
      state?.lynx?.productState?.visibleModelLabel?.toLowerCase().includes(expectedLabel) === true;
    await clickPair(triggerSelectors, "reopen trigger for scroll");
    state = await waitForOverlay(true, "model picker reopen for scroll");
    const listPoints = await pointsFor({
      web: '[data-model-picker-content] [data-slot="combobox-list"]',
      lynx: ".picker-list",
    });
    if (!listPoints?.web || !listPoints?.lynx) throw new Error("Missing model picker scroll lists");
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseWheel", ...listPoints.web, deltaX: 0, deltaY: 180 },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseWheel", ...listPoints.lynx, deltaX: 0, deltaY: 180 },
      sessionId,
    );
    await delay(500);
    state = await readPair();
    const afterScroll = {
      web: state?.web?.overlayMetrics?.anatomy?.list?.scroll ?? null,
      lynx: state?.lynx?.overlayMetrics?.anatomy?.list?.scroll ?? null,
    };
    timeline.push({ step: "scrolled", beforeScroll, afterScroll });
    modelPickerInteractionEvidence = {
      inputChannel: "dual-cdp-pointer|dual-cdp-wheel|lynx-main-thread-close",
      timeline,
      targetKey,
      selectionPoints,
      webLabel: state?.web?.productState?.visibleModelLabel ?? null,
      lynxLabel: state?.lynx?.productState?.visibleModelLabel ?? null,
      match:
        selected &&
        state?.web?.productState?.overlay === "model-picker" &&
        state?.lynx?.productState?.overlay === "model-picker",
    };
    reachedTargetState = modelPickerInteractionEvidence.match;
  }
  if (isMultiStepQuestionState) {
    const readPair = () => readWorkbenchState(cdp, sessionId);
    const waitForPair = async (label, predicate, waitTimeoutMs = timeoutMs) => {
      const stateDeadline = Date.now() + waitTimeoutMs;
      let latest = null;
      while (Date.now() < stateDeadline) {
        latest = await readPair();
        if (predicate(latest?.web?.pendingRequestMetrics, latest?.lynx?.pendingRequestMetrics)) {
          return latest;
        }
        await delay(50);
      }
      throw new Error(
        `Timed out waiting for multi-step question ${label}: ${JSON.stringify({
          web: {
            connected: latest?.web?.connected ?? null,
            productState: latest?.web?.productState ?? null,
            literalRoute: latest?.web?.literalRoute ?? null,
            composer: latest?.web?.composerMetrics ?? null,
            timeline: latest?.web?.timelineMetrics ?? null,
            pendingRequest: latest?.web?.pendingRequestMetrics ?? null,
          },
          lynx: {
            connected: latest?.lynx?.connected ?? null,
            productState: latest?.lynx?.productState ?? null,
            composer: latest?.lynx?.composerMetrics ?? null,
            timeline: latest?.lynx?.timelineMetrics ?? null,
            pendingRequest: latest?.lynx?.pendingRequestMetrics ?? null,
          },
        })}`,
      );
    };
    const clickPane = async (client, selector, label, fallback = false) => {
      const point = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
          const doc = frame?.contentWindow?.document;
          const root =
            ${JSON.stringify(client)} === 'lynx'
              ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
              : doc;
          const target = root?.querySelector(${JSON.stringify(selector)});
          if (!frame || !target) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          if (${fallback ? "true" : "false"}) {
            target.click();
          }
          return {
            x: frameRect.x + rect.x + rect.width / 2,
            y: frameRect.y + rect.y + rect.height / 2,
          };
        })()`,
      );
      if (!point) {
        throw new Error(`Missing ${client} multi-step question ${label} target.`);
      }
      if (!fallback) {
        await dispatchPointerClickWithMove(cdp, sessionId, point);
      }
      multiStepQuestionTimeline.push({
        client,
        label,
        channel: fallback ? "dom-click-fallback" : "cdp-pointer",
        point,
      });
    };
    const clickPair = async (selector, label) => {
      const points = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const target = root?.querySelector(${JSON.stringify(selector)});
            if (!frame || !target) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = target.getBoundingClientRect();
            return {
              x: frameRect.x + rect.x + rect.width / 2,
              y: frameRect.y + rect.y + rect.height / 2,
            };
          };
          return {
            web: pointFor('web-pane', false),
            lynx: pointFor('lynx-pane', true),
          };
        })()`,
      );
      if (!points?.web || !points?.lynx) {
        throw new Error(`Missing multi-step question ${label} target: ${JSON.stringify(points)}`);
      }
      await dispatchPointerClickWithMove(cdp, sessionId, points.web);
      await delay(50);
      await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
      await delay(50);
      multiStepQuestionTimeline.push({ label, points });
    };
    const selected = (metrics, label) =>
      metrics?.options?.some((option) => option.label === label && option.selected === true);
    state = await waitForPair(
      "initial 1/2 state",
      (web, lynx) =>
        web?.questionIndex === 0 &&
        lynx?.questionIndex === 0 &&
        web?.questionCount === 2 &&
        lynx?.questionCount === 2,
    );
    await clickPair('[data-question-option="Safe"]', "select-safe");
    state = await waitForPair(
      "enabled Next",
      (web, lynx) =>
        selected(web, "Safe") &&
        selected(lynx, "Safe") &&
        web?.primaryAction?.action === "next" &&
        lynx?.primaryAction?.action === "next" &&
        web.primaryAction.disabled === false &&
        lynx.primaryAction.disabled === false,
    );
    await clickPair('[data-pending-question-action="next"]', "next");
    state = await waitForPair(
      "second question",
      (web, lynx) =>
        web?.questionIndex === 1 &&
        lynx?.questionIndex === 1 &&
        web?.multiSelect === true &&
        lynx?.multiSelect === true &&
        web?.previousAction?.disabled === false &&
        lynx?.previousAction?.disabled === false,
    );
    await clickPair('[data-pending-question-action="previous"]', "previous");
    const restoredFirstAnswer = (web, lynx) =>
      web?.questionIndex === 0 &&
      lynx?.questionIndex === 0 &&
      selected(web, "Safe") &&
      selected(lynx, "Safe");
    try {
      state = await waitForPair("restored first answer", restoredFirstAnswer, 1_500);
    } catch {
      const latest = await readPair();
      if (latest?.web?.pendingRequestMetrics?.questionIndex !== 0) {
        await clickPane("web", '[data-pending-question-action="previous"]', "previous", true);
      }
      if (latest?.lynx?.pendingRequestMetrics?.questionIndex !== 0) {
        await clickPane("lynx", '[data-pending-question-action="previous"]', "previous", true);
      }
      state = await waitForPair("restored first answer after fallback", restoredFirstAnswer);
    }
    await clickPair('[data-pending-question-action="next"]', "next-again");
    state = await waitForPair(
      "second question restored",
      (web, lynx) => web?.questionIndex === 1 && lynx?.questionIndex === 1,
    );
    await clickPair('[data-question-option="Web"]', "select-web");
    await clickPair('[data-question-option="Native"]', "select-native");
    state = await waitForPair(
      "multi-select complete",
      (web, lynx) =>
        selected(web, "Web") &&
        selected(web, "Native") &&
        selected(lynx, "Web") &&
        selected(lynx, "Native") &&
        web?.primaryAction?.action === "submit" &&
        lynx?.primaryAction?.action === "submit" &&
        web.primaryAction.disabled === false &&
        lynx.primaryAction.disabled === false,
    );
    multiStepQuestionStage = "complete";
    reachedTargetState = true;
  }
  if (isSidebarControlHoverState) {
    state = await waitForSidebarV2Controls(cdp, sessionId);
    const hover = await runSidebarControlHoverFlow(
      cdp,
      sessionId,
      stateId === "sidebar-v2-new-thread-hover" ? "thread" : "project",
    );
    sidebarControlHoverTimeline.push(...hover.timeline);
    sidebarControlHoverStage = "complete";
    state = await readWorkbenchState(cdp, sessionId);
    reachedTargetState = true;
  }
  if (isSidebarThreadHoverPreviewState) {
    state = await waitForSidebarV2Controls(cdp, sessionId);
    if (!(await dismissWebProviderNotification(cdp, sessionId))) {
      throw new Error("Web provider-update notification did not dismiss before Sidebar hover.");
    }
    sidebarThreadHoverPreview = await runSidebarThreadHoverPreviewFlow(cdp, sessionId, {
      width,
      height,
    });
    sidebarThreadHoverPreviewStage = "complete";
    state = await readWorkbenchState(cdp, sessionId);
    reachedTargetState = true;
  }
  if (isSidebarThreadShortcutState) {
    state = await waitForSidebarV2Controls(cdp, sessionId);
    const flow = await runSidebarThreadShortcutFlow(cdp, sessionId);
    state = flow.state;
    sidebarThreadShortcutTimeline.push(...flow.timeline);
    sidebarThreadShortcutStage = "complete";
    reachedTargetState = true;
  }
  if (isChatOutlineState) {
    chatOutlineEvidence = await runChatOutlineFlow(cdp, sessionId);
    state = await readWorkbenchState(cdp, sessionId);
    reachedTargetState = true;
  }
  if (stateId === "sidebar-v2-new-thread-projects") {
    state = await waitForSidebarV2Controls(cdp, sessionId);
    const initialThreadIds = {
      web: (state?.web?.sidebarDiagnostics?.threads ?? []).map(({ threadId }) => threadId),
      lynx: (state?.lynx?.sidebarDiagnostics?.threads ?? []).map(({ threadId }) => threadId),
    };
    const initialLynxCreateThreadCommandCount =
      state?.lynx?.connectorDiagnostics?.commands?.filter(({ method }) => method === "createThread")
        .length ?? 0;
    const selector = ".sidebar-v2-new-thread";
    for (const client of ["web", "lynx"]) {
      if (!(await clickSidebarControl(cdp, sessionId, client, selector))) {
        throw new Error(`Missing ${client} New thread trigger`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          client === "web"
            ? next?.web?.overlayMetrics?.paletteView === "submenu"
            : next?.lynx?.overlayMetrics?.paletteView === "new-thread-projects",
        3_000,
        `${client} new thread projects`,
      );
      newThreadProjectsTimeline.push({
        client,
        step: "open",
        view: state?.[client]?.overlayMetrics?.paletteView ?? null,
        rows: state?.[client]?.overlayMetrics?.rowLabels ?? [],
      });
    }
    if (!newThreadProjectsMatch(state)) {
      throw new Error(
        `New thread project picker mismatch: ${JSON.stringify({
          web: {
            view: state?.web?.overlayMetrics?.paletteView ?? null,
            rows: state?.web?.overlayMetrics?.rowLabels ?? [],
            active: state?.web?.overlayMetrics?.activeRowLabels ?? [],
          },
          lynx: {
            view: state?.lynx?.overlayMetrics?.paletteView ?? null,
            rows: state?.lynx?.overlayMetrics?.rowLabels ?? [],
            active: state?.lynx?.overlayMetrics?.activeRowLabels ?? [],
          },
        })}`,
      );
    }
    if (!(await dispatchPaletteKey(cdp, sessionId, "web", "Backspace", "Backspace", 8))) {
      throw new Error("Could not send Web Backspace from New thread projects");
    }
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => next?.web?.overlayMetrics?.paletteView === "root",
      3_000,
      "Web new thread projects back",
    );
    newThreadProjectsTimeline.push({ client: "web", step: "back", view: "root" });
    await dispatchPaletteKey(cdp, sessionId, "web", "Escape", "Escape", 27);
    await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => next?.web?.productState?.overlay === null,
      3_000,
      "Web new thread projects dismiss",
    );
    newThreadProjectsTimeline.push({ client: "web", step: "dismiss", overlay: null });

    if (!(await clickPaletteBack(cdp, sessionId, "lynx"))) {
      throw new Error("Could not click Lynx Back from New thread projects");
    }
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => next?.lynx?.overlayMetrics?.paletteView === "root",
      3_000,
      "Lynx new thread projects back",
    );
    newThreadProjectsTimeline.push({ client: "lynx", step: "back", view: "root" });
    await clickLynxPaletteBackdrop(cdp, sessionId);
    await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) => next?.lynx?.productState?.overlay === null,
      3_000,
      "Lynx new thread projects dismiss",
    );
    newThreadProjectsTimeline.push({ client: "lynx", step: "dismiss", overlay: null });

    state = await waitForSidebarV2Controls(cdp, sessionId);
    for (const client of ["web", "lynx"]) {
      if (!(await clickSidebarControl(cdp, sessionId, client, selector))) {
        throw new Error(`Missing ${client} New thread trigger on reopen`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          client === "web"
            ? next?.web?.overlayMetrics?.paletteView === "submenu"
            : next?.lynx?.overlayMetrics?.paletteView === "new-thread-projects",
        3_000,
        `${client} new thread projects reopen`,
      );
      newThreadProjectsTimeline.push({
        client,
        step: "reopen",
        view: state?.[client]?.overlayMetrics?.paletteView ?? null,
      });
    }
    if (!newThreadProjectsMatch(state)) {
      throw new Error("New thread project picker did not restore after reverse-state checks");
    }
    const webProjectLabels = state?.web?.overlayMetrics?.rowLabels ?? [];
    const lynxProjectLabels = new Set(state?.lynx?.overlayMetrics?.rowLabels ?? []);
    const selectedProjectLabel =
      webProjectLabels.find((label) => label && lynxProjectLabels.has(label)) ?? "";
    if (!selectedProjectLabel) {
      throw new Error("New thread project picker had no selectable project");
    }
    for (const client of ["web", "lynx"]) {
      if (!(await clickPaletteRow(cdp, sessionId, client, selectedProjectLabel))) {
        throw new Error(`Could not select ${client} project for a new draft`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          next?.[client]?.productState?.overlay === null &&
          next?.[client]?.heroPresent === true &&
          next?.[client]?.productState?.activeThreadKind === "draft",
        3_000,
        `${client} local new-thread draft`,
      );
    }
    const firstDraftIds = {
      web: state?.web?.productState?.activeThreadId ?? null,
      lynx: state?.lynx?.productState?.activeThreadId ?? null,
    };
    const firstThreadIds = {
      web: (state?.web?.sidebarDiagnostics?.threads ?? []).map(({ threadId }) => threadId),
      lynx: (state?.lynx?.sidebarDiagnostics?.threads ?? []).map(({ threadId }) => threadId),
    };
    const firstLynxCreateThreadCommandCount =
      state?.lynx?.connectorDiagnostics?.commands?.filter(({ method }) => method === "createThread")
        .length ?? 0;
    if (
      JSON.stringify(firstThreadIds) !== JSON.stringify(initialThreadIds) ||
      firstLynxCreateThreadCommandCount !== initialLynxCreateThreadCommandCount ||
      !firstDraftIds.web ||
      !firstDraftIds.lynx
    ) {
      throw new Error(
        `Opening a local draft persisted an empty thread: ${JSON.stringify({
          initialThreadIds,
          firstThreadIds,
          initialLynxCreateThreadCommandCount,
          firstLynxCreateThreadCommandCount,
          firstDraftIds,
        })}`,
      );
    }
    for (const client of ["web", "lynx"]) {
      if (!(await clickSidebarControl(cdp, sessionId, client, selector))) {
        throw new Error(`Missing ${client} New thread trigger for draft reuse`);
      }
      await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          client === "web"
            ? next?.web?.overlayMetrics?.paletteView === "submenu"
            : next?.lynx?.overlayMetrics?.paletteView === "new-thread-projects",
        3_000,
        `${client} new thread projects draft reuse`,
      );
      if (!(await clickPaletteRow(cdp, sessionId, client, selectedProjectLabel))) {
        throw new Error(`Could not reselect ${client} project for draft reuse`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          next?.[client]?.productState?.overlay === null &&
          next?.[client]?.heroPresent === true &&
          next?.[client]?.productState?.activeThreadKind === "draft",
        3_000,
        `${client} reused local new-thread draft`,
      );
    }
    const reusedDraftIds = {
      web: state?.web?.productState?.activeThreadId ?? null,
      lynx: state?.lynx?.productState?.activeThreadId ?? null,
    };
    const reusedThreadIds = {
      web: (state?.web?.sidebarDiagnostics?.threads ?? []).map(({ threadId }) => threadId),
      lynx: (state?.lynx?.sidebarDiagnostics?.threads ?? []).map(({ threadId }) => threadId),
    };
    const reusedLynxCreateThreadCommandCount =
      state?.lynx?.connectorDiagnostics?.commands?.filter(({ method }) => method === "createThread")
        .length ?? 0;
    if (
      JSON.stringify(reusedThreadIds) !== JSON.stringify(initialThreadIds) ||
      reusedLynxCreateThreadCommandCount !== initialLynxCreateThreadCommandCount ||
      reusedDraftIds.web !== firstDraftIds.web ||
      reusedDraftIds.lynx !== firstDraftIds.lynx
    ) {
      throw new Error(
        `Repeated New thread did not reuse the local draft: ${JSON.stringify({
          initialThreadIds,
          reusedThreadIds,
          initialLynxCreateThreadCommandCount,
          reusedLynxCreateThreadCommandCount,
          firstDraftIds,
          reusedDraftIds,
        })}`,
      );
    }
    newThreadDraftLifecycle = {
      selectedProjectLabel,
      initialThreadIds,
      firstThreadIds,
      reusedThreadIds,
      firstDraftIds,
      reusedDraftIds,
      lynxCreateThreadCommandCount: reusedLynxCreateThreadCommandCount,
    };
    if (expectedThreadFixture?.id) {
      for (const client of ["web", "lynx"]) {
        const selected = await clickSidebarControl(
          cdp,
          sessionId,
          client,
          `[data-thread-id="${expectedThreadFixture.id}"]`,
        );
        if (!selected) throw new Error(`Could not restore ${client} canonical thread`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          next?.web?.productState?.selectedThread === expectedThreadFixture.id &&
          next?.lynx?.productState?.selectedThread === expectedThreadFixture.id,
        3_000,
        "restore canonical thread after draft reuse",
      );
    }
    for (const client of ["web", "lynx"]) {
      if (!(await clickSidebarControl(cdp, sessionId, client, selector))) {
        throw new Error(`Missing ${client} New thread trigger for final palette`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          client === "web"
            ? next?.web?.overlayMetrics?.paletteView === "submenu"
            : next?.lynx?.overlayMetrics?.paletteView === "new-thread-projects",
        3_000,
        `${client} new thread projects final`,
      );
    }
    newThreadProjectsStage = "complete";
    reachedTargetState = true;
  }
  if (isAddProviderDialogState) {
    const flow = await runAddProviderDialogFlow(cdp, sessionId, width, height);
    state = flow.state;
    addProviderDialogTimeline.push(...flow.timeline);
    addProviderDialogStage = "complete";
    reachedTargetState = true;
  }
  if (isBetaMutationState) {
    const flow = await runBetaMutationFlow(cdp, sessionId);
    state = flow.state;
    betaMutationTimeline.push(...flow.timeline);
    betaMutationStage = "complete";
    reachedTargetState = true;
  }
  if (isBackgroundActivityMutationState) {
    const flow = await runBackgroundActivityMutationFlow(cdp, sessionId);
    state = flow.state;
    backgroundActivityMutationTimeline.push(...flow.timeline);
    backgroundActivityMutationStage = "complete";
    reachedTargetState = true;
  }
  if (isSettingsModelMutationState) {
    const flow = await runSettingsModelMutationFlow(cdp, sessionId);
    state = flow.state;
    settingsModelMutationTimeline.push(...flow.timeline);
    settingsModelMutationStage = "complete";
    reachedTargetState = true;
  }
  if (isSourceControlDetailsState) {
    const flow = await runSourceControlDetailsFlow(cdp, sessionId);
    state = flow.state;
    reachedTargetState = true;
  }
  if (isConnectionsMutationState) {
    const flow = await runConnectionsMutationFlow(cdp, sessionId);
    state = flow.state;
    connectionsMutationTimeline.push(...flow.timeline);
    connectionsMutationStage = "complete";
    reachedTargetState = true;
  }
  if (stateId === "add-project-sources") {
    state = await waitForSidebarV2Controls(cdp, sessionId);
    for (const client of ["web", "lynx"]) {
      if (!(await clickSidebarControl(cdp, sessionId, client, ".sidebar-v2-new-project"))) {
        throw new Error(`Missing ${client} New project trigger`);
      }
      state = await waitForWorkbenchState(
        cdp,
        sessionId,
        (next) =>
          client === "web"
            ? next?.web?.overlayMetrics?.paletteView === "submenu"
            : next?.lynx?.overlayMetrics?.paletteView === "add-project-sources",
        3_000,
        `${client} add project sources`,
      );
      addProjectSourcesTimeline.push({
        client,
        step: "open",
        view: state?.[client]?.overlayMetrics?.paletteView ?? null,
        rows: state?.[client]?.overlayMetrics?.rowLabels ?? [],
      });
    }
    if (!addProjectSourcesMatch(state)) {
      throw new Error(
        `Add project sources mismatch: ${JSON.stringify({
          web: state?.web?.overlayMetrics?.rowLabels ?? [],
          lynx: state?.lynx?.overlayMetrics?.rowLabels ?? [],
        })}`,
      );
    }
    addProjectSourcesStage = "complete";
    reachedTargetState = true;
  }
  const readyMs = Date.now() - readyStart;
  const targetStateReady =
    state?.web?.semanticReady === true &&
    state?.lynx?.semanticReady === true &&
    (!overlay ||
      (state?.web?.productState?.overlay === overlay &&
        state?.lynx?.productState?.overlay === overlay));

  // Lynx-for-Web applies its compiled stylesheet ASYNCHRONOUSLY, a few frames
  // after semantic readiness, and its `<image>`-based icons apply their inline
  // px size only once rasterized. Screenshotting on readiness alone catches an
  // unstyled frame (icons at intrinsic size, rows overflowing). Gate the
  // capture on a style-applied probe: EVERY icon `<image>` in the Lynx shadow
  // root must have collapsed to an icon-sized box (<= 28px). Poll until no
  // oversized icon image remains.
  const styleDeadline = Date.now() + 10000;
  let lynxStyled = !targetStateReady;
  while (targetStateReady && Date.now() < styleDeadline) {
    lynxStyled = Boolean(
      await evaluate(
        cdp,
        sessionId,
        `(() => {
          const view = document.getElementById('lynx-pane');
          const doc = view && view.contentWindow && view.contentWindow.document;
          const lynx = doc && doc.getElementById('t3-lynx-preview');
          const sr = lynx && lynx.shadowRoot;
          if (!sr) return false;
          const imgs = [...sr.querySelectorAll('x-image, X-IMAGE, image, img')];
          if (imgs.length === 0) return false;
          // Product imagery may intentionally be larger than an icon. Only
          // apply this readiness gate to icon-like image leaves.
          const oversized = imgs.filter((el) => {
            const r = el.getBoundingClientRect();
            const className = el.getAttribute('class') || '';
            if (
              className.includes('authority') ||
              className.includes('sidebar-grain__tile') ||
              className.includes('-atlas__image')
            ) {
              return false;
            }
            // The T3 wordmark is legitimately wide (~54x16) and short; exclude
            // any image whose HEIGHT is icon-sized even if it is wide.
            if (r.height > 0 && r.height <= 28) return false;
            return r.width > 28 || r.height > 28;
          });
          return oversized.length === 0;
        })()`,
      ).catch(() => false),
    );
    if (lynxStyled) break;
    await delay(100);
  }
  // Diagnostic: if icons never settled, record what the oversized ones are so
  // the divergence is inspectable from the real capture context (not a
  // standalone probe).
  let lynxIconDiag = null;
  if (!lynxStyled) {
    lynxIconDiag = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const view = document.getElementById('lynx-pane');
        const doc = view && view.contentWindow && view.contentWindow.document;
        const lynx = doc && doc.getElementById('t3-lynx-preview');
        const sr = lynx && lynx.shadowRoot;
        if (!sr) return { error: 'no shadow root' };
        const imgs = [...sr.querySelectorAll('x-image, X-IMAGE, image, img')];
        const big = imgs.filter((el) => {
          const className = el.getAttribute('class') || '';
          return !(
            className.includes('authority') ||
            className.includes('sidebar-grain__tile') ||
            className.includes('-atlas__image')
          );
        }).map((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return { cls: (el.getAttribute('class')||'').slice(0,60), style: el.getAttribute('style')||'', w: Math.round(r.width), h: Math.round(r.height), cssW: cs.width, cssH: cs.height, objectFit: cs.objectFit };
        }).filter((x) => x.w > 28 || x.h > 28).slice(0, 8);
        return { imageCount: imgs.length, oversized: big };
      })()`,
    ).catch((e) => ({ error: String(e) }));
    console.log(
      `[shared-workbench] ${viewport.label} lynx icons not settled: ${JSON.stringify(lynxIconDiag)}`,
    );
  }
  // Two extra frames after the last icon settles, so raster is committed.
  // Model-picker provider/query transitions replace a custom-element subtree;
  // Lynx-for-Web updates its semantic shadow tree before Chromium commits the
  // corresponding compositor surface, so retain evidence only after that
  // additional paint window.
  await delay(
    overlay === "model-picker" && (providerId.length > 0 || query.length > 0) ? 1800 : 400,
  );
  if (isGitPublishDialogState) {
    const paintCommitted = await evaluate(
      cdp,
      sessionId,
      `Promise.all(
        ['web-pane', 'lynx-pane'].map((frameId) => new Promise((resolve) => {
          const frameWindow = document.getElementById(frameId)?.contentWindow;
          if (!frameWindow?.requestAnimationFrame) {
            resolve(false);
            return;
          }
          frameWindow.requestAnimationFrame(() => {
            frameWindow.requestAnimationFrame(() => resolve(true));
          });
        }))
      ).then((values) => values.every(Boolean))`,
    ).catch(() => false);
    if (!paintCommitted) {
      throw new Error("Git Publish panes did not commit two compositor frames before capture.");
    }
  }
  state =
    (await evaluate(
      cdp,
      sessionId,
      `(() => { const w = window.__T3_WORKBENCH__; return w ? w.read() : null; })()`,
    ).catch(() => null)) ?? state;

  const lifecycleFaultReady =
    isLifecycleFaultState &&
    ownedServerTerminated &&
    state?.web?.connected === false &&
    state?.lynx?.connected === false &&
    state?.web?.productState?.lifecycle === "connecting" &&
    state?.lynx?.productState?.lifecycle === "connecting";
  const componentLabReady =
    isComponentsLabState &&
    (state?.web?.componentLabMetrics?.stories?.length ?? 0) > 0 &&
    JSON.stringify(
      state.web.componentLabMetrics.stories.map(({ id, states, title }) => ({ id, states, title })),
    ) ===
      JSON.stringify(
        state?.lynx?.componentLabMetrics?.stories?.map(({ id, states, title }) => ({
          id,
          states,
          title,
        })) ?? [],
      );
  const componentLabTooltipReady = !isComponentsLabState || componentLabTooltipVerified;
  const componentLabMenuReady = !isComponentsLabState || componentLabMenuVerified;
  const componentLabSelectReady =
    !isComponentsLabState ||
    (componentLabSelectReopened &&
      state?.web?.componentLabMetrics?.select?.value === "Compact" &&
      state?.lynx?.componentLabMetrics?.select?.value === "Compact" &&
      state?.web?.componentLabMetrics?.select?.popup?.items?.length === 2 &&
      state?.lynx?.componentLabMetrics?.select?.popup?.items?.length === 2 &&
      Math.abs(
        state.web.componentLabMetrics.select.popup.box?.rect?.x -
          state.lynx.componentLabMetrics.select.popup.box?.rect?.x,
      ) <= 2 &&
      Math.abs(
        state.web.componentLabMetrics.select.popup.box?.rect?.y -
          state.lynx.componentLabMetrics.select.popup.box?.rect?.y,
      ) <= 2 &&
      Math.abs(
        state.web.componentLabMetrics.select.popup.box?.rect?.width -
          state.lynx.componentLabMetrics.select.popup.box?.rect?.width,
      ) <= 2 &&
      Math.abs(
        state.web.componentLabMetrics.select.popup.box?.rect?.height -
          state.lynx.componentLabMetrics.select.popup.box?.rect?.height,
      ) <= 2);
  const componentLabNumberReady =
    !isComponentsLabState ||
    (componentLabNumberIncremented &&
      componentLabNumberDecremented &&
      String(state?.web?.componentLabMetrics?.numberField?.value) === "10" &&
      String(state?.lynx?.componentLabMetrics?.numberField?.value) === "10" &&
      state?.web?.componentLabMetrics?.numberField?.root?.rect &&
      state?.lynx?.componentLabMetrics?.numberField?.root?.rect &&
      Math.abs(
        state.web.componentLabMetrics.numberField.root.rect.width -
          state.lynx.componentLabMetrics.numberField.root.rect.width,
      ) <= 2 &&
      Math.abs(
        state.web.componentLabMetrics.numberField.root.rect.height -
          state.lynx.componentLabMetrics.numberField.root.rect.height,
      ) <= 2);
  const componentLabScrollReady =
    !isComponentsLabState ||
    (componentLabScrollDispatched &&
      (state?.web?.componentLabMetrics?.scrollArea?.scrollTop ?? 0) > 0 &&
      (state?.lynx?.componentLabMetrics?.scrollArea?.scrollTop ?? 0) > 0 &&
      (state?.web?.componentLabMetrics?.scrollArea?.scrollHeight ?? 0) >
        (state?.web?.componentLabMetrics?.scrollArea?.clientHeight ?? 0) &&
      (state?.lynx?.componentLabMetrics?.scrollArea?.scrollHeight ?? 0) >
        (state?.lynx?.componentLabMetrics?.scrollArea?.clientHeight ?? 0) &&
      state?.web?.componentLabMetrics?.scrollArea?.host?.rect &&
      state?.lynx?.componentLabMetrics?.scrollArea?.host?.rect &&
      Math.abs(
        state.web.componentLabMetrics.scrollArea.host.rect.width -
          state.lynx.componentLabMetrics.scrollArea.host.rect.width,
      ) <= 2 &&
      Math.abs(
        state.web.componentLabMetrics.scrollArea.host.rect.height -
          state.lynx.componentLabMetrics.scrollArea.host.rect.height,
      ) <= 2);
  const componentLabDialogReady =
    !isComponentsLabState ||
    (componentLabDialogOpened &&
      componentLabDialogVerified &&
      componentLabDialogGeometryVerified &&
      componentLabDialogClosed &&
      state?.web?.componentLabMetrics?.dialog === null &&
      state?.lynx?.componentLabMetrics?.dialog === null);
  const componentLabGeometryReady = (() => {
    if (!isComponentsLabState || !componentLabReady) return !isComponentsLabState;
    const webLab = state.web.componentLabMetrics;
    const lynxLab = state.lynx.componentLabMetrics;
    const widthsMatch =
      Math.abs(webLab.content.rect.width - lynxLab.content.rect.width) <= 1 &&
      webLab.stories.every((story, index) => {
        const candidate = lynxLab.stories[index];
        return (
          story.box?.rect &&
          story.canvas?.rect &&
          candidate?.box?.rect &&
          candidate.canvas?.rect &&
          Math.abs(story.box.rect.x - candidate.box.rect.x) <= 1 &&
          Math.abs(story.box.rect.width - candidate.box.rect.width) <= 1 &&
          Math.abs(story.canvas.rect.x - candidate.canvas.rect.x) <= 1 &&
          Math.abs(story.canvas.rect.width - candidate.canvas.rect.width) <= 1
        );
      });
    const verticallyOrdered = (stories) =>
      stories.every(
        (story, index) => index === 0 || story.box.rect.y > stories[index - 1].box.rect.y,
      );
    return widthsMatch && verticallyOrdered(webLab.stories) && verticallyOrdered(lynxLab.stories);
  })();
  const bothReady =
    componentLabReady ||
    lifecycleFaultReady ||
    Boolean(state?.web?.semanticReady && state?.lynx?.semanticReady);
  const finalOverlayReady =
    !overlay ||
    (state?.web?.productState?.overlay === overlay &&
      state?.lynx?.productState?.overlay === overlay &&
      (overlay !== "quick-switch" ||
        stateId === "add-project-sources" ||
        quickSwitchAnatomyMatches(state?.web?.overlayMetrics, state?.lynx?.overlayMetrics)) &&
      (!query ||
        (state?.web?.productState?.overlayQuery === query &&
          state?.lynx?.productState?.overlayQuery === query)) &&
      (!providerId ||
        (state?.web?.overlayMetrics?.selectedProviderId === providerId &&
          state?.lynx?.overlayMetrics?.selectedProviderId === providerId)));
  const finalShortcutInputReady =
    !requiresShortcutInput ||
    (webShortcutInputChannel !== "pending" && lynxShortcutInputChannel !== "pending");
  const finalSidebarSearchReady =
    !sidebarQuery ||
    (sidebarSearchInputChannel !== "pending" &&
      state?.web?.sidebarDiagnostics?.search?.value === sidebarQuery &&
      state?.lynx?.sidebarDiagnostics?.search?.value === sidebarQuery &&
      state?.web?.sidebarDiagnostics?.search?.inputBox?.rect?.width > 0 &&
      state?.lynx?.sidebarDiagnostics?.search?.inputBox?.rect?.width > 0 &&
      rectDeltaWithin(
        state?.web?.sidebarDiagnostics?.search?.inputBox,
        state?.lynx?.sidebarDiagnostics?.search?.inputBox,
        1,
      ) &&
      state?.lynx?.sidebarDiagnostics?.search?.inputBox?.style?.webkitTextFillColor !==
        "rgba(0, 0, 0, 0)" &&
      (state?.web?.sidebarDiagnostics?.search?.resultTitles?.length ?? 0) > 0 &&
      JSON.stringify(state?.web?.sidebarDiagnostics?.search?.resultTitles ?? []) ===
        JSON.stringify(state?.lynx?.sidebarDiagnostics?.search?.resultTitles ?? []));
  const finalSidebarStateReady =
    !sidebarTargetState ||
    (webSidebarStateInputSent &&
      lynxSidebarStateInputSent &&
      state?.web?.sidebarDiagnostics?.state === sidebarTargetState &&
      state?.lynx?.sidebarDiagnostics?.state === sidebarTargetState);
  const finalChangedFilesStateReady =
    !changedFilesTargetState ||
    (webChangedFilesInputSent &&
      lynxChangedFilesInputSent &&
      normalizedChangedFilesState(state?.web?.reviewMetrics) === changedFilesTargetState &&
      normalizedChangedFilesState(state?.lynx?.reviewMetrics) === changedFilesTargetState);
  let finalCoreGeometryReady =
    isFlatSidebarLayoutState ||
    isSidebarThreadHoverPreviewState ||
    isNarrowChatThreadState ||
    completedNoDiffGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) ||
    (isReviewState && width <= 1023) ||
    isChatOutlineState ||
    coreGeometryMatches(state?.web, state?.lynx);
  const finalHeroGeometryReady = heroGeometryMatches(state);
  const finalComposerInputReady =
    !composerInput ||
    (state?.web?.composerMetrics?.editor?.value === composerInput &&
      state?.lynx?.composerMetrics?.editor?.value === composerInput);
  const finalComposerStateReady =
    composerExpectation === null ||
    composerPairMatches(
      state?.web?.composerMetrics,
      state?.lynx?.composerMetrics,
      composerExpectation,
      height,
    );
  const finalComposerAnatomyReady = composerAnatomyMatches(
    state?.web?.composerMetrics,
    state?.lynx?.composerMetrics,
  );
  const finalComposerReady =
    isFlatSidebarLayoutState ||
    isNarrowChatThreadState ||
    (isReviewState && width <= 1023) ||
    (finalComposerInputReady &&
      finalComposerStateReady &&
      finalComposerAnatomyReady &&
      completedComposerProviderStateMatches(state) &&
      completedNoDiffStateMatches(state) &&
      completedProjectFaviconMatches(state) &&
      completedHeaderOpenActionMatches(state));
  const finalPlanModeReady = composerPlanModeMatches(state);
  const finalSessionProjectionReady = sessionProjectionMatches(state, expectedThreadFixture);
  const finalStageIdentityReady = sidebarStageIdentityMatches(state);
  const finalSidebarControlGeometryReady = sidebarControlGeometryMatches(state);
  const finalSidebarProjectGroupsReady = sidebarProjectGroupsMatch(state);
  const finalFlatSidebarLayoutReady = flatSidebarLayoutMatches(state);
  const finalAddProjectSourcesReady = addProjectSourcesMatch(state);
  const finalNewThreadProjectsReady = newThreadProjectsMatch(state);
  const finalSidebarFooterThemeReady =
    isNarrowChatThreadState ||
    (isReviewState && width <= 1023) ||
    sidebarFooterThemeMatches(state, width, height);
  const finalCompactControlsReady = compactControlsEvidenceReady(state);
  const finalProjectActionDialogReady = projectActionDialogReady(state);
  const finalProjectSettingsReady = projectSettingsReady(state, projectSettingsInteraction);
  const finalRightPanelAddMenuReady = rightPanelAddMenuReady(state);
  let finalRightPanelTerminalReady = rightPanelTerminalReady(state);
  const finalDiffScopeMenuReady = diffScopeMenuReady(state);
  const finalSidebarWorkingGeometryReady = sidebarWorkingGeometryMatches(
    state,
    expectedThreadFixture,
  );
  const finalHeaderGitActionReady = isFlatSidebarLayoutState || headerGitActionMatches(state);
  const finalGitPublishDialogReady = gitPublishDialogMatches(state);
  let finalFilesBrowserReady = filesBrowserReady(state);
  const finalSettledBannerInlineFilesReady = settledBannerInlineFilesReady(state);
  let finalFileEditorReady = fileEditorReady(state);
  let fileEditingSaveEvidence = null;
  if (isGitPublishDialogState && !finalGitPublishDialogReady) {
    throw new Error(
      `Git Publish dialog changed before the compositor gate: ${JSON.stringify({
        web: state?.web?.gitPublishDialog ?? null,
        lynx: state?.lynx?.gitPublishDialog ?? null,
      })}`,
    );
  }
  const gitPublishDialogEvidence = finalGitPublishDialogReady
    ? JSON.parse(
        JSON.stringify({
          web: state?.web?.gitPublishDialog ?? null,
          lynx: state?.lynx?.gitPublishDialog ?? null,
        }),
      )
    : null;
  const finalReviewReady = Object.values(
    reviewReadinessBreakdown(state?.web, state?.lynx, reviewExpectation, width),
  ).every(Boolean);
  const finalSettingsAsyncReady =
    stateId === "settings-source-control-loading"
      ? state?.web?.settingsMetrics?.loading === true &&
        state?.lynx?.settingsMetrics?.loading === true
      : stateId === "settings-source-control-error"
        ? state?.web?.settingsMetrics?.loading === false &&
          state?.lynx?.settingsMetrics?.loading === false &&
          (state?.web?.settingsMetrics?.errorTexts ?? []).some((text) =>
            text?.includes("Source-control discovery is unavailable"),
          ) &&
          (state?.lynx?.settingsMetrics?.errorTexts ?? []).some((text) =>
            text?.includes("Source-control discovery is unavailable"),
          )
        : (stateId !== "settings-source-control" && !isSourceControlDetailsState) ||
          ((state?.web?.settingsMetrics?.rowIds ?? []).includes("source-control") &&
            (state?.lynx?.settingsMetrics?.rowIds ?? []).includes("source-control"));
  const finalSettingsGeometryReady =
    backgroundPolicyAccessoryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
    keybindingsSettingsGeometryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
    providerSettingsGeometryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
    connectionsSettingsGeometryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
    archiveSettingsGeometryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
    betaSettingsGeometryMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics) &&
    (stateId !== "settings-source-control-loading" ||
      sourceControlLoadingSettingsGeometryMatches(
        state?.web?.settingsMetrics,
        state?.lynx?.settingsMetrics,
      )) &&
    (stateId !== "settings-source-control-error" ||
      sourceControlErrorSettingsGeometryMatches(
        state?.web?.settingsMetrics,
        state?.lynx?.settingsMetrics,
      ));
  const finalSettingsNavigationReady = settingsNavigationStateMatches(state);
  const finalSettingsDesktopTopbarReady = settingsDesktopTopbarMatches(state);
  const finalAddProviderDialogReady =
    !isAddProviderDialogState ||
    (providerDialogStopAt === "driver"
      ? addProviderDialogStage === "complete" &&
        addProviderDialogTimeline.some((entry) => entry.step === "opened") &&
        addProviderDialogPairMatches(state, width, height, 0)
      : addProviderDialogStage === "complete" &&
        [
          "opened",
          "identity",
          "config-blocked",
          "dismissed",
          "reopened",
          "config",
          "saved",
          "deleted",
          "final-dismissed",
        ].every((step) => addProviderDialogTimeline.some((entry) => entry.step === step)) &&
        state?.web?.addProviderDialog === null &&
        state?.lynx?.addProviderDialog === null);
  const finalBetaMutationReady =
    !isBetaMutationState ||
    (betaMutationStage === "complete" &&
      betaMutationStateMatches(state, true) &&
      ["initial", "disabled", "restored"].every((step) =>
        betaMutationTimeline.some((entry) => entry.step === step),
      ));
  const finalBackgroundActivityMutationReady =
    !isBackgroundActivityMutationState ||
    (backgroundActivityMutationStage === "complete" &&
      backgroundActivityMutationStateMatches(state, "Balanced") &&
      ["initial", "performance", "battery-saver", "balanced"].every((step) =>
        backgroundActivityMutationTimeline.some((entry) => entry.step === step),
      ));
  const finalSettingsModelMutationReady =
    !isSettingsModelMutationState ||
    (settingsModelMutationStage === "complete" &&
      settingsModelMutationStateMatches(state, "GPT-5.6-Luna") &&
      ["initial", "cheap-model", "restored"].every((step) =>
        settingsModelMutationTimeline.some((entry) => entry.step === step),
      ));
  const finalConnectionsMutationReady =
    !isConnectionsMutationState ||
    (connectionsMutationStage === "complete" &&
      connectionsMutationStateMatches(state, 0) &&
      ["initial", "web-created", "web-revoked", "lynx-created", "lynx-revoked"].every((step) =>
        connectionsMutationTimeline.some((entry) => entry.step === step),
      ));
  const finalEmptyTranscriptReady =
    state?.web?.timelineMetrics?.threadSyncLabel === null &&
    state?.web?.timelineMetrics?.empty?.text === state?.lynx?.timelineMetrics?.empty?.text &&
    (state?.web?.timelineMetrics?.rows?.length ?? 0) === 0 &&
    (state?.lynx?.timelineMetrics?.rows?.length ?? 0) === 0;
  const finalPopulatedTranscriptReady =
    (state?.web?.timelineMetrics?.rows?.length ?? 0) > 0 &&
    JSON.stringify(state?.web?.timelineMetrics?.rows ?? []) ===
      JSON.stringify(state?.lynx?.timelineMetrics?.rows ?? []) &&
    JSON.stringify(state?.web?.timelineMetrics?.codeBlocks ?? []) ===
      JSON.stringify(state?.lynx?.timelineMetrics?.codeBlocks ?? []) &&
    JSON.stringify(state?.web?.timelineMetrics?.turnFolds ?? []) ===
      JSON.stringify(state?.lynx?.timelineMetrics?.turnFolds ?? []) &&
    state?.web?.timelineMetrics?.workGroupCount === state?.lynx?.timelineMetrics?.workGroupCount &&
    JSON.stringify(
      (state?.web?.timelineMetrics?.workEntries ?? []).map(({ id, tone, state, detail }) => ({
        id,
        tone,
        state,
        detail,
      })),
    ) ===
      JSON.stringify(
        (state?.lynx?.timelineMetrics?.workEntries ?? []).map(({ id, tone, state, detail }) => ({
          id,
          tone,
          state,
          detail,
        })),
      ) &&
    workingTranscriptGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) &&
    failedTranscriptGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) &&
    narrowChatResponsiveMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) &&
    webTurnFoldInputSent &&
    lynxTurnFoldInputSent &&
    webThinkingInputSent &&
    lynxThinkingInputSent &&
    (!expandTurnId ||
      ((state?.web?.timelineMetrics?.workGroupCount ?? 0) > 0 &&
        (state?.lynx?.timelineMetrics?.workGroupCount ?? 0) > 0)) &&
    (!expandThinking ||
      ((state?.web?.timelineMetrics?.workEntries ?? []).some(
        (entry) => entry.tone === "thinking" && entry.state === "expanded" && entry.detail,
      ) &&
        (state?.lynx?.timelineMetrics?.workEntries ?? []).some(
          (entry) => entry.tone === "thinking" && entry.state === "expanded" && entry.detail,
        )));
  const finalTranscriptReady =
    (!stateId.startsWith("existing-thread-") && !isNarrowChatThreadState && !isChatOutlineState) ||
    (isEmptyTranscriptState ? finalEmptyTranscriptReady : finalPopulatedTranscriptReady);
  const finalProviderStatusBannerReady = providerStatusBannerMatches(state);
  const finalFailedThreadDismissalReady =
    !isFailedThreadDismissedState ||
    (failedThreadDismissalTimeline.length === 2 &&
      failedThreadDismissalTimeline.every(({ step }) => step === "dismissed"));
  const finalKeybindingsMutationReady =
    !isKeybindingsMutationState ||
    (keybindingsMutationTimeline.length ===
      (isKeybindingsRemoveMutationState ? 3 : isKeybindingsEditResetMutationState ? 4 : 2) &&
      keybindingsMutationTimeline.at(-1)?.step ===
        (isKeybindingsRemoveMutationState
          ? "removed"
          : isKeybindingsEditResetMutationState
            ? "reset"
            : "saved"));
  const finalPendingRequestReady =
    stateId !== "existing-thread-approval" &&
    stateId !== "existing-thread-question" &&
    !isMultiStepQuestionState
      ? true
      : JSON.stringify(pendingRequestSemantics(state?.web?.pendingRequestMetrics)) ===
          JSON.stringify(pendingRequestSemantics(state?.lynx?.pendingRequestMetrics)) &&
        state?.web?.pendingRequestMetrics?.kind ===
          (stateId === "existing-thread-approval" ? "approval" : "question") &&
        approvalComposerMatches(state?.web?.composerMetrics, state?.lynx?.composerMetrics);
  let webState = state?.web?.productState ?? null;
  let lynxState = state?.lynx?.productState ?? null;
  const currentStateIdentityMatches = () => {
    const normalizeUnpersistedHeroThread = (productState) =>
      semanticRoute === "new-thread" &&
      productState?.selectedThread === null &&
      (productState.activeThreadKind === "draft" || productState.activeThreadKind === "none")
        ? { activeThreadKind: "unpersisted", activeThreadId: null }
        : {
            activeThreadKind: productState?.activeThreadKind ?? null,
            activeThreadId: productState?.activeThreadId ?? null,
          };
    const webThreadIdentity = normalizeUnpersistedHeroThread(webState);
    const lynxThreadIdentity = normalizeUnpersistedHeroThread(lynxState);
    const projectSettingsSnapshotIdentityMatch =
      isProjectSettingsState &&
      JSON.stringify(projectSettingsInteraction.webScopeLabels) ===
        JSON.stringify(projectSettingsInteraction.lynxScopeLabels) &&
      projectSettingsInteraction.webScopeLabels.length > 0 &&
      projectSettingsInteraction.webScopeOptionCount ===
        projectSettingsInteraction.lynxScopeOptionCount &&
      webState?.selectedProject === lynxState?.selectedProject &&
      webState?.selectedThread === lynxState?.selectedThread;
    const commonStateIdentityMatch =
      Boolean(webState && lynxState) &&
      webState.semanticRoute === semanticRoute &&
      lynxState.semanticRoute === semanticRoute &&
      webState.theme === theme &&
      lynxState.theme === theme &&
      JSON.stringify({
        route: webState.route,
        semanticRoute: webState.semanticRoute,
        theme: webState.theme,
        density: webState.density,
        selectedProject: webState.selectedProject,
        selectedThread: isFlatSidebarLayoutState ? null : webState.selectedThread,
        ...webThreadIdentity,
        selectedModel: webState.selectedModel,
        interactionMode: webState.interactionMode,
        lifecycle: webState.lifecycle,
        overlayQuery: webState.overlayQuery,
      }) ===
        JSON.stringify({
          route: lynxState.route,
          semanticRoute: lynxState.semanticRoute,
          theme: lynxState.theme,
          density: lynxState.density,
          selectedProject: lynxState.selectedProject,
          selectedThread: isFlatSidebarLayoutState ? null : lynxState.selectedThread,
          ...lynxThreadIdentity,
          selectedModel: lynxState.selectedModel,
          interactionMode: lynxState.interactionMode,
          lifecycle: lynxState.lifecycle,
          overlayQuery: lynxState.overlayQuery,
        });
    return (
      commonStateIdentityMatch &&
      (isProjectSettingsState
        ? projectSettingsSnapshotIdentityMatch
        : stateId === "sidebar-project-groups"
          ? finalSidebarProjectGroupsReady && webState?.overlay === lynxState?.overlay
          : isFlatSidebarLayoutState
            ? finalFlatSidebarLayoutReady && webState?.overlay === lynxState?.overlay
            : webState?.selectedProject === lynxState?.selectedProject &&
              webState?.overlay === lynxState?.overlay)
    );
  };
  let stateIdentityMatch = currentStateIdentityMatches();
  const overlayGeometryDelta =
    state?.web?.overlayMetrics?.rect && state?.lynx?.overlayMetrics?.rect
      ? {
          x: Math.abs(state.web.overlayMetrics.rect.x - state.lynx.overlayMetrics.rect.x),
          y: Math.abs(state.web.overlayMetrics.rect.y - state.lynx.overlayMetrics.rect.y),
          width: Math.abs(
            state.web.overlayMetrics.rect.width - state.lynx.overlayMetrics.rect.width,
          ),
          height: Math.abs(
            state.web.overlayMetrics.rect.height - state.lynx.overlayMetrics.rect.height,
          ),
        }
      : null;
  const overlayAnchorOffsets =
    state?.web?.overlayMetrics?.rect &&
    state?.web?.overlayMetrics?.triggerRect &&
    state?.lynx?.overlayMetrics?.rect &&
    state?.lynx?.overlayMetrics?.triggerRect
      ? {
          web: {
            x: state.web.overlayMetrics.rect.x - state.web.overlayMetrics.triggerRect.x,
            y:
              state.web.overlayMetrics.rect.y -
              (state.web.overlayMetrics.triggerRect.y +
                state.web.overlayMetrics.triggerRect.height),
          },
          lynx: {
            x: state.lynx.overlayMetrics.rect.x - state.lynx.overlayMetrics.triggerRect.x,
            y:
              state.lynx.overlayMetrics.rect.y -
              (state.lynx.overlayMetrics.triggerRect.y +
                state.lynx.overlayMetrics.triggerRect.height),
          },
        }
      : null;
  const webOverlayRowLabels = state?.web?.overlayMetrics?.rowLabels ?? [];
  const lynxOverlayRowLabels = state?.lynx?.overlayMetrics?.rowLabels ?? [];
  const isModelPickerOverlay = webState?.overlay === "model-picker";
  const modelPickerSemanticMatch =
    JSON.stringify(state?.web?.overlayMetrics?.providerIds ?? []) ===
      JSON.stringify(state?.lynx?.overlayMetrics?.providerIds ?? []) &&
    modelPickerSemanticsMatch(state?.web?.overlayMetrics, state?.lynx?.overlayMetrics);
  const overlayRowCountMatch = isModelPickerOverlay
    ? (state?.web?.overlayMetrics?.semanticKeys?.length ?? 0) ===
      (state?.lynx?.overlayMetrics?.semanticKeys?.length ?? 0)
    : state?.web?.overlayMetrics?.rowCount === state?.lynx?.overlayMetrics?.rowCount;
  const overlayContentMatch = isModelPickerOverlay
    ? modelPickerSemanticMatch
    : webOverlayRowLabels.length === 0 && lynxOverlayRowLabels.length === 0
      ? state?.web?.overlayMetrics?.emptyText === state?.lynx?.overlayMetrics?.emptyText
      : webOverlayRowLabels.every((label, index) => label && label === lynxOverlayRowLabels[index]);
  const settingsContentMatch = !semanticRoute.startsWith("settings-")
    ? true
    : isSourceControlDetailsState
      ? sourceControlDetailsMatch(state)
      : isBetaMutationState
        ? finalBetaMutationReady
        : isBackgroundActivityMutationState
          ? finalBackgroundActivityMutationReady
          : isSettingsModelMutationState
            ? finalSettingsModelMutationReady
            : isKeybindingsMutationState
              ? finalKeybindingsMutationReady
              : isConnectionsMutationState
                ? finalConnectionsMutationReady
                : isBetaSettingsState
                  ? finalSettingsGeometryReady && legacySidebarSettingsReady(state)
                  : stateId === "settings-general" || stateId === "settings-model-picker"
                    ? generalSettingsContentMatches(
                        state?.web?.settingsMetrics,
                        state?.lynx?.settingsMetrics,
                      )
                    : stateId === "settings-appearance"
                      ? appearanceSettingsContentMatches(
                          state?.web?.settingsMetrics,
                          state?.lynx?.settingsMetrics,
                        )
                      : stateId === "settings-keybindings"
                        ? keybindingsSettingsContentMatches(
                            state?.web?.settingsMetrics,
                            state?.lynx?.settingsMetrics,
                          )
                        : isProvidersSettingsState
                          ? providerSettingsContentMatches(
                              state?.web?.settingsMetrics,
                              state?.lynx?.settingsMetrics,
                            )
                          : stateId === "settings-connections"
                            ? connectionsSettingsContentMatches(
                                state?.web?.settingsMetrics,
                                state?.lynx?.settingsMetrics,
                              )
                            : stateId === "settings-source-control-loading"
                              ? state?.web?.settingsMetrics?.loading === true &&
                                state?.lynx?.settingsMetrics?.loading === true &&
                                JSON.stringify(state?.web?.settingsMetrics?.sectionTitles ?? []) ===
                                  JSON.stringify(
                                    state?.lynx?.settingsMetrics?.sectionTitles ?? [],
                                  ) &&
                                JSON.stringify(
                                  state?.web?.settingsMetrics?.navigationLabels ?? [],
                                ) ===
                                  JSON.stringify(
                                    state?.lynx?.settingsMetrics?.navigationLabels ?? [],
                                  )
                              : stateId === "settings-source-control-error"
                                ? JSON.stringify(
                                    state?.web?.settingsMetrics?.navigationLabels ?? [],
                                  ) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.navigationLabels ?? [],
                                    ) &&
                                  JSON.stringify(
                                    state?.web?.settingsMetrics?.sectionTitles ?? [],
                                  ) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.sectionTitles ?? [],
                                    ) &&
                                  JSON.stringify(
                                    state?.web?.settingsMetrics?.sourceControlEmptyTitles ?? [],
                                  ) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.sourceControlEmptyTitles ?? [],
                                    ) &&
                                  JSON.stringify(state?.web?.settingsMetrics?.errorTexts ?? []) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.errorTexts ?? [],
                                    ) &&
                                  (state?.web?.settingsMetrics?.sourceControlRetryLabels?.length ??
                                    0) > 0 &&
                                  (state?.lynx?.settingsMetrics?.sourceControlRetryLabels?.length ??
                                    0) > 0
                                : JSON.stringify(
                                    state?.web?.settingsMetrics?.navigationLabels ?? [],
                                  ) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.navigationLabels ?? [],
                                    ) &&
                                  JSON.stringify(
                                    state?.web?.settingsMetrics?.sectionTitles ?? [],
                                  ) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.sectionTitles ?? [],
                                    ) &&
                                  JSON.stringify(
                                    state?.web?.settingsMetrics?.sectionTexts ?? [],
                                  ) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.sectionTexts ?? [],
                                    ) &&
                                  JSON.stringify(
                                    state?.web?.settingsMetrics?.sourceControlRows ?? [],
                                  ) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.sourceControlRows ?? [],
                                    ) &&
                                  JSON.stringify(state?.web?.settingsMetrics?.emptyTexts ?? []) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.emptyTexts ?? [],
                                    ) &&
                                  JSON.stringify(state?.web?.settingsMetrics?.errorTexts ?? []) ===
                                    JSON.stringify(
                                      state?.lynx?.settingsMetrics?.errorTexts ?? [],
                                    ) &&
                                  ((state?.web?.settingsMetrics?.rowIds?.length ?? 0) === 0 ||
                                    (state?.lynx?.settingsMetrics?.rowIds?.length ?? 0) === 0 ||
                                    JSON.stringify(state?.web?.settingsMetrics?.rowIds ?? []) ===
                                      JSON.stringify(state?.lynx?.settingsMetrics?.rowIds ?? []));

  const layout = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const web = document.getElementById("web-pane").getBoundingClientRect();
      const lynx = document.getElementById("lynx-pane").getBoundingClientRect();
      return { devicePixelRatio, webPane: { x: web.x, y: web.y, width: web.width, height: web.height }, lynxPane: { x: lynx.x, y: lynx.y, width: lynx.width, height: lynx.height } };
    })()`,
  );
  const notificationDismissed =
    !shouldClearWebNotification || (await dismissWebProviderNotification(cdp, sessionId));
  if (shouldClearWebNotification && !notificationDismissed) {
    throw new Error("Web provider-update notification did not dismiss before capture.");
  }
  state =
    (await evaluate(
      cdp,
      sessionId,
      `(() => { const w = window.__T3_WORKBENCH__; return w ? w.read() : null; })()`,
    ).catch(() => null)) ?? state;
  if (isFileEditingSaveState) {
    const editingSave = await runFileEditingSaveFlow({
      cdp,
      sessionId,
      cellDir,
      fixturePreparation,
      expectedThreadId: expectThread,
    });
    state = editingSave.state;
    fileEditingSaveEvidence = editingSave.evidence;
    fileEditorSwitched = true;
    fileEditorReturnedToBrowser = true;
    webFileEditorReturnedToBrowser = true;
    lynxFileEditorReturnedToBrowser = true;
  }
  if (isOpenInMenuState && finalFileEditorReady) {
    const triggerPoints = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId, shadow) => {
          const frame = document.getElementById(frameId);
          const doc = frame?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const anchor = root?.querySelector('[data-floating-anchor="file-open-in-menu"]');
          const trigger = anchor;
          if (!frame || !trigger) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = trigger.getBoundingClientRect();
          return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
        };
        return { web: pointFor('web-pane', false), lynx: pointFor('lynx-pane', true) };
      })()`,
    );
    if (!triggerPoints?.web || !triggerPoints?.lynx) {
      throw new Error(`Open in menu triggers unavailable: ${JSON.stringify(triggerPoints)}`);
    }
    await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.web);
    await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.lynx);
    const readMenus = async () =>
      evaluate(
        cdp,
        sessionId,
        `(() => {
          const read = (frameId, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const anchor = root?.querySelector('[data-floating-anchor="file-open-in-menu"]');
            const popup = root?.querySelector('[data-floating-popup="file-open-in-menu"]');
            if (!anchor || !popup) return null;
            const rectOf = (element) => {
              const rect = element.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            };
            const style = getComputedStyle(popup);
            const rows = [...popup.querySelectorAll('[data-open-editor]')].map((row) => ({
              id: row.getAttribute('data-open-editor'),
              preferred: row.getAttribute('data-preferred-editor') === 'true',
              label: row.getAttribute('data-editor-label') ?? '',
              rect: rectOf(row),
              iconCount: row.querySelectorAll(
                'svg, img, image, x-image, .open-in-menu__brand-icon'
              ).length,
            }));
            return {
              anchor: rectOf(anchor),
              popup: rectOf(popup),
              style: {
                backgroundColor: style.backgroundColor,
                borderRadius: style.borderRadius,
                borderColor: style.borderColor,
                boxShadow: style.boxShadow,
                padding: style.padding,
              },
              rows,
            };
          };
          return { web: read('web-pane', false), lynx: read('lynx-pane', true) };
        })()`,
      );
    for (let attempt = 0; attempt < 30; attempt += 1) {
      openInMenuEvidence = await readMenus();
      if (openInMenuEvidence?.web?.rows?.length > 0 && openInMenuEvidence?.lynx?.rows?.length > 0) {
        break;
      }
      await delay(50);
    }
    const webRows = openInMenuEvidence?.web?.rows ?? [];
    const lynxRows = openInMenuEvidence?.lynx?.rows ?? [];
    const semanticMatch =
      JSON.stringify(webRows.map(({ id }) => id)) ===
        JSON.stringify(lynxRows.map(({ id }) => id)) &&
      JSON.stringify(webRows.map(({ preferred }) => preferred)) ===
        JSON.stringify(lynxRows.map(({ preferred }) => preferred)) &&
      JSON.stringify(webRows.map(({ label }) => label)) ===
        JSON.stringify(lynxRows.map(({ label }) => label)) &&
      webRows.every(({ iconCount }) => iconCount > 0) &&
      lynxRows.every(({ iconCount }) => iconCount > 0);
    const geometryMatch =
      Boolean(openInMenuEvidence?.web && openInMenuEvidence?.lynx) &&
      Math.abs(openInMenuEvidence.web.popup.width - openInMenuEvidence.lynx.popup.width) <= 1 &&
      Math.abs(openInMenuEvidence.web.popup.height - openInMenuEvidence.lynx.popup.height) <= 1 &&
      webRows.every((row, index) => Math.abs(row.rect.height - lynxRows[index].rect.height) <= 1);
    openInMenuEvidence = {
      ...openInMenuEvidence,
      triggerPoints,
      inputChannel: "web-cdp-pointer|lynx-cdp-pointer",
      semanticMatch,
      geometryMatch,
      match: semanticMatch && geometryMatch,
    };
  }
  if (isNarrowChatThreadState && finalTranscriptReady) {
    const readMeta = async () =>
      evaluate(
        cdp,
        sessionId,
        `(() => {
          const read = (frameId, shadow) => {
            const doc = document.getElementById(frameId)?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const box = (element) => {
              if (!element) return null;
              const rect = element.getBoundingClientRect();
              return {
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                opacity: getComputedStyle(element).opacity,
              };
            };
            return {
              user: box(root?.querySelector('.transcript-user-meta')),
              assistant: box(root?.querySelector('.transcript-assistant-meta')),
            };
          };
          return { web: read('web-pane', false), lynx: read('lynx-pane', true) };
        })()`,
      );
    const hoverRow = async (client, role) => {
      const rowIndex = role === "user" ? 0 : 1;
      await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
          const doc = frame?.contentWindow?.document;
          const root = ${JSON.stringify(client)} === 'lynx'
            ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
            : doc;
          const target = root?.querySelector(${JSON.stringify(`.transcript-${role}-row`)});
          if (!target) return false;
          if (${JSON.stringify(client)} === 'lynx') {
            const probe = doc?.defaultView?.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__;
            if (typeof probe === 'function') probe(${rowIndex}, 'top');
          } else {
            target.scrollIntoView({ block: 'center', inline: 'nearest' });
          }
          return true;
        })()`,
      );
      await delay(100);
      const point = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
          const doc = frame?.contentWindow?.document;
          const root = ${JSON.stringify(client)} === 'lynx'
            ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
            : doc;
          const target = root?.querySelector(${JSON.stringify(`.transcript-${role}-row`)});
          if (!frame || !target) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + 8 };
        })()`,
      );
      if (!point) throw new Error(`Missing ${client} ${role} row for narrow chat hover`);
      await movePointer(cdp, sessionId, point);
      await delay(client === "web" ? 250 : 75);
      return readMeta();
    };
    const webUser = await hoverRow("web", "user");
    const webAssistant = await hoverRow("web", "assistant");
    const lynxUser = await hoverRow("lynx", "user");
    const lynxAssistant = await hoverRow("lynx", "assistant");
    const visible = (entry) =>
      entry?.rect?.width > 0 && entry?.rect?.height > 0 && entry?.opacity === "1";
    narrowChatHoverEvidence = {
      inputChannel: "web-cdp-pointer|lynx-cdp-pointer",
      webUser: webUser?.web?.user ?? null,
      webAssistant: webAssistant?.web?.assistant ?? null,
      lynxUser: lynxUser?.lynx?.user ?? null,
      lynxAssistant: lynxAssistant?.lynx?.assistant ?? null,
      match:
        visible(webUser?.web?.user) &&
        visible(webAssistant?.web?.assistant) &&
        visible(lynxUser?.lynx?.user) &&
        visible(lynxAssistant?.lynx?.assistant),
    };
  }
  if (isNarrowComposerExpandState) {
    const points = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId, shadow) => {
          const frame = document.getElementById(frameId);
          const doc = frame?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const target = root?.querySelector('[aria-label="Expand composer"]');
          if (!frame || !target) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          return { x: frameRect.x + rect.x + 24, y: frameRect.y + rect.y + rect.height / 2 };
        };
        return { web: pointFor('web-pane', false), lynx: pointFor('lynx-pane', true) };
      })()`,
    );
    if (!points?.web || !points?.lynx) {
      throw new Error(`Missing narrow composer expand targets: ${JSON.stringify(points)}`);
    }
    await dispatchPointerClickWithMove(cdp, sessionId, points.web);
    await dispatchPointerClickWithMove(cdp, sessionId, points.lynx);
    state = await waitForWorkbenchState(
      cdp,
      sessionId,
      (next) =>
        next?.web?.composerMetrics?.editor?.rect?.rect?.height > 0 &&
        next?.lynx?.composerMetrics?.editor?.rect?.rect?.height > 0 &&
        next?.web?.composerMetrics?.anatomy?.surface?.attributes?.[
          "data-chat-composer-mobile-collapsed"
        ] !== "true" &&
        next?.lynx?.composerMetrics?.anatomy?.surface?.attributes?.[
          "data-chat-composer-mobile-collapsed"
        ] !== "true",
      3_000,
      "narrow composer expanded",
    );
    narrowComposerExpandEvidence = {
      inputChannel: "dual-cdp-pointer",
      points,
      web: state?.web?.composerMetrics ?? null,
      lynx: state?.lynx?.composerMetrics ?? null,
      match: true,
    };
    reachedTargetState = true;
  }
  webState = state?.web?.productState ?? null;
  lynxState = state?.lynx?.productState ?? null;
  stateIdentityMatch = currentStateIdentityMatches();
  finalCoreGeometryReady =
    isFlatSidebarLayoutState ||
    isSidebarThreadHoverPreviewState ||
    isNarrowChatThreadState ||
    completedNoDiffGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) ||
    isChatOutlineState ||
    coreGeometryMatches(state?.web, state?.lynx);
  finalFilesBrowserReady = filesBrowserReady(state);
  finalFileEditorReady = fileEditorReady(state);
  reachedTargetState ||= isFileEditorState && finalFileEditorReady;
  if (
    overlay &&
    !isModelPickerInteractionState &&
    !isRightPanelTerminalState &&
    (state?.web?.productState?.overlay !== overlay ||
      state?.lynx?.productState?.overlay !== overlay)
  ) {
    const overlayDiagnostics =
      overlay === "workspace-menu"
        ? await evaluate(
            cdp,
            sessionId,
            `(() => {
              const frame = document.getElementById('lynx-pane');
              const root = frame?.contentWindow?.document
                ?.getElementById('t3-lynx-preview')?.shadowRoot;
              if (!root) return null;
              const candidates = [...root.querySelectorAll(
                '[aria-label="Workspace"], [class*="workspace"], [class*="context-control"]'
              )];
              return candidates.map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  tagName: element.tagName,
                  text: element.textContent?.trim() ?? "",
                  attributes: Object.fromEntries(
                    element.getAttributeNames().map((name) => [name, element.getAttribute(name)])
                  ),
                  rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                };
              });
            })()`,
          ).catch((error) => ({ error: String(error) }))
        : overlay === "project-action-dialog"
          ? {
              trigger: webProjectActionTriggerDiagnostics,
              expectedProject: expectProject,
              webProject: state?.web?.productState?.selectedProject ?? null,
              webProjectActionMenuOpened,
            }
          : null;
    throw new Error(
      `Overlay ${overlay} closed before screenshot capture: ${JSON.stringify({
        overlayDiagnostics,
        web: {
          overlay: state?.web?.productState?.overlay ?? null,
          metrics: state?.web?.overlayMetrics ?? null,
          settingsModelTrigger: webSettingsModelTriggerDiagnostics,
          inputSent: webOverlayInputSent,
          waitPolls: webOverlayWaitPolls,
        },
        lynx: {
          overlay: state?.lynx?.productState?.overlay ?? null,
          metrics: state?.lynx?.overlayMetrics ?? null,
          inputSent: lynxOverlayInputSent,
          waitPolls: lynxOverlayWaitPolls,
        },
      })}`,
    );
  }
  const finalNotificationDismissed =
    !shouldClearWebNotification || (await dismissWebProviderNotification(cdp, sessionId));
  if (shouldClearWebNotification && !finalNotificationDismissed) {
    throw new Error("Web provider-update notification remained visible before capture.");
  }
  if (shouldClearWebNotification) {
    await delay(1_800);
    if (!(await dismissWebProviderNotification(cdp, sessionId))) {
      throw new Error("Web provider-update notification appeared after initial cleanup.");
    }
    const paintCommitted = await evaluate(
      cdp,
      sessionId,
      `new Promise((resolve) => {
        const frameWindow = document.getElementById('web-pane')?.contentWindow;
        if (!frameWindow?.requestAnimationFrame) {
          resolve(false);
          return;
        }
        frameWindow.requestAnimationFrame(() => {
          frameWindow.requestAnimationFrame(() => resolve(true));
        });
      })`,
    ).catch(() => false);
    if (!paintCommitted) {
      throw new Error("Web pane did not commit notification dismissal before capture.");
    }
  }
  if (stateId === "composer-sendable") {
    const blurPoints = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId, shadow) => {
          const frame = document.getElementById(frameId);
          const doc = frame?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const target = root?.querySelector('[data-chat-header]');
          if (!frame || !target) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
        };
        return { web: pointFor('web-pane', false), lynx: pointFor('lynx-pane', true) };
      })()`,
    );
    if (!blurPoints?.web || !blurPoints?.lynx) {
      throw new Error(`Composer sendable blur targets are missing: ${JSON.stringify(blurPoints)}`);
    }
    await dispatchPointerClickWithMove(cdp, sessionId, blurPoints.web);
    await dispatchPointerClickWithMove(cdp, sessionId, blurPoints.lynx);
    state = await readWorkbenchState(cdp, sessionId);
    if (
      state?.web?.composerMetrics?.editor?.value !== composerInput ||
      state?.lynx?.composerMetrics?.editor?.value !== composerInput ||
      state?.web?.composerMetrics?.primaryState !== "send" ||
      state?.lynx?.composerMetrics?.primaryState !== "send"
    ) {
      throw new Error(
        `Composer sendable state changed after blur: ${JSON.stringify({
          web: state?.web?.composerMetrics,
          lynx: state?.lynx?.composerMetrics,
        })}`,
      );
    }
  }
  if (isSidebarThreadHoverPreviewState) {
    sidebarThreadHoverPreview = await runSidebarThreadHoverPreviewFlow(cdp, sessionId, {
      width,
      height,
    });
  }
  if (shouldClearWebNotification) {
    const visibleToast = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const doc = document.getElementById('web-pane')?.contentWindow?.document;
        const popup = [...(doc?.querySelectorAll('[data-slot="toast-popup"]') ?? [])].find(
          (candidate) => {
            const rect = candidate.getBoundingClientRect();
            const style = doc?.defaultView?.getComputedStyle(candidate);
            return rect.width > 0 && rect.height > 0 && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0;
          },
        );
        if (!popup) return null;
        const rect = popup.getBoundingClientRect();
        return {
          text: popup.textContent?.trim().replace(/\s+/g, ' ') ?? '',
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      })()`,
    ).catch(() => null);
    if (visibleToast) {
      if (!(await dismissWebProviderNotification(cdp, sessionId, 4_000))) {
        throw new Error(
          `Visible Web notification remained at capture: ${JSON.stringify(visibleToast)}`,
        );
      }
      await evaluate(
        cdp,
        sessionId,
        `new Promise((resolve) => {
          const frameWindow = document.getElementById('web-pane')?.contentWindow;
          frameWindow?.requestAnimationFrame(() => frameWindow.requestAnimationFrame(resolve));
        })`,
      );
    }
  }
  if (stateId === "composer-working") {
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseMoved",
        x: Math.round(layout.webPane.x + layout.webPane.width),
        y: 1,
        button: "none",
        pointerType: "mouse",
      },
      sessionId,
    );
    await delay(250);
    const messageMetaHidden = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const read = (frameId, shadow) => {
          const doc = document.getElementById(frameId)?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const meta = root?.querySelector('.transcript-user-meta');
          if (!meta) return null;
          const style = doc?.defaultView?.getComputedStyle(meta);
          return { opacity: style?.opacity ?? null, visibility: style?.visibility ?? null };
        };
        return { web: read('web-pane', false), lynx: read('lynx-pane', true) };
      })()`,
    );
    if (messageMetaHidden?.web?.opacity !== "0" || messageMetaHidden?.lynx?.opacity !== "0") {
      throw new Error(
        `Composer Working message meta remained visible: ${JSON.stringify(messageMetaHidden)}`,
      );
    }
  }
  if (!isSidebarControlHoverState && !isSidebarThreadHoverPreviewState) {
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseMoved",
        x: Math.round(layout.webPane.x + layout.webPane.width),
        y: 1,
        button: "none",
        pointerType: "mouse",
      },
      sessionId,
    );
    const lynxSidebarTarget = await sidebarThreadCardTarget(cdp, sessionId, "lynx");
    if (lynxSidebarTarget?.relationId) {
      await invokeLynxTooltipProbe(cdp, sessionId, lynxSidebarTarget.relationId, "leave");
      await delay(250);
      const disclosure = await readSidebarThreadDisclosure(
        cdp,
        sessionId,
        "lynx",
        lynxSidebarTarget.threadId,
      );
      if (Number(disclosure?.actionsOpacity ?? 0) > 0.01) {
        throw new Error(`Lynx Sidebar hover cleanup failed: ${JSON.stringify(disclosure)}`);
      }
    }
  }
  if (stateId === "model-picker-selected") {
    const blurred = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const read = (frameId, shadow) => {
          const doc = document.getElementById(frameId)?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const input = root?.querySelector('#model-picker-search-input, input[placeholder="Search models..."]');
          input?.blur();
          return {
            inputPresent: input !== null && input !== undefined,
            focused:
              root?.activeElement === input || input?.ownerDocument?.activeElement === input,
          };
        };
        return { web: read('web-pane', false), lynx: read('lynx-pane', true) };
      })()`,
    );
    if (
      blurred?.web?.inputPresent !== true ||
      blurred?.lynx?.inputPresent !== true ||
      blurred.web.focused ||
      blurred.lynx.focused
    ) {
      throw new Error(`Model Picker search focus cleanup failed: ${JSON.stringify(blurred)}`);
    }
    await delay(250);
    const cleanedState = await readWorkbenchState(cdp, sessionId);
    if (
      cleanedState?.web?.productState?.overlay !== "model-picker" ||
      cleanedState?.lynx?.productState?.overlay !== "model-picker" ||
      !modelPickerSemanticsMatch(
        cleanedState?.web?.overlayMetrics,
        cleanedState?.lynx?.overlayMetrics,
      )
    ) {
      throw new Error(
        `Model Picker state changed during focus and hover cleanup: ${JSON.stringify({
          web: cleanedState?.web?.productState,
          lynx: cleanedState?.lynx?.productState,
        })}`,
      );
    }
  }
  state = await readWorkbenchState(cdp, sessionId);
  const clip = (r) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
    scale: 1,
  });

  const webShot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", clip: clip(layout.webPane), captureBeyondViewport: true },
    sessionId,
  );
  const lynxShot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", clip: clip(layout.lynxPane), captureBeyondViewport: true },
    sessionId,
  );
  const webPng = Buffer.from(webShot.data, "base64");
  const lynxPng = Buffer.from(lynxShot.data, "base64");
  const webPath = path.join(cellDir, "web.png");
  const lynxPath = path.join(cellDir, "lynx.png");
  if (!terminalOnlyImages) {
    await Promise.all([writeFile(webPath, webPng), writeFile(lynxPath, lynxPng)]);
  }
  const webAssertionsPath = path.join(cellDir, "web-assertions.json");
  const lynxAssertionsPath = path.join(cellDir, "lynx-assertions.json");
  const consolePath = path.join(cellDir, "console.txt");

  const webDims = pngDimensions(webPng);
  const lynxDims = pngDimensions(lynxPng);
  const sameDims = webDims.width === lynxDims.width && webDims.height === lynxDims.height;

  let sideBySide = null;
  let diff = null;
  if (sameDims && !terminalOnlyImages && !paneImagesOnly) {
    const sbsPath = path.join(cellDir, "side-by-side.png");
    const diffPath = path.join(cellDir, "diff.png");
    const sbs = runFfmpeg([
      "-i",
      webPath,
      "-i",
      lynxPath,
      "-filter_complex",
      "hstack=inputs=2",
      sbsPath,
    ]);
    const dff = runFfmpeg([
      "-i",
      webPath,
      "-i",
      lynxPath,
      "-filter_complex",
      "blend=all_mode=difference",
      diffPath,
    ]);
    sideBySide = sbs.ok ? path.relative(repoRoot, sbsPath) : { error: sbs.reason };
    diff = dff.ok ? path.relative(repoRoot, diffPath) : { error: dff.reason };
  }

  if (isShortCompactControlsState && finalCompactControlsReady) {
    const scrollPoints = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId, shadow) => {
          const frame = document.getElementById(frameId);
          const doc = frame?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const scroll = root?.querySelector(
            '.composer-compact-controls-menu__scroll, [data-floating-popup="composer-compact-controls-menu"] > div'
          );
          if (!frame || !scroll) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = scroll.getBoundingClientRect();
          return {
            x: frameRect.x + rect.x + rect.width / 2,
            y: frameRect.y + rect.y + rect.height / 2,
          };
        };
        return {
          web: pointFor('web-pane', false),
          lynx: pointFor('lynx-pane', true),
        };
      })()`,
    ).catch(() => null);
    if (scrollPoints?.web) await dispatchMouseWheel(cdp, sessionId, scrollPoints.web, 600);
    if (scrollPoints?.lynx) await dispatchMouseWheel(cdp, sessionId, scrollPoints.lynx, 600);
    const scrollDeadline = Date.now() + 3_000;
    while (Date.now() < scrollDeadline) {
      const scrolled = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const read = (root) => {
            const scroll = root?.querySelector(
              '.composer-compact-controls-menu__scroll, [data-floating-popup="composer-compact-controls-menu"] > div'
            );
            const rows = [
              ...(root?.querySelectorAll(
                '.composer-compact-controls-menu__item, [data-floating-popup="composer-compact-controls-menu"] [data-slot="menu-radio-item"]'
              ) ?? []),
            ];
            const last = rows.at(-1);
            if (!scroll || !last) return null;
            const scrollRect = scroll.getBoundingClientRect();
            const lastRect = last.getBoundingClientRect();
            return {
              lastLabel: last.textContent?.trim().replace(/\\s*Default\\s*$/u, '') ?? '',
              lastVisible:
                lastRect.y >= scrollRect.y - 1 &&
                lastRect.y + lastRect.height <= scrollRect.y + scrollRect.height + 1,
              lastRect: {
                x: lastRect.x,
                y: lastRect.y,
                width: lastRect.width,
                height: lastRect.height,
              },
              scrollRect: {
                x: scrollRect.x,
                y: scrollRect.y,
                width: scrollRect.width,
                height: scrollRect.height,
              },
              scrollTop: typeof scroll.scrollTop === 'number' ? scroll.scrollTop : null,
              dataScrollOffset: scroll.getAttribute('data-scroll-offset'),
            };
          };
          const web = document.getElementById('web-pane')?.contentWindow?.document;
          const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
            ?.getElementById('t3-lynx-preview')?.shadowRoot;
          return { web: read(web), lynx: read(lynx) };
        })()`,
      ).catch(() => null);
      shortCompactControlsScrollDiagnostics = scrolled;
      if (
        scrolled?.web?.lastLabel === "Full access" &&
        scrolled?.web?.lastVisible === true &&
        scrolled?.lynx?.lastLabel === "Full access" &&
        scrolled?.lynx?.lastVisible === true
      ) {
        shortCompactControlsScrolled = true;
        break;
      }
      await delay(100);
    }

    if (shortCompactControlsScrolled) {
      const outsidePoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId) => {
            const frame = document.getElementById(frameId);
            if (!frame) return null;
            const rect = frame.getBoundingClientRect();
            return { x: rect.x + rect.width - 24, y: rect.y + 300 };
          };
          return {
            web: pointFor('web-pane'),
            lynx: pointFor('lynx-pane'),
          };
        })()`,
      ).catch(() => null);
      if (outsidePoints?.web) {
        await dispatchPointerClickWithMove(cdp, sessionId, outsidePoints.web);
      }
      if (outsidePoints?.lynx) {
        await dispatchPointerClickWithMove(cdp, sessionId, outsidePoints.lynx);
      }
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const dismissed = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const web = document.getElementById('web-pane')?.contentWindow?.document;
            const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
              ?.getElementById('t3-lynx-preview')?.shadowRoot;
            return {
              web:
                web?.querySelector('[data-floating-popup="composer-compact-controls-menu"]') ===
                null,
              lynx: lynx?.querySelector('.composer-compact-controls-menu') === null,
            };
          })()`,
        ).catch(() => null);
        if (dismissed?.web && dismissed?.lynx) {
          shortCompactControlsDismissed = true;
          break;
        }
        await delay(100);
      }
    }
  }

  if (isGitPublishDialogState && finalGitPublishDialogReady) {
    const dismissPoints = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId, shadow) => {
          const frame = document.getElementById(frameId);
          const doc = frame?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const target = root?.querySelector(
            '[data-slot="dialog-backdrop"], [aria-label="Dismiss Publish repository"]'
          );
          if (!frame || !target) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          return {
            x: frameRect.x + rect.x + 8,
            y: frameRect.y + rect.y + 8,
          };
        };
        return {
          web: pointFor('web-pane', false),
          lynx: pointFor('lynx-pane', true),
        };
      })()`,
    ).catch(() => null);
    if (dismissPoints?.web) await dispatchPointerClick(cdp, sessionId, dismissPoints.web);
    if (dismissPoints?.lynx) await dispatchPointerClick(cdp, sessionId, dismissPoints.lynx);
    const dismissDeadline = Date.now() + 3_000;
    while (Date.now() < dismissDeadline) {
      const dismissed = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const web = document.getElementById('web-pane')?.contentWindow?.document;
          const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
            ?.getElementById('t3-lynx-preview')?.shadowRoot;
          return {
            web: !web?.querySelector('[data-git-publish-dialog="true"]'),
            lynx: !lynx?.querySelector('[data-git-publish-dialog="true"]'),
          };
        })()`,
      ).catch(() => null);
      if (dismissed?.web && dismissed?.lynx) {
        gitPublishDismissed = true;
        break;
      }
      await delay(100);
    }
  }

  if ((isRightPanelAddMenuState || isRightPanelTerminalState) && finalRightPanelAddMenuReady) {
    const outsidePoints = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId) => {
          const frame = document.getElementById(frameId);
          if (!frame) return null;
          const rect = frame.getBoundingClientRect();
          return { x: rect.x + 400, y: rect.y + 300 };
        };
        return {
          web: pointFor('web-pane'),
          lynx: pointFor('lynx-pane'),
        };
      })()`,
    ).catch(() => null);
    if (outsidePoints?.web) await dispatchPointerClickWithMove(cdp, sessionId, outsidePoints.web);
    if (outsidePoints?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, outsidePoints.lynx);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const dismissed = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const web = document.getElementById('web-pane')?.contentWindow?.document;
          const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
            ?.getElementById('t3-lynx-preview')?.shadowRoot;
          return {
            web: web?.querySelector('[data-floating-popup="right-panel-add-menu"]') === null,
            lynx: lynx?.querySelector('.right-panel__add-menu') === null,
          };
        })()`,
      ).catch(() => null);
      if (dismissed?.web && dismissed?.lynx) {
        rightPanelAddMenuDismissed = true;
        break;
      }
      await delay(100);
    }

    if (rightPanelAddMenuDismissed) {
      const triggerPoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const trigger = root?.querySelector(
              ${JSON.stringify(isRightPanelTerminalState)}
                ? (shadow ? '.topbar__toggle--terminal' : '[aria-label="Toggle right panel"]')
                : '[data-floating-anchor="right-panel-add-menu"], .right-panel__add-btn'
            );
            if (!frame || !trigger) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = trigger.getBoundingClientRect();
            return {
              x: frameRect.x + rect.x + rect.width / 2,
              y: frameRect.y + rect.y + rect.height / 2,
            };
          };
          return {
            web: pointFor('web-pane', false),
            lynx: pointFor('lynx-pane', true),
          };
        })()`,
      ).catch(() => null);
      if (isRightPanelTerminalState) {
        if (!triggerPoints?.lynx) throw new Error("Missing Lynx terminal trigger");
        await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.lynx);
        const lynxTerminalPresent = () =>
          evaluate(
            cdp,
            sessionId,
            `document.getElementById('lynx-pane')?.contentWindow?.document
              ?.getElementById('t3-lynx-preview')?.shadowRoot
              ?.querySelector('.terminal-panel[data-terminal-session-id="term-1"]') !== null`,
          ).catch(() => false);
        let lynxTerminalReady = await lynxTerminalPresent();
        let lynxTerminalPoint = null;
        for (let attempt = 0; !lynxTerminalReady && attempt < 20; attempt += 1) {
          lynxTerminalReady = await lynxTerminalPresent();
          if (lynxTerminalReady) break;
          lynxTerminalPoint = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const frame = document.getElementById('lynx-pane');
              const root = frame?.contentWindow?.document
                ?.getElementById('t3-lynx-preview')?.shadowRoot;
              const target = root?.querySelector('[data-right-panel-add-kind="terminal"]');
              if (!frame || !target) return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
            })()`,
          ).catch(() => null);
          if (lynxTerminalPoint) break;
          await delay(50);
        }
        if (!lynxTerminalReady) {
          if (!lynxTerminalPoint) throw new Error("Missing Lynx Terminal menu row");
          await dispatchPointerClickWithMove(cdp, sessionId, lynxTerminalPoint);
        }
        const lynxTerminalDeadline = Date.now() + 5_000;
        while (Date.now() < lynxTerminalDeadline) {
          lynxTerminalReady = await lynxTerminalPresent();
          if (lynxTerminalReady) break;
          await delay(50);
        }
        if (!lynxTerminalReady) throw new Error("Lynx authority terminal term-1 did not open");
        const attached = await evaluate(
          cdp,
          sessionId,
          `document.getElementById('web-pane')?.contentWindow
            ?.__T3_WORKBENCH_OPEN_TERMINAL__?.('term-1') ?? false`,
        ).catch(() => false);
        if (!attached) throw new Error("Web authority terminal attach hook was unavailable");
      }
      if (triggerPoints?.web && !isRightPanelTerminalState) {
        await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.web);
      }
      if (triggerPoints?.lynx && !isRightPanelTerminalState) {
        await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.lynx);
      }
      let terminalPoints = isRightPanelTerminalState
        ? { web: { alreadySelected: true }, lynx: { alreadySelected: true } }
        : null;
      for (let attempt = 0; !isRightPanelTerminalState && attempt < 20; attempt += 1) {
        terminalPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              if (${JSON.stringify(isRightPanelTerminalState)} && shadow) {
                return root?.querySelector('.terminal-panel') ? { alreadySelected: true } : null;
              }
              const rows = [
                ...(root?.querySelectorAll(
                  '[data-floating-popup="right-panel-add-menu"] [data-slot="menu-item"], [data-right-panel-add-kind], [data-right-panel-action="terminal"]'
                ) ?? []),
              ];
              const target = rows.find((row) =>
                row.getAttribute('data-right-panel-add-kind') === 'terminal' ||
                row.getAttribute('data-right-panel-action') === 'terminal' ||
                row.textContent?.trim() === 'Terminal'
              );
              if (!frame || !target) return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (
          terminalPoints?.web &&
          (isRightPanelTerminalState ||
            terminalPoints?.lynx ||
            terminalPoints?.lynx?.alreadySelected)
        )
          break;
        await delay(100);
      }
      if (terminalPoints?.web && !terminalPoints.web.alreadySelected)
        await dispatchPointerClickWithMove(cdp, sessionId, terminalPoints.web);
      if (isRightPanelTerminalState) {
        const webTerminalDeadline = Date.now() + 5_000;
        let webTerminalReady = false;
        while (Date.now() < webTerminalDeadline) {
          webTerminalReady = await evaluate(
            cdp,
            sessionId,
            `document.getElementById('web-pane')?.contentWindow?.document
              ?.querySelector('[data-terminal-id="term-1"]') !== null`,
          ).catch(() => false);
          if (webTerminalReady) break;
          await delay(50);
        }
        if (!webTerminalReady) throw new Error("Web authority terminal term-1 did not open");
      }
      if (terminalPoints?.lynx && !terminalPoints.lynx.alreadySelected) {
        await dispatchPointerClickWithMove(cdp, sessionId, terminalPoints.lynx);
      }
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const selected = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const web = document.getElementById('web-pane')?.contentWindow?.document;
            const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
              ?.getElementById('t3-lynx-preview')?.shadowRoot;
            return {
              web:
                (web?.querySelector('[data-terminal-id="term-1"]') !== null ||
                  web
                    ?.querySelector('[data-active-tab="true"]')
                    ?.textContent?.trim()
                    .includes('Terminal') === true) &&
                web?.querySelector('[data-floating-popup="right-panel-add-menu"]') === null,
              lynx:
                lynx
                  ?.querySelector('[data-right-panel-open="true"]')
                  ?.getAttribute('data-right-panel-active-kind') === 'terminal' &&
                lynx?.querySelector('.terminal-panel') !== null &&
                window.__T3_WORKBENCH__?.read()?.lynx?.connectorDiagnostics?.commands?.some(
                  ({ method }) => method === 'openTerminal'
                ) === true &&
                lynx?.querySelector('.right-panel__add-menu') === null,
            };
          })()`,
        ).catch(() => null);
        if (selected?.web && selected?.lynx) {
          rightPanelAddMenuTerminalSelected = true;
          break;
        }
        await delay(100);
      }
      if (
        isRightPanelTerminalState &&
        rightPanelAddMenuTerminalSelected &&
        rightPanelTerminalCommand === null
      ) {
        const focused = await focusRemoteElement(
          cdp,
          sessionId,
          `document.getElementById('lynx-pane')?.contentWindow?.document
            ?.getElementById('t3-lynx-preview')?.shadowRoot
            ?.querySelector('.terminal-panel__input')?.shadowRoot?.querySelector('input') ??
            document.getElementById('lynx-pane')?.contentWindow?.document
              ?.getElementById('t3-lynx-preview')?.shadowRoot
              ?.querySelector('.terminal-panel__input') ?? null`,
        );
        if (!focused) throw new Error("Could not focus the Lynx terminal command input.");
        await cdp.send("Input.insertText", { text: "pwd" }, sessionId);
        const runPoint = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('lynx-pane');
            const root = frame?.contentWindow?.document
              ?.getElementById('t3-lynx-preview')?.shadowRoot;
            const target = root?.querySelector('.terminal-panel__run');
            if (!frame || !target) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = target.getBoundingClientRect();
            return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
          })()`,
        );
        if (!runPoint) throw new Error("Could not locate the Lynx terminal Run control.");
        await dispatchPointerClickWithMove(cdp, sessionId, runPoint);
        const commandDeadline = Date.now() + 5_000;
        while (Date.now() < commandDeadline) {
          rightPanelTerminalCommand = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const state = window.__T3_WORKBENCH__?.read();
              const frame = document.getElementById('lynx-pane');
              const root = frame?.contentWindow?.document
                ?.getElementById('t3-lynx-preview')?.shadowRoot;
              const output = root?.querySelector('.terminal-panel__output')?.textContent ?? '';
              return {
                output,
                writeObserved: state?.lynx?.connectorDiagnostics?.commands?.some(
                  ({ method }) => method === 'writeTerminal'
                ) === true,
              };
            })()`,
          ).catch(() => null);
          if (
            rightPanelTerminalCommand?.writeObserved &&
            rightPanelTerminalCommand.output.includes("/Users/bytedance/github/t3code-lynxtron")
          )
            break;
          await delay(100);
        }
        if (
          !rightPanelTerminalCommand?.writeObserved ||
          !rightPanelTerminalCommand.output.includes("/Users/bytedance/github/t3code-lynxtron")
        ) {
          throw new Error(
            `Lynx terminal command did not return the shared cwd: ${JSON.stringify(rightPanelTerminalCommand)}`,
          );
        }
        if (stateId === "right-panel-terminal") {
          const terminalCaptureGeometry = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const state = window.__T3_WORKBENCH__?.read();
              return {
                webPanelWidth: state?.web?.reviewMetrics?.panelRect?.rect?.width ?? null,
                lynxPanelWidth: state?.lynx?.reviewMetrics?.panelRect?.rect?.width ?? null,
                webTerminalId: document.getElementById('web-pane')?.contentWindow?.document
                  ?.querySelector('[data-terminal-id]')?.getAttribute('data-terminal-id') ?? null,
                lynxTerminalId: document.getElementById('lynx-pane')?.contentWindow?.document
                  ?.getElementById('t3-lynx-preview')?.shadowRoot
                  ?.querySelector('.terminal-panel')?.getAttribute('data-terminal-session-id') ?? null,
              };
            })()`,
          );
          if (
            typeof terminalCaptureGeometry?.webPanelWidth !== "number" ||
            typeof terminalCaptureGeometry?.lynxPanelWidth !== "number" ||
            Math.abs(
              terminalCaptureGeometry.webPanelWidth - terminalCaptureGeometry.lynxPanelWidth,
            ) > 1
          ) {
            throw new Error(
              `Terminal paired capture panel widths diverged: ${JSON.stringify(terminalCaptureGeometry)}`,
            );
          }
          if (
            !terminalCaptureGeometry.webTerminalId ||
            terminalCaptureGeometry.webTerminalId !== terminalCaptureGeometry.lynxTerminalId
          ) {
            throw new Error(
              `Terminal paired capture sessions diverged: ${JSON.stringify(terminalCaptureGeometry)}`,
            );
          }
          rightPanelTerminalScreenshot = {
            ...(await capturePanePair({
              cdp,
              sessionId,
              layout,
              cellDir,
              prefix: "terminal",
            })),
            geometry: terminalCaptureGeometry,
          };
        }
        if (
          isRightPanelTerminalMultiSessionState ||
          isRightPanelTerminalSplitState ||
          isRightPanelTerminalVerticalSplitState
        ) {
          const clickTerminalControl = async (selector, label) => {
            const point = await evaluate(
              cdp,
              sessionId,
              `(() => {
                const frame = document.getElementById('lynx-pane');
                const root = frame?.contentWindow?.document
                  ?.getElementById('t3-lynx-preview')?.shadowRoot;
                const target = root?.querySelector(${JSON.stringify(selector)});
                if (!frame || !target) return null;
                const frameRect = frame.getBoundingClientRect();
                const rect = target.getBoundingClientRect();
                return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
              })()`,
            );
            if (!point) throw new Error(`Could not locate ${label}.`);
            await dispatchPointerClickWithMove(cdp, sessionId, point);
          };
          const runLynxTerminalMarker = async (marker) => {
            const focused = await focusRemoteElement(
              cdp,
              sessionId,
              `document.getElementById('lynx-pane')?.contentWindow?.document
                ?.getElementById('t3-lynx-preview')?.shadowRoot
                ?.querySelector('.terminal-panel__input')?.shadowRoot?.querySelector('input') ??
                document.getElementById('lynx-pane')?.contentWindow?.document
                  ?.getElementById('t3-lynx-preview')?.shadowRoot
                  ?.querySelector('.terminal-panel__input') ?? null`,
            );
            if (!focused) throw new Error(`Could not focus Lynx terminal for ${marker}.`);
            await cdp.send("Input.insertText", { text: `printf ${marker}` }, sessionId);
            await clickTerminalControl(".terminal-panel__run", `Run for ${marker}`);
            const deadline = Date.now() + 5_000;
            while (Date.now() < deadline) {
              const output = await evaluate(
                cdp,
                sessionId,
                `document.getElementById('lynx-pane')?.contentWindow?.document
                  ?.getElementById('t3-lynx-preview')?.shadowRoot
                  ?.querySelector('.terminal-panel__viewport--active .terminal-panel__output')
                  ?.textContent ?? ''`,
              ).catch(() => "");
              if (output.includes(marker)) return;
              await delay(100);
            }
            throw new Error(`Lynx terminal output did not include ${marker}.`);
          };
          const addSessionPoints = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const pointFor = (frameId, shadow, selector) => {
                const frame = document.getElementById(frameId);
                const doc = frame?.contentWindow?.document;
                const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
                const target = root?.querySelector(selector);
                if (!frame || !target) return null;
                const frameRect = frame.getBoundingClientRect();
                const rect = target.getBoundingClientRect();
                return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
              };
              return {
                web: pointFor(
                  'web-pane',
                  false,
                  ${JSON.stringify(isRightPanelTerminalVerticalSplitState)}
                    ? '[data-terminal-owner="right-panel"] [aria-label^="Split Terminal Vertically"]'
                    : ${JSON.stringify(isRightPanelTerminalSplitState)}
                      ? '[data-terminal-owner="right-panel"] [aria-label^="Split Terminal Horizontally"]'
                      : '[data-terminal-owner="right-panel"] [aria-label^="New Terminal"]'
                ),
                lynx: pointFor(
                  'lynx-pane',
                  true,
                  ${JSON.stringify(isRightPanelTerminalVerticalSplitState)}
                    ? '[aria-label="Split terminal vertically"]'
                    : ${JSON.stringify(isRightPanelTerminalSplitState)}
                      ? '[aria-label="Split terminal horizontally"]'
                      : '[aria-label="New terminal"]'
                ),
              };
            })()`,
          );
          if (!addSessionPoints?.web || !addSessionPoints?.lynx) {
            throw new Error(
              `Could not locate terminal session controls: ${JSON.stringify(addSessionPoints)}`,
            );
          }
          const beforeNew = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const state = window.__T3_WORKBENCH__?.read();
              const web = document.getElementById('web-pane')?.contentWindow?.document;
              const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
                ?.getElementById('t3-lynx-preview')?.shadowRoot;
              return {
                webThread: state?.web?.productState?.activeThreadId ?? null,
                lynxThread: state?.lynx?.productState?.activeThreadId ?? null,
                webTerminalText: web?.querySelector('[data-terminal-owner="right-panel"]')?.textContent?.trim() ?? null,
                lynxCount: Number(lynx?.querySelector('.terminal-panel')?.getAttribute('data-terminal-session-count')),
              };
            })()`,
          );
          await dispatchPointerClickWithMove(cdp, sessionId, addSessionPoints.web);
          await dispatchPointerClickWithMove(cdp, sessionId, addSessionPoints.lynx);
          let secondSessionReady = false;
          for (let attempt = 0; attempt < 50; attempt += 1) {
            const latest = await evaluate(
              cdp,
              sessionId,
              `(() => {
                const state = window.__T3_WORKBENCH__?.read();
                const panel = document.getElementById('lynx-pane')?.contentWindow?.document
                  ?.getElementById('t3-lynx-preview')?.shadowRoot
                  ?.querySelector('.terminal-panel');
                return {
                  count: Number(panel?.getAttribute('data-terminal-session-count')),
                  activeId: panel?.getAttribute('data-terminal-session-id') ?? null,
                  openCount: state?.lynx?.connectorDiagnostics?.commands?.filter(
                    ({ method }) => method === 'openTerminal'
                  ).length ?? 0,
                };
              })()`,
            ).catch(() => null);
            if (latest?.count === 2 && latest?.activeId === "term-2" && latest?.openCount >= 2) {
              secondSessionReady = true;
              break;
            }
            await delay(100);
          }
          if (!secondSessionReady) throw new Error("Second Lynx terminal session did not open.");
          await runLynxTerminalMarker("LYNX_TERM_2_MARKER");
          await clickTerminalControl('[data-terminal-session-tab="term-1"]', "Terminal 1 tab");
          await runLynxTerminalMarker("LYNX_TERM_1_MARKER");
          await clickTerminalControl('[data-terminal-session-tab="term-2"]', "Terminal 2 tab");
          for (let attempt = 0; attempt < 30; attempt += 1) {
            const activeId = await evaluate(
              cdp,
              sessionId,
              `document.getElementById('lynx-pane')?.contentWindow?.document
                ?.getElementById('t3-lynx-preview')?.shadowRoot
                ?.querySelector('.terminal-panel')?.getAttribute('data-terminal-session-id') ?? null`,
            ).catch(() => null);
            if (activeId === "term-2") break;
            await delay(100);
          }
          const isolated = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const web = document.getElementById('web-pane')?.contentWindow?.document;
              const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
                ?.getElementById('t3-lynx-preview')?.shadowRoot;
              const panes = [...(lynx?.querySelectorAll('[data-terminal-viewport]') ?? [])];
              const viewportContainer = lynx?.querySelector(
                '.terminal-panel__viewports-horizontal, .terminal-panel__viewports-vertical'
              );
              const output = lynx
                ?.querySelector('.terminal-panel__viewport--active .terminal-panel__output')
                ?.textContent ?? '';
              return {
                webHasSecondTerminal: web?.body?.innerText?.includes('Terminal 2') === true,
                lynxCount: Number(lynx?.querySelector('.terminal-panel')?.getAttribute('data-terminal-session-count')),
                lynxActiveId: lynx?.querySelector('.terminal-panel')?.getAttribute('data-terminal-session-id') ?? null,
                lynxSplit: lynx?.querySelector('.terminal-panel')?.getAttribute('data-terminal-split') ?? null,
                lynxViewportContainerClass: viewportContainer?.getAttribute('class') ?? null,
                lynxPaneClasses: panes.map((pane) => pane.getAttribute('class') ?? ''),
                lynxPaneWidths: [...(lynx?.querySelectorAll('[data-terminal-viewport]') ?? [])]
                  .map((pane) => pane.getBoundingClientRect().width),
                lynxPaneHeights: [...(lynx?.querySelectorAll('[data-terminal-viewport]') ?? [])]
                  .map((pane) => pane.getBoundingClientRect().height),
                lynxPaneOutputs: panes.map((pane) => ({
                  id: pane.getAttribute('data-terminal-viewport'),
                  output: pane.querySelector('.terminal-panel__output')?.textContent ?? '',
                })),
                output,
              };
            })()`,
          );
          if (
            !isolated?.webHasSecondTerminal ||
            isolated?.lynxCount !== 2 ||
            isolated?.lynxActiveId !== "term-2" ||
            (isRightPanelTerminalSplitState &&
              (isolated?.lynxSplit !== "horizontal" ||
                isolated?.lynxPaneWidths?.length !== 2 ||
                isolated.lynxPaneWidths.some((paneWidth) => paneWidth < 240))) ||
            (isRightPanelTerminalVerticalSplitState &&
              (isolated?.lynxSplit !== "vertical" ||
                isolated?.lynxPaneHeights?.length !== 2 ||
                isolated.lynxPaneHeights.some((paneHeight) => paneHeight < 300) ||
                isolated.lynxPaneWidths.some((paneWidth) => paneWidth < 500))) ||
            !isolated?.output?.includes("LYNX_TERM_2_MARKER") ||
            isolated?.output?.includes("LYNX_TERM_1_MARKER")
          ) {
            throw new Error(`Terminal histories were not isolated: ${JSON.stringify(isolated)}`);
          }
          if (isRightPanelTerminalSplitState || isRightPanelTerminalVerticalSplitState) {
            rightPanelTerminalScreenshot = await capturePanePair({
              cdp,
              sessionId,
              layout,
              cellDir,
              prefix: "terminal",
            });
          }
          await clickTerminalControl('[aria-label="Close Terminal 2"]', "Close Terminal 2");
          for (let attempt = 0; attempt < 30; attempt += 1) {
            const current = await evaluate(
              cdp,
              sessionId,
              `(() => {
                const panel = document.getElementById('lynx-pane')?.contentWindow?.document
                  ?.getElementById('t3-lynx-preview')?.shadowRoot
                  ?.querySelector('.terminal-panel');
                return {
                  count: Number(panel?.getAttribute('data-terminal-session-count')),
                  activeId: panel?.getAttribute('data-terminal-session-id') ?? null,
                };
              })()`,
            ).catch(() => null);
            if (current?.count === 1 && current?.activeId === "term-1") break;
            await delay(100);
          }
          const closed = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
                ?.getElementById('t3-lynx-preview')?.shadowRoot;
              return {
                count: Number(lynx?.querySelector('.terminal-panel')?.getAttribute('data-terminal-session-count')),
                activeId: lynx?.querySelector('.terminal-panel')?.getAttribute('data-terminal-session-id') ?? null,
                output: lynx?.querySelector('.terminal-panel__output')?.textContent ?? '',
              };
            })()`,
          );
          if (
            closed?.count !== 1 ||
            closed?.activeId !== "term-1" ||
            !closed?.output?.includes("LYNX_TERM_1_MARKER")
          ) {
            throw new Error(
              `Terminal close did not fall back to term-1: ${JSON.stringify(closed)}`,
            );
          }
          rightPanelTerminalMultiSession = {
            input: isRightPanelTerminalVerticalSplitState
              ? "web-vertical-split-pointer|lynx-vertical-split-switch-write-close-pointers"
              : isRightPanelTerminalSplitState
                ? "web-horizontal-split-pointer|lynx-horizontal-split-switch-write-close-pointers"
                : "web-new-pointer|lynx-new-switch-write-close-pointers",
            beforeNew,
            isolated,
            closed,
          };
        }
        if (!isRightPanelTerminalMultiSessionState) {
          const beforeResize = await evaluate(
            cdp,
            sessionId,
            `(() => {
            const state = window.__T3_WORKBENCH__?.read();
            const panel = state?.lynx?.reviewMetrics?.panelRect;
            const grids = state?.lynx?.connectorDiagnostics?.commands
              ?.filter(({ method, terminalGrid }) => method === 'resizeTerminal' && terminalGrid)
              .map(({ terminalGrid }) => terminalGrid) ?? [];
            return { panelWidth: panel?.rect?.width ?? null, grids };
          })()`,
          );
          const invokedResize = await evaluate(
            cdp,
            sessionId,
            `document.getElementById('lynx-pane')?.contentWindow
            ?.__T3_LYNX_WEB_PREVIEW__?.invokeResizeForHarness?.('right-panel', 740, 640) ?? false`,
          );
          if (invokedResize !== true)
            throw new Error("Lynx right-panel resize probe is unavailable.");
          const resizeDeadline = Date.now() + 3_000;
          let afterResize = null;
          while (Date.now() < resizeDeadline) {
            afterResize = await evaluate(
              cdp,
              sessionId,
              `(() => {
              const state = window.__T3_WORKBENCH__?.read();
              const panel = state?.lynx?.reviewMetrics?.panelRect;
              const grids = state?.lynx?.connectorDiagnostics?.commands
                ?.filter(({ method, terminalGrid }) => method === 'resizeTerminal' && terminalGrid)
                .map(({ terminalGrid }) => terminalGrid) ?? [];
              return { panelWidth: panel?.rect?.width ?? null, grids };
            })()`,
            ).catch(() => null);
            const beforeGrid = beforeResize?.grids?.at(-1);
            const afterGrid = afterResize?.grids?.at(-1);
            if (
              typeof beforeResize?.panelWidth === "number" &&
              typeof afterResize?.panelWidth === "number" &&
              afterResize.panelWidth > beforeResize.panelWidth + 50 &&
              typeof beforeGrid?.cols === "number" &&
              typeof afterGrid?.cols === "number" &&
              afterGrid.cols > beforeGrid.cols &&
              afterGrid.rows === beforeGrid.rows
            ) {
              break;
            }
            await delay(100);
          }
          const beforeGrid = beforeResize?.grids?.at(-1);
          const afterGrid = afterResize?.grids?.at(-1);
          if (
            typeof beforeResize?.panelWidth !== "number" ||
            typeof afterResize?.panelWidth !== "number" ||
            afterResize.panelWidth <= beforeResize.panelWidth + 50 ||
            typeof beforeGrid?.cols !== "number" ||
            typeof afterGrid?.cols !== "number" ||
            afterGrid.cols <= beforeGrid.cols ||
            afterGrid.rows !== beforeGrid.rows
          ) {
            throw new Error(
              `Lynx terminal grid did not follow the committed panel resize: ${JSON.stringify({ beforeResize, afterResize })}`,
            );
          }
          rightPanelTerminalCommand = {
            ...rightPanelTerminalCommand,
            resize: { before: beforeResize, after: afterResize },
          };
          const committedResizeDelta = afterResize.panelWidth - beforeResize.panelWidth;
          const restoreStartX = 640;
          const restoreEndX = restoreStartX + committedResizeDelta;
          const restoredResize = await evaluate(
            cdp,
            sessionId,
            `document.getElementById('lynx-pane')?.contentWindow
            ?.__T3_LYNX_WEB_PREVIEW__?.invokeResizeForHarness?.(
              'right-panel',
              ${restoreStartX},
              ${restoreEndX}
            ) ?? false`,
          );
          if (restoredResize !== true)
            throw new Error("Lynx right-panel resize restore probe is unavailable.");
          const restoreDeadline = Date.now() + 3_000;
          while (Date.now() < restoreDeadline) {
            state =
              (await evaluate(
                cdp,
                sessionId,
                `(() => window.__T3_WORKBENCH__?.read() ?? null)()`,
              ).catch(() => null)) ?? state;
            if (rightPanelTerminalReady(state)) break;
            await delay(100);
          }
          if (!rightPanelTerminalReady(state)) {
            throw new Error(
              `Terminal visual authority was not restored after resize: ${JSON.stringify({
                webPanel: state?.web?.reviewMetrics?.panelRect?.rect ?? null,
                lynxPanel: state?.lynx?.reviewMetrics?.panelRect?.rect ?? null,
                webTerminal: state?.web?.reviewMetrics?.terminal ?? null,
                lynxTerminal: state?.lynx?.reviewMetrics?.terminal ?? null,
              })}`,
            );
          }
          rightPanelTerminalCommand = {
            ...rightPanelTerminalCommand,
            resize: {
              ...rightPanelTerminalCommand.resize,
              restored: true,
              restorePointer: { startX: restoreStartX, endX: restoreEndX },
            },
          };
        }
        state =
          (await evaluate(
            cdp,
            sessionId,
            `(() => window.__T3_WORKBENCH__?.read() ?? null)()`,
          ).catch(() => null)) ?? state;
        finalRightPanelTerminalReady = rightPanelTerminalReady(state);
        if (!rightPanelTerminalScreenshot) {
          rightPanelTerminalScreenshot = await capturePanePair({
            cdp,
            sessionId,
            layout,
            cellDir,
            prefix: "terminal",
          });
        }
        rightPanelTerminalCommand = { ...rightPanelTerminalCommand, closed: "not-claimed" };
      }
    }
  }

  if (isDiffScopeMenuState && finalDiffScopeMenuReady) {
    const outsidePoints = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId) => {
          const frame = document.getElementById(frameId);
          if (!frame) return null;
          const rect = frame.getBoundingClientRect();
          return { x: rect.x + 400, y: rect.y + 300 };
        };
        return {
          web: pointFor('web-pane'),
          lynx: pointFor('lynx-pane'),
        };
      })()`,
    ).catch(() => null);
    if (outsidePoints?.web) await dispatchPointerClickWithMove(cdp, sessionId, outsidePoints.web);
    if (outsidePoints?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, outsidePoints.lynx);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const dismissed = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const web = document.getElementById('web-pane')?.contentWindow?.document;
          const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
            ?.getElementById('t3-lynx-preview')?.shadowRoot;
          return {
            web: web?.querySelector('[data-floating-popup="diff-scope-menu"]') === null,
            lynx: lynx?.querySelector('.diff-panel-header__scope-menu') === null,
          };
        })()`,
      ).catch(() => null);
      if (dismissed?.web && dismissed?.lynx) {
        diffScopeMenuDismissed = true;
        break;
      }
      await delay(100);
    }

    if (diffScopeMenuDismissed) {
      const triggerPoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const trigger = root?.querySelector('[data-floating-anchor="diff-scope-menu"]');
            if (!frame || !trigger) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = trigger.getBoundingClientRect();
            return {
              x: frameRect.x + rect.x + rect.width / 2,
              y: frameRect.y + rect.y + rect.height / 2,
            };
          };
          return {
            web: pointFor('web-pane', false),
            lynx: pointFor('lynx-pane', true),
          };
        })()`,
      ).catch(() => null);
      if (triggerPoints?.web) await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.web);
      if (triggerPoints?.lynx)
        await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.lynx);
      let workingTreePoints = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        workingTreePoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const rows = [
                ...(root?.querySelectorAll(
                  '[data-floating-popup="diff-scope-menu"] [data-slot="menu-item"], [data-diff-scope]'
                ) ?? []),
              ];
              const target = rows.find((row) =>
                row.getAttribute('data-diff-scope') === 'working-tree' ||
                row.textContent?.trim() === 'Working tree'
              );
              if (!frame || !target) return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (workingTreePoints?.web && workingTreePoints?.lynx) break;
        await delay(100);
      }
      if (workingTreePoints?.web)
        await dispatchPointerClickWithMove(cdp, sessionId, workingTreePoints.web);
      if (workingTreePoints?.lynx)
        await dispatchPointerClickWithMove(cdp, sessionId, workingTreePoints.lynx);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const selected = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const read = (root) => ({
              label:
                root
                  ?.querySelector('[data-floating-anchor="diff-scope-menu"]')
                  ?.textContent?.trim() ?? null,
              menuOpen:
                root?.querySelector('[data-floating-popup="diff-scope-menu"]') !== null ||
                root?.querySelector('.diff-panel-header__scope-menu') !== null,
            });
            const web = document.getElementById('web-pane')?.contentWindow?.document;
            const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
              ?.getElementById('t3-lynx-preview')?.shadowRoot;
            return { web: read(web), lynx: read(lynx) };
          })()`,
        ).catch(() => null);
        if (
          selected?.web?.label === "Working tree" &&
          selected?.lynx?.label === "Working tree" &&
          selected.web.menuOpen === false &&
          selected.lynx.menuOpen === false
        ) {
          diffScopeWorkingTreeSelected = true;
          break;
        }
        await delay(100);
      }
    }
  }

  if (isFileEditorState && !isNarrowFileEditorState && !isOpenInMenuState && finalFileEditorReady) {
    const switchPoints = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId, shadow) => {
          const frame = document.getElementById(frameId);
          const doc = frame?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const explorer = root?.querySelector('[data-file-browser-panel], .file-panel__explorer');
          const candidates = [];
          const visit = (node) => {
            for (const child of node?.children ?? []) {
              candidates.push(child);
              visit(child);
              if (child.shadowRoot) visit(child.shadowRoot);
            }
          };
          visit(explorer);
          const targetName = ${JSON.stringify(switchFilePath.split("/").at(-1))};
          const target = candidates.find((item) => {
            const path = item.getAttribute?.('data-item-path') ?? '';
            const label = item.getAttribute?.('aria-label') ?? '';
            const text = item.textContent?.trim().replace(/\s+/g, ' ') ?? '';
            return (
              path === ${JSON.stringify(switchFilePath)} ||
              label === targetName ||
              text === targetName
            );
          });
          if (!frame || !target) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          return {
            x: frameRect.x + rect.x + rect.width / 2,
            y: frameRect.y + rect.y + rect.height / 2,
          };
        };
        return {
          web: pointFor('web-pane', false),
          lynx: pointFor('lynx-pane', true),
        };
      })()`,
    ).catch(() => null);
    if (switchPoints?.web) await dispatchPointerClickWithMove(cdp, sessionId, switchPoints.web);
    if (switchPoints?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, switchPoints.lynx);
    const switchDeadline = Date.now() + 3_000;
    while (Date.now() < switchDeadline) {
      const switched = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const web = document.getElementById('web-pane')?.contentWindow?.document;
          const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
            ?.getElementById('t3-lynx-preview')?.shadowRoot;
          const targetName = ${JSON.stringify(switchFilePath.split("/").at(-1))};
          return {
            web:
              web
                ?.querySelector("[data-current-file-crumb='true']")
                ?.textContent?.trim() === targetName,
            lynx:
              lynx
                ?.querySelector(".file-panel__breadcrumb--current")
                ?.textContent?.trim() === targetName,
          };
        })()`,
      ).catch(() => null);
      if (switched?.web && switched?.lynx) {
        fileEditorSwitched = true;
        break;
      }
      await delay(100);
    }
  }
  if (isFileEditorState && !isFileEditingSaveState && fileEditorSwitched) {
    const backPoints = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pointFor = (frameId, shadow) => {
          const frame = document.getElementById(frameId);
          const doc = frame?.contentWindow?.document;
          const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
          const back = root?.querySelector('[aria-label="Back to workspace files"]');
          if (!frame || !back) return null;
          const frameRect = frame.getBoundingClientRect();
          const rect = back.getBoundingClientRect();
          return {
            x: frameRect.x + rect.x + rect.width / 2,
            y: frameRect.y + rect.y + rect.height / 2,
          };
        };
        return {
          web: pointFor('web-pane', false),
          lynx: pointFor('lynx-pane', true),
        };
      })()`,
    ).catch(() => null);
    if (backPoints?.web) await dispatchPointerClickWithMove(cdp, sessionId, backPoints.web);
    if (backPoints?.lynx) await dispatchPointerClickWithMove(cdp, sessionId, backPoints.lynx);
    if (backPoints?.web && backPoints?.lynx) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const returned = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const web = document.getElementById('web-pane')?.contentWindow?.document;
            const lynx = document.getElementById('lynx-pane')?.contentWindow?.document
              ?.getElementById('t3-lynx-preview')?.shadowRoot;
            const read = (root) => ({
              browserPresent: root?.querySelector('[data-file-browser-panel], .files-panel') !== null,
              filePresent:
                root?.querySelector('[data-file-breadcrumbs], .file-panel') !== null,
            });
            return {
              web: read(web),
              lynx: {
                ...read(lynx),
                kind: lynx
                  ?.querySelector('[data-right-panel-open="true"]')
                  ?.getAttribute('data-right-panel-active-kind') ?? null,
              },
            };
          })()`,
        ).catch(() => null);
        webFileEditorReturnedToBrowser =
          returned?.web?.browserPresent === true && returned.web.filePresent === false;
        lynxFileEditorReturnedToBrowser =
          returned?.lynx?.kind === "files" &&
          returned.lynx.browserPresent === true &&
          returned.lynx.filePresent === false;
        if (webFileEditorReturnedToBrowser && lynxFileEditorReturnedToBrowser) {
          fileEditorReturnedToBrowser = true;
          break;
        }
        await delay(100);
      }
    }
  }

  await browserCdp.send("Target.closeTarget", { targetId }).catch(() => undefined);

  // Shared-server identity gate: both panes rendered the seeded project.
  const identityMatch = isComponentsLabState
    ? componentLabReady
    : stateIdentityMatch &&
      (lifecycleFaultReady ||
        (state?.web?.connected === true &&
          (state?.lynx?.connected === true || state?.lynx?.semanticReady === true)));

  const consoleErrors = console_.filter(
    (e) =>
      e.level === "error" &&
      !/NYI: (profileStart|isProfileRecording|profileEnd)\./.test(e.text) &&
      !/allow-scripts and allow-same-origin/.test(e.text) &&
      !/Failed to load resource.*404/.test(e.text) &&
      !/favicon\.ico/.test(e.text) &&
      !(
        isComponentsLabState &&
        /HTTP Authentication failed; no valid credentials available/.test(e.text)
      ) &&
      !(
        isLifecycleFaultState &&
        (/WebSocket connection .* failed:/.test(e.text) ||
          /WebSocket is already in CLOSING or CLOSED state\./.test(e.text) ||
          /SocketReadError: An error occurred during Read/.test(e.text))
      ),
  );
  const confirmedTargetState =
    componentLabReady ||
    reachedTargetState ||
    (semanticRoute.startsWith("settings-") &&
      bothReady &&
      finalSettingsAsyncReady &&
      finalSettingsGeometryReady &&
      finalSettingsNavigationReady &&
      settingsContentMatch !== false) ||
    (isRightPanelTerminalState && rightPanelAddMenuTerminalSelected) ||
    (unpersistedHeroStateReady(state) && finalCoreGeometryReady && finalComposerReady) ||
    (isFlatSidebarLayoutState && bothReady && finalFlatSidebarLayoutReady) ||
    (stateId === "sidebar-project-groups" && bothReady && finalSidebarProjectGroupsReady);

  const componentsLabPass =
    componentLabReady &&
    componentLabGeometryReady &&
    componentLabTooltipReady &&
    componentLabMenuReady &&
    componentLabSelectReady &&
    componentLabNumberReady &&
    componentLabScrollReady &&
    componentLabDialogReady &&
    identityMatch &&
    state?.web?.productState?.theme === theme &&
    state?.lynx?.productState?.theme === theme &&
    state.web.componentLabMetrics.stories.length === componentLabCatalog.length &&
    state?.web?.componentLabMetrics?.lab?.rect?.width === width &&
    state?.lynx?.componentLabMetrics?.lab?.rect?.width === width &&
    consoleErrors.length === 0 &&
    sameDims;
  const pass = isComponentsLabState
    ? componentsLabPass
    : confirmedTargetState &&
      bothReady &&
      identityMatch &&
      (isRightPanelTerminalState || finalOverlayReady) &&
      finalShortcutInputReady &&
      finalSidebarSearchReady &&
      finalSidebarStateReady &&
      finalChangedFilesStateReady &&
      finalCoreGeometryReady &&
      finalHeroGeometryReady &&
      finalComposerReady &&
      finalPlanModeReady &&
      finalSessionProjectionReady &&
      finalStageIdentityReady &&
      finalSidebarControlGeometryReady &&
      finalSidebarProjectGroupsReady &&
      finalFlatSidebarLayoutReady &&
      finalAddProjectSourcesReady &&
      finalNewThreadProjectsReady &&
      finalSidebarFooterThemeReady &&
      finalCompactControlsReady &&
      finalProjectActionDialogReady &&
      finalProjectSettingsReady &&
      finalRightPanelAddMenuReady &&
      rightPanelTerminalReady(state) &&
      finalDiffScopeMenuReady &&
      rightPanelAddMenuDismissed &&
      rightPanelAddMenuTerminalSelected &&
      diffScopeMenuDismissed &&
      diffScopeWorkingTreeSelected &&
      shortCompactControlsScrolled &&
      shortCompactControlsDismissed &&
      finalSidebarWorkingGeometryReady &&
      finalHeaderGitActionReady &&
      finalGitPublishDialogReady &&
      finalFilesBrowserReady &&
      finalSettledBannerInlineFilesReady &&
      finalFileEditorReady &&
      (!isOpenInMenuState || openInMenuEvidence?.match === true) &&
      (!isNarrowChatThreadState || narrowChatHoverEvidence?.match === true) &&
      (!isNarrowComposerExpandState || narrowComposerExpandEvidence?.match === true) &&
      (!isModelPickerInteractionState || modelPickerInteractionEvidence?.match === true) &&
      (!isFileEditingSaveState || fileEditingSaveEvidence !== null) &&
      fileEditorSwitched &&
      fileEditorReturnedToBrowser &&
      gitPublishDismissed &&
      finalReviewReady &&
      finalSettingsAsyncReady &&
      finalSettingsGeometryReady &&
      finalSettingsNavigationReady &&
      finalSettingsDesktopTopbarReady &&
      finalAddProviderDialogReady &&
      finalBetaMutationReady &&
      finalBackgroundActivityMutationReady &&
      finalSettingsModelMutationReady &&
      finalConnectionsMutationReady &&
      finalTranscriptReady &&
      completedNoDiffGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) &&
      completedProjectFaviconMatches(state) &&
      completedHeaderOpenActionMatches(state) &&
      finalProviderStatusBannerReady &&
      finalFailedThreadDismissalReady &&
      finalKeybindingsMutationReady &&
      finalPendingRequestReady &&
      (!isMultiStepQuestionState || multiStepQuestionStage === "complete") &&
      (stateId !== "command-palette-navigation" || commandPaletteNavigationStage === "complete") &&
      (!isSidebarControlHoverState || sidebarControlHoverStage === "complete") &&
      (!isSidebarThreadHoverPreviewState || sidebarThreadHoverPreviewStage === "complete") &&
      (!isChatOutlineState ||
        (chatOutlineEvidence?.web?.hovered?.preview &&
          chatOutlineEvidence?.lynx?.hovered?.preview)) &&
      (!isSidebarThreadShortcutState || sidebarThreadShortcutStage === "complete") &&
      (stateId !== "sidebar-v2-new-thread-projects" || newThreadProjectsStage === "complete") &&
      (stateId !== "add-project-sources" || addProjectSourcesStage === "complete") &&
      (!isModelPickerOverlay || (modelPickerSemanticMatch && overlayRowCountMatch)) &&
      settingsContentMatch !== false &&
      lynxStyled &&
      consoleErrors.length === 0 &&
      sameDims;
  if (!pass)
    failuresNote(viewport.label, {
      reachedTargetState: confirmedTargetState,
      componentsLabPass,
      componentLabGeometryReady,
      componentLabTooltipReady,
      componentLabMenuReady,
      componentLabSelectReady,
      componentLabNumberReady,
      componentLabScrollReady,
      componentLabDialogReady,
      bothReady,
      identityMatch,
      finalOverlayReady,
      finalShortcutInputReady,
      finalSidebarSearchReady,
      finalSidebarStateReady,
      finalChangedFilesStateReady,
      finalCoreGeometryReady,
      finalHeroGeometryReady,
      finalComposerReady,
      composerGate: {
        input: finalComposerInputReady,
        state: finalComposerStateReady,
        anatomy: finalComposerAnatomyReady,
        completedProvider: completedComposerProviderStateMatches(state),
        completedNoDiff: completedNoDiffStateMatches(state),
        completedFavicon: completedProjectFaviconMatches(state),
        completedHeaderOpen: completedHeaderOpenActionMatches(state),
      },
      completedComposerProviderState: readCompletedComposerProviderState(state),
      completedNoDiffState: {
        match: completedNoDiffStateMatches(state),
        webCheckpointCount: state?.web?.reviewMetrics?.checkpointCards?.length ?? 0,
        lynxCheckpointCount: state?.lynx?.reviewMetrics?.checkpointCards?.length ?? 0,
      },
      lifecycleFaultPreflight: {
        required: requiresStableProviderFaultPreflight,
        stablePolls: lifecycleFaultPreflightStablePolls,
        timeline: lifecycleFaultPreflightTimeline,
      },
      settingsDesktopTopbar: {
        match: finalSettingsDesktopTopbarReady,
        web: state?.web?.settingsMetrics?.topbar ?? null,
        lynx: state?.lynx?.settingsMetrics?.topbar ?? null,
      },
      finalPlanModeReady,
      finalSessionProjectionReady,
      finalStageIdentityReady,
      finalSidebarControlGeometryReady,
      finalSidebarProjectGroupsReady,
      finalFlatSidebarLayoutReady,
      finalAddProjectSourcesReady,
      finalNewThreadProjectsReady,
      finalSidebarFooterThemeReady,
      finalCompactControlsReady,
      finalProjectActionDialogReady,
      finalProjectSettingsReady,
      finalRightPanelAddMenuReady,
      finalRightPanelTerminalReady: rightPanelTerminalReady(state),
      finalDiffScopeMenuReady,
      rightPanelAddMenuDismissed,
      rightPanelAddMenuTerminalSelected,
      diffScopeMenuDismissed,
      diffScopeWorkingTreeSelected,
      shortCompactControlsScrolled,
      shortCompactControlsDismissed,
      finalSidebarWorkingGeometryReady,
      finalHeaderGitActionReady,
      finalGitPublishDialogReady,
      finalFilesBrowserReady,
      finalSettledBannerInlineFilesReady,
      finalFileEditorReady,
      fileEditingSaveEvidence: !isFileEditingSaveState || fileEditingSaveEvidence !== null,
      fileEditorSwitched,
      fileEditorReturnedToBrowser,
      gitPublishDismissed,
      finalReviewReady,
      reviewReadiness: reviewReadinessBreakdown(state?.web, state?.lynx, reviewExpectation, width),
      checkpointCardTypographyReady: checkpointCardTypographyMatches(state?.web, state?.lynx),
      finalSettingsAsyncReady,
      finalSettingsGeometryReady,
      finalSettingsNavigationReady,
      finalSettingsDesktopTopbarReady,
      finalAddProviderDialogReady,
      finalBetaMutationReady,
      finalBackgroundActivityMutationReady,
      finalSettingsModelMutationReady,
      finalConnectionsMutationReady,
      finalTranscriptReady,
      completedNoDiffGeometryReady: completedNoDiffGeometryMatches(
        state?.web?.timelineMetrics,
        state?.lynx?.timelineMetrics,
      ),
      completedProjectFaviconReady: completedProjectFaviconMatches(state),
      completedHeaderOpenActionReady: completedHeaderOpenActionMatches(state),
      finalProviderStatusBannerReady,
      finalFailedThreadDismissalReady,
      finalKeybindingsMutationReady,
      finalPendingRequestReady,
      multiStepQuestionStage,
      commandPaletteNavigationStage,
      sidebarControlHoverStage,
      newThreadProjectsStage,
      addProjectSourcesStage,
      settingsContentMatch,
      lynxStyled,
      consoleClean: consoleErrors.length === 0,
      sameDims,
    });

  await Promise.all([
    writeFile(
      webAssertionsPath,
      `${JSON.stringify(
        {
          client: "web",
          stateId,
          semanticReady: state?.web?.semanticReady === true,
          heroPresent: state?.web?.heroPresent === true,
          productState: webState,
          literalRoute: state?.web?.literalRoute ?? null,
          visibleModelLabel: webState?.visibleModelLabel ?? null,
          overlayMetrics: state?.web?.overlayMetrics ?? null,
          sidebarDiagnostics: state?.web?.sidebarDiagnostics ?? null,
          headerMetrics: state?.web?.headerMetrics ?? null,
          gitPublishDialog: state?.web?.gitPublishDialog ?? null,
          addProviderDialog: state?.web?.addProviderDialog ?? null,
          composerMetrics: state?.web?.composerMetrics ?? null,
          timelineMetrics: state?.web?.timelineMetrics ?? null,
          reviewMetrics: state?.web?.reviewMetrics ?? null,
          filesBrowserMetrics: state?.web?.filesBrowserMetrics ?? null,
          fileEditorMetrics: state?.web?.fileEditorMetrics ?? null,
          pendingRequestMetrics: state?.web?.pendingRequestMetrics ?? null,
          settingsMetrics: state?.web?.settingsMetrics ?? null,
          legacySettingsTimeline,
          webSettingsInputChannel,
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      lynxAssertionsPath,
      `${JSON.stringify(
        {
          client: "lynx",
          stateId,
          semanticReady: state?.lynx?.semanticReady === true,
          heroPresent: state?.lynx?.heroPresent === true,
          productState: lynxState,
          visibleModelLabel: lynxState?.visibleModelLabel ?? null,
          overlayMetrics: state?.lynx?.overlayMetrics ?? null,
          sidebarDiagnostics: state?.lynx?.sidebarDiagnostics ?? null,
          headerMetrics: state?.lynx?.headerMetrics ?? null,
          gitPublishDialog: state?.lynx?.gitPublishDialog ?? null,
          addProviderDialog: state?.lynx?.addProviderDialog ?? null,
          composerMetrics: state?.lynx?.composerMetrics ?? null,
          timelineMetrics: state?.lynx?.timelineMetrics ?? null,
          reviewMetrics: state?.lynx?.reviewMetrics ?? null,
          filesBrowserMetrics: state?.lynx?.filesBrowserMetrics ?? null,
          fileEditorMetrics: state?.lynx?.fileEditorMetrics ?? null,
          pendingRequestMetrics: state?.lynx?.pendingRequestMetrics ?? null,
          settingsMetrics: state?.lynx?.settingsMetrics ?? null,
          legacySettingsTimeline,
          webSettingsInputChannel,
          rendererErrors: state?.lynx?.rendererErrors ?? [],
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      consolePath,
      consoleErrors.map((entry) => `${entry.level}: ${entry.text}`).join("\n"),
    ),
  ]);

  return {
    stateId,
    viewport: viewport.label,
    commit,
    bundles: { web: webBundle.sha256.slice(0, 12), lynx: lynxBundle.sha256.slice(0, 12) },
    seedHash,
    readyMs,
    lynxStyled,
    readiness: { bothReady, web: state?.web ?? null, lynx: state?.lynx ?? null },
    componentLabEvidence: isComponentsLabState ? { dialog: componentLabDialogEvidence } : null,
    identity: {
      match: identityMatch,
      stateIdentityMatch,
      sessionProjection: {
        match: finalSessionProjectionReady,
        expectedSessionStatus: isSettledBannerInlineFilesState
          ? "stopped"
          : (expectedThreadFixture?.sessionStatus ?? null),
        expectedSidebarStatus:
          stateId === "composer-working" || stateId === "existing-thread-working"
            ? "Working"
            : stateId === "composer-connecting"
              ? "Connecting"
              : null,
        web: {
          composerState: state?.web?.composerMetrics?.state ?? null,
          primaryState: state?.web?.composerMetrics?.primaryState ?? null,
          sidebarStatus:
            state?.web?.sidebarDiagnostics?.threads?.find(
              (thread) => thread.threadId === expectedThreadFixture?.id,
            )?.status ?? null,
          workingRowCount: (state?.web?.timelineMetrics?.rows ?? []).filter(
            (row) => row.kind === "working",
          ).length,
        },
        lynx: {
          composerState: state?.lynx?.composerMetrics?.state ?? null,
          primaryState: state?.lynx?.composerMetrics?.primaryState ?? null,
          sidebarStatus:
            state?.lynx?.sidebarDiagnostics?.threads?.find(
              (thread) => thread.threadId === expectedThreadFixture?.id,
            )?.status ?? null,
          workingRowCount: (state?.lynx?.timelineMetrics?.rows ?? []).filter(
            (row) => row.kind === "working",
          ).length,
        },
      },
      completedComposerProviderState: readCompletedComposerProviderState(state),
      lifecycleFaultPreflight: {
        required: requiresStableProviderFaultPreflight,
        stablePolls: lifecycleFaultPreflightStablePolls,
        timeline: lifecycleFaultPreflightTimeline,
      },
      settingsDesktopTopbar: {
        match: finalSettingsDesktopTopbarReady,
        web: state?.web?.settingsMetrics?.topbar ?? null,
        lynx: state?.lynx?.settingsMetrics?.topbar ?? null,
      },
      failedTranscriptGeometry: {
        match: failedTranscriptGeometryMatches(
          state?.web?.timelineMetrics,
          state?.lynx?.timelineMetrics,
        ),
        webRows: state?.web?.timelineMetrics?.rowGeometry ?? [],
        lynxRows: state?.lynx?.timelineMetrics?.rowGeometry ?? [],
      },
      sidebarStageIdentity: {
        match: finalStageIdentityReady,
        web: state?.web?.sidebarDiagnostics?.stageIdentity ?? null,
        lynx: state?.lynx?.sidebarDiagnostics?.stageIdentity ?? null,
      },
      sidebarControlGeometry: {
        match: finalSidebarControlGeometryReady,
        requestedWidth: expectedSidebarWidth,
        web: state?.web?.sidebarDiagnostics ?? null,
        lynx: state?.lynx?.sidebarDiagnostics ?? null,
      },
      sidebarProjectGroups: {
        match: finalSidebarProjectGroupsReady,
        web: state?.web?.sidebarProjectGroups ?? [],
        lynx: state?.lynx?.sidebarProjectGroups ?? [],
      },
      heroGeometry: {
        match: finalHeroGeometryReady,
        web: state?.web?.heroMetrics ?? null,
        lynx: state?.lynx?.heroMetrics ?? null,
      },
      addProjectSources: {
        match:
          finalAddProjectSourcesReady &&
          (stateId !== "add-project-sources" || addProjectSourcesStage === "complete"),
        stage: addProjectSourcesStage,
        timeline: addProjectSourcesTimeline,
        web: state?.web?.overlayMetrics ?? null,
        lynx: state?.lynx?.overlayMetrics ?? null,
      },
      commandPaletteNavigation: {
        match:
          stateId !== "command-palette-navigation" || commandPaletteNavigationStage === "complete",
        stage: commandPaletteNavigationStage,
        timeline: commandPaletteNavigationTimeline,
        inputChannel:
          stateId === "command-palette-navigation"
            ? "web-cdp-keyboard|dual-browser-pointer-hover|lynx-pointer-dismiss"
            : "not-required",
        lynxForWebKeyboard:
          stateId === "command-palette-navigation"
            ? "blocked-browser-proxy-no-main-thread-key-bridge"
            : "not-required",
        nativePhysicalKeyboard:
          stateId === "command-palette-navigation" ? "pending-user-session" : "not-required",
      },
      sidebarControlHover: {
        match: !isSidebarControlHoverState || sidebarControlHoverStage === "complete",
        stage: sidebarControlHoverStage,
        timeline: sidebarControlHoverTimeline,
        authority: {
          openDelayMs: 600,
          closeDelayMs: 0,
          popupTransition: "opacity+scale",
        },
      },
      sidebarThreadHoverPreview: {
        match: !isSidebarThreadHoverPreviewState || sidebarThreadHoverPreviewStage === "complete",
        stage: sidebarThreadHoverPreviewStage,
        inputChannel: isSidebarThreadHoverPreviewState
          ? "web-cdp-pointer|lynx-main-thread-probe"
          : "not-required",
        evidence: sidebarThreadHoverPreview,
        authority: {
          openDelayMs: 150,
          closeDelayMs: 0,
          placement: "right-start-4",
          popupTransition: "opacity+scale",
        },
      },
      chatOutline: chatOutlineEvidence,
      sidebarThreadShortcuts: {
        match: !isSidebarThreadShortcutState || sidebarThreadShortcutStage === "complete",
        stage: sidebarThreadShortcutStage,
        inputChannel: isSidebarThreadShortcutState
          ? "web-cdp-keyboard|lynx-host-keyboard-packet"
          : "not-required",
        modifierOnlyVisibility: isSidebarThreadShortcutState
          ? "web-keydown-up|lynx-clay-keydown-up"
          : "not-required",
        timeline: sidebarThreadShortcutTimeline,
      },
      newThreadProjects: {
        match: finalNewThreadProjectsReady && newThreadProjectsStage === "complete",
        stage: newThreadProjectsStage,
        timeline: newThreadProjectsTimeline,
        draftLifecycle: newThreadDraftLifecycle,
        web: state?.web?.overlayMetrics ?? null,
        lynx: state?.lynx?.overlayMetrics ?? null,
      },
      newThreadHeroNavigation: {
        match: !isNewThreadHeroState || unpersistedHeroStateReady(state),
        timeline: newThreadHeroNavigationTimeline,
      },
      failedThreadDismissal: {
        match: !isFailedThreadDismissedState || finalFailedThreadDismissalReady,
        timeline: failedThreadDismissalTimeline,
      },
      keybindingsMutation: {
        match: finalKeybindingsMutationReady,
        timeline: keybindingsMutationTimeline,
      },
      multiStepQuestion: {
        match: !isMultiStepQuestionState || multiStepQuestionStage === "complete",
        stage: multiStepQuestionStage,
        timeline: multiStepQuestionTimeline,
        web: state?.web?.pendingRequestMetrics ?? null,
        lynx: state?.lynx?.pendingRequestMetrics ?? null,
      },
      projectSettings: {
        match: finalProjectSettingsReady,
        expectation: isProjectSettingsState ? projectSettingsExpectation : "not-required",
        inputChannel: isProjectSettingsState
          ? "web-scope-pointer|lynx-menu-main-thread-probe|dual-project-action-pointer"
          : "not-required",
        interaction: projectSettingsInteraction,
        timeline: projectSettingsTimeline,
        web: state?.web?.overlayMetrics ?? null,
        lynx: state?.lynx?.overlayMetrics ?? null,
      },
      addProviderDialog: {
        match: finalAddProviderDialogReady,
        stage: addProviderDialogStage,
        inputChannel: isAddProviderDialogState ? "dual-cdp-pointer" : "not-required",
        timeline: addProviderDialogTimeline,
        authority: {
          backdrop: "200ms opacity",
          popup: "200ms ease-in-out opacity+scale(.98)",
          cardBody:
            "200ms ease-in-out opacity+translate; intrinsic height snaps because Lynx cannot animate auto height",
          reducedMotion: "no animation; immediate presence",
        },
        web: state?.web?.addProviderDialog ?? null,
        lynx: state?.lynx?.addProviderDialog ?? null,
      },
      betaMutation: {
        match: finalBetaMutationReady,
        stage: betaMutationStage,
        inputChannel: isBetaMutationState ? "dual-cdp-pointer" : "not-required",
        timeline: betaMutationTimeline,
        web: state?.web?.settingsMetrics?.betaMutation ?? null,
        lynx: state?.lynx?.settingsMetrics?.betaMutation ?? null,
      },
      backgroundActivityMutation: {
        match: finalBackgroundActivityMutationReady,
        stage: backgroundActivityMutationStage,
        inputChannel: isBackgroundActivityMutationState
          ? "lynx-cdp-pointer+shared-server"
          : "not-required",
        timeline: backgroundActivityMutationTimeline,
        web:
          state?.web?.settingsMetrics?.rows?.find((row) => row.id === "background-activity") ??
          null,
        lynx:
          state?.lynx?.settingsMetrics?.rows?.find((row) => row.id === "background-activity") ??
          null,
      },
      settingsModelMutation: {
        match: finalSettingsModelMutationReady,
        stage: settingsModelMutationStage,
        inputChannel: isSettingsModelMutationState
          ? "lynx-cdp-pointer+shared-server"
          : "not-required",
        timeline: settingsModelMutationTimeline,
        web:
          state?.web?.settingsMetrics?.rows?.find((row) => row.id === "text-generation-model") ??
          null,
        lynx:
          state?.lynx?.settingsMetrics?.rows?.find((row) => row.id === "text-generation-model") ??
          null,
      },
      modelPickerInteraction: modelPickerInteractionEvidence,
      connectionsMutation: {
        match: finalConnectionsMutationReady,
        stage: connectionsMutationStage,
        inputChannel: isConnectionsMutationState ? "dual-cdp-pointer" : "not-required",
        timeline: connectionsMutationTimeline,
        web: state?.web?.settingsMetrics?.connectionsMutation ?? null,
        lynx: state?.lynx?.settingsMetrics?.connectionsMutation ?? null,
      },
      sidebarFooterTheme: {
        match: finalSidebarFooterThemeReady,
        web: state?.web?.sidebarDiagnostics?.chrome ?? null,
        lynx: state?.lynx?.sidebarDiagnostics?.chrome ?? null,
      },
      compactControls: {
        match: finalCompactControlsReady,
        shortViewport: isShortCompactControlsState
          ? {
              scrolled: shortCompactControlsScrolled,
              dismissed: shortCompactControlsDismissed,
              input: "web-wheel|lynx-wheel|outside-pointer",
              diagnostics: shortCompactControlsScrollDiagnostics,
            }
          : null,
        containment: compactControlsContainment(state),
        web: {
          overlay: state?.web?.overlayMetrics ?? null,
          footer: state?.web?.composerMetrics?.anatomy?.footer ?? null,
          composer: state?.web?.composerMetrics?.rect ?? null,
          context: state?.web?.composerMetrics?.anatomy?.context ?? null,
          rightPanel: state?.web?.reviewMetrics?.panelRect ?? null,
        },
        lynx: {
          overlay: state?.lynx?.overlayMetrics ?? null,
          footer: state?.lynx?.composerMetrics?.anatomy?.footer ?? null,
          composer: state?.lynx?.composerMetrics?.rect ?? null,
          context: state?.lynx?.composerMetrics?.anatomy?.context ?? null,
          rightPanel: state?.lynx?.reviewMetrics?.panelRect ?? null,
        },
      },
      planMode: {
        match: finalPlanModeReady,
        fixture: isComposerPlanModeState ? fixturePreparation : null,
        web: isComposerPlanModeState
          ? {
              mode: state?.web?.productState?.interactionMode ?? null,
              separator: state?.web?.composerMetrics?.anatomy?.interactionSeparator ?? null,
              control:
                state?.web?.composerMetrics?.anatomy?.controlBoxes?.find(
                  ({ id }) => id === "interaction",
                ) ?? null,
            }
          : null,
        lynx: isComposerPlanModeState
          ? {
              mode: state?.lynx?.productState?.interactionMode ?? null,
              separator: state?.lynx?.composerMetrics?.anatomy?.interactionSeparator ?? null,
              control:
                state?.lynx?.composerMetrics?.anatomy?.controlBoxes?.find(
                  ({ id }) => id === "interaction",
                ) ?? null,
            }
          : null,
      },
      rightPanelAddMenu: {
        match: finalRightPanelAddMenuReady,
        dismissedBy: isRightPanelAddMenuState
          ? "web-outside-pointer|lynx-dismiss-layer-pointer"
          : "not-required",
        dismissed: rightPanelAddMenuDismissed,
        selectedBy: isRightPanelAddMenuState
          ? "web-terminal-row-pointer|lynx-terminal-row-pointer"
          : "not-required",
        terminalSelected: rightPanelAddMenuTerminalSelected,
        terminalScreenshot: rightPanelTerminalScreenshot,
        terminalCommand: rightPanelTerminalCommand,
        terminalMultiSession: rightPanelTerminalMultiSession,
        web: state?.web?.overlayMetrics ?? null,
        lynx: state?.lynx?.overlayMetrics ?? null,
      },
      diffScopeMenu: {
        match: finalDiffScopeMenuReady,
        dismissedBy: isDiffScopeMenuState
          ? "web-outside-pointer|lynx-dismiss-layer-pointer"
          : "not-required",
        dismissed: diffScopeMenuDismissed,
        selectedBy: isDiffScopeMenuState
          ? "web-working-tree-row-pointer|lynx-working-tree-row-pointer"
          : "not-required",
        workingTreeSelected: diffScopeWorkingTreeSelected,
        web: state?.web?.overlayMetrics ?? null,
        lynx: state?.lynx?.overlayMetrics ?? null,
      },
      sidebarWorkingGeometry: {
        match: finalSidebarWorkingGeometryReady,
        threadId: expectedThreadFixture?.id ?? null,
        web:
          state?.web?.sidebarDiagnostics?.threads?.find(
            (thread) => thread.threadId === expectedThreadFixture?.id,
          ) ?? null,
        lynx:
          state?.lynx?.sidebarDiagnostics?.threads?.find(
            (thread) => thread.threadId === expectedThreadFixture?.id,
          ) ?? null,
      },
      headerGitAction: {
        match: finalHeaderGitActionReady,
        web: state?.web?.headerMetrics?.actionItems?.find((item) => item.id === "commit") ?? null,
        lynx: state?.lynx?.headerMetrics?.actionItems?.find((item) => item.id === "commit") ?? null,
        lynxReadStatus: Boolean(
          state?.lynx?.connectorDiagnostics?.commands?.some(
            ({ method }) => method === "readVcsStatus",
          ),
        ),
      },
      gitPublishDialog: {
        match: finalGitPublishDialogReady,
        openedBy: isGitPublishDialogState ? "web-cdp-pointer|lynx-cdp-pointer" : "not-required",
        dismissedBy: isGitPublishDialogState
          ? "web-backdrop-cdp-pointer|lynx-backdrop-cdp-pointer"
          : "not-required",
        dismissed: gitPublishDismissed,
        postconditionTimeline: gitPublishPostconditionTimeline,
        web: gitPublishDialogEvidence?.web ?? null,
        lynx: gitPublishDialogEvidence?.lynx ?? null,
      },
      filesBrowser: {
        match: finalFilesBrowserReady,
        interactionChannel: isFilesBrowserState
          ? "web-pointer-click|lynx-pointer-click"
          : "not-required",
        timeline: filesBrowserInteractionTimeline,
        web: state?.web?.filesBrowserMetrics ?? null,
        lynx: state?.lynx?.filesBrowserMetrics ?? null,
      },
      fileEditor: {
        match: finalFileEditorReady,
        filePath,
        switchFilePath,
        openedBy: isFileEditorState ? "web-pointer-click|lynx-pointer-click" : "not-required",
        openInputChannels: isFileEditorState
          ? {
              web: webFileEditorDomFallbackUsed
                ? "cdp-pointer-failed|shadow-dom-click-fallback"
                : "cdp-pointer",
              lynx: "cdp-pointer",
            }
          : null,
        switchedBy:
          isFileEditorState && !isNarrowFileEditorState && !isOpenInMenuState
            ? "web-explorer-pointer|lynx-explorer-pointer"
            : "not-required",
        switched: fileEditorSwitched,
        returnedBy:
          isFileEditorState && !isFileEditingSaveState && !isOpenInMenuState
            ? "web-back-pointer|lynx-back-pointer"
            : "not-required",
        returnedToBrowser: fileEditorReturnedToBrowser,
        returnedClients: {
          web: webFileEditorReturnedToBrowser,
          lynx: lynxFileEditorReturnedToBrowser,
        },
        openAttempts: {
          web: webFileEditorOpenAttempts,
          lynx: lynxFileEditorOpenAttempts,
        },
        timeline: fileEditorInteractionTimeline,
        web: state?.web?.fileEditorMetrics ?? null,
        lynx: state?.lynx?.fileEditorMetrics ?? null,
      },
      openInMenu: openInMenuEvidence,
      narrowChat: isNarrowChatThreadState
        ? {
            responsive: narrowChatResponsiveMatches(
              state?.web?.timelineMetrics,
              state?.lynx?.timelineMetrics,
            ),
            hover: narrowChatHoverEvidence,
          }
        : null,
      narrowComposerExpand: narrowComposerExpandEvidence,
      fileEditingSave: fileEditingSaveEvidence,
      expectProject,
      webState,
      lynxState,
      overlayGeometryDelta,
      overlayAnchorOffsets,
      overlayContentMatch,
      modelPickerSemanticMatch,
      settingsContentMatch,
      overlayRowCountMatch,
      webProjectSelectionStage,
      webProjectActionMenuOpened,
      webShortcutInputChannel,
      lynxShortcutInputChannel,
      sidebarQuery,
      sidebarSearchInputChannel,
      sidebarTargetState,
      sidebarStateInputChannel:
        sidebarTargetState.length === 0 ? "not-required" : "web-pointer-click|lynx-pointer-click",
      changedFilesTargetState,
      changedFilesInputChannel:
        changedFilesTargetState.length === 0
          ? "not-required"
          : `web-pointer-click:${webChangedFilesClickCount}|lynx-pointer-click:${lynxChangedFilesClickCount}`,
      overlayQueryInputChannel,
      providerInputChannel,
      providerInputDiagnostics,
      providerPostconditionTimeline,
      providerPointerTimeline,
      composerInputChannel,
      composerInputDiagnostics,
      reviewInteractionTimeline,
    },
    images:
      isRightPanelTerminalState && rightPanelTerminalScreenshot
        ? {
            web: rightPanelTerminalScreenshot.web.path,
            lynx: rightPanelTerminalScreenshot.lynx.path,
            sideBySide: rightPanelTerminalScreenshot.sideBySide ?? null,
            diff: null,
            webDims: rightPanelTerminalScreenshot.web.dimensions,
            lynxDims: rightPanelTerminalScreenshot.lynx.dimensions,
            sameDimensions:
              rightPanelTerminalScreenshot.web.dimensions.width ===
                rightPanelTerminalScreenshot.lynx.dimensions.width &&
              rightPanelTerminalScreenshot.web.dimensions.height ===
                rightPanelTerminalScreenshot.lynx.dimensions.height,
            source: "validated-terminal-causal-frame",
          }
        : {
            web: terminalOnlyImages ? null : path.relative(repoRoot, webPath),
            lynx: terminalOnlyImages ? null : path.relative(repoRoot, lynxPath),
            sideBySide,
            diff,
            webDims,
            lynxDims,
            sameDimensions: sameDims,
            source: "final-workbench-frame",
          },
    console: { errors: consoleErrors },
    assertions: {
      web: path.relative(repoRoot, webAssertionsPath),
      lynx: path.relative(repoRoot, lynxAssertionsPath),
      console: path.relative(repoRoot, consolePath),
    },
    pass,
  };
}

async function admitBrowserPairToManifest({ manifestPath, outputRoot, stateId, result }) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const state = manifest.states.find((candidate) => candidate.id === stateId);
  if (!state) throw new Error(`Manifest state not found: ${stateId}`);
  if (!result.identity.stateIdentityMatch) {
    throw new Error(`Refusing manifest admission: ${stateId} product state differs across panes`);
  }
  const relativeFromManifest = (absolutePath) =>
    path.relative(path.dirname(manifestPath), absolutePath).split(path.sep).join("/");
  const stateEcho = {
    route: result.identity.webState.route,
    semanticRoute: result.identity.webState.semanticRoute,
    theme: result.identity.webState.theme,
    density: result.identity.webState.density,
    selectedProject: result.identity.webState.selectedProject,
    selectedThread: result.identity.webState.selectedThread,
    selectedModel: result.identity.webState.selectedModel,
    lifecycle: result.identity.webState.lifecycle,
    overlay: result.identity.webState.overlay,
    overlayQuery: result.identity.webState.overlayQuery,
  };
  state.state = {
    ...state.state,
    route: stateEcho.route,
    semanticRoute: stateEcho.semanticRoute,
    selectedProject: stateEcho.selectedProject,
    selectedThread: stateEcho.selectedThread,
    selectedModel: stateEcho.selectedModel,
    lifecycle: stateEcho.lifecycle,
    overlay: stateEcho.overlay,
    overlayQuery: stateEcho.overlayQuery,
    snapshotSha256: result.seedHash,
  };
  const contentGate =
    result.identity.webState.semanticRoute.startsWith("settings-") &&
    result.identity.settingsContentMatch === null
      ? "unassessed"
      : (result.identity.webState.lifecycle !== "ready" ||
            result.identity.webState.semanticRoute.startsWith("settings-") ||
            result.identity.webState.visibleModelLabel ===
              result.identity.lynxState.visibleModelLabel) &&
          result.identity.settingsContentMatch !== false &&
          result.identity.overlayContentMatch !== false
        ? "pass"
        : "gap";
  const visualGate =
    (result.identity.webState.semanticRoute.startsWith("settings-") ||
      result.identity.webState.visibleModelLabel === result.identity.lynxState.visibleModelLabel) &&
    result.identity.settingsContentMatch !== false &&
    result.identity.overlayContentMatch !== false
      ? "pass"
      : "gap";
  const overlayDelta = result.identity.overlayGeometryDelta;
  const overlayAnchorOffsets = result.identity.overlayAnchorOffsets;
  const webOverlayMetrics = result.readiness.web.overlayMetrics;
  const lynxOverlayMetrics = result.readiness.lynx.overlayMetrics;
  const anchoredOverlaySizeDelta =
    webOverlayMetrics?.rect &&
    webOverlayMetrics?.triggerRect &&
    lynxOverlayMetrics?.rect &&
    lynxOverlayMetrics?.triggerRect
      ? {
          width: Math.abs(
            webOverlayMetrics.rect.width -
              webOverlayMetrics.triggerRect.width -
              (lynxOverlayMetrics.rect.width - lynxOverlayMetrics.triggerRect.width),
          ),
          height: Math.abs(webOverlayMetrics.rect.height - lynxOverlayMetrics.rect.height),
        }
      : null;
  const overlayVisualGate =
    overlayDelta === null
      ? "unassessed"
      : (stateEcho.overlay === "model-picker" || stateEcho.overlay === "project-scope") &&
          overlayAnchorOffsets &&
          anchoredOverlaySizeDelta
        ? (stateEcho.overlay === "model-picker"
            ? overlayDelta.width <= 8 && overlayDelta.height <= 8
            : anchoredOverlaySizeDelta.width <= 8 && anchoredOverlaySizeDelta.height <= 8) &&
          Math.abs(overlayAnchorOffsets.web.x - overlayAnchorOffsets.lynx.x) <= 8 &&
          Math.abs(overlayAnchorOffsets.web.y - overlayAnchorOffsets.lynx.y) <= 8
          ? "pass"
          : "gap"
        : Object.values(overlayDelta).every((delta) => delta <= 8)
          ? "pass"
          : "gap";
  const commonGates = {
    harness: "capture-valid",
    content: contentGate,
    visual: overlayVisualGate,
    interaction: "not-required",
    sourceReuse: "unassessed",
  };
  for (const client of ["web", "lynx"]) {
    const imagePath = path.join(outputRoot, result.viewport, `${client}.png`);
    const assertionsPath = path.join(outputRoot, result.viewport, `${client}-assertions.json`);
    const consolePath = path.join(outputRoot, result.viewport, "console.txt");
    state.evidence[client] = {
      status: "retained",
      path: relativeFromManifest(imagePath),
      captureTier: "browser",
      buildSha256: result.bundles[client],
      snapshotSha256: result.seedHash,
      image: result.images[`${client}Dims`],
      sha256: createHash("sha256")
        .update(await readFile(imagePath))
        .digest("hex"),
      assertions: relativeFromManifest(assertionsPath),
      console: relativeFromManifest(consolePath),
      stateEcho,
      gates: commonGates,
    };
  }
  state.verdict = visualGate === "gap" ? "visual-gap" : "capture-valid";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function failuresNote(label, gates) {
  const failed = [];
  const visit = (value, path) => {
    if (value === false || value === null || value === undefined) {
      failed.push(path);
      return;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(gates, "");
  console.log(`[shared-workbench] ${label} FAIL gates: ${failed.join(", ")}`);
}

function renderComparisonHtml(summary) {
  const esc = (v) =>
    String(v).replace(
      /[&<>"]/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch],
    );
  const rel = (p) =>
    typeof p === "string" ? esc(p.replace(/^apps\/lynxtron\/evidence\/[^/]+\/[^/]+\//, "")) : null;
  const passCount = summary.cells.filter((c) => c.pass).length;
  const badge = (ok, label) =>
    `<span class="badge ${ok ? "badge--ok" : "badge--bad"}">${esc(label)}</span>`;
  const frame = (label, src, alt) =>
    src
      ? `<article class="frame"><div class="frame-head"><span class="frame-label">${esc(label)}</span></div><button class="image-button" type="button"><img src="${src}" alt="${esc(alt)}" loading="lazy" /></button></article>`
      : `<article class="frame"><div class="frame-head"><span class="frame-label">${esc(label)}</span></div><div class="frame-missing">not retained</div></article>`;
  const cards = summary.cells
    .map((cell, index) => {
      const dir = `${cell.viewport}`;
      const gates = [
        badge(cell.readiness?.bothReady, "both-ready"),
        badge(cell.identity?.match, "same-server-identity"),
        badge(cell.images?.sameDimensions, "dims"),
        badge((cell.console?.errors?.length ?? 0) === 0, "clean-console"),
      ].join(" ");
      return `
        <article class="case" data-pass="${cell.pass}">
          <header class="case-header">
            <span class="case-index">${String(index + 1).padStart(2, "0")}</span>
            <h2>Shared server · ${esc(cell.viewport)}</h2>
            <span class="case-meta">seed ${esc((cell.seedHash ?? "").slice(0, 10))} · dark</span>
            <span class="case-verdict ${cell.pass ? "ok" : "bad"}">${cell.pass ? "PASS" : "FAIL"}</span>
          </header>
          <div class="gates">${gates}</div>
          <div class="frames">
            ${frame("Real Web app", `${dir}/web.png`, `Web · ${cell.viewport}`)}
            ${frame("Lynx-for-Web", `${dir}/lynx.png`, `Lynx Web · ${cell.viewport}`)}
            ${frame("Diagnostic diff", rel(cell.images?.diff), `diff · ${cell.viewport}`)}
          </div>
          <div class="frames frames--wide">${frame("Side by side", rel(cell.images?.sideBySide), `side by side · ${cell.viewport}`)}</div>
        </article>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>T3 Code · Single-server dual-frontend evidence</title>
<style>
  :root { color-scheme: dark; --page:#0b0b0c; --surface:#191c1f; --surface2:#202428; --ink:#f0f1f2; --muted:#a5abb2; --line:#353a3f; --ok:#79d8a6; --bad:#ff8a8a; --accent:#8ac6ff; }
  *{box-sizing:border-box;} body{margin:0;background:var(--page);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  .shell{width:min(1840px,calc(100% - 32px));margin:0 auto;padding:28px 0 80px;}
  .masthead{border-bottom:1px solid var(--line);padding-bottom:20px;}
  .eyebrow{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:0.17em;text-transform:uppercase;margin:0 0 8px;}
  h1{margin:0;font-size:clamp(28px,4vw,52px);font-weight:600;letter-spacing:-0.02em;}
  .intro{margin:12px 0 0;max-width:860px;color:var(--muted);line-height:1.6;}
  .summary{display:flex;gap:24px;margin:20px 0 0;flex-wrap:wrap;}
  .summary div{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 18px;min-width:150px;}
  .summary strong{display:block;font-size:26px;} .summary span{color:var(--muted);font-size:13px;}
  .case{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;margin:22px 0 0;}
  .case-header{display:flex;align-items:baseline;gap:12px;} .case-index{color:var(--muted);}
  .case-header h2{margin:0;font-size:20px;font-weight:600;} .case-meta{color:var(--muted);font-size:13px;}
  .case-verdict{margin-left:auto;font-weight:700;font-size:13px;padding:2px 10px;border-radius:999px;}
  .case-verdict.ok{color:var(--ok);} .case-verdict.bad{color:var(--bad);}
  .gates{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0;}
  .badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);}
  .badge--ok{color:var(--ok);} .badge--bad{color:var(--bad);}
  .frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;} .frames--wide{grid-template-columns:1fr;margin-top:12px;}
  .frame{background:var(--surface2);border:1px solid var(--line);border-radius:10px;overflow:hidden;}
  .frame-head{display:flex;justify-content:space-between;padding:8px 10px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--line);}
  .frame-label{color:var(--ink);font-weight:600;}
  .image-button{display:block;width:100%;border:0;padding:0;background:#000;cursor:zoom-in;} .image-button img{display:block;width:100%;height:auto;}
  .frame-missing{padding:24px;color:var(--muted);text-align:center;font-size:13px;}
</style></head>
<body><div class="shell">
  <header class="masthead">
    <p class="eyebrow">Single-server dual-frontend harness</p>
    <h1>Real Web vs Lynx-for-Web</h1>
    <p class="intro">Both panes are the shipping frontends connected to ONE seeded, isolated T3 Code server. The left pane is the real Web app (single-origin, paired); the right pane is the compiled ReactLynx bundle driven by the dev-only live connector transport against the same server. Any pane difference is a real renderer/composition difference, not a reference-fidelity artifact. Native Lynxtron correlation is Plan 11A BW5. Generated ${esc(summary.generatedAt)} · commit ${esc((summary.commit ?? "").slice(0, 12))}.</p>
    <div class="summary">
      <div><strong>${passCount}/${summary.cells.length}</strong><span>cells passing</span></div>
      <div><strong>${esc(summary.server?.expectProject ?? "")}</strong><span>seeded project</span></div>
      <div><strong>${summary.pass ? "PASS" : "FAIL"}</strong><span>overall</span></div>
    </div>
  </header>
  <section id="gallery">${cards}</section>
</div></body></html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
