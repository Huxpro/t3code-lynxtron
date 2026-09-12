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
  it("resolves the selected Lynxtron runtime through the package native-paths export", () => {
    assert.include(source, 'import { createRequire } from "node:module"');
    assert.include(source, "const require = createRequire(import.meta.url)");
    assert.include(source, 'require("@lynx-js/lynxtron/native-paths")');
    assert.include(source, 'typeof nativePaths.executablePath === "string"');
    assert.include(source, "return nativePaths.executablePath");
    assert.include(source, "Lynxtron before 0.0.21 did not expose runtime-aware native paths");
  });

  it("attaches verification to an existing environment without reporting credentials", () => {
    assert.include(source, '"--pairing-url-file"');
    assert.include(source, "T3_LYNXTRON_PAIRING_URL: pairingUrl");
    assert.include(source, 'mode: pairingUrl ? "existing-environment" : "owned-local"');
    assert.include(source, "serverOwned: !pairingUrl");
    assert.include(source, "if (!pairingUrl) {");
    assert.notInclude(source, "pairingUrl,\n      transport,");
  });

  it("verifies every row and card with read-only DevTool box models", () => {
    assert.include(source, "--verify-sidebar-geometry");
    assert.include(source, '"--no-daemon"');
    assert.include(source, "DOM.querySelectorAll");
    assert.include(source, "DOM.getBoxModel");
    assert.include(source, "read-only Lynx DevTool DOM box models");
    assert.include(source, "Sidebar rows escaped the rail");
  });

  it("verifies the Native brand inset at every viewport", () => {
    assert.include(
      source,
      "async function verifySidebarGeometry(client, viewportWidth, expectedEnvironmentIdentificationMode)",
    );
    assert.include(source, 'readOptionalMeasurement(client, ".sidebar-brand")');
    assert.include(source, "Math.abs(brand.rect.x - 130) > 1");
    assert.notInclude(source, "viewportWidth !== 1280 &&");
    assert.include(
      source,
      "verifySidebarGeometry(client, width, expectedEnvironmentIdentificationMode)",
    );
  });

  it("verifies symmetric Sidebar cards and session-derived Working duration", () => {
    assert.include(source, "Math.abs(leftInset - rightInset) > 1");
    assert.include(source, "Math.abs(row.width - threadList.width) > 1");
    assert.include(source, "Math.abs(card.width - threadList.width) > 1");
    assert.include(source, "Sidebar card insets are asymmetric");
    assert.include(source, 'sessionStatus === "running"');
    assert.include(source, "clientState?.activeThread?.hasPendingApprovals !== true");
    assert.include(source, "clientState?.activeThread?.hasPendingUserInput !== true");
    assert.include(source, 'activeStatus?.text.includes("Working") === true');
    assert.include(source, '".sidebar-v2-row-item--active .sidebar-v2-working-duration"');
    assert.include(source, "/^(?:\\d+s|\\d+m|\\d+h \\d+m)$/u.test(durationText)");
    assert.include(source, "/Working (?:\\d+s|\\d+m|\\d+h \\d+m)/u.test");
    assert.notInclude(source, "activeStatus?.text.includes(durationText)");
    assert.include(source, "Sidebar Working label disagrees with the active session");
    assert.include(source, "Sidebar Working metadata escaped its card anchor");
    assert.include(source, "Math.abs(cardRight - (statusRect.x + statusRect.width) - 10) > 2");
    assert.include(source, "Sidebar project controls drifted from the Sidebar rail");
    assert.include(source, "Math.abs(newProjectRightInset - 8) > 2");
    assert.include(source, "Math.abs(projectScopeCenterY - newProjectCenterY) > 1");
    assert.include(source, "const runningSidebarGeometry =");
    assert.include(source, 'runningState.sessionStatus === "running"');
    assert.include(source, "runningSidebarGeometry,");
  });

  it("verifies Native Sidebar inline search rows and real-tap selection", () => {
    assert.include(source, "async function verifySidebarInlineSearch");
    assert.include(source, '"--verify-sidebar-inline-search"');
    assert.include(source, "__T3_LYNXTRON_SIDEBAR_SEARCH_PROBE__");
    assert.include(source, 'row.attributes["data-sidebar-search-result"]');
    assert.include(source, 'readSelectorMeasurements(client, ".sidebar-v2-search-result")');
    assert.include(
      source,
      'sourceContract: \'listId="sidebar-thread-search-results" role="listbox"\'',
    );
    assert.include(source, 'rows.some((row) => row.attributes.role !== "option")');
    assert.include(source, "Math.abs((row.rect?.height ?? 0) - 36) <= 1");
    assert.include(source, 'rows[0]?.attributes["aria-selected"] === "true"');
    assert.include(source, 'attribute: "data-sidebar-search-result"');
    assert.include(source, "state?.activeThreadId === targetThreadId");
    assert.include(source, 'selector: ".sidebar-inline-search__input"');
    assert.include(source, "queryCleared:");
    assert.include(source, 'keyboard: "pending-user-session"');
    assert.include(outcomeChecksSource, "sidebarInlineSearch");
  });

  it("verifies floating surfaces through trigger relations instead of viewport coordinates", () => {
    assert.include(source, '"--verify-floating-relations"');
    assert.include(source, "measureFloatingRelation(anchor, popup, placement)");
    assert.include(source, "floatingRelationResidual(metrics, placement)");
    assert.include(source, "__T3_LYNXTRON_TOOLTIP_PROBE__");
    assert.include(source, 'invokeTooltipProbe(relationId, "hover")');
    assert.include(source, 'invokeTooltipProbe(initialRelationId, "leave")');
    assert.include(source, "await waitWhileAlive(child, 200)");
    assert.include(source, "opened after a hover left before the delay elapsed");
    assert.include(source, 'anchorSelector: ".sidebar-v2-new-thread"');
    assert.include(source, 'relationId: "sidebar-new-thread-tooltip"');
    assert.include(source, "expectedText: /^New thread(?: \\(.+\\))?$/u");
    assert.include(source, 'anchorSelector: ".sidebar-v2-new-project"');
    assert.include(source, 'relationId: "sidebar-new-project-tooltip"');
    assert.include(source, 'expectedText: "New project"');
    assert.include(source, "const popup = await waitForSelectorAttributeMeasurement({");
    assert.include(source, 'attribute: "data-floating-popup"');
    assert.include(source, 'selector: ".lynx-tooltip-popup"');
    assert.include(source, "const content = await waitForStableMeasurement({");
    assert.include(source, 'selector: ".lynx-tooltip-content-motion"');
    assert.include(source, "measurement.rect.height >= 24");
    assert.include(source, "popup: content.rect");
    assert.include(source, "opened after hover left before the 600ms delay elapsed");
    assert.include(source, "openDelayMs: 600");
    assert.include(source, "closeDelayMs: 0");
    assert.include(source, 'physicalPointer: "pending-user-session"');
    assert.include(
      source,
      'const initialRelationId = initialCard.attributes["data-floating-anchor"]',
    );
    assert.include(source, '".sidebar-v2-details-popover"');
    assert.include(source, "await waitWhileAlive(child, 75)");
    assert.include(source, "opened before the 150ms authority delay elapsed");
    assert.include(source, 'selector: ".sidebar-v2-details-title"');
    assert.include(source, 'readSelectorMeasurements(client, ".sidebar-v2-details-row")');
    assert.include(source, "clientState?.environmentLabel");
    assert.include(source, "JSON.stringify(actualDetailRows)");
    assert.include(source, "openedAfterMs < 100");
    assert.include(source, "openedAfterMs > 500");
    assert.include(source, 'name: `native-sidebar-thread-hover-${expectedTheme ?? "system"}.png`');
    assert.include(source, "dismissedAfterMs");
    assert.include(source, "quickLeaveCancelled: true");
    assert.include(source, "openDelayMs: 150");
    assert.include(source, 'side: "right", align: "start", sideOffset: 4');
    assert.include(source, "__T3_LYNXTRON_MTS_RESIZE_PROBE__?.sidebar(256,320)");
    assert.include(source, "Sidebar details did not follow its resized anchor");
    assert.include(source, '".model-picker-anchor"');
    assert.include(source, 'side: "top", align: "start", sideOffset: 4');
    assert.include(outcomeChecksSource, "floatingRelations");
  });

  it("verifies the Native Project Action dialog layout and dismissal", () => {
    assert.include(source, "async function verifyProjectActionDialog");
    assert.include(source, '"--verify-project-action-dialog"');
    assert.include(source, '".action-btn--add"');
    assert.include(source, '".project-action-dialog__header"');
    assert.include(source, '".project-action-dialog__body"');
    assert.include(source, '".project-action-dialog__footer"');
    assert.include(source, '".project-action-field__input--name"');
    assert.include(
      source,
      'fields.keybinding?.attributes["data-keybinding-input-mode"] !== "canonical-text"',
    );
    assert.include(source, 'point: "bottom-right"');
    assert.include(source, "buttons.length !== 2");
    assert.include(source, "projectActionDialog,");
    assert.include(outcomeChecksSource, "projectActionDialog");
  });

  it("verifies Project Action keybindings persist beside the saved script", () => {
    assert.include(source, "async function verifyProjectActionKeybindingMutation");
    assert.include(source, '"--verify-project-action-keybinding-mutation"');
    assert.include(source, "__T3_LYNXTRON_PROJECT_ACTION_PROBE__");
    assert.include(source, 'const keybinding = "mod+shift+y"');
    assert.include(source, "const keybindingCommand = `script.${actionId}.run`");
    assert.include(source, 'path.join(baseDir, "userdata", "keybindings.json")');
    assert.include(source, 'selector: ".project-action-dialog__button--primary"');
    assert.include(source, 'keybinding: "mod+shift"');
    assert.include(source, 'selector: ".project-action-dialog__error"');
    assert.include(source, 'measurement?.text.trim() === "Invalid keybinding."');
    assert.include(source, "Invalid Project Action keybinding changed persisted state");
    assert.include(source, "state?.activeProject?.scripts?.some");
    assert.include(source, "state?.keybindingCommands?.includes(keybindingCommand) === true");
    assert.include(source, "Native Project Action saved the script without its keybinding");
    assert.include(source, "Project Action cold restart did not return an owned process id");
    assert.include(source, "Project Action keybinding changed across cold restart");
    assert.include(source, "projectActionKeybindingVerification.outcome");
    assert.include(source, "projectActionKeybindingMutation,");
    assert.include(outcomeChecksSource, "projectActionKeybindingMutation");
  });

  it("verifies the Native Sidebar project-settings entry, dialog, grouping, and removal confirmation", () => {
    assert.include(source, "async function verifyProjectSettingsDialog");
    assert.include(source, '"--verify-project-settings-dialog"');
    assert.include(source, 'selector: ".sidebar-v2-project-scope-trigger"');
    assert.include(source, '".sidebar-v2-project-action"');
    assert.include(source, '".project-settings-dialog"');
    assert.include(source, '".project-settings-name-input"');
    assert.include(source, '".project-settings-grouping-trigger"');
    assert.include(source, '".project-settings-grouping-option"');
    assert.include(source, 'attribute: "data-project-grouping-option"');
    assert.include(source, 'selector: ".project-settings-grouping-option"');
    assert.include(source, 'value: "separate"');
    assert.include(source, '".project-settings-remove-confirm"');
    assert.include(source, 'point: "bottom-right"');
    assert.include(source, 'keyboardRename: "pending-user-session"');
    assert.include(source, "projectSettingsDialog,");
    assert.include(outcomeChecksSource, "projectSettingsDialog");
  });

  it("verifies titlebar branding artwork and none modes without moving the brand", () => {
    assert.include(source, '"--expected-environment-identification-mode"');
    assert.include(source, '".sidebar__brand-bg"');
    assert.include(source, 'expectedEnvironmentIdentificationMode === "artwork"');
    assert.include(source, 'brand.attributes.class?.includes("sidebar-brand--on-backdrop")');
    assert.include(source, "Sidebar branding mode drifted");
    assert.include(source, "environmentIdentificationMode: expectedEnvironmentIdentificationMode");
  });

  it("keeps the scope gate focused on scope behavior", () => {
    assert.notInclude(source, 'selector: ".quick-switch-thread-row--other"');
    assert.notInclude(source, `selector: '[data-thread-active="false"]'`);
  });

  it("verifies current Composer Footer icon geometry without driving menus", () => {
    assert.include(source, "--verify-composer-geometry");
    assert.include(source, "--expected-theme");
    assert.include(source, 'themeRoot.attributes["data-theme"] === expectedTheme');
    assert.include(source, '".composer-frame"');
    assert.include(source, '"box-shadow"');
    assert.include(source, 'frameShadow.includes("-18px")');
    assert.include(source, 'frameShadow.includes("#00000066")');
    assert.include(source, "!frameShadowMatches");
    assert.include(
      source,
      '{ id: "contextLegacyBand", lynx: ".composer-context-backdrop-band--1" }',
    );
    assert.include(source, 'contextLegacyBand.style.display === "none"');
    assert.include(source, '".composer-context-backdrop-band--seam"');
    assert.include(source, 'contextSeamColor === "rgb(255,255,255)"');
    assert.include(source, 'contextSeamDisplay !== "none"');
    assert.include(source, 'readSelectorRects(client, ".composer-context-light-band")');
    assert.include(source, '"background-color"');
    assert.include(source, "contextLightBands.length === 31");
    assert.include(source, "contextBackdrop.rect.y + index");
    assert.include(source, 'contextLightBandColors[0] === "rgb(222,222,222)"');
    assert.include(source, 'contextLightBandColors[15] === "rgb(250,250,250)"');
    assert.include(source, 'contextLightBandColors[30] === "rgb(255,255,255)"');
    assert.notInclude(source, "contextLightBandFirst");
    assert.notInclude(source, "contextLightBandLast");
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

  it("verifies the Native active Plan chip after real interaction-mode input", () => {
    assert.include(source, "async function verifyActivePlanModeChip");
    assert.include(source, "async function verifyPlanMode");
    assert.include(source, '"--verify-plan-mode"');
    assert.include(source, 'measurement?.text.trim() === "Plan"');
    assert.include(source, "composer-toolbar-control--interaction-plan");
    assert.include(source, 'selector: ".composer-interaction-mode-separator"');
    assert.include(
      source,
      'selector: ".composer-toolbar-control--interaction-plan .pill__icon-img"',
    );
    assert.include(source, 'color !== "rgb(96,165,250)"');
    assert.include(source, 'iconOpacity !== "1"');
    assert.include(source, "backgroundColor,");
    assert.include(source, "iconOpacity,");
    assert.include(source, 'state?.activeThread?.interactionMode !== "plan"');
    assert.include(source, "readPersistedThreadInteractionMode(baseDir, threadId)");
    assert.include(source, 'persistedInteractionMode !== "plan"');
    assert.include(source, "const activeChip = await verifyActivePlanModeChip");
    assert.include(source, 'name: "native-composer-plan-mode.png"');
    assert.include(
      source,
      'input: "pre-seeded persisted Plan state; interaction mutation is a separate harness check"',
    );
    assert.include(outcomeChecksSource, "planMode");
  });

  it("treats the requested theme as a packaged-run precondition", () => {
    assert.include(source, "async function verifyExpectedTheme");
    assert.include(source, 'selector: ".app-theme-root"');
    assert.include(source, 'measurement?.attributes["data-theme"] === expectedTheme');
    assert.include(source, "themePreference: expectedTheme");
    assert.include(source, "const theme = await verifyExpectedTheme");
    assert.include(source, "theme,");
  });

  it("verifies the exact Native Send material without submitting a turn", () => {
    assert.include(source, "async function verifyComposerSendMaterial");
    assert.include(source, '"--verify-composer-send-material"');
    assert.include(source, "selectSessionlessFixtureThread");
    assert.include(source, "__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__");
    assert.include(source, 'selector: ".composer-primary-action"');
    assert.include(
      source,
      'measurement.attributes.class?.includes("composer-primary-action--send")',
    );
    assert.include(source, "sendBackgroundMatches(measurement.style.backgroundColor)");
    assert.include(source, "Math.abs(Number(match[4]) - 0.9) <= 1 / 255");
    assert.include(source, 'selector: ".composer-primary-action image"');
    assert.include(source, 'input: "test-only Composer state fixture; no turn submitted"');
    assert.include(source, 'name: "native-composer-send-material.png"');
    assert.include(
      source,
      "shouldVerifyModelOptionMenuMutation ||\n      shouldVerifyComposerSendMaterial ||\n      shouldVerifySidebarInlineSearch",
    );
    assert.include(outcomeChecksSource, "composerSendMaterial");
  });

  it("verifies Model Picker provider navigation, theme colors, and both dismissal paths", () => {
    assert.include(source, "async function verifyModelPickerFidelity");
    assert.include(
      source,
      "await selectSessionlessFixtureThread({\n    baseDir,\n    child,\n    client,\n    timeoutMs,",
    );
    assert.include(source, 'selector: ".model-picker-content"');
    assert.include(source, 'selector: ".model-picker-rail-scroll"');
    assert.include(source, 'readSelectorMeasurements(client, ".model-picker-rail-item")');
    assert.include(source, "Math.abs(rail.rect.width - 44) > 1");
    assert.include(source, "Math.abs((item.rect?.width ?? 0) - 36) > 1");
    assert.include(source, "providerGeometry:");
    assert.include(source, 'attribute: "data-model-picker-provider"');
    assert.include(source, 'selector: ".model-picker-rail-item--active"');
    assert.include(source, "Native model picker rows did not switch provider");
    assert.include(source, "pickerRemainedOpen: true");
    assert.include(source, "const setSearch = globalThis.__T3_LYNXTRON_MODEL_PICKER_SEARCH__");
    assert.include(source, 'if (typeof setSearch !== "function") return false');
    assert.include(source, "__T3_LYNXTRON_MODEL_PICKER_STATE__?.()");
    assert.include(source, 'await setSearch("pickle")');
    assert.include(source, 'JSON.stringify(["opencode:opencode/big-pickle"])');
    assert.include(source, "queryRail !== null");
    assert.include(source, 'await setSearch("__t3_no_models__")');
    assert.include(source, 'measurement?.text.trim() === "No models found"');
    assert.include(source, "emptyRows.length !== 0");
    assert.include(source, 'name: `native-model-picker-query-${expectedTheme ?? "system"}.png`');
    assert.include(source, 'name: `native-model-picker-empty-${expectedTheme ?? "system"}.png`');
    assert.include(source, 'physicalKeyboard: "pending-user-session"');
    assert.include(source, '"--model-picker-semantic-only"');
    assert.include(source, '"--model-picker-default-only"');
    assert.include(source, 'name: `native-model-picker-default-${expectedTheme ?? "system"}.png`');
    assert.include(source, 'panel: "rgb(25,25,25)"');
    assert.include(source, 'panel: "rgb(255,255,255)"');
    assert.include(source, 'rail: "rgba(250,250,250,0.298039)"');
    assert.include(source, 'readOptionalMeasurement(client, ".model-picker-dismiss-layer")');
    assert.include(source, "Native model picker retained its removed modal dismiss layer.");
    assert.include(source, 'selector: ".chat-body-reference"');
    assert.include(source, "viewportHeight: height");
    assert.include(source, "viewportWidth: width");
    assert.include(source, '["Current checkout", "Local checkout"]');
    assert.include(source, 'point: "bottom-right"');
    assert.include(source, 'closeButton: "not-rendered-by-design"');
    assert.include(source, "outsideTap: true");
  });

  it("verifies a Native model row changes and persists the active thread selection", () => {
    assert.include(source, "async function verifyModelSelectionMutation");
    assert.include(source, '"--verify-model-selection-mutation"');
    assert.include(source, 'selector: ".model-picker-row--unselected"');
    assert.include(source, 'const key = row.attributes["data-model-picker-key"]');
    assert.include(source, 'row.attributes["data-model-picker-disabled"] !== "true"');
    assert.include(source, 'attribute: "data-model-picker-key"');
    assert.include(source, "value: targetKey");
    assert.include(source, "waitForSequenceAdvance");
    assert.include(source, "state?.activeThread?.modelSelection?.instanceId");
    assert.include(source, "state?.modelSelectionPending === false");
    assert.include(source, "state?.modelSelectionError === null");
    assert.include(source, '"--verify-model-selection-socket-recovery"');
    assert.include(source, '"--verify-model-selection-running-session"');
    assert.include(source, "T3_TEST_MODEL_SELECTION_SOCKET_OPEN_ERROR_ONCE");
    assert.include(source, 'state?.sessionStatus === "running"');
    assert.include(source, "state?.activeThread?.session != null");
    assert.include(source, 'typeof state?.activeTurnId === "string"');
    assert.include(source, 'sessionState: requireRunningSession ? "running" : "sessionless-idle"');
    assert.include(
      source,
      '"[main-connector] setModelSelection hit a stale transport; reconnecting once"',
    );
    assert.include(source, '"reconnected-and-retried-once"');
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

  it("verifies Workspace menu relation, selection, and outside dismissal", () => {
    assert.include(source, "async function verifyWorkspaceMenu");
    assert.include(source, '"--verify-workspace-menu"');
    assert.include(source, 'selector: ".composer-context-control--checkout"');
    assert.include(source, 'readSelectorMeasurements(client, ".composer-workspace-menu__label")');
    assert.include(source, 'client.runCdp("DOM.getOuterHTML", { nodeId })');
    assert.include(source, "innerText || rawText");
    assert.include(source, 'selector: ".composer-workspace-menu__item--worktree"');
    assert.include(source, 'side: "top", align: "start", sideOffset: 4');
    assert.include(source, 'selector: ".composer-workspace-menu-dismiss"');
    assert.include(source, 'selector: ".composer-workspace-control-wrap--open"');
    assert.include(source, '".composer-model-option-control-wrap"');
    assert.include(source, '"z-index"');
    assert.include(source, "workspaceZIndex <= modelOptionZIndex");
    assert.include(source, "menuAboveModelOptions: true");
    assert.include(source, 'point: "center"');
    assert.include(source, 'measurement?.text.includes("Start from origin")');
    assert.include(source, "valueRetainedAfterDismiss");
  });

  it("verifies model-option menus mutate and persist server-declared selections", () => {
    assert.include(source, "async function verifyModelOptionMenuMutation");
    assert.include(source, '"--verify-model-option-menu-mutation"');
    assert.include(source, "__T3_LYNXTRON_MODEL_OPTION_MENU_WHEEL_PROBE__?.(120)");
    assert.include(source, 'scrolledMenu.attributes["data-wheel-offset"]');
    assert.include(source, "thinkingAfterScroll.rect.y < thinkingBeforeScroll.rect.y");
    assert.include(source, 'T3_LYNXTRON_VIEWPORT_PROBE: "1"');
    assert.include(source, "__T3_LYNXTRON_MTS_PROVIDER_FIXTURE__");
    assert.include(source, 'selector: ".composer-model-option-menu__item--unselected"');
    assert.include(source, "data-composer-model-option-descriptor");
    assert.include(source, "readPersistedThreadModelSelection");
    assert.include(source, "async function readModelOptionTracking");
    assert.include(
      source,
      '".composer-toolbar-control--model-option .composer-toolbar-control-label"',
    );
    assert.include(source, '"letter-spacing"');
    assert.include(source, "computedLetterSpacing !== expectedLetterSpacing");
    assert.include(source, 'expectedLetterSpacing: "-0.33px"');
    assert.include(source, 'expectedLetterSpacing: "-0.42px"');
    assert.include(source, 'expectedLetterSpacing: "-0.44px"');
    assert.include(source, 'name: "native-composer-model-option-tracking.png"');
    assert.include(source, 'selector: ".composer-model-option-menu__item--selected"');
    assert.include(source, 'selector: ".composer-model-option-menu-dismiss-layer"');
    assert.include(source, "reopenedSelected: true");
  });

  it("drives titlebar panels and verifies Sidebar menu rows do not collapse", () => {
    assert.include(source, "async function verifyShellInteractions");
    assert.include(source, '"--verify-shell-interactions"');
    assert.include(source, "const beforeNewThreadIds = beforeNewThreadState?.threadIds ?? []");
    assert.include(source, 'typeof state?.draftThreadId === "string"');
    assert.include(source, "state?.draftThreadId === firstDraftState.draftThreadId");
    assert.include(source, "canonicalThreadIdsBefore: beforeNewThreadIds");
    assert.include(source, "serverSequenceBefore: beforeNewThreadSequence.lastSeq");
    assert.include(source, 'selector: ".topbar__toggle--terminal"');
    assert.include(source, 'selector: ".terminal-placeholder"');
    assert.include(source, 'selector: ".topbar__toggle--right-panel"');
    assert.include(source, 'selector: "[data-sidebar-thread-action-trigger]"');
    assert.include(source, 'readSelectorRects(client, ".sidebar-v2-action-menu__item")');
    assert.include(source, "Math.abs(rect.height - 30) <= 0.5");
    assert.include(source, "Sidebar action menu rows collapsed");
  });

  it("reports client and connector readiness when Native Stop never becomes visible", () => {
    assert.include(source, "Native working session did not render Stop");
    assert.include(source, "const clientState = await readClientState(client)");
    assert.include(source, "const readiness = await readRendererReadiness(client)");
  });

  it("refreshes the selected provider before exercising the Native Stop flow", () => {
    assert.include(source, 'await invokeConnector(client, "refreshProviders", {');
    assert.include(source, "const refreshedProvider = refreshedConfig?.providers?.find(");
    assert.include(source, 'refreshedProvider?.status !== "ready"');
    assert.include(source, 'refreshedProvider.auth?.status !== "authenticated"');
    assert.include(source, "refreshedProvider,");
  });

  it("verifies Native New thread stays local and reuses its draft identity", () => {
    assert.include(source, "async function verifyNewThreadDraftLifecycle");
    assert.include(source, '"--verify-new-thread-draft-lifecycle"');
    assert.include(source, "function readPersistedEmptyThreadIds");
    assert.include(source, "FROM projection_thread_sessions AS session");
    assert.include(source, "thread.pending_approval_count = 0");
    assert.include(source, "thread.pending_user_input_count = 0");
    assert.include(source, "thread.has_actionable_proposed_plan = 0");
    assert.include(source, "session.status = 'idle'");
    assert.include(source, "session.active_turn_id IS NULL");
    assert.include(source, "session.last_error IS NULL");
    assert.include(source, "const legacyRecovery =");
    assert.include(source, "Fixture has no recoverable legacy empty threads.");
    assert.include(source, "recoverableEmptyThreadIds.every");
    assert.include(source, "survived automatic recovery");
    assert.include(source, 'invokeConnector(client, "createThread", { projectId })');
    assert.include(source, "runtimeRecoveryState");
    assert.include(source, "runtimeThreadObserved");
    assert.include(source, "A runtime-created empty Native thread survived automatic recovery");
    assert.include(source, "canonicalThreadIdsBefore = runtimeRecoveryState?.threadIds ?? []");
    assert.include(source, "legacyEmptyThreadRecovery: legacyRecovery");
    assert.include(source, "automatic: true");
    assert.include(source, "runtimeEmptyThreadRecovery");
    assert.include(source, 'typeof state?.draftThreadId === "string"');
    assert.include(source, "state?.draftThreadId === firstDraftState.draftThreadId");
    assert.include(source, "initialPersistedThreadIds = shouldVerifyNewThreadDraftLifecycle");
    assert.include(source, "? readPersistedThreadIds(baseDir)");
    assert.include(
      source,
      "const persistedThreadIdsBefore = persistedThreadIdsAfterRuntimeRecovery",
    );
    assert.include(source, "const persistedThreadIdsAfter = readPersistedThreadIds(baseDir)");
    assert.include(source, "const normalizedThreadIds = (threadIds) => [...threadIds].sort()");
    assert.include(source, "Opening a local Native draft persisted an empty thread");
    assert.include(source, "serverSequenceAfter: afterSequence.lastSeq");
    assert.include(outcomeChecksSource, "newThreadDraftLifecycle");
  });

  it("verifies the Native Providers route without depending on every Settings route", () => {
    assert.include(source, "async function verifyProvidersSettings");
    assert.include(source, '"--verify-providers-settings"');
    assert.include(source, 'selector: ".settings-nav__item--providers"');
    assert.include(source, 'panel: "providers"');
    assert.include(source, 'route: "/settings/providers"');
    assert.include(source, 'selector: ".settings-content--providers .settings-panel"');
    assert.include(source, 'readSelectorMeasurements(client, ".provider-instance-card")');
    assert.include(source, "cards.length !== expectedCardCount");
    assert.include(source, '".provider-settings-header-actions .ui-button"');
    assert.include(source, "headerActions.length !== 2");
    assert.include(source, 'name: "native-settings-providers.png"');
    assert.include(outcomeChecksSource, "providersSettings");
  });

  it("verifies the complete Native Add provider lifecycle", () => {
    assert.include(source, "async function verifyProviderInstanceDialog");
    assert.include(source, '"--verify-provider-instance-dialog"');
    assert.include(source, "verifyProviderInstanceDialog: shouldVerifyProviderInstanceDialog");
    assert.include(source, 'measurement.attributes["aria-label"] === "Add provider instance"');
    assert.include(source, 'selector: ".provider-instance-dialog"');
    assert.include(source, 'measurement.attributes["data-provider-wizard-step"] === "0"');
    assert.include(source, 'measurement.attributes["data-provider-dialog-motion"] === "open"');
    assert.include(source, 'measurement?.attributes["data-provider-wizard-step"] === "1"');
    assert.include(source, "__T3_LYNXTRON_PROVIDER_INSTANCE_PROBE__");
    assert.include(source, "Instance ID is required.");
    assert.include(source, "Instance ID must start with a letter");
    assert.include(source, 'measurement?.attributes["data-provider-wizard-step"] === "2"');
    assert.include(source, 'selector: ".provider-instance-card__chevron"');
    assert.include(source, 'selector: ".provider-card__delete-instance"');
    assert.include(source, "state?.providerInstanceIds?.includes(instanceId) === false");
    assert.include(source, 'path.join(baseDir, "userdata", "settings.json")');
    assert.include(source, "persistedAfterDelete");
    assert.include(source, "drivers.length === 0");
    assert.include(source, "dismissed: true");
    assert.include(outcomeChecksSource, "providerInstanceDialog");
  });

  it("verifies the Native right-panel add menu dismissal and surface selection", () => {
    assert.include(source, "async function verifyRightPanelAddMenu");
    assert.include(source, '"--verify-right-panel-add-menu"');
    assert.include(source, 'selector: ".right-panel__add-btn"');
    assert.include(source, 'selector: ".right-panel__add-menu"');
    assert.include(source, 'selector: ".right-panel__add-menu-dismiss"');
    assert.include(source, "Math.abs((measurement?.rect.width ?? 0) - 176) <= 0.5");
    assert.include(source, "Math.abs((row.rect?.width ?? 0) - 166) > 0.5");
    assert.include(source, "Math.abs((measurement?.rect.width ?? 0) - width) <= 1");
    assert.include(source, "Math.abs((measurement?.rect.height ?? 0) - height) <= 1");
    assert.include(source, 'readSelectorMeasurements(client, ".right-panel__add-item")');
    assert.include(source, '{ kind: "browser", label: "Browser" }');
    assert.include(source, 'value: "files"');
    assert.include(source, 'value: "terminal"');
    assert.include(source, 'name: "native-right-panel-add-menu.png"');
    assert.include(
      source,
      'measurement?.attributes["data-right-panel-active-kind"] === "terminal"',
    );
    assert.include(source, 'selector: ".terminal-placeholder"');
    assert.include(source, "terminalSelected: true");
    assert.include(source, "rightPanelAddMenuOnlyEmptyFixture");
    assert.include(outcomeChecksSource, "rightPanelAddMenu");
  });

  it("verifies the Native Diff scope menu through a real review checkpoint", () => {
    assert.include(source, "async function verifyDiffScopeMenu");
    assert.include(source, '"--verify-diff-scope-menu"');
    assert.include(source, 'selector: "[data-review-open-diff]"');
    assert.include(source, 'selector: ".diff-panel-header__scope"');
    assert.include(source, 'selector: ".diff-panel-header__scope-menu"');
    assert.include(source, 'selector: ".diff-panel-header__scope-dismiss"');
    assert.include(source, "Math.abs((measurement?.rect.width ?? 0) - 240) <= 0.5");
    assert.include(source, "Math.abs((measurement?.rect.height ?? 0) - 122) <= 0.5");
    assert.include(source, 'readSelectorMeasurements(client, ".diff-panel-header__scope-item")');
    assert.include(
      source,
      'readSelectorMeasurements(client, ".diff-panel-header__scope-item-label")',
    );
    assert.include(source, "rowLabels.length !== expectedRows.length");
    assert.include(
      source,
      "(label.text.trim() || label.attributes.text?.trim()) !== expectedRows[index].label",
    );
    assert.include(
      source,
      'rowLabels[index]?.text.trim() || rowLabels[index]?.attributes.text?.trim() || ""',
    );
    assert.include(source, '{ scope: "working-tree", label: "Working tree" }');
    assert.include(source, '{ scope: "branch", label: "Branch changes" }');
    assert.include(source, '{ scope: "latest-turn", label: "Latest turn" }');
    assert.include(source, '{ scope: "turn", label: "Turn" }');
    assert.include(source, 'value: "working-tree"');
    assert.include(source, 'name: "native-diff-scope-menu.png"');
    assert.include(source, "workingTreeSelected: true");
    assert.include(outcomeChecksSource, "diffScopeMenu");
  });

  it("verifies the compact Native Files browser without overstating keyboard evidence", () => {
    assert.include(source, "async function verifyFilesBrowser");
    assert.include(source, '"--verify-files-browser"');
    assert.include(source, 'attribute: "data-right-panel-add-kind"');
    assert.include(source, 'value: "files"');
    assert.include(source, 'selector: ".files-panel__toolbar"');
    assert.include(source, "Math.abs((measurement?.rect.height ?? 0) - 40) <= 0.5");
    assert.include(source, 'selector: ".files-panel__refresh"');
    assert.include(source, 'selector: ".files-panel__search-input"');
    assert.include(source, 'measurement?.attributes.placeholder === "Search files"');
    assert.include(source, 'selector: ".files-panel__browser"');
    assert.include(source, 'selector: ".files-panel .file-tree-row"');
    assert.include(source, "Math.abs((measurement?.rect.height ?? 0) - 24) <= 0.5");
    assert.include(source, 'readOptionalMeasurement(client, ".sidebar-footer")');
    assert.include(source, 'readOptionalMeasurement(client, ".sidebar-settings-row")');
    assert.include(source, 'readOptionalMeasurement(client, ".sidebar-settings-authority")');
    assert.include(
      source,
      'readFirstSelectorStyleValue(client, ".sidebar-settings-row", "box-sizing")',
    );
    assert.include(source, "Math.abs(settingsRow.rect.height - 32) > 0.5");
    assert.include(source, 'settingsRowBoxSizing !== "border-box"');
    assert.include(source, "measurementVisible(settingsAuthority)");
    assert.include(source, 'mode: "sidebar-hidden"');
    assert.include(source, "!measurementVisible(footer)");
    assert.include(source, "!measurementVisible(settingsRow)");
    assert.include(source, "Native responsive Sidebar footer drifted");
    assert.include(source, "responsiveSidebarFooter,");
    assert.include(source, '"--verify-responsive-settled-banner"');
    assert.include(source, '"--verify-responsive-settled-banner requires --verify-files-browser."');
    assert.include(source, 'readOptionalMeasurement(client, ".composer-settled-banner")');
    assert.include(source, 'readOptionalMeasurement(client, ".composer-settled-banner__copy")');
    assert.include(source, 'readOptionalMeasurement(client, ".composer-settled-banner__action")');
    assert.include(source, "banner.rect.y + banner.rect.height > composer.rect.y - 7.5");
    assert.include(source, "Native responsive settled banner drifted");
    assert.include(source, "responsiveSettledBanner,");
    assert.include(source, "const settledBannerFixture = fixtureManifest.settledBannerFixture");
    assert.include(
      source,
      '"--verify-responsive-settled-banner requires a settledBannerFixture with explicit thread and turn identity."',
    );
    assert.include(source, "if (settledBannerFixture)");
    assert.include(source, "__T3_LYNXTRON_SELECT_THREAD__");
    assert.include(source, "state?.activeThreadId === settledBannerFixture.threadId");
    assert.include(source, "async function waitForExplicitThreadState");
    assert.include(source, "candidate?.activeThread?.title === fixture.title");
    assert.include(source, ": settledBannerFixture");
    assert.include(source, '"--verify-responsive-sidebar-footer"');
    assert.include(source, '"--verify-responsive-sidebar-footer requires --verify-files-browser."');
    assert.include(source, "if (verifyResponsiveSidebarFooterOnly)");
    assert.include(source, 'fileSelection: "not-required"');
    assert.include(source, '"border-top-left-radius"');
    assert.include(source, '"border-top-right-radius"');
    assert.include(source, '"border-bottom-right-radius"');
    assert.include(source, '"border-bottom-left-radius"');
    assert.include(source, 'rowRadii.some((radius) => radius !== "5px")');
    assert.include(source, 'rowFontSize !== "12px"');
    assert.include(source, 'selector: ".files-panel .file-tree-row--file"');
    assert.include(source, 'measurement?.attributes["data-right-panel-active-kind"] === "file"');
    assert.include(source, 'selector: ".file-panel__breadcrumb--current"');
    assert.include(source, 'selector: ".file-editor-preview"');
    assert.include(source, 'selector: ".file-editor-line"');
    assert.include(source, 'selector: ".file-editor-line__number"');
    assert.include(source, 'readSelectorMeasurements(client, ".file-editor-token")');
    assert.include(source, 'measurement?.attributes["data-file-editor-mode"] === "preview"');
    assert.include(source, '!editorFontFamily.includes("SF Mono")');
    assert.include(source, 'editorFontSize !== "13px"');
    assert.include(source, 'editorLineHeight !== "20px"');
    assert.include(source, "Math.abs(editorLineNumber.rect.width - 49) > 0.5");
    assert.include(source, "Native file editor typography drifted");
    assert.include(source, "editorTokens.length === 0");
    assert.include(source, "tokenToneCount");
    assert.include(source, 'readOptionalMeasurement(client, ".file-panel__explorer")');
    assert.include(source, 'const panelMode = filePanel.attributes["data-right-panel-mode"]');
    assert.include(source, "projectFileDetailLayout(filePanel.rect.width)");
    assert.include(source, "detailLayout.showExplorer");
    assert.include(source, "!detailLayout.showExplorer && explorerVisible");
    assert.include(source, "Native file detail explorer ownership drifted");
    assert.include(source, "function measurementVisible(measurement)");
    assert.include(source, "const explorerVisible = measurementVisible(explorer)");
    assert.include(source, "measurementVisible(sheetExplorer)");
    assert.include(source, 'typing: "pending-user-session"');
    assert.include(source, 'name: "native-files-browser.png"');
    assert.include(source, 'name: "native-file-surface.png"');
    assert.include(source, '"--verify-file-sheet-back"');
    assert.include(source, 'selector: ".file-panel__back"');
    assert.include(source, 'measurement?.attributes["aria-label"] === "Back to workspace files"');
    assert.include(source, "Native file sheet kept the desktop explorer visible");
    assert.include(source, "!shouldVerifyFileSheetBack,");
    assert.include(source, 'measurement?.attributes["data-right-panel-active-kind"] === "files"');
    assert.include(source, "fileSheetBack");
    assert.include(source, '"--verify-file-editing-save"');
    assert.include(source, '"--file-editor-relative-path"');
    assert.include(
      source,
      '"--verify-file-editing-save requires --verify-files-browser and --file-editor-relative-path."',
    );
    assert.include(source, "fileEditingSaveOnlyEmptyFixture");
    assert.include(source, "__T3_LYNXTRON_FILE_EDITOR_PROBE__?.change");
    assert.include(source, 'measurement?.attributes["data-file-save-status"] === "pending"');
    assert.include(source, 'measurement?.attributes["data-file-save-error"] === "true"');
    assert.include(source, "Math.abs((measurement?.rect.height ?? 0) - 33) <= 0.5");
    assert.include(source, 'selector: "[data-file-save-retry]"');
    assert.include(source, 'measurement?.text.trim() === "Retry save"');
    assert.include(source, "Math.abs((measurement?.rect.width ?? 0) - 75) <= 0.5");
    assert.include(source, "Math.abs((measurement?.rect.height ?? 0) - 24) <= 0.5");
    assert.include(source, 'physicalKeyboard: "pending-user-session"');
    assert.include(source, "waitForFileContents");
    assert.include(source, "persistedSha256");
    assert.include(source, "Native file editor target escaped its disposable workspace");
    assert.include(source, "chmodSync(targetPath, 0o444)");
    assert.include(source, "if (!permissionsRestored) chmodSync(targetPath, originalMode)");
    assert.include(outcomeChecksSource, "filesBrowser");
  });

  it("verifies compact Composer controls stay scrollable and inside the center column", () => {
    assert.include(source, "async function verifyCompactControls");
    assert.include(source, '"--verify-compact-controls"');
    assert.notInclude(source, '"--verify-compact-controls requires --verify-files-browser."');
    assert.include(source, 'value: "files"');
    assert.include(source, 'selector: ".right-panel__add-btn"');
    assert.include(source, 'selector: ".composer-compact-controls-trigger"');
    assert.include(source, 'selector: ".composer-compact-controls-menu"');
    assert.include(source, 'selector: ".composer-compact-controls-menu__scroll"');
    assert.include(source, 'selector: ".composer-compact-controls-menu__content"');
    assert.include(source, 'selector: ".composer-compact-controls-dismiss"');
    assert.include(source, "const requiredTail = [");
    assert.include(source, "const contentOverflows = content.rect.height > scroll.rect.height");
    assert.include(source, "const initialLastRowVisible = lastRowBottom <= scrollBottom + 1");
    assert.include(source, "(!contentOverflows && !initialLastRowVisible)");
    assert.include(source, '"Plan",');
    assert.include(source, '"Full access"');
    assert.include(source, "const traitLabels = rowLabels.slice(0, -requiredTail.length)");
    assert.include(source, "new Set(rowLabels).size !== rowLabels.length");
    assert.include(source, "panelRight > rightPanel.rect.x + 1");
    assert.include(source, "context.rect.x < composer.rect.x - 1");
    assert.include(source, "contextRight > composerRight + 1");
    assert.include(source, "contextRight > rightPanel.rect.x + 1");
    assert.include(source, "__T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__?.(120)");
    assert.include(source, 'measurement?.attributes["data-scroll-offset"] === "120"');
    assert.include(source, "finalLastRow.rect.y >= lastRow.rect.y");
    assert.include(source, "Native compact controls did not reveal the final row after scrolling");
    assert.include(source, 'input: "main-thread scroll seam; physical wheel pending-user-session"');
    assert.include(source, "Native compact Composer controls drifted");
    assert.include(source, 'name: "native-compact-controls.png"');
    assert.include(outcomeChecksSource, "compactControls");
  });

  it("verifies the Native Publish wizard and backdrop dismissal", () => {
    assert.include(source, "async function verifyGitPublishDialog");
    assert.include(source, "const approximately = (actual, expected, tolerance = 1) =>");
    assert.include(source, '"--verify-git-publish-dialog"');
    assert.include(source, 'selector: ".action-btn--commit"');
    assert.include(
      source,
      'measurement?.attributes["data-git-quick-action-kind"] === "open_publish"',
    );
    assert.include(source, 'selector: ".git-publish-dialog"');
    assert.include(source, 'selector: ".git-publish-provider-card--active"');
    assert.include(source, 'header: await readOptionalMeasurement(client, ".git-publish-header")');
    assert.include(source, 'footer: await readOptionalMeasurement(client, ".git-publish-footer")');
    assert.include(source, 'measurement?.attributes["data-git-publish-provider"] === "github"');
    assert.include(source, 'readSelectorRects(client, "[data-git-publish-step-label]")');
    assert.include(source, 'readSelectorRects(client, "[data-git-publish-provider]")');
    assert.include(source, 'selector: ".git-publish-dismiss"');
    assert.include(source, "const expectedSteps = [");
    assert.include(source, "const expectedProviders = [");
    assert.include(
      source,
      "geometryMatches(dialog.rect, { x: 352, y: 228, width: 576, height: 364 })",
    );
    assert.include(source, "approximately(measurement?.rect?.width, 1280)");
    assert.include(source, "approximately(measurement?.rect?.height, 820)");
    assert.include(source, "steps.length !== 3");
    assert.include(source, "providers.length !== 4");
    assert.include(source, "dismissed: true");
    assert.include(outcomeChecksSource, "gitPublishDialog");
  });

  it("verifies Native repository initialization through the real connector", () => {
    assert.include(source, "async function verifyGitInitialize");
    assert.include(source, '"--verify-git-initialize"');
    assert.include(
      source,
      'measurement?.attributes["data-git-quick-action-kind"] === "initialize_repo"',
    );
    assert.include(
      source,
      'measurement.attributes["data-git-quick-action-label"] === "Initialize Git"',
    );
    assert.include(source, 'selector: ".action-btn--commit"');
    assert.include(source, "state?.vcsStatus?.isRepo === false");
    assert.include(source, "state?.vcsStatus?.isRepo === true");
    assert.include(source, 'path.join(projectCwd, ".git")');
    assert.include(source, "Git initialization did not create");
    assert.include(source, 'name: "native-git-initialize.png"');
    assert.include(source, "gitInitializeOnlyEmptyFixture");
    assert.include(outcomeChecksSource, "gitInitialize");
  });

  it("verifies Native Beta mutation, disk persistence, and cold restart", () => {
    assert.include(source, "async function verifyBetaMutation");
    assert.include(source, "async function openBetaSettings");
    assert.include(source, "async function readBetaSettingsGeometry");
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
    assert.include(source, "expectedRowHeights = [103, 84, 65]");
    assert.include(source, "Math.abs(rowStack.height - 264) > 1");
    assert.include(source, "Math.abs(description.width - 576) > 1");
    assert.include(source, "beforeGeometry");
    assert.include(source, "restoredGeometry");
    assert.include(source, "restartedGeometry");
    assert.include(outcomeChecksSource, "betaMutation");
  });

  it("verifies the Native read-only Keybindings table", () => {
    assert.include(source, 'route === "/settings/keybindings"');
    assert.include(source, 'selector: ".settings-content--keybindings"');
    assert.include(source, 'selector: "[data-keybindings-table-header]"');
    assert.include(source, 'readSelectorMeasurements(client, ".keybindings-table__row")');
    assert.include(source, "rows.length !== 45");
    assert.include(source, "conflicts.length !== 18");
    assert.include(source, 'first?.attributes["data-keybinding-command"] !== "chat.new"');
    assert.include(source, 'last?.attributes["data-keybinding-command"] !== "thread.previous"');
    assert.include(source, 'scrollInteraction: "pending-user-session"');
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
    assert.include(source, "async function verifyFixedNetworkAccessRow");
    assert.include(source, '"--verify-connections-mutation"');
    assert.include(source, 'shouldVerifyConnectionsMutation ? { T3CODE_HOST: "0.0.0.0" }');
    assert.include(source, 'T3CODE_HOST: "0.0.0.0"');
    assert.include(source, 'selector: ".settings-nav__item--connections"');
    assert.include(source, 'const createSelector = ".settings-connections-create-pairing"');
    assert.include(source, "settings-connections-revoke-pairing--${createdPairingLinkId}");
    assert.include(source, 'measurement?.text.trim() === "Copy code"');
    assert.include(source, 'measurement?.text.trim() === "Create link"');
    assert.include(source, "checked: true");
    assert.include(source, '"ui-switch--disabled"');
    assert.include(source, "restartedNetworkAccess");
    assert.include(source, "Connections cold restart did not return an owned process id.");
    assert.include(outcomeChecksSource, "connectionsMutation");
  });

  it("hides access management on a loopback Native Connections route", () => {
    assert.include(source, "async function verifyConnectionsLocalPolicy");
    assert.include(source, '"--verify-connections-local-policy"');
    assert.include(source, '!measurement.text.includes("Authorized clients")');
    assert.include(source, "checked: false");
    assert.include(source, '!measurement.text.includes("Access inventory")');
    assert.include(source, '".settings-connections-network-access .ui-switch"');
    assert.include(source, '".settings-connections-create-pairing"');
    assert.include(source, 'selector: ".settings-connections-panel"');
    assert.include(source, 'selector: ".settings-remote-empty"');
    assert.include(source, 'selector: ".settings-remote-empty__media"');
    assert.include(source, 'selector: ".settings-remote-empty__title"');
    assert.include(source, 'selector: ".settings-remote-empty__description"');
    assert.include(source, 'selector: ".settings-connections-add-environment"');
    assert.include(source, 'measurement?.attributes["aria-disabled"] === "true"');
    assert.include(source, 'measurement.attributes.class?.includes("ui-button--disabled")');
    assert.include(source, 'client,\n    ".settings-connections-add-environment",\n    "opacity"');
    assert.include(source, "Math.abs(Number(addEnvironmentOpacity) - 0.64) > 1 / 255");
    assert.include(source, "Native disabled Add environment affordance drifted");
    assert.include(source, "Native Connections empty-state anatomy drifted");
    assert.include(source, "emptyDescription.rect.y -");
    assert.include(source, "sections.length !== 2");
    assert.include(source, "Native Connections section flow drifted");
    assert.include(source, "remoteEnvironments:");
    assert.include(source, "disabledActionStayedOnRoute");
    assert.include(source, 'name: "native-settings-connections-local.png"');
    assert.include(source, "authorizedClientsVisible: false");
    assert.include(outcomeChecksSource, "connectionsLocalPolicy");
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
    assert.include(source, '"--verify-composer-reconnect"');
    assert.include(source, "Reconnect-scoped Native draft");
    assert.include(source, "failedRoute?.route !== reconnectFixture.route");
    assert.include(source, "recoveredStatePreserved");
  });

  it("verifies exact-bundle review patches from a real checkpoint fixture", () => {
    assert.include(source, "async function verifyReviewDiffState");
    assert.include(source, '"--verify-review-diff-state"');
    assert.include(source, 'selector: "[data-review-open-diff]"');
    assert.include(source, 'selector: ".diff-panel"');
    assert.include(source, 'selector: ".diff-code-file"');
    assert.include(source, "const expectedFiles = checkpoint.files");
    assert.include(source, '"review-secondary.ts"');
    assert.include(source, "otherContent.every");
    assert.include(source, 'value: "Split diff view"');
    assert.include(source, 'value: "Enable diff line wrapping"');
    assert.include(source, 'value: "Hide whitespace changes"');
    assert.include(source, 'value: "Collapse all files"');
    assert.include(source, 'measurement.attributes["data-review-file-expanded"] === "false"');
    assert.include(source, '"--review-semantic-only"');
    assert.include(source, '"--review-default-only"');
    assert.include(source, 'semanticOnly ? "semantic-only" : "visual-and-semantic"');
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
    assert.include(source, 'selector: "[data-testid=sidebar-v2-new-thread]"');
    assert.include(source, "enteredHero");
    assert.include(source, "allowMissingContext: expectNoComposerContext");
    assert.include(source, "Non-repository Hero Composer rendered repository context.");
    assert.include(source, 'selector: ".hero__headline"');
    assert.include(source, "(hero.rect.y + 219)");
    assert.include(source, 'headlineFontSize !== "30px"');
    assert.include(source, 'headlineLineHeight !== "36px"');
    assert.include(source, 'headlineLetterSpacing !== "-0.75px"');
    assert.include(source, 'selector: ".composer-context-control"');
    assert.include(source, "Hero context allocation drifted");
    assert.include(source, 'name: `native-hero-${expectedTheme ?? "system"}.png`');
    assert.include(source, "heroOnlyEmptyFixture");
  });

  it("verifies Native Composer draft text across a real route round trip", () => {
    assert.include(source, 'const draftText = "Native route-scoped draft"');
    assert.include(source, "state?.activeComposerDraftText === draftText");
    assert.include(source, 'status: "not-covered"');
    assert.include(source, "state.activeComposerDraftText === draftText");
    assert.include(source, 'measurement?.attributes["data-composer-primary-state"] === "send"');
    assert.include(source, "placeholderVisible: false");
    assert.include(source, "__T3_LYNXTRON_COMPOSER_ATTACHMENT_FIXTURE__");
    assert.include(source, 'selector: ".composer-attachment-remove"');
    assert.include(source, "attachmentLifecycle: {");
    assert.include(source, "__T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__");
    assert.include(source, 'selector: ".terminal-panel__add-context"');
    assert.include(source, "terminalContextEntry,");
    assert.include(source, 'selector: ".composer-terminal-context-remove"');
    assert.include(source, "terminalContextLifecycle: {");
    assert.include(source, 'selector: ".composer-file-context-remove"');
    assert.include(source, "fileContextLifecycle: {");
    assert.include(source, "async function verifyTerminalContextProviderSend");
    assert.include(source, '"--verify-terminal-context-provider-send"');
    assert.include(source, 'selector: ".composer-primary-action"');
    assert.include(source, 'message.text.includes("<terminal_context>")');
    assert.include(source, "canonicalAssistantMessage");
    assert.include(source, "async function verifyTranscriptFollowState");
    assert.include(source, '"--verify-transcript-follow-state"');
    assert.include(source, 'data-transcript-scroll-mode"] === "free-scrolling"');
    assert.include(source, "async function verifyComposerSendRetry");
    assert.include(source, '"--verify-composer-send-retry"');
    assert.include(source, 'T3_TEST_SEND_PROMPT_ERROR_ONCE: "1"');
    assert.include(source, "Injected Composer send unexpectedly succeeded");
    assert.include(source, "OpenCode provider did not connect before Composer retry acceptance");
    assert.include(source, "canonicalThreadCreated: false");
    assert.include(source, "Failed Composer send persisted a canonical thread");
    assert.include(source, 'selector: ".composer-attachment-preview"');
    assert.include(source, "__T3_LYNXTRON_COMPOSER_ELEMENT_CONTEXT_FIXTURE__");
    assert.include(source, 'selector: ".composer-element-context-chip"');
    assert.include(source, 'message.text.includes("<element_context>")');
    assert.include(
      source,
      "message.attachments?.some((candidate) => candidate.name === attachment.name)",
    );
    assert.include(source, "elementContext: true,");
    assert.include(source, "routeRoundTrip,");
    assert.include(source, "shouldVerifyNewThreadDraftLifecycle ||");
    assert.include(source, "Native Composer state did not persist before cold restart");
    assert.include(source, "persistedTerminalContext");
    assert.include(source, "Composer draft cold restart did not return an owned process id");
    assert.include(source, "__T3_LYNXTRON_CREATE_DRAFT_THREAD__");
    assert.include(source, "state?.composerDraftTextByScopeKey?.[draftScopeKey] === draftText");
    assert.include(source, "coldRestart: {");
    assert.include(source, 'id: "element-reconnect"');
    assert.include(source, "state.activeComposerElementContexts?.[0]?.id ===");
    assert.include(source, "elementContextId: reconnectFixture.elementContext.id");
    assert.include(
      source,
      "persistedThreadIdsAfterRuntimeRecovery = readPersistedThreadIds(baseDir)",
    );
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
    assert.include(source, 'name: "native-existing-thread-idle.png"');
  });

  it("verifies Native Quick Switch filter states and outside dismissal", () => {
    assert.include(source, "async function verifyQuickSwitchState");
    assert.include(source, '"--verify-quick-switch-default"');
    assert.include(source, 'initialOverlay: "quick-switch"');
    assert.include(source, '"--quick-switch-query"');
    assert.include(source, '"--quick-switch-query requires --verify-quick-switch-default."');
    assert.include(source, "__T3_LYNXTRON_QUICK_SWITCH_QUERY__");
    assert.include(source, "__T3_LYNXTRON_QUICK_SWITCH_STATE__");
    assert.include(source, 'query === ">"');
    assert.include(source, 'query === "zzzz-no-result"');
    assert.include(source, '"No matching commands, projects, or threads."');
    assert.include(source, "async function waitForStableMeasurement");
    assert.include(source, "async function readQuickSwitchState");
    assert.include(source, "rectsConverged(previousRect, latest.rect)");
    assert.include(source, "consecutiveStableSamples >= stableSamples");
    assert.include(source, "const panel = await waitForStableMeasurement({");
    assert.include(source, 'selector: ".palette-panel"');
    assert.include(source, 'readSelectorMeasurements(client, ".palette-row")');
    assert.include(
      source,
      'state.actionLabels.some((label) => label.startsWith("New thread in "))',
    );
    assert.include(source, "requiredDefaultActions");
    assert.include(source, '!footer.text.includes("Enter")');
    assert.include(source, '!footer.text.includes("Select")');
    assert.include(source, 'footer.text.includes("⌘P")');
    assert.include(source, 'footer.text.includes("Files")');
    assert.include(source, "native-quick-switch-${stateSlug}-${expectedTheme ??");
    assert.include(source, 'selector: ".palette-backdrop"');
    assert.include(source, '"testResize-gated query setter for visual state only"');
    assert.include(source, 'physicalKeyboard: "pending-user-session"');
    assert.include(source, "initialOverlay product state plus measured DevTool outside tap");
  });

  it("verifies the Native Add Project source flow without creating a project", () => {
    assert.include(source, "async function verifyAddProjectSources");
    assert.include(source, '"--verify-add-project-sources"');
    assert.include(source, 'initialOverlay: "add-project"');
    assert.include(source, '"GitHub repository"');
    assert.include(source, '"Azure DevOps repository"');
    assert.include(source, '"Bitbucket repository"');
    assert.include(source, '"GitLab repository"');
    assert.include(source, 'readSelectorMeasurements(client, ".quick-switch-source-row")');
    assert.include(source, 'readSelectorMeasurements(client, ".quick-switch-setup-badge")');
    assert.include(source, "readFirstSelectorStyleValue(");
    assert.include(source, '".quick-switch-source-row.opacity-64"');
    assert.include(source, 'disabledOpacity !== "0.64"');
    assert.include(source, "disabledTapStayedInSources:");
    assert.include(source, 'selector: ".qs-search__back"');
    assert.include(
      source,
      'measurement?.attributes["data-quick-switch-view"] === "add-project-local"',
    );
    assert.include(source, 'measurement?.attributes["data-quick-switch-view"] === "root"');
    assert.include(source, 'selector: ".palette-backdrop"');
    assert.include(source, 'physicalKeyboard: "pending-user-session"');
    assert.notInclude(source, "cloneAndAddProject");
  });

  it("verifies Native New Thread project association without persisting empty threads", () => {
    assert.include(source, "async function verifyNewThreadProjects");
    assert.include(source, '"--verify-new-thread-projects"');
    assert.include(source, "function readPersistedProjects");
    assert.include(source, "__T3_LYNXTRON_SEARCH_OVERLAY_STATE__");
    assert.include(source, "waitForSearchOverlayState");
    assert.include(source, 'selector: ".sidebar-v2-new-thread"');
    assert.include(source, 'measurement.attributes.class?.includes("opacity-50") !== true');
    assert.include(
      source,
      'measurement?.attributes["data-quick-switch-view"] === "new-thread-projects"',
    );
    assert.include(source, 'readSelectorMeasurements(client, ".quick-switch-project-row")');
    assert.include(source, "Math.abs(panel.rect.width - 576) > 1");
    assert.include(source, "Math.abs(panel.rect.height - 230) > 1");
    assert.include(source, "Math.abs((row.rect?.height ?? 0) - 48) > 1");
    assert.include(source, "await tapMeasurement({ client, measurement: row })");
    assert.include(source, "candidate.activeThread?.projectId === project.projectId");
    assert.include(
      source,
      "candidate.draftThreadIdsByProjectId?.[project.projectId] === candidate.draftThreadId",
    );
    assert.include(source, "Different projects reused the same local draft identity.");
    assert.include(source, "did not reuse its local draft");
    assert.include(source, "persistedThreadIdsAfter.length !== 0");
    assert.include(source, 'selector: ".qs-search__back"');
    assert.include(source, 'selector: ".palette-backdrop"');
    assert.include(source, 'name: `native-new-thread-projects-${expectedTheme ?? "system"}.png`');
    assert.include(source, 'physicalKeyboard: "pending-user-session"');
    assert.include(source, 'physicalHover: "pending-user-session"');
    assert.include(outcomeChecksSource, "newThreadProjects");
  });

  it("verifies Native legacy project groups and collapse recovery", () => {
    assert.include(source, "async function verifySidebarProjectGroups");
    assert.include(source, '"--verify-sidebar-project-groups"');
    assert.include(
      source,
      '"--verify-sidebar-project-groups and --verify-new-thread-projects require visual-state.json projectGroupTitles."',
    );
    assert.include(source, "legacySidebarEnabled: true");
    assert.include(source, 'sidebarProjectGroupingMode: "separate"');
    assert.include(source, "!shouldVerifySidebarProjectGroups &&");
    assert.include(source, 'measurement?.attributes["data-sidebar-version"] === "legacy"');
    assert.include(source, 'readSelectorMeasurements(client, ".sidebar-project-row-reference")');
    assert.include(source, 'readSelectorMeasurements(client, ".sidebar-project-title-reference")');
    assert.include(source, "Math.abs((row.rect?.width ?? 0) - 239) > 1");
    assert.include(source, "Math.abs((row.rect?.height ?? 0) - 32) > 1");
    assert.include(source, "async function waitForSelectorCount");
    assert.include(source, 'selector: ".lynx-sidebar-thread-empty"');
    assert.include(source, 'interaction: "measured first-project collapse and re-expand taps"');
    assert.include(source, 'physicalHover: "pending-user-session"');
  });

  it("verifies the Native File Picker overlay without opening an external editor", () => {
    assert.include(source, "async function verifyFilePickerDefault");
    assert.include(source, '"--verify-file-picker-default"');
    assert.include(source, '"open-file-search"');
    assert.include(source, "async function waitForQuickSwitchFileState");
    assert.include(source, 'state?.mode === "files"');
    assert.include(source, "state.filePending === false");
    assert.include(source, "state.fileError === null");
    assert.include(source, "count: initialState.filePaths.length");
    assert.include(source, 'readOptionalMeasurement(client, ".qs-results--files")');
    assert.include(source, "Math.abs(panel.rect.height - 420) > 1");
    assert.include(source, "Math.abs(resultsViewport.rect.height - 330) > 1");
    assert.include(source, "Math.abs((firstRow.rect?.height ?? 0) - 48) > 1");
    assert.include(source, "path.basename(initialState.filePaths[0] ??");
    assert.include(source, 'fileActivation: "pending-user-session-external-shell-side-effect"');
    assert.include(source, 'physicalKeyboard: "pending-user-session"');
    assert.equal(source.match(/!shouldVerifyFilePickerDefault &&/gu)?.length, 2);
  });

  it("captures Native General Settings content and geometry before route cycling", () => {
    assert.include(source, "async function assertSettingsNavigationSelection");
    assert.include(source, "Settings navigation selection is not truthful");
    assert.include(source, "visuallySelectedItems.length !== 1");
    assert.include(source, "navigationSelections.push");
    assert.include(source, 'selector: ".settings-content--general"');
    assert.include(source, 'measurement.text.includes("Project grouping")');
    assert.include(source, 'measurement.text.includes("Diagnostics")');
    assert.include(source, "const generalSections = await readSelectorRects(");
    assert.include(source, '".settings-content--general .settings-section"');
    assert.include(
      source,
      'assertSettingsTopOrigin("General first section", generalSections[0], 88)',
    );
    assert.include(
      source,
      'readSelectorMeasurements(\n    client,\n    ".settings-content--general .settings-row",',
    );
    assert.include(source, '["background-activity", "text-generation-model"]');
    assert.include(source, "generalUnavailableIds");
    assert.include(source, 'row.attributes["aria-disabled"] !== "true"');
    assert.include(source, '".settings-content--general .settings-row--unavailable"');
    assert.include(source, "generalUnavailableOpacities");
    assert.include(source, 'name: "native-settings-general.png"');
    assert.include(source, 'selector: ".settings-content--source-control"');
    assert.include(source, 'measurement.text.includes("Text generation")');
    assert.include(source, 'readSelectorRects(client, ".source-control-item")');
    assert.include(source, 'readSelectorRects(client, ".source-control-writing-row")');
    assert.include(source, 'name: "native-settings-source-control.png"');
    assert.include(source, 'assertSettingsTopOrigin("Appearance Theme row", theme?.rect, 144)');
    assert.include(
      source,
      'assertSettingsTopOrigin("Source Control first section", sourceControl.sections[0], 88)',
    );
    assert.include(source, "assertSettingsTopOrigin(`General cycle ${cycle}`");
    assert.include(source, "async function readGeneralBetaSettingsEvidence");
    assert.include(source, 'row.attributes.idSelector === "auto-settle-inactive-threads"');
    assert.include(source, 'row.attributes.idSelector === "legacy-sidebar"');
    assert.include(source, 'row.text.includes("Days of inactivity before auto-settle")');
    assert.include(source, 'stack.attributes["aria-hidden"] === "true"');
    assert.include(source, "const legacySidebarCollapsed =");
    assert.include(source, "legacySidebarStack?.rect.width === 0");
    assert.include(source, "(!legacySidebarCollapsed && !legacySidebarVisible)");
    assert.include(source, "async function readArchiveSettingsEvidence");
    assert.include(source, 'selector: ".settings-content--archive"');
    assert.include(source, 'assertSettingsTopOrigin("Archive first section", section, 88)');
    assert.include(source, "const expectedObservedRoutes = [");
    assert.include(source, '"/settings/archived"');
    assert.include(source, "navigationSelections.length !== expectedObservedRoutes.length");
  });

  it("verifies working Appearance controls and their canonical mutations", () => {
    assert.include(source, "async function verifySettingsAppearance");
    assert.include(source, '"--verify-settings-appearance"');
    assert.include(source, 'selector: ".sidebar-settings-row"');
    assert.include(source, 'selector: ".settings-nav__item--appearance"');
    assert.include(source, 'route: "/settings/appearance"');
    assert.include(source, 'selector: ".settings-nav__back"');
    assert.include(source, "readAppearanceSettingsEvidence");
    assert.include(source, 'selector: ".settings-content--appearance"');
    assert.include(source, "async function readSelectorMeasurements");
    assert.include(source, "rows.length !== expectedRowCount");
    assert.include(source, "availableRows.length !== expectedRowCount");
    assert.include(source, 'theme.attributes["aria-disabled"] === "true"');
    assert.include(source, 'row.attributes["data-settings-unavailable"] === "true"');
    assert.include(source, "unavailableRows.length !== 0");
    assert.include(source, 'selector: ".glass-slider"');
    assert.include(source, 'selector: ".settings-toggle--word-wrap"');
    assert.include(source, 'selector: "#environment-identification .select-box"');
    assert.include(source, "before.clientSettings.glassOpacity + 5");
    assert.include(source, "before.clientSettings.environmentIdentificationMode");
    assert.include(source, "!before.clientSettings.wordWrap");
    assert.include(source, 'selector: ".app-theme-root"');
    assert.include(source, '"data-glass-opacity"');
    assert.include(source, "glass-opacity-${after.clientSettings.glassOpacity}");
    assert.include(source, '"--appearance-semantic-only"');
    assert.include(source, 'name: "native-settings-appearance.png"');
    assert.include(source, 'physicalKeyboard: "pending-user-session"');
    assert.include(source, "only titlebar/sidebar inset changes use the shared 200ms linear");
    assert.include(outcomeChecksSource, "settingsAppearance");
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
    assert.include(source, "Math.abs(sections[2].y - 548) > 1");
    assert.include(source, "Math.abs(sections[2].height - 295) > 2");
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
    assert.include(source, "verifyCompletedTranscriptState({\n          child,");
    assert.include(source, "readSelectorRects(");
    assert.include(source, "const assistantRowRoot = rowRoots[1]");
    assert.notInclude(source, '".timeline-row-root--assistant"');
    assert.include(source, 'readSelectorRects(client, ".timeline-host")');
    assert.include(source, 'readFirstSelectorStyleValue(client, ".timeline-list", "padding-top")');
    assert.include(source, "Math.abs(rowRoots[0].y - (timelineList.y + timelineTopInset)) <= 1");
    assert.include(source, "Math.abs(assistantRowRoot.height - (assistantRow.height + 16)) <= 0.5");
    assert.include(source, 'readOptionalMeasurement(client, ".timeline-jump")');
    assert.include(source, 'data-transcript-jump-visible"] === "false"');
    assert.match(
      source,
      /readFirstSelectorStyleValue\(\s*client,\s*"\.timeline-jump",\s*"opacity"/,
    );
    assert.include(source, "!scrollToEndHidden");
    assert.include(source, 'assistantText !== "fidelity loop complete"');
    assert.include(source, '"--verify-completed-transcript-state"');
    assert.include(source, "allowMissingInteraction: true");
    assert.include(source, '".model-picker-anchor > .composer-toolbar-control--model"');
  });

  it("verifies Native completed checkpoint typography at text leaves", () => {
    assert.include(source, "async function verifyReviewCheckpointStates");
    assert.include(
      source,
      "state?.activeThread?.modelSelection?.instanceId === reviewFixture.modelSelection.instanceId",
    );
    assert.include(
      source,
      "state?.activeThread?.modelSelection?.model === reviewFixture.modelSelection.model",
    );
    assert.include(source, 'readOptionalMeasurement(client, ".turn-diff-card__status")');
    assert.include(source, 'readOptionalMeasurement(client, ".turn-diff-card__hint")');
    assert.include(source, '".turn-diff-card__open-label"');
    assert.include(source, 'readOptionalMeasurement(client, ".file-tree-row__name")');
    assert.include(source, 'readOptionalMeasurement(client, ".file-tree-row__stat")');
    assert.include(source, 'checkpointTypography.status.fontSize === "12px"');
    assert.include(source, 'checkpointTypography.hint.fontSize === "11px"');
    assert.include(source, 'checkpointTypography.openLabel.fontSize === "12px"');
    assert.include(source, 'checkpointTypography.fileName.fontSize === "11px"');
    assert.include(source, 'checkpointTypography.fileStat.fontSize === "10px"');
    assert.include(source, 'selector: ".composer-toolbar-control--model"');
    assert.include(source, 'measurement?.text.trim() === "GPT-5.6-Sol"');
    assert.include(source, "Review checkpoint typography drifted");
  });

  it("verifies the Native failed transcript banner, fallback model, and error row", () => {
    assert.include(source, "async function verifyFailedTranscriptState");
    assert.include(source, '".thread-error-banner"');
    assert.include(source, '".thread-error-description"');
    assert.include(source, '".thread-error-dismiss"');
    assert.include(source, "predicate: (measurement) => measurement === null");
    assert.include(source, "Native failed-thread dismiss changed session content");
    assert.include(source, 'modelText === "Big Pickle"');
    assert.include(
      source,
      'errorDescription?.text.includes("Model not found: opencode/not-a-real-model.")',
    );
    assert.include(source, "Math.abs(rowRoots[0].y - (timelineHost.y + 20)) <= 1");
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
    assert.include(source, 'expectedTheme !== "light"');
    assert.include(source, 'action.measurement?.style.backgroundColor === "rgb(255,255,255)"');
    assert.include(source, 'action.measurement.style.borderBottomColor === "rgb(212,212,216)"');
    assert.include(source, "outlineActions: [actions[1], actions[2]].map");
    assert.include(source, '"native-approval.png"');
    assert.include(source, '"--approval-semantic-only"');
    assert.include(source, 'semanticOnly ? "semantic-only" : "visual-and-semantic"');
    assert.include(source, "const screenshot = semanticOnly");
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

  it("verifies semantic message cards without capturing pixels", () => {
    assert.include(source, "async function verifyMessageCardState");
    assert.include(source, '".transcript-review-comment"');
    assert.include(source, '".transcript-preview-annotation"');
    assert.include(source, '".transcript-context-chip--element"');
    assert.include(source, "preview?.text.replace(/\\s+/gu");
    assert.include(source, "__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__");
    assert.include(source, "shouldVerifyMessageCardState ||");
    assert.include(source, 'navigation: "programmatic-list-probe"');
    assert.include(source, '"--verify-message-card-state"');
    assert.include(source, 'evidenceKind: "semantic-only"');
  });

  it("selects and submits a real Native pending question", () => {
    assert.include(source, "async function verifyQuestionTranscriptState");
    assert.include(source, '"--verify-question-transcript-state"');
    assert.include(source, 'questionFixture.mode === "question-multi-step"');
    assert.include(source, "readResolvedUserInputAnswers");
    assert.include(source, 'measurement.text.trim() === "Next"');
    assert.include(source, '".composer-question-previous"');
    assert.include(source, "Native multi-step question omitted option");
    assert.include(source, "Native question custom-answer fixture hook was unavailable");
    assert.include(source, "Native multi-step answers did not persist canonically");
    assert.include(source, "state.lastUserInputResponse.answers");
    assert.include(source, 'status: "stale-fixture"');
    assert.include(source, '"native-question-multi-step.png"');
    assert.include(source, '".composer-pending-question"');
    assert.include(source, '".composer-surface--question"');
    assert.include(source, '".composer-question-submit"');
    assert.include(source, "data-question-option-selected");
    assert.include(source, "hasPendingUserInput === false");
    assert.include(source, '"native-question.png"');
  });
});
