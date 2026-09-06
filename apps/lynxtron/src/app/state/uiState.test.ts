import { describe, expect, it } from "vite-plus/test";

import {
  applyRightPanelAction,
  dismissOpenSearchOverlay,
  INITIAL_MODEL_PICKER_NAVIGATION_STATE,
  INITIAL_RIGHT_PANEL_STATE,
  isModelPickerOpen,
  isSearchOverlayOpen,
  readProjectScopeKey,
  selectModelPickerProvider,
  syncModelPickerProvider,
  uiActions,
  type RightPanelSurface,
} from "./uiState";

describe("dismissOpenSearchOverlay", () => {
  it("closes the model picker before the quick switch", () => {
    uiActions.closeModelPicker();
    uiActions.closeQuickSwitch();
    uiActions.openQuickSwitch("command");
    uiActions.openModelPicker();

    expect(dismissOpenSearchOverlay()).toBe(true);
    expect(isModelPickerOpen()).toBe(false);
    expect(isSearchOverlayOpen()).toBe(true);
    expect(dismissOpenSearchOverlay()).toBe(true);
    expect(isSearchOverlayOpen()).toBe(false);
    expect(dismissOpenSearchOverlay()).toBe(false);
  });
});

describe("project scope state", () => {
  it("shares the selected project between Sidebar and root overlays", () => {
    uiActions.setProjectScopeKey("project-b");
    expect(readProjectScopeKey()).toBe("project-b");
    uiActions.setProjectScopeKey(null);
    expect(readProjectScopeKey()).toBe(null);
  });
});

const plan: RightPanelSurface = { id: "plan:1", kind: "plan", label: "Plan" };
const files = { id: "files:2", kind: "files", label: "Files" } satisfies RightPanelSurface;
const browser = {
  id: "browser:3",
  kind: "browser",
  label: "Browser",
  tabId: "browser-tab-3",
} satisfies RightPanelSurface;
const file: RightPanelSurface = {
  id: "file:AGENTS.md",
  kind: "file",
  label: "AGENTS.md",
  path: "AGENTS.md",
};
const diff: RightPanelSurface = {
  id: "diff:3",
  kind: "diff",
  label: "Diff",
  turnId: "turn-1" as never,
  filePath: "fib.js",
};

describe("applyRightPanelAction", () => {
  it("opens and reuses one surface per kind", () => {
    const opened = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: plan,
    });
    expect(opened).toEqual({
      isOpen: true,
      surfaces: [plan],
      activeSurfaceId: plan.id,
    });
    expect(
      applyRightPanelAction(opened, {
        type: "open",
        surface: { ...plan, id: "plan:other" },
      }),
    ).toBe(opened);
  });

  it("keeps each Browser tab as an independent right-panel surface", () => {
    const opened = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: browser,
    });
    expect(opened).toEqual({
      isOpen: true,
      surfaces: [browser],
      activeSurfaceId: browser.id,
    });
    const second = { ...browser, id: "browser:other", tabId: "browser-tab-other" };
    expect(applyRightPanelAction(opened, { type: "open", surface: second })).toEqual({
      isOpen: true,
      surfaces: [browser, second],
      activeSurfaceId: second.id,
    });
  });

  it("activates the nearest remaining surface when the active surface closes", () => {
    const withPlan = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: plan,
    });
    const withFiles = applyRightPanelAction(withPlan, { type: "open", surface: files });
    expect(
      applyRightPanelAction(withFiles, { type: "close-surface", surfaceId: files.id }),
    ).toEqual({
      isOpen: true,
      surfaces: [plan],
      activeSurfaceId: plan.id,
    });
  });

  it("keeps surfaces when the panel is hidden and clears them only on close-all", () => {
    const opened = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: plan,
    });
    const hidden = applyRightPanelAction(opened, { type: "close-panel" });
    expect(hidden).toEqual({ ...opened, isOpen: false });
    expect(applyRightPanelAction(hidden, { type: "close-all" })).toEqual(INITIAL_RIGHT_PANEL_STATE);
  });

  it("updates the selected turn and file when an existing diff surface reopens", () => {
    const opened = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: diff,
    });
    const updated = applyRightPanelAction(opened, {
      type: "open",
      surface: {
        ...diff,
        id: "diff:new",
        turnId: "turn-2" as never,
        filePath: "src/fib.js",
      },
    });
    expect(updated).toEqual({
      isOpen: true,
      activeSurfaceId: diff.id,
      surfaces: [{ ...diff, turnId: "turn-2", filePath: "src/fib.js" }],
    });
  });

  it("reuses the file surface while replacing its selected path", () => {
    const opened = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: file,
    });
    const nextFile = {
      id: "file:README.md",
      kind: "file" as const,
      label: "README.md",
      path: "README.md",
    };

    expect(applyRightPanelAction(opened, { type: "open", surface: nextFile })).toEqual({
      isOpen: true,
      activeSurfaceId: nextFile.id,
      surfaces: [nextFile],
    });
  });

  it("replaces the Files tab with one file surface while the detail owns its explorer", () => {
    const withFiles = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: files,
    });
    const withoutExplorer = {
      ...withFiles,
      surfaces: withFiles.surfaces.filter((surface) => surface.kind !== "files"),
    };

    expect(applyRightPanelAction(withoutExplorer, { type: "open", surface: file })).toEqual({
      isOpen: true,
      activeSurfaceId: file.id,
      surfaces: [file],
    });
  });

  it("returns from a file detail to the Files browser without hiding the panel", () => {
    const withFile = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: file,
    });

    expect(
      applyRightPanelAction(withFile, {
        type: "return-files",
        surface: files,
      }),
    ).toEqual({
      isOpen: true,
      activeSurfaceId: files.id,
      surfaces: [files],
    });
  });

  it("preserves the file tab when the changed-files action adds a Diff tab", () => {
    const withFile = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: file,
    });
    expect(applyRightPanelAction(withFile, { type: "open", surface: diff })).toEqual({
      isOpen: true,
      activeSurfaceId: diff.id,
      surfaces: [file, diff],
    });
  });

  it("supports the Web tab context-menu close lifecycle", () => {
    const withPlan = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: plan,
    });
    const withFile = applyRightPanelAction(withPlan, { type: "open", surface: file });
    const withDiff = applyRightPanelAction(withFile, { type: "open", surface: diff });

    expect(
      applyRightPanelAction(withDiff, {
        type: "close-surfaces-to-right",
        surfaceId: file.id,
      }),
    ).toEqual({
      isOpen: true,
      activeSurfaceId: file.id,
      surfaces: [plan, file],
    });
    expect(
      applyRightPanelAction(withDiff, {
        type: "close-other-surfaces",
        surfaceId: file.id,
      }),
    ).toEqual({
      isOpen: true,
      activeSurfaceId: file.id,
      surfaces: [file],
    });
  });

  it("reopens a hidden panel without duplicating its existing surface", () => {
    const opened = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: files,
    });
    const hidden = applyRightPanelAction(opened, { type: "close-panel" });

    expect(
      applyRightPanelAction(hidden, {
        type: "open",
        surface: { ...files, id: "files:new" },
      }),
    ).toEqual(opened);
  });

  it("toggles panel visibility while retaining the active surface", () => {
    const opened = applyRightPanelAction(INITIAL_RIGHT_PANEL_STATE, {
      type: "open",
      surface: plan,
    });
    const hidden = applyRightPanelAction(opened, { type: "toggle-panel" });

    expect(hidden).toEqual({ ...opened, isOpen: false });
    expect(applyRightPanelAction(hidden, { type: "toggle-panel" })).toEqual(opened);
  });
});

describe("model picker navigation", () => {
  it("preserves an explicit provider selection during same-thread hydration", () => {
    const selected = selectModelPickerProvider(
      syncModelPickerProvider(
        INITIAL_MODEL_PICKER_NAVIGATION_STATE,
        "draft-1",
        "claudeAgent" as never,
      ),
      "opencode" as never,
    );

    expect(syncModelPickerProvider(selected, "draft-1", "claudeAgent" as never)).toBe(selected);
  });

  it("resets to the canonical provider when the thread scope changes", () => {
    const selected = selectModelPickerProvider(
      syncModelPickerProvider(
        INITIAL_MODEL_PICKER_NAVIGATION_STATE,
        "draft-1",
        "claudeAgent" as never,
      ),
      "opencode" as never,
    );

    expect(syncModelPickerProvider(selected, "draft-2", "codex" as never)).toEqual({
      scopeKey: "draft-2",
      provider: "codex",
      touched: false,
    });
  });
});
