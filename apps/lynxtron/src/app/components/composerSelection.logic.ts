export function isComposerSelectAllKey(input: {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}): boolean {
  return (input.metaKey || input.ctrlKey) && input.key.toLowerCase() === "a";
}
