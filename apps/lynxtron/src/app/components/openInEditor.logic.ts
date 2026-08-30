import { EDITORS, type EditorId } from "@t3tools/contracts";

export function resolvePreferredEditor(
  availableEditors: ReadonlyArray<EditorId>,
  storedEditor: EditorId | null,
): EditorId | null {
  if (storedEditor && availableEditors.includes(storedEditor)) return storedEditor;
  const available = new Set(availableEditors);
  return EDITORS.find((editor) => available.has(editor.id))?.id ?? null;
}

export function editorLabel(editor: EditorId): string {
  return EDITORS.find((candidate) => candidate.id === editor)?.label ?? editor;
}

export function platformEditorLabel(editor: EditorId, platform: string | null | undefined): string {
  if (editor !== "file-manager") return editorLabel(editor);
  if (platform === "darwin") return "Finder";
  if (platform === "windows") return "Explorer";
  return "Files";
}

export type LynxEditorIconKind = "cursor" | "trae" | "vscode" | "folder";

export function editorIconKind(editor: EditorId): LynxEditorIconKind {
  if (editor === "cursor" || editor === "trae") return editor;
  if (editor === "vscode" || editor === "vscode-insiders" || editor === "vscodium") {
    return "vscode";
  }
  return "folder";
}
