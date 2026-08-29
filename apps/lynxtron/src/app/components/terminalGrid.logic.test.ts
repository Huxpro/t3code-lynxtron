import { describe, expect, it } from "vite-plus/test";

import { terminalGridSize, terminalSplitGridSize } from "./terminalGrid.logic";

describe("terminalGridSize", () => {
  it("projects the default right-panel content into terminal cells", () => {
    expect(terminalGridSize(448, 768)).toEqual({ cols: 58, rows: 35 });
  });

  it("updates columns without changing rows when only panel width changes", () => {
    expect(terminalGridSize(640, 768)).toEqual({ cols: 85, rows: 35 });
  });

  it("clamps undersized panels to a valid PTY grid", () => {
    expect(terminalGridSize(0, 0)).toEqual({ cols: 1, rows: 1 });
  });

  it("divides columns for horizontal splits and rows for vertical splits", () => {
    expect(terminalSplitGridSize(640, 768, "horizontal")).toEqual({ cols: 42, rows: 35 });
    expect(terminalSplitGridSize(640, 768, "vertical")).toEqual({ cols: 85, rows: 17 });
    expect(terminalSplitGridSize(640, 768, null)).toEqual({ cols: 85, rows: 35 });
  });
});
