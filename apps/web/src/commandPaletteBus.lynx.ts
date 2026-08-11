import {
  isSearchOverlayOpen,
  uiActions,
} from "../../lynxtron/src/app/state/uiState";

export interface CommandPaletteOpenDetail {
  readonly open?: "add-project" | "new-thread-in";
}

export function openCommandPalette(detail?: CommandPaletteOpenDetail): void {
  if (detail?.open === "add-project") {
    uiActions.openAddProject();
    return;
  }
  if (detail?.open === "new-thread-in") {
    uiActions.openNewThreadIn();
    return;
  }
  uiActions.openQuickSwitch("command");
}

export function onOpenCommandPalette(
  _listener: (detail: CommandPaletteOpenDetail) => void,
): () => void {
  return () => {};
}

export function isCommandPaletteOpen(): boolean {
  return isSearchOverlayOpen();
}
