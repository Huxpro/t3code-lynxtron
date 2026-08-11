import { describe, expect, it } from "vite-plus/test";

import {
  applyRightPanelAction,
  INITIAL_MODEL_PICKER_NAVIGATION_STATE,
  INITIAL_RIGHT_PANEL_STATE,
  selectModelPickerProvider,
  syncModelPickerProvider,
  type RightPanelSurface,
} from "./uiState";

const plan: RightPanelSurface = { id: "plan:1", kind: "plan", label: "Plan" };
const files: RightPanelSurface = { id: "files:2", kind: "files", label: "Files" };
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
