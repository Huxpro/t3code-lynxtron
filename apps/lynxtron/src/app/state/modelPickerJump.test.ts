import { describe, expect, it } from "vite-plus/test";

import { onModelPickerJump, requestModelPickerJump } from "./modelPickerJump";

describe("Model picker jump bus", () => {
  it("routes a jump to the mounted picker and removes only that subscription", () => {
    const received: number[] = [];
    const dispose = onModelPickerJump((index) => {
      received.push(index);
      return true;
    });

    expect(requestModelPickerJump(2)).toBe(true);
    expect(received).toEqual([2]);
    dispose();
    expect(requestModelPickerJump(1)).toBe(false);
  });
});
