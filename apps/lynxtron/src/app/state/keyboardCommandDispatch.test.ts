import { describe, expect, it, vi } from "vite-plus/test";

import {
  dispatchResolvedKeyboardCommand,
  type KeyboardCommandActions,
} from "./keyboardCommandDispatch";

function harness() {
  const actions: KeyboardCommandActions = {
    createThread: vi.fn(),
    jumpModel: vi.fn(() => true),
    jumpThread: vi.fn(() => true),
    openFilePicker: vi.fn(),
    openQuickSwitch: vi.fn(),
    openSettings: vi.fn(),
    toggleSidebar: vi.fn(),
  };
  return actions;
}

describe("dispatchResolvedKeyboardCommand", () => {
  it.each([
    ["chat.new", "createThread"],
    ["commandPalette.toggle", "openQuickSwitch"],
    ["filePicker.toggle", "openFilePicker"],
    ["settings.open", "openSettings"],
    ["sidebar.toggle", "toggleSidebar"],
  ] as const)("dispatches %s through its product action", (command, action) => {
    const actions = harness();
    expect(dispatchResolvedKeyboardCommand(command, false, actions)).toBe(true);
    expect(actions[action]).toHaveBeenCalledOnce();
  });

  it("routes digit commands to model or thread jumps by current context", () => {
    const actions = harness();
    expect(dispatchResolvedKeyboardCommand("thread.jump.2", false, actions)).toBe(true);
    expect(actions.jumpThread).toHaveBeenCalledWith(1);
    expect(dispatchResolvedKeyboardCommand("modelPicker.jump.2", true, actions)).toBe(true);
    expect(actions.jumpModel).toHaveBeenCalledWith(1);
  });

  it("rejects unresolved commands without side effects", () => {
    const actions = harness();
    expect(dispatchResolvedKeyboardCommand(null, false, actions)).toBe(false);
    expect(Object.values(actions).every((action) => action.mock.calls.length === 0)).toBe(true);
  });
});
