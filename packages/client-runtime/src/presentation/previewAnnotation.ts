const TRAILING_BLOCK_PATTERN =
  /\n*<preview_annotation>\n((?:(?!<preview_annotation>)[\s\S])*)\n<\/preview_annotation>\s*$/;

export interface ParsedPreviewAnnotation {
  readonly id: string;
  readonly title: string;
  readonly comment: string;
  readonly targetSummary: string;
  readonly styleChanges: ReadonlyArray<string>;
  readonly hasScreenshot: boolean;
}

export interface ExtractedPreviewAnnotation {
  readonly promptText: string;
  readonly annotation: ParsedPreviewAnnotation | null;
}

export function extractTrailingPreviewAnnotation(prompt: string): ExtractedPreviewAnnotation {
  const match = TRAILING_BLOCK_PATTERN.exec(prompt);
  if (!match) return { promptText: prompt, annotation: null };
  const body = match[1] ?? "";
  const lines = body.split("\n");
  const pageLine = lines.find((line) => line.startsWith("Page: "));
  const idLine = lines.find((line) => line.startsWith("Id: "));
  const commentLine = lines.find((line) => line.startsWith("Comment: "));
  const targetsLine = lines.find((line) => line.startsWith("Targets: "));
  const styleHeadingIndex = lines.indexOf("Requested visual changes:");
  const linesAfterStyleHeading = lines.slice(styleHeadingIndex + 1);
  const elementContextIndex = linesAfterStyleHeading.indexOf("<element_context>");
  const styleChanges =
    styleHeadingIndex < 0
      ? []
      : linesAfterStyleHeading
          .slice(0, elementContextIndex < 0 ? undefined : elementContextIndex)
          .filter((line) => line.startsWith("- "))
          .map((line) => line.slice(2));
  return {
    promptText: prompt.slice(0, match.index).replace(/\n+$/u, ""),
    annotation: {
      id: idLine?.slice("Id: ".length).trim() || `${match.index}`,
      title: pageLine?.slice("Page: ".length).trim() || "Preview annotation",
      comment: commentLine?.slice("Comment: ".length).trim() || "",
      targetSummary: targetsLine?.slice("Targets: ".length).trim() || "",
      styleChanges,
      hasScreenshot: body.includes("The attached screenshot is the annotated preview crop."),
    },
  };
}

export function extractTrailingPreviewAnnotations(prompt: string): {
  readonly promptText: string;
  readonly annotations: ReadonlyArray<ParsedPreviewAnnotation>;
} {
  let promptText = prompt;
  const annotations: ParsedPreviewAnnotation[] = [];
  while (true) {
    const extracted = extractTrailingPreviewAnnotation(promptText);
    if (!extracted.annotation) break;
    annotations.unshift(extracted.annotation);
    promptText = extracted.promptText;
  }
  return { promptText, annotations };
}
