import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const componentSource = (name: string) =>
  readFileSync(path.resolve(import.meta.dirname, name), "utf8");
const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");
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
const sidebarControlsSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/sidebar/SidebarV2ControlsSurface.tsx",
  ),
  "utf8",
);
const clientSource = readFileSync(
  path.resolve(import.meta.dirname, "../state/t3Client.ts"),
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
const browserPreviewSource = readFileSync(
  path.resolve(import.meta.dirname, "../../browser-preview/index.ts"),
  "utf8",
);
const settingsNavigationSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/settings/settingsNavigationHost.lynx.tsx",
  ),
  "utf8",
);
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
  it("keeps the anchored model picker dismissible without modal dimming", () => {
    const source = componentSource("ModelPicker.tsx");

    expect(source).toContain('className="model-picker-dismiss-layer"');
    expect(source).toContain('aria-label="Dismiss model picker"');
    expect(source).toContain("event-through");
    expect(source).toContain("catchtap={handlePanelTap}");
    expect(source).toContain('className="model-picker-close"');
    expect(source).toContain("bindtap={onClose}");
    expect(source.indexOf('className="model-picker-panel"')).toBeLessThan(
      source.indexOf('className="model-picker-dismiss-layer"'),
    );
    expect(componentSource("ChatView.tsx")).toContain(
      "onClick={modelPickerOpen ? uiActions.closeModelPicker : undefined}",
    );
    expect(overrides).toContain(".model-picker-dismiss-layer {");
    expect(overrides).toContain("background-color: transparent;");
    expect(overrides).toContain("background-color: var(--popover);");
    const dismissStart = overrides.indexOf(".model-picker-dismiss-layer {");
    const dismissBlock = overrides.slice(dismissStart, overrides.indexOf("}", dismissStart));
    expect(dismissBlock).toContain("z-index: 0;");
    expect(dismissBlock).not.toContain("var(--overlay-backdrop)");
    const panelStart = overrides.indexOf(".model-picker-panel {");
    const panelBlock = overrides.slice(panelStart, overrides.indexOf("}", panelStart));
    expect(panelBlock).toContain("z-index: 1;");
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
    expect(source).toContain("bindtap={() => setRuntimeModeMenuOpen(false)}");
    expect(source).toContain("modelOptionMenuOpen ||");
    expect(source).toContain("runtimeModeMenuOpen ||");
    expect(source).toContain("compactControlsMenuOpen");
    expect(source).toContain("modelPicker !== undefined");
    expect(overrides).toContain(".composer-runtime-menu-dismiss-layer {");
    expect(overrides).toContain(".composer-runtime-control-wrap {");
  });

  it("shows provider recovery guidance in hero and thread layouts", () => {
    const chatView = componentSource("ChatView.tsx");

    expect(chatView).toContain("projectProviderStatusNotice(activeProviderStatus)");
    expect(chatView).toContain(": visibleProviderStatusNotice ? (");
    expect(chatView).not.toContain("visibleProviderStatusNotice && !hero");
    expect(chatView).toContain(".refreshProviders(activeProviderStatus?.instanceId)");
    expect(chatView).toContain('label={providersRefreshPending ? "Refreshing…" : "Refresh"}');
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
    expect(button).toContain('aria-disabled={disabled ? "true" : undefined}');
    expect(input).toContain("aria-label={ariaLabel}");
    expect(input).toContain('aria-disabled={disabled ? "true" : undefined}');
    expect(textarea).toContain("aria-label={ariaLabel}");
    expect(textarea).toContain('aria-disabled={disabled ? "true" : undefined}');
  });

  it("renders shared provider connection fields, environment, refresh, and update actions", () => {
    const providers = componentSource("ProviderSettings.tsx");

    expect(providers).toContain("deriveProviderSettingsFields(schema)");
    expect(providers).toContain("CodexSettings");
    expect(providers).toContain("ClaudeSettings");
    expect(providers).toContain("ProviderEnvironmentFields");
    expect(providers).toContain("updateProviderInstance(instanceId, instance)");
    expect(providers).toContain("updateProvider(instanceId)");
    expect(providers).toContain('label="Refresh provider status"');
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
    expect(overrides).toContain("height: 280px;");
    expect(composer).toContain('className="composer-model-option-menu__content"');
    expect(overrides).toContain(".composer-model-option-menu__content {");
    expect(overrides).toContain("flex-shrink: 0;");
    expect(overrides).toContain(".composer-model-option-menu__item--selected {");
    expect(composer).toContain("getComposerModelOptionLetterSpacing(modelOptionLabel)");
    expect(overrides).toContain(".composer-primary-action--send {");
    expect(overrides).toContain("background-color: rgba(var(--primary-rgb), 0.9);");
    expect(composer).toContain('name={busy ? "square" : "send-arrow"}');
    expect(composer).toContain("__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__");
    expect(composer).toContain("eventWithDetail.deltaY ?? eventWithDetail.detail?.deltaY ?? 0");
    expect(modelPicker).toContain("eventWithDetail.deltaY ?? eventWithDetail.detail?.deltaY ?? 0");
    expect(modelPicker).toContain("if (!Number.isFinite(deltaY) || deltaY === 0) return;");
    expect(browserPreviewSource).toContain(
      '".composer-compact-controls-menu__scroll{overflow-y:auto;}" +',
    );
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

  it("opens a truthful Terminal placeholder from the titlebar control", () => {
    const header = componentSource("ChatHeader.tsx");
    const chatView = componentSource("ChatView.tsx");
    const panel = componentSource("RightPanel.tsx");

    expect(header).toContain("export function ChatLayoutControls");
    expect(header).toContain('aria-label="Open terminal panel"');
    expect(header).toContain('bindtap={() => uiActions.openRightPanelSurface("terminal")}');
    expect(header).toContain("bindtap={uiActions.toggleRightPanel}");
    expect(header).toContain(
      'className="workspace-titlebar-controls topbar__layout-controls lynx-titlebar-no-drag"',
    );
    expect(header).not.toContain("{!rightPanelOpen ? (");
    expect(chatView).toContain(
      "layoutControls={<ChatLayoutControls rightPanelOpen={rightPanel.isOpen} />}",
    );
    expect(panel).toContain('case "terminal":');
    expect(panel).toContain('data-terminal-placeholder="true"');
    expect(panel).toContain('bindtap={() => handleAddSurface("terminal")}');
    expect(overrides).toContain(".topbar__toggle:hover {");
    expect(overrides).toContain(".topbar__toggle:active {");
  });

  it("matches the compact Files browser anatomy and keeps search functional", () => {
    const files = componentSource("FilesPanel.tsx");
    const panel = componentSource("RightPanel.tsx");

    expect(files).toContain('className="files-panel__toolbar" data-surface-subheader');
    expect(files).toContain('aria-label="Refresh workspace files"');
    expect(files).toContain('placeholder="Search files"');
    expect(files).toContain("files-panel__search--focused");
    expect(files).toContain("bindfocus={() => setSearchFocused(true)}");
    expect(files).toContain("bindblur={() => setSearchFocused(false)}");
    expect(files).toContain("getProjectFilePickerMatches");
    expect(files).toContain('className="files-panel__browser"');
    expect(files).toContain('folderIcon={<Icon name="folder" size={14}');
    expect(files).toContain('fileIcon={<Icon name="file-json" size={14}');
    expect(files).toContain("uiActions.openFileSurface(path)");
    expect(files).toContain("export function FilePanel");
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
    expect(overrides).toContain(".file-panel__explorer {");
    expect(overrides).toContain("width: 256px;");
    expect(overrides).toContain(".right-panel--sheet .file-panel__explorer {");
    expect(overrides).toContain(".file-panel__back {");
    const fileBackStart = overrides.indexOf(".file-panel__back {");
    const fileBackBlock = overrides.slice(fileBackStart, overrides.indexOf("}", fileBackStart));
    expect(fileBackBlock).toContain("display: flex;");
    expect(overrides).not.toContain(".right-panel--sheet .file-panel__back {");
    expect(overrides).toContain(".file-editor-line__number {");
    expect(files).toContain("projectFileLineTokens(path, line)");
    expect(files).toContain("file-editor-token file-editor-token--${token.tone}");
    expect(overrides).toContain(".file-editor-token--heading,");
    expect(overrides).toContain(".file-editor-token--string,");
    expect(overrides).toContain(".file-editor-token--property {");
    expect(overrides).toContain(".theme-light .file-editor-token--heading,");
    expect(overrides).toContain(".theme-light .file-editor-token--string,");
    expect(overrides).toContain(".theme-light .file-editor-token--property {");
    expect(overrides).toContain(".t3-jetbrains-mono-ready .files-panel__preview-content,");
    expect(overrides).toContain(".file-panel__statusbar {");
    expect(overrides).toContain("border-radius: 0;");
    expect(panel).toContain("data-right-panel-add-kind={item.kind}");
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
  });

  it("persists Project Action keybindings after the script update", () => {
    const dialog = componentSource("ProjectActionDialog.tsx");

    expect(dialog).toContain("decodeProjectScriptKeybindingRule");
    expect(dialog).toContain("commandForProjectScript(id)");
    expect(dialog).toContain("keybindingRule ? t3ClientActions.upsertKeybinding");
    expect(dialog).toContain('data-keybinding-input-mode="canonical-text"');
    expect(dialog).toContain("Enter a shortcut such as mod+shift+y.");
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
    expect(sidebarSource).toContain("settlementSupported={false}");
    expect(sidebarSource).not.toContain("cardActionsPersistent");
    expect(overrides).toContain(".sidebar-v2-row-card .sidebar-v2-row-status {");
    expect(overrides).toContain(".sidebar-v2-working-duration {");
    expect(overrides).toContain(".sidebar-v2-row-item--active {");
    expect(overrides).toContain("background-color: rgba(241, 243, 247, 0.11);");
    expect(overrides).toContain(".theme-light .sidebar-v2-row-item--active {");
    expect(overrides).toContain(
      ".sidebar-v2-row-card {\n  display: flex;\n  flex-direction: column;",
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-card__content {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  height: 78px;",
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-project-line,\n.sidebar-v2-row-title-line,\n.sidebar-v2-row-metadata-line {\n  width: 100%;\n  box-sizing: border-box;\n}",
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-project-line {\n  padding-right: 132px;\n  box-sizing: border-box;\n}",
    );
    expect(overrides).not.toContain(".sidebar-v2-row-card:hover .sidebar-v2-row-actions,");
    expect(overrides).toContain(
      ".sidebar-v2-row-project-title {\n  flex-grow: 1;\n  flex-shrink: 1;\n  width: 0;\n  min-width: 0;\n}",
    );
    expect(overrides).toContain(
      ".sidebar-v2-row-card .sidebar-v2-row-status-slot {\n  position: absolute;\n  top: 8px;\n  right: 0;\n  width: 128px;\n  flex-shrink: 0;\n}",
    );
    expect(overrides).toContain(
      ".lynx-web-preview .sidebar-v2-row-card .sidebar-v2-row-status-slot {\n  right: 10px;\n}",
    );
    expect(faviconSource).toContain('name="folder"');
    expect(faviconSource).not.toContain("background-color");
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
    expect(overrides).not.toContain("top: 132px;");
    expect(overrides).not.toContain("left: 244px;");
    expect(overrides).not.toContain(".sidebar-v2-details-dismiss {");
    expect(tooltipSource).toContain('"main-thread:bindmousemove": handleMouseMove');
    expect(tooltipSource).toContain("main-thread:global-bindmousemove={handleGlobalMouseMove}");
    expect(tooltipSource).not.toContain(
      '"main-thread:global-bindmousemove": handleGlobalMouseMove',
    );
    expect(tooltipSource).toContain("runOnMainThread(handleMouseMove)");
    expect(tooltipSource).toContain("__T3_LYNXTRON_TOOLTIP_PROBE__");
    expect(tooltipSource).toContain('trigger.invoke("boundingClientRect"');
    expect(tooltipSource).toContain("resolveFloatingAnchorPoint(context.anchorRect");
    expect(tooltipSource).toContain("data-floating-side={side}");
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
    expect(clientSource).toContain("rollbackThreadModeMutation(");
    expect(clientSource).toContain("const pendingThreadRuntimeModes = new Map");
    expect(clientSource).toContain("const pendingThreadInteractionModes = new Map");
    expect(clientSource).toContain("let threads = canonicalThreads;");
    expect(clientSource).toContain(
      "threads = projectThreadInteractionMode(threads, threadId, interactionMode);",
    );
    expect(clientSource).toContain(".setThreadRuntimeMode({ threadId, runtimeMode }).catch");
    expect(clientSource).toContain(
      ".setThreadInteractionMode({ threadId, interactionMode }).catch",
    );
    expect(connectorSource).toContain("private pendingThreadRuntimeModes");
    expect(connectorSource).toContain("private pendingThreadInteractionModes");
    expect(connectorSource).toContain(
      "if (thread?.runtimeMode === runtimeMode) this.pendingThreadRuntimeModes.delete(threadId);",
    );
    expect(connectorSource).toContain("if (thread?.interactionMode === interactionMode) {");
    expect(connectorSource).toContain(
      "this.pendingThreadRuntimeModes.set(input.threadId, input.runtimeMode);",
    );
    expect(connectorSource).toContain(
      "this.pendingThreadInteractionModes.set(input.threadId, input.interactionMode);",
    );
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
      /composer-workspace-menu__item--worktree[^]*onWorkspaceModeChange\("worktree"\);[^]*setWorkspaceMenuOpen\(false\);/,
    );
    expect(workspaceBlock).toContain("position: absolute;");
    expect(workspaceBlock).toContain("left: 0;");
    expect(workspaceBlock).toContain("bottom: 28px;");
    expect(workspaceBlock).not.toContain("top: -178px;");
    expect(workspaceBlock).not.toContain("width: 310px;");
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
