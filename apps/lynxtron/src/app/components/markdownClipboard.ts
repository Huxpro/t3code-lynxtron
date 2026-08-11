export async function copyMarkdownCode(
  code: string,
  clipboard: {
    readonly available: () => boolean;
    readonly writeText: (value: string) => Promise<void>;
  },
): Promise<boolean> {
  if (!clipboard.available()) return false;
  await clipboard.writeText(code);
  return true;
}
