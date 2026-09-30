import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_PROJECT_SCRIPT_INPUT,
  editorRequestForScript,
  resolveProjectScriptEditorPayload,
} from "./projectScriptEditor.logic";

describe("project script editor", () => {
  it("requires a name and a command", () => {
    expect(
      resolveProjectScriptEditorPayload({
        scriptId: null,
        scripts: [],
        form: { ...EMPTY_PROJECT_SCRIPT_INPUT, command: "bun test" },
      }),
    ).toEqual({ ok: false, error: "Name is required." });
    expect(
      resolveProjectScriptEditorPayload({
        scriptId: null,
        scripts: [],
        form: { ...EMPTY_PROJECT_SCRIPT_INPUT, name: "Test", command: "  " },
      }),
    ).toEqual({ ok: false, error: "Command is required." });
  });

  it("rejects an invalid keybinding", () => {
    const result = resolveProjectScriptEditorPayload({
      scriptId: null,
      scripts: [],
      form: {
        ...EMPTY_PROJECT_SCRIPT_INPUT,
        name: "Test",
        command: "bun test",
        keybinding: "mod+shift",
      },
    });
    expect(result).toEqual({ ok: false, error: "Invalid keybinding." });
  });

  it("trims fields and drops auto-open without a preview URL", () => {
    expect(
      resolveProjectScriptEditorPayload({
        scriptId: null,
        scripts: [],
        form: {
          ...EMPTY_PROJECT_SCRIPT_INPUT,
          name: " Test ",
          command: " bun test ",
          keybinding: " mod+k ",
          previewUrl: "  ",
          autoOpenPreview: true,
        },
      }),
    ).toEqual({
      ok: true,
      payload: {
        name: "Test",
        command: "bun test",
        icon: "play",
        runOnWorktreeCreate: false,
        keybinding: "mod+k",
        previewUrl: null,
        autoOpenPreview: false,
      },
    });
  });

  it("opens an edit request with the script's current shortcut", () => {
    const request = editorRequestForScript(
      {
        id: "lint",
        name: "Lint",
        command: "vp lint",
        icon: "lint",
        runOnWorktreeCreate: true,
      },
      [
        {
          command: "script.lint.run",
          shortcut: {
            key: "l",
            metaKey: false,
            ctrlKey: false,
            shiftKey: true,
            altKey: false,
            modKey: true,
          },
        },
      ],
    );
    expect(request).toEqual({
      scriptId: "lint",
      initial: {
        name: "Lint",
        command: "vp lint",
        icon: "lint",
        runOnWorktreeCreate: true,
        keybinding: "mod+shift+l",
        previewUrl: null,
        autoOpenPreview: false,
      },
    });
  });
});
