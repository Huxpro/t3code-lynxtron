import { describe, expect, it, vi } from "vite-plus/test";

import { copyMarkdownCode } from "./markdownClipboard";

describe("copyMarkdownCode", () => {
  it("copies the complete code block and reports success", async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(
      copyMarkdownCode("first line\nsecond line", {
        available: () => true,
        writeText,
      }),
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("first line\nsecond line");
  });

  it("does not write when the clipboard capability is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(
      copyMarkdownCode("code", {
        available: () => false,
        writeText,
      }),
    ).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
