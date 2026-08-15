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
    assert.include(source, "state?.web?.timelineMetrics?.empty === null");
    assert.include(source, "state?.lynx?.timelineMetrics?.empty === null");
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
    assert.include(
      workbench,
      'settingsPanel?.querySelectorAll(":scope > .source-control-section")',
    );
    assert.include(
      workbench,
      'sourceControlRows: [...doc.querySelectorAll(".source-control-item")]',
    );
    assert.notInclude(source, "(state?.web?.settingsMetrics?.sectionTitles?.length ?? 0) === 0");
    assert.include(workbench, 'element.getAttribute("lynx-computed-display")');
    assert.include(workbench, 'style.getPropertyValue("--flex-direction")');
    assert.include(workbench, "element.getAttributeNames()");
    assert.include(workbench, "readElementAncestors(settingsPanel)");
    assert.include(workbench, 'root?.querySelectorAll(".settings-row")');
    assert.include(workbench, "children: [...item.children].map");
    assert.include(workbench, 'root?.querySelectorAll(".source-control-item")');
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

  it("compares clipped pending-question work rows by their visible outer box", () => {
    const capture = readFileSync(
      path.join(import.meta.dirname, "capture-shared-workbench.mjs"),
      "utf8",
    );
    assert.include(capture, "compareClippedOuterHeight");
    assert.include(capture, "timeline-row-root--user-input");
  });
});
