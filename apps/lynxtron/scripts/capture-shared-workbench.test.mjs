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
    assert.include(
      source,
      'state?.lynx?.connectorDiagnostics?.lastCommandResult?.method === "readProjectBranch"',
    );
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
    assert.include(source, '"model-picker-empty": "model-picker"');
    assert.include(source, '"model-picker-selected": "model-picker"');
    assert.include(source, '"model-picker-empty": "__t3_no_models__"');
    assert.include(source, '"quick-switch-actions-only": "quick-switch"');
    assert.include(source, '"quick-switch-empty": "quick-switch"');
    assert.include(source, '"quick-switch-actions-only": ">"');
    assert.include(source, '"quick-switch-empty": "zzzz-no-result"');
    assert.include(source, 'stateId !== "model-picker-empty"');
    assert.include(source, "webMetrics.emptyText === lynxMetrics?.emptyText");
    assert.include(source, "if (!overlay) {");
    assert.include(source, "Overlay ${overlay} closed before screenshot capture.");
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
    assert.include(source, 'expectedStatus === "Working"');
    assert.include(source, "webThread?.status === expectedStatus");
    assert.include(source, "lynxThread?.status === expectedStatus");
    assert.include(source, "finalSessionProjectionReady");
    assert.include(source, "sessionProjection: {");
    assert.include(workbench, "querySelector('[role=\"status\"]')");
  });

  it("compares Composer toolbar allocation instead of renderer-specific raw box sizing", () => {
    assert.include(source, "function composerToolbarAllocationMatches");
    assert.include(source, "webMetrics?.anatomy?.toolbarAllocation");
    assert.include(source, "lynxMetrics?.anatomy?.toolbarAllocation");
    assert.include(source, "rectDeltaWithin(webAllocation, lynxAllocation, 1)");
    assert.include(source, "composerToolbarAllocationMatches(webMetrics, lynxMetrics)");
    assert.include(source, "composerToolbarAllocationMatches(webComposer, lynxComposer)");
  });

  it("hashes the Web entry bundle declared by index.html", () => {
    assert.include(source, "async function webEntryBundlePath");
    assert.include(source, "type=[\"']module[\"']");
    assert.include(source, "await hashFile(await webEntryBundlePath())");
    assert.notInclude(source, "findFirst(WEB_DIST, /assets\\/.*\\.js$/)");
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
