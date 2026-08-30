import { assert, describe, it } from "vite-plus/test";

import {
  editorIconKind,
  editorLabel,
  platformEditorLabel,
  resolvePreferredEditor,
} from "./openInEditor.logic.ts";

describe("Lynx Open-in editor projection", () => {
  it("keeps a stored editor only while it remains available", () => {
    assert.equal(resolvePreferredEditor(["cursor", "vscode"], "vscode"), "vscode");
    assert.equal(resolvePreferredEditor(["cursor"], "vscode"), "cursor");
  });

  it("uses canonical editor ordering and handles an empty catalog", () => {
    assert.equal(resolvePreferredEditor(["file-manager", "zed"], null), "zed");
    assert.equal(resolvePreferredEditor([], null), null);
  });

  it("projects canonical labels", () => {
    assert.equal(editorLabel("vscode"), "VS Code");
    assert.equal(editorLabel("file-manager"), "File Manager");
  });

  it("projects platform file-manager labels and branded icon kinds", () => {
    assert.equal(platformEditorLabel("file-manager", "darwin"), "Finder");
    assert.equal(platformEditorLabel("file-manager", "windows"), "Explorer");
    assert.equal(platformEditorLabel("file-manager", "linux"), "Files");
    assert.equal(editorIconKind("cursor"), "cursor");
    assert.equal(editorIconKind("trae"), "trae");
    assert.equal(editorIconKind("vscode"), "vscode");
    assert.equal(editorIconKind("file-manager"), "folder");
  });
});
