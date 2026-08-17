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
const connectorSource = readFileSync(
  path.resolve(import.meta.dirname, "../../main/desktop/connector.ts"),
  "utf8",
);

describe("desktop shell interaction contract", () => {
  it("keeps the anchored model picker dismissible without modal dimming", () => {
    const source = componentSource("ModelPicker.tsx");

    expect(source).toContain('className="model-picker-dismiss-layer"');
    expect(source).toContain('aria-label="Dismiss model picker"');
    expect(source).toContain("bindtap={onClose}");
    expect(source).toContain("catchtap={handlePanelTap}");
    expect(source).toContain('className="model-picker-close"');
    expect(source).toContain("bindtap={onClose}");
    expect(source.indexOf('className="model-picker-panel"')).toBeLessThan(
      source.indexOf('className="model-picker-dismiss-layer"'),
    );
    expect(overrides).toContain(".model-picker-dismiss-layer {");
    expect(overrides).toContain("background-color: transparent;");
    expect(overrides).toContain("background-color: var(--popover);");
    const dismissStart = overrides.indexOf(".model-picker-dismiss-layer {");
    const dismissBlock = overrides.slice(dismissStart, overrides.indexOf("}", dismissStart));
    expect(dismissBlock).not.toContain("var(--overlay-backdrop)");
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
    expect(source).toContain("modelOptionMenuOpen || runtimeModeMenuOpen");
    expect(source).toContain("modelPicker !== undefined");
    expect(overrides).toContain(".composer-runtime-menu-dismiss-layer {");
    expect(overrides).toContain(".composer-runtime-control-wrap {");
  });

  it("renders server-declared model options in a dismissible menu", () => {
    const composer = componentSource("Composer.tsx");
    const chatView = componentSource("ChatView.tsx");

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
  });

  it("consumes model-selection bridge failures with a terminal rejection handler", () => {
    const mutationStart = clientSource.indexOf("function persistModelSelectionMutation");
    const mutationEnd = clientSource.indexOf("\nfunction setModelSelection", mutationStart);
    const mutation = clientSource.slice(mutationStart, mutationEnd);

    expect(mutation).toContain("void mutation");
    expect(mutation).toContain(".then(() => {");
    expect(mutation).toContain(".catch((error: unknown) => {");
    expect(mutation).not.toContain("void mutation.then(");
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
    expect(files).not.toContain('className="files-panel__preview"');
    expect(files).not.toContain('className="files-panel__info"');
    expect(overrides).toContain(".files-panel__toolbar {");
    expect(overrides).toContain("height: 40px;");
    expect(overrides).toContain(".files-panel__search--focused {");
    expect(overrides).not.toContain(".files-panel__search:focus-within {");
    expect(overrides).toContain(".files-panel .file-tree-row {");
    expect(overrides).toContain("min-height: 24px;");
    expect(overrides).toContain("border-radius: 5px;");
    expect(overrides).toContain("font-family: var(--font-sans);");
    expect(overrides).toContain("font-size: 12px;");
    expect(panel).toContain("data-right-panel-add-kind={item.kind}");
    expect(panel).toContain('case "file":');
    expect(panel).toContain("<FilePanel path={surface.path} />");
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
    expect(publish).toContain("const providerRows = useMemo");
    expect(publish).toContain('className="git-publish-provider-row flex flex-row"');
    expect(publish).toContain('className="git-publish-label git-publish-label--first">Provider');
    expect(publish).not.toContain(
      '<text className="git-publish-provider-card__host">{item.host}</text>',
    );
    expect(overrides).not.toContain("flex-flow: row wrap;");
    expect(overrides).not.toContain(".git-publish-label:first-child");
    expect(overrides).toContain(".git-publish-label--first {");
    expect(overrides).toContain(".git-publish-provider-row {");
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
    expect(overrides).toContain(".sidebar-v2-row-card__content {\n  width: 100%;\n  height: 78px;");
    expect(overrides).not.toContain(".sidebar-v2-row-card:hover .sidebar-v2-row-actions,");
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
    expect(clientSource).toContain("modelSelectionError: modelSelectionMutationError(error)");
    expect(clientSource).toContain("shouldRollbackModelSelectionMutation");
    expect(clientSource).toContain("projectThreadModelSelection(");
    expect(clientSource).not.toContain("[t3-client] failed to set model selection");
    expect(connectorSource).toContain(
      "const pendingSelection = this.pendingThreadModelSelections.get(thread.id);",
    );
    expect(connectorSource).toContain(
      "return pendingSelection ? { ...thread, modelSelection: pendingSelection } : thread;",
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
    expect(overrides).toContain(
      ".composer-workspace-control-wrap {\n  position: relative;\n  display: flex;\n  z-index: 52;",
    );
    expect(overrides).toContain("composer-workspace-menu-dismiss {\n  position: fixed;");
    expect(workspaceBlock).toContain("z-index: 3;");
    expect(overrides).toContain("composer-workspace-menu-dismiss {\n  position: fixed;");
    expect(overrides).toContain("z-index: 2;");
  });

  it("uses the shared Sidebar inset without shrinking the thread list twice", () => {
    const listBlocks = overrides.match(/\.sidebar-v2-thread-list \{[^}]+\}/g);

    expect(listBlocks).not.toBeNull();
    for (const block of listBlocks ?? []) {
      expect(block).toContain("width: 100%;");
      expect(block).not.toContain("calc(100% - 16px)");
    }
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
    expect(sidebarSource).toContain("projectScopeControlWidth: sidebarWidth - 53");
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
