import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

const source = readFileSync(new URL("./keyboardCommands.ts", import.meta.url), "utf8");

describe("keyboard dispatch probe contract", () => {
  it("records resolved commands only while the explicit viewport probe is active", () => {
    expect(source).toContain("__T3_LYNXTRON_LAST_KEYBOARD_DISPATCH__");
    expect(source).toContain('typeof target.__T3_LYNXTRON_VIEWPORT_PROBE__ !== "function"');
    expect(source).toContain("modelPickerOpen,");
    expect(source).toContain("command,");
    expect(source).toContain("handled,");
  });
});
