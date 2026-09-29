import { describe, expect, it } from "vite-plus/test";
import { boundedImagePaths, encodeImageAttachment, imageMimeType } from "./imageAttachment.ts";

describe("image attachment host encoding", () => {
  it("maps supported extensions and produces the canonical data URL", () => {
    expect(imageMimeType("proof.PNG")).toBe("image/png");
    expect(encodeImageAttachment("/tmp/proof.png", new TextEncoder().encode("test"))).toEqual({
      type: "image",
      name: "proof.png",
      mimeType: "image/png",
      sizeBytes: 4,
      dataUrl: "data:image/png;base64,dGVzdA==",
    });
  });

  it("rejects unsupported, oversized, and over-count selections", () => {
    expect(() => encodeImageAttachment("/tmp/proof.txt", new Uint8Array())).toThrow(
      /Unsupported image type/,
    );
    expect(() =>
      encodeImageAttachment("/tmp/large.png", new Uint8Array(10 * 1024 * 1024 + 1)),
    ).toThrow(/10 MB limit/);
    expect(() =>
      boundedImagePaths(Array.from({ length: 9 }, (_, index) => `${index}.png`)),
    ).toThrow(/at most 8 images/);
  });
});
