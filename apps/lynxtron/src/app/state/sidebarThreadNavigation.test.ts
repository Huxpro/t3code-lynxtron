import { describe, expect, it } from "vite-plus/test";

import { onSidebarThreadJump, requestSidebarThreadJump } from "./sidebarThreadNavigation";

describe("Sidebar thread navigation bus", () => {
  it("routes a jump to the mounted Sidebar and removes only that subscription", () => {
    const received: number[] = [];
    const dispose = onSidebarThreadJump((index) => {
      received.push(index);
      return true;
    });

    expect(requestSidebarThreadJump(2)).toBe(true);
    expect(received).toEqual([2]);
    dispose();
    expect(requestSidebarThreadJump(1)).toBe(false);
  });
});
