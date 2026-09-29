import { PROVIDER_SEND_TURN_MAX_IMAGE_BYTES } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import { isComposerImagePastePacket } from "../../shared/composerImagePasteProtocol.ts";
import {
  PASTED_IMAGE_MAX_BYTES,
  createComposerPasteMenuItem,
  encodePastedImage,
  type PastedImage,
} from "./composerImagePaste.ts";

function fakeImage(options: {
  readonly width: number;
  readonly height: number;
  readonly pngBytes: number;
  readonly jpegBytes?: (quality: number, width: number) => number;
}): PastedImage {
  return {
    isEmpty: () => options.width === 0 && options.height === 0 && options.pngBytes === 0,
    getSize: () => ({ width: options.width, height: options.height }),
    toPNG: () => new Uint8Array(options.pngBytes),
    toJPEG: (quality) =>
      new Uint8Array(options.jpegBytes?.(quality, options.width) ?? options.pngBytes),
    resize: ({ width = options.width, height = options.height }) =>
      fakeImage({ ...options, width, height }),
  };
}

const emptyImage = fakeImage({ width: 0, height: 0, pngBytes: 0 });

describe("encodePastedImage", () => {
  it("uses the shared provider image cap", () => {
    assert.equal(PASTED_IMAGE_MAX_BYTES, PROVIDER_SEND_TURN_MAX_IMAGE_BYTES);
  });

  it("returns null for an empty clipboard image", () => {
    assert.isNull(encodePastedImage(emptyImage));
  });

  it("passes an image within the cap through as PNG", () => {
    const packet = encodePastedImage(fakeImage({ width: 10, height: 10, pngBytes: 3 }), 100);
    assert.deepEqual(packet, {
      kind: "attachment",
      attachment: {
        type: "image",
        name: "image.png",
        mimeType: "image/png",
        sizeBytes: 3,
        dataUrl: "data:image/png;base64,AAAA",
      },
    });
    assert.isTrue(isComposerImagePastePacket(packet));
  });

  it("downscales an oversized image to JPEG before refusing it", () => {
    const packet = encodePastedImage(
      fakeImage({
        width: 4096,
        height: 1024,
        pngBytes: 500,
        jpegBytes: (quality, width) => (width <= 2048 && quality <= 85 ? 90 : 200),
      }),
      100,
    );
    assert.equal(packet?.kind, "attachment");
    if (packet?.kind !== "attachment") return;
    assert.equal(packet.attachment.mimeType, "image/jpeg");
    assert.equal(packet.attachment.sizeBytes, 90);
  });

  it("reports an image that stays too large", () => {
    assert.deepEqual(
      encodePastedImage(fakeImage({ width: 100, height: 100, pngBytes: 500 }), 100),
      { kind: "failure", name: "image.png", reason: "too-large" },
    );
  });
});

describe("createComposerPasteMenuItem", () => {
  const run = (options: { readonly focused: boolean; readonly image: PastedImage }) => {
    const delivered: unknown[] = [];
    let nativePastes = 0;
    createComposerPasteMenuItem({
      isComposerFocused: () => options.focused,
      readClipboardImage: () => options.image,
      deliver: (packet) => {
        delivered.push(packet);
        return true;
      },
      pasteNatively: () => {
        nativePastes += 1;
      },
    }).click();
    return { delivered, nativePastes };
  };
  const smallImage = fakeImage({ width: 10, height: 10, pngBytes: 3 });

  it("attaches a clipboard image when the Composer is focused", () => {
    const result = run({ focused: true, image: smallImage });
    assert.equal(result.delivered.length, 1);
    assert.equal(result.nativePastes, 0);
  });

  it("performs a native text paste when the clipboard has no image", () => {
    assert.deepEqual(run({ focused: true, image: emptyImage }), { delivered: [], nativePastes: 1 });
  });

  it("never intercepts paste outside the Composer", () => {
    assert.deepEqual(run({ focused: false, image: smallImage }), {
      delivered: [],
      nativePastes: 1,
    });
  });
});
