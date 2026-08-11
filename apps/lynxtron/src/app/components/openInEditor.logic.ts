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
