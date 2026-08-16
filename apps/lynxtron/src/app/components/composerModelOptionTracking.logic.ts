const MODEL_OPTION_SEPARATOR_ADVANCE_CORRECTION = 5.02;

export function getComposerModelOptionLetterSpacing(label: string): string | undefined {
  const separatorCount = label.split(" · ").length - 1;
  if (separatorCount === 0) return undefined;
  const characterCount = Array.from(label).length;
  const spacing = (-MODEL_OPTION_SEPARATOR_ADVANCE_CORRECTION * separatorCount) / characterCount;
  return `${spacing.toFixed(2)}px`;
}
