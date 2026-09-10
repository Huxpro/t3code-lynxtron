import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "verify-transcript-scroll.mjs"), "utf8");

describe("transcript scroll diagnostic", () => {
  it("requires an explicit owned client and session", () => {
    expect(source).toContain('readArgument("--client-id", null)');
    expect(source).toContain('readArgument("--session-id", "")');
    expect(source).not.toContain("listClients()");
  });

  it("uses renderer probes without claiming physical input acceptance", () => {
    expect(source).toContain("This verifies renderer state wiring, not physical wheel");
    expect(source).toContain("__T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__");
    expect(source).not.toContain("Input.emulateTouchFromMouseEvent");
  });
});
