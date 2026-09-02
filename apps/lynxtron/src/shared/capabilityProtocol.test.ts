import { describe, expect, it } from "vite-plus/test";

import { parseNativeContextMenuShowInput } from "./capabilityProtocol.ts";

describe("native context menu protocol", () => {
  it("accepts a finite non-negative popup position", () => {
    expect(
      parseNativeContextMenuShowInput({ items: [{ id: "copy", label: "Copy" }], x: 805, y: 52 }),
    ).toEqual({ items: [{ id: "copy", label: "Copy" }], x: 805, y: 52 });
  });

  it("drops incomplete positions", () => {
    expect(
      parseNativeContextMenuShowInput({ items: [{ id: "copy", label: "Copy" }], x: 805 }),
    ).toEqual({ items: [{ id: "copy", label: "Copy" }] });
  });
});
