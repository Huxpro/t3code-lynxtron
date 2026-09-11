import type { PreviewAnnotationPayload } from "@t3tools/contracts";
export {
  extractTrailingPreviewAnnotation,
  extractTrailingPreviewAnnotations,
} from "@t3tools/client-runtime/presentation/preview-annotation";
export type {
  ExtractedPreviewAnnotation,
  ParsedPreviewAnnotation,
} from "@t3tools/client-runtime/presentation/preview-annotation";
import { buildElementContextBlock, normalizeElementContextSelection } from "./elementContext";

export function buildPreviewAnnotationPrompt(annotation: PreviewAnnotationPayload): string {
  const lines = ["Preview annotation:"];
  lines.push(`Id: ${annotation.id}`);
  const title = annotation.pageTitle?.trim() || annotation.pageUrl.trim() || "Preview";
  lines.push(`Page: ${title}`);
  if (annotation.comment.trim()) lines.push(`Comment: ${annotation.comment.trim()}`);
  const targets: string[] = [];
  if (annotation.elements.length > 0) {
    targets.push(
      `${annotation.elements.length} selected element${annotation.elements.length === 1 ? "" : "s"}`,
    );
  }
  if (annotation.regions.length > 0) {
    targets.push(
      `${annotation.regions.length} marked region${annotation.regions.length === 1 ? "" : "s"}`,
    );
  }
  if (annotation.strokes.length > 0) {
    targets.push(
      `${annotation.strokes.length} drawing${annotation.strokes.length === 1 ? "" : "s"}`,
    );
  }
  if (targets.length > 0) lines.push(`Targets: ${targets.join(", ")}.`);
  if (annotation.styleChanges.length > 0) {
    lines.push("Requested visual changes:");
    for (const change of annotation.styleChanges) {
      lines.push(`- ${change.property}: ${change.previousValue || "(unset)"} → ${change.value}`);
    }
  }
  if (annotation.screenshot) {
    lines.push("The attached screenshot is the annotated preview crop.");
  }
  const elementContexts = annotation.elements
    .map((target) => normalizeElementContextSelection(target.element))
    .filter((context) => context !== null);
  const elementBlock = buildElementContextBlock(elementContexts);
  if (elementBlock) lines.push(elementBlock);
  return ["<preview_annotation>", ...lines, "</preview_annotation>"].join("\n");
}

export function appendPreviewAnnotationPrompt(
  prompt: string,
  annotation: PreviewAnnotationPayload,
): string {
  const annotationText = buildPreviewAnnotationPrompt(annotation);
  const trimmed = prompt.trim();
  return trimmed ? `${trimmed}\n\n${annotationText}` : annotationText;
}

export async function previewAnnotationScreenshotFile(
  annotation: PreviewAnnotationPayload,
): Promise<File | null> {
  if (!annotation.screenshot) return null;
  const response = await fetch(annotation.screenshot.dataUrl);
  const blob = await response.blob();
  return new File([blob], `preview-annotation-${annotation.id}.png`, {
    type: blob.type || "image/png",
  });
}
