import { describe, expect, it } from "vite-plus/test";

import {
  activatePanelSurface,
  clearPanelSurfaces,
  closePanelSurface,
  closePanelSurfacesToRight,
  createEmptyPanelSurfaceState,
  keepOnlyPanelSurface,
  openPanelSurface,
  selectActivePanelSurface,
  setPanelSurfaceVisibility,
  togglePanelSurfaceVisibility,
} from "./panelSurfaces.ts";

interface TestSurface {
  readonly id: string;
  readonly kind: "plan" | "diff" | "files";
}

const plan: TestSurface = { id: "plan", kind: "plan" };
const diff: TestSurface = { id: "diff", kind: "diff" };
const files: TestSurface = { id: "files", kind: "files" };

describe("shared panel surface state", () => {
  it("opens, deduplicates, and activates surfaces", () => {
    const empty = createEmptyPanelSurfaceState<TestSurface>();
    const opened = openPanelSurface(empty, plan);
    expect(opened).toEqual({
      isOpen: true,
      activeSurfaceId: "plan",
      surfaces: [plan],
    });
    expect(openPanelSurface(opened, plan)).toBe(opened);

    const withDiff = openPanelSurface(opened, diff);
    expect(activatePanelSurface(withDiff, "plan")).toEqual({
      isOpen: true,
      activeSurfaceId: "plan",
      surfaces: [plan, diff],
    });
    expect(activatePanelSurface(withDiff, "missing")).toBe(withDiff);
  });

  it("uses the nearest remaining surface when the active one closes", () => {
    const state = openPanelSurface(
      openPanelSurface(openPanelSurface(createEmptyPanelSurfaceState<TestSurface>(), plan), diff),
      files,
    );

    expect(closePanelSurface(state, "diff")).toEqual({
      isOpen: true,
      activeSurfaceId: "files",
      surfaces: [plan, files],
    });
    expect(closePanelSurface(state, "files")).toEqual({
      isOpen: true,
      activeSurfaceId: "diff",
      surfaces: [plan, diff],
    });
  });

  it("retains the active surface when a background surface closes", () => {
    const state = openPanelSurface(
      openPanelSurface(createEmptyPanelSurfaceState<TestSurface>(), plan),
      diff,
    );
    expect(closePanelSurface(state, "plan")).toEqual({
      isOpen: true,
      activeSurfaceId: "diff",
      surfaces: [diff],
    });
  });

  it("supports close-others and close-to-right ordering semantics", () => {
    const state = openPanelSurface(
      openPanelSurface(openPanelSurface(createEmptyPanelSurfaceState<TestSurface>(), plan), diff),
      files,
    );

    expect(keepOnlyPanelSurface(state, "diff")).toEqual({
      isOpen: true,
      activeSurfaceId: "diff",
      surfaces: [diff],
    });
    expect(closePanelSurfacesToRight(state, "plan")).toEqual({
      isOpen: true,
      activeSurfaceId: "plan",
      surfaces: [plan],
    });
  });

  it("separates visibility from clearing the surface stack", () => {
    const opened = openPanelSurface(createEmptyPanelSurfaceState<TestSurface>(), plan);
    const hidden = setPanelSurfaceVisibility(opened, false);
    expect(hidden).toEqual({ ...opened, isOpen: false });
    expect(selectActivePanelSurface(hidden)).toBeNull();
    expect(togglePanelSurfaceVisibility(hidden)).toEqual(opened);
    expect(clearPanelSurfaces(opened)).toEqual(createEmptyPanelSurfaceState<TestSurface>());
  });
});
