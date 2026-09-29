import type { UploadChatAttachment } from "@t3tools/contracts";

/** Main-to-renderer global event carrying one Command+V clipboard image. */
export const T3_COMPOSER_IMAGE_PASTE_EVENT = "t3:composer.image-paste";

/** Probe-only bridge method: runs Edit > Paste with `{ dataUrl }` as the clipboard image. */
export const T3_COMPOSER_IMAGE_PASTE_TEST_METHOD = "t3:test.composer-image-paste";

export type ComposerImagePasteFailureReason = "too-large" | "unreadable";

export type ComposerImagePastePacket =
  | { readonly kind: "attachment"; readonly attachment: UploadChatAttachment }
  | {
      readonly kind: "failure";
      readonly name: string;
      readonly reason: ComposerImagePasteFailureReason;
    };

export function isComposerImagePastePacket(input: unknown): input is ComposerImagePastePacket {
  if (typeof input !== "object" || input === null) return false;
  const packet = input as Partial<Record<string, unknown>>;
  if (packet.kind === "failure") {
    return (
      typeof packet.name === "string" &&
      (packet.reason === "too-large" || packet.reason === "unreadable")
    );
  }
  if (packet.kind !== "attachment") return false;
  const attachment = packet.attachment as Partial<Record<string, unknown>> | undefined;
  return (
    typeof attachment === "object" &&
    attachment !== null &&
    attachment.type === "image" &&
    typeof attachment.name === "string" &&
    typeof attachment.mimeType === "string" &&
    attachment.mimeType.startsWith("image/") &&
    typeof attachment.sizeBytes === "number" &&
    typeof attachment.dataUrl === "string" &&
    attachment.dataUrl.startsWith("data:image/")
  );
}
