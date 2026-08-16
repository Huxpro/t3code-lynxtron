import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "verify-packaged-readiness.mjs"),
  "utf8",
);
const outcomeChecksSource = source.slice(
  source.indexOf("const outcomeChecks = ["),
  source.indexOf("].filter(Boolean);", source.indexOf("const outcomeChecks = [")),
);

describe("packaged readiness Sidebar geometry", () => {
  it("verifies every row and card with read-only DevTool box models", () => {
    assert.include(source, "--verify-sidebar-geometry");
    assert.include(source, '"--no-daemon"');
    assert.include(source, "DOM.querySelectorAll");
    assert.include(source, "DOM.getBoxModel");
    assert.include(source, "read-only Lynx DevTool DOM box models");
    assert.include(source, "Sidebar rows escaped the rail");
  });

  it("verifies the Native brand inset at every viewport", () => {
    assert.include(source, "async function verifySidebarGeometry(client, viewportWidth)");
    assert.include(source, 'readOptionalMeasurement(client, ".sidebar-brand")');
    assert.include(source, "Math.abs(brand.rect.x - 60) > 1");
    assert.notInclude(source, "viewportWidth !== 1280 &&");
    assert.include(source, "verifySidebarGeometry(client, width)");
  });

  it("keeps the scope gate focused on scope behavior", () => {
    assert.notInclude(source, 'selector: ".quick-switch-thread-row--other"');
    assert.notInclude(source, `selector: '[data-thread-active="false"]'`);
  });

  it("verifies current Composer Footer icon geometry without driving menus", () => {
    assert.include(source, "--verify-composer-geometry");
    assert.include(source, "--expected-theme");
    assert.include(source, 'themeRoot.attributes["data-theme"] === expectedTheme');
    assert.include(source, 'contextLegacyBand.style.display === "none"');
    assert.include(source, 'readSelectorRects(client, ".composer-context-light-band")');
    assert.include(source, "contextLightBands.length === 16");
    assert.include(source, "contextBackdrop.rect.y + index * 2");
    assert.include(source, 'contextLightBandFirst.style.backgroundColor === "rgb(222,222,222)"');
    assert.include(source, 'contextLightBandLast.style.backgroundColor === "rgb(254,254,254)"');
    assert.include(source, "composerThemeScreenshot");
    assert.include(source, "native-composer-${expectedTheme}.png");
    assert.notInclude(outcomeChecksSource, "composerThemeScreenshot");
    assert.include(source, ".composer-toolbar-control .pill__chevron-img");
    assert.include(source, ".composer-toolbar-control--runtime .pill__icon-img");
    assert.include(source, ".composer-toolbar-control--interaction .pill__icon-img");
    assert.include(source, "readSelectorStyleValues");
    assert.include(
      source,
      '".composer-toolbar-control .pill__icon-img, .composer-toolbar-control .pill__chevron-img"',
    );
    assert.include(source, "footerIconOpacities.some(wrongFooterIconOpacity)");
    assert.include(source, '".model-picker-anchor"');
    assert.include(source, '".composer-runtime-control-wrap"');
    assert.include(source, '".composer-context-control"');
    assert.include(source, ".composer-context-label--checkout");
    assert.include(source, ".composer-context-label--branch");
    assert.include(source, ".composer-context-icon");
    assert.include(source, "contextControls.length === 2");
    assert.include(source, "contextStrip.y + 20");
    assert.include(source, "<= 1.25");
    assert.include(source, "contextStrip.y + 24");
    assert.include(source, 'label.style.lineHeight === "16px"');
    assert.include(source, "contextLabelsAligned");
    assert.include(source, "contextIcons.length < 3");
    assert.include(source, "contextIcons.length > 4");
    assert.include(source, "Math.abs(rect.width - 12) > 0.75");
    assert.include(source, 'expectedTheme === "light" ? [113, 113, 122] : [129, 129, 129]');
    assert.include(source, "Math.abs(Number(match[4]) - 0.7) > 1 / 255");
    assert.include(source, "chevrons.length < 2");
    assert.include(source, "chevrons.length > 3");
    assert.include(source, "contextIcons.length < 3");
    assert.include(source, "contextIcons.length > 4");
    assert.include(source, "Composer Footer icon geometry drifted");
  });

  it("verifies Model Picker theme colors and both dismissal paths", () => {
    assert.include(source, "async function verifyModelPickerFidelity");
    assert.include(source, 'selector: ".model-picker-content"');
    assert.include(source, 'selector: ".model-picker-rail-scroll"');
    assert.include(source, 'panel: "rgb(25,25,25)"');
    assert.include(source, 'panel: "rgb(255,255,255)"');
    assert.include(source, 'selector: ".model-picker-close"');
    assert.include(source, 'selector: ".model-picker-dismiss-layer"');
    assert.include(source, 'point: "bottom-right"');
    assert.include(source, "outsideTap: true");
  });

  it("verifies a Native model row changes and persists the active thread selection", () => {
    assert.include(source, "async function verifyModelSelectionMutation");
    assert.include(source, '"--verify-model-selection-mutation"');
    assert.include(source, 'selector: ".model-picker-row--unselected"');
    assert.include(source, 'measurement?.attributes["data-model-picker-key"]');
    assert.include(source, "waitForSequenceAdvance");
    assert.include(source, "state?.activeThread?.modelSelection?.instanceId");
    assert.include(source, "readPersistedThreadModelSelection");
    assert.include(source, "projection_threads");
    assert.include(source, '"native-model-selection-after.png"');
  });

  it("verifies the runtime permission menu dismisses without changing value", () => {
    assert.include(source, "async function verifyRuntimeMenuDismiss");
    assert.include(source, '"--verify-runtime-menu-dismiss"');
    assert.include(source, 'selector: ".composer-runtime-menu-dismiss-layer"');
    assert.include(source, 'point: "bottom-right"');
    assert.include(source, "afterState?.activeThread?.runtimeMode !== beforeMode");
    assert.include(source, "valueUnchanged: true");
  });

  it("verifies model-option menus mutate and persist server-declared selections", () => {
    assert.include(source, "async function verifyModelOptionMenuMutation");
    assert.include(source, '"--verify-model-option-menu-mutation"');
    assert.include(source, 'T3_LYNXTRON_VIEWPORT_PROBE: "1"');
    assert.include(source, "__T3_LYNXTRON_MTS_PROVIDER_FIXTURE__");
    assert.include(source, 'selector: ".composer-model-option-menu__item--unselected"');
    assert.include(source, "data-composer-model-option-descriptor");
    assert.include(source, "readPersistedThreadModelSelection");
    assert.include(source, 'selector: ".composer-model-option-menu__item--selected"');
    assert.include(source, 'selector: ".composer-model-option-menu-dismiss-layer"');
    assert.include(source, "reopenedSelected: true");
  });

  it("drives titlebar panels and verifies Sidebar menu rows do not collapse", () => {
    assert.include(source, "async function verifyShellInteractions");
    assert.include(source, '"--verify-shell-interactions"');
    assert.include(source, 'selector: ".topbar__toggle--terminal"');
    assert.include(source, 'selector: ".terminal-placeholder"');
    assert.include(source, 'selector: ".topbar__toggle--right-panel"');
    assert.include(source, 'selector: "[data-sidebar-thread-action-trigger]"');
    assert.include(source, 'readSelectorRects(client, ".sidebar-v2-action-menu__item")');
    assert.include(source, "Math.abs(rect.height - 30) <= 0.5");
    assert.include(source, "Sidebar action menu rows collapsed");
  });

  it("verifies the Native Publish wizard and backdrop dismissal", () => {
    assert.include(source, "async function verifyGitPublishDialog");
    assert.include(source, '"--verify-git-publish-dialog"');
    assert.include(source, 'selector: ".action-btn--commit"');
    assert.include(
      source,
      'measurement?.attributes["data-git-quick-action-kind"] === "open_publish"',
    );
    assert.include(source, 'selector: ".git-publish-dialog"');
    assert.include(source, 'selector: ".git-publish-provider-card--active"');
    assert.include(source, 'measurement?.attributes["data-git-publish-provider"] === "github"');
    assert.include(source, 'readSelectorRects(client, "[data-git-publish-step-label]")');
    assert.include(source, 'readSelectorRects(client, "[data-git-publish-provider]")');
    assert.include(source, 'selector: ".git-publish-dismiss"');
    assert.include(source, "steps.length !== 3");
    assert.include(source, "providers.length !== 4");
    assert.include(source, "dismissed: true");
    assert.include(outcomeChecksSource, "gitPublishDialog");
  });

  it("verifies Native Beta mutation, disk persistence, and cold restart", () => {
    assert.include(source, "async function verifyBetaMutation");
    assert.include(source, "async function openBetaSettings");
    assert.include(source, '"--verify-beta-mutation"');
    assert.include(source, 'selector: ".settings-nav__item--beta"');
    assert.include(source, 'const selector = ".settings-toggle--auto-settle"');
    assert.include(source, 'measurement?.attributes["aria-checked"] === "false"');
    assert.include(source, 'selector: ".settings-number-input"');
    assert.include(source, "readIsolatedClientSettings(baseDir)");
    assert.include(source, "sidebarAutoSettleAfterDays !== null");
    assert.include(source, "disabledDiskValue");
    assert.include(source, "enabledDiskValue");
    assert.include(source, "Beta cold restart did not return an owned process id.");
    assert.include(source, "restartedProcessId");
    assert.include(source, "restartedClient");
    assert.include(source, "Beta auto-settle value changed across cold restart");
    assert.include(outcomeChecksSource, "betaMutation");
  });

  it("verifies Native Archive unarchive, rearchive, and cold restart", () => {
    assert.include(source, "async function verifyArchiveMutation");
    assert.include(source, "async function openArchiveSettings");
    assert.include(source, '"--verify-archive-mutation"');
    assert.include(source, 'selector: ".settings-nav__item--archived"');
    assert.include(
      source,
      'invokeConnector(client, "archiveThread", { threadId: targetThreadId })',
    );
    assert.include(source, "settings-archive-unarchive--${targetThreadId}");
    assert.include(source, "Archive cold restart did not return an owned process id.");
    assert.include(source, "restartedProcessId");
    assert.include(outcomeChecksSource, "archiveMutation");
  });

  it("verifies Native Connections pairing creation, revocation, and cold restart", () => {
    assert.include(source, "async function verifyConnectionsMutation");
    assert.include(source, "async function openConnectionsSettings");
    assert.include(source, '"--verify-connections-mutation"');
    assert.include(source, 'selector: ".settings-nav__item--connections"');
    assert.include(source, 'const createSelector = ".settings-connections-create-pairing"');
    assert.include(source, "settings-connections-revoke-pairing--${createdPairingLinkId}");
    assert.include(source, 'measurement?.text.trim() === "Copy code"');
    assert.include(source, 'measurement?.text.trim() === "Create"');
    assert.include(source, "Connections cold restart did not return an owned process id.");
    assert.include(outcomeChecksSource, "connectionsMutation");
  });

  it("restores the session-derived Composer state during lifecycle recovery", () => {
    assert.include(source, "async function verifyLifecycleRecovery");
    assert.include(source, "async function waitForSessionComposerProjection");
    assert.include(source, 'if (sessionStatus === "running") return "working"');
    assert.include(source, 'if (sessionStatus === "starting") return "disabled"');
    assert.include(source, "state.sessionStatus === shellSessionStatus");
    assert.include(source, 'connectedProjection.composer.attributes["data-composer-state"]');
    assert.include(source, 'measurement?.attributes["data-composer-primary-state"] === "disabled"');
    assert.include(source, "expectedSessionStatus: connectedProjection.sessionStatus");
    assert.include(source, "connectedComposer");
    assert.include(source, "disabledComposer");
    assert.include(source, "recoveredComposer");
  });

  it("verifies exact-bundle review patches from a real checkpoint fixture", () => {
    assert.include(source, "async function verifyReviewDiffState");
    assert.include(source, '"--verify-review-diff-state"');
    assert.include(source, 'selector: "[data-review-open-diff]"');
    assert.include(source, 'selector: ".diff-panel"');
    assert.include(source, 'selector: ".diff-code-file"');
    assert.include(
      source,
      'measurement?.attributes["data-review-file-path"] === expectedFile.path',
    );
    assert.include(source, 'measurement.text.includes("original review fixture")');
    assert.include(source, 'measurement.text.includes("updated by T3 review fixture")');
  });

  it("verifies distinct Native Review checkpoint preview and expanded tree states", () => {
    assert.include(source, "async function verifyReviewCheckpointStates");
    assert.include(source, '"--verify-review-checkpoint-states"');
    assert.include(source, 'selector: ".turn-diff-card__toggle"');
    assert.include(source, "const restored = await restoreOutcomeSurface");
    assert.include(source, 'measurement?.attributes["data-changed-files-state"] === "preview"');
    assert.include(source, "Math.abs(measurement.rect.height - 106) <= 1");
    assert.include(source, 'readOptionalMeasurement(client, "[data-review-tree]")');
    assert.include(source, 'measurement?.attributes["data-changed-files-state"] === "expanded"');
    assert.include(source, "Math.abs(measurement.rect.height - 79) <= 1");
    assert.include(source, 'readSelectorRects(client, "[data-review-file-path]")');
    assert.include(source, '"native-review-checkpoint-preview.png"');
    assert.include(source, '"native-review-tree.png"');
    assert.include(outcomeChecksSource, "reviewCheckpointStates");
  });

  it("restores right-panel state before isolated outcome checks", () => {
    assert.include(source, 'readOptionalMeasurement(client, ".right-panel")');
    assert.include(source, 'selector: ".right-panel__layout-control--close"');
    assert.include(source, 'closed.push("right-panel")');
  });

  it("verifies an empty new-thread Hero without borrowing lifecycle recovery", () => {
    assert.include(source, "async function verifyHeroComposerState");
    assert.include(source, '"--verify-hero-composer-state"');
    assert.include(source, '"--expected-model-label"');
    assert.include(source, '"--expect-no-composer-context"');
    assert.include(source, 'assertComposerRouteState({ hero, overlay }, "new-thread")');
    assert.include(source, "allowMissingContext: expectNoComposerContext");
    assert.include(source, "Non-repository Hero Composer rendered repository context.");
    assert.include(source, "heroOnlyEmptyFixture");
  });

  it("verifies idle from the canonical session projection rather than visual status", () => {
    assert.include(source, "async function verifyIdleThreadState");
    assert.include(source, '"--verify-idle-thread-state"');
    assert.include(source, 'state?.sessionStatus === "idle"');
    assert.include(source, "state?.activeTurnId === null");
    assert.include(source, "state?.latestTurn === null");
    assert.include(source, 'selector: ".transcript-empty"');
    assert.include(source, 'readSelectorRects(client, ".timeline-row-root")');
    assert.include(source, 'readSelectorRects(client, ".timeline-list")');
    assert.include(source, "Idle thread rendered timeline content");
    assert.include(source, "idleFixture.messageCount !== 0");
    assert.include(source, 'measurement?.attributes["data-composer-state"] === "idle"');
    assert.include(source, 'readOptionalMeasurement(client, ".chat-body-reference")');
    assert.include(source, "Idle transcript placeholder lost the shared chat body");
    assert.include(source, "allowMissingContext: expectNoComposerContext");
    assert.include(source, "Non-repository idle thread rendered repository context.");
  });

  it("verifies the Native default Quick Switch and outside dismissal", () => {
    assert.include(source, "async function verifyQuickSwitchDefault");
    assert.include(source, '"--verify-quick-switch-default"');
    assert.include(source, 'selector: ".palette-panel"');
    assert.include(source, 'readSelectorRects(client, ".palette-row")');
    assert.include(source, '"Quick Switch idle thread"');
    assert.include(source, 'selector: ".palette-backdrop"');
    assert.include(source, "initialOverlay product state plus measured DevTool outside tap");
  });

  it("captures Native General Settings content and geometry before route cycling", () => {
    assert.include(source, 'selector: ".settings-content--general"');
    assert.include(source, 'measurement.text.includes("Project grouping")');
    assert.include(source, 'measurement.text.includes("Diagnostics")');
    assert.include(source, "const generalSections = await readSelectorRects(");
    assert.include(source, '".settings-content--general .settings-section"');
    assert.include(source, 'readSelectorRects(client, ".settings-content--general .settings-row")');
    assert.include(source, 'name: "native-settings-general.png"');
    assert.include(source, 'selector: ".settings-content--source-control"');
    assert.include(source, 'measurement.text.includes("Text generation")');
    assert.include(source, 'readSelectorRects(client, ".source-control-item")');
    assert.include(source, 'readSelectorRects(client, ".source-control-writing-row")');
    assert.include(source, 'name: "native-settings-source-control.png"');
  });

  it("verifies unavailable Appearance rows as muted disabled capabilities", () => {
    assert.include(source, 'selector: ".settings-content--appearance"');
    assert.include(source, "async function readSelectorMeasurements");
    assert.include(source, "rows.length !== unavailableTitles.length + 1");
    assert.include(source, "availableRows.length !== 1");
    assert.include(source, 'theme.attributes["aria-disabled"] === "true"');
    assert.include(source, '"Glass opacity"');
    assert.include(source, '"Environment identification"');
    assert.include(source, '"Word wrap"');
    assert.include(source, 'row.attributes["data-settings-unavailable"] === "true"');
    assert.include(source, "unavailableRows.length !== unavailableTitles.length");
    assert.include(source, 'row.attributes["aria-disabled"] !== "true"');
    assert.include(source, '".settings-content--appearance .settings-row--unavailable"');
    assert.include(source, "Math.abs(Number(opacity) - 0.48) > 1 / 255");
    assert.include(source, 'name: "native-settings-appearance-unavailable.png"');
  });

  it("verifies the exact-bundle Source Control error anatomy and retry", () => {
    assert.include(source, "async function verifySourceControlErrorBehavior");
    assert.include(source, '"--verify-source-control-error"');
    assert.include(source, 'T3_TEST_SOURCE_CONTROL_DISCOVERY_ERROR: "1"');
    assert.include(source, "async function waitForSourceControlDiscoveryError");
    assert.include(
      source,
      'latest.message === "Source-control discovery is unavailable in this test environment."',
    );
    assert.include(source, 'selector: ".source-control-empty"');
    assert.include(source, 'readSelectorRects(client, ".source-control-empty__title")');
    assert.include(source, 'readSelectorRects(client, ".source-control-empty__description")');
    assert.include(source, 'readSelectorRects(client, "[data-source-control-retry]")');
    assert.include(source, "Math.abs(sections[0].height - 396) > 1");
    assert.include(source, "Math.abs(empty.height - 352) > 1");
    assert.include(source, "Math.abs(sectionGap - 48) > 2");
    assert.include(source, "waitForSequenceAdvance");
    assert.include(source, '"native-settings-source-control-error.png"');
    assert.include(outcomeChecksSource, "sourceControlError");
  });

  it("verifies the exact-bundle Source Control loading anatomy", () => {
    assert.include(source, "async function verifySourceControlLoadingBehavior");
    assert.include(source, '"--verify-source-control-loading"');
    assert.include(source, 'T3_TEST_SOURCE_CONTROL_DISCOVERY_PENDING: "1"');
    assert.include(source, "async function waitForConnectorCommand");
    assert.include(source, 'method: "readProjectBranch"');
    assert.include(source, "params: { cwd: projectCwd }");
    assert.include(source, 'selector: ".settings-content--source-control"');
    assert.include(source, 'readSelectorRects(client, "[data-source-control-loading-row]")');
    assert.include(source, "Math.abs(sections[0].height - 176) > 1");
    assert.include(source, "Math.abs(sections[2].y - 536) > 1");
    assert.include(source, "rows.length !== 4");
    assert.include(source, '"native-settings-source-control-loading.png"');
    assert.include(outcomeChecksSource, "sourceControlLoading");
  });

  it("verifies the Native working transcript layout and locked workspace copy", () => {
    assert.include(source, "readComposerOutcome(client, { allowMissingInteraction: true })");
    assert.include(source, "assertComposerGeometry(composer, { allowMissingInteraction: true })");
    assert.include(source, 'readSelectorRects(client, ".timeline-list")');
    assert.include(source, 'readSelectorRects(client, ".timeline-row-root--working")');
    assert.include(source, 'readSelectorRects(client, ".transcript-working-row")');
    assert.include(source, "Math.abs(firstRow.y - (timelineList.y + 16)) <= 1");
    assert.include(source, "Math.abs(workingRowRoot.height - 40) <= 0.5");
    assert.include(source, 'checkoutLabel !== "Local checkout"');
  });

  it("verifies the Native completed transcript layout and canonical response", () => {
    assert.include(source, "async function verifyCompletedTranscriptState");
    assert.include(source, "readSelectorRects(");
    assert.include(source, "const assistantRowRoot = rowRoots[1]");
    assert.notInclude(source, '".timeline-row-root--assistant"');
    assert.include(source, 'readSelectorRects(client, ".timeline-host")');
    assert.include(source, "Math.abs(rowRoots[0].y - (timelineHost.y + 48)) <= 1");
    assert.include(source, "Math.abs(assistantRowRoot.height - (assistantRow.height + 16)) <= 0.5");
    assert.include(source, 'assistantText !== "fidelity loop complete"');
    assert.include(source, '"--verify-completed-transcript-state"');
    assert.include(source, "allowMissingInteraction: true");
    assert.include(source, '".model-picker-anchor > .composer-toolbar-control--model"');
  });

  it("verifies the Native failed transcript banner, fallback model, and error row", () => {
    assert.include(source, "async function verifyFailedTranscriptState");
    assert.include(source, '".thread-error-banner"');
    assert.include(source, '".thread-error-description"');
    assert.include(source, 'modelText === "Big Pickle"');
    assert.include(
      source,
      'errorDescription?.text.includes("Model not found: opencode/not-a-real-model.")',
    );
    assert.include(source, '".transcript-work-status--failed"');
    assert.include(source, '"--verify-failed-transcript-state"');
    assert.include(source, "transcriptFixture?.title");
    assert.include(source, "transcriptFixture?.modelSelection");
  });

  it("verifies the real Native approval request content, state, and column geometry", () => {
    assert.include(source, "async function verifyApprovalTranscriptState");
    assert.include(source, '".composer-pending-approval"');
    assert.include(source, '".composer-pending-approval__detail"');
    assert.include(source, '".composer-editor-area--approval"');
    assert.include(source, '".composer-footer--approval"');
    assert.include(source, '".composer-approval-action--accept"');
    assert.include(source, 'clientState?.sessionStatus === "running"');
    assert.include(source, 'frame?.attributes["data-composer-state"] === "working"');
    assert.include(source, "approximately(footer?.rect?.y");
    assert.include(source, '"native-approval.png"');
    assert.include(source, '"--verify-approval-transcript-state"');
    assert.include(source, "fixtureManifest.pendingRequestFixture");
  });

  it("verifies stale Native approval decline recovery and cold restart", () => {
    assert.include(source, "async function verifyApprovalDeclineMutation");
    assert.include(source, '"--verify-approval-decline-mutation"');
    assert.include(source, 'const selector = ".composer-approval-action--decline"');
    assert.include(source, "const threadId = approvalFixture.threadId");
    assert.include(source, "const requestId = approvalFixture.activity.payload.requestId");
    assert.include(source, 'receipt.kind === "provider.approval.respond.failed"');
    assert.include(source, "Stale approval decline faked a resolution receipt");
    assert.include(source, "replayedReceipt:");
    assert.include(source, "pendingRestored: false");
    assert.include(source, "Approval cold restart did not return an owned process id.");
    assert.include(outcomeChecksSource, "approvalDeclineMutation");
    assert.isBelow(
      source.indexOf("const approvalTranscriptState ="),
      source.indexOf("let approvalDeclineMutation;"),
    );
  });

  it("selects and submits a real Native pending question", () => {
    assert.include(source, "async function verifyQuestionTranscriptState");
    assert.include(source, '"--verify-question-transcript-state"');
    assert.include(source, '".composer-pending-question"');
    assert.include(source, '".composer-surface--question"');
    assert.include(source, '".composer-question-submit"');
    assert.include(source, "data-question-option-selected");
    assert.include(source, "hasPendingUserInput === false");
    assert.include(source, '"native-question.png"');
  });
});
