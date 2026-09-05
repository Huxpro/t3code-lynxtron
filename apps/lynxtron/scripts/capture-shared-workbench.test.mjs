import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "capture-shared-workbench.mjs"), "utf8");

describe("shared workbench lifecycle fault capture", () => {
  it("infers and gates the semantic route for the requested state", () => {
    assert.include(source, "inferSemanticRoute(stateId)");
    assert.include(source, "Cannot infer semantic route for ${stateId}");
    assert.include(
      source,
      'const semanticRoute = argValue("--semantic-route", inferredSemanticRoute)',
    );
    assert.include(source, "webState.semanticRoute === semanticRoute");
    assert.include(source, "lynxState.semanticRoute === semanticRoute");
  });

  it("infers light evidence and retains the light provider dialog", () => {
    assert.include(source, 'stateId.endsWith("-light") ? "light" : "dark"');
    assert.include(source, "webState.theme === theme");
    assert.include(source, "lynxState.theme === theme");
    assert.include(
      source,
      'stateId === "settings-providers-add-dialog-light" ? "driver" : "complete"',
    );
  });

  it("opens every modeled model-picker state by default", () => {
    for (const stateId of [
      "model-picker-default",
      "model-picker-provider-rail",
      "model-picker-query",
      "model-picker-empty",
      "model-picker-selected",
      "model-picker-interaction",
      "settings-model-picker",
    ]) {
      assert.include(source, `"${stateId}": "model-picker"`);
    }
    assert.include(source, '"model-picker-query": "pickle"');
    assert.include(source, '"model-picker-provider-rail": "opencode"');
    assert.include(
      source,
      "(!isModelPickerOverlay || (modelPickerSemanticMatch && overlayRowCountMatch))",
    );
  });

  it("retries cleanup of the owned Chrome profile", () => {
    assert.include(source, "if (userDataDir) {");
    assert.include(source, "maxRetries: 5");
    assert.include(source, "retryDelay: 100");
  });

  it("opens the modeled light compact-controls state by default", () => {
    assert.include(source, '"composer-compact-controls-light": "compact-controls"');
    assert.include(source, 'stateId === "composer-compact-controls-light" ||');
  });

  it("records right-panel add-menu icon and label leaves", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, "right-panel__add-item-icon, image, img, svg");
    assert.include(workbench, "labelBox: readElementBox");
  });

  it("records model-picker provider rail button and icon leaves", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, "box: readElementBox(button ?? item)");
    assert.include(workbench, ".model-picker-rail-icon, image, img, svg");
  });

  it("fails fast for modeled states that require Native-only verification", () => {
    assert.include(source, "const nativeOnlyStateIds = new Set([");
    assert.include(source, '"settings-archive-mutation"');
    assert.include(source, "is not implemented by the Browser paired-capture harness.");
  });

  it("gates the provider status banner anatomy and single dismiss action", () => {
    assert.include(source, "function providerStatusBannerMatches(state)");
    assert.include(source, "web.actionLabels.length === 1");
    assert.include(source, "lynx.actionLabels.length === 1");
    assert.include(source, "timelineDoesNotOverlap(web, webTimelineTop)");
    assert.include(source, "web.title?.style?.color !== web.message?.style?.color");
    assert.include(source, "finalProviderStatusBannerReady");
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, "function readProviderStatusBannerMetrics(root)");
    assert.include(workbench, 'const copy = alert.querySelector(".thread-error-copy")');
    assert.include(workbench, "copy?.children[0]");
    assert.include(workbench, "copy?.children[1]");
    assert.include(workbench, "providerStatusBannerMetrics: readProviderStatusBannerMetrics");
  });

  it("filters only expected transport errors during the injected disconnect", () => {
    assert.include(source, "isLifecycleFaultState");
    assert.include(source, "/WebSocket connection .* failed:/");
    assert.include(source, "/WebSocket is already in CLOSING or CLOSED state\\./");
    assert.include(source, "/SocketReadError: An error occurred during Read/");
  });

  it("waits for connection-scoped branch discovery before injecting the disconnect", () => {
    assert.include(source, 'method === "readProjectBranch"');
    assert.include(source, "state?.lynx?.connectorDiagnostics?.commandResults?.some(");
    assert.include(source, '({ method }) => method === "readProjectBranch"');
    assert.notInclude(source, "!state?.lynx?.connectorDiagnostics?.commands?.some(");
  });

  it("stabilizes provider presentation before capturing the disabled fault state", () => {
    assert.include(source, "const requiresStableProviderFaultPreflight = isLifecycleFaultState");
    assert.include(source, "let lifecycleFaultPreflightStablePolls");
    assert.include(source, "webModel.length > 0");
    assert.include(source, "webModel === lynxModel");
    assert.include(source, "JSON.stringify(webControls) === JSON.stringify(lynxControls)");
    assert.include(source, "lifecycleFaultPreflightStablePolls >= 3");
    assert.include(source, "if (!requiresStableProviderFaultPreflight) return null");
    assert.match(
      source,
      /if \(\s*preflightTimelineKey &&\s*preflightTimelineKey !== lifecycleFaultPreflightTimeline/,
    );
    assert.include(source, "lifecycleFaultPreflight: {");
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

  it("requires provider notification dismissal before every fidelity capture", () => {
    assert.include(source, "const shouldClearWebNotification = true;");
    assert.include(
      source,
      'throw new Error("Web provider-update notification did not dismiss before Sidebar hover.")',
    );
    assert.include(source, "if (isSidebarThreadHoverPreviewState) {");
    assert.include(source, "async function dismissWebProviderNotification");
    assert.include(source, "let clickAttempts = 0");
    assert.include(source, "let absentSince = null");
    assert.include(source, "doc.querySelectorAll('[data-slot=\"toast-popup\"]')");
    assert.include(source, "const popup = Array.from");
    assert.include(source, "doc.querySelectorAll('button[aria-label=\"Dismiss notification\"]')");
    assert.include(source, "if (!popup && !dismiss) return { present: false }");
    assert.include(source, "if (!dismiss) return { present: true, point: null }");
    assert.include(source, "clickAttempts < 3");
    assert.include(source, "nextClickAt = Date.now() + 750");
    assert.include(source, "rect.width <= 0");
    assert.include(source, "style?.pointerEvents === 'none'");
    assert.include(source, "Number(style?.opacity ?? 1) <= 0");
    assert.include(
      source,
      "await dispatchPointerClickWithMove(cdp, sessionId, notification.point)",
    );
    assert.include(source, "Date.now() - startedAt >= 1_500");
    assert.include(source, "Date.now() - absentSince >= 500");
    assert.include(source, "await dismissWebProviderNotification(cdp, sessionId)");
    assert.include(source, "if (shouldClearWebNotification && !notificationDismissed)");
    assert.include(source, "const finalNotificationDismissed =");
    assert.include(source, "if (shouldClearWebNotification && !finalNotificationDismissed)");
    assert.include(source, "Web provider-update notification appeared after initial cleanup.");
    assert.include(
      source,
      'throw new Error("Web pane did not commit notification dismissal before capture.")',
    );
  });

  it("does not relabel a running canonical thread as completed or failed", () => {
    assert.include(source, "seed?.dataset?.completedThread");
    assert.include(source, "seed?.dataset?.failedThread");
    assert.include(source, 'expectedThreadFixture?.latestTurnState !== "completed"');
    assert.include(source, 'expectedThreadFixture?.latestTurnState !== "error"');
    assert.include(source, "function completedComposerProviderStateMatches(state)");
    assert.include(source, 'stateId !== "existing-thread-completed"');
    assert.include(source, "webLabel.length > 0");
    assert.include(source, "webComposer?.state === lynxComposer?.state");
    assert.include(source, "completedComposerProviderStateMatches(state)");
    assert.include(source, "function readCompletedComposerProviderState(state)");
    assert.include(
      source,
      "completedComposerProviderState: readCompletedComposerProviderState(state)",
    );
    assert.include(source, "function failedTranscriptGeometryMatches(webMetrics, lynxMetrics)");
    assert.include(source, 'stateId !== "existing-thread-failed"');
    assert.include(source, '["x", "y", "width"].every(');
    assert.include(
      source,
      "failedTranscriptGeometryMatches(state?.web?.timelineMetrics, state?.lynx?.timelineMetrics)",
    );
    assert.include(source, "failedTranscriptGeometry: {");
  });

  it("accepts an explicit immutable seed source for cross-client fixtures", () => {
    assert.include(source, 'const explicitSeedSource = argValue("--seed-source", "")');
    assert.include(source, "explicitSeedSource ||");
    assert.include(source, "process.env.T3_PLAN11C_SEED_SOURCE");
    assert.include(source, "const expectedNewThreadModelSelection =");
    assert.include(source, "defaultModelSelection ?? null");
    assert.include(source, "expectThread,\n        expectedNewThreadModelSelection,");
    assert.include(source, "expectThread,\n  expectedNewThreadModelSelection,");
    assert.include(source, "modelSelection: JSON.stringify(expectedNewThreadModelSelection)");
  });

  it("gates the renderer-neutral unpersisted Hero state and its geometry", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, "function unpersistedHeroStateReady(state)");
    assert.include(source, 'kind === "draft" || kind === "none"');
    assert.include(source, "web.productState?.selectedThread === null");
    assert.include(source, "lynx.productState?.selectedThread === null");
    assert.include(source, "function heroGeometryMatches(state)");
    assert.include(
      source,
      "if (!webHeroPresent && !lynxHeroPresent && selectedPersistedThread) return true",
    );
    assert.include(source, "if (webHeroPresent !== lynxHeroPresent) return false");
    assert.include(source, "finalHeroGeometryReady");
    assert.include(source, "unpersistedHeroStateReady(state)");
    assert.include(source, "heroGeometry:");
    assert.include(workbench, "function readHeroMetrics(root)");
    assert.include(workbench, "heroMetrics: readHeroMetrics(root)");
    assert.include(workbench, "heroMetrics: readHeroMetrics(doc)");
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

  it("uses a real pointer-focus fallback before typing into a sendable Web composer", () => {
    assert.include(source, "let webComposerEditorFocused = await focusRemoteElement(");
    assert.include(source, "const webComposerEditorPoint = await evaluate(");
    assert.include(
      source,
      'await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);',
    );
    assert.include(
      source,
      "await dispatchPointerClickWithMove(cdp, sessionId, webComposerEditorPoint);",
    );
    assert.include(source, "web-cdp-focus-emulation+pointer-raw-key");
    assert.include(source, "const sequence = cdpKeySequenceForCharacter(character);");
    assert.include(source, "web?.composerMetrics?.editor?.value");
    assert.include(
      source,
      "if (!prefixApplied) {\n            composerInputDiagnostics.webFailedPrefix = expectedPrefix;",
    );
    assert.include(source, "let composerInputDiagnostics = null;");
    assert.include(source, "composerInputDiagnostics.webPointerPoint");
    assert.include(source, "composerInputDiagnostics.webFailedPrefix");
    assert.include(source, "composerMetrics?.editor?.disabled !== true");
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
    assert.include(source, '"composer-compact-controls-inline-files-short": "compact-controls"');
    assert.include(source, 'stateId === "composer-compact-controls-inline-files-narrow"');
    assert.include(source, 'stateId === "composer-compact-controls-inline-files-short"');
    assert.include(source, "function compactControlsEvidenceReady(state)");
    assert.include(source, "function compactControlsContainment(state)");
    assert.include(source, '"workspace-menu",');
    assert.include(source, '"compact-controls",');
    assert.include(source, '"right-panel-add-menu",');
    assert.include(source, '"diff-scope-menu",');
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
    assert.include(workbench, "lastRow:");
    assert.include(source, "lastRowBottom <= scrollBottom + 1");
    assert.include(source, "lastRowBottom > scrollBottom + 1");
    assert.include(source, "context.x >= composer.x");
    assert.include(source, "contextRight <= composerRight");
    assert.include(source, "overlay.x >= composer.x");
    assert.include(source, "overlayRight <= composerRight");
    assert.include(source, "overlayRight <= panel.x");
    assert.include(source, "containment.web?.contained === true");
    assert.include(source, "containment.lynx?.contained === true");
    assert.include(source, 'type: "mouseWheel"');
    assert.include(source, "shortCompactControlsScrolled");
    assert.include(source, "shortCompactControlsDismissed");
    assert.include(source, "shortCompactControlsScrollDiagnostics");
    assert.include(source, "dataScrollOffset: scroll.getAttribute('data-scroll-offset')");
    assert.include(source, "web-wheel|lynx-wheel|outside-pointer");
    assert.include(source, '=== "Full access"');
  });

  it("gates completed checkpoint typography at the text leaves", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, "function checkpointCardTypographyMatches(webState, lynxState)");
    assert.include(source, 'fontMatches(webCard.statusText, lynxCard.statusText, "12px", "16px")');
    assert.include(source, 'fontMatches(webCard.hintText, lynxCard.hintText, "11px", "16px")');
    assert.include(source, 'fontMatches(webCard.openLabel, lynxCard.openLabel, "12px", "16px")');
    assert.include(source, "checkpointCardTypographyReady:");
    assert.include(
      workbench,
      'statusText: readElementBox(item.querySelector(".turn-diff-card__status"))',
    );
    assert.include(
      workbench,
      'hintText: readElementBox(item.querySelector(".turn-diff-card__hint"))',
    );
    assert.include(
      workbench,
      'openLabel: readElementBox(item.querySelector(".turn-diff-card__open-label"))',
    );
    assert.include(workbench, 'item.querySelectorAll(".file-tree-row__name")');
    assert.include(workbench, 'item.querySelectorAll(".file-tree-row__stat")');
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
    assert.include(source, "rect?.rect?.width > 0");
    assert.include(source, '"workspace-menu",');
    assert.include(source, '"compact-controls",');
    assert.include(source, '"right-panel-add-menu",');
    assert.include(source, '"diff-scope-menu",');
    assert.include(source, '[data-floating-anchor="right-panel-add-menu"]');
    assert.include(source, '".right-panel__add-btn"');
    assert.include(workbench, ': root?.querySelector(".right-panel__add-menu") !== null');
    assert.include(workbench, '[data-floating-popup="right-panel-add-menu"]');
    assert.include(workbench, "data-right-panel-add-kind");
    assert.include(source, "rightPanelAddMenuDismissed");
    assert.include(source, "rightPanelAddMenuTerminalSelected");
    assert.include(source, "const isRightPanelTerminalState =");
    assert.include(source, 'stateId === "right-panel-terminal-multi-session"');
    assert.include(source, '"right-panel-terminal-multi-session": "existing-thread"');
    assert.include(source, 'stateId === "right-panel-terminal-horizontal-split"');
    assert.include(source, '"right-panel-terminal-horizontal-split": "existing-thread"');
    assert.include(source, 'stateId === "right-panel-terminal-vertical-split"');
    assert.include(source, '"right-panel-terminal-vertical-split": "existing-thread"');
    assert.include(source, "explicitExpectedThreadId || threadStateIds.has(stateId)");
    assert.include(source, '"file-picker-default",');
    assert.include(source, '"file-picker-default": "file-picker"');
    assert.include(source, 'aria-label="New terminal"');
    assert.include(source, 'aria-label="Split terminal horizontally"');
    assert.include(source, "lynxPaneWidths");
    assert.include(source, "lynxPaneHeights");
    assert.include(source, 'const terminalOnlyImages = hasFlag("--terminal-only-images")');
    assert.include(source, 'const paneImagesOnly = hasFlag("--pane-images-only")');
    assert.include(source, "data-terminal-session-count");
    assert.include(source, "LYNX_TERM_2_MARKER");
    assert.include(source, "LYNX_TERM_1_MARKER");
    assert.include(source, "(isRightPanelAddMenuState || isRightPanelTerminalState)");
    assert.include(source, "isRightPanelTerminalState && rightPanelAddMenuTerminalSelected");
    assert.include(source, "shadow ? '.topbar__toggle--terminal'");
    assert.include(source, '[data-right-panel-action=\"terminal\"]');
    assert.include(source, "method === 'openTerminal'");
    assert.include(source, 'prefix: "terminal"');
    assert.include(source, "terminalScreenshot: rightPanelTerminalScreenshot");
    assert.include(source, 'text: "pwd"');
    assert.include(source, "method === 'writeTerminal'");
    assert.include(source, 'closed: "not-claimed"');
    assert.include(source, "terminalCommand: rightPanelTerminalCommand");
    assert.include(source, 'if (stateId === "right-panel-terminal") {');
    assert.include(source, "Terminal paired capture panel widths diverged");
    assert.include(source, "geometry: terminalCaptureGeometry");
    assert.isBelow(
      source.indexOf('if (stateId === "right-panel-terminal") {'),
      source.indexOf("const beforeResize = await evaluate("),
    );
    assert.include(source, "rightPanelTerminalCommand === null");
    assert.include(source, 'path.join(baseDir, "userdata", "logs", "terminals")');
    assert.include(source, "invokeResizeForHarness?.('right-panel', 740, 640)");
    assert.include(source, "afterGrid.cols > beforeGrid.cols");
    assert.include(source, "afterGrid.rows === beforeGrid.rows");
    assert.include(source, "web-outside-pointer|lynx-dismiss-layer-pointer");
    assert.include(source, "web-terminal-row-pointer|lynx-terminal-row-pointer");
    assert.include(source, "lynx?.querySelector('.terminal-panel') !== null");
  });

  it("captures the Sidebar project-settings scope through both renderer event paths", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, 'stateId === "sidebar-project-settings"');
    assert.include(source, '"sidebar-project-settings": "existing-thread"');
    assert.include(source, 'argValue("--project-settings-expect", "parity")');
    assert.include(source, '["missing", "parity"].includes(projectSettingsExpectation)');
    assert.include(source, "function projectSettingsReady(state, interaction)");
    assert.include(source, 'state?.web?.productState?.overlay === "project-settings-dialog"');
    assert.include(source, 'state?.lynx?.productState?.overlay === "project-scope"');
    assert.include(source, "interaction?.lynxScopeActionCount === 0");
    assert.include(source, "interaction?.webActionClicked === true");
    assert.include(source, "interaction?.lynxActionClicked === true");
    assert.include(source, "invokeMenuForHarness?.('sidebar-project-scope')");
    assert.include(source, "lynx-menu-main-thread-probe");
    assert.include(source, "projectSettingsInteraction");
    assert.include(source, "projectSettingsTimeline");
    assert.include(
      source,
      "web-scope-pointer|lynx-menu-main-thread-probe|dual-project-action-pointer",
    );
    assert.include(source, "[data-sidebar-project-scope-option]");
    assert.include(source, "[data-sidebar-project-action]");
    assert.include(source, "finalProjectSettingsReady");
    assert.include(source, "projectSettings:");
    assert.include(workbench, "function readProjectSettingsDialog(root)");
    assert.include(workbench, '=== "Project settings"');
    assert.include(workbench, '"project-settings-dialog"');
    assert.include(workbench, "projectScopeOptions:");
    assert.include(workbench, "actions:");
  });

  it("captures the Diff scope menu without requiring pre-repair row parity", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, '"diff-scope-menu": "diff-scope-menu"');
    assert.include(source, '"diff-scope-menu": "existing-thread"');
    assert.include(source, 'stateId === "diff-scope-menu"');
    assert.include(source, 'stateId.startsWith("review-") || isDiffScopeMenuState');
    assert.include(source, "const shouldClearWebNotification = true;");
    assert.isBelow(
      source.indexOf(
        'const isReviewState = stateId.startsWith("review-") || isDiffScopeMenuState;',
      ),
      source.indexOf("const shouldClearWebNotification ="),
    );
    assert.include(source, "(!shouldClearWebNotification || webProviderNotificationCleared)");
    assert.include(source, "function diffScopeMenuReady(state)");
    assert.include(source, 'triggerLabel === "Latest turn"');
    assert.include(source, "checkpointDiffPoints?.web");
    assert.include(source, "checkpointDiffPoints?.lynx");
    assert.include(source, "'[data-review-checkpoint-card] [data-review-open-diff]'");
    assert.include(source, "if (!lynxReviewDiffInputSent && checkpointDiffPoints?.lynx)");
    assert.include(source, "webRows.length > 0");
    assert.include(source, "lynxRows.length > 0");
    assert.notInclude(
      source.slice(
        source.indexOf("function diffScopeMenuReady(state)"),
        source.indexOf("function compactControlsContainment(state)"),
      ),
      "JSON.stringify(webRows) === JSON.stringify(lynxRows)",
    );
    assert.include(source, '[data-floating-anchor="diff-scope-menu"]');
    assert.include(source, "finalDiffScopeMenuReady");
    assert.include(source, "diffScopeMenuDismissed");
    assert.include(source, "diffScopeWorkingTreeSelected");
    assert.include(source, "web-outside-pointer|lynx-dismiss-layer-pointer");
    assert.include(source, "web-working-tree-row-pointer|lynx-working-tree-row-pointer");
    assert.include(source, "data-diff-scope') === 'working-tree'");
    assert.include(source, "diffScopeMenu:");
    assert.include(workbench, '".diff-panel-header__scope-menu") !== null');
    assert.include(workbench, '[data-floating-popup="diff-scope-menu"]');
    assert.include(workbench, '".diff-panel-header__scope-item"');
    assert.include(workbench, '[data-slot="menu-sub-trigger"]');
    assert.include(workbench, "triggerLabel: overlayTriggerElement?.textContent?.trim() ?? null");
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
    assert.include(source, "const expectedIconTone = (href)");
    assert.include(source, "lynxRow?.icon?.tone === authorityTone");
    assert.include(source, "iconMappingsMatch");
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(workbench, 'element.tagName?.toLowerCase() === "use"');
    assert.include(workbench, 'href: icon.getAttribute("href")');
    assert.include(source, "filesBrowserReadyPolls >= (isFileEditorState ? 1 : 3)");
    assert.include(source, "isFileEditorState\n        ? filesBrowserReadyPolls");
    assert.include(source, "finalFilesBrowserReady = filesBrowserReady(state)");
    assert.include(source, "finalFilesBrowserReady");
    assert.include(source, "const shouldClearWebNotification =");
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

    assert.include(source, 'stateId === "file-editor-detail-narrow-inline"');
    assert.include(source, 'const filePath = argValue("--file-path", "docs/PORT_WORKFLOW.md")');
    assert.include(source, '"file-editor-detail",');
    assert.include(source, '"file-editor-detail-light",');
    assert.include(source, '"file-editor-detail-narrow-inline",');
    assert.include(source, '"file-editor-detail": "existing-thread"');
    assert.include(source, '"file-editor-detail-light": "existing-thread"');
    assert.include(source, '"file-editor-detail-narrow-inline": "existing-thread"');
    assert.include(source, 'argValue("--right-panel-width", "")');
    assert.include(source, "rightPanelWidth: String(expectedRightPanelWidth)");
    assert.include(workbench, 'url.searchParams.get("rightPanelWidth")');
    assert.include(workbench, '"t3code:preview-panel-width"');
    assert.include(workbench, 'lynxQuery.set("rightPanelWidth", String(requestedRightPanelWidth))');
    assert.include(source, "function fileEditorReady(state)");
    assert.include(source, "function fileEditorSemanticReady(state)");
    assert.include(source, "const fileEditorStateReady = fileEditorReady(state)");
    assert.include(source, "web.editorValueLength > 0");
    assert.include(source, "lynx.editorValueLength > 0");
    assert.include(source, "const narrow = isNarrowFileEditorState");
    assert.include(source, 'webPanelMode === "sheet" && lynxPanelMode === "sheet"');
    assert.include(source, "const editorWidthsMatch");
    assert.include(source, "const backReady");
    assert.include(source, "const editorTypographyReady");
    assert.include(source, 'fontFamily?.includes("SF Mono")');
    assert.include(source, 'style.fontSize === "13px"');
    assert.include(source, 'style.lineHeight === "20px"');
    assert.include(source, "metrics.gutterWidth >= 48");
    assert.include(source, "metrics.gutterWidth <= 50");
    assert.include(source, "web.editor?.rect?.width >= 319");
    assert.include(source, "lynx.editor?.rect?.width >= 320");
    assert.include(source, "web.explorer === null");
    assert.include(source, "lynx.explorer === null");
    assert.include(source, "web?.back?.rect?.width === 28");
    assert.include(source, "lynx?.back?.rect?.width === 28");
    assert.include(source, "Math.abs(web.editor.rect.width - webPanel.rect.width) <= 1");
    assert.include(source, "Math.abs(lynx.editor.rect.width - lynxPanel.rect.width) <= 2");
    assert.include(source, "webFileEditorInputSent");
    assert.include(source, "lynxFileEditorInputSent");
    assert.include(source, "webFileEditorDomFallbackUsed");
    assert.include(source, "cdp-pointer-failed|shadow-dom-click-fallback");
    assert.include(source, "finalFileEditorReady = fileEditorReady(state)");
    assert.include(source, "reachedTargetState ||= isFileEditorState && finalFileEditorReady");
    assert.include(source, "isNarrowFileEditorState ? 1 : 3");
    assert.include(source, "fileEditorSwitched");
    assert.include(source, "fileEditorReturnedToBrowser");
    assert.include(source, "web-explorer-pointer|lynx-explorer-pointer");
    assert.include(source, "web-back-pointer|lynx-back-pointer");
    assert.include(source, "isFileEditorState && !isFileEditingSaveState");
    assert.include(source, "webFileEditorReturnedToBrowser");
    assert.include(source, "lynxFileEditorReturnedToBrowser");
    assert.include(source, 'returned?.lynx?.kind === "files"');
    assert.include(source, "returnedClients:");
    assert.include(source, "fileEditorMetrics: state?.web?.fileEditorMetrics ?? null");
    assert.include(source, "fileEditorMetrics: state?.lynx?.fileEditorMetrics ?? null");
    assert.include(workbench, "function readFileEditorMetrics");
    assert.include(workbench, ".files-panel__preview-status--error");
    assert.include(workbench, "saveErrorLabel: readElementBox(saveErrorLabel)");
    assert.include(workbench, "breadcrumbList: readElementBox(");
    assert.include(workbench, ".file-panel__breadcrumb-list");
    assert.include(workbench, "breadcrumbParts: [");
    assert.include(source, "metrics?.saveErrorLabel?.rect?.width > 0");
    assert.include(source, "metrics?.saveErrorLabelText");
    assert.include(workbench, "function readSourceControlRows");
    assert.include(workbench, "sourceControlRowMetrics: readSourceControlRows(root)");
    assert.include(workbench, "sourceControlRowMetrics: readSourceControlRows(doc)");
    assert.include(workbench, 'item.querySelector(".source-control-item__summary")');
    assert.include(workbench, 'step.querySelector(".provider-instance-dialog__step-number")');
    assert.include(workbench, 'step.querySelector(".provider-instance-dialog__step-label")');
    assert.include(workbench, "fileEditorMetrics: readFileEditorMetrics(root)");
    assert.include(workbench, "fileEditorMetrics: readFileEditorMetrics(doc)");
    assert.include(workbench, 'root?.querySelector(".file-panel")');
    assert.include(workbench, 'root?.querySelector("[data-file-breadcrumbs]")');
    assert.include(workbench, 'root?.querySelector(".file-preview-virtualizer")');
    assert.include(workbench, 'lynxSurface?.querySelector(".file-panel__explorer")');
    assert.include(workbench, 'lynxSurface?.querySelector(".file-editor-preview")');
    assert.include(workbench, 'element.matches?.(\'[data-line="1"][data-line-index="0"]\')');
    assert.include(workbench, "contentEditable?.contains(element)");
    assert.include(
      workbench,
      'element.matches?.(\'[data-column-number="1"][data-line-index="0"]\')',
    );
    assert.include(workbench, "root?.querySelector('[aria-label=\"Back to workspace files\"]')");
    assert.include(workbench, "rect.width <= 0");
    assert.include(workbench, "editorValueLength:");
  });

  it("opens and compares the file editor Open in menu", () => {
    assert.include(source, 'stateId === "file-editor-open-in-menu"');
    assert.include(source, '"file-editor-open-in-menu",');
    assert.include(source, '"file-editor-open-in-menu": "existing-thread"');
    assert.include(source, '[data-floating-anchor=\"file-open-in-menu\"]');
    assert.include(source, '[data-floating-popup=\"file-open-in-menu\"]');
    assert.include(source, "data-open-editor");
    assert.include(source, "data-preferred-editor");
    assert.include(source, "web-cdp-pointer|lynx-cdp-pointer");
    assert.include(source, "openInMenu: openInMenuEvidence");
    assert.include(source, "openInMenuEvidence?.match === true");
  });

  it("seeds and contains a responsive narrow chat transcript", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, 'stateId === "chat-thread-narrow"');
    assert.include(source, 'stateId === "chat-input-narrow-expanded"');
    assert.include(source, 'stateId === "chat-outline"');
    assert.include(source, "runChatOutlineFlow");
    assert.include(source, "chatOutline: chatOutlineEvidence");
    assert.include(source, 'kind: isChatOutlineState ? "chat-outline"');
    assert.include(source, '? "chat-outline" : "narrow-chat-transcript"');
    assert.include(source, "checkpointFiles,");
    assert.include(source, '"fidelity-narrow-thinking"');
    assert.include(source, '"fidelity-narrow-command"');
    assert.include(source, '"fidelity-narrow-tool"');
    assert.include(source, "within(changedFilesCard, assistantRow)");
    assert.include(source, "const changedFilesContent = changedFilesPreview ?? changedFilesBody");
    assert.include(source, 'data-timeline-row-kind=\"work-toggle\"');
    assert.include(source, "within(changedFilesContent, changedFilesCard?.rect)");
    assert.include(source, "function narrowChatResponsiveMatches");
    assert.include(source, "box?.scroll?.width <= box?.scroll?.clientWidth + 1");
    assert.include(source, "narrowChatResponsiveMatches(state?.web?.timelineMetrics");
    assert.include(source, "narrowChatHoverEvidence?.match === true");
    assert.include(source, 'inputChannel: "web-cdp-pointer|lynx-cdp-pointer"');
    assert.include(source, "target.scrollIntoView({ block: 'center', inline: 'nearest' })");
    assert.include(source, "__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__");
    assert.include(source, '[aria-label=\"Expand composer\"]');
    assert.include(source, "narrowComposerExpandEvidence?.match === true");
    assert.include(
      workbench,
      'userMeta: readElementBox(root?.querySelector(".transcript-user-meta"))',
    );
    assert.include(
      workbench,
      'assistantMeta: readElementBox(doc.querySelector(".transcript-assistant-meta"))',
    );
    assert.include(workbench, "width: element.scrollWidth");
    assert.include(workbench, "clientWidth: element.clientWidth");
    assert.include(
      workbench,
      'minimap: readElementBox(root?.querySelector("[data-timeline-minimap]"))',
    );
    assert.include(
      workbench,
      'changedFilesCard: readElementBox(root?.querySelector(".turn-diff-card"))',
    );
    assert.include(
      workbench,
      'changedFilesCard: readElementBox(doc.querySelector(".turn-diff-card"))',
    );
    assert.include(
      workbench,
      'changedFilesBody: readElementBox(root?.querySelector(".lynx-changed-files-tree"))',
    );
  });

  it("waits for both Sidebar hover previews before retaining the paired frame", () => {
    assert.include(source, "const finalWeb = await waitForSidebarTooltip(");
    assert.include(source, "const finalLynx = await waitForSidebarTooltip(");
    assert.include(source, "await movePointer(cdp, sessionId, webTarget.point);");
    assert.include(source, "Web provider-update notification remained visible before capture.");
    assert.include(source, "await movePointer(cdp, sessionId, target.awayPoint);");
    assert.include(
      source,
      'await invokeLynxTooltipProbe(cdp, sessionId, target.relationId, "leave");',
    );
  });

  it("captures editing and save lifecycle only in a disposable workspace", () => {
    const editingFlow = source.slice(
      source.indexOf("async function runFileEditingSaveFlow"),
      source.indexOf("async function hashFile"),
    );

    assert.include(source, 'stateId === "file-editor-editing-save"');
    assert.include(source, 'argValue("--file-edit-client", "")');
    assert.include(source, "--file-edit-client must be web or lynx");
    assert.include(source, '"file-editor-editing-save",');
    assert.include(source, '"file-editor-editing-save": "existing-thread"');
    assert.include(source, "file-editing-disposable-workspace");
    assert.include(source, "`t3-file-save-workspace-${process.pid}-");
    assert.include(source, 'const allowedTemporaryRoots = ["/tmp/", "/var/folders/"]');
    assert.include(source, "Refusing non-temporary file editing workspace");
    assert.include(source, "SET workspace_root = '${escapedWorkspace}'");
    assert.include(source, 'T3_TEST_PROJECT_WRITE_DELAY_MS: "5000"');
    assert.include(source, "runFileEditingSaveFlow");
    assert.include(source, "const waitForRemoteElement = async");
    assert.include(
      source,
      'await waitForRemoteElement(webEditorExpression, "Web file editor DOM")',
    );
    assert.include(source, "const restoreFileEditorTarget = async");
    assert.include(source, "await restoreFileEditorTarget()");
    assert.include(source, "Timed out restoring the dual file editor target");
    assert.include(source, "action: 'select-thread'");
    assert.include(source, "latest?.web?.productState?.selectedThread === expectedThreadId");
    assert.include(source, "latest?.lynx?.productState?.selectedThread === expectedThreadId");
    assert.include(source, "action = panel ? 'open-files' : 'open-panel'");
    assert.include(source, "action = 'open-file'");
    assert.include(source, '"Input.insertText"');
    assert.include(source, '"Page.bringToFront"');
    assert.include(source, '"Emulation.setFocusEmulationEnabled"');
    assert.include(source, '"Input.dispatchKeyEvent"');
    assert.include(source, "function cdpKeySequenceForCharacter(character)");
    assert.include(source, "code: `Key${upper}`");
    assert.include(source, "modifiers: 0");
    assert.include(source, "location: 0");
    assert.include(source, "isKeypad: false");
    assert.include(source, 'type: "keyDown"');
    assert.include(source, 'type: "keyUp"');
    assert.notInclude(editingFlow, 'type: "char"');
    assert.include(source, "__T3_FILE_EDITOR_INPUT_TRACE__");
    assert.include(source, "Pointer input did not place a Pierre editor caret");
    assert.include(source, "visibleTokens.at(-1) ?? targetLine");
    assert.include(source, "insideEditor: editor.contains(hit)");
    assert.notInclude(editingFlow, "focusRemoteElement(cdp, sessionId, webEditorExpression)");
    assert.include(source, 'pointerType: "mouse"');
    assert.include(source, "const root = editor.getRootNode()");
    assert.include(source, "root.getSelection?.() ?? frameWindow.getSelection?.()");
    assert.include(source, "root.activeElement === editor");
    assert.include(source, "'inputType' in event");
    assert.include(source, "'data' in event");
    assert.include(source, "'key' in event");
    assert.include(source, "'code' in event");
    assert.include(source, "defaultPrevented: event.defaultPrevented");
    assert.include(source, "record(type, 'bubble', event)");
    assert.include(source, "trustedBeforeInput");
    assert.include(source, "event.isTrusted === true");
    assert.include(source, "event.inputType === 'insertText'");
    assert.include(
      source,
      "CDP pointer + Pierre caret + Playwright-style keyDown/keyUp + trusted beforeinput",
    );
    assert.include(source, "`${fileEditClient} file editor changed contents`");
    assert.include(source, "File write confirmed before the pending evidence frame");
    assert.include(source, 'fileEditClient === "web"');
    assert.include(source, "pendingEvidenceState.web.fileEditorMetrics.pending === true");
    assert.include(source, "const pendingContentRevision");
    assert.include(source, "pending file state did not expose a content revision");
    assert.include(source, "visible: pendingVisible");
    assert.include(source, "const pendingDeadline = Date.now() + 3_000");
    assert.include(source, "pendingEvidenceState = candidate");
    assert.include(source, "capturePanePair");
    assert.include(source, "File write confirmed before the pending evidence frame");
    assert.include(source, "failedWriteWorkspace");
    assert.include(source, "await rename(");
    assert.include(source, '"T3 file save failure blocker\\n"');
    assert.include(source, "await rm(fixturePreparation.disposableWorkspace, { force: true })");
    assert.include(source, "writeFailureActive = true");
    assert.include(source, "inline file save failure");
    assert.include(source, "metrics?.saveError");
    assert.include(source, "metrics?.saveRetry");
    assert.include(source, 'metrics?.saveRetryText === "Retry save"');
    assert.include(source, 'prefix: "file-save-failure"');
    assert.include(source, "Could not locate ${fileEditClient} file save retry control");
    assert.include(source, "await dispatchPointerClickWithMove(cdp, sessionId, retryPoint)");
    assert.include(source, "`${fileEditClient} file save recovery`");
    assert.include(source, "Retried contents did not persist in the disposable workspace");
    assert.include(source, "workspaceRestored:");
    assert.include(source, "errorCleared: true");
    assert.include(source, "pendingCleared: true");
    assert.include(source, "dual Files return after retry confirmation");
    assert.notInclude(source, "Edited contents did not persist in the disposable workspace");
    assert.include(source, '({ method }) => method === "writeProjectFile"');
    assert.include(source, "includesSentinel: true");
    assert.include(source, "lynxWriteObserved");
    assert.include(source, "`${fileEditClient} file reopen with persisted contents`");
    assert.include(
      source,
      "candidate?.web?.fileEditorMetrics?.contentRevision === pendingContentRevision",
    );
    assert.include(
      source,
      "candidate?.lynx?.fileEditorMetrics?.contentRevision === pendingContentRevision",
    );
    assert.include(source, "fileEditingSaveEvidence !== null");
    assert.include(source, "fileEditingSave: fileEditingSaveEvidence");
    assert.include(source, "const currentStateIdentityMatches = () =>");
    assert.include(source, "selectedProject: webState.selectedProject");
    assert.include(source, "selectedProject: lynxState.selectedProject");
    assert.include(source, "stateIdentityMatch = currentStateIdentityMatches()");
    assert.include(source, "finalCoreGeometryReady =");
    assert.include(source, "fixturePreparation.disposed = true");
  });

  it("captures persisted Plan mode with matching Web and Lynx control material", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, 'const isComposerPlanModeState = stateId === "composer-plan-mode"');
    assert.include(source, "const shouldClearWebNotification = true;");
    assert.include(source, '"composer-plan-mode": {');
    assert.include(source, '"composer-plan-mode",');
    assert.include(source, '"composer-plan-mode": "existing-thread"');
    assert.include(source, 'stateId === "composer-plan-mode"');
    assert.include(source, "seed?.dataset?.canonicalThread");
    assert.include(source, "let captureWebRoute = requestedWebRoute");
    assert.include(
      source,
      'await readFile(path.join(baseDir, "userdata", "environment-id"), "utf8")',
    );
    assert.include(
      source,
      "`/${encodeURIComponent(environmentId)}/${encodeURIComponent(expectThread)}`",
    );
    assert.include(source, "explicitExpectedThreadId ||");
    assert.include(source, "threadStateIds.has(stateId)");
    assert.include(source, "webRoute: captureWebRoute");
    assert.include(source, "function composerPlanModeMatches(state)");
    assert.include(source, 'className.includes("bg-blue-500/10")');
    assert.include(source, 'className.includes("text-blue-400")');
    assert.include(source, 'className.includes("composer-toolbar-control--interaction-plan")');
    assert.include(source, "SET interaction_mode = 'plan'");
    assert.include(source, 'queryReport.rows[0]?.interaction_mode === "plan"');
    assert.include(source, 'kind: "thread-interaction-mode"');
    assert.include(source, "const planModeReady = composerPlanModeMatches(state)");
    assert.include(source, "settled_override = 'active'");
    assert.include(source, 'queryReport.rows[0]?.settled_override === "active"');
    assert.include(source, "const finalPlanModeReady = composerPlanModeMatches(state)");
    assert.include(source, "finalPlanModeReady,");
    assert.include(source, "planMode:");
    assert.include(source, "interactionMode: webState.interactionMode");
    assert.include(source, "interactionMode: lynxState.interactionMode");
    assert.include(workbench, "function readComposerInteractionSeparator");
    assert.include(workbench, ".composer-toolbar-sep");
    assert.include(workbench, 'item.getAttribute("data-composer-control") === "interaction"');
    assert.include(workbench, 'composerInteractionControl?.textContent?.trim() === "Plan"');
    assert.include(workbench, "interactionSeparator: readComposerInteractionSeparator");
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
    assert.include(source, 'targetStateId === "settings-connections-mutation-browser"');
    assert.include(source, "desktopBootstrapToken: bootstrapToken");
    assert.include(source, "startupToken,");
    assert.notInclude(source, "hideAuthorizedClients");
  });

  it("admits direct Settings routes only after their semantic and geometry gates pass", () => {
    assert.include(source, 'semanticRoute.startsWith("settings-")');
    assert.include(source, "finalSettingsAsyncReady");
    assert.include(source, "finalSettingsGeometryReady");
    assert.include(source, "finalSettingsNavigationReady");
    assert.include(source, "settingsContentMatch !== false");
  });

  it("uses the Beta content flow for dark and light Beta captures", () => {
    assert.include(
      source,
      'const isBetaSettingsState = stateId === "settings-beta" || stateId === "settings-beta-light"',
    );
    assert.include(source, "isBetaSettingsState &&");
    assert.include(source, ": isBetaSettingsState");
    assert.include(source, "let webLegacySettingsExpanded = !isBetaSettingsState");
    assert.include(source, 'step: "restore-scroll"');
    assert.include(source, "Math.abs(webScrollTop) <= 1");
  });

  it("measures Settings controls through one shared row geometry reader", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(workbench, "function readSettingsRowGeometry(item)");
    assert.include(workbench, "controlBox: readElementBox(control)");
    assert.include(workbench, "controlLeafBox: readElementBox(controlLeaf)");
    assert.include(workbench, '[role="switch"]');
    assert.include(workbench, "function readSettingsScroll(root)");
    assert.equal(workbench.split("scroll: readSettingsScroll(").length - 1, 2);
    assert.include(workbench, "function readSettingsTopbar(root)");
    assert.equal(workbench.split("topbar: readSettingsTopbar(").length - 1, 2);
    assert.equal(workbench.match(/readSettingsRowGeometry,/g)?.length, 2);
  });

  it("serves the Web authority with desktop visual chrome only", () => {
    assert.include(source, "window.__T3_WORKBENCH_DESKTOP_VISUAL__=true");
    assert.include(source, 'html.replace("<head>", `<head>${desktopVisualMarker}`)');
    assert.include(source, "function settingsDesktopTopbarMatches(state)");
    assert.include(source, 'lynxRow.controlText === "Not yet available in Lynxtron."');
    assert.include(source, "web?.desktopVisualHost === true");
    assert.include(source, "web?.restore === null && lynx?.restore === null");
    assert.include(source, "finalSettingsDesktopTopbarReady");
    const keybindings = readFileSync(
      path.join(import.meta.dirname, "../../web/src/components/settings/KeybindingsSettings.tsx"),
      "utf8",
    );
    assert.include(keybindings, "!isDesktopVisualHost");
    assert.notInclude(keybindings, "!isElectron");
  });

  it("runs the Browser Connections create and revoke lifecycle on both renderers", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, 'stateId === "settings-connections-mutation-browser"');
    assert.include(source, "async function runConnectionsMutationFlow");
    assert.include(source, 'host: isConnectionsMutationState ? "0.0.0.0" : HOST');
    assert.include(source, '"web-created"');
    assert.include(source, '"web-revoked"');
    assert.include(source, '"lynx-created"');
    assert.include(source, '"lynx-revoked"');
    assert.include(source, "finalConnectionsMutationReady");
    assert.include(workbench, "function readConnectionsMutationSettings");
    assert.include(workbench, "pairingLinkCount: pairingRevokeButtons.length");
    assert.include(workbench, "createButton: readElementBox(createButton)");
    assert.include(workbench, 'readComposedText(button).trim() === "Revoke"');
  });

  it("can retain only dedicated terminal pane images without reconstructible composites", () => {
    assert.include(source, "!paneImagesOnly &&");
    assert.include(source, "web: terminalOnlyImages ? null");
  });

  it("reaps its exact browser process and removes the isolated profile", () => {
    assert.notInclude(source, "agent-browser");
    assert.include(source, "async function stopOwnedChild(child");
    assert.include(source, 'browserCdp.send("Browser.close")');
    assert.include(source, "await stopOwnedChild(chrome)");
    assert.include(source, 'process.once("SIGINT", onSigint)');
    assert.include(source, 'process.once("SIGTERM", onSigterm)');
    assert.include(source, "await rm(userDataDir, {");
    assert.include(source, "recursive: true");
    assert.include(source, "force: true");
    assert.include(source, "maxRetries: 5");
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
    assert.include(workbench, "root?.querySelectorAll('[data-settings-row=\"true\"]')");
    assert.include(workbench, "children: [...item.children].map");
    assert.include(workbench, 'root?.querySelectorAll(".source-control-item")');
    assert.include(source, '"settings-archive": "/settings/archived"');
    assert.include(workbench, 'root?.querySelector(".settings-content")');
    assert.include(workbench, 'root?.querySelector(".settings-panel")');
    assert.include(workbench, ":scope > .settings-section");
    assert.include(workbench, "sectionTexts:");
    assert.include(workbench, "const settingsSections = [");
    assert.include(workbench, '":scope > .source-control-section, :scope > .settings-section"');
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
    assert.include(
      source,
      'webMetrics?.sourceControlEmptyTitles?.includes("No saved remote environments")',
    );
    assert.include(
      source,
      'lynxMetrics?.sourceControlEmptyTitles?.includes("No saved remote environments")',
    );
    assert.include(source, "Math.abs(webEmpty.height - lynxEmpty.height) > 1");
    assert.include(
      source,
      "Math.abs(webEmptyMedia.x - webEmpty.x - (lynxEmptyMedia.x - lynxEmpty.x)) > 1",
    );
    assert.include(
      source,
      "Math.abs(webEmptyMedia.y - webEmpty.y - (lynxEmptyMedia.y - lynxEmpty.y)) > 1",
    );
    assert.include(source, "Math.abs(webEmptyHeader.width - lynxEmptyHeader.width) > 1");
    assert.include(source, "lynxEmptyHeader.y < lynxEmptyMedia.y + lynxEmptyMedia.height");
    assert.include(source, "lynxEmptyDescription.y < lynxEmptyTitle.y + lynxEmptyTitle.height");
    assert.include(source, "Math.abs(rect.y - webRect.y) <= 3");
    assert.include(source, "Math.abs(rect.height - webRect.height) <= 3");
    assert.include(source, "Math.abs(rows.y - webRows.y) <= 3");
    assert.include(source, "Math.abs(rows.height - webRows.height) <= 3");
    assert.include(source, "rect.y >= previous.y + previous.height");
    assert.include(
      workbench,
      "root?.querySelector('[data-slot=\"empty\"], .source-control-empty')",
    );
    assert.include(
      workbench,
      "root?.querySelector('[data-slot=\"empty-media\"], .source-control-empty__media')",
    );
    assert.include(source, "function betaSettingsGeometryMatches");
    assert.include(source, '"settings-beta-mutation": "settings-general"');
    assert.include(source, '"settings-background-activity-mutation": "settings-general"');
    assert.include(source, "function backgroundActivityMutationStateMatches");
    assert.include(source, "async function runBackgroundActivityMutationFlow");
    assert.include(source, "finalBackgroundActivityMutationReady");
    assert.include(source, "function betaMutationStateMatches");
    assert.include(source, "async function runBetaMutationFlow");
    assert.include(source, '"Beta mutation disabled state"');
    assert.include(source, '"Beta mutation restored state"');
    assert.include(source, "finalBetaMutationReady");
    assert.include(workbench, "function readBetaMutationSettings");
    assert.include(workbench, '"settings-beta": ["background-activity", "legacy-sidebar"]');
    assert.include(workbench, "sidebarAutoSettleAfterDays: 3");
    assert.include(source, "function settingsNavigationStateMatches(state)");
    assert.include(source, 'if (!semanticRoute.startsWith("settings-"))');
    assert.include(source, "if (!realFooterReady || !authorityHidden");
    assert.include(source, "function backgroundPolicyAccessoryMatches(webMetrics, lynxMetrics)");
    assert.include(workbench, "titleAccessoryBox: readElementBox(");
    assert.include(workbench, "Background policy details");
    assert.include(source, "items.every((item) => item.labelBox?.rect?.width > 0");
    assert.include(source, "settingsBackLabel?.rect?.width > 0");
    assert.include(workbench, "labelBox: readElementBox(labelElement)");
    assert.include(workbench, "settingsBackLabel: readSettingsNavigationChrome(root).backLabel");
    assert.include(source, "visuallySelectedItems.length === 1");
    assert.include(source, "finalSettingsNavigationReady");
    assert.include(source, '"model-picker-empty": "model-picker"');
    assert.include(source, '"model-picker-selected": "model-picker"');
    assert.include(source, '"settings-model-picker": "model-picker"');
    assert.include(source, '"settings-model-picker": "settings-general"');
    assert.include(source, '"settings-model-picker-mutation": "settings-general"');
    assert.include(source, '#text-generation-model [data-chat-provider-model-picker=\"true\"]');
    assert.include(
      source,
      'stateId === "settings-model-picker" ||\n        state?.web?.productState?.selectedProject === expectProject',
    );
    assert.include(source, 'stateId !== "settings-general" && stateId !== "settings-model-picker"');
    assert.include(source, "[data-settings-model-picker-trigger]");
    assert.include(source, "async function runSettingsModelMutationFlow");
    assert.include(source, "finalSettingsModelMutationReady");
    assert.include(source, '"lynx-cdp-pointer+shared-server"');
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
    assert.include(source, "const notificationDismissed =");
    assert.include(source, "await dismissWebProviderNotification(cdp, sessionId)");
    assert.notInclude(source, "overlay.length > 0 ||");
    assert.include(source, "Overlay ${overlay} closed before screenshot capture:");
    assert.include(source, 'stateId !== "settings-beta"');
    assert.include(source, "function legacySidebarSettingsReady");
    assert.include(source, 'web.checked === "false"');
    assert.include(source, 'lynx.controlClass?.includes("ui-switch--unchecked")');
    assert.include(source, "function generalSettingsContentMatches");
    assert.include(source, "function generalSettingsGeometryMatches");
    assert.include(source, 'stateId !== "settings-general"');
    assert.include(source, "webSections.length !== 2");
    assert.include(source, "Math.abs(rect.width - 896) <= 1");
    assert.include(source, "text.width > 0");
    assert.include(source, "generalSettingsContentMatches(");
    assert.include(source, "generalSettingsGeometryMatches(");
    assert.include(source, "sourceControlErrorSettingsGeometryMatches");
    assert.include(workbench, "sourceControlEmptyContent: readElementBox(");
    assert.include(workbench, "sourceControlRetryButton: readElementBox(");
    assert.include(workbench, "sourceControlRetryLabel: readElementBox(");
    assert.include(workbench, "function readSettingsRowGeometry(item)");
    assert.include(
      workbench,
      'titleBox: readElementBox(item.querySelector(".settings-row__title, h3"))',
    );
    assert.include(workbench, "descriptionBox: readElementBox(");
    assert.include(source, "sourceControlLoadingSettingsGeometryMatches");
    assert.include(workbench, '"icon", "dot", "label", "badge", "detail", "button", "switch"');
    assert.include(source, "T3_TEST_SOURCE_CONTROL_DISCOVERY_PENDING");
    assert.include(workbench, "sourceControlEmptyTitles:");
    assert.include(workbench, "data-source-control-loading-row");
    assert.include(workbench, "doc.querySelectorAll('[data-slot=\"skeleton\"]')");
    assert.include(
      workbench,
      "root?.querySelector('[data-slot=\"empty\"], .source-control-empty')",
    );
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
    assert.include(source, "const visibleResults = (metrics) =>");
    assert.include(source, "rect: {");
    assert.include(source, "Math.min(results.y + results.height, footer.y) - results.y");
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
    assert.include(source, "function approvalComposerMatches");
    assert.include(source, 'for (const key of ["pending", "detail", "editorArea", "footer"])');
    assert.include(source, "webActions.length !== 4");
    assert.include(source, 'theme !== "light"');
    assert.include(source, 'action?.style?.backgroundColor === "rgb(255, 255, 255)"');
    assert.include(
      source,
      "approvalComposerMatches(state?.web?.composerMetrics, state?.lynx?.composerMetrics)",
    );
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

  it("drives explicit flat and legacy sidebars with real Add Project entry points", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(source, 'stateId === "sidebar-project-groups" ? "true" : "false"');
    assert.include(source, 'productState?.sidebarVersion === "legacy"');
    assert.include(source, 'if (stateId === "sidebar-project-groups") return true;');
    assert.include(source, 'stateId === "sidebar-project-groups"');
    assert.include(source, "finalSidebarProjectGroupsReady");
    assert.include(source, "function flatSidebarLayoutMatches");
    assert.include(source, '"sidebar-flat-layout",');
    assert.include(source, "finalFlatSidebarLayoutReady");
    assert.include(source, "isFlatSidebarLayoutState ||");
    assert.include(source, "isNarrowChatThreadState ||");
    assert.include(source, "coreGeometryMatches(state?.web, state?.lynx)");
    assert.include(source, "isFlatSidebarLayoutState || headerGitActionMatches");
    assert.notInclude(source, 'const initialOverlay = stateId === "add-project-sources"');
    assert.include(source, 'stateId !== "add-project-sources"');
    assert.include(source, '[data-testid="sidebar-add-project-trigger"]');
    assert.include(source, '[aria-label="New project"]');
    assert.include(workbench, "legacySidebarEnabled:");
    assert.include(workbench, "function readLegacySidebarSettings");
    assert.include(workbench, "legacySidebar: readLegacySidebarSettings");
    assert.include(workbench, '[data-setting-control="legacy-sidebar"]');
    assert.include(workbench, "data-sidebar-version");
    assert.include(workbench, ".sidebar-inline-search");
    assert.include(workbench, "readSidebarProjectGroups");
    assert.include(workbench, "data-palette-active");
    assert.include(workbench, "data-quick-switch-view");
    assert.include(source, "function sidebarProjectGroupsMatch(state)");
    assert.include(source, "finalSidebarProjectGroupsReady");
    assert.include(source, "function addProjectSourcesMatch(state)");
    assert.include(source, "finalAddProjectSourcesReady");
    assert.include(source, 'stateId === "add-project-sources" ||');
  });

  it("expands the legacy sidebar setting through real pointers", () => {
    assert.include(source, "function legacySidebarSettingsReady");
    assert.include(source, "settings-legacy-section__trigger");
    assert.include(source, "target.scrollIntoView?.({ block: 'center', inline: 'nearest' });");
    assert.include(
      source,
      "await dispatchMouseWheel(cdp, sessionId, points.lynx.scrollPoint, 700)",
    );
    assert.include(source, 'client: "lynx",');
    assert.include(source, 'step: "scroll",');
    assert.include(source, "state?.web?.literalRoute !== webRoute");
    assert.include(
      source,
      '!(semanticRoute === "new-thread" && state?.web?.literalRoute?.startsWith("/draft/"))',
    );
    assert.notInclude(source, "webRouteInputSent = true");
    assert.include(source, 'webRoute === "/settings/general"');
    assert.include(source, 'state?.web?.literalRoute?.startsWith("/draft/")');
    assert.include(source, "webDraftLandingStablePolls >= 3");
    assert.include(source, 'webRoute !== "/settings/general"');
    assert.include(source, "async function openWebSettingsFromSidebar");
    assert.include(source, "querySelector('.sidebar-settings-row')");
    assert.include(source, 'return "cdp-pointer"');
    assert.include(source, 'return clicked ? "dom-click-fallback" : null');
    assert.include(source, 'client: "web", step: "expand"');
    assert.include(source, 'client: "lynx", step: "expand"');
    assert.include(source, "legacySettingsTimeline");
  });

  it("records the command palette hover and keyboard causal chain", () => {
    assert.include(source, 'stateId === "command-palette-navigation"');
    assert.include(source, "runCommandPaletteNavigationFlow");
    assert.include(source, '"ArrowDown", "ArrowDown", 40');
    assert.include(source, '"ArrowUp", "ArrowUp", 38');
    assert.include(source, '"Enter", "Enter", 13');
    assert.include(source, '"Backspace", "Backspace", 8');
    assert.include(source, '"Escape", "Escape", 27');
    assert.include(source, "nativePhysicalKeyboard:");
    assert.include(source, '"pending-user-session"');
  });

  it("records the Sidebar V2 action hover and new-thread project flows", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, '"sidebar-v2-new-thread-hover"');
    assert.include(source, '"sidebar-v2-new-project-hover"');
    assert.include(source, '"sidebar-v2-new-thread-projects"');
    assert.include(source, "runSidebarControlHoverFlow");
    assert.include(source, 'step: "before-delay"');
    assert.include(source, 'step: "opened"');
    assert.include(source, 'step: "sibling-opened"');
    assert.include(source, 'step: "sibling-dismissed"');
    assert.include(source, "Sidebar hover targets resolved to the same thread");
    assert.include(source, 'step: "dismissed"');
    assert.include(source, "opened before the 600ms authority delay");
    assert.include(source, "clickSidebarControl");
    assert.include(source, "clickPaletteBack");
    assert.include(source, "newThreadProjectsMatch");
    assert.include(source, 'paletteView === "new-thread-projects"');
    assert.include(source, "finalNewThreadProjectsReady");
    assert.include(source, "initialThreadIds");
    assert.include(source, "firstDraftIds");
    assert.include(source, "reusedDraftIds");
    assert.include(source, "initialLynxCreateThreadCommandCount");
    assert.include(source, "Opening a local draft persisted an empty thread");
    assert.include(source, "Repeated New thread did not reuse the local draft");
    assert.include(source, "draftLifecycle: newThreadDraftLifecycle");
    assert.include(source, "sidebarControlHoverTimeline");
    assert.include(source, "newThreadProjectsTimeline");
    assert.include(source, 'client: "web", step: "back", view: "root"');
    assert.include(source, 'client: "lynx", step: "back", view: "root"');
    assert.include(source, 'client: "web", step: "dismiss", overlay: null');
    assert.include(source, 'client: "lynx", step: "dismiss", overlay: null');
    assert.include(workbench, "searchRow:");
    assert.include(workbench, "searchPrimary:");
    assert.include(workbench, "searchText:");
    assert.include(workbench, "newThread:");
  });

  it("inserts the complete controlled Lynx Sidebar search query after one focus", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(source, 'await cdp.send("Input.insertText", { text: sidebarQuery }, sessionId)');
    assert.include(source, "if (currentQuery === sidebarQuery) return true");
    assert.include(source, "sidebarDiagnostics?.search?.inputBox?.rect?.width > 0");
    assert.include(source, "inputBox?.style?.webkitTextFillColor");
    assert.include(workbench, "inputBox: readElementBox(input ?? host)");
    assert.include(workbench, "webkitTextFillColor: style.webkitTextFillColor");
    assert.include(source, "lynx-dom-focus+insert-text");
  });

  it("records the Sidebar thread-details pointer lifecycle in both Browser renderers", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    const browserPreview = readFileSync(
      path.join(import.meta.dirname, "../src/browser-preview/index.ts"),
      "utf8",
    );
    const tooltip = readFileSync(
      path.join(import.meta.dirname, "../../web/src/components/ui/tooltip.lynx.tsx"),
      "utf8",
    );

    assert.include(source, '"sidebar-thread-hover-preview"');
    assert.include(source, '"sidebar-thread-shortcuts"');
    assert.include(source, "runSidebarThreadHoverPreviewFlow");
    assert.include(source, "runSidebarThreadShortcutFlow");
    assert.include(source, "dispatchMetaDigit");
    assert.include(source, "web-cdp-keyboard|lynx-host-keyboard-packet");
    assert.include(source, "web-keydown-up|lynx-clay-keydown-up");
    assert.include(source, 'step: "modifier-down"');
    assert.include(source, 'step: "modifier-up"');
    assert.include(workbench, "jumpLabel:");
    assert.include(workbench, "snoozeTrigger: Boolean");
    assert.include(workbench, "overflowTrigger: Boolean");
    assert.include(workbench, "settleAction: Boolean");
    assert.include(source, 'step: "quick-leave"');
    assert.include(source, "Sidebar details opened after quick pointer leave");
    assert.include(source, 'step: "opened"');
    assert.include(source, 'opened.attributes["data-floating-side"]');
    assert.include(source, 'opened.attributes["data-side"]');
    assert.include(source, "Sidebar details Browser relations diverged");
    assert.include(source, 'step: "dismissed"');
    assert.include(source, "waitForSidebarTooltipDismissed");
    assert.include(source, "sidebarTooltipVisible");
    assert.include(source, "invokeLynxTooltipProbe");
    assert.include(source, "web-cdp-pointer|lynx-main-thread-probe");
    assert.include(workbench, "async invokeLynxTooltip(relationId, action)");
    assert.include(workbench, "invokeTooltipForHarness");
    assert.include(browserPreview, '"t3:tooltip-test"');
    assert.include(tooltip, 'const T3_TOOLTIP_TEST_EVENT = "t3:tooltip-test"');
    assert.include(tooltip, '"background only"');
    assert.include(source, "openDelayMs: 150");
    assert.include(source, 'placement: "right-start-4"');
  });

  it("advances Project Settings scope and action pointers one renderer at a time", () => {
    assert.include(source, "const webNeedsProjectScope =");
    assert.include(source, "const lynxNeedsProjectScope =");
    assert.include(source, "} else if (lynxNeedsProjectScope && scopePoints?.lynx) {");
    assert.include(
      source,
      "} else if (!projectSettingsInteraction.lynxActionClicked && actionState?.lynx?.point) {",
    );
    assert.include(source, "if ((actionState?.web?.optionCount ?? 0) > 0) {");
    assert.include(source, "if ((actionState?.lynx?.optionCount ?? 0) > 0) {");
  });

  it("drives both Browser renderers through a multi-step question", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, '"existing-thread-question-multi-step"');
    assert.include(source, "const isMultiStepQuestionState");
    assert.include(source, 'clickPair(\'[data-question-option="Safe"]\', "select-safe")');
    assert.include(source, 'clickPair(\'[data-pending-question-action="next"]\', "next")');
    assert.include(source, 'clickPair(\'[data-pending-question-action="previous"]\', "previous")');
    assert.include(source, 'clickPair(\'[data-question-option="Web"]\', "select-web")');
    assert.include(source, 'clickPair(\'[data-question-option="Native"]\', "select-native")');
    assert.include(source, 'multiStepQuestionStage = "complete"');
    assert.include(source, "multiStepQuestionTimeline");
    assert.include(source, 'channel: fallback ? "dom-click-fallback" : "cdp-pointer"');
    assert.include(source, 'waitForPair("restored first answer", restoredFirstAnswer, 1_500)');
    assert.include(source, "explicitExpectedThreadId || threadStateIds.has(stateId)");
    assert.include(source, "pendingRequestSemantics");
    assert.include(workbench, 'data-pending-question-action="next"');
    assert.include(workbench, 'data-pending-question-action="previous"');
    assert.include(workbench, 'questionIndex: Number(question.getAttribute("data-question-index")');
    assert.include(workbench, "optionRows:");
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
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.include(source, '"settings-keybindings": "settings-general"');
    assert.include(source, "function keybindingsSettingsContentMatches");
    assert.include(source, "function keybindingsSettingsGeometryMatches");
    assert.include(source, "command, shortcut, when, source, conflicts, keycaps");
    assert.include(workbench, "keybindings-table__keycap");
    assert.include(source, "JSON.stringify(canonical(webRows))");
    assert.include(source, "!rectDeltaWithin(webHeader, lynxHeader, 2)");
    assert.include(source, "const sharedColumnGeometry");
    assert.include(source, "Status is intentionally an empty structural cell");
    assert.include(source, "webRow.conflicts.length === 0");
    assert.include(source, "!webColumn.box");
    assert.include(source, "if (columnIndex !== 3) return true");
    assert.include(source, '"settings-providers": "settings-general"');
    assert.include(source, '"settings-providers": "Providers"');
    assert.include(source, "function providerSettingsContentMatches");
    assert.include(source, "function providerSettingsGeometryMatches");
    assert.include(
      source,
      "if (!isProvidersSettingsState || isAddProviderDialogState) return true;",
    );
    assert.include(source, "healthControlDoesNotOverlap");
    assert.include(source, "unit.x >= group.x + group.width");
    assert.include(source, "webProviders?.inlineCreate === null");
    assert.include(source, "lynxProviders?.inlineCreate === null");
    assert.include(source, "providerSettingsContentMatches(");
    assert.include(source, "providerSettingsGeometryMatches(");
    assert.include(
      source,
      "fileEditingSaveEvidence: !isFileEditingSaveState || fileEditingSaveEvidence !== null",
    );
    assert.include(workbench, "function readProviderSettingsMetrics");
    assert.include(workbench, "function readAddProviderDialog");
    assert.include(workbench, "addProviderDialog: readAddProviderDialog");
    assert.include(workbench, 'root?.querySelectorAll(".provider-instance-card")');
    assert.include(workbench, 'root?.querySelector(".provider-instance-create")');
    assert.include(
      workbench,
      'label: readElementBox(control?.querySelector("span, text, x-text"))',
    );
    assert.include(workbench, 'readComposedText(title) === "Health check interval"');
    assert.include(workbench, "healthControl: {");
    assert.include(workbench, '"Provider health check interval in seconds"');
    assert.include(
      workbench,
      'const titleElement = card.querySelector(".provider-instance-card__title")',
    );
    assert.include(workbench, 'card.getAttribute("data-provider-instance-title")');
    assert.include(workbench, '".provider-instance-card__chevron, [data-provider-card-expanded]"');
    assert.include(workbench, "[data-provider-card-expanded]");
    assert.include(workbench, 'card.querySelector(".provider-instance-card__layout")');
    assert.include(workbench, 'card.querySelector(".provider-instance-card__actions")');
    assert.include(workbench, "summaryChildren:");
    assert.include(workbench, "titleButtons:");
    assert.include(workbench, 'expectedSemanticRoute === "settings-providers"');
    assert.include(source, '"settings-providers-add-dialog": "settings-general"');
    assert.include(source, 'stateId === "settings-providers-add-dialog-light"');
    assert.include(source, '"settings-providers-add-dialog-light": "settings-general"');
    assert.include(source, "function addProviderDialogPairMatches");
    assert.include(source, "const animationSettled =");
    assert.include(source, "async function runAddProviderDialogFlow");
    assert.include(source, "const providerDialogStopAt = argValue(");
    assert.include(
      source,
      'stateId === "settings-providers-add-dialog-light" ? "driver" : "complete"',
    );
    assert.include(source, 'if (providerDialogStopAt === "driver") return { state, timeline }');
    assert.include(source, "addProviderDialogPairMatches(state, width, height, 0)");
    assert.include(workbench, 'textLeaves: [...step.querySelectorAll("span, text, x-text")]');
    assert.include(workbench, 'textLeaves: [...driver.querySelectorAll("span, text, x-text")]');
    assert.include(source, "settings.providerInstances?.codex_fidelity_browser");
    assert.include(source, 'step: "config-blocked"');
    assert.include(source, "if (${replace}) input?.select?.()");
    assert.include(source, "fillLynxInput(1, instanceId, { replace: true })");
    assert.include(source, 'step: "dismissed"');
    assert.include(source, 'step: "reopened"');
    assert.include(source, 'step: "config"');
    assert.include(source, 'step: "saved"');
    assert.include(source, 'step: "deleted"');
    assert.include(source, "stableDeleteSamples >= 3");
    assert.include(source, "attempt <= 3 && stableDeleteSamples < 3");
    assert.include(source, "stable shared Add Provider delete reversal attempt");
    assert.include(source, 'step: "final-dismissed"');
    assert.include(source, "codex_fidelity_browser");
    assert.include(source, "provider-card__delete-instance");
    assert.include(source, "finalAddProviderDialogReady");
    assert.include(source, 'step: "saved"');
    assert.include(source, 'step: "deleted"');
  });

  it("reopens thread-scoped model picker states after selecting the seeded thread", () => {
    assert.include(source, '"model-picker-selected",');
    assert.include(source, 'overlay === "model-picker"');
    assert.include(source, '[data-composer-control="model"]');
    assert.include(source, "let lynxOverlayInputSent = overlay.length === 0");
    assert.include(source, "function modelPickerSemanticsMatch");
    assert.include(source, '"web-cdp-pointer|lynx-cdp-pointer"');
    assert.include(source, "providerPointerTimeline.push");
    assert.include(source, 'stage: "before-pointer"');
    assert.include(
      source,
      "!lynxOverlayInputSent &&\n      webProviderNotificationCleared &&\n      state?.lynx?.connected",
    );
    const providerFlow = source.slice(
      source.indexOf('overlay === "model-picker" &&'),
      source.indexOf("if (\n      composerInput &&"),
    );
    assert.notInclude(providerFlow, "target.click()");
    assert.include(source, 'stateId !== "model-picker-selected"');
    assert.include(source, "webMetrics?.selectedRowKeys?.length === 1");
    assert.include(source, "lynxMetrics?.selectedRowKeys?.length === 1");
    assert.notInclude(source, "webOverlaySemanticKeys");
    assert.notInclude(source, "lynxOverlaySemanticKeys");
  });

  it("drives the model picker dismiss scroll and selection lifecycle", () => {
    assert.include(source, 'stateId === "model-picker-interaction"');
    assert.include(source, '"model-picker-interaction": "model-picker"');
    assert.include(source, 'step: "outside-dismissed"');
    assert.include(source, 'step: "close-dismissed"');
    assert.include(source, 'step: "scrolled"');
    assert.include(source, 'type: "mouseWheel"');
    assert.include(source, 'lynx: ".model-picker-close"');
    assert.include(source, "modelPickerInteractionEvidence?.match === true");
    assert.include(source, "modelPickerInteraction: modelPickerInteractionEvidence");
  });

  it("prepares the selected model through the isolated thread projection", () => {
    assert.include(source, "async function prepareStateFixture");
    assert.include(source, 'stateId !== "model-picker-selected"');
    assert.include(source, '"apps/server/scripts/t3-sqlite-state.ts"');
    assert.include(source, "UPDATE projection_threads");
    assert.include(source, "model_selection_json = json_object");
    assert.include(source, '"codex"');
    assert.include(source, '"gpt-5.4-mini"');
    assert.include(source, "} finally {");
    assert.include(source, "await rm(mutationReport.backup, { force: true })");
    assert.include(source, "sourceSeedHash: seed?.snapshotSha256 ?? null");
    assert.include(source, "fixturePreparation.preparedSha256");
  });

  it("uses an available model for the sendable new-thread fixture", () => {
    assert.include(source, 'stateId === "composer-sendable"');
    assert.include(source, "? selectedModelFixture");
    assert.include(source, "SET default_model_selection_json = json_object");
    assert.include(source, 'kind: "project-model-selection"');
    assert.include(source, "Composer sendable blur targets are missing");
    assert.include(source, "Composer sendable state changed after blur");
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

  it("opens both right panels before driving a Review diff", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );
    assert.match(
      source,
      /let webReviewPanelInputSent =\s*!isReviewState \|\|\s*reviewExpectation === "checkpoint" \|\|\s*reviewExpectation === "tree" \|\|\s*\(reviewExpectation === "diff" && width <= 1023\);/,
    );
    assert.include(source, "!webReviewPanelInputSent && !state?.web?.reviewMetrics?.panelOpen");
    assert.include(source, "!lynxReviewPanelInputSent &&");
    assert.include(source, "if (!lynxReviewDiffInputSent && checkpointDiffPoints?.lynx)");
    assert.notInclude(source, "'[data-right-panel-action=\"diff\"]'");
    assert.include(source, "function reviewCheckpointCardGeometryMatches");
    assert.include(source, "function reviewDiffGeometryMatches");
    assert.include(source, "uniqueLineBands");
    assert.include(workbench, "composedCodeGeometry");
    assert.include(workbench, "visitDiffTree(child.shadowRoot)");
    assert.include(workbench, "composedDiffHeaders.map(readElementBox)");
    assert.include(workbench, "composedDiffLines.map(readElementBox)");
  });
});
