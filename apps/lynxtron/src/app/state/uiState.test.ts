import { describe, expect, it } from "vite-plus/test";

import {
  applyRightPanelAction,
  INITIAL_RIGHT_PANEL_STATE,
  type RightPanelSurface,
} from "./uiState";

const plan: RightPanelSurface = { id: "plan:1", kind: "plan", label: "Plan" };
const files: RightPanelSurface = { id: "files:2", kind: "files", label: "Files" };

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
});
