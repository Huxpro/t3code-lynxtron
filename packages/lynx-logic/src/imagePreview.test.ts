import { describe, expect, it } from "vite-plus/test";

import { buildExpandedImagePreview } from "./imagePreview.ts";

describe("buildExpandedImagePreview", () => {
  it("keeps previewable images in source order and selects by id", () => {
    expect(
      buildExpandedImagePreview(
        [
          { id: "one", name: "one.png", previewUrl: "data:image/png;base64,one" },
          { id: "missing", name: "missing.png" },
          { id: "two", name: "two.png", previewUrl: "https://example.com/two.png" },
        ],
        "two",
      ),
    ).toEqual({
      images: [
        { src: "data:image/png;base64,one", name: "one.png" },
        { src: "https://example.com/two.png", name: "two.png" },
      ],
      index: 1,
    });
  });

  it("rejects missing or non-previewable selections", () => {
    expect(buildExpandedImagePreview([{ id: "one", name: "one.png" }], "one")).toBeNull();
    expect(
      buildExpandedImagePreview(
        [{ id: "one", name: "one.png", previewUrl: "https://example.com/one.png" }],
        "two",
      ),
    ).toBeNull();
  });
});
