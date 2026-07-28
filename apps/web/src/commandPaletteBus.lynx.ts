export interface CommandPaletteOpenDetail {
  readonly open?: "add-project" | "new-thread-in";
}

export function openCommandPalette(_detail?: CommandPaletteOpenDetail): void {}

export function onOpenCommandPalette(
  _listener: (detail: CommandPaletteOpenDetail) => void,
): () => void {
  return () => {};
}

export function isCommandPaletteOpen(): boolean {
  return false;
}
