import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const componentSource = (name: string) =>
  readFileSync(path.resolve(import.meta.dirname, name), "utf8");
const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");
const diffPanelSource = componentSource("DiffPanel.tsx");
const sidebarSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/SidebarV2.lynx.tsx"),
  "utf8",
);
const sidebarCompositionSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/sidebar/SidebarV2CompositionSurface.tsx",
  ),
  "utf8",
);
const sidebarRowSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/sidebar/SidebarV2RowSurface.tsx",
  ),
  "utf8",
);
const hostElementsSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/ui/hostElements.lynx.tsx"),
  "utf8",
);
const rightPanelSurfaceSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/RightPanelSurface.tsx"),
  "utf8",
);
const fileTreeSurfaceSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/chat/FileTreeSurface.tsx"),
  "utf8",
);
const sidebarControlsSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/sidebar/SidebarV2ControlsSurface.tsx",
  ),
  "utf8",
);
const dialogStylesSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/ui/dialog-styles.ts"),
  "utf8",
);
const clientSource = readFileSync(
  path.resolve(import.meta.dirname, "../state/t3Client.ts"),
  "utf8",
);
const webFilePreviewSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/files/FilePreviewPanel.tsx"),
  "utf8",
);
const modelPickerSurfaceSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/chat/ModelPickerSurface.tsx"),
  "utf8",
);
const modelSelectionLogicSource = readFileSync(
  path.resolve(import.meta.dirname, "../state/modelSelection.logic.ts"),
  "utf8",
);
const connectorSource = readFileSync(
  path.resolve(import.meta.dirname, "../../main/desktop/connector.ts"),
  "utf8",
);
const newThreadHookSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/hooks/useHandleNewThread.lynx.ts"),
  "utf8",
);
const keyboardCommandsSource = readFileSync(
  path.resolve(import.meta.dirname, "../state/keyboardCommands.ts"),
  "utf8",
);
const browserPreviewSource = readFileSync(
  path.resolve(import.meta.dirname, "../../browser-preview/index.ts"),
  "utf8",
);
const keybindingsSettingsSource = componentSource("KeybindingsSettings.tsx");
const settingsNavigationSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/settings/settingsNavigationHost.lynx.tsx",
  ),
  "utf8",
);
const settingsLayoutSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/settings/settingsLayout.lynx.tsx",
  ),
  "utf8",
);
const otherSettingsSource = componentSource("OtherSettings.tsx");
const branchToolbarSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/BranchToolbar.tsx"),
  "utf8",
);
const branchToolbarEnvModeSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/BranchToolbarEnvModeSelector.tsx",
  ),
  "utf8",
);
const branchToolbarBranchSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/BranchToolbarBranchSelector.tsx",
  ),
  "utf8",
);

describe("desktop shell interaction contract", () => {
  it("uses the synchronized client auto-settle preference for the active thread banner", () => {
    const chatView = componentSource("ChatView.tsx");

    expect(chatView).toContain("autoSettleAfterDays: clientSettings.sidebarAutoSettleAfterDays");
    expect(chatView).not.toContain("DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS");
  });

  it("falls through to the settled banner when the connection lifecycle is ready", () => {
    const chatView = componentSource("ChatView.tsx");

    expect(chatView).toContain(
      "shouldRenderConnectionLifecycleBanner({ hero }) && connectionLifecycle.visible",
    );
    expect(chatView).toContain(") : activeThreadSettled ? (");
  });

  it("keeps connection lifecycle feedback in the Composer overlay", () => {
    const chatView = componentSource("ChatView.tsx");
    expect(chatView).toContain('className="composer-lifecycle-banner"');
    expect(chatView).toContain("shouldRenderConnectionLifecycleBanner({ hero })");
    expect(overrides).toContain(".composer-lifecycle-banner {");
  });

  it("reports archived thread identity to isolated Native readiness harnesses", () => {
    expect(clientSource).toContain("archivedThreads: next.archivedThreads.map");
  });

  it("opens workspace markdown links in the internal file surface", () => {
    const markdown = readFileSync(path.join(import.meta.dirname, "MarkdownRenderer.tsx"), "utf8");
    expect(markdown).toContain("fileLink?.workspaceRelativePath");
    expect(markdown).toContain("uiActions.openFileSurface(fileLink.workspaceRelativePath)");
    expect(markdown).toContain("data-markdown-interactive-paragraph");
    expect(markdown).toContain('className="md-link-hit-target"');
    expect(markdown).toContain("onClick={() => activateMarkdownLink(span.href!, cwd)}");
    expect(markdown).toContain("showMarkdownFileLinkContextMenu");
    expect(markdown).toContain('{ id: "open", label: "Open in editor" }');
    expect(markdown).toContain('{ id: "copy-relative", label: "Copy relative path" }');
    expect(markdown).toContain('{ id: "copy-full", label: "Copy full path" }');
    expect(markdown).toContain("clientCapabilities.clipboard.writeText(fileLink.displayPath)");
    expect(markdown).toContain("clientCapabilities.clipboard.writeText(fileLink.targetPath)");
    expect(markdown).toContain("resolveExternalWebLinkHost(href)");
    expect(markdown).toContain('{ id: "open-external", label: "Open in system browser" }');
    expect(markdown).toContain('{ id: "copy-link", label: "Copy Link" }');
    expect(markdown).toContain("clientCapabilities.navigation.openExternal(href)");
    expect(markdown).toContain("clientCapabilities.clipboard.writeText(href)");
    expect(markdown.indexOf("uiActions.openFileSurface")).toBeLessThan(
      markdown.indexOf("clientCapabilities.navigation.canOpenPath()"),
    );
  });

  it("keeps archived thread destructive actions behind the native menu and confirmation", () => {
    expect(settingsLayoutSource).toContain("onContextMenu={onContextMenu}");
    expect(settingsLayoutSource.match(/onContextMenu=\{onContextMenu\}/g)).toHaveLength(4);
    expect(otherSettingsSource).toContain("showArchivedThreadContextMenu");
    expect(otherSettingsSource).toContain('{ id: "unarchive", label: "Unarchive" }');
    expect(otherSettingsSource).toContain('{ id: "delete", label: "Delete", destructive: true }');
    expect(otherSettingsSource).toContain('title="Authorized clients"');
    expect(otherSettingsSource).toContain(
      'label={accessMutation === "clients:others" ? "Revoking…" : "Revoke others"}',
    );
    expect(otherSettingsSource).toContain(': "Create link"');
    expect(otherSettingsSource).not.toContain('title="Other clients"');
    expect(otherSettingsSource).toContain("Confirm delete");
    expect(otherSettingsSource).toContain("deleteThread(thread.id)");
    expect(otherSettingsSource).toContain("ariaLabel={`${item.label} availability`}");
    expect(componentSource("ProviderSettings.tsx")).toContain(
      '<view className="provider-instance-dialog__driver-check">',
    );
    expect(componentSource("ProviderSettings.tsx")).toContain("<ProviderLastChecked");
    expect(componentSource("AppearanceSettings.tsx")).toContain("themeResetAction=");
  });

  it("keeps the anchored model picker selectable while outside taps dismiss", () => {
    const source = componentSource("ModelPicker.tsx");
    const chatView = componentSource("ChatView.tsx");

    expect(source).not.toContain('className="model-picker-dismiss-layer"');
    expect(source).not.toContain("catchtap={handlePanelTap}");
    expect(source).toContain('className="model-picker-close"');
    expect(source.match(/bindtap={onClose}/g)).toHaveLength(1);
    expect(chatView).toContain("modelPickerOpen || gitMenuOpen");
    expect(chatView).toContain("if (modelPickerOpen) uiActions.closeModelPicker()");
    expect(chatView).toContain("if (modelPickerOpen) return;");
    expect(chatView).toContain("onActiveProviderChange={uiActions.selectModelPickerProvider}");
    expect(overrides).not.toContain(".model-picker-dismiss-layer {");
    expect(overrides).toContain(
      ".theme-dark .model-picker-panel {\n  background-color: var(--popover);",
    );
    const panelStart = overrides.lastIndexOf("\n.model-picker-panel {");
    const panelBlock = overrides.slice(panelStart, overrides.indexOf("}", panelStart));
    expect(panelBlock).toContain("z-index: 51;");
    expect(panelBlock).toContain("border-radius: 10px;");
    expect(modelPickerSurfaceSource).toContain(
      '<HostView className="model-picker-rail-icon pointer-events-none">',
    );
    expect(modelPickerSurfaceSource).not.toContain(
      '<HostView className="model-picker-rail-icon pointer-events-none" eventThrough>',
    );
  });

  it("keeps the model picker scroll chain constrained to the content column", () => {
    const source = componentSource("ModelPicker.tsx");

    const listBlocks = overrides.match(/\.picker-list \{[^}]+\}/g);
    const list = listBlocks?.at(-1);

    expect(list).toContain("flex-grow: 1;");
    expect(list).toContain("flex-shrink: 1;");
    expect(list).toContain("width: 100%;");
    expect(list).toContain("min-width: 0;");
    expect(list).toContain("height: 0;");
    expect(source).toContain("handleListWheel");
    expect(list).toContain("min-height: 0;");
    expect(source).not.toContain('className="picker-list-shell"');
    expect(source).not.toContain('className="picker-list-inner"');
    expect(overrides).not.toContain(".picker-list-shell {");
    expect(overrides).not.toContain(".picker-list-inner {");
    expect(overrides).toContain(
      ".model-picker-row {\n  display: flex;\n  flex-direction: row;\n  align-items: center;\n  align-self: stretch;\n  width: auto;",
    );
  });

  it("dismisses the runtime permission menu without changing its value", () => {
    const source = componentSource("Composer.tsx");

    expect(source).toContain('className="composer-runtime-menu-dismiss-layer"');
    expect(source).toContain('aria-label="Dismiss runtime mode"');
    expect(source).toContain("bindtap={() => setOpenComposerMenu(null)}");
    expect(source).toContain("const [openComposerMenu, setOpenComposerMenu]");
    expect(source).toContain('toggleComposerMenu("runtime")');
    expect(source).toContain('toggleComposerMenu("model-option")');
    expect(source).toContain('toggleComposerMenu("compact-controls")');
    expect(source).toContain('toggleComposerMenu("workspace")');
    expect(source).toContain('openComposerMenu === "context-window"');
    expect(source).toContain("if (modelPicker != null) onModelPickerClose?.()");
    expect(source).toContain("modelOptionMenuOpen ||");
    expect(source).toContain("runtimeModeMenuOpen ||");
    expect(source).toContain("compactControlsMenuOpen");
    expect(source).toContain("modelPicker != null");
    expect(overrides).toContain(".composer-runtime-menu-dismiss-layer {");
    expect(overrides).toContain(".composer-runtime-control-wrap {");
  });

  it("shows provider recovery guidance in hero and thread layouts", () => {
    const chatView = componentSource("ChatView.tsx");

    expect(chatView).toContain("availableThreadModels({ models, providerEntries })");
    expect(chatView).toContain("projectProviderStatusNotice(activeProviderStatus)");
    expect(chatView).toContain("showEmptyTranscript || visibleProviderStatusNotice ? (");
    expect(chatView).toContain('className="provider-status-banner-overlay"');
    expect(chatView).toContain('name="info"');
    expect(chatView).toContain("title={visibleProviderStatusNotice.title}");
    expect(chatView).toContain("description={visibleProviderStatusNotice.message}");
    expect(chatView).not.toContain(") : visibleProviderStatusNotice ? (");
    expect(chatView).not.toContain("visibleProviderStatusNotice && !hero");
    expect(chatView).toContain("hasTopBanner={Boolean(visibleThreadError)}");
    expect(chatView).toContain('className="provider-status-banner__dismiss"');
    expect(chatView).toContain('icon={<Icon name="x" size={14} color="#818181" />}');
    expect(chatView).not.toContain('label={providersRefreshPending ? "Refreshing…" : "Refresh"}');
    expect(overrides).toContain(".chat-body-reference > .provider-status-banner-overlay {");
    expect(overrides).toContain(".provider-status-banner__dismiss {");
    expect(overrides).toContain("white-space: pre-wrap;");
    expect(chatView).toContain("resolveThreadLockedConnectionValue({");
    expect(chatView).toContain("hasActiveThread: activeThread !== undefined");
  });

  it("keeps failed-thread dismissal local to the rendered error", () => {
    const chatView = componentSource("ChatView.tsx");

    expect(chatView).toContain("dismissedThreadErrorsById");
    expect(chatView).toContain("visibleThreadError");
    expect(chatView).toContain('label="Dismiss error"');
    expect(chatView).toContain('className="thread-error-dismiss"');
    expect(chatView).toContain("onTap={dismissThreadError}");
    expect(chatView).toContain("hasTopBanner={Boolean(visibleThreadError)}");
    expect(chatView).not.toContain("setSessionError");
  });

  it("keeps shared Lynx buttons accessible to provider recovery controls", () => {
    const button = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ui/button.lynx.tsx"),
      "utf8",
    );
    const input = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ui/input.lynx.tsx"),
      "utf8",
    );
    const textarea = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ui/textarea.lynx.tsx"),
      "utf8",
    );

    expect(button).toContain('"aria-label": ariaLabel');
    expect(button).toContain("aria-label={ariaLabel}");
    expect(button).toContain("flatten={false}");
    expect(button).toContain('aria-disabled={disabled ? "true" : undefined}');
    expect(input).toContain("aria-label={ariaLabel}");
    expect(input).toContain('aria-disabled={disabled ? "true" : undefined}');
    expect(textarea).toContain("aria-label={ariaLabel}");
    expect(textarea).toContain('aria-disabled={disabled ? "true" : undefined}');
  });

  it("renders shared provider connection fields, environment, refresh, and update actions", () => {
    const providers = componentSource("ProviderSettings.tsx");
    const app = readFileSync(path.resolve(import.meta.dirname, "../index.tsx"), "utf8");
    const uiState = readFileSync(path.resolve(import.meta.dirname, "../state/uiState.ts"), "utf8");

    expect(providers).toContain("deriveProviderSettingsFields(schema)");
    expect(providers).toContain("CodexSettings");
    expect(providers).toContain("ClaudeSettings");
    expect(providers).toContain("ProviderEnvironmentFields");
    expect(providers).toContain("sortProviderInstanceEntries");
    expect(providers).toContain("PROVIDER_SETTINGS_DRIVER_ORDER");
    const settingsRouteHost = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../web/src/components/settings/settingsRouteHost.lynx.tsx",
      ),
      "utf8",
    );
    const settingsSurfaces = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../web/src/components/settings/SettingsSurfaces.tsx",
      ),
      "utf8",
    );
    expect(settingsRouteHost).not.toContain("resetProviderScroll");
    expect(settingsRouteHost).not.toContain("initial-scroll-to-index");
    expect(settingsSurfaces).toContain(
      'className="provider-instance-card__header px-3 py-3 sm:px-4"',
    );
    expect(settingsSurfaces).toContain("provider-instance-card__layout");
    expect(settingsSurfaces).toContain("provider-instance-card__copy");
    expect(settingsSurfaces).toContain("provider-instance-card__title-row");
    expect(settingsSurfaces).toContain("provider-instance-card__summary");
    expect(settingsSurfaces).toContain("provider-instance-card__actions");
    expect(providers).toContain('id="provider-health-check-interval"');
    expect(providers).toContain('className="provider-health-number-field__stepper"');
    expect(providers).toContain('className="provider-health-number-field__input"');
    expect(providers).toContain("backgroundActivityOverrideSettings");
    expect(providers).toContain("t3ClientActions");
    expect(providers).toContain(".updateServerSettings(");
    expect(providers).toContain("updateProviderInstance(instanceId, instance)");
    expect(providers).toContain("updateProvider(instanceId)");
    expect(providers).toContain('label="Add provider instance"');
    expect(providers).toContain('label="Refresh provider status"');
    expect(providers).toContain("export function AddProviderInstanceDialog");
    expect(providers).toContain("data-provider-instance-dialog");
    expect(overrides).toContain(
      ".provider-instance-dialog__secondary .ui-button__label,\n.provider-instance-dialog__save-label {",
    );
    expect(overrides).toContain("font-size: 14px;\n  font-weight: 500;\n  line-height: 20px;");
    expect(overrides).toContain(
      ".provider-instance-dialog__step-number-label,\n.provider-instance-dialog__step-label {",
    );
    expect(overrides).toMatch(
      /\.provider-instance-dialog__driver-label \{[\s\S]*font-size: 14px;[\s\S]*line-height: 20px;/,
    );
    expect(overrides).toMatch(
      /\.provider-instance-dialog__early-access,[\s\S]*font-size: 10px;[\s\S]*line-height: 13\.3333px;/,
    );
    expect(providers).toContain("ADD_PROVIDER_WIZARD_STEPS");
    expect(providers).toContain("resolveWizardNavigation");
    expect(providers).toContain("COMING_SOON_PROVIDER_DRIVERS");
    expect(providers).toContain("useProviderPresence");
    expect(providers).toContain("data-provider-dialog-motion={presence.phase}");
    expect(providers).toContain("data-provider-card-motion={bodyPresence.phase}");
    expect(providers).toContain(".createProviderInstance(");
    expect(providers).toContain(
      "entry.isDefault || settings?.providerInstances[entry.instanceId] !== undefined",
    );
    expect(uiState).toContain("useAddProviderDialogOpen");
    expect(uiState).toContain("openAddProviderDialog");
    expect(uiState).toContain("closeAddProviderDialog");
    expect(app).toContain('overlay === "add-provider"');
    expect(app).toContain("<AddProviderInstanceDialog");
    expect(app).toContain("open={addProviderDialogOpen}");
    expect(providers).toContain("now - navigationGuardRef.current < 250");
    expect(providers).toContain("__T3_LYNXTRON_PROVIDER_INSTANCE_PROBE__");
    expect(providers).toContain("if (!viewport.testResize || !open) return;");
    expect(providers).toContain('className="provider-card__delete-instance"');
    expect(overrides).toContain(
      "animation: provider-instance-dialog-backdrop-enter 200ms ease both;",
    );
    expect(overrides).toContain(
      "animation: provider-instance-dialog-enter 200ms ease-in-out both;",
    );
    expect(overrides).toContain("animation: provider-instance-dialog-exit 200ms ease-in-out both;");
    expect(overrides).toContain("transform: translate(-50%, -50%) scale(0.98);");
    expect(overrides).toContain("animation: provider-card-body-enter 200ms ease-in-out both;");
    expect(overrides).toContain("animation: provider-card-body-exit 200ms ease-in-out both;");
    expect(overrides).toContain(".provider-instance-dialog__body {\n  display: flex;");
    expect(providers).toContain('scroll-orientation="vertical"');
  });

  it("renders server-declared model options in a dismissible menu", () => {
    const composer = componentSource("Composer.tsx");
    const chatView = componentSource("ChatView.tsx");
    const modelPicker = componentSource("ModelPicker.tsx");

    expect(composer).toContain('className="composer-model-option-menu-dismiss-layer"');
    expect(composer).toContain('aria-label="Dismiss model options"');
    expect(composer.indexOf('className="composer-model-option-menu"')).toBeLessThan(
      composer.indexOf('className="composer-model-option-menu-dismiss-layer"'),
    );
    expect(composer).toContain("modelOptionSections.map");
    expect(composer).toContain("onSelectModelOption?.(section.id, item.value)");
    expect(chatView).toContain("projectComposerTraitsMenu");
    expect(chatView).toContain("selectComposerTraitOption");
    expect(chatView).not.toContain("handleModelOptionTap");
    expect(overrides).toContain(".composer-model-option-menu {");
    expect(overrides).toContain("height: 480px;");
    expect(composer).toContain('className="composer-model-option-menu__content"');
    expect(overrides).toContain(".composer-model-option-menu__content {");
    expect(overrides).toContain("flex-shrink: 0;");
    expect(overrides).toContain(".composer-model-option-menu__item--selected {");
    expect(composer).toContain('data-composer-model-option-section="mode"');
    expect(composer).toContain('data-composer-model-option-section="access"');
    expect(composer.indexOf("{section.label}")).toBeLessThan(
      composer.indexOf('data-composer-model-option-section="mode"'),
    );
    expect(composer.indexOf('data-composer-model-option-section="mode"')).toBeLessThan(
      composer.indexOf('data-composer-model-option-section="access"'),
    );
    expect(composer).toContain("getComposerModelOptionLetterSpacing(modelOptionLabel)");
    expect(overrides).toContain(".composer-primary-action--send {");
    expect(overrides).toContain("background-color: rgba(var(--primary-rgb), 0.9);");
    expect(composer).toContain('name={busy ? "square" : "send-arrow"}');
    expect(composer).toContain("__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__");
    expect(composer).toContain("responsiveMenuWheelDelta(");
    expect(modelPicker).toContain('className="picker-list"');
    expect(modelPicker).toContain("scroll-y");
    expect(modelPicker).toContain("main-thread:global-bindwheel={handleListWheel}");
    expect(browserPreviewSource).toContain(
      '".composer-compact-controls-menu__scroll{overflow-y:auto;}" +',
    );
  });

  it("projects context-window usage into the Composer meter and dismissible detail popup", () => {
    const composer = componentSource("Composer.tsx");
    const chatView = componentSource("ChatView.tsx");

    expect(chatView).toContain("deriveLatestContextWindowSnapshot(activities)");
    expect(chatView).toContain("activeContextWindow={activeContextWindow}");
    expect(composer).toContain("composer-context-window-trigger${");
    expect(composer).toContain('data-floating-popup="composer-context-window"');
    expect(composer).toContain("Total processed");
    expect(composer).toContain("automatically compacts");
    expect(composer).toContain('aria-label="Dismiss context window usage"');
    expect(composer).toContain('openComposerMenu === "context-window"');
    expect(composer).toContain('onClick={() => setOpenComposerMenu("context-window")}');
    expect(overrides).toContain(".composer-context-window-popup {");
    expect(overrides).toContain(".composer-context-window-progress__value--overloaded {");
  });

  it("uses shared composer triggers for real file, skill, and command context insertion", () => {
    const composer = componentSource("Composer.tsx");
    const chatView = componentSource("ChatView.tsx");
    expect(composer).toContain("detectComposerTrigger(value, composerCursor)");
    expect(composer).toContain(
      "t3ClientActions.searchComposerProjectEntries(cwd, composerTrigger.query, 50)",
    );
    expect(clientSource).toContain("return bridge.searchProjectEntries({ cwd, query, limit });");
    expect(composer).toContain("serializeComposerFileLink(entry.path)");
    expect(composer).toContain("data-composer-context-picker={composerTrigger.kind}");
    expect(composer).toContain("const contextPickerHeight = Math.min(288");
    expect(composer).toContain("data-composer-context-path={entry.path}");
    expect(composer).toContain("data-composer-context-skill={skill.name}");
    expect(composer).toContain("data-composer-context-command={command.name}");
    expect(composer).toContain("onClick={() => selectContextPath(entry)}");
    expect(composer).toContain("stopTapPropagation");
    expect(composer).toContain("aria-label={`Add ${entry.path} to context`}");
    expect(composer).toContain('aria-label="Dismiss composer context menu"');
    expect(composer).toContain('className="composer-context-picker__close"');
    expect(chatView).toContain("providerSkills={activeProviderStatus?.skills ?? []}");
    expect(chatView).toContain("providerSlashCommands={activeProviderStatus?.slashCommands ?? []}");
    expect(overrides).toContain(".composer-context-picker {");
    expect(overrides).toContain(".composer-context-picker__section-label {");
  });

  it("renders compact Composer section headers through the proven text label style", () => {
    const composer = componentSource("Composer.tsx");
    expect(composer).toContain(
      '<text className="composer-compact-controls-menu__section-label">\n                                        Mode',
    );
    expect(composer).toContain(
      '<text className="composer-compact-controls-menu__section-label">\n                                    Access',
    );
  });

  it("runs supported Git actions through the main connector and exposes the split menu", () => {
    const header = componentSource("ChatHeader.tsx");
    const chatView = componentSource("ChatView.tsx");

    expect(header).toContain("buildMenuItems(vcsStatus");
    expect(header).toContain('data-git-menu-action="publish"');
    expect(header).toContain("onGitMenuOpenChange(!gitMenuOpen)");
    expect(header).toContain("catchtap={() => undefined}");
    expect(chatView).toContain("modelPickerOpen || gitMenuOpen");
    expect(chatView).toContain("if (gitMenuOpen) setGitMenuOpen(false)");
    expect(header).toContain("t3ClientActions");
    expect(header).toContain(".runGitAction({ actionId:");
    expect(connectorSource).toContain("async runGitAction(");
    expect(connectorSource).toContain("WS_METHODS.gitRunStackedAction");
    expect(overrides).toContain(".topbar-git-menu {");
    expect(overrides).not.toContain(".topbar-git-menu-dismiss {");
    expect(overrides).toContain("min-height: 80px;");
  });

  it("matches the active Plan mode control from the Web authority", () => {
    const composer = componentSource("Composer.tsx");
    const planBlock =
      overrides.match(/\.composer-toolbar-control--interaction-plan \{[^}]+\}/)?.[0] ?? "";
    const planIconBlock =
      overrides.match(
        /\.composer-toolbar-control--interaction-plan \.pill__icon-img \{[^}]+\}/,
      )?.[0] ?? "";

    expect(composer).not.toContain('className="composer-interaction-mode-separator"');
    expect(composer).toContain("separators={!compactFooter}");
    expect(composer).toContain('" composer-toolbar-control--interaction-plan"');
    expect(composer).toContain('name={interactionMode === "plan" ? "pencil-ruler" : "bot"}');
    expect(composer).toContain('color={interactionMode === "plan" ? "#60a5fa" : "#818181"}');
    expect(planBlock).toContain("border-radius: 8px;");
    expect(planBlock).toContain("background-color: rgba(59, 130, 246, 0.1);");
    expect(planBlock).toContain("color: #60a5fa;");
    expect(planIconBlock).toContain("opacity: 1;");
  });

  it("lets the Native Composer textarea retain typed text between React renders", () => {
    const composer = componentSource("Composer.tsx");
    const chatView = componentSource("ChatView.tsx");

    expect(composer).toContain("bindinput={handleInput}");
    expect(composer).not.toContain("{...({ value: editorValue } as object)}");
    expect(composer).toContain("const [editorRevision, setEditorRevision] = useState(0);");
    expect(composer).toContain("setEditorRevision((revision) => revision + 1)");
    expect(composer).toContain("questionEditorKey?: string;");
    expect(composer).toContain('question-editor:${questionEditorKey ?? ""}');
    expect(chatView).toContain("questionEditorKey={activePendingQuestion?.id}");
    expect(browserPreviewSource).toContain("resize:none!important");
  });

  it("keeps model-selection bridge failures on a fulfilled settled-result path", () => {
    const mutationStart = clientSource.indexOf("function persistModelSelectionMutation");
    const mutationEnd = clientSource.indexOf("\nfunction setModelSelection", mutationStart);
    const mutation = clientSource.slice(mutationStart, mutationEnd);

    expect(clientSource).toContain("function settleModelSelectionMutation");
    expect(clientSource).toContain('mainTransport.invokeSettled("setModelSelection", input)');
    expect(mutation).toContain("void mutation.then((result) => {");
    expect(mutation).toContain("if (result.ok) {");
    expect(mutation).not.toContain(".catch(");
    expect(mutation).not.toContain("Promise.reject(");
  });

  it("uses the Web shadow on the rounded Composer frame rather than the outer stack", () => {
    expect(overrides).toContain("box-shadow: 0 12px 28px -18px rgba(0, 0, 0, 0.4);");
    const shellStart = overrides.indexOf(".composer-shell {");
    const shellBlock = overrides.slice(shellStart, overrides.indexOf("}", shellStart));
    const frameStart = overrides.indexOf(".composer-frame {");
    const frameBlock = overrides.slice(frameStart, overrides.indexOf("}", frameStart));
    expect(shellBlock).not.toContain("box-shadow");
    expect(frameBlock).toContain("border-radius: 22px;");
    expect(frameBlock).toContain("box-shadow:");
  });

  it("opens a real Terminal session from the titlebar control", () => {
    const appIndex = readFileSync(path.resolve(import.meta.dirname, "../index.tsx"), "utf8");
    const header = componentSource("ChatHeader.tsx");
    const chatView = componentSource("ChatView.tsx");
    const panel = componentSource("RightPanel.tsx");
    const terminal = componentSource("TerminalPanel.tsx");

    expect(header).toContain("export function ChatLayoutControls");
    expect(header).toContain('aria-label="Open terminal panel"');
    expect(header).toContain('bindtap={() => uiActions.openRightPanelSurface("terminal")}');
    expect(appIndex).toContain(
      'overlay === "terminal") uiActions.openRightPanelSurface("terminal")',
    );
    expect(header).toContain("bindtap={uiActions.toggleRightPanel}");
    expect(header).toContain(
      'className="workspace-titlebar-controls topbar__layout-controls lynx-titlebar-no-drag"',
    );
    expect(header).not.toContain("{!rightPanelOpen ? (");
    expect(chatView).toContain(
      "layoutControls={<ChatLayoutControls rightPanelOpen={rightPanel.isOpen} />}",
    );
    expect(panel).toContain('case "terminal":');
    expect(panel).toContain('key={props.activeThreadId ?? "no-thread"}');
    expect(panel).toContain("width={props.terminalWidth}");
    expect(panel).toContain("height={props.terminalHeight}");
    expect(panel).toContain("terminalHeight,");
    expect(panel).toContain("terminalWidth,");
    expect(terminal).toContain("terminalSplitGridSize(width, height, selection.splitDirection)");
    expect(terminal).toContain("runningIds.map((terminalId)");
    expect(terminal).toContain(".resizeTerminal({");
    expect(terminal).toContain("cols: grid.cols");
    expect(terminal).toContain("rows: grid.rows");
    expect(panel).toContain("closeTerminalSession(activeThreadId)");
    expect(panel).toContain('bindtap={() => handleAddSurface("terminal")}');
    expect(terminal).toContain(".openTerminal({");
    expect(terminal).toContain(".writeTerminal({");
    expect(terminal).toContain(".closeTerminal({");
    expect(terminal).toContain('aria-label="New terminal"');
    expect(terminal).toContain("addTerminalSession");
    expect(terminal).toContain("activateTerminalSession");
    expect(terminal).toContain("removeTerminalSession");
    expect(terminal).toContain("data-terminal-session-id={selection.activeId}");
    expect(terminal).toContain("data-terminal-session-count={String(selection.ids.length)}");
    expect(terminal).toContain('aria-label="Split terminal horizontally"');
    expect(terminal).toContain('aria-label="Split terminal vertically"');
    expect(terminal).toContain(
      '"terminal-panel__viewports-vertical terminal-panel__viewports--multi"',
    );
    expect(terminal).toContain("splitTerminalSession");
    expect(terminal).toContain("selection.visibleIds.map");
    expect(terminal).toContain("data-terminal-viewport={terminalId}");
    expect(terminal).toContain('" terminal-panel__viewport--vertical"');
    expect(terminal).toContain('confirm-type="send"');
    expect(terminal).toContain("const commandInputRef = useRef<NodesRef>(null)");
    expect(terminal).toContain('method: "focus"');
    expect(terminal).toContain("success: () => {");
    expect(terminal).toContain("terminalReturnController.setFocused(true)");
    expect(terminal).toContain("ref={commandInputRef}");
    expect(terminal).toContain("terminalReturnController.setSubmitHandler(runCommand)");
    expect(terminal).toContain("bindfocus={() => terminalReturnController.setFocused(true)}");
    expect(terminal).toContain("bindblur={() => terminalReturnController.setFocused(false)}");
    expect(terminal).toContain("terminalReturnController.dispose()");
    expect(terminal).toContain('data-terminal-session-status={session?.status ?? "starting"}');
    expect(terminal).toContain('className="terminal-panel flex flex-col"');
    expect(terminal).not.toContain("Terminal sessions are not connected yet");
    expect(overrides).toContain(".terminal-panel {");
    expect(overrides).toMatch(/\.terminal-panel \{[\s\S]*position: absolute;[\s\S]*bottom: 0;/);
    expect(terminal).not.toContain('className="terminal-panel__meta"');
    expect(terminal).toContain("selection.ids.length > 1");
    expect(terminal).toContain("terminal-panel__sessions--single");
    expect(terminal).toContain("terminal-panel__viewports--multi");
    expect(terminal).toContain("terminal-panel__viewports--single");
    expect(overrides).toMatch(
      /\.terminal-panel__viewports-horizontal,[\s\S]*top: 0;[\s\S]*bottom: 52px;/,
    );
    expect(overrides).toContain(".terminal-panel__viewports--multi {\n  top: 28px;");
    expect(overrides).toMatch(
      /\.terminal-panel__command-row \{[\s\S]*position: absolute;[\s\S]*bottom: 0;/,
    );
    expect(overrides).toContain(".topbar__toggle:hover {");
    expect(overrides).toContain(".topbar__toggle:active {");
  });

  it("matches the compact Files browser anatomy and keeps search functional", () => {
    const files = componentSource("FilesPanel.tsx");
    const panel = componentSource("RightPanel.tsx");
    const composer = componentSource("Composer.tsx");

    expect(files).toContain('className="files-panel__toolbar" data-surface-subheader');
    expect(files).toContain('aria-label="Refresh workspace files"');
    expect(files).toContain('placeholder="Search files"');
    expect(files).toContain("files-panel__search--focused");
    expect(files).toContain("bindfocus={() => setSearchFocused(true)}");
    expect(files).toContain("bindblur={() => setSearchFocused(false)}");
    expect(files).toContain("getProjectFilePickerMatches");
    expect(files).toContain('className="files-panel__browser"');
    expect(files).toContain('folderIcon={<Icon name="folder" size={14}');
    expect(files).toContain("fileIcon={<ProjectFileIcon path={node.path} />}");
    expect(componentSource("ProjectFileIcon.tsx")).toContain("projectFileIconPresentation(path)");
    expect(componentSource("QuickSwitch.tsx")).toContain(
      "icon={<ProjectFileIcon path={entry.path} />}",
    );
    expect(componentSource("QuickSwitch.tsx")).toContain('? "Open file"');
    expect(componentSource("QuickSwitch.tsx")).toContain(
      '<text>{fileMode ? "Back" : "Close"}</text>',
    );
    expect(overrides).toContain(".project-file-icon--typescript");
    expect(overrides).toContain(".project-file-icon--image");
    expect(files).toContain("uiActions.openFileSurface(path)");
    expect(files).toContain("export function FilePanel");
    expect(files).toContain("const [explorerOpen, setExplorerOpen] = useState(true)");
    expect(files).toContain(
      'aria-label={explorerVisible ? "Hide file explorer" : "Show file explorer"}',
    );
    expect(files).toContain('data-file-explorer-open={explorerVisible ? "true" : "false"}');
    expect(files).toContain("{explorerVisible ? (");
    expect(files).toContain('className="file-panel__toolbar" data-surface-subheader');
    expect(files).toContain('className="file-panel__editor-surface"');
    expect(files).toContain('className="file-panel__explorer"');
    expect(files).toContain("<FilesPanel selectedPath={path} />");
    expect(files).toContain('data-file-editor-mode="preview"');
    expect(files).toContain('data-file-editor-mode="editing"');
    expect(files).toContain('aria-label="Back to workspace files"');
    expect(files).toContain("bindtap={uiActions.returnToFilesSurface}");
    expect(files).not.toContain('className="files-panel__preview"');
    expect(files).not.toContain('className="files-panel__info"');
    expect(overrides).toContain(".files-panel__toolbar {");
    expect(browserPreviewSource).toContain(
      '".files-panel{" +\n      "display:flex;flex:1 1 0%;flex-direction:column;width:100%;height:100%;min-height:0;}"',
    );
    expect(browserPreviewSource).toContain(
      '".files-panel__browser{" +\n      "display:flex;flex:1 1 0%;flex-direction:column;width:100%;height:0;min-height:0;}"',
    );
    expect(browserPreviewSource).toContain(
      '".files-panel__refresh{width:24px!important;height:24px!important;}"',
    );
    expect(browserPreviewSource).toContain(
      '".files-panel__tree{" +\n      "display:flex;flex-direction:column;width:100%;padding:0 16px!important;box-sizing:border-box;}"',
    );
    expect(browserPreviewSource).toContain(
      '".files-panel .file-tree-children{row-gap:0!important;column-gap:0!important;}"',
    );
    expect(browserPreviewSource).toContain("x-input.files-panel__search-input::part(input)");
    expect(browserPreviewSource).toContain("x-textarea.files-panel__editor::part(textarea)");
    expect(browserPreviewSource).toContain('target.matches(".files-panel__editor")');
    expect(browserPreviewSource).toContain('host.matches("x-textarea.files-panel__editor")');
    expect(browserPreviewSource).toContain("synchronizeTextareaValues");
    expect(browserPreviewSource).toContain(
      "x-textarea.files-panel__editor, textarea.files-panel__editor",
    );
    expect(browserPreviewSource).toContain('".file-editor-line{" +');
    expect(browserPreviewSource).toContain('".file-editor-line__content{" +');
    expect(browserPreviewSource).toContain('".file-editor-line__content>.file-editor-token," +');
    expect(browserPreviewSource).toContain(
      '".file-editor-line__content>lynx-wrapper>.file-editor-token{display:inline!important;}" +',
    );
    expect(browserPreviewSource).toContain(
      '".file-editor-line__content>.file-editor-token::part(inner-box)," +',
    );
    expect(browserPreviewSource).toContain(
      '".file-editor-line__content>lynx-wrapper>.file-editor-token::part(inner-box){" +',
    );
    expect(browserPreviewSource).toContain('".theme-light .sidebar-settings-authority{" +');
    expect(sidebarSource).toContain(
      "viewport.width === 1280 && viewport.height === 820 && sidebarWidth === 256",
    );
    expect(sidebarSource).toContain(
      '<image className="sidebar-settings-authority" src={settingsRowUrl} />',
    );
    const settingsRowStart = overrides.indexOf(".sidebar-settings-row {");
    const settingsRowBlock = overrides.slice(
      settingsRowStart,
      overrides.indexOf("}", settingsRowStart),
    );
    expect(settingsRowBlock).toContain("height: 32px;");
    expect(settingsRowBlock).toContain("box-sizing: border-box;");
    expect(browserPreviewSource).toContain(
      '".composer-compact-controls-menu__item{display:flex;flex-direction:row;width:100%;}" +',
    );
    expect(browserPreviewSource).toContain(
      '"display:flex!important;flex-direction:column!important;width:100%;height:114px;padding:16px 20px;" +',
    );
    expect(browserPreviewSource).toContain(
      '".composer-pending-approval__detail{display:flex!important;flex-direction:row!important;}" +',
    );
    expect(browserPreviewSource).toContain(
      '".right-panel__add-menu{display:flex;flex-direction:column;width:128px;height:122px;}" +',
    );
    expect(browserPreviewSource).toContain(
      '".right-panel__tab-list>[data-active-tab]{min-width:100px;max-width:176px;box-sizing:border-box;}" +',
    );
    expect(browserPreviewSource).toContain(
      '".right-panel__tab-scroll{flex:none;width:max-content!important;max-width:calc(100% - 132px);}" +',
    );
    expect(browserPreviewSource).toContain(
      '".right-panel__add-item{display:flex;flex:none;flex-direction:row;width:118px;height:28px;}" +',
    );
    expect(browserPreviewSource).toContain(
      '".diff-panel-header__scope-menu,.diff-panel-header__scope-submenu{" +',
    );
    expect(browserPreviewSource).toContain('".diff-panel-header__scope-item{" +');
    expect(browserPreviewSource).toContain(
      '"display:flex;flex:none;flex-direction:row;width:230px;height:28px;}" +',
    );
    expect(browserPreviewSource).toContain('".composer-context-strip{" +');
    expect(browserPreviewSource).not.toContain(
      ".chat-view-surface-reference:has(>.right-panel:not(.right-panel--sheet)) .composer-stack",
    );
    expect(overrides).toContain("height: 40px;");
    expect(overrides).toContain(".files-panel__search--focused {");
    expect(overrides).not.toContain(".files-panel__search:focus-within {");
    expect(overrides).toContain(".files-panel .file-tree-row {");
    expect(overrides).toContain("min-height: 24px;");
    expect(overrides).toContain("border-radius: 5px;");
    expect(overrides).toContain("font-family: var(--font-sans);");
    expect(overrides).toContain("font-size: 12px;");
    expect(overrides).toContain(".turn-diff-card .file-tree-row__name {");
    expect(overrides).toContain(".turn-diff-card .file-tree-row__stat {");
    expect(overrides).toContain(".turn-diff-card__status {");
    expect(overrides).toContain(".turn-diff-card__hint {");
    expect(overrides).toContain(".turn-diff-card__open-label {");
    expect(overrides).toContain(".file-panel__explorer {");
    expect(overrides).toContain("width: 256px;");
    expect(overrides).toContain(".right-panel--sheet .file-panel__explorer {");
    expect(overrides).toContain(".file-panel__back {");
    const fileBackStart = overrides.indexOf(".file-panel__back {");
    const fileBackBlock = overrides.slice(fileBackStart, overrides.indexOf("}", fileBackStart));
    expect(fileBackBlock).toContain("display: flex;");
    expect(overrides).not.toContain(".right-panel--sheet .file-panel__back {");
    expect(overrides).toContain(".file-editor-line__number {");
    expect(overrides).toContain("width: 48.8px;");
    expect(overrides).toContain("font-size: 13px;");
    expect(overrides).toContain("line-height: 20px;");
    expect(overrides).toContain(
      ".diff-code-line {\n  display: flex;\n  flex-direction: row;\n  align-items: center;\n  min-height: 20px;",
    );
    expect(overrides).toContain(
      ".diff-code-line__content {\n  flex-grow: 1;\n  min-width: 0;\n  color: var(--foreground);\n  font-size: 12px;\n  line-height: 20px;",
    );
    expect(diffPanelSource).not.toContain("projectFileLineTokens");
    expect(diffPanelSource).toContain('{line.content || " "}');
    expect(overrides).toContain(".diff-code-token--keyword {");
    expect(overrides).toContain('"SF Mono"');
    expect(overrides).not.toContain(".t3-jetbrains-mono-ready .files-panel__preview-content,");
    expect(files).toContain("projectFileLineTokens(path, line)");
    expect(files).toContain("serializeComposerFileLink(path)");
    expect(files).toContain('{ id: "copy-mention", label: "Copy mention" }');
    expect(files).toContain('{ id: "add-to-chat", label: "Add to chat" }');
    expect(files).toContain("onContextMenu={() => onContextMenu(node.path)}");
    expect(fileTreeSurfaceSource).toContain("eventThrough>{fileIcon}");
    expect(fileTreeSurfaceSource).toContain("onContextMenu={onContextMenu}");
    expect(files).toContain("if (!requestComposerTextInsertion(`${mention} `))");
    expect(composer).toContain("onComposerTextInsertion((text) =>");
    expect(composer).toContain('select("#composer-prompt-editor")');
    expect(composer).toContain('invoke("setValue", { value: nextValue })');
    expect(composer).toContain('invoke("setSelectionRange"');
    expect(composer).toContain('invoke("focus")');
    expect(composer).toContain('id="composer-prompt-editor"');
    expect(files).toContain("data-file-content-revision={fileContentRevision(contents)}");
    expect(files).toContain("data-file-save-status={saveStatus}");
    expect(files).toContain("file-editor-token file-editor-token--${token.tone}");
    expect(files).toContain('data-file-save-error={saveStatus === "error" ? "true" : "false"}');
    expect(files).toContain('data-file-save-retry={saveStatus === "error" ? "true" : "false"}');
    expect(files).toContain('{saveStatus === "error" ? "Retry save" : "Save now"}');
    expect(files).toContain("onFailure: (failure) => {");
    expect(files).toContain("void coordinator.flush()");
    expect(files).toContain("if (!viewport.testResize) return;");
    expect(files).toContain("__T3_LYNXTRON_FILE_EDITOR_PROBE__");
    expect(files).toContain("handleInput({ detail: { value } })");
    expect(webFilePreviewSource).toContain('role="alert"');
    expect(webFilePreviewSource).toContain("data-file-save-error");
    expect(webFilePreviewSource).toContain("border-destructive/20");
    expect(webFilePreviewSource).toContain("bg-destructive/5");
    expect(webFilePreviewSource).toContain("text-destructive-foreground");
    expect(webFilePreviewSource).toContain("data-file-save-retry");
    expect(webFilePreviewSource).toContain("Retry save");
    expect(webFilePreviewSource.match(/<FileSaveFailureBar/g)).toHaveLength(2);
    expect(webFilePreviewSource).toContain("void saveCoordinator.flush()");
    expect(overrides).toContain(".file-editor-token--heading,");
    expect(overrides).toContain(".file-editor-token--string,");
    expect(overrides).toContain(".file-editor-token--property {");
    expect(overrides).toContain(".theme-light .file-editor-token--heading,");
    expect(overrides).toContain(".theme-light .file-editor-token--string,");
    expect(overrides).toContain(".theme-light .file-editor-token--property {");
    expect(overrides).toContain(".file-panel__statusbar {");
    expect(overrides).toContain("height: 33px;");
    expect(overrides).toContain(".files-panel__save {\n  display: flex;");
    expect(overrides).toContain("flex-shrink: 0;");
    expect(overrides).toContain("width: 75px;");
    expect(overrides).toContain("height: 24px;");
    expect(overrides).toContain(".files-panel__save-label {\n  white-space: nowrap;");
    expect(overrides).toContain(".files-panel__preview-status {\n  flex-grow: 1;");
    expect(overrides).toContain("text-overflow: ellipsis;");
    expect(overrides).toContain("border-radius: 0;");
    expect(panel).toContain("data-right-panel-add-kind={item.kind}");
    expect(panel).toContain("showNativeContextMenu(");
    expect(panel).toContain('{ id: "close", label: "Close" }');
    expect(panel).toContain('id: "close-others"');
    expect(panel).toContain('id: "close-to-right"');
    expect(panel).toContain('{ id: "close-all", label: "Close all"');
    expect(panel).toContain('surface.kind === "file" ? [{ id: "copy-path", label: "Copy path" }]');
    expect(panel).toContain("uiActions.closeOtherRightPanelSurfaces(surface.id)");
    expect(panel).toContain("uiActions.closeRightPanelSurfacesToRight(surface.id)");
    expect(panel).toContain("closeRemovedTerminal(state.surfaces");
    expect(rightPanelSurfaceSource).toContain("...(onContextMenu ? { onContextMenu } : {})");
    expect(hostElementsSource).toContain('contextMenuRef.current?.invoke("boundingClientRect"');
    expect(hostElementsSource).toContain("{ x: measured.left, y: measured.top + measured.height }");
    expect(panel).toContain("handleTabContextMenu(surface, event)");
    expect(panel).toContain("{ x: anchor.x, y: anchor.y }");
    expect(hostElementsSource.match(/event.button === 2 && onContextMenu/g)).toHaveLength(4);
    expect(hostElementsSource.match(/event.button === 1 && onAuxClick/g)).toHaveLength(4);
    expect(panel).toContain("onAuxClick={() => handleCloseTab(surface)}");
    expect(rightPanelSurfaceSource).toContain("...(onAuxClick ? { onAuxClick } : {})");
    expect(panel).toContain('className="right-panel__add-menu-dismiss"');
    expect(panel).toContain("bindtap={() => setShowAddMenu(false)}");
    expect(panel).toContain('data-floating-popup="right-panel-add-menu"');
    expect(overrides).toContain(".right-panel__add-menu-dismiss {");
    const addMenuBlock = overrides.match(/\.right-panel__add-menu \{[^}]+\}/)?.[0] ?? "";
    expect(addMenuBlock).toContain("left: 0;");
    expect(addMenuBlock).toContain("width: 128px;");
    expect(addMenuBlock).toContain("height: 122px;");
    expect(addMenuBlock).toContain("border-radius: 10px;");
    expect(addMenuBlock).toContain("background-color: rgba(var(--popover-rgb), 0.836);");
    expect(overrides).toContain(".right-panel__tab-list > [data-active-tab] {");
    expect(overrides).toContain("min-width: 100px;");
    const addItemBlock = overrides.match(/\.right-panel__add-item \{[^}]+\}/)?.[0] ?? "";
    expect(addItemBlock).toContain("width: 118px;");
    expect(addItemBlock).toContain("height: 28px;");
    expect(addItemBlock).toContain("padding: 4px 8px;");
    expect(overrides).toContain(".right-panel__add-item--disabled {\n  opacity: 0.64;");
    expect(overrides).toContain(".theme-light .right-panel__add-menu {");
    expect(panel).toContain('case "file":');
    expect(panel).toContain("<FilePanel path={surface.path} />");
    expect(panel).toContain("useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY)");
    expect(panel).toContain("resolveRightPanelSheetWidth(viewport.width)");
    expect(branchToolbarSource).toContain('className="min-w-0 flex-1 justify-end md:ml-auto"');
    expect(branchToolbarSource).not.toContain("md:flex-none");
    expect(branchToolbarEnvModeSource).toContain(
      'className="min-w-0 max-w-full flex-1 font-medium"',
    );
    expect(branchToolbarBranchSource).toContain('className="flex min-w-0 flex-1"');
    expect(branchToolbarBranchSource).toContain(
      'className="min-w-0 w-full max-w-full text-muted-foreground/70',
    );
  });

  it("reuses the Open in picker for project and file targets", () => {
    const header = componentSource("ChatHeader.tsx");
    const files = componentSource("FilesPanel.tsx");
    const picker = componentSource("OpenInPicker.tsx");

    expect(header).toContain("<OpenInPicker");
    expect(header).toContain("platform={platform}");
    expect(files).toContain("cwd={absolutePath}");
    expect(files).toContain('anchor="file-open-in-menu"');
    expect(picker).toContain("platformEditorLabel(editor, platform)");
    expect(picker).toContain("editorIconKind(editor)");
    expect(picker).not.toContain("open-in-menu__item--selected");
    expect(picker).toContain(
      'data-preferred-editor={editor === preferredEditor ? "true" : "false"}',
    );
    expect(picker).toContain('command === "editor.openFavorite"');
    expect(picker).toContain("formatKeybindingShortcutLabel(binding.shortcut");
    expect(picker).toContain('className="open-in-menu__shortcut"');
    expect(picker).toContain("Math.min(Math.max(availableEditors.length, 1) * 28 + 10, 288)");
  });

  it("projects every authority Diff scope through real typed data sources", () => {
    const diff = componentSource("DiffPanel.tsx");
    const bridge = readFileSync(path.join(import.meta.dirname, "../bridge.ts"), "utf8");
    const client = readFileSync(path.join(import.meta.dirname, "../state/t3Client.ts"), "utf8");

    expect(diff).toContain('data-diff-scope="working-tree"');
    expect(diff).toContain('data-diff-scope="branch"');
    expect(diff).toContain('data-diff-scope="latest-turn"');
    expect(diff).toContain('data-diff-scope="turn"');
    expect(diff).toContain(".getDiffPreview({");
    expect(diff).toContain("t3ClientActions.getTurnDiff");
    expect(diff).toContain('className="diff-panel-header__scope-dismiss"');
    expect(diff).toContain('className="diff-panel-header__scope-submenu"');
    expect(bridge).toContain("getDiffPreview(input: ReviewDiffPreviewInput)");
    expect(client).toContain("bridge.getDiffPreview(input)");
    expect(overrides).toContain(".diff-panel-header__scope-dismiss {");
    expect(overrides).toContain("width: 240px;");
    expect(overrides).toContain("height: 122px;");
    expect(overrides).toContain("width: 230px;");
    expect(overrides).toContain("height: 28px;");
    expect(overrides).toContain(".theme-light .diff-panel-header__scope-menu,");
    expect(overrides).toContain(".diff-code-file--selected {\n  border-left-width: 0;");
    expect(overrides).toContain(".diff-code-file {");
    expect(overrides).toContain("  border-left-width: 0;");
    expect(overrides).toContain("  height: 32px;");
    expect(overrides).toContain("color-mix(in srgb, var(--background) 92%, var(--success))");
  });

  it("persists Project Action keybindings after the script update", () => {
    const dialog = componentSource("ProjectActionDialog.tsx");

    expect(dialog).toContain("decodeProjectScriptKeybindingRule");
    expect(dialog).toContain("commandForProjectScript(id)");
    expect(dialog).toContain("keybindingRule ? t3ClientActions.upsertKeybinding");
    expect(dialog).toContain('data-keybinding-input-mode="canonical-text"');
    expect(dialog).toContain("PROJECT_SCRIPT_KEYBINDING_HELPER.prefix");
    expect(dialog.indexOf(".updateProjectScripts(")).toBeLessThan(
      dialog.indexOf("t3ClientActions.upsertKeybinding"),
    );
    expect(dialog).toContain(
      'setError(cause instanceof Error ? cause.message : "Invalid keybinding.")',
    );
  });

  it("restores the Settings rail allocation in Lynx-for-Web", () => {
    expect(browserPreviewSource).toContain(
      '".settings-root{display:flex;flex:1 1 0%;flex-direction:row;width:100%;height:100%;min-width:0;}"',
    );
    expect(browserPreviewSource).toContain('".settings-nav{" +');
    expect(browserPreviewSource).toContain(
      '".settings-nav__items{display:flex;flex:1 1 0%;flex-direction:column;width:100%;}"',
    );
    expect(browserPreviewSource).toContain('".settings-main{" +');
    expect(settingsNavigationSource).not.toContain('isActive || item.to === "/settings/providers"');
    expect(settingsNavigationSource).toContain("const navigateBack = () => onBack();");
    expect(settingsNavigationSource).toContain(
      '<view className="settings-nav__back" flatten={false} bindtap={navigateBack}>',
    );
    expect(settingsNavigationSource).toContain(
      '<text className="settings-nav__back-label" bindtap={navigateBack}>',
    );
    expect(overrides).not.toContain(".settings-nav__item--providers {");
  });

  it("projects and opens the real repository Publish flow", () => {
    const header = componentSource("ChatHeader.tsx");
    const chatView = componentSource("ChatView.tsx");
    const publish = componentSource("GitPublishDialog.tsx");
    const app = readFileSync(path.resolve(import.meta.dirname, "../index.tsx"), "utf8");
    const uiState = readFileSync(path.resolve(import.meta.dirname, "../state/uiState.ts"), "utf8");
    const bridge = readFileSync(path.resolve(import.meta.dirname, "../bridge.ts"), "utf8");
    const client = readFileSync(path.resolve(import.meta.dirname, "../state/t3Client.ts"), "utf8");

    expect(header).toContain('from "@t3tools/client-runtime/state/git-actions"');
    expect(client).toContain("function refreshVcsStatusProjection()");
    expect(client).toContain("bridge.readVcsStatus({ cwd })");
    expect(chatView).toContain("vcsStatusCwd === cwd ? vcsStatus : null");
    expect(header).toContain("vcsStatusPending");
    expect(header).toContain("data-git-quick-action-kind");
    expect(header).toContain("data-git-quick-action-label");
    expect(header).toContain('gitQuickAction.kind === "initialize_repo"');
    expect(header).toContain('? "git-branch-plus"');
    expect(header).toContain(".initializeRepository(cwd)");
    expect(header).toContain('grouped={gitQuickAction.kind !== "initialize_repo"}');
    expect(header).toContain('gitQuickAction.kind === "open_publish"');
    expect(header).toContain("uiActions.openGitPublishDialog");
    expect(header).not.toContain("<GitPublishDialog");
    expect(header).not.toContain('openRightPanelSurface("publish")');
    expect(publish).toContain('data-git-publish-dialog="true"');
    expect(publish).toContain("PUBLISH_PROVIDERS");
    expect(publish).toContain('["Provider", "Repository", "Summary"]');
    expect(publish).toContain("data-git-publish-step-state");
    expect(publish).toContain("data-git-publish-provider-ready");
    expect(publish).toContain("discoverSourceControl()");
    expect(publish).toContain(".publishRepository({");
    expect(publish).toContain('aria-label="Dismiss Publish repository"');
    expect(publish).toContain('aria-label="Close Publish repository"');
    expect(publish).toContain('className="git-publish-dialog flex flex-col" catchtap');
    expect(publish).toContain('className="git-publish-header flex flex-col"');
    expect(publish).toContain('className="git-publish-heading flex flex-col"');
    expect(publish).toContain('className="git-publish-body flex flex-col"');
    expect(publish).not.toContain("providerRows");
    expect(publish).toContain("providerOptions.map");
    expect(publish).toContain('className="git-publish-label git-publish-label--first">Provider');
    expect(publish).not.toContain(
      '<text className="git-publish-provider-card__host">{item.host}</text>',
    );
    expect(overrides).not.toContain("flex-flow: row wrap;");
    expect(overrides).not.toContain(".git-publish-label:first-child");
    expect(overrides).toContain(".git-publish-label--first {");
    expect(overrides).toContain("grid-template-columns: 258px 258px;");
    expect(overrides).toContain("width: 526px;");
    expect(overrides).toContain("height: 49px;");
    expect(overrides).toContain("margin-top: 8px;");
    expect(overrides).toContain("font-size: 14px;");
    expect(overrides).toContain("line-height: 20px;");
    expect(overrides).toContain("height: 28px;");
    expect(overrides).toContain("padding: 0 9px;");
    expect(app).toContain("<GitPublishDialog");
    expect(app).toContain("onClose={uiActions.closeGitPublishDialog}");
    expect(uiState).toContain('Atom.withLabel("lynx-git-publish-dialog-open")');
    expect(bridge).toContain("publishRepository(");
    expect(bridge).toContain("initializeRepository(");
    expect(client).toContain("function publishRepository(");
    expect(client).toContain("async function initializeRepository(cwd: string)");
    expect(client).toContain("refreshVcsStatusProjection();");
    expect(overrides).toContain(".git-publish-dialog {");
    expect(overrides).not.toContain(".action-btn--commit {\n  width: 101px;");
    expect(overrides).toContain(".action-btn__label {\n  flex-shrink: 0;");
    expect(overrides).toContain("white-space: nowrap;");
  });

  it("prevents Sidebar action rows from collapsing into one another", () => {
    expect(sidebarSource).toContain("const actionCount =");
    expect(sidebarSource).toContain("const menuHeight = actionCount * 30 + 10;");
    expect(sidebarSource).toContain("style={{ height: `${menuHeight}px`");
    expect(overrides).toContain("min-height: 30px;");
    expect(overrides).toContain("flex-shrink: 0;");
  });

  it("anchors Sidebar project controls to the live Sidebar width", () => {
    expect(sidebarControlsSource).toContain("readonly projectScopePopupWidth?: number;");
    expect(sidebarControlsSource).not.toContain("projectScopeControlWidth");
    expect(sidebarControlsSource).toContain(
      'SidebarGroup className="sidebar-v2-control-group px-2 pb-2 pt-0"',
    );
    expect(sidebarControlsSource).toContain(
      "sidebar-v2-project-scope-host relative min-w-0 flex-1",
    );
    expect(sidebarControlsSource).toContain("onContextMenu={option.onContextMenu}");
    expect(sidebarControlsSource.match(/onContextMenu=\{option.onContextMenu\}/g)).toHaveLength(2);
    expect(
      readFileSync(
        path.resolve(import.meta.dirname, "../../../../web/src/components/ui/menu.lynx.tsx"),
        "utf8",
      ),
    ).toContain("onClick={handleTap}");
    expect(sidebarSource).toContain('{ id: "settings", label: "Project settings" }');
    expect(sidebarSource).toContain('{ id: "copy-path", label: "Copy Path" }');
    expect(sidebarSource).toContain(
      "clientCapabilities.clipboard.writeText(project.workspaceRoot)",
    );
    expect(sidebarControlsSource).not.toContain("maxWidth: `${props.projectScopePopupWidth}px`");
    expect(overrides).toContain(
      ".sidebar-v2-project-scope-host {\n  flex-grow: 1;\n  flex-shrink: 1;\n  width: 0;\n  min-width: 0;\n}",
    );
    expect(overrides).toContain(
      ".sidebar-v2-control-group {\n  width: 100%;\n  box-sizing: border-box;\n}",
    );
  });

  it("keeps the authority brand on the shared titlebar inset", () => {
    expect(overrides).toContain(".sidebar-brand-host {\n  position: absolute;\n  left: 130px;");
    expect(overrides).toContain(".viewport-responsive .sidebar-brand-host {\n  left: 130px;\n}");
  });

  it("keeps Sidebar thread state truthful and actions progressively disclosed", () => {
    const faviconSource = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ProjectFavicon.lynx.tsx"),
      "utf8",
    );

    expect(sidebarSource).toContain("const status = resolveSidebarV2Status(thread);");
    expect(sidebarSource).toContain("topStatus={statusPresentation(status, thread)}");
    expect(sidebarSource).toContain('case "working":');
    expect(sidebarSource).toContain('label: "Working"');
    expect(sidebarSource).toContain("function LynxWorkingDuration");
    expect(sidebarSource).toContain("resolveWorkingStartedAt(thread)");
    expect(sidebarSource).toContain("formatWorkingDurationLabel(Date.now() - startedMs)");
    expect(sidebarSource).toContain("workingDuration: <LynxWorkingDuration thread={thread} />");
    expect(overrides).toContain(".sidebar-v2-row-card .sidebar-v2-row-actions {");
    expect(overrides).toContain(
      ".sidebar-v2-row-card .sidebar-v2-row-actions {\n  z-index: 2;\n  opacity: 0;",
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-card .sidebar-v2-row-actions.opacity-100 {\n  opacity: 1;",
    );
    expect(overrides).toContain("background-color: transparent;");
    expect(overrides).not.toContain(".sidebar-v2-row-card--active .sidebar-v2-row-actions {");
    expect(overrides).not.toContain(".sidebar-v2-row-card--selected .sidebar-v2-row-actions {");
    expect(overrides).toContain(
      ".topbar__proj-name {\n  color: var(--header-project-foreground);\n  width: auto;",
    );
    expect(overrides).toContain(
      ".settings-topbar {\n  display: flex;\n  flex-direction: row;\n  align-items: center;\n  justify-content: space-between;\n  width: 100%;",
    );
    expect(sidebarSource).toContain("settlementSupported={settlementSupported}");
    expect(sidebarSource).not.toContain('"data-sidebar-thread-action-trigger": thread.id');
    expect(sidebarSource).toContain("data-sidebar-snooze-trigger={thread.id}");
    expect(sidebarSource).toContain("data-sidebar-empty-thread-delete={thread.id}");
    expect(sidebarSource).toContain('aria-label="Delete empty thread"');
    expect(sidebarSource).toContain("data-sidebar-thread-delete={thread.id}");
    expect(sidebarSource).toContain("data-sidebar-thread-delete-confirm={thread.id}");
    expect(sidebarSource).toContain("bindtap={requestDelete}");
    expect(sidebarSource).toContain("bindtap={confirmDelete}");
    expect(sidebarSource).toContain("isDisposableEmptyThread(thread)");
    expect(sidebarSource).toContain('{ id: "mark-unread", label: "Mark unread" }');
    expect(sidebarSource).toContain("label: `New thread on ${thread.branch}`");
    expect(sidebarSource).toContain("t3ClientActions.createThread(thread.projectId, {");
    expect(sidebarSource).toContain('envMode: thread.worktreePath ? "worktree" : "local"');
    expect(sidebarSource).toContain("startFromOrigin: false");
    expect(sidebarSource).toContain('id: "regenerate-title"');
    expect(sidebarSource).toContain("t3ClientActions.regenerateThreadTitle(thread.id)");
    expect(sidebarSource).toContain("resolveSnoozePresets(new Date())");
    expect(sidebarSource).toContain('label: "Snooze"');
    expect(sidebarSource).toContain("t3ClientActions.snoozeThread(thread.id, preset.snoozedUntil)");
    expect(sidebarSource).toContain("t3ClientActions.unsnoozeThread(thread.id)");
    expect(sidebarRowSource).toMatch(
      /variant === "slim"[\s\S]*?<HostText[\s\S]*?onClick=\{\(\) => props\.onClick\?\.\(\{\}\)\}[\s\S]*?onContextMenu=\{props\.onContextMenu\}[\s\S]*?props\.favicon/u,
    );
    expect(sidebarSource).toMatch(
      /visibleSettledThreads\.map[\s\S]*?<HostText[\s\S]*?onClick=\{\(\) => \{[\s\S]*?markThreadVisited\(thread\)[\s\S]*?onContextMenu=\{\(event\)[\s\S]*?thread\.title/u,
    );
    expect(sidebarSource).toMatch(
      /visibleSettledThreads\.map[\s\S]*?<HostText\s+onClick=\{\(\) => \{[\s\S]*?markThreadVisited\(thread\)/u,
    );
    expect(sidebarSource).toContain("markThreadUnreadInTimestampRecord");
    expect(sidebarSource).toContain("markThreadVisitedInTimestampRecord");
    expect(sidebarSource).toContain("hasUnseenThreadCompletion({");
    expect(sidebarSource).toContain("isUnread={isUnread}");
    expect(sidebarSource).toContain("setPref(THREAD_VISITED_TIMESTAMPS_PREF, next)");
    expect(sidebarSource).toContain("t3ClientActions.archiveThread(thread.id)");
    expect(sidebarSource).toContain("t3ClientActions.deleteThread(thread.id)");
    expect(componentSource("OtherSettings.tsx")).toContain('data-settings-archive-error="true"');
    expect(componentSource("OtherSettings.tsx")).toContain('"Failed to unarchive thread"');
    expect(componentSource("OtherSettings.tsx")).toContain('"Failed to delete thread"');
    expect(sidebarSource).toContain("cardActionsVisible={");
    expect(sidebarSource).toContain("snoozeMenuOpen || hoveredThreadId === thread.id");
    expect(sidebarSource).toContain("snoozeSupported && canSnooze(thread");
    expect(sidebarSource).toContain('aria-label="Snooze thread"');
    expect(sidebarRowSource).toContain('props.cardActionsVisible && "opacity-100"');
    expect(sidebarRowSource).toContain("{props.settleIcon}\n                        Settle");
    expect(sidebarSource).toContain("setHoveredThreadId(thread.id)");
    const settledRowsStart = sidebarSource.indexOf("visibleSettledThreads.map");
    const settledRows = sidebarSource.slice(settledRowsStart);
    expect(settledRows).toContain("<LynxThreadDetails");
    expect(settledRows).toContain("provider={providerProjection.provider}");
    expect(sidebarSource).toContain("if (!actionMenuOpen) {");
    expect(overrides).toContain(".sidebar-v2-row-card .sidebar-v2-row-status {");
    expect(overrides).toContain(".sidebar-v2-row-card .sidebar-v2-row-status--actions-visible {");
    expect(overrides).toContain(".sidebar-v2-working-duration {");
    expect(overrides).not.toContain(".sidebar-v2-row-item--active {");
    expect(sidebarRowSource).toContain('"bg-sidebar-row-active text-sidebar-foreground"');
    expect(overrides).toContain(
      ".inline-markdown-text {\n  color: rgba(var(--foreground-rgb), 0.8);",
    );
    expect(overrides).toContain(".md-paragraph {\n  color: rgba(var(--foreground-rgb), 0.8);");
    expect(overrides).toContain(".md-inline-code {\n  padding: 1px 5px;\n  border-width: 1px;");
    expect(overrides).toContain(
      ".sidebar-v2-row-card {\n  display: flex;\n  flex-direction: column;",
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-card__content {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  height: 78px;",
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-project-line,\n.sidebar-v2-row-title-line,\n.sidebar-v2-row-metadata-line {\n  width: 100%;\n  box-sizing: border-box;\n}",
    );
    expect(overrides).not.toContain("padding-right: 132px");
    expect(overrides).not.toContain(".sidebar-v2-row-card:hover .sidebar-v2-row-actions,");
    expect(overrides).toContain(
      ".sidebar-v2-row-project-title {\n  flex-grow: 1;\n  flex-shrink: 1;\n  width: 0;\n  min-width: 0;\n}",
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-card .sidebar-v2-row-status-slot {\n  flex-grow: 0;\n  flex-shrink: 0;\n}",
    );
    expect(faviconSource).toContain('name="folder"');
    expect(faviconSource).not.toContain("background-color");
  });

  it("keeps Sidebar V2 controls in shared flexible slots", () => {
    expect(sidebarControlsSource).toContain(
      "sidebar-v2-control-row sidebar-v2-control-row--search",
    );
    expect(sidebarControlsSource).toContain(
      "sidebar-v2-control-row sidebar-v2-control-row--projects",
    );
    expect(sidebarControlsSource).toContain(
      '<HostView className="sidebar-v2-control-primary min-w-0 flex-1">',
    );
    expect(sidebarControlsSource).toContain(
      '<HostView className="sidebar-v2-control-action shrink-0">',
    );
    expect(overrides).toContain(
      ".sidebar-v2-control-row {\n  display: flex;\n  flex-direction: row;\n  align-items: center;\n  width: 100%;\n  height: 32px;",
    );
    expect(overrides).toContain(
      ".sidebar-v2-control-primary {\n  display: flex;\n  flex-direction: row;\n  flex-grow: 1;\n  flex-shrink: 1;\n  width: 0;\n  min-width: 0;",
    );
    expect(overrides).toContain(
      ".sidebar-v2-control-action {\n  display: flex;\n  flex-direction: row;\n  flex-grow: 0;\n  flex-shrink: 0;\n  width: 32px;\n  height: 32px;",
    );
  });

  it("matches Web new-thread routing and tooltip timing", () => {
    const tooltipSource = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ui/tooltip.lynx.tsx"),
      "utf8",
    );

    expect(sidebarSource).toContain(
      "if (shouldChooseProjectForNewThread(orderedProjects.length)) {",
    );
    expect(sidebarSource).toContain("uiActions.openNewThreadIn();");
    expect(sidebarControlsSource.match(/<HostText\s+eventThrough/g)).toHaveLength(2);
    expect(hostElementsSource).toContain("event-through={eventThrough}");
    expect(sidebarSource).toContain(
      'shortcutLabelForCommand(serverConfig.keybindings, "chat.newLocal", "MacIntel")',
    );
    expect(sidebarSource).toContain(
      'shortcutLabelForCommand(serverConfig.keybindings, "chat.new", "MacIntel")',
    );
    expect(tooltipSource).toContain("delay: 600,");
    expect(tooltipSource).toContain("delay = 600,");
    expect(sidebarCompositionSource).toContain("delay={150}");
    expect(sidebarCompositionSource).toContain("closeDelay={0}");
    expect(tooltipSource).toContain(
      "lynx-tooltip-content-motion lynx-tooltip-content-motion--${variant}",
    );
    expect(overrides).toContain(
      ".lynx-tooltip-content-motion {\n  display: flex;\n  flex-direction: column;",
    );
    expect(overrides).toContain(
      ".lynx-tooltip-popup {\n  position: absolute;\n  width: max-content;\n  height: max-content;",
    );
    expect(overrides).toContain(".lynx-tooltip-content-motion--default {");
    expect(overrides).toContain("padding: 4px 8px;");
    expect(overrides).toContain("border-radius: 6px;");
    expect(overrides).toContain("font-size: 12px;");
    expect(overrides).toContain(
      ".lynx-tooltip-text {\n  color: inherit;\n  font-family: inherit;\n  font-size: inherit;\n  line-height: inherit;\n  white-space: nowrap;",
    );
    expect(overrides).toContain("animation: lynx-tooltip-enter 150ms ease-out both;");
    expect(overrides).toContain("animation: lynx-palette-backdrop-enter 200ms ease-in-out both;");
    expect(overrides).toContain("animation: lynx-palette-panel-enter 200ms ease-in-out both;");
    expect(dialogStylesSource).toContain(
      "transition-all duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
    );
    expect(dialogStylesSource).toContain(
      "transition-[scale,opacity,translate] duration-200 ease-in-out",
    );
    expect(dialogStylesSource).toContain("data-ending-style:scale-98 data-starting-style:scale-98");
    expect(overrides).toContain("@media (prefers-reduced-motion: reduce) {");
  });

  it("keeps Sidebar details hover-anchored to the complete thread card", () => {
    const tooltipSource = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ui/tooltip.lynx.tsx"),
      "utf8",
    );

    expect(sidebarSource).toContain("<TooltipPopup");
    expect(sidebarSource).toContain('side="right"');
    expect(sidebarSource).toContain('align="start"');
    expect(sidebarSource).toContain("sideOffset={4}");
    expect(sidebarSource).toContain("detailsRelationId={detailsRelationId}");
    expect(sidebarSource).not.toContain("detailsThreadId");
    expect(sidebarSource).not.toContain("Show details for");
    const detailsPopoverStart = overrides.indexOf(".sidebar-v2-details-popover {");
    const detailsPopoverBlock = overrides.slice(
      detailsPopoverStart,
      overrides.indexOf("}", detailsPopoverStart),
    );
    expect(detailsPopoverBlock).not.toContain("top:");
    expect(detailsPopoverBlock).not.toContain("left:");
    expect(detailsPopoverBlock).toContain("width: max-content;");
    expect(overrides).not.toContain(".sidebar-v2-details-dismiss {");
    expect(componentSource("Composer.tsx")).toContain("composer-context-item--overlay-open");
    expect(tooltipSource).toContain("const hoverInsideRef = useRef(false);");
    expect(tooltipSource).toContain("if (hoverInsideRef.current === inside) return;");
    expect(tooltipSource).toContain("hoverInsideRef.current = inside;");
    expect(tooltipSource).toContain('"main-thread:bindmouseleave": handleMouseLeave');
    expect(tooltipSource).toContain("runOnBackground(reportHover)(false);");
    expect(tooltipSource).toContain(
      "if (timerRef.current !== null) clearTimeout(timerRef.current);",
    );
    expect(tooltipSource).toContain('"main-thread:bindmousemove": handleMouseMove');
    expect(tooltipSource).toContain("main-thread:global-bindmousemove={handleGlobalMouseMove}");
    expect(tooltipSource).not.toContain(
      '"main-thread:global-bindmousemove": handleGlobalMouseMove',
    );
    expect(tooltipSource).toContain("await reportTriggerHover(triggerRef.current)");
    expect(tooltipSource).toContain("await runOnBackground(reportHover)(true, rect);");
    expect(tooltipSource).toContain("__T3_LYNXTRON_TOOLTIP_PROBE__");
    expect(tooltipSource).toContain("renderedMouseEnter?.()");
    expect(tooltipSource).toContain("renderedMouseLeave?.()");
    expect(tooltipSource).toContain("await runOnMainThread(handleProbeMouseLeave)(relationId)");
    expect(tooltipSource).toContain("await runOnMainThread(handleProbeMouseMove)(relationId)");
    expect(tooltipSource).toContain('.querySelectorAll("[data-floating-anchor]")');
    expect(tooltipSource).toContain('typeof children === "string" || typeof children === "number"');
    expect(tooltipSource).toContain('<text className="lynx-tooltip-text">{children}</text>');
    expect(tooltipSource).toContain('trigger.invoke("boundingClientRect"');
    expect(tooltipSource).toContain('trigger.setAttribute("data-tooltip-pointer-inside", "true")');
    expect(tooltipSource).toContain(
      'trigger.getAttribute("data-tooltip-pointer-inside") !== "true"',
    );
    expect(hostElementsSource).toContain('props["main-thread:bindmousemove"]');
    expect(hostElementsSource).toContain("injectedMouseMove?.(event)");
    expect(hostElementsSource).toContain("injectedMouseLeave?.(event)");
    expect(tooltipSource).toContain("resolveFloatingAnchorPoint(context.anchorRect");
    expect(tooltipSource).toContain("data-floating-side={side}");
  });

  it("renders keybinding shortcuts with shared keycap primitives", () => {
    expect(keybindingsSettingsSource).toContain('from "../../../../web/src/components/ui/kbd"');
    expect(keybindingsSettingsSource).toContain("shortcutParts(row.binding.shortcut, platform)");
    expect(keybindingsSettingsSource).toContain('className="keybindings-table__keycap"');
    expect(overrides).toContain(".keybindings-table__keycap {");
  });

  it("keeps Sidebar versions, project groups, and Add Project intents aligned with Web", () => {
    const sidebarLayout = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/AppSidebarLayout.lynx.tsx"),
      "utf8",
    );
    const sidebarClassic = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/Sidebar.lynx.tsx"),
      "utf8",
    );
    const sidebarProjectListHost = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../web/src/components/sidebar/SidebarProjectListHost.lynx.tsx",
      ),
      "utf8",
    );
    const projectSettings = componentSource("ProjectSettingsDialog.tsx");
    const quickSwitch = readFileSync(path.resolve(import.meta.dirname, "QuickSwitch.tsx"), "utf8");
    const appIndex = readFileSync(path.resolve(import.meta.dirname, "../index.tsx"), "utf8");
    const settings = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/hooks/useSettings.lynx.ts"),
      "utf8",
    );

    expect(settings).toContain("useLegacySidebarEnabled");
    expect(settings).toContain("settings.legacySidebarEnabled");
    expect(sidebarLayout).toContain(
      "const useFlatSidebar = !legacySidebarEnabled && !isOnSettings;",
    );
    expect(sidebarLayout).toContain(
      'data-sidebar-version={useFlatSidebarTheme ? "flat" : "legacy"}',
    );
    expect(sidebarClassic).toContain("buildSidebarProjectSnapshots");
    expect(sidebarClassic).toContain("sidebarProjectGroupingMode");
    expect(sidebarClassic).toContain("sidebarProjectGroupingOverrides");
    expect(sidebarClassic).toContain("sortProjectsForSidebar");
    expect(sidebarClassic).toContain("sortThreads");
    expect(sidebarClassic).toContain("collapsedProjectKeys");
    expect(sidebarClassic).toContain("setCollapsedProjectKeys");
    expect(sidebarClassic).toContain("bindtap={uiActions.openAddProject}");
    expect(sidebarSource).toContain("onNewProjectClick: uiActions.openAddProject");
    expect(sidebarSource).toContain("onAddProjectClick={uiActions.openAddProject}");
    expect(sidebarProjectListHost).toContain('className="lynx-sidebar-project-list flex flex-col"');
    expect(sidebarProjectListHost).toContain(
      'className="sidebar-project-row-reference lynx-sidebar-project-row flex flex-row"',
    );
    expect(sidebarProjectListHost).toContain("bindcontextmenu:");
    expect(sidebarProjectListHost).toContain("bindlongpress:");
    expect(sidebarProjectListHost).toContain("<ProjectSettingsDialog");
    expect(sidebarSource).toContain("data-sidebar-project-action={project.id}");
    expect(sidebarSource).toContain("aria-label={`Project actions for ${project.title}`}");
    expect(sidebarSource).toContain("showNativeContextMenu([");
    expect(sidebarSource).toContain("void showThreadContextMenu(");
    expect(sidebarSource).toContain('{ id: "delete", label: "Delete", destructive: true }');
    expect(hostElementsSource).toContain("event.button === 2 && onContextMenu");
    expect(hostElementsSource).toContain('"main-thread:bindmousedown": handleMouseDown');
    expect(sidebarSource).toContain("<ProjectSettingsDialog");
    expect(projectSettings).toContain("Project settings");
    expect(projectSettings).toContain("Project name");
    expect(projectSettings).toContain("Grouping rule");
    expect(projectSettings).toContain("Remove project");
    expect(projectSettings).toContain(".updateProject(member.id, title)");
    expect(projectSettings).toContain("updateSettings({ sidebarProjectGroupingOverrides");
    expect(projectSettings).toContain("t3ClientActions");
    expect(projectSettings).toContain(".deleteProject(member.id, true)");
    expect(quickSwitch).toContain('data-quick-switch-mode="add-project-sources"');
    expect(quickSwitch).toContain('id: "new-thread-in",\n        icon: "square-pen"');
    expect(quickSwitch).toContain('shortcutCommand: "chat.new"');
    expect(quickSwitch).toContain('shortcutCommand: "filePicker.toggle"');
    expect(quickSwitch).toContain("shortcutLabelForCommand(");
    expect(quickSwitch).not.toContain('setView(\n      openIntent?.kind === "add-project"');
    expect(quickSwitch).not.toContain("clearQuickSwitchOpenIntent");
    expect(appIndex).toContain("if (appliedInitialRoute.current) return;");
    expect(appIndex).toContain('overlay === "file-picker"');
    expect(appIndex).toContain('uiActions.openQuickSwitch("files")');
    expect(appIndex).toContain('overlay === "right-panel-tabs"');
    expect(keyboardCommandsSource).toContain("return dismissOpenSearchOverlay();");
    expect(appIndex).toContain('uiActions.openRightPanelSurface("files")');
    expect(appIndex).toContain('uiActions.openRightPanelSurface("diff")');
    expect(appIndex.indexOf('uiActions.openRightPanelSurface("diff")')).toBeLessThan(
      appIndex.indexOf('uiActions.openRightPanelSurface("files")'),
    );
    expect(quickSwitch).toContain('"Local folder"');
    expect(quickSwitch).toContain('"Git URL"');
    expect(quickSwitch).toContain("Setup Required");
    expect(quickSwitch).toContain("browseFilesystem");
    expect(quickSwitch).toContain("createProject");
    expect(quickSwitch).toContain("cloneRepository");
    expect(quickSwitch).toContain("createThreadInProject");
    expect(quickSwitch).toContain("sortProjectsForSidebar(projects, threads,");
    expect(quickSwitch).toContain('"palette-panel palette-panel--new-thread-projects"');
    expect(overrides).toContain(".palette-panel--new-thread-projects {\n  width: 576px;\n}");
    expect(overrides).toContain(
      ".lynx-web-preview .palette-panel--new-thread-projects {\n  width: 574px;\n}",
    );
    expect(overrides).toContain(
      ".quick-switch-project-row {\n  height: 48px;\n  min-height: 48px;\n}",
    );
    expect(quickSwitch).toContain("const navigateBack = useCallback");
    expect(quickSwitch).toContain('className="qs-search__back"');
    expect(quickSwitch).toContain('aria-label="Back"');
    expect(quickSwitch).toContain("bindtap={navigateBack}");
    expect(quickSwitch).toContain(
      'view === "add-project-sources" || view === "new-thread-projects"',
    );
    expect(quickSwitch).toContain("onHoverStart={() => setActiveIndex");
    expect(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          "../../../../web/src/components/ui/hostElements.lynx.tsx",
        ),
        "utf8",
      ),
    ).toContain('"main-thread:bindmousemove": handleMouseEnter');
    expect(quickSwitch).toContain('key === "ArrowDown" || key === "ArrowUp"');
    expect(quickSwitch).toContain('key === "Backspace"');
    expect(quickSwitch).toContain('key === "Escape"');
  });

  it("keeps model selection visible while the canonical shell catches up", () => {
    expect(clientSource).toContain("function persistModelSelectionMutation");
    expect(clientSource).toContain("modelSelectionPending: true");
    expect(clientSource).toContain("modelSelectionError: result.error");
    expect(clientSource).toContain("error: modelSelectionMutationError(error)");
    expect(clientSource).toContain("shouldRollbackModelSelectionMutation");
    expect(clientSource).toContain("projectThreadModelSelection(");
    expect(clientSource).not.toContain("[t3-client] failed to set model selection");
    expect(connectorSource).toContain(
      "const pendingSelection = this.pendingThreadModelSelections.get(thread.id);",
    );
    expect(connectorSource).toContain(
      "...(pendingSelection ? { modelSelection: pendingSelection } : {}),",
    );
  });

  it("keeps thread mode controls visible while commands settle", () => {
    expect(clientSource).toContain(
      "projectThreadRuntimeMode(state.threads, threadId, runtimeMode)",
    );
    expect(clientSource).toContain(
      "projectThreadInteractionMode(state.threads, threadId, interactionMode)",
    );
    expect(clientSource).toContain("const pendingThreadRuntimeModes = new Map");
    expect(clientSource).toContain("const pendingThreadInteractionModes = new Map");
    expect(clientSource).toContain("const pendingThreadModeCommands = new Map");
    expect(clientSource).toContain("const canonicalThreadRuntimeModes = new Map");
    expect(clientSource).toContain("const canonicalThreadInteractionModes = new Map");
    expect(clientSource).toContain("let threads = canonicalThreads;");
    expect(clientSource).toContain(
      "threads = projectThreadInteractionMode(threads, threadId, mutation.value);",
    );
    expect(clientSource).toContain("const setRuntimeMode = bridge.setThreadRuntimeMode");
    expect(clientSource).toContain("const setInteractionMode = bridge.setThreadInteractionMode");
    expect(clientSource).toContain("markPendingMutationAccepted(mutation)");
    expect(clientSource).toContain(
      "const rejected = rejectPendingMutation(pendingThreadRuntimeModes, threadId, mutation)",
    );
    expect(clientSource).toContain(
      "const rejected = rejectPendingMutation(pendingThreadInteractionModes, threadId, mutation)",
    );
    expect(clientSource).toContain("enqueueSerialMutation(pendingThreadModeCommands, threadId");
    expect(connectorSource).toContain("private pendingThreadRuntimeModes");
    expect(connectorSource).toContain("private pendingThreadInteractionModes");
    expect(connectorSource).toContain("private pendingThreadModeCommands");
    expect(connectorSource).toContain("private queueThreadModeCommand");
    expect(connectorSource).not.toContain("private projectShellThreadMode");
    expect(connectorSource).toContain(
      "reconcilePendingMutation(this.pendingThreadRuntimeModes, threadId, thread.runtimeMode)",
    );
    expect(connectorSource).toContain(
      "reconcilePendingMutation(\n          this.pendingThreadInteractionModes,",
    );
    expect(connectorSource).toContain(
      "const mutation = setLatestPendingMutation(\n      this.pendingThreadRuntimeModes,",
    );
    expect(connectorSource).toContain(
      "const mutation = setLatestPendingMutation(\n      this.pendingThreadInteractionModes,",
    );
    expect(connectorSource).toContain(
      "rejectPendingMutation(this.pendingThreadRuntimeModes, input.threadId, mutation)",
    );
    expect(connectorSource).toContain(
      "rejectPendingMutation(this.pendingThreadInteractionModes, input.threadId, mutation)",
    );
    expect(connectorSource).toContain("acknowledgePendingMutationAtSequence({");
    expect(connectorSource).toContain("mutationSequence: result.sequence");
    expect(connectorSource).not.toContain("this.projectShellThreadMode(");
  });

  it("settles prompt dispatch failures without leaking an unhandled rejection", () => {
    expect(clientSource).toContain("presentThreadCommandErrorMessage");
    expect(clientSource).toContain(".sendPrompt({");
    expect(clientSource).toContain(".then(() => true)");
    expect(clientSource).toContain(".catch((error: unknown) => {");
    expect(clientSource).toContain("sessionError: presentThreadCommandErrorMessage(");
    const composerSource = componentSource("Composer.tsx");
    expect(composerSource).toContain("if (await current.onSend(text))");
    expect(composerSource).toContain('setValue("");');
  });

  it("keeps new threads local until the first prompt atomically creates them", () => {
    const quickSwitch = componentSource("QuickSwitch.tsx");
    const chatView = componentSource("ChatView.tsx");

    expect(clientSource).toContain("const draftThread = createLocalDraftThread");
    expect(clientSource).toContain("draftThread,");
    expect(clientSource).toContain("buildDraftThreadTurnBootstrap(draftThread");
    expect(clientSource).not.toContain("const result = await bridge.createThread");
    expect(clientSource).toContain("projectDraftThreadModelSelection");
    expect(clientSource).toContain("projectDraftThreadRuntimeMode");
    expect(clientSource).toContain("projectDraftThreadInteractionMode");
    expect(clientSource).toContain("draftThreadsByProjectId: LocalDraftThreadsByProjectId");
    expect(clientSource).toContain("readLocalDraftThreadForProject(");
    expect(clientSource).toContain("rememberLocalDraftThread(");
    expect(clientSource).toContain("forgetLocalDraftThread(");
    expect(newThreadHookSource).toContain(
      "await t3ClientActions.createThread(projectRef.projectId, options)",
    );
    expect(sidebarSource).toContain("t3ClientActions.createThread(newThreadProject.id)");
    expect(sidebarSource).toContain(
      "const newThreadProject = scopedProject ?? projects[0] ?? null;",
    );
    expect(quickSwitch).toContain("t3ClientActions.createThread(projectId)");
    expect(quickSwitch).toContain(
      "orderedProjects.find((project) => project.id === projectScopeKey) ??",
    );
    expect(quickSwitch).toContain("projects[0] ??");
    expect(keyboardCommandsSource).toContain("void t3ClientActions.createThread()");
    expect(connectorSource).toContain("buildThreadTurnStartCommand({");
    expect(connectorSource).toContain("bootstrap,");
    expect(connectorSource).toContain("if (!thread && bootstrap?.createThread)");
    expect(connectorSource).toContain("this.selectThread(input.threadId)");
    expect(connectorSource).toContain("selectRecoverableDisposableThreadIds(");
    expect(connectorSource).toContain('if (item.kind === "snapshot") {');
    expect(connectorSource).toContain("this.scheduleDisposableThreadCleanup()");
    expect(connectorSource).toContain("this.pendingDisposableThreadDeletes.has(thread.id)");
    expect(clientSource).toContain(
      "if (stateBeforeShell.activeThreadId && !activePresentationThread)",
    );
    expect(clientSource).toContain("resetActiveThreadState()");
    expect(clientSource).toContain("state.settings?.defaultThreadEnvMode");
    expect(clientSource).toContain("state.settings?.newWorktreesStartFromOrigin");
    expect(sidebarRowSource).toContain("<HostView\n                    stopTapPropagation");
    expect(sidebarRowSource).not.toContain(
      '<HostText\n                    className={cn(\n                      "sidebar-v2-row-actions',
    );
    expect(hostElementsSource).toContain(
      "stopTapPropagation ? { catchtap: onClick ?? ignoreTap } : { bindtap: onClick }",
    );
    const deleteThreadBlock = clientSource.slice(
      clientSource.indexOf("async function deleteThread("),
      clientSource.indexOf("async function archiveThread("),
    );
    expect(deleteThreadBlock).toContain('throw new Error("Thread deletion is unavailable.")');
    expect(deleteThreadBlock.indexOf("await bridge.deleteThread({ threadId })")).toBeLessThan(
      deleteThreadBlock.indexOf("resetActiveThreadState()"),
    );
    expect(deleteThreadBlock).toContain("sessionError: presentThreadCommandErrorMessage(");
    expect(deleteThreadBlock).toContain("throw error;");
    expect(chatView).toContain('activeThreadKind={activeDraftThread ? "draft" :');
    expect(chatView).toContain("updateDraftWorkspaceMode(mode)");
    expect(chatView).toContain("setDraftStartFromOrigin(enabled)");
  });

  it("keeps the Lynx Hero headline inline and the context controls evenly allocated", () => {
    const composerSource = componentSource("Composer.tsx");

    expect(hostElementsSource).toContain("<inline-text");
    expect(composerSource).toContain('<HostInlineText className="hero__project-name">');
    expect(overrides).toContain(".hero__headline {");
    expect(overrides).toContain("font-size: 30px;");
    expect(overrides).toContain("line-height: 36px;");
    expect(overrides).toContain("text-align: center;");
    expect(overrides).toMatch(
      /\.composer-context-item--checkout,[\s\S]*?\.composer-context-item--branch \{[\s\S]*?flex-grow: 0;[\s\S]*?flex-shrink: 0;[\s\S]*?width: calc\(50% - 4px\);/,
    );
    expect(overrides).toMatch(/\.composer-context-control--branch \{[\s\S]*?width: 100%;/);
    expect(composerSource).toContain("showNativeContextMenu([");
    expect(composerSource).toContain('{ id: "copy-branch-name", label: "Copy branch name" }');
    expect(composerSource).toContain("clientCapabilities.clipboard.writeText(activeBranch)");
    expect(composerSource).toContain(
      "onContextMenu={activeBranch ? showBranchContextMenu : undefined}",
    );
  });

  it("uses shared pending-input progress for Native multi-question requests", () => {
    const chatViewSource = componentSource("ChatView.tsx");
    const composerSource = componentSource("Composer.tsx");
    expect(chatViewSource).toContain("derivePendingUserInputProgress");
    expect(chatViewSource).toContain("pendingUserInputDraftsByRequestId");
    expect(chatViewSource).toContain("pendingUserInputQuestionIndexByRequestId");
    expect(chatViewSource).toContain("activePendingProgress.isLastQuestion");
    expect(chatViewSource).toContain("activePendingProgress.canAdvance");
    expect(chatViewSource).toContain('aria-label="Previous question"');
    expect(chatViewSource).toContain("handleQuestionAdvance");
    const pendingSurfaceSource = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../web/src/components/chat/ComposerPendingSurface.tsx",
      ),
      "utf8",
    );
    expect(pendingSurfaceSource).toContain(
      'className="composer-pending-question flex w-full flex-col px-4 py-3 sm:px-5"',
    );
    expect(pendingSurfaceSource).toContain('className="composer-pending-question__hint');
    expect(overrides).toContain(".composer-pending-wrapper--question-multi-select");
    expect(overrides).toContain("height: 223px;");
    expect(overrides).toContain("height: 222px;");
    expect(overrides).toContain("height: 363px;");
    expect(overrides).toContain("height: 361px;");
    expect(chatViewSource).toContain(
      "questionMultiSelect={activePendingQuestion?.multiSelect === true}",
    );
    expect(composerSource).toContain(
      'questionMultiSelect ? "composer-shell--question-multi-select"',
    );
    expect(composerSource).toContain(
      'questionMultiSelect ? "composer-surface--question-multi-select"',
    );
    expect(overrides).toContain(".composer-shell--question-multi-select");
    expect(overrides).toContain(".composer-surface--question-multi-select");
    expect(composerSource).toContain(
      "if (questionMode) onQuestionCustomAnswerChange?.(nextValue);",
    );
    expect(clientSource).toContain("lastUserInputResponse = { threadId, requestId, answers };");
    expect(clientSource).toContain('activity.kind === "user-input.resolved"');
    expect(clientSource).toContain('activity.kind === "provider.user-input.respond.failed"');
  });

  it("shows the transcript jump affordance only after follow mode detaches", () => {
    const timelineSource = componentSource("MessagesTimeline.tsx");
    expect(timelineSource).toContain(
      'followState.following ? "timeline-jump--hidden" : "timeline-jump--visible"',
    );
    expect(timelineSource).toContain(
      'data-transcript-jump-visible={followState.following ? "false" : "true"}',
    );
    expect(timelineSource).toContain(
      "contentLength: scrollHeight,\n          viewportLength: listHeight,",
    );
    expect(overrides).toContain(".timeline-jump--hidden");
    expect(overrides).toContain("pointer-events: none;");
  });

  it("seeds and synchronizes the saved model selection before creating new chats", () => {
    expect(clientSource).toContain("patchState({ modelSelection: saved })");
    expect(clientSource).toContain(
      'transport.invokeSettled("setModelSelection", { selection: saved })',
    );
    expect(modelSelectionLogicSource).toContain(
      "return [currentSelection, projects[0]?.defaultModelSelection]",
    );
  });

  it("limits Workspace menu harness control to viewport-test runs", () => {
    const composer = componentSource("Composer.tsx");
    const preview = readFileSync(
      path.resolve(import.meta.dirname, "../../browser-preview/index.ts"),
      "utf8",
    );

    expect(composer).toContain("if (!viewport.testResize) return;");
    expect(composer).toContain('"t3:workspace-menu-test"');
    expect(preview).toContain("openWorkspaceMenuForHarness");
    expect(preview).toContain('emitGlobalEvent("t3:workspace-menu-test", [{ open }])');
  });

  it("keeps the Workspace menu source-aligned and trigger-relative", () => {
    const composer = componentSource("Composer.tsx");
    const workspaceBlock = overrides.match(/\.composer-workspace-menu \{[^}]+\}/)?.[0] ?? "";
    const emptyTimelineBlock =
      overrides.match(/\.chat-body-reference > \.timeline-empty-overlay \{[^}]+\}/)?.[0] ?? "";
    const composerOverlayBlock = overrides.match(/\.composer-overlay \{[^}]+\}/)?.[0] ?? "";

    expect(composer).toContain('data-floating-side="top"');
    expect(composer).toContain('data-floating-align="start"');
    expect(composer).toContain('data-floating-side-offset="4"');
    expect(composer).toContain('workspaceMenuOpen ? " composer-workspace-control-wrap--open" : ""');
    expect(composer).toContain("resolveCurrentWorkspaceLabel(worktreePath ?? null)");
    expect(composer).toContain('resolveEnvModeLabel("worktree")');
    expect(composer).toContain("worktreePath: worktreePath ?? null");
    expect(composer).not.toContain('worktreePath ?? "pending"');
    expect(composer).toContain("{checkoutLabel}");
    expect(composer).toContain('className="composer-workspace-menu__list"');
    expect(composer).toContain("catchtap={() => undefined}");
    expect(composer.indexOf("className={`composer-workspace-menu${")).toBeLessThan(
      composer.indexOf('className="composer-workspace-menu-dismiss"'),
    );
    expect(composer).toMatch(
      /composer-workspace-menu__item--worktree[^]*onWorkspaceModeChange\("worktree"\);[^]*setOpenComposerMenu\(null\);/,
    );
    expect(workspaceBlock).toContain("position: absolute;");
    expect(workspaceBlock).toContain("left: 0;");
    expect(workspaceBlock).toContain("bottom: 28px;");
    expect(workspaceBlock).toContain("width: 100%;");
    expect(workspaceBlock).not.toContain("top: -178px;");
    expect(workspaceBlock).not.toContain("width: 310px;");
    expect(composer).not.toContain('width: "158px"');
    expect(overrides).not.toContain(".composer-workspace-menu--worktree {\n  top: -236px;");
    expect(overrides).toContain("min-height: 29px;");
    expect(emptyTimelineBlock).toContain("pointer-events: none;");
    expect(composerOverlayBlock).toContain("position: relative;");
    expect(composerOverlayBlock).toContain("z-index: 20;");
    const workspaceControlBlock =
      overrides.match(/\.composer-workspace-control-wrap \{[^}]+\}/)?.[0] ?? "";
    expect(workspaceControlBlock).toContain("position: relative;");
    expect(workspaceControlBlock).toContain("display: flex;");
    expect(workspaceControlBlock).toContain("flex-grow: 1;");
    expect(workspaceControlBlock).toContain("width: 0;");
    expect(workspaceControlBlock).toContain("min-width: 0;");
    expect(workspaceControlBlock).toContain("z-index: 52;");
    const workspaceControlOpenBlock =
      overrides.match(/\.composer-workspace-control-wrap--open \{[^}]+\}/)?.[0] ?? "";
    expect(workspaceControlOpenBlock).toContain("z-index: 60;");
    const modelOptionControlBlock =
      overrides.match(/\.composer-model-option-control-wrap \{[^}]+\}/)?.[0] ?? "";
    expect(modelOptionControlBlock).toContain("z-index: 52;");
    expect(overrides).toContain("composer-workspace-menu-dismiss {\n  position: fixed;");
    expect(workspaceBlock).toContain("z-index: 3;");
    expect(overrides).toContain("composer-workspace-menu-dismiss {\n  position: fixed;");
    expect(overrides).toContain("z-index: 2;");
  });

  it("uses the shared Sidebar inset without shrinking the thread list twice", () => {
    const listBlocks = overrides.match(/\.sidebar-v2-thread-list \{[^}]+\}/g);
    const groupBlock = overrides.match(/\.sidebar-v2-thread-group \{[^}]+\}/)?.[0] ?? "";

    expect(listBlocks).not.toBeNull();
    for (const block of listBlocks ?? []) {
      expect(block).toContain("width: 100%;");
      expect(block).not.toContain("calc(100% - 16px)");
    }
    expect(sidebarCompositionSource).toContain(
      'SidebarGroup className="sidebar-v2-thread-group px-2 pb-1 pt-0"',
    );
    expect(groupBlock).toContain("width: 100%;");
    expect(groupBlock).toContain("padding-right: 8px;");
    expect(groupBlock).toContain("padding-left: 8px;");
    expect(groupBlock).toContain("box-sizing: border-box;");
    expect(sidebarRowSource).toContain(
      'className="sidebar-v2-row-card__content relative z-10 h-[4.875rem] px-2.5 py-2"',
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-card__content {\n  display: flex;\n  flex-direction: column;",
    );
    expect(browserPreviewSource).toContain(
      '".sidebar-v2-row-card__content{display:flex;flex-direction:column;}"',
    );
    const titleBlock = overrides.match(/\.sidebar-v2-row-title \{[^}]+\}/)?.[0] ?? "";
    expect(titleBlock).toContain("width: 100%;");
    expect(titleBlock).toContain("height: 20px;");
    expect(titleBlock).toContain("line-height: 20px;");
    expect(titleBlock).toContain("overflow: hidden;");
    const settledShelfBlock =
      overrides.match(/\.sidebar-v2-settled-shelf-toggle \{[^}]+\}/)?.[0] ?? "";
    expect(settledShelfBlock).toContain("margin-top: 0;");
  });

  it("keeps the project scope popup related to its measured Sidebar trigger", () => {
    const menuSource = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ui/menu.lynx.tsx"),
      "utf8",
    );
    const scopePopupBlock = overrides.match(/\.sidebar-v2-scope-popup \{[^}]+\}/)?.[0] ?? "";

    expect(scopePopupBlock).not.toContain("top:");
    expect(scopePopupBlock).not.toContain("left:");
    expect(overrides).toContain("width: 100%;");
    expect(overrides).not.toContain("width: 250px;");
    expect(overrides).toContain(".sidebar-v2-project-scope-host--open {");
    expect(overrides).toContain(".sidebar-v2-scope-popup .lynx-menu-radio-item {");
    expect(overrides).toContain("height: 32px;");
    expect(sidebarSource).toContain("projectScopePopupWidth: sidebarWidth - 53");
    expect(menuSource).toContain('trigger.invoke("boundingClientRect"');
    expect(menuSource).toContain("resolveFloatingAnchorPoint(context.anchorRect");
    expect(menuSource).toContain('position: "fixed"');
    expect(menuSource).not.toContain('top: "140px"');
    expect(menuSource).not.toContain('left: "8px"');
    expect(sidebarControlsSource).not.toContain('top: "140px"');
    expect(sidebarControlsSource).not.toContain('left: "8px"');
    expect(sidebarControlsSource).toContain('relationId="sidebar-project-scope"');
  });

  it("uses compact dedicated rows for Lynx Sidebar search results", () => {
    expect(sidebarSource).toContain("searchSidebarThreadsByTitle");
    expect(sidebarSource).toContain('className="sidebar-v2-search-result');
    expect(sidebarSource).toContain("data-sidebar-search-result={thread.id}");
    expect(sidebarSource).toContain('listId={threadSearchQuery ? "sidebar-thread-search-results"');
    expect(overrides).toContain(
      ".sidebar-v2-search-result {\n  display: flex;\n  flex-direction: row;\n  align-items: center;\n  width: 100%;\n  height: 36px;",
    );
  });
});
