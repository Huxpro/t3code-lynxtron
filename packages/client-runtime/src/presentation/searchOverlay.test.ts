import { describe, expect, it } from "vite-plus/test";

import { INITIAL_SEARCH_OVERLAY_STATE, reduceSearchOverlayState } from "./searchOverlay.js";

describe("reduceSearchOverlayState", () => {
  it("toggles command and file modes independently", () => {
    const command = reduceSearchOverlayState(INITIAL_SEARCH_OVERLAY_STATE, {
      _tag: "ToggleMode",
      mode: "command",
    });
    expect(command).toEqual({ open: true, mode: "command", openIntent: null });

    const files = reduceSearchOverlayState(command, {
      _tag: "ToggleMode",
      mode: "files",
    });
    expect(files).toEqual({ open: true, mode: "files", openIntent: null });
    expect(reduceSearchOverlayState(files, { _tag: "ToggleMode", mode: "files" })).toEqual({
      open: false,
      mode: "files",
      openIntent: null,
    });
  });

  it("routes direct opens through command mode", () => {
    expect(
      reduceSearchOverlayState(INITIAL_SEARCH_OVERLAY_STATE, {
        _tag: "OpenAddProject",
      }),
    ).toEqual({
      open: true,
      mode: "command",
      openIntent: { kind: "add-project" },
    });
  });

  it("keeps the mode but clears the intent when closed", () => {
    const open = {
      open: true,
      mode: "content",
      openIntent: { kind: "new-thread-in" },
    } as const;
    expect(reduceSearchOverlayState(open, { _tag: "SetOpen", open: false })).toEqual({
      open: false,
      mode: "content",
      openIntent: null,
    });
  });
});
