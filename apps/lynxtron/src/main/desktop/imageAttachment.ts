import {
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type UploadChatAttachment,
} from "@t3tools/contracts";
import * as path from "node:path";

export function imageMimeType(filePath: string): string | null {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return null;
  }
}

export function encodeImageAttachment(filePath: string, bytes: Uint8Array): UploadChatAttachment {
  const mimeType = imageMimeType(filePath);
  if (!mimeType) throw new Error(`Unsupported image type: ${path.basename(filePath)}`);
  if (bytes.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds the 10 MB limit: ${path.basename(filePath)}`);
  }
  return {
    type: "image",
    name: path.basename(filePath),
    mimeType,
    sizeBytes: bytes.byteLength,
    dataUrl: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}

export function boundedImagePaths(filePaths: ReadonlyArray<string>): ReadonlyArray<string> {
  if (filePaths.length > PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
    throw new Error(`Attach at most ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images.`);
  }
  return filePaths;
}
