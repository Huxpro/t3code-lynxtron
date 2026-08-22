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

  it("only requires provider notification dismissal for states that clear it", () => {
    assert.include(source, "async function dismissWebProviderNotification");
    assert.include(source, "let clickAttempts = 0");
    assert.include(source, "clickAttempts < 3");
    assert.include(source, "nextClickAt = Date.now() + 750");
    assert.include(source, "rect.width <= 0");
    assert.include(source, "style?.pointerEvents === 'none'");
    assert.include(source, "Number(style?.opacity ?? 1) <= 0");
    assert.include(
      source,
      "await dispatchPointerClickWithMove(cdp, sessionId, notification.point)",
    );
    assert.include(source, "if (notification?.present === false) return true");
    assert.include(source, "await dismissWebProviderNotification(cdp, sessionId)");
    assert.include(source, "if (shouldClearWebNotification && !notificationDismissed)");
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
    assert.include(source, "web-outside-pointer|lynx-dismiss-layer-pointer");
    assert.include(source, "web-terminal-row-pointer|lynx-terminal-row-pointer");
    assert.include(source, "data-terminal-placeholder");
  });

  it("captures the newly discovered Sidebar project-settings scope without hiding a missing Lynx entry", () => {
    const workbench = readFileSync(
      path.join(import.meta.dirname, "shared-workbench/workbench.js"),
      "utf8",
    );

    assert.include(source, 'stateId === "sidebar-project-settings"');
    assert.include(source, '"sidebar-project-settings": "existing-thread"');
    assert.include(source, 'argValue("--project-settings-expect", "missing")');
    assert.include(source, '["missing", "parity"].includes(projectSettingsExpectation)');
    assert.include(source, "function projectSettingsReady(state, interaction)");
    assert.include(source, 'state?.web?.productState?.overlay === "project-settings-dialog"');
    assert.include(source, 'state?.lynx?.productState?.overlay === "project-scope"');
    assert.include(source, "interaction?.lynxScopeActionCount === 0");
    assert.include(source, "interaction?.webActionClicked === true");
    assert.include(source, "interaction?.lynxActionClicked === true");
    assert.include(source, "projectSettingsInteraction");
    assert.include(source, "projectSettingsTimeline");
    assert.include(source, "dual-scope-pointer|web-project-action-pointer");
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
    assert.include(source, "Boolean(overlay) ||");
    assert.include(source, "isFilesSurfaceState ||");
    assert.include(source, "isReviewState;");
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
    assert.include(source, "!isDiffScopeMenuState &&");
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
    assert.include(source, '"file-editor-detail-narrow-inline",');
    assert.include(source, '"file-editor-detail": "existing-thread"');
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
    assert.include(source, "web.editor?.rect?.width >= 320");
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
    assert.include(workbench, "fileEditorMetrics: readFileEditorMetrics(root)");
    assert.include(workbench, "fileEditorMetrics: readFileEditorMetrics(doc)");
    assert.include(workbench, 'root?.querySelector(".file-panel")');
    assert.include(workbench, 'root?.querySelector("[data-file-breadcrumbs]")');
    assert.include(workbench, 'root?.querySelector(".file-preview-virtualizer")');
    assert.include(workbench, 'lynxSurface?.querySelector(".file-panel__explorer")');
    assert.include(workbench, 'lynxSurface?.querySelector(".file-editor-preview")');
    assert.include(workbench, "root?.querySelector('[aria-label=\"Back to workspace files\"]')");
    assert.include(workbench, "rect.width <= 0");
    assert.include(workbench, "editorValueLength:");
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
    assert.include(source, "isComposerPlanModeState ||");
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
    assert.include(source, "webRoute: captureWebRoute");
    assert.include(source, "function composerPlanModeMatches(state)");
    assert.include(source, 'className.includes("bg-blue-500/10")');
    assert.include(source, 'className.includes("text-blue-400")');
    assert.include(source, 'className.includes("composer-toolbar-control--interaction-plan")');
    assert.include(source, "SET interaction_mode = 'plan'");
    assert.include(source, 'queryReport.rows[0]?.interaction_mode === "plan"');
    assert.include(source, 'kind: "thread-interaction-mode"');
    assert.include(source, "const planModeReady = composerPlanModeMatches(state)");
    assert.include(source, "const finalPlanModeReady = composerPlanModeMatches(state)");
    assert.include(source, "finalPlanModeReady,");
    assert.include(source, "planMode:");
    assert.include(source, "interactionMode: webState.interactionMode");
    assert.include(source, "interactionMode: lynxState.interactionMode");
    assert.include(workbench, "function readComposerInteractionSeparator");
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
    assert.include(source, "isFlatSidebarLayoutState || coreGeometryMatches");
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
    assert.include(source, 'step: "dismissed"');
    assert.include(source, "opened before the 600ms authority delay");
    assert.include(source, "clickSidebarControl");
    assert.include(source, "clickPaletteBack");
    assert.include(source, "newThreadProjectsMatch");
    assert.include(source, 'paletteView === "new-thread-projects"');
    assert.include(source, "finalNewThreadProjectsReady");
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
    assert.include(source, "JSON.stringify(canonical(webRows))");
    assert.include(source, "!rectDeltaWithin(webHeader, lynxHeader, 2)");
    assert.include(source, "const sharedColumnGeometry");
    assert.include(source, "if (columnIndex !== 3) return true");
    assert.include(source, '"settings-providers": "settings-general"');
    assert.include(source, '"settings-providers": "Providers"');
    assert.include(source, "function providerSettingsContentMatches");
    assert.include(source, "function providerSettingsGeometryMatches");
    assert.include(source, "webProviders?.inlineCreate === null");
    assert.include(source, "lynxProviders?.inlineCreate === null");
    assert.include(source, "providerSettingsContentMatches(");
    assert.include(source, "providerSettingsGeometryMatches(");
    assert.include(
      source,
      "fileEditingSaveEvidence: !isFileEditingSaveState || fileEditingSaveEvidence !== null",
    );
    assert.include(workbench, "function readProviderSettingsMetrics");
    assert.include(workbench, 'root?.querySelectorAll(".provider-instance-card")');
    assert.include(workbench, 'root?.querySelector(".provider-instance-create")');
    assert.include(workbench, 'readComposedText(title) === "Health check interval"');
    assert.include(workbench, 'const titleElement = card.querySelector(".truncate")');
    assert.include(workbench, 'expectedSemanticRoute === "settings-providers"');
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
