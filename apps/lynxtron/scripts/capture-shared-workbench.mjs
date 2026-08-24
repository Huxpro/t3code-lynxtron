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
const semanticRoute = argValue("--semantic-route", "new-thread");
const settingsWebRouteBySemanticRoute = {
  "settings-archive": "/settings/archived",
  "settings-beta": "/settings/general",
};
const requestedWebRoute = argValue(
  "--web-route",
  semanticRoute.startsWith("settings-")
    ? (settingsWebRouteBySemanticRoute[semanticRoute] ??
        `/settings/${semanticRoute
          .replace(/^settings-/, "")
          .replace(/-(loading|error|mutation)$/, "")}`)
    : "/",
);
const theme = argValue("--theme", "dark") === "light" ? "light" : "dark";
const defaultOverlayByStateId = {
  "composer-compact-controls-open": "compact-controls",
  "composer-compact-controls-inline-files-narrow": "compact-controls",
  "composer-compact-controls-inline-files-short": "compact-controls",
  "diff-scope-menu": "diff-scope-menu",
  "model-picker-empty": "model-picker",
  "model-picker-selected": "model-picker",
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
const providerId = argValue("--provider-id", "");
const composerInput = argValue("--composer-input", "");
const sidebarQuery = argValue("--sidebar-query", "");
const sidebarTargetState = argValue("--sidebar-state", "");
const projectSettingsExpectation = argValue("--project-settings-expect", "missing");
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
const timeoutMs = Number(argValue("--timeout-ms", "35000"));
const selectedModelFixture = {
  instanceId: "claudeAgent",
  model: "claude-fable-5",
};

function webCredentialForState({ desktopBootstrapToken, startupToken, stateId: targetStateId }) {
  return targetStateId === "settings-connections" ? desktopBootstrapToken : startupToken;
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
const isLifecycleFaultState = stateId === "lifecycle-error" || stateId === "composer-disabled";
const isEmptyTranscriptState = stateId === "existing-thread-idle";
const isMultiStepQuestionState = stateId === "existing-thread-question-multi-step";
const isGitPublishDialogState = stateId === "git-publish-dialog";
const isProjectActionDialogState = stateId === "project-action-dialog";
const isProjectSettingsState = stateId === "sidebar-project-settings";
const isAddProviderDialogState = stateId === "settings-providers-add-dialog";
const isProvidersSettingsState = stateId === "settings-providers" || isAddProviderDialogState;
const isFilesBrowserState =
  stateId === "files-browser" || stateId === "settled-banner-inline-files-narrow";
const isFileEditingSaveState = stateId === "file-editor-editing-save";
const isNarrowFileEditorState =
  stateId === "file-editor-detail-narrow-inline" || isFileEditingSaveState;
const isFileEditorState =
  stateId === "file-editor-detail" ||
  stateId === "file-editor-detail-narrow-inline" ||
  isFileEditingSaveState;
const isCompactControlsState =
  stateId === "composer-compact-controls-open" ||
  stateId === "composer-compact-controls-inline-files-narrow" ||
  stateId === "composer-compact-controls-inline-files-short";
const isShortCompactControlsState = stateId === "composer-compact-controls-inline-files-short";
const isRightPanelAddMenuState = stateId === "right-panel-add-menu";
const isDiffScopeMenuState = stateId === "diff-scope-menu";
const isComposerPlanModeState = stateId === "composer-plan-mode";
const isFlatSidebarLayoutState = new Set([
  "sidebar-flat-layout",
  "sidebar-v2-new-thread-hover",
  "sidebar-v2-new-project-hover",
  "sidebar-v2-new-thread-projects",
  "add-project-sources",
  "command-palette-navigation",
]).has(stateId);
const isSidebarControlHoverState =
  stateId === "sidebar-v2-new-thread-hover" || stateId === "sidebar-v2-new-project-hover";
const isSidebarThreadHoverPreviewState = stateId === "sidebar-thread-hover-preview";
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
const shouldClearWebNotification =
  Boolean(overlay) ||
  isAddProviderDialogState ||
  isComposerPlanModeState ||
  isProjectSettingsState ||
  isFilesSurfaceState ||
  isReviewState;
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
    for (const key of ["statusBanner", "statusCopy", "statusAction"]) {
      if (!rectDeltaWithin(webMetrics.anatomy?.[key], lynxMetrics.anatomy?.[key], 2)) {
        return false;
      }
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

function quickSwitchAnatomyMatches(webMetrics, lynxMetrics) {
  if (!webMetrics?.anatomy || !lynxMetrics?.anatomy) return false;
  const webEmpty = webMetrics.emptyText !== null;
  const lynxEmpty = lynxMetrics.emptyText !== null;
  if (webEmpty !== lynxEmpty) return false;
  const keys = webEmpty
    ? ["panel", "search", "results", "footer", "empty"]
    : ["panel", "search", "results", "footer", "row"];
  return keys.every((key) => rectDeltaWithin(webMetrics.anatomy[key], lynxMetrics.anatomy[key], 2));
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
  if (stateId !== "existing-thread-failed") return true;
  const webRows = webMetrics?.rowGeometry ?? [];
  const lynxRows = lynxMetrics?.rowGeometry ?? [];
  if (webRows.length !== 2 || lynxRows.length !== 2) return false;
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
  if (stateId !== "settings-beta") return true;
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
  if (stateId !== "settings-beta") return true;
  const web = state?.web?.settingsMetrics?.legacySidebar;
  const lynx = state?.lynx?.settingsMetrics?.legacySidebar;
  return (
    web?.expanded === true &&
    lynx?.expanded === true &&
    web.row?.rect?.width > 0 &&
    lynx.row?.rect?.width > 0 &&
    web.control?.rect?.width > 0 &&
    lynx.control?.rect?.width > 0 &&
    web.checked === "false" &&
    (lynx.checked === "false" || lynx.controlClass?.includes("ui-switch--unchecked"))
  );
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
      activeItems.length === 1 &&
      activeItems[0]?.label === expectedLabel &&
      visuallySelectedItems.length === 1 &&
      visuallySelectedItems[0]?.label === expectedLabel
    );
  });
}

function generalSettingsContentMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-general") return true;
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
      lynxRow.status === "Not yet available in Lynxtron." &&
      lynxRow.box?.style?.opacity === "0.48"
    );
  });
}

function keybindingsSettingsContentMatches(webMetrics, lynxMetrics) {
  if (stateId !== "settings-keybindings") return true;
  const webRows = webMetrics?.keybindings?.rows ?? [];
  const lynxRows = lynxMetrics?.keybindings?.rows ?? [];
  const canonical = (rows) =>
    rows.map(({ command, shortcut, when, source, conflicts }) => ({
      command,
      shortcut,
      when,
      source,
      conflicts,
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
      const webRect = webColumn.box?.rect;
      const lynxRect = lynxRow.columns[columnIndex]?.box?.rect;
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
  if (!isProvidersSettingsState) return true;
  const webSection = webMetrics?.geometry?.sections?.[0]?.box?.rect;
  const lynxSection = lynxMetrics?.geometry?.sections?.[0]?.box?.rect;
  const webCards = webMetrics?.providers?.cards ?? [];
  const lynxCards = lynxMetrics?.providers?.cards ?? [];
  if (
    !webSection ||
    !lynxSection ||
    Math.abs(webSection.x - lynxSection.x) > 1 ||
    Math.abs(webSection.y - lynxSection.y) > 1 ||
    Math.abs(webSection.width - lynxSection.width) > 1 ||
    webCards.length === 0 ||
    webCards.length !== lynxCards.length
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
  return (
    web?.present === true &&
    lynx?.present === true &&
    web.activeStep === expectedStep &&
    lynx.activeStep === expectedStep &&
    geometryReady &&
    JSON.stringify(canonicalSteps(web)) === JSON.stringify(canonicalSteps(lynx)) &&
    driverParity &&
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

function completedComposerProviderStateMatches(state) {
  if (stateId !== "existing-thread-completed") return true;
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
    const authority = lynx?.settingsAuthority;
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
    (lynx.settingsAuthority === null ||
      lynx.settingsAuthority.style?.display === "none" ||
      lynx.settingsAuthority.style?.opacity === "0" ||
      (lynx.settingsAuthority.rect?.width === 0 && lynx.settingsAuthority.rect?.height === 0))
  );
}

function compactControlsEvidenceReady(state) {
  if (!isCompactControlsState) return true;
  const clientsReady = [state?.web, state?.lynx].every((client) => {
    const footer = client?.composerMetrics?.anatomy?.footer;
    const context = client?.composerMetrics?.anatomy?.context;
    const panel = client?.reviewMetrics?.panelRect;
    const overlayMetrics = client?.overlayMetrics;
    const anatomy = overlayMetrics?.anatomy;
    const scrollBottom = (anatomy?.scroll?.rect?.y ?? 0) + (anatomy?.scroll?.rect?.height ?? 0);
    const lastRowBottom =
      (anatomy?.lastRow?.rect?.y ?? Number.POSITIVE_INFINITY) +
      (anatomy?.lastRow?.rect?.height ?? 0);
    const initialVisibilityReady = isShortCompactControlsState
      ? lastRowBottom > scrollBottom + 1
      : lastRowBottom <= scrollBottom + 1;
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
  return (
    clientsReady && containment.web?.contained === true && containment.lynx?.contained === true
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
        webTypography?.fontSize === "12px" &&
        lynxTypography?.fontSize === "12px" &&
        webTypography?.fontFamily?.includes("DM Sans") === true &&
        lynxTypography?.fontFamily?.includes("DM Sans") === true
      );
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
    comparableRows
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
      ? web.editor?.rect?.width >= 320 &&
        lynx.editor?.rect?.width >= 320 &&
        web.explorer === null &&
        lynx.explorer === null &&
        (!sheet ||
          (Math.abs(web.editor.rect.width - webPanel.rect.width) <= 1 &&
            Math.abs(lynx.editor.rect.width - lynxPanel.rect.width) <= 2))
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
  const deadline = Date.now() + timeout;
  let clickAttempts = 0;
  let nextClickAt = 0;
  while (Date.now() < deadline) {
    const notification = await evaluate(
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
    if (notification?.present === false) return true;
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
      const target = frame?.contentWindow?.document?.querySelector('.sidebar-settings-row');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        x: frameRect.x + rect.x + rect.width / 2,
        y: frameRect.y + rect.y + rect.height / 2,
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
  if (!point) return false;
  await dispatchPointerClickWithMove(cdp, sessionId, point);
  return true;
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
    3_000,
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
  return (
    diffPairReady &&
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

async function dispatchKeyToRemoteElement(cdp, sessionId, expression, key, code, keyCode) {
  const focused = await focusRemoteElement(cdp, sessionId, expression);
  if (!focused) return false;
  await cdp.send(
    "Input.dispatchKeyEvent",
    { type: "rawKeyDown", key, code, windowsVirtualKeyCode: keyCode },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode },
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

async function sidebarThreadCardTarget(cdp, sessionId, client) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById(${JSON.stringify(`${client}-pane`)});
      const doc = frame?.contentWindow?.document;
      const root = ${JSON.stringify(client)} === 'lynx'
        ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
        : doc;
      const target = root?.querySelector('.sidebar-v2-row-card');
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      return {
        relationId: target.getAttribute('data-floating-anchor'),
        threadId: target.closest('[data-thread-id]')?.getAttribute('data-thread-id') ?? null,
        text: target.textContent?.trim().replace(/\\s+/g, ' ') ?? '',
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
      throw new Error(`${client} Sidebar details did not open at the expected relation`);
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
    timeline.push({ client, step: "opened", tooltip: openedByClient[client] });

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
    timeline.push({ client, step: "dismissed", ...dismissed });
    if (sidebarTooltipVisible(dismissed.tooltip)) {
      throw new Error(`${client} Sidebar details remained open after pointer leave`);
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
  const webFocused = await focusRemoteElement(
    cdp,
    sessionId,
    `(() => document.getElementById('web-pane')?.contentWindow?.document
      ?.querySelector('.sidebar-v2-row-card') ?? null)()`,
  );
  if (!webTarget?.relationId || !webFocused) {
    throw new Error("Could not focus Web Sidebar thread card for the paired hover frame");
  }
  await delay(250);
  const lynxTarget = await sidebarThreadCardTarget(cdp, sessionId, "lynx");
  if (!lynxTarget?.relationId) {
    throw new Error("Could not find Lynx Sidebar thread card for the paired hover frame");
  }
  await invokeLynxTooltipProbe(cdp, sessionId, lynxTarget.relationId, "hover");
  await delay(250);
  const final = {
    web: await readSidebarTooltip(cdp, sessionId, "web", webTarget.relationId),
    lynx: await readSidebarTooltip(cdp, sessionId, "lynx", lynxTarget.relationId),
  };
  if (!final.web || !final.lynx) {
    throw new Error(`Could not retain paired Sidebar thread details: ${JSON.stringify(final)}`);
  }
  timeline.push({ step: "paired-final", ...final });
  return { final, openedByClient, timeline };
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
    await delay(80);
    const dismissed = await readSidebarTooltip(cdp, sessionId, client, relationId);
    timeline.push({ client, step: "dismissed", tooltip: dismissed });
    if (dismissed !== null) {
      throw new Error(`${client} ${relationId} remained open after pointer leave`);
    }
  }

  const webFocused = await focusRemoteElement(
    cdp,
    sessionId,
    `(() => {
      const frame = document.getElementById('web-pane');
      return frame?.contentWindow?.document?.querySelector(${JSON.stringify(selector)}) ?? null;
    })()`,
  );
  if (!webFocused) throw new Error(`Could not focus Web ${selector} for the paired hover frame`);
  await delay(650);
  await movePointerToSidebarControl(cdp, sessionId, "lynx", selector);
  await delay(650);
  const final = {
    web: await readSidebarTooltip(cdp, sessionId, "web", relationId),
    lynx: await readSidebarTooltip(cdp, sessionId, "lynx", relationId),
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
  await delay(100);
  const lynxHoverVisual = await paletteRowHoverVisual(cdp, sessionId, "lynx", "Add project");
  if (lynxHoverVisual?.hovered !== true) {
    throw new Error(
      `Lynx-for-Web Add project row did not enter :hover: ${JSON.stringify(lynxHoverVisual)}`,
    );
  }
  timeline.push({
    step: "hover-lynx",
    visual: lynxHoverVisual,
    stateBridge: "browser-proxy-does-not-project-main-thread-hover",
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
    lynxVisual: finalLynxHoverVisual,
  });
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
            target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
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
          metrics?.saveError && metrics?.saveRetry && metrics?.saveRetryText === "Retry save",
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
  if (stateId !== "model-picker-selected" && !requiresRunningRuntime && !isComposerPlanModeState) {
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
SET interaction_mode = 'plan'
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
      : `UPDATE projection_threads
SET model_selection_json = json_object(
  'instanceId', '${selectedModelFixture.instanceId}',
  'model', '${selectedModelFixture.model}'
)
WHERE thread_id = '${escapedThreadId}';`;
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
      ? `SELECT interaction_mode FROM projection_threads WHERE thread_id = '${escapedThreadId}'`
      : requiresRunningRuntime
        ? `SELECT status, json_extract(runtime_payload_json, '$.activeTurnId') AS active_turn_id
FROM provider_session_runtime
WHERE thread_id = '${escapedThreadId}'`
        : `SELECT model_selection_json FROM projection_threads WHERE thread_id = '${escapedThreadId}'`;
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
      ? queryReport.rows?.length === 1 && queryReport.rows[0]?.interaction_mode === "plan"
      : requiresRunningRuntime
        ? queryReport.rows?.length === 1 &&
          queryReport.rows[0]?.status === "running" &&
          queryReport.rows[0]?.active_turn_id === expectedThreadFixture.activeTurnId
        : queryReport.rows?.length === 1 &&
          queryReport.rows[0]?.model_selection_json === JSON.stringify(selectedModelFixture);
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
        : {
            kind: "thread-model-selection",
            sourceSha256: seed?.snapshotSha256 ?? null,
            preparedSha256: prepared.sha256,
            threadId,
            modelSelection: selectedModelFixture,
            backupRemoved: true,
          };
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
    "existing-thread-failed",
    "existing-thread-approval",
    "existing-thread-question",
    "existing-thread-question-multi-step",
    "sidebar-resize",
    "files-browser",
    "settled-banner-inline-files-narrow",
    "file-editor-detail",
    "file-editor-detail-narrow-inline",
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
    "quick-switch-default",
    "quick-switch-query",
    "quick-switch-query-light",
    "quick-switch-actions-only",
    "quick-switch-empty",
    "sidebar-v2-new-thread-hover",
    "sidebar-v2-new-project-hover",
    "sidebar-thread-hover-preview",
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
      : stateId === "composer-working" || stateId === "existing-thread-working"
        ? seed?.dataset?.workingThread
        : stateId === "composer-plan-mode"
          ? seed?.dataset?.canonicalThread
          : stateId === "existing-thread-completed"
            ? seed?.dataset?.completedThread
            : stateId === "existing-thread-failed"
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
  if (
    stateId === "existing-thread-completed" &&
    expectedThreadFixture?.latestTurnState !== "completed"
  ) {
    throw new Error(
      `State ${stateId} requires a populated completed-turn fixture, but ${seedSource} has none`,
    );
  }
  if (stateId === "existing-thread-failed" && expectedThreadFixture?.latestTurnState !== "error") {
    throw new Error(
      `State ${stateId} requires a populated failed-turn fixture, but ${seedSource} has none`,
    );
  }
  const fixturePreparation = await prepareStateFixture({ seed, expectedThreadFixture });
  seed.fixturePreparation = fixturePreparation;
  await writeFile(seedReportPath, `${JSON.stringify(seed, null, 2)}\n`);
  const expectProject = semanticRoute.startsWith("settings-")
    ? ""
    : (expectedThreadFixture?.projectTitle ?? seed?.dataset?.projects?.[0]?.title ?? "");
  const expectThread = expectedThreadFixture?.id ?? null;
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
    host: HOST,
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
      if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
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
    if (
      (explicitExpectedThreadId || isComposerPlanModeState || isMultiStepQuestionState) &&
      expectThread
    ) {
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
    "sidebar-v2-new-thread-projects": "existing-thread",
    "existing-thread-working": "existing-thread",
    "git-publish-dialog": "existing-thread",
    "project-action-dialog": "existing-thread",
    "existing-thread-completed": "existing-thread",
    "existing-thread-failed": "existing-thread",
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
    "file-picker-default": "existing-thread",
    "sidebar-inline-search": "existing-thread",
    "model-picker-default": "model-picker",
    "model-picker-provider-rail": "model-picker",
    "model-picker-query": "model-picker",
    "model-picker-empty": "model-picker",
    "model-picker-selected": "model-picker",
    "composer-hero": "new-thread",
    "composer-sendable": "new-thread",
    "composer-docked": "existing-thread",
    "composer-plan-mode": "existing-thread",
    "composer-working": "existing-thread",
    "composer-compact-controls-open": "existing-thread",
    "composer-compact-controls-inline-files-narrow": "existing-thread",
    "composer-compact-controls-inline-files-short": "existing-thread",
    "right-panel-add-menu": "existing-thread",
    "diff-scope-menu": "existing-thread",
    "settled-banner-inline-files-narrow": "existing-thread",
    "composer-disabled": "existing-thread",
    "workspace-menu-open": "existing-thread",
    "settings-general": "settings-general",
    "settings-appearance": "settings-general",
    "settings-keybindings": "settings-general",
    "settings-providers": "settings-general",
    "settings-providers-add-dialog": "settings-general",
    "settings-connections": "settings-general",
    "settings-source-control": "settings-general",
    "settings-source-control-loading": "settings-general",
    "settings-source-control-error": "settings-general",
    "settings-beta": "settings-general",
    "settings-archive": "settings-general",
    "review-checkpoint": "existing-thread",
    "review-tree": "existing-thread",
    "review-diff": "existing-thread",
    "review-empty": "existing-thread",
    "files-browser": "existing-thread",
    "file-editor-detail": "existing-thread",
    "file-editor-detail-narrow-inline": "existing-thread",
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
    webRoute,
    theme,
    legacySidebarEnabled: String(legacySidebarEnabled),
    ...(overlay ? { overlay } : {}),
    expectProject,
    ...(expectThread ? { expectThread } : {}),
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
  let newThreadProjectsStage =
    stateId === "sidebar-v2-new-thread-projects" ? "waiting-controls" : "not-required";
  const newThreadProjectsTimeline = [];
  let newThreadDraftLifecycle = null;
  let addProjectSourcesStage =
    stateId === "add-project-sources" ? "waiting-controls" : "not-required";
  const addProjectSourcesTimeline = [];
  let addProviderDialogStage = isAddProviderDialogState ? "waiting-settings" : "not-required";
  const addProviderDialogTimeline = [];
  let settingsAsyncReadyPolls =
    stateId === "settings-source-control" ||
    stateId === "settings-source-control-loading" ||
    stateId === "settings-source-control-error"
      ? 0
      : 10;
  let webLegacySettingsExpanded = stateId !== "settings-beta";
  let lynxLegacySettingsExpanded = stateId !== "settings-beta";
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
  let webReviewPanelInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
    reviewExpectation === "diff";
  let lynxReviewPanelInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
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
  let reachedTargetState = false;
  let webFilesBrowserInputSent = !isFilesSurfaceState;
  let lynxFilesBrowserInputSent = !isFilesSurfaceState;
  let webFileEditorInputSent = !isFileEditorState;
  let lynxFileEditorInputSent = !isFileEditorState;
  let webFileEditorOpenAttempts = 0;
  let lynxFileEditorOpenAttempts = 0;
  let webFileEditorDomFallbackUsed = false;
  let fileEditorSwitched = !isFileEditorState || isNarrowFileEditorState;
  let fileEditorReturnedToBrowser = !isFileEditorState || isFileEditingSaveState;
  let webFileEditorReturnedToBrowser = !isFileEditorState || isFileEditingSaveState;
  let lynxFileEditorReturnedToBrowser = !isFileEditorState || isFileEditingSaveState;
  let rightPanelAddMenuDismissed = !isRightPanelAddMenuState;
  let rightPanelAddMenuTerminalSelected = !isRightPanelAddMenuState;
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
  while (Date.now() < deadline) {
    state = await evaluate(
      cdp,
      sessionId,
      `(() => { const w = window.__T3_WORKBENCH__; return w ? w.read() : null; })()`,
    ).catch(() => null);
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
    if (
      stateId === "settings-beta" &&
      state?.web?.settingsMetrics &&
      state?.lynx?.settingsMetrics
    ) {
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
          await dispatchPointerClick(cdp, sessionId, thinkingPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxThinkingInputSent && thinkingPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, thinkingPoints.lynx);
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
    if (
      terminateOwnedServer &&
      !ownedServerTerminated &&
      state?.web?.semanticReady === true &&
      state?.lynx?.semanticReady === true &&
      state?.web?.productState?.selectedProject === expectProject &&
      state?.lynx?.productState?.selectedProject === expectProject &&
      state?.lynx?.connectorDiagnostics?.commandResults?.some(
        ({ method }) => method === "readProjectBranch",
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
      state?.web?.connected === true &&
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
      let typed = true;
      for (let index = 0; index < sidebarQuery.length; index += 1) {
        const character = sidebarQuery[index];
        const expectedPrefix = sidebarQuery.slice(0, index + 1);
        const focused = await focusRemoteElement(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('lynx-pane');
            const doc = frame?.contentWindow?.document;
            const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
            const host = root?.querySelector('[aria-label="Search threads"]');
            return host?.shadowRoot?.querySelector('input') ?? host ?? null;
          })()`,
        ).catch(() => false);
        if (!focused) {
          typed = false;
          break;
        }
        await cdp.send(
          "Input.dispatchKeyEvent",
          { type: "char", text: character, unmodifiedText: character },
          sessionId,
        );
        const prefixDeadline = Date.now() + 1000;
        let prefixApplied = false;
        while (Date.now() < prefixDeadline) {
          const currentQuery = await evaluate(
            cdp,
            sessionId,
            `window.__T3_WORKBENCH__?.read()?.lynx?.sidebarDiagnostics?.search?.value ?? ""`,
          ).catch(() => "");
          if (currentQuery === expectedPrefix) {
            prefixApplied = true;
            break;
          }
          await delay(20);
        }
        if (!prefixApplied) {
          typed = false;
          break;
        }
      }
      if (typed) {
        lynxSidebarSearchInputSent = true;
        sidebarSearchInputChannel = "web-dom-focus+key-char|lynx-dom-focus+key-char";
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
          (isDiffScopeMenuState &&
            !lynxReviewDiffInputSent &&
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
        if (isDiffScopeMenuState && !lynxReviewDiffInputSent && checkpointDiffPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, checkpointDiffPoints.lynx);
          lynxReviewDiffInputSent = true;
          await delay(100);
          continue;
        }
      }
      if (
        shouldOpenDiff &&
        !isDiffScopeMenuState &&
        state?.web?.reviewMetrics?.panelOpen &&
        state?.lynx?.reviewMetrics?.panelOpen
      ) {
        const diffPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector('[data-right-panel-action="diff"]');
              if (!frame || !target || target.getAttribute('aria-disabled') === 'true') return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (
          !lynxReviewDiffInputSent &&
          !reviewDiffHasExpectedPatch(state?.lynx?.reviewMetrics?.diff) &&
          diffPoints?.lynx
        ) {
          await dispatchPointerClick(cdp, sessionId, diffPoints.lynx);
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
      if (
        !projectSettingsInteraction.webScopeOpened ||
        !projectSettingsInteraction.lynxScopeOpened
      ) {
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
        if (!projectSettingsInteraction.webScopeOpened && scopePoints?.web) {
          await dispatchPointerClickWithMove(cdp, sessionId, scopePoints.web);
        }
        if (!projectSettingsInteraction.lynxScopeOpened && scopePoints?.lynx) {
          await dispatchPointerClickWithMove(cdp, sessionId, scopePoints.lynx);
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
        projectSettingsInteraction.webScopeOptionCount = actionState?.web?.optionCount ?? 0;
        projectSettingsInteraction.lynxScopeOptionCount = actionState?.lynx?.optionCount ?? 0;
        projectSettingsInteraction.webScopeActionCount = actionState?.web?.actionCount ?? 0;
        projectSettingsInteraction.lynxScopeActionCount = actionState?.lynx?.actionCount ?? 0;
        projectSettingsInteraction.webScopeKeys = actionState?.web?.optionKeys ?? [];
        projectSettingsInteraction.lynxScopeKeys = actionState?.lynx?.optionKeys ?? [];
        projectSettingsInteraction.webScopeLabels = actionState?.web?.optionLabels ?? [];
        projectSettingsInteraction.lynxScopeLabels = actionState?.lynx?.optionLabels ?? [];
        if (!projectSettingsInteraction.webActionClicked && actionState?.web?.point) {
          await dispatchPointerClickWithMove(cdp, sessionId, actionState.web.point);
          projectSettingsInteraction.webActionClicked = true;
        }
        if (!projectSettingsInteraction.lynxActionClicked && actionState?.lynx?.point) {
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
      state?.web?.productState?.selectedProject === expectProject &&
      (!["workspace-menu", "compact-controls", "right-panel-add-menu", "diff-scope-menu"].includes(
        overlay,
      ) ||
        state?.lynx?.productState?.overlay === overlay) &&
      state?.web?.productState?.overlay !== overlay
    ) {
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
      state?.web?.composerMetrics?.editor?.disabled === false &&
      state?.lynx?.composerMetrics?.editor?.disabled === false
    ) {
      const webComposerEditorFocused = await focusRemoteElement(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          return frame?.contentWindow?.document?.querySelector('[data-composer-editor="true"]') ?? null;
        })()`,
      );
      let lynxComposerEditorFocused = true;
      if (webComposerEditorFocused) {
        for (let index = 0; index < composerInput.length; index += 1) {
          const character = composerInput[index];
          await cdp.send(
            "Input.dispatchKeyEvent",
            { type: "char", text: character, unmodifiedText: character },
            sessionId,
          );
        }
        for (let index = 0; index < composerInput.length; index += 1) {
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
        composerInputChannel = `web-dom-focus+key-char:${webComposerEditorFocused}|lynx-dom-focus+key-char:${lynxComposerEditorFocused}`;
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
    const legacySettingsReady = legacySidebarSettingsReady(state);
    settingsAsyncReadyPolls =
      settingsAsyncReady && settingsGeometryReady && settingsNavigationReady && legacySettingsReady
        ? settingsAsyncReadyPolls + 1
        : 0;
    const webTimelineRows = state?.web?.timelineMetrics?.rows ?? [];
    const lynxTimelineRows = state?.lynx?.timelineMetrics?.rows ?? [];
    const transcriptReady =
      !stateId.startsWith("existing-thread-") ||
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
          ));
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
      (composerInputReady &&
        composerStateReady &&
        composerAnatomyMatches(state?.web?.composerMetrics, state?.lynx?.composerMetrics) &&
        completedComposerProviderStateMatches(state));
    const planModeReady = composerPlanModeMatches(state);
    const sessionProjectionReady = sessionProjectionMatches(state, expectedThreadFixture);
    const stageIdentityReady = sidebarStageIdentityMatches(state);
    const sidebarControlGeometryReady = sidebarControlGeometryMatches(state);
    const sidebarProjectGroupsReady = sidebarProjectGroupsMatch(state);
    const flatSidebarLayoutReady = flatSidebarLayoutMatches(state);
    const addProjectSourcesReady = addProjectSourcesMatch(state);
    const sidebarFooterThemeReady = sidebarFooterThemeMatches(state, width, height);
    const compactControlsReady = compactControlsEvidenceReady(state);
    const projectActionReady = projectActionDialogReady(state);
    const projectSettingsStateReady = projectSettingsReady(state, projectSettingsInteraction);
    const rightPanelAddMenuStateReady = rightPanelAddMenuReady(state);
    const diffScopeMenuStateReady = diffScopeMenuReady(state);
    const sidebarWorkingGeometryReady = sidebarWorkingGeometryMatches(state, expectedThreadFixture);
    const headerGitActionReady = isFlatSidebarLayoutState || headerGitActionMatches(state);
    const gitPublishDialogReady = gitPublishDialogMatches(state);
    const filesBrowserStateReady = filesBrowserSemanticReady(state);
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
      isFlatSidebarLayoutState || coreGeometryMatches(state?.web, state?.lynx);
    const reviewReady =
      reviewPairMatches(state?.web?.reviewMetrics, state?.lynx?.reviewMetrics, reviewExpectation) &&
      sidebarDiffPairMatches(
        state?.web?.sidebarDiagnostics,
        state?.lynx?.sidebarDiagnostics,
        reviewExpectation,
      );
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
      fileEditorReadyPolls >= (isNarrowFileEditorState ? 1 : 3) &&
      shortcutInputReady &&
      sidebarSearchReady &&
      sidebarStateReady &&
      changedFilesStateReady &&
      coreGeometryReady &&
      reviewReady &&
      lifecycleReady
    ) {
      reachedTargetState = true;
      break;
    }
    await delay(100);
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
    sidebarThreadHoverPreview = await runSidebarThreadHoverPreviewFlow(cdp, sessionId, {
      width,
      height,
    });
    sidebarThreadHoverPreviewStage = "complete";
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
  const bothReady =
    lifecycleFaultReady || Boolean(state?.web?.semanticReady && state?.lynx?.semanticReady);
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
    isFlatSidebarLayoutState || coreGeometryMatches(state?.web, state?.lynx);
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
  const finalComposerReady =
    isFlatSidebarLayoutState ||
    (finalComposerInputReady &&
      finalComposerStateReady &&
      composerAnatomyMatches(state?.web?.composerMetrics, state?.lynx?.composerMetrics) &&
      completedComposerProviderStateMatches(state));
  const finalPlanModeReady = composerPlanModeMatches(state);
  const finalSessionProjectionReady = sessionProjectionMatches(state, expectedThreadFixture);
  const finalStageIdentityReady = sidebarStageIdentityMatches(state);
  const finalSidebarControlGeometryReady = sidebarControlGeometryMatches(state);
  const finalSidebarProjectGroupsReady = sidebarProjectGroupsMatch(state);
  const finalFlatSidebarLayoutReady = flatSidebarLayoutMatches(state);
  const finalAddProjectSourcesReady = addProjectSourcesMatch(state);
  const finalNewThreadProjectsReady = newThreadProjectsMatch(state);
  const finalSidebarFooterThemeReady = sidebarFooterThemeMatches(state, width, height);
  const finalCompactControlsReady = compactControlsEvidenceReady(state);
  const finalProjectActionDialogReady = projectActionDialogReady(state);
  const finalProjectSettingsReady = projectSettingsReady(state, projectSettingsInteraction);
  const finalRightPanelAddMenuReady = rightPanelAddMenuReady(state);
  const finalDiffScopeMenuReady = diffScopeMenuReady(state);
  const finalSidebarWorkingGeometryReady = sidebarWorkingGeometryMatches(
    state,
    expectedThreadFixture,
  );
  const finalHeaderGitActionReady = isFlatSidebarLayoutState || headerGitActionMatches(state);
  const finalGitPublishDialogReady = gitPublishDialogMatches(state);
  let finalFilesBrowserReady = filesBrowserReady(state);
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
  const finalReviewReady =
    reviewPairMatches(state?.web?.reviewMetrics, state?.lynx?.reviewMetrics, reviewExpectation) &&
    sidebarDiffPairMatches(
      state?.web?.sidebarDiagnostics,
      state?.lynx?.sidebarDiagnostics,
      reviewExpectation,
    );
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
        : stateId !== "settings-source-control" ||
          ((state?.web?.settingsMetrics?.rowIds ?? []).includes("source-control") &&
            (state?.lynx?.settingsMetrics?.rowIds ?? []).includes("source-control"));
  const finalSettingsGeometryReady =
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
  const finalAddProviderDialogReady =
    !isAddProviderDialogState ||
    (addProviderDialogStage === "complete" &&
      addProviderDialogPairMatches(state, width, height, 0));
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
    JSON.stringify(state?.web?.timelineMetrics?.workEntries ?? []) ===
      JSON.stringify(state?.lynx?.timelineMetrics?.workEntries ?? []) &&
    workingTranscriptGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) &&
    failedTranscriptGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics) &&
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
    !stateId.startsWith("existing-thread-") ||
    (isEmptyTranscriptState ? finalEmptyTranscriptReady : finalPopulatedTranscriptReady);
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
      JSON.stringify({
        route: webState.route,
        semanticRoute: webState.semanticRoute,
        theme: webState.theme,
        density: webState.density,
        selectedThread: isFlatSidebarLayoutState ? null : webState.selectedThread,
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
          selectedThread: isFlatSidebarLayoutState ? null : lynxState.selectedThread,
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
  const overlayContentMatch = isModelPickerOverlay
    ? modelPickerSemanticMatch
    : webOverlayRowLabels.length === 0 && lynxOverlayRowLabels.length === 0
      ? state?.web?.overlayMetrics?.emptyText === state?.lynx?.overlayMetrics?.emptyText
      : webOverlayRowLabels.every((label, index) => label && label === lynxOverlayRowLabels[index]);
  const settingsContentMatch = !semanticRoute.startsWith("settings-")
    ? true
    : stateId === "settings-beta"
      ? finalSettingsGeometryReady && legacySidebarSettingsReady(state)
      : stateId === "settings-general"
        ? generalSettingsContentMatches(state?.web?.settingsMetrics, state?.lynx?.settingsMetrics)
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
                      JSON.stringify(state?.lynx?.settingsMetrics?.sectionTitles ?? []) &&
                    JSON.stringify(state?.web?.settingsMetrics?.navigationLabels ?? []) ===
                      JSON.stringify(state?.lynx?.settingsMetrics?.navigationLabels ?? [])
                  : stateId === "settings-source-control-error"
                    ? JSON.stringify(state?.web?.settingsMetrics?.navigationLabels ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.navigationLabels ?? []) &&
                      JSON.stringify(state?.web?.settingsMetrics?.sectionTitles ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.sectionTitles ?? []) &&
                      JSON.stringify(
                        state?.web?.settingsMetrics?.sourceControlEmptyTitles ?? [],
                      ) ===
                        JSON.stringify(
                          state?.lynx?.settingsMetrics?.sourceControlEmptyTitles ?? [],
                        ) &&
                      JSON.stringify(state?.web?.settingsMetrics?.errorTexts ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.errorTexts ?? []) &&
                      (state?.web?.settingsMetrics?.sourceControlRetryLabels?.length ?? 0) > 0 &&
                      (state?.lynx?.settingsMetrics?.sourceControlRetryLabels?.length ?? 0) > 0
                    : JSON.stringify(state?.web?.settingsMetrics?.navigationLabels ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.navigationLabels ?? []) &&
                      JSON.stringify(state?.web?.settingsMetrics?.sectionTitles ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.sectionTitles ?? []) &&
                      JSON.stringify(state?.web?.settingsMetrics?.sectionTexts ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.sectionTexts ?? []) &&
                      JSON.stringify(state?.web?.settingsMetrics?.sourceControlRows ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.sourceControlRows ?? []) &&
                      JSON.stringify(state?.web?.settingsMetrics?.emptyTexts ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.emptyTexts ?? []) &&
                      JSON.stringify(state?.web?.settingsMetrics?.errorTexts ?? []) ===
                        JSON.stringify(state?.lynx?.settingsMetrics?.errorTexts ?? []) &&
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
  webState = state?.web?.productState ?? null;
  lynxState = state?.lynx?.productState ?? null;
  stateIdentityMatch = currentStateIdentityMatches();
  finalCoreGeometryReady = isFlatSidebarLayoutState || coreGeometryMatches(state?.web, state?.lynx);
  finalFilesBrowserReady = filesBrowserReady(state);
  finalFileEditorReady = fileEditorReady(state);
  reachedTargetState ||= isFileEditorState && finalFileEditorReady;
  if (
    overlay &&
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
  await Promise.all([writeFile(webPath, webPng), writeFile(lynxPath, lynxPng)]);
  const webAssertionsPath = path.join(cellDir, "web-assertions.json");
  const lynxAssertionsPath = path.join(cellDir, "lynx-assertions.json");
  const consolePath = path.join(cellDir, "console.txt");

  const webDims = pngDimensions(webPng);
  const lynxDims = pngDimensions(lynxPng);
  const sameDims = webDims.width === lynxDims.width && webDims.height === lynxDims.height;

  let sideBySide = null;
  let diff = null;
  if (sameDims) {
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

  if (isRightPanelAddMenuState && finalRightPanelAddMenuReady) {
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
            const trigger = root?.querySelector('[data-floating-anchor="right-panel-add-menu"], .right-panel__add-btn');
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
      if (triggerPoints?.web) {
        await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.web);
      }
      if (triggerPoints?.lynx) {
        await dispatchPointerClickWithMove(cdp, sessionId, triggerPoints.lynx);
      }
      let terminalPoints = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        terminalPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const rows = [
                ...(root?.querySelectorAll(
                  '[data-floating-popup="right-panel-add-menu"] [data-slot="menu-item"], [data-right-panel-add-kind]'
                ) ?? []),
              ];
              const target = rows.find((row) =>
                row.getAttribute('data-right-panel-add-kind') === 'terminal' ||
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
        if (terminalPoints?.web && terminalPoints?.lynx) break;
        await delay(100);
      }
      if (terminalPoints?.web)
        await dispatchPointerClickWithMove(cdp, sessionId, terminalPoints.web);
      if (terminalPoints?.lynx) {
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
                web
                  ?.querySelector('[data-active-tab="true"]')
                  ?.textContent?.trim()
                  .includes('Terminal') === true &&
                web?.querySelector('[data-floating-popup="right-panel-add-menu"]') === null,
              lynx:
                lynx
                  ?.querySelector('[data-right-panel-open="true"]')
                  ?.getAttribute('data-right-panel-active-kind') === 'terminal' &&
                lynx?.querySelector('[data-terminal-placeholder="true"]') !== null &&
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

  if (isFileEditorState && !isNarrowFileEditorState && finalFileEditorReady) {
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
  const identityMatch =
    stateIdentityMatch &&
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
        isLifecycleFaultState &&
        (/WebSocket connection .* failed:/.test(e.text) ||
          /SocketReadError: An error occurred during Read/.test(e.text))
      ),
  );
  const confirmedTargetState =
    reachedTargetState ||
    (isFlatSidebarLayoutState && bothReady && finalFlatSidebarLayoutReady) ||
    (stateId === "sidebar-project-groups" && bothReady && finalSidebarProjectGroupsReady);

  const pass =
    confirmedTargetState &&
    bothReady &&
    identityMatch &&
    finalOverlayReady &&
    finalShortcutInputReady &&
    finalSidebarSearchReady &&
    finalSidebarStateReady &&
    finalChangedFilesStateReady &&
    finalCoreGeometryReady &&
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
    finalFileEditorReady &&
    (!isFileEditingSaveState || fileEditingSaveEvidence !== null) &&
    fileEditorSwitched &&
    fileEditorReturnedToBrowser &&
    gitPublishDismissed &&
    finalReviewReady &&
    finalSettingsAsyncReady &&
    finalSettingsGeometryReady &&
    finalSettingsNavigationReady &&
    finalAddProviderDialogReady &&
    finalTranscriptReady &&
    finalPendingRequestReady &&
    (!isMultiStepQuestionState || multiStepQuestionStage === "complete") &&
    (stateId !== "command-palette-navigation" || commandPaletteNavigationStage === "complete") &&
    (!isSidebarControlHoverState || sidebarControlHoverStage === "complete") &&
    (!isSidebarThreadHoverPreviewState || sidebarThreadHoverPreviewStage === "complete") &&
    (stateId !== "sidebar-v2-new-thread-projects" || newThreadProjectsStage === "complete") &&
    (stateId !== "add-project-sources" || addProjectSourcesStage === "complete") &&
    settingsContentMatch !== false &&
    lynxStyled &&
    consoleErrors.length === 0 &&
    sameDims;
  if (!pass)
    failuresNote(viewport.label, {
      reachedTargetState: confirmedTargetState,
      bothReady,
      identityMatch,
      finalOverlayReady,
      finalShortcutInputReady,
      finalSidebarSearchReady,
      finalSidebarStateReady,
      finalChangedFilesStateReady,
      finalCoreGeometryReady,
      finalComposerReady,
      completedComposerProviderState: readCompletedComposerProviderState(state),
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
      finalFileEditorReady,
      fileEditingSaveEvidence: !isFileEditingSaveState || fileEditingSaveEvidence !== null,
      fileEditorSwitched,
      fileEditorReturnedToBrowser,
      gitPublishDismissed,
      finalReviewReady,
      finalSettingsAsyncReady,
      finalSettingsGeometryReady,
      finalSettingsNavigationReady,
      finalAddProviderDialogReady,
      finalTranscriptReady,
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
    identity: {
      match: identityMatch,
      stateIdentityMatch,
      sessionProjection: {
        match: finalSessionProjectionReady,
        expectedSessionStatus: expectedThreadFixture?.sessionStatus ?? null,
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
      newThreadProjects: {
        match: finalNewThreadProjectsReady && newThreadProjectsStage === "complete",
        stage: newThreadProjectsStage,
        timeline: newThreadProjectsTimeline,
        draftLifecycle: newThreadDraftLifecycle,
        web: state?.web?.overlayMetrics ?? null,
        lynx: state?.lynx?.overlayMetrics ?? null,
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
          ? "dual-scope-pointer|web-project-action-pointer"
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
          isFileEditorState && !isNarrowFileEditorState
            ? "web-explorer-pointer|lynx-explorer-pointer"
            : "not-required",
        switched: fileEditorSwitched,
        returnedBy:
          isFileEditorState && !isFileEditingSaveState
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
      fileEditingSave: fileEditingSaveEvidence,
      expectProject,
      webState,
      lynxState,
      overlayGeometryDelta,
      overlayAnchorOffsets,
      overlayContentMatch,
      modelPickerSemanticMatch,
      settingsContentMatch,
      overlayRowCountMatch: isModelPickerOverlay
        ? (state?.web?.overlayMetrics?.semanticKeys?.length ?? 0) ===
          (state?.lynx?.overlayMetrics?.semanticKeys?.length ?? 0)
        : state?.web?.overlayMetrics?.rowCount === state?.lynx?.overlayMetrics?.rowCount,
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
      reviewInteractionTimeline,
    },
    images: {
      web: path.relative(repoRoot, webPath),
      lynx: path.relative(repoRoot, lynxPath),
      sideBySide,
      diff,
      webDims,
      lynxDims,
      sameDimensions: sameDims,
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
  const failed = Object.entries(gates)
    .filter(([, v]) => !v)
    .map(([k]) => k);
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
