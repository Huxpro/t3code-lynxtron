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

describe("desktop shell interaction contract", () => {
  it("keeps the anchored model picker dismissible without modal dimming", () => {
    const source = componentSource("ModelPicker.tsx");

    expect(source).toContain('className="model-picker-dismiss-layer"');
    expect(source).toContain('aria-label="Dismiss model picker"');
    expect(source).toContain("bindtap={onClose}");
    expect(source).toContain("catchtap={handlePanelTap}");
    expect(source).toContain('className="model-picker-close"');
    expect(source).toContain("bindtap={onClose}");
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
    expect(composer).toContain("modelOptionSections.map");
    expect(composer).toContain("onSelectModelOption?.(section.id, item.value)");
    expect(chatView).toContain("projectComposerTraitsMenu");
    expect(chatView).toContain("selectComposerTraitOption");
    expect(chatView).not.toContain("handleModelOptionTap");
    expect(overrides).toContain(".composer-model-option-menu {");
    expect(overrides).toContain(".composer-model-option-menu__item--selected {");
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
    expect(publish).toContain('className="git-publish-dialog" catchtap');
    expect(app).toContain("<GitPublishDialog");
    expect(app).toContain("onClose={uiActions.closeGitPublishDialog}");
    expect(uiState).toContain('Atom.withLabel("lynx-git-publish-dialog-open")');
    expect(bridge).toContain("publishRepository(");
    expect(client).toContain("function publishRepository(");
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
    expect(overrides).toContain(".sidebar-brand-host {\n  position: absolute;\n  left: 60px;");
    expect(overrides).toContain(".viewport-responsive .sidebar-brand-host {\n  left: 60px;\n}");
  });

  it("keeps Sidebar thread state truthful and actions progressively disclosed", () => {
    const faviconSource = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ProjectFavicon.lynx.tsx"),
      "utf8",
    );

    expect(sidebarSource).toContain("const status = resolveSidebarV2Status(thread);");
    expect(sidebarSource).toContain("topStatus={statusPresentation(status)}");
    expect(sidebarSource).toContain("settlementSupported={false}");
    expect(sidebarSource).not.toContain("cardActionsPersistent");
    expect(overrides).toContain(".sidebar-v2-row-card .sidebar-v2-row-status {");
    expect(overrides).toContain(".sidebar-v2-row-item--active {");
    expect(overrides).toContain("background-color: rgba(241, 243, 247, 0.11);");
    expect(overrides).toContain(".theme-light .sidebar-v2-row-item--active {");
    expect(overrides).toContain(".sidebar-v2-row-card__content {\n  width: 100%;\n  height: 62px;");
    expect(overrides).not.toContain(".sidebar-v2-row-card:hover .sidebar-v2-row-actions,");
    expect(faviconSource).toContain('name="folder"');
    expect(faviconSource).not.toContain("background-color");
  });

  it("keeps the project scope popup inside the Sidebar rail", () => {
    expect(overrides).toContain(
      ".sidebar-v2-scope-popup {\n  position: absolute;\n  top: 36px;\n  left: 0;",
    );
    expect(overrides).toContain("width: 100%;");
    expect(overrides).not.toContain("width: 250px;");
    expect(overrides).toContain(".sidebar-v2-project-scope-host--open {");
    expect(overrides).toContain(".sidebar-v2-scope-popup .lynx-menu-radio-item {");
    expect(overrides).toContain("height: 32px;");
    expect(sidebarSource).toContain("projectScopeControlWidth: sidebarWidth - 53");
    expect(
      readFileSync(
        path.resolve(import.meta.dirname, "../../../../web/src/components/ui/menu.lynx.tsx"),
        "utf8",
      ),
    ).toContain('<overlay level="1" className="lynx-overlay-host">');
    expect(overrides).toContain(".lynx-overlay-host {\n  position: fixed;\n  overflow: visible;");
  });
});
