import type { ComposerImagePastePacket } from "../../shared/composerImagePasteProtocol.ts";

/** The subset of Lynxtron's NativeImage used to encode a pasted image. */
export interface PastedImage {
  isEmpty(): boolean;
  getSize(): { readonly width: number; readonly height: number };
  resize(options: { width?: number; height?: number; quality?: string }): PastedImage;
  toPNG(): Uint8Array;
  toJPEG(quality: number): Uint8Array;
}

// Mirrors the Web composer's compression ladder (apps/web/src/lib/imageCompression.ts)
// so an oversized screenshot is downscaled rather than refused on both renderers.
const MAX_DIMENSION = 2048;
const QUALITY_STEPS = [92, 85, 78, 68] as const;
const FALLBACK_SCALE_STEPS = [0.75, 0.55] as const;
const PASTED_IMAGE_NAME = "image.png";
/** Equals contracts' PROVIDER_SEND_TURN_MAX_IMAGE_BYTES without bundling Effect into main. */
export const PASTED_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function scaledToFit(image: PastedImage, scale: number): PastedImage {
  const { width, height } = image.getSize();
  const longest = Math.max(width, height);
  const factor = Math.min(1, MAX_DIMENSION / longest) * scale;
  if (factor >= 1) return image;
  return image.resize({
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
    quality: "best",
  });
}

/**
 * Encodes a clipboard image as the same upload attachment Web builds from a
 * pasted file. Returns null when the clipboard holds no image, so the caller
 * can fall back to a native text paste.
 */
export function encodePastedImage(
  image: PastedImage,
  maxBytes = PASTED_IMAGE_MAX_BYTES,
): ComposerImagePastePacket | null {
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  if (width <= 0 || height <= 0) {
    return { kind: "failure", name: PASTED_IMAGE_NAME, reason: "unreadable" };
  }
  const png = image.toPNG();
  if (png.byteLength <= maxBytes) {
    return {
      kind: "attachment",
      attachment: {
        type: "image",
        name: PASTED_IMAGE_NAME,
        mimeType: "image/png",
        sizeBytes: png.byteLength,
        dataUrl: toDataUrl("image/png", png),
      },
    };
  }
  for (const scale of [1, ...FALLBACK_SCALE_STEPS]) {
    const scaled = scaledToFit(image, scale);
    for (const quality of QUALITY_STEPS) {
      const jpeg = scaled.toJPEG(quality);
      if (jpeg.byteLength <= maxBytes) {
        return {
          kind: "attachment",
          attachment: {
            type: "image",
            name: "image.jpg",
            mimeType: "image/jpeg",
            sizeBytes: jpeg.byteLength,
            dataUrl: toDataUrl("image/jpeg", jpeg),
          },
        };
      }
    }
  }
  return { kind: "failure", name: PASTED_IMAGE_NAME, reason: "too-large" };
}

/**
 * Edit > Paste for the Lynxtron menu. With the Composer focused and an image
 * on the clipboard it delivers the image like Web's paste handler; otherwise
 * it performs the platform text paste into the first responder.
 */
export function createComposerPasteMenuItem(options: {
  readonly isComposerFocused: () => boolean;
  readonly readClipboardImage: () => PastedImage;
  readonly deliver: (packet: ComposerImagePastePacket) => boolean;
  readonly pasteNatively: () => void;
}) {
  return {
    label: "Paste",
    accelerator: "CommandOrControl+V",
    click: () => {
      if (options.isComposerFocused()) {
        const packet = encodePastedImage(options.readClipboardImage());
        if (packet) {
          if (!options.deliver(packet)) {
            console.warn("[composer-paste] image paste was not delivered to the renderer");
          }
          return;
        }
      }
      options.pasteNatively();
    },
  };
}
