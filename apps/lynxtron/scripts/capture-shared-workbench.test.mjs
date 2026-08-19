import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "capture-shared-workbench.mjs"), "utf8");

describe("shared workbench lifecycle fault capture", () => {
  it("filters only expected transport errors during the injected disconnect", () => {
    assert.include(source, "isLifecycleFaultState");
    assert.include(source, "/WebSocket connection .* failed:/");
    assert.include(source, "/SocketReadError: An error occurred during Read/");
  });

  it("waits for connection-scoped branch discovery before injecting the disconnect", () => {
    assert.include(source, 'method === "readProjectBranch"');
    assert.include(source, "state?.lynx?.connectorDiagnostics?.commandResults?.some(");
    assert.include(source, '({ method }) => method === "readProjectBranch"');
    assert.notInclude(source, "!state?.lynx?.connectorDiagnostics?.commands?.some(");
  });

  it("admits the expected disconnected lifecycle without requiring semantic readiness", () => {
    assert.include(source, "const semanticStateReady = isLifecycleFaultState");
    assert.include(source, "? lifecycleReady");
  });

  it("treats the seeded idle thread as an empty transcript after Web sync completes", () => {
    assert.include(source, 'const isEmptyTranscriptState = stateId === "existing-thread-idle"');
    assert.include(source, "state?.web?.timelineMetrics?.threadSyncLabel === null");
    assert.include(source, "state?.web?.timelineMetrics?.empty?.text ===");
    assert.include(source, "state?.lynx?.timelineMetrics?.empty?.text");
    assert.include(source, "const webEmptyTranscript = webState?.timelineMetrics?.empty");
    assert.include(source, "rectDeltaWithin(webEmptyTranscript, lynxEmptyTranscript, 2)");
    assert.include(source, "webTimelineRows.length === 0");
    assert.include(source, "lynxTimelineRows.length === 0");
  });

  it("does not classify intentional large visual assets as unsettled icons", () => {
    assert.include(source, "className.includes('authority')");
    assert.include(source, "className.includes('sidebar-grain__tile')");
    assert.include(source, "className.includes('-atlas__image')");
  });

  it("does not relabel a running canonical thread as completed or failed", () => {
    assert.include(source, "seed?.dataset?.completedThread");
    assert.include(source, "seed?.dataset?.failedThread");
    assert.include(source, 'expectedThreadFixture?.latestTurnState !== "completed"');
    assert.include(source, 'expectedThreadFixture?.latestTurnState !== "error"');
  });

  it("accepts an explicit immutable seed source for cross-client fixtures", () => {
    assert.include(source, 'const explicitSeedSource = argValue("--seed-source", "")');
    assert.include(source, "explicitSeedSource ||");
    assert.include(source, "process.env.T3_PLAN11C_SEED_SOURCE");
  });

  it("synchronizes the provider runtime for real working-state captures", () => {
    assert.include(
      source,
      'stateId === "composer-working" || stateId === "existing-thread-working"',
    );
    assert.include(source, 'kind: "provider-runtime-running"');
    assert.include(source, "UPDATE provider_session_runtime");
    assert.include(source, "'$.activeTurnId'");
    assert.include(source, 'runtimeStatus: "running"');
  });

  it("cold-starts both renderers at the requested Sidebar width and gates control geometry", () => {
    assert.include(source, '"sidebar-resize",');
    assert.include(source, '"sidebar-resize": "existing-thread"');
    assert.include(
      source,
      'const requestedSidebarWidthValue = Number(argValue("--sidebar-width", ""))',
    );
    assert.include(source, "function sidebarControlGeometryMatches(state)");
    assert.include(source, "const expectedScopeWidth = requestedSidebarWidth - 53");
    assert.include(source, "finalSidebarControlGeometryReady");
    assert.include(source, "sidebarControlGeometry:");
  });

  it("rejects the dark authority footer in light theme", () => {
    assert.include(
      source,
      "function sidebarFooterThemeMatches(state, viewportWidth, viewportHeight)",
    );
    assert.include(
      source,
      "const responsiveViewport = viewportWidth !== 1280 || viewportHeight !== 820",
    );
    assert.include(source, "footer?.height === 48");
    assert.include(source, "row?.height === 32");
    assert.include(source, "row.y + row.height <= footer.y + footer.height");
    assert.include(source, "responsiveAuthorityHidden");
    assert.include(source, 'if (theme !== "light") return true;');
    assert.include(source, 'if (semanticRoute.startsWith("settings-"))');
    assert.include(source, "chrome?.settingsFooter?.rect?.height > 0");
    assert.include(source, "chrome?.settingsBack?.rect?.height > 0");
    assert.include(source, "sidebarFooterThemeMatches(state, width, height)");
    assert.include(source, "finalSidebarFooterThemeReady");
    assert.include(source, "sidebarFooterTheme:");
  });

  it("captures the real compact Composer menu beside an inline right panel", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, '"composer-compact-controls-open": "compact-controls"');
    assert.include(source, '"composer-compact-controls-inline-files-narrow": "compact-controls"');
    assert.include(source, 'stateId === "composer-compact-controls-inline-files-narrow"');
    assert.include(source, "function compactControlsEvidenceReady(state)");
    assert.include(source, "function compactControlsContainment(state)");
    assert.include(
      source,
      '["workspace-menu", "compact-controls", "right-panel-add-menu"].includes(overlay)',
    );
    assert.include(source, '[data-floating-anchor="composer-compact-controls-menu"]');
    assert.include(source, '".composer-compact-controls-trigger"');
    assert.include(source, "finalCompactControlsReady");
    assert.include(source, "compactControls:");
    assert.include(workbench, ': root?.querySelector(".composer-compact-controls-menu") !== null');
    assert.include(
      workbench,
      "doc.querySelector('[data-floating-popup=\"composer-compact-controls-menu\"]') !== null",
    );
    assert.include(workbench, "composer-compact-controls-menu__scroll");
    assert.include(workbench, "composer-compact-controls-dismiss");
  });

  it("captures the right-panel add menu after opening an inline Files surface", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, '"right-panel-add-menu": "right-panel-add-menu"');
    assert.include(source, '"right-panel-add-menu": "existing-thread"');
    assert.include(source, '"right-panel-add-menu",');
    assert.include(source, "function rightPanelAddMenuReady(state)");
    assert.include(
      source,
      '["workspace-menu", "compact-controls", "right-panel-add-menu"].includes(overlay)',
    );
    assert.include(source, '[data-floating-anchor="right-panel-add-menu"]');
    assert.include(source, '".right-panel__add-btn"');
    assert.include(workbench, ': root?.querySelector(".right-panel__add-menu") !== null');
    assert.include(workbench, '[data-floating-popup="right-panel-add-menu"]');
    assert.include(workbench, "data-right-panel-add-kind");
  });

  it("opens the Files browser through shipping right-panel actions", () => {
    assert.include(source, 'stateId === "settled-banner-inline-files-narrow"');
    assert.include(source, '"settled-banner-inline-files-narrow",');
    assert.include(source, '"settled-banner-inline-files-narrow": "existing-thread"');
    assert.include(source, "function filesBrowserReady(state)");
    assert.include(source, "function filesBrowserSemanticReady(state)");
    assert.include(source, "'[data-right-panel-open=\"true\"], [data-preview-panel-mode]'");
    assert.include(source, "'[data-right-panel-action=\"files\"]'");
    assert.include(source, "'[aria-label=\"Toggle right panel\"]'");
    assert.include(source, "filesBrowserInteractionTimeline");
    assert.include(source, "rectDeltaWithin(web.toolbar, lynx.toolbar, 1)");
    assert.include(source, 'webTypography?.fontSize === "12px"');
    assert.include(source, 'row.box?.style?.[key] === "5px"');
    assert.include(source, "filesBrowserReadyPolls >= 3");
    assert.include(source, "finalFilesBrowserReady = filesBrowserReady(state)");
    assert.include(source, "finalFilesBrowserReady");
    assert.include(
      source,
      "const shouldClearWebNotification = Boolean(overlay) || isFilesSurfaceState",
    );
    assert.include(source, "shouldClearWebNotification &&");
    assert.include(source, "webProviderNotificationAbsentPolls >= 30");
    assert.include(source, "isFilesSurfaceState &&");
    assert.include(source, "webProviderNotificationCleared &&");
    assert.include(source, "threadReadyForReview(state, expectThread)");
  });

  it("opens one real file and verifies the detail surface and return paths", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, 'const isFileEditorState = stateId === "file-editor-detail"');
    assert.include(source, 'const filePath = argValue("--file-path", "docs/PORT_WORKFLOW.md")');
    assert.include(source, '"file-editor-detail",');
    assert.include(source, '"file-editor-detail": "existing-thread"');
    assert.include(source, "function fileEditorReady(state)");
    assert.include(source, "function fileEditorSemanticReady(state)");
    assert.include(source, "const fileEditorStateReady = fileEditorReady(state)");
    assert.include(source, "web.editorValueLength > 0");
    assert.include(source, "lynx.editorValueLength > 0");
    assert.include(source, "web.back === null");
    assert.include(source, "lynx.back?.rect?.width === 28");
    assert.include(source, "lynx.back?.rect?.height === 28");
    assert.include(source, "webFileEditorInputSent");
    assert.include(source, "lynxFileEditorInputSent");
    assert.include(source, "webFileEditorDomFallbackUsed");
    assert.include(source, "cdp-pointer-failed|shadow-dom-click-fallback");
    assert.include(source, "finalFileEditorReady = fileEditorReady(state)");
    assert.include(source, "fileEditorSwitched");
    assert.include(source, "fileEditorReturnedToBrowser");
    assert.include(source, "web-explorer-pointer|lynx-explorer-pointer");
    assert.include(source, "lynx-back-pointer");
    assert.include(source, 'returned?.kind === "files"');
    assert.include(source, "returned.browserPresent");
    assert.include(source, "!returned.filePresent");
    assert.include(source, "fileEditorMetrics: state?.web?.fileEditorMetrics ?? null");
    assert.include(source, "fileEditorMetrics: state?.lynx?.fileEditorMetrics ?? null");
    assert.include(workbench, "function readFileEditorMetrics");
    assert.include(workbench, "fileEditorMetrics: readFileEditorMetrics(root)");
    assert.include(workbench, "fileEditorMetrics: readFileEditorMetrics(doc)");
    assert.include(workbench, 'root?.querySelector(".file-panel")');
    assert.include(workbench, 'root?.querySelector("[data-file-breadcrumbs]")');
    assert.include(workbench, 'root?.querySelector(".file-preview-virtualizer")');
    assert.include(workbench, 'lynxSurface?.querySelector(".file-panel__explorer")');
    assert.include(workbench, 'lynxSurface?.querySelector(".file-editor-preview")');
    assert.include(workbench, 'style.display === "none"');
    assert.include(workbench, "rect.width <= 0");
    assert.include(workbench, "editorValueLength:");
  });

  it("rejects wrapped or overflowing Sidebar Working metadata", () => {
    assert.include(source, "function sidebarWorkingGeometryMatches(state, expectedThreadFixture)");
    assert.include(source, "Math.abs(card.height - 78) <= 2");
    assert.include(source, "duration.x + duration.width <= content.x + content.width + 1");
    assert.include(source, "Math.abs(cardRight - (content.x + content.width) - 10) <= 2");
    assert.include(source, "finalSidebarWorkingGeometryReady");
    assert.include(source, "sidebarWorkingGeometry:");
  });

  it("uses the administrative desktop grant for comparable Connections panes", () => {
    assert.include(source, "function webCredentialForState");
    assert.include(source, 'targetStateId === "settings-connections"');
    assert.include(source, "desktopBootstrapToken: bootstrapToken");
    assert.include(source, "startupToken,");
    assert.notInclude(source, "hideAuthorizedClients");
  });

  it("reaps its exact browser process and removes the isolated profile", () => {
    assert.notInclude(source, "agent-browser");
    assert.include(source, "async function stopOwnedChild(child");
    assert.include(source, 'browserCdp.send("Browser.close")');
    assert.include(source, "await stopOwnedChild(chrome)");
    assert.include(source, 'process.once("SIGINT", onSigint)');
    assert.include(source, 'process.once("SIGTERM", onSigterm)');
    assert.include(source, "await rm(userDataDir, { recursive: true, force: true })");
  });

  it("requires and measures the same settings sections on both renderers", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(workbench, '".settings-page-scroll-fade > div"');
    assert.include(workbench, '".settings-content--source-control > .source-control-panel"');
    assert.include(workbench, ":scope > .source-control-section");
    assert.include(workbench, ":scope > .settings-section");
    assert.include(
      workbench,
      'sourceControlRows: [...doc.querySelectorAll(".source-control-item")]',
    );
    assert.notInclude(source, "(state?.web?.settingsMetrics?.sectionTitles?.length ?? 0) === 0");
    assert.include(workbench, 'element.getAttribute("lynx-computed-display")');
    assert.include(workbench, 'style.getPropertyValue("--flex-direction")');
    assert.include(workbench, ".transcript-user-bubble .inline-markdown-text");
    assert.include(workbench, ".transcript-user-bubble .inline-markdown-code");
    assert.include(workbench, ".transcript-assistant-row .inline-markdown-text");
    assert.include(workbench, "panelRect: readElementBox(rightPanel)");
    assert.include(workbench, "emptyRect: readElementBox(emptySurface)");
    assert.include(workbench, "rect: readElementBox(item)");
    assert.include(workbench, "element.getAttributeNames()");
    assert.include(workbench, "overflow: style.overflow");
    assert.include(workbench, "panelAncestors: readElementAncestors");
    assert.include(workbench, "readElementAncestors(settingsPanel)");
    assert.include(workbench, "function readModelPickerRows");
    assert.include(workbench, "modelPickerRows:");
    assert.include(workbench, 'row.getAttribute("data-model-picker-key")');
    assert.include(workbench, "textLeaves:");
    assert.include(workbench, "icons:");
    assert.include(workbench, 'root?.querySelectorAll(".settings-row")');
    assert.include(workbench, "children: [...item.children].map");
    assert.include(workbench, 'root?.querySelectorAll(".source-control-item")');
    assert.include(source, '"settings-archive": "/settings/archived"');
    assert.include(workbench, 'root?.querySelector(".settings-content")');
    assert.include(workbench, 'root?.querySelector(".settings-panel")');
    assert.include(workbench, ":scope > .settings-section");
    assert.include(workbench, "sectionTexts:");
    assert.include(source, "settingsMetrics?.sectionTexts");
    assert.include(workbench, "function readSettingsNavigationChrome");
    assert.include(workbench, "function readSettingsNavigationItems");
    assert.include(workbench, "visuallySelected:");
    assert.include(workbench, "settingsFooter: readSettingsNavigationChrome");
    assert.include(workbench, "settingsBack: readSettingsNavigationChrome");
    assert.include(workbench, 'navigation: readElementBox(root?.querySelector(".settings-nav"))');
    assert.include(workbench, 'navigation: readElementBox(doc.querySelector(".settings-nav"))');
    assert.include(source, "function archiveSettingsGeometryMatches");
    assert.include(source, 'stateId !== "settings-archive"');
    assert.include(source, 'lynxEmptyRow?.title === "No archived threads"');
    assert.include(source, "lynxText.width > 0");
    assert.include(source, "function connectionsSettingsContentMatches");
    assert.include(source, "function connectionsSettingsGeometryMatches");
    assert.include(source, 'stateId !== "settings-connections"');
    assert.include(source, 'webMetrics?.rowIds?.includes("remote-environments")');
    assert.include(source, 'lynxMetrics?.rowIds?.includes("remote-environments")');
    assert.include(source, "rect.y >= previous.y + previous.height");
    assert.include(source, "function betaSettingsGeometryMatches");
    assert.include(source, "function settingsNavigationStateMatches(state)");
    assert.include(source, "visuallySelectedItems.length === 1");
    assert.include(source, "finalSettingsNavigationReady");
    assert.include(source, '"model-picker-empty": "model-picker"');
    assert.include(source, '"model-picker-selected": "model-picker"');
    assert.include(source, '"model-picker-empty": "__t3_no_models__"');
    assert.include(source, '"quick-switch-default": "quick-switch"');
    assert.include(source, '"quick-switch-query": "quick-switch"');
    assert.include(source, '"quick-switch-query": "settings"');
    assert.include(source, '"quick-switch-query-light": "quick-switch"');
    assert.include(source, '"quick-switch-query-light": "settings"');
    assert.include(source, '"quick-switch-query-light": "existing-thread"');
    assert.include(source, '"quick-switch-default",');
    assert.include(source, '"quick-switch-query",');
    assert.include(source, '"quick-switch-query-light",');
    assert.include(source, '"quick-switch-actions-only",');
    assert.include(source, '"quick-switch-empty",');
    assert.include(source, '"quick-switch-actions-only": "quick-switch"');
    assert.include(source, '"quick-switch-empty": "quick-switch"');
    assert.include(source, '"quick-switch-actions-only": ">"');
    assert.include(source, '"quick-switch-empty": "zzzz-no-result"');
    assert.include(source, 'stateId !== "model-picker-empty"');
    assert.include(source, "webMetrics.emptyText === lynxMetrics?.emptyText");
    assert.include(source, "const notificationDismissed = await evaluate(");
    assert.notInclude(source, "overlay.length > 0 ||");
    assert.include(source, "Overlay ${overlay} closed before screenshot capture:");
    assert.include(source, 'stateId !== "settings-beta"');
    assert.include(source, '"Auto-settle inactive threads"');
    assert.include(source, '"Days of inactivity before auto-settle"');
    assert.include(source, "function generalSettingsContentMatches");
    assert.include(source, "function generalSettingsGeometryMatches");
    assert.include(source, 'stateId !== "settings-general"');
    assert.include(source, "webSections.length !== 2");
    assert.include(source, "Math.abs(rect.width - 896) <= 1");
    assert.include(source, "text.width > 0");
    assert.include(source, "generalSettingsContentMatches(");
    assert.include(source, "generalSettingsGeometryMatches(");
    assert.include(source, "sourceControlErrorSettingsGeometryMatches");
    assert.include(source, "sourceControlLoadingSettingsGeometryMatches");
    assert.include(source, "T3_TEST_SOURCE_CONTROL_DISCOVERY_PENDING");
    assert.include(workbench, "sourceControlEmptyTitles:");
    assert.include(workbench, "data-source-control-loading-row");
    assert.include(workbench, "doc.querySelectorAll('[data-slot=\"skeleton\"]')");
    assert.include(workbench, 'root?.querySelector(".source-control-empty")');
    assert.include(workbench, "settingsPanel?.querySelector('[data-slot=\"empty\"]')");
  });

  it("retains symmetric Quick Switch anatomy for geometry comparison", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, ': overlay === "quick-switch" || overlay === "file-picker"');
    assert.include(workbench, "panel: readElementBox(overlayElement)");
    assert.include(workbench, '[data-command-palette="true"] [data-slot="command-footer"]');
    assert.include(workbench, "footerGroups: [");
    assert.include(workbench, '[data-slot="command-footer"] [data-slot="kbd-group"]');
    assert.include(workbench, ".palette-footer .quick-switch-footer-group");
    assert.include(workbench, "function findCommandSearchSurface");
    assert.include(
      workbench,
      "findCommandSearchSurface(overlayElement, commandInput, commandResults)",
    );
    assert.include(source, "function quickSwitchAnatomyMatches");
    assert.include(source, '["panel", "search", "results", "footer", "empty"]');
    assert.include(
      source,
      "quickSwitchAnatomyMatches(state?.web?.overlayMetrics, state?.lynx?.overlayMetrics)",
    );
  });

  it("drives the new Workspace menu overlay through real renderer triggers", () => {
    assert.include(source, '"workspace-menu-open": "workspace-menu"');
    assert.include(source, '"workspace-menu-open": "existing-thread"');
    assert.include(source, '"workspace-menu-open",');
    assert.include(source, 'overlay === "workspace-menu"');
    assert.include(source, '[data-floating-anchor="composer-workspace-menu"]');
    assert.include(source, "openWorkspaceMenuForHarness");
    assert.include(source, '"lynx-workbench-probe:workspace-menu"');
  });

  it("measures Lynx recycled-row geometry at the direct list-item wrapper", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, 'item.closest(".timeline-row-root") ?? item');
    assert.include(workbench, "const rect = geometryOwner.getBoundingClientRect()");
    assert.include(workbench, 'kind === "working"');
    assert.include(workbench, 'item.querySelector(".transcript-working-row")');
    assert.include(source, "function workingTranscriptGeometryMatches");
    assert.include(source, 'stateId !== "existing-thread-working"');
    assert.include(source, '["x", "y", "width", "height"]');
  });

  it("projects approval detail and actions into the shared Composer semantic contract", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, 'pendingRequestMetrics?.kind === "approval"');
    assert.include(workbench, 'editorValue: pendingRequestMetrics.detail ?? ""');
    assert.include(workbench, 'primaryState: "stop"');
  });

  it("gates working and connecting presentation on the seeded session projection", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(source, '"composer-connecting"');
    assert.include(source, "function sessionProjectionMatches");
    assert.include(source, "seed?.dataset?.startingThread");
    assert.include(source, 'expectedThreadFixture?.sessionStatus !== "starting"');
    assert.include(source, "expectedThreadFixture,");
    assert.include(
      source,
      'stateId === "composer-working" || stateId === "existing-thread-working"',
    );
    assert.include(source, 'expectedStatus === "Working"');
    assert.include(source, "webThread?.status === expectedStatus");
    assert.include(source, "lynxThread?.status === expectedStatus");
    assert.include(source, "finalSessionProjectionReady");
    assert.include(source, "sessionProjection: {");
    assert.include(workbench, "querySelector('[role=\"status\"]')");
  });

  it("rejects mismatched sidebar stage identity before comparing pixels", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    const sidebarStageBackdrop = readFileSync(
      path.join(import.meta.dirname, "../../web/src/components/SidebarStageBackdrop.tsx"),
      "utf8",
    );
    assert.include(workbench, "function readSidebarStageIdentity");
    assert.include(workbench, '"[data-stage-backdrop-variant]"');
    assert.include(workbench, "backdropVisible:");
    assert.include(workbench, "brandOnBackdrop:");
    assert.include(workbench, 'const environmentIdentificationMode = "none"');
    assert.include(workbench, "environmentIdentificationMode:");
    assert.include(workbench, "lynxQuery.set");
    assert.include(sidebarStageBackdrop, "data-stage-backdrop-variant={variant}");
    assert.include(source, "function sidebarStageIdentityMatches");
    assert.include(source, "stageIdentityReady");
    assert.include(source, "finalStageIdentityReady");
    assert.include(source, "sidebarStageIdentity: {");
    assert.include(source, "headerMetrics: state?.web?.headerMetrics ?? null");
    assert.include(source, "headerMetrics: state?.lynx?.headerMetrics ?? null");
  });

  it("compares Composer toolbar allocation instead of renderer-specific raw box sizing", () => {
    assert.include(source, "function composerToolbarAllocationMatches");
    assert.include(source, "webMetrics?.anatomy?.toolbarAllocation");
    assert.include(source, "lynxMetrics?.anatomy?.toolbarAllocation");
    assert.include(source, "rectDeltaWithin(webAllocation, lynxAllocation, 1)");
    assert.include(source, "composerToolbarAllocationMatches(webMetrics, lynxMetrics)");
    assert.include(source, "composerToolbarAllocationMatches(webComposer, lynxComposer)");
  });

  it("records Header action presentation instead of comparing outer boxes alone", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, "function readHeaderActionItems");
    assert.include(workbench, "ariaLabel: item.getAttribute");
    assert.include(workbench, "gitQuickActionKind: item.getAttribute");
    assert.include(workbench, "gitQuickActionLabel: item.getAttribute");
    assert.include(workbench, "text: readComposedText(item)");
    assert.include(workbench, "children: [...item.children].map");
    assert.include(workbench, "textLeaves:");
    assert.include(workbench, "icons:");
    assert.include(workbench, "actionItems: readHeaderActionItems(");
    assert.include(workbench, "settingsAuthority: readElementBox");
    assert.include(
      workbench,
      'projectTitle: readElementBox(item.querySelector(".sidebar-v2-row-project-title"))',
    );
    assert.include(workbench, 'title: readElementBox(item.querySelector(".sidebar-v2-row-title"))');
    assert.include(source, "function headerGitActionMatches");
    assert.include(source, 'method === "readVcsStatus"');
    assert.include(source, "headerGitActionReady");
    assert.include(source, "finalHeaderGitActionReady");
    assert.include(source, "headerGitAction: {");
  });

  it("opens and dismisses the Publish dialog through real pointer input", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, "function readGitPublishDialog");
    assert.include(
      workbench,
      "\"[data-slot='dialog-popup'][data-git-publish-dialog='true'], .git-publish-dialog\"",
    );
    assert.include(workbench, '"[data-git-publish-step-label]"');
    assert.include(workbench, '"[data-git-publish-provider]"');
    assert.include(source, 'const isGitPublishDialogState = stateId === "git-publish-dialog"');
    assert.include(source, "function gitPublishDialogMatches");
    assert.include(source, "webGitPublishInputSent");
    assert.include(source, "lynxGitPublishInputSent");
    assert.include(source, "let webGitPublishOpenAttempts = 0");
    assert.include(source, "let lynxGitPublishOpenAttempts = 0");
    assert.include(source, "connectorDiagnostics?.commandResults?.some");
    assert.include(source, '({ method }) => method === "readVcsStatus"');
    assert.include(source, '({ method }) => method === "discoverSourceControl"');
    assert.include(source, "const gitPublishDiscoveryReady =");
    assert.include(source, "gitPublishDiscoveryReady &&");
    assert.include(source, "webGitPublishOpenAttempts < 2");
    assert.include(source, "lynxGitPublishOpenAttempts < 2");
    assert.include(source, "async function dispatchOverlayOpeningPointerClick");
    assert.include(
      source,
      "await dispatchOverlayOpeningPointerClick(cdp, sessionId, publishPoints.web)",
    );
    assert.include(
      source,
      "await dispatchOverlayOpeningPointerClick(cdp, sessionId, publishPoints.lynx)",
    );
    assert.include(source, "await dispatchPointerClick(cdp, sessionId, dismissPoints.web)");
    assert.include(source, "await dispatchPointerClick(cdp, sessionId, dismissPoints.lynx)");
    assert.include(source, "gitPublishDismissed = true");
    assert.include(source, "finalGitPublishDialogReady");
    assert.include(source, "frameWindow.requestAnimationFrame(() => {");
    assert.include(
      source,
      "Git Publish panes did not commit two compositor frames before capture.",
    );
    assert.include(source, "Git Publish dialog changed before the compositor gate");
    assert.include(source, "const gitPublishDialogEvidence = finalGitPublishDialogReady");
    assert.include(source, "web: gitPublishDialogEvidence?.web ?? null");
    assert.include(source, "lynx: gitPublishDialogEvidence?.lynx ?? null");
    assert.include(source, "gitPublishDialog: {");
  });

  it("captures the Add Action dialog through both real header triggers", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(source, '"project-action-dialog": "project-action-dialog"');
    assert.include(source, '"project-action-dialog": "existing-thread"');
    assert.include(source, '"project-action-dialog",');
    assert.include(source, 'overlay === "project-action-dialog"');
    assert.include(source, '[aria-label=\"Add action\"]');
    assert.include(source, "function projectActionDialogReady(state)");
    assert.include(source, "finalProjectActionDialogReady");
    assert.include(workbench, "function readProjectActionDialog(root)");
    assert.include(workbench, "\"[data-slot='dialog-popup']\"");
    assert.include(workbench, 'root?.querySelector(".project-action-dialog")');
    assert.include(workbench, 'field("script-keybinding", 1');
    assert.include(workbench, "projectActionDialog?.fieldLabels.length");
  });

  it("hashes the Web entry bundle declared by index.html", () => {
    assert.include(source, "async function webEntryBundlePath");
    assert.include(source, "type=[\"']module[\"']");
    assert.include(source, "await hashFile(await webEntryBundlePath())");
    assert.notInclude(source, "findFirst(WEB_DIST, /assets\\/.*\\.js$/)");
  });

  it("routes Appearance captures through the Settings bootstrap scenario", () => {
    assert.include(source, '"settings-appearance": "settings-general"');
    assert.include(source, "function appearanceSettingsContentMatches");
    assert.include(source, 'lynxRow.status === "Not yet available in Lynxtron."');
    assert.include(source, 'lynxRow.box?.style?.opacity === "0.48"');
    const scenarios = readFileSync(
      path.join(import.meta.dirname, "../src/browser-preview/fallbackScenarios.ts"),
      "utf8",
    );
    assert.include(scenarios, 'stageLabel: "Alpha"');
    assert.include(scenarios, 'displayName: "T3 Code (Alpha)"');
  });

  it("routes Keybindings discovery through the Settings bootstrap scenario", () => {
    assert.include(source, '"settings-keybindings": "settings-general"');
    assert.include(source, "function keybindingsSettingsContentMatches");
    assert.include(source, "function keybindingsSettingsGeometryMatches");
    assert.include(source, "JSON.stringify(canonical(webRows))");
    assert.include(source, "!rectDeltaWithin(webHeader, lynxHeader, 2)");
    assert.include(source, "const sharedColumnGeometry");
    assert.include(source, "if (columnIndex !== 3) return true");
  });

  it("reopens thread-scoped model picker states after selecting the seeded thread", () => {
    assert.include(source, '"model-picker-selected",');
    assert.include(source, 'overlay === "model-picker"');
    assert.include(source, '[data-composer-control="model"]');
    assert.include(source, "let lynxOverlayInputSent = overlay.length === 0");
    assert.include(source, "function modelPickerSemanticsMatch");
    assert.include(source, 'stateId !== "model-picker-selected"');
    assert.include(source, "webMetrics?.selectedRowKeys?.length === 1");
    assert.include(source, "lynxMetrics?.selectedRowKeys?.length === 1");
    assert.notInclude(source, "webOverlaySemanticKeys");
    assert.notInclude(source, "lynxOverlaySemanticKeys");
  });

  it("prepares the selected model through the isolated thread projection", () => {
    assert.include(source, "async function prepareStateFixture");
    assert.include(source, 'stateId !== "model-picker-selected"');
    assert.include(source, '"apps/server/scripts/t3-sqlite-state.ts"');
    assert.include(source, "UPDATE projection_threads");
    assert.include(source, "model_selection_json = json_object");
    assert.include(source, '"claudeAgent"');
    assert.include(source, '"claude-fable-5"');
    assert.include(source, "} finally {");
    assert.include(source, "await rm(mutationReport.backup, { force: true })");
    assert.include(source, "sourceSeedHash: seed?.snapshotSha256 ?? null");
    assert.include(source, "fixturePreparation.preparedSha256");
  });

  it("compares clipped pending-question work rows by their visible outer box", () => {
    const capture = readFileSync(
      path.join(import.meta.dirname, "capture-shared-workbench.mjs"),
      "utf8",
    );
    assert.include(capture, "compareClippedOuterHeight");
    assert.include(capture, "timeline-row-root--user-input");
  });

  it("keeps Review checkpoint and tree as distinct interaction states", () => {
    assert.include(source, "explicitChangedFilesTargetState ||");
    assert.include(source, '["expanded", "preview", "collapsed"]');
    assert.include(source, 'state === "preview"');
    assert.include(source, "webChangedFilesClickCount < 3");
    assert.include(source, "lynxChangedFilesClickCount < 3");
    assert.include(source, "webChangedFilesClickCount += 1");
    assert.include(source, "lynxChangedFilesClickCount += 1");
    assert.include(source, 'reviewExpectation === "checkpoint"');
    assert.include(source, '? "preview"');
    assert.include(source, 'reviewExpectation === "tree"');
    assert.include(source, '? "expanded"');
    assert.include(source, 'webReadyCards[0]?.expandedState === "preview"');
    assert.include(source, 'lynxReadyCards[0]?.expandedState === "preview"');
    assert.include(source, "webMetrics.treeCount === 0");
    assert.include(source, "lynxMetrics.treeCount === 0");
    assert.include(source, 'webReadyCards[0]?.expandedState === "expanded"');
    assert.include(source, 'lynxReadyCards[0]?.expandedState === "expanded"');
    assert.include(source, "webMetrics.treeCount === 1");
    assert.include(source, "lynxMetrics.treeCount === 1");
  });
});
