import { describe, expect, it } from "vite-plus/test";

import {
  buildFileLinkContextMenuItems,
  fileLinkCopiedToast,
  fileLinkFailureToast,
} from "./fileLinkContextMenu";

describe("file link context menu", () => {
  it("offers the integrated browser only when available", () => {
    expect(
      buildFileLinkContextMenuItems({ canOpenInBrowser: false }).map((item) => item.id),
    ).toEqual(["open", "copy-relative", "copy-full"]);
    expect(
      buildFileLinkContextMenuItems({ canOpenInBrowser: true }).map((item) => item.id),
    ).toEqual(["open", "open-in-browser", "copy-relative", "copy-full"]);
  });

  it("describes copies and failures with the Web toast text", () => {
    expect(fileLinkCopiedToast("Relative path", "src/a.ts")).toEqual({
      type: "success",
      title: "Relative path copied",
      description: "src/a.ts",
    });
    expect(
      fileLinkFailureToast({ kind: "copy", label: "Full path", cause: new Error("denied") }),
    ).toEqual({ type: "error", title: "Failed to copy full path", description: "denied" });
    expect(fileLinkFailureToast({ kind: "open-in-editor", cause: "x" }).title).toBe(
      "Unable to open file",
    );
  });
});
