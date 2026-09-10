import { describe, expect, it, vi } from "vite-plus/test";

import { savePlanToDefaultWorkspacePath } from "./planActions";

describe("savePlanToDefaultWorkspacePath", () => {
  it("writes normalized plan Markdown to the shared default filename", async () => {
    const writeFile = vi.fn().mockResolvedValue({ relativePath: "ship-renderer.md" });

    await expect(
      savePlanToDefaultWorkspacePath(writeFile, "/repo", "# Ship Renderer\n\n"),
    ).resolves.toEqual({ status: "saved", relativePath: "ship-renderer.md" });
    expect(writeFile).toHaveBeenCalledWith("/repo", "ship-renderer.md", "# Ship Renderer\n");
  });

  it("returns a retryable failure state when the write rejects", async () => {
    await expect(
      savePlanToDefaultWorkspacePath(
        () => Promise.reject(new Error("disk full")),
        "/repo",
        "# Plan",
      ),
    ).resolves.toEqual({ status: "failed", message: "disk full" });
  });
});
